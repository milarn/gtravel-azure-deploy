// Azure Function - G Travel File Access with Dynamic Statistics (FIXED SQL SYNTAX)
const sql = require('mssql');

// Database configuration
const dbConfig = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    authentication: {
        type: 'azure-active-directory-msi-app-service'
    },
    options: {
        encrypt: true,
        trustServerCertificate: false,
        enableArithAbort: true
    },
    requestTimeout: 60000,
    connectionTimeout: 15000
};

module.exports = async function (context, req) {
    context.log('🚀 G Travel File Access Function called');
    
    // CORS headers
    context.res = {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
    };
    
    if (req.method === 'OPTIONS') {
        context.res.status = 200;
        return;
    }
    
    try {
        const action = req.query.action;
        const companyDomain = req.query.domain;
        
        context.log(`📊 Action: ${action}, Domain: ${companyDomain}`);
        
        if (!companyDomain) {
            context.res = {
                ...context.res,
                status: 400,
                body: { error: 'Company domain is required' }
            };
            return;
        }
        
        await sql.connect(dbConfig);
        context.log('✅ Database connected');
        
        if (action === 'getAvailableFiles') {
            await getAvailableFiles(context, req, companyDomain);
        } else if (action === 'previewFile') {
            await previewFile(context, req, companyDomain);
        } else if (action === 'downloadFile') {
            await downloadFile(context, req, companyDomain);
        } else if (action === 'getDynamicStats') {
            await getDynamicStats(context, req, companyDomain);
        } else {
            context.res = {
                ...context.res,
                status: 400,
                body: { error: 'Invalid action' }
            };
        }
        
    } catch (error) {
        context.log.error('💥 Function error:', error);
        context.res = {
            ...context.res,
            status: 500,
            body: { 
                error: 'Internal server error',
                message: error.message,
                timestamp: new Date().toISOString(),
                action: req.query.action
            }
        };
    } finally {
        await sql.close();
    }
};

// Helper function to get proper date parameters
function getDateParameters(req) {
    // Default date range: Last 3 years to cover most data
    const defaultFromDate = new Date();
    defaultFromDate.setFullYear(defaultFromDate.getFullYear() - 3); // 3 years back
    
    const defaultToDate = new Date();
    defaultToDate.setDate(defaultToDate.getDate() + 1); // Tomorrow to include today
    
    // Use provided dates or defaults
    const fromDateStr = req.query.fromDate;
    const toDateStr = req.query.toDate;
    
    let fromDate, toDate;
    
    if (fromDateStr && toDateStr) {
        fromDate = new Date(fromDateStr);
        toDate = new Date(toDateStr);
        
        // Validate dates
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            fromDate = defaultFromDate;
            toDate = defaultToDate;
        }
    } else {
        fromDate = defaultFromDate;
        toDate = defaultToDate;
    }
    
    return {
        fromDate,
        toDate,
        isDefault: !fromDateStr || !toDateStr
    };
}

// NEW FUNCTION: Get dynamic statistics for dashboard cards
async function getDynamicStats(context, req, companyDomain) {
    try {
        context.log(`📊 Getting dynamic stats for domain: ${companyDomain}`);
        
        // Get company access
        const companyResult = await sql.query`
            SELECT AccNoList, CompanyName 
            FROM dbo.CompanyAccess 
            WHERE CompanyDomain = ${companyDomain} AND IsActive = 1
        `;
        
        if (companyResult.recordset.length === 0) {
            context.res = {
                ...context.res,
                status: 403,
                body: { error: `Company domain ${companyDomain} not authorized` }
            };
            return;
        }
        
        // FIXED: Properly parse AccNoList JSON
        let accNoList;
        try {
            const accNoListStr = companyResult.recordset[0].AccNoList;
            accNoList = Array.isArray(accNoListStr) ? accNoListStr : JSON.parse(accNoListStr);
            context.log(`✅ Parsed AccNoList: ${accNoList.join(', ')}`);
        } catch (parseError) {
            context.log.error('❌ Error parsing AccNoList:', parseError);
            context.res = {
                ...context.res,
                status: 500,
                body: { error: 'Invalid AccNoList format in database' }
            };
            return;
        }
        
        const { fromDate, toDate } = getDateParameters(req);
        
        // Aggregate data from all AccNos
        let allFlightData = [];
        
        for (const accno of accNoList) {
            try {
                context.log(`🔍 Processing AccNo: ${accno}`);
                
                const request = new sql.Request();
                request.timeout = 30000;
                
                // FIXED: Ensure accno is treated as string
                request.input('Accno', sql.NVarChar(50), String(accno));
                request.input('FromDate', sql.Date, fromDate);
                request.input('ToDate', sql.Date, toDate);
                
                const result = await request.execute('api_ExportInvoiceLines');
                
                // Filter only flight records (where CARRCD, FDESTCD, or TDESTCD is not null/empty)
                const flightRecords = result.recordset.filter(record => 
                    (record.CARRCD && String(record.CARRCD).trim() !== '') ||
                    (record.FDESTCD && String(record.FDESTCD).trim() !== '') ||
                    (record.TDESTCD && String(record.TDESTCD).trim() !== '')
                );
                
                allFlightData = allFlightData.concat(flightRecords);
                context.log(`✅ AccNo ${accno}: ${flightRecords.length} flight records found (${result.recordset.length} total records)`);
                
            } catch (accError) {
                context.log.error(`❌ Error processing AccNo ${accno}:`, accError);
                // Continue with other AccNos
            }
        }
        
        context.log(`📊 Total flight records collected: ${allFlightData.length}`);
        
        // Calculate statistics
        const stats = await calculateDynamicStats(allFlightData, context);
        
        context.res = {
            ...context.res,
            status: 200,
            body: {
                stats,
                totalFlights: allFlightData.length,
                dateRange: {
                    from: fromDate.toISOString().split('T')[0],
                    to: toDate.toISOString().split('T')[0]
                }
            }
        };
        
    } catch (error) {
        context.log.error('💥 getDynamicStats error:', error);
        throw error;
    }
}

// Calculate the actual statistics
async function calculateDynamicStats(flightData, context) {
    try {
        context.log(`🔢 Calculating stats from ${flightData.length} flight records`);
        
        // 1. Most used airlines (Top 3)
        const airlineStats = {};
        const destinationStats = {};
        
        // Count airlines and destinations
        flightData.forEach(record => {
            // Count airlines (ensure string comparison)
            if (record.CARRCD && String(record.CARRCD).trim() !== '') {
                const carrier = String(record.CARRCD).trim().toUpperCase();
                airlineStats[carrier] = (airlineStats[carrier] || 0) + 1;
            }
            
            // Count destinations (both from and to)
            if (record.FDESTCD && String(record.FDESTCD).trim() !== '') {
                const dest = String(record.FDESTCD).trim().toUpperCase();
                destinationStats[dest] = (destinationStats[dest] || 0) + 1;
            }
            if (record.TDESTCD && String(record.TDESTCD).trim() !== '') {
                const dest = String(record.TDESTCD).trim().toUpperCase();
                destinationStats[dest] = (destinationStats[dest] || 0) + 1;
            }
        });
        
        context.log(`🛩️ Found ${Object.keys(airlineStats).length} unique airlines, ${Object.keys(destinationStats).length} unique destinations`);
        
        // Get top 3 airlines
        const topAirlines = Object.entries(airlineStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3);
        
        // Get airline names from database
        const topAirlinesWithNames = await getAirlineNames(topAirlines, context);
        
        // Get most visited destination
        const topDestination = Object.entries(destinationStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 1);
        
        // Get destination name
        const topDestinationWithName = await getDestinationName(topDestination[0] ? topDestination[0][0] : null, context);
        
        // Calculate some flight metrics for the third card
        const uniqueRoutes = new Set();
        flightData.forEach(record => {
            if (record.FDESTCD && record.TDESTCD && 
                String(record.FDESTCD).trim() !== '' && String(record.TDESTCD).trim() !== '') {
                const from = String(record.FDESTCD).trim().toUpperCase();
                const to = String(record.TDESTCD).trim().toUpperCase();
                uniqueRoutes.add(`${from}-${to}`);
            }
        });
        
        context.log(`📈 Stats calculated - Top airline: ${topAirlinesWithNames[0]?.name || 'N/A'}, Top destination: ${topDestinationWithName.name}, Unique routes: ${uniqueRoutes.size}`);
        
        return {
            mostUsedAirlines: {
                title: "Mest brukte flyselskap",
                primary: topAirlinesWithNames[0] || { code: 'N/A', name: 'Ingen data', count: 0 },
                secondary: topAirlinesWithNames.slice(1, 3)
            },
            mostVisitedDestination: {
                title: "Mest besøkte destinasjon",
                destination: topDestinationWithName,
                count: topDestination[0] ? topDestination[0][1] : 0
            },
            flightMetrics: {
                title: "Unike ruter",
                value: uniqueRoutes.size,
                subtitle: "Forskjellige flyreiser"
            }
        };
        
    } catch (error) {
        context.log.error('💥 calculateDynamicStats error:', error);
        throw error;
    }
}

// FIXED: Get airline names from TAS_AIRL table with better error handling
async function getAirlineNames(topAirlines, context) {
    try {
        const result = [];
        
        for (const [carrierCode, count] of topAirlines) {
            try {
                // FIXED: Use parameterized query to prevent SQL injection
                const request = new sql.Request();
                request.input('CarrierCode', sql.NVarChar(10), carrierCode);
                
                const airlineResult = await request.query`
                    SELECT AIRLNAME 
                    FROM dbo.TAS_AIRL 
                    WHERE UPPER(AIRLCODE) = UPPER(@CarrierCode)
                `;
                
                const airlineName = airlineResult.recordset.length > 0 
                    ? airlineResult.recordset[0].AIRLNAME 
                    : carrierCode; // Fallback to code if name not found
                
                result.push({
                    code: carrierCode,
                    name: airlineName,
                    count: count
                });
                
                context.log(`✈️ ${carrierCode} -> ${airlineName} (${count} flights)`);
                
            } catch (error) {
                context.log.error(`❌ Error getting airline name for ${carrierCode}:`, error);
                result.push({
                    code: carrierCode,
                    name: carrierCode,
                    count: count
                });
            }
        }
        
        return result;
    } catch (error) {
        context.log.error('💥 getAirlineNames error:', error);
        return [];
    }
}

// Get destination name (you might want to add a destinations table)
async function getDestinationName(destCode, context) {
    if (!destCode) {
        return { code: 'N/A', name: 'Ingen data' };
    }
    
    // For now, just return the code. You can add a destinations lookup table later
    // or use an external API to resolve airport codes to city names
    return {
        code: destCode,
        name: destCode // You can expand this to use a lookup table or API
    };
}

// FIXED: Get available files with better error handling
async function getAvailableFiles(context, req, companyDomain) {
    try {
        context.log(`🔍 Getting files for domain: ${companyDomain}`);
        
        // Get company access
        const companyResult = await sql.query`
            SELECT AccNoList, CompanyName, AccessLevel 
            FROM dbo.CompanyAccess 
            WHERE CompanyDomain = ${companyDomain} AND IsActive = 1
        `;
        
        if (companyResult.recordset.length === 0) {
            context.log(`🚫 Domain ${companyDomain} not authorized`);
            context.res = {
                ...context.res,
                status: 403,
                body: { error: `Company domain ${companyDomain} not authorized` }
            };
            return;
        }
        
        // FIXED: Better JSON parsing
        let accNoList;
        try {
            const accNoListStr = companyResult.recordset[0].AccNoList;
            accNoList = Array.isArray(accNoListStr) ? accNoListStr : JSON.parse(accNoListStr);
        } catch (parseError) {
            context.log.error('❌ Error parsing AccNoList:', parseError);
            context.res = {
                ...context.res,
                status: 500,
                body: { error: 'Invalid AccNoList format' }
            };
            return;
        }
        
        const companyName = companyResult.recordset[0].CompanyName;
        
        context.log(`✅ Company: ${companyName}, AccNos: ${accNoList.join(', ')}`);
        
        // Get date parameters with defaults
        const { fromDate, toDate, isDefault } = getDateParameters(req);
        
        context.log(`📅 Date range: ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]} ${isDefault ? '(DEFAULT)' : '(USER SPECIFIED)'}`);
        
        // Get summary for each AccNo using stored procedure
        const files = [];
        
        for (const accno of accNoList) {
            try {
                const request = new sql.Request();
                request.timeout = 30000;
                
                // FIXED: Ensure all parameters are properly typed
                request.input('Accno', sql.NVarChar(50), String(accno));
                request.input('FromDate', sql.Date, fromDate);
                request.input('ToDate', sql.Date, toDate);
                
                context.log(`📞 Calling stored procedure for AccNo: ${accno}`);
                context.log(`📊 Parameters: Accno=${accno}, FromDate=${fromDate.toISOString().split('T')[0]}, ToDate=${toDate.toISOString().split('T')[0]}`);
                
                // Call your stored procedure
                const result = await request.execute('api_ExportInvoiceLines');
                
                if (result.recordset && result.recordset.length > 0) {
                    const records = result.recordset;
                    const earliestDate = new Date(Math.min(...records.map(r => new Date(r.InvoDate))));
                    const latestDate = new Date(Math.max(...records.map(r => new Date(r.InvoDate))));
                    
                    files.push({
                        id: `${accno}-data`,
                        name: `${accno}_InvoiceData_${earliestDate.toISOString().split('T')[0]}.csv`,
                        category: 'Invoice Data',
                        size: `${Math.round(records.length * 0.8)}KB`,
                        lastUpdated: latestDate,
                        accno: String(accno),
                        recordCount: records.length,
                        owner: 'Company'
                    });
                    
                    context.log(`✅ AccNo ${accno}: ${records.length} records found`);
                } else {
                    context.log(`⚠️ AccNo ${accno}: No records found in date range`);
                }
                
            } catch (accError) {
                context.log.error(`❌ Error processing AccNo ${accno}:`, accError);
                // Continue with other AccNos
            }
        }
        
        context.res = {
            ...context.res,
            status: 200,
            body: {
                files,
                companyName,
                totalFiles: files.length,
                dateRange: {
                    from: fromDate.toISOString().split('T')[0],
                    to: toDate.toISOString().split('T')[0],
                    isDefault: isDefault
                },
                debug: {
                    domain: companyDomain,
                    accNos: accNoList,
                    timestamp: new Date().toISOString()
                }
            }
        };
        
        context.log(`🎉 Successfully returned ${files.length} files for ${companyName}`);
        
    } catch (error) {
        context.log.error('💥 getAvailableFiles error:', error);
        throw error;
    }
}

// Other functions remain the same but with improved error handling
async function previewFile(context, req, companyDomain) {
    try {
        const accno = req.query.accno;
        
        context.log(`🔍 Preview request - Domain: ${companyDomain}, AccNo: ${accno}`);
        
        if (!accno) {
            context.res = {
                ...context.res,
                status: 400,
                body: { error: 'AccNo required' }
            };
            return;
        }
        
        // Verify access
        const accessCheck = await verifyAccess(companyDomain, accno);
        if (!accessCheck.hasAccess) {
            context.res = {
                ...context.res,
                status: 403,
                body: { error: 'Access denied' }
            };
            return;
        }
        
        const request = new sql.Request();
        request.timeout = 30000;
        
        // Get date parameters with defaults
        const { fromDate, toDate, isDefault } = getDateParameters(req);
        
        // FIXED: Proper parameter typing
        request.input('Accno', sql.NVarChar(50), String(accno));
        request.input('FromDate', sql.Date, fromDate);
        request.input('ToDate', sql.Date, toDate);
        
        context.log('📞 Calling stored procedure for preview...');
        context.log(`📊 Parameters: Accno=${accno}, FromDate=${fromDate.toISOString().split('T')[0]}, ToDate=${toDate.toISOString().split('T')[0]}`);
        
        // Call your stored procedure
        const result = await request.execute('api_ExportInvoiceLines');
        
        // Take only first 20 rows for preview
        const preview = result.recordset.slice(0, 20);
        const columns = preview.length > 0 ? Object.keys(preview[0]) : [];
        
        context.res = {
            ...context.res,
            status: 200,
            body: {
                preview: preview,
                columns: columns,
                totalPreviewRows: preview.length,
                totalRecords: result.recordset.length,
                accno,
                dateRange: {
                    from: fromDate.toISOString().split('T')[0],
                    to: toDate.toISOString().split('T')[0],
                    isDefault: isDefault
                }
            }
        };
        
        context.log(`✅ Preview: ${preview.length} rows (of ${result.recordset.length} total) for ${accno}`);
        
    } catch (error) {
        context.log.error('💥 previewFile error:', error);
        throw error;
    }
}

async function downloadFile(context, req, companyDomain) {
    try {
        const accno = req.query.accno;
        
        context.log(`📥 Download request - Domain: ${companyDomain}, AccNo: ${accno}`);
        
        if (!accno) {
            context.res = {
                ...context.res,
                status: 400,
                body: { error: 'AccNo required' }
            };
            return;
        }
        
        const accessCheck = await verifyAccess(companyDomain, accno);
        if (!accessCheck.hasAccess) {
            context.res = {
                ...context.res,
                status: 403,
                body: { error: 'Access denied' }
            };
            return;
        }
        
        const request = new sql.Request();
        request.timeout = 120000; // 2 minutes for larger downloads
        
        // Get date parameters with defaults
        const { fromDate, toDate, isDefault } = getDateParameters(req);
        
        // FIXED: Proper parameter typing
        request.input('Accno', sql.NVarChar(50), String(accno));
        request.input('FromDate', sql.Date, fromDate);
        request.input('ToDate', sql.Date, toDate);
        
        context.log('📞 Calling stored procedure for download...');
        context.log(`📊 Parameters: Accno=${accno}, FromDate=${fromDate.toISOString().split('T')[0]}, ToDate=${toDate.toISOString().split('T')[0]}`);
        
        // Call your stored procedure
        const result = await request.execute('api_ExportInvoiceLines');
        
        // Generate CSV from stored procedure results
        const csvContent = generateCSV(result.recordset);
        const fileName = `${accno}_InvoiceData_${fromDate.toISOString().split('T')[0]}_${toDate.toISOString().split('T')[0]}.csv`;
        
        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Access-Control-Expose-Headers': 'Content-Disposition'
            },
            body: csvContent
        };
        
        context.log(`✅ Download: ${result.recordset.length} invoice records for ${accno}`);
        
    } catch (error) {
        context.log.error('💥 downloadFile error:', error);
        throw error;
    }
}

// FIXED: Verify access function with better error handling
async function verifyAccess(companyDomain, accno) {
    try {
        const result = await sql.query`
            SELECT AccNoList 
            FROM dbo.CompanyAccess 
            WHERE CompanyDomain = ${companyDomain} AND IsActive = 1
        `;
        
        if (result.recordset.length === 0) {
            return { hasAccess: false };
        }
        
        let accNoList;
        try {
            const accNoListStr = result.recordset[0].AccNoList;
            accNoList = Array.isArray(accNoListStr) ? accNoListStr : JSON.parse(accNoListStr);
        } catch (parseError) {
            return { hasAccess: false };
        }
        
        // Convert both to strings for comparison
        const hasAccess = accNoList.some(acc => String(acc) === String(accno));
        return { hasAccess };
        
    } catch (error) {
        return { hasAccess: false };
    }
}

// Generate CSV with all columns from your view
function generateCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    let csv = headers.join(',') + '\n';
    
    data.forEach(row => {
        const values = headers.map(header => {
            let value = row[header];
            if (value === null || value === undefined) value = '';
            
            // Handle dates
            if (value instanceof Date) {
                value = value.toISOString().split('T')[0];
            }
            
            // Convert to string
            value = String(value);
            
            // Handle strings with commas, quotes, newlines
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                value = '"' + value.replace(/"/g, '""') + '"';
            }
            
            return value;
        });
        csv += values.join(',') + '\n';
    });
    
    return csv;
}
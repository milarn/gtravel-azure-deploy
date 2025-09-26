// Azure Function - G Travel File Access with Dynamic Statistics
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
        
        const accNoList = JSON.parse(companyResult.recordset[0].AccNoList);
        const { fromDate, toDate } = getDateParameters(req);
        
        // Aggregate data from all AccNos
        let allFlightData = [];
        
        for (const accno of accNoList) {
            try {
                const request = new sql.Request();
                request.timeout = 30000;
                
                request.input('Accno', sql.NVarChar(50), accno);
                request.input('FromDate', sql.Date, fromDate);
                request.input('ToDate', sql.Date, toDate);
                
                const result = await request.execute('api_ExportInvoiceLines');
                
                // Filter only flight records (where CARRCD, FDESTCD, or TDESTCD is not null/empty)
                const flightRecords = result.recordset.filter(record => 
                    (record.CARRCD && record.CARRCD.trim() !== '') ||
                    (record.FDESTCD && record.FDESTCD.trim() !== '') ||
                    (record.TDESTCD && record.TDESTCD.trim() !== '')
                );
                
                allFlightData = allFlightData.concat(flightRecords);
                
            } catch (accError) {
                context.log.error(`❌ Error processing AccNo ${accno}:`, accError);
            }
        }
        
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
        // 1. Most used airlines (Top 3)
        const airlineStats = {};
        const destinationStats = {};
        
        // Count airlines and destinations
        flightData.forEach(record => {
            // Count airlines
            if (record.CARRCD && record.CARRCD.trim() !== '') {
                const carrier = record.CARRCD.trim();
                airlineStats[carrier] = (airlineStats[carrier] || 0) + 1;
            }
            
            // Count destinations (both from and to)
            if (record.FDESTCD && record.FDESTCD.trim() !== '') {
                const dest = record.FDESTCD.trim();
                destinationStats[dest] = (destinationStats[dest] || 0) + 1;
            }
            if (record.TDESTCD && record.TDESTCD.trim() !== '') {
                const dest = record.TDESTCD.trim();
                destinationStats[dest] = (destinationStats[dest] || 0) + 1;
            }
        });
        
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
                record.FDESTCD.trim() !== '' && record.TDESTCD.trim() !== '') {
                uniqueRoutes.add(`${record.FDESTCD}-${record.TDESTCD}`);
            }
        });
        
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

// Get airline names from TAS_AIRL table
async function getAirlineNames(topAirlines, context) {
    try {
        const result = [];
        
        for (const [carrierCode, count] of topAirlines) {
            try {
                const airlineResult = await sql.query`
                    SELECT AIRLNAME 
                    FROM dbo.TAS_AIRL 
                    WHERE AIRLCODE = ${carrierCode}
                `;
                
                const airlineName = airlineResult.recordset.length > 0 
                    ? airlineResult.recordset[0].AIRLNAME 
                    : carrierCode; // Fallback to code if name not found
                
                result.push({
                    code: carrierCode,
                    name: airlineName,
                    count: count
                });
            } catch (error) {
                context.log.error(`Error getting airline name for ${carrierCode}:`, error);
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

// Get available files using stored procedure with proper date handling
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
        
        const accNoList = JSON.parse(companyResult.recordset[0].AccNoList);
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
                
                // ALWAYS provide all parameters to stored procedure
                request.input('Accno', sql.NVarChar(50), accno);
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
                        accno: accno,
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

// Preview file using stored procedure with proper date handling
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
        
        // ALWAYS provide all parameters to stored procedure
        request.input('Accno', sql.NVarChar(50), accno);
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

// Download file using stored procedure with proper date handling
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
        
        // ALWAYS provide all parameters to stored procedure
        request.input('Accno', sql.NVarChar(50), accno);
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

// Verify access function (unchanged)
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
        
        const accNoList = JSON.parse(result.recordset[0].AccNoList);
        return { hasAccess: accNoList.includes(accno) };
        
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
            
            // Handle strings with commas, quotes, newlines
            if (typeof value === 'string') {
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    value = '"' + value.replace(/"/g, '""') + '"';
                }
            }
            
            return value;
        });
        csv += values.join(',') + '\n';
    });
    
    return csv;
}
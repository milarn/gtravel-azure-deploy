// FIXED Azure Function - Use existing AIRLINENAME column instead of lookup
const sql = require('mssql');

// Database configuration (unchanged)
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
    defaultFromDate.setFullYear(defaultFromDate.getFullYear() - 3);
    
    const defaultToDate = new Date();
    defaultToDate.setDate(defaultToDate.getDate() + 1);
    
    const fromDateStr = req.query.fromDate;
    const toDateStr = req.query.toDate;
    
    let fromDate, toDate;
    
    if (fromDateStr && toDateStr) {
        fromDate = new Date(fromDateStr);
        toDate = new Date(toDateStr);
        
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

// FIXED: Get dynamic statistics using existing AIRLINENAME column
async function getDynamicStats(context, req, companyDomain) {
    try {
        context.log(`📊 Getting dynamic stats for domain: ${companyDomain}`);
        
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
        
        let allFlightData = [];
        
        for (const accno of accNoList) {
            try {
                context.log(`🔍 Processing AccNo: ${accno}`);
                
                const request = new sql.Request();
                request.timeout = 30000;
                
                request.input('Accno', sql.NVarChar(50), String(accno));
                request.input('FromDate', sql.Date, fromDate);
                request.input('ToDate', sql.Date, toDate);
                
                const result = await request.execute('api_ExportInvoiceLines');
                
                // Filter only flight records and ensure we have airline names
                const flightRecords = result.recordset.filter(record => 
                    (record.CARRCD && String(record.CARRCD).trim() !== '') ||
                    (record.FDESTCD && String(record.FDESTCD).trim() !== '') ||
                    (record.TDESTCD && String(record.TDESTCD).trim() !== '')
                );
                
                allFlightData = allFlightData.concat(flightRecords);
                context.log(`✅ AccNo ${accno}: ${flightRecords.length} flight records found (${result.recordset.length} total records)`);
                
            } catch (accError) {
                context.log.error(`❌ Error processing AccNo ${accno}:`, accError);
            }
        }
        
        context.log(`📊 Total flight records collected: ${allFlightData.length}`);
        
        // Calculate statistics using existing AIRLINENAME column
        const stats = calculateDynamicStatsFromData(allFlightData, context);
        
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

// FIXED: Calculate stats using existing AIRLINENAME column from data
function calculateDynamicStatsFromData(flightData, context) {
    try {
        context.log(`🔢 Calculating stats from ${flightData.length} flight records`);
        
        const airlineStats = {};
        const destinationStats = {};
        
        flightData.forEach(record => {
            // Use existing AIRLINENAME column if available, fallback to CARRCD
            const airlineName = record.AIRLINENAME && String(record.AIRLINENAME).trim() !== '' 
                ? String(record.AIRLINENAME).trim() 
                : (record.CARRCD ? String(record.CARRCD).trim() : 'Unknown');
                
            if (airlineName && airlineName !== 'Unknown') {
                airlineStats[airlineName] = (airlineStats[airlineName] || 0) + 1;
            }
            
            // Count destinations
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
        
        // Get top 3 airlines (already have names from data)
        const topAirlines = Object.entries(airlineStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .map(([name, count]) => ({ code: name, name: name, count: count }));
        
        // Get most visited destination
        const topDestination = Object.entries(destinationStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 1);
        
        // Calculate unique routes
        const uniqueRoutes = new Set();
        flightData.forEach(record => {
            if (record.FDESTCD && record.TDESTCD && 
                String(record.FDESTCD).trim() !== '' && String(record.TDESTCD).trim() !== '') {
                const from = String(record.FDESTCD).trim().toUpperCase();
                const to = String(record.TDESTCD).trim().toUpperCase();
                uniqueRoutes.add(`${from}-${to}`);
            }
        });
        
        const primaryAirline = topAirlines[0] || { code: 'N/A', name: 'Ingen data', count: 0 };
        const topDest = topDestination[0] || ['N/A', 0];
        
        context.log(`📈 Stats calculated - Top airline: ${primaryAirline.name}, Top destination: ${topDest[0]}, Unique routes: ${uniqueRoutes.size}`);
        
        return {
            mostUsedAirlines: {
                title: "Mest brukte flyselskap",
                primary: primaryAirline,
                secondary: topAirlines.slice(1, 3)
            },
            mostVisitedDestination: {
                title: "Mest besøkte destinasjon",
                destination: { code: topDest[0], name: topDest[0] },
                count: topDest[1]
            },
            flightMetrics: {
                title: "Unike ruter",
                value: uniqueRoutes.size,
                subtitle: "Forskjellige flyreiser"
            }
        };
        
    } catch (error) {
        context.log.error('💥 calculateDynamicStatsFromData error:', error);
        return {
            mostUsedAirlines: {
                title: "Mest brukte flyselskap",
                primary: { code: 'Error', name: 'Feil ved beregning', count: 0 },
                secondary: []
            },
            mostVisitedDestination: {
                title: "Mest besøkte destinasjon",
                destination: { code: 'Error', name: 'Feil ved beregning' },
                count: 0
            },
            flightMetrics: {
                title: "Unike ruter",
                value: 0,
                subtitle: "Feil ved beregning"
            }
        };
    }
}

// Other functions remain the same...
async function getAvailableFiles(context, req, companyDomain) {
    try {
        context.log(`🔍 Getting files for domain: ${companyDomain}`);
        
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
        const { fromDate, toDate, isDefault } = getDateParameters(req);
        
        context.log(`📅 Date range: ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]} ${isDefault ? '(DEFAULT)' : '(USER SPECIFIED)'}`);
        
        const files = [];
        
        for (const accno of accNoList) {
            try {
                const request = new sql.Request();
                request.timeout = 30000;
                
                request.input('Accno', sql.NVarChar(50), String(accno));
                request.input('FromDate', sql.Date, fromDate);
                request.input('ToDate', sql.Date, toDate);
                
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
                }
            }
        };
        
        context.log(`🎉 Successfully returned ${files.length} files for ${companyName}`);
        
    } catch (error) {
        context.log.error('💥 getAvailableFiles error:', error);
        throw error;
    }
}

// Other functions (previewFile, downloadFile, verifyAccess, generateCSV) remain the same as in the original...
async function previewFile(context, req, companyDomain) {
    try {
        const accno = req.query.accno;
        
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
        request.timeout = 30000;
        
        const { fromDate, toDate } = getDateParameters(req);
        
        request.input('Accno', sql.NVarChar(50), String(accno));
        request.input('FromDate', sql.Date, fromDate);
        request.input('ToDate', sql.Date, toDate);
        
        const result = await request.execute('api_ExportInvoiceLines');
        
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
                accno
            }
        };
        
    } catch (error) {
        context.log.error('💥 previewFile error:', error);
        throw error;
    }
}

async function downloadFile(context, req, companyDomain) {
    try {
        const accno = req.query.accno;
        
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
        request.timeout = 120000;
        
        const { fromDate, toDate } = getDateParameters(req);
        
        request.input('Accno', sql.NVarChar(50), String(accno));
        request.input('FromDate', sql.Date, fromDate);
        request.input('ToDate', sql.Date, toDate);
        
        const result = await request.execute('api_ExportInvoiceLines');
        
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
        
    } catch (error) {
        context.log.error('💥 downloadFile error:', error);
        throw error;
    }
}

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
        
        const hasAccess = accNoList.some(acc => String(acc) === String(accno));
        return { hasAccess };
        
    } catch (error) {
        return { hasAccess: false };
    }
}

function generateCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    let csv = headers.join(',') + '\n';
    
    data.forEach(row => {
        const values = headers.map(header => {
            let value = row[header];
            if (value === null || value === undefined) value = '';
            
            if (value instanceof Date) {
                value = value.toISOString().split('T')[0];
            }
            
            value = String(value);
            
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                value = '"' + value.replace(/"/g, '""') + '"';
            }
            
            return value;
        });
        csv += values.join(',') + '\n';
    });
    
    return csv;
}
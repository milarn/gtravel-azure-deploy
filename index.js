// Azure Function - G Travel File Access with Dynamic Statistics (OPTIMIZED)
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

// In-memory cache
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getCacheKey(action, domain, fromDate, toDate) {
    return `${action}_${domain}_${fromDate}_${toDate}`;
}

function getFromCache(key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }
    cache.delete(key);
    return null;
}

function setCache(key, data) {
    cache.set(key, {
        data,
        timestamp: Date.now()
    });
}

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
        
        // Handle skeleton data request immediately
        if (action === 'getSkeletonData') {
            context.res = {
                ...context.res,
                status: 200,
                body: {
                    loading: true,
                    skeleton: {
                        stats: {
                            mostUsedAirlines: {
                                title: "Mest brukte flyselskap",
                                primary: { code: '...', name: 'Laster...', count: 0, percentage: 0 },
                                secondary: [],
                                all: []
                            },
                            mostVisitedDestination: {
                                title: "Mest besøkte destinasjon",
                                destination: { code: '...', name: 'Laster...' },
                                count: 0,
                                all: []
                            },
                            totalSum: {
                                title: "Total Sum",
                                value: 0,
                                currency: 'NOK',
                                subtitle: "Laster...",
                                formattedValue: 'NOK 0,00'
                            }
                        },
                        files: [
                            { id: 'skeleton-1', name: 'Laster data...', category: 'Invoice Data', size: '...', lastUpdated: new Date(), recordCount: 0, owner: 'Company' }
                        ],
                        totalFlights: 0
                    }
                }
            };
            return;
        }
        
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
    // Default date range: Last 1 year to cover most data
    const defaultFromDate = new Date();
    defaultFromDate.setFullYear(defaultFromDate.getFullYear() - 1); // 1 year back
    
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

// OPTIMIZED: Get dynamic statistics for dashboard cards with caching and parallel execution
async function getDynamicStats(context, req, companyDomain) {
    try {
        context.log(`📊 Getting dynamic stats for domain: ${companyDomain}`);
        
        const { fromDate, toDate } = getDateParameters(req);
        
        // Check cache first
        const cacheKey = getCacheKey('getDynamicStats', companyDomain, fromDate.toISOString(), toDate.toISOString());
        const cachedResult = getFromCache(cacheKey);
        if (cachedResult) {
            context.log('✨ Returning cached stats result');
            context.res = {
                ...context.res,
                status: 200,
                body: { ...cachedResult, cached: true }
            };
            return;
        }
        
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
        
        // OPTIMIZED: Process all AccNos in parallel
        const flightDataPromises = accNoList.map(async (accno) => {
            try {
                context.log(`🔍 Processing AccNo: ${accno}`);
                
                const request = new sql.Request();
                request.timeout = 30000;
                
                request.input('Accno', sql.NVarChar(50), String(accno));
                request.input('FromDate', sql.Date, fromDate);
                request.input('ToDate', sql.Date, toDate);
                
                const result = await request.execute('api_ExportInvoiceLines');
                
                // Filter only flight records
                const flightRecords = result.recordset.filter(record => 
                    (record.CARRCD && String(record.CARRCD).trim() !== '') ||
                    (record.FDESTCD && String(record.FDESTCD).trim() !== '') ||
                    (record.TDESTCD && String(record.TDESTCD).trim() !== '')
                );
                
                context.log(`✅ AccNo ${accno}: ${flightRecords.length} flight records found (${result.recordset.length} total records)`);
                return flightRecords;
                
            } catch (accError) {
                context.log.error(`❌ Error processing AccNo ${accno}:`, accError);
                return [];
            }
        });
        
        const flightDataArrays = await Promise.all(flightDataPromises);
        const allFlightData = flightDataArrays.flat();
        
        context.log(`📊 Total flight records collected: ${allFlightData.length}`);
        
        // Calculate statistics
        const stats = await calculateDynamicStats(allFlightData, context);
        
        const responseBody = {
            stats,
            totalFlights: allFlightData.length,
            dateRange: {
                from: fromDate.toISOString().split('T')[0],
                to: toDate.toISOString().split('T')[0]
            }
        };
        
        // Cache the result
        setCache(cacheKey, responseBody);
        
        context.res = {
            ...context.res,
            status: 200,
            body: responseBody
        };
        
    } catch (error) {
        context.log.error('💥 getDynamicStats error:', error);
        throw error;
    }
}

// OPTIMIZED: Calculate ALL statistics (not just top 3)
async function calculateDynamicStats(flightData, context) {
    try {
        context.log(`🔢 Calculating stats from ${flightData.length} flight records`);
        
        const totalFlights = flightData.length;
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
        
        // Get ALL airlines sorted by count
        const allAirlines = Object.entries(airlineStats)
            .sort(([,a], [,b]) => b - a);
        
        // Get airline names for ALL airlines
        const allAirlinesWithNames = await getAirlineNames(allAirlines, context);
        
        // Calculate percentages for all airlines
        const airlinesWithPercentages = allAirlinesWithNames.map(airline => ({
            ...airline,
            percentage: Math.round((airline.count / totalFlights) * 100)
        }));
        
        // Get ALL destinations sorted by count
        const allDestinations = Object.entries(destinationStats)
            .sort(([,a], [,b]) => b - a);
        
        // Get destination names for ALL destinations
        const allDestinationsWithNames = await Promise.all(
            allDestinations.map(async ([code, count]) => {
                const destInfo = await getDestinationName(code, context);
                return {
                    code: code,
                    name: destInfo.name,
                    count: count,
                    percentage: Math.round((count / totalFlights) * 100)
                };
            })
        );
        
        // Calculate total amount sum
        let totalAmount = 0;
        let currencyCode = 'NOK';
        
        flightData.forEach(record => {
            if (record.Amount && !isNaN(record.Amount)) {
                totalAmount += parseFloat(record.Amount);
            }
            if (record.Currency && !currencyCode) {
                currencyCode = record.Currency;
            }
        });
        
        context.log(`💰 Total amount: ${totalAmount.toFixed(2)} ${currencyCode}`);
        context.log(`📈 Stats calculated - Airlines: ${airlinesWithPercentages.length}, Destinations: ${allDestinationsWithNames.length}, Total: ${currencyCode} ${totalAmount.toFixed(2)}`);
        
        return {
            mostUsedAirlines: {
                title: "Mest brukte flyselskap",
                primary: airlinesWithPercentages[0] || { code: 'N/A', name: 'Ingen data', count: 0, percentage: 0 },
                secondary: airlinesWithPercentages.slice(1, 3),
                all: airlinesWithPercentages
            },
            mostVisitedDestination: {
                title: "Mest besøkte destinasjon",
                destination: allDestinationsWithNames[0] ? {
                    code: allDestinationsWithNames[0].code,
                    name: allDestinationsWithNames[0].name
                } : { code: 'N/A', name: 'Ingen data' },
                count: allDestinationsWithNames[0]?.count || 0,
                all: allDestinationsWithNames
            },
            totalSum: {
                title: "Total Sum",
                value: totalAmount.toFixed(2),
                currency: currencyCode,
                subtitle: `Sum av ${totalFlights.toLocaleString()} flyreiser`,
                formattedValue: `${currencyCode} ${totalAmount.toLocaleString('no-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            }
        };
        
    } catch (error) {
        context.log.error('💥 calculateDynamicStats error:', error);
        throw error;
    }
}

// OPTIMIZED: Get airline names with batch processing
async function getAirlineNames(topAirlines, context) {
    try {
        const result = [];
        
        // Batch process airline name lookups
        const codes = topAirlines.map(([code]) => code);
        
        if (codes.length === 0) {
            return result;
        }
        
        try {
            // Single query to get all airline names at once
            const request = new sql.Request();
            const placeholders = codes.map((_, i) => `@code${i}`).join(',');
            
            codes.forEach((code, i) => {
                request.input(`code${i}`, sql.NVarChar(10), code);
            });
            
            const query = `SELECT UPPER(AIRLCODE) as AIRLCODE, AIRLNAME 
                          FROM dbo.TAS_AIRL 
                          WHERE UPPER(AIRLCODE) IN (${placeholders})`;
            
            const airlineResult = await request.query(query);
            
            // Create a map for quick lookup
            const nameMap = {};
            airlineResult.recordset.forEach(row => {
                nameMap[row.AIRLCODE] = row.AIRLNAME;
            });
            
            // Build result with names
            topAirlines.forEach(([code, count]) => {
                result.push({
                    code: code,
                    name: nameMap[code] || code,
                    count: count
                });
            });
            
        } catch (error) {
            context.log.error('❌ Batch airline lookup failed, using fallback:', error);
            // Fallback to code names
            topAirlines.forEach(([code, count]) => {
                result.push({
                    code: code,
                    name: code,
                    count: count
                });
            });
        }
        
        return result;
    } catch (error) {
        context.log.error('💥 getAirlineNames error:', error);
        return [];
    }
}

// Get destination name
async function getDestinationName(destCode, context) {
    if (!destCode) {
        return { code: 'N/A', name: 'Ingen data' };
    }
    
    return {
        code: destCode,
        name: destCode
    };
}

// OPTIMIZED: Get available files with caching and parallel execution
async function getAvailableFiles(context, req, companyDomain) {
    try {
        context.log(`🔍 Getting files for domain: ${companyDomain}`);
        
        const { fromDate, toDate, isDefault } = getDateParameters(req);
        
        // Check cache first
        const cacheKey = getCacheKey('getAvailableFiles', companyDomain, fromDate.toISOString(), toDate.toISOString());
        const cachedResult = getFromCache(cacheKey);
        if (cachedResult) {
            context.log('✨ Returning cached files result');
            context.res = {
                ...context.res,
                status: 200,
                body: { ...cachedResult, cached: true }
            };
            return;
        }
        
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
        
        // Parse AccNoList
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
        context.log(`📅 Date range: ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]} ${isDefault ? '(DEFAULT)' : '(USER SPECIFIED)'}`);
        
        // OPTIMIZED: Process all AccNos in parallel
        const filePromises = accNoList.map(async (accno) => {
            try {
                const request = new sql.Request();
                request.timeout = 30000;
                
                request.input('Accno', sql.NVarChar(50), String(accno));
                request.input('FromDate', sql.Date, fromDate);
                request.input('ToDate', sql.Date, toDate);
                
                context.log(`📞 Calling stored procedure for AccNo: ${accno}`);
                
                const result = await request.execute('api_ExportInvoiceLines');
                
                if (result.recordset && result.recordset.length > 0) {
                    const records = result.recordset;
                    const earliestDate = new Date(Math.min(...records.map(r => new Date(r.InvoDate))));
                    const latestDate = new Date(Math.max(...records.map(r => new Date(r.InvoDate))));
                    
                    context.log(`✅ AccNo ${accno}: ${records.length} records found`);
                    
                    return {
                        id: `${accno}-data`,
                        name: `${accno}_InvoiceData_${earliestDate.toISOString().split('T')[0]}.csv`,
                        category: 'Invoice Data',
                        size: `${Math.round(records.length * 0.8)}KB`,
                        lastUpdated: latestDate,
                        accno: String(accno),
                        recordCount: records.length,
                        owner: 'Company'
                    };
                } else {
                    context.log(`⚠️ AccNo ${accno}: No records found in date range`);
                    return null;
                }
                
            } catch (accError) {
                context.log.error(`❌ Error processing AccNo ${accno}:`, accError);
                return null;
            }
        });
        
        const filesResults = await Promise.all(filePromises);
        const files = filesResults.filter(f => f !== null);
        
        const responseBody = {
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
        };
        
        // Cache the result
        setCache(cacheKey, responseBody);
        
        context.res = {
            ...context.res,
            status: 200,
            body: responseBody
        };
        
        context.log(`🎉 Successfully returned ${files.length} files for ${companyName}`);
        
    } catch (error) {
        context.log.error('💥 getAvailableFiles error:', error);
        throw error;
    }
}

// Preview file
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
        
        const { fromDate, toDate, isDefault } = getDateParameters(req);
        
        request.input('Accno', sql.NVarChar(50), String(accno));
        request.input('FromDate', sql.Date, fromDate);
        request.input('ToDate', sql.Date, toDate);
        
        context.log('📞 Calling stored procedure for preview...');
        
        const result = await request.execute('api_ExportInvoiceLines');
        
        // Take first 20 rows for preview
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

// Download file
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
        request.timeout = 120000;
        
        const { fromDate, toDate } = getDateParameters(req);
        
        request.input('Accno', sql.NVarChar(50), String(accno));
        request.input('FromDate', sql.Date, fromDate);
        request.input('ToDate', sql.Date, toDate);
        
        context.log('📞 Calling stored procedure for download...');
        
        const result = await request.execute('api_ExportInvoiceLines');
        
        // Generate CSV
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

// Verify access
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

// Generate CSV
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

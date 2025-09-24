// Azure Function - G-Travel File Access (Updated to use vw_InvoiceHeaderLines)
const sql = require('mssql');

// Database configuration - Using Managed Identity
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
    }
};

module.exports = async function (context, req) {
    context.log('G-Travel File Access Function called');
    
    // CORS headers for browser requests
    context.res = {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
    };
    
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        context.res.status = 200;
        return;
    }
    
    try {
        const action = req.query.action;
        const companyDomain = req.query.domain;
        
        context.log(`Action: ${action}, Domain: ${companyDomain}`);
        
        if (!companyDomain) {
            context.res = {
                ...context.res,
                status: 400,
                body: { error: 'Company domain is required' }
            };
            return;
        }
        
        // Connect to database
        await sql.connect(dbConfig);
        context.log('Database connected');
        
        if (action === 'getAvailableFiles') {
            await getAvailableFiles(context, req, companyDomain);
        } else if (action === 'previewFile') {
            await previewFile(context, req, companyDomain);
        } else if (action === 'downloadFile') {
            await downloadFile(context, req, companyDomain);
        } else {
            context.res = {
                ...context.res,
                status: 400,
                body: { error: 'Invalid action. Use: getAvailableFiles, previewFile, or downloadFile' }
            };
        }
        
    } catch (error) {
        context.log.error('Function error:', error);
        context.res = {
            ...context.res,
            status: 500,
            body: { 
                error: 'Internal server error',
                message: error.message 
            }
        };
    } finally {
        await sql.close();
    }
};

// Get available files for company using the view
async function getAvailableFiles(context, req, companyDomain) {
    try {
        context.log(`Getting files for domain: ${companyDomain}`);
        
        // Get company's allowed AccNos from CompanyAccess table
        const companyResult = await sql.query`
            SELECT AccNoList, CompanyName, AccessLevel 
            FROM dbo.CompanyAccess 
            WHERE CompanyDomain = ${companyDomain} AND IsActive = 1
        `;
        
        if (companyResult.recordset.length === 0) {
            context.log(`Domain ${companyDomain} not authorized`);
            context.res = {
                ...context.res,
                status: 403,
                body: { error: `Company domain ${companyDomain} not authorized` }
            };
            return;
        }
        
        const accNoList = JSON.parse(companyResult.recordset[0].AccNoList);
        const companyName = companyResult.recordset[0].CompanyName;
        
        context.log(`Company: ${companyName}, AccNos: ${accNoList.join(', ')}`);
        
        // Get date filters
        const fromDate = req.query.fromDate;
        const toDate = req.query.toDate;
        
        // Build query using vw_InvoiceHeaderLines view for richer data
        let query = `
            SELECT 
                AccNo,
                COUNT(DISTINCT InvNo) as invoice_count,
                COUNT(*) as line_count,
                MIN(InvoDate) as earliest_date,
                MAX(InvoDate) as latest_date,
                SUM(TRY_CAST(Amount as DECIMAL(18,2))) as total_amount,
                COUNT(DISTINCT Kundenavn) as customer_count,
                STRING_AGG(DISTINCT Currency, ', ') as currencies
            FROM dbo.vw_InvoiceHeaderLines 
            WHERE AccNo IN (${accNoList.map(acc => `'${acc}'`).join(',')})
        `;
        
        // Add date filter if provided
        if (fromDate && toDate) {
            query += ` AND InvoDate BETWEEN '${fromDate}' AND '${toDate}'`;
            context.log(`Date filter: ${fromDate} to ${toDate}`);
        }
        
        query += ` GROUP BY AccNo ORDER BY latest_date DESC`;
        
        const result = await sql.query(query);
        context.log(`Found ${result.recordset.length} account groups`);
        
        // Format as enhanced file list with invoice data
        const files = result.recordset.map(row => ({
            id: `${row.AccNo}-invoices`,
            name: `${row.AccNo}_InvoiceData_${row.earliest_date.toISOString().split('T')[0]}-${row.latest_date.toISOString().split('T')[0]}.csv`,
            category: 'Invoice Data',
            size: `${Math.round(row.line_count * 0.8)}KB`,
            lastUpdated: row.latest_date,
            accno: row.AccNo,
            invoiceCount: row.invoice_count,
            lineCount: row.line_count,
            totalAmount: row.total_amount,
            customerCount: row.customer_count,
            currencies: row.currencies,
            owner: 'Company'
        }));
        
        context.res = {
            ...context.res,
            status: 200,
            body: {
                files,
                companyName,
                totalFiles: files.length,
                summary: {
                    totalInvoices: result.recordset.reduce((sum, row) => sum + row.invoice_count, 0),
                    totalLines: result.recordset.reduce((sum, row) => sum + row.line_count, 0),
                    totalAmount: result.recordset.reduce((sum, row) => sum + (row.total_amount || 0), 0)
                }
            }
        };
        
        context.log(`Returned ${files.length} account files for ${companyName}`);
        
    } catch (error) {
        context.log.error('getAvailableFiles error:', error);
        throw error;
    }
}

// Preview invoice data with line details
async function previewFile(context, req, companyDomain) {
    try {
        const accno = req.query.accno;
        
        context.log(`Preview request: ${accno}`);
        
        if (!accno) {
            context.res = {
                ...context.res,
                status: 400,
                body: { error: 'AccNo required' }
            };
            return;
        }
        
        // Verify company access
        const accessCheck = await verifyAccess(companyDomain, accno);
        if (!accessCheck.hasAccess) {
            context.res = {
                ...context.res,
                status: 403,
                body: { error: 'Access denied' }
            };
            return;
        }
        
        // Get preview data from the view
        const fromDate = req.query.fromDate;
        const toDate = req.query.toDate;
        
        let query = `
            SELECT TOP 50 
                InvNo,
                AccNo,
                InvoDate,
                Kundenavn,
                Bestiller,
                LINENO,
                PNHNO,
                Currency,
                Amount
            FROM dbo.vw_InvoiceHeaderLines 
            WHERE AccNo = '${accno}'
        `;
        
        if (fromDate && toDate) {
            query += ` AND InvoDate BETWEEN '${fromDate}' AND '${toDate}'`;
        }
        
        query += ` ORDER BY InvoDate DESC, InvNo DESC, LINENO`;
        
        const result = await sql.query(query);
        
        // Get summary statistics
        const summaryQuery = `
            SELECT 
                COUNT(DISTINCT InvNo) as invoice_count,
                COUNT(*) as line_count,
                SUM(TRY_CAST(Amount as DECIMAL(18,2))) as total_amount,
                COUNT(DISTINCT Kundenavn) as customer_count
            FROM dbo.vw_InvoiceHeaderLines 
            WHERE AccNo = '${accno}'
            ${fromDate && toDate ? `AND InvoDate BETWEEN '${fromDate}' AND '${toDate}'` : ''}
        `;
        
        const summaryResult = await sql.query(summaryQuery);
        
        context.res = {
            ...context.res,
            status: 200,
            body: {
                preview: result.recordset,
                columns: Object.keys(result.recordset[0] || {}),
                totalPreviewRows: result.recordset.length,
                accno,
                summary: summaryResult.recordset[0]
            }
        };
        
        context.log(`Preview: ${result.recordset.length} rows for ${accno}`);
        
    } catch (error) {
        context.log.error('previewFile error:', error);
        throw error;
    }
}

// Download full CSV with invoice line data
async function downloadFile(context, req, companyDomain) {
    try {
        const accno = req.query.accno;
        
        context.log(`Download request: ${accno}`);
        
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
        
        // Get all invoice line data
        const fromDate = req.query.fromDate;
        const toDate = req.query.toDate;
        
        let query = `
            SELECT 
                InvNo,
                AccNo,
                InvoDate,
                Kundenavn,
                Bestiller,
                LINENO,
                PNHNO,
                Currency,
                Amount
            FROM dbo.vw_InvoiceHeaderLines 
            WHERE AccNo = '${accno}'
        `;
        
        if (fromDate && toDate) {
            query += ` AND InvoDate BETWEEN '${fromDate}' AND '${toDate}'`;
        }
        
        query += ` ORDER BY InvoDate DESC, InvNo DESC, LINENO`;
        
        const result = await sql.query(query);
        const csvContent = generateCSV(result.recordset);
        const fileName = `${accno}_InvoiceLines_${new Date().toISOString().split('T')[0]}.csv`;
        
        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Access-Control-Expose-Headers': 'Content-Disposition'
            },
            body: csvContent
        };
        
        context.log(`Download: ${result.recordset.length} invoice lines`);
        
    } catch (error) {
        context.log.error('downloadFile error:', error);
        throw error;
    }
}

// Verify company has access to AccNo (unchanged)
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

// Generate CSV from data (unchanged)
function generateCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    let csv = headers.join(',') + '\n';
    
    data.forEach(row => {
        const values = headers.map(header => {
            let value = row[header];
            if (value === null || value === undefined) value = '';
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                value = '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
        });
        csv += values.join(',') + '\n';
    });
    
    return csv;
}
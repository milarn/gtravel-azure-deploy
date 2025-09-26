// routes/function-proxy.js - SECURE proxy for Azure Function calls
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Apply authentication to all routes
router.use(requireAuth);

// Get files from Azure Function with proper authorization
router.get('/files', async (req, res) => {
    try {
        console.log(`📁 Proxying file request for: ${req.session.user.displayName}`);
        
        const user = req.session.user;
        const { fromDate, toDate } = req.query;
        
        // Build Azure Function URL with user context
        const functionUrl = process.env.AZURE_FUNCTION_BASE_URL;
        const params = new URLSearchParams({
            action: 'getAvailableFiles',
            domain: user.userDomain,
            userId: user.id,
            company: user.company,
            accessLevel: user.accessLevel,
            role: user.role
        });
        
        // Add date filters if provided
        if (fromDate && toDate) {
            params.append('fromDate', fromDate);
            params.append('toDate', toDate);
        }
        
        console.log(`🔗 Calling Azure Function: ${functionUrl}&${params.toString()}`);
        
        // Call Azure Function with authentication context
        const functionResponse = await fetch(`${functionUrl}&${params.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${req.session.tokens?.accessToken}`,
                'Content-Type': 'application/json',
                'X-User-Id': user.id,
                'X-User-Domain': user.userDomain
            }
        });
        
        if (!functionResponse.ok) {
            console.error(`Function app error: ${functionResponse.status}`);
            const errorText = await functionResponse.text();
            console.error('Function error details:', errorText);
            
            return res.status(functionResponse.status).json({
                error: 'Function app error',
                message: 'Failed to retrieve files',
                details: process.env.NODE_ENV === 'development' ? errorText : undefined
            });
        }
        
        const data = await functionResponse.json();
        
        // Log successful access
        console.log(`✅ Retrieved ${data.files?.length || 0} files for ${user.displayName}`);
        
        res.json(data);
        
    } catch (error) {
        console.error('❌ Function proxy error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to retrieve files',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Preview file via Azure Function
router.get('/preview/:accno/:srcFile', async (req, res) => {
    try {
        const { accno, srcFile } = req.params;
        const { fromDate, toDate } = req.query;
        const user = req.session.user;
        
        console.log(`🔍 Proxying preview request: ${accno}/${srcFile} for ${user.displayName}`);
        
        const params = new URLSearchParams({
            action: 'previewFile',
            domain: user.userDomain,
            accno: accno,
            srcFile: srcFile,
            userId: user.id
        });
        
        if (fromDate && toDate) {
            params.append('fromDate', fromDate);
            params.append('toDate', toDate);
        }
        
        const functionUrl = process.env.AZURE_FUNCTION_BASE_URL;
        const functionResponse = await fetch(`${functionUrl}&${params.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${req.session.tokens?.accessToken}`,
                'Content-Type': 'application/json',
                'X-User-Id': user.id,
                'X-User-Domain': user.userDomain
            }
        });
        
        if (!functionResponse.ok) {
            const errorText = await functionResponse.text();
            console.error('Preview function error:', errorText);
            return res.status(functionResponse.status).json({
                error: 'Preview failed',
                message: 'Unable to load file preview'
            });
        }
        
        const data = await functionResponse.json();
        res.json(data);
        
    } catch (error) {
        console.error('❌ Preview proxy error:', error);
        res.status(500).json({
            error: 'Preview error',
            message: 'Failed to load preview'
        });
    }
});

// Download file via Azure Function
router.get('/download/:accno/:srcFile', async (req, res) => {
    try {
        const { accno, srcFile } = req.params;
        const { fromDate, toDate } = req.query;
        const user = req.session.user;
        
        console.log(`📥 Proxying download request: ${accno}/${srcFile} for ${user.displayName}`);
        
        const params = new URLSearchParams({
            action: 'downloadFile',
            domain: user.userDomain,
            accno: accno,
            srcFile: srcFile,
            userId: user.id
        });
        
        if (fromDate && toDate) {
            params.append('fromDate', fromDate);
            params.append('toDate', toDate);
        }
        
        const functionUrl = process.env.AZURE_FUNCTION_BASE_URL;
        const functionResponse = await fetch(`${functionUrl}&${params.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${req.session.tokens?.accessToken}`,
                'Content-Type': 'application/json',
                'X-User-Id': user.id,
                'X-User-Domain': user.userDomain
            }
        });
        
        if (!functionResponse.ok) {
            const errorText = await functionResponse.text();
            console.error('Download function error:', errorText);
            return res.status(functionResponse.status).json({
                error: 'Download failed',
                message: 'Unable to download file'
            });
        }
        
        // Check if response is JSON or file stream
        const contentType = functionResponse.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            const data = await functionResponse.json();
            res.json(data);
        } else {
            // Stream file content
            res.set({
                'Content-Type': contentType || 'application/octet-stream',
                'Content-Disposition': functionResponse.headers.get('content-disposition') || `attachment; filename="${accno}_${srcFile}.csv"`
            });
            
            // Pipe the response body to client
            const reader = functionResponse.body.getReader();
            
            const pump = () => {
                return reader.read().then(({ done, value }) => {
                    if (done) {
                        res.end();
                        return;
                    }
                    res.write(Buffer.from(value));
                    return pump();
                });
            };
            
            return pump();
        }
        
    } catch (error) {
        console.error('❌ Download proxy error:', error);
        res.status(500).json({
            error: 'Download error',
            message: 'Failed to download file'
        });
    }
});

// Get dynamic statistics from Azure Function
router.get('/stats', async (req, res) => {
    try {
        console.log(`📊 Proxying stats request for: ${req.session.user.displayName}`);
        
        const user = req.session.user;
        const { fromDate, toDate } = req.query;
        
        // Build Azure Function URL with user context
        const functionUrl = process.env.AZURE_FUNCTION_BASE_URL;
        const params = new URLSearchParams({
            action: 'getDynamicStats',
            domain: user.userDomain,
            userId: user.id,
            company: user.company,
            accessLevel: user.accessLevel,
            role: user.role
        });
        
        // Add date filters if provided
        if (fromDate && toDate) {
            params.append('fromDate', fromDate);
            params.append('toDate', toDate);
        }
        
        console.log(`🔗 Calling Azure Function for stats: ${functionUrl}&${params.toString()}`);
        
        // Call Azure Function with authentication context
        const functionResponse = await fetch(`${functionUrl}&${params.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${req.session.tokens?.accessToken}`,
                'Content-Type': 'application/json',
                'X-User-Id': user.id,
                'X-User-Domain': user.userDomain
            }
        });
        
        if (!functionResponse.ok) {
            console.error(`Stats function error: ${functionResponse.status}`);
            const errorText = await functionResponse.text();
            console.error('Stats error details:', errorText);
            
            return res.status(functionResponse.status).json({
                error: 'Stats function error',
                message: 'Failed to retrieve statistics',
                details: process.env.NODE_ENV === 'development' ? errorText : undefined
            });
        }
        
        const data = await functionResponse.json();
        
        // Log successful access
        console.log(`✅ Retrieved stats for ${user.displayName}: ${data.totalFlights || 0} total flights`);
        
        res.json(data);
        
    } catch (error) {
        console.error('❌ Stats proxy error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to retrieve statistics',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
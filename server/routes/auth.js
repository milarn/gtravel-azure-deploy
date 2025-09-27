// routes/auth.js - FIXED: Added missing stats endpoint and updated files endpoint to use Azure Function
const express = require('express');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const router = express.Router();

// MSAL configuration for multi-tenant
const msalConfig = {
    auth: {
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        authority: 'https://login.microsoftonline.com/common',
    },
    system: {
        loggerOptions: {
            loggerCallback(loglevel, message, containsPii) {
                if (!containsPii && process.env.LOG_LEVEL === 'debug') {
                    console.log(`[MSAL] ${message}`);
                }
            },
            piiLoggingEnabled: false,
            logLevel: process.env.NODE_ENV === 'development' ? 3 : 1
        }
    }
};

const pca = new ConfidentialClientApplication(msalConfig);

// COMPANY DOMAIN TO AZURE FUNCTION DOMAIN MAPPING
const DOMAIN_MAPPING = {
    'cipher.no': 'cipher.no',
    'gtravel.no': 'gtravel.no',
    'martinlund.onmicrosoft.com': 'cipher.no', // Map your test domain
    'cipherbergen.no': 'cipher.no'
};

// Helper function to get the mapped domain for Azure Function
function getMappedDomain(userDomain) {
    return DOMAIN_MAPPING[userDomain] || userDomain;
}

// Helper function to call Azure Function
async function callAzureFunction(action, domain, params = {}, authToken = null) {
    try {
        const functionUrl = process.env.AZURE_FUNCTION_BASE_URL;
        if (!functionUrl) {
            throw new Error('Azure Function URL not configured');
        }
        
        const searchParams = new URLSearchParams({
            action,
            domain,
            ...params
        });
        
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        console.log(`🔗 Calling Azure Function: ${action} for domain: ${domain}`);
        console.log(`📋 Parameters:`, params);
        
        const response = await fetch(`${functionUrl}&${searchParams.toString()}`, {
            method: 'GET',
            headers
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Azure Function error (${response.status}):`, errorText);
            throw new Error(`Function call failed: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log(`✅ Azure Function response received for ${action}`);
        return data;
        
    } catch (error) {
        console.error(`❌ Error calling Azure Function (${action}):`, error.message);
        throw error;
    }
}

// COMPANY-BASED ACCESS CONTROL - SIMPLIFIED: Only 2 companies for POC
const COMPANY_ACCESS_LEVELS = {
    'cipher.no': {
        companyName: 'Cipher Bergen AS',
        accessLevel: 'developer',
        allowedFileTypes: ['reports', 'expenses', 'documents', 'timesheets', 'all'],
        maxConfidentialityLevel: 'restricted',
        regions: ['Norway', 'Development']
    },
    'gtravel.no': {
        companyName: 'G-Travel AS',
        accessLevel: 'customer',
        allowedFileTypes: ['reports', 'invoices', 'travel-data'],
        maxConfidentialityLevel: 'confidential',
        regions: ['Norway', 'Europe']
    },
    'martinlund.onmicrosoft.com': {
        companyName: 'Martin Test Account',
        accessLevel: 'developer',
        allowedFileTypes: ['reports', 'expenses', 'documents', 'timesheets', 'all'],
        maxConfidentialityLevel: 'restricted',
        regions: ['Norway', 'Development']
    },
    'cipherbergen.no': {
        companyName: 'Cipher Bergen AS',
        accessLevel: 'developer',
        allowedFileTypes: ['reports', 'expenses', 'documents', 'timesheets', 'all'],
        maxConfidentialityLevel: 'restricted',
        regions: ['Norway', 'Development']
    }
};

// Helper function to determine user role based on email and company
function determineUserRole(userEmail, companyAccess) {
    const email = userEmail.toLowerCase();
    
    if (email.includes('admin') || companyAccess.accessLevel === 'global') {
        return 'Admin';
    }
    if (email.includes('manager') || email.includes('lead')) {
        return 'Manager';
    }
    return 'User';
}

// Start authentication flow
router.get('/login', async (req, res) => {
    try {
        console.log('🔐 Starting Multi-Tenant authentication...');
        
        const state = `${req.session.id}-${Date.now()}`;
        req.session.authState = state;
        
        const authCodeUrlParameters = {
            scopes: ['openid', 'profile', 'email'],
            redirectUri: process.env.REDIRECT_URI,
            state: state,
            prompt: 'select_account'
        };

        const authCodeUrl = await pca.getAuthCodeUrl(authCodeUrlParameters);
        res.redirect(authCodeUrl);
        
    } catch (error) {
        console.error('❌ Authentication initiation error:', error);
        res.redirect('/login?error=auth_failed');
    }
});

// Handle Entra ID callback
router.get('/callback', async (req, res) => {
    try {
        console.log('🔄 Processing callback...');
        
        const { code, state, error, error_description } = req.query;
        
        if (error) {
            console.error('❌ Entra ID error:', error, error_description);
            return res.redirect('/login?error=access_denied');
        }
        
        if (!state || !state.startsWith(req.session.id)) {
            console.warn('⚠️ State parameter issue, but continuing (development mode)');
            if (process.env.NODE_ENV === 'production') {
                return res.redirect('/login?error=security_error');
            }
        }
        
        if (!code) {
            console.error('❌ No authorization code received');
            return res.redirect('/login?error=no_code');
        }
        
        const tokenRequest = {
            code: code,
            scopes: ['openid', 'profile', 'email'],
            redirectUri: process.env.REDIRECT_URI
        };
        
        console.log('🎟️ Exchanging code for tokens...');
        const response = await pca.acquireTokenByCode(tokenRequest);
        
        if (!response || !response.account) {
            throw new Error('Invalid token response');
        }
        
        console.log('✅ Tokens acquired successfully');
        
        const account = response.account;
        const claims = response.idTokenClaims;
        const userEmail = account.username.toLowerCase();
        const userDomain = userEmail.split('@')[1];
        
        console.log(`👤 Authenticating: ${userEmail} from ${userDomain}`);
        
        const companyAccess = COMPANY_ACCESS_LEVELS[userDomain];
        
        if (!companyAccess) {
            console.log(`🚫 Company domain ${userDomain} not authorized`);
            return res.redirect(`/login?error=company_not_authorized&domain=${encodeURIComponent(userDomain)}`);
        }
        
        console.log(`✅ User authenticated: ${claims.name || userEmail} from ${companyAccess.companyName}`);
        console.log(`🏢 Company Domain: ${userDomain} -> Access Level: ${companyAccess.accessLevel}`);
        
        req.session.user = {
            id: userEmail,
            entraObjectId: account.localAccountId,
            email: userEmail,
            displayName: claims.name || userEmail.split('@')[0],
            firstName: claims.given_name || '',
            lastName: claims.family_name || '',
            company: companyAccess.companyName,
            accessLevel: companyAccess.accessLevel,
            allowedFileTypes: companyAccess.allowedFileTypes,
            maxConfidentialityLevel: companyAccess.maxConfidentialityLevel,
            userDomain: userDomain,
            mappedDomain: getMappedDomain(userDomain), // For Azure Function calls
            tenantId: claims.tid,
            role: determineUserRole(userEmail, companyAccess),
            regions: companyAccess.regions || [],
            loginTime: new Date().toISOString()
        };
        
        req.session.tokens = {
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            idToken: response.idToken,
            expiresAt: new Date(Date.now() + (response.expiresOn * 1000)).toISOString()
        };
        
        req.session.save((err) => {
            if (err) {
                console.error('❌ Session save error:', err);
                return res.redirect('/login?error=session_error');
            }
            
            console.log(`🎉 SUCCESS: ${claims.name || userEmail} from ${companyAccess.companyName} authenticated`);
            console.log(`✅ Access level correctly set to: ${companyAccess.accessLevel}`);
            
            res.redirect('/dashboard');
        });
        
    } catch (error) {
        console.error('❌ Callback processing error:', error);
        res.redirect('/login?error=auth_failed');
    }
});

// Get user info
router.get('/user', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    res.json({
        authenticated: true,
        user: req.session.user,
        loginTime: req.session.user.loginTime
    });
});

// FIXED: Get files from Azure Function instead of mock data
router.get('/api/files', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const user = req.session.user;
        const { fromDate, toDate, search } = req.query;
        
        console.log(`📁 File request from: ${user.displayName} (${user.company})`);
        console.log(`🏢 Access Level: ${user.accessLevel}, Mapped Domain: ${user.mappedDomain}`);
        
        // Call Azure Function to get real files
        const params = {
            userId: user.id,
            company: user.company,
            accessLevel: user.accessLevel,
            role: user.role
        };
        
        if (fromDate && toDate) {
            params.fromDate = fromDate;
            params.toDate = toDate;
            console.log(`📅 Date range: ${fromDate} to ${toDate}`);
        }
        
        if (search) {
            params.search = search;
            console.log(`🔍 Search term: ${search}`);
        }
        
        try {
            const functionResult = await callAzureFunction(
                'getAvailableFiles',
                user.mappedDomain,
                params,
                req.session.tokens?.accessToken
            );
            
            console.log(`✅ Retrieved ${functionResult.files?.length || 0} files from Azure Function`);
            
            // Return the function result directly
            res.json({
                files: functionResult.files || [],
                totalFiles: functionResult.totalFiles || 0,
                companyName: functionResult.companyName || user.company,
                dateRange: functionResult.dateRange,
                debug: functionResult.debug
            });
            
        } catch (functionError) {
            console.error('❌ Azure Function call failed, using fallback:', functionError.message);
            
            // Fallback to empty list or show error
            res.json({
                files: [],
                totalFiles: 0,
                companyName: user.company,
                error: 'Data temporarily unavailable',
                message: 'Please try again or contact support if the issue persists'
            });
        }
        
    } catch (error) {
        console.error('❌ Files API error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// NEW: Get dynamic statistics from Azure Function
router.get('/api/stats', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const user = req.session.user;
        const { fromDate, toDate } = req.query;
        
        console.log(`📊 Stats request from: ${user.displayName} (${user.company})`);
        console.log(`🏢 Access Level: ${user.accessLevel}, Mapped Domain: ${user.mappedDomain}`);
        
        // Call Azure Function to get dynamic statistics
        const params = {
            userId: user.id,
            company: user.company,
            accessLevel: user.accessLevel,
            role: user.role
        };
        
        if (fromDate && toDate) {
            params.fromDate = fromDate;
            params.toDate = toDate;
            console.log(`📅 Date range: ${fromDate} to ${toDate}`);
        }
        
        try {
            const functionResult = await callAzureFunction(
                'getDynamicStats',
                user.mappedDomain,
                params,
                req.session.tokens?.accessToken
            );
            
            console.log(`✅ Retrieved stats from Azure Function: ${functionResult.totalFlights || 0} total flights`);
            
            // Transform Azure Function result to match frontend expectations
            const transformedData = {
                data: {
                    mostUsedAirline: {
                        value: functionResult.stats?.mostUsedAirlines?.primary?.code || 'N/A',
                        label: functionResult.stats?.mostUsedAirlines?.primary ? 
                            `${functionResult.stats.mostUsedAirlines.primary.name}\n${functionResult.stats.mostUsedAirlines.primary.count} flights` : 
                            'No data available',
                        details: functionResult.stats?.mostUsedAirlines?.primary ? [
                            functionResult.stats.mostUsedAirlines.primary,
                            ...(functionResult.stats.mostUsedAirlines.secondary || [])
                        ].map((airline, index) => ({
                            code: airline.code,
                            name: airline.name,
                            count: airline.count,
                            percentage: Math.round((airline.count / functionResult.totalFlights) * 100)
                        })) : []
                    },
                    mostVisitedDestination: {
                        value: functionResult.stats?.mostVisitedDestination?.destination?.code || 'N/A',
                        label: functionResult.stats?.mostVisitedDestination ? 
                            `${functionResult.stats.mostVisitedDestination.destination.name}\n${functionResult.stats.mostVisitedDestination.count} visits` : 
                            'No data available',
                        details: [{
                            code: functionResult.stats?.mostVisitedDestination?.destination?.code || 'N/A',
                            name: functionResult.stats?.mostVisitedDestination?.destination?.name || 'No data',
                            count: functionResult.stats?.mostVisitedDestination?.count || 0,
                            percentage: functionResult.totalFlights > 0 ? 
                                Math.round((functionResult.stats?.mostVisitedDestination?.count || 0) / functionResult.totalFlights * 100) : 0
                        }]
                    },
                    uniqueRoutes: {
                        value: functionResult.stats?.flightMetrics?.value?.toString() || '0',
                        label: functionResult.stats?.flightMetrics?.subtitle || 'No routes found',
                        details: [] // Would need route details from function
                    }
                },
                totalFlights: functionResult.totalFlights || 0,
                dateRange: functionResult.dateRange
            };
            
            res.json(transformedData);
            
        } catch (functionError) {
            console.error('❌ Azure Function stats call failed, using fallback:', functionError.message);
            
            // Fallback to mock data for demo
            res.json({
                data: {
                    mostUsedAirline: {
                        value: 'WF',
                        label: 'Widerøe\nDemo data (Function unavailable)',
                        details: [
                            { code: 'WF', name: 'Widerøe', count: 24, percentage: 45 }
                        ]
                    },
                    mostVisitedDestination: {
                        value: 'OSL',
                        label: 'Oslo Airport\nDemo data (Function unavailable)',
                        details: [
                            { code: 'OSL', name: 'Oslo Airport', count: 42, percentage: 38 }
                        ]
                    },
                    uniqueRoutes: {
                        value: '147',
                        label: 'Demo data (Function unavailable)',
                        details: []
                    }
                },
                error: 'Data temporarily unavailable',
                message: 'Using demo data. Please check Azure Function connection.'
            });
        }
        
    } catch (error) {
        console.error('❌ Stats API error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Preview file - proxy to Azure Function
router.get('/api/preview/:fileId', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const { fileId } = req.params;
        const { fromDate, toDate } = req.query;
        const user = req.session.user;
        
        console.log(`🔍 Preview request: ${fileId} by ${user.displayName}`);
        
        // Extract accno from fileId (assuming format like "accno-data")
        const accno = fileId.split('-')[0];
        
        const params = {
            accno: accno,
            userId: user.id
        };
        
        if (fromDate && toDate) {
            params.fromDate = fromDate;
            params.toDate = toDate;
        }
        
        try {
            const functionResult = await callAzureFunction(
                'previewFile',
                user.mappedDomain,
                params,
                req.session.tokens?.accessToken
            );
            
            res.json(functionResult);
            
        } catch (functionError) {
            console.error('❌ Preview function call failed:', functionError.message);
            res.status(500).json({
                error: 'Preview temporarily unavailable',
                message: 'Please try again or contact support'
            });
        }
        
    } catch (error) {
        console.error('❌ Preview API error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Download file - proxy to Azure Function
router.get('/api/download/:fileId', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const { fileId } = req.params;
        const { fromDate, toDate } = req.query;
        const user = req.session.user;
        
        console.log(`📥 Download request: ${fileId} by ${user.displayName}`);
        
        // Extract accno from fileId
        const accno = fileId.split('-')[0];
        
        const params = {
            accno: accno,
            userId: user.id
        };
        
        if (fromDate && toDate) {
            params.fromDate = fromDate;
            params.toDate = toDate;
        }
        
        try {
            const functionResult = await callAzureFunction(
                'downloadFile',
                user.mappedDomain,
                params,
                req.session.tokens?.accessToken
            );
            
            // For download, we should get a direct response or URL
            res.json({ 
                downloadUrl: `data:text/csv;charset=utf-8,${encodeURIComponent(functionResult)}`,
                fileName: `${accno}_data.csv`,
                message: 'Download ready'
            });
            
        } catch (functionError) {
            console.error('❌ Download function call failed:', functionError.message);
            res.status(500).json({
                error: 'Download temporarily unavailable',
                message: 'Please try again or contact support'
            });
        }
        
    } catch (error) {
        console.error('❌ Download API error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    const wasAuthenticated = !!req.session.user;
    const userName = req.session.user?.displayName;
    
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destruction error:', err);
            return res.status(500).json({ error: 'Logout failed' });
        }
        
        console.log(`👋 User logged out: ${userName || 'Unknown'}`);
        res.clearCookie(process.env.SESSION_NAME);
        res.json({ 
            success: true, 
            message: 'Logged out successfully',
            wasAuthenticated 
        });
    });
});

module.exports = router;
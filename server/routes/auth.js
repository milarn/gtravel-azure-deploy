// routes/auth.js - FIXED: Company-based authorization with proper access levels and date filtering
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

// COMPANY-BASED ACCESS CONTROL - SIMPLIFIED: Only 2 companies for POC
const COMPANY_ACCESS_LEVELS = {
    'cipher.no': {
        companyName: 'Cipher Bergen AS',
        accessLevel: 'developer',  // Development company
        allowedFileTypes: ['reports', 'expenses', 'documents', 'timesheets', 'all'],
        maxConfidentialityLevel: 'restricted',
        regions: ['Norway', 'Development']
    },
    'gtravel.no': {
        companyName: 'G-Travel AS',
        accessLevel: 'customer',   // Customer company
        allowedFileTypes: ['reports', 'invoices', 'travel-data'],
        maxConfidentialityLevel: 'confidential',
        regions: ['Norway', 'Europe']
    }
};

// MOCK USER FILES - SIMPLIFIED: Only files for the 2 POC companies
const MOCK_USER_FILES = {
    // Cipher (Development company) files - Technical/Development focus
    'martin.lund@cipher.no': [
        {
            id: 'cipher-dev-1',
            name: 'Development_Database_Export_Q3.pdf',
            category: 'Development',
            size: '2.3 MB',
            lastUpdated: '2024-09-20T10:30:00Z',
            status: 'available',
            confidentialityLevel: 'restricted',
            fileType: 'reports'
        },
        {
            id: 'cipher-dev-2', 
            name: 'POC_Testing_Results.xlsx',
            category: 'Testing',
            size: '180 KB',
            lastUpdated: '2024-09-18T14:15:00Z',
            status: 'available',
            confidentialityLevel: 'standard',
            fileType: 'reports'
        },
        {
            id: 'cipher-dev-3',
            name: 'System_Integration_Docs.docx', 
            category: 'Documentation',
            size: '450 KB',
            lastUpdated: '2024-09-15T09:45:00Z',
            status: 'available',
            confidentialityLevel: 'standard',
            fileType: 'documents'
        }
    ],
    
    // G-Travel (Customer company) files - Travel/Business focus  
    'admin@gtravel.no': [
        {
            id: 'gtravel-biz-1',
            name: 'Monthly_Travel_Expenses_Sept.pdf',
            category: 'Travel Expenses', 
            size: '1.8 MB',
            lastUpdated: '2024-09-22T08:00:00Z',
            status: 'available',
            confidentialityLevel: 'confidential',
            fileType: 'invoices'
        },
        {
            id: 'gtravel-biz-2',
            name: 'Customer_Booking_Report_Q3.xlsx',
            category: 'Business Reports',
            size: '890 KB',
            lastUpdated: '2024-09-19T13:30:00Z', 
            status: 'available',
            confidentialityLevel: 'confidential',
            fileType: 'reports'
        },
        {
            id: 'gtravel-biz-3',
            name: 'Travel_Analytics_Dashboard.xlsx',
            category: 'Analytics',
            size: '1.2 MB',
            lastUpdated: '2024-09-17T11:15:00Z',
            status: 'available', 
            confidentialityLevel: 'standard',
            fileType: 'travel-data'
        },
        {
            id: 'gtravel-biz-4',
            name: 'Invoice_Processing_Summary.pdf',
            category: 'Financial',
            size: '650 KB',
            lastUpdated: '2024-09-16T15:45:00Z',
            status: 'available',
            confidentialityLevel: 'confidential',
            fileType: 'invoices'
        }
    ]
};

// SHARED COMPANY FILES - SIMPLIFIED: Different files for each company
const SHARED_COMPANY_FILES = [
    // Cipher Development Files
    {
        id: 'shared-cipher-1',
        name: 'Development_Environment_Setup.pdf',
        category: 'Development Guide',
        size: '2.1 MB',
        lastUpdated: '2024-09-01T09:00:00Z',
        status: 'available',
        confidentialityLevel: 'restricted',
        requiredCompany: 'developer',
        fileType: 'documents'
    },
    {
        id: 'shared-cipher-2', 
        name: 'Database_Schema_Documentation.docx',
        category: 'Technical Docs',
        size: '1.5 MB',
        lastUpdated: '2024-08-20T14:30:00Z',
        status: 'available',
        confidentialityLevel: 'restricted',
        requiredCompany: 'developer',
        fileType: 'documents'
    },
    
    // G-Travel Customer Files
    {
        id: 'shared-gtravel-1',
        name: 'G-Travel_Company_Travel_Policy.pdf',
        category: 'Company Policies',
        size: '1.8 MB',
        lastUpdated: '2024-09-10T17:00:00Z',
        status: 'available',
        confidentialityLevel: 'standard',
        requiredCompany: 'customer',
        fileType: 'reports'
    },
    {
        id: 'shared-gtravel-2',
        name: 'Monthly_Financial_Summary.xlsx', 
        category: 'Financial Reports',
        size: '950 KB',
        lastUpdated: '2024-09-21T11:00:00Z',
        status: 'available',
        confidentialityLevel: 'confidential',
        requiredCompany: 'customer',
        fileType: 'reports'
    }
];

// Helper function to determine user role based on email and company
function determineUserRole(userEmail, companyAccess) {
    const email = userEmail.toLowerCase();
    
    // Admin users (can be configured based on email patterns)
    if (email.includes('admin') || companyAccess.accessLevel === 'global') {
        return 'Admin';
    }
    
    // Manager users
    if (email.includes('manager') || email.includes('lead')) {
        return 'Manager';
    }
    
    // Default user role
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

// Handle Entra ID callback with FIXED company-based access
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
        
        // Exchange code for tokens
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
        
        // FIXED: Check company access and ensure correct mapping
        const companyAccess = COMPANY_ACCESS_LEVELS[userDomain];
        
        if (!companyAccess) {
            console.log(`🚫 Company domain ${userDomain} not authorized`);
            return res.redirect(`/login?error=company_not_authorized&domain=${encodeURIComponent(userDomain)}`);
        }
        
        // Create user files for new users if they don't exist
        if (!MOCK_USER_FILES[userEmail]) {
            createUserFiles(userEmail, userDomain);
        }
        
        // FIXED: Log the correct access level assignment
        console.log(`✅ User authenticated: ${claims.name || userEmail} from ${companyAccess.companyName}`);
        console.log(`🏢 Company Domain: ${userDomain} -> Access Level: ${companyAccess.accessLevel}`);
        
        // FIXED: Create session with correct company-based data
        req.session.user = {
            id: userEmail,
            entraObjectId: account.localAccountId,
            email: userEmail,
            displayName: claims.name || userEmail.split('@')[0],
            firstName: claims.given_name || '',
            lastName: claims.family_name || '',
            company: companyAccess.companyName,
            accessLevel: companyAccess.accessLevel, // This will now be 'cipher' for cipher.no users
            allowedFileTypes: companyAccess.allowedFileTypes,
            maxConfidentialityLevel: companyAccess.maxConfidentialityLevel,
            userDomain: userDomain,
            tenantId: claims.tid,
            role: determineUserRole(userEmail, companyAccess),
            regions: companyAccess.regions || [],
            loginTime: new Date().toISOString()
        };
        
        // Debug log to verify correct access level assignment
        console.log(`🔍 DEBUG - User session created:`);
        console.log(`   Email: ${userEmail}`);
        console.log(`   Domain: ${userDomain}`);
        console.log(`   Company: ${companyAccess.companyName}`);
        console.log(`   Access Level: ${companyAccess.accessLevel}`);
        console.log(`   Role: ${req.session.user.role}`);
        
        // Store tokens
        req.session.tokens = {
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            idToken: response.idToken,
            expiresAt: new Date(Date.now() + (response.expiresOn * 1000)).toISOString()
        };
        
        // Save session before redirect
        req.session.save((err) => {
            if (err) {
                console.error('❌ Session save error:', err);
                return res.redirect('/login?error=session_error');
            }
            
            const fileCount = MOCK_USER_FILES[userEmail] ? MOCK_USER_FILES[userEmail].length : 0;
            console.log(`🎉 SUCCESS: ${claims.name || userEmail} from ${companyAccess.companyName} authenticated`);
            console.log(`📁 User has ${fileCount} personal files + company shared files`);
            console.log(`✅ Access level correctly set to: ${companyAccess.accessLevel}`);
            
            res.redirect('/dashboard');
        });
        
    } catch (error) {
        console.error('❌ Callback processing error:', error);
        res.redirect('/login?error=auth_failed');
    }
});

// Create files for new users based on their company domain
function createUserFiles(userEmail, userDomain) {
    const userName = userEmail.split('@')[0].split('.').map(name => 
        name.charAt(0).toUpperCase() + name.slice(1)
    ).join(' ');
    
    if (userDomain === 'cipher.no') {
        // Create development/technical files for Cipher users
        MOCK_USER_FILES[userEmail] = [
            {
                id: `${userEmail}-dev-1`,
                name: `${userName}_Development_Report.pdf`,
                category: 'Development',
                size: '1.8 MB',
                lastUpdated: '2024-09-15T10:30:00Z',
                status: 'available',
                confidentialityLevel: 'restricted',
                fileType: 'reports'
            },
            {
                id: `${userEmail}-dev-2`, 
                name: `${userName}_System_Testing.xlsx`,
                category: 'Testing',
                size: '245 KB',
                lastUpdated: '2024-09-18T14:15:00Z',
                status: 'available',
                confidentialityLevel: 'standard',
                fileType: 'documents'
            }
        ];
        console.log(`📝 Created development files for new Cipher user: ${userName}`);
        
    } else if (userDomain === 'gtravel.no') {
        // Create business/travel files for G-Travel users
        MOCK_USER_FILES[userEmail] = [
            {
                id: `${userEmail}-travel-1`,
                name: `${userName}_Travel_Expenses.pdf`,
                category: 'Travel Expenses',
                size: '1.2 MB',
                lastUpdated: '2024-09-20T10:30:00Z',
                status: 'available',
                confidentialityLevel: 'confidential',
                fileType: 'invoices'
            },
            {
                id: `${userEmail}-travel-2`, 
                name: `${userName}_Business_Report.xlsx`,
                category: 'Business Reports',
                size: '380 KB',
                lastUpdated: '2024-09-19T14:15:00Z',
                status: 'available',
                confidentialityLevel: 'standard',
                fileType: 'reports'
            },
            {
                id: `${userEmail}-travel-3`,
                name: `${userName}_Customer_Analytics.xlsx`, 
                category: 'Analytics',
                size: '720 KB',
                lastUpdated: '2024-09-17T09:45:00Z',
                status: 'available',
                confidentialityLevel: 'confidential',
                fileType: 'travel-data'
            }
        ];
        console.log(`🏢 Created travel files for new G-Travel user: ${userName}`);
    }
}

// Get user info with correct access level
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

// ENHANCED: Get files with date range filtering and proper company access
router.get('/api/files', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const userId = req.session.user.id;
        const userAccessLevel = req.session.user.accessLevel;
        const allowedFileTypes = req.session.user.allowedFileTypes;
        
        // Get date range parameters for filtering
        const fromDate = req.query.fromDate;
        const toDate = req.query.toDate;
        
        console.log(`📁 File request from: ${req.session.user.displayName} (${req.session.user.company})`);
        console.log(`🏢 Access Level: ${userAccessLevel}`);
        if (fromDate && toDate) {
            console.log(`📅 Date range: ${fromDate} to ${toDate}`);
        }
        
        // Get user's personal files
        let personalFiles = MOCK_USER_FILES[userId] || [];
        
        // Get shared company files based on access level
        let sharedFiles = SHARED_COMPANY_FILES.filter(file => 
            file.requiredCompany === userAccessLevel || userAccessLevel === 'global'
        );
        
        // Combine all files
        let allFiles = [...personalFiles, ...sharedFiles];
        
        // Apply date filtering if provided
        if (fromDate && toDate) {
            const from = new Date(fromDate);
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999); // Include the entire end date
            
            allFiles = allFiles.filter(file => {
                const fileDate = new Date(file.lastUpdated);
                return fileDate >= from && fileDate <= to;
            });
            
            console.log(`📊 Date filter applied: ${allFiles.length} files found in range`);
        }
        
        // Format files for response
        const formattedFiles = allFiles.map(file => ({
            id: file.id,
            name: file.name,
            category: file.category,
            size: file.size,
            lastUpdated: file.lastUpdated,
            status: file.status,
            owner: file.id.includes(userId) ? 'You' : 'Company',
            confidentiality: file.confidentialityLevel
        }));
        
        console.log(`📊 Returned ${formattedFiles.length} files (${personalFiles.length} personal + ${sharedFiles.filter(f => f.requiredCompany === userAccessLevel).length} shared)`);
        
        res.json(formattedFiles);
        
    } catch (error) {
        console.error('❌ Files API error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Download file with company-based access control
router.get('/api/download/:fileId', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const fileId = req.params.fileId;
        const userId = req.session.user.id;
        const userAccessLevel = req.session.user.accessLevel;
        
        console.log(`📥 Download request: ${fileId} by ${req.session.user.displayName}`);
        
        // Find file in user's personal files or shared files
        let file = null;
        const personalFiles = MOCK_USER_FILES[userId] || [];
        file = personalFiles.find(f => f.id === fileId);
        
        if (!file) {
            file = SHARED_COMPANY_FILES.find(f => f.id === fileId);
            
            if (file && file.requiredCompany !== userAccessLevel && userAccessLevel !== 'global') {
                console.log(`🚫 Access denied: User cannot access file from different company`);
                return res.status(403).json({ 
                    error: 'Access denied',
                    message: 'You do not have permission to download this file'
                });
            }
        }
        
        if (!file) {
            console.log(`❌ File not found: ${fileId}`);
            return res.status(404).json({ 
                error: 'File not found',
                message: 'The requested file was not found'
            });
        }
        
        console.log(`✅ Download approved: ${file.name} for ${req.session.user.company} user`);
        
        res.json({ 
            downloadUrl: `https://mock-storage.blob.core.windows.net/files/${fileId}`,
            fileName: file.name,
            message: `Download authorized for ${req.session.user.company} user`
        });
        
    } catch (error) {
        console.error('❌ Download error:', error);
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
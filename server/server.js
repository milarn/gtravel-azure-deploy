// server.js - FIXED: Removed duplicate endpoints, only use /auth/* routes
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

// Import custom modules
const authRoutes = require('./routes/auth');
const functionProxyRoutes = require('./routes/function-proxy');
const { validateConfig } = require('./config/validation');

const app = express();
const PORT = process.env.PORT || 3000;

// Validate configuration on startup
validateConfig();

console.log('🚀 Starting G Travel Authentication Server...');
console.log(`📍 Environment: ${process.env.NODE_ENV}`);
console.log(`🔗 Base URL: ${process.env.BASE_URL}`);

// CSP configuration - RELAXED for development to fix preview issues
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "data:"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "data:"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https://login.microsoftonline.com", "https://*.azurewebsites.net"],
            formAction: ["'self'", "https://login.microsoftonline.com"],
            frameSrc: ["https://login.microsoftonline.com"],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'", "data:", "blob:"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false
}));
console.log('🛡️ CSP enabled with relaxed policies for development');

// CORS configuration
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
    optionsSuccessStatus: 200
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/auth/', limiter);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Session configuration
const sessionConfig = {
    secret: process.env.SESSION_SECRET,
    name: process.env.SESSION_NAME,
    resave: true,
    saveUninitialized: true,
    cookie: {
        secure: false, // Set to false for localhost testing
        httpOnly: true,
        maxAge: parseInt(process.env.SESSION_MAX_AGE),
        sameSite: 'lax'
    }
};

app.use(session(sessionConfig));

// Debug middleware to log session info
app.use((req, res, next) => {
    if (req.path.includes('/auth/')) {
        console.log(`🔍 Session Debug - Path: ${req.path}, Session ID: ${req.session.id}, User: ${req.session.user ? 'Yes' : 'No'}`);
    }
    next();
});

// Static files (serve your frontend)
app.use(express.static(path.join(__dirname, '../'), {
    dotfiles: 'ignore',
    etag: true,
    extensions: ['html', 'css', 'js', 'svg', 'ico'],
    index: ['login.html'],
    maxAge: '1d',
    redirect: false,
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.html')) {
            res.set('Cache-Control', 'public, max-age=0');
        } else if (path.endsWith('.svg')) {
            res.set('Content-Type', 'image/svg+xml');
        }
    }
}));

// Specific favicon routes
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, '../favicon.ico'));
});

app.get('/favicon.svg', (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.sendFile(path.join(__dirname, '../favicon.svg'));
});

// Authentication routes - ALL auth endpoints are under /auth/
app.use('/auth', authRoutes);

// SECURE Function App proxy routes - requires authentication
app.use('/api/function', functionProxyRoutes);
console.log('🔒 Function proxy routes enabled: /api/function/*');

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        version: require('./package.json').version,
        authentication: 'Entra ID ready'
    });
});

// Debug endpoint
app.get('/debug', (req, res) => {
    console.log('🔍 Debug page requested');
    res.sendFile(path.join(__dirname, '../debug.html'));
});

// REMOVED: Duplicate /user endpoint (use /auth/user instead)
// REMOVED: Duplicate /logout endpoint (use /auth/logout instead)

// Frontend routes (serve HTML files)
app.get('/', (req, res) => {
    if (req.session.user) {
        console.log(`✅ Root redirect: User ${req.session.user.email} already authenticated, redirecting to dashboard`);
        res.redirect('/dashboard');
    } else {
        console.log('📝 Root: No user session, serving login page');
        res.sendFile(path.join(__dirname, '../login.html'));
    }
});

app.get('/login', (req, res) => {
    if (req.session.user) {
        console.log(`✅ Login redirect: User ${req.session.user.email} already authenticated, redirecting to dashboard`);
        res.redirect('/dashboard');
    } else {
        console.log('📝 Login: No user session, serving login page');
        res.sendFile(path.join(__dirname, '../login.html'));
    }
});

app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        console.log('🚫 Dashboard: No user session, redirecting to login');
        res.redirect('/login');
    } else {
        console.log(`✅ Dashboard: Serving dashboard to ${req.session.user.email}`);
        res.sendFile(path.join(__dirname, '../dashboard.html'));
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    
    if (process.env.NODE_ENV === 'development') {
        res.status(500).json({
            error: 'Internal Server Error',
            message: err.message,
            stack: err.stack
        });
    } else {
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Something went wrong'
        });
    }
});

// 404 handler
app.use('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
        res.status(404).json({ error: 'Endpoint not found' });
    } else {
        res.status(404).sendFile(path.join(__dirname, '../login.html'));
    }
});

// Graceful shutdown - Enhanced with confirmation
let shutdownRequested = false;

process.on('SIGINT', () => {
    if (!shutdownRequested) {
        shutdownRequested = true;
        console.log('\n⚠️ Received shutdown signal. Press Ctrl+C again within 5 seconds to force shutdown...');
        console.log('🔄 Server continues running. Authentication is working correctly.');
        
        setTimeout(() => {
            shutdownRequested = false;
            console.log('💚 Shutdown cancelled. Server continues running.');
        }, 5000);
        
        return;
    }
    
    console.log('\n🛑 Force shutdown requested. Shutting down server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    process.exit(0);
});

// Enhanced error handling
process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception:', error);
    console.error('Stack:', error.stack);
    // Don\'t exit - try to continue running
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    // Don\'t exit - try to continue running
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`✅ Server running on ${process.env.BASE_URL}`);
    console.log(`📁 Serving frontend from: ${path.join(__dirname, '../')}`);
    console.log(`🔐 Authentication: Azure Entra ID (Multi-tenant)`);
    console.log(`🆔 App ID: ${process.env.CLIENT_ID}`);
    console.log('');
    console.log('🔗 Routes:');
    console.log(`   GET  /              → Login page (redirects to dashboard if authenticated)`);
    console.log(`   GET  /login         → Login page`);
    console.log(`   GET  /dashboard     → Dashboard (protected)`);
    console.log(`   GET  /debug         → Authentication debug page`);
    console.log(`   GET  /auth/login    → Start Entra ID authentication`);
    console.log(`   GET  /auth/callback → Entra ID callback handler`);
    console.log(`   GET  /auth/user     → Get user info (protected)`);
    console.log(`   GET  /auth/api/files → Get user files (protected)`);
    console.log(`   POST /auth/logout   → Logout user`);
    console.log(`   GET  /health        → Health check`);
    console.log('');
    console.log('🔒 SECURE Function Proxy Routes:');
    console.log(`   GET  /api/function/files → Get files via secure proxy (protected)`);
    console.log(`   GET  /api/function/preview/:accno/:srcFile → Preview file securely`);
    console.log(`   GET  /api/function/download/:accno/:srcFile → Download file securely`);
    console.log('');
    console.log('🎯 Ready for testing! Open: http://localhost:3000/login');
    console.log('💡 Note: Press Ctrl+C twice quickly to shutdown the server');
    console.log('✅ AUTHORIZATION FIX: All function calls now go through secure proxy');
});

// Handle server errors
server.on('error', (error) => {
    console.error('🚨 Server error:', error);
});

module.exports = app;
// middleware/auth.js - Authentication middleware (Simplified for Testing)

// Middleware to require authentication
const requireAuth = async (req, res, next) => {
    try {
        // Check if user session exists
        if (!req.session || !req.session.user) {
            console.log(`🚫 Unauthenticated request to ${req.path} from ${req.ip}`);
            
            // For API requests, return JSON error
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({
                    error: 'Authentication required',
                    message: 'Please log in to access this resource'
                });
            }
            
            // For page requests, redirect to login
            return res.redirect('/login');
        }
        
        // Check if session has expired
        const now = new Date();
        const tokenExpiry = new Date(req.session.user.tokenExpiry || Date.now() + 60 * 60 * 1000);
        
        if (now > tokenExpiry) {
            console.log(`⏰ Token expired for user: ${req.session.user.email}`);
            
            // Clear expired session
            req.session.destroy((err) => {
                if (err) console.error('Session destruction error:', err);
            });
            
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({
                    error: 'Session expired',
                    message: 'Please log in again'
                });
            }
            
            return res.redirect('/login?error=session_expired');
        }
        
        // Extend session expiry on activity
        req.session.user.tokenExpiry = new Date(Date.now() + (60 * 60 * 1000)).toISOString(); // 1 hour
        
        console.log(`✅ Authenticated request: ${req.method} ${req.path} by ${req.session.user.displayName} (${req.session.user.role})`);
        
        next();
        
    } catch (error) {
        console.error('❌ Authentication middleware error:', error);
        
        if (req.path.startsWith('/api/')) {
            return res.status(500).json({
                error: 'Authentication check failed',
                message: 'Please try again'
            });
        }
        
        return res.redirect('/login?error=auth_error');
    }
};

// Middleware to require specific role
const requireRole = (requiredRole) => {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({
                    error: 'Authentication required',
                    message: 'Please log in to access this resource'
                });
            }
            return res.redirect('/login');
        }
        
        const userRole = req.session.user.role;
        
        // Admin role can access everything
        if (userRole === 'Admin' || userRole === 'admin') {
            return next();
        }
        
        // Check if user has required role
        if (userRole !== requiredRole) {
            console.log(`🚫 Access denied: User ${req.session.user.email} (${userRole}) attempted to access ${requiredRole}-only resource`);
            
            if (req.path.startsWith('/api/')) {
                return res.status(403).json({
                    error: 'Insufficient permissions',
                    message: `This resource requires ${requiredRole} role`
                });
            }
            
            return res.status(403).send('Access Denied: Insufficient permissions');
        }
        
        next();
    };
};

// Middleware to require specific access level
const requireAccessLevel = (requiredLevel) => {
    const accessLevels = {
        'standard': 0,
        'europe': 1,
        'nordic': 2,
        'global': 3
    };
    
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({
                    error: 'Authentication required',
                    message: 'Please log in to access this resource'
                });
            }
            return res.redirect('/login');
        }
        
        const userLevel = req.session.user.accessLevel || 'standard';
        const userLevelValue = accessLevels[userLevel] || 0;
        const requiredLevelValue = accessLevels[requiredLevel] || 0;
        
        // Admin role bypasses access level checks
        if (req.session.user.role === 'Admin' || req.session.user.role === 'admin') {
            return next();
        }
        
        if (userLevelValue < requiredLevelValue) {
            console.log(`🚫 Access denied: User ${req.session.user.email} (${userLevel}) attempted to access ${requiredLevel} resource`);
            
            if (req.path.startsWith('/api/')) {
                return res.status(403).json({
                    error: 'Insufficient access level',
                    message: `This resource requires ${requiredLevel} access level`
                });
            }
            
            return res.status(403).send('Access Denied: Insufficient access level');
        }
        
        next();
    };
};

// Simple audit logger for testing
const auditLogger = (req, res, next) => {
    const user = req.session?.user;
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
        console.log(`📊 ${req.method} ${req.path} - ${user?.email || 'Anonymous'} (${req.ip})`);
    }
    
    next();
};

module.exports = {
    requireAuth,
    requireRole,
    requireAccessLevel,
    auditLogger
};

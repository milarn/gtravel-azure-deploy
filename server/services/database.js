// services/database.js - Database service for SQL Server operations
const sql = require('mssql');

// Database configuration
const dbConfig = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
        connectTimeout: 30000,
        requestTimeout: 30000,
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
        }
    }
};

let pool = null;

// Initialize database connection pool
async function initializeDatabase() {
    try {
        console.log('🔌 Initializing database connection...');
        pool = await sql.connect(dbConfig);
        console.log('✅ Database connected successfully');
        return pool;
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        throw error;
    }
}

// Get database pool (initialize if not exists)
async function getPool() {
    if (!pool) {
        await initializeDatabase();
    }
    return pool;
}

// User Management Functions

// Get user by B2C Object ID
async function getUserByB2CId(b2cObjectId) {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('b2cObjectId', sql.NVarChar, b2cObjectId)
            .query(`
                SELECT u.*, c.CompanyName
                FROM Users u
                LEFT JOIN Companies c ON u.CompanyId = c.CompanyId
                WHERE u.B2CObjectId = @b2cObjectId AND u.IsActive = 1
            `);
        
        return result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (error) {
        console.error('❌ Error getting user by B2C ID:', error);
        throw error;
    }
}

// Create new user
async function createUser(userData) {
    try {
        const pool = await getPool();
        const userId = generateGuid();
        
        await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('email', sql.NVarChar, userData.email)
            .input('b2cObjectId', sql.NVarChar, userData.b2cObjectId)
            .input('displayName', sql.NVarChar, userData.displayName)
            .input('firstName', sql.NVarChar, userData.firstName)
            .input('lastName', sql.NVarChar, userData.lastName)
            .input('jobTitle', sql.NVarChar, userData.jobTitle)
            .input('companyId', sql.UniqueIdentifier, userData.companyId)
            .input('role', sql.NVarChar, userData.role)
            .input('accessLevel', sql.NVarChar, userData.accessLevel)
            .input('department', sql.NVarChar, userData.department)
            .query(`
                INSERT INTO Users (
                    UserId, Email, B2CObjectId, DisplayName, FirstName, LastName, 
                    JobTitle, CompanyId, Role, AccessLevel, Department, 
                    IsActive, CreatedDate, LastLoginDate
                )
                VALUES (
                    @userId, @email, @b2cObjectId, @displayName, @firstName, @lastName,
                    @jobTitle, @companyId, @role, @accessLevel, @department,
                    1, GETUTCDATE(), GETUTCDATE()
                )
            `);
        
        console.log(`✅ User created: ${userData.email} (${userId})`);
        return { UserId: userId, CompanyId: userData.companyId, Role: userData.role };
    } catch (error) {
        console.error('❌ Error creating user:', error);
        throw error;
    }
}

// Update user's last login and any changed attributes
async function updateUserLastLogin(userId, userData) {
    try {
        const pool = await getPool();
        
        await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('displayName', sql.NVarChar, userData.displayName)
            .input('firstName', sql.NVarChar, userData.firstName)
            .input('lastName', sql.NVarChar, userData.lastName)
            .input('jobTitle', sql.NVarChar, userData.jobTitle)
            .input('role', sql.NVarChar, userData.role)
            .input('accessLevel', sql.NVarChar, userData.accessLevel)
            .input('department', sql.NVarChar, userData.department)
            .query(`
                UPDATE Users 
                SET LastLoginDate = GETUTCDATE(),
                    DisplayName = @displayName,
                    FirstName = @firstName,
                    LastName = @lastName,
                    JobTitle = @jobTitle,
                    Role = @role,
                    AccessLevel = @accessLevel,
                    Department = @department
                WHERE UserId = @userId
            `);
        
        console.log(`✅ User login updated: ${userId}`);
    } catch (error) {
        console.error('❌ Error updating user login:', error);
        throw error;
    }
}

// Update user's last activity
async function updateUserLastActivity(userId) {
    try {
        const pool = await getPool();
        
        await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .query(`
                UPDATE Users 
                SET LastActivityDate = GETUTCDATE()
                WHERE UserId = @userId
            `);
    } catch (error) {
        console.error('❌ Error updating user activity:', error);
        // Don't throw error for activity updates
    }
}

// File Management Functions

// Get files accessible to a user based on their company and role
async function getFilesForUser(companyId, userRole, accessLevel = 'standard') {
    try {
        const pool = await getPool();
        
        // Define access level hierarchy
        const accessLevelValue = getAccessLevelValue(accessLevel);
        
        const result = await pool.request()
            .input('companyId', sql.UniqueIdentifier, companyId)
            .input('userRole', sql.NVarChar, userRole)
            .input('accessLevelValue', sql.Int, accessLevelValue)
            .query(`
                SELECT DISTINCT
                    f.FileId,
                    f.FileName,
                    f.BlobPath,
                    f.Category,
                    f.SizeBytes,
                    f.LastUpdated,
                    f.UploadedBy,
                    cfa.RequiredRole,
                    cfa.RequiredAccessLevel,
                    c.CompanyName,
                    c.CompanyId
                FROM Files f
                INNER JOIN CompanyFileAccess cfa ON f.FileId = cfa.FileId
                INNER JOIN Companies c ON cfa.CompanyId = c.CompanyId
                WHERE cfa.CompanyId = @companyId
                AND c.IsActive = 1
                AND (
                    cfa.RequiredRole IS NULL 
                    OR cfa.RequiredRole = @userRole 
                    OR @userRole = 'Admin'
                )
                AND (
                    cfa.RequiredAccessLevel IS NULL
                    OR dbo.GetAccessLevelValue(cfa.RequiredAccessLevel) <= @accessLevelValue
                )
                ORDER BY f.LastUpdated DESC
            `);
        
        console.log(`📁 Found ${result.recordset.length} files for company ${companyId}, role ${userRole}, access ${accessLevel}`);
        return result.recordset;
    } catch (error) {
        console.error('❌ Error getting files for user:', error);
        throw error;
    }
}

// Get specific file by ID
async function getFileById(fileId) {
    try {
        const pool = await getPool();
        
        const result = await pool.request()
            .input('fileId', sql.UniqueIdentifier, fileId)
            .query(`
                SELECT f.*, c.CompanyName
                FROM Files f
                LEFT JOIN CompanyFileAccess cfa ON f.FileId = cfa.FileId
                LEFT JOIN Companies c ON cfa.CompanyId = c.CompanyId
                WHERE f.FileId = @fileId
            `);
        
        return result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (error) {
        console.error('❌ Error getting file by ID:', error);
        throw error;
    }
}

// Company Management Functions

// Get company information
async function getUserCompany(companyId) {
    try {
        const pool = await getPool();
        
        const result = await pool.request()
            .input('companyId', sql.UniqueIdentifier, companyId)
            .query(`
                SELECT CompanyId, CompanyName, ContactEmail, IsActive, CreatedDate
                FROM Companies 
                WHERE CompanyId = @companyId
            `);
        
        return result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (error) {
        console.error('❌ Error getting company:', error);
        throw error;
    }
}

// Audit and Logging Functions

// Log file access attempts
async function logFileAccess(userId, fileId, action, ipAddress, userAgent, errorMessage = null) {
    try {
        const pool = await getPool();
        
        await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('fileId', sql.UniqueIdentifier, fileId)
            .input('action', sql.NVarChar, action)
            .input('ipAddress', sql.NVarChar, ipAddress)
            .input('userAgent', sql.NVarChar, userAgent)
            .input('errorMessage', sql.NVarChar, errorMessage)
            .query(`
                INSERT INTO FileAccessLog (
                    UserId, FileId, Action, IpAddress, UserAgent, 
                    ErrorMessage, CreatedDate
                )
                VALUES (
                    @userId, @fileId, @action, @ipAddress, @userAgent,
                    @errorMessage, GETUTCDATE()
                )
            `);
        
        console.log(`📊 Logged file access: ${action} for user ${userId}, file ${fileId}`);
    } catch (error) {
        console.error('❌ Error logging file access:', error);
        // Don't throw error for logging failures
    }
}

// Helper Functions

// Generate GUID for new records
function generateGuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Convert access level to numeric value for comparison
function getAccessLevelValue(accessLevel) {
    const levels = {
        'standard': 0,
        'europe': 1,
        'nordic': 2,
        'global': 3
    };
    return levels[accessLevel] || 0;
}

// Database Health Check
async function checkDatabaseHealth() {
    try {
        const pool = await getPool();
        const result = await pool.request().query('SELECT 1 as healthy');
        return result.recordset.length > 0;
    } catch (error) {
        console.error('❌ Database health check failed:', error);
        return false;
    }
}

// Initialize database connection on module load
initializeDatabase().catch(error => {
    console.error('❌ Failed to initialize database on startup:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    if (pool) {
        console.log('🔌 Closing database connection...');
        await pool.close();
    }
});

module.exports = {
    getUserByB2CId,
    createUser,
    updateUserLastLogin,
    updateUserLastActivity,
    getFilesForUser,
    getFileById,
    getUserCompany,
    logFileAccess,
    checkDatabaseHealth,
    getPool,
    generateGuid
};

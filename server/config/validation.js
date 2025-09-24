// config/validation.js - Multi-tenant configuration validation

function validateConfig() {
    const requiredEnvVars = [
        'TENANT_ID',
        'CLIENT_ID', 
        'CLIENT_SECRET',
        'BASE_URL',
        'REDIRECT_URI',
        'SESSION_SECRET'
    ];
    
    const missing = [];
    
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            missing.push(envVar);
        }
    }
    
    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(envVar => {
            console.error(`   - ${envVar}`);
        });
        console.error('\n💡 Please check your .env file and ensure all required variables are set.');
        process.exit(1);
    }
    
    // Validate TENANT_ID - allow GUID format OR "common" for multi-tenant
    const tenantId = process.env.TENANT_ID;
    const isValidGuid = tenantId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const isMultiTenant = tenantId === 'common';
    
    if (!isValidGuid && !isMultiTenant) {
        console.error('❌ TENANT_ID must be either a valid GUID format or "common" for multi-tenant');
        process.exit(1);
    }
    
    // Validate CLIENT_ID format
    if (!process.env.CLIENT_ID.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        console.error('❌ CLIENT_ID must be a valid GUID format');
        process.exit(1);
    }
    
    // Validate REDIRECT_URI format
    if (!process.env.REDIRECT_URI.startsWith('http')) {
        console.error('❌ REDIRECT_URI must be a valid URL starting with http:// or https://');
        process.exit(1);
    }
    
    console.log('✅ Configuration validation passed');
    console.log(`🔑 Using test app: ${process.env.CLIENT_ID}`);
    
    if (isMultiTenant) {
        console.log('🌐 Multi-tenant mode: External users from any organization can sign in');
    } else {
        console.log(`🏢 Single-tenant mode: ${process.env.TENANT_ID}`);
    }
}

module.exports = {
    validateConfig
};

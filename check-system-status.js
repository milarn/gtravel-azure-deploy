// check-system-status.js - Comprehensive system status check
require('dotenv').config({ path: './server/.env' });

async function checkSystemStatus() {
    console.log('🔍 G Travel System Status Check\n');
    
    // Check environment variables
    console.log('📋 Environment Configuration:');
    const requiredVars = [
        'CLIENT_ID',
        'CLIENT_SECRET', 
        'AZURE_FUNCTION_BASE_URL',
        'SESSION_SECRET',
        'BASE_URL'
    ];
    
    for (const varName of requiredVars) {
        const value = process.env[varName];
        if (value) {
            if (varName.includes('SECRET') || varName.includes('PASSWORD')) {
                console.log(`   ✅ ${varName}: Set (***hidden***)`);
            } else if (varName === 'AZURE_FUNCTION_BASE_URL') {
                console.log(`   ✅ ${varName}: ${value.substring(0, 50)}...`);
            } else {
                console.log(`   ✅ ${varName}: ${value}`);
            }
        } else {
            console.log(`   ❌ ${varName}: Missing`);
        }
    }
    console.log('');
    
    // Test Azure Function
    console.log('🔗 Azure Function Connectivity:');
    const functionUrl = process.env.AZURE_FUNCTION_BASE_URL;
    
    if (!functionUrl) {
        console.log('   ❌ AZURE_FUNCTION_BASE_URL not configured');
        return;
    }
    
    try {
        console.log('   🧪 Testing basic connectivity...');
        
        const testUrl = `${functionUrl}&action=getDynamicStats&domain=cipher.no`;
        console.log(`   📡 URL: ${testUrl.substring(0, 80)}...`);
        
        const response = await fetch(testUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        
        console.log(`   📊 Status: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
            const data = await response.json();
            console.log('   ✅ Azure Function is responding');
            console.log(`   📊 Sample response keys: ${Object.keys(data).join(', ')}`);
            
            if (data.stats) {
                console.log('   ✅ Statistics data available');
            }
            if (data.totalFlights !== undefined) {
                console.log(`   ✈️ Total flights found: ${data.totalFlights}`);
            }
        } else {
            const errorText = await response.text();
            console.log('   ❌ Azure Function error:');
            console.log(`   📝 Response: ${errorText.substring(0, 200)}...`);
        }
        
    } catch (error) {
        console.log('   ❌ Connection failed:');
        console.log(`   📝 Error: ${error.message}`);
        
        if (error.message.includes('fetch')) {
            console.log('   💡 This might be a network/CORS issue or the Function is sleeping');
        }
    }
    
    console.log('');
    
    // Check Node.js server files
    console.log('📁 File Status:');
    const fs = require('fs');
    const path = require('path');
    
    const filesToCheck = [
        { path: './server/routes/auth.js', desc: 'Authentication routes' },
        { path: './dashboard.js', desc: 'Frontend dashboard' },
        { path: './server/server.js', desc: 'Main server file' },
        { path: './server/.env', desc: 'Environment config' }
    ];
    
    for (const file of filesToCheck) {
        try {
            const exists = fs.existsSync(file.path);
            if (exists) {
                const stats = fs.statSync(file.path);
                console.log(`   ✅ ${file.desc}: Exists (${Math.round(stats.size/1024)}KB, modified ${stats.mtime.toISOString().split('T')[0]})`);
            } else {
                console.log(`   ❌ ${file.desc}: Missing`);
            }
        } catch (error) {
            console.log(`   ⚠️ ${file.desc}: Error checking (${error.message})`);
        }
    }
    
    console.log('');
    
    // Final recommendations
    console.log('💡 Recommendations:');
    if (!process.env.AZURE_FUNCTION_BASE_URL) {
        console.log('   1. Set AZURE_FUNCTION_BASE_URL in server/.env');
    } else {
        console.log('   1. ✅ Azure Function URL is configured');
    }
    
    console.log('   2. Ensure "cipher.no" domain is authorized in your SQL CompanyAccess table');
    console.log('   3. Check Azure Function logs if connectivity fails');
    console.log('   4. Test with: node test-azure-function.js');
    console.log('   5. Start server with: cd server && npm start');
    
    console.log('\n🎯 Expected behavior:');
    console.log('   • Dashboard shows real flight statistics');
    console.log('   • File list shows actual SQL data');
    console.log('   • Browser console shows "✅ Real data loaded from Azure Function"');
}

// Run the check
checkSystemStatus().catch(console.error);

// test-azure-function.js - Test script to verify Azure Function connectivity
require('dotenv').config({ path: './server/.env' });

async function testAzureFunction() {
    console.log('🧪 Testing Azure Function Connection...\n');
    
    const functionUrl = process.env.AZURE_FUNCTION_BASE_URL;
    
    if (!functionUrl) {
        console.error('❌ AZURE_FUNCTION_BASE_URL not found in .env file');
        console.log('Please check your server/.env file and make sure it contains:');
        console.log('AZURE_FUNCTION_BASE_URL=https://gtravelpoc.azurewebsites.net/api/fileaccess?code=...');
        return;
    }
    
    console.log(`🔗 Function URL: ${functionUrl}`);
    console.log('');
    
    // Test different actions
    const tests = [
        {
            name: 'Get Available Files',
            action: 'getAvailableFiles',
            domain: 'cipher.no'
        },
        {
            name: 'Get Dynamic Stats',
            action: 'getDynamicStats', 
            domain: 'cipher.no'
        }
    ];
    
    for (const test of tests) {
        try {
            console.log(`🔍 Testing: ${test.name}`);
            
            const params = new URLSearchParams({
                action: test.action,
                domain: test.domain
            });
            
            const url = `${functionUrl}&${params.toString()}`;
            console.log(`📡 Calling: ${url}`);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`📊 Status: ${response.status} ${response.statusText}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ SUCCESS: ${test.name}`);
                
                if (test.action === 'getAvailableFiles') {
                    console.log(`   📁 Files found: ${data.files?.length || 0}`);
                    console.log(`   🏢 Company: ${data.companyName || 'Unknown'}`);
                } else if (test.action === 'getDynamicStats') {
                    console.log(`   ✈️ Total flights: ${data.totalFlights || 0}`);
                    console.log(`   📊 Stats available: ${!!data.stats}`);
                }
            } else {
                const errorText = await response.text();
                console.log(`❌ FAILED: ${test.name}`);
                console.log(`   Error: ${errorText}`);
            }
            
        } catch (error) {
            console.log(`❌ ERROR: ${test.name}`);
            console.log(`   ${error.message}`);
        }
        
        console.log(''); // Empty line between tests
    }
    
    console.log('🏁 Test completed');
    console.log('');
    console.log('💡 Tips:');
    console.log('- If you see 403 errors, the domain "cipher.no" might not be authorized in your SQL database');
    console.log('- If you see 500 errors, check your Azure Function logs');
    console.log('- If you see network errors, verify the Function URL and code parameter');
}

// Run the test
testAzureFunction().catch(console.error);
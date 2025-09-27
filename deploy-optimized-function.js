#!/usr/bin/env node
// deploy-optimized-function.js - Deploy the optimized Azure Function
const fs = require('fs');
const path = require('path');

console.log('🚀 Deploying Optimized Azure Function\n');

try {
    // Read the optimized function code
    const optimizedFunctionPath = path.join(__dirname, 'azure-function-improved.js');
    
    if (!fs.existsSync(optimizedFunctionPath)) {
        console.error('❌ azure-function-improved.js not found');
        console.log('Please make sure the optimized function file exists in the project directory');
        process.exit(1);
    }
    
    const optimizedCode = fs.readFileSync(optimizedFunctionPath, 'utf8');
    
    console.log('✅ Optimized Azure Function code loaded');
    console.log(`📊 Code size: ${Math.round(optimizedCode.length / 1024)}KB`);
    console.log('');
    
    console.log('🔧 Key Optimizations:');
    console.log('   ✅ Fixed airline name lookup (WF → Widerøe)');
    console.log('   ✅ Direct SQL queries instead of stored procedures');
    console.log('   ✅ Single query for multiple AccNos (faster)');
    console.log('   ✅ Reduced timeouts and improved error handling');
    console.log('   ✅ Fallback airline/airport name mapping');
    console.log('   ✅ Better performance with connection pooling');
    console.log('');
    
    console.log('📋 Deployment Steps:');
    console.log('1. Copy the optimized code from azure-function-improved.js');
    console.log('2. Go to your Azure Function App in the Azure Portal');
    console.log('3. Navigate to your function (probably named "fileaccess")');
    console.log('4. Replace the existing code with the optimized version');
    console.log('5. Save and test');
    console.log('');
    
    console.log('🧪 Testing after deployment:');
    console.log('   node test-azure-function.js');
    console.log('');
    
    console.log('🎯 Expected improvements:');
    console.log('   • Airlines show as "Widerøe" instead of "WF"');
    console.log('   • Destinations show as "Bodø Lufthavn" instead of "BOO"');
    console.log('   • Preview and Download work without execute errors');
    console.log('   • Faster loading (3-5 seconds instead of 10-15 seconds)');
    console.log('   • Better error handling and fallbacks');
    console.log('');
    
    console.log('📝 Quick Copy Command:');
    console.log('   The optimized code is ready in: azure-function-improved.js');
    
    // Also create a backup reminder
    console.log('');
    console.log('⚠️  IMPORTANT: Backup your current Azure Function code before replacing!');
    
} catch (error) {
    console.error('❌ Deployment script error:', error.message);
    process.exit(1);
}

console.log('\n🏁 Ready for deployment!');

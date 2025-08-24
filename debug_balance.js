const BingXService = require('./src/services/bingxService');

async function debugBingXBalance() {
  try {
    console.log('🔍 Debugging BingX Balance API...\n');
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Test different endpoints to find the correct one for futures balance
    const endpoints = [
      '/openApi/swap/v2/user/balance',
      '/openApi/swap/v1/user/balance', 
      '/openApi/swap/v2/account/balance',
      '/openApi/perpetual/v1/user/account'
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`\n📡 Testing endpoint: ${endpoint}`);
        const result = await bingx.makeRequest('GET', endpoint, {});
        console.log('✅ Response structure:', JSON.stringify(result, null, 2));
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }
    }
    
    // Also test the current working method
    console.log('\n📊 Current getAccountInfo result:');
    const accountInfo = await bingx.getAccountInfo();
    console.log(JSON.stringify(accountInfo, null, 2));
    
  } catch (error) {
    console.error('Debug failed:', error.message);
  }
}

debugBingXBalance();
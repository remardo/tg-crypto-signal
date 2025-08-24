const BingXService = require('./src/services/bingxService');

async function testBingXAPI() {
  try {
    console.log('🔍 Testing BingX API Endpoints...\n');
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    console.log('✅ BingX service initialized\n');
    
    // Test symbol price (this works)
    console.log('📊 Testing symbol price...');
    try {
      const priceInfo = await bingx.getSymbolPrice('BTC-USDT');
      console.log('✅ Price info:', priceInfo);
    } catch (error) {
      console.log('❌ Price error:', error.message);
    }
    
    console.log('\n📊 Testing symbol info...');
    try {
      const symbolInfo = await bingx.getSymbolInfo('BTC-USDT');
      console.log('✅ Symbol info:', symbolInfo);
    } catch (error) {
      console.log('❌ Symbol info error:', error.message);
    }
    
    // Test contracts endpoint directly
    console.log('\n📊 Testing contracts endpoint directly...');
    try {
      const result = await bingx.makeRequest('GET', '/openApi/swap/v2/quote/contracts', { symbol: 'BTC-USDT' }, false);
      console.log('✅ Raw contracts response:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.log('❌ Contracts error:', error.message);
    }
    
    // Test without symbol parameter
    console.log('\n📊 Testing contracts without symbol filter...');
    try {
      const result = await bingx.makeRequest('GET', '/openApi/swap/v2/quote/contracts', {}, false);
      console.log('✅ All contracts count:', Array.isArray(result) ? result.length : 'Not an array');
      
      if (Array.isArray(result) && result.length > 0) {
        // Find BTC-USDT contract
        const btcContract = result.find(contract => contract.symbol === 'BTC-USDT');
        if (btcContract) {
          console.log('✅ Found BTC-USDT contract:', JSON.stringify(btcContract, null, 2));
        } else {
          console.log('❌ BTC-USDT contract not found in list');
          console.log('Available symbols (first 10):', result.slice(0, 10).map(c => c.symbol));
        }
      }
    } catch (error) {
      console.log('❌ All contracts error:', error.message);
    }
    
    // Test account balance
    console.log('\n💰 Testing account balance...');
    try {
      const accountInfo = await bingx.getAccountInfo();
      console.log('✅ Account info:', {
        balance: accountInfo.balance,
        availableBalance: accountInfo.availableBalance
      });
    } catch (error) {
      console.log('❌ Account error:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testBingXAPI();
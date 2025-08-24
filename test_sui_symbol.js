const BingXService = require('./src/services/bingxService');

async function testSUISymbol() {
  try {
    console.log('🔍 Testing SUI Symbol Availability...\n');
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Test SUI-USDT symbol info
    console.log('📊 Testing SUI-USDT symbol info...');
    try {
      const symbolInfo = await bingx.getSymbolInfo('SUI-USDT');
      console.log('✅ SUI-USDT info:', JSON.stringify(symbolInfo, null, 2));
    } catch (error) {
      console.log('❌ SUI-USDT error:', error.message);
      
      // Check if SUI exists in another format
      console.log('\n🔍 Searching for SUI in all contracts...');
      try {
        const allContracts = await bingx.makeRequest('GET', '/openApi/swap/v2/quote/contracts', {}, false);
        const suiContracts = allContracts.filter(contract => 
          contract.symbol.includes('SUI') || contract.asset === 'SUI'
        );
        
        if (suiContracts.length > 0) {
          console.log('✅ Found SUI contracts:');
          suiContracts.forEach(contract => {
            console.log(`  ${contract.symbol} - ${contract.displayName}`);
          });
        } else {
          console.log('❌ No SUI contracts found');
        }
      } catch (searchError) {
        console.log('❌ Search error:', searchError.message);
      }
    }
    
    // Test current price
    console.log('\n📈 Testing SUI-USDT price...');
    try {
      const priceInfo = await bingx.getSymbolPrice('SUI-USDT');
      console.log('✅ SUI-USDT price:', priceInfo);
    } catch (error) {
      console.log('❌ Price error:', error.message);
    }
    
    // Test BTC as a comparison (should work)
    console.log('\n📊 Testing BTC-USDT for comparison...');
    try {
      const btcInfo = await bingx.getSymbolInfo('BTC-USDT');
      console.log('✅ BTC-USDT info:', {
        symbol: btcInfo.symbol,
        minQty: btcInfo.minQty,
        stepSize: btcInfo.stepSize,
        minOrderValue: btcInfo.minOrderValue
      });
    } catch (error) {
      console.log('❌ BTC error:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSUISymbol();
const BingXService = require('./src/services/bingxService');
const { logger } = require('./src/utils/logger');

async function testBTCTrade() {
  try {
    console.log('🚀 Testing BTC Trade Execution...\n');
    
    // Initialize BingX service
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Get account info
    const accountInfo = await bingx.getAccountInfo();
    console.log('💰 Account Balance:', accountInfo.balance, 'USDT');
    
    // Test with a small BTC trade
    const symbol = 'BTC-USDT';
    const side = 'BUY'; // LONG position
    const riskAmount = 1.0; // 1 USDT risk
    
    // Get current BTC price
    const currentPrice = await bingx.getSymbolPrice(symbol);
    console.log('📈 Current BTC Price:', currentPrice.price, 'USDT');
    
    // Calculate very small position (1 USDT worth)
    const quantity = riskAmount / currentPrice.price;
    
    console.log('\\n📊 Trade Details:');
    console.log('  Symbol:', symbol);
    console.log('  Side:', side);
    console.log('  Quantity:', quantity.toFixed(6), 'BTC');
    console.log('  Value:', riskAmount, 'USDT');
    console.log('  Current Price:', currentPrice.price, 'USDT');
    
    // Check if we have enough balance
    if (accountInfo.balance < riskAmount * 2) {
      console.log('❌ Insufficient balance for test trade');
      return;
    }
    
    console.log('\\n⚠️  PLACING REAL ORDER WITH MINIMAL RISK');
    console.log('🔥 This will use', riskAmount, 'USDT from your balance');
    
    // Place the order
    try {
      const orderResult = await bingx.placeOrder({
        symbol: symbol,
        side: side,
        type: 'MARKET',
        quantity: quantity.toFixed(6)
      });
      
      console.log('\\n✅ ORDER EXECUTED SUCCESSFULLY! 🎉');
      console.log('📊 Order Details:');
      console.log('  Order ID:', orderResult.orderId);
      console.log('  Symbol:', orderResult.symbol);
      console.log('  Status:', orderResult.status);
      console.log('  Executed Quantity:', orderResult.executedQty);
      console.log('  Executed Price:', orderResult.executedPrice);
      
      console.log('\\n🎉 CONGRATULATIONS! 🎉');
      console.log('✅ Your trading bot successfully executed a real trade!');
      console.log('📈 You now own', orderResult.executedQty, 'BTC');
      console.log('💰 Check your BingX account to see the position');
      console.log('🎯 The automation system is working perfectly!');
      
    } catch (orderError) {
      console.error('❌ Order failed:', orderError.message);
      
      // Try to get more specific error information
      if (orderError.message.includes('80014')) {
        console.log('\\n💡 API Parameter Error - Possible causes:');
        console.log('  - Minimum order size not met');
        console.log('  - Invalid quantity precision');
        console.log('  - Symbol not available for trading');
        console.log('  - Missing required parameters');
      }
      
      // Test a different approach - try getting symbol info
      try {
        console.log('\\n🔍 Checking symbol information...');
        const symbolInfo = await bingx.getSymbolInfo(symbol);
        console.log('Symbol Info:', symbolInfo);
      } catch (infoError) {
        console.log('❌ Could not get symbol info:', infoError.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

testBTCTrade();
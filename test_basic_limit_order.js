const BingXService = require('./src/services/bingxService');
const { logger } = require('./src/utils/logger');

async function testBasicLimitOrder() {
  try {
    console.log('🧪 Testing Basic LIMIT Order (No reduceOnly)...\n');
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    console.log('💰 Account Balance:', (await bingx.getAccountInfo()).balance, 'USDT\n');
    
    // Test with absolutely minimal parameters
    const testOrder = {
      symbol: 'FARTCOIN-USDT',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1.0,
      price: 0.94,
      recvWindow: 5000,
      clientOrderId: `basic_${Date.now()}`
      // No reduceOnly, no positionSide - just the basics
    };
    
    console.log('📋 Basic LIMIT Order:');
    console.log(JSON.stringify(testOrder, null, 2));
    
    console.log('\n🔍 This should auto-generate positionSide: LONG');
    console.log('🚨 Testing with minimal risk...');
    
    try {
      const result = await bingx.placeOrder(testOrder);
      
      console.log('\n🎉 SUCCESS! Basic LIMIT order works!');
      console.log('✅ Order placed successfully');
      console.log('📊 Order Details:');
      console.log('  Order ID:', result.orderId);
      console.log('  Side:', result.side);
      console.log('  Position Side:', result.positionSide);
      console.log('  Status:', result.status);
      
      // Immediately cancel to avoid opening position
      try {
        await bingx.cancelOrder(result.orderId, testOrder.symbol);
        console.log('🔧 Order canceled immediately');
      } catch (cancelError) {
        console.log('⚠️  Could not cancel:', cancelError.message);
      }
      
    } catch (orderError) {
      console.log('\n❌ Order failed:', orderError.message);
      
      if (orderError.message.includes('Invalid parameters')) {
        console.log('❌ Even basic LIMIT orders are failing');
        console.log('💡 This suggests a fundamental API issue');
        console.log('📚 May need to check BingX API documentation more carefully');
      }
    }
    
    console.log('\n💡 If basic LIMIT orders work but reduceOnly does not work:');
    console.log('We can create regular orders and manually manage position closing');
    console.log('Or switch to using MARKET orders for closing positions');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testBasicLimitOrder();
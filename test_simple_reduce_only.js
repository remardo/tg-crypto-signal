const BingXService = require('./src/services/bingxService');
const { logger } = require('./src/utils/logger');

async function testSimpleReduceOnly() {
  try {
    console.log('🧪 Testing Simple reduceOnly Approach...\n');
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    console.log('💰 Account Balance:', (await bingx.getAccountInfo()).balance, 'USDT\n');
    
    // Test order with just reduceOnly, no positionSide
    const testOrder = {
      symbol: 'FARTCOIN-USDT',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1.0,
      price: 0.94,
      recvWindow: 5000,
      clientOrderId: `simple_${Date.now()}`,
      reduceOnly: true
    };
    
    console.log('📋 Simple Test Order:');
    console.log(JSON.stringify(testOrder, null, 2));
    
    console.log('\n🔍 Order Logic:');
    console.log('- side: BUY (to close SHORT position)');
    console.log('- reduceOnly: true (can only close, not open)');
    console.log('- NO positionSide (let BingX figure it out)');
    
    console.log('\n🚨 Testing with minimal risk...');
    
    try {
      const result = await bingx.placeOrder(testOrder);
      
      console.log('\n🎉 SUCCESS! Simple approach works!');
      console.log('✅ Order placed successfully');
      console.log('📊 Order Details:');
      console.log('  Order ID:', result.orderId);
      console.log('  Side:', result.side);
      console.log('  Status:', result.status);
      
      // Try to cancel immediately
      try {
        await bingx.cancelOrder(result.orderId, testOrder.symbol);
        console.log('🔧 Test order canceled');
      } catch (cancelError) {
        console.log('⚠️  Could not cancel:', cancelError.message);
      }
      
    } catch (orderError) {
      console.log('\n❌ Order failed:', orderError.message);
      
      if (orderError.message.includes('position not exist')) {
        console.log('✅ This is expected - no position to close');
        console.log('✅ But no "Invalid parameters" error = format is correct!');
      } else if (orderError.message.includes('Invalid parameters')) {
        console.log('❌ Still having parameter format issues');
      }
    }
    
    console.log('\n📊 CONCLUSION:');
    console.log('If no "Invalid parameters" error:');
    console.log('✅ The simplified reduceOnly approach is correct');
    console.log('✅ Ready to restart bot and test with new signals');
    console.log('🎯 Next signal should create all 3 take profit orders!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSimpleReduceOnly();
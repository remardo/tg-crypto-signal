const BingXService = require('./src/services/bingxService');

async function testDirectBingXOrder() {
  try {
    console.log('🧪 Testing Direct BingX Order Placement...\n');
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Test account info
    const accountInfo = await bingx.getAccountInfo();
    console.log('💰 Account Balance:', accountInfo.balance, 'USDT\n');
    
    // Test with minimal BTC order
    console.log('📊 Testing BTC-USDT order...');
    
    const orderData = {
      symbol: 'BTC-USDT',
      type: 'MARKET',
      side: 'BUY',
      quantity: 0.0001, // Minimum BTC quantity
      timestamp: Date.now()
    };
    
    console.log('Order parameters:', JSON.stringify(orderData, null, 2));
    
    try {
      const result = await bingx.placeOrder(orderData);
      console.log('✅ SUCCESS! Order placed:', result);
      
      console.log('\n🎉 CONGRATULATIONS! 🎉');
      console.log('✅ Your first automated trade executed successfully!');
      console.log('📊 Order ID:', result.orderId);
      console.log('💰 Executed Price:', result.executedPrice);
      console.log('📈 Position Side:', result.positionSide);
      
    } catch (orderError) {
      console.log('❌ Order failed:', orderError.message);
      
      // Try with additional parameters
      console.log('\n🔄 Trying with additional parameters...');
      
      const enhancedOrderData = {
        symbol: 'BTC-USDT',
        type: 'MARKET',
        side: 'BUY',
        positionSide: 'LONG',
        quantity: '0.0001',
        timestamp: Date.now(),
        recvWindow: 5000
      };
      
      console.log('Enhanced parameters:', JSON.stringify(enhancedOrderData, null, 2));
      
      try {
        const result = await bingx.placeOrder(enhancedOrderData);
        console.log('✅ SUCCESS with enhanced params! Order placed:', result);
        
      } catch (enhancedError) {
        console.log('❌ Enhanced order also failed:', enhancedError.message);
        
        // Try with even simpler parameters
        console.log('\n🔄 Trying ultra-minimal order...');
        
        const minimalOrderData = {
          symbol: 'BTC-USDT',
          side: 'BUY',
          type: 'MARKET',
          quantity: '0.0001'
        };
        
        console.log('Minimal parameters:', JSON.stringify(minimalOrderData, null, 2));
        
        try {
          const result = await bingx.placeOrder(minimalOrderData);
          console.log('✅ SUCCESS with minimal params! Order placed:', result);
          
        } catch (minimalError) {
          console.log('❌ All attempts failed. Last error:', minimalError.message);
          
          // Check if it's an account permission issue
          console.log('\n🔍 Checking account permissions...');
          
          try {
            const positions = await bingx.getPositions();
            console.log('✅ Can read positions:', positions.length, 'positions found');
          } catch (posError) {
            console.log('❌ Cannot read positions:', posError.message);
            console.log('💡 This suggests futures trading permissions are missing');
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Test setup failed:', error.message);
  }
}

testDirectBingXOrder();
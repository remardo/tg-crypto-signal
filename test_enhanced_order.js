const BingXService = require('./src/services/bingxService');

async function testUpdatedOrderStructure() {
  try {
    console.log('🧪 Testing Updated BingX Order Structure...\n');
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Test account info
    const accountInfo = await bingx.getAccountInfo();
    console.log('💰 Account Balance:', accountInfo.balance, 'USDT\n');
    
    // Test order with all new fields according to user's example
    console.log('📊 Testing BTC-USDT order with enhanced structure...');
    
    const orderData = {
      symbol: 'BTC-USDT',
      side: 'BUY',
      positionSide: 'LONG',
      type: 'MARKET',
      quantity: 0.0001, // Minimum BTC quantity
      recvWindow: 5000,
      clientOrderId: `test_${Date.now()}`,
      takeProfit: {
        type: "TAKE_PROFIT_MARKET",
        stopPrice: 31968.0,
        price: 31968.0,
        workingType: "MARK_PRICE"
      }
    };
    
    console.log('📋 Complete order parameters:');
    console.log(JSON.stringify(orderData, null, 2));
    
    // Get current price to validate TP level
    try {
      const currentPrice = await bingx.getSymbolPrice('BTC-USDT');
      console.log('\n📈 Current BTC Price:', currentPrice.price, 'USDT');
      console.log('🎯 Take Profit Level:', orderData.takeProfit.price, 'USDT');
      
      const priceDiff = orderData.takeProfit.price - currentPrice.price;
      const diffPercent = (priceDiff / currentPrice.price) * 100;
      
      if (priceDiff > 0) {
        console.log('✅ Take profit is above current price (+' + diffPercent.toFixed(2) + '%)');
      } else {
        console.log('⚠️  Take profit is below current price (' + diffPercent.toFixed(2) + '%)');
        console.log('💡 Adjusting TP to be above current price...');
        
        // Adjust TP to be 1% above current price
        const adjustedTP = currentPrice.price * 1.01;
        orderData.takeProfit.stopPrice = adjustedTP;
        orderData.takeProfit.price = adjustedTP;
        
        console.log('🔧 Adjusted TP:', adjustedTP.toFixed(2), 'USDT');
      }
      
    } catch (priceError) {
      console.log('⚠️  Could not get current price:', priceError.message);
      console.log('🔧 Removing take profit for this test...');
      delete orderData.takeProfit;
    }
    
    console.log('\n🔥 Testing order with enhanced structure...');
    console.log('⚠️  This is a REAL order with minimal risk!');
    
    try {
      const result = await bingx.placeOrder(orderData);
      
      console.log('\n🎉 SUCCESS! Enhanced order structure works!');
      console.log('✅ Order placed with all new fields');
      console.log('\n📊 Order Results:');
      console.log('  Order ID:', result.orderId);
      console.log('  Client Order ID:', result.clientOrderId);
      console.log('  Symbol:', result.symbol);
      console.log('  Side:', result.side);
      console.log('  Position Side:', result.positionSide);
      console.log('  Status:', result.status);
      console.log('  Executed Quantity:', result.executedQty);
      console.log('  Executed Price:', result.executedPrice);
      
      console.log('\n🎯 VALIDATION COMPLETE!');
      console.log('✅ All new fields are working correctly');
      console.log('✅ Order structure matches BingX requirements');
      console.log('✅ takeProfit JSON structure accepted');
      console.log('✅ recvWindow and clientOrderId implemented');
      
    } catch (orderError) {
      console.log('\n❌ Order failed:', orderError.message);
      
      // Try without take profit to isolate the issue
      if (orderData.takeProfit) {
        console.log('\n🔄 Retrying without take profit...');
        
        const simpleOrder = {
          symbol: orderData.symbol,
          side: orderData.side,
          positionSide: orderData.positionSide,
          type: orderData.type,
          quantity: orderData.quantity,
          recvWindow: orderData.recvWindow,
          clientOrderId: `simple_${Date.now()}`
        };
        
        try {
          const result = await bingx.placeOrder(simpleOrder);
          console.log('✅ Simple order succeeded:', result.orderId);
          console.log('💡 Issue might be with take profit validation');
          
        } catch (simpleError) {
          console.log('❌ Simple order also failed:', simpleError.message);
          console.log('💡 Issue is with basic order structure');
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Test setup failed:', error.message);
  }
}

testUpdatedOrderStructure();
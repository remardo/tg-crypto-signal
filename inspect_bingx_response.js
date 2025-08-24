const BingXService = require('./src/services/bingxService');

async function inspectBingXResponse() {
  try {
    console.log('🔍 Inspecting BingX API Response Structure...\n');
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    console.log('💰 Account Balance:', (await bingx.getAccountInfo()).balance, 'USDT\n');
    
    // Override the placeOrder method temporarily to see the raw response
    const originalPlaceOrder = bingx.placeOrder.bind(bingx);
    bingx.placeOrder = async function(orderData, subAccountId = null) {
      console.log('📤 Sending order with data:', JSON.stringify(orderData, null, 2));
      
      const endpoint = '/openApi/swap/v2/trade/order';
      const positionSide = orderData.side === 'BUY' ? 'LONG' : 'SHORT';
      
      const params = {
        symbol: orderData.symbol,
        side: orderData.side,
        positionSide: positionSide,
        type: orderData.type || 'MARKET',
        quantity: parseFloat(orderData.quantity),
        timestamp: Date.now(),
        recvWindow: orderData.recvWindow || 5000,
        clientOrderId: orderData.clientOrderId
      };
      
      console.log('📋 Final API parameters:', JSON.stringify(params, null, 2));
      
      try {
        const result = await this.makeRequest('POST', endpoint, params);
        
        console.log('📥 Raw BingX Response:');
        console.log('  Type:', typeof result);
        console.log('  Is Array:', Array.isArray(result));
        console.log('  Keys:', Object.keys(result || {}));
        console.log('  Full Response:', JSON.stringify(result, null, 2));
        
        return result;
        
      } catch (error) {
        console.log('❌ API Error:', error.message);
        throw error;
      }
    };
    
    // Test minimal order
    const orderData = {
      symbol: 'BTC-USDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.0001,
      recvWindow: 5000,
      clientOrderId: `inspect_${Date.now()}`
    };
    
    console.log('🔥 Placing test order to inspect response...');
    const result = await bingx.placeOrder(orderData);
    
    console.log('\n📊 Processing complete!');
    
  } catch (error) {
    console.error('❌ Inspection failed:', error.message);
  }
}

inspectBingXResponse();
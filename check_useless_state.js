const BingXService = require('./src/services/bingxService');

async function checkCurrentState() {
  try {
    const bingx = new BingXService();
    await bingx.initialize();
    
    console.log('🔍 Current USELESS Position:');
    const positions = await bingx.getPositions();
    const uselessPos = positions.find(p => 
      p.symbol === 'USELESSUSDT' || 
      p.symbol === 'USELESS-USDT' ||
      p.symbol.includes('USELESS')
    );
    
    if (uselessPos) {
      console.log('  Symbol:', uselessPos.symbol);
      console.log('  Side/Position:', uselessPos.positionSide || uselessPos.side);
      console.log('  Size:', uselessPos.positionAmt || uselessPos.size);
      console.log('  Entry Price:', uselessPos.entryPrice);
      console.log('  Mark Price:', uselessPos.markPrice);
      console.log('  PnL:', uselessPos.unRealizedProfit);
    } else {
      console.log('  No USELESS position found');
      console.log('  Available positions:', positions.map(p => p.symbol));
    }
    
    console.log('\n📋 Current USELESS Orders:');
    // Try different symbol formats
    const symbolFormats = ['USELESSUSDT', 'USELESS-USDT'];
    let allOrders = [];
    
    for (const symbol of symbolFormats) {
      try {
        const orders = await bingx.getOpenOrders(symbol);
        allOrders = allOrders.concat(orders);
      } catch (error) {
        // Symbol format not supported, continue
      }
    }
    
    if (allOrders.length > 0) {
      allOrders.forEach((order, i) => {
        console.log(`  Order ${i+1}:`);
        console.log(`    ID: ${order.orderId}`);
        console.log(`    Symbol: ${order.symbol}`);
        console.log(`    Side: ${order.side}`);
        console.log(`    Position Side: ${order.positionSide}`);
        console.log(`    Type: ${order.type}`);
        console.log(`    Quantity: ${order.origQty}`);
        console.log(`    Price: ${order.price}`);
        console.log(`    Client ID: ${order.clientOrderId}`);
        console.log('');
      });
      
      // Analyze the logic
      console.log('🧐 LOGIC ANALYSIS:');
      const position = uselessPos;
      if (position) {
        console.log(`Current Position: ${position.positionSide || position.side} (${position.positionAmt || position.size})`);
        
        allOrders.forEach((order, i) => {
          console.log(`Order ${i+1} Analysis:`);
          if (order.clientOrderId && order.clientOrderId.includes('tp')) {
            console.log(`  ✅ This is a Take Profit order`);
            console.log(`  📊 TP Side: ${order.side}, Position Side: ${order.positionSide}`);
            
            if (position.positionSide === 'LONG' && order.side === 'SELL' && order.positionSide === 'LONG') {
              console.log(`  ✅ CORRECT: SELL order to close LONG position`);
            } else if (position.positionSide === 'SHORT' && order.side === 'BUY' && order.positionSide === 'SHORT') {
              console.log(`  ✅ CORRECT: BUY order to close SHORT position`);
            } else {
              console.log(`  ❌ INCORRECT: Wrong side or positionSide for this position`);
            }
          } else if (order.clientOrderId && order.clientOrderId.includes('sl')) {
            console.log(`  🛑 This is a Stop Loss order`);
          } else {
            console.log(`  📈 This might be the main entry order`);
          }
        });
      }
    } else {
      console.log('  No open orders found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkCurrentState();
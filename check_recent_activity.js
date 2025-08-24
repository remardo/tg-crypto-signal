const BingXService = require('./src/services/bingxService');
const Signal = require('./src/models/Signal');
const Position = require('./src/models/Position');

async function checkRecentActivity() {
  try {
    const bingx = new BingXService();
    await bingx.initialize();
    
    console.log('📊 All Open Orders:');
    const allOrders = await bingx.getOpenOrders();
    if (allOrders.length > 0) {
      allOrders.forEach((order, i) => {
        console.log(`Order ${i+1}: ${order.symbol} ${order.side} ${order.origQty} at ${order.price}`);
        console.log(`  Client ID: ${order.clientOrderId}`);
        console.log(`  Position Side: ${order.positionSide}`);
        console.log('');
      });
    } else {
      console.log('No open orders');
    }
    
    console.log('\n📋 Recent Signals (last 5):');
    const recentSignals = await Signal.findAll({
      order: [['createdAt', 'DESC']],
      limit: 5
    });
    
    recentSignals.forEach((signal, i) => {
      console.log(`Signal ${i+1}: ${signal.coin} ${signal.direction} at ${signal.entryPrice}`);
      console.log(`  Created: ${signal.createdAt}`);
      console.log(`  Status: ${signal.status || 'unknown'}`);
      console.log('');
    });
    
    console.log('\n📍 Recent Positions (last 3):');
    const recentPositions = await Position.findAll({
      order: [['createdAt', 'DESC']],
      limit: 3
    });
    
    recentPositions.forEach((pos, i) => {
      console.log(`Position ${i+1}: ${pos.symbol} ${pos.side} ${pos.quantity}`);
      console.log(`  Status: ${pos.status}`);
      console.log(`  Created: ${pos.createdAt}`);
      console.log('');
    });
    
    // Check for USELESS specifically
    console.log('\n🔍 USELESS Specific Check:');
    const uselessSignals = await Signal.findAll({
      where: { coin: 'USELESS' },
      order: [['createdAt', 'DESC']],
      limit: 3
    });
    
    if (uselessSignals.length > 0) {
      console.log('Recent USELESS signals:');
      uselessSignals.forEach((signal, i) => {
        console.log(`  ${i+1}. ${signal.direction} at ${signal.entryPrice} (${signal.createdAt})`);
        console.log(`     Take Profits: ${signal.takeProfitLevels ? signal.takeProfitLevels.length : 0} levels`);
      });
    } else {
      console.log('No recent USELESS signals found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

checkRecentActivity();
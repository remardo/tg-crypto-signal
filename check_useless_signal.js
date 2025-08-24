const Signal = require('./src/models/Signal');
const Position = require('./src/models/Position');

async function checkUselessSignalDetails() {
  try {
    console.log('🔍 USELESS Signal Analysis');
    console.log('='.repeat(50));
    
    // Get the most recent USELESS signal
    const signal = await Signal.findOne({
      where: { coin: 'USELESS' },
      order: [['createdAt', 'DESC']]
    });
    
    if (!signal) {
      console.log('No USELESS signal found!');
      return;
    }
    
    console.log('📋 Signal Details:');
    console.log(`ID: ${signal.id}`);
    console.log(`Coin: ${signal.coin}`);
    console.log(`Direction: ${signal.direction}`);
    console.log(`Entry Price: ${signal.entryPrice}`);
    console.log(`Status: ${signal.status}`);
    console.log(`Channel ID: ${signal.channelId}`);
    console.log(`Created: ${signal.createdAt}`);
    console.log(`Original Message: ${signal.originalMessage}`);
    
    console.log('\n📊 Take Profit Levels:');
    if (signal.takeProfitLevels && signal.takeProfitLevels.length > 0) {
      signal.takeProfitLevels.forEach((tp, i) => {
        console.log(`TP ${i+1}: Price ${tp.price}, Percentage ${tp.percentage}%`);
      });
    } else {
      console.log('No take profit levels defined');
    }
    
    // Get the associated position
    const position = await Position.findOne({
      where: { signalId: signal.id }
    });
    
    if (position) {
      console.log('\n📍 Position Details:');
      console.log(`ID: ${position.id}`);
      console.log(`Symbol: ${position.symbol}`);
      console.log(`Side: ${position.side}`);
      console.log(`Quantity: ${position.quantity}`);
      console.log(`Entry Price: ${position.entryPrice}`);
      console.log(`Status: ${position.status}`);
      console.log(`Orders: ${JSON.stringify(position.orders || [])}`);
      
      // Check if side matches direction
      console.log('\n🧐 Direction Analysis:');
      const expectedSide = signal.direction === 'LONG' ? 'BUY' : 'SELL';
      console.log(`Signal Direction: ${signal.direction}`);
      console.log(`Expected Position Side: ${expectedSide}`);
      console.log(`Actual Position Side: ${position.side}`);
      
      if (position.side === expectedSide) {
        console.log('✅ Position side matches signal direction');
      } else {
        console.log('❌ MISMATCH: Position side does not match signal direction!');
      }
    } else {
      console.log('\n❌ No position found for this signal!');
    }
    
  } catch (error) {
    console.error('Error analyzing signal:', error);
  }
}

checkUselessSignalDetails();
const db = require('./src/database/connection');

async function checkUselessSignalDetails() {
  try {
    console.log('🔍 USELESS Signal Analysis');
    console.log('='.repeat(50));
    
    // Get the most recent USELESS signal using raw SQL
    const signalQuery = `
      SELECT * FROM signals 
      WHERE coin = 'USELESS' 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const [signal] = await db.query(signalQuery);
    
    if (!signal) {
      console.log('No USELESS signal found!');
      return;
    }
    
    console.log('📋 Signal Details:');
    console.log(`ID: ${signal.id}`);
    console.log(`Coin: ${signal.coin}`);
    console.log(`Direction: ${signal.direction}`);
    console.log(`Entry Price: ${signal.entry_price}`);
    console.log(`Status: ${signal.status}`);
    console.log(`Channel ID: ${signal.channel_id}`);
    console.log(`Created: ${signal.created_at}`);
    console.log(`Original Message: ${signal.original_message}`);
    
    console.log('\n📊 Take Profit Levels:');
    if (signal.take_profit_levels && signal.take_profit_levels.length > 0) {
      signal.take_profit_levels.forEach((tp, i) => {
        console.log(`TP ${i+1}: Price ${tp.price}, Percentage ${tp.percentage}%`);
      });
    } else {
      console.log('No take profit levels defined');
    }
    
    // Get the associated position
    const positionQuery = `
      SELECT * FROM positions 
      WHERE signal_id = $1
    `;
    const [position] = await db.query(positionQuery, [signal.id]);
    
    if (position) {
      console.log('\n📍 Position Details:');
      console.log(`ID: ${position.id}`);
      console.log(`Symbol: ${position.symbol}`);
      console.log(`Side: ${position.side}`);
      console.log(`Quantity: ${position.quantity}`);
      console.log(`Entry Price: ${position.entry_price}`);
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
  } finally {
    // Close the connection
    process.exit(0);
  }
}

checkUselessSignalDetails();
const { Pool } = require('pg');
const BingXService = require('./src/services/bingxService');
const config = require('./src/config/app');
const { logger } = require('./src/utils/logger');

// Connect to database
const pool = new Pool({
  user: config.db.user,
  host: config.db.host,
  database: config.db.database,
  password: config.db.password,
  port: config.db.port
});

async function analyzeTradingSignals() {
  console.log('🔍 Analyzing Trading Signal Directions and Execution Logic');
  console.log('='.repeat(70));
  
  try {
    // Initialize BingX service for market data
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Get recent signals
    const signalQuery = `
      SELECT s.*, c.name as channel_name 
      FROM signals s
      LEFT JOIN channels c ON s.channel_id = c.id
      WHERE s.created_at > NOW() - INTERVAL '7 days'
      ORDER BY s.created_at DESC
      LIMIT 10
    `;
    
    const { rows: signals } = await pool.query(signalQuery);
    
    // Get associated positions
    const signalIds = signals.map(s => `'${s.id}'`).join(',');
    const positionQuery = `
      SELECT p.*, s.coin, s.direction, s.entry_price as signal_entry_price 
      FROM positions p
      JOIN signals s ON p.signal_id = s.id
      WHERE p.signal_id IN (${signalIds})
    `;
    
    const { rows: positions } = await pool.query(positionQuery);
    
    // Match positions to signals
    const signalMap = new Map();
    signals.forEach(signal => {
      const position = positions.find(p => p.signal_id === signal.id);
      signalMap.set(signal.id, { signal, position });
    });
    
    // Analyze each signal
    console.log(`📊 Found ${signals.length} recent signals to analyze\n`);
    
    let index = 1;
    for (const [signalId, { signal, position }] of signalMap.entries()) {
      console.log(`Signal ${index}: ${signal.coin} ${signal.direction} (${signal.status})`);
      console.log(`Original message: ${signal.original_message}`);
      console.log(`Channel: ${signal.channel_name || 'Unknown'}`);
      
      // Analyze direction logic
      const direction = signal.direction;
      const expectedSide = direction === 'LONG' ? 'BUY' : 'SELL';
      
      console.log(`\nDirection Analysis for ${signal.coin}:`);
      console.log(`🔍 Signal Direction: ${direction}`);
      console.log(`🔍 Expected Order Side: ${expectedSide}`);
      
      // Analyze position if available
      if (position) {
        console.log(`🔍 Position Side: ${position.side}`);
        
        if (position.side === expectedSide) {
          console.log(`✅ Position side MATCHES expected side for ${direction}`);
        } else {
          console.log(`❌ MISMATCH: Position side ${position.side} does not match expected ${expectedSide} for ${direction}`);
        }
      } else {
        console.log(`⚠️  No position found for this signal`);
      }
      
      // Market context check
      try {
        const price = await bingx.getSymbolPrice(signal.coin + '-USDT');
        const signalEntryPrice = parseFloat(signal.entry_price);
        const currentPrice = parseFloat(price.price);
        
        console.log(`\nMarket Context Check:`);
        console.log(`📈 Signal Entry Price: ${signalEntryPrice}`);
        console.log(`📈 Current Market Price: ${currentPrice}`);
        
        // For LONG: entry < current = good entry point
        // For SHORT: entry > current = good entry point
        if (direction === 'LONG' && signalEntryPrice < currentPrice) {
          console.log(`✅ LONG signal at ${signalEntryPrice} makes sense (current: ${currentPrice})`);
        } else if (direction === 'SHORT' && signalEntryPrice > currentPrice) {
          console.log(`✅ SHORT signal at ${signalEntryPrice} makes sense (current: ${currentPrice})`);
        } else if (direction === 'LONG') {
          console.log(`⚠️  LONG signal at ${signalEntryPrice} is ABOVE current price ${currentPrice}`);
          console.log(`   This LONG signal might have been recognized incorrectly`);
        } else if (direction === 'SHORT') {
          console.log(`⚠️  SHORT signal at ${signalEntryPrice} is BELOW current price ${currentPrice}`);
          console.log(`   This SHORT signal might have been recognized incorrectly`);
        }
      } catch (error) {
        console.log(`⚠️  Could not get current price: ${error.message}`);
      }
      
      // Take profit analysis
      console.log(`\nTake Profit Analysis:`);
      let takeProfits = [];
      try {
        takeProfits = signal.take_profit_levels || [];
        if (takeProfits.length > 0) {
          console.log(`📊 Found ${takeProfits.length} take profit levels`);
          
          takeProfits.forEach((tp, i) => {
            const tpPrice = parseFloat(tp.price);
            console.log(`   TP${i+1}: ${tpPrice}`);
            
            // LONG: TP should be higher than entry
            // SHORT: TP should be lower than entry
            if (direction === 'LONG' && tpPrice > signalEntryPrice) {
              console.log(`   ✅ TP${i+1} is ABOVE entry price - correct for LONG`);
            } else if (direction === 'SHORT' && tpPrice < signalEntryPrice) {
              console.log(`   ✅ TP${i+1} is BELOW entry price - correct for SHORT`);
            } else if (direction === 'LONG') {
              console.log(`   ❌ TP${i+1} is BELOW entry price - INCORRECT for LONG`);
              console.log(`      This suggests signal direction may be wrong - should be SHORT`);
            } else if (direction === 'SHORT') {
              console.log(`   ❌ TP${i+1} is ABOVE entry price - INCORRECT for SHORT`);
              console.log(`      This suggests signal direction may be wrong - should be LONG`);
            }
          });
        } else {
          console.log(`⚠️  No take profit levels found`);
        }
      } catch (error) {
        console.log(`⚠️  Error analyzing take profits: ${error.message}`);
      }
      
      // Stop loss analysis
      console.log(`\nStop Loss Analysis:`);
      try {
        const stopLoss = parseFloat(signal.stop_loss);
        if (stopLoss) {
          console.log(`🛑 Stop Loss: ${stopLoss}`);
          
          // LONG: SL should be lower than entry
          // SHORT: SL should be higher than entry
          if (direction === 'LONG' && stopLoss < signalEntryPrice) {
            console.log(`✅ Stop Loss is BELOW entry price - correct for LONG`);
          } else if (direction === 'SHORT' && stopLoss > signalEntryPrice) {
            console.log(`✅ Stop Loss is ABOVE entry price - correct for SHORT`);
          } else if (direction === 'LONG') {
            console.log(`❌ Stop Loss is ABOVE entry price - INCORRECT for LONG`);
            console.log(`   This suggests signal direction may be wrong - should be SHORT`);
          } else if (direction === 'SHORT') {
            console.log(`❌ Stop Loss is BELOW entry price - INCORRECT for SHORT`);
            console.log(`   This suggests signal direction may be wrong - should be LONG`);
          }
        } else {
          console.log(`⚠️  No stop loss found`);
        }
      } catch (error) {
        console.log(`⚠️  Error analyzing stop loss: ${error.message}`);
      }
      
      // Calculate likely correct direction based on TP and SL
      console.log(`\n🎯 Direction Validation Summary:`);
      let tpDirectionCount = { LONG: 0, SHORT: 0 };
      let slDirection = null;
      
      // Check TPs
      takeProfits.forEach(tp => {
        const tpPrice = parseFloat(tp.price);
        if (tpPrice > signalEntryPrice) {
          tpDirectionCount.LONG++;
        } else if (tpPrice < signalEntryPrice) {
          tpDirectionCount.SHORT++;
        }
      });
      
      // Check SL
      if (signal.stop_loss) {
        const stopLoss = parseFloat(signal.stop_loss);
        if (stopLoss < signalEntryPrice) {
          slDirection = 'LONG';
        } else if (stopLoss > signalEntryPrice) {
          slDirection = 'SHORT';
        }
      }
      
      // Determine likely correct direction
      let likelyDirection = null;
      let directionConfidence = 'Low';
      
      // More TP points supporting one direction
      if (tpDirectionCount.LONG > tpDirectionCount.SHORT) {
        likelyDirection = 'LONG';
        directionConfidence = 'Medium';
      } else if (tpDirectionCount.SHORT > tpDirectionCount.LONG) {
        likelyDirection = 'SHORT';
        directionConfidence = 'Medium';
      }
      
      // SL confirms the direction
      if (likelyDirection && slDirection === likelyDirection) {
        directionConfidence = 'High';
      }
      
      // SL contradicts TPs - use SL as tie-breaker
      if (likelyDirection === null && slDirection) {
        likelyDirection = slDirection;
        directionConfidence = 'Low';
      }
      
      // Show results
      if (likelyDirection) {
        console.log(`Likely correct direction: ${likelyDirection} (${directionConfidence} confidence)`);
        if (likelyDirection !== direction) {
          console.log(`❌ DIRECTION ERROR: Signal was recognized as ${direction} but should likely be ${likelyDirection}`);
          console.log(`🔧 SUGGESTED ACTION: Correct the direction recognition for ${signal.coin} signals`);
        } else {
          console.log(`✅ Direction ${direction} is consistent with TP/SL levels`);
        }
      } else {
        console.log(`⚠️  Could not determine likely direction - insufficient data`);
      }
      
      console.log('\n' + '='.repeat(70));
      index++;
    }
    
    console.log('\n🧐 CONCLUSION:');
    console.log('The take profit and stop loss levels must be consistent with the signal direction:');
    console.log('- LONG positions: Take Profits should be ABOVE entry, Stop Loss should be BELOW entry');
    console.log('- SHORT positions: Take Profits should be BELOW entry, Stop Loss should be ABOVE entry');
    console.log('\nIf these are inconsistent, the signal direction may be incorrectly recognized.');
    
  } catch (error) {
    console.error('Error analyzing signals:', error);
  } finally {
    await pool.end();
  }
}

analyzeTradingSignals();
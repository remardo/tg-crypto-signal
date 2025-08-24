const Signal = require('./src/models/Signal');
const Position = require('./src/models/Position');
const Channel = require('./src/models/Channel');
const { logger } = require('./src/utils/logger');

async function checkSignalExecution() {
  try {
    console.log('🔍 Checking Latest Signal Execution Status...\n');
    
    // Get the most recent signals (last 10)
    const recentSignals = await Signal.findAll({ 
      limit: 10 
    });
    
    if (recentSignals.length === 0) {
      console.log('❌ No signals found in database');
      return;
    }
    
    console.log(`📊 Found ${recentSignals.length} recent signals:\n`);
    
    // Display all recent signals with their status
    for (let i = 0; i < recentSignals.length; i++) {
      const signal = recentSignals[i];
      const riskReward = signal.calculateRiskReward();
      
      console.log(`${i + 1}. Signal ID: ${signal.id}`);
      console.log(`   📅 Processed: ${signal.processedAt || 'Not processed'}`);
      console.log(`   🪙 Coin: ${signal.coin} ${signal.direction}`);
      console.log(`   💰 Entry: ${signal.entryPrice}`);
      console.log(`   🛑 Stop Loss: ${signal.stopLoss}`);
      console.log(`   🎯 Take Profits: ${signal.takeProfitLevels?.join(', ') || 'None'}`);
      console.log(`   📈 Leverage: ${signal.leverage || 1}x`);
      console.log(`   🏷️  Status: ${signal.status?.toUpperCase() || 'UNKNOWN'}`);
      console.log(`   📊 Type: ${signal.signalType || 'unknown'}`);
      
      if (riskReward) {
        console.log(`   ⚖️  Risk/Reward: ${riskReward.ratio.toFixed(2)} (${riskReward.risk.toFixed(4)} / ${riskReward.reward.toFixed(4)})`);
      }
      
      // Check if signal has been executed and has a position
      if (signal.status === 'executed') {
        console.log('   ✅ EXECUTED - Checking position...');
        
        try {
          const position = await signal.getPosition();
          if (position) {
            console.log(`   💼 Position ID: ${position.position_id || position.id}`);
            console.log(`   📊 Symbol: ${position.symbol}`);
            console.log(`   📏 Quantity: ${position.quantity}`);
            console.log(`   💵 Entry Price: ${position.entry_price}`);
            console.log(`   📈 Current Status: ${position.status}`);
            console.log(`   📅 Opened: ${position.opened_at}`);
            
            if (position.unrealized_pnl) {
              const pnl = parseFloat(position.unrealized_pnl);
              const pnlSign = pnl >= 0 ? '📈' : '📉';
              console.log(`   ${pnlSign} Unrealized PnL: ${pnl.toFixed(2)} USDT`);
            }
          } else {
            console.log('   ⚠️  No position found for executed signal');
          }
        } catch (posError) {
          console.log(`   ❌ Error checking position: ${posError.message}`);
        }
      } else if (signal.status === 'pending') {
        console.log('   ⏳ PENDING - Waiting for execution');
      } else if (signal.status === 'failed') {
        console.log('   ❌ FAILED - Execution failed');
      } else if (signal.status === 'ignored') {
        console.log('   🚫 IGNORED - Signal was ignored');
      } else if (signal.status === 'approved') {
        console.log('   ✅ APPROVED - Ready for execution');
      }
      
      console.log(''); // Empty line for spacing
    }
    
    // Focus on the latest signal
    const latestSignal = recentSignals[0];
    console.log('🎯 LATEST SIGNAL ANALYSIS:');
    console.log('=' .repeat(50));
    console.log(`📧 Signal ID: ${latestSignal.id}`);
    console.log(`🪙 Asset: ${latestSignal.coin} ${latestSignal.direction}`);
    console.log(`📅 Received: ${latestSignal.messageTimestamp || 'Unknown'}`);
    console.log(`⚡ Processed: ${latestSignal.processedAt || 'Not processed'}`);
    console.log(`🏷️  Current Status: ${latestSignal.status?.toUpperCase() || 'UNKNOWN'}`);
    
    // Get channel info
    try {
      const channel = await Channel.findById(latestSignal.channelId);
      if (channel) {
        console.log(`📺 Channel: ${channel.name}`);
        console.log(`⚙️  Channel Active: ${channel.isActive ? 'YES' : 'NO'}`);
        console.log(`⏸️  Channel Paused: ${channel.isPaused ? 'YES' : 'NO'}`);
        console.log(`📊 Risk %: ${channel.riskPercentage}%`);
      }
    } catch (channelError) {
      console.log(`⚠️  Could not load channel info: ${channelError.message}`);
    }
    
    // Provide execution status summary
    console.log('\n📈 EXECUTION STATUS SUMMARY:');
    console.log('=' .repeat(40));
    
    const statusCounts = recentSignals.reduce((acc, signal) => {
      const status = signal.status || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    
    Object.entries(statusCounts).forEach(([status, count]) => {
      const emoji = {
        'executed': '✅',
        'pending': '⏳',
        'failed': '❌',
        'ignored': '🚫',
        'approved': '✅',
        'unknown': '❓'
      };
      console.log(`${emoji[status] || '📊'} ${status.toUpperCase()}: ${count} signals`);
    });
    
    // Check if latest signal needs attention
    if (latestSignal.status === 'pending') {
      console.log('\n💡 RECOMMENDATION:');
      console.log('The latest signal is PENDING. It may be waiting for:');
      console.log('  - Risk management validation');
      console.log('  - Manual approval');
      console.log('  - Queue processing');
      console.log('  - Channel activation');
    } else if (latestSignal.status === 'failed') {
      console.log('\n💡 RECOMMENDATION:');
      console.log('The latest signal FAILED execution. Check:');
      console.log('  - BingX API connection');
      console.log('  - Account balance');
      console.log('  - Symbol availability');
      console.log('  - Risk management settings');
    } else if (latestSignal.status === 'executed') {
      console.log('\n🎉 GREAT! The latest signal was successfully executed!');
      console.log('Monitor the position in your dashboard.');
    }
    
  } catch (error) {
    console.error('❌ Error checking signal execution:', error.message);
    console.error('Full error:', error);
  }
}

checkSignalExecution();
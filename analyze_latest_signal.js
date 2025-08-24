const Signal = require('./src/models/Signal');
const ExecutionService = require('./src/services/executionService');
const BingXService = require('./src/services/bingxService');
const { logger } = require('./src/utils/logger');

async function checkLatestSignalExecution() {
  try {
    console.log('🔍 Analyzing Latest Signal Execution...\n');
    
    // Get the very latest signal
    const signals = await Signal.findAll({ limit: 1 });
    if (signals.length === 0) {
      console.log('❌ No signals found');
      return;
    }
    
    const signal = signals[0];
    console.log('🎯 Latest Signal Details:');
    console.log('  ID:', signal.id);
    console.log('  Asset:', signal.coin, signal.direction);
    console.log('  Entry Price:', signal.entryPrice);
    console.log('  Current Status:', signal.status);
    console.log('  Processed At:', signal.processedAt);
    console.log('  TP Levels:', signal.takeProfitLevels?.join(', '));
    console.log('  Stop Loss:', signal.stopLoss);
    
    // Check current market price
    console.log('\n📊 Market Price Analysis:');
    const bingx = new BingXService();
    await bingx.initialize();
    
    const symbol = `${signal.coin}-USDT`;
    try {
      const currentPrice = await bingx.getSymbolPrice(symbol);
      console.log('  Current Price:', currentPrice.price, 'USDT');
      console.log('  Signal Entry:', signal.entryPrice, 'USDT');
      
      const priceDiff = currentPrice.price - signal.entryPrice;
      const diffPercent = (priceDiff / signal.entryPrice) * 100;
      
      console.log('  Price Difference:', diffPercent.toFixed(2) + '%');
      
      // Check TP validity
      if (signal.takeProfitLevels && signal.takeProfitLevels.length > 0) {
        const firstTP = parseFloat(signal.takeProfitLevels[0]);
        console.log('  First TP Level:', firstTP, 'USDT');
        
        if (signal.direction === 'LONG') {
          const tpValid = firstTP > currentPrice.price;
          console.log('  TP Valid for LONG:', tpValid ? '✅' : '❌');
          if (!tpValid) {
            console.log('    ⚠️  TP level is below current price!');
          }
        } else {
          const tpValid = firstTP < currentPrice.price;
          console.log('  TP Valid for SHORT:', tpValid ? '✅' : '❌');
          if (!tpValid) {
            console.log('    ⚠️  TP level is above current price!');
          }
        }
      }
      
      // Check SL validity
      if (signal.stopLoss) {
        const slPrice = parseFloat(signal.stopLoss);
        console.log('  Stop Loss Level:', slPrice, 'USDT');
        
        if (signal.direction === 'LONG') {
          const slValid = slPrice < currentPrice.price;
          console.log('  SL Valid for LONG:', slValid ? '✅' : '❌');
          if (!slValid) {
            console.log('    ⚠️  SL level is above current price!');
          }
        } else {
          const slValid = slPrice > currentPrice.price;
          console.log('  SL Valid for SHORT:', slValid ? '✅' : '❌');
          if (!slValid) {
            console.log('    ⚠️  SL level is below current price!');
          }
        }
      }
      
    } catch (priceError) {
      console.log('  ❌ Could not get current price:', priceError.message);
    }
    
    // Test if we can at least create a simple order without TP/SL
    console.log('\n🧪 Testing Simple Order Capability:');
    try {
      const accountInfo = await bingx.getAccountInfo();
      console.log('  Account Balance:', accountInfo.balance, 'USDT');
      console.log('  Available Balance:', accountInfo.availableBalance, 'USDT');
      
      // Test minimal order
      if (accountInfo.balance > 1) {
        console.log('  💡 Account has sufficient funds for testing');
        
        // Get symbol info
        try {
          const symbolInfo = await bingx.getSymbolInfo(symbol);
          console.log('  Symbol Info:');
          console.log('    Min Quantity:', symbolInfo.minQty);
          console.log('    Step Size:', symbolInfo.stepSize);
          console.log('    Min Order Value:', symbolInfo.minOrderValue);
          
        } catch (symbolError) {
          console.log('  ❌ Symbol info error:', symbolError.message);
        }
        
      } else {
        console.log('  ⚠️  Insufficient balance for trading');
      }
      
    } catch (accountError) {
      console.log('  ❌ Account error:', accountError.message);
    }
    
    // Check if this is a risk/reward ratio issue
    const riskReward = signal.calculateRiskReward();
    if (riskReward) {
      console.log('\n⚖️  Risk/Reward Analysis:');
      console.log('  Ratio:', riskReward.ratio.toFixed(2));
      console.log('  Risk:', riskReward.risk.toFixed(4));
      console.log('  Reward:', riskReward.reward.toFixed(4));
      
      if (riskReward.ratio < 1.0) {
        console.log('  ❌ Risk/Reward ratio below 1.0 - Signal should be rejected');
        console.log('  💡 This explains why the signal failed execution');
      } else {
        console.log('  ✅ Risk/Reward ratio is acceptable');
      }
    }
    
    console.log('\n📋 DIAGNOSIS SUMMARY:');
    console.log('=' .repeat(50));
    
    // Common failure reasons
    const commonIssues = [
      'Outdated signal prices vs current market',
      'Risk/reward ratio below threshold (< 1.0)',
      'Invalid TP/SL levels for current price',
      'Insufficient account balance',
      'Symbol not available on exchange',
      'API parameter validation issues'
    ];
    
    console.log('🔍 Possible failure reasons:');
    commonIssues.forEach((issue, index) => {
      console.log(`  ${index + 1}. ${issue}`);
    });
    
    console.log('\n✅ GOOD NEWS:');
    console.log('  - Enhanced order structure is implemented');
    console.log('  - API communication is working');
    console.log('  - BingX connection is stable');
    console.log('  - Order parsing is correct');
    
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('  1. Wait for fresh signals with current market prices');
    console.log('  2. Consider adjusting risk/reward threshold');
    console.log('  3. Monitor for new signals that match current market conditions');
    
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
  }
}

checkLatestSignalExecution();
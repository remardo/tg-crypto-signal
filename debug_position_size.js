const Signal = require('./src/models/Signal');
const Channel = require('./src/models/Channel');
const BingXService = require('./src/services/bingxService');
const config = require('./src/config/app');
const Decimal = require('decimal.js');

async function debugPositionSize() {
  try {
    console.log('🔍 Debugging Position Size Calculation...\n');
    
    // Get the pending BTC signal
    const pendingSignals = await Signal.findAll({ 
      status: 'pending',
      coin: 'BTC',
      limit: 1 
    });
    
    if (pendingSignals.length === 0) {
      console.log('❌ No pending BTC signals found');
      return;
    }
    
    const signal = pendingSignals[0];
    console.log('📊 Signal Details:');
    console.log('  Coin:', signal.coin, signal.direction);
    console.log('  Entry Price:', signal.entryPrice);
    console.log('  Stop Loss:', signal.stopLoss);
    console.log('  Leverage:', signal.leverage);
    console.log('');
    
    // Get channel info
    const channel = await Channel.findById(signal.channelId);
    console.log('⚙️  Channel Settings:');
    console.log('  Risk %:', channel.riskPercentage);
    console.log('  Max Position %:', channel.maxPositionPercentage);
    console.log('');
    
    // Get account balance
    const bingx = new BingXService();
    await bingx.initialize();
    const accountInfo = await bingx.getAccountInfo();
    console.log('💰 Account Info:');
    console.log('  Available Balance:', accountInfo.availableBalance, 'USDT');
    console.log('');
    
    // Calculate position size step by step
    console.log('📏 Position Size Calculation:');
    
    const riskPercentage = channel.riskPercentage || config.trading.defaultRiskPercentage;
    const maxPositionPercentage = channel.maxPositionPercentage || config.trading.maxPositionPercentage;
    
    console.log('  Risk %:', riskPercentage + '%');
    console.log('  Max Position %:', maxPositionPercentage + '%');
    
    // Calculate risk amount
    const riskAmount = new Decimal(accountInfo.availableBalance)
      .times(riskPercentage)
      .dividedBy(100);
    
    console.log('  Risk Amount:', riskAmount.toFixed(6), 'USDT');
    
    // Calculate price risk
    const entryPrice = new Decimal(signal.entryPrice);
    const stopLoss = new Decimal(signal.stopLoss);
    const priceRisk = entryPrice.minus(stopLoss).abs();
    
    console.log('  Entry Price:', entryPrice.toFixed(2), 'USDT');
    console.log('  Stop Loss:', stopLoss.toFixed(2), 'USDT');
    console.log('  Price Risk:', priceRisk.toFixed(2), 'USDT per BTC');
    
    if (priceRisk.equals(0)) {
      console.log('❌ Price risk is zero - this will cause division by zero');
      return;
    }
    
    // Calculate base quantity
    const baseQuantity = riskAmount.dividedBy(priceRisk);
    console.log('  Base Quantity:', baseQuantity.toFixed(8), 'BTC');
    
    // Apply leverage
    const leverage = new Decimal(signal.leverage || 1);
    const leveragedQuantity = baseQuantity.times(leverage);
    console.log('  Leveraged Quantity (x' + leverage + '):', leveragedQuantity.toFixed(8), 'BTC');
    
    // Apply maximum position size limit
    const maxPositionValue = new Decimal(accountInfo.availableBalance)
      .times(maxPositionPercentage)
      .dividedBy(100);
    
    const maxQuantity = maxPositionValue.dividedBy(entryPrice);
    console.log('  Max Position Value:', maxPositionValue.toFixed(2), 'USDT');
    console.log('  Max Quantity:', maxQuantity.toFixed(8), 'BTC');
    
    // Final quantity
    const finalQuantity = Decimal.min(leveragedQuantity, maxQuantity);
    console.log('  Final Quantity:', finalQuantity.toFixed(8), 'BTC');
    
    // Check minimum order size
    console.log('\\n🔍 BingX Order Requirements:');
    
    try {
      const symbolInfo = await bingx.getSymbolInfo('BTC-USDT');
      console.log('  Min Quantity:', symbolInfo.minQty, 'BTC');
      console.log('  Max Quantity:', symbolInfo.maxQty, 'BTC');
      console.log('  Step Size:', symbolInfo.stepSize, 'BTC');
      
      // Check if our quantity meets requirements
      if (finalQuantity.toNumber() < symbolInfo.minQty) {
        console.log('\\n❌ PROBLEM FOUND!');
        console.log('  Our quantity:', finalQuantity.toFixed(8), 'BTC');
        console.log('  Required minimum:', symbolInfo.minQty, 'BTC');
        console.log('  Difference:', (symbolInfo.minQty - finalQuantity.toNumber()).toFixed(8), 'BTC');
        
        console.log('\\n💡 SOLUTIONS:');
        console.log('1. Increase risk percentage from', riskPercentage + '% to higher value');
        console.log('2. Use a signal with smaller price risk (closer stop loss)');
        console.log('3. Add more funds to the account');
        
        // Calculate required balance for minimum order
        const minOrderValue = new Decimal(symbolInfo.minQty).times(entryPrice);
        const requiredRisk = minOrderValue.dividedBy(leverage);
        const requiredBalance = requiredRisk.times(100).dividedBy(riskPercentage);
        
        console.log('\\n📊 For minimum order size:');
        console.log('  Min Order Value:', minOrderValue.toFixed(2), 'USDT');
        console.log('  Required Risk:', requiredRisk.toFixed(2), 'USDT');
        console.log('  Required Balance:', requiredBalance.toFixed(2), 'USDT');
        console.log('  Current Balance:', accountInfo.availableBalance, 'USDT');
        
      } else {
        console.log('\\n✅ Quantity meets minimum requirements');
      }
      
    } catch (symbolError) {
      console.log('❌ Could not get symbol info:', symbolError.message);
    }
    
    // Calculate position value
    const positionValue = finalQuantity.times(entryPrice);
    console.log('\\n💵 Position Value:', positionValue.toFixed(2), 'USDT');
    console.log('💰 Required Margin (no leverage):', positionValue.toFixed(2), 'USDT');
    console.log('💰 Required Margin (with leverage):', positionValue.dividedBy(leverage).toFixed(2), 'USDT');
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Full error:', error);
  }
}

debugPositionSize();
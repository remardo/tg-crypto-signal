const BingXService = require('./src/services/bingxService');
const Signal = require('./src/models/Signal');
const Position = require('./src/models/Position');
const Channel = require('./src/models/Channel');
const { logger } = require('./src/utils/logger');

async function executeUNISignalDirectly() {
  try {
    console.log('🚀 Direct UNI Signal Execution...\n');
    
    // Initialize BingX service
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Get account info
    const accountInfo = await bingx.getAccountInfo();
    console.log('💰 Account Balance:', accountInfo.balance, 'USDT');
    
    // Get the UNI signal
    const signals = await Signal.findAll({ limit: 5 });
    const uniSignal = signals.find(s => s.coin === 'UNI' && s.direction === 'SHORT');
    
    if (!uniSignal) {
      console.log('❌ UNI SHORT signal not found');
      return;
    }
    
    console.log('📊 UNI Signal Details:');
    console.log('  Coin:', uniSignal.coin, uniSignal.direction);
    console.log('  Entry:', uniSignal.entryPrice);
    console.log('  Stop Loss:', uniSignal.stopLoss);
    console.log('  Take Profits:', uniSignal.takeProfitLevels);
    console.log('  Leverage:', uniSignal.leverage + 'x');
    
    // Get channel for risk settings
    const channels = await Channel.findAll();
    const channel = channels[0];
    
    // Calculate position size with 2% risk
    const riskPercentage = 2; // 2% risk
    const riskAmount = accountInfo.balance * (riskPercentage / 100);
    const entryPrice = parseFloat(uniSignal.entryPrice);
    const stopLoss = parseFloat(uniSignal.stopLoss);
    
    // For SHORT: risk = stopLoss - entryPrice
    const riskPerToken = Math.abs(stopLoss - entryPrice);
    const baseQuantity = riskAmount / riskPerToken;
    
    console.log('\\n📏 Position Calculation:');
    console.log('  Risk Amount:', riskAmount.toFixed(2), 'USDT');
    console.log('  Risk per UNI:', riskPerToken.toFixed(6), 'USDT');
    console.log('  Base Quantity:', baseQuantity.toFixed(6), 'UNI');
    
    // Check minimum trade size
    const positionValueUSDT = baseQuantity * entryPrice;
    console.log('  Position Value:', positionValueUSDT.toFixed(2), 'USDT');
    
    if (positionValueUSDT < 10) {
      console.log('❌ Position value below minimum trade size (10 USDT)');
      return;
    }
    
    // Prepare order
    const symbol = 'UNI-USDT';
    const side = 'SELL'; // SHORT = SELL
    
    console.log('\\n🎯 Order Preparation:');
    console.log('  Symbol:', symbol);
    console.log('  Side:', side);
    console.log('  Quantity:', baseQuantity.toFixed(6), 'UNI');
    console.log('  Type: MARKET');
    console.log('  Leverage: Using default (no leverage setting)');
    
    // Get current price
    try {
      const currentPrice = await bingx.getSymbolPrice(symbol);
      console.log('  Current Price:', currentPrice.price, 'USDT');
      console.log('  Target Entry:', entryPrice, 'USDT');
      
      const priceDiff = Math.abs(currentPrice.price - entryPrice);
      const priceDiffPercent = (priceDiff / entryPrice) * 100;
      console.log('  Price Difference:', priceDiffPercent.toFixed(2) + '%');
      
    } catch (priceError) {
      console.log('⚠️  Could not get current price:', priceError.message);
    }
    
    console.log('\\n🔥 EXECUTING REAL TRADE ON BINGX! 🔥');
    console.log('💰 Using real funds from your 49.5 USDT balance');
    console.log('⚠️  This is NOT a simulation!');
    
    // Execute the trade
    try {
      console.log('\\n📤 Placing market order...');
      
      const orderResult = await bingx.placeOrder({
        symbol: symbol,
        side: side,
        type: 'MARKET',
        quantity: baseQuantity.toFixed(6)
      });
      
      console.log('✅ Order placed successfully!');
      console.log('📊 Order Details:');
      console.log('  Order ID:', orderResult.orderId);
      console.log('  Symbol:', orderResult.symbol);
      console.log('  Side:', orderResult.side);
      console.log('  Quantity:', orderResult.quantity);
      console.log('  Executed Price:', orderResult.executedPrice || 'Market');
      console.log('  Status:', orderResult.status);
      
      // Create position record
      console.log('\\n💾 Creating position record...');
      const positionData = {
        signalId: uniSignal.id,
        channelId: uniSignal.channelId,
        symbol: symbol,
        side: side,
        quantity: baseQuantity,
        entryPrice: orderResult.executedPrice || entryPrice,
        leverage: 1, // No leverage used
        takeProfitLevels: uniSignal.takeProfitLevels,
        stopLoss: uniSignal.stopLoss,
        status: 'open',
        orderId: orderResult.orderId
      };
      
      const position = await Position.create(positionData);
      console.log('✅ Position created with ID:', position.id);
      
      // Update signal status
      await uniSignal.update({ status: 'executed' });
      console.log('✅ Signal marked as executed');
      
      console.log('\\n🎉 TRADE EXECUTED SUCCESSFULLY! 🎉');
      console.log('📈 Your UNI SHORT position is now live');
      console.log('🎯 Take Profits will trigger at:', uniSignal.takeProfitLevels.join(', '));
      console.log('🛑 Stop Loss set at:', uniSignal.stopLoss);
      console.log('💼 Monitor your position in the dashboard');
      
    } catch (orderError) {
      console.error('❌ Order execution failed:', orderError.message);
      console.log('💡 This could be due to:');
      console.log('  - Insufficient balance for the calculated position size');
      console.log('  - UNI not available for futures trading on BingX');
      console.log('  - Market conditions or exchange maintenance');
      console.log('\\n🔧 Suggested fixes:');
      console.log('  - Try a smaller position size (lower risk %)');
      console.log('  - Use a major coin like BTC or ETH');
      console.log('  - Check BingX exchange status');
    }
    
  } catch (error) {
    console.error('❌ Execution error:', error.message);
    console.error('Full error:', error);
  }
}

executeUNISignalDirectly();
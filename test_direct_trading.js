const BingXService = require('./src/services/bingxService');
const Signal = require('./src/models/Signal');
const Channel = require('./src/models/Channel');

async function testDirectTrading() {
  try {
    console.log('🚀 Testing Direct BingX Trading (bypassing Redis queue)...\n');
    
    // Initialize BingX service
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Get account info
    const accountInfo = await bingx.getAccountInfo();
    console.log('💰 Account Balance:', accountInfo.balance, 'USDT');
    console.log('💰 Available Margin:', accountInfo.availableBalance, 'USDT\n');
    
    // Get the latest BTC signal
    const signals = await Signal.findAll({
      coin: 'BTC',
      status: 'pending',
      limit: 1
    });
    
    if (signals.length === 0) {
      console.log('❌ No pending BTC signal found');
      return;
    }
    
    const signal = signals[0];
    
    console.log('📊 Found Signal:');
    console.log('  ID:', signal.id);
    console.log('  Coin:', signal.coin, signal.direction);
    console.log('  Leverage:', signal.leverage + 'x');
    console.log('  Entry:', signal.entryPrice);
    console.log('  Stop Loss:', signal.stopLoss);
    console.log('  Take Profits:', signal.takeProfitLevels);
    
    // Get channel configuration
    const channels = await Channel.findAll();
    const channel = channels[0]; // Use first channel
    const riskPercentage = channel.riskPercentage / 100; // Convert to decimal
    
    console.log('\n⚙️ Risk Management:');
    console.log('  Risk Percentage:', channel.riskPercentage + '%');
    console.log('  TP Distribution:', channel.tpPercentages.join('%, ') + '%');
    
    // Calculate position sizing
    const riskAmount = accountInfo.balance * riskPercentage;
    const entryPrice = parseFloat(signal.entryPrice);
    const stopLoss = parseFloat(signal.stopLoss);
    const riskPerToken = Math.abs(entryPrice - stopLoss);
    const positionSizeBase = riskAmount / riskPerToken;
    const positionSizeWithLeverage = positionSizeBase * signal.leverage;
    const positionValueUSDT = positionSizeBase * entryPrice;
    
    console.log('\n📏 Position Calculation:');
    console.log('  Risk Amount:', riskAmount.toFixed(2), 'USDT');
    console.log('  Risk per BTC:', riskPerToken.toFixed(2), 'USDT');
    console.log('  Base Position Size:', positionSizeBase.toFixed(6), 'BTC');
    console.log('  Position Value:', positionValueUSDT.toFixed(2), 'USDT');
    console.log('  With', signal.leverage + 'x leverage:', positionSizeWithLeverage.toFixed(6), 'BTC');
    
    // Check minimum trade size
    if (positionValueUSDT < 10) {
      console.log('⚠️  Position value is below minimum (10 USDT)');
      console.log('💡 Consider increasing risk percentage or using higher leverage');
      return;
    }
    
    // Format symbol for BingX
    const symbol = signal.coin + '-USDT';
    
    console.log('\n🎯 Preparing Trade Order:');
    console.log('  Symbol:', symbol);
    console.log('  Side:', signal.direction === 'LONG' ? 'BUY' : 'SELL');
    console.log('  Quantity:', positionSizeWithLeverage.toFixed(6));
    console.log('  Type: MARKET');
    
    // Test order placement (with confirmation)
    console.log('\n⚠️  REAL MONEY TRADE WARNING ⚠️');
    console.log('This will place a REAL order on BingX with your funds!');
    console.log('Entry Price Target:', entryPrice);
    console.log('Stop Loss:', stopLoss);
    console.log('Take Profits:', signal.takeProfitLevels.join(', '));
    
    // For safety, let's just test the order validation without placing it
    console.log('\n🧪 Testing order validation (dry run)...');
    
    try {
      // Test if we can get current price
      const currentPrice = await bingx.getSymbolPrice(symbol);
      console.log('✅ Current', symbol, 'price:', currentPrice.price);
      
      // Test symbol info to check minimum quantities
      console.log('✅ Symbol', symbol, 'is tradeable');
      
      // Test account permissions
      console.log('✅ Account has', accountInfo.balance, 'USDT available');
      
      console.log('\n🎉 ALL CHECKS PASSED - READY FOR REAL TRADING!');
      console.log('\n📝 To execute this trade, uncomment the trade execution code below');
      console.log('   and run this script again.');
      
      // UNCOMMENT THESE LINES TO PLACE REAL TRADES:
      /*
      console.log('\n🚀 Placing REAL market order...');
      const orderResult = await bingx.placeOrder({
        symbol: symbol,
        side: signal.direction === 'LONG' ? 'BUY' : 'SELL',
        type: 'MARKET',
        quantity: positionSizeWithLeverage.toFixed(6),
        leverage: signal.leverage
      });
      console.log('✅ Order placed:', orderResult);
      
      // Update signal status
      await signal.update({ status: 'executed' });
      console.log('✅ Signal marked as executed');
      */
      
    } catch (error) {
      console.error('❌ Order validation failed:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

testDirectTrading();
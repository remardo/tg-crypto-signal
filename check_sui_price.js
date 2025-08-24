const BingXService = require('./src/services/bingxService');
const Signal = require('./src/models/Signal');

async function checkSUIPriceAndSignal() {
  try {
    console.log('🔍 Checking SUI Price vs Signal Levels...\n');
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Get current SUI price
    const priceInfo = await bingx.getSymbolPrice('SUI-USDT');
    console.log('📈 Current SUI Price:', priceInfo.price, 'USDT');
    
    // Get the SUI signal
    const signals = await Signal.findAll({ 
      coin: 'SUI',
      limit: 1 
    });
    
    if (signals.length > 0) {
      const signal = signals[0];
      console.log('\n📊 Signal Details:');
      console.log('  Direction:', signal.direction);
      console.log('  Entry Price:', signal.entryPrice);
      console.log('  Stop Loss:', signal.stopLoss);
      console.log('  Take Profits:', signal.takeProfitLevels);
      
      console.log('\n🔍 Price Analysis:');
      console.log('  Current Price:', priceInfo.price);
      console.log('  Signal Entry:', signal.entryPrice);
      console.log('  First TP:', signal.takeProfitLevels[0]);
      
      // For LONG position, TP should be > current price
      if (signal.direction === 'LONG') {
        console.log('\n💡 LONG Position Analysis:');
        console.log('  ✅ TP should be > Current Price');
        
        if (parseFloat(signal.takeProfitLevels[0]) > priceInfo.price) {
          console.log('  ✅ TP Level OK:', signal.takeProfitLevels[0], '>', priceInfo.price);
        } else {
          console.log('  ❌ TP Level TOO LOW:', signal.takeProfitLevels[0], '<=', priceInfo.price);
          console.log('  💡 Solution: Use market price + buffer for TP');
        }
      }
      
      // Check if signal is outdated
      const priceChange = ((priceInfo.price - parseFloat(signal.entryPrice)) / parseFloat(signal.entryPrice)) * 100;
      console.log('\n📊 Price Movement Since Signal:');
      console.log('  Price Change:', priceChange.toFixed(2) + '%');
      
      if (Math.abs(priceChange) > 5) {
        console.log('  ⚠️  Signal may be outdated (>5% price movement)');
        console.log('  💡 Consider using current market price for calculations');
      }
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkSUIPriceAndSignal();
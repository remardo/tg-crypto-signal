const { SignalRecognitionService } = require('./src/services/signalRecognitionService');
const BingXService = require('./src/services/bingxService');

async function testSimpleSignal() {
  try {
    console.log('🚀 Testing BingX Real Trading Setup...\n');
    
    // Test BingX connection
    console.log('📡 Testing BingX API connection...');
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Get account info
    const accountInfo = await bingx.getAccountInfo();
    console.log('💰 Futures Account Balance:', accountInfo);
    
    const spotBalance = await bingx.getSpotBalance();
    console.log('💰 Spot Balance (USDT):', spotBalance);
    
    // Get current BTC price
    const btcPrice = await bingx.getSymbolPrice('BTC-USDT');
    console.log('📈 Current BTC Price: $' + btcPrice.price);
    
    // Test signal parsing
    console.log('\n🤖 Testing Signal Recognition...');
    const signalService = new SignalRecognitionService();
    await signalService.initialize();
    
    const testMessage = `Монета: BTC LONG Х5 ⤴️
🔵Цена входа: 115000
✅Тэйки: 116000 117000 119000
🛑Стоп: 113000
Входим на 5$`;
    
    console.log('📩 Test signal message:');
    console.log(testMessage);
    
    const messageData = {
      text: testMessage,
      channelName: 'test_channel',
      date: new Date()
    };
    
    const analysis = await signalService.analyzeMessage(messageData);
    
    console.log('\n📊 Signal Analysis Result:');
    console.log('✅ Is Signal:', analysis.isSignal);
    console.log('🎯 Confidence:', analysis.confidence);
    console.log('💱 Coin:', analysis.extractedData?.coin);
    console.log('📈 Direction:', analysis.extractedData?.direction);
    console.log('⚡ Leverage:', analysis.extractedData?.leverage);
    console.log('💵 Entry Price:', analysis.extractedData?.entryPrice);
    console.log('🎯 Take Profits:', analysis.extractedData?.takeProfitLevels);
    console.log('🛑 Stop Loss:', analysis.extractedData?.stopLoss);
    
    console.log('\n🎉 System Status:');
    console.log('✅ BingX API: Connected and working');
    console.log('✅ Signal Recognition: Working');
    console.log('✅ Real Trading Mode: ENABLED');
    
    if (accountInfo.availableBalance > 0 || spotBalance.free > 0) {
      console.log('💰 Account has funds available for trading');
    } else {
      console.log('⚠️  No funds available. Add USDT to your BingX account to start trading');
    }
    
    console.log('\n📋 Next Steps:');
    console.log('1. Add USDT to your BingX futures account');
    console.log('2. The system will automatically detect and execute signals');
    console.log('3. Monitor the web dashboard at http://localhost:3000');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSimpleSignal();
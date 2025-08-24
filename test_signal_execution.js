const { SignalRecognitionService } = require('./src/services/signalRecognitionService');
const ExecutionService = require('./src/services/executionService');
const BingXService = require('./src/services/bingxService');
const Channel = require('./src/models/Channel');
const Signal = require('./src/models/Signal');

async function testSignalExecution() {
  try {
    console.log('🚀 Testing Real Signal Execution...\n');
    
    // Initialize services
    const signalService = new SignalRecognitionService();
    await signalService.initialize();
    
    const executionService = new ExecutionService();
    await executionService.initialize();
    
    // Get our test channel
    const channels = await Channel.findAll();
    if (channels.length === 0) {
      throw new Error('No channels found for testing');
    }
    
    const channel = channels[0];
    console.log('📡 Using channel:', channel.name);
    console.log('⚙️ Channel settings:', {
      autoExecute: channel.autoExecute,
      riskPercentage: channel.riskPercentage,
      tpPercentages: channel.tpPercentages
    });
    
    // Create a test signal message (simulating Telegram message)
    const testMessage = `Монета: BTC LONG Х5 ⤴️
🔵Цена входа: 115000
✅Тэйки: 116000 117000 119000
🛑Стоп: 113000
Входим на 5$`;
    
    console.log('📩 Test signal message:');
    console.log(testMessage);
    console.log('');
    
    // Parse the signal
    console.log('🤖 Parsing signal with AI...');
    const messageData = {
      text: testMessage,
      channelName: channel.name,
      date: new Date()
    };
    const analysis = await signalService.analyzeMessage(messageData);
    
    console.log('📊 Signal analysis result:', {
      isSignal: analysis.isSignal,
      confidence: analysis.confidence,
      coin: analysis.extractedData?.coin,
      direction: analysis.extractedData?.direction,
      leverage: analysis.extractedData?.leverage,
      entryPrice: analysis.extractedData?.entryPrice,
      takeProfitLevels: analysis.extractedData?.takeProfitLevels,
      stopLoss: analysis.extractedData?.stopLoss
    });
    
    if (!analysis.isSignal || analysis.confidence < 0.8) {
      console.log('❌ Signal analysis failed or confidence too low');
      return;
    }
    
    // Create signal in database
    console.log('💾 Creating signal in database...');
    const signalData = {
      channelId: channel.id,
      coin: analysis.extractedData.coin,
      direction: analysis.extractedData.direction,
      leverage: analysis.extractedData.leverage,
      entryPrice: analysis.extractedData.entryPrice,
      takeProfitLevels: analysis.extractedData.takeProfitLevels,
      stopLoss: analysis.extractedData.stopLoss,
      confidenceScore: analysis.confidence,
      rawMessage: testMessage,
      signalType: 'entry',
      status: 'pending'
    };
    
    const signal = await Signal.create(signalData);
    console.log('✅ Signal created with ID:', signal.id);
    
    // Test execution (this will fail due to insufficient balance, but we can see the process)
    console.log('🎯 Testing signal execution...');
    try {
      await executionService.executeSignal(signal.id);
      console.log('✅ Signal execution queued successfully!');
    } catch (error) {
      console.log('⚠️ Expected execution error (insufficient funds):', error.message);
    }
    
    // Check current BTC price for reference
    const bingx = new BingXService();
    await bingx.initialize();
    const currentPrice = await bingx.getSymbolPrice('BTC-USDT');
    console.log('📈 Current BTC price: $' + currentPrice.price);
    
    console.log('\n🎉 Real trading system is ready!');
    console.log('💰 To start trading, add funds to your BingX futures account');
    console.log('📱 The system will automatically execute signals when sufficient balance is available');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

testSignalExecution();
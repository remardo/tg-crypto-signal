const { SignalRecognitionService } = require('./src/services/signalRecognitionService');
const Signal = require('./src/models/Signal');
const Channel = require('./src/models/Channel');

async function createTestSignalForRealTrading() {
  try {
    console.log('🚀 Creating Test Signal for Real Trading...\n');
    
    // Initialize signal service
    const signalService = new SignalRecognitionService();
    await signalService.initialize();
    
    // Get channel
    const channels = await Channel.findAll();
    const channel = channels[0];
    
    console.log('📡 Using channel:', channel.name);
    console.log('⚙️ Channel settings:', {
      autoExecute: channel.autoExecute,
      riskPercentage: channel.riskPercentage,
      tpPercentages: channel.tpPercentages
    });
    
    // Create a realistic signal for our 49.5 USDT balance
    // Using conservative settings for real money
    const testMessage = `Монета: BTC LONG Х2 ⤴️
🔵Цена входа: 115030
✅Тэйки: 115500 116000 116500
🛑Стоп: 114500
Входим на 2$`;
    
    console.log('📩 Creating real trading signal:');
    console.log(testMessage);
    console.log('');
    
    // Parse signal
    const messageData = {
      text: testMessage,
      channelName: channel.name,
      date: new Date()
    };
    
    const analysis = await signalService.analyzeMessage(messageData);
    
    console.log('📊 Signal Analysis:');
    console.log('✅ Is Signal:', analysis.isSignal);
    console.log('🎯 Confidence:', analysis.confidence);
    console.log('💱 Coin:', analysis.extractedData?.coin);
    console.log('📈 Direction:', analysis.extractedData?.direction);
    console.log('⚡ Leverage:', analysis.extractedData?.leverage);
    console.log('💵 Entry Price:', analysis.extractedData?.entryPrice);
    console.log('🎯 Take Profits:', analysis.extractedData?.takeProfitLevels);
    console.log('🛑 Stop Loss:', analysis.extractedData?.stopLoss);
    
    if (!analysis.isSignal || analysis.confidence < 0.8) {
      console.log('❌ Signal analysis failed');
      return;
    }
    
    // Create signal in database
    console.log('\\n💾 Creating signal in database...');
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
    
    console.log('\\n🎯 Signal will be automatically processed since autoExecute is enabled');
    console.log('💰 With 49.5 USDT balance and 2% risk, position size will be calculated automatically');
    console.log('📊 TP percentages will be applied:', channel.tpPercentages);
    console.log('\\n⏳ Check the logs for execution status...');
    console.log('🌐 Monitor at: http://localhost:3000');
    
  } catch (error) {
    console.error('❌ Error creating test signal:', error.message);
  }
}

createTestSignalForRealTrading();
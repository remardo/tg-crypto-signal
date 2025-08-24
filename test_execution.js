const Signal = require('./src/models/Signal');
const ExecutionService = require('./src/services/executionService');
const BingXService = require('./src/services/bingxService');
const { logger } = require('./src/utils/logger');

async function testSignalExecution() {
  try {
    console.log('🚀 Testing Signal Execution with Fixed Setup...\n');
    
    // Initialize services
    const executionService = new ExecutionService();
    await executionService.initialize();
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Get account balance
    const accountInfo = await bingx.getAccountInfo();
    console.log('💰 Main Account Balance:', accountInfo.balance, 'USDT');
    console.log('💸 Available Balance:', accountInfo.availableBalance, 'USDT\n');
    
    // Get the latest pending signals
    const pendingSignals = await Signal.findAll({ 
      status: 'pending',
      limit: 5 
    });
    
    if (pendingSignals.length === 0) {
      console.log('❌ No pending signals found');
      console.log('💡 All recent signals have already been processed');
      
      // Show recent failed signals
      const failedSignals = await Signal.findAll({ 
        status: 'failed',
        limit: 3 
      });
      
      if (failedSignals.length > 0) {
        console.log('\\n📋 Recent failed signals:');
        failedSignals.forEach((signal, index) => {
          console.log(`${index + 1}. ${signal.coin} ${signal.direction} - ${signal.id}`);
        });
        
        console.log('\\n🔄 Attempting to retry the latest failed signal...');
        const retrySignal = failedSignals[0];
        
        // Update signal status to pending for retry
        await retrySignal.update({ status: 'pending' });
        console.log(`✅ Reset signal ${retrySignal.coin} ${retrySignal.direction} to pending`);
        
        // Try executing it
        console.log('\\n🎯 Executing signal...');
        const executionData = {
          signalId: retrySignal.id,
          channelId: retrySignal.channelId
        };
        
        const result = await executionService.executeSignal(executionData);
        
        if (result.success) {
          console.log('🎉 SIGNAL EXECUTED SUCCESSFULLY!');
          console.log('✅ Order placed:', result.order?.orderId || 'N/A');
          console.log('📊 Position created:', result.position?.id || 'N/A');
        } else {
          console.log('❌ Execution failed:', result.error);
        }
      }
      
      return;
    }
    
    // Show available pending signals
    console.log(`📊 Found ${pendingSignals.length} pending signals:\\n`);
    
    pendingSignals.forEach((signal, index) => {
      const riskReward = signal.calculateRiskReward();
      console.log(`${index + 1}. ${signal.coin} ${signal.direction}`);
      console.log(`   Entry: ${signal.entryPrice}`);
      console.log(`   Stop Loss: ${signal.stopLoss}`);
      console.log(`   Take Profits: ${signal.takeProfitLevels?.join(', ')}`);
      console.log(`   Leverage: ${signal.leverage}x`);
      if (riskReward) {
        console.log(`   Risk/Reward: ${riskReward.ratio.toFixed(2)}`);
      }
      console.log('');
    });
    
    // Execute the first pending signal
    const testSignal = pendingSignals[0];
    console.log(`🎯 Executing signal: ${testSignal.coin} ${testSignal.direction}\\n`);
    
    const executionData = {
      signalId: testSignal.id,
      channelId: testSignal.channelId
    };
    
    const result = await executionService.executeSignal(executionData);
    
    if (result.success) {
      console.log('🎉 SIGNAL EXECUTED SUCCESSFULLY!');
      console.log('✅ Order details:', {
        orderId: result.order?.orderId,
        symbol: result.order?.symbol,
        side: result.order?.side,
        quantity: result.order?.quantity,
        executedPrice: result.order?.executedPrice
      });
      console.log('📊 Position details:', {
        positionId: result.position?.id,
        status: result.position?.status
      });
      
      console.log('\\n🎊 CONGRATULATIONS! 🎊');
      console.log('✅ Your trading bot successfully executed a real signal!');
      console.log('💼 Check your BingX account to see the position');
      console.log('📈 Monitor the position in your dashboard');
      
    } else {
      console.log('❌ Execution failed:', result.error);
      
      // Analyze the error
      console.log('\\n🔍 Error Analysis:');
      
      if (result.error.includes('BingX API Error [80014]')) {
        console.log('💡 BingX API parameter error - this could be due to:');
        console.log('  - Invalid symbol format');
        console.log('  - Insufficient balance');
        console.log('  - Minimum order size not met');
        console.log('  - Leverage setting issues');
      } else if (result.error.includes('insufficient')) {
        console.log('💡 Insufficient balance error:');
        console.log(`  - Available: ${accountInfo.availableBalance} USDT`);
        console.log('  - Try reducing risk percentage');
        console.log('  - Use a signal with lower leverage');
      } else if (result.error.includes('Sub-account')) {
        console.log('💡 Sub-account error - this should be fixed now');
      } else {
        console.log('💡 Other error - check logs for details');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

testSignalExecution();
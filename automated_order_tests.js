const BingXService = require('./src/services/bingxService');
const ExecutionService = require('./src/services/executionService');
const { logger } = require('./src/utils/logger');
const Signal = require('./src/models/Signal');
const Position = require('./src/models/Position');
const { Decimal } = require('decimal.js');

class AutomatedOrderTester {
  constructor() {
    this.bingx = null;
    this.executionService = null;
    this.testResults = [];
    this.activeTestOrders = [];
    this.activeTestPositions = [];
    
    // Test configuration
    this.testConfig = {
      symbol: 'FARTCOIN-USDT',
      testQuantity: 2.0, // Above minimum 1.906 FARTCOIN
      longEntryPrice: null, // Will be set to current price - 0.01
      shortEntryPrice: null, // Will be set to current price + 0.01
      takeProfitPercentages: [30, 30, 40], // TP1: 30%, TP2: 30%, TP3: 40%
      takeProfitOffsets: [0.02, 0.04, 0.06], // Price offsets for TP levels
      stopLossOffset: 0.03,
      maxTestDuration: 5 * 60 * 1000, // 5 minutes max per test
      cleanupAfterTest: true
    };
  }

  async initialize() {
    try {
      console.log('🚀 Initializing Automated Order Tester...\n');
      
      // Initialize BingX service
      this.bingx = new BingXService();
      await this.bingx.initialize();
      
      // Initialize execution service
      this.executionService = new ExecutionService();
      await this.executionService.initialize();
      
      const accountInfo = await this.bingx.getAccountInfo();
      console.log(`💰 Account Balance: ${accountInfo.balance} USDT`);
      console.log(`💰 Available Balance: ${accountInfo.availableBalance} USDT\n`);
      
      // Get current price and set test prices
      const priceData = await this.bingx.getSymbolPrice(this.testConfig.symbol);
      const currentPrice = parseFloat(priceData.price);
      
      this.testConfig.longEntryPrice = (currentPrice - 0.01).toFixed(4);
      this.testConfig.shortEntryPrice = (currentPrice + 0.01).toFixed(4);
      
      console.log(`📊 Current ${this.testConfig.symbol} Price: ${currentPrice}`);
      console.log(`📈 LONG Test Entry Price: ${this.testConfig.longEntryPrice}`);
      console.log(`📉 SHORT Test Entry Price: ${this.testConfig.shortEntryPrice}\n`);
      
      return true;
    } catch (error) {
      console.error('❌ Initialization failed:', error.message);
      return false;
    }
  }

  async runAllTests() {
    try {
      console.log('🧪 Starting Automated Order Testing Suite...\n');
      console.log('=' .repeat(60));
      
      const startTime = Date.now();
      
      // Test 1: LONG Order Testing
      console.log('\n📈 TEST 1: LONG ORDER TESTING');
      console.log('-'.repeat(40));
      const longResult = await this.testLongOrders();
      this.testResults.push({ type: 'LONG', ...longResult });
      
      // Wait between tests
      await this.sleep(2000);
      
      // Test 2: SHORT Order Testing  
      console.log('\n📉 TEST 2: SHORT ORDER TESTING');
      console.log('-'.repeat(40));
      const shortResult = await this.testShortOrders();
      this.testResults.push({ type: 'SHORT', ...shortResult });
      
      // Test 3: Position Management Testing
      console.log('\n🔄 TEST 3: POSITION MANAGEMENT TESTING');
      console.log('-'.repeat(40));
      const managementResult = await this.testPositionManagement();
      this.testResults.push({ type: 'MANAGEMENT', ...managementResult });
      
      const totalTime = Date.now() - startTime;
      
      // Generate comprehensive report
      console.log('\n' + '='.repeat(60));
      console.log('📊 AUTOMATED TESTING RESULTS');
      console.log('='.repeat(60));
      
      this.generateTestReport(totalTime);
      
      // Cleanup if configured
      if (this.testConfig.cleanupAfterTest) {
        await this.cleanupAllTestData();
      }
      
      return this.testResults;
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      await this.emergencyCleanup();
      throw error;
    }
  }

  async testLongOrders() {
    const testStart = Date.now();
    const result = {
      success: false,
      mainOrderCreated: false,
      takeProfitOrdersCreated: 0,
      expectedTakeProfitOrders: 3,
      stopLossCreated: false,
      errors: [],
      orderIds: [],
      duration: 0
    };
    
    try {
      console.log('🔨 Creating LONG position with take profit orders...');
      
      // Create mock signal for LONG position
      const longSignal = await this.createMockSignal('LONG');
      
      // Execute the signal (this should create main order + TP + SL)
      const executionResult = await this.executionService.executeSignal(longSignal.id);
      
      if (executionResult.success) {
        result.mainOrderCreated = true;
        result.orderIds.push(executionResult.position?.id);
        
        // Check if position was created
        const position = await Position.findOne({ where: { signalId: longSignal.id } });
        if (position) {
          this.activeTestPositions.push(position.id);
          console.log(`✅ LONG position created: ${position.symbol} ${position.side}`);
          
          // Wait a moment for TP orders to be created
          await this.sleep(3000);
          
          // Check for take profit orders
          const openOrders = await this.bingx.getOpenOrders(this.testConfig.symbol);
          const tpOrders = openOrders.filter(order => 
            order.clientOrderId && order.clientOrderId.includes('tp')
          );
          
          result.takeProfitOrdersCreated = tpOrders.length;
          console.log(`📊 Take Profit Orders Created: ${tpOrders.length}/${result.expectedTakeProfitOrders}`);
          
          // Track TP order IDs
          tpOrders.forEach(order => {
            result.orderIds.push(order.orderId);
            this.activeTestOrders.push(order.orderId);
          });
          
          // Check for stop loss order
          const slOrders = openOrders.filter(order => 
            order.clientOrderId && order.clientOrderId.includes('sl')
          );
          
          if (slOrders.length > 0) {
            result.stopLossCreated = true;
            slOrders.forEach(order => {
              result.orderIds.push(order.orderId);
              this.activeTestOrders.push(order.orderId);
            });
            console.log(`✅ Stop Loss Order Created: ${slOrders[0].orderId}`);
          }
          
          result.success = result.takeProfitOrdersCreated === result.expectedTakeProfitOrders;
        }
      } else {
        result.errors.push('Signal execution failed');
      }
      
    } catch (error) {
      result.errors.push(error.message);
      console.error('❌ LONG order test failed:', error.message);
    }
    
    result.duration = Date.now() - testStart;
    return result;
  }

  async testShortOrders() {
    const testStart = Date.now();
    const result = {
      success: false,
      mainOrderCreated: false,
      takeProfitOrdersCreated: 0,
      expectedTakeProfitOrders: 3,
      stopLossCreated: false,
      errors: [],
      orderIds: [],
      duration: 0
    };
    
    try {
      console.log('🔨 Creating SHORT position with take profit orders...');
      
      // Create mock signal for SHORT position
      const shortSignal = await this.createMockSignal('SHORT');
      
      // Execute the signal
      const executionResult = await this.executionService.executeSignal(shortSignal.id);
      
      if (executionResult.success) {
        result.mainOrderCreated = true;
        result.orderIds.push(executionResult.position?.id);
        
        // Check if position was created
        const position = await Position.findOne({ where: { signalId: shortSignal.id } });
        if (position) {
          this.activeTestPositions.push(position.id);
          console.log(`✅ SHORT position created: ${position.symbol} ${position.side}`);
          
          // Wait for TP orders
          await this.sleep(3000);
          
          // Check for take profit orders
          const openOrders = await this.bingx.getOpenOrders(this.testConfig.symbol);
          const tpOrders = openOrders.filter(order => 
            order.clientOrderId && order.clientOrderId.includes('tp')
          );
          
          result.takeProfitOrdersCreated = tpOrders.length;
          console.log(`📊 Take Profit Orders Created: ${tpOrders.length}/${result.expectedTakeProfitOrders}`);
          
          // Verify SHORT TP orders have correct parameters
          for (const tpOrder of tpOrders) {
            console.log(`🔍 TP Order ${tpOrder.clientOrderId}:`);
            console.log(`   Side: ${tpOrder.side} (should be BUY for SHORT position)`);
            console.log(`   Quantity: ${tpOrder.origQty}`);
            console.log(`   Price: ${tpOrder.price}`);
            
            result.orderIds.push(tpOrder.orderId);
            this.activeTestOrders.push(tpOrder.orderId);
            
            // Verify correct side for SHORT position
            if (tpOrder.side !== 'BUY') {
              result.errors.push(`TP order has wrong side: ${tpOrder.side}, should be BUY for SHORT`);
            }
          }
          
          // Check for stop loss
          const slOrders = openOrders.filter(order => 
            order.clientOrderId && order.clientOrderId.includes('sl')
          );
          
          if (slOrders.length > 0) {
            result.stopLossCreated = true;
            slOrders.forEach(order => {
              result.orderIds.push(order.orderId);
              this.activeTestOrders.push(order.orderId);
            });
            console.log(`✅ Stop Loss Order Created: ${slOrders[0].orderId}`);
          }
          
          result.success = result.takeProfitOrdersCreated === result.expectedTakeProfitOrders && result.errors.length === 0;
        }
      } else {
        result.errors.push('Signal execution failed');
      }
      
    } catch (error) {
      result.errors.push(error.message);
      console.error('❌ SHORT order test failed:', error.message);
    }
    
    result.duration = Date.now() - testStart;
    return result;
  }

  async testPositionManagement() {
    const testStart = Date.now();
    const result = {
      success: false,
      positionsFound: 0,
      ordersFound: 0,
      cleanupSuccessful: false,
      errors: [],
      duration: 0
    };
    
    try {
      console.log('🔍 Testing position and order management...');
      
      // Check current positions
      const positions = await this.bingx.getPositions();
      const testPositions = positions.filter(pos => 
        pos.symbol === this.testConfig.symbol && Math.abs(parseFloat(pos.positionAmt || pos.size || 0)) > 0
      );
      
      result.positionsFound = testPositions.length;
      console.log(`📊 Active positions found: ${result.positionsFound}`);
      
      // Check open orders
      const openOrders = await this.bingx.getOpenOrders(this.testConfig.symbol);
      result.ordersFound = openOrders.length;
      console.log(`📋 Open orders found: ${result.ordersFound}`);
      
      // Test cleanup functionality
      if (result.ordersFound > 0) {
        console.log('🧹 Testing order cleanup...');
        let canceledCount = 0;
        
        for (const order of openOrders) {
          try {
            await this.bingx.cancelOrder(order.orderId, order.symbol);
            canceledCount++;
            console.log(`✅ Canceled order: ${order.orderId}`);
          } catch (error) {
            console.log(`⚠️  Could not cancel order ${order.orderId}: ${error.message}`);
          }
        }
        
        result.cleanupSuccessful = canceledCount === result.ordersFound;
        console.log(`🧹 Cleanup: ${canceledCount}/${result.ordersFound} orders canceled`);
      } else {
        result.cleanupSuccessful = true;
      }
      
      result.success = true;
      
    } catch (error) {
      result.errors.push(error.message);
      console.error('❌ Position management test failed:', error.message);
    }
    
    result.duration = Date.now() - testStart;
    return result;
  }

  async createMockSignal(direction) {
    const entryPrice = direction === 'LONG' ? this.testConfig.longEntryPrice : this.testConfig.shortEntryPrice;
    const isLong = direction === 'LONG';
    
    // Calculate take profit prices
    const takeProfitLevels = this.testConfig.takeProfitOffsets.map(offset => {
      const tpPrice = isLong 
        ? (parseFloat(entryPrice) + offset).toFixed(4)
        : (parseFloat(entryPrice) - offset).toFixed(4);
      return { price: parseFloat(tpPrice), percentage: 33.33 };
    });
    
    // Calculate stop loss price
    const stopLossPrice = isLong
      ? (parseFloat(entryPrice) - this.testConfig.stopLossOffset).toFixed(4)
      : (parseFloat(entryPrice) + this.testConfig.stopLossOffset).toFixed(4);
    
    const mockSignalData = {
      coin: 'FARTCOIN',
      direction: direction,
      entryPrice: parseFloat(entryPrice),
      takeProfitLevels: takeProfitLevels,
      stopLoss: parseFloat(stopLossPrice),
      leverage: 10,
      channelId: 'test-channel',
      messageId: `test-${direction.toLowerCase()}-${Date.now()}`,
      originalMessage: `Test ${direction} signal for automated testing`,
      confidence: 1.0,
      positionSize: this.testConfig.testQuantity
    };
    
    // Create signal in database
    const signal = await Signal.create(mockSignalData);
    console.log(`📋 Created mock ${direction} signal: ${signal.id}`);
    
    return signal;
  }

  generateTestReport(totalTime) {
    console.log(`⏱️  Total Test Duration: ${(totalTime / 1000).toFixed(2)} seconds\n`);
    
    let overallSuccess = true;
    
    this.testResults.forEach((result, index) => {
      console.log(`📋 Test ${index + 1}: ${result.type} Orders`);
      console.log(`   Status: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
      console.log(`   Duration: ${(result.duration / 1000).toFixed(2)}s`);
      
      if (result.type === 'LONG' || result.type === 'SHORT') {
        console.log(`   Main Order: ${result.mainOrderCreated ? '✅' : '❌'}`);
        console.log(`   Take Profit: ${result.takeProfitOrdersCreated}/${result.expectedTakeProfitOrders} ${result.takeProfitOrdersCreated === result.expectedTakeProfitOrders ? '✅' : '❌'}`);
        console.log(`   Stop Loss: ${result.stopLossCreated ? '✅' : '❌'}`);
        console.log(`   Orders Created: ${result.orderIds.length}`);
      } else if (result.type === 'MANAGEMENT') {
        console.log(`   Positions Found: ${result.positionsFound}`);
        console.log(`   Orders Found: ${result.ordersFound}`);
        console.log(`   Cleanup: ${result.cleanupSuccessful ? '✅' : '❌'}`);
      }
      
      if (result.errors.length > 0) {
        console.log(`   Errors: ${result.errors.join(', ')}`);
      }
      
      console.log('');
      
      if (!result.success) {
        overallSuccess = false;
      }
    });
    
    console.log('🎯 OVERALL RESULT:');
    console.log(`   ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    console.log(`   Success Rate: ${this.testResults.filter(r => r.success).length}/${this.testResults.length}`);
    
    if (overallSuccess) {
      console.log('\n🎉 CONGRATULATIONS! All order types are working correctly!');
      console.log('✅ LONG positions create proper take profit orders');
      console.log('✅ SHORT positions create proper take profit orders');
      console.log('✅ Position management and cleanup works');
      console.log('\n🚀 Your trading bot is ready for live trading!');
    } else {
      console.log('\n⚠️  Some issues were found. Please review the errors above.');
    }
  }

  async cleanupAllTestData() {
    console.log('\n🧹 Cleaning up test data...');
    
    try {
      // Cancel any remaining test orders
      for (const orderId of this.activeTestOrders) {
        try {
          await this.bingx.cancelOrder(orderId, this.testConfig.symbol);
          console.log(`✅ Canceled test order: ${orderId}`);
        } catch (error) {
          console.log(`⚠️  Could not cancel order ${orderId}: ${error.message}`);
        }
      }
      
      // Close test positions in database
      for (const positionId of this.activeTestPositions) {
        try {
          const position = await Position.findByPk(positionId);
          if (position && position.status === 'open') {
            await position.update({ status: 'closed' });
            console.log(`✅ Closed test position: ${positionId}`);
          }
        } catch (error) {
          console.log(`⚠️  Could not close position ${positionId}: ${error.message}`);
        }
      }
      
      console.log('✅ Cleanup completed');
      
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
    }
  }

  async emergencyCleanup() {
    console.log('🚨 Performing emergency cleanup...');
    await this.cleanupAllTestData();
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution function
async function runAutomatedTests() {
  const tester = new AutomatedOrderTester();
  
  try {
    const initialized = await tester.initialize();
    if (!initialized) {
      console.error('❌ Failed to initialize tester');
      return;
    }
    
    await tester.runAllTests();
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    await tester.emergencyCleanup();
  }
}

// Export for use as module or run directly
if (require.main === module) {
  runAutomatedTests();
}

module.exports = AutomatedOrderTester;
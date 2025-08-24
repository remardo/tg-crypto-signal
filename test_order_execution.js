const BingXService = require('./src/services/bingxService');
const { logger } = require('./src/utils/logger');

class OrderExecutionTester {
  constructor() {
    this.bingx = null;
    this.testOrders = [];
    this.config = {
      symbol: 'FARTCOIN-USDT',
      testQuantity: 2.0, // Above minimum requirement
      priceOffset: 0.02  // Offset from current price to avoid immediate execution
    };
  }

  async initialize() {
    console.log('🔧 Initializing Order Execution Tester...\n');
    
    this.bingx = new BingXService();
    await this.bingx.initialize();
    
    const accountInfo = await this.bingx.getAccountInfo();
    console.log(`💰 Account Balance: ${accountInfo.balance} USDT`);
    console.log(`💰 Available Balance: ${accountInfo.availableBalance} USDT\n`);
    
    return true;
  }

  async testLongOrderExecution() {
    console.log('📈 TESTING LONG ORDER EXECUTION');
    console.log('=' .repeat(50));
    
    try {
      // Get current price
      const priceData = await this.bingx.getSymbolPrice(this.config.symbol);
      const currentPrice = parseFloat(priceData.price);
      const entryPrice = (currentPrice - this.config.priceOffset).toFixed(4);
      
      console.log(`📊 Current Price: ${currentPrice}`);
      console.log(`📈 LONG Entry Price: ${entryPrice} (below market)\n`);
      
      // Test 1: Main LONG Order
      console.log('🔨 Test 1: Creating LONG Entry Order');
      const longOrder = {
        symbol: this.config.symbol,
        side: 'BUY',
        positionSide: 'LONG',
        type: 'LIMIT',
        quantity: this.config.testQuantity,
        price: entryPrice,
        recvWindow: 5000,
        clientOrderId: `long_entry_${Date.now()}`
      };
      
      console.log('📋 Order Parameters:', JSON.stringify(longOrder, null, 2));
      
      const longResult = await this.bingx.placeOrder(longOrder);
      console.log(`✅ LONG order created: ${longResult.orderId}`);
      this.testOrders.push({ id: longResult.orderId, type: 'LONG_ENTRY', symbol: this.config.symbol });
      
      // Test 2: LONG Take Profit Orders
      console.log('\n🎯 Test 2: Creating LONG Take Profit Orders');
      const tpPrices = [
        (parseFloat(entryPrice) + 0.02).toFixed(4),
        (parseFloat(entryPrice) + 0.04).toFixed(4),
        (parseFloat(entryPrice) + 0.06).toFixed(4)
      ];
      
      for (let i = 0; i < tpPrices.length; i++) {
        const tpOrder = {
          symbol: this.config.symbol,
          side: 'SELL',  // Opposite side to close LONG position
          positionSide: 'LONG',  // Same positionSide as original position
          type: 'LIMIT',
          quantity: (this.config.testQuantity / 3).toFixed(3),
          price: tpPrices[i],
          recvWindow: 5000,
          clientOrderId: `long_tp${i + 1}_${Date.now()}`
        };
        
        console.log(`📋 TP${i + 1} Order:`, JSON.stringify(tpOrder, null, 2));
        
        const tpResult = await this.bingx.placeOrder(tpOrder);
        console.log(`✅ LONG TP${i + 1} created: ${tpResult.orderId}`);
        this.testOrders.push({ id: tpResult.orderId, type: `LONG_TP${i + 1}`, symbol: this.config.symbol });
        
        await this.sleep(1000); // Small delay between orders
      }
      
      return { success: true, ordersCreated: 4 };
      
    } catch (error) {
      console.error('❌ LONG order test failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async testShortOrderExecution() {
    console.log('\n\n📉 TESTING SHORT ORDER EXECUTION');
    console.log('=' .repeat(50));
    
    try {
      // Get current price
      const priceData = await this.bingx.getSymbolPrice(this.config.symbol);
      const currentPrice = parseFloat(priceData.price);
      const entryPrice = (currentPrice + this.config.priceOffset).toFixed(4);
      
      console.log(`📊 Current Price: ${currentPrice}`);
      console.log(`📉 SHORT Entry Price: ${entryPrice} (above market)\n`);
      
      // Test 1: Main SHORT Order
      console.log('🔨 Test 1: Creating SHORT Entry Order');
      const shortOrder = {
        symbol: this.config.symbol,
        side: 'SELL',
        positionSide: 'SHORT',
        type: 'LIMIT',
        quantity: this.config.testQuantity,
        price: entryPrice,
        recvWindow: 5000,
        clientOrderId: `short_entry_${Date.now()}`
      };
      
      console.log('📋 Order Parameters:', JSON.stringify(shortOrder, null, 2));
      
      const shortResult = await this.bingx.placeOrder(shortOrder);
      console.log(`✅ SHORT order created: ${shortResult.orderId}`);
      this.testOrders.push({ id: shortResult.orderId, type: 'SHORT_ENTRY', symbol: this.config.symbol });
      
      // Test 2: SHORT Take Profit Orders (BUY orders to close SHORT)
      console.log('\n🎯 Test 2: Creating SHORT Take Profit Orders');
      const tpPrices = [
        (parseFloat(entryPrice) - 0.02).toFixed(4),
        (parseFloat(entryPrice) - 0.04).toFixed(4),
        (parseFloat(entryPrice) - 0.06).toFixed(4)
      ];
      
      for (let i = 0; i < tpPrices.length; i++) {
        const tpOrder = {
          symbol: this.config.symbol,
          side: 'BUY',  // Opposite side to close SHORT position
          positionSide: 'SHORT',  // Same positionSide as original position
          type: 'LIMIT',
          quantity: (this.config.testQuantity / 3).toFixed(3),
          price: tpPrices[i],
          recvWindow: 5000,
          clientOrderId: `short_tp${i + 1}_${Date.now()}`
        };
        
        console.log(`📋 TP${i + 1} Order:`, JSON.stringify(tpOrder, null, 2));
        
        const tpResult = await this.bingx.placeOrder(tpOrder);
        console.log(`✅ SHORT TP${i + 1} created: ${tpResult.orderId}`);
        this.testOrders.push({ id: tpResult.orderId, type: `SHORT_TP${i + 1}`, symbol: this.config.symbol });
        
        await this.sleep(1000);
      }
      
      return { success: true, ordersCreated: 4 };
      
    } catch (error) {
      console.error('❌ SHORT order test failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async checkOrderStatus() {
    console.log('\n\n📋 CHECKING ORDER STATUS');
    console.log('=' .repeat(50));
    
    try {
      const openOrders = await this.bingx.getOpenOrders(this.config.symbol);
      console.log(`📊 Total open orders for ${this.config.symbol}: ${openOrders.length}\n`);
      
      const testOrderIds = this.testOrders.map(o => o.id);
      
      for (const testOrder of this.testOrders) {
        const foundOrder = openOrders.find(o => o.orderId === testOrder.id);
        
        if (foundOrder) {
          console.log(`✅ ${testOrder.type}: ${foundOrder.orderId}`);
          console.log(`   Side: ${foundOrder.side}, Price: ${foundOrder.price}, Qty: ${foundOrder.origQty}`);
          console.log(`   Status: ${foundOrder.status}`);
        } else {
          console.log(`❌ ${testOrder.type}: ${testOrder.id} - NOT FOUND (may be filled or canceled)`);
        }
      }
      
      // Check for any unexpected orders
      const unexpectedOrders = openOrders.filter(o => !testOrderIds.includes(o.orderId));
      if (unexpectedOrders.length > 0) {
        console.log(`\n⚠️  Found ${unexpectedOrders.length} unexpected orders:`);
        unexpectedOrders.forEach(order => {
          console.log(`   ${order.orderId}: ${order.side} ${order.origQty} at ${order.price}`);
        });
      }
      
    } catch (error) {
      console.error('❌ Failed to check order status:', error.message);
    }
  }

  async cleanupTestOrders() {
    console.log('\n\n🧹 CLEANING UP TEST ORDERS');
    console.log('=' .repeat(50));
    
    let canceledCount = 0;
    let failedCount = 0;
    
    for (const testOrder of this.testOrders) {
      try {
        await this.bingx.cancelOrder(testOrder.id, testOrder.symbol);
        console.log(`✅ Canceled ${testOrder.type}: ${testOrder.id}`);
        canceledCount++;
        
        await this.sleep(500); // Small delay between cancellations
        
      } catch (error) {
        console.log(`⚠️  Could not cancel ${testOrder.type} (${testOrder.id}): ${error.message}`);
        failedCount++;
      }
    }
    
    console.log(`\n📊 Cleanup Results:`);
    console.log(`✅ Canceled: ${canceledCount}`);
    console.log(`❌ Failed: ${failedCount}`);
    console.log(`📋 Total: ${this.testOrders.length}`);
  }

  async runCompleteTest() {
    console.log('🧪 STARTING COMPLETE ORDER EXECUTION TEST');
    console.log('=' .repeat(60));
    console.log('🚨 WARNING: This will place REAL orders on BingX!');
    console.log('📋 Orders will be placed away from market price to avoid execution');
    console.log('🧹 All orders will be cleaned up after testing\n');
    
    try {
      // Initialize
      await this.initialize();
      
      // Test LONG orders
      const longResult = await this.testLongOrderExecution();
      
      // Test SHORT orders  
      const shortResult = await this.testShortOrderExecution();
      
      // Check status
      await this.sleep(2000);
      await this.checkOrderStatus();
      
      // Generate report
      console.log('\n\n📊 TEST RESULTS');
      console.log('=' .repeat(50));
      console.log(`📈 LONG Orders: ${longResult.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      if (!longResult.success) console.log(`   Error: ${longResult.error}`);
      
      console.log(`📉 SHORT Orders: ${shortResult.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      if (!shortResult.success) console.log(`   Error: ${shortResult.error}`);
      
      const overallSuccess = longResult.success && shortResult.success;
      console.log(`\n🎯 OVERALL: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
      
      if (overallSuccess) {
        console.log('\n🎉 EXCELLENT! Both LONG and SHORT order creation works perfectly!');
        console.log('✅ Entry orders can be placed correctly');
        console.log('✅ Take profit orders use correct parameters');
        console.log('✅ No "Invalid parameters" errors');
        console.log('✅ Ready for live trading!');
      }
      
      // Cleanup
      await this.sleep(2000);
      await this.cleanupTestOrders();
      
    } catch (error) {
      console.error('❌ Test execution failed:', error.message);
      await this.cleanupTestOrders();
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the test
async function runOrderTests() {
  const tester = new OrderExecutionTester();
  await tester.runCompleteTest();
}

if (require.main === module) {
  runOrderTests();
}

module.exports = OrderExecutionTester;
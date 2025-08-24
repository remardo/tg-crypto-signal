const BingXService = require('./src/services/bingxService');
const { logger } = require('./src/utils/logger');

async function validateTakeProfitFix() {
  try {
    console.log('🔍 VALIDATING TAKE PROFIT ORDER FIX');
    console.log('=' .repeat(50));
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    const accountInfo = await bingx.getAccountInfo();
    console.log(`💰 Balance: ${accountInfo.balance} USDT\n`);
    
    // Get current price
    const priceData = await bingx.getSymbolPrice('FARTCOIN-USDT');
    const currentPrice = parseFloat(priceData.price);
    console.log(`📊 Current FARTCOIN Price: ${currentPrice}\n`);
    
    // Test both LONG and SHORT take profit parameter formats
    const testCases = [
      {
        name: 'LONG Take Profit',
        description: 'BUY position, SELL take profit',
        order: {
          symbol: 'FARTCOIN-USDT',
          side: 'SELL',           // To close LONG position
          positionSide: 'LONG',   // Same as original position
          type: 'LIMIT',
          quantity: 2.0,
          price: (currentPrice + 0.05).toFixed(4), // Above market
          recvWindow: 5000,
          clientOrderId: `validate_long_tp_${Date.now()}`
        }
      },
      {
        name: 'SHORT Take Profit',
        description: 'SELL position, BUY take profit',
        order: {
          symbol: 'FARTCOIN-USDT',
          side: 'BUY',            // To close SHORT position
          positionSide: 'SHORT',  // Same as original position
          type: 'LIMIT',
          quantity: 2.0,
          price: (currentPrice - 0.05).toFixed(4), // Below market
          recvWindow: 5000,
          clientOrderId: `validate_short_tp_${Date.now()}`
        }
      }
    ];
    
    const results = [];
    
    for (const testCase of testCases) {
      console.log(`🧪 Testing: ${testCase.name}`);
      console.log(`📋 ${testCase.description}`);
      console.log(`📋 Parameters:`, JSON.stringify(testCase.order, null, 2));
      
      try {
        const result = await bingx.placeOrder(testCase.order);
        
        console.log(`✅ SUCCESS! Order created: ${result.orderId}`);
        console.log(`   Status: ${result.status}`);
        console.log(`   Side: ${result.side}`);
        
        results.push({
          name: testCase.name,
          success: true,
          orderId: result.orderId,
          error: null
        });
        
        // Immediately cancel to clean up
        try {
          await bingx.cancelOrder(result.orderId, testCase.order.symbol);
          console.log(`🧹 Order canceled: ${result.orderId}`);
        } catch (cancelError) {
          console.log(`⚠️  Could not cancel: ${cancelError.message}`);
        }
        
      } catch (error) {
        console.log(`❌ FAILED: ${error.message}`);
        
        results.push({
          name: testCase.name,
          success: false,
          orderId: null,
          error: error.message
        });
        
        // Analyze the error
        if (error.message.includes('Invalid parameters')) {
          console.log(`💡 Still having parameter format issues`);
        } else if (error.message.includes('minimum order amount')) {
          console.log(`✅ Parameter format is CORRECT - just quantity issue`);
        } else if (error.message.includes('position not exist')) {
          console.log(`✅ Parameter format is CORRECT - no position to close`);
        }
      }
      
      console.log(''); // Empty line
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait between tests
    }
    
    // Generate report
    console.log('📊 VALIDATION RESULTS');
    console.log('-'.repeat(30));
    
    let allSuccessful = true;
    
    results.forEach(result => {
      console.log(`${result.name}: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
      if (!result.success) {
        console.log(`   Error: ${result.error}`);
        allSuccessful = false;
      }
    });
    
    console.log('\n🎯 CONCLUSION:');
    if (allSuccessful) {
      console.log('✅ Take profit parameter fix is WORKING!');
      console.log('✅ Both LONG and SHORT TP orders can be created');
      console.log('✅ No "Invalid parameters" errors');
      console.log('🚀 Ready to run full automated testing!');
    } else {
      console.log('❌ Take profit fix needs more work');
      console.log('💡 Check the error messages above for clues');
    }
    
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
  }
}

validateTakeProfitFix();
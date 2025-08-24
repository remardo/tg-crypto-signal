const BingXService = require('./src/services/bingxService');
const { logger } = require('./src/utils/logger');

async function testDifferentTPParams() {
  try {
    console.log('🧪 Testing Different TP Parameter Combinations...\n');
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    console.log('💰 Account Balance:', (await bingx.getAccountInfo()).balance, 'USDT\n');
    
    // Test different parameter combinations
    const testCases = [
      {
        name: 'Case 1: reduceOnly without positionSide',
        order: {
          symbol: 'FARTCOIN-USDT',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 1.0,
          price: 0.94,
          recvWindow: 5000,
          clientOrderId: `test1_${Date.now()}`,
          reduceOnly: true
          // No positionSide
        }
      },
      {
        name: 'Case 2: positionSide without reduceOnly',
        order: {
          symbol: 'FARTCOIN-USDT',
          side: 'BUY',
          positionSide: 'SHORT',
          type: 'LIMIT',
          quantity: 1.0,
          price: 0.94,
          recvWindow: 5000,
          clientOrderId: `test2_${Date.now()}`
          // No reduceOnly
        }
      },
      {
        name: 'Case 3: Simple order with minimal params',
        order: {
          symbol: 'FARTCOIN-USDT',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 1.0,
          price: 0.94,
          recvWindow: 5000,
          clientOrderId: `test3_${Date.now()}`
          // No positionSide, no reduceOnly
        }
      }
    ];
    
    for (const testCase of testCases) {
      console.log(`\\n🔍 ${testCase.name}:`);
      console.log('Parameters:', JSON.stringify(testCase.order, null, 2));
      
      try {
        console.log('🚨 Would place order - COMMENTED OUT FOR SAFETY');
        // const result = await bingx.placeOrder(testCase.order);
        // console.log('✅ SUCCESS:', result.orderId);
        
        // Instead, let's check what parameters would be sent
        console.log('📤 This would send to BingX API...');
        
      } catch (error) {
        console.log('❌ Failed:', error.message);
      }
    }
    
    console.log('\\n📚 BingX API Documentation Analysis:');
    console.log('According to BingX docs for futures orders:');
    console.log('- side: BUY or SELL (required)');
    console.log('- positionSide: LONG or SHORT (required for hedge mode)');
    console.log('- reduceOnly: true/false (optional, for closing positions)');
    console.log('');
    console.log('🤔 Possible solutions:');
    console.log('1. Use reduceOnly: true WITHOUT positionSide');
    console.log('2. Use positionSide: SHORT WITHOUT reduceOnly');
    console.log('3. Use different order types (STOP_MARKET instead of LIMIT)');
    console.log('4. Check if account is in hedge mode vs one-way mode');
    
    console.log('\\n💡 Recommendation:');
    console.log('Let\'s try the simplest approach first: use reduceOnly: true without positionSide');
    console.log('This tells BingX "close any existing position" without specifying which side');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testDifferentTPParams();
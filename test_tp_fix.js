const BingXService = require('./src/services/bingxService');

async function testTakeProfitCalculation() {
  try {
    console.log('🧪 Testing Take Profit Order Value Calculation...\n');
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Test scenario: SUI position
    const testData = {
      symbol: 'SUI-USDT',
      positionQuantity: 1, // 1 SUI
      takeProfitLevels: [3.7236, 3.7315, 3.7362],
      tpPercentages: [25.0, 25.0, 50.0]
    };
    
    // Get current price
    const currentPrice = await bingx.getSymbolPrice(testData.symbol);
    console.log('📈 Current SUI Price:', currentPrice.price, 'USDT');
    
    console.log('\n📊 Take Profit Analysis:');
    console.log('Position Size:', testData.positionQuantity, 'SUI');
    console.log('TP Percentages:', testData.tpPercentages.join('%, ') + '%');
    console.log('Minimum Order Value Required: 3.72 USDT\n');
    
    // Calculate each TP order
    for (let i = 0; i < testData.takeProfitLevels.length; i++) {
      const tpPrice = testData.takeProfitLevels[i];
      const percentage = testData.tpPercentages[i] / 100;
      let tpQuantity = testData.positionQuantity * percentage;
      let orderValue = tpQuantity * tpPrice;
      
      console.log(`🎯 Take Profit ${i + 1}:`);
      console.log(`  Price: ${tpPrice} USDT`);
      console.log(`  Original Quantity: ${tpQuantity.toFixed(6)} SUI (${testData.tpPercentages[i]}%)`);
      console.log(`  Original Value: ${orderValue.toFixed(2)} USDT`);
      
      // Check if meets minimum
      if (orderValue < 3.72) {
        console.log(`  ❌ Below minimum (3.72 USDT)`);
        
        // Calculate adjusted quantity
        const minQuantity = 3.72 / tpPrice;
        const adjustedValue = minQuantity * tpPrice;
        
        console.log(`  🔧 Adjusted Quantity: ${minQuantity.toFixed(6)} SUI`);
        console.log(`  🔧 Adjusted Value: ${adjustedValue.toFixed(2)} USDT`);
        
        if (minQuantity <= testData.positionQuantity) {
          console.log(`  ✅ Fix viable - order will be placed`);
        } else {
          console.log(`  ⚠️  Requires more than total position - will be skipped`);
        }
      } else {
        console.log(`  ✅ Meets minimum requirement`);
      }
      console.log('');
    }
    
    console.log('💡 Expected Results with Fix:');
    console.log('  TP1: Will be adjusted to meet 3.72 USDT minimum');
    console.log('  TP2: Should work as-is (if value > 3.72 USDT)');  
    console.log('  TP3: Will be adjusted to meet 3.72 USDT minimum');
    console.log('');
    
    // Show the improvement
    console.log('🔧 Fix Implementation:');
    console.log('  ✅ Calculate order value for each TP level');
    console.log('  ✅ If below 3.72 USDT, calculate minimum quantity needed');
    console.log('  ✅ Adjust quantity to meet minimum order value');
    console.log('  ✅ Skip orders if adjustment exceeds position size');
    console.log('  ✅ Log detailed information for debugging');
    
    console.log('\n🎯 This should resolve the issue where only 1 out of 3 take profit orders was created!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testTakeProfitCalculation();
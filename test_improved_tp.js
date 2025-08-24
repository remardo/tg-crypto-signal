async function testImprovedTPLogic() {
  try {
    console.log('🔧 Testing Improved Take Profit Logic...\n');
    
    // Simulate the improved logic
    const testData = {
      positionQuantity: 1, // 1 SUI
      takeProfitLevels: [3.7236, 3.7315, 3.7362],
      tpPercentages: [25.0, 25.0, 50.0],
      minOrderValue: 3.72
    };
    
    console.log('📊 Test Setup:');
    console.log('  Position Size:', testData.positionQuantity, 'SUI');
    console.log('  TP Levels:', testData.takeProfitLevels.join(', '), 'USDT');
    console.log('  TP Percentages:', testData.tpPercentages.join('%, ') + '%');
    console.log('  Minimum Order Value:', testData.minOrderValue, 'USDT\\n');
    
    // Simulate the improved algorithm
    const viableOrders = [];
    let remainingQuantity = testData.positionQuantity;
    
    for (let i = 0; i < testData.takeProfitLevels.length; i++) {
      const tpPrice = testData.takeProfitLevels[i];
      const originalPercentage = testData.tpPercentages[i] / 100;
      let tpQuantity = testData.positionQuantity * originalPercentage;
      
      console.log(`🎯 Processing TP${i + 1}:`);
      console.log(`  Price: ${tpPrice} USDT`);
      console.log(`  Original Quantity: ${tpQuantity.toFixed(6)} SUI (${testData.tpPercentages[i]}%)`);
      console.log(`  Original Value: ${(tpQuantity * tpPrice).toFixed(2)} USDT`);
      console.log(`  Remaining Quantity: ${remainingQuantity.toFixed(6)} SUI`);
      
      // Calculate minimum quantity needed
      const minQuantityForValue = testData.minOrderValue / tpPrice;
      
      // Check if adjustment is needed
      if (tpQuantity * tpPrice < testData.minOrderValue) {
        console.log(`  ❌ Below minimum (${testData.minOrderValue} USDT)`);
        
        if (minQuantityForValue <= remainingQuantity) {
          tpQuantity = minQuantityForValue;
          console.log(`  🔧 Adjusted to minimum: ${tpQuantity.toFixed(6)} SUI`);
          console.log(`  ✅ Adjusted Value: ${(tpQuantity * tpPrice).toFixed(2)} USDT`);
        } else {
          if (remainingQuantity * tpPrice >= testData.minOrderValue) {
            tpQuantity = remainingQuantity;
            console.log(`  🔧 Using all remaining: ${tpQuantity.toFixed(6)} SUI`);
            console.log(`  ✅ Final Value: ${(tpQuantity * tpPrice).toFixed(2)} USDT`);
          } else {
            console.log(`  ⏭️  Skipping - insufficient remaining quantity`);
            console.log(`      Need: ${minQuantityForValue.toFixed(6)} SUI`);
            console.log(`      Have: ${remainingQuantity.toFixed(6)} SUI`);
            continue;
          }
        }
      } else {
        console.log(`  ✅ Already meets minimum requirement`);
      }
      
      // Add to viable orders
      viableOrders.push({
        index: i + 1,
        price: tpPrice,
        quantity: tpQuantity,
        value: tpQuantity * tpPrice,
        percentage: (tpQuantity / testData.positionQuantity * 100).toFixed(1)
      });
      
      remainingQuantity -= tpQuantity;
      console.log(`  📝 Order added - Remaining: ${Math.max(0, remainingQuantity).toFixed(6)} SUI`);
      
      if (remainingQuantity <= 0) {
        console.log(`  🏁 All quantity allocated`);
        break;
      }
      
      console.log('');
    }
    
    // Summary
    console.log('\\n📋 FINAL RESULTS:');
    console.log('=' .repeat(50));
    
    if (viableOrders.length === 0) {
      console.log('❌ No viable take profit orders could be created');
    } else {
      console.log(`✅ Created ${viableOrders.length} viable orders:`);
      
      let totalValue = 0;
      viableOrders.forEach((order, index) => {
        console.log(`  TP${order.index}: ${order.quantity.toFixed(6)} SUI at ${order.price} USDT = ${order.value.toFixed(2)} USDT (${order.percentage}%)`);
        totalValue += order.value;
      });
      
      console.log(`\\nTotal TP Value: ${totalValue.toFixed(2)} USDT`);
      console.log(`Remaining Quantity: ${Math.max(0, remainingQuantity).toFixed(6)} SUI`);
    }
    
    console.log('\\n💡 Improvements:');
    console.log('  ✅ Smart quantity redistribution');
    console.log('  ✅ Respects remaining position limits');
    console.log('  ✅ Ensures all orders meet minimum value');
    console.log('  ✅ Detailed logging for debugging');
    console.log('  ✅ Graceful handling of edge cases');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testImprovedTPLogic();
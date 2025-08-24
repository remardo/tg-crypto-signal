const Signal = require('./src/models/Signal');
const Position = require('./src/models/Position');
const BingXService = require('./src/services/bingxService');
const { logger } = require('./src/utils/logger');

async function debugTakeProfitIssue() {
  try {
    console.log('🔍 Debugging Take Profit Issue...\n');
    
    // Get the latest FARTCOIN signal
    const signals = await Signal.findAll({ limit: 5 });
    const fartcoinSignal = signals.find(s => s.coin && s.coin.toUpperCase().includes('FARTCOIN'));
    
    if (!fartcoinSignal) {
      console.log('❌ No FARTCOIN signal found');
      return;
    }
    
    console.log('📊 FARTCOIN Signal Analysis:');
    console.log('Signal ID:', fartcoinSignal.id);
    console.log('Coin:', fartcoinSignal.coin);
    console.log('Direction:', fartcoinSignal.direction);
    console.log('Entry Price:', fartcoinSignal.entryPrice);
    console.log('Take Profit Levels:', fartcoinSignal.takeProfitLevels);
    console.log('Stop Loss:', fartcoinSignal.stopLoss);
    console.log('Leverage:', fartcoinSignal.leverage);
    console.log('Status:', fartcoinSignal.status);
    
    // Get related position
    const positions = await Position.findBySignalId(fartcoinSignal.id);
    if (positions.length === 0) {
      console.log('❌ No position found for this signal');
      return;
    }
    
    const position = positions[0];
    console.log('\n📈 Position Details:');
    console.log('Position ID:', position.id);
    console.log('Symbol:', position.symbol);
    console.log('Side:', position.side);
    console.log('Quantity:', position.quantity);
    console.log('Entry Price:', position.entryPrice);
    console.log('Status:', position.status);
    console.log('TP Percentages:', position.tpPercentages);
    
    // Check BingX for actual orders
    console.log('\n🔗 BingX Orders Check:');
    try {
      const bingx = new BingXService();
      await bingx.initialize();
      
      const orders = await bingx.getOpenOrders('FARTCOIN-USDT');
      console.log(`Found ${orders.length} open orders for FARTCOIN:`);
      
      orders.forEach((order, index) => {
        console.log(`  Order ${index + 1}:`);
        console.log(`    ID: ${order.orderId}`);
        console.log(`    Side: ${order.side}`);
        console.log(`    Type: ${order.type}`);
        console.log(`    Quantity: ${order.origQty}`);
        console.log(`    Price: ${order.price}`);
        console.log(`    Position Side: ${order.positionSide}`);
        console.log('');
      });
      
    } catch (bingxError) {
      console.log('⚠️  Could not get BingX orders:', bingxError.message);
    }
    
    // Simulate the take profit calculation
    console.log('\n🧮 Take Profit Calculation Simulation:');
    if (fartcoinSignal.takeProfitLevels && fartcoinSignal.takeProfitLevels.length > 0) {
      const tpPercentages = position.tpPercentages || [25.0, 25.0, 50.0];
      const minOrderValue = 3.72; // BingX minimum
      
      console.log('TP Levels:', fartcoinSignal.takeProfitLevels);
      console.log('TP Percentages:', tpPercentages);
      console.log('Position Quantity:', position.quantity);
      console.log('Minimum Order Value:', minOrderValue, 'USDT');
      
      let remainingQuantity = parseFloat(position.quantity);
      const viableOrders = [];
      
      for (let i = 0; i < fartcoinSignal.takeProfitLevels.length; i++) {
        const tpPrice = parseFloat(fartcoinSignal.takeProfitLevels[i]);
        const originalPercentage = tpPercentages[i] / 100;
        let tpQuantity = position.quantity * originalPercentage;
        
        console.log(`\\n🎯 TP${i + 1} Analysis:`);
        console.log(`  Price: ${tpPrice} USDT`);
        console.log(`  Original Quantity: ${tpQuantity.toFixed(6)} (${tpPercentages[i]}%)`);
        console.log(`  Original Value: ${(tpQuantity * tpPrice).toFixed(2)} USDT`);
        console.log(`  Remaining Quantity: ${remainingQuantity.toFixed(6)}`);
        
        // Calculate minimum quantity needed
        const minQuantityForValue = minOrderValue / tpPrice;
        console.log(`  Min Quantity for Value: ${minQuantityForValue.toFixed(6)}`);
        
        // Check if adjustment is needed
        if (tpQuantity * tpPrice < minOrderValue) {
          console.log(`  ❌ Below minimum value (${minOrderValue} USDT)`);
          
          if (minQuantityForValue <= remainingQuantity) {
            tpQuantity = minQuantityForValue;
            console.log(`  🔧 Adjusted to minimum: ${tpQuantity.toFixed(6)}`);
            console.log(`  ✅ Adjusted Value: ${(tpQuantity * tpPrice).toFixed(2)} USDT`);
          } else {
            if (remainingQuantity * tpPrice >= minOrderValue) {
              tpQuantity = remainingQuantity;
              console.log(`  🔧 Using all remaining: ${tpQuantity.toFixed(6)}`);
              console.log(`  ✅ Final Value: ${(tpQuantity * tpPrice).toFixed(2)} USDT`);
            } else {
              console.log(`  ⏭️  SKIPPED - insufficient remaining quantity`);
              console.log(`      Need: ${minQuantityForValue.toFixed(6)}`);
              console.log(`      Have: ${remainingQuantity.toFixed(6)}`);
              continue;
            }
          }
        } else {
          console.log(`  ✅ Meets minimum requirement`);
        }
        
        // Add to viable orders
        viableOrders.push({
          index: i + 1,
          price: tpPrice,
          quantity: tpQuantity,
          value: tpQuantity * tpPrice
        });
        
        remainingQuantity -= tpQuantity;
        console.log(`  📝 Added to viable orders - Remaining: ${Math.max(0, remainingQuantity).toFixed(6)}`);
        
        if (remainingQuantity <= 0) {
          console.log(`  🏁 All quantity allocated`);
          break;
        }
      }
      
      console.log('\\n📋 FINAL CALCULATION RESULTS:');
      console.log(`✅ Should create ${viableOrders.length} take profit orders:`);
      viableOrders.forEach((order, index) => {
        console.log(`  TP${order.index}: ${order.quantity.toFixed(6)} at ${order.price} = ${order.value.toFixed(2)} USDT`);
      });
      
      if (viableOrders.length === 1) {
        console.log('\\n🔍 WHY ONLY ONE ORDER?');
        console.log('This suggests the original quantities for TP2 and TP3 were too small.');
        console.log('Check if the position size was smaller than expected.');
      }
      
    } else {
      console.log('❌ No take profit levels found in signal');
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

debugTakeProfitIssue();
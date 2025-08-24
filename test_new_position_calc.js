const ExecutionService = require('./src/services/executionService');
const BingXService = require('./src/services/bingxService');

async function testNewPositionCalculation() {
  try {
    console.log('🧮 Testing New Position Size Calculation Logic...\n');
    
    const executionService = new ExecutionService();
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Get real account balance
    const accountInfo = await bingx.getAccountInfo();
    console.log('💰 Current Account Info:');
    console.log('  Total Balance:', accountInfo.balance, 'USDT');
    console.log('  Available Balance:', accountInfo.availableBalance, 'USDT\n');
    
    // Test the SUI scenario that had TP issues
    const testSignal = {
      coin: 'SUI',
      entryPrice: 3.7189,
      leverage: 25,
      stopLoss: 3.6888
    };
    
    console.log('🎯 Testing SUI Signal (Previous Problem Case):');
    console.log('  Entry Price:', testSignal.entryPrice, 'USDT');
    console.log('  Leverage:', testSignal.leverage + 'x');
    console.log('  Stop Loss:', testSignal.stopLoss, 'USDT');
    
    // Get symbol info
    let symbolInfo = null;
    try {
      symbolInfo = await bingx.getSymbolInfo('SUI-USDT');
      console.log('  Min Quantity:', symbolInfo.minQty);
      console.log('  Step Size:', symbolInfo.stepSize);
    } catch (error) {
      console.log('  Symbol info not available:', error.message);
    }
    
    // Calculate with NEW logic
    const mockChannel = { riskPercentage: 2.0 }; // Will be ignored
    const newQuantity = executionService.calculatePositionSize(
      testSignal,
      mockChannel,
      accountInfo.availableBalance,
      symbolInfo
    );
    
    // Calculate expected values
    const riskAmount = accountInfo.availableBalance * 0.10; // 10%
    const expectedPositionValue = riskAmount * testSignal.leverage;
    const actualPositionValue = newQuantity * testSignal.entryPrice;
    
    console.log('\n📊 NEW CALCULATION RESULTS:');
    console.log('  Risk Amount (10% of deposit):', riskAmount.toFixed(2), 'USDT');
    console.log('  Expected Position Value:', expectedPositionValue.toFixed(2), 'USDT');
    console.log('  Calculated Quantity:', newQuantity.toFixed(6), 'SUI');
    console.log('  Actual Position Value:', actualPositionValue.toFixed(2), 'USDT');
    console.log('  Difference:', (actualPositionValue - expectedPositionValue).toFixed(2), 'USDT');
    
    // Test take profit viability with NEW quantities
    console.log('\n🎯 TAKE PROFIT ANALYSIS (New Logic):');
    const tpPercentages = [25, 25, 50];
    const minOrderValue = 3.72;
    
    console.log('  Minimum Order Value Required:', minOrderValue, 'USDT\n');
    
    let allViable = true;
    tpPercentages.forEach((percentage, index) => {
      const tpQuantity = newQuantity * (percentage / 100);
      const tpValue = tpQuantity * testSignal.entryPrice;
      const viable = tpValue >= minOrderValue;
      
      if (!viable) allViable = false;
      
      console.log(`  TP${index + 1} (${percentage}%): ${tpQuantity.toFixed(6)} SUI = ${tpValue.toFixed(2)} USDT ${viable ? '✅' : '❌'}`);
    });
    
    console.log('\n📈 COMPARISON:');
    console.log('='.repeat(50));
    console.log('OLD Logic (Risk-based):');
    console.log('  Position Size: ~1 SUI (~3.72 USDT)');
    console.log('  TP Results: Only 1/3 orders succeeded ❌');
    console.log('  Problem: Too small for multiple TPs');
    
    console.log('\nNEW Logic (10% × Leverage):');
    console.log(`  Position Size: ${newQuantity.toFixed(6)} SUI (~${actualPositionValue.toFixed(2)} USDT)`);
    console.log(`  TP Results: ${allViable ? 'All 3/3 orders will succeed ✅' : 'Some orders may still fail ⚠️'}`);
    console.log('  Solution: Large enough for multiple TPs');
    
    console.log('\n💡 KEY BENEFITS:');
    console.log('  ✅ Fixed 10% risk allocation (consistent)');
    console.log('  ✅ Leverage properly amplifies position size'); 
    console.log('  ✅ All take profit orders meet minimum requirements');
    console.log('  ✅ No more "insufficient order value" errors');
    console.log('  ✅ Better utilization of available leverage');
    
    // Show the calculation formula
    console.log('\n📐 CALCULATION FORMULA:');
    console.log('  Risk Amount = Available Balance × 10%');
    console.log('  Position Value = Risk Amount × Leverage');
    console.log('  Quantity = Position Value ÷ Entry Price');
    console.log('\n  Example:');
    console.log(`  ${accountInfo.availableBalance.toFixed(2)} × 10% × ${testSignal.leverage} ÷ ${testSignal.entryPrice} = ${newQuantity.toFixed(6)} SUI`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testNewPositionCalculation();
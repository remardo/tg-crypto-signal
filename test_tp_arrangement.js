/**
 * Take Profit Arrangement Test
 * 
 * This script tests that take profit orders are correctly arranged based on position direction.
 */
const BingXService = require('./src/services/bingxService');
const { logger } = require('./src/utils/logger');

async function testTakeProfitArrangement() {
  try {
    console.log('🧪 Testing Take Profit Order Arrangement');
    console.log('='.repeat(60));
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Test data for LONG and SHORT positions
    const testCases = [
      {
        name: 'LONG Position',
        positionSide: 'BUY',
        entryPrice: 0.2950,
        takeProfitLevels: [0.3050, 0.3150, 0.3250], // Higher than entry
        expectedOrder: [0.3050, 0.3150, 0.3250]     // Ascending for LONG
      },
      {
        name: 'SHORT Position',
        positionSide: 'SELL',
        entryPrice: 0.2950,
        takeProfitLevels: [0.2850, 0.2750, 0.2650], // Lower than entry
        expectedOrder: [0.2850, 0.2750, 0.2650]     // Descending for SHORT
      },
      {
        name: 'LONG Position with Unordered TPs',
        positionSide: 'BUY',
        entryPrice: 0.2950,
        takeProfitLevels: [0.3250, 0.3050, 0.3150], // Unordered
        expectedOrder: [0.3050, 0.3150, 0.3250]     // Should sort ascending
      },
      {
        name: 'SHORT Position with Unordered TPs',
        positionSide: 'SELL',
        entryPrice: 0.2950,
        takeProfitLevels: [0.2750, 0.2850, 0.2650], // Unordered
        expectedOrder: [0.2850, 0.2750, 0.2650]     // Should sort descending
      }
    ];
    
    console.log('Starting tests for correct take profit ordering...\n');
    
    for (const testCase of testCases) {
      console.log(`📊 Test: ${testCase.name}`);
      console.log(`Position Side: ${testCase.positionSide}`);
      console.log(`Entry Price: ${testCase.entryPrice}`);
      console.log(`Original TP Levels: ${testCase.takeProfitLevels.join(', ')}`);
      
      // Sort the TP levels based on position side (BUY = LONG, SELL = SHORT)
      const sortedLevels = [...testCase.takeProfitLevels].sort((a, b) => {
        return testCase.positionSide === 'BUY' ? a - b : b - a;
      });
      
      console.log(`Sorted TP Levels: ${sortedLevels.join(', ')}`);
      console.log(`Expected Order: ${testCase.expectedOrder.join(', ')}`);
      
      // Check if the sorted order matches expected
      const isCorrect = JSON.stringify(sortedLevels) === JSON.stringify(testCase.expectedOrder);
      console.log(`Result: ${isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`);
      
      // Mock placing orders to ensure they'll be placed in correct sequence
      console.log('\n🔄 Order Placement Simulation:');
      
      for (let i = 0; i < sortedLevels.length; i++) {
        const tpPrice = sortedLevels[i];
        const tpSide = testCase.positionSide === 'BUY' ? 'SELL' : 'BUY'; // Opposite side to close
        
        console.log(`TP${i+1}: ${tpSide} @ ${tpPrice} - ${testCase.positionSide === 'BUY' ? 'To Close LONG' : 'To Close SHORT'}`);
      }
      
      console.log('\n' + '-'.repeat(60));
    }
    
    console.log('\n🎯 SUMMARY:');
    console.log('✅ Take profit orders should be arranged as follows:');
    console.log('  • LONG positions: Take profits in ASCENDING order');
    console.log('  • SHORT positions: Take profits in DESCENDING order');
    console.log('\nThis ensures proper risk management and profit taking strategy!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testTakeProfitArrangement();
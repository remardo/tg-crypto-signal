// Test file to verify trade execution fixes
const TradeExecutionService = require('../services/tradeExecutionService');

async function testTradeExecutionFixes() {
  const tradeService = new TradeExecutionService();
  
  // Test rounding function
  console.log('Testing roundToTickSize function:');
  console.log('Rounding 123.456789 to tick size 0.001:', tradeService.roundToTickSize(123.456789, 0.001));
  console.log('Rounding 123.456789 to tick size 0.01:', tradeService.roundToTickSize(123.456789, 0.01));
  console.log('Rounding 123.456789 to tick size 0.1:', tradeService.roundToTickSize(123.456789, 0.1));
  
  // Test order data formatting
  const mockTakeProfit = {
    type: 'TAKE_PROFIT_MARKET',
    stopPrice: 123.456789,
    workingType: 'MARK_PRICE'
  };
  
  const mockStopLoss = {
    type: 'STOP_MARKET',
    stopPrice: 120.123456,
    workingType: 'MARK_PRICE'
  };
  
  console.log('\nTesting JSON string formatting:');
  console.log('Take Profit JSON:', JSON.stringify(mockTakeProfit));
  console.log('Stop Loss JSON:', JSON.stringify(mockStopLoss));
  
  // Test symbol formatting
  console.log('\nTesting symbol formatting:');
  console.log('Formatting "BTCUSDT":', tradeService.bingx.formatSymbol('BTCUSDT'));
  console.log('Formatting "ETH-USDT":', tradeService.bingx.formatSymbol('ETH-USDT'));
  console.log('Formatting "XRP":', tradeService.bingx.formatSymbol('XRP'));
}

// Run the test
testTradeExecutionFixes().catch(console.error);

module.exports = testTradeExecutionFixes;
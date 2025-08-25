const TradeExecutionService = require('../services/tradeExecutionService');
const { logger } = require('./logger');

/**
 * Test script to demonstrate trade execution with BingX API specifics
 */
async function testTradeExecution() {
  const tradeService = new TradeExecutionService();
  
  try {
    // Example trade parameters
    const tradeParams = {
      symbol: 'BTC-USDT', // Trading pair
      side: 'BUY',        // BUY for long, SELL for short
      quantity: 0.001,    // Quantity to trade
      leverage: 10,       // Leverage (optional)
      subAccountId: null, // Sub-account ID (optional)
      riskManagement: {
        stopLoss: 70000,     // Stop loss price (optional)
        takeProfit: 80000    // Take profit price (optional)
      }
    };
    
    logger.info('Testing trade execution with parameters:', tradeParams);
    
    // Execute the trade
    const result = await tradeService.executeTrade(tradeParams);
    
    logger.info('Trade execution result:', result);
    
    return result;
  } catch (error) {
    logger.error('Trade execution failed:', error);
    throw error;
  }
}

/**
 * Test position closing
 */
async function testClosePosition(positionId, subAccountId = null) {
  const tradeService = new TradeExecutionService();
  
  try {
    logger.info('Testing position closing:', { positionId, subAccountId });
    
    const result = await tradeService.closePosition(positionId, subAccountId);
    
    logger.info('Position closing result:', result);
    
    return result;
  } catch (error) {
    logger.error('Position closing failed:', error);
    throw error;
  }
}

/**
 * Test account information retrieval
 */
async function testAccountInfo(subAccountId = null) {
  const tradeService = new TradeExecutionService();
  
  try {
    logger.info('Testing account info retrieval');
    
    const accountInfo = await tradeService.getAccountInfo(subAccountId);
    
    logger.info('Account info:', accountInfo);
    
    return accountInfo;
  } catch (error) {
    logger.error('Account info retrieval failed:', error);
    throw error;
  }
}

module.exports = {
  testTradeExecution,
  testClosePosition,
  testAccountInfo
};
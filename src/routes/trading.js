const express = require('express');
const router = express.Router();
const { asyncHandler, NotFoundError } = require('../middleware/errorHandler');
const { validateTradeExecution, validatePositionId } = require('../middleware/tradingValidation'); // Updated import
const { logger } = require('../utils/logger');
const TradeExecutionService = require('../services/tradeExecutionService');

// Execute a trade
router.post('/execute', 
  validateTradeExecution,
  asyncHandler(async (req, res) => {
    const { symbol, side, quantity, leverage, subAccountId, riskManagement } = req.body;
    
    const tradeService = new TradeExecutionService();
    const result = await tradeService.executeTrade({
      symbol,
      side,
      quantity,
      leverage,
      subAccountId,
      riskManagement
    });

    logger.info('Trade executed successfully', { 
      symbol, 
      side, 
      quantity,
      orderId: result.order.orderId 
    });

    res.json({
      success: true,
      data: result,
      message: 'Trade executed successfully'
    });
  })
);

// Close a position
router.post('/close/:positionId',
  validatePositionId, // Updated validation
  asyncHandler(async (req, res) => {
    const { positionId } = req.params;
    const { subAccountId } = req.body;
    
    const tradeService = new TradeExecutionService();
    const result = await tradeService.closePosition(positionId, subAccountId);

    logger.info('Position closed successfully', { positionId });

    res.json({
      success: true,
      data: result,
      message: 'Position closed successfully'
    });
  })
);

// Get account info
router.get('/account',
  asyncHandler(async (req, res) => {
    const { subAccountId } = req.query;
    
    const tradeService = new TradeExecutionService();
    const accountInfo = await tradeService.getAccountInfo(subAccountId);

    res.json({
      success: true,
      data: accountInfo
    });
  })
);

// Get positions
router.get('/positions',
  asyncHandler(async (req, res) => {
    const { subAccountId } = req.query;
    
    const tradeService = new TradeExecutionService();
    const positions = await tradeService.getPositions(subAccountId);

    res.json({
      success: true,
      data: positions
    });
  })
);

module.exports = router;
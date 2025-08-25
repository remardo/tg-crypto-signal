const { ValidationError } = require('./errorHandler');

/**
 * Validate trade execution parameters
 */
function validateTradeExecution(req, res, next) {
  const { symbol, side, quantity, leverage, subAccountId, riskManagement } = req.body;
  
  // Validate required fields
  if (!symbol) {
    throw new ValidationError('symbol is required');
  }
  
  if (!side) {
    throw new ValidationError('side is required');
  }
  
  if (side !== 'BUY' && side !== 'SELL') {
    throw new ValidationError('side must be either BUY or SELL');
  }
  
  if (!quantity) {
    throw new ValidationError('quantity is required');
  }
  
  if (isNaN(quantity) || quantity <= 0) {
    throw new ValidationError('quantity must be a positive number');
  }
  
  // Validate optional fields
  if (leverage !== undefined && (isNaN(leverage) || leverage <= 0)) {
    throw new ValidationError('leverage must be a positive number');
  }
  
  // Validate risk management parameters
  if (riskManagement) {
    if (riskManagement.stopLoss !== undefined && isNaN(riskManagement.stopLoss)) {
      throw new ValidationError('stopLoss must be a number');
    }
    
    if (riskManagement.takeProfit !== undefined && isNaN(riskManagement.takeProfit)) {
      throw new ValidationError('takeProfit must be a number');
    }
  }
  
  next();
}

/**
 * Validate position ID parameter
 */
function validatePositionId(req, res, next) {
  const { positionId } = req.params;
  
  if (!positionId) {
    throw new ValidationError('positionId is required');
  }
  
  // Basic UUID validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(positionId)) {
    throw new ValidationError('positionId must be a valid UUID');
  }
  
  next();
}

module.exports = {
  validateTradeExecution,
  validatePositionId
};
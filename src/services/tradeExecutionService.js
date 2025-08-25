const { logger, trade: tradeLog } = require('../utils/logger');
const BingXService = require('./bingxService');
const Position = require('../models/Position');
const Decimal = require('decimal.js');

class TradeExecutionService {
  constructor() {
    this.bingx = new BingXService();
  }

  /**
   * Execute a trade with proper handling of BingX API specifics
   * @param {Object} tradeParams - Trade parameters
   * @param {string} tradeParams.symbol - Trading pair (e.g., "BTC-USDT")
   * @param {string} tradeParams.side - "BUY" or "SELL"
   * @param {number} tradeParams.quantity - Quantity to trade
   * @param {number} tradeParams.leverage - Leverage to use
   * @param {string} tradeParams.subAccountId - Sub-account ID (optional)
   * @param {Object} tradeParams.riskManagement - Risk management parameters
   * @returns {Promise<Object>} Execution result
   */
  async executeTrade(tradeParams) {
    try {
      const {
        symbol,
        side,
        quantity,
        leverage,
        subAccountId,
        riskManagement = {}
      } = tradeParams;

      logger.info('Starting trade execution', {
        symbol,
        side,
        quantity,
        leverage,
        subAccountId
      });

      // 1. Validate symbol
      const symbolInfo = await this.validateSymbol(symbol);
      if (!symbolInfo) {
        throw new Error(`Invalid symbol: ${symbol}`);
      }

      // 2. Validate and adjust quantity to step size
      const adjustedQuantity = this.adjustToStepSize(quantity, symbolInfo.stepSize);
      logger.info('Quantity adjusted to step size', {
        original: quantity,
        adjusted: adjustedQuantity,
        stepSize: symbolInfo.stepSize
      });

      // 3. Validate quantity against min/max limits
      this.validateQuantity(adjustedQuantity, symbolInfo);

      // 4. Set leverage (if specified)
      if (leverage && leverage > 1) {
        await this.setLeverage(symbol, leverage, subAccountId);
      }

      // 5. Prepare risk management parameters
      let takeProfitParam = null;
      let stopLossParam = null;
      
      if (riskManagement.takeProfit) {
        takeProfitParam = {
          type: 'TAKE_PROFIT_MARKET',
          stopPrice: riskManagement.takeProfit.toString(),
          workingType: 'MARK_PRICE'
        };
      }
      
      if (riskManagement.stopLoss) {
        stopLossParam = {
          type: 'STOP_MARKET',
          stopPrice: riskManagement.stopLoss.toString(),
          workingType: 'MARK_PRICE'
        };
      }

      // 6. Place main order with risk management parameters
      const orderResult = await this.placeMainOrder({
        symbol,
        side,
        quantity: adjustedQuantity,
        leverage,
        subAccountId,
        takeProfit: takeProfitParam,
        stopLoss: stopLossParam
      });

      // 7. Create position record
      const position = await this.createPositionRecord({
        symbol,
        side,
        quantity: adjustedQuantity,
        entryPrice: orderResult.executedPrice,
        leverage,
        stopLoss: riskManagement.stopLoss,
        takeProfit: riskManagement.takeProfit,
        orderId: orderResult.orderId,
        subAccountId
      });

      logger.info('Trade execution completed successfully', {
        orderId: orderResult.orderId,
        positionId: position.id
      });

      return {
        success: true,
        order: orderResult,
        position,
        riskOrders: [] // Risk orders are now part of the main order
      };

    } catch (error) {
      logger.error('Trade execution failed:', error);
      throw error;
    }
  }

  /**
   * Validate symbol exists and get its information
   * @param {string} symbol - Trading pair
   * @returns {Promise<Object>} Symbol information
   */
  async validateSymbol(symbol) {
    try {
      const supportedSymbols = await this.bingx.getSupportedSymbols();
      const symbolInfo = supportedSymbols.find(s => s.symbol === symbol);
      
      if (!symbolInfo) {
        logger.warn(`Symbol ${symbol} not found in supported symbols`);
        // Try to get symbol info directly
        try {
          return await this.bingx.getSymbolInfo(symbol);
        } catch (error) {
          logger.error(`Could not get info for symbol ${symbol}:`, error);
          return null;
        }
      }
      
      return symbolInfo;
    } catch (error) {
      logger.error(`Error validating symbol ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Adjust quantity to match exchange step size
   * @param {number} quantity - Original quantity
   * @param {number} stepSize - Exchange step size
   * @returns {number} Adjusted quantity
   */
  adjustToStepSize(quantity, stepSize) {
    if (!stepSize || stepSize <= 0) {
      return quantity;
    }
    
    // Round down to nearest step size multiple
    const steps = Math.floor(quantity / stepSize);
    return steps * stepSize;
  }

  /**
   * Validate quantity against exchange limits
   * @param {number} quantity - Quantity to validate
   * @param {Object} symbolInfo - Symbol information
   */
  validateQuantity(quantity, symbolInfo) {
    if (quantity < symbolInfo.minQty) {
      throw new Error(`Quantity ${quantity} below minimum ${symbolInfo.minQty}`);
    }
    
    if (quantity > symbolInfo.maxQty) {
      throw new Error(`Quantity ${quantity} exceeds maximum ${symbolInfo.maxQty}`);
    }
  }

  /**
   * Set leverage for a symbol
   * @param {string} symbol - Trading pair
   * @param {number} leverage - Leverage to set
   * @param {string} subAccountId - Sub-account ID
   */
  async setLeverage(symbol, leverage, subAccountId) {
    try {
      // Format symbol to match BingX API requirements (e.g., "DYDX-USDT" instead of "DYDXUSDT")
      const formattedSymbol = this.bingx.formatSymbol(symbol);
      
      const result = await this.bingx.setLeverage(formattedSymbol, leverage, subAccountId);
      logger.info('Leverage set successfully', {
        symbol: formattedSymbol,
        leverage,
        result
      });
    } catch (error) {
      logger.warn(`Failed to set leverage for ${symbol}:`, error);
      // Don't throw error as this might not be critical
    }
  }

  /**
   * Place main market order
   * @param {Object} orderParams - Order parameters
   * @returns {Promise<Object>} Order result
   */
  async placeMainOrder(orderParams) {
    const { symbol, side, quantity, leverage, subAccountId, takeProfit, stopLoss } = orderParams;
    
    // Format symbol to match BingX API requirements (e.g., "DYDX-USDT" instead of "DYDXUSDT")
    const formattedSymbol = this.bingx.formatSymbol(symbol);
    
    const orderData = {
      symbol: formattedSymbol,
      side,
      type: 'MARKET',
      quantity,
      ...(leverage && { leverage }),
      reduceOnly: false,
      recvWindow: 5000
    };

    // Add takeProfit parameter if provided, formatted as JSON string
    if (takeProfit) {
      if (typeof takeProfit === 'string') {
        orderData.takeProfit = takeProfit;
      } else {
        // Format as JSON string matching API example format
        orderData.takeProfit = JSON.stringify(takeProfit).replace(/:/g, ': ').replace(/,/g, ', ');
      }
    }

    // Add stopLoss parameter if provided, formatted as JSON string
    if (stopLoss) {
      if (typeof stopLoss === 'string') {
        orderData.stopLoss = stopLoss;
      } else {
        // Format as JSON string matching API example format
        orderData.stopLoss = JSON.stringify(stopLoss).replace(/:/g, ': ').replace(/,/g, ', ');
      }
    }

    try {
      const result = await this.bingx.placeOrder(orderData, subAccountId);
      
      tradeLog('main_order_placed', {
        symbol: formattedSymbol,
        side,
        quantity,
        orderId: result.orderId,
        executedPrice: result.executedPrice,
        executedQty: result.executedQty
      });

      return result;
    } catch (error) {
      logger.error('Failed to place main order:', error);
      throw new Error(`Failed to place main order: ${error.message}`);
    }
  }

  /**
   * Place stop loss order
   * @param {Object} slParams - Stop loss parameters
   * @returns {Promise<Object>} Order result
   */
  async placeStopLossOrder(slParams) {
    const { symbol, side, quantity, stopPrice, subAccountId } = slParams;
    
    // Format symbol to match BingX API requirements (e.g., "DYDX-USDT" instead of "DYDXUSDT")
    const formattedSymbol = this.bingx.formatSymbol(symbol);
    
    // Determine close side (opposite of position side)
    const closeSide = side === 'BUY' ? 'SELL' : 'BUY';
    const positionSide = side === 'BUY' ? 'LONG' : 'SHORT';

    // Format stopLoss as JSON string with all values as strings to match API example
    const stopLoss = {
      type: 'STOP_MARKET',
      stopPrice: stopPrice.toString(), // Convert to string
      workingType: 'MARK_PRICE'
    };

    const orderData = {
      symbol: formattedSymbol,
      side: closeSide,
      positionSide,
      type: 'MARKET', // Use MARKET order with reduceOnly for proper execution
      quantity,
      reduceOnly: true, // Critical for closing positions
      stopLoss: JSON.stringify(stopLoss).replace(/:/g, ': ').replace(/,/g, ', '),
      recvWindow: 5000
    };

    try {
      const result = await this.bingx.placeOrder(orderData, subAccountId);
      
      tradeLog('stop_loss_placed', {
        symbol: formattedSymbol,
        side: closeSide,
        positionSide,
        quantity,
        stopPrice,
        orderId: result.orderId
      });

      return result;
    } catch (error) {
      logger.error('Failed to place stop loss order:', error);
      throw new Error(`Failed to place stop loss order: ${error.message}`);
    }
  }

  /**
   * Place take profit order
   * @param {Object} tpParams - Take profit parameters
   * @returns {Promise<Object>} Order result
   */
  async placeTakeProfitOrder(tpParams) {
    const { symbol, side, quantity, takeProfitPrice, subAccountId } = tpParams;
    
    // Format symbol to match BingX API requirements (e.g., "DYDX-USDT" instead of "DYDXUSDT")
    const formattedSymbol = this.bingx.formatSymbol(symbol);
    
    // Determine close side (opposite of position side)
    const closeSide = side === 'BUY' ? 'SELL' : 'BUY';
    const positionSide = side === 'BUY' ? 'LONG' : 'SHORT';

    // Format takeProfit as JSON string with all values as strings to match API example
    const takeProfit = {
      type: 'TAKE_PROFIT_MARKET',
      stopPrice: takeProfitPrice.toString(), // Convert to string
      workingType: 'MARK_PRICE'
    };

    const orderData = {
      symbol: formattedSymbol,
      side: closeSide,
      positionSide,
      type: 'MARKET', // Use MARKET order with reduceOnly for proper execution
      quantity,
      reduceOnly: true, // Critical for closing positions
      takeProfit: JSON.stringify(takeProfit).replace(/:/g, ': ').replace(/,/g, ', '),
      recvWindow: 5000
    };

    try {
      const result = await this.bingx.placeOrder(orderData, subAccountId);
      
      tradeLog('take_profit_placed', {
        symbol: formattedSymbol,
        side: closeSide,
        positionSide,
        quantity,
        takeProfitPrice,
        orderId: result.orderId
      });

      return result;
    } catch (error) {
      logger.error('Failed to place take profit order:', error);
      throw new Error(`Failed to place take profit order: ${error.message}`);
    }
  }

  /**
   * Create position record in database
   * @param {Object} positionData - Position data
   * @returns {Promise<Object>} Position object
   */
  async createPositionRecord(positionData) {
    try {
      const position = await Position.create({
        signalId: null, // Manual trade, no signal
        channelId: null, // Manual trade, no channel
        subAccountId: positionData.subAccountId || 'main',
        symbol: positionData.symbol,
        side: positionData.side,
        quantity: positionData.quantity,
        entryPrice: positionData.entryPrice,
        leverage: positionData.leverage,
        takeProfitLevels: positionData.takeProfit ? [positionData.takeProfit] : [],
        stopLoss: positionData.stopLoss,
        bingxOrderId: positionData.orderId,
        tpPercentages: [100.0] // Full position for manual trades
      });

      return position;
    } catch (error) {
      logger.error('Failed to create position record:', error);
      throw new Error(`Failed to create position record: ${error.message}`);
    }
  }

  /**
   * Close an existing position
   * @param {string} positionId - Position ID
   * @param {string} subAccountId - Sub-account ID
   * @returns {Promise<Object>} Close result
   */
  async closePosition(positionId, subAccountId) {
    try {
      const position = await Position.findById(positionId);
      if (!position) {
        throw new Error('Position not found');
      }

      if (position.status !== 'open') {
        throw new Error('Position is not open');
      }

      // Format symbol to match BingX API requirements (e.g., "DYDX-USDT" instead of "DYDXUSDT")
      const formattedSymbol = this.bingx.formatSymbol(position.symbol);
      
      // Close position on exchange
      const closeResult = await this.bingx.closePosition(
        formattedSymbol,
        position.quantity,
        subAccountId
      );

      // Update position in database
      await position.close(
        closeResult.executedPrice || position.currentPrice,
        0, // Realized P&L will be updated by position service
        0  // Fees will be updated by position service
      );

      tradeLog('position_closed', {
        positionId,
        symbol: formattedSymbol,
        quantity: position.quantity,
        closeResult
      });

      return {
        success: true,
        position,
        closeResult
      };

    } catch (error) {
      logger.error(`Failed to close position ${positionId}:`, error);
      throw error;
    }
  }

  /**
   * Get account information
   * @param {string} subAccountId - Sub-account ID
   * @returns {Promise<Object>} Account information
   */
  async getAccountInfo(subAccountId) {
    try {
      return await this.bingx.getAccountInfo(subAccountId);
    } catch (error) {
      logger.error('Failed to get account info:', error);
      throw new Error(`Failed to get account info: ${error.message}`);
    }
  }

  /**
   * Get current positions
   * @param {string} subAccountId - Sub-account ID
   * @returns {Promise<Array>} List of positions
   */
  async getPositions(subAccountId) {
    try {
      return await this.bingx.getPositions(subAccountId);
    } catch (error) {
      logger.error('Failed to get positions:', error);
      throw new Error(`Failed to get positions: ${error.message}`);
    }
  }
}

module.exports = TradeExecutionService;
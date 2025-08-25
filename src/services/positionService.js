const { redisUtils, CHANNELS } = require('../config/redis');
const { logger, trade: tradeLog } = require('../utils/logger');
const Position = require('../models/Position');
const Channel = require('../models/Channel');
const Account = require('../models/Account');
const BingXService = require('./bingxService');
const Decimal = require('decimal.js');

class PositionService {
  constructor() {
    this.bingx = new BingXService();
    this.isUpdating = false;
    this.updateInterval = null;
    this.priceCache = new Map();
    this.updateFrequency = 5000; // 5 seconds
  }

  async initialize() {
    try {
      // Initialize BingX service if not already done
      if (!this.bingx.initialized) {
        await this.bingx.initialize();
      }

      // Start price update service
      await this.startPriceUpdater();
      
      // Subscribe to position updates
      await this.subscribeToPositionUpdates();
      
      // Start position sync service
      await this.startPositionSync();

      logger.info('Position service initialized successfully');
      return true;
      
    } catch (error) {
      logger.error('Failed to initialize position service:', error);
      throw error;
    }
  }

  async subscribeToPositionUpdates() {
    try {
      await redisUtils.subscribe(CHANNELS.POSITION_UPDATE, async (data) => {
        if (data.type === 'price_update') {
          await this.updatePositionPrices(data.symbol, data.price);
        }
      });

      await redisUtils.subscribe(CHANNELS.SIGNAL_EXECUTED, async (data) => {
        if (data.type === 'signal_executed' && data.position) {
          await this.cachePosition(data.position);
        }
      });

      logger.info('Subscribed to position update notifications');
      
    } catch (error) {
      logger.error('Error subscribing to position updates:', error);
    }
  }

  async startPriceUpdater() {
    // Update prices every 5 seconds
    this.updateInterval = setInterval(async () => {
      if (!this.isUpdating) {
        await this.updateAllPositionPrices();
      }
    }, this.updateFrequency);
    
    logger.info('Position price updater started');
  }

  async updateAllPositionPrices() {
    if (this.isUpdating) {
      return;
    }

    this.isUpdating = true;
    
    try {
      // Get all open positions
      const openPositions = await Position.getOpenPositions();
      
      if (openPositions.length === 0) {
        return;
      }

      // Group positions by symbol
      const symbolGroups = {};
      openPositions.forEach(position => {
        if (!symbolGroups[position.symbol]) {
          symbolGroups[position.symbol] = [];
        }
        symbolGroups[position.symbol].push(position);
      });

      // Update prices for each symbol
      for (const [symbol, positions] of Object.entries(symbolGroups)) {
        try {
          const priceData = await this.bingx.getSymbolPrice(symbol);
          const currentPrice = priceData.price;
          
          // Update cache
          this.priceCache.set(symbol, {
            price: currentPrice,
            timestamp: new Date()
          });

          // Update all positions for this symbol
          for (const position of positions) {
            await this.updatePositionPrice(position, currentPrice);
          }

          // Publish price update
          await redisUtils.publish(CHANNELS.POSITION_UPDATE, {
            type: 'price_update',
            symbol,
            price: currentPrice,
            timestamp: new Date()
          });

        } catch (error) {
          logger.error(`Error updating price for ${symbol}:`, error);
        }
      }

    } catch (error) {
      logger.error('Error updating all position prices:', error);
    } finally {
      this.isUpdating = false;
    }
  }

  async updatePositionPrice(position, currentPrice) {
    try {
      // Get account for this position
      const account = await Account.findByChannelId(position.channelId);
      if (account) {
        // Get positions from exchange
        const exchangePositions = await this.bingx.getPositions(account.bingxSubAccountId);
        const exchangePosition = exchangePositions.find(p => p.symbol === position.symbol);
        
        if (exchangePosition) {
          // Update position with real-time data from exchange
          await position.syncFromExchange(exchangePosition);
          
          // Check for take profit or stop loss triggers using exchange data
          await this.checkExitConditions(position, exchangePosition.markPrice);
          
          // Cache updated position
          await this.cachePosition(position);
          return;
        }
      }
      
      // Fallback to local calculation if exchange data is not available
      const unrealizedPnl = position.calculateUnrealizedPnl(currentPrice);
      
      // Update position with new price and P&L
      await position.updatePrice(currentPrice);
      
      // Check for take profit or stop loss triggers
      await this.checkExitConditions(position, currentPrice);
      
      // Cache updated position
      await this.cachePosition(position);

    } catch (error) {
      logger.error(`Error updating position ${position.id} price:`, error);
    }
  }

  async updatePositionPrices(symbol, price) {
    try {
      const positions = await Position.findAll({ symbol, status: 'open' });
      
      for (const position of positions) {
        await this.updatePositionPrice(position, price);
      }

    } catch (error) {
      logger.error(`Error updating positions for ${symbol}:`, error);
    }
  }

  async checkExitConditions(position, currentPrice) {
    try {
      // Check stop loss
      if (position.isAtStopLoss(currentPrice)) {
        await this.triggerStopLoss(position, currentPrice);
        return;
      }

      // Check take profit levels
      const tpTrigger = position.isAtTakeProfit(currentPrice);
      if (tpTrigger) {
        await this.triggerTakeProfit(position, currentPrice, tpTrigger.level);
        return;
      }

    } catch (error) {
      logger.error(`Error checking exit conditions for position ${position.id}:`, error);
    }
  }

  async triggerStopLoss(position, currentPrice) {
    try {
      tradeLog('stop_loss_triggered', {
        positionId: position.id,
        symbol: position.symbol,
        currentPrice,
        stopLoss: position.stopLoss,
        unrealizedPnl: position.unrealizedPnl
      });

      // Close position at market price
      await this.closePosition(position.id, 'stop_loss', currentPrice);

    } catch (error) {
      logger.error(`Error triggering stop loss for position ${position.id}:`, error);
    }
  }

  async triggerTakeProfit(position, currentPrice, tpLevel) {
    try {
      tradeLog('take_profit_triggered', {
        positionId: position.id,
        symbol: position.symbol,
        currentPrice,
        tpLevel,
        unrealizedPnl: position.unrealizedPnl
      });

      // Use position-specific TP percentages instead of hardcoded values
      const tpPercentages = position.tpPercentages || [50.0, 30.0, 20.0]; // Default fallback
      const tpIndex = tpLevel - 1; // Convert 1-based level to 0-based index
      
      let closePercentage = 0.2; // Default fallback
      if (tpIndex < tpPercentages.length) {
        closePercentage = tpPercentages[tpIndex] / 100; // Convert percentage to decimal
      }
      
      await this.closePosition(position.id, 'take_profit', currentPrice, closePercentage);

    } catch (error) {
      logger.error(`Error triggering take profit for position ${position.id}:`, error);
    }
  }

  async closePosition(positionId, reason = 'manual', closePrice = null, percentage = 1.0) {
    try {
      const position = await Position.findById(positionId);
      if (!position) {
        throw new Error('Position not found');
      }

      if (position.status !== 'open') {
        throw new Error('Position is not open');
      }

      // Get current price if not provided
      if (!closePrice) {
        // Format symbol to match BingX API requirements (e.g., "DYDX-USDT" instead of "DYDXUSDT")
        const formattedSymbol = this.bingx.formatSymbol(position.symbol);
        const priceData = await this.bingx.getSymbolPrice(formattedSymbol);
        closePrice = priceData.price;
      }

      // Calculate close quantity
      const closeQuantity = new Decimal(position.quantity).times(percentage).toNumber();
      
      // Get account info for sub-account
      const account = await Account.findByChannelId(position.channelId);
      if (!account) {
        throw new Error('Account not found for position');
      }

      // Format symbol to match BingX API requirements (e.g., "DYDX-USDT" instead of "DYDXUSDT")
      const formattedSymbol = this.bingx.formatSymbol(position.symbol);
      
      // Close position on BingX
      const closeResult = await this.bingx.closePosition(
        formattedSymbol,
        closeQuantity,
        account.bingxSubAccountId
      );

      // If position was already closed on exchange, update it as closed in database
      if (closeResult.status === 'already_closed') {
        // Try to get actual P&L from exchange data
        let realizedPnlData = { pnl: 0, fees: 0, total: 0, tradeValue: 0 };
        
        try {
          // Get recent order history for this symbol
          const orderHistory = await this.bingx.getOrderHistory(formattedSymbol, 20, account.bingxSubAccountId);
          
          // Find orders that might be related to this position
          const relatedOrders = orderHistory.filter(order => 
            order.symbol === formattedSymbol && 
            order.time > new Date(position.openedAt).getTime() &&
            (order.side !== position.side || order.type === 'TAKE_PROFIT_MARKET' || order.type === 'STOP_MARKET')
          );
          
          // Try to get income data directly from BingX (more accurate P&L data)
          const incomeHistory = await this.bingx.getIncomeHistory({
            symbol: formattedSymbol,
            incomeType: 'REALIZED_PNL',
            startTime: new Date(position.openedAt).getTime(),
            limit: 50
          }, account.bingxSubAccountId);
          
          // Sum up all realized P&L entries related to this position
          let totalRealizedPnl = new Decimal(0);
          let totalFees = new Decimal(0);
          
          if (incomeHistory && incomeHistory.length > 0) {
            for (const income of incomeHistory) {
              if (income.incomeType === 'REALIZED_PNL') {
                totalRealizedPnl = totalRealizedPnl.plus(income.income);
              } else if (income.incomeType === 'COMMISSION') {
                totalFees = totalFees.plus(income.income);
              }
            }
            
            // If we found realized P&L data, use it
            if (!totalRealizedPnl.isZero()) {
              realizedPnlData.pnl = totalRealizedPnl.toNumber();
              realizedPnlData.fees = Math.abs(totalFees.toNumber());
              realizedPnlData.total = totalRealizedPnl.minus(totalFees).toNumber();
              logger.info(`Retrieved realized P&L for position ${position.id} from income history: ${realizedPnlData.total}`);
            }
          }
          
          // If no P&L data from income history, try to calculate from order history
          if (totalRealizedPnl.isZero() && relatedOrders.length > 0) {
            // Calculate approximate P&L from the most recent related order
            const lastOrder = relatedOrders[0];
            const executedQty = lastOrder.executedQty || lastOrder.quantity;
            const avgPrice = lastOrder.avgPrice || lastOrder.price;
            
            if (executedQty > 0 && avgPrice > 0) {
              // Calculate P&L based on position direction
              let priceDiff;
              if (position.side === 'BUY') {
                priceDiff = new Decimal(avgPrice).minus(position.entryPrice);
              } else {
                priceDiff = new Decimal(position.entryPrice).minus(avgPrice);
              }
              
              const pnl = priceDiff.times(executedQty).times(position.leverage || 1);
              const tradeValue = new Decimal(avgPrice).times(executedQty);
              const fees = tradeValue.times(0.001); // Approximate 0.1% fees
              const netPnl = pnl.minus(fees);
              
              realizedPnlData = {
                pnl: pnl.toNumber(),
                fees: fees.toNumber(),
                total: netPnl.toNumber(),
                tradeValue: tradeValue.toNumber()
              };
              logger.info(`Calculated realized P&L for position ${position.id} from order history: ${realizedPnlData.total}`);
            }
          }
        } catch (historyError) {
          logger.warn(`Could not retrieve P&L from history for position ${position.id}:`, historyError);
        }
        
        // Mark position as closed in database with calculated or zero P&L
        await position.close(closePrice, realizedPnlData.total, realizedPnlData.fees);
        
        // Update account P&L
        await this.updateAccountPnl(account);

        // Cache updated position
        await this.cachePosition(position);

        // Notify about position close
        await this.notifyPositionClose(position, reason, closeResult);

        tradeLog('position_closed', {
          positionId: position.id,
          symbol: formattedSymbol,
          reason,
          closePrice,
          closeQuantity: 0,
          realizedPnl: realizedPnlData.pnl,
          percentage: percentage * 100,
          note: 'Position was already closed on exchange',
          estimatedPnl: realizedPnlData.total
        });

        return {
          success: true,
          position: position.toJSON(),
          closeResult,
          realizedPnl: realizedPnlData
        };
      }

      // First try to get realized P&L directly from BingX
      let realizedPnl = { pnl: 0, fees: 0, total: 0, tradeValue: 0 };
      
      try {
        // Try to get income data directly from BingX (accurate P&L data)
        const startTime = Date.now() - 60000; // Start from 1 minute ago to capture the close operation
        const incomeHistory = await this.bingx.getIncomeHistory({
          symbol: formattedSymbol,
          incomeType: 'REALIZED_PNL',
          startTime: startTime,
          limit: 10
        }, account.bingxSubAccountId);
        
        // Find realized P&L entries from this close operation
        if (incomeHistory && incomeHistory.length > 0) {
          let totalRealizedPnl = new Decimal(0);
          let totalFees = new Decimal(0);
          
          for (const income of incomeHistory) {
            if (income.incomeType === 'REALIZED_PNL') {
              totalRealizedPnl = totalRealizedPnl.plus(income.income);
            } else if (income.incomeType === 'COMMISSION') {
              totalFees = totalFees.plus(income.income);
            }
          }
          
          // If we found realized P&L data, use it
          if (!totalRealizedPnl.isZero()) {
            realizedPnl = {
              pnl: totalRealizedPnl.toNumber(),
              fees: Math.abs(totalFees.toNumber()),
              total: totalRealizedPnl.minus(totalFees).toNumber(),
              tradeValue: 0 // Will calculate this later if needed
            };
            logger.info(`Retrieved realized P&L for position ${position.id} from income history: ${realizedPnl.total}`);
          }
        }
      } catch (incomeError) {
        logger.warn(`Could not retrieve income history for position ${position.id}:`, incomeError);
      }
      
      // If we couldn't get realized P&L from BingX, calculate it ourselves
      if (realizedPnl.total === 0) {
        realizedPnl = this.calculateRealizedPnl(
          position,
          closePrice,
          closeQuantity
        );
        logger.info(`Calculated realized P&L for position ${position.id}: ${realizedPnl.total}`);
      }

      // Update position in database
      if (percentage >= 1.0) {
        // Full close
        await position.close(closePrice, realizedPnl.total, realizedPnl.fees);
      } else {
        // Partial close
        await position.partialClose(closeQuantity, closePrice, realizedPnl.pnl, realizedPnl.fees);
      }

      // Update account P&L
      await this.updateAccountPnl(account);

      // Cache updated position
      await this.cachePosition(position);

      // Notify about position close
      await this.notifyPositionClose(position, reason, closeResult);

      tradeLog('position_closed', {
        positionId: position.id,
        symbol: formattedSymbol,
        reason,
        closePrice,
        closeQuantity,
        realizedPnl: realizedPnl.pnl,
        percentage: percentage * 100
      });

      return {
        success: true,
        position: position.toJSON(),
        closeResult,
        realizedPnl
      };

    } catch (error) {
      logger.error(`Error closing position ${positionId}:`, error);
      throw error;
    }
  }

  calculateRealizedPnl(position, closePrice, closeQuantity) {
    try {
      const entryPrice = new Decimal(position.entryPrice);
      const close = new Decimal(closePrice);
      const quantity = new Decimal(closeQuantity);
      const leverage = new Decimal(position.leverage || 1);

      let priceDiff;
      if (position.side === 'BUY') {
        // Long position
        priceDiff = close.minus(entryPrice);
      } else {
        // Short position
        priceDiff = entryPrice.minus(close);
      }

      const pnl = priceDiff.times(quantity).times(leverage);
      
      // Calculate fees (approximate 0.1% of trade value)
      const tradeValue = close.times(quantity);
      const fees = tradeValue.times(0.001);

      const netPnl = pnl.minus(fees);

      return {
        pnl: pnl.toNumber(),
        fees: fees.toNumber(),
        total: netPnl.toNumber(),
        tradeValue: tradeValue.toNumber()
      };

    } catch (error) {
      logger.error('Error calculating realized P&L:', error);
      return { pnl: 0, fees: 0, total: 0, tradeValue: 0 };
    }
  }

  async modifyPosition(positionId, modifications) {
    try {
      const position = await Position.findById(positionId);
      if (!position) {
        throw new Error('Position not found');
      }

      if (position.status !== 'open') {
        throw new Error('Position is not open');
      }

      const allowedModifications = ['stopLoss', 'takeProfitLevels'];
      const updates = {};

      for (const [key, value] of Object.entries(modifications)) {
        if (allowedModifications.includes(key)) {
          updates[key] = value;
        }
      }

      if (Object.keys(updates).length === 0) {
        throw new Error('No valid modifications provided');
      }

  
      // Update position
      await position.update(updates);

      // TODO: Update orders on BingX (cancel old stop/limit orders and place new ones)
      
      // Cache updated position
      await this.cachePosition(position);

      tradeLog('position_modified', {
        positionId: position.id,
        modifications: updates
      });

      return position.toJSON();

    } catch (error) {
      logger.error(`Error modifying position ${positionId}:`, error);
      throw error;
    }
  }

  /**
   * Update a position with new data
   * @param {string} positionId - The ID of the position to update
   * @param {Object} updates - The updates to apply to the position
   * @returns {Promise<Object>} The updated position
   */
  async updatePosition(positionId, updates) {
    try {
      const position = await Position.findById(positionId);
      if (!position) {
        return null;
      }

      // Update position in database
      await position.update(updates);

      // Cache updated position
      await this.cachePosition(position);

      return position.toJSON();

    } catch (error) {
      logger.error(`Error updating position ${positionId}:`, error);
      throw error;
    }
  }

  async getAllPositions(filters = {}) {
    try {
      const {
        channelId,
        status,
        symbol,
        limit = 100,
        offset = 0
      } = filters;

      // Try cache for open positions first
      if (status === 'open' && !channelId && !symbol && offset === 0 && limit <= 100) {
        const cachedPositions = await this.getCachedOpenPositions();
        if (cachedPositions.length > 0) {
          return {
            positions: cachedPositions,
            total: cachedPositions.length,
            cached: true
          };
        }
      }

      const positions = await Position.findAll({
        channelId,
        status,
        symbol,
        limit,
        offset
      });

      // For open positions, sync with exchange to get real-time data
      if (!status || status === 'open') {
        const openPositions = positions.filter(p => p.status === 'open');
        for (const position of openPositions) {
          try {
            // Get account for this position
            const Account = require('../models/Account');
            const account = await Account.findByChannelId(position.channelId);
            if (account) {
              // Get positions from exchange
              const exchangePositions = await this.bingx.getPositions(account.bingxSubAccountId);
              const exchangePosition = exchangePositions.find(p => p.symbol === position.symbol);
              
              if (exchangePosition) {
                // Update position with real-time data from exchange using the new method
                await position.syncFromExchange(exchangePosition);
              }
            }
          } catch (error) {
            logger.warn(`Could not sync position ${position.id} with exchange:`, error.message);
          }
        }
      }

      return {
        positions: positions.map(p => {
          const positionData = p.toJSON();
          // Ensure consistent field naming for frontend
          if (positionData.unrealizedPnl !== undefined) {
            positionData.unrealized_pnl = positionData.unrealizedPnl;
          }
          if (positionData.realizedPnl !== undefined) {
            positionData.realized_pnl = positionData.realizedPnl;
          }
          if (positionData.entryPrice !== undefined) {
            positionData.entry_price = positionData.entryPrice;
          }
          if (positionData.currentPrice !== undefined) {
            positionData.current_price = positionData.currentPrice;
          }
          return positionData;
        }),
        total: positions.length,
        cached: false
      };

    } catch (error) {
      logger.error('Error getting positions:', error);
      throw error;
    }
  }

  async getPositionDetails(positionId) {
    try {
      const position = await Position.findById(positionId);
      if (!position) {
        throw new Error('Position not found');
      }

      // Get orders for this position
      const orders = await position.getOrders();
      
      // Get real-time data from exchange if position is open
      let currentPrice = position.currentPrice;
      let currentPnl = position.unrealizedPnl;
      
      if (position.status === 'open') {
        try {
          // Get account for this position
          const Account = require('../models/Account');
          const account = await Account.findByChannelId(position.channelId);
          if (account) {
            // Get positions from exchange
            const exchangePositions = await this.bingx.getPositions(account.bingxSubAccountId);
            const exchangePosition = exchangePositions.find(p => p.symbol === position.symbol);
            
            if (exchangePosition) {
              currentPrice = exchangePosition.markPrice;
              currentPnl = exchangePosition.unrealizedPnl;
              
              // Update position in database with real-time data
              await position.syncFromExchange(exchangePosition);
            }
          }
        } catch (error) {
          logger.warn(`Could not get real-time data for position ${positionId} from exchange:`, error.message);
        }
      }

      // If we still don't have current price, try to get it from the price feed
      if (!currentPrice) {
        try {
          const priceData = await this.bingx.getSymbolPrice(position.symbol);
          currentPrice = priceData.price;
        } catch (error) {
          logger.warn('Could not get current price:', error.message);
        }
      }

      // Calculate current P&L if we don't have it from exchange
      if (currentPnl === undefined || currentPnl === null) {
        currentPnl = position.calculateUnrealizedPnl(currentPrice);
      }

      return {
        position: {
          ...position.toJSON(),
          currentPrice,
          currentPnl
        },
        orders,
        riskReward: position.getRiskReward(),
        margin: position.getMargin()
      };

    } catch (error) {
      logger.error('Error getting position details:', error);
      throw error;
    }
  }

  async getPositionById(positionId) {
    try {
      const position = await Position.findById(positionId);
      if (!position) {
        return null;
      }

      // Get real-time data from exchange if position is open
      let currentPrice = position.currentPrice;
      let currentPnl = position.unrealizedPnl;
      
      if (position.status === 'open') {
        try {
          // Get account for this position
          const account = await Account.findByChannelId(position.channelId);
          if (account) {
            // Get positions from exchange
            const exchangePositions = await this.bingx.getPositions(account.bingxSubAccountId);
            const exchangePosition = exchangePositions.find(p => p.symbol === position.symbol);
            
            if (exchangePosition) {
              currentPrice = exchangePosition.markPrice;
              currentPnl = exchangePosition.unrealizedPnl;
              
              // Update position in database with real-time data using the new method
              await position.syncFromExchange(exchangePosition);
            }
          }
        } catch (error) {
          logger.warn(`Could not get real-time data for position ${positionId} from exchange:`, error.message);
        }
      }

      // If we still don't have current price, try to get it from the price feed
      if (!currentPrice) {
        try {
          const priceData = await this.bingx.getSymbolPrice(position.symbol);
          currentPrice = priceData.price;
        } catch (error) {
          logger.warn('Could not get current price:', error.message);
        }
      }

      // Calculate current P&L if we don't have it from exchange
      if (currentPnl === undefined || currentPnl === null) {
        currentPnl = position.calculateUnrealizedPnl(currentPrice);
      }

      return {
        ...position.toJSON(),
        currentPrice,
        currentPnl
      };

    } catch (error) {
      logger.error('Error getting position by ID:', error);
      throw error;
    }
  }

  async getPositionsByChannel(channelId, status = null) {
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      const positions = await channel.getPositions(status);
      
      // For open positions, sync with exchange to get real-time data
      if (!status || status === 'open') {
        const openPositions = positions.filter(p => p.status === 'open');
        for (const position of openPositions) {
          try {
            // Get account for this position
            const Account = require('../models/Account');
            const account = await Account.findByChannelId(position.channelId);
            if (account) {
              // Get positions from exchange
              const exchangePositions = await this.bingx.getPositions(account.bingxSubAccountId);
              const exchangePosition = exchangePositions.find(p => p.symbol === position.symbol);
              
              if (exchangePosition) {
                // Update position with real-time data from exchange
                await position.syncFromExchange(exchangePosition);
              }
            }
          } catch (error) {
            logger.warn(`Could not sync position ${position.id} with exchange:`, error.message);
          }
        }
      }
      
      return positions.map(p => p.toJSON());

    } catch (error) {
      logger.error('Error getting positions by channel:', error);
      throw error;
    }
  }

  calculateCurrentPnl(position) {
    const cachedPrice = this.priceCache.get(position.symbol);
    if (cachedPrice) {
      return position.calculateUnrealizedPnl ? 
        position.calculateUnrealizedPnl(cachedPrice.price) : 
        0;
    }
    return position.unrealized_pnl || 0;
  }

  async updateAccountPnl(account) {
    try {
      const pnlData = await account.calculatePnL();
      await account.updatePnl(pnlData.unrealizedPnl, pnlData.totalPnl);
      
      // Notify about account update
      await redisUtils.publish(CHANNELS.ACCOUNT_UPDATE, {
        type: 'pnl_update',
        accountId: account.id,
        channelId: account.channelId,
        pnl: pnlData,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error updating account P&L:', error);
    }
  }

  async cachePosition(position) {
    try {
      const cacheKey = `position:${position.id}`;
      
      // Handle both Position instances and plain objects
      const positionData = typeof position.toJSON === 'function' 
        ? position.toJSON() 
        : position;
      
      await redisUtils.set(cacheKey, positionData, 3600); // Cache for 1 hour
      
      // Add to open positions list if position is open
      if (positionData.status === 'open') {
        await redisUtils.sAdd('open_positions', positionData.id);
      } else {
        await redisUtils.sRem('open_positions', positionData.id);
      }

    } catch (error) {
      logger.error('Error caching position:', error);
    }
  }

  async getCachedOpenPositions() {
    try {
      const openPositionIds = await redisUtils.sMembers('open_positions');
      const positions = [];

      for (const positionId of openPositionIds.slice(0, 100)) { // Limit to 100
        const cachedPosition = await redisUtils.get(`position:${positionId}`);
        if (cachedPosition) {
          positions.push(cachedPosition);
        }
      }

      return positions;

    } catch (error) {
      logger.error('Error getting cached open positions:', error);
      return [];
    }
  }

  async notifyPositionClose(position, reason, closeResult) {
    try {
      // Handle both Position instances and plain objects
      const positionData = typeof position.toJSON === 'function' 
        ? position.toJSON() 
        : position;
        
      const notification = {
        type: 'position_closed',
        position: positionData,
        reason,
        closeResult,
        timestamp: new Date()
      };

      await redisUtils.publish(CHANNELS.POSITION_CLOSED, notification);

    } catch (error) {
      logger.error('Error notifying position close:', error);
    }
  }

  async getPositionStats(channelId = null, timeRange = '24h') {
    try {
      const cacheKey = `position_stats:${channelId || 'all'}:${timeRange}`;
      
      // Try cache first
      const cachedStats = await redisUtils.get(cacheKey);
      if (cachedStats) {
        return cachedStats;
      }

      // Calculate from database
      let timeFilter = '';
      switch (timeRange) {
        case '1h':
          timeFilter = "opened_at >= NOW() - INTERVAL '1 hour'";
          break;
        case '24h':
          timeFilter = "opened_at >= NOW() - INTERVAL '24 hours'";
          break;
        case '7d':
          timeFilter = "opened_at >= NOW() - INTERVAL '7 days'";
          break;
        case '30d':
          timeFilter = "opened_at >= NOW() - INTERVAL '30 days'";
          break;
        default:
          timeFilter = "opened_at >= NOW() - INTERVAL '24 hours'";
      }

      let query = `
        SELECT 
          COUNT(*) as total_positions,
          COUNT(CASE WHEN status = 'open' THEN 1 END) as open_positions,
          COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_positions,
          COUNT(CASE WHEN status = 'closed' AND realized_pnl > 0 THEN 1 END) as winning_positions,
          COUNT(CASE WHEN status = 'closed' AND realized_pnl < 0 THEN 1 END) as losing_positions,
          COALESCE(SUM(realized_pnl), 0) as total_realized_pnl,
          COALESCE(SUM(unrealized_pnl), 0) as total_unrealized_pnl,
          COALESCE(AVG(CASE WHEN status = 'closed' AND realized_pnl > 0 THEN realized_pnl END), 0) as avg_win,
          COALESCE(AVG(CASE WHEN status = 'closed' AND realized_pnl < 0 THEN ABS(realized_pnl) END), 0) as avg_loss,
          COALESCE(MAX(realized_pnl), 0) as best_trade,
          COALESCE(MIN(realized_pnl), 0) as worst_trade
        FROM positions 
        WHERE ${timeFilter}
      `;

      const params = [];
      if (channelId) {
        query += ' AND channel_id = $1';
        params.push(channelId);
      }

      const db = require('../database/connection');
      const result = await db.query(query, params);
      const stats = result.rows[0];
      
      const winningPositions = parseInt(stats.winning_positions);
      const losingPositions = parseInt(stats.losing_positions);
      const closedPositions = parseInt(stats.closed_positions);
      
      const winRate = closedPositions > 0 ? (winningPositions / closedPositions) * 100 : 0;
      const profitFactor = losingPositions > 0 && stats.avg_loss > 0 
        ? (winningPositions * stats.avg_win) / (losingPositions * stats.avg_loss) 
        : 0;

      const formattedStats = {
        totalPositions: parseInt(stats.total_positions),
        openPositions: parseInt(stats.open_positions),
        closedPositions,
        winningPositions,
        losingPositions,
        winRate: parseFloat(winRate.toFixed(2)),
        totalRealizedPnl: parseFloat(stats.total_realized_pnl),
        totalUnrealizedPnl: parseFloat(stats.total_unrealized_pnl),
        totalPnl: parseFloat(stats.total_realized_pnl) + parseFloat(stats.total_unrealized_pnl),
        avgWin: parseFloat(stats.avg_win),
        avgLoss: parseFloat(stats.avg_loss),
        profitFactor: parseFloat(profitFactor.toFixed(2)),
        bestTrade: parseFloat(stats.best_trade),
        worstTrade: parseFloat(stats.worst_trade),
        timeRange,
        generatedAt: new Date()
      };

      // Cache for 5 minutes
      await redisUtils.set(cacheKey, formattedStats, 300);

      return formattedStats;

    } catch (error) {
      logger.error('Error getting position stats:', error);
      throw error;
    }
  }

  /**
   * Get position statistics for dashboard and reporting
   * @param {Object} filters - Filter parameters (channelId, symbol)
   * @param {string} period - Time period (1h, 24h, 7d, 30d)
   * @returns {Promise<Object>} Position statistics
   */
  async getPositionStatistics(filters = {}, period = '24h') {
    try {
      const { channel_id: channelId, symbol } = filters;
      
      // Build query conditions
      let conditions = [];
      let params = [];
      let paramIndex = 1;
      
      // Time filter
      let timeFilter = '';
      switch (period) {
        case '1h':
          timeFilter = "opened_at >= NOW() - INTERVAL '1 hour'";
          break;
        case '24h':
          timeFilter = "opened_at >= NOW() - INTERVAL '24 hours'";
          break;
        case '7d':
          timeFilter = "opened_at >= NOW() - INTERVAL '7 days'";
          break;
        case '30d':
          timeFilter = "opened_at >= NOW() - INTERVAL '30 days'";
          break;
        default:
          timeFilter = "opened_at >= NOW() - INTERVAL '24 hours'";
      }
      conditions.push(timeFilter);
      
      // Channel filter
      if (channelId) {
        conditions.push(`channel_id = $${paramIndex}`);
        params.push(channelId);
        paramIndex++;
      }
      
      // Symbol filter
      if (symbol) {
        conditions.push(`symbol = $${paramIndex}`);
        params.push(symbol);
        paramIndex++;
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      // Main query for position statistics
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'open' THEN 1 END) as open,
          COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed,
          COALESCE(SUM(realized_pnl), 0) as total_realized_pnl,
          COALESCE(SUM(unrealized_pnl), 0) as total_unrealized_pnl,
          COALESCE(SUM(CASE WHEN status = 'closed' THEN realized_pnl ELSE 0 END), 0) as closed_pnl,
          COALESCE(SUM(CASE WHEN status = 'open' THEN unrealized_pnl ELSE 0 END), 0) as open_pnl
        FROM positions 
        ${whereClause}
      `;
      
      const db = require('../database/connection');
      const result = await db.query(query, params);
      const stats = result.rows[0];
      
      // Get real-time P&L for open positions
      let realtimeUnrealizedPnl = 0;
      if (!channelId && !symbol) {
        // Only get real-time data when no specific filters are applied
        try {
          const Channel = require('../models/Channel');
          const channels = await Channel.findAll();
          
          for (const channel of channels) {
            try {
              const account = await Account.findByChannelId(channel.id);
              if (account) {
                const exchangePositions = await this.bingx.getPositions(account.bingxSubAccountId);
                exchangePositions.forEach(pos => {
                  realtimeUnrealizedPnl += pos.unrealizedPnl;
                });
              }
            } catch (error) {
              logger.warn(`Could not get exchange positions for channel ${channel.id}:`, error.message);
            }
          }
        } catch (error) {
          logger.warn('Could not get real-time P&L data:', error.message);
        }
      } else {
        // Use database values when filters are applied
        realtimeUnrealizedPnl = parseFloat(stats.total_unrealized_pnl);
      }
      
      return {
        total: parseInt(stats.total),
        open: parseInt(stats.open),
        closed: parseInt(stats.closed),
        totalPnL: parseFloat(stats.total_realized_pnl) + realtimeUnrealizedPnl,
        totalRealizedPnl: parseFloat(stats.total_realized_pnl),
        totalUnrealizedPnl: realtimeUnrealizedPnl,
        closedPnl: parseFloat(stats.closed_pnl),
        openPnl: realtimeUnrealizedPnl,
        totalVolume: 0, // Will be calculated separately
        winRate: 0, // Will be calculated separately
        period
      };
      
    } catch (error) {
      logger.error('Error getting position statistics:', error);
      throw error;
    }
  }

  /**
   * Get active positions summary
   * @param {Object} filters - Filter parameters (channelId, status)
   * @returns {Promise<Object>} Active positions summary
   */
  async getActivePositionsSummary(filters = {}) {
    try {
      const { channel_id: channelId } = filters;
      
      // Build query conditions
      let conditions = ["status = 'open'"];
      let params = [];
      let paramIndex = 1;
      
      // Channel filter
      if (channelId) {
        conditions.push(`channel_id = $${paramIndex}`);
        params.push(channelId);
        paramIndex++;
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      // Main query for active positions summary
      const query = `
        SELECT 
          COUNT(*) as count,
          COALESCE(SUM(quantity * entry_price), 0) as total_exposure,
          COALESCE(SUM(unrealized_pnl), 0) as unrealized_pnl,
          COALESCE(AVG(unrealized_pnl), 0) as avg_pnl
        FROM positions 
        ${whereClause}
      `;
      
      const db = require('../database/connection');
      const result = await db.query(query, params);
      const summary = result.rows[0];
      
      // Get real-time data from exchange
      let realtimeUnrealizedPnl = 0;
      let realtimeTotalExposure = 0;
      
      try {
        if (channelId) {
          // Get specific channel data
          const account = await Account.findByChannelId(channelId);
          if (account) {
            const exchangePositions = await this.bingx.getPositions(account.bingxSubAccountId);
            exchangePositions.forEach(pos => {
              realtimeUnrealizedPnl += pos.unrealizedPnl;
              realtimeTotalExposure += (pos.size * pos.entryPrice);
            });
          }
        } else {
          // Get all channels data
          const Channel = require('../models/Channel');
          const channels = await Channel.findAll();
          
          for (const channel of channels) {
            try {
              const account = await Account.findByChannelId(channel.id);
              if (account) {
                const exchangePositions = await this.bingx.getPositions(account.bingxSubAccountId);
                exchangePositions.forEach(pos => {
                  realtimeUnrealizedPnl += pos.unrealizedPnl;
                  realtimeTotalExposure += (pos.size * pos.entryPrice);
                });
              }
            } catch (error) {
              logger.warn(`Could not get exchange positions for channel ${channel.id}:`, error.message);
            }
          }
        }
      } catch (error) {
        logger.warn('Could not get real-time position data:', error.message);
        // Fallback to database values
        realtimeUnrealizedPnl = parseFloat(summary.unrealized_pnl);
        realtimeTotalExposure = parseFloat(summary.total_exposure);
      }
      
      return {
        count: parseInt(summary.count),
        totalExposure: realtimeTotalExposure,
        unrealizedPnl: realtimeUnrealizedPnl,
        avgPnl: realtimeUnrealizedPnl > 0 ? realtimeUnrealizedPnl / parseInt(summary.count) : 0,
        topPerformers: [], // Will be populated separately
        worstPerformers: [] // Will be populated separately
      };
      
    } catch (error) {
      logger.error('Error getting active positions summary:', error);
      throw error;
    }
  }

  /**
   * Get P&L by channel for detailed reporting
   * @returns {Promise<Array>} Array of channel P&L data
   */
  async getPnLByChannel() {
    try {
      // First get all channels
      const Channel = require('../models/Channel');
      const channels = await Channel.findAll();
      
      const channelPnLData = [];
      
      // For each channel, calculate real-time P&L
      for (const channel of channels) {
        try {
          // Get account for this channel
          const account = await Account.findByChannelId(channel.id);
          if (!account) {
            // If no account, use database values
            channelPnLData.push({
              channelId: channel.id,
              channelName: channel.name,
              totalPositions: 0,
              openPositions: 0,
              closedPositions: 0,
              totalPnL: 0,
              totalRealizedPnl: 0,
              totalUnrealizedPnl: 0,
              closedPnl: 0,
              openPnl: 0
            });
            continue;
          }
          
          // Get positions from exchange
          const exchangePositions = await this.bingx.getPositions(account.bingxSubAccountId);
          
          // Get positions from database for this channel (both closed and partially closed)
          const dbPositions = await channel.getPositions();
          
          let totalRealizedPnl = 0;
          let totalUnrealizedPnl = 0;
          let openPositionsCount = 0;
          let closedPositionsCount = 0;
          
          // Process closed and partially closed positions from database
          const closedPositions = dbPositions.filter(p => p.status === 'closed' || p.status === 'partially_closed');
          closedPositions.forEach(position => {
            totalRealizedPnl += parseFloat(position.realized_pnl || 0);
            closedPositionsCount++;
          });
          
          // Process open positions - use real-time data from exchange
          const openPositions = dbPositions.filter(p => p.status === 'open');
          openPositions.forEach(position => {
            const exchangePosition = exchangePositions.find(p => p.symbol === position.symbol);
            if (exchangePosition) {
              totalUnrealizedPnl += exchangePosition.unrealizedPnl;
            } else {
              // Fallback to database value if not found on exchange
              totalUnrealizedPnl += parseFloat(position.unrealized_pnl || 0);
            }
            openPositionsCount++;
          });
          
          channelPnLData.push({
            channelId: channel.id,
            channelName: channel.name,
            totalPositions: dbPositions.length,
            openPositions: openPositionsCount,
            closedPositions: closedPositionsCount,
            totalPnL: totalRealizedPnl + totalUnrealizedPnl,
            totalRealizedPnl: totalRealizedPnl,
            totalUnrealizedPnl: totalUnrealizedPnl,
            closedPnl: totalRealizedPnl,
            openPnl: totalUnrealizedPnl
          });
        } catch (error) {
          logger.warn(`Could not get P&L data for channel ${channel.id}:`, error.message);
          // Add channel with zero values if there's an error
          channelPnLData.push({
            channelId: channel.id,
            channelName: channel.name,
            totalPositions: 0,
            openPositions: 0,
            closedPositions: 0,
            totalPnL: 0,
            totalRealizedPnl: 0,
            totalUnrealizedPnl: 0,
            closedPnl: 0,
            openPnl: 0
          });
        }
      }
      
      // Sort by total P&L descending
      channelPnLData.sort((a, b) => b.totalPnL - a.totalPnL);
      
      return channelPnLData;
      
    } catch (error) {
      logger.error('Error getting P&L by channel:', error);
      throw error;
    }
  }

  /**
   * Get performance metrics for positions
   * @param {Object} filters - Filter parameters
   * @param {string} period - Time period
   * @returns {Promise<Object>} Performance metrics
   */
  async getPerformanceMetrics(filters = {}, period = '7d') {
    try {
      const { channel_id: channelId } = filters;
      
      // Build time filter
      let timeFilter = '';
      switch (period) {
        case '1h':
          timeFilter = "closed_at >= NOW() - INTERVAL '1 hour'";
          break;
        case '24h':
          timeFilter = "closed_at >= NOW() - INTERVAL '24 hours'";
          break;
        case '7d':
          timeFilter = "closed_at >= NOW() - INTERVAL '7 days'";
          break;
        case '30d':
          timeFilter = "closed_at >= NOW() - INTERVAL '30 days'";
          break;
        default:
          timeFilter = "closed_at >= NOW() - INTERVAL '7 days'";
      }
      
      // Build query conditions
      let conditions = [`status = 'closed' AND ${timeFilter}`];
      let params = [];
      let paramIndex = 1;
      
      // Channel filter
      if (channelId) {
        conditions.push(`channel_id = $${paramIndex}`);
        params.push(channelId);
        paramIndex++;
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      // Main query for performance metrics
      const query = `
        SELECT 
          COUNT(*) as total_trades,
          COUNT(CASE WHEN realized_pnl > 0 THEN 1 END) as winning_trades,
          COUNT(CASE WHEN realized_pnl < 0 THEN 1 END) as losing_trades,
          COALESCE(SUM(realized_pnl), 0) as total_pnl,
          COALESCE(AVG(realized_pnl), 0) as avg_trade_pnl,
          COALESCE(MAX(realized_pnl), 0) as best_trade,
          COALESCE(MIN(realized_pnl), 0) as worst_trade,
          COALESCE(SUM(CASE WHEN realized_pnl > 0 THEN realized_pnl ELSE 0 END), 0) as total_winning,
          COALESCE(SUM(CASE WHEN realized_pnl < 0 THEN ABS(realized_pnl) ELSE 0 END), 0) as total_losing
        FROM positions 
        ${whereClause}
      `;
      
      const db = require('../database/connection');
      const result = await db.query(query, params);
      const metrics = result.rows[0];
      
      const totalTrades = parseInt(metrics.total_trades);
      const winningTrades = parseInt(metrics.winning_trades);
      const losingTrades = parseInt(metrics.losing_trades);
      
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
      const profitFactor = parseFloat(metrics.total_losing) > 0 ? 
        parseFloat(metrics.total_winning) / parseFloat(metrics.total_losing) : 0;
      
      return {
        totalTrades,
        winningTrades,
        losingTrades,
        winRate: parseFloat(winRate.toFixed(2)),
        totalPnl: parseFloat(metrics.total_pnl),
        avgTradePnl: parseFloat(metrics.avg_trade_pnl),
        bestTrade: parseFloat(metrics.best_trade),
        worstTrade: parseFloat(metrics.worst_trade),
        profitFactor: parseFloat(profitFactor.toFixed(2)),
        period
      };
      
    } catch (error) {
      logger.error('Error getting performance metrics:', error);
      throw error;
    }
  }

  /**
   * Reset all positions and P&L for testing and development purposes
   * Closes all open positions on the exchange and deletes all closed positions from database
   * @returns {Promise<Object>} Results of the reset operation
   */
  async resetPositionsAndPnL() {
    try {
      // Get database connection
      const db = require('../database/connection');
      
      logger.info('Starting positions and P&L reset');
      
      // First, close all open positions on the exchange
      const openPositions = await Position.getOpenPositions();
      let closedOnExchangeCount = 0;
      let failedToCloseCount = 0;
      
      logger.info(`Found ${openPositions.length} open positions to close`);
      
      for (const position of openPositions) {
        try {
          // Get account for this position
          const account = await Account.findByChannelId(position.channelId);
          if (account) {
            logger.info(`Attempting to close position ${position.id} on exchange`, {
              symbol: position.symbol,
              channelId: position.channelId,
              subAccountId: account.bingxSubAccountId
            });
            
            // Close position on exchange
            const closeResult = await this.bingx.closePosition(
              position.symbol,
              null, // Close full position
              account.bingxSubAccountId
            );
            
            if (closeResult && (closeResult.orderId || closeResult.status === 'already_closed')) {
              closedOnExchangeCount++;
              logger.info(`Successfully closed position ${position.id} on exchange`, {
                symbol: position.symbol,
                orderId: closeResult.orderId,
                status: closeResult.status
              });
            } else {
              logger.warn(`Position ${position.id} may not have closed properly`, {
                symbol: position.symbol,
                closeResult
              });
            }
          } else {
            logger.warn(`No account found for position ${position.id}`, {
              channelId: position.channelId
            });
            failedToCloseCount++;
          }
        } catch (closeError) {
          logger.error(`Error closing position ${position.id} on exchange:`, closeError);
          failedToCloseCount++;
        }
      }
      
      logger.info(`Closed ${closedOnExchangeCount} positions on exchange, ${failedToCloseCount} failed to close`);
      
      // Now delete all positions (both closed and open) from database
      const deleteResult = await db.query(`
        DELETE FROM positions 
        RETURNING id, status
      `);
      
      const deletedCount = deleteResult.rowCount;
      const closedPositionsCount = deleteResult.rows.filter(row => 
        row.status === 'closed' || row.status === 'partially_closed'
      ).length;
      const openPositionsCount = deleteResult.rows.filter(row => 
        row.status === 'open'
      ).length;
      
      logger.info(`Deleted ${deletedCount} total positions (${closedPositionsCount} closed, ${openPositionsCount} open)`);
      
      // Clear Redis caches related to positions and P&L
      await redisUtils.del('open_positions');
      
      // Clear the position cache
      for (const row of deleteResult.rows) {
        const positionId = row.id;
        await redisUtils.del(`position:${positionId}`);
        logger.info(`Cleared cache for position ${positionId}`);
      }
      
      // Try to delete some common cache keys
      await redisUtils.del('position_stats:all:24h');
      await redisUtils.del('position_stats:all:7d');
      await redisUtils.del('position_stats:all:30d');
      
      logger.info('Cleared position cache entries');
      
      // Publish notification about reset
      await redisUtils.publish(CHANNELS.POSITION_UPDATE, {
        type: 'positions_reset',
        timestamp: new Date()
      });
      
      return {
        closedOnExchange: closedOnExchangeCount,
        failedToClose: failedToCloseCount,
        deletedPositions: deletedCount,
        closedPositions: closedPositionsCount,
        openPositions: openPositionsCount,
        success: true
      };
      
    } catch (error) {
      logger.error('Error resetting positions and P&L:', error);
      throw error;
    }
  }

  /**
   * Get P&L timeline data for charting
   * @param {Object} filters - Filter parameters
   * @param {string} period - Time period
   * @returns {Promise<Array>} P&L timeline data
   */
  async getPnLTimeline(filters = {}, period = '7d') {
    try {
      const { channel_id: channelId } = filters;
      
      // Build time filter and interval based on period
      let timeFilter = '';
      let interval = '';
      switch (period) {
        case '1h':
          timeFilter = "closed_at >= NOW() - INTERVAL '1 hour'";
          interval = '5 minutes';
          break;
        case '24h':
          timeFilter = "closed_at >= NOW() - INTERVAL '24 hours'";
          interval = '1 hour';
          break;
        case '7d':
          timeFilter = "closed_at >= NOW() - INTERVAL '7 days'";
          interval = '1 day';
          break;
        case '30d':
          timeFilter = "closed_at >= NOW() - INTERVAL '30 days'";
          interval = '1 day';
          break;
        default:
          timeFilter = "closed_at >= NOW() - INTERVAL '7 days'";
          interval = '1 day';
      }
      
      // Build query conditions
      let conditions = [`status = 'closed' AND ${timeFilter}`];
      let params = [];
      let paramIndex = 1;
      
      // Channel filter
      if (channelId) {
        conditions.push(`channel_id = $${paramIndex}`);
        params.push(channelId);
        paramIndex++;
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      // Main query for P&L timeline
      const query = `
        SELECT 
          DATE_TRUNC('${interval.replace(' ', '_')}', closed_at) as period,
          COALESCE(SUM(realized_pnl), 0) as pnl,
          COUNT(*) as trade_count
        FROM positions 
        ${whereClause}
        GROUP BY DATE_TRUNC('${interval.replace(' ', '_')}', closed_at)
        ORDER BY period
      `;
      
      const db = require('../database/connection');
      const result = await db.query(query, params);
      
      return result.rows.map(row => ({
        period: row.period,
        pnl: parseFloat(row.pnl),
        tradeCount: parseInt(row.trade_count)
      }));
      
    } catch (error) {
      logger.error('Error getting P&L timeline:', error);
      throw error;
    }
  }

  /**
   * Get recent trades for activity feed
   * @param {number} limit - Number of trades to return
   * @param {string} period - Time period
   * @returns {Promise<Array>} Recent trades
   */
  async getRecentTrades(limit = 20, period = '24h') {
    try {
      // Build time filter
      let timeFilter = '';
      switch (period) {
        case '1h':
          timeFilter = "closed_at >= NOW() - INTERVAL '1 hour'";
          break;
        case '24h':
          timeFilter = "closed_at >= NOW() - INTERVAL '24 hours'";
          break;
        case '7d':
          timeFilter = "closed_at >= NOW() - INTERVAL '7 days'";
          break;
        case '30d':
          timeFilter = "closed_at >= NOW() - INTERVAL '30 days'";
          break;
        default:
          timeFilter = "closed_at >= NOW() - INTERVAL '24 hours'";
      }
      
      const query = `
        SELECT 
          id,
          symbol,
          side,
          quantity,
          entry_price,
          current_price,
          realized_pnl,
          fees,
          status,
          closed_at,
          created_at
        FROM positions 
        WHERE status = 'closed' AND ${timeFilter}
        ORDER BY closed_at DESC
        LIMIT $1
      `;
      
      const db = require('../database/connection');
      const result = await db.query(query, [limit]);
      
      return result.rows.map(row => ({
        id: row.id,
        symbol: row.symbol,
        side: row.side,
        quantity: parseFloat(row.quantity),
        entryPrice: parseFloat(row.entry_price),
        exitPrice: parseFloat(row.current_price),
        pnl: parseFloat(row.realized_pnl),
        fees: parseFloat(row.fees),
        status: row.status,
        closedAt: row.closed_at,
        createdAt: row.created_at
      }));
      
    } catch (error) {
      logger.error('Error getting recent trades:', error);
      throw error;
    }
  }

  /**
   * Get recent position updates for activity feed
   * @param {number} limit - Number of updates to return
   * @param {string} period - Time period
   * @returns {Promise<Array>} Recent position updates
   */
  async getRecentPositionUpdates(limit = 20, period = '24h') {
    try {
      // Build time filter
      let timeFilter = '';
      switch (period) {
        case '1h':
          timeFilter = "updated_at >= NOW() - INTERVAL '1 hour'";
          break;
        case '24h':
          timeFilter = "updated_at >= NOW() - INTERVAL '24 hours'";
          break;
        case '7d':
          timeFilter = "updated_at >= NOW() - INTERVAL '7 days'";
          break;
        case '30d':
          timeFilter = "updated_at >= NOW() - INTERVAL '30 days'";
          break;
        default:
          timeFilter = "updated_at >= NOW() - INTERVAL '24 hours'";
      }
      
      const query = `
        SELECT 
          id,
          symbol,
          side,
          quantity,
          entry_price,
          current_price,
          unrealized_pnl,
          status,
          opened_at,
          updated_at
        FROM positions 
        WHERE ${timeFilter}
        ORDER BY updated_at DESC
        LIMIT $1
      `;
      
      const db = require('../database/connection');
      const result = await db.query(query, [limit]);
      
      return result.rows.map(row => ({
        id: row.id,
        symbol: row.symbol,
        side: row.side,
        quantity: parseFloat(row.quantity),
        entryPrice: parseFloat(row.entry_price),
        currentPrice: parseFloat(row.current_price),
        unrealizedPnl: parseFloat(row.unrealized_pnl),
        status: row.status,
        openedAt: row.opened_at,
        updatedAt: row.updated_at
      }));
      
    } catch (error) {
      logger.error('Error getting recent position updates:', error);
      throw error;
    }
  }

  /**
   * Get P&L history for a specific position
   * @param {string} positionId - Position ID
   * @param {string} interval - Time interval for grouping
   * @returns {Promise<Array>} P&L history data
   */
  async getPositionPnLHistory(positionId, interval = '1h') {
    try {
      // For now, we'll return a simplified P&L history
      // In a real implementation, this would track P&L changes over time
      const position = await Position.findById(positionId);
      if (!position) {
        throw new Error('Position not found');
      }
      
      // Return current position data as history point
      return [{
        timestamp: new Date(),
        price: position.currentPrice,
        pnl: position.unrealizedPnl,
        realizedPnl: position.realizedPnl,
        fees: position.fees
      }];
      
    } catch (error) {
      logger.error('Error getting position P&L history:', error);
      throw error;
    }
  }

  async getServiceStatus() {
    try {
      const openPositionsCount = await redisUtils.sCard('open_positions');
      
      return {
        isUpdating: this.isUpdating,
        updateFrequency: this.updateFrequency,
        openPositions: openPositionsCount,
        priceCacheSize: this.priceCache.size,
        lastUpdateTime: new Date()
      };

    } catch (error) {
      logger.error('Error getting service status:', error);
      return {
        isUpdating: false,
        error: error.message
      };
    }
  }

  /**
   * Sync all open positions with exchange
   * @returns {Promise<void>}
   */
  async syncAllPositions() {
    try {
      logger.info('Starting position sync with exchange');
      
      // Get all open positions from database
      const openPositions = await Position.getOpenPositions();
      
      if (openPositions.length === 0) {
        logger.info('No open positions to sync');
        return;
      }
      
      // Group positions by sub-account
      const subAccountPositions = {};
      for (const position of openPositions) {
        const account = await Account.findByChannelId(position.channelId);
        if (account && account.bingxSubAccountId) {
          if (!subAccountPositions[account.bingxSubAccountId]) {
            subAccountPositions[account.bingxSubAccountId] = [];
          }
          subAccountPositions[account.bingxSubAccountId].push(position);
        }
      }
      
      let syncedCount = 0;
      
      // Sync positions for each sub-account
      for (const [subAccountId, positions] of Object.entries(subAccountPositions)) {
        try {
          // Get all positions from exchange for this sub-account
          const exchangePositions = await this.bingx.getPositions(subAccountId);
          
          // Sync each position
          for (const position of positions) {
            const exchangePosition = exchangePositions.find(p => p.symbol === position.symbol);
            if (exchangePosition) {
              await position.syncFromExchange(exchangePosition);
              syncedCount++;
            } else {
              // If position doesn't exist on exchange but is open in DB, close it
              if (position.status === 'open') {
                logger.info(`Position ${position.id} not found on exchange, marking as closed`);
                await position.close(position.currentPrice || position.entryPrice, 0, 0);
                syncedCount++;
              }
            }
          }
        } catch (error) {
          logger.error(`Error syncing positions for sub-account ${subAccountId}:`, error);
        }
      }
      
      logger.info(`Position sync completed. ${syncedCount} positions synced.`);
      
    } catch (error) {
      logger.error('Error during position sync:', error);
    }
  }

  /**
   * Start periodic position sync
   * @returns {Promise<void>}
   */
  async startPositionSync() {
    try {
      // Sync every 30 minutes
      setInterval(async () => {
        await this.syncAllPositions();
      }, 30 * 60 * 1000); // 30 minutes
      
      logger.info('Position sync scheduler started');
      
    } catch (error) {
      logger.error('Error starting position sync:', error);
    }
  }

  async shutdown() {
    try {
      logger.info('Shutting down position service...');
      
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
      }
      
      this.isUpdating = false;
      this.priceCache.clear();
      
      logger.info('Position service shutdown complete');
      
    } catch (error) {
      logger.error('Error during position service shutdown:', error);
    }
  }
}

module.exports = PositionService;
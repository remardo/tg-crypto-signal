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
      // Calculate new unrealized P&L
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
        const priceData = await this.bingx.getSymbolPrice(position.symbol);
        closePrice = priceData.price;
      }

      // Calculate close quantity
      const closeQuantity = new Decimal(position.quantity).times(percentage).toNumber();
      
      // Get account info for sub-account
      const account = await Account.findByChannelId(position.channelId);
      if (!account) {
        throw new Error('Account not found for position');
      }

      // Close position on BingX
      const closeResult = await this.bingx.closePosition(
        position.symbol,
        closeQuantity,
        account.bingxSubAccountId
      );

      // If position was already closed on exchange, update it as closed in database
      if (closeResult.status === 'already_closed') {
        // Try to get actual P&L from order history
        let realizedPnlData = { pnl: 0, fees: 0, total: 0, tradeValue: 0 };
        
        try {
          // Get recent order history for this symbol
          const orderHistory = await this.bingx.getOrderHistory(position.symbol, 10, account.bingxSubAccountId);
          
          // Find orders that might be related to this position
          const relatedOrders = orderHistory.filter(order => 
            order.symbol === position.symbol && 
            order.time > new Date(position.openedAt).getTime() &&
            (order.side !== position.side || order.type === 'TAKE_PROFIT_MARKET' || order.type === 'STOP_MARKET')
          );
          
          if (relatedOrders.length > 0) {
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
            }
          }
        } catch (historyError) {
          logger.warn(`Could not retrieve P&L from order history for position ${position.id}:`, historyError);
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
          symbol: position.symbol,
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

      // Calculate realized P&L
      const realizedPnl = this.calculateRealizedPnl(
        position,
        closePrice,
        closeQuantity
      );

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
        symbol: position.symbol,
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

      return {
        positions: positions.map(p => p.toJSON()),
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
      
      // Get current price
      let currentPrice = position.currentPrice;
      try {
        const priceData = await this.bingx.getSymbolPrice(position.symbol);
        currentPrice = priceData.price;
      } catch (error) {
        logger.warn('Could not get current price:', error.message);
      }

      // Calculate current P&L
      const currentPnl = position.calculateUnrealizedPnl(currentPrice);

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

  async getPositionsByChannel(channelId, status = null) {
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      const positions = await channel.getPositions(status);
      
      return positions.map(p => ({
        ...p,
        currentPnl: this.calculateCurrentPnl(p)
      }));

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
      await redisUtils.set(cacheKey, position.toJSON(), 3600); // Cache for 1 hour
      
      // Add to open positions list if position is open
      if (position.status === 'open') {
        await redisUtils.sAdd('open_positions', position.id);
      } else {
        await redisUtils.sRem('open_positions', position.id);
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
      const notification = {
        type: 'position_closed',
        position: position.toJSON(),
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
      
      let syncedCount = 0;
      
      // Sync each position
      for (const position of openPositions) {
        const wasSynced = await position.syncWithExchange(this.bingx);
        if (wasSynced) {
          syncedCount++;
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
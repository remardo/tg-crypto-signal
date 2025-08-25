const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');
const Decimal = require('decimal.js');

class Position {
  constructor(data) {
    this.id = data.id;
    this.signalId = data.signal_id;
    this.channelId = data.channel_id;
    this.subAccountId = data.sub_account_id;
    this.symbol = data.symbol;
    this.side = data.side;
    this.quantity = data.quantity;
    this.entryPrice = data.entry_price;
    this.currentPrice = data.current_price;
    this.leverage = data.leverage;
    this.unrealizedPnl = data.unrealized_pnl;
    this.realizedPnl = data.realized_pnl;
    this.fees = data.fees;
    this.takeProfitLevels = data.take_profit_levels || [];
    this.stopLoss = data.stop_loss;
    this.tpPercentages = data.tp_percentages || [25.0, 25.0, 50.0];
    this.status = data.status;
    this.bingxOrderId = data.bingx_order_id;
    this.openedAt = data.opened_at;
    this.closedAt = data.closed_at;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  static async findAll(filters = {}) {
    let query = `
      SELECT p.*, c.name as channel_name, s.coin, s.direction
      FROM positions p 
      LEFT JOIN channels c ON p.channel_id = c.id
      LEFT JOIN signals s ON p.signal_id = s.id
    `;
    const conditions = [];
    const values = [];

    if (filters.channelId) {
      conditions.push('p.channel_id = $' + (values.length + 1));
      values.push(filters.channelId);
    }

    if (filters.subAccountId) {
      conditions.push('p.sub_account_id = $' + (values.length + 1));
      values.push(filters.subAccountId);
    }

    if (filters.status) {
      conditions.push('p.status = $' + (values.length + 1));
      values.push(filters.status);
    }

    if (filters.symbol) {
      conditions.push('p.symbol = $' + (values.length + 1));
      values.push(filters.symbol);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY p.opened_at DESC';

    if (filters.limit) {
      query += ' LIMIT $' + (values.length + 1);
      values.push(filters.limit);
    }

    if (filters.offset) {
      query += ' OFFSET $' + (values.length + 1);
      values.push(filters.offset);
    }

    const result = await db.query(query, values);
    return result.rows.map(row => {
      const position = new Position(row);
      position.channelName = row.channel_name;
      position.coin = row.coin;
      position.direction = row.direction;
      return position;
    });
  }

  static async findById(id) {
    const query = `
      SELECT p.*, c.name as channel_name, s.coin, s.direction
      FROM positions p 
      LEFT JOIN channels c ON p.channel_id = c.id
      LEFT JOIN signals s ON p.signal_id = s.id
      WHERE p.id = $1
    `;
    const result = await db.query(query, [id]);
    if (result.rows.length > 0) {
      const position = new Position(result.rows[0]);
      position.channelName = result.rows[0].channel_name;
      position.coin = result.rows[0].coin;
      position.direction = result.rows[0].direction;
      return position;
    }
    return null;
  }

  static async findBySignalId(signalId) {
    const result = await db.query(
      'SELECT * FROM positions WHERE signal_id = $1 ORDER BY opened_at DESC',
      [signalId]
    );
    return result.rows.map(row => new Position(row));
  }

  static async getOpenPositions(channelId = null) {
    const filters = { status: 'open' };
    if (channelId) {
      filters.channelId = channelId;
    }
    return this.findAll(filters);
  }

  static async create(positionData) {
    const id = uuidv4();
    const query = `
      INSERT INTO positions (
        id, signal_id, channel_id, sub_account_id, symbol, side,
        quantity, entry_price, leverage, take_profit_levels, 
        stop_loss, bingx_order_id, tp_percentages
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
    
    const values = [
      id,
      positionData.signalId,
      positionData.channelId,
      positionData.subAccountId,
      positionData.symbol,
      positionData.side,
      positionData.quantity,
      positionData.entryPrice,
      positionData.leverage,
      positionData.takeProfitLevels || [],
      positionData.stopLoss,
      positionData.bingxOrderId,
      positionData.tpPercentages || [25.0, 25.0, 50.0]
    ];

    const result = await db.query(query, values);
    return new Position(result.rows[0]);
  }

  async update(updateData) {
    const fields = [];
    const values = [];
    
    Object.keys(updateData).forEach((key, index) => {
      const dbKey = this.camelToSnake(key);
      fields.push(`${dbKey} = $${index + 1}`);
      values.push(updateData[key]);
    });

    values.push(this.id);
    
    const query = `
      UPDATE positions 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING *
    `;

    const result = await db.query(query, values);
    const updatedPosition = new Position(result.rows[0]);
    Object.assign(this, updatedPosition);
    return this;
  }

  async updatePrice(currentPrice) {
    const unrealizedPnl = this.calculateUnrealizedPnl(currentPrice);
    return this.update({
      currentPrice,
      unrealizedPnl
    });
  }

  async close(closePrice, realizedPnl, fees = 0) {
    return this.update({
      status: 'closed',
      currentPrice: closePrice,
      realizedPnl,
      fees,
      unrealizedPnl: 0,
      closedAt: new Date()
    });
  }

  async partialClose(partialQuantity, closePrice, partialPnl, fees = 0) {
    const newQuantity = new Decimal(this.quantity).minus(partialQuantity).toNumber();
    const newRealizedPnl = new Decimal(this.realizedPnl || 0).plus(partialPnl).toNumber();
    const newFees = new Decimal(this.fees || 0).plus(fees).toNumber();
    
    const updateData = {
      quantity: newQuantity,
      currentPrice: closePrice,
      realizedPnl: newRealizedPnl,
      fees: newFees
    };

    if (newQuantity <= 0) {
      updateData.status = 'closed';
      updateData.closedAt = new Date();
      updateData.unrealizedPnl = 0;
    } else {
      updateData.status = 'partially_closed';
      updateData.unrealizedPnl = this.calculateUnrealizedPnl(closePrice, newQuantity);
    }

    return this.update(updateData);
  }

  calculateUnrealizedPnl(currentPrice = null, quantity = null) {
    const price = currentPrice || this.currentPrice;
    const qty = quantity || this.quantity;
    
    if (!price || !qty || !this.entryPrice) {
      return 0;
    }

    const entryPrice = new Decimal(this.entryPrice);
    const current = new Decimal(price);
    const qtyDecimal = new Decimal(qty);
    const leverage = new Decimal(this.leverage || 1);

    let priceDiff;
    if (this.side === 'BUY') {
      // Long position
      priceDiff = current.minus(entryPrice);
    } else {
      // Short position
      priceDiff = entryPrice.minus(current);
    }

    return priceDiff.times(qtyDecimal).times(leverage).toNumber();
  }

  calculateROI() {
    if (!this.entryPrice || !this.quantity) {
      return 0;
    }

    const investment = new Decimal(this.entryPrice)
      .times(this.quantity)
      .dividedBy(this.leverage || 1);
    
    const totalPnl = new Decimal(this.realizedPnl || 0)
      .plus(this.unrealizedPnl || 0);

    return totalPnl.dividedBy(investment).times(100).toNumber();
  }

  getRiskReward() {
    if (!this.entryPrice || !this.stopLoss || !this.takeProfitLevels?.length) {
      return null;
    }

    const entryPrice = new Decimal(this.entryPrice);
    const stopLoss = new Decimal(this.stopLoss);
    const firstTp = new Decimal(this.takeProfitLevels[0]);

    const risk = entryPrice.minus(stopLoss).abs();
    const reward = firstTp.minus(entryPrice).abs();

    return {
      risk: risk.toNumber(),
      reward: reward.toNumber(),
      ratio: reward.dividedBy(risk).toNumber(),
      riskPercentage: risk.dividedBy(entryPrice).times(100).toNumber(),
      rewardPercentage: reward.dividedBy(entryPrice).times(100).toNumber()
    };
  }

  isAtTakeProfit(currentPrice) {
    if (!this.takeProfitLevels?.length) return null;

    for (let i = 0; i < this.takeProfitLevels.length; i++) {
      const tpLevel = parseFloat(this.takeProfitLevels[i]);
      
      if (this.side === 'BUY') {
        // Long position - price should be >= TP
        if (currentPrice >= tpLevel) {
          return { level: i + 1, price: tpLevel };
        }
      } else {
        // Short position - price should be <= TP
        if (currentPrice <= tpLevel) {
          return { level: i + 1, price: tpLevel };
        }
      }
    }
    return null;
  }

  isAtStopLoss(currentPrice) {
    if (!this.stopLoss) return false;

    const stopLoss = parseFloat(this.stopLoss);
    
    if (this.side === 'BUY') {
      // Long position - stop if price <= stop loss
      return currentPrice <= stopLoss;
    } else {
      // Short position - stop if price >= stop loss
      return currentPrice >= stopLoss;
    }
  }

  getMargin() {
    if (!this.entryPrice || !this.quantity || !this.leverage) {
      return 0;
    }

    return new Decimal(this.entryPrice)
      .times(this.quantity)
      .dividedBy(this.leverage)
      .toNumber();
  }

  async getOrders() {
    const result = await db.query(
      'SELECT * FROM orders WHERE position_id = $1 ORDER BY order_time DESC',
      [this.id]
    );
    return result.rows;
  }

  camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Sync position status with exchange
   * @param {BingXService} bingxService - BingX service instance
   * @returns {Promise<boolean>} - Whether position status was updated
   */
  async syncWithExchange(bingxService) {
    try {
      // Import Account model locally to avoid circular dependency
      const Account = require('./Account');
      
      // Get account info
      const account = await Account.findByChannelId(this.channelId);
      if (!account) {
        logger.warn(`Account not found for position ${this.id}`);
        return false;
      }

      // Get positions from exchange
      const positions = await bingxService.getPositions(account.bingxSubAccountId);
      const exchangePosition = positions.find(p => p.symbol === this.symbol);
      
      // If position doesn't exist on exchange but is open in DB, close it
      if (!exchangePosition && this.status === 'open') {
        logger.info(`Position ${this.id} not found on exchange, marking as closed`);
        await this.close(this.currentPrice || this.entryPrice, 0, 0);
        return true;
      }
      
      // If position exists on exchange but is closed in DB, this is an inconsistency
      if (exchangePosition && this.status !== 'open') {
        logger.warn(`Position ${this.id} exists on exchange but is closed in DB`);
        return false;
      }
      
      return false;
    } catch (error) {
      logger.error(`Error syncing position ${this.id} with exchange:`, error);
      return false;
    }
  }

  /**
   * Sync position data from exchange
   * @param {Object} exchangePosition - Position data from exchange
   * @returns {Promise<void>}
   */
  async syncFromExchange(exchangePosition) {
    const updateData = {
      currentPrice: parseFloat(exchangePosition.markPrice),
      unrealizedPnl: parseFloat(exchangePosition.unrealizedPnl),
      quantity: parseFloat(exchangePosition.size),
      leverage: parseInt(exchangePosition.leverage)
    };
    await this.update(updateData);
  }

  toJSON() {
    return {
      id: this.id,
      signalId: this.signalId,
      channelId: this.channelId,
      channelName: this.channelName,
      subAccountId: this.subAccountId,
      symbol: this.symbol,
      coin: this.coin,
      direction: this.direction,
      side: this.side,
      quantity: this.quantity,
      entryPrice: this.entryPrice,
      currentPrice: this.currentPrice,
      leverage: this.leverage,
      unrealizedPnl: this.unrealizedPnl,
      realizedPnl: this.realizedPnl,
      fees: this.fees,
      takeProfitLevels: this.takeProfitLevels,
      stopLoss: this.stopLoss,
      status: this.status,
      bingxOrderId: this.bingxOrderId,
      openedAt: this.openedAt,
      closedAt: this.closedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      roi: this.calculateROI(),
      riskReward: this.getRiskReward(),
      margin: this.getMargin()
    };
  }
}

module.exports = Position;
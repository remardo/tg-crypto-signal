const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');
const Decimal = require('decimal.js');
const { logger } = require('../utils/logger');

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
    this.exitPrice = data.exit_price;
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
    // When closing a position, we need to set all required fields
    // to satisfy database constraints
    const closedAt = new Date();
    
    // Do atomic update to avoid constraint violations
    const query = `
      UPDATE positions 
      SET status = $1,
          current_price = $2,
          realized_pnl = $3,
          fees = $4,
          unrealized_pnl = $5,
          closed_at = $6,
          exit_price = $7,
          updated_at = NOW()
      WHERE id = $8
    `;
    
    const exitPrice = closePrice || this.exitPrice || this.currentPrice || this.entryPrice || 0;
    
    const result = await db.query(query, [
      'closed',
      closePrice,
      realizedPnl,
      fees,
      0,
      closedAt,
      exitPrice,
      this.id
    ]);
    
    // Update local instance
    this.status = 'closed';
    this.currentPrice = closePrice;
    this.realizedPnl = realizedPnl;
    this.fees = fees;
    this.unrealizedPnl = 0;
    this.closedAt = closedAt;
    this.exitPrice = exitPrice;
    
    return this;
  }

  async partialClose(partialQuantity, closePrice, partialPnl, fees = 0) {
    const newQuantity = new Decimal(this.quantity).minus(partialQuantity).toNumber();
    const newRealizedPnl = new Decimal(this.realizedPnl || 0).plus(partialPnl).toNumber();
    const newFees = new Decimal(this.fees || 0).plus(fees).toNumber();
    
    if (newQuantity <= 0) {
      // Close the position completely
      const closedAt = new Date();
      const exitPrice = closePrice || this.exitPrice || this.currentPrice || this.entryPrice || 0;
      
      // Do atomic update to avoid constraint violations
      const query = `
        UPDATE positions 
        SET status = $1,
            quantity = $2,
            current_price = $3,
            realized_pnl = $4,
            fees = $5,
            unrealized_pnl = $6,
            closed_at = $7,
            exit_price = $8,
            updated_at = NOW()
        WHERE id = $9
      `;
      
      const result = await db.query(query, [
        'closed',
        newQuantity,
        closePrice,
        newRealizedPnl,
        newFees,
        0,
        closedAt,
        exitPrice,
        this.id
      ]);
      
      // Update local instance
      this.status = 'closed';
      this.quantity = newQuantity;
      this.currentPrice = closePrice;
      this.realizedPnl = newRealizedPnl;
      this.fees = newFees;
      this.unrealizedPnl = 0;
      this.closedAt = closedAt;
      this.exitPrice = exitPrice;
    } else {
      // Partially close the position
      const updateData = {
        quantity: newQuantity,
        currentPrice: closePrice,
        realizedPnl: newRealizedPnl,
        fees: newFees,
        status: 'partially_closed',
        unrealizedPnl: this.calculateUnrealizedPnl(closePrice, newQuantity)
      };
      
      return this.update(updateData);
    }
    
    return this;
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
    // Special case for exitPrice -> exit_price
    if (str === 'exitPrice') return 'exit_price';
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * «Мягкий» синк: модель ничего не запрашивает.
   * Если сервис сообщил, что позиции на бирже больше нет — закрываем локально.
   */
  async syncWithExchange(opts = {}) {
    try {
      if (opts && opts.existsOnExchange === false) {
        if (this.status !== 'closed') {
          // When closing a position, we need to set all required fields
          // to satisfy database constraints
          const closedAt = new Date();
          const exitPrice = this.currentPrice || this.entryPrice || 0;
          
          // Do atomic update to avoid constraint violations
          const query = `
            UPDATE positions 
            SET status = $1,
                closed_at = $2,
                unrealized_pnl = $3,
                exit_price = $4,
                updated_at = NOW()
            WHERE id = $5
          `;
          
          const result = await db.query(query, [
            'closed',
            closedAt,
            0,
            exitPrice,
            this.id
          ]);
          
          // Update local instance
          this.status = 'closed';
          this.closedAt = closedAt;
          this.unrealizedPnl = 0;
          this.exitPrice = exitPrice;
        }
      }
      return this;
    } catch (e) {
      logger.error('Position.syncWithExchange error:', e);
      return this;
    }
  }

  /**
   * НОВОЕ: живой синк полей из уже полученного объектa биржи.
   * Вызывать из сервиса, куда уже пришли данные getPositions().
   */
  async syncFromExchange(exchangePosition) {
    try {
      if (!exchangePosition) return this;
      const patch = {};
      if (exchangePosition.markPrice !== undefined) {
        patch.currentPrice = parseFloat(exchangePosition.markPrice);
      }
      if (exchangePosition.unrealizedPnl !== undefined) {
        patch.unrealizedPnl = parseFloat(exchangePosition.unrealizedPnl);
      }
      if (exchangePosition.size !== undefined) {
        patch.quantity = Math.abs(parseFloat(exchangePosition.size || 0));
      }
      if (exchangePosition.leverage !== undefined) {
        patch.leverage = parseInt(exchangePosition.leverage, 10);
      }
      if (Object.keys(patch).length > 0) {
        await this.update(patch);
      }
      return this;
    } catch (e) {
      logger.error('Position.syncFromExchange error:', e);
      return this;
    }
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
      exitPrice: this.exitPrice,
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
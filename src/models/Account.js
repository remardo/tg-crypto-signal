const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');
const Decimal = require('decimal.js');
const { logger } = require('../utils/logger');

class Account {
  constructor(data) {
    this.id = data.id;
    this.channelId = data.channel_id;
    this.bingxSubAccountId = data.bingx_sub_account_id;
    this.name = data.name;
    this.totalBalance = data.total_balance;
    this.availableBalance = data.available_balance;
    this.unrealizedPnl = data.unrealized_pnl;
    this.totalPnl = data.total_pnl;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  static async findAll() {
    const query = `
      SELECT a.*, c.name as channel_name 
      FROM sub_accounts a 
      LEFT JOIN channels c ON a.channel_id = c.id
      ORDER BY a.created_at DESC
    `;
    const result = await db.query(query);
    return result.rows.map(row => {
      const account = new Account(row);
      account.channelName = row.channel_name;
      return account;
    });
  }

  static async findById(id) {
    const query = `
      SELECT a.*, c.name as channel_name 
      FROM sub_accounts a 
      LEFT JOIN channels c ON a.channel_id = c.id
      WHERE a.id = $1
    `;
    const result = await db.query(query, [id]);
    if (result.rows.length > 0) {
      const account = new Account(result.rows[0]);
      account.channelName = result.rows[0].channel_name;
      return account;
    }
    return null;
  }

  static async findByChannelId(channelId) {
    const result = await db.query(
      'SELECT * FROM sub_accounts WHERE channel_id = $1',
      [channelId]
    );
    return result.rows.length > 0 ? new Account(result.rows[0]) : null;
  }

  static async findByBingxId(bingxSubAccountId) {
    const result = await db.query(
      'SELECT * FROM sub_accounts WHERE bingx_sub_account_id = $1',
      [bingxSubAccountId]
    );
    return result.rows.length > 0 ? new Account(result.rows[0]) : null;
  }

  static async create(accountData) {
    const id = uuidv4();
    const query = `
      INSERT INTO sub_accounts (
        id, channel_id, bingx_sub_account_id, name,
        total_balance, available_balance
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [
      id,
      accountData.channelId,
      accountData.bingxSubAccountId,
      accountData.name,
      accountData.totalBalance || 0,
      accountData.availableBalance || 0
    ];

    const result = await db.query(query, values);
    return new Account(result.rows[0]);
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
      UPDATE sub_accounts 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING *
    `;

    const result = await db.query(query, values);
    const updatedAccount = new Account(result.rows[0]);
    Object.assign(this, updatedAccount);
    return this;
  }

  async updateBalance(totalBalance, availableBalance) {
    return this.update({
      totalBalance,
      availableBalance
    });
  }

  async updatePnl(unrealizedPnl, totalPnl) {
    return this.update({
      unrealizedPnl,
      totalPnl
    });
  }

  async getPositions(status = null) {
    let query = 'SELECT * FROM positions WHERE sub_account_id = $1';
    const values = [this.bingxSubAccountId];

    if (status) {
      query += ' AND status = $2';
      values.push(status);
    }

    query += ' ORDER BY opened_at DESC';
    
    const result = await db.query(query, values);
    return result.rows;
  }

  async getOpenPositions() {
    return this.getPositions('open');
  }

  async getClosedPositions() {
    return this.getPositions('closed');
  }

  async calculatePnL() {
    // First get closed positions data from database
    const query = `
      SELECT 
        COALESCE(SUM(CASE WHEN status = 'open' THEN unrealized_pnl ELSE 0 END), 0) as unrealized_pnl,
        COALESCE(SUM(CASE WHEN status = 'closed' THEN realized_pnl ELSE 0 END), 0) as realized_pnl,
        COALESCE(SUM(fees), 0) as total_fees
      FROM positions 
      WHERE sub_account_id = $1
    `;
    
    const result = await db.query(query, [this.bingxSubAccountId]);
    const data = result.rows[0];
    
    // Get realized P&L and fees from database (these don't change)
    const realizedPnl = parseFloat(data.realized_pnl);
    const totalFees = parseFloat(data.total_fees);
    
    // Get real-time unrealized P&L from exchange for open positions
    let realtimeUnrealizedPnl = 0;
    try {
      // Import BingX service
      const BingXService = require('../services/bingxService');
      const bingx = new BingXService();
      
      // Get positions from exchange
      const exchangePositions = await bingx.getPositions(this.bingxSubAccountId);
      
      // Sum up unrealized P&L from exchange
      exchangePositions.forEach(pos => {
        realtimeUnrealizedPnl += pos.unrealizedPnl;
      });
    } catch (error) {
      logger.warn(`Could not get real-time P&L for account ${this.id} from exchange:`, error.message);
      // Fallback to database value
      realtimeUnrealizedPnl = parseFloat(data.unrealized_pnl);
    }
    
    const totalPnl = realizedPnl + realtimeUnrealizedPnl - totalFees;

    return {
      unrealizedPnl: realtimeUnrealizedPnl,
      realizedPnl,
      totalFees,
      totalPnl,
      netPnl: totalPnl
    };
  }

  async getStats() {
    const query = `
      SELECT 
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_positions,
        COUNT(CASE WHEN status = 'closed' AND realized_pnl > 0 THEN 1 END) as winning_trades,
        COUNT(CASE WHEN status = 'closed' AND realized_pnl < 0 THEN 1 END) as losing_trades,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) as total_closed_trades,
        COALESCE(AVG(CASE WHEN status = 'closed' AND realized_pnl > 0 THEN realized_pnl END), 0) as avg_win,
        COALESCE(AVG(CASE WHEN status = 'closed' AND realized_pnl < 0 THEN ABS(realized_pnl) END), 0) as avg_loss,
        COALESCE(MAX(realized_pnl), 0) as best_trade,
        COALESCE(MIN(realized_pnl), 0) as worst_trade
      FROM positions 
      WHERE sub_account_id = $1
    `;
    
    const result = await db.query(query, [this.bingxSubAccountId]);
    const stats = result.rows[0];
    
    const winningTrades = parseInt(stats.winning_trades);
    const losingTrades = parseInt(stats.losing_trades);
    const totalTrades = parseInt(stats.total_closed_trades);
    
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const profitFactor = losingTrades > 0 && stats.avg_loss > 0 
      ? (winningTrades * stats.avg_win) / (losingTrades * stats.avg_loss) 
      : 0;

    return {
      openPositions: parseInt(stats.open_positions),
      winningTrades,
      losingTrades,
      totalTrades,
      winRate: parseFloat(winRate.toFixed(2)),
      avgWin: parseFloat(stats.avg_win),
      avgLoss: parseFloat(stats.avg_loss),
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      bestTrade: parseFloat(stats.best_trade),
      worstTrade: parseFloat(stats.worst_trade)
    };
  }

  calculateMaxPositionSize(riskPercentage = 2) {
    if (!this.availableBalance || this.availableBalance <= 0) {
      return 0;
    }

    const riskAmount = new Decimal(this.availableBalance)
      .times(riskPercentage)
      .dividedBy(100);

    return riskAmount.toNumber();
  }

  calculatePositionSize(entryPrice, stopLoss, riskPercentage = 2, leverage = 1) {
    const riskAmount = this.calculateMaxPositionSize(riskPercentage);
    
    if (!entryPrice || !stopLoss || riskAmount <= 0) {
      return 0;
    }

    const entryDecimal = new Decimal(entryPrice);
    const stopDecimal = new Decimal(stopLoss);
    const leverageDecimal = new Decimal(leverage);
    
    const riskPerUnit = entryDecimal.minus(stopDecimal).abs();
    
    if (riskPerUnit.equals(0)) {
      return 0;
    }

    const maxQuantity = new Decimal(riskAmount)
      .dividedBy(riskPerUnit)
      .times(leverageDecimal);

    return maxQuantity.toNumber();
  }

  getMarginUsed() {
    return new Decimal(this.totalBalance)
      .minus(this.availableBalance || 0)
      .toNumber();
  }

  getMarginRatio() {
    if (!this.totalBalance || this.totalBalance <= 0) {
      return 0;
    }

    return new Decimal(this.getMarginUsed())
      .dividedBy(this.totalBalance)
      .times(100)
      .toNumber();
  }

  async delete() {
    await db.query('DELETE FROM sub_accounts WHERE id = $1', [this.id]);
    return true;
  }

  camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  toJSON() {
    return {
      id: this.id,
      channelId: this.channelId,
      channelName: this.channelName,
      bingxSubAccountId: this.bingxSubAccountId,
      name: this.name,
      totalBalance: this.totalBalance,
      availableBalance: this.availableBalance,
      marginUsed: this.getMarginUsed(),
      marginRatio: this.getMarginRatio(),
      unrealizedPnl: this.unrealizedPnl,
      totalPnl: this.totalPnl,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Account;
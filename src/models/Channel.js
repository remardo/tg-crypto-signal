const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');

class Channel {
  constructor(data) {
    this.id = data.id;
    this.telegramChannelId = data.telegram_channel_id;
    this.name = data.name;
    this.description = data.description;
    this.isActive = data.is_active;
    this.isPaused = data.is_paused;
    this.subAccountId = data.sub_account_id;
    this.maxPositionPercentage = data.max_position_percentage;
    this.autoExecute = data.auto_execute;
    this.riskPercentage = data.risk_percentage;
    this.tpPercentages = data.tp_percentages || [25.0, 25.0, 50.0];
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  static async findAll(filters = {}) {
    let query = 'SELECT * FROM channels';
    const conditions = [];
    const values = [];

    if (filters.isActive !== undefined) {
      conditions.push('is_active = $' + (values.length + 1));
      values.push(filters.isActive);
    }

    if (filters.isPaused !== undefined) {
      conditions.push('is_paused = $' + (values.length + 1));
      values.push(filters.isPaused);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, values);
    return result.rows.map(row => new Channel(row));
  }

  static async findById(id) {
    const result = await db.query('SELECT * FROM channels WHERE id = $1', [id]);
    return result.rows.length > 0 ? new Channel(result.rows[0]) : null;
  }

  static async findByTelegramId(telegramChannelId) {
    const result = await db.query(
      'SELECT * FROM channels WHERE telegram_channel_id = $1',
      [telegramChannelId]
    );
    return result.rows.length > 0 ? new Channel(result.rows[0]) : null;
  }

  static async create(channelData) {
    const id = uuidv4();
    const query = `
      INSERT INTO channels (
        id, telegram_channel_id, name, description, sub_account_id,
        max_position_percentage, auto_execute, risk_percentage, tp_percentages
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const values = [
      id,
      channelData.telegramChannelId,
      channelData.name,
      channelData.description || null,
      channelData.subAccountId,
      channelData.maxPositionPercentage || 10.0,
      channelData.autoExecute || false,
      channelData.riskPercentage || 2.0,
      channelData.tpPercentages || [25.0, 25.0, 50.0]
    ];

    const result = await db.query(query, values);
    return new Channel(result.rows[0]);
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
      UPDATE channels 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING *
    `;

    const result = await db.query(query, values);
    const updatedChannel = new Channel(result.rows[0]);
    Object.assign(this, updatedChannel);
    return this;
  }

  async delete() {
    await db.query('DELETE FROM channels WHERE id = $1', [this.id]);
    return true;
  }

  async pause() {
    return this.update({ isPaused: true });
  }

  async resume() {
    return this.update({ isPaused: false });
  }

  async activate() {
    return this.update({ isActive: true });
  }

  async deactivate() {
    return this.update({ isActive: false });
  }

  async getSignals(limit = 50, offset = 0) {
    const query = `
      SELECT * FROM signals 
      WHERE channel_id = $1 
      ORDER BY processed_at DESC 
      LIMIT $2 OFFSET $3
    `;
    const result = await db.query(query, [this.id, limit, offset]);
    return result.rows;
  }

  async getPositions(status = null) {
    let query = 'SELECT * FROM positions WHERE channel_id = $1';
    const values = [this.id];

    if (status) {
      query += ' AND status = $2';
      values.push(status);
    }

    query += ' ORDER BY opened_at DESC';
    
    const result = await db.query(query, values);
    return result.rows;
  }

  async getStats() {
    const statsQuery = `
      SELECT 
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_positions,
        COUNT(CASE WHEN status = 'closed' AND realized_pnl > 0 THEN 1 END) as winning_trades,
        COUNT(CASE WHEN status = 'closed' AND realized_pnl < 0 THEN 1 END) as losing_trades,
        COALESCE(SUM(realized_pnl), 0) as total_realized_pnl,
        COALESCE(SUM(unrealized_pnl), 0) as total_unrealized_pnl
      FROM positions 
      WHERE channel_id = $1
    `;
    
    const result = await db.query(statsQuery, [this.id]);
    const stats = result.rows[0];
    
    const totalTrades = parseInt(stats.winning_trades) + parseInt(stats.losing_trades);
    const winRate = totalTrades > 0 ? (parseInt(stats.winning_trades) / totalTrades) * 100 : 0;
    
    return {
      openPositions: parseInt(stats.open_positions),
      winningTrades: parseInt(stats.winning_trades),
      losingTrades: parseInt(stats.losing_trades),
      totalTrades,
      winRate: parseFloat(winRate.toFixed(2)),
      totalRealizedPnl: parseFloat(stats.total_realized_pnl),
      totalUnrealizedPnl: parseFloat(stats.total_unrealized_pnl),
      totalPnl: parseFloat(stats.total_realized_pnl) + parseFloat(stats.total_unrealized_pnl)
    };
  }

  camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  toJSON() {
    return {
      id: this.id,
      telegramChannelId: this.telegramChannelId,
      name: this.name,
      description: this.description,
      isActive: this.isActive,
      isPaused: this.isPaused,
      subAccountId: this.subAccountId,
      maxPositionPercentage: this.maxPositionPercentage,
      autoExecute: this.autoExecute,
      riskPercentage: this.riskPercentage,
      tpPercentages: this.tpPercentages,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Channel;
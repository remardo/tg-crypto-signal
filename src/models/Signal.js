const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');

class Signal {
  constructor(data) {
    this.id = data.id;
    this.channelId = data.channel_id;
    this.coin = data.coin;
    this.direction = data.direction;
    this.leverage = data.leverage;
    this.entryPrice = data.entry_price;
    this.takeProfitLevels = data.take_profit_levels || [];
    this.stopLoss = data.stop_loss;
    this.suggestedVolume = data.suggested_volume;
    this.confidenceScore = data.confidence_score;
    this.rawMessage = data.raw_message;
    this.parsedData = data.parsed_data;
    this.messageTimestamp = data.message_timestamp;
    this.processedAt = data.processed_at;
    this.status = data.status;
    this.signalType = data.signal_type;
  }

  static async findAll(filters = {}) {
    let query = `
      SELECT s.*, c.name as channel_name 
      FROM signals s 
      LEFT JOIN channels c ON s.channel_id = c.id
    `;
    const conditions = [];
    const values = [];

    if (filters.channelId) {
      conditions.push('s.channel_id = $' + (values.length + 1));
      values.push(filters.channelId);
    }

    if (filters.status) {
      conditions.push('s.status = $' + (values.length + 1));
      values.push(filters.status);
    }

    if (filters.coin) {
      conditions.push('s.coin ILIKE $' + (values.length + 1));
      values.push(`%${filters.coin}%`);
    }

    if (filters.direction) {
      conditions.push('s.direction = $' + (values.length + 1));
      values.push(filters.direction);
    }

    if (filters.signalType) {
      conditions.push('s.signal_type = $' + (values.length + 1));
      values.push(filters.signalType);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY s.processed_at DESC';

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
      const signal = new Signal(row);
      signal.channelName = row.channel_name;
      return signal;
    });
  }

  static async findById(id) {
    const query = `
      SELECT s.*, c.name as channel_name 
      FROM signals s 
      LEFT JOIN channels c ON s.channel_id = c.id
      WHERE s.id = $1
    `;
    const result = await db.query(query, [id]);
    if (result.rows.length > 0) {
      const signal = new Signal(result.rows[0]);
      signal.channelName = result.rows[0].channel_name;
      return signal;
    }
    return null;
  }

  static async create(signalData) {
    const id = uuidv4();
    
    // Helper function to clean numeric values
    const cleanNumeric = (value) => {
      if (!value) return null;
      if (typeof value === 'number') return value;
      // Remove all non-numeric characters except dots and negative signs
      const cleaned = String(value).replace(/[^0-9.-]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    };
    
    const query = `
      INSERT INTO signals (
        id, channel_id, coin, direction, leverage, entry_price,
        take_profit_levels, stop_loss, suggested_volume, confidence_score,
        raw_message, parsed_data, message_timestamp, signal_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    
    const values = [
      id,
      signalData.channelId,
      signalData.coin,
      signalData.direction,
      cleanNumeric(signalData.leverage),
      cleanNumeric(signalData.entryPrice),
      signalData.takeProfitLevels || [],
      cleanNumeric(signalData.stopLoss),
      cleanNumeric(signalData.suggestedVolume),
      signalData.confidenceScore || 0,
      signalData.rawMessage,
      signalData.parsedData ? JSON.stringify(signalData.parsedData) : null,
      signalData.messageTimestamp || new Date(),
      signalData.signalType || 'entry'
    ];

    const result = await db.query(query, values);
    return new Signal(result.rows[0]);
  }

  async update(updateData) {
    const fields = [];
    const values = [];
    
    Object.keys(updateData).forEach((key, index) => {
      const dbKey = this.camelToSnake(key);
      let value = updateData[key];
      
      // Handle JSON fields
      if (key === 'parsedData' && typeof value === 'object') {
        value = JSON.stringify(value);
      }
      
      fields.push(`${dbKey} = $${index + 1}`);
      values.push(value);
    });

    values.push(this.id);
    
    const query = `
      UPDATE signals 
      SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING *
    `;

    const result = await db.query(query, values);
    const updatedSignal = new Signal(result.rows[0]);
    Object.assign(this, updatedSignal);
    return this;
  }

  async execute() {
    return this.update({ status: 'executed' });
  }

  async approve() {
    return this.update({ status: 'approved' });
  }

  async ignore() {
    return this.update({ status: 'ignored' });
  }

  async markAsFailed(errorMessage = null) {
    const updateData = { status: 'failed' };
    if (errorMessage) {
      updateData.parsedData = { error: errorMessage };
    }
    return this.update(updateData);
  }

  async close() {
    return this.update({ status: 'closed' });
  }

  async getPosition() {
    const result = await db.query(
      'SELECT * FROM positions WHERE signal_id = $1 ORDER BY opened_at DESC LIMIT 1',
      [this.id]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async getRecentByChannel(channelId, hours = 24) {
    const query = `
      SELECT * FROM signals 
      WHERE channel_id = $1 
      AND processed_at >= NOW() - INTERVAL '${hours} hours'
      ORDER BY processed_at DESC
    `;
    const result = await db.query(query, [channelId]);
    return result.rows.map(row => new Signal(row));
  }

  static async getPendingSignals() {
    return this.findAll({ status: 'pending' });
  }

  static async getExecutableSignals() {
    return this.findAll({ status: 'approved' });
  }

  static async getSignalsByType(signalType) {
    return this.findAll({ signalType });
  }

  calculateRiskReward() {
    if (!this.entryPrice || !this.stopLoss || !this.takeProfitLevels?.length) {
      return null;
    }

    const entryPrice = parseFloat(this.entryPrice);
    const stopLoss = parseFloat(this.stopLoss);
    const firstTp = parseFloat(this.takeProfitLevels[0]);

    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(firstTp - entryPrice);

    return {
      risk,
      reward,
      ratio: reward / risk,
      riskPercentage: (risk / entryPrice) * 100,
      rewardPercentage: (reward / entryPrice) * 100
    };
  }

  isValidSignal() {
    return !!(
      this.coin &&
      this.direction &&
      this.entryPrice &&
      this.stopLoss &&
      this.takeProfitLevels?.length > 0
    );
  }

  camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  toJSON() {
    return {
      id: this.id,
      channelId: this.channelId,
      channelName: this.channelName,
      coin: this.coin,
      direction: this.direction,
      leverage: this.leverage,
      entryPrice: this.entryPrice,
      takeProfitLevels: this.takeProfitLevels,
      stopLoss: this.stopLoss,
      suggestedVolume: this.suggestedVolume,
      confidenceScore: this.confidenceScore,
      rawMessage: this.rawMessage,
      parsedData: this.parsedData,
      messageTimestamp: this.messageTimestamp,
      processedAt: this.processedAt,
      status: this.status,
      signalType: this.signalType,
      riskReward: this.calculateRiskReward(),
      isValid: this.isValidSignal()
    };
  }
}

module.exports = Signal;
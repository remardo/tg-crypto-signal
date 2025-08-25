/* eslint-disable no-console */
const { logger } = require('../utils/logger');

// Предполагаем, что у вас есть ORM-слой (например, Sequelize) и ниже —
// обёртка с нужными методами. Я сохранил публичный интерфейс:
//  - Position.create(data)
//  - Position.findById(id)
//  - Position.findByChannel(channelId)
//  - Position.getOpenPositions([channelId])
//  - position.update(data)
//  - position.updatePrice(currentPrice)   // ОСТАВЛЕН для котировок (без пересчёта PnL из головы)
//  - position.syncWithExchange(opts)      // уже был — мягкое закрытие, если нет на бирже
//  - position.syncFromExchange(ep)        // НОВОЕ — живая синхронизация PnL/markPrice/size/leverage
//
// Если у вас уже есть реализованные методы — остальная логика сохранена,
// ниже добавлен syncFromExchange и скорректирован updatePrice,
// чтобы он не перетирал биржевой PnL.

/**
 * Заглушка конструктора; замените на реальные поля вашей модели.
 */
class Position {
  constructor(row) {
    Object.assign(this, row);
  }

  /**
   * --------- СТАТИЧЕСКИЕ МЕТОДЫ ORM-ОБЁРТКИ ---------
   * Ниже — примеры. В проекте они уже реализованы через ваш storage слой.
   */
  static async create(data) {
    // Вставка в БД → вернуть инстанс Position
    const row = await Position._dbInsert(data);
    return new Position(row);
  }

  static async findById(id) {
    const row = await Position._dbSelectById(id);
    return row ? new Position(row) : null;
  }

  static async findByChannel(channelId) {
    const rows = await Position._dbSelectByChannel(channelId);
    return rows.map((r) => new Position(r));
  }

  static async getOpenPositions(channelId = null) {
    const rows = await Position._dbSelectOpen(channelId);
    return rows.map((r) => new Position(r));
  }

  /**
   * --------- ИНСТАНС-МЕТОДЫ ---------
   */

  toJSON() {
    // Отдаём «плоский» объект для фронта
    return {
      id: this.id,
      signalId: this.signalId,
      channelId: this.channelId,
      subAccountId: this.subAccountId,
      symbol: this.symbol,
      side: this.side,
      quantity: this.quantity,
      entryPrice: this.entryPrice,
      leverage: this.leverage,
      takeProfitLevels: this.takeProfitLevels,
      stopLoss: this.stopLoss,
      currentPrice: this.currentPrice,
      unrealizedPnl: this.unrealizedPnl,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  async update(data) {
    const row = await Position._dbUpdate(this.id, data);
    Object.assign(this, row);
    return this;
  }

  /**
   * Обновляет ТОЛЬКО цену из котировок. НЕ меняет unrealizedPnl.
   * (PnL тянем из биржи методами syncFromExchange / batch-синком в сервисе)
   */
  async updatePrice(currentPrice) {
    try {
      const data = { currentPrice: parseFloat(currentPrice) };
      await this.update(data);
      return this;
    } catch (e) {
      logger.error('Position.updatePrice error:', e);
      return this;
    }
  }

  /**
   * Ранее существующий «мягкий» синк (оставляем).
   * Если позиция пропала на бирже — закрываем локально (и при необходимости
   * пишем realized PnL из истории доходов).
   */
  async syncWithExchange(opts = {}) {
    // Пример: если opts.existsOnExchange === false → локально закрыть
    if (opts && opts.existsOnExchange === false) {
      if (this.status !== 'CLOSED') {
        await this.update({ status: 'CLOSED' });
      }
      return this;
    }
    return this;
  }

  /**
   * НОВЫЙ! Живой синк с объектом позиции биржи:
   *  - markPrice → currentPrice
   *  - unrealizedPnl → unrealizedPnl
   *  - size → quantity (|= текущий открытый размер)
   *  - leverage → leverage
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
        // На BingX size — абсолютный размер (без знака), приведём к числу:
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

  /**
   * ===== Ниже — заглушки реального storage/ORM слоя =====
   * Замените реализацией из вашего проекта (Sequelize/Knex/Prisma и т.д.).
   * Я намеренно оставляю названия методов, чтобы интеграция осталась drop-in.
   */

  static async _dbInsert(data) {
    // INSERT ... RETURNING *
    // В реальном проекте — вызов ORM. Ниже — образец:
    const now = new Date();
    return {
      id: data.id || Math.random().toString(36).slice(2),
      status: 'OPEN',
      unrealizedPnl: 0,
      currentPrice: data.entryPrice,
      createdAt: now,
      updatedAt: now,
      ...data
    };
  }

  static async _dbSelectById(id) {
    // SELECT * FROM positions WHERE id=...
    // Замените на ORM
    throw new Error('Position._dbSelectById must be implemented in your ORM layer');
  }

  static async _dbSelectByChannel(channelId) {
    // SELECT * FROM positions WHERE channel_id=...
    // Замените на ORM
    throw new Error('Position._dbSelectByChannel must be implemented in your ORM layer');
  }

  static async _dbSelectOpen(channelId = null) {
    // SELECT * FROM positions WHERE status='OPEN' [AND channel_id=...]
    // Замените на ORM
    throw new Error('Position._dbSelectOpen must be implemented in your ORM layer');
  }

  static async _dbUpdate(id, patch) {
    // UPDATE positions SET ... WHERE id=... RETURNING *
    // Замените на ORM
    throw new Error('Position._dbUpdate must be implemented in your ORM layer');
  }
}

module.exports = Position;

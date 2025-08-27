/* eslint-disable no-console */
const { logger } = require('../utils/logger');
const db = require('../database/connection');
const { redisUtils, CHANNELS } = require('../config/redis');
const BingXService = require('./bingxService');
const Position = require('../models/Position');
const Account = require('../models/Account');
const Channel = require('../models/Channel');

class PositionService {
  constructor() {
    this.bingx = new BingXService();

    // периодические задачи
    this.pricePollTimer = null;
    this.exchangeSyncTimer = null;

    // интервалы (мс)
    this.PRICE_POLL_MS = 5000;         // пуллинг цен на символы (если нужно)
    this.EXCHANGE_SYNC_MS = 5000;      // пуллинг позиций с биржи (PnL/markPrice/size)
  }

  async initialize() {
    try {
      await this.bingx.initialize();
      this.startPositionSync();
      logger.info('PositionService initialized');
    } catch (e) {
      logger.error('PositionService init error:', e);
      throw e;
    }
  }

  async shutdown() {
    this.stopPositionSync();
    logger.info('PositionService shutdown complete');
  }

  /**
   * Get service status for health checks
   */
  async getServiceStatus() {
    try {
      return {
        initialized: !!this.bingx?.initialized,
        pricePollTimer: !!this.pricePollTimer,
        exchangeSyncTimer: !!this.exchangeSyncTimer,
        pricePollInterval: this.PRICE_POLL_MS,
        exchangeSyncInterval: this.EXCHANGE_SYNC_MS
      };
    } catch (error) {
      logger.error('Error getting PositionService status:', error);
      return {
        initialized: false,
        error: error.message
      };
    }
  }

  /**
   * -------- ПУБЛИЧНЫЕ методы для UI/роутов --------
   */

  /**
   * Получить список позиций с пагинацией и общим количеством
   * @param {{channel_id?: string, channelId?: string, sub_account_id?: string, subAccountId?: string, symbol?: string, status?: string, limit?: number, offset?: number}} filters
   * @returns {{ positions: any[], total: number }}
   */
  async getAllPositions(filters = {}) {
    const norm = {
      channelId: filters.channel_id || filters.channelId,
      subAccountId: filters.sub_account_id || filters.subAccountId,
      symbol: filters.symbol,
      status: filters.status,
      limit: filters.limit ? Number(filters.limit) : undefined,
      offset: filters.offset ? Number(filters.offset) : undefined,
    };

    // 1) данные с возможной подстановкой связей уже делает Position.findAll
    const positions = await Position.findAll(norm);

    // 2) посчитать total через COUNT(*) по тем же условиям (без лимитов)
    const whereParts = [];
    const values = [];
    const pushCond = (cond, val) => { whereParts.push(cond); values.push(val); };

    if (norm.channelId) pushCond(`p.channel_id = $${values.length + 1}`, norm.channelId);
    if (norm.subAccountId) pushCond(`p.sub_account_id = $${values.length + 1}`, norm.subAccountId);
    if (norm.status) pushCond(`p.status = $${values.length + 1}`, norm.status);
    if (norm.symbol) pushCond(`p.symbol = $${values.length + 1}`, norm.symbol);

    let countSql = 'SELECT COUNT(*)::int AS cnt FROM positions p';
    if (whereParts.length) countSql += ' WHERE ' + whereParts.join(' AND ');
    const { rows } = await db.query(countSql, values);
    const total = rows?.[0]?.cnt ?? positions.length;

    return { positions: positions.map(p => p.toJSON ? p.toJSON() : p), total };
  }

  /**
   * Получить позицию по ID
   */
  async getPositionById(id) {
    const pos = await Position.findById(id);
    return pos ? pos.toJSON() : null;
  }

  /**
   * Обновить позицию по ID
   */
  async updatePosition(id, updates) {
    const pos = await Position.findById(id);
    if (!pos) return null;
    const updated = await pos.update(updates);
    return updated.toJSON();
  }

  /**
   * Закрыть позицию полностью или частично
   * @param {string} id
   * @param {string} reason
   * @param {number|null} closePrice
   * @param {number} percentage 0..1
   */
  async closePosition(id, reason = 'Manual close', closePrice = null, percentage = 1) {
    const pos = await Position.findById(id);
    if (!pos) return null;

    // Получаем актуальную цену, если не передана
    let price = closePrice;
    if (!price) {
      try {
        const quote = await this.bingx.getSymbolPrice(pos.symbol);
        if (quote && quote.price) price = parseFloat(quote.price);
      } catch (e) {
        logger.warn('closePosition: failed to fetch symbol price, fallback to current/entry', { symbol: pos.symbol, error: e.message });
      }
    }
    price = price ?? pos.currentPrice ?? pos.entryPrice ?? 0;

    // Расчёт PnL для закрываемой части
    const portion = Math.min(Math.max(percentage, 0), 1);
    if (portion < 1) {
      const partialQty = (pos.quantity || 0) * portion;
      const partialPnl = pos.calculateUnrealizedPnl(price, partialQty);
      const updated = await pos.partialClose(partialQty, price, partialPnl, 0);
      await this.notifyPnlUpdate(updated);
      return { id: updated.id, status: updated.status, quantity: updated.quantity, realizedPnl: updated.realizedPnl, currentPrice: updated.currentPrice };
    }

    // Полное закрытие
    const remainingQty = pos.quantity || 0;
    const pnlForRest = pos.calculateUnrealizedPnl(price, remainingQty);
    const newRealized = (pos.realizedPnl || 0) + pnlForRest;
    const closed = await pos.close(price, newRealized, 0);
    await this.notifyPnlUpdate(closed);
    return { id: closed.id, status: closed.status, realizedPnl: closed.realizedPnl, exitPrice: closed.exitPrice };
  }

  /**
   * Статистика позиций за период
   */
  async getPositionStatistics(filters = {}, period = '24h') {
    const norm = {
      channelId: filters.channel_id || filters.channelId,
      symbol: filters.symbol,
    };

    const whereParts = [];
    const values = [];
    const pushCond = (cond, val) => { whereParts.push(cond); values.push(val); };

    if (norm.channelId) pushCond(`channel_id = $${values.length + 1}`, norm.channelId);
    if (norm.symbol) pushCond(`symbol = $${values.length + 1}`, norm.symbol);

    // time range by opened_at
    const rangeMap = { '24h': "24 hours", '7d': '7 days', '30d': '30 days' };
    const sqlRange = rangeMap[period] || null;
    if (sqlRange) whereParts.push(`opened_at >= NOW() - INTERVAL '${sqlRange}'`);

    let sql = `
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END)::int AS open_count,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END)::int AS closed_count,
        COALESCE(SUM(realized_pnl), 0) AS realized_pnl,
        COALESCE(SUM(unrealized_pnl), 0) AS unrealized_pnl
      FROM positions
    `;
    if (whereParts.length) sql += ' WHERE ' + whereParts.join(' AND ');

    const { rows } = await db.query(sql, values);
    const row = rows?.[0] || {};
    return {
      total: row.total || 0,
      open: row.open_count || 0,
      closed: row.closed_count || 0,
      totalRealizedPnl: Number(row.realized_pnl || 0),
      totalUnrealizedPnl: Number(row.unrealized_pnl || 0),
      period,
    };
  }

  /**
   * История PnL позиции (заглушка, пока нет таблицы истории)
   */
  async getPositionPnLHistory(id, interval = '1h') {
    const pos = await Position.findById(id);
    if (!pos) return [];
    // Возвращаем простой ряд из одной точки текущего состояния
    return [{
      timestamp: Date.now(),
      unrealizedPnl: pos.unrealizedPnl || 0,
      realizedPnl: pos.realizedPnl || 0,
      price: pos.currentPrice || pos.entryPrice || 0,
      interval,
    }];
  }

  /**
   * Сводка по активным (open) позициям
   */
  async getActivePositionsSummary(filters = {}) {
    const norm = {
      channelId: filters.channel_id || filters.channelId,
    };
    const whereParts = ["status = 'open'"];
    const values = [];
    if (norm.channelId) { whereParts.push(`channel_id = $1`); values.push(norm.channelId); }

    let sql = `
      SELECT 
        COALESCE(SUM(quantity), 0) AS total_quantity,
        COALESCE(SUM(unrealized_pnl), 0) AS total_unrealized_pnl,
        COUNT(*)::int AS count
      FROM positions
    `;
    if (whereParts.length) sql += ' WHERE ' + whereParts.join(' AND ');
    const { rows } = await db.query(sql, values);
    const row = rows?.[0] || {};
    return {
      totalQuantity: Number(row.total_quantity || 0),
      totalUnrealizedPnl: Number(row.total_unrealized_pnl || 0),
      count: row.count || 0,
    };
  }

  /**
   * Принудительная синхронизация позиций с биржей
   */
  async syncAllPositions() {
    await this.syncOpenPositionsFromExchange();
    return { status: 'ok' };
  }

  /**
   * Сброс P&L (осторожно). Обнуляем unrealized_pnl у open и realized_pnl у всех позиций.
   */
  async resetPositionsAndPnL() {
    const res1 = await db.query("UPDATE positions SET unrealized_pnl = 0 WHERE status = 'open'");
    const res2 = await db.query('UPDATE positions SET realized_pnl = 0 WHERE realized_pnl IS NOT NULL');
    return {
      openUpdated: res1.rowCount || 0,
      realizedReset: res2.rowCount || 0,
    };
  }

  // Возвращает детальную информацию по позиции, подмешивая фактические данные биржи
  async getPositionDetails(positionId) {
    const position = await Position.findById(positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    // если у позиции есть привязка к субаккаунту — берём живые данные
    const subAccountId = position.subAccountId && position.subAccountId !== 'main' ? position.subAccountId : null;
    try {
      const exchangePositions = await this.bingx.getPositions(subAccountId);
      const exchangePosition = Array.isArray(exchangePositions)
        ? exchangePositions.find((p) => p.symbol === position.symbol)
        : null;

      if (exchangePosition) {
        await position.syncFromExchange(exchangePosition);
      }
    } catch (e) {
      logger.warn('getPositionDetails: exchange fetch failed, fallback to stored values', { error: e.message });
    }

    return position.toJSON();
  }

  // Список позиций канала с подстановкой PnL/markPrice с биржи
  async getPositionsByChannel(channelId) {
    const channel = await Channel.findById(channelId);
    if (!channel) throw new Error('Channel not found');

    const positions = await Position.findByChannel(channelId);
    if (!positions || positions.length === 0) return [];

    // Группируем по subAccountId для минимизации запросов
    const groups = new Map();
    for (const p of positions) {
      // нормализуем main / main_account → 'main'
      const isMain = !p.subAccountId || p.subAccountId === 'main' || p.subAccountId === 'main_account';
      const key = isMain ? 'main' : p.subAccountId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }

    for (const [key, group] of groups.entries()) {
      const subAccountId = key === 'main' ? null : key;
      try {
        const exchangePositions = await this.bingx.getPositions(subAccountId);
        if (!Array.isArray(exchangePositions)) continue;

        const index = new Map(exchangePositions.map((ep) => [ep.symbol, ep]));
        for (const pos of group) {
          const ep = index.get(pos.symbol);
          if (ep) {
            await pos.syncFromExchange(ep);
          }
        }
      } catch (e) {
        logger.warn('getPositionsByChannel: exchange fetch failed for group', { subAccountId, error: e.message });
      }
    }

    return positions.map((p) => p.toJSON());
  }

  // Обновляет текущую цену всем открытым позициям (если нужно), без перезаписи PnL
  async updateAllPositionPrices() {
    try {
      const openPositions = await Position.getOpenPositions();
      if (!openPositions || openPositions.length === 0) return;

      // Только цены с котировок (без пересчёта PnL) — PnL подтянем из getPositions()
      for (const pos of openPositions) {
        try {
          const quote = await this.bingx.getSymbolPrice(pos.symbol);
          if (quote && quote.price) {
            await pos.updatePrice(parseFloat(quote.price));
            await this.notifyPriceUpdate(pos);
          }
        } catch (e) {
          logger.warn('updateAllPositionPrices: price fetch failed', { symbol: pos.symbol, error: e.message });
        }
      }
    } catch (e) {
      logger.error('updateAllPositionPrices error:', e);
    }
  }

  // Инициировать фоновые таймеры для синка
  startPositionSync() {
    // 1) периодически обновляем фактические данные позиций с биржи (PnL, markPrice, size)
    if (!this.exchangeSyncTimer) {
      this.exchangeSyncTimer = setInterval(() => {
        this.syncOpenPositionsFromExchange().catch((e) => {
          logger.error('exchangeSyncTimer error:', e);
        });
      }, this.EXCHANGE_SYNC_MS);
    }

    // 2) при необходимости — обновление котировок (без воздействия на PnL)
    if (!this.pricePollTimer) {
      this.pricePollTimer = setInterval(() => {
        this.updateAllPositionPrices().catch((e) => {
          logger.error('pricePollTimer error:', e);
        });
      }, this.PRICE_POLL_MS);
    }
  }

  stopPositionSync() {
    if (this.exchangeSyncTimer) {
      clearInterval(this.exchangeSyncTimer);
      this.exchangeSyncTimer = null;
    }
    if (this.pricePollTimer) {
      clearInterval(this.pricePollTimer);
      this.pricePollTimer = null;
    }
  }

  /**
   * -------- ВНУТРЕННИЕ утилиты --------
   */

  // Батч-синхронизация всех открытых позиций по всем субаккаунтам с биржи
  async syncOpenPositionsFromExchange() {
    const openPositions = await Position.getOpenPositions();
    if (!openPositions || openPositions.length === 0) return;

    // группируем по subAccountId
    const groups = new Map();
    for (const pos of openPositions) {
      const isMain = !pos.subAccountId || pos.subAccountId === 'main' || pos.subAccountId === 'main_account';
      const key = isMain ? 'main' : pos.subAccountId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(pos);
    }

    for (const [key, group] of groups.entries()) {
      const subAccountId = key === 'main' ? null : key;

      let exchangePositions = [];
      try {
        exchangePositions = await this.bingx.getPositions(subAccountId);
      } catch (e) {
        logger.warn('syncOpenPositionsFromExchange: getPositions failed', { subAccountId, error: e.message });
        continue;
      }
      if (!Array.isArray(exchangePositions)) continue;

      const index = new Map(exchangePositions.map((ep) => [ep.symbol, ep]));
      for (const pos of group) {
        const ep = index.get(pos.symbol);
        if (ep) {
          const before = pos.unrealizedPnl;
          await pos.syncFromExchange(ep);
          const after = pos.unrealizedPnl;

          // нотификация фронту (по желанию)
          if (after !== before) {
            await this.notifyPnlUpdate(pos);
          }
        } else {
          // если позиции нет на бирже — попробуем мягко закрыть у нас
          try {
            await pos.syncWithExchange({ existsOnExchange: false });
          } catch (e) {
            logger.warn('syncOpenPositionsFromExchange: local syncWithExchange failed', {
              symbol: pos.symbol, error: e.message
            });
          }
        }
      }
    }
  }

  async notifyPnlUpdate(position) {
    try {
      const payload = {
        positionId: position.id,
        symbol: position.symbol,
        unrealizedPnl: position.unrealizedPnl,
        currentPrice: position.currentPrice,
        leverage: position.leverage,
        timestamp: Date.now()
      };
      await redisUtils.publish(CHANNELS.POSITION_PNL_UPDATED, payload);
    } catch (e) {
      logger.warn('notifyPnlUpdate error:', e.message);
    }
  }

  async notifyPriceUpdate(position) {
    try {
      const payload = {
        positionId: position.id,
        symbol: position.symbol,
        currentPrice: position.currentPrice,
        timestamp: Date.now()
      };
      await redisUtils.publish(CHANNELS.POSITION_PRICE_UPDATED, payload);
    } catch (e) {
      logger.warn('notifyPriceUpdate error:', e.message);
    }
  }
}

module.exports = PositionService;

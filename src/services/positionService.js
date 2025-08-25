/* eslint-disable no-console */
const { logger } = require('../utils/logger');
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

  /**
   * -------- ПУБЛИЧНЫЕ методы для UI/роутов --------
   */

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
      const key = p.subAccountId && p.subAccountId !== 'main' ? p.subAccountId : 'main';
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
      const key = pos.subAccountId && pos.subAccountId !== 'main' ? pos.subAccountId : 'main';
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
      await redisUtils.publish(CHANNELS.POSITION_PNL_UPDATED, {
        positionId: position.id,
        symbol: position.symbol,
        unrealizedPnl: position.unrealizedPnl,
        currentPrice: position.currentPrice,
        leverage: position.leverage,
        timestamp: Date.now()
      });
    } catch (e) {
      logger.warn('notifyPnlUpdate error:', e.message);
    }
  }

  async notifyPriceUpdate(position) {
    try {
      await redisUtils.publish(CHANNELS.POSITION_PRICE_UPDATED, {
        positionId: position.id,
        symbol: position.symbol,
        currentPrice: position.currentPrice,
        timestamp: Date.now()
      });
    } catch (e) {
      logger.warn('notifyPriceUpdate error:', e.message);
    }
  }
}

module.exports = new PositionService();

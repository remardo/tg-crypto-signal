/* eslint-disable no-console */
const BingXService = require('./bingxService');
const { logger } = require('../utils/logger');
const Decimal = require('decimal.js');

class TradeExecutionService {
  constructor() {
    this.bingx = new BingXService();
  }

  formatSymbol(coin) {
    if (!coin) return '';
    const clean = coin.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (clean.endsWith('-USDT') || clean.endsWith('-USDC')) return clean;
    if (clean.endsWith('USDT')) return `${clean.replace('USDT', '')}-USDT`;
    if (clean.endsWith('USDC')) return `${clean.replace('USDC', '')}-USDC`;
    if (clean.includes('USDT') && !clean.endsWith('USDT')) return `${clean.replace('USDT', '')}-USDT`;
    return `${clean}-USDT`;
  }

  roundToStepSize(qty, step) {
    if (!step || step <= 0) return qty;
    return Math.floor(qty / step) * step;
  }

  async getSymbolMeta(symbol) {
    try {
      const info = await this.bingx.getSymbolInfo(symbol);
      return {
        stepSize: info.stepSize || 0.001,
        pricePrecision: info.pricePrecision || 6,
        quantityPrecision: info.quantityPrecision || 4,
        minOrderValue: info.minOrderValue || 3.72
      };
    } catch (e) {
      logger.warn('getSymbolMeta fallback defaults', { error: e.message, symbol });
      return { stepSize: 0.001, pricePrecision: 6, quantityPrecision: 4, minOrderValue: 3.72 };
    }
  }

  /**
   * Главный ордер (MARKET). В него можно вложить TP1/SL в виде JSON (как поддерживает BingX).
   */
  async placeMainOrder({
    coin, direction, quantity, entryPrice, takeProfitLevels = [], stopLoss, leverage, subAccountId
  }) {
    const symbol = this.formatSymbol(coin);
    const meta = await this.getSymbolMeta(symbol);
    const qty = this.roundToStepSize(quantity, meta.stepSize);

    const priceNow = (await this.bingx.getSymbolPrice(symbol)).price;
    const orderData = {
      symbol,
      side: direction === 'LONG' ? 'BUY' : 'SELL',
      type: 'MARKET',
      quantity: qty,
      recvWindow: 5000,
      clientOrderId: `manual_${Date.now()}`
    };

    // первый ТП в основной ордер
    if (Array.isArray(takeProfitLevels) && takeProfitLevels.length > 0) {
      const tp1 = parseFloat(takeProfitLevels[0]);
      const ok = (direction === 'LONG' && tp1 > priceNow) || (direction === 'SHORT' && tp1 < priceNow);
      if (Number.isFinite(tp1) && ok) {
        orderData.takeProfit = JSON.stringify({
          type: 'TAKE_PROFIT_MARKET',
          stopPrice: tp1.toFixed(meta.pricePrecision),
          workingType: 'MARK_PRICE'
        });
      }
    }

    // стоп в основной ордер
    if (Number.isFinite(parseFloat(stopLoss))) {
      const sl = parseFloat(stopLoss);
      const ok = (direction === 'LONG' && sl < priceNow) || (direction === 'SHORT' && sl > priceNow);
      if (ok) {
        orderData.stopLoss = JSON.stringify({
          type: 'STOP_MARKET',
          stopPrice: sl.toFixed(meta.pricePrecision),
          workingType: 'MARK_PRICE'
        });
      }
    }

    // плечо ставим отдельно
    try {
      if (leverage && leverage > 1) {
        const side = direction === 'LONG' ? 'LONG' : direction === 'SHORT' ? 'SHORT' : 'BOTH';
        await this.bingx.setLeverage(symbol, leverage, side, subAccountId);
      }
    } catch (e) {
      logger.warn('setLeverage skipped', { error: e.message });
    }

    return this.bingx.placeOrder(orderData, subAccountId);
  }

  /**
   * Отдельный STOP_MARKET (reduceOnly) по позиции
   */
  async placeStopLossOrder({ symbol, side, positionSide, stopPrice, quantity, subAccountId }) {
    const meta = await this.getSymbolMeta(symbol);
    const qty = this.roundToStepSize(quantity, meta.stepSize);

    const order = {
      symbol,
      side,
      positionSide,
      type: 'STOP_MARKET',
      stopPrice: parseFloat(stopPrice).toFixed(meta.pricePrecision),
      workingType: 'MARK_PRICE',
      quantity: qty,
      reduceOnly: true,
      recvWindow: 5000,
      clientOrderId: `sl_${Date.now()}`
    };
    return this.bingx.placeOrder(order, subAccountId);
  }

  /**
   * Отдельный TAKE_PROFIT_MARKET (reduceOnly) по позиции
   */
  async placeTakeProfitOrder({ symbol, side, positionSide, stopPrice, quantity, subAccountId, tpIndex }) {
    const meta = await this.getSymbolMeta(symbol);
    const qty = this.roundToStepSize(quantity, meta.stepSize);

    const order = {
      symbol,
      side,
      positionSide,
      type: 'TAKE_PROFIT_MARKET',
      stopPrice: parseFloat(stopPrice).toFixed(meta.pricePrecision),
      workingType: 'MARK_PRICE',
      quantity: qty,
      reduceOnly: true,
      recvWindow: 5000,
      clientOrderId: `tp${tpIndex || 1}_${Date.now()}`
    };
    return this.bingx.placeOrder(order, subAccountId);
  }

  /**
   * Утилита распределения количества по TP уровням
   */
  calculateTPQuantity(totalQuantity, tpIndex, tpPercentages) {
    if (Array.isArray(tpPercentages) && tpIndex < tpPercentages.length) {
      const percentage = tpPercentages[tpIndex] / 100;
      return new Decimal(totalQuantity).times(percentage).toNumber();
    }
    const fallbackPercentage = 1 / tpPercentages.length;
    return new Decimal(totalQuantity).times(fallbackPercentage).toNumber();
  }
}

module.exports = TradeExecutionService;

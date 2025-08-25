const { redisUtils, CHANNELS } = require('../config/redis');
const { logger, trade: tradeLog } = require('../utils/logger');
const Signal = require('../models/Signal');
const Channel = require('../models/Channel');
const Account = require('../models/Account');
const Position = require('../models/Position');
const BingXService = require('./bingxService');
const Decimal = require('decimal.js');
const { getRiskManagementStatus } = require('../routes/settings');
const config = require('../config/app');

class ExecutionService {
  constructor() {
    this.bingx = new BingXService();
    this.activeExecutions = new Map();
    this.executionQueue = [];
    this.isProcessing = false;
    this.maxConcurrentExecutions = 3;
    this.processingInterval = null;
  }

  async initialize() {
    try {
      await this.bingx.initialize();
      await this.startExecutionProcessor();
      await this.subscribeToExecutionSignals();
      logger.info('Execution service initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize execution service:', error);
      throw error;
    }
  }

  async subscribeToExecutionSignals() {
    try {
      await redisUtils.subscribe('signal:auto_execute', async (data) => {
        await this.queueExecution(data);
      });

      await redisUtils.subscribe(CHANNELS.SIGNAL_EXECUTED, async (data) => {
        if (data.type === 'signal_approved') {
          const signal = await Signal.findById(data.signalId);
          if (signal && signal.signalType === 'entry') {
            await this.queueExecution({
              signalId: signal.id,
              channelId: signal.channelId,
              priority: signal.confidenceScore,
              manual: true
            });
          }
        }
      });

      logger.info('Subscribed to execution signals');
    } catch (error) {
      logger.error('Error subscribing to execution signals:', error);
    }
  }

  async startExecutionProcessor() {
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing && this.activeExecutions.size < this.maxConcurrentExecutions) {
        await this.processExecutionQueue();
      }
    }, 2000);
    logger.info('Execution processor started');
  }

  async queueExecution(executionData) {
    try {
      await redisUtils.lPush('execution_queue', executionData);
      this.executionQueue.push(executionData);

      tradeLog('queued', {
        signalId: executionData.signalId,
        priority: executionData.priority,
        manual: executionData.manual || false
      });
    } catch (error) {
      logger.error('Error queueing execution:', error);
    }
  }

  async processExecutionQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const available = this.maxConcurrentExecutions - this.activeExecutions.size;

      for (let i = 0; i < available; i++) {
        const executionData = await redisUtils.rPop('execution_queue');
        if (!executionData) break;

        const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        this.activeExecutions.set(executionId, {
          signalId: executionData.signalId,
          status: 'running',
          startTime: new Date()
        });

        this.executeSignal(executionData.signalId, executionId)
          .catch(err => logger.error(`Execution error for signal ${executionData.signalId}:`, err));
      }
    } catch (error) {
      logger.error('Error processing execution queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async executeSignal(signalId, executionId) {
    let signal, channel, account, subAccountId;

    try {
      logger.info('Executing signal', { signalId, executionId });

      signal = await Signal.findById(signalId);
      if (!signal) throw new Error('Signal not found');

      channel = await Channel.findById(signal.channelId);
      if (!channel) throw new Error('Channel not found');

      account = await Account.findByChannelId(signal.channelId);
      if (!account) throw new Error('Account not found');

      subAccountId = account.bingxSubAccountId || null;

      // Risk checks
      const riskChecks = await this.performRiskChecks(signal, channel, account);
      if (!riskChecks.passed) throw new Error(`Risk check failed: ${riskChecks.reason}`);

      const accountInfo = await this.bingx.getAccountInfo(subAccountId);
      const availableBalance = accountInfo.availableBalance;

      const symbol = this.formatSymbol(signal.coin);

      // Contract info
      let symbolInfo;
      try {
        symbolInfo = await this.bingx.getSymbolInfo(symbol);
      } catch (e) {
        logger.warn(`Could not get symbol info for ${symbol}, using defaults`, { error: e.message });
        symbolInfo = {
          minQty: 0.001,
          maxQty: 1000000,
          stepSize: 0.001,
          tickSize: 0.0001,
          minOrderValue: 5,
          maxLeverage: 125
        };
      }

      const riskManagementDisabled = await getRiskManagementStatus();

      // Position size
      let positionSize = signal.customQuantity || this.calculatePositionSize(
        signal, channel, availableBalance, symbolInfo
      );

      if (symbolInfo && symbolInfo.stepSize) {
        const orig = positionSize;
        positionSize = this.roundToStepSize(positionSize, symbolInfo.stepSize);
        logger.info('Rounded position size to step size', {
          originalSize: orig,
          roundedSize: positionSize,
          stepSize: symbolInfo.stepSize,
          symbol
        });
      }

      if (positionSize <= 0 && !riskManagementDisabled) {
        throw new Error('Calculated position size is zero or negative');
      } else if (positionSize <= 0 && riskManagementDisabled) {
        logger.warn('Using minimum position size - risk management disabled', {
          signalId: signal.id, originalSize: positionSize, symbol
        });
        const minOrderValue = symbolInfo.minOrderValue || 5;
        let minQty = minOrderValue / Number(signal.entryPrice);
        minQty = Math.max(minQty, symbolInfo.minQty || 0.001);
        positionSize = symbolInfo.stepSize ? this.roundToStepSize(minQty, symbolInfo.stepSize) : minQty;
        logger.info('Adjusted position size for execution', {
          signalId: signal.id, adjustedSize: positionSize, symbol
        });
      }

      if (!riskManagementDisabled) {
        const v = this.validateOrderParameters(signal, positionSize, symbolInfo, accountInfo);
        if (!v.isValid) throw new Error(`Order validation failed: ${v.errors.join(', ')}`);
      } else {
        logger.warn('Order parameter validation BYPASSED - risk management disabled', {
          signalId: signal.id, positionSize, symbol
        });
      }

      // === ВАЖНО === Плечо ставим ДО ордера
      if (signal.leverage && signal.leverage > 1) {
        await this.setLeverageSafely(symbol, signal.leverage, subAccountId);
      }

      // Ордер
      const orderResult = await this.placeOrder(
        signal, positionSize, symbol, subAccountId, symbolInfo
      );

      // Позиция
      const position = await this.createPosition(
        signal, orderResult, account, positionSize, channel, subAccountId
      );

      // Доп. защитные ордера (опционально)
      await this.placeRiskManagementOrders(position, signal, subAccountId, channel);

      await signal.execute();
      await this.notifyExecution(signal, position, orderResult);

      tradeLog('executed', {
        signalId: signal.id,
        positionId: position.id,
        symbol,
        side: orderResult.side || this.getOrderSide(signal.direction),
        quantity: positionSize,
        executedPrice: orderResult.executedPrice,
        orderId: orderResult.orderId
      });

      return { success: true, position, order: orderResult };
    } catch (error) {
      logger.error(`Signal execution failed for ${signalId}:`, error);

      try {
        const s = await Signal.findById(signalId);
        if (s) await s.markAsFailed(error.message);
      } catch (updateError) {
        logger.error('Error updating signal status:', updateError);
      }

      tradeLog('execution_failed', { signalId, error: error.message, executionId });
      return { success: false, error: error.message };
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  async performRiskChecks(signal, channel, account) {
    try {
      const riskOff = await getRiskManagementStatus();
      if (riskOff) {
        logger.warn('Risk management is DISABLED - bypassing all risk checks!', {
          signalId: signal.id, coin: signal.coin, direction: signal.direction
        });
        return { passed: true, checks: ['Risk management disabled - all checks bypassed'], warning: 'Risk management is disabled' };
      }

      const accountInfo = await this.bingx.getAccountInfo(account.bingxSubAccountId || null);

      if (signal.confidenceScore < config.trading.minSignalConfidence) {
        return { passed: false, reason: `Signal confidence ${signal.confidenceScore} below minimum ${config.trading.minSignalConfidence}` };
      }

      if (accountInfo.availableBalance < config.trading.minTradeAmount) {
        return { passed: false, reason: `Insufficient balance: ${accountInfo.availableBalance} < ${config.trading.minTradeAmount} USDT` };
      }

      if (signal.leverage && signal.leverage > config.trading.maxLeverage) {
        return { passed: false, reason: `Leverage ${signal.leverage} exceeds maximum ${config.trading.maxLeverage}` };
      }

      const openPositions = await Position.getOpenPositions(channel.id);
      if (openPositions.length >= config.trading.maxOpenPositions) {
        return { passed: false, reason: `Maximum open positions reached: ${openPositions.length}/${config.trading.maxOpenPositions}` };
      }

      const symbol = this.formatSymbol(signal.coin);
      const existing = openPositions.find(p => p.symbol === symbol);
      if (existing) return { passed: false, reason: `Position already exists for ${symbol}` };

      const rr = signal.calculateRiskReward();
      if (rr && rr.ratio < 0.1) {
        return { passed: false, reason: `Poor risk/reward ratio: ${rr.ratio.toFixed(2)}` };
      }

      if (accountInfo.marginRatio > 80) {
        return { passed: false, reason: `High margin usage: ${accountInfo.marginRatio}%` };
      }

      return { passed: true, checks: [] };
    } catch (error) {
      logger.error('Error performing risk checks:', error);
      return { passed: false, reason: `Risk check error: ${error.message}` };
    }
  }

  calculatePositionSize(signal, channel, availableBalance, symbolInfo = null) {
    try {
      if (!signal.entryPrice) return 0;

      const depositPct = 10;
      const leverage = signal.leverage || 1;

      const riskAmount = new Decimal(availableBalance).times(depositPct).div(100);
      const positionValue = riskAmount.times(leverage);

      const entryPrice = new Decimal(signal.entryPrice);
      let qty = positionValue.div(entryPrice);

      logger.info('Position size calculation (new logic)', {
        availableBalance,
        depositPercentage: depositPct,
        leverage,
        riskAmount: riskAmount.toFixed(2),
        positionValue: positionValue.toFixed(2),
        entryPrice: entryPrice.toFixed(6),
        calculatedQuantity: qty.toFixed(6),
        symbol: signal.coin
      });

      if (symbolInfo) {
        const minQty = new Decimal(symbolInfo.minQty || 0.0001);
        const step = new Decimal(symbolInfo.stepSize || 0.0001);

        if (qty.lessThan(minQty)) {
          logger.warn(`Calculated quantity ${qty.toFixed(8)} below exchange minimum ${minQty}, using minimum`, {
            calculatedQuantity: qty.toFixed(8),
            exchangeMinimum: minQty.toFixed(8),
            coin: signal.coin
          });
          qty = minQty;
        }

        const steps = qty.div(step).floor();
        qty = steps.times(step);

        if (qty.lessThan(minQty)) qty = minQty;

        logger.info('Applied exchange requirements', {
          minQty: minQty.toFixed(8),
          stepSize: step.toFixed(8),
          finalQuantity: qty.toFixed(8),
          finalValue: qty.times(entryPrice).toFixed(2)
        });
      } else {
        const minOrderValue = new Decimal(5);
        const minQtyByValue = minOrderValue.div(entryPrice);
        if (qty.lessThan(minQtyByValue)) {
          logger.warn(`Calculated quantity ${qty.toFixed(8)} too small, using minimum $5 order`, {
            calculatedQuantity: qty.toFixed(8),
            minQuantity: minQtyByValue.toFixed(8),
            entryPrice: entryPrice.toFixed(2)
          });
          qty = minQtyByValue;
        }
      }

      const result = qty.toNumber();
      logger.info('Final position size calculated', {
        quantity: result,
        estimatedValue: (result * signal.entryPrice).toFixed(2),
        leverage,
        symbol: signal.coin
      });
      return result;
    } catch (error) {
      logger.error('Error calculating position size:', error);
      return 0;
    }
  }

  validateOrderParameters(signal, quantity, symbolInfo, accountInfo) {
    const errors = [];
    try {
      if (quantity < symbolInfo.minQty) errors.push(`Quantity ${quantity} below minimum ${symbolInfo.minQty}`);
      if (quantity > symbolInfo.maxQty) errors.push(`Quantity ${quantity} exceeds maximum ${symbolInfo.maxQty}`);

      const step = symbolInfo.stepSize;
      if (step > 0) {
        const rounded = this.roundToStepSize(quantity, step);
        const diff = Math.abs(quantity - rounded);
        const tol = step * 1e-6;
        if (diff > tol) errors.push(`Quantity ${quantity} doesn't match step size ${step}`);
      }

      const lev = signal.leverage || 1;
      const required = (Number(quantity) * Number(signal.entryPrice)) / lev;
      if (required > accountInfo.availableBalance) {
        errors.push(`Insufficient margin: required ${required}, available ${accountInfo.availableBalance}`);
      }

      if (signal.leverage && signal.leverage > symbolInfo.maxLeverage) {
        errors.push(`Leverage ${signal.leverage} exceeds symbol maximum ${symbolInfo.maxLeverage}`);
      }
    } catch (e) {
      errors.push(`Validation error: ${e.message}`);
    }
    return { isValid: errors.length === 0, errors };
  }

  async setLeverageSafely(symbol, leverage, subAccountId) {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.bingx.setLeverage(symbol, leverage, subAccountId);
        logger.info('Leverage set successfully', { symbol, leverage, subAccountId, attempt });
        return;
      } catch (e) {
        logger.warn('Failed to set leverage, retrying...', { symbol, leverage, attempt, error: e.message });
        if (attempt === maxRetries) throw e;
        await new Promise(r => setTimeout(r, 350));
      }
    }
  }

  async placeOrder(signal, quantity, symbol, subAccountId, symbolInfo) {
    try {
      const priceInfo = await this.bingx.getSymbolPrice(symbol);
      const currentPrice = Number(priceInfo.price);

      const step = symbolInfo?.stepSize || 0.001;
      const tick = symbolInfo?.tickSize || 0.0001;

      const qty = this.roundToStepSize(quantity, step);
      const positionSide = signal.direction === 'LONG' ? 'LONG' : 'SHORT';

      const orderData = {
        symbol,
        side: this.getOrderSide(signal.direction),
        positionSide,             // важно для Hedge Mode
        type: 'MARKET',
        quantity: qty,
        recvWindow: 5000,
        clientOrderId: `sig${Date.now()}`
        // ВАЖНО: НЕ передавать leverage здесь
      };

      // helper: округление цены к тик-сайзу
      const roundToTick = (p) => Math.floor(Number(p) / tick) * tick;
      const tickDecimals = (String(tick).split('.')[1] || '').length;

      // TP
      if (signal.takeProfitLevels && signal.takeProfitLevels.length > 0) {
        const rawTp = parseFloat(
          typeof signal.takeProfitLevels[0] === 'object'
            ? signal.takeProfitLevels[0].price
            : signal.takeProfitLevels[0]
        );
        const tpPrice = Number(roundToTick(rawTp).toFixed(tickDecimals));
        const tpOk = (signal.direction === 'LONG' && tpPrice > currentPrice)
                  || (signal.direction === 'SHORT' && tpPrice < currentPrice);
        if (tpOk) {
          orderData.takeProfit = JSON.stringify({
            type: 'TAKE_PROFIT_MARKET',
            stopPrice: tpPrice,
            workingType: 'MARK_PRICE'
          });
          logger.info(`Added take profit at ${tpPrice} (current: ${currentPrice})`, {
            symbol, direction: signal.direction, tpPrice, currentPrice
          });
        } else {
          logger.warn('Skipping take profit - invalid level for current price', {
            symbol, direction: signal.direction, tpPrice, currentPrice
          });
        }
      }

      // SL
      if (signal.stopLoss) {
        const rawSl = parseFloat(signal.stopLoss);
        const slPrice = Number(roundToTick(rawSl).toFixed(tickDecimals));
        const slOk = (signal.direction === 'LONG' && slPrice < currentPrice)
                  || (signal.direction === 'SHORT' && slPrice > currentPrice);
        if (slOk) {
          orderData.stopLoss = JSON.stringify({
            type: 'STOP_MARKET',
            stopPrice: slPrice,
            workingType: 'MARK_PRICE'
          });
          logger.info(`Added stop loss at ${slPrice} (current: ${currentPrice})`, {
            symbol, direction: signal.direction, slPrice, currentPrice
          });
        } else {
          logger.warn('Skipping stop loss - invalid level for current price', {
            symbol, direction: signal.direction, slPrice, currentPrice
          });
        }
      }

      const effectiveSub = subAccountId && subAccountId !== 'main_account' ? subAccountId : null;
      const result = await this.bingx.placeOrder(orderData, effectiveSub);
      return result;
    } catch (error) {
      logger.error('Error placing order:', error);
      throw error;
    }
  }

  async createPosition(signal, orderResult, account, quantity, channel, subAccountId = null) {
    try {
      const positionData = {
        signalId: signal.id,
        channelId: signal.channelId,
        subAccountId: subAccountId || 'main',
        symbol: orderResult.symbol,
        side: orderResult.side || this.getOrderSide(signal.direction),
        quantity,
        entryPrice: orderResult.executedPrice || signal.entryPrice,
        leverage: signal.leverage,
        takeProfitLevels: signal.takeProfitLevels,
        stopLoss: signal.stopLoss,
        bingxOrderId: orderResult.orderId,
        tpPercentages: channel.tpPercentages || [25.0, 25.0, 50.0]
      };
      const position = await Position.create(positionData);
      return position;
    } catch (error) {
      logger.error('Error creating position:', error);
      throw error;
    }
  }

  async placeRiskManagementOrders(position, signal, subAccountId, channel) {
    try {
      const orders = [];

      if (signal.stopLoss) {
        try {
          const stopLossOrder = {
            symbol: position.symbol,
            side: position.side === 'BUY' ? 'SELL' : 'BUY',
            positionSide: position.side === 'BUY' ? 'LONG' : 'SHORT',
            type: 'MARKET',
            quantity: position.quantity,
            reduceOnly: true,
            recvWindow: 5000,
            clientOrderId: `sl${Date.now()}`
          };

          const effectiveSub = subAccountId && subAccountId !== 'main_account' ? subAccountId : null;
          const slResult = await this.bingx.placeOrder(stopLossOrder, effectiveSub);
          orders.push({ type: 'stop_loss', order: slResult });

          logger.info('Successfully placed stop-loss order', {
            symbol: position.symbol,
            stopPrice: signal.stopLoss,
            side: stopLossOrder.side,
            positionSide: stopLossOrder.positionSide,
            orderId: slResult.orderId
          });
        } catch (error) {
          logger.error('Error placing stop-loss order:', error);
        }
      }

      if (signal.takeProfitLevels && signal.takeProfitLevels.length > 0) {
        const tpPercentages = channel.tpPercentages || [25.0, 25.0, 50.0];
        const minOrderValue = 3.72;

        const sorted = [...signal.takeProfitLevels].sort((a, b) => {
          const ap = typeof a === 'object' ? parseFloat(a.price) : parseFloat(a);
          const bp = typeof b === 'object' ? parseFloat(b.price) : parseFloat(b);
          return position.side === 'BUY' ? ap - bp : bp - ap;
        });

        const viable = [];
        let remaining = position.quantity;

        for (let i = 0; i < sorted.length; i++) {
          const lvl = sorted[i];
          const price = typeof lvl === 'object' ? parseFloat(lvl.price) : parseFloat(lvl);
          let qty = this.calculateTPQuantity(position.quantity, i, tpPercentages);
          const minQtyForValue = minOrderValue / price;

          if (qty * price < minOrderValue) {
            if (minQtyForValue <= remaining) {
              qty = minQtyForValue;
            } else if (remaining * price >= minOrderValue) {
              qty = remaining;
            } else {
              logger.warn(`Skipping TP${i + 1} - insufficient remaining quantity for minimum order value`, {
                remainingQuantity: remaining, requiredQuantity: minQtyForValue, minOrderValue, price
              });
              continue;
            }
          }

          viable.push({ index: i + 1, price, quantity: qty, value: qty * price });
          remaining -= qty;
          if (remaining <= 0) break;
        }

        for (const v of viable) {
          try {
            const tpOrder = {
              symbol: position.symbol,
              side: position.side === 'BUY' ? 'SELL' : 'BUY',
              positionSide: position.side === 'BUY' ? 'LONG' : 'SHORT',
              type: 'MARKET',
              quantity: v.quantity,
              reduceOnly: true,
              recvWindow: 5000,
              clientOrderId: `tp${v.index}_${Date.now()}`
            };

            const effectiveSub = subAccountId && subAccountId !== 'main_account' ? subAccountId : null;
            const tpResult = await this.bingx.placeOrder(tpOrder, effectiveSub);
            orders.push({ type: `take_profit_${v.index}`, order: tpResult });

            logger.info(`Successfully placed TP${v.index} order`, {
              quantity: v.quantity,
              price: v.price,
              value: v.value.toFixed(2),
              orderId: tpResult.orderId,
              side: tpOrder.side,
              positionSide: tpOrder.positionSide,
              type: tpOrder.type,
              reduceOnly: tpOrder.reduceOnly
            });
          } catch (error) {
            logger.error(`Error placing take-profit order ${v.index}:`, error);
          }
        }

        if (viable.length === 0) {
          logger.warn('No viable take profit orders could be created due to minimum order value requirements', {
            positionQuantity: position.quantity,
            minOrderValue,
            symbol: position.symbol
          });
        } else {
          logger.info(`Created ${viable.length} take profit orders out of ${sorted.length} levels`, {
            totalValue: viable.reduce((s, x) => s + x.value, 0).toFixed(2),
            remainingQuantity: Math.max(0, remaining),
            takeProfitPrices: viable.map(x => ({ index: x.index, price: x.price })),
            positionSide: position.side,
            positionDirection: position.side === 'BUY' ? 'LONG' : 'SHORT'
          });
        }
      }

      return orders;
    } catch (error) {
      logger.error('Error placing risk management orders:', error);
      return [];
    }
  }

  calculateTPQuantity(totalQuantity, tpIndex, tpPercentages) {
    if (Array.isArray(tpPercentages) && tpIndex < tpPercentages.length) {
      const p = tpPercentages[tpIndex] / 100;
      return new Decimal(totalQuantity).times(p).toNumber();
    }
    const fallback = 1 / tpPercentages.length;
    return new Decimal(totalQuantity).times(fallback).toNumber();
  }

  async notifyExecution(signal, position, orderResult) {
    try {
      const notification = {
        type: 'signal_executed',
        signal: signal.toJSON(),
        position: position.toJSON(),
        order: orderResult,
        timestamp: new Date()
      };
      await redisUtils.publish(CHANNELS.SIGNAL_EXECUTED, notification);
    } catch (error) {
      logger.error('Error notifying execution:', error);
    }
  }

  async executeSignalManually(signalId, customParams = {}) {
    try {
      const signal = await Signal.findById(signalId);
      if (!signal) throw new Error('Signal not found');

      if (customParams.positionSize) signal.customQuantity = customParams.positionSize;
      if (customParams.leverage) signal.leverage = customParams.leverage;

      const executionData = {
        signalId: signal.id,
        channelId: signal.channelId,
        priority: 1,
        manual: true,
        customParams
      };

      await this.queueExecution(executionData);
      return { success: true, message: 'Signal queued for manual execution' };
    } catch (error) {
      logger.error('Error executing signal manually:', error);
      throw error;
    }
  }

  // ---------- Utils ----------
  formatSymbol(coin) {
    if (!coin) return '';
    const raw = String(coin).trim().toUpperCase();

    if (/^[A-Z0-9]+-(USDT|USDC)$/.test(raw)) return raw;

    if (/^[A-Z0-9]+(USDT|USDC)$/.test(raw)) {
      const base = raw.replace(/(USDT|USDC)$/, '');
      const quote = raw.endsWith('USDT') ? 'USDT' : 'USDC';
      return `${base}-${quote}`;
    }

    if (/^[A-Z0-9]+$/.test(raw)) return `${raw}-USDT`;

    const clean = raw.replace(/[^A-Z0-9-]/g, '');
    if (clean.includes('-')) {
      const [base, quote = 'USDT'] = clean.split('-');
      return `${base}-${quote}`.toUpperCase();
    }
    return `${clean}-USDT`;
  }

  getOrderSide(direction) {
    return direction === 'LONG' ? 'BUY' : 'SELL';
  }

  roundToStepSize(quantity, stepSize) {
    return Math.floor(Number(quantity) / Number(stepSize)) * Number(stepSize);
  }

  async getExecutionStats() {
    try {
      const queueSize = await redisUtils.lLen('execution_queue');
      return {
        activeExecutions: this.activeExecutions.size,
        queueSize,
        maxConcurrentExecutions: this.maxConcurrentExecutions,
        isProcessing: this.isProcessing,
        activeExecutionDetails: Array.from(this.activeExecutions.entries()).map(([id, data]) => ({
          executionId: id,
          signalId: data.signalId,
          status: data.status,
          duration: Date.now() - data.startTime.getTime()
        }))
      };
    } catch (error) {
      logger.error('Error getting execution stats:', error);
      return { activeExecutions: 0, queueSize: 0, error: error.message };
    }
  }

  async shutdown() {
    try {
      logger.info('Shutting down execution service...');
      if (this.processingInterval) clearInterval(this.processingInterval);

      const timeout = 30000;
      const startTime = Date.now();

      while (this.activeExecutions.size > 0 && (Date.now() - startTime) < timeout) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (this.activeExecutions.size > 0) {
        logger.warn(`${this.activeExecutions.size} executions still active during shutdown`);
      }

      this.isProcessing = false;
      logger.info('Execution service shutdown complete');
    } catch (error) {
      logger.error('Error during execution service shutdown:', error);
    }
  }
}

module.exports = ExecutionService;

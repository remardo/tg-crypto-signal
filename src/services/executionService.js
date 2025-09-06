/* eslint-disable no-console */
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

    // watchers for breakeven
    this.breakevenWatchers = new Map(); // key: positionId, value: timer
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
      for (let i = 0; i < available; i += 1) {
        const executionData = await redisUtils.rPop('execution_queue');
        if (!executionData) break;
        this.executeSignal(
          executionData.signalId,
          `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        ).catch((error) => {
          logger.error(`Execution error for signal ${executionData.signalId}:`, error);
        });
      }
    } catch (error) {
      logger.error('Error processing execution queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async executeSignal(signalId, executionId) {
    let signal; let channel; let account; let subAccountId;
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

      // Balance & symbol info
      const accountInfo = await this.bingx.getAccountInfo(subAccountId);
      const availableBalance = accountInfo.availableBalance;
      const symbol = this.formatSymbol(signal.coin);

      let symbolInfo;
      try {
        symbolInfo = await this.bingx.getSymbolInfo(symbol);
      } catch (e) {
        logger.warn(`Could not get symbol info for ${symbol}, using defaults`, { error: e.message });
        symbolInfo = {
          minQty: 0.001,
          maxQty: 1000000,
          stepSize: 0.001,
          minOrderValue: 5,
          maxLeverage: 125,
          pricePrecision: 6,
          quantityPrecision: 4
        };
      }

      // Position size = 10% депозита * плечо
      const riskManagementDisabled = await getRiskManagementStatus();
      let positionSize = signal.customQuantity || this.calculatePositionSize(
        signal, channel, availableBalance, symbolInfo
      );

      // округление к stepSize
      if (symbolInfo.stepSize) {
        const rounded = this.roundToStepSize(positionSize, symbolInfo.stepSize);
        logger.info('Rounded position size to step size', {
          originalSize: positionSize, roundedSize: rounded, stepSize: symbolInfo.stepSize, symbol
        });
        positionSize = rounded;
      }

      if (positionSize <= 0 && !riskManagementDisabled) throw new Error('Calculated position size is zero or negative');
      if (positionSize <= 0 && riskManagementDisabled) {
        const mov = symbolInfo.minOrderValue || 5;
        const minQty = mov / signal.entryPrice;
        positionSize = this.roundToStepSize(Math.max(minQty, symbolInfo.minQty || 0.001), symbolInfo.stepSize || 0.001);
        logger.warn('Using minimum position size - risk management disabled', { symbol, positionSize });
      }

      if (!riskManagementDisabled) {
        const validation = this.validateOrderParameters(signal, positionSize, symbolInfo, accountInfo);
        if (!validation.isValid) throw new Error(`Order validation failed: ${validation.errors.join(', ')}`);
      } else {
        logger.warn('Order parameter validation BYPASSED - risk management disabled', { symbol, positionSize });
      }

      // set leverage (в отдельном запросе)
      await this.setLeverageSafely(symbol, signal.leverage, signal.direction, subAccountId);

      // основной ордер
      const effectiveSubAccountId = subAccountId && subAccountId !== 'main_account' ? subAccountId : null;
      const orderResult = await this.placeOrder(signal, positionSize, symbol, effectiveSubAccountId);

      // Wait for the position to be actually opened on the exchange before creating a local one
      const appeared = await this.waitForExchangePosition(symbol, effectiveSubAccountId, 15000);
      
      // If position didn't appear but order is FILLED, continue anyway
      if (!appeared) {
        if (orderResult.status === 'FILLED') {
          logger.warn('Position not found but order is FILLED, continuing execution', { 
            symbol, 
            orderId: orderResult.orderId, 
            status: orderResult.status,
            executedQty: orderResult.executedQty
          });
        } else {
          const msg = 'Entry order not confirmed on exchange within timeout';
          logger.warn(msg, { symbol, orderId: orderResult.orderId, status: orderResult.status });
          throw new Error(msg);
        }
      }

      // fetch fresh exchange position details to capture entryPrice/side accurately
      try {
        const exPositions = await this.bingx.getPositions(effectiveSubAccountId);
        const exPos = Array.isArray(exPositions)
          ? exPositions.find((p) => p.symbol === symbol && p.size && Math.abs(p.size) > 0)
          : null;
        if (exPos) {
          orderResult.executedPrice = exPos.entryPrice || orderResult.executedPrice;
          orderResult.side = exPos.side || orderResult.side;
        }
      } catch (e) {
        logger.warn('Failed to fetch exchange position after order placement', { symbol, error: e.message });
      }

      // запись позиции (только после подтверждения с биржи)
      const position = await this.createPosition(signal, orderResult, account, positionSize, channel, subAccountId);

      // стоп и все ТП (TP1/TP2/TP3) ставим только при наличии позиции на бирже
      const rmOrders = await this.placeRiskManagementOrders(position, signal, subAccountId, channel, symbolInfo);

      await signal.execute();
      await this.notifyExecution(signal, position, orderResult);

      tradeLog('executed', {
        signalId: signal.id, positionId: position.id, symbol, side: orderResult.side || this.getOrderSide(signal.direction),
        quantity: positionSize, executedPrice: orderResult.executedPrice, orderId: orderResult.orderId
      });

      return { success: true, position, order: orderResult, rmOrders };
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
      const riskManagementDisabled = await getRiskManagementStatus();
      if (riskManagementDisabled) {
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
      const existing = openPositions.find((p) => p.symbol === symbol);
      if (existing) return { passed: false, reason: `Position already exists for ${symbol}` };

      const rr = signal.calculateRiskReward();
      if (rr && rr.ratio < 0.1) return { passed: false, reason: `Poor risk/reward ratio: ${rr.ratio.toFixed(2)}` };

      if (accountInfo.marginRatio > 80) return { passed: false, reason: `High margin usage: ${accountInfo.marginRatio}%` };

      return { passed: true, checks: [] };
    } catch (error) {
      logger.error('Error performing risk checks:', error);
      return { passed: false, reason: `Risk check error: ${error.message}` };
    }
  }

  calculatePositionSize(signal, _channel, availableBalance, symbolInfo = null) {
    try {
      if (!signal.entryPrice) return 0;
      const depositPercentage = 10;
      const leverage = signal.leverage || 1;
      const riskAmount = new Decimal(availableBalance).times(depositPercentage).div(100);
      const positionValue = riskAmount.times(leverage);

      const entryPrice = new Decimal(signal.entryPrice);
      let finalQty = positionValue.div(entryPrice);

      logger.info('Position size calculation (new logic)', {
        availableBalance, depositPercentage, leverage, riskAmount: riskAmount.toFixed(2),
        positionValue: positionValue.toFixed(2), entryPrice: entryPrice.toFixed(6),
        calculatedQuantity: finalQty.toFixed(6), symbol: signal.coin
      });

      if (symbolInfo) {
        const exchangeMinQty = new Decimal(symbolInfo.minQty || 0.0001);
        const stepSize = new Decimal(symbolInfo.stepSize || 0.0001);
        if (finalQty.lessThan(exchangeMinQty)) {
          finalQty = exchangeMinQty;
        }
        finalQty = finalQty.div(stepSize).floor().times(stepSize);
        if (finalQty.lessThan(exchangeMinQty)) finalQty = exchangeMinQty;

        logger.info('Applied exchange requirements', {
          minQty: exchangeMinQty.toFixed(8), stepSize: stepSize.toFixed(8),
          finalQuantity: finalQty.toFixed(8), finalValue: finalQty.times(entryPrice).toFixed(2)
        });

        // Enforce minimal notional (min USDT value) if provided by exchange
        if (symbolInfo.minOrderValue) {
          const minNotional = new Decimal(symbolInfo.minOrderValue);
          const minQtyByVal = minNotional.div(entryPrice);
          if (finalQty.lessThan(minQtyByVal)) {
            finalQty = minQtyByVal.div(stepSize).floor().times(stepSize);
            if (finalQty.lessThan(exchangeMinQty)) finalQty = exchangeMinQty;
            logger.info('Adjusted to meet min notional', {
              minNotional: minNotional.toFixed(2), adjustedQty: finalQty.toFixed(8)
            });
          }
        }
      } else {
        const minOrderValue = new Decimal(5);
        const minQtyByVal = minOrderValue.div(entryPrice);
        if (finalQty.lessThan(minQtyByVal)) finalQty = minQtyByVal;
      }

      const result = finalQty.toNumber();
      logger.info('Final position size calculated', {
        quantity: result, estimatedValue: (result * signal.entryPrice).toFixed(2), leverage: signal.leverage || 1, symbol: signal.coin
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

      const stepSize = symbolInfo.stepSize;
      if (stepSize > 0) {
        const rounded = this.roundToStepSize(quantity, stepSize);
        const diff = Math.abs(quantity - rounded);
        const tol = stepSize * 0.000001;
        if (diff > tol) errors.push(`Quantity ${quantity} doesn't match step size ${stepSize}`);
      }

      const leverage = signal.leverage || 1;
      const entryPrice = signal.entryPrice;
      const requiredMargin = (quantity * entryPrice) / leverage;
      if (requiredMargin > accountInfo.availableBalance) {
        errors.push(`Insufficient margin: required ${requiredMargin}, available ${accountInfo.availableBalance}`);
      }

      if (signal.leverage && signal.leverage > symbolInfo.maxLeverage) {
        errors.push(`Leverage ${signal.leverage} exceeds symbol maximum ${symbolInfo.maxLeverage}`);
      }
      if (symbolInfo.minOrderValue) {
        const notional = quantity * entryPrice;
        if (notional < symbolInfo.minOrderValue) {
          errors.push(`Order notional ${notional.toFixed(2)} below exchange minimum ${symbolInfo.minOrderValue}`);
        }
      }
    } catch (error) {
      errors.push(`Validation error: ${error.message}`);
    }
    return { isValid: errors.length === 0, errors };
  }

  async setLeverageSafely(symbol, leverage, direction, subAccountId) {
    try {
      if (!leverage || leverage <= 1) return;
      
      // Determine side from direction
      const side = direction === 'LONG' ? 'LONG' : direction === 'SHORT' ? 'SHORT' : 'BOTH';
      
      await this.bingx.setLeverage(symbol, leverage, side, subAccountId);
      logger.info('Leverage set', { symbol, leverage, side });
    } catch (e) {
      logger.warn(`Skipping leverage setting for ${symbol} due to API issues`, {
        requestedLeverage: leverage, symbol, direction
      });
    }
  }

  async placeOrder(signal, quantity, symbol, subAccountId) {
    try {
      const currentPriceInfo = await this.bingx.getSymbolPrice(symbol);
      const currentPrice = currentPriceInfo.price;

      let stepSize = 0.001; let pricePrecision = 6;
      try {
        const info = await this.bingx.getSymbolInfo(symbol);
        stepSize = info.stepSize || 0.001;
        pricePrecision = info.pricePrecision || 6;
      } catch (e) {
        logger.warn(`Could not get symbol info for step/precision, using defaults`, { symbol, error: e.message });
      }

      const orderData = {
        symbol,
        side: this.getOrderSide(signal.direction),
        type: 'MARKET',
        quantity: this.roundToStepSize(quantity, stepSize),
        recvWindow: 5000,
        clientOrderId: `sig_${Date.now()}`
      };

      // Temporarily disable TP/SL in main order to test basic functionality
      // TODO: Re-enable TP/SL in main order once BingX API supports it properly
      // if (signal.takeProfitLevels && signal.takeProfitLevels.length > 0) {
      //   const firstTP = signal.takeProfitLevels[0];
      //   orderData.takeProfit = {
      //     type: 'TAKE_PROFIT_MARKET',
      //     stopPrice: parseFloat(firstTP.price || firstTP),
      //     price: parseFloat(firstTP.price || firstTP),
      //     workingType: 'MARK_PRICE'
      //   };
      // }

      // if (signal.stopLoss) {
      //   orderData.stopLoss = {
      //     type: 'STOP_MARKET',
      //     stopPrice: parseFloat(signal.stopLoss),
      //     price: parseFloat(signal.stopLoss),
      //     workingType: 'MARK_PRICE'
      //   };
      // }

      const result = await this.bingx.placeOrder(orderData, subAccountId);
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

  /**
   * Создаём отдельный STOP_MARKET и TAKE_PROFIT_MARKET ордера (reduceOnly)
   * Все TP уровни выставляются как отдельные conditional ордера
   * + включаем watcher для переноса стопа в BE после первого частичного тейка
   */
  async placeRiskManagementOrders(position, signal, subAccountId, channel, symbolInfo) {
    const orders = [];
    try {
      const effectiveSubAccountId = subAccountId && subAccountId !== 'main_account' ? subAccountId : null;
      const pricePrecision = symbolInfo?.pricePrecision || 6;
      const stepSize = symbolInfo?.stepSize || 0.001;
      const minQty = symbolInfo?.minQty || 0.0001;

      // ---- STOP LOSS ----
      let slOrderId = null;
      if (signal.stopLoss) {
        try {
          const stopLossPrice = parseFloat(signal.stopLoss);
          const baseOrder = {
            symbol: position.symbol,
            side: position.side === 'BUY' ? 'SELL' : 'BUY',
            positionSide: position.side === 'BUY' ? 'LONG' : 'SHORT',
            type: 'STOP_MARKET',
            stopPrice: stopLossPrice.toFixed(pricePrecision),
            workingType: 'MARK_PRICE',
            quantity: this.roundToStepSize(position.quantity, stepSize),
            reduceOnly: true,
            recvWindow: 5000,
            clientOrderId: `sl_${Date.now()}`
          };

          const { result: slRes, usedQty: slQty } = await this.placeReduceOnlyConditionalWithRetry(
            baseOrder,
            effectiveSubAccountId,
            { stepSize, pricePrecision, minQty },
            3,
            this.roundToStepSize(position.quantity, stepSize),
            'SL'
          );

          slOrderId = slRes?.orderId || null;
          orders.push({ type: 'stop_loss', order: slRes, qty: slQty });
          logger.info('Placed STOP_MARKET stop-loss', {
            symbol: position.symbol,
            stopPrice: baseOrder.stopPrice,
            qty: slQty,
            orderId: slRes?.orderId
          });
        } catch (error) {
          logger.error('Error placing STOP_MARKET stop-loss order:', {
            message: error.message,
            symbol: position.symbol,
            stopPrice: signal.stopLoss,
            side: position.side === 'BUY' ? 'SELL' : 'BUY'
          });
        }
      }

      // ---- TAKE PROFITS (TP1, TP2, TP3) ----
      // All TP levels are placed as separate conditional orders
      const tpPercentages = channel.tpPercentages || [25.0, 25.0, 50.0];
      const levels = Array.isArray(signal.takeProfitLevels) ? signal.takeProfitLevels : [];
      const sortedTp = [...levels].map(x => (typeof x === 'object' ? parseFloat(x.price) : parseFloat(x)))
        .filter((v) => Number.isFinite(v))
        .sort((a, b) => (position.side === 'BUY' ? a - b : b - a));

      // Place ALL TP levels as separate orders (not skipping first one)
      const tpLevelsToPlace = sortedTp;

      // распределяем количества по всем TP уровням (TP1, TP2, TP3)
      const originalQty = this.roundToStepSize(position.quantity, stepSize);
      let remainingQty = originalQty;

      for (let i = 0; i < tpLevelsToPlace.length && i < tpPercentages.length; i += 1) { // с TP1
        const tpPrice = tpLevelsToPlace[i];
        let tpQty = this.calculateTPQuantity(originalQty, i, tpPercentages);

        // min order value защитно (BingX ~3.72 USDT)
        const minOrderValue = 3.72;
        if ((tpQty * tpPrice) < minOrderValue) {
          const minQtyForValue = minOrderValue / tpPrice;
          if (minQtyForValue <= remainingQty) tpQty = minQtyForValue;
          else if ((remainingQty * tpPrice) >= minOrderValue) tpQty = remainingQty;
          else {
            logger.warn(`Skipping TP${i + 1} - below minimal order value`, { tpPrice, remainingQty });
            continue;
          }
        }

        tpQty = this.roundToStepSize(Math.min(tpQty, remainingQty), stepSize);
        if (tpQty <= 0) continue;

        const baseTP = {
          symbol: position.symbol,
          side: position.side === 'BUY' ? 'SELL' : 'BUY',
          positionSide: position.side === 'BUY' ? 'LONG' : 'SHORT',
          type: 'TAKE_PROFIT_MARKET',
          stopPrice: tpPrice.toFixed(pricePrecision),
          workingType: 'MARK_PRICE',
          quantity: tpQty,
          reduceOnly: true,
          recvWindow: 5000,
          clientOrderId: `tp${i + 1}_${Date.now()}`
        };

        try {
          const { result: tpRes, usedQty } = await this.placeReduceOnlyConditionalWithRetry(
            baseTP,
            effectiveSubAccountId,
            { stepSize, pricePrecision, minQty },
            3,
            remainingQty,
            `TP${i + 1}`
          );
          orders.push({ type: `take_profit_${i + 1}`, order: tpRes, qty: usedQty });
          remainingQty = this.roundToStepSize(remainingQty - usedQty, stepSize);
          logger.info(`Placed TP${i + 1} TAKE_PROFIT_MARKET`, {
            price: baseTP.stopPrice, qty: usedQty, orderId: tpRes?.orderId
          });
        } catch (e) {
          logger.error(`Error placing TP${i + 1} TAKE_PROFIT_MARKET:`, {
            message: e.message,
            symbol: position.symbol,
            stopPrice: tpPrice,
            requestedQty: tpQty
          });
        }
      }

      // watcher для переустановки SL в BE после первого частичного тейка
      if (signal.stopLoss && slOrderId) {
        this.startBreakevenWatcher(position, slOrderId, effectiveSubAccountId, pricePrecision, stepSize);
      }

      if (orders.length === 0) {
        logger.warn('No risk-management orders were placed (check TP/SL levels and min order value)');
      }
      return orders;
    } catch (error) {
      logger.error('Error placing risk management orders:', error);
      return [];
    }
  }

  /**
   * Пытается выставить reduceOnly условный ордер (SL/TP). При ошибке BingX про
   * "available amount of XX USDT" адаптирует количество на основе цены триггера
   * и повторяет попытку до maxAttempts раз.
   * Возвращает { result, usedQty }.
   */
  async placeReduceOnlyConditionalWithRetry(baseOrder, subAccountId, symbolMeta, maxAttempts = 3, limitQty = null, context = 'RM') {
    const stepSize = symbolMeta?.stepSize || 0.001;
    const minQty = symbolMeta?.minQty || 0.0001;
    let attempt = 0;
    let lastError;
    // начальное желаемое количество с округлением вниз
    let desiredQty = this.roundToStepSize(
      limitQty != null ? Math.min(Number(baseOrder.quantity), Number(limitQty)) : Number(baseOrder.quantity),
      stepSize
    );

    while (attempt < maxAttempts) {
      attempt += 1;
      const tryQty = this.roundToStepSize(Math.max(desiredQty, 0), stepSize);
      if (tryQty <= 0 || tryQty < minQty) {
        lastError = new Error(`Calculated quantity too small for ${context}: ${tryQty}`);
        break;
      }
      const orderToSend = { ...baseOrder, quantity: tryQty };
      try {
        const res = await this.bingx.placeOrder(orderToSend, subAccountId);
        return { result: res, usedQty: tryQty };
      } catch (err) {
        lastError = err;
        const msg = String(err.message || '');
        // Ищем шаблон "available amount of <num> USDT"
        const m = msg.match(/available amount of\s*([0-9]*\.?[0-9]+)\s*USDT/i) || msg.match(/available amount\s*:?\s*([0-9]*\.?[0-9]+)/i);
        if (!m) {
          // Не наш кейс — прерываем цикл
          break;
        }
        const availableUSDT = parseFloat(m[1]);
        // Цена для перевода USDT->qty: используем stopPrice из ордера
        let refPrice = parseFloat(baseOrder.stopPrice || '0');
        if (!Number.isFinite(refPrice) || refPrice <= 0) {
          try {
            const p = await this.bingx.getSymbolPrice(baseOrder.symbol);
            refPrice = Number(p.price || 0);
          } catch (_) {
            // если не удалось — прекращаем ретраи
            break;
          }
        }

        if (!Number.isFinite(refPrice) || refPrice <= 0) break;

        // Кол-во, которое ДОЛЖНО быть СТРОГО МЕНЬШЕ доступной суммы (переводим USDT в базу)
        let maxQtyByAvail = availableUSDT / refPrice;
        // округляем вниз к шагу и вычитаем ещё один шаг, чтобы было "< available"
        maxQtyByAvail = this.roundToStepSize(maxQtyByAvail, stepSize) - stepSize;
        if (limitQty != null) maxQtyByAvail = Math.min(maxQtyByAvail, limitQty);
        // также не превышаем изначально запрошенное
        maxQtyByAvail = Math.min(maxQtyByAvail, Number(baseOrder.quantity));

        // если стало слишком мало — выходим
        if (!Number.isFinite(maxQtyByAvail) || maxQtyByAvail <= 0) {
          break;
        }

        // применяем минимум и шаг
        desiredQty = this.roundToStepSize(Math.max(maxQtyByAvail, minQty), stepSize);
        // следующий цикл попробует заново
        logger.warn('Adjusting reduceOnly conditional order due to available amount constraint', {
          context,
          symbol: baseOrder.symbol,
          stopPrice: baseOrder.stopPrice,
          prevQty: tryQty,
          newQty: desiredQty,
          availableUSDT,
          refPrice
        });
        continue;
      }
    }

    // если дошли сюда — все попытки исчерпаны
    throw lastError || new Error(`Failed to place ${context} order`);
  }

  startBreakevenWatcher(position, slOrderId, subAccountId, pricePrecision, stepSize) {
    const key = position.id || `${position.symbol}:${Date.now()}`;
    if (this.breakevenWatchers.has(key)) return;

    const pollMs = 4000;
    const maxMs = 30 * 60 * 1000;
    const startAt = Date.now();
    const initialQty = this.roundToStepSize(position.quantity, stepSize);
    const entryPrice = Number(position.entryPrice);

    const timer = setInterval(async () => {
      try {
        if ((Date.now() - startAt) > maxMs) {
          clearInterval(timer);
          this.breakevenWatchers.delete(key);
          return;
        }
        const positions = await this.bingx.getPositions(subAccountId);
        const exchangePos = Array.isArray(positions)
          ? positions.find((p) => p.symbol === position.symbol)
          : null;

        if (!exchangePos) return;

        const currSize = this.roundToStepSize(Math.abs(parseFloat(exchangePos.size || 0)), stepSize);
        if (currSize <= 0) {
          // позиция закрыта — стоп уже не нужен
          clearInterval(timer);
          this.breakevenWatchers.delete(key);
          return;
        }

        // если размер уменьшился — сработал минимум один TP
        if (currSize < initialQty) {
          try {
            // отменяем старый SL и создаём новый в BE
            if (slOrderId) {
              await this.bingx.cancelOrder(slOrderId, position.symbol, subAccountId);
            }
            const beStop = {
              symbol: position.symbol,
              side: position.side === 'BUY' ? 'SELL' : 'BUY',
              positionSide: position.side === 'BUY' ? 'LONG' : 'SHORT',
              type: 'STOP_MARKET',
              stopPrice: entryPrice.toFixed(pricePrecision),
              workingType: 'MARK_PRICE',
              quantity: currSize,
              reduceOnly: true,
              recvWindow: 5000,
              clientOrderId: `sl_be_${Date.now()}`
            };
            const res = await this.bingx.placeOrder(beStop, subAccountId);
            logger.info('Moved SL to breakeven after first TP', {
              symbol: position.symbol, bePrice: beStop.stopPrice, newOrderId: res?.orderId
            });
          } catch (e) {
            logger.error('Error moving SL to breakeven:', e);
          } finally {
            clearInterval(timer);
            this.breakevenWatchers.delete(key);
          }
        }
      } catch (e) {
        logger.error('Breakeven watcher error:', e);
      }
    }, pollMs);

    this.breakevenWatchers.set(key, timer);
  }

  calculateTPQuantity(totalQuantity, tpIndex, tpPercentages) {
    if (Array.isArray(tpPercentages) && tpIndex < tpPercentages.length) {
      const percentage = tpPercentages[tpIndex] / 100;
      return new Decimal(totalQuantity).times(percentage).toNumber();
    }
    const fallbackPercentage = 1 / tpPercentages.length;
    return new Decimal(totalQuantity).times(fallbackPercentage).toNumber();
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
        signalId: signal.id, channelId: signal.channelId, priority: 1, manual: true, customParams
      };
      await this.queueExecution(executionData);

      return { success: true, message: 'Signal queued for manual execution' };
    } catch (error) {
      logger.error('Error executing signal manually:', error);
      throw error;
    }
  }

  formatSymbol(coin) {
    if (!coin) return '';
    const cleanCoin = coin.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (cleanCoin.endsWith('-USDT') || cleanCoin.endsWith('-USDC')) return cleanCoin;
    if (cleanCoin.endsWith('USDT')) return `${cleanCoin.replace('USDT', '')}-USDT`;
    if (cleanCoin.endsWith('USDC')) return `${cleanCoin.replace('USDC', '')}-USDC`;
    if (cleanCoin.includes('USDT') && !cleanCoin.endsWith('USDT')) return `${cleanCoin.replace('USDT', '')}-USDT`;
    return `${cleanCoin}-USDT`;
  }

  getOrderSide(direction) {
    return direction === 'LONG' ? 'BUY' : 'SELL';
  }

  roundToStepSize(quantity, stepSize) {
    if (!stepSize || stepSize <= 0) return quantity;
    return Math.floor(quantity / stepSize) * stepSize;
  }

  async waitForExchangePosition(symbol, subAccountId = null, timeoutMs = 15000) {
    // In mock mode, skip waiting to keep dev/test fast
    try { if (this.bingx && this.bingx.mode === 'mock') return true; } catch (e) {}
    const start = Date.now();
    const poll = 1000;
    const formatted = this.formatSymbol(symbol);
    let attempts = 0;
    
    logger.info('Waiting for exchange position to appear', { symbol: formatted, timeoutMs });
    
    while (Date.now() - start < timeoutMs) {
      attempts++;
      try {
        const positions = await this.bingx.getPositions(subAccountId);
        if (Array.isArray(positions)) {
          const p = positions.find((x) => x.symbol === formatted && x.size && Math.abs(x.size) > 0);
          if (p) {
            logger.info('Exchange position appeared', { 
              symbol: formatted, 
              size: p.size, 
              attempts, 
              timeMs: Date.now() - start 
            });
            return true;
          }
        }
      } catch (e) {
        logger.warn('Error checking positions during wait', { symbol: formatted, error: e.message, attempt: attempts });
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, poll));
    }
    
    logger.error('Exchange position did not appear within timeout', { 
      symbol: formatted, 
      attempts, 
      timeoutMs 
    });
    return false;
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
          executionId: id, signalId: data.signalId, status: data.status, duration: Date.now() - data.startTime.getTime()
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
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 1000));
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

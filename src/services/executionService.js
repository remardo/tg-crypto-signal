const { redisUtils, CHANNELS, connectRedis } = require('../config/redis');
const { logger, trade: tradeLog } = require('../utils/logger');
const config = require('../config/app');
const Signal = require('../models/Signal');
const Position = require('../models/Position');
const Channel = require('../models/Channel');
const Account = require('../models/Account');
const BingXService = require('./bingxService');
const Decimal = require('decimal.js');
const { getRiskManagementStatus } = require('../routes/settings');
const validateSignalDirection = require('../utils/validateSignalDirection');

class ExecutionService {
  constructor() {
    this.bingx = new BingXService();
    this.isProcessing = false;
    this.executionQueue = [];
    this.processingInterval = null;
    this.maxConcurrentExecutions = 5;
    this.activeExecutions = new Map();
  }

  async initialize() {
    try {
      // Initialize Redis connection first
      await connectRedis();
      
      // Initialize BingX service
      await this.bingx.initialize();
      
      // Start execution processor
      await this.startExecutionProcessor();
      
      // Subscribe to auto-execution signals
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
    // Process execution queue every 2 seconds
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing && this.activeExecutions.size < this.maxConcurrentExecutions) {
        await this.processExecutionQueue();
      }
    }, 2000);
    
    logger.info('Execution processor started');
  }

  async queueExecution(executionData) {
    try {
      // Add to Redis queue for persistence
      await redisUtils.lPush('execution_queue', executionData);
      
      // Add to local queue for immediate processing
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
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    
    try {
      // Process up to available slots
      const availableSlots = this.maxConcurrentExecutions - this.activeExecutions.size;
      
      for (let i = 0; i < availableSlots; i++) {
        const executionData = await redisUtils.rPop('execution_queue');
        if (!executionData) break;
        
        // Start execution in background
        this.executeSignal(executionData)
          .catch(error => {
            logger.error(`Execution error for signal ${executionData.signalId}:`, error);
          });
      }

    } catch (error) {
      logger.error('Error processing execution queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async executeSignal(executionData) {
    const { signalId, channelId } = executionData;
    const executionId = `${signalId}_${Date.now()}`;
    
    try {
      // Mark as active
      this.activeExecutions.set(executionId, {
        signalId,
        startTime: new Date(),
        status: 'processing'
      });

      // Get signal and validate
      const signal = await Signal.findById(signalId);
      if (!signal) {
        throw new Error('Signal not found');
      }

      if (signal.status === 'executed') {
        throw new Error('Signal already executed');
      }

      if (signal.signalType !== 'entry') {
        throw new Error('Only entry signals can be executed');
      }
      
      // Validate and potentially correct signal direction based on TP/SL
      const validatedSignal = await validateSignalDirection(signal);
      if (validatedSignal.direction !== signal.direction) {
        logger.warn(`Signal direction corrected from ${signal.direction} to ${validatedSignal.direction}`, {
          signalId: signal.id,
          coin: signal.coin,
          entryPrice: signal.entryPrice,
          originalDirection: signal.direction,
          correctedDirection: validatedSignal.direction
        });
        
        // Update the signal direction in memory for execution
        signal.direction = validatedSignal.direction;
        
        // Optionally update in database
        try {
          await signal.update({ direction: validatedSignal.direction });
        } catch (updateError) {
          logger.error('Error updating signal direction:', updateError);
          // Continue with in-memory correction even if DB update fails
        }
      }

      // Get channel and account info
      const channel = await Channel.findById(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      if (channel.isPaused || !channel.isActive) {
        throw new Error('Channel is paused or inactive');
      }

      // Get account info (use main account if no sub-account)
      const account = await Account.findByChannelId(channelId);
      
      // Use main account if no sub-account is configured or if it's a placeholder
      const subAccountId = (account?.bingxSubAccountId && !account.bingxSubAccountId.includes('main_account') && !account.bingxSubAccountId.includes('placeholder')) 
        ? account.bingxSubAccountId 
        : null;
      
      // Get account balance from BingX (null means main account)
      const accountInfo = await this.bingx.getAccountInfo(subAccountId);
      
      // Perform risk checks
      const riskCheck = await this.performRiskChecks(signal, channel, accountInfo);
      if (!riskCheck.passed) {
        throw new Error(`Risk check failed: ${riskCheck.reason}`);
      }

      // Get symbol info to validate minimum requirements
      const symbol = this.formatSymbol(signal.coin);
      const symbolInfo = await this.bingx.getSymbolInfo(symbol);
      
      // Check if risk management is disabled (used for multiple checks)
      const riskManagementDisabled = await getRiskManagementStatus();
      
      // Calculate position size
      let positionSize = this.calculatePositionSize(
        signal,
        channel,
        accountInfo.availableBalance,
        symbolInfo
      );

      // Check position size (only enforce if risk management is enabled)
      if (positionSize <= 0 && !riskManagementDisabled) {
        throw new Error('Calculated position size is zero or negative');
      } else if (positionSize <= 0 && riskManagementDisabled) {
        // Use minimum viable position size when risk management is disabled
        logger.warn('Using minimum position size - risk management disabled', {
          signalId: signal.id,
          originalSize: positionSize,
          symbol
        });
        
        // Calculate minimum position based on exchange requirements
        const minOrderValue = symbolInfo.minOrderValue || 5; // $5 minimum
        const minPositionSize = minOrderValue / signal.entryPrice;
        positionSize = Math.max(minPositionSize, symbolInfo.minQty || 0.001);
        
        logger.info('Adjusted position size for execution', {
          signalId: signal.id,
          adjustedSize: positionSize,
          symbol
        });
      }

      // Get symbol info from BingX for validation
      // symbolInfo already retrieved above
      
      // Validate order parameters (only if risk management is enabled)
      if (!riskManagementDisabled) {
        const orderValidation = this.validateOrderParameters(
          signal,
          positionSize,
          symbolInfo,
          accountInfo
        );
        
        if (!orderValidation.isValid) {
          throw new Error(`Order validation failed: ${orderValidation.errors.join(', ')}`);
        }
      } else {
        logger.warn('Order parameter validation BYPASSED - risk management disabled', {
          signalId: signal.id,
          positionSize,
          symbol
        });
      }

      // Set leverage if specified (skip for now due to API issues)
      if (signal.leverage && signal.leverage > 1) {
        logger.warn(`Skipping leverage setting for ${symbol} due to API issues`, {
          requestedLeverage: signal.leverage,
          symbol
        });
        // await this.bingx.setLeverage(symbol, signal.leverage, subAccountId);
      }

      // Place main order
      const orderResult = await this.placeOrder(signal, positionSize, symbol, subAccountId);
      
      // Create position record
      const position = await this.createPosition(signal, orderResult, account, positionSize, channel, subAccountId);
      
      // Place risk management orders
      await this.placeRiskManagementOrders(position, signal, subAccountId, channel);
      
      // Mark signal as executed
      await signal.execute();
      
      // Update active execution status
      this.activeExecutions.set(executionId, {
        signalId,
        startTime: this.activeExecutions.get(executionId).startTime,
        status: 'completed',
        positionId: position.id
      });

      // Notify about successful execution
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

      return {
        success: true,
        position,
        order: orderResult
      };

    } catch (error) {
      logger.error(`Signal execution failed for ${signalId}:`, error);
      
      // Mark signal as failed
      try {
        const signal = await Signal.findById(signalId);
        if (signal) {
          await signal.markAsFailed(error.message);
        }
      } catch (updateError) {
        logger.error('Error updating signal status:', updateError);
      }

      tradeLog('execution_failed', {
        signalId,
        error: error.message,
        executionId
      });

      return {
        success: false,
        error: error.message
      };

    } finally {
      // Remove from active executions
      this.activeExecutions.delete(executionId);
    }
  }

  async performRiskChecks(signal, channel, accountInfo) {
    try {
      const checks = [];
      
      // Check if risk management is disabled
      const riskManagementDisabled = await getRiskManagementStatus();
      
      if (riskManagementDisabled) {
        logger.warn('Risk management is DISABLED - bypassing all risk checks!', {
          signalId: signal.id,
          coin: signal.coin,
          direction: signal.direction
        });
        
        return {
          passed: true,
          checks: ['Risk management disabled - all checks bypassed'],
          warning: 'Risk management is disabled'
        };
      }

      // Check 1: Minimum confidence score
      if (signal.confidenceScore < config.trading.minSignalConfidence) {
        return {
          passed: false,
          reason: `Signal confidence ${signal.confidenceScore} below minimum ${config.trading.minSignalConfidence}`
        };
      }

      // Check 2: Account balance
      if (accountInfo.availableBalance < config.trading.minTradeAmount) {
        return {
          passed: false,
          reason: `Insufficient balance: ${accountInfo.availableBalance} < ${config.trading.minTradeAmount} USDT`
        };
      }

      // Check 3: Maximum leverage
      if (signal.leverage && signal.leverage > config.trading.maxLeverage) {
        return {
          passed: false,
          reason: `Leverage ${signal.leverage} exceeds maximum ${config.trading.maxLeverage}`
        };
      }

      // Check 4: Open positions limit
      const openPositions = await Position.getOpenPositions(channel.id);
      if (openPositions.length >= config.trading.maxOpenPositions) {
        return {
          passed: false,
          reason: `Maximum open positions reached: ${openPositions.length}/${config.trading.maxOpenPositions}`
        };
      }

      // Check 5: Same symbol position check
      const symbol = this.formatSymbol(signal.coin);
      const existingPosition = openPositions.find(p => p.symbol === symbol);
      if (existingPosition) {
        return {
          passed: false,
          reason: `Position already exists for ${symbol}`
        };
      }

      // Check 6: Risk/Reward ratio
      const riskReward = signal.calculateRiskReward();
      if (riskReward && riskReward.ratio < 0.1) {
        return {
          passed: false,
          reason: `Poor risk/reward ratio: ${riskReward.ratio.toFixed(2)}`
        };
      }

      // Check 7: Margin ratio
      if (accountInfo.marginRatio > 80) {
        return {
          passed: false,
          reason: `High margin usage: ${accountInfo.marginRatio}%`
        };
      }

      return {
        passed: true,
        checks
      };

    } catch (error) {
      logger.error('Error performing risk checks:', error);
      return {
        passed: false,
        reason: `Risk check error: ${error.message}`
      };
    }
  }

  calculatePositionSize(signal, channel, availableBalance, symbolInfo = null) {
    try {
      if (!signal.entryPrice) {
        return 0;
      }

      // NEW LOGIC: Use 10% of deposit multiplied by leverage
      const depositPercentage = 10; // Always use 10% of deposit
      const leverage = signal.leverage || 1;
      
      // Calculate position value: 10% of deposit × leverage
      const riskAmount = new Decimal(availableBalance)
        .times(depositPercentage)
        .dividedBy(100);
      
      const positionValue = riskAmount.times(leverage);
      
      // Calculate quantity based on entry price
      const entryPrice = new Decimal(signal.entryPrice);
      let finalQuantity = positionValue.dividedBy(entryPrice);
      
      logger.info('Position size calculation (new logic)', {
        availableBalance,
        depositPercentage,
        leverage,
        riskAmount: riskAmount.toFixed(2),
        positionValue: positionValue.toFixed(2),
        entryPrice: entryPrice.toFixed(6),
        calculatedQuantity: finalQuantity.toFixed(6),
        symbol: signal.coin
      });
      
      // Apply exchange minimum requirements if symbol info is available
      if (symbolInfo) {
        const exchangeMinQty = new Decimal(symbolInfo.minQty || 0.0001);
        const stepSize = new Decimal(symbolInfo.stepSize || 0.0001);
        
        // Ensure we meet minimum quantity
        if (finalQuantity.lessThan(exchangeMinQty)) {
          logger.warn(`Calculated quantity ${finalQuantity.toFixed(8)} below exchange minimum ${exchangeMinQty}, using minimum`, {
            calculatedQuantity: finalQuantity.toFixed(8),
            exchangeMinimum: exchangeMinQty.toFixed(8),
            coin: signal.coin
          });
          finalQuantity = exchangeMinQty;
        }
        
        // Round to step size
        const steps = finalQuantity.dividedBy(stepSize).floor();
        finalQuantity = steps.times(stepSize);
        
        // Make sure rounding didn't take us below minimum
        if (finalQuantity.lessThan(exchangeMinQty)) {
          finalQuantity = exchangeMinQty;
        }
        
        logger.info('Applied exchange requirements', {
          minQty: exchangeMinQty.toFixed(8),
          stepSize: stepSize.toFixed(8),
          finalQuantity: finalQuantity.toFixed(8),
          finalValue: finalQuantity.times(entryPrice).toFixed(2)
        });
      } else {
        // Fallback: Ensure minimum viable order size (at least $5 worth)
        const minOrderValue = new Decimal(5); // $5 minimum
        const minQuantityByValue = minOrderValue.dividedBy(entryPrice);
        
        if (finalQuantity.lessThan(minQuantityByValue)) {
          logger.warn(`Calculated quantity ${finalQuantity.toFixed(8)} too small, using minimum $5 order`, {
            calculatedQuantity: finalQuantity.toFixed(8),
            minQuantity: minQuantityByValue.toFixed(8),
            entryPrice: entryPrice.toFixed(2)
          });
          finalQuantity = minQuantityByValue;
        }
      }
      
      const result = finalQuantity.toNumber();
      
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
      // Check minimum quantity
      if (quantity < symbolInfo.minQty) {
        errors.push(`Quantity ${quantity} below minimum ${symbolInfo.minQty}`);
      }

      // Check maximum quantity
      if (quantity > symbolInfo.maxQty) {
        errors.push(`Quantity ${quantity} exceeds maximum ${symbolInfo.maxQty}`);
      }

      // Check step size
      const stepSize = symbolInfo.stepSize;
      if (stepSize > 0) {
        const remainder = quantity % stepSize;
        if (remainder !== 0) {
          errors.push(`Quantity ${quantity} doesn't match step size ${stepSize}`);
        }
      }

      // Check required margin
      const leverage = signal.leverage || 1;
      const entryPrice = signal.entryPrice;
      const requiredMargin = (quantity * entryPrice) / leverage;
      
      if (requiredMargin > accountInfo.availableBalance) {
        errors.push(`Insufficient margin: required ${requiredMargin}, available ${accountInfo.availableBalance}`);
      }

      // Check leverage limits
      if (signal.leverage && signal.leverage > symbolInfo.maxLeverage) {
        errors.push(`Leverage ${signal.leverage} exceeds symbol maximum ${symbolInfo.maxLeverage}`);
      }

    } catch (error) {
      errors.push(`Validation error: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async placeOrder(signal, quantity, symbol, subAccountId) {
    try {
      // Get current market price for validation
      const currentPriceInfo = await this.bingx.getSymbolPrice(symbol);
      const currentPrice = currentPriceInfo.price;
      
      const orderData = {
        symbol,
        side: this.getOrderSide(signal.direction),
        type: 'MARKET',
        quantity: this.roundToStepSize(quantity, 0.001), // Default step size
        leverage: signal.leverage,
        recvWindow: 5000, // 5 second receive window for reliability
        clientOrderId: `sig_${Date.now()}` // Unique client order ID for tracking
      };
      
      // Validate and add take profit if available
      if (signal.takeProfitLevels && signal.takeProfitLevels.length > 0) {
        const firstTpPrice = parseFloat(signal.takeProfitLevels[0]);
        
        // For LONG: TP must be > current price
        // For SHORT: TP must be < current price
        let tpValid = false;
        if (signal.direction === 'LONG' && firstTpPrice > currentPrice) {
          tpValid = true;
        } else if (signal.direction === 'SHORT' && firstTpPrice < currentPrice) {
          tpValid = true;
        }
        
        if (tpValid) {
          orderData.takeProfit = {
            type: "TAKE_PROFIT_MARKET",
            stopPrice: firstTpPrice,
            price: firstTpPrice,
            workingType: "MARK_PRICE"
          };
          logger.info(`Added take profit at ${firstTpPrice} (current: ${currentPrice})`, {
            symbol,
            direction: signal.direction,
            tpPrice: firstTpPrice,
            currentPrice
          });
        } else {
          logger.warn(`Skipping take profit - invalid level for current price`, {
            symbol,
            direction: signal.direction,
            tpPrice: firstTpPrice,
            currentPrice,
            reason: signal.direction === 'LONG' ? 'TP <= current price' : 'TP >= current price'
          });
        }
      }
      
      // Validate and add stop loss if available
      if (signal.stopLoss) {
        const stopLossPrice = parseFloat(signal.stopLoss);
        
        // For LONG: SL must be < current price
        // For SHORT: SL must be > current price
        let slValid = false;
        if (signal.direction === 'LONG' && stopLossPrice < currentPrice) {
          slValid = true;
        } else if (signal.direction === 'SHORT' && stopLossPrice > currentPrice) {
          slValid = true;
        }
        
        if (slValid) {
          orderData.stopLoss = {
            type: "STOP_MARKET",
            stopPrice: stopLossPrice,
            price: stopLossPrice,
            workingType: "MARK_PRICE"
          };
          logger.info(`Added stop loss at ${stopLossPrice} (current: ${currentPrice})`, {
            symbol,
            direction: signal.direction,
            slPrice: stopLossPrice,
            currentPrice
          });
        } else {
          logger.warn(`Skipping stop loss - invalid level for current price`, {
            symbol,
            direction: signal.direction,
            slPrice: stopLossPrice,
            currentPrice,
            reason: signal.direction === 'LONG' ? 'SL >= current price' : 'SL <= current price'
          });
        }
      }

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
        subAccountId: subAccountId || 'main', // Use 'main' as identifier for database, not API
        symbol: orderResult.symbol,
        side: orderResult.side || this.getOrderSide(signal.direction),
        quantity,
        entryPrice: orderResult.executedPrice || signal.entryPrice,
        leverage: signal.leverage,
        takeProfitLevels: signal.takeProfitLevels,
        stopLoss: signal.stopLoss,
        bingxOrderId: orderResult.orderId,
        tpPercentages: channel.tpPercentages || [25.0, 25.0, 50.0] // Use channel-specific TP percentages
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

      // Place stop-loss order
      if (signal.stopLoss) {
        try {
          const stopLossOrder = {
            symbol: position.symbol,
            side: position.side === 'BUY' ? 'SELL' : 'BUY',
            positionSide: position.side === 'BUY' ? 'LONG' : 'SHORT', // Same positionSide as original position
            type: 'STOP_MARKET',
            quantity: position.quantity,
            stopPrice: signal.stopLoss,
            recvWindow: 5000,
            clientOrderId: `sl_${Date.now()}`
            // No reduceOnly - BingX doesn't seem to support it properly
          };

          const slResult = await this.bingx.placeOrder(stopLossOrder, subAccountId);
          orders.push({ type: 'stop_loss', order: slResult });
          
        } catch (error) {
          logger.error('Error placing stop-loss order:', error);
        }
      }

      // Place take-profit orders using channel-specific percentages
      if (signal.takeProfitLevels && signal.takeProfitLevels.length > 0) {
        const tpPercentages = channel.tpPercentages || [25.0, 25.0, 50.0];
        
        // Get current price to calculate order values
        const currentPriceInfo = await this.bingx.getSymbolPrice(position.symbol);
        const currentPrice = currentPriceInfo.price;
        const minOrderValue = 3.72; // BingX minimum order value in USDT
        
        // Sort take profit levels based on position direction
        // For LONG: ascending order (lowest to highest)
        // For SHORT: descending order (highest to lowest)
        const sortedTpLevels = [...signal.takeProfitLevels].sort((a, b) => {
          const aPrice = typeof a === 'object' ? parseFloat(a.price) : parseFloat(a);
          const bPrice = typeof b === 'object' ? parseFloat(b.price) : parseFloat(b);
          return position.side === 'BUY' ? aPrice - bPrice : bPrice - aPrice;
        });
        
        logger.info(`Sorted take profit levels for ${position.side} position`, {
          originalLevels: signal.takeProfitLevels.map(tp => 
            typeof tp === 'object' ? tp.price : tp),
          sortedLevels: sortedTpLevels.map(tp => 
            typeof tp === 'object' ? tp.price : tp),
          positionSide: position.side
        });
        
        // Calculate viable TP orders
        const viableOrders = [];
        let remainingQuantity = position.quantity;
        
        for (let i = 0; i < sortedTpLevels.length; i++) {
          const tpLevel = sortedTpLevels[i];
          const tpPrice = typeof tpLevel === 'object' ? parseFloat(tpLevel.price) : parseFloat(tpLevel);
          let tpQuantity = this.calculateTPQuantity(position.quantity, i, tpPercentages);
          
          // Calculate minimum quantity needed to meet order value requirement
          const minQuantityForValue = minOrderValue / tpPrice;
          
          // If original quantity is too small, use minimum required
          if (tpQuantity * tpPrice < minOrderValue) {
            if (minQuantityForValue <= remainingQuantity) {
              tpQuantity = minQuantityForValue;
              logger.info(`Adjusted TP${i + 1} quantity to meet minimum order value`, {
                originalQuantity: this.calculateTPQuantity(position.quantity, i, tpPercentages),
                adjustedQuantity: tpQuantity,
                orderValue: (tpQuantity * tpPrice).toFixed(2),
                price: tpPrice
              });
            } else {
              // If we don't have enough remaining quantity, use all remaining if it meets minimum
              if (remainingQuantity * tpPrice >= minOrderValue) {
                tpQuantity = remainingQuantity;
                logger.info(`Using all remaining quantity for TP${i + 1}`, {
                  quantity: tpQuantity,
                  orderValue: (tpQuantity * tpPrice).toFixed(2),
                  price: tpPrice
                });
              } else {
                logger.warn(`Skipping TP${i + 1} - insufficient remaining quantity for minimum order value`, {
                  remainingQuantity,
                  requiredQuantity: minQuantityForValue,
                  minOrderValue,
                  price: tpPrice
                });
                continue;
              }
            }
          }
          
          // Add to viable orders and update remaining quantity
          viableOrders.push({
            index: i + 1,
            price: tpPrice,
            quantity: tpQuantity,
            value: tpQuantity * tpPrice
          });
          
          remainingQuantity -= tpQuantity;
          
          // Stop if no quantity remaining
          if (remainingQuantity <= 0) {
            logger.info(`All position quantity allocated after TP${i + 1}`);
            break;
          }
        }
        
        // Place the viable orders
        for (const order of viableOrders) {
          try {
            const takeProfitOrder = {
              symbol: position.symbol,
              side: position.side === 'BUY' ? 'SELL' : 'BUY', // Opposite side to close position
              positionSide: position.side === 'BUY' ? 'LONG' : 'SHORT', // Same positionSide as original position
              type: 'LIMIT',
              quantity: order.quantity,
              price: order.price,
              recvWindow: 5000,
              clientOrderId: `tp${order.index}_${Date.now()}`
              // No reduceOnly - BingX doesn't seem to support it properly
            };

            const tpResult = await this.bingx.placeOrder(takeProfitOrder, subAccountId);
            orders.push({ type: `take_profit_${order.index}`, order: tpResult });
            
            logger.info(`Successfully placed TP${order.index} order`, {
              quantity: order.quantity,
              price: order.price,
              value: order.value.toFixed(2),
              orderId: tpResult.orderId,
              side: takeProfitOrder.side,
              positionSide: takeProfitOrder.positionSide
            });
            
          } catch (error) {
            logger.error(`Error placing take-profit order ${order.index}:`, error);
          }
        }
        
        if (viableOrders.length === 0) {
          logger.warn('No viable take profit orders could be created due to minimum order value requirements', {
            positionQuantity: position.quantity,
            minOrderValue,
            symbol: position.symbol
          });
        } else {
          logger.info(`Created ${viableOrders.length} take profit orders out of ${sortedTpLevels.length} levels`, {
            totalValue: viableOrders.reduce((sum, order) => sum + order.value, 0).toFixed(2),
            remainingQuantity: Math.max(0, remainingQuantity),
            takeProfitPrices: viableOrders.map(o => ({ index: o.index, price: o.price })),
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
    // Use channel-specific TP percentages instead of hardcoded values
    if (Array.isArray(tpPercentages) && tpIndex < tpPercentages.length) {
      const percentage = tpPercentages[tpIndex] / 100; // Convert percentage to decimal
      
      return new Decimal(totalQuantity)
        .times(percentage)
        .toNumber();
    }
    
    // Fallback to equal distribution if no specific percentages available
    const fallbackPercentage = 1 / tpPercentages.length;
    return new Decimal(totalQuantity)
      .times(fallbackPercentage)
      .toNumber();
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

  // Manual execution
  async executeSignalManually(signalId, customParams = {}) {
    try {
      const signal = await Signal.findById(signalId);
      if (!signal) {
        throw new Error('Signal not found');
      }

      // Apply custom parameters if provided
      if (customParams.positionSize) {
        signal.customQuantity = customParams.positionSize;
      }
      if (customParams.leverage) {
        signal.leverage = customParams.leverage;
      }

      const executionData = {
        signalId: signal.id,
        channelId: signal.channelId,
        priority: 1, // High priority for manual execution
        manual: true,
        customParams
      };

      await this.queueExecution(executionData);
      
      return {
        success: true,
        message: 'Signal queued for manual execution'
      };

    } catch (error) {
      logger.error('Error executing signal manually:', error);
      throw error;
    }
  }

  // Utility methods
  formatSymbol(coin) {
    return `${coin.toUpperCase()}-USDT`;
  }

  getOrderSide(direction) {
    return direction === 'LONG' ? 'BUY' : 'SELL';
  }

  roundToStepSize(quantity, stepSize) {
    return Math.floor(quantity / stepSize) * stepSize;
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
      return {
        activeExecutions: 0,
        queueSize: 0,
        error: error.message
      };
    }
  }

  async shutdown() {
    try {
      logger.info('Shutting down execution service...');
      
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
      }
      
      // Wait for active executions to complete
      const timeout = 30000; // 30 seconds
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
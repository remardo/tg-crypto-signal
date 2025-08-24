const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/app');
const { logger, trade: tradeLog } = require('../utils/logger');

class BingXService {
  constructor() {
    this.apiKey = config.bingx.apiKey;
    this.secretKey = config.bingx.secretKey;
    this.baseUrl = config.bingx.baseUrl;
    this.initialized = false;
  }

  async initialize() {
    try {
      if (!this.apiKey || !this.secretKey) {
        logger.warn('BingX API credentials not provided - using mock mode');
        this.initialized = true;
        return true;
      }

      // Test connection with account info
      logger.info('Initializing BingX service with real API...');
      const accountInfo = await this.getAccountInfo();
      if (accountInfo) {
        this.initialized = true;
        logger.info('BingX service initialized successfully - REAL TRADING MODE ENABLED', {
          balance: accountInfo.balance,
          availableBalance: accountInfo.availableBalance
        });
        return true;
      }

      throw new Error('Failed to validate BingX API credentials');

    } catch (error) {
      logger.error('Failed to initialize BingX service:', error);
      // Fallback to mock mode if initialization fails
      logger.warn('Falling back to mock mode due to initialization error');
      this.initialized = true;
      return true;
    }
  }

  // Generate signature for authenticated requests
  generateSignature(queryString, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(queryString)
      .digest('hex');
  }

  // Create authenticated request headers
  createAuthHeaders(params = {}) {
    const timestamp = Date.now();
    params.timestamp = timestamp;
    
    // Sort parameters and create query string
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((result, key) => {
        result[key] = params[key];
        return result;
      }, {});
    
    const queryString = Object.keys(sortedParams)
      .map(key => `${key}=${sortedParams[key]}`)
      .join('&');
    
    const signature = this.generateSignature(queryString, this.secretKey);
    
    return {
      'X-BX-APIKEY': this.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'TG-Crypto-Signal/1.0'
    };
  }

  // Make authenticated API request
  async makeRequest(method, endpoint, params = {}, isAuth = true) {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      let requestConfig = {
        method,
        url,
        timeout: config.bingx.timeout,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TG-Crypto-Signal/1.0'
        }
      };

      if (isAuth) {
        const timestamp = Date.now();
        params.timestamp = timestamp;
        
        // Create query string for signature
        const sortedParams = Object.keys(params)
          .sort()
          .reduce((result, key) => {
            result[key] = params[key];
            return result;
          }, {});
        
        const queryString = Object.keys(sortedParams)
          .map(key => `${key}=${sortedParams[key]}`)
          .join('&');
        
        const signature = this.generateSignature(queryString, this.secretKey);
        params.signature = signature;
        
        // Add API key to headers
        requestConfig.headers['X-BX-APIKEY'] = this.apiKey;
        
        if (method === 'GET') {
          requestConfig.params = params;
        } else {
          requestConfig.data = params;
        }
      } else {
        if (method === 'GET') {
          requestConfig.params = params;
        } else {
          requestConfig.data = params;
        }
      }

      logger.debug('BingX API Request:', {
        method,
        endpoint,
        url,
        params: isAuth ? { ...params, signature: '[HIDDEN]' } : params
      });

      const response = await axios(requestConfig);
      
      logger.debug('BingX API Response:', {
        status: response.status,
        data: response.data
      });
      
      // BingX returns different response structures
      if (response.data.code && response.data.code !== 0 && response.data.code !== '0') {
        throw new Error(`BingX API Error [${response.data.code}]: ${response.data.msg || 'Unknown error'}`);
      }

      return response.data.data || response.data;

    } catch (error) {
      if (error.response) {
        logger.error(`BingX API request failed: ${method} ${endpoint}`, {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          params
        });
        
        // Handle specific BingX error codes
        if (error.response.data && error.response.data.msg) {
          throw new Error(`BingX API Error: ${error.response.data.msg}`);
        }
      } else {
        logger.error(`BingX API request failed: ${method} ${endpoint}`, {
          error: error.message,
          params
        });
      }
      throw error;
    }
  }

  // Account Management
  async getAccountInfo(subAccountId = null) {
    try {
      const endpoint = config.bingx.endpoints.account;
      const params = {};
      
      if (subAccountId) {
        params.subAccountId = subAccountId;
      }

      const result = await this.makeRequest('GET', endpoint, params);
      
      logger.debug('BingX account response:', result);
      
      // Handle BingX futures balance response structure
      if (result && result.balance) {
        const balanceData = result.balance;
        return {
          balance: parseFloat(balanceData.balance || 0),
          availableBalance: parseFloat(balanceData.availableMargin || balanceData.balance || 0),
          equity: parseFloat(balanceData.equity || balanceData.balance || 0),
          unrealizedPnl: parseFloat(balanceData.unrealizedProfit || 0),
          marginUsed: parseFloat(balanceData.usedMargin || 0),
          marginRatio: parseFloat(balanceData.marginRatio || 0)
        };
      }
      
      // Handle array response (legacy)
      if (Array.isArray(result)) {
        const usdtBalance = result.find(balance => balance.asset === 'USDT') || {};
        return {
          balance: parseFloat(usdtBalance.balance || 0),
          availableBalance: parseFloat(usdtBalance.availableMargin || usdtBalance.balance || 0),
          equity: parseFloat(usdtBalance.equity || usdtBalance.balance || 0),
          unrealizedPnl: parseFloat(usdtBalance.unrealizedProfit || 0),
          marginUsed: parseFloat(usdtBalance.usedMargin || 0),
          marginRatio: parseFloat(usdtBalance.marginRatio || 0)
        };
      }
      
      // Handle direct response (fallback)
      return {
        balance: parseFloat(result.balance || 0),
        availableBalance: parseFloat(result.availableMargin || result.availableBalance || 0),
        equity: parseFloat(result.equity || result.balance || 0),
        unrealizedPnl: parseFloat(result.unrealizedProfit || result.unrealizedPnl || 0),
        marginUsed: parseFloat(result.usedMargin || result.marginUsed || 0),
        marginRatio: parseFloat(result.marginRatio || 0)
      };

    } catch (error) {
      logger.error('Error getting account info:', error);
      throw error;
    }
  }

  async getSpotBalance() {
    try {
      const endpoint = config.bingx.endpoints.spotBalance;
      const result = await this.makeRequest('GET', endpoint, {});
      
      logger.debug('BingX spot balance response:', result);
      
      if (Array.isArray(result.balances)) {
        const usdtBalance = result.balances.find(balance => balance.asset === 'USDT') || {};
        return {
          asset: 'USDT',
          free: parseFloat(usdtBalance.free || 0),
          locked: parseFloat(usdtBalance.locked || 0),
          total: parseFloat(usdtBalance.free || 0) + parseFloat(usdtBalance.locked || 0)
        };
      }
      
      return {
        asset: 'USDT',
        free: 0,
        locked: 0,
        total: 0
      };

    } catch (error) {
      logger.error('Error getting spot balance:', error);
      throw error;
    }
  }

  async getPositions(subAccountId = null) {
    try {
      const endpoint = config.bingx.endpoints.positions;
      const params = {};
      
      if (subAccountId) {
        params.subAccountId = subAccountId;
      }

      const result = await this.makeRequest('GET', endpoint, params);
      
      if (!Array.isArray(result)) {
        return [];
      }

      return result.map(position => ({
        symbol: position.symbol,
        side: position.side,
        size: parseFloat(position.size || 0),
        entryPrice: parseFloat(position.entryPrice || 0),
        markPrice: parseFloat(position.markPrice || 0),
        unrealizedPnl: parseFloat(position.unrealizedPnl || 0),
        percentage: parseFloat(position.percentage || 0),
        leverage: parseInt(position.leverage || 1),
        marginType: position.marginType,
        isolatedMargin: parseFloat(position.isolatedMargin || 0),
        positionId: position.positionId
      }));

    } catch (error) {
      logger.error('Error getting positions:', error);
      throw error;
    }
  }

  // Sub-Account Management
  async getSubAccounts() {
    try {
      const endpoint = config.bingx.endpoints.subAccounts;
      const result = await this.makeRequest('GET', endpoint);
      
      if (!Array.isArray(result)) {
        return [];
      }

      return result.map(account => ({
        subAccountId: account.subAccountId,
        email: account.email,
        status: account.status,
        tag: account.tag,
        createTime: account.createTime
      }));

    } catch (error) {
      logger.error('Error getting sub-accounts:', error);
      throw error;
    }
  }

  async createSubAccount(tag, email = null) {
    try {
      const endpoint = '/openApi/spot/v1/account/subAccount/create';
      const params = {
        tag,
        ...(email && { email })
      };

      const result = await this.makeRequest('POST', endpoint, params);
      
      tradeLog('sub_account_created', {
        subAccountId: result.subAccountId,
        tag,
        email
      });

      return {
        subAccountId: result.subAccountId,
        tag: result.tag,
        email: result.email,
        status: result.status
      };

    } catch (error) {
      logger.error('Error creating sub-account:', error);
      throw error;
    }
  }

  async transferToSubAccount(subAccountId, asset, amount, type = 'MAIN_TO_SUB') {
    try {
      const endpoint = config.bingx.endpoints.transfer;
      const params = {
        fromAccountType: type === 'MAIN_TO_SUB' ? 'MAIN' : 'SUB',
        toAccountType: type === 'MAIN_TO_SUB' ? 'SUB' : 'MAIN',
        asset,
        amount: amount.toString(),
        ...(type.includes('SUB') && { subAccountId })
      };

      const result = await this.makeRequest('POST', endpoint, params);
      
      tradeLog('transfer', {
        subAccountId,
        asset,
        amount,
        type,
        transferId: result.transferId
      });

      return {
        transferId: result.transferId,
        status: result.status
      };

    } catch (error) {
      logger.error('Error transferring to sub-account:', error);
      throw error;
    }
  }

  // Trading Operations
  async placeOrder(orderData, subAccountId = null) {
    try {
      const endpoint = config.bingx.endpoints.order;
      
      // Convert direction to positionSide for BingX futures
      // Use explicitly provided positionSide if available
      // Don't auto-generate positionSide for reduceOnly orders (they should work without it)
      let positionSide = orderData.positionSide;
      if (!positionSide && !orderData.reduceOnly) {
        positionSide = orderData.side === 'BUY' ? 'LONG' : 'SHORT';
      }
      
      const params = {
        symbol: orderData.symbol,
        side: orderData.side, // BUY or SELL
        type: orderData.type || 'MARKET',
        quantity: parseFloat(orderData.quantity),
        timestamp: Date.now(),
        ...(positionSide && { positionSide }), // Only include if defined
        ...(orderData.price && { price: parseFloat(orderData.price) }),
        ...(orderData.stopPrice && { stopPrice: parseFloat(orderData.stopPrice) }),
        ...(orderData.priceRate && { priceRate: parseFloat(orderData.priceRate) }),
        ...(orderData.timeInForce && { timeInForce: orderData.timeInForce }),
        ...(orderData.reduceOnly && { reduceOnly: orderData.reduceOnly.toString() }),
        ...(orderData.clientOrderId && { clientOrderId: orderData.clientOrderId }),
        ...(orderData.recvWindow && { recvWindow: parseInt(orderData.recvWindow) }),
        ...(orderData.closePosition && { closePosition: orderData.closePosition.toString() }),
        ...(orderData.activationPrice && { activationPrice: parseFloat(orderData.activationPrice) }),
        ...(orderData.stopGuaranteed && { stopGuaranteed: orderData.stopGuaranteed.toString() }),
        ...(subAccountId && { subAccountId })
      };
      
      // Add takeProfit if provided (as JSON string)
      if (orderData.takeProfit) {
        if (typeof orderData.takeProfit === 'object') {
          // Ensure takeProfit object has all required fields
          const tpObject = {
            type: orderData.takeProfit.type || 'TAKE_PROFIT_MARKET',
            stopPrice: parseFloat(orderData.takeProfit.stopPrice || orderData.takeProfit.price),
            price: parseFloat(orderData.takeProfit.price || orderData.takeProfit.stopPrice),
            workingType: orderData.takeProfit.workingType || 'MARK_PRICE',
            ...orderData.takeProfit
          };
          params.takeProfit = JSON.stringify(tpObject);
        } else {
          params.takeProfit = orderData.takeProfit;
        }
      }
      
      // Add stopLoss if provided (as JSON string)
      if (orderData.stopLoss) {
        if (typeof orderData.stopLoss === 'object') {
          // Ensure stopLoss object has all required fields
          const slObject = {
            type: orderData.stopLoss.type || 'STOP_MARKET',
            stopPrice: parseFloat(orderData.stopLoss.stopPrice || orderData.stopLoss.price),
            price: parseFloat(orderData.stopLoss.price || orderData.stopLoss.stopPrice),
            workingType: orderData.stopLoss.workingType || 'MARK_PRICE',
            ...orderData.stopLoss
          };
          params.stopLoss = JSON.stringify(slObject);
        } else {
          params.stopLoss = orderData.stopLoss;
        }
      }

      const result = await this.makeRequest('POST', endpoint, params);
      
      // Extract order data from response (BingX wraps it in 'order' object)
      const orderResult = result.order || result;
      
      // Debug log the actual response structure
      logger.debug('BingX placeOrder response:', {
        hasOrderWrapper: !!result.order,
        orderResult,
        orderKeys: Object.keys(orderResult || {})
      });
      
      tradeLog('order_placed', {
        orderId: orderResult.orderId || orderResult.orderID,
        symbol: orderData.symbol,
        side: orderData.side,
        positionSide: positionSide,
        type: orderData.type,
        quantity: orderData.quantity,
        subAccountId
      });

      return {
        orderId: orderResult.orderId || orderResult.orderID,
        clientOrderId: orderResult.clientOrderId || orderResult.clientOrderID,
        symbol: orderResult.symbol || orderData.symbol,
        side: orderResult.side || orderData.side,
        positionSide: orderResult.positionSide || positionSide,
        status: orderResult.status || 'FILLED',
        executedQty: parseFloat(orderResult.executedQty || orderResult.quantity || 0),
        executedPrice: parseFloat(orderResult.avgPrice || orderResult.price || 0)
      };

    } catch (error) {
      logger.error('Error placing order:', error);
      throw error;
    }
  }

  async cancelOrder(orderId, symbol, subAccountId = null) {
    try {
      const endpoint = '/openApi/swap/v2/trade/order';
      const params = {
        orderId: orderId.toString(),
        symbol,
        ...(subAccountId && { subAccountId })
      };

      const result = await this.makeRequest('DELETE', endpoint, params);
      
      tradeLog('order_cancelled', {
        orderId,
        symbol,
        subAccountId
      });

      return {
        orderId: result.orderId,
        status: result.status
      };

    } catch (error) {
      logger.error('Error cancelling order:', error);
      throw error;
    }
  }

  async getOrderHistory(symbol = null, limit = 100, subAccountId = null) {
    try {
      const endpoint = config.bingx.endpoints.orderHistory;
      const params = {
        limit,
        ...(symbol && { symbol }),
        ...(subAccountId && { subAccountId })
      };

      const result = await this.makeRequest('GET', endpoint, params);
      
      if (!Array.isArray(result)) {
        return [];
      }

      return result.map(order => ({
        orderId: order.orderId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: parseFloat(order.origQty || 0),
        price: parseFloat(order.price || 0),
        executedQty: parseFloat(order.executedQty || 0),
        avgPrice: parseFloat(order.avgPrice || 0),
        status: order.status,
        time: order.time,
        commission: parseFloat(order.commission || 0),
        commissionAsset: order.commissionAsset
      }));

    } catch (error) {
      logger.error('Error getting order history:', error);
      throw error;
    }
  }

  async getOpenOrders(symbol = null, subAccountId = null) {
    try {
      const endpoint = '/openApi/swap/v2/trade/openOrders';
      const params = {
        ...(symbol && { symbol }),
        ...(subAccountId && { subAccountId })
      };

      const result = await this.makeRequest('GET', endpoint, params);
      
      if (!Array.isArray(result)) {
        return [];
      }

      return result.map(order => ({
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        symbol: order.symbol,
        side: order.side,
        positionSide: order.positionSide,
        type: order.type,
        origQty: parseFloat(order.origQty || 0),
        price: parseFloat(order.price || 0),
        executedQty: parseFloat(order.executedQty || 0),
        status: order.status,
        timeInForce: order.timeInForce,
        updateTime: order.updateTime,
        workingType: order.workingType,
        stopPrice: parseFloat(order.stopPrice || 0)
      }));

    } catch (error) {
      logger.error('Error getting open orders:', error);
      throw error;
    }
  }

  // Position Management
  async setLeverage(symbol, leverage, subAccountId = null) {
    try {
      const endpoint = '/openApi/swap/v2/trade/leverage';
      const params = {
        symbol,
        leverage: leverage.toString(),
        ...(subAccountId && { subAccountId })
      };

      const result = await this.makeRequest('POST', endpoint, params);
      
      tradeLog('leverage_set', {
        symbol,
        leverage,
        subAccountId
      });

      return {
        symbol: result.symbol,
        leverage: result.leverage
      };

    } catch (error) {
      logger.error('Error setting leverage:', error);
      throw error;
    }
  }

  async closePosition(symbol, quantity = null, subAccountId = null) {
    try {
      // Get current position to determine close parameters
      const positions = await this.getPositions(subAccountId);
      const position = positions.find(p => p.symbol === symbol);
      
      // If no position found on exchange, return success with warning
      if (!position) {
        logger.warn(`No position found for symbol ${symbol} on exchange, treating as already closed`);
        return { 
          orderId: null, 
          symbol, 
          status: 'already_closed', 
          message: `Position for ${symbol} not found on exchange` 
        };
      }

      const closeQuantity = quantity || Math.abs(position.size);
      const closeSide = position.side === 'BUY' ? 'SELL' : 'BUY';

      const orderData = {
        symbol,
        side: closeSide,
        type: 'MARKET',
        quantity: closeQuantity
      };

      const result = await this.placeOrder(orderData, subAccountId);
      
      tradeLog('position_closed', {
        symbol,
        originalSide: position.side,
        closeSide,
        quantity: closeQuantity,
        orderId: result.orderId,
        subAccountId
      });

      return result;

    } catch (error) {
      logger.error('Error closing position:', error);
      throw error;
    }
  }

  // Market Data
  async getSymbolPrice(symbol) {
    try {
      const endpoint = '/openApi/swap/v2/quote/price';
      const result = await this.makeRequest('GET', endpoint, { symbol }, false);
      
      return {
        symbol: result.symbol,
        price: parseFloat(result.price),
        time: result.time
      };

    } catch (error) {
      logger.error('Error getting symbol price:', error);
      throw error;
    }
  }

  async getSymbolInfo(symbol) {
    try {
      const endpoint = '/openApi/swap/v2/quote/contracts';
      const result = await this.makeRequest('GET', endpoint, { symbol }, false);
      
      if (!Array.isArray(result) || result.length === 0) {
        throw new Error(`Symbol ${symbol} not found`);
      }

      const symbolInfo = result[0];
      
      return {
        symbol: symbolInfo.symbol,
        contractType: symbolInfo.currency || 'USDT',
        tickSize: parseFloat(symbolInfo.size || 0.01), // Price step size
        stepSize: parseFloat(symbolInfo.size || 0.0001), // Quantity step size
        minQty: parseFloat(symbolInfo.tradeMinQuantity || 0.0001),
        maxQty: parseFloat(symbolInfo.maxQty || 1000000), // Default large number
        maxLeverage: parseInt(symbolInfo.maxLeverage || 100), // Default to 100x
        minOrderValue: parseFloat(symbolInfo.tradeMinUSDT || 5), // Minimum order value in USDT
        quantityPrecision: parseInt(symbolInfo.quantityPrecision || 4),
        pricePrecision: parseInt(symbolInfo.pricePrecision || 2)
      };

    } catch (error) {
      logger.error('Error getting symbol info:', error);
      throw error;
    }
  }

  // Risk Management Helpers
  calculatePositionSize(accountBalance, riskPercentage, entryPrice, stopLoss, leverage = 1) {
    try {
      const riskAmount = accountBalance * (riskPercentage / 100);
      const priceRisk = Math.abs(entryPrice - stopLoss);
      
      if (priceRisk === 0) {
        return 0;
      }

      const baseQuantity = riskAmount / priceRisk;
      const leveragedQuantity = baseQuantity * leverage;
      
      return leveragedQuantity;

    } catch (error) {
      logger.error('Error calculating position size:', error);
      return 0;
    }
  }

  validateOrder(orderData, accountInfo, symbolInfo) {
    const errors = [];

    // Check minimum quantity
    if (orderData.quantity < symbolInfo.minQty) {
      errors.push(`Quantity ${orderData.quantity} is below minimum ${symbolInfo.minQty}`);
    }

    // Check maximum quantity
    if (orderData.quantity > symbolInfo.maxQty) {
      errors.push(`Quantity ${orderData.quantity} exceeds maximum ${symbolInfo.maxQty}`);
    }

    // Check available balance
    const requiredMargin = (orderData.quantity * orderData.price) / (orderData.leverage || 1);
    if (requiredMargin > accountInfo.availableBalance) {
      errors.push(`Insufficient balance. Required: ${requiredMargin}, Available: ${accountInfo.availableBalance}`);
    }

    // Check leverage
    if (orderData.leverage && orderData.leverage > symbolInfo.maxLeverage) {
      errors.push(`Leverage ${orderData.leverage} exceeds maximum ${symbolInfo.maxLeverage}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  getStatus() {
    return {
      initialized: this.initialized,
      baseUrl: this.baseUrl,
      hasCredentials: !!(this.apiKey && this.secretKey)
    };
  }
}

module.exports = BingXService;
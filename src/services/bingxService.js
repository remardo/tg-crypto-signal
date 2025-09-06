const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/app');
const { logger, trade: tradeLog } = require('../utils/logger');

// --- RFC3986-safe urlencode (BingX чувствителен к строке подписи) ---
const encodeRFC3986 = (str) =>
  encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

function buildQueryString(params = {}) {
  // убрать пустые значения (кроме '0') и отсортировать
  const compact = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.length === 0) continue;
    compact[k] = v;
  }
  const keys = Object.keys(compact).sort();
  return keys.map((k) => `${encodeRFC3986(k)}=${encodeRFC3986(String(compact[k]))}`).join('&');
}

class BingXService {
  constructor() {
    this.apiKey = config.bingx.apiKey;
    this.secretKey = config.bingx.secretKey;
    this.baseUrl = config.bingx.baseUrl;
    this.initialized = false;
  this.mode = 'mock'; // 'real' when credentials validated

    this.supportedSymbols = [];
    this.symbolCacheExpiry = 24 * 60 * 60 * 1000; // 24h
    this.lastSymbolCacheUpdate = 0;
  }

  /* -------------------------------- Helpers -------------------------------- */

  // HMAC-SHA256 signature
  generateSignature(queryString, secret) {
    return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
  }

  // Round value down to step (for price/qty normalization)
  roundToStep(v, step) {
    const n = Number(v);
    const s = Number(step);
    if (!isFinite(n) || !isFinite(s) || s <= 0) return n;
    return Math.floor(n / s) * s;
  }

  /* ------------------------------ Initialization --------------------------- */

  async initialize() {
    try {
      if (!this.apiKey || !this.secretKey) {
        logger.warn('BingX API credentials not provided - using mock mode');
  this.initialized = true;
  this.mode = 'mock';
        return true;
      }

      logger.info('Initializing BingX service with real API...');
      const accountInfo = await this.getAccountInfo();
      if (accountInfo) {
        this.initialized = true;
  this.mode = 'real';
        logger.info('BingX service initialized successfully - REAL TRADING MODE ENABLED', {
          balance: accountInfo.balance,
          availableBalance: accountInfo.availableBalance,
        });

        await this.loadSupportedSymbols();
        return true;
      }

      throw new Error('Failed to validate BingX API credentials');
    } catch (error) {
      logger.error('Failed to initialize BingX service:', error);
      logger.warn('Falling back to mock mode due to initialization error');
  this.initialized = true;
  this.mode = 'mock';
      return true;
    }
  }

  async loadSupportedSymbols() {
    try {
      logger.info('Loading supported symbols from BingX...');
      const symbols = await this.getSupportedSymbols();

      if (symbols && symbols.length > 0) {
        this.supportedSymbols = symbols;
        this.lastSymbolCacheUpdate = Date.now();
        logger.info(`Successfully loaded ${symbols.length} supported symbols`);
        const exampleSymbols = symbols.slice(0, 5).map((s) => s.symbol);
        logger.debug('Example supported symbols:', { exampleSymbols });
      } else {
        logger.warn('No supported symbols loaded from BingX');
      }
    } catch (error) {
      logger.error('Error loading supported symbols:', error);
    }
  }

  isSymbolSupported(symbol) {
    const isCacheExpired =
      Date.now() - this.lastSymbolCacheUpdate > this.symbolCacheExpiry;

    if (isCacheExpired || this.supportedSymbols.length === 0) {
      logger.warn('Symbol cache is expired or empty, symbol validation may be inaccurate');
      return true;
    }

    const isSupported = this.supportedSymbols.some((s) => s.symbol === symbol);
    if (!isSupported) {
      logger.warn(`Symbol ${symbol} is not supported by BingX`, {
        availableSymbols: this.supportedSymbols.map((s) => s.symbol).slice(0, 10),
      });
    }

    return isSupported;
  }

  /* ------------------------------ HTTP / Signing --------------------------- */

  /**
   * Make API request
   * - For BingX, signed endpoints expect ALL params in query string (even POST/DELETE)
   * - We set a paramsSerializer that matches buildQuery() so the wire format == signed string
   */
  async makeRequest(method, endpoint, params = {}, isAuth = true) {
    try {
      const urlBase = `${this.baseUrl}${endpoint}`;
      const headers = { 'User-Agent': 'TG-Crypto-Signal/1.0' };
      let finalUrl = urlBase;
      let body; // тело пустое для совместимости с BingX (все параметры — в query)

      if (isAuth) {
        const payload = { ...params, timestamp: Date.now() };
        const qs = buildQueryString(payload);
        const signature = this.generateSignature(qs, this.secretKey);
        finalUrl = `${urlBase}?${qs}&signature=${signature}`;
        headers['X-BX-APIKEY'] = this.apiKey;
      } else {
        const qs = buildQueryString(params);
        finalUrl = qs ? `${urlBase}?${qs}` : urlBase;
      }

      logger.debug('BingX API Request:', {
        method,
        endpoint,
        url: finalUrl.replace(/signature=[^&]+/, 'signature=[HIDDEN]')
      });

      const response = await axios({
        method,
        url: finalUrl,
        headers,
        timeout: config.bingx.timeout,
        data: body
      });

      logger.debug('BingX API Response:', { status: response.status, data: response.data });

      if (response.data.code && response.data.code !== 0 && response.data.code !== '0') {
        throw new Error(`BingX API Error [${response.data.code}]: ${response.data.msg || 'Unknown error'}`);
      }
      return response.data.data || response.data;
    } catch (error) {
      if (error.response) {
        logger.error(`BingX API request failed: ${method} ${endpoint}`, {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
        if (error.response.data && error.response.data.msg) {
          throw new Error(`BingX API Error: ${error.response.data.msg}`);
        }
      } else {
        logger.error(`BingX API request failed: ${method} ${endpoint}`, { error: error.message });
      }
      throw error;
    }
  }

  /* ------------------------------ Account / Spot --------------------------- */

  async getAccountInfo(subAccountId = null) {
    try {
      const endpoint = config.bingx.endpoints.account;
      const params = {};
      if (subAccountId) params.subAccountId = subAccountId;

      const result = await this.makeRequest('GET', endpoint, params);

      logger.debug('BingX account response:', result);

      if (result && result.balance) {
        const b = result.balance;
        return {
          balance: parseFloat(b.balance || 0),
          availableBalance: parseFloat(b.availableMargin || b.balance || 0),
          equity: parseFloat(b.equity || b.balance || 0),
          unrealizedPnl: parseFloat(b.unrealizedProfit || 0),
          marginUsed: parseFloat(b.usedMargin || 0),
          marginRatio: parseFloat(b.marginRatio || 0),
        };
      }

      if (Array.isArray(result)) {
        const usdt = result.find((x) => x.asset === 'USDT') || {};
        return {
          balance: parseFloat(usdt.balance || 0),
          availableBalance: parseFloat(usdt.availableMargin || usdt.balance || 0),
          equity: parseFloat(usdt.equity || usdt.balance || 0),
          unrealizedPnl: parseFloat(usdt.unrealizedProfit || 0),
          marginUsed: parseFloat(usdt.usedMargin || 0),
          marginRatio: parseFloat(usdt.marginRatio || 0),
        };
      }

      return {
        balance: parseFloat(result.balance || 0),
        availableBalance: parseFloat(result.availableMargin || result.availableBalance || 0),
        equity: parseFloat(result.equity || result.balance || 0),
        unrealizedPnl: parseFloat(result.unrealizedProfit || result.unrealizedPnl || 0),
        marginUsed: parseFloat(result.usedMargin || result.marginUsed || 0),
        marginRatio: parseFloat(result.marginRatio || 0),
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

      if (result && Array.isArray(result.balances)) {
        const usdt = result.balances.find((x) => x.asset === 'USDT') || {};
        return {
          asset: 'USDT',
          free: parseFloat(usdt.free || 0),
          locked: parseFloat(usdt.locked || 0),
          total: parseFloat(usdt.free || 0) + parseFloat(usdt.locked || 0),
        };
      }

      return { asset: 'USDT', free: 0, locked: 0, total: 0 };
    } catch (error) {
      logger.error('Error getting spot balance:', error);
      throw error;
    }
  }

  async getPositions(subAccountId = null) {
    try {
      const endpoint = config.bingx.endpoints.positions;
      const params = {};
      // НЕ слать "main_account" — для мейн-аккаунта параметр вообще не нужен
      if (subAccountId && subAccountId !== 'main' && subAccountId !== 'main_account') {
        params.subAccountId = subAccountId;
      }

      const result = await this.makeRequest('GET', endpoint, params);

      if (!Array.isArray(result)) return [];

      return result.map((p) => ({
        symbol: p.symbol,
        side: p.side,
        size: parseFloat(p.size || 0),
        entryPrice: parseFloat(p.entryPrice || 0),
        markPrice: parseFloat(p.markPrice || 0),
        unrealizedPnl: parseFloat(p.unrealizedPnl || 0),
        percentage: parseFloat(p.percentage || 0),
        leverage: parseInt(p.leverage || 1, 10),
        marginType: p.marginType,
        isolatedMargin: parseFloat(p.isolatedMargin || 0),
        positionId: p.positionId,
      }));
    } catch (error) {
      logger.error('Error getting positions:', error);
      throw error;
    }
  }

  async getPositionMode(subAccountId = null) {
    try {
      // Use position mode from config
      const positionMode = config.bingx.positionMode || 'one-way';
      logger.debug(`Position mode from config: ${positionMode}`);
      return positionMode;
    } catch (error) {
      logger.warn('Could not determine position mode, defaulting to one-way:', error.message);
      return 'one-way';
    }
  }

  /* ---------------------------- Sub-Accounts ------------------------------- */

  async getSubAccounts() {
    try {
      const endpoint = config.bingx.endpoints.subAccounts;
      const result = await this.makeRequest('GET', endpoint);

      if (!Array.isArray(result)) return [];

      return result.map((a) => ({
        subAccountId: a.subAccountId,
        email: a.email,
        status: a.status,
        tag: a.tag,
        createTime: a.createTime,
      }));
    } catch (error) {
      logger.error('Error getting sub-accounts:', error);
      throw error;
    }
  }

  async createSubAccount(tag, email = null) {
    try {
      // BingX doesn't support sub-accounts for perpetual trading
      // We'll create a placeholder sub-account for tracking purposes
      const subAccountId = `placeholder_${tag}_${Date.now()}`;

      logger.info('BingX sub-accounts not supported - using placeholder:', subAccountId);

      tradeLog('sub_account_created', {
        subAccountId,
        tag,
        email,
        isPlaceholder: true
      });

      return {
        subAccountId,
        tag,
        email,
        status: 'active',
        isPlaceholder: true
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
        ...(type.includes('SUB') && { subAccountId }),
      };

      const result = await this.makeRequest('POST', endpoint, params);

      tradeLog('transfer', {
        subAccountId,
        asset,
        amount,
        type,
        transferId: result.transferId,
      });

      return {
        transferId: result.transferId,
        status: result.status,
      };
    } catch (error) {
      logger.error('Error transferring to sub-account:', error);
      throw error;
    }
  }

  /* ------------------------------ Trading ---------------------------------- */

  async placeOrder(orderData, subAccountId = null) {
    try {
      const formattedSymbol = this.formatSymbol(orderData.symbol);
      const endpoint = '/openApi/swap/v2/trade/order';

      // positionSide fallback: if hedge-mode likely LONG/SHORT, else can omit
      let positionSide = orderData.positionSide;
      if (!positionSide && orderData.side) {
        positionSide = orderData.side === 'BUY' ? 'LONG' : 'SHORT';
      }

      // Validate conditional orders require stopPrice
      const isConditional =
        String(orderData.type).includes('STOP') || String(orderData.type).includes('TAKE_PROFIT');
      if (isConditional && (orderData.stopPrice == null || Number(orderData.stopPrice) <= 0)) {
        throw new Error(`Conditional order ${orderData.type} requires a valid stopPrice`);
      }

      // Check position mode to determine if reduceOnly can be used
      const positionMode = await this.getPositionMode(subAccountId);
      const isHedgeMode = positionMode === 'hedge';
      
      logger.debug(`Position mode check: mode=${positionMode}, isHedge=${isHedgeMode}, reduceOnly=${orderData.reduceOnly}`);
      
      const params = {
        symbol: formattedSymbol,
        side: orderData.side,
        type: orderData.type,
        ...(orderData.quantity && { quantity: orderData.quantity.toString() }),
        ...(orderData.price && { price: orderData.price.toString() }),
        ...(positionSide && { positionSide }),
        // DO NOT send leverage here (set via setLeverage before placing order)
        ...(orderData.recvWindow && { recvWindow: orderData.recvWindow.toString() }),
        ...(orderData.clientOrderId && { clientOrderId: orderData.clientOrderId }),
        // Only send reduceOnly in one-way mode, not in hedge mode
        ...(!isHedgeMode && orderData.reduceOnly != null && { reduceOnly: String(orderData.reduceOnly) }),
        // Don't send main/main_account strings; omit for main account
        ...(subAccountId && subAccountId !== 'main' && subAccountId !== 'main_account' && { subAccountId }),
        // Conditional order specifics
        ...(isConditional && { stopPrice: String(orderData.stopPrice) }),
        ...(isConditional && { workingType: orderData.workingType || 'MARK_PRICE' }),
      };

      // TP/SL must be JSON strings - but let's try without them first to test basic functionality
      // if (orderData.takeProfit) {
      //   params.takeProfit = JSON.stringify(orderData.takeProfit, null, 0);
      // }
      // if (orderData.stopLoss) {
      //   params.stopLoss = JSON.stringify(orderData.stopLoss, null, 0);
      // }

      const result = await this.makeRequest('POST', endpoint, params);

      const orderResult = result.order || result;

      logger.debug('BingX placeOrder response:', {
        hasOrderWrapper: !!result.order,
        orderResult,
        orderKeys: Object.keys(orderResult || {}),
      });

      tradeLog('order_placed', {
        orderId: orderResult.orderId || orderResult.orderID,
        symbol: formattedSymbol,
        side: orderData.side,
        positionSide,
        type: orderData.type,
        quantity: orderData.quantity,
        subAccountId,
      });

      return {
        orderId: orderResult.orderId || orderResult.orderID,
        clientOrderId: orderResult.clientOrderId || orderResult.clientOrderID,
        symbol: orderResult.symbol || formattedSymbol,
        side: orderResult.side || orderData.side,
        positionSide: orderResult.positionSide || positionSide,
        // Do NOT assume FILLED; keep the exchange-provided status or default to NEW
        status: orderResult.status || 'NEW',
        executedQty: parseFloat(orderResult.executedQty || orderResult.quantity || 0),
        executedPrice: parseFloat(orderResult.avgPrice || orderResult.price || 0),
      };
    } catch (error) {
      logger.error('Error placing order:', error);
      throw error;
    }
  }

  async cancelOrder(orderId, symbol, subAccountId = null) {
    try {
      const formattedSymbol = this.formatSymbol(symbol);
      const endpoint = '/openApi/swap/v2/trade/order';
      const params = {
        orderId: String(orderId),
        symbol: formattedSymbol,
        ...(subAccountId && { subAccountId }),
      };

      const result = await this.makeRequest('DELETE', endpoint, params);

      tradeLog('order_cancelled', {
        orderId,
        symbol: formattedSymbol,
        subAccountId,
      });

      return {
        orderId: result.orderId,
        status: result.status,
      };
    } catch (error) {
      logger.error('Error cancelling order:', error);
      throw error;
    }
  }

  async getOrderHistory(symbol = null, limit = 100, subAccountId = null) {
    try {
      const endpoint = '/openApi/swap/v2/trade/allOrders';
      const params = {
        limit,
        ...(symbol && { symbol: this.formatSymbol(symbol) }),
        ...(subAccountId && { subAccountId }),
      };

      const result = await this.makeRequest('GET', endpoint, params);

      if (!Array.isArray(result)) return [];

      return result.map((o) => ({
        orderId: o.orderId,
        symbol: o.symbol,
        side: o.side,
        type: o.type,
        quantity: parseFloat(o.origQty || 0),
        price: parseFloat(o.price || 0),
        executedQty: parseFloat(o.executedQty || 0),
        avgPrice: parseFloat(o.avgPrice || 0),
        status: o.status,
        time: o.time,
        commission: parseFloat(o.commission || 0),
        commissionAsset: o.commissionAsset,
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
        ...(symbol && { symbol: this.formatSymbol(symbol) }),
        ...(subAccountId && { subAccountId }),
      };

      const result = await this.makeRequest('GET', endpoint, params);

      if (!Array.isArray(result)) return [];

      return result.map((o) => ({
        orderId: o.orderId,
        clientOrderId: o.clientOrderId,
        symbol: o.symbol,
        side: o.side,
        positionSide: o.positionSide,
        type: o.type,
        origQty: parseFloat(o.origQty || 0),
        price: parseFloat(o.price || 0),
        executedQty: parseFloat(o.executedQty || 0),
        status: o.status,
        timeInForce: o.timeInForce,
        updateTime: o.updateTime,
        workingType: o.workingType,
        stopPrice: parseFloat(o.stopPrice || 0),
      }));
    } catch (error) {
      logger.error('Error getting open orders:', error);
      throw error;
    }
  }

  /* --------------------------- Position / Leverage ------------------------- */

  async setLeverage(symbol, leverage, side, subAccountId = null) {
    try {
      const formattedSymbol = this.formatSymbol(symbol);
      const endpoint = '/openApi/swap/v2/trade/leverage';
      const params = {
        symbol: formattedSymbol,
        leverage: String(leverage),
        side: side || 'BOTH', // Default to BOTH if not specified
        ...(subAccountId && { subAccountId }),
      };

      const result = await this.makeRequest('POST', endpoint, params);

      tradeLog('leverage_set', {
        symbol: formattedSymbol,
        leverage,
        side,
        subAccountId,
      });

      return {
        symbol: result.symbol,
        leverage: result.leverage,
      };
    } catch (error) {
      logger.error('Error setting leverage:', error);
      throw error;
    }
  }

  async closePosition(symbol, quantity = null, subAccountId = null) {
    try {
      const formattedSymbol = this.formatSymbol(symbol);

      const positions = await this.getPositions(subAccountId);
      const position = positions.find((p) => p.symbol === formattedSymbol);

      if (!position) {
        logger.warn(
          `No position found for symbol ${formattedSymbol} on exchange, treating as already closed`
        );
        return {
          orderId: null,
          symbol: formattedSymbol,
          status: 'already_closed',
          message: `Position for ${formattedSymbol} not found on exchange`,
        };
      }

      if (!position.size || position.size <= 0) {
        logger.warn(
          `Position for symbol ${formattedSymbol} has zero size, treating as already closed`
        );
        return {
          orderId: null,
          symbol: formattedSymbol,
          status: 'already_closed',
          message: `Position for ${formattedSymbol} has zero size`,
        };
      }

      const closeQuantity = quantity || Math.abs(position.size);
      const closeSide = position.side === 'BUY' ? 'SELL' : 'BUY';

      logger.info(`Closing position for ${formattedSymbol}`, {
        originalSide: position.side,
        closeSide,
        originalSize: position.size,
        closeQuantity,
        subAccountId,
      });

      const orderData = {
        symbol: formattedSymbol,
        side: closeSide,
        type: 'MARKET',
        quantity: closeQuantity,
        reduceOnly: true,
        positionSide: position.side === 'BUY' ? 'LONG' : 'SHORT',
        recvWindow: 5000,
      };

      const result = await this.placeOrder(orderData, subAccountId);

      tradeLog('position_closed', {
        symbol: formattedSymbol,
        originalSide: position.side,
        closeSide,
        quantity: closeQuantity,
        orderId: result.orderId,
        subAccountId,
        reduceOnly: true,
      });

      logger.info(`Successfully closed position for ${formattedSymbol}`, {
        orderId: result.orderId,
        symbol: formattedSymbol,
        closeQuantity,
      });

      return result;
    } catch (error) {
      logger.error('Error closing position:', error);

      if (error.message && (error.message.includes('position') || error.message.includes('Position'))) {
        logger.warn(`Treating position ${symbol} as already closed due to error:`, error.message);
        return {
          orderId: null,
          symbol,
          status: 'already_closed',
          message: error.message,
        };
      }

      throw error;
    }
  }

  /* ------------------------------- Market Data ----------------------------- */

  async getSymbolPrice(symbol) {
    try {
      const formattedSymbol = this.formatSymbol(symbol);
      const endpoint = '/openApi/swap/v2/quote/price';
      const result = await this.makeRequest('GET', endpoint, { symbol: formattedSymbol }, false);

      return {
        symbol: result.symbol,
        price: parseFloat(result.price),
        time: result.time,
      };
    } catch (error) {
      logger.error('Error getting symbol price:', error);
      throw error;
    }
  }

  async getSymbolInfo(symbol) {
    try {
      const formattedSymbol = this.formatSymbol(symbol);
      const endpoint = '/openApi/swap/v2/quote/contracts';
      const result = await this.makeRequest('GET', endpoint, { symbol: formattedSymbol }, false);

      const list = Array.isArray(result) ? result : [];
      const item = list.find((c) => c.symbol === formattedSymbol) || list[0];

      if (!item) {
        throw new Error(`Symbol ${formattedSymbol} not found`);
      }

      // Derive tick/step from precision if explicit fields absent
      const quantityPrecision = Number(item.quantityPrecision ?? item.qtyPrecision ?? 4);
      const pricePrecision = Number(item.pricePrecision ?? 2);

      const stepSize =
        item.stepSize != null
          ? parseFloat(item.stepSize)
          : Number((1 / Math.pow(10, quantityPrecision)).toFixed(quantityPrecision));

      const tickSize =
        item.tickSize != null
          ? parseFloat(item.tickSize)
          : Number((1 / Math.pow(10, pricePrecision)).toFixed(pricePrecision));

      return {
        symbol: item.symbol,
        contractType: item.currency || item.contractType || 'USDT',
        tickSize,
        stepSize,
        minQty: parseFloat(item.tradeMinQuantity ?? item.minQty ?? 0.0001),
        maxQty: parseFloat(item.maxQty ?? 1000000),
        maxLeverage: parseInt(item.maxLeverage ?? 100, 10),
        minOrderValue: parseFloat(item.tradeMinUSDT ?? item.minNotional ?? 5),
        quantityPrecision,
        pricePrecision,
      };
    } catch (error) {
      logger.error('Error getting symbol info:', error);
      throw error;
    }
  }

  async getIncomeHistory(options = {}, subAccountId = null) {
    try {
      const endpoint = '/openApi/swap/v2/user/income';
      const params = {
        ...options,
        limit: options.limit || 50,
        ...(subAccountId && { subAccountId }),
      };

      const result = await this.makeRequest('GET', endpoint, params);

      if (!Array.isArray(result)) return [];

      return result.map((i) => ({
        symbol: i.symbol,
        incomeType: i.incomeType,
        income: parseFloat(i.income),
        asset: i.asset,
        time: i.time,
        info: i.info,
        tranId: i.tranId,
      }));
    } catch (error) {
      logger.error('Error getting income history:', error);
      return [];
    }
  }

  async getSupportedSymbols() {
    try {
      const endpoint = '/openApi/swap/v2/quote/contracts';
      const result = await this.makeRequest('GET', endpoint, {}, false);

      if (!Array.isArray(result)) {
        logger.warn('Unexpected response format for supported symbols', { result });
        return [];
      }

      const symbols = result.map((c) => ({
        symbol: c.symbol,
        baseAsset: c.baseAsset,
        quoteAsset: c.quoteAsset,
        contractType: c.contractType || c.currency,
        status: c.status,
      }));

      logger.info(`Loaded ${symbols.length} supported symbols from BingX`);
      return symbols;
    } catch (error) {
      logger.error('Error getting supported symbols:', error);
      return [];
    }
  }

  /* ---------------------------- Risk / Validation -------------------------- */

  calculatePositionSize(accountBalance, riskPercentage, entryPrice, stopLoss, leverage = 1) {
    try {
      const riskAmount = accountBalance * (riskPercentage / 100);
      const priceRisk = Math.abs(entryPrice - stopLoss);
      if (priceRisk === 0) return 0;

      const positionValue = riskAmount * leverage;
      const quantity = positionValue / entryPrice;

      return quantity;
    } catch (error) {
      logger.error('Error calculating position size:', error);
      return 0;
    }
  }

  /* ---------------------------- Symbol Formatting -------------------------- */

  formatSymbol(symbol) {
    if (!symbol) return '';
    
    // If already in correct format (e.g. "BTC-USDT"), return as is
    if (symbol.includes('-') && (symbol.endsWith('USDT') || symbol.endsWith('USDC'))) {
      return symbol;
    }
    
    // If in format "BTCUSDT", convert to "BTC-USDT"
    if (symbol.endsWith('USDT') || symbol.endsWith('USDC')) {
      const base = symbol.slice(0, -4);
      const quote = symbol.slice(-4);
      return `${base}-${quote}`;
    }
    
    // If just base asset (e.g. "BTC"), assume USDT quote
    if (!symbol.includes('-')) {
      return `${symbol}-USDT`;
    }
    
    return symbol;
  }

  /* ------------------------------- Status ---------------------------------- */

  getStatus() {
    try {
      const hasCredentials = Boolean(this.apiKey && this.secretKey);
      return {
        initialized: !!this.initialized,
        hasCredentials,
        mode: this.mode,
        baseUrl: this.baseUrl,
        supportedSymbolsCount: Array.isArray(this.supportedSymbols) ? this.supportedSymbols.length : 0,
        lastSymbolCacheUpdate: this.lastSymbolCacheUpdate || 0,
        status: this.initialized ? 'running' : 'not_initialized'
      };
    } catch (e) {
      return { initialized: false, hasCredentials: false, mode: 'mock', status: 'error', error: e.message };
    }
  }
}

module.exports = BingXService;
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const config = {
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 3000,
  WS_PORT: parseInt(process.env.WS_PORT) || 3001,

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'tg_crypto_signal',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    url: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production',
    pool: {
      min: 2,
      max: 20,
      idle: 30000,
      acquire: 60000,
    }
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || null,
    url: process.env.REDIS_URL,
    db: 0,
    keyPrefix: 'tg_crypto:',
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  },

  // Telegram
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    apiId: process.env.TELEGRAM_API_ID,
    apiHash: process.env.TELEGRAM_API_HASH,
    sessionName: 'tg_crypto_session',
    maxRetries: 3,
    retryDelay: 1000,
  },

  // BingX API
  bingx: {
    apiKey: process.env.BINGX_API_KEY,
    secretKey: process.env.BINGX_SECRET_KEY,
    baseUrl: process.env.BINGX_BASE_URL || 'https://open-api.bingx.com',
    endpoints: {
      account: '/openApi/swap/v2/user/balance',
      positions: '/openApi/swap/v2/user/positions',
      order: '/openApi/swap/v2/trade/order',
      orderHistory: '/openApi/swap/v2/user/trades',
      // Note: BingX doesn't have dedicated sub-account APIs for perpetual trading
      // We'll simulate sub-accounts using position isolation
      subAccounts: '/openApi/account/v1/subAccount/list', // Updated endpoint
      transfer: '/openApi/account/v1/transfer',
      spotBalance: '/openApi/spot/v1/account/balance',
      futuresBalance: '/openApi/swap/v2/user/balance',
    },
    timeout: 10000,
    maxRetries: 3,
  },

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    maxTokens: 1000,
    temperature: 0.1,
    timeout: 30000,
  },

  // Trading
  trading: {
    maxLeverage: parseInt(process.env.MAX_LEVERAGE) || 50,
    maxPositionPercentage: parseFloat(process.env.MAX_POSITION_PERCENTAGE) || 50,
    defaultRiskPercentage: parseFloat(process.env.DEFAULT_RISK_PERCENTAGE) || 2,
    minSignalConfidence: parseFloat(process.env.MIN_SIGNAL_CONFIDENCE) || 0.8,
    maxOpenPositions: 10,
    minTradeAmount: 5, // USDT
    stopLossBuffer: 0.001, // 0.1% buffer for stop loss
    takeProfitBuffer: 0.001, // 0.1% buffer for take profit
  },

  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    jwtExpiry: '24h',
    sessionSecret: process.env.SESSION_SECRET || 'your-session-secret',
    bcryptRounds: 12,
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || './logs/app.log',
    maxFiles: 5,
    maxSize: '10m',
    format: 'combined',
  },

  // WebSocket
  websocket: {
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? ['https://your-domain.com'] 
        : ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  },

  // Signal Processing
  signalProcessing: {
    batchSize: 10,
    processingDelay: 1000, // ms
    retryAttempts: 3,
    retryDelay: 5000, // ms
    confidenceThreshold: 0.7,
    maxQueueSize: 1000,
  },

  // Price Updates
  priceUpdates: {
    interval: 5000, // 5 seconds
    batchSize: 50,
    symbols: [], // Will be populated dynamically
    wsReconnectDelay: 5000,
  },

  // Paths
  paths: {
    logs: path.join(__dirname, '../../logs'),
    uploads: path.join(__dirname, '../../uploads'),
    temp: path.join(__dirname, '../../temp'),
  }
};

// Validation
const requiredEnvVars = [
  'TELEGRAM_BOT_TOKEN',
  'BINGX_API_KEY',
  'BINGX_SECRET_KEY',
  'OPENAI_API_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0 && process.env.NODE_ENV === 'production') {
  console.error('Missing required environment variables:', missingVars);
  process.exit(1);
}

// Helper functions
config.isDevelopment = () => config.NODE_ENV === 'development';
config.isProduction = () => config.NODE_ENV === 'production';
config.isTest = () => config.NODE_ENV === 'test';

module.exports = config;
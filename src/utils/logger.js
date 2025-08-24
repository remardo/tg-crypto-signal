const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config/app');

// Ensure logs directory exists
const logsDir = config.paths.logs;
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for logs
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} ${level}: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    if (stack && config.isDevelopment()) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Create the logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: customFormat,
  defaultMeta: { service: 'tg-crypto-signal' },
  transports: [
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Separate file for trading activities
    new winston.transports.File({
      filename: path.join(logsDir, 'trading.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      format: winston.format.combine(
        winston.format.label({ label: 'TRADING' }),
        customFormat
      )
    }),
    // Separate file for signal processing
    new winston.transports.File({
      filename: path.join(logsDir, 'signals.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      format: winston.format.combine(
        winston.format.label({ label: 'SIGNALS' }),
        customFormat
      )
    })
  ],
});

// Add console transport for non-production environments
if (!config.isProduction()) {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Create specialized loggers
const tradingLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.label({ label: 'TRADING' }),
    customFormat
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'trading.log'),
      maxsize: 10485760,
      maxFiles: 10,
    })
  ]
});

const signalLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.label({ label: 'SIGNALS' }),
    customFormat
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'signals.log'),
      maxsize: 10485760,
      maxFiles: 10,
    })
  ]
});

// Helper functions for structured logging
const logHelpers = {
  // Trading specific logs
  trade: (action, data) => {
    tradingLogger.info(`TRADE_${action.toUpperCase()}`, data);
    logger.info(`Trade ${action}`, data);
  },

  signal: (action, data) => {
    signalLogger.info(`SIGNAL_${action.toUpperCase()}`, data);
    logger.info(`Signal ${action}`, data);
  },

  // API logs
  apiRequest: (method, url, data = {}) => {
    logger.info('API_REQUEST', { method, url, ...data });
  },

  apiResponse: (method, url, status, data = {}) => {
    logger.info('API_RESPONSE', { method, url, status, ...data });
  },

  apiError: (method, url, error, data = {}) => {
    logger.error('API_ERROR', { method, url, error: error.message, ...data });
  },

  // Database logs
  dbQuery: (query, params = [], duration = null) => {
    logger.debug('DB_QUERY', { query, params, duration });
  },

  dbError: (query, error, params = []) => {
    logger.error('DB_ERROR', { query, error: error.message, params });
  },

  // WebSocket logs
  wsConnect: (socketId, data = {}) => {
    logger.info('WS_CONNECT', { socketId, ...data });
  },

  wsDisconnect: (socketId, reason, data = {}) => {
    logger.info('WS_DISCONNECT', { socketId, reason, ...data });
  },

  wsMessage: (socketId, event, data = {}) => {
    logger.debug('WS_MESSAGE', { socketId, event, ...data });
  },

  wsError: (socketId, error, data = {}) => {
    logger.error('WS_ERROR', { socketId, error: error.message, ...data });
  },

  // Performance logs
  performance: (operation, duration, data = {}) => {
    logger.info('PERFORMANCE', { operation, duration, ...data });
  },

  // Security logs
  security: (event, data = {}) => {
    logger.warn('SECURITY', { event, ...data });
  },

  // System logs
  system: (event, data = {}) => {
    logger.info('SYSTEM', { event, ...data });
  }
};

// Error handling for uncaught exceptions
if (config.isProduction()) {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
}

module.exports = {
  logger,
  tradingLogger,
  signalLogger,
  ...logHelpers
};
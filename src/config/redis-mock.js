// Redis mock/stub for development without Redis server
// This allows the application to start and test other components

const mockRedisClient = {
  connect: async () => {
    console.log('📢 Redis Mock: Connected (no real Redis server)');
    return Promise.resolve();
  },
  quit: async () => {
    console.log('📢 Redis Mock: Disconnected');
    return Promise.resolve();
  },
  get: async (key) => null,
  set: async (key, value) => 'OK',
  setEx: async (key, ttl, value) => 'OK',
  del: async (key) => 1,
  exists: async (key) => 0,
  hSet: async (key, field, value) => 1,
  hGet: async (key, field) => null,
  hGetAll: async (key) => ({}),
  hDel: async (key, field) => 1,
  lPush: async (key, value) => 1,
  rPop: async (key) => null,
  lRange: async (key, start, end) => [],
  lLen: async (key) => 0,
  publish: async (channel, message) => 1,
  subscribe: async (channel, callback) => {},
  unsubscribe: async (channel) => {},
  sAdd: async (key, member) => 1,
  sMembers: async (key) => [],
  sRem: async (key, member) => 1,
  expire: async (key, seconds) => 1,
  ttl: async (key) => -1,
  on: (event, handler) => {},
  off: (event, handler) => {}
};

const { logger } = require('../utils/logger');

const connectRedis = async () => {
  try {
    logger.warn('🚧 Starting in Redis MOCK mode - no real Redis server connection');
    logger.warn('🚧 This is for development only. Install Redis for production use.');
    
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return { 
      redisClient: mockRedisClient, 
      redisSubscriber: mockRedisClient 
    };
    
  } catch (error) {
    logger.error('Failed to setup Redis mock:', error);
    throw error;
  }
};

const disconnectRedis = async () => {
  logger.info('Redis mock connections closed');
};

// Mock Redis utilities
const redisUtils = {
  async set(key, value, ttl = 3600) {
    logger.debug(`Redis Mock SET: ${key} = ${JSON.stringify(value)} (TTL: ${ttl})`);
    return true;
  },

  async get(key) {
    logger.debug(`Redis Mock GET: ${key} -> null`);
    return null;
  },

  async del(key) {
    logger.debug(`Redis Mock DEL: ${key}`);
    return 1;
  },

  async exists(key) {
    return false;
  },

  async hSet(key, field, value) {
    logger.debug(`Redis Mock HSET: ${key}.${field} = ${JSON.stringify(value)}`);
    return true;
  },

  async hGet(key, field) {
    return null;
  },

  async hGetAll(key) {
    return {};
  },

  async hDel(key, field) {
    return 1;
  },

  async lPush(key, value) {
    logger.debug(`Redis Mock LPUSH: ${key} <- ${JSON.stringify(value)}`);
    return 1;
  },

  async rPop(key) {
    return null;
  },

  async lRange(key, start = 0, end = -1) {
    return [];
  },

  async lLen(key) {
    return 0;
  },

  async publish(channel, message) {
    logger.debug(`Redis Mock PUBLISH: ${channel} <- ${JSON.stringify(message)}`);
    return 1;
  },

  async subscribe(channel, callback) {
    logger.debug(`Redis Mock SUBSCRIBE: ${channel}`);
    // В реальной реализации здесь был бы redisSubscriber.subscribe
    // Для заглушки просто возвращаем успех
    return Promise.resolve();
  },

  async unsubscribe(channel) {
    logger.debug(`Redis Mock UNSUBSCRIBE: ${channel}`);
  },

  async sAdd(key, member) {
    return 1;
  },

  async sMembers(key) {
    return [];
  },

  async sRem(key, member) {
    return 1;
  },

  async expire(key, seconds) {
    return 1;
  },

  async ttl(key) {
    return -1;
  }
};

// Cache keys
const CACHE_KEYS = {
  CHANNEL: 'channel:',
  SIGNAL: 'signal:',
  POSITION: 'position:',
  ACCOUNT: 'account:',
  PRICE: 'price:',
  BALANCE: 'balance:',
  STATS: 'stats:',
  QUEUE: 'queue:',
  LOCK: 'lock:',
  SESSION: 'session:'
};

// Pub/Sub channels
const CHANNELS = {
  SIGNAL_NEW: 'signal:new',
  SIGNAL_EXECUTED: 'signal:executed',
  POSITION_UPDATE: 'position:update',
  POSITION_CLOSED: 'position:closed',
  ACCOUNT_UPDATE: 'account:update',
  PRICE_UPDATE: 'price:update',
  CHANNEL_UPDATE: 'channel:update'
};

module.exports = {
  connectRedis,
  disconnectRedis,
  redisClient: () => mockRedisClient,
  redisSubscriber: () => mockRedisClient,
  redisUtils,
  CACHE_KEYS,
  CHANNELS
};
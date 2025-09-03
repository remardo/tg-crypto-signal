const Redis = require('redis');
const config = require('./app');
const { logger } = require('../utils/logger');

let redisClient;
let redisSubscriber;

const createRedisClient = (options = {}) => {
  const clientConfig = {
    ...config.redis,
    ...options
  };

  if (config.redis.url) {
    return Redis.createClient({
      url: config.redis.url,
      ...clientConfig
    });
  }

  return Redis.createClient(clientConfig);
};

const connectRedis = async () => {
  const wantMock = String(process.env.REDIS_MOCK || '').toLowerCase() === 'true';
  try {
    if (wantMock) {
      // Explicitly requested mock via env var
      const mock = require('./redis-mock');
      const { redisClient: mockClientGetter, redisSubscriber: mockSubGetter } = mock;
      // Initialize mock (no-op connect internally)
      await mock.connectRedis?.().catch(() => {});
      redisClient = mockClientGetter();
      redisSubscriber = mockSubGetter();
      logger.warn('Using Redis MOCK as requested by REDIS_MOCK=true');
      return { redisClient, redisSubscriber };
    }

    // Main Redis client
    redisClient = createRedisClient();

    // Attach listeners BEFORE connect to avoid races
    redisClient.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });
    redisClient.on('connect', () => {
      logger.info('Redis Client Connected');
    });
    redisClient.on('ready', () => {
      logger.info('Redis Client Ready');
    });
    redisClient.on('end', () => {
      logger.info('Redis Client Connection Ended');
    });

    const waitForReady = () => new Promise((resolve, reject) => {
      // If already ready, resolve immediately
      if (redisClient.isReady) return resolve();

      let settled = false;
      const timeoutMs = Number(process.env.REDIS_READY_TIMEOUT_MS || 10000);
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('REDIS_READY_TIMEOUT'));
      }, timeoutMs);

      const onReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onError = (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        clearTimeout(timer);
        redisClient.off('ready', onReady);
        redisClient.off('error', onError);
      };

      redisClient.once('ready', onReady);
      redisClient.once('error', onError);
    });

    await redisClient.connect();
    await waitForReady();

    // Subscriber client for pub/sub
    redisSubscriber = createRedisClient();

    redisSubscriber.on('error', (err) => {
      logger.error('Redis Subscriber Error:', err);
    });

    await redisSubscriber.connect();

    logger.info('Redis connections established successfully');
    return { redisClient, redisSubscriber };
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    const isConnRefused = (error && (error.code === 'ECONNREFUSED' || String(error.message).includes('ECONNREFUSED')));
    // Fall back to mock if explicitly requested, in development, or when connection refused
    if (wantMock || config.isDevelopment() || isConnRefused) {
      try {
        const mock = require('./redis-mock');
        const { redisClient: mockClientGetter, redisSubscriber: mockSubGetter } = mock;
        await mock.connectRedis?.().catch(() => {});
        redisClient = mockClientGetter();
        redisSubscriber = mockSubGetter();
        logger.warn('Redis not available. Falling back to Redis MOCK.');
        return { redisClient, redisSubscriber };
      } catch (mockErr) {
        logger.error('Failed to initialize Redis MOCK fallback:', mockErr);
      }
    }
    throw error;
  }
};

const disconnectRedis = async () => {
  try {
    if (redisClient) {
      await redisClient.quit();
    }
    if (redisSubscriber) {
      await redisSubscriber.quit();
    }
    logger.info('Redis connections closed');
  } catch (error) {
    logger.error('Error closing Redis connections:', error);
  }
};

// Redis utilities
const redisUtils = {
  // Cache operations
  async set(key, value, ttl = 3600) {
    try {
      const serializedValue = JSON.stringify(value);
      if (ttl) {
        await redisClient.setEx(key, ttl, serializedValue);
      } else {
        await redisClient.set(key, serializedValue);
      }
      return true;
    } catch (error) {
      logger.error('Redis SET error:', error);
      return false;
    }
  },

  async get(key) {
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis GET error:', error);
      return null;
    }
  },

  async del(key) {
    try {
      return await redisClient.del(key);
    } catch (error) {
      logger.error('Redis DEL error:', error);
      return 0;
    }
  },

  async exists(key) {
    try {
      return await redisClient.exists(key);
    } catch (error) {
      logger.error('Redis EXISTS error:', error);
      return false;
    }
  },

  // Hash operations
  async hSet(key, field, value) {
    try {
      const serializedValue = JSON.stringify(value);
      return await redisClient.hSet(key, field, serializedValue);
    } catch (error) {
      logger.error('Redis HSET error:', error);
      return false;
    }
  },

  async hGet(key, field) {
    try {
      const value = await redisClient.hGet(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis HGET error:', error);
      return null;
    }
  },

  async hGetAll(key) {
    try {
      const hash = await redisClient.hGetAll(key);
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        result[field] = JSON.parse(value);
      }
      return result;
    } catch (error) {
      logger.error('Redis HGETALL error:', error);
      return {};
    }
  },

  async hDel(key, field) {
    try {
      return await redisClient.hDel(key, field);
    } catch (error) {
      logger.error('Redis HDEL error:', error);
      return 0;
    }
  },

  // List operations
  async lPush(key, value) {
    try {
      const serializedValue = JSON.stringify(value);
      return await redisClient.lPush(key, serializedValue);
    } catch (error) {
      logger.error('Redis LPUSH error:', error);
      return 0;
    }
  },

  async rPop(key) {
    try {
      if (!redisClient) {
        logger.warn('Redis client not initialized for rPop');
        return null;
      }
      const value = await redisClient.rPop(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis RPOP error:', error);
      return null;
    }
  },

  async lRange(key, start = 0, end = -1) {
    try {
      const values = await redisClient.lRange(key, start, end);
      return values.map(value => JSON.parse(value));
    } catch (error) {
      logger.error('Redis LRANGE error:', error);
      return [];
    }
  },

  async lLen(key) {
    try {
      return await redisClient.lLen(key);
    } catch (error) {
      logger.error('Redis LLEN error:', error);
      return 0;
    }
  },

  // Pub/Sub operations
  // Безопасный publish: принимает строку или объект
  async publish(channel, message) {
    try {
      if (typeof channel !== 'string' || !channel.length) {
        throw new Error(`publish: channel must be string, got ${typeof channel}`);
      }
      const payload = (typeof message === 'string') ? message : JSON.stringify(message ?? {});
      return await redisClient.publish(channel, payload);
    } catch (error) {
      // логируйте канал и тип данных, чтобы быстро ловить регресс
      logger.error('Redis publish failed', { channel, typeofData: typeof message, err: error?.message });
      return 0;
    }
  },

  async subscribe(channel, callback) {
    try {
      if (!redisSubscriber) {
        logger.warn('Redis subscriber not initialized for subscribe');
        return;
      }
      await redisSubscriber.subscribe(channel, (message) => {
        try {
          const parsedMessage = JSON.parse(message);
          callback(parsedMessage);
        } catch (error) {
          logger.error('Error parsing Redis message:', error);
          callback(message);
        }
      });
    } catch (error) {
      logger.error('Redis SUBSCRIBE error:', error);
    }
  },

  async unsubscribe(channel) {
    try {
      await redisSubscriber.unsubscribe(channel);
    } catch (error) {
      logger.error('Redis UNSUBSCRIBE error:', error);
    }
  },

  // Set operations
  async sAdd(key, member) {
    try {
      const serializedMember = JSON.stringify(member);
      return await redisClient.sAdd(key, serializedMember);
    } catch (error) {
      logger.error('Redis SADD error:', error);
      return 0;
    }
  },

  async sMembers(key) {
    try {
      const members = await redisClient.sMembers(key);
      return members.map(member => JSON.parse(member));
    } catch (error) {
      logger.error('Redis SMEMBERS error:', error);
      return [];
    }
  },

  async sRem(key, member) {
    try {
      const serializedMember = JSON.stringify(member);
      return await redisClient.sRem(key, serializedMember);
    } catch (error) {
      logger.error('Redis SREM error:', error);
      return 0;
    }
  },

  async sCard(key) {
    try {
      return await redisClient.sCard(key);
    } catch (error) {
      logger.error('Redis SCARD error:', error);
      return 0;
    }
  },

  // Expiry operations
  async expire(key, seconds) {
    try {
      return await redisClient.expire(key, seconds);
    } catch (error) {
      logger.error('Redis EXPIRE error:', error);
      return false;
    }
  },

  async ttl(key) {
    try {
      return await redisClient.ttl(key);
    } catch (error) {
      logger.error('Redis TTL error:', error);
      return -1;
    }
  },

  // Health check
  async ping() {
    try {
      return await redisClient.ping();
    } catch (error) {
      logger.error('Redis PING error:', error);
      throw error;
    }
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
  CHANNEL_UPDATE: 'channel:update',
  POSITION_PNL_UPDATED: 'position:pnl_updated',
  POSITION_PRICE_UPDATED: 'position:price_updated'
};

module.exports = {
  connectRedis,
  disconnectRedis,
  redisClient: () => redisClient,
  redisSubscriber: () => redisSubscriber,
  redisUtils,
  CACHE_KEYS,
  CHANNELS
};
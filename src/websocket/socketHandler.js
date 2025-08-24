const { Server } = require('socket.io');
const { createServer } = require('http');
const { logger } = require('../utils/logger');
const { redisUtils, CHANNELS } = require('../config/redis');
const config = require('../config/app');

class WebSocketService {
  constructor() {
    this.io = null;
    this.server = null;
    this.connectedClients = new Map();
    this.subscriptions = new Map();
    this.isRunning = false;
  }

  async initialize(app) {
    try {
      // Create HTTP server
      this.server = createServer(app);
      
      // Initialize Socket.IO
      this.io = new Server(this.server, {
        cors: config.websocket.cors,
        transports: config.websocket.transports,
        pingTimeout: config.websocket.pingTimeout,
        pingInterval: config.websocket.pingInterval
      });

      // Setup event handlers
      this.setupEventHandlers();
      
      // Subscribe to Redis channels
      await this.subscribeToRedisChannels();
      
      logger.info('WebSocket service initialized successfully');
      return true;
      
    } catch (error) {
      logger.error('Failed to initialize WebSocket service:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    this.io.on('error', (error) => {
      logger.error('WebSocket server error:', error);
    });
  }

  handleConnection(socket) {
    const clientId = socket.id;
    const clientInfo = {
      id: clientId,
      ip: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent'],
      connectedAt: new Date(),
      subscriptions: new Set()
    };

    this.connectedClients.set(clientId, clientInfo);
    
    logger.info(`Client connected: ${clientId}`, {
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent
    });

    // Send welcome message
    socket.emit('connected', {
      clientId,
      timestamp: new Date(),
      availableChannels: Object.values(CHANNELS)
    });

    // Handle client events
    this.setupClientEventHandlers(socket, clientInfo);

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });
  }

  setupClientEventHandlers(socket, clientInfo) {
    // Subscribe to specific data feeds
    socket.on('subscribe', (data) => {
      this.handleSubscription(socket, clientInfo, data);
    });

    // Unsubscribe from data feeds
    socket.on('unsubscribe', (data) => {
      this.handleUnsubscription(socket, clientInfo, data);
    });

    // Request current data
    socket.on('request_data', async (data) => {
      await this.handleDataRequest(socket, data);
    });

    // Ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date() });
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error(`Client error from ${socket.id}:`, error);
    });
  }

  handleSubscription(socket, clientInfo, data) {
    try {
      const { channels } = data;
      
      if (!Array.isArray(channels)) {
        socket.emit('error', {
          message: 'Channels must be an array',
          code: 'INVALID_SUBSCRIPTION'
        });
        return;
      }

      const validChannels = Object.values(CHANNELS);
      const invalidChannels = channels.filter(ch => !validChannels.includes(ch));
      
      if (invalidChannels.length > 0) {
        socket.emit('error', {
          message: `Invalid channels: ${invalidChannels.join(', ')}`,
          code: 'INVALID_CHANNELS',
          validChannels
        });
        return;
      }

      // Add to client subscriptions
      channels.forEach(channel => {
        clientInfo.subscriptions.add(channel);
        
        // Add to global subscriptions tracking
        if (!this.subscriptions.has(channel)) {
          this.subscriptions.set(channel, new Set());
        }
        this.subscriptions.get(channel).add(socket.id);
      });

      socket.emit('subscribed', {
        channels,
        timestamp: new Date()
      });

      logger.info(`Client ${socket.id} subscribed to channels:`, channels);

    } catch (error) {
      logger.error(`Subscription error for client ${socket.id}:`, error);
      socket.emit('error', {
        message: 'Subscription failed',
        code: 'SUBSCRIPTION_ERROR'
      });
    }
  }

  handleUnsubscription(socket, clientInfo, data) {
    try {
      const { channels } = data;
      
      if (!Array.isArray(channels)) {
        socket.emit('error', {
          message: 'Channels must be an array',
          code: 'INVALID_UNSUBSCRIPTION'
        });
        return;
      }

      // Remove from client subscriptions
      channels.forEach(channel => {
        clientInfo.subscriptions.delete(channel);
        
        // Remove from global subscriptions tracking
        if (this.subscriptions.has(channel)) {
          this.subscriptions.get(channel).delete(socket.id);
          
          // Clean up empty channel subscriptions
          if (this.subscriptions.get(channel).size === 0) {
            this.subscriptions.delete(channel);
          }
        }
      });

      socket.emit('unsubscribed', {
        channels,
        timestamp: new Date()
      });

      logger.info(`Client ${socket.id} unsubscribed from channels:`, channels);

    } catch (error) {
      logger.error(`Unsubscription error for client ${socket.id}:`, error);
      socket.emit('error', {
        message: 'Unsubscription failed',
        code: 'UNSUBSCRIPTION_ERROR'
      });
    }
  }

  async handleDataRequest(socket, data) {
    try {
      const { type, params = {} } = data;

      let responseData = null;

      switch (type) {
        case 'dashboard_overview':
          responseData = await this.getDashboardOverview(params);
          break;
          
        case 'recent_signals':
          responseData = await this.getRecentSignals(params);
          break;
          
        case 'open_positions':
          responseData = await this.getOpenPositions(params);
          break;
          
        case 'channel_stats':
          responseData = await this.getChannelStats(params);
          break;
          
        case 'account_balances':
          responseData = await this.getAccountBalances(params);
          break;
          
        default:
          socket.emit('error', {
            message: `Unknown data request type: ${type}`,
            code: 'UNKNOWN_REQUEST_TYPE'
          });
          return;
      }

      socket.emit('data_response', {
        type,
        data: responseData,
        timestamp: new Date(),
        requestParams: params
      });

    } catch (error) {
      logger.error(`Data request error for client ${socket.id}:`, error);
      socket.emit('error', {
        message: 'Data request failed',
        code: 'DATA_REQUEST_ERROR',
        details: error.message
      });
    }
  }

  handleDisconnection(socket, reason) {
    const clientInfo = this.connectedClients.get(socket.id);
    
    if (clientInfo) {
      // Remove from all subscriptions
      clientInfo.subscriptions.forEach(channel => {
        if (this.subscriptions.has(channel)) {
          this.subscriptions.get(channel).delete(socket.id);
          
          if (this.subscriptions.get(channel).size === 0) {
            this.subscriptions.delete(channel);
          }
        }
      });

      // Remove client info
      this.connectedClients.delete(socket.id);
      
      logger.info(`Client disconnected: ${socket.id}`, {
        reason,
        duration: Date.now() - clientInfo.connectedAt.getTime()
      });
    }
  }

  async subscribeToRedisChannels() {
    try {
      // Subscribe to all notification channels
      const channels = Object.values(CHANNELS);
      
      for (const channel of channels) {
        await redisUtils.subscribe(channel, (data) => {
          this.broadcastToSubscribers(channel, data);
        });
      }

      logger.info('Subscribed to Redis notification channels');

    } catch (error) {
      logger.error('Error subscribing to Redis channels:', error);
    }
  }

  broadcastToSubscribers(channel, data) {
    try {
      const subscribers = this.subscriptions.get(channel);
      
      if (!subscribers || subscribers.size === 0) {
        return;
      }

      const message = {
        channel,
        data,
        timestamp: new Date()
      };

      // Send to all subscribers of this channel
      subscribers.forEach(clientId => {
        const socket = this.io.sockets.sockets.get(clientId);
        if (socket) {
          socket.emit('notification', message);
        }
      });

      logger.debug(`Broadcasted ${channel} notification to ${subscribers.size} clients`);

    } catch (error) {
      logger.error(`Error broadcasting to ${channel} subscribers:`, error);
    }
  }

  // Data fetching methods for real-time requests
  async getDashboardOverview(params) {
    try {
      // This would integrate with your services to get real-time data
      const overview = {
        totalChannels: 0,
        activeChannels: 0,
        totalBalance: 0,
        totalPnl: 0,
        openPositions: 0,
        pendingSignals: 0,
        recentSignals: 0
      };

      // Add actual data fetching logic here
      return overview;

    } catch (error) {
      logger.error('Error getting dashboard overview:', error);
      throw error;
    }
  }

  async getRecentSignals(params) {
    try {
      const { limit = 20, channelId } = params;
      
      // Get recent signals from cache or database
      const recentSignals = await redisUtils.lRange('recent_signals', 0, limit - 1);
      
      return {
        signals: recentSignals,
        total: recentSignals.length
      };

    } catch (error) {
      logger.error('Error getting recent signals:', error);
      throw error;
    }
  }

  async getOpenPositions(params) {
    try {
      const { channelId } = params;
      
      // Get open positions from cache
      const openPositionIds = await redisUtils.sMembers('open_positions');
      const positions = [];

      for (const positionId of openPositionIds.slice(0, 50)) {
        const position = await redisUtils.get(`position:${positionId}`);
        if (position && (!channelId || position.channelId === channelId)) {
          positions.push(position);
        }
      }

      return {
        positions,
        total: positions.length
      };

    } catch (error) {
      logger.error('Error getting open positions:', error);
      throw error;
    }
  }

  async getChannelStats(params) {
    try {
      const { timeRange = '24h' } = params;
      
      // Get channel statistics
      const stats = await redisUtils.get(`channel_stats:all:${timeRange}`);
      
      return stats || {
        totalChannels: 0,
        activeChannels: 0,
        totalSignals: 0,
        totalPositions: 0
      };

    } catch (error) {
      logger.error('Error getting channel stats:', error);
      throw error;
    }
  }

  async getAccountBalances(params) {
    try {
      // Get account balances from cache
      const balances = await redisUtils.get('account_balances');
      
      return balances || [];

    } catch (error) {
      logger.error('Error getting account balances:', error);
      throw error;
    }
  }

  // Broadcasting methods for external use
  broadcastSignalUpdate(signal) {
    this.broadcastToSubscribers(CHANNELS.SIGNAL_NEW, {
      type: 'signal_update',
      signal,
      timestamp: new Date()
    });
  }

  broadcastPositionUpdate(position) {
    this.broadcastToSubscribers(CHANNELS.POSITION_UPDATE, {
      type: 'position_update',
      position,
      timestamp: new Date()
    });
  }

  broadcastAccountUpdate(account) {
    this.broadcastToSubscribers(CHANNELS.ACCOUNT_UPDATE, {
      type: 'account_update',
      account,
      timestamp: new Date()
    });
  }

  broadcastChannelUpdate(channel, action) {
    this.broadcastToSubscribers(CHANNELS.CHANNEL_UPDATE, {
      type: 'channel_update',
      action,
      channel,
      timestamp: new Date()
    });
  }

  // Utility methods
  getConnectedClients() {
    return Array.from(this.connectedClients.values()).map(client => ({
      id: client.id,
      ip: client.ip,
      connectedAt: client.connectedAt,
      subscriptions: Array.from(client.subscriptions)
    }));
  }

  getSubscriptionStats() {
    const stats = {};
    
    this.subscriptions.forEach((subscribers, channel) => {
      stats[channel] = subscribers.size;
    });

    return stats;
  }

  async start(port = config.WS_PORT) {
    try {
      if (this.isRunning) {
        throw new Error('WebSocket service is already running');
      }

      this.server.listen(port, () => {
        this.isRunning = true;
        logger.info(`WebSocket service started on port ${port}`);
      });

      return true;

    } catch (error) {
      logger.error('Failed to start WebSocket service:', error);
      throw error;
    }
  }

  async shutdown() {
    try {
      logger.info('Shutting down WebSocket service...');

      // Disconnect all clients
      if (this.io) {
        this.io.disconnectSockets();
      }

      // Close server
      if (this.server) {
        this.server.close();
      }

      // Clear state
      this.connectedClients.clear();
      this.subscriptions.clear();
      this.isRunning = false;

      logger.info('WebSocket service shutdown complete');

    } catch (error) {
      logger.error('Error during WebSocket service shutdown:', error);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      connectedClients: this.connectedClients.size,
      totalSubscriptions: Array.from(this.subscriptions.values())
        .reduce((total, subs) => total + subs.size, 0),
      subscriptionsByChannel: this.getSubscriptionStats()
    };
  }
}

module.exports = WebSocketService;
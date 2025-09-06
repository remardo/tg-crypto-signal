const { redisUtils, CHANNELS, CACHE_KEYS } = require('../config/redis');
const { logger, signal: signalLog } = require('../utils/logger');
const Signal = require('../models/Signal');
const Channel = require('../models/Channel');
const { SignalRecognitionService } = require('./signalRecognitionService');
const TelegramService = require('./telegramService');

class SignalFeedService {
  constructor() {
    this.isProcessing = false;
    this.signalRecognition = new SignalRecognitionService();
    this.telegramService = new TelegramService();
    this.processingQueue = [];
    this.batchSize = 10;
    this.processingInterval = null;
  }

  async initialize() {
    try {
      // Initialize dependencies
      await this.signalRecognition.initialize();
      
      // Start processing queued messages
      await this.startMessageProcessor();
      
      // Subscribe to new message notifications
      await this.subscribeToMessages();
      
      logger.info('Signal feed service initialized successfully');
      return true;
      
    } catch (error) {
      logger.error('Failed to initialize signal feed service:', error);
      throw error;
    }
  }

  async subscribeToMessages() {
    try {
      await redisUtils.subscribe(CHANNELS.SIGNAL_NEW, async (data) => {
        if (data.type === 'new_message') {
          await this.processQueuedMessages();
        }
      });
      
      logger.info('Subscribed to signal message notifications');
      
    } catch (error) {
      logger.error('Error subscribing to messages:', error);
    }
  }

  async startMessageProcessor() {
    // Process messages every 5 seconds
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processQueuedMessages();
      }
    }, 5000);
    
    logger.info('Message processor started');
  }

  async processQueuedMessages() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    
    try {
      // Get messages from Redis queue
      const messages = [];
      for (let i = 0; i < this.batchSize; i++) {
        const message = await redisUtils.rPop('message_queue');
        if (!message) break;
        messages.push(message);
      }

      if (messages.length === 0) {
        return;
      }

      logger.info(`Processing ${messages.length} queued messages`);

      // Process each message
      for (const messageData of messages) {
        try {
          await this.processMessage(messageData);
        } catch (error) {
          logger.error(`Error processing message ${messageData.messageId}:`, error);
          
          // Store failed message for later analysis
          await this.storeFailedMessage(messageData, error.message);
        }
      }

    } catch (error) {
      logger.error('Error processing message queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async processMessage(messageData) {
    try {
      const { channelId, text, messageId } = messageData;
      
      // Get channel info
      const channel = await Channel.findById(channelId);
      if (!channel) {
        throw new Error(`Channel not found: ${channelId}`);
      }

      // Skip if channel is paused
      if (channel.isPaused) {
        logger.debug(`Skipping message from paused channel: ${channel.name}`);
        return;
      }

      // Analyze message with ChatGPT
      const analysis = await this.signalRecognition.analyzeMessage({
        text,
        channelName: channel.name,
        date: messageData.date
      });

      signalLog('processed', {
        channelName: channel.name,
        messageId,
        isSignal: analysis.isSignal,
        signalType: analysis.signalType,
        confidence: analysis.confidence
      });

      // Create signal record
      const signalData = {
        channelId: channel.id,
        coin: analysis.extractedData?.coin || null,
        direction: analysis.extractedData?.direction || null,
        leverage: analysis.extractedData?.leverage || null,
        entryPrice: analysis.extractedData?.entryPrice || null,
        takeProfitLevels: analysis.extractedData?.takeProfitLevels || [],
        stopLoss: analysis.extractedData?.stopLoss || null,
        suggestedVolume: analysis.extractedData?.suggestedVolume || null,
        confidenceScore: analysis.confidence,
        rawMessage: text,
        parsedData: {
          analysis: analysis.sotAnalysis,
          extractedData: analysis.extractedData,
          reasoning: analysis.reasoning
        },
        messageTimestamp: messageData.date,
        signalType: analysis.signalType,
        status: this.determineSignalStatus(analysis, channel)
      };

      // Only create signal if it's not ignored
      if (signalData.status !== 'ignored') {
        // Additional validation for entry signals
        if (signalData.signalType === 'entry' && !signalData.coin) {
          logger.warn(`Skipping entry signal without coin from channel ${channel.name}`);
          return null;
        }
        
        const signal = await Signal.create(signalData);

        // Cache signal for quick access
        await this.cacheSignal(signal);

        // Notify subscribers about new signal
        await this.notifyNewSignal(signal, analysis);

        // Auto-execute if enabled and signal meets criteria
        if (analysis.isSignal && channel.autoExecute && analysis.signalType === 'entry') {
          await this.scheduleAutoExecution(signal);
        }

        return signal;
      } else {
        // Log ignored signal for debugging
        logger.debug(`Ignored signal from channel ${channel.name}: ${analysis.reasoning}`);
        return null;
      }

    } catch (error) {
      logger.error('Error processing message:', error);
      throw error;
    }
  }

  determineSignalStatus(analysis, channel) {
    if (!analysis.isSignal) {
      return 'ignored';
    }

    if (analysis.signalType === 'general') {
      return 'ignored';
    }

    if (channel.autoExecute && analysis.signalType === 'entry' && analysis.confidence >= 0.8) {
      return 'approved';
    }

    return 'pending';
  }

  async cacheSignal(signal) {
    try {
      const cacheKey = `${CACHE_KEYS.SIGNAL}${signal.id}`;
      await redisUtils.set(cacheKey, signal.toJSON(), 3600); // Cache for 1 hour
      
      // Add to channel's signal list
      const channelSignalsKey = `${CACHE_KEYS.CHANNEL}${signal.channelId}:signals`;
      await redisUtils.lPush(channelSignalsKey, signal.id);
      
      // Limit channel signal cache to 100 recent signals
      const signalCount = await redisUtils.lLen(channelSignalsKey);
      if (signalCount > 100) {
        await redisUtils.rPop(channelSignalsKey);
      }

    } catch (error) {
      logger.error('Error caching signal:', error);
    }
  }

  async notifyNewSignal(signal, analysis) {
    try {
      const notification = {
        type: 'new_signal',
        signal: signal.toJSON(),
        analysis: {
          isSignal: analysis.isSignal,
          confidence: analysis.confidence,
          signalType: analysis.signalType,
          reasoning: analysis.reasoning
        },
        timestamp: new Date()
      };

      // Publish to all subscribers
      await redisUtils.publish(CHANNELS.SIGNAL_NEW, notification);
      
      // Store in recent signals list
      await redisUtils.lPush('recent_signals', notification);
      
      // Limit recent signals to 1000
      const recentCount = await redisUtils.lLen('recent_signals');
      if (recentCount > 1000) {
        await redisUtils.rPop('recent_signals');
      }

    } catch (error) {
      logger.error('Error notifying new signal:', error);
    }
  }

  async scheduleAutoExecution(signal) {
    try {
      // Add to auto-execution queue
      const executionData = {
        signalId: signal.id,
        channelId: signal.channelId,
        scheduledAt: new Date(),
        priority: signal.confidenceScore
      };

      await redisUtils.lPush('auto_execution_queue', executionData);
      
      // Notify execution service
      await redisUtils.publish('signal:auto_execute', executionData);
      
      signalLog('scheduled_auto_execution', {
        signalId: signal.id,
        coin: signal.coin,
        direction: signal.direction,
        confidence: signal.confidenceScore
      });

    } catch (error) {
      logger.error('Error scheduling auto execution:', error);
    }
  }

  async storeFailedMessage(messageData, errorMessage) {
    try {
      const failedMessage = {
        messageId: messageData.messageId,
        channelId: messageData.channelId,
        text: messageData.text,
        error: errorMessage,
        timestamp: new Date(),
        retryCount: 0
      };

      await redisUtils.lPush('failed_messages', failedMessage);
      
      logger.error('Stored failed message for retry', {
        messageId: messageData.messageId,
        error: errorMessage
      });

    } catch (error) {
      logger.error('Error storing failed message:', error);
    }
  }

  // Signal Feed Management
  async getSignalFeed(filters = {}) {
    try {
      const {
        channelId,
        status,
        signalType,
        limit = 50,
        offset = 0,
        timeRange
      } = filters;

      // Try cache first for recent signals
      if (!channelId && !status && !signalType && !timeRange && offset === 0 && limit <= 50) {
        const cachedSignals = await redisUtils.lRange('recent_signals', 0, limit - 1);
        if (cachedSignals.length > 0) {
          return {
            signals: cachedSignals.map(item => item.signal),
            total: cachedSignals.length,
            cached: true
          };
        }
      }

      // Get from database
      const signals = await Signal.findAll({
        channelId,
        status,
        signalType,
        limit,
        offset
      });

      return {
        signals: signals.map(signal => signal.toJSON()),
        total: signals.length,
        cached: false
      };

    } catch (error) {
      logger.error('Error getting signal feed:', error);
      throw error;
    }
  }

  async getPendingSignals(channelId = null) {
    try {
      const filters = { status: 'pending' };
      if (channelId) {
        filters.channelId = channelId;
      }

      return await Signal.findAll(filters);

    } catch (error) {
      logger.error('Error getting pending signals:', error);
      throw error;
    }
  }

  async approveSignal(signalId, userId = null) {
    try {
      const signal = await Signal.findById(signalId);
      if (!signal) {
        throw new Error('Signal not found');
      }

      if (signal.status !== 'pending') {
        throw new Error(`Signal is not pending (current status: ${signal.status})`);
      }

      await signal.approve();
      
      // Update cache
      await this.cacheSignal(signal);
      
      // Notify subscribers
      await redisUtils.publish(CHANNELS.SIGNAL_EXECUTED, {
        type: 'signal_approved',
        signalId: signal.id,
        userId,
        timestamp: new Date()
      });

      signalLog('approved', {
        signalId: signal.id,
        coin: signal.coin,
        direction: signal.direction,
        userId
      });

      return signal;

    } catch (error) {
      logger.error('Error approving signal:', error);
      throw error;
    }
  }

  async ignoreSignal(signalId, reason = null, userId = null) {
    try {
      const signal = await Signal.findById(signalId);
      if (!signal) {
        throw new Error('Signal not found');
      }

      await signal.ignore();
      
      // Update parsed data with ignore reason
      if (reason) {
        const parsedData = signal.parsedData || {};
        parsedData.ignoreReason = reason;
        await signal.update({ parsedData });
      }

      // Update cache
      await this.cacheSignal(signal);

      signalLog('ignored', {
        signalId: signal.id,
        coin: signal.coin,
        reason,
        userId
      });

      return signal;

    } catch (error) {
      logger.error('Error ignoring signal:', error);
      throw error;
    }
  }

  async getSignalStats(channelId = null, timeRange = '24h') {
    try {
      const cacheKey = `signal_stats:${channelId || 'all'}:${timeRange}`;
      
      // Try cache first
      const cachedStats = await redisUtils.get(cacheKey);
      if (cachedStats) {
        return cachedStats;
      }

      // Calculate from database
      let timeFilter = '';
      switch (timeRange) {
        case '1h':
          timeFilter = "processed_at >= NOW() - INTERVAL '1 hour'";
          break;
        case '24h':
          timeFilter = "processed_at >= NOW() - INTERVAL '24 hours'";
          break;
        case '7d':
          timeFilter = "processed_at >= NOW() - INTERVAL '7 days'";
          break;
        case '30d':
          timeFilter = "processed_at >= NOW() - INTERVAL '30 days'";
          break;
        default:
          timeFilter = "processed_at >= NOW() - INTERVAL '24 hours'";
      }

      let query = `
        SELECT 
          COUNT(*) as total_signals,
          COUNT(CASE WHEN signal_type = 'entry' THEN 1 END) as entry_signals,
          COUNT(CASE WHEN signal_type = 'update' THEN 1 END) as update_signals,
          COUNT(CASE WHEN signal_type = 'close' THEN 1 END) as close_signals,
          COUNT(CASE WHEN signal_type = 'general' THEN 1 END) as general_posts,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_signals,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_signals,
          COUNT(CASE WHEN status = 'executed' THEN 1 END) as executed_signals,
          COUNT(CASE WHEN status = 'ignored' THEN 1 END) as ignored_signals,
          AVG(confidence_score) as avg_confidence
        FROM signals 
        WHERE ${timeFilter}
      `;

      const params = [];
      if (channelId) {
        query += ' AND channel_id = $1';
        params.push(channelId);
      }

      const db = require('../database/connection');
      const result = await db.query(query, params);
      const stats = result.rows[0];

      const formattedStats = {
        totalSignals: parseInt(stats.total_signals),
        entrySignals: parseInt(stats.entry_signals),
        updateSignals: parseInt(stats.update_signals),
        closeSignals: parseInt(stats.close_signals),
        generalPosts: parseInt(stats.general_posts),
        pendingSignals: parseInt(stats.pending_signals),
        approvedSignals: parseInt(stats.approved_signals),
        executedSignals: parseInt(stats.executed_signals),
        ignoredSignals: parseInt(stats.ignored_signals),
        avgConfidence: parseFloat(stats.avg_confidence || 0),
        timeRange,
        generatedAt: new Date()
      };

      // Cache for 5 minutes
      await redisUtils.set(cacheKey, formattedStats, 300);

      return formattedStats;

    } catch (error) {
      logger.error('Error getting signal stats:', error);
      throw error;
    }
  }

  async retryFailedMessages(limit = 10) {
    try {
      let success = 0;
      let failed = 0;
      let retried = 0;

      for (let i = 0; i < limit; i++) {
        const failedMessage = await redisUtils.rPop('failed_messages');
        if (!failedMessage) break; // nothing left to retry
        retried++;

        try {
          await this.processMessage(failedMessage);
          success++;
        } catch (error) {
          failed++;
          // Increment retry count
          failedMessage.retryCount = (failedMessage.retryCount || 0) + 1;

          // If too many retries, move to permanent failure; else push back to failed
          if (failedMessage.retryCount >= 3) {
            await redisUtils.lPush('permanent_failures', failedMessage);
          } else {
            await redisUtils.lPush('failed_messages', failedMessage);
          }
        }
      }

      logger.info(`Retry completed: ${success} success, ${failed} failed`);

      return {
        retried,
        success,
        failed
      };

    } catch (error) {
      logger.error('Error retrying failed messages:', error);
      throw error;
    }
  }

  async getServiceStatus() {
    try {
      const queueSize = await redisUtils.lLen('message_queue');
      const failedCount = await redisUtils.lLen('failed_messages');
      const recentSignals = await redisUtils.lLen('recent_signals');

      return {
        isProcessing: this.isProcessing,
        queueSize,
        failedCount,
        recentSignals,
        batchSize: this.batchSize,
        recognitionService: this.signalRecognition.getStats()
      };

    } catch (error) {
      logger.error('Error getting service status:', error);
      return {
        isProcessing: false,
        queueSize: 0,
        failedCount: 0,
        recentSignals: 0,
        error: error.message
      };
    }
  }

  async cleanupOldSignals(options = {}) {
    try {
      const {
        olderThanDays = 30,
        status = null,
        keepRecent = 1000
      } = options;

      logger.info(`Starting cleanup of old signals (older than ${olderThanDays} days, status: ${status || 'all'})`);

      const db = require('../database/connection');
      let query = `
        SELECT id, processed_at, status
        FROM signals
        WHERE processed_at < NOW() - INTERVAL '${olderThanDays} days'
      `;
      const params = [];

      if (status) {
        query += ' AND status = $1';
        params.push(status);
      }

      // Order by processed_at to keep most recent ones
      query += ' ORDER BY processed_at ASC';

      const result = await db.query(query, params);
      const oldSignals = result.rows;

      if (oldSignals.length === 0) {
        logger.info('No old signals found for cleanup');
        return { deleted: 0, kept: 0 };
      }

      // Keep the most recent signals if specified
      let signalsToDelete = oldSignals;
      if (keepRecent > 0 && oldSignals.length > keepRecent) {
        signalsToDelete = oldSignals.slice(0, oldSignals.length - keepRecent);
      }

      logger.info(`Found ${oldSignals.length} old signals, will delete ${signalsToDelete.length}`);

      // Delete signals and their associated positions
      let deletedCount = 0;
      for (const signal of signalsToDelete) {
        try {
          // Delete associated positions first
          await db.query('DELETE FROM positions WHERE signal_id = $1', [signal.id]);

          // Delete the signal
          await db.query('DELETE FROM signals WHERE id = $1', [signal.id]);

          deletedCount++;
        } catch (error) {
          logger.warn(`Failed to delete signal ${signal.id}:`, error.message);
        }
      }

      logger.info(`Cleanup completed: deleted ${deletedCount} signals`);

      return {
        deleted: deletedCount,
        kept: oldSignals.length - deletedCount,
        totalFound: oldSignals.length
      };

    } catch (error) {
      logger.error('Error during signal cleanup:', error);
      throw error;
    }
  }

  async shutdown() {
    try {
      logger.info('Shutting down signal feed service...');
      
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
      }
      
      this.isProcessing = false;
      
      logger.info('Signal feed service shutdown complete');
      
    } catch (error) {
      logger.error('Error during signal feed service shutdown:', error);
    }
  }
}

module.exports = SignalFeedService;
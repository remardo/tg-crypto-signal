const { Telegraf } = require('telegraf');
const config = require('../config/app');
const { logger } = require('../utils/logger');
const { redisUtils, CHANNELS } = require('../config/redis');
const Channel = require('../models/Channel');

class TelegramService {
  constructor() {
    this.bot = null;
    this.isConnected = false;
    this.monitoredChannels = new Map();
    this.messageQueue = [];
    this.processingMessages = false;
  }

  async initialize() {
    try {
      if (!config.telegram.botToken) {
        throw new Error('Telegram bot token is required');
      }

      // Validate token format
      if (!config.telegram.botToken.match(/^\d+:[A-Za-z0-9_-]+$/)) {
        throw new Error('Invalid Telegram bot token format');
      }

      logger.info('Initializing Telegram bot with token:', config.telegram.botToken.substring(0, 10) + '...');

      this.bot = new Telegraf(config.telegram.botToken);
      
      // Test token validity first
      try {
        logger.info('Testing Telegram bot token...');
        const botInfo = await this.bot.telegram.getMe();
        logger.info('Token is valid. Bot info:', { username: botInfo.username, id: botInfo.id });
        // Token is valid, set connected state
        this.isConnected = true;
      } catch (tokenError) {
        logger.error('❌ Invalid Telegram bot token:', tokenError.message);
        this.isConnected = false;
        return true; // Continue with initialization even if token is invalid
      }
      
      // Setup bot event handlers
      this.setupEventHandlers();
      
      // Load monitored channels from database
      await this.loadMonitoredChannels();
      
      // Start the bot asynchronously without blocking server startup
      logger.info('Attempting to launch Telegram bot asynchronously...');
      this.bot.launch().then(() => {
        logger.info('✅ Telegram bot launched successfully (ready to receive messages)');
        logger.info('🔍 Bot is now listening for updates in polling mode');
        logger.info('📈 Monitored channels count:', this.monitoredChannels.size);
        
        // Log monitored channels
        for (const [chatId, channel] of this.monitoredChannels) {
          logger.info(`📺 Monitoring channel: ${channel.name} (${chatId})`);
        }
      }).catch((launchError) => {
        logger.error('❌ Failed to launch Telegram bot:', {
          message: launchError.message,
          code: launchError.code,
          response: launchError.response?.description
        });
        // Don't change connection status here since token is already validated
      });
      
      logger.info('Telegram bot initialization completed (launching in background)');
      return true;
      
    } catch (error) {
      logger.error('Failed to initialize Telegram bot:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    // Log all updates for debugging
    this.bot.use(async (ctx, next) => {
      logger.info('🔍 Received Telegram update:', {
        updateType: ctx.updateType,
        chatId: ctx.chat?.id,
        chatTitle: ctx.chat?.title,
        messageText: ctx.message?.text?.substring(0, 100) || 'No text',
        from: ctx.from?.username
      });
      return next();
    });

    // Handle start command
    this.bot.start((ctx) => {
      ctx.reply('Crypto Trading Bot is running! 🚀');
      logger.info('Bot started by user:', ctx.from);
    });

    // Handle help command
    this.bot.help((ctx) => {
      const helpText = `
🤖 Crypto Trading Bot Commands:

/start - Start the bot
/help - Show this help message
/status - Show bot status
/channels - List monitored channels

The bot automatically monitors configured channels for trading signals.
      `;
      ctx.reply(helpText);
    });

    // Handle status command
    this.bot.command('status', (ctx) => {
      const status = `
📊 Bot Status:
• Connected: ${this.isConnected ? '✅' : '❌'}
• Monitored Channels: ${this.monitoredChannels.size}
• Queue Size: ${this.messageQueue.length}
• Processing: ${this.processingMessages ? '🔄' : '⏸️'}
      `;
      ctx.reply(status);
    });

    // Handle channels command
    this.bot.command('channels', async (ctx) => {
      const channels = Array.from(this.monitoredChannels.values());
      if (channels.length === 0) {
        ctx.reply('No channels are currently being monitored.');
        return;
      }

      const channelList = channels.map((channel, index) => 
        `${index + 1}. ${channel.name} ${channel.isActive ? '✅' : '❌'} ${channel.isPaused ? '⏸️' : '▶️'}`
      ).join('\n');

      ctx.reply(`📺 Monitored Channels:\n${channelList}`);
    });

    // Handle all text messages from channels
    this.bot.on('text', async (ctx) => {
      await this.handleChannelMessage(ctx);
    });

    // Handle channel posts (messages in channels)
    this.bot.on('channel_post', async (ctx) => {
      logger.info('📺 Received channel_post update');
      await this.handleChannelMessage(ctx);
    });

    // Handle edited channel posts
    this.bot.on('edited_channel_post', async (ctx) => {
      logger.info('✏️ Received edited_channel_post update');
      await this.handleChannelMessage(ctx);
    });

    // Handle photos with captions (some signals come with images)
    this.bot.on('photo', async (ctx) => {
      await this.handleChannelMessage(ctx);
    });

    // Handle documents (PDFs, files)
    this.bot.on('document', async (ctx) => {
      await this.handleChannelMessage(ctx);
    });

    // Handle forwarded messages
    this.bot.on('forward_date', async (ctx) => {
      await this.handleChannelMessage(ctx);
    });

    // Error handling
    this.bot.catch((err, ctx) => {
      logger.error('Telegram bot error:', err);
      logger.error('Context:', ctx);
      // Don't crash the bot, just log the error
    });

    // Add graceful shutdown handling
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }

  async handleChannelMessage(ctx) {
    try {
      logger.info('📬 Received message in handleChannelMessage');
      
      // Handle different types of updates
      const message = ctx.message || ctx.channelPost || ctx.editedChannelPost || ctx.update.message || ctx.update.channel_post;
      if (!message) {
        logger.warn('No message object found in context', {
          updateType: ctx.updateType,
          updateKeys: Object.keys(ctx.update || {})
        });
        return;
      }

      // Extract channel information
      const chatId = message.chat.id.toString();
      const chatTitle = message.chat.title || message.chat.username || 'Unknown';
      
      logger.info('📺 Processing message from chat:', {
        chatId,
        chatTitle,
        messageText: message.text?.substring(0, 100) || 'No text',
        messageType: ctx.updateType,
        isMonitored: this.monitoredChannels.has(chatId)
      });
      
      // Check if this channel is monitored
      const channel = this.monitoredChannels.get(chatId);
      if (!channel) {
        logger.debug(`Message from unmonitored channel: ${chatTitle} (${chatId})`);
        return;
      }

      // Skip if channel is paused
      if (channel.isPaused) {
        logger.debug(`Message from paused channel: ${channel.name}`);
        return;
      }

      // Extract message content
      const messageData = {
        messageId: message.message_id,
        channelId: channel.id,
        channelName: channel.name,
        telegramChannelId: chatId,
        text: message.text || message.caption || '',
        date: new Date(message.date * 1000),
        userId: message.from?.id,
        username: message.from?.username,
        isForwarded: !!message.forward_date,
        forwardedFrom: message.forward_from_chat?.title,
        photos: message.photo || [],
        document: message.document || null,
        entities: message.entities || [],
        rawMessage: message
      };

      // Add to processing queue
      await this.queueMessageForProcessing(messageData);
      
      logger.info(`Message queued from channel ${channel.name}`, {
        messageId: messageData.messageId,
        textLength: messageData.text.length,
        hasPhotos: messageData.photos.length > 0,
        hasDocument: !!messageData.document
      });

    } catch (error) {
      logger.error('Error handling channel message:', error);
    }
  }

  async queueMessageForProcessing(messageData) {
    try {
      // Add to Redis queue for signal processing
      await redisUtils.lPush('message_queue', messageData);
      
      // Notify signal processing service
      await redisUtils.publish(CHANNELS.SIGNAL_NEW, {
        type: 'new_message',
        channelId: messageData.channelId,
        messageId: messageData.messageId,
        timestamp: new Date()
      });

      // Store in local queue as backup
      this.messageQueue.push(messageData);
      
      // Limit queue size
      if (this.messageQueue.length > 1000) {
        this.messageQueue.shift();
      }

    } catch (error) {
      logger.error('Error queueing message:', error);
      throw error;
    }
  }

  async loadMonitoredChannels() {
    try {
      const channels = await Channel.findAll({ isActive: true });
      
      this.monitoredChannels.clear();
      
      for (const channel of channels) {
        let chatId = channel.telegramChannelId;
        
        // If it's a username (starts with @), get the actual chat ID
        if (chatId.startsWith('@')) {
          try {
            const actualChatId = await this.getChatIdByUsername(chatId);
            chatId = actualChatId;
            
            // Update the database with the actual chat ID
            await channel.update({ telegramChannelId: actualChatId });
            logger.info(`Updated channel ${channel.name} chat ID from ${channel.telegramChannelId} to ${actualChatId}`);
          } catch (error) {
            logger.warn(`Could not get chat ID for ${chatId}:`, error.message);
            // Continue with username for now
          }
        }
        
        this.monitoredChannels.set(chatId, channel);
        logger.info(`Loaded channel for monitoring: ${channel.name} (${chatId})`);
      }

      logger.info(`Loaded ${channels.length} channels for monitoring`);
      
    } catch (error) {
      logger.error('Error loading monitored channels:', error);
      throw error;
    }
  }

  async addChannel(channelData) {
    try {
      // Find existing channel (it should already be created by ChannelService)
      const channel = await Channel.findByTelegramId(channelData.telegramChannelId);

      if (!channel) {
        throw new Error(`Channel with Telegram ID ${channelData.telegramChannelId} not found in database`);
      }

      // Add to monitored channels
      this.monitoredChannels.set(channel.telegramChannelId, channel);

      logger.info(`Added channel to Telegram monitoring: ${channel.name}`);

      return channel;

    } catch (error) {
      logger.error('Error adding channel to Telegram monitoring:', error);
      throw error;
    }
  }

  async removeChannel(channelId) {
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      // Remove from monitored channels
      this.monitoredChannels.delete(channel.telegramChannelId);
      
      // Delete from database
      await channel.delete();
      
      logger.info(`Removed channel from monitoring: ${channel.name}`);
      
      return true;
      
    } catch (error) {
      logger.error('Error removing channel:', error);
      throw error;
    }
  }

  async pauseChannel(channelId) {
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      await channel.pause();
      
      // Update in memory
      const monitoredChannel = this.monitoredChannels.get(channel.telegramChannelId);
      if (monitoredChannel) {
        monitoredChannel.isPaused = true;
      }
      
      logger.info(`Paused channel: ${channel.name}`);
      
      return channel;
      
    } catch (error) {
      logger.error('Error pausing channel:', error);
      throw error;
    }
  }

  async resumeChannel(channelId) {
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      await channel.resume();
      
      // Update in memory
      const monitoredChannel = this.monitoredChannels.get(channel.telegramChannelId);
      if (monitoredChannel) {
        monitoredChannel.isPaused = false;
      }
      
      logger.info(`Resumed channel: ${channel.name}`);
      
      return channel;
      
    } catch (error) {
      logger.error('Error resuming channel:', error);
      throw error;
    }
  }

  async refreshChannels() {
    try {
      await this.loadMonitoredChannels();
      logger.info('Refreshed monitored channels');
      return true;
    } catch (error) {
      logger.error('Error refreshing channels:', error);
      throw error;
    }
  }

  async getChannelInfo(telegramChannelId) {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }

      const chat = await this.bot.telegram.getChat(telegramChannelId);
      
      return {
        id: chat.id,
        title: chat.title,
        username: chat.username,
        type: chat.type,
        description: chat.description,
        memberCount: chat.members_count,
        photo: chat.photo
      };
      
    } catch (error) {
      logger.error('Error getting channel info:', error);
      throw error;
    }
  }

  async getChatIdByUsername(username) {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }

      // Remove @ if present
      const cleanUsername = username.startsWith('@') ? username.slice(1) : username;
      
      const chat = await this.bot.telegram.getChat(`@${cleanUsername}`);
      logger.info(`Found chat ID for @${cleanUsername}: ${chat.id}`);
      
      return chat.id.toString();
      
    } catch (error) {
      logger.error(`Error getting chat ID for ${username}:`, error);
      throw error;
    }
  }

  async sendMessage(channelId, message) {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }

      await this.bot.telegram.sendMessage(channelId, message);
      logger.info(`Message sent to channel ${channelId}`);
      
      return true;
      
    } catch (error) {
      logger.error('Error sending message:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      monitoredChannels: this.monitoredChannels.size,
      queueSize: this.messageQueue.length,
      processingMessages: this.processingMessages,
      channelList: Array.from(this.monitoredChannels.values()).map(channel => ({
        id: channel.id,
        name: channel.name,
        isActive: channel.isActive,
        isPaused: channel.isPaused
      }))
    };
  }

  async getQueuedMessages(limit = 100) {
    try {
      const messages = await redisUtils.lRange('message_queue', 0, limit - 1);
      return messages;
    } catch (error) {
      logger.error('Error getting queued messages:', error);
      return [];
    }
  }

  async clearQueue() {
    try {
      await redisUtils.del('message_queue');
      this.messageQueue = [];
      logger.info('Message queue cleared');
      return true;
    } catch (error) {
      logger.error('Error clearing queue:', error);
      return false;
    }
  }

  async shutdown() {
    try {
      logger.info('Shutting down Telegram service...');
      
      if (this.bot) {
        this.bot.stop('SIGINT');
      }
      
      this.isConnected = false;
      this.monitoredChannels.clear();
      
      logger.info('Telegram service shutdown complete');
      
    } catch (error) {
      logger.error('Error during Telegram service shutdown:', error);
    }
  }
}

module.exports = TelegramService;
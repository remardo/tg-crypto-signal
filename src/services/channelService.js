const { redisUtils, CHANNELS } = require('../config/redis');
const { logger } = require('../utils/logger');
const Channel = require('../models/Channel');
const Account = require('../models/Account');
const TelegramService = require('./telegramService');
const BingXService = require('./bingxService');

class ChannelService {
  constructor() {
    this.telegramService = new TelegramService();
    this.bingxService = new BingXService();
    this.initialized = false;
  }

  async initialize() {
    try {
      // Initialize dependencies if not already done
      if (!this.bingxService.initialized) {
        await this.bingxService.initialize();
      }

      this.initialized = true;
      logger.info('Channel service initialized successfully');
      
      return true;
      
    } catch (error) {
      logger.error('Failed to initialize channel service:', error);
      throw error;
    }
  }

  async addChannel(channelData) {
    try {
      const {
        telegramChannelId,
        name,
        description,
        maxPositionPercentage = 10.0,
        autoExecute = false,
        riskPercentage = 2.0,
        initialBalance = 0,
        tpPercentages = [25.0, 25.0, 50.0]
      } = channelData;

      // Validate required fields
      if (!telegramChannelId || !name) {
        throw new Error('Telegram channel ID and name are required');
      }

      // Validate TP percentages
      if (tpPercentages && Array.isArray(tpPercentages)) {
        if (tpPercentages.length === 0 || tpPercentages.length > 5) {
          throw new Error('TP percentages must contain 1-5 values');
        }
        
        const totalPercentage = tpPercentages.reduce((sum, p) => sum + p, 0);
        if (Math.abs(totalPercentage - 100) > 0.1) {
          throw new Error(`TP percentages must sum to 100%, got ${totalPercentage.toFixed(1)}%`);
        }
        
        for (const percentage of tpPercentages) {
          if (percentage < 0.1 || percentage > 100) {
            throw new Error('Each TP percentage must be between 0.1 and 100');
          }
        }
      }

      // Check if channel already exists
      const existingChannel = await Channel.findByTelegramId(telegramChannelId);
      if (existingChannel) {
        throw new Error('Channel already exists');
      }

      // Get channel info from Telegram
      let telegramInfo = null;
      try {
        telegramInfo = await this.telegramService.getChannelInfo(telegramChannelId);
      } catch (error) {
        logger.warn('Could not get Telegram channel info:', error.message);
      }

      // Create sub-account on BingX
      const subAccountTag = `channel_${name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
      
      let subAccount = null;
      try {
        subAccount = await this.bingxService.createSubAccount(subAccountTag);
      } catch (error) {
        // If sub-account creation fails, we'll create a placeholder
        logger.warn('Could not create BingX sub-account:', error.message);
        subAccount = {
          subAccountId: `placeholder_${subAccountTag}`,
          tag: subAccountTag,
          status: 'pending'
        };
      }

      // Create channel record
      const newChannelData = {
        telegramChannelId,
        name,
        description: description || telegramInfo?.description,
        subAccountId: subAccount.subAccountId,
        maxPositionPercentage,
        autoExecute,
        riskPercentage,
        tpPercentages
      };

      const channel = await Channel.create(newChannelData);

      // Create account record
      const accountData = {
        channelId: channel.id,
        bingxSubAccountId: subAccount.subAccountId,
        name: `${name} Trading Account`,
        totalBalance: initialBalance,
        availableBalance: initialBalance
      };

      const account = await Account.create(accountData);

      // Transfer initial balance if specified
      if (initialBalance > 0) {
        try {
          await this.bingxService.transferToSubAccount(
            subAccount.subAccountId,
            'USDT',
            initialBalance
          );
          
          logger.info(`Transferred ${initialBalance} USDT to sub-account ${subAccount.subAccountId}`);
        } catch (error) {
          logger.warn('Could not transfer initial balance:', error.message);
        }
      }

      // Add channel to Telegram monitoring
      try {
        await this.telegramService.addChannel(newChannelData);
      } catch (error) {
        logger.warn('Could not add channel to Telegram monitoring:', error.message);
      }

      // Cache channel data
      await this.cacheChannelData(channel, account);

      // Notify about new channel
      await this.notifyChannelUpdate('added', channel);

      logger.info(`Channel added successfully: ${name} (${telegramChannelId})`);

      return {
        channel: channel.toJSON(),
        account: account.toJSON(),
        subAccount: subAccount
      };

    } catch (error) {
      logger.error('Error adding channel:', error);
      throw error;
    }
  }

  async removeChannel(channelId) {
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      // Get associated account
      const account = await Account.findByChannelId(channelId);

      // Check for open positions
      const openPositions = await channel.getPositions('open');
      if (openPositions.length > 0) {
        throw new Error(`Cannot remove channel with ${openPositions.length} open positions`);
      }

      // Remove from Telegram monitoring
      try {
        await this.telegramService.removeChannel(channelId);
      } catch (error) {
        logger.warn('Could not remove from Telegram monitoring:', error.message);
      }

      // Close sub-account (transfer remaining balance to main account)
      if (account) {
        try {
          const accountInfo = await this.bingxService.getAccountInfo(account.bingxSubAccountId);
          if (accountInfo.availableBalance > 0) {
            await this.bingxService.transferToSubAccount(
              account.bingxSubAccountId,
              'USDT',
              accountInfo.availableBalance,
              'SUB_TO_MAIN'
            );
          }
        } catch (error) {
          logger.warn('Could not transfer remaining balance:', error.message);
        }

        // Delete account record
        await account.delete();
      }

      // Delete channel record
      await channel.delete();

      // Remove from cache
      await this.removeCachedChannelData(channelId);

      // Notify about channel removal
      await this.notifyChannelUpdate('removed', channel);

      logger.info(`Channel removed successfully: ${channel.name}`);

      return {
        success: true,
        removedChannel: channel.toJSON()
      };

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

      if (channel.isPaused) {
        throw new Error('Channel is already paused');
      }

      await channel.pause();

      // Update Telegram monitoring
      try {
        await this.telegramService.pauseChannel(channelId);
      } catch (error) {
        logger.warn('Could not pause in Telegram service:', error.message);
      }

      // Update cache
      await this.cacheChannelData(channel);

      // Notify about channel pause
      await this.notifyChannelUpdate('paused', channel);

      logger.info(`Channel paused: ${channel.name}`);

      return channel.toJSON();

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

      if (!channel.isPaused) {
        throw new Error('Channel is not paused');
      }

      await channel.resume();

      // Update Telegram monitoring
      try {
        await this.telegramService.resumeChannel(channelId);
      } catch (error) {
        logger.warn('Could not resume in Telegram service:', error.message);
      }

      // Update cache
      await this.cacheChannelData(channel);

      // Notify about channel resume
      await this.notifyChannelUpdate('resumed', channel);

      logger.info(`Channel resumed: ${channel.name}`);

      return channel.toJSON();

    } catch (error) {
      logger.error('Error resuming channel:', error);
      throw error;
    }
  }

  async updateChannelSettings(channelId, updateData) {
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      // Validate update data
      const allowedUpdates = [
        'name',
        'description',
        'maxPositionPercentage',
        'autoExecute',
        'riskPercentage',
        'tpPercentages'
      ];

      const filteredUpdates = {};
      for (const [key, value] of Object.entries(updateData)) {
        if (allowedUpdates.includes(key)) {
          filteredUpdates[key] = value;
        }
      }

      if (Object.keys(filteredUpdates).length === 0) {
        throw new Error('No valid update fields provided');
      }

      // Validate specific fields
      if (filteredUpdates.maxPositionPercentage !== undefined) {
        if (filteredUpdates.maxPositionPercentage < 1 || filteredUpdates.maxPositionPercentage > 100) {
          throw new Error('Max position percentage must be between 1 and 100');
        }
      }

      if (filteredUpdates.riskPercentage !== undefined) {
        if (filteredUpdates.riskPercentage < 0.1 || filteredUpdates.riskPercentage > 20) {
          throw new Error('Risk percentage must be between 0.1 and 20');
        }
      }

      // Validate TP percentages
      if (filteredUpdates.tpPercentages !== undefined) {
        const tpPercentages = filteredUpdates.tpPercentages;
        
        if (!Array.isArray(tpPercentages)) {
          throw new Error('TP percentages must be an array');
        }
        
        if (tpPercentages.length === 0 || tpPercentages.length > 5) {
          throw new Error('TP percentages must contain 1-5 values');
        }
        
        const totalPercentage = tpPercentages.reduce((sum, p) => sum + p, 0);
        if (Math.abs(totalPercentage - 100) > 0.1) {
          throw new Error(`TP percentages must sum to 100%, got ${totalPercentage.toFixed(1)}%`);
        }
        
        for (const percentage of tpPercentages) {
          if (percentage < 0.1 || percentage > 100) {
            throw new Error('Each TP percentage must be between 0.1 and 100');
          }
        }
      }

      // Update channel
      const updatedChannel = await channel.update(filteredUpdates);

      // Update cache
      await this.cacheChannelData(updatedChannel);

      // Notify about channel update
      await this.notifyChannelUpdate('updated', updatedChannel);

      logger.info(`Channel settings updated: ${updatedChannel.name}`, filteredUpdates);

      return updatedChannel.toJSON();

    } catch (error) {
      logger.error('Error updating channel settings:', error);
      throw error;
    }
  }

  async getAllChannels(includeInactive = false) {
    try {
      const filters = {};
      if (!includeInactive) {
        filters.isActive = true;
      }

      const channels = await Channel.findAll(filters);
      
      // Get additional data for each channel
      const enrichedChannels = await Promise.all(
        channels.map(async (channel) => {
          try {
            const account = await Account.findByChannelId(channel.id);
            const stats = await channel.getStats();
            
            return {
              ...channel.toJSON(),
              account: account ? account.toJSON() : null,
              stats
            };
          } catch (error) {
            logger.warn(`Error enriching channel ${channel.id}:`, error.message);
            return channel.toJSON();
          }
        })
      );

      return enrichedChannels;

    } catch (error) {
      logger.error('Error getting all channels:', error);
      throw error;
    }
  }

  async getChannelDetails(channelId) {
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      // Get associated account
      const account = await Account.findByChannelId(channelId);
      
      // Get channel statistics
      const stats = await channel.getStats();
      
      // Get recent signals
      const recentSignals = await channel.getSignals(20);
      
      // Get open positions
      const openPositions = await channel.getPositions('open');
      
      // Get account balance from BingX if account exists
      let accountBalance = null;
      if (account) {
        try {
          accountBalance = await this.bingxService.getAccountInfo(account.bingxSubAccountId);
        } catch (error) {
          logger.warn('Could not get account balance:', error.message);
        }
      }

      return {
        channel: channel.toJSON(),
        account: account ? account.toJSON() : null,
        accountBalance,
        stats,
        recentSignals: recentSignals.slice(0, 10), // Last 10 signals
        openPositions: openPositions.length,
        totalSignals: recentSignals.length
      };

    } catch (error) {
      logger.error('Error getting channel details:', error);
      throw error;
    }
  }

  async transferToChannel(channelId, amount, asset = 'USDT') {
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      const account = await Account.findByChannelId(channelId);
      if (!account) {
        throw new Error('Channel account not found');
      }

      // Transfer from main account to sub-account
      const transferResult = await this.bingxService.transferToSubAccount(
        account.bingxSubAccountId,
        asset,
        amount
      );

      // Update account balance
      const updatedBalance = await this.bingxService.getAccountInfo(account.bingxSubAccountId);
      await account.updateBalance(updatedBalance.balance, updatedBalance.availableBalance);

      logger.info(`Transferred ${amount} ${asset} to channel ${channel.name}`);

      return {
        success: true,
        transfer: transferResult,
        newBalance: updatedBalance
      };

    } catch (error) {
      logger.error('Error transferring to channel:', error);
      throw error;
    }
  }

  async withdrawFromChannel(channelId, amount, asset = 'USDT') {
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      const account = await Account.findByChannelId(channelId);
      if (!account) {
        throw new Error('Channel account not found');
      }

      // Check available balance
      const accountInfo = await this.bingxService.getAccountInfo(account.bingxSubAccountId);
      if (accountInfo.availableBalance < amount) {
        throw new Error(`Insufficient balance: ${accountInfo.availableBalance} < ${amount}`);
      }

      // Transfer from sub-account to main account
      const transferResult = await this.bingxService.transferToSubAccount(
        account.bingxSubAccountId,
        asset,
        amount,
        'SUB_TO_MAIN'
      );

      // Update account balance
      const updatedBalance = await this.bingxService.getAccountInfo(account.bingxSubAccountId);
      await account.updateBalance(updatedBalance.balance, updatedBalance.availableBalance);

      logger.info(`Withdrew ${amount} ${asset} from channel ${channel.name}`);

      return {
        success: true,
        transfer: transferResult,
        newBalance: updatedBalance
      };

    } catch (error) {
      logger.error('Error withdrawing from channel:', error);
      throw error;
    }
  }

  async refreshChannelBalances() {
    try {
      const channels = await Channel.findAll({ isActive: true });
      const updates = [];

      for (const channel of channels) {
        try {
          const account = await Account.findByChannelId(channel.id);
          if (!account) continue;

          const accountInfo = await this.bingxService.getAccountInfo(account.bingxSubAccountId);
          await account.updateBalance(accountInfo.balance, accountInfo.availableBalance);

          const pnlData = await account.calculatePnL();
          await account.updatePnl(pnlData.unrealizedPnl, pnlData.totalPnl);

          updates.push({
            channelId: channel.id,
            channelName: channel.name,
            balance: accountInfo.balance,
            pnl: pnlData.totalPnl
          });

        } catch (error) {
          logger.warn(`Error refreshing balance for channel ${channel.name}:`, error.message);
        }
      }

      logger.info(`Refreshed balances for ${updates.length} channels`);

      return updates;

    } catch (error) {
      logger.error('Error refreshing channel balances:', error);
      throw error;
    }
  }

  async cacheChannelData(channel, account = null) {
    try {
      const cacheKey = `channel:${channel.id}`;
      const channelData = {
        ...channel.toJSON(),
        ...(account && { account: account.toJSON() })
      };

      await redisUtils.set(cacheKey, channelData, 3600); // Cache for 1 hour

    } catch (error) {
      logger.error('Error caching channel data:', error);
    }
  }

  async removeCachedChannelData(channelId) {
    try {
      const cacheKey = `channel:${channelId}`;
      await redisUtils.del(cacheKey);

    } catch (error) {
      logger.error('Error removing cached channel data:', error);
    }
  }

  async notifyChannelUpdate(action, channel) {
    try {
      const notification = {
        type: 'channel_update',
        action,
        channel: channel.toJSON(),
        timestamp: new Date()
      };

      await redisUtils.publish(CHANNELS.CHANNEL_UPDATE, notification);

    } catch (error) {
      logger.error('Error notifying channel update:', error);
    }
  }

  async getChannelStats() {
    try {
      const totalChannels = await Channel.findAll();
      const activeChannels = await Channel.findAll({ isActive: true });
      const pausedChannels = await Channel.findAll({ isPaused: true });

      let totalBalance = 0;
      let totalPnl = 0;
      let totalPositions = 0;

      for (const channel of activeChannels) {
        try {
          const account = await Account.findByChannelId(channel.id);
          if (account) {
            const accountInfo = await this.bingxService.getAccountInfo(account.bingxSubAccountId);
            totalBalance += accountInfo.balance || 0;
            totalPnl += accountInfo.unrealizedPnl || 0;
          }

          const openPositions = await channel.getPositions('open');
          totalPositions += openPositions.length;

        } catch (error) {
          logger.warn(`Error getting stats for channel ${channel.name}:`, error.message);
        }
      }

      return {
        totalChannels: totalChannels.length,
        activeChannels: activeChannels.length,
        pausedChannels: pausedChannels.length,
        inactiveChannels: totalChannels.length - activeChannels.length,
        totalBalance,
        totalPnl,
        totalPositions
      };

    } catch (error) {
      logger.error('Error getting channel stats:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      initialized: this.initialized,
      telegramServiceConnected: this.telegramService.isConnected,
      bingxServiceInitialized: this.bingxService.initialized
    };
  }

  async shutdown() {
    try {
      logger.info('Shutting down channel service...');
      
      this.initialized = false;
      
      logger.info('Channel service shutdown complete');
      
    } catch (error) {
      logger.error('Error during channel service shutdown:', error);
    }
  }
}

module.exports = ChannelService;
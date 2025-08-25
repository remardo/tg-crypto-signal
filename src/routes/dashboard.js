const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const {
  validateTimeRange,
  validateUuidParam,
  sanitizeRequest
} = require('../middleware/validation');
const { logger } = require('../utils/logger');

// Get dashboard stats
router.get('/stats',
  asyncHandler(async (req, res) => {
    try {
      const channelService = req.app.locals.services.channel;
      const positionService = req.app.locals.services.position;

      // Default stats structure
      let stats = {
        totalChannels: 0,
        signalsToday: 0,
        openPositions: 0,
        totalPnl: 0
      };

      try {
        // Try to get real stats if services are available
        if (channelService && channelService.getChannelStats) {
          logger.info('Calling channelService.getChannelStats()');
          const channelStats = await channelService.getChannelStats();
          logger.info('Channel stats result:', channelStats);
          stats.totalChannels = channelStats.totalChannels || 0;
        } else {
          logger.info('ChannelService not available, using fallback');
          // Fallback to direct channel count
          const Channel = require('../models/Channel');
          const channels = await Channel.findAll();
          logger.info('Direct channel count:', channels.length);
          stats.totalChannels = channels.length;
        }

        if (positionService && positionService.getPositionStatistics) {
          const positionStats = await positionService.getPositionStatistics({}, '24h');
          stats.openPositions = positionStats.open || 0;
          stats.totalPnl = positionStats.totalPnL || 0;
        }

        // Get signals count (simplified for now)
        stats.signalsToday = 0; // Will be updated when signal service is available

      } catch (serviceError) {
        logger.warn('Some services not available for stats:', serviceError.message);
        // Return default stats if services are not ready
      }

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Failed to get dashboard stats:', error);
      res.json({
        success: true,
        data: {
          totalChannels: 0,
          signalsToday: 0,
          openPositions: 0,
          totalPnl: 0
        }
      });
    }
  })
);

// Get system status
router.get('/system-status',
  asyncHandler(async (req, res) => {
    try {
      const services = req.app.locals.services;
      
      const systemStatus = {
        telegram: { active: false },
        redis: { active: false },
        postgres: { active: false },
        bingx: { active: false }
      };

      // Check service status if available
      if (services) {
        try {
          // Check Telegram service
          if (services.telegram && services.telegram.getStatus) {
            const telegramStatus = services.telegram.getStatus();
            systemStatus.telegram.active = telegramStatus.isConnected || false;
          }

          // Check Redis connection
          try {
            const { redisUtils } = require('../config/redis');
            await redisUtils.ping();
            systemStatus.redis.active = true;
          } catch (redisError) {
            logger.warn('Redis connection check failed:', redisError.message);
            systemStatus.redis.active = false;
          }

          // Check PostgreSQL via database connection
          try {
            const { Pool } = require('pg');
            const pool = new Pool({
              host: process.env.DB_HOST || 'localhost',
              port: process.env.DB_PORT || 5432,
              database: process.env.DB_NAME || 'tg_crypto_signal',
              user: process.env.DB_USER || 'postgres',
              password: process.env.DB_PASSWORD || 'postgres'
            });
            const client = await pool.connect();
            await client.query('SELECT 1');
            client.release();
            await pool.end();
            systemStatus.postgres.active = true;
          } catch (dbError) {
            logger.warn('PostgreSQL connection check failed:', dbError.message);
            systemStatus.postgres.active = false;
          }

          // Check BingX API through execution service
          if (services.execution && services.execution.bingx) {
            try {
              const bingxStatus = services.execution.bingx.getStatus();
              systemStatus.bingx.active = bingxStatus.initialized && bingxStatus.hasCredentials;
            } catch (bingxError) {
              logger.warn('BingX status check failed:', bingxError.message);
              systemStatus.bingx.active = false;
            }
          }

        } catch (serviceError) {
          logger.warn('Error checking service status:', serviceError.message);
        }
      }

      res.json({
        success: true,
        data: systemStatus
      });
    } catch (error) {
      logger.error('Failed to get system status:', error);
      res.json({
        success: true,
        data: {
          telegram: { active: false },
          redis: { active: false },
          postgres: { active: false },
          bingx: { active: false }
        }
      });
    }
  })
);

// Get dashboard overview
router.get('/overview',
  validateTimeRange,
  asyncHandler(async (req, res) => {
    const { timeRange: period = '24h' } = req.query;
    
    const channelService = req.app.locals.services.channel;
    const positionService = req.app.locals.services.position;

    // Get parallel data
    const [
      channelStats,
      positionStats,
      activePositions,
      recentSignals
    ] = await Promise.all([
      channelService.getChannelStats(),
      positionService.getPositionStats(null, period),
      positionService.getActivePositionsSummary({}),
      channelService.getRecentSignals ? channelService.getRecentSignals(10) : Promise.resolve([])
    ]);

    const overview = {
      period,
      timestamp: new Date().toISOString(),
      channels: {
        total: channelStats.totalChannels || 0,
        active: channelStats.activeChannels || 0,
        paused: channelStats.pausedChannels || 0
      },
      positions: {
        total: positionStats.total,
        open: activePositions.count,
        totalPnL: positionStats.totalPnL,
        totalVolume: positionStats.totalVolume,
        winRate: positionStats.winRate
      },
      trading: {
        activePositions: activePositions.count,
        totalExposure: activePositions.totalExposure,
        unrealizedPnL: activePositions.unrealizedPnL,
        topPerformers: activePositions.topPerformers || [],
        worstPerformers: activePositions.worstPerformers || []
      },
      signals: {
        recent: recentSignals.length,
        processed: recentSignals.filter(s => s.status === 'executed').length,
        pending: recentSignals.filter(s => s.status === 'pending').length,
        failed: recentSignals.filter(s => s.status === 'failed').length
      }
    };

    res.json({
      success: true,
      data: overview
    });
  })
);

// Get performance metrics
router.get('/performance',
  validateTimeRange,
  asyncHandler(async (req, res) => {
    const { timeRange: period = '7d', channelId } = req.query;
    
    const filters = {};
    if (channelId) filters.channel_id = channelId;

    const positionService = req.app.locals.services.position;
    const channelService = req.app.locals.services.channel;

    const [
      performanceStats,
      pnlTimeline,
      topChannels
    ] = await Promise.all([
      positionService.getPerformanceMetrics(filters, period),
      positionService.getPnLTimeline(filters, period),
      channelService.getTopPerformingChannels ? channelService.getTopPerformingChannels(period, 5) : Promise.resolve([])
    ]);

    res.json({
      success: true,
      data: {
        period,
        metrics: performanceStats,
        timeline: pnlTimeline,
        topChannels: topChannels || []
      }
    });
  })
);

// Get system status
router.get('/status',
  asyncHandler(async (req, res) => {
    const services = req.app.locals.services;
    
    const systemStatus = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        telegram: services.telegram?.getStatus() || { status: 'not initialized' },
        signalFeed: services.signalFeed?.getServiceStatus() || { status: 'not initialized' },
        execution: services.execution?.getExecutionStats() || { status: 'not initialized' },
        channel: services.channel?.getStatus() || { status: 'not initialized' },
        position: services.position?.getServiceStatus() || { status: 'not initialized' }
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024)
      },
      cpu: process.cpuUsage()
    };

    // Determine overall health
    const serviceStatuses = Object.values(systemStatus.services);
    const healthyServices = serviceStatuses.filter(s => s.status === 'running' || s.status === 'active').length;
    const totalServices = serviceStatuses.length;
    
    systemStatus.health = {
      status: healthyServices === totalServices ? 'healthy' : 
              healthyServices > totalServices / 2 ? 'degraded' : 'unhealthy',
      score: Math.round((healthyServices / totalServices) * 100)
    };

    res.json({
      success: true,
      data: systemStatus
    });
  })
);

// Get trading activity
router.get('/activity',
  asyncHandler(async (req, res) => {
    const { period = '24h', limit = 20 } = req.query;
    
    const channelService = req.app.locals.services.channel;
    const positionService = req.app.locals.services.position;

    const [
      recentSignals,
      recentTrades,
      positionUpdates
    ] = await Promise.all([
      channelService.getRecentSignals ? channelService.getRecentSignals(parseInt(limit), period) : Promise.resolve([]),
      positionService.getRecentTrades(parseInt(limit), period),
      positionService.getRecentPositionUpdates(parseInt(limit), period)
    ]);

    // Combine and sort by timestamp
    const allActivity = [
      ...recentSignals.map(s => ({ ...s, type: 'signal' })),
      ...recentTrades.map(t => ({ ...t, type: 'trade' })),
      ...positionUpdates.map(p => ({ ...p, type: 'position_update' }))
    ].sort((a, b) => new Date(b.timestamp || b.created_at) - new Date(a.timestamp || a.created_at))
     .slice(0, parseInt(limit));

    res.json({
      success: true,
      data: {
        period,
        activity: allActivity,
        summary: {
          signals: recentSignals.length,
          trades: recentTrades.length,
          updates: positionUpdates.length,
          total: allActivity.length
        }
      }
    });
  })
);

// Get P&L by channel
router.get('/pnl-by-channel',
  asyncHandler(async (req, res) => {
    try {
      const positionService = req.app.locals.services.position;
      
      if (!positionService || !positionService.getPnLByChannel) {
        return res.json({
          success: true,
          data: []
        });
      }

      const pnlByChannel = await positionService.getPnLByChannel();
      
      res.json({
        success: true,
        data: pnlByChannel
      });
    } catch (error) {
      logger.error('Failed to get P&L by channel:', error);
      res.json({
        success: true,
        data: []
      });
    }
  })
);

module.exports = router;
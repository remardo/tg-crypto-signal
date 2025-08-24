const express = require('express');
const router = express.Router();
const { asyncHandler, NotFoundError } = require('../middleware/errorHandler');
const {
  validateChannelCreate,
  validateChannelUpdate,
  validateChannelTransfer,
  validateUuidParam,
  sanitizeRequest
} = require('../middleware/validation');
const Channel = require('../models/Channel');

// GET /api/channels - Get all channels
router.get('/', asyncHandler(async (req, res) => {
  const channelService = req.app.locals.services.channel;
  const { includeInactive = false } = req.query;
  
  const channels = await channelService.getAllChannels(includeInactive === 'true');
  
  res.json({
    success: true,
    data: {
      channels,
      total: channels.length
    }
  });
}));

// GET /api/channels/stats - Get channel statistics
router.get('/stats', asyncHandler(async (req, res) => {
  const channelService = req.app.locals.services.channel;
  
  const stats = await channelService.getChannelStats();
  
  res.json({
    success: true,
    data: stats
  });
}));

// POST /api/channels - Create new channel
router.post('/', 
  sanitizeRequest,
  validateChannelCreate,
  asyncHandler(async (req, res) => {
    const channelService = req.app.locals.services.channel;
    
    const result = await channelService.addChannel(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Channel created successfully',
      data: result
    });
  })
);

// GET /api/channels/:id - Get channel details
router.get('/:id',
  validateUuidParam('id'),
  asyncHandler(async (req, res) => {
    const channelService = req.app.locals.services.channel;
    
    const channelDetails = await channelService.getChannelDetails(req.params.id);
    
    if (!channelDetails.channel) {
      throw new NotFoundError('Channel');
    }
    
    res.json({
      success: true,
      data: channelDetails
    });
  })
);

// PUT /api/channels/:id - Update channel settings
router.put('/:id',
  validateUuidParam('id'),
  sanitizeRequest,
  validateChannelUpdate,
  asyncHandler(async (req, res) => {
    const channelService = req.app.locals.services.channel;
    
    const updatedChannel = await channelService.updateChannelSettings(req.params.id, req.body);
    
    res.json({
      success: true,
      message: 'Channel updated successfully',
      data: updatedChannel
    });
  })
);

// DELETE /api/channels/:id - Remove channel
router.delete('/:id',
  validateUuidParam('id'),
  asyncHandler(async (req, res) => {
    const channelService = req.app.locals.services.channel;
    
    const result = await channelService.removeChannel(req.params.id);
    
    res.json({
      success: true,
      message: 'Channel removed successfully',
      data: result
    });
  })
);

// POST /api/channels/:id/pause - Pause channel
router.post('/:id/pause',
  validateUuidParam('id'),
  asyncHandler(async (req, res) => {
    const channelService = req.app.locals.services.channel;
    
    const channel = await channelService.pauseChannel(req.params.id);
    
    res.json({
      success: true,
      message: 'Channel paused successfully',
      data: channel
    });
  })
);

// POST /api/channels/:id/resume - Resume channel
router.post('/:id/resume',
  validateUuidParam('id'),
  asyncHandler(async (req, res) => {
    const channelService = req.app.locals.services.channel;
    
    const channel = await channelService.resumeChannel(req.params.id);
    
    res.json({
      success: true,
      message: 'Channel resumed successfully',
      data: channel
    });
  })
);

// POST /api/channels/:id/transfer - Transfer funds to channel
router.post('/:id/transfer',
  validateUuidParam('id'),
  sanitizeRequest,
  validateChannelTransfer,
  asyncHandler(async (req, res) => {
    const channelService = req.app.locals.services.channel;
    
    const result = await channelService.transferToChannel(
      req.params.id,
      req.body.amount,
      req.body.asset
    );
    
    res.json({
      success: true,
      message: 'Transfer completed successfully',
      data: result
    });
  })
);

// POST /api/channels/:id/withdraw - Withdraw funds from channel
router.post('/:id/withdraw',
  validateUuidParam('id'),
  sanitizeRequest,
  validateChannelTransfer,
  asyncHandler(async (req, res) => {
    const channelService = req.app.locals.services.channel;
    
    const result = await channelService.withdrawFromChannel(
      req.params.id,
      req.body.amount,
      req.body.asset
    );
    
    res.json({
      success: true,
      message: 'Withdrawal completed successfully',
      data: result
    });
  })
);

// GET /api/channels/:id/signals - Get channel signals
router.get('/:id/signals',
  validateUuidParam('id'),
  asyncHandler(async (req, res) => {
    const Channel = require('../models/Channel');
    const { limit = 50, offset = 0 } = req.query;
    
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      throw new NotFoundError('Channel');
    }
    
    const signals = await channel.getSignals(parseInt(limit), parseInt(offset));
    
    res.json({
      success: true,
      data: {
        signals,
        total: signals.length,
        channelName: channel.name
      }
    });
  })
);

// GET /api/channels/:id/positions - Get channel positions
router.get('/:id/positions',
  validateUuidParam('id'),
  asyncHandler(async (req, res) => {
    const positionService = req.app.locals.services.position;
    const { status } = req.query;
    
    const positions = await positionService.getPositionsByChannel(req.params.id, status);
    
    res.json({
      success: true,
      data: {
        positions,
        total: positions.length
      }
    });
  })
);

// GET /api/channels/:id/stats - Get channel statistics
router.get('/:id/stats',
  validateUuidParam('id'),
  asyncHandler(async (req, res) => {
    const Channel = require('../models/Channel');
    const { timeRange = '24h' } = req.query;
    
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      throw new NotFoundError('Channel');
    }
    
    const stats = await channel.getStats();
    
    // Get signal stats for this channel
    const signalFeedService = req.app.locals.services.signalFeed;
    const signalStats = await signalFeedService.getSignalStats(req.params.id, timeRange);
    
    // Get position stats for this channel
    const positionService = req.app.locals.services.position;
    const positionStats = await positionService.getPositionStats(req.params.id, timeRange);
    
    res.json({
      success: true,
      data: {
        channel: stats,
        signals: signalStats,
        positions: positionStats,
        timeRange
      }
    });
  })
);

// POST /api/channels/refresh-balances - Refresh all channel balances
router.post('/refresh-balances',
  asyncHandler(async (req, res) => {
    const channelService = req.app.locals.services.channel;
    
    const updates = await channelService.refreshChannelBalances();
    
    res.json({
      success: true,
      message: 'Channel balances refreshed successfully',
      data: {
        updates,
        count: updates.length
      }
    });
  })
);

// Test telegram bot connection to channel
router.get('/:id/test-telegram',
  validateUuidParam('id'),
  asyncHandler(async (req, res) => {
    const channelId = req.params.id;
    
    const channel = await Channel.findById(channelId);
    if (!channel) {
      throw new NotFoundError('Channel');
    }
    
    const telegramService = req.app.locals.services.telegram;
    
    try {
      // Check if bot can get channel info
      const channelInfo = await telegramService.getChannelInfo(channel.telegramChannelId);
      
      res.json({
        success: true,
        data: {
          canAccess: true,
          channelInfo,
          botStatus: telegramService.getStatus()
        },
        message: 'Bot can access channel'
      });
      
    } catch (error) {
      res.json({
        success: false,
        data: {
          canAccess: false,
          error: error.message,
          botStatus: telegramService.getStatus()
        },
        message: 'Bot cannot access channel'
      });
    }
  })
);

module.exports = router;
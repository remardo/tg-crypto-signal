const express = require('express');
const router = express.Router();
const { asyncHandler, NotFoundError } = require('../middleware/errorHandler');
const {
  validateSignalExecute,
  validateSignalQuery,
  validateSignalIgnore,
  validateUuidParam,
  sanitizeRequest
} = require('../middleware/validation');

// GET /api/signals - Get signal feed
router.get('/',
  validateSignalQuery,
  asyncHandler(async (req, res) => {
    const signalFeedService = req.app.locals.services.signalFeed;
    
    const result = await signalFeedService.getSignalFeed(req.query);
    
    res.json({
      success: true,
      data: result
    });
  })
);

// GET /api/signals/pending - Get pending signals
router.get('/pending',
  asyncHandler(async (req, res) => {
    const signalFeedService = req.app.locals.services.signalFeed;
    const { channelId } = req.query;
    
    const signals = await signalFeedService.getPendingSignals(channelId);
    
    res.json({
      success: true,
      data: {
        signals: signals.map(s => s.toJSON()),
        total: signals.length
      }
    });
  })
);

// GET /api/signals/stats - Get signal statistics
router.get('/stats',
  asyncHandler(async (req, res) => {
    const signalFeedService = req.app.locals.services.signalFeed;
    const { channelId, timeRange = '24h' } = req.query;
    
    const stats = await signalFeedService.getSignalStats(channelId, timeRange);
    
    res.json({
      success: true,
      data: stats
    });
  })
);

// GET /api/signals/service-status - Get signal processing service status
router.get('/service-status',
  asyncHandler(async (req, res) => {
    const signalFeedService = req.app.locals.services.signalFeed;
    
    const status = await signalFeedService.getServiceStatus();
    
    res.json({
      success: true,
      data: status
    });
  })
);

// POST /api/signals/test-recognition - Test signal recognition
router.post('/test-recognition',
  sanitizeRequest,
  asyncHandler(async (req, res) => {
    const { SignalRecognitionService } = require('../services/signalRecognitionService');
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Message text is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }
    
    const recognitionService = new SignalRecognitionService();
    await recognitionService.initialize();
    
    const result = await recognitionService.testSignalRecognition(message);
    
    res.json({
      success: true,
      data: result
    });
  })
);

// GET /api/signals/:id - Get signal details
router.get('/:id',
  validateUuidParam('id'),
  asyncHandler(async (req, res) => {
    const Signal = require('../models/Signal');
    
    const signal = await Signal.findById(req.params.id);
    
    if (!signal) {
      throw new NotFoundError('Signal');
    }
    
    // Get associated position if executed
    const position = await signal.getPosition();
    
    res.json({
      success: true,
      data: {
        signal: signal.toJSON(),
        position: position || null
      }
    });
  })
);

// POST /api/signals/:id/approve - Approve pending signal
router.post('/:id/approve',
  validateUuidParam('id'),
  asyncHandler(async (req, res) => {
    const signalFeedService = req.app.locals.services.signalFeed;
    const { userId } = req.body; // In a real app, this would come from auth middleware
    
    const signal = await signalFeedService.approveSignal(req.params.id, userId);
    
    res.json({
      success: true,
      message: 'Signal approved successfully',
      data: signal.toJSON()
    });
  })
);

// POST /api/signals/:id/ignore - Ignore signal
router.post('/:id/ignore',
  validateUuidParam('id'),
  sanitizeRequest,
  validateSignalIgnore,
  asyncHandler(async (req, res) => {
    const signalFeedService = req.app.locals.services.signalFeed;
    const { reason } = req.body;
    const { userId } = req.body; // In a real app, this would come from auth middleware
    
    const signal = await signalFeedService.ignoreSignal(req.params.id, reason, userId);
    
    res.json({
      success: true,
      message: 'Signal ignored successfully',
      data: signal.toJSON()
    });
  })
);

// POST /api/signals/:id/execute - Execute signal manually
router.post('/:id/execute',
  validateUuidParam('id'),
  sanitizeRequest,
  validateSignalExecute,
  asyncHandler(async (req, res) => {
    const executionService = req.app.locals.services.execution;
    
    const result = await executionService.executeSignalManually(req.params.id, req.body);
    
    res.json({
      success: true,
      message: 'Signal execution queued successfully',
      data: result
    });
  })
);

// GET /api/signals/types/:type - Get signals by type
router.get('/types/:type',
  asyncHandler(async (req, res) => {
    const Signal = require('../models/Signal');
    const { type } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const validTypes = ['entry', 'update', 'close', 'general'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid signal type. Must be one of: ${validTypes.join(', ')}`,
          code: 'VALIDATION_ERROR'
        }
      });
    }
    
    const filters = {
      signalType: type,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
    
    const signals = await Signal.findAll(filters);
    
    res.json({
      success: true,
      data: {
        signals: signals.map(s => s.toJSON()),
        total: signals.length,
        type
      }
    });
  })
);

// GET /api/signals/coin/:coin - Get signals for specific coin
router.get('/coin/:coin',
  asyncHandler(async (req, res) => {
    const Signal = require('../models/Signal');
    const { coin } = req.params;
    const { limit = 50, offset = 0, status } = req.query;
    
    const filters = {
      coin: coin.toUpperCase(),
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
    
    if (status) {
      filters.status = status;
    }
    
    const signals = await Signal.findAll(filters);
    
    res.json({
      success: true,
      data: {
        signals: signals.map(s => s.toJSON()),
        total: signals.length,
        coin: coin.toUpperCase()
      }
    });
  })
);

// POST /api/signals/retry-failed - Retry failed signal processing
router.post('/retry-failed',
  asyncHandler(async (req, res) => {
    const signalFeedService = req.app.locals.services.signalFeed;
    const { limit = 10 } = req.body;
    
    const result = await signalFeedService.retryFailedMessages(limit);
    
    res.json({
      success: true,
      message: 'Failed signals retry completed',
      data: result
    });
  })
);

// DELETE /api/signals/clear-queue - Clear message processing queue (admin only)
router.delete('/clear-queue',
  asyncHandler(async (req, res) => {
    const telegramService = req.app.locals.services.telegram;
    
    const result = await telegramService.clearQueue();
    
    res.json({
      success: true,
      message: 'Message queue cleared successfully',
      data: { cleared: result }
    });
  })
);

// GET /api/signals/queue/status - Get queue status
router.get('/queue/status',
  asyncHandler(async (req, res) => {
    const telegramService = req.app.locals.services.telegram;
    const signalFeedService = req.app.locals.services.signalFeed;
    
    const telegramStatus = telegramService.getStatus();
    const signalFeedStatus = await signalFeedService.getServiceStatus();
    
    res.json({
      success: true,
      data: {
        telegram: telegramStatus,
        signalFeed: signalFeedStatus
      }
    });
  })
);

// GET /api/signals/recent/:hours - Get recent signals from last N hours
router.get('/recent/:hours',
  asyncHandler(async (req, res) => {
    const { hours } = req.params;
    const { channelId } = req.query;
    
    const hoursNum = parseInt(hours);
    if (isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 168) { // Max 1 week
      return res.status(400).json({
        success: false,
        error: {
          message: 'Hours must be a positive number between 1 and 168',
          code: 'VALIDATION_ERROR'
        }
      });
    }
    
    let signals;
    if (channelId) {
      const Signal = require('../models/Signal');
      signals = await Signal.getRecentByChannel(channelId, hoursNum);
    } else {
      const signalFeedService = req.app.locals.services.signalFeed;
      const result = await signalFeedService.getSignalFeed({
        limit: 100
      });
      signals = result.signals;
    }
    
    res.json({
      success: true,
      data: {
        signals: Array.isArray(signals) ? signals.map(s => s.toJSON ? s.toJSON() : s) : signals,
        hours: hoursNum,
        channelId: channelId || null
      }
    });
  })
);

// POST /api/signals/cleanup - Cleanup old signals
router.post('/cleanup',
  sanitizeRequest,
  asyncHandler(async (req, res) => {
    const signalFeedService = req.app.locals.services.signalFeed;

    const {
      olderThanDays = 30,
      status = null,
      keepRecent = 1000
    } = req.body;

    // Validate input
    if (olderThanDays < 1 || olderThanDays > 365) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'olderThanDays must be between 1 and 365'
        }
      });
    }

    if (keepRecent < 0 || keepRecent > 10000) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'keepRecent must be between 0 and 10000'
        }
      });
    }

    const result = await signalFeedService.cleanupOldSignals({
      olderThanDays,
      status,
      keepRecent
    });

    res.json({
      success: true,
      message: `Cleanup completed: ${result.deleted} signals deleted, ${result.kept} signals kept`,
      data: result
    });
  })
);

module.exports = router;
const express = require('express');
const router = express.Router();
const { asyncHandler, NotFoundError } = require('../middleware/errorHandler');
const {
  validatePositionQuery,
  validatePositionClose,
  validatePositionModify,
  validateUuidParam,
  sanitizeRequest
} = require('../middleware/validation');
const { logger } = require('../utils/logger');

// Get all positions
router.get('/', 
  validatePositionQuery,
  asyncHandler(async (req, res) => {
    const { channelId, symbol, status, limit, offset } = req.query;
    
    const filters = {};
    if (channelId) filters.channel_id = channelId;
    if (symbol) filters.symbol = symbol;
    if (status) filters.status = status;

    const positionService = req.app.locals.services.position;
    const result = await positionService.getAllPositions({ ...filters, limit, offset });

    res.json({
      success: true,
      data: result.positions,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: (offset + limit) < result.total
      }
    });
  })
);

// Get position by ID
router.get('/:id',
  validateUuidParam('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const positionService = req.app.locals.services.position;
    const position = await positionService.getPositionById(id);

    if (!position) {
      throw new NotFoundError('Position');
    }

    res.json({
      success: true,
      data: position
    });
  })
);

// Update position
router.put('/:id',
  validateUuidParam('id'),
  sanitizeRequest,
  validatePositionModify,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const positionService = req.app.locals.services.position;
    const updatedPosition = await positionService.updatePosition(id, updates);

    if (!updatedPosition) {
      throw new NotFoundError('Position');
    }

    logger.info(`Position ${id} updated successfully`, { updates });

    res.json({
      success: true,
      data: updatedPosition,
      message: 'Position updated successfully'
    });
  })
);

// Close position
router.post('/:id/close',
  validateUuidParam('id'),
  sanitizeRequest,
  validatePositionClose,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { percentage = 1, reason = 'Manual close' } = req.body;

    const positionService = req.app.locals.services.position;
    const result = await positionService.closePosition(id, percentage * 100, reason);

    logger.info(`Position ${id} close initiated`, { percentage, reason });

    res.json({
      success: true,
      data: result,
      message: `Position close order placed (${percentage * 100}%)`
    });
  })
);

// Get position statistics
router.get('/stats/summary',
  validatePositionQuery,
  asyncHandler(async (req, res) => {
    const { channelId, symbol } = req.query;
    const period = req.query.timeRange || '24h';
    
    const filters = {};
    if (channelId) filters.channel_id = channelId;
    if (symbol) filters.symbol = symbol;

    const positionService = req.app.locals.services.position;
    const stats = await positionService.getPositionStatistics(filters, period);

    res.json({
      success: true,
      data: stats
    });
  })
);

// Get position PnL history
router.get('/:id/pnl-history',
  validateUuidParam('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { interval = '1h' } = req.query;

    const positionService = req.app.locals.services.position;
    const history = await positionService.getPositionPnLHistory(id, interval);

    res.json({
      success: true,
      data: history
    });
  })
);

// Get active positions summary
router.get('/active/summary',
  validatePositionQuery,
  asyncHandler(async (req, res) => {
    const { channelId } = req.query;
    
    const filters = { status: 'open' };
    if (channelId) filters.channel_id = channelId;

    const positionService = req.app.locals.services.position;
    const summary = await positionService.getActivePositionsSummary(filters);

    res.json({
      success: true,
      data: summary
    });
  })
);

module.exports = router;
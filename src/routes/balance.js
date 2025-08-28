const express = require('express');
const router = express.Router();

// Simple test route
router.get('/test', (req, res) => {
  res.json({ message: 'Balance route is working!' });
});

// GET /api/balance - Get BingX account balance (futures + spot)
router.get('/', async (req, res) => {
  try {
    const execService = req.app?.locals?.services?.execution;
    let bingxService = execService?.bingx;

    if (!bingxService) {
      // Fallback: create a temporary instance if execution service isn't available
      const BingXService = require('../services/bingxService');
      bingxService = new BingXService();
      if (!bingxService.initialized) {
        await bingxService.initialize();
      }
    }

    // Fetch balances
    const [futures, spot] = await Promise.all([
      bingxService.getAccountInfo(),
      bingxService.getSpotBalance().catch(() => ({ asset: 'USDT', free: 0, locked: 0, total: 0 }))
    ]);

    res.json({
      success: true,
      data: {
        futures,
        spot,
        timestamp: new Date().toISOString()
      },
      message: 'Balance retrieved successfully'
    });
  } catch (error) {
    console.error('Error retrieving BingX balance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve balance',
      message: error.message
    });
  }
});

module.exports = router;

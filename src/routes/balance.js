const express = require('express');
const router = express.Router();

// Simple test route
router.get('/test', (req, res) => {
  res.json({ message: 'Balance route is working!' });
});

// Helper to build a standard balance response with real BingX data
async function buildBalanceResponse(services) {
  try {
    // Get BingX service from app locals
    const bingxService = services?.execution?.bingx;
    
    if (!bingxService) {
      throw new Error('BingX service not available');
    }

    // Get real account info from BingX
    const accountInfo = await bingxService.getAccountInfo();
    
    return {
      success: true,
      data: {
        futures: { 
          balance: accountInfo.balance || 0, 
          availableBalance: accountInfo.availableBalance || 0,
          equity: accountInfo.equity || 0,
          unrealizedPnl: accountInfo.unrealizedPnl || 0,
          marginUsed: accountInfo.marginUsed || 0,
          marginRatio: accountInfo.marginRatio || 0
        },
        spot: { balance: 0, availableBalance: 0 }, // BingX doesn't have spot trading in this context
        timestamp: new Date().toISOString()
      },
      message: 'Balance retrieved successfully'
    };
  } catch (error) {
    console.error('Error getting real balance:', error);
    // Fallback to stubbed response
    return {
      success: true,
      data: {
        futures: { balance: 0, availableBalance: 0 },
        spot: { balance: 0, availableBalance: 0 },
        timestamp: new Date().toISOString()
      },
      message: 'Balance retrieved (fallback)',
      error: error.message
    };
  }
}

// Root: GET /api/balance
router.get('/', async (req, res) => {
  try {
    console.log('Balance root endpoint called');
    const services = req.app.locals.services;
    const response = await buildBalanceResponse(services);
    res.json(response);
  } catch (error) {
    console.error('Error retrieving BingX balance (root):', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve balance',
      message: error.message
    });
  }
});

// Get BingX account balance
router.get('/balance', async (req, res) => {
  try {
    console.log('Balance endpoint called');
    const services = req.app.locals.services;
    const response = await buildBalanceResponse(services);
    res.json(response);
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

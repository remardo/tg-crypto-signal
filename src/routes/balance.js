const express = require('express');
const router = express.Router();

// Simple test route
router.get('/test', (req, res) => {
  res.json({ message: 'Balance route is working!' });
});

// Helper to build a standard balance response (stubbed for now)
function buildBalanceResponse() {
  return {
    success: true,
    data: {
      futures: { balance: 0, availableBalance: 0 },
      spot: { balance: 0, availableBalance: 0 },
      timestamp: new Date().toISOString()
    },
    message: 'Balance retrieved successfully'
  };
}

// Root: GET /api/balance
router.get('/', async (req, res) => {
  try {
    console.log('Balance root endpoint called');
    res.json(buildBalanceResponse());
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
    res.json(buildBalanceResponse());
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

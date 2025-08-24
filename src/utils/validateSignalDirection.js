/**
 * Signal Direction Fix System
 * 
 * This script implements a fix for signals that are incorrectly recognized as LONG or SHORT.
 * It validates the take profit and stop loss levels against the entry price to determine
 * the correct direction.
 */
const { logger } = require('./logger');

async function validateSignalDirection(signal) {
  // Basic validation
  if (!signal || !signal.coin || !signal.direction || !signal.entryPrice) {
    logger.warn('Invalid signal data for direction validation', { signal });
    return signal;
  }
  
  // Get references to key values
  const originalDirection = signal.direction;
  const entryPrice = parseFloat(signal.entryPrice);
  
  // Create counters for direction evidence
  let longEvidence = 0;
  let shortEvidence = 0;
  
  // Check take profit levels
  if (signal.takeProfitLevels && signal.takeProfitLevels.length > 0) {
    signal.takeProfitLevels.forEach(tp => {
      const tpPrice = typeof tp === 'object' ? parseFloat(tp.price) : parseFloat(tp);
      
      // TP above entry suggests LONG, below suggests SHORT
      if (tpPrice > entryPrice) {
        longEvidence++;
      } else if (tpPrice < entryPrice) {
        shortEvidence++;
      }
    });
  }
  
  // Check stop loss
  if (signal.stopLoss) {
    const slPrice = parseFloat(signal.stopLoss);
    
    // SL below entry suggests LONG, above suggests SHORT
    if (slPrice < entryPrice) {
      longEvidence += 2; // Give SL more weight
    } else if (slPrice > entryPrice) {
      shortEvidence += 2; // Give SL more weight
    }
  }
  
  // Determine likely correct direction
  let correctedDirection = originalDirection;
  
  // Clear winner based on evidence
  if (longEvidence > shortEvidence && originalDirection !== 'LONG') {
    correctedDirection = 'LONG';
    logger.warn(`Direction corrected from ${originalDirection} to LONG based on price levels`, {
      coin: signal.coin,
      entryPrice,
      takeProfitLevels: signal.takeProfitLevels,
      stopLoss: signal.stopLoss,
      longEvidence,
      shortEvidence
    });
  } else if (shortEvidence > longEvidence && originalDirection !== 'SHORT') {
    correctedDirection = 'SHORT';
    logger.warn(`Direction corrected from ${originalDirection} to SHORT based on price levels`, {
      coin: signal.coin,
      entryPrice,
      takeProfitLevels: signal.takeProfitLevels,
      stopLoss: signal.stopLoss,
      longEvidence,
      shortEvidence
    });
  }
  
  // Return corrected signal
  if (correctedDirection !== originalDirection) {
    // Create new signal object with corrected direction
    return {
      ...signal,
      direction: correctedDirection,
      originalDirection
    };
  }
  
  // No correction needed
  return signal;
}

// Export the validation function for use in the execution service
module.exports = validateSignalDirection;

// If running directly, test with sample data
if (require.main === module) {
  const testSignals = [
    {
      coin: 'USELESS',
      direction: 'LONG', // Incorrectly recognized as LONG
      entryPrice: 0.26,
      takeProfitLevels: [
        { price: 0.22, percentage: 33 },
        { price: 0.20, percentage: 33 },
        { price: 0.18, percentage: 34 }
      ],
      stopLoss: 0.30
    },
    {
      coin: 'BTC',
      direction: 'LONG', // Correctly recognized as LONG
      entryPrice: 60000,
      takeProfitLevels: [
        { price: 62000, percentage: 33 },
        { price: 64000, percentage: 33 },
        { price: 68000, percentage: 34 }
      ],
      stopLoss: 58000
    },
    {
      coin: 'ETH',
      direction: 'SHORT', // Incorrectly recognized as SHORT
      entryPrice: 2500,
      takeProfitLevels: [
        { price: 2700, percentage: 33 },
        { price: 2900, percentage: 33 },
        { price: 3100, percentage: 34 }
      ],
      stopLoss: 2300
    }
  ];
  
  // Test each signal
  testSignals.forEach(async (signal, i) => {
    console.log(`\n🧪 Testing Signal ${i + 1}: ${signal.coin} ${signal.direction}`);
    console.log(`Entry Price: ${signal.entryPrice}`);
    console.log('Take Profits:', signal.takeProfitLevels.map(tp => tp.price));
    console.log(`Stop Loss: ${signal.stopLoss}`);
    
    const correctedSignal = await validateSignalDirection(signal);
    
    if (correctedSignal.direction !== signal.direction) {
      console.log(`✅ CORRECTED: ${signal.direction} → ${correctedSignal.direction}`);
    } else {
      console.log(`✓ UNCHANGED: Direction ${signal.direction} is correct`);
    }
  });
}
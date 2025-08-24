const Position = require('./src/models/Position');
const BingXService = require('./src/services/bingxService');
const { logger } = require('./src/utils/logger');

async function cleanupStalePositions() {
  try {
    console.log('🧹 Cleaning up stale positions...\n');
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Get all open positions from database
    const dbPositions = await Position.findAll({ status: 'open' });
    console.log(`📊 Found ${dbPositions.length} open positions in database`);
    
    if (dbPositions.length === 0) {
      console.log('✅ No positions to check');
      return;
    }
    
    // Get all active positions from BingX
    const bingxPositions = await bingx.getPositions();
    console.log(`📊 Found ${bingxPositions.length} active positions on BingX\n`);
    
    let updatedCount = 0;
    
    for (const dbPosition of dbPositions) {
      console.log(`🔍 Checking position: ${dbPosition.symbol} (ID: ${dbPosition.id})`);
      console.log(`   Database: ${dbPosition.side} ${dbPosition.quantity} at ${dbPosition.entryPrice}`);
      
      // Look for matching position on BingX
      const bingxPosition = bingxPositions.find(bp => {
        // Handle different symbol formats
        const dbSymbol = dbPosition.symbol;
        const bxSymbol = bp.symbol;
        
        return (dbSymbol === bxSymbol || 
                dbSymbol === bxSymbol.replace('-', '') || 
                dbSymbol.replace('-', '') === bxSymbol) &&
               Math.abs(parseFloat(bp.positionAmt || bp.size || 0)) > 0;
      });
      
      if (bingxPosition) {
        console.log(`   ✅ Found on BingX: ${bingxPosition.positionSide || bingxPosition.side} ${Math.abs(parseFloat(bingxPosition.positionAmt || bingxPosition.size || 0))}`);
        console.log(`   💰 Unrealized PnL: ${bingxPosition.unRealizedProfit || bingxPosition.unrealizedPnl || 'N/A'}`);
      } else {
        console.log(`   ❌ NOT found on BingX - position likely closed/liquidated`);
        console.log(`   🔧 Updating database status to 'closed'...`);
        
        try {
          // Get current price for final calculation
          let currentPrice = dbPosition.entryPrice;
          try {
            const priceData = await bingx.getSymbolPrice(dbPosition.symbol);
            currentPrice = priceData.price;
          } catch (priceError) {
            console.log(`   ⚠️  Could not get current price, using entry price: ${priceError.message}`);
          }
          
          // Calculate final PnL (assuming position was closed at current market price)
          const finalPnl = dbPosition.calculateUnrealizedPnl(currentPrice);
          
          await dbPosition.close(currentPrice, finalPnl, 0);
          console.log(`   ✅ Position marked as closed`);
          console.log(`   💰 Final PnL: ${finalPnl.toFixed(4)} USDT`);
          updatedCount++;
          
        } catch (updateError) {
          console.log(`   ❌ Failed to update position: ${updateError.message}`);
        }
      }
      
      console.log(''); // Empty line for readability
    }
    
    console.log('📊 CLEANUP SUMMARY:');
    console.log(`✅ Total positions checked: ${dbPositions.length}`);
    console.log(`🔧 Positions updated: ${updatedCount}`);
    console.log(`🎯 Active positions remaining: ${dbPositions.length - updatedCount}`);
    
    if (updatedCount > 0) {
      console.log('\n🎉 Cleanup completed! Stale positions have been closed.');
      console.log('💡 This should stop the recurring "No position found" errors.');
    } else {
      console.log('\n✨ All database positions match BingX - no cleanup needed.');
    }
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
}

cleanupStalePositions();
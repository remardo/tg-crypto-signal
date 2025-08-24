const Position = require('./src/models/Position');
const Signal = require('./src/models/Signal');
const BingXService = require('./src/services/bingxService');
const { logger } = require('./src/utils/logger');

async function checkLatestPosition() {
  try {
    console.log('🔍 Checking Latest Position...\n');
    
    // Get the latest position
    const positions = await Position.findAll({ limit: 1 });
    
    if (positions.length === 0) {
      console.log('❌ No positions found in database');
      return;
    }
    
    const position = positions[0];
    
    console.log('📊 LATEST POSITION DETAILS:');
    console.log('=' .repeat(50));
    console.log('Position ID:', position.id);
    console.log('Signal ID:', position.signalId);
    console.log('Symbol:', position.symbol);
    console.log('Coin:', position.coin);
    console.log('Direction:', position.direction);
    console.log('Side:', position.side);
    console.log('Quantity:', position.quantity);
    console.log('Entry Price:', position.entryPrice, 'USDT');
    console.log('Current Price:', position.currentPrice || 'Not set');
    console.log('Leverage:', position.leverage + 'x');
    console.log('Status:', position.status);
    console.log('BingX Order ID:', position.bingxOrderId);
    console.log('Opened At:', position.openedAt);
    console.log('Closed At:', position.closedAt || 'Still open');
    
    console.log('\n💰 PnL INFORMATION:');
    console.log('Unrealized PnL:', parseFloat(position.unrealizedPnl || 0).toFixed(2), 'USDT');
    console.log('Realized PnL:', parseFloat(position.realizedPnl || 0).toFixed(2), 'USDT');
    console.log('Fees:', parseFloat(position.fees || 0).toFixed(2), 'USDT');
    console.log('ROI:', position.calculateROI().toFixed(2) + '%');
    console.log('Margin Used:', position.getMargin().toFixed(2), 'USDT');
    
    console.log('\n🎯 RISK MANAGEMENT:');
    console.log('Take Profit Levels:', position.takeProfitLevels?.join(', ') || 'None');
    console.log('Stop Loss:', position.stopLoss || 'None');
    console.log('TP Percentages:', position.tpPercentages?.join('%, ') + '%' || 'Default');
    
    // Get the related signal
    console.log('\n📡 RELATED SIGNAL:');
    const signal = await Signal.findById(position.signalId);
    if (signal) {
      console.log('Signal Status:', signal.status);
      console.log('Signal Created:', signal.createdAt);
      console.log('Signal Processed:', signal.processedAt || 'Not processed');
      console.log('Confidence Score:', signal.confidenceScore);
      console.log('Channel Name:', signal.channelName);
    }
    
    // Check current market price
    console.log('\n📈 CURRENT MARKET STATUS:');
    try {
      const bingx = new BingXService();
      await bingx.initialize();
      
      const currentPrice = await bingx.getSymbolPrice(position.symbol);
      console.log('Current Market Price:', currentPrice.price, 'USDT');
      
      if (position.entryPrice) {
        const priceDiff = currentPrice.price - position.entryPrice;
        const changePercent = (priceDiff / position.entryPrice) * 100;
        
        console.log('Price Change:', priceDiff.toFixed(6), 'USDT');
        console.log('Price Change %:', (changePercent > 0 ? '+' : '') + changePercent.toFixed(2) + '%');
        
        // Calculate current PnL
        const currentPnl = position.calculateUnrealizedPnl(currentPrice.price);
        console.log('Current Unrealized PnL:', currentPnl.toFixed(2), 'USDT');
        
        // Check if at take profit or stop loss levels
        const atTp = position.isAtTakeProfit(currentPrice.price);
        const atSl = position.isAtStopLoss(currentPrice.price);
        
        if (atTp) {
          console.log('🎯 AT TAKE PROFIT LEVEL', atTp.level + ':', atTp.price, 'USDT');
        }
        if (atSl) {
          console.log('🛑 AT STOP LOSS LEVEL:', position.stopLoss, 'USDT');
        }
      }
      
    } catch (priceError) {
      console.log('⚠️  Could not get current price:', priceError.message);
    }
    
    // Check position on BingX
    console.log('\n🔗 BINGX VERIFICATION:');
    try {
      const bingx = new BingXService();
      await bingx.initialize();
      
      const activePositions = await bingx.getPositions();
      const matchingPosition = activePositions.find(p => 
        p.symbol === position.symbol && 
        Math.abs(parseFloat(p.positionAmt)) > 0
      );
      
      if (matchingPosition) {
        console.log('✅ Position found on BingX:');
        console.log('  BingX Position Size:', matchingPosition.positionAmt);
        console.log('  BingX Entry Price:', matchingPosition.entryPrice);
        console.log('  BingX Mark Price:', matchingPosition.markPrice);
        console.log('  BingX Unrealized PnL:', matchingPosition.unRealizedProfit);
        console.log('  BingX Position Side:', matchingPosition.positionSide);
      } else {
        console.log('❌ No matching position found on BingX');
        console.log('💡 Position may have been closed or liquidated');
      }
      
    } catch (bingxError) {
      console.log('⚠️  Could not verify on BingX:', bingxError.message);
    }
    
    // Get position orders if any
    console.log('\n📋 POSITION ORDERS:');
    try {
      const orders = await position.getOrders();
      if (orders.length > 0) {
        console.log(`Found ${orders.length} orders:`);
        orders.forEach((order, index) => {
          console.log(`  Order ${index + 1}:`, order.order_type, order.side, order.quantity, 'at', order.price);
        });
      } else {
        console.log('No specific position orders found in database');
      }
    } catch (orderError) {
      console.log('⚠️  Could not get orders:', orderError.message);
    }
    
    console.log('\n📊 SUMMARY:');
    console.log('Position opened:', new Date(position.openedAt).toLocaleString());
    if (position.status === 'open') {
      console.log('✅ Position is still OPEN');
    } else if (position.status === 'closed') {
      console.log('🔒 Position is CLOSED');
      console.log('Closed at:', new Date(position.closedAt).toLocaleString());
    } else {
      console.log('⚠️  Position status:', position.status);
    }
    
  } catch (error) {
    console.error('❌ Error checking latest position:', error.message);
  }
}

checkLatestPosition();
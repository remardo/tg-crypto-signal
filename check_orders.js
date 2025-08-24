const BingXService = require('./src/services/bingxService');
const { logger } = require('./src/utils/logger');

async function checkAndCancelIncorrectOrders() {
  try {
    console.log('🔍 Checking Current BingX Orders...\n');
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Get account info
    const accountInfo = await bingx.getAccountInfo();
    console.log('💰 Account Balance:', accountInfo.balance, 'USDT');
    console.log('💰 Available Balance:', accountInfo.availableBalance, 'USDT\n');
    
    // Get current positions
    console.log('📊 Current Positions:');
    const positions = await bingx.getPositions();
    if (positions.length === 0) {
      console.log('❌ No open positions found\n');
    } else {
      positions.forEach((pos, index) => {
        console.log(`  Position ${index + 1}:`);
        console.log(`    Symbol: ${pos.symbol}`);
        console.log(`    Side: ${pos.positionSide}`);
        console.log(`    Size: ${pos.positionAmt}`);
        console.log(`    Entry Price: ${pos.entryPrice}`);
        console.log(`    Mark Price: ${pos.markPrice}`);
        console.log(`    Unrealized PnL: ${pos.unRealizedProfit}`);
        console.log('');
      });
    }
    
    // Get current open orders
    console.log('📋 Current Open Orders:');
    const orders = await bingx.getOpenOrders('FARTCOIN-USDT'); // Get open orders for FARTCOIN
    if (orders.length === 0) {
      console.log('❌ No open orders found\n');
    } else {
      console.log(`Found ${orders.length} open orders:\n`);
      
      orders.forEach((order, index) => {
        console.log(`  Order ${index + 1}:`);
        console.log(`    Order ID: ${order.orderId}`);
        console.log(`    Symbol: ${order.symbol}`);
        console.log(`    Side: ${order.side}`);
        console.log(`    Type: ${order.type}`);
        console.log(`    Quantity: ${order.origQty}`);
        console.log(`    Price: ${order.price}`);
        console.log(`    Status: ${order.status}`);
        console.log('');
        
        // Check if this is a problematic order for FARTCOIN
        if (order.symbol === 'FARTCOINUSDT' || order.symbol === 'FARTCOIN-USDT') {
          // Find the position for this symbol
          const position = positions.find(p => 
            p.symbol === order.symbol || 
            p.symbol === 'FARTCOINUSDT' || 
            p.symbol === 'FARTCOIN-USDT'
          );
          
          if (position) {
            console.log(`    📊 Related Position: ${position.positionSide} (${position.positionAmt})`);
            
            // For SHORT position, take profit orders should be BUY with LONG positionSide
            // But if we see BUY orders with SHORT positionSide, they're wrong
            if (position.positionSide === 'SHORT' && parseFloat(position.positionAmt) < 0) {
              if (order.side === 'BUY' && order.type === 'LIMIT') {
                console.log(`    ⚠️  POTENTIAL ISSUE: BUY order for SHORT position`);
                console.log(`    💡 This should be a take profit order, but might have wrong positionSide`);
              }
            }
          }
        }
      });
      
      // Ask if user wants to cancel orders
      console.log('🔧 Would you like to cancel all FARTCOIN orders? (This will clean up the incorrect orders)');
      console.log('⚠️  This will cancel ALL open orders for FARTCOIN!');
      console.log('💡 After canceling, we can test the corrected order logic');
      
      // For safety, let's not auto-cancel, just show what we would cancel
      const fartcoinOrders = orders.filter(order => 
        order.symbol === 'FARTCOINUSDT' || 
        order.symbol === 'FARTCOIN-USDT'
      );
      
      if (fartcoinOrders.length > 0) {
        console.log(`\n📋 FARTCOIN Orders to Cancel (${fartcoinOrders.length}):`);
        fartcoinOrders.forEach((order, index) => {
          console.log(`  ${index + 1}. Order ${order.orderId}: ${order.side} ${order.origQty} at ${order.price}`);
        });
        
        console.log('\n🔄 To cancel these orders, uncomment the cancellation code below and run again:');
        console.log('/* UNCOMMENT TO CANCEL:');
        console.log('for (const order of fartcoinOrders) {');
        console.log('  try {');
        console.log('    await bingx.cancelOrder(order.orderId, order.symbol);');
        console.log('    console.log(`✅ Cancelled order ${order.orderId}`);');
        console.log('  } catch (error) {');
        console.log('    console.log(`❌ Failed to cancel ${order.orderId}:`, error.message);');
        console.log('  }');
        console.log('}');
        console.log('*/');
      }
    }
    
    console.log('\n📊 ANALYSIS COMPLETE');
    console.log('✅ Current orders and positions checked');
    console.log('✅ Ready to test corrected order logic');
    
  } catch (error) {
    console.error('❌ Error checking orders:', error.message);
  }
}

checkAndCancelIncorrectOrders();
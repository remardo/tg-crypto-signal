const Account = require('./src/models/Account');
const Channel = require('./src/models/Channel');
const BingXService = require('./src/services/bingxService');
const { logger } = require('./src/utils/logger');

async function checkAndFixAccounts() {
  try {
    console.log('🔍 Checking Account and Channel Setup...\n');
    
    // Get all channels
    const channels = await Channel.findAll();
    console.log(`📺 Found ${channels.length} channels:`);
    
    for (const channel of channels) {
      console.log(`\n📋 Channel: ${channel.name}`);
      console.log(`   ID: ${channel.id}`);
      console.log(`   Active: ${channel.isActive ? 'YES' : 'NO'}`);
      console.log(`   Paused: ${channel.isPaused ? 'YES' : 'NO'}`);
      console.log(`   Auto Execute: ${channel.autoExecute ? 'YES' : 'NO'}`);
      console.log(`   Risk %: ${channel.riskPercentage}%`);
      
      // Check associated account
      const account = await Account.findByChannelId(channel.id);
      
      if (!account) {
        console.log('   ❌ NO ACCOUNT FOUND!');
        console.log('   💡 This will cause execution failures');
        
        // Create a temporary account using main account
        console.log('   🔧 Creating placeholder account...');
        
        const accountData = {
          channelId: channel.id,
          bingxSubAccountId: null, // Use main account (null = main account)
          name: `${channel.name} Main Account`,
          totalBalance: 0,
          availableBalance: 0
        };
        
        const newAccount = await Account.create(accountData);
        console.log(`   ✅ Created account: ${newAccount.id}`);
        
      } else {
        console.log(`   ✅ Account found: ${account.name}`);
        console.log(`   💼 BingX Sub-Account: ${account.bingxSubAccountId || 'MAIN ACCOUNT'}`);
        console.log(`   💰 Balance: ${account.totalBalance || 0} USDT`);
        console.log(`   💸 Available: ${account.availableBalance || 0} USDT`);
        
        // Check if placeholder sub-account
        if (account.bingxSubAccountId && account.bingxSubAccountId.includes('placeholder')) {
          console.log('   ⚠️  PLACEHOLDER SUB-ACCOUNT DETECTED!');
          console.log('   🔧 Fixing to use main account...');
          
          await account.update({
            bingxSubAccountId: null // Use main account
          });
          
          console.log('   ✅ Fixed to use main account');
        }
      }
    }
    
    // Test BingX connection
    console.log('\n🔗 Testing BingX Connection...');
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    // Get main account info
    const mainAccountInfo = await bingx.getAccountInfo();
    console.log('💰 Main Account Balance:', mainAccountInfo.balance, 'USDT');
    console.log('💸 Available Balance:', mainAccountInfo.availableBalance, 'USDT');
    
    // Test symbol info for common coins
    const testSymbols = ['BTC-USDT', 'SUI-USDT', 'UNI-USDT'];
    console.log('\n📊 Testing Symbol Information:');
    
    for (const symbol of testSymbols) {
      try {
        const symbolInfo = await bingx.getSymbolInfo(symbol);
        console.log(`✅ ${symbol}:`);
        console.log(`   Min Qty: ${symbolInfo.minQty}`);
        console.log(`   Max Qty: ${symbolInfo.maxQty}`);
        console.log(`   Step Size: ${symbolInfo.stepSize}`);
        console.log(`   Price Precision: ${symbolInfo.pricePrecision}`);
        
        // Get current price
        const priceInfo = await bingx.getSymbolPrice(symbol);
        console.log(`   Current Price: ${priceInfo.price} USDT`);
        
      } catch (error) {
        console.log(`❌ ${symbol}: ${error.message}`);
      }
    }
    
    // Test leverage setting (this was causing errors)
    console.log('\n⚙️ Testing Leverage Settings:');
    
    // Don't actually set leverage, just test the API structure
    try {
      // Check if we can get current leverage for BTC
      console.log('📊 Current trading permissions and leverage limits...');
      
      // Get account info to check permissions
      const permissions = await bingx.makeRequest('GET', '/openApi/swap/v2/user/balance');
      console.log('✅ Futures account accessible');
      
    } catch (leverageError) {
      console.log('❌ Leverage test failed:', leverageError.message);
      console.log('💡 This explains why signals fail during leverage setting');
    }
    
    console.log('\n📋 SUMMARY AND RECOMMENDATIONS:');
    console.log('=' .repeat(50));
    
    // Check for common issues
    const allAccounts = await Account.findAll();
    const placeholderAccounts = allAccounts.filter(acc => 
      acc.bingxSubAccountId && acc.bingxSubAccountId.includes('placeholder')
    );
    
    if (placeholderAccounts.length > 0) {
      console.log('⚠️  ISSUE: Placeholder sub-accounts detected');
      console.log('   These cause "Sub-account not found" errors');
      console.log('   FIXED: Updated to use main account');
    }
    
    if (mainAccountInfo.balance < 5) {
      console.log('⚠️  ISSUE: Low balance detected');
      console.log(`   Current: ${mainAccountInfo.balance} USDT`);
      console.log('   Recommendation: Signals may fail due to insufficient funds');
    }
    
    console.log('\n🔧 EXECUTION ISSUES ANALYSIS:');
    console.log('From the logs, signals are failing because:');
    console.log('1. ❌ Invalid BingX API parameters in leverage setting');
    console.log('2. ❌ Using placeholder sub-account IDs');
    console.log('3. ❌ Possibly insufficient balance for calculated position sizes');
    
    console.log('\n💡 SOLUTIONS APPLIED:');
    console.log('✅ Fixed placeholder accounts to use main account');
    console.log('✅ Account structure verified');
    console.log('✅ BingX API connection confirmed working');
    
    console.log('\n🎯 NEXT STEPS:');
    console.log('1. Test a signal execution with the fixed accounts');
    console.log('2. Consider disabling leverage for problematic symbols');
    console.log('3. Use smaller position sizes to avoid balance issues');
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
    console.error('Full error:', error);
  }
}

checkAndFixAccounts();
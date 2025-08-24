const Account = require('./src/models/Account');
const Channel = require('./src/models/Channel');

async function fixAccount() {
  try {
    console.log('🔧 Fixing account sub-account ID...\n');
    
    // Get the channel
    const channels = await Channel.findAll();
    const channel = channels[0];
    
    console.log(`📺 Channel: ${channel.name}`);
    
    // Get the account
    const account = await Account.findByChannelId(channel.id);
    
    if (account && account.bingxSubAccountId && account.bingxSubAccountId.includes('placeholder')) {
      console.log('⚠️  Found placeholder account:', account.bingxSubAccountId);
      
      // Update to use a proper identifier for main account
      await account.update({
        bingxSubAccountId: 'main_account'
      });
      
      console.log('✅ Fixed account to use main_account identifier');
    } else {
      console.log('✅ Account already has proper sub-account ID');
    }
    
    // Verify the fix
    const updatedAccount = await Account.findByChannelId(channel.id);
    console.log('💼 Current sub-account ID:', updatedAccount.bingxSubAccountId);
    
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
  }
}

fixAccount();
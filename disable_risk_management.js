const { saveSettings, loadSettings } = require('./src/routes/settings');
const { logger } = require('./src/utils/logger');

async function disableRiskManagement() {
  try {
    console.log('🔧 Disabling All Risk Management Checks...\n');
    
    // Load current settings
    const currentSettings = await loadSettings();
    console.log('📋 Current Settings:');
    console.log('  Risk Management Disabled:', currentSettings.riskManagementDisabled);
    console.log('  Auto Execute:', currentSettings.autoExecute);
    console.log('  Default Risk:', currentSettings.defaultRisk + '%');
    
    // Update settings to disable risk management
    const newSettings = {
      ...currentSettings,
      riskManagementDisabled: true
    };
    
    // Save new settings
    const saved = await saveSettings(newSettings);
    
    if (saved) {
      console.log('\n✅ Risk Management Successfully Disabled!');
      console.log('🚨 WARNING: ALL risk checks are now bypassed!');
      console.log('\n📊 Updated Settings:');
      console.log('  Risk Management Disabled: ✅ TRUE');
      console.log('  Auto Execute:', newSettings.autoExecute);
      console.log('  Default Risk:', newSettings.defaultRisk + '%');
      
      console.log('\n⚠️  IMPORTANT WARNINGS:');
      console.log('  🔴 Risk/Reward ratio checks: DISABLED');
      console.log('  🔴 Minimum confidence checks: DISABLED');
      console.log('  🔴 Balance sufficiency checks: DISABLED');
      console.log('  🔴 Maximum leverage checks: DISABLED');
      console.log('  🔴 Open positions limit: DISABLED');
      console.log('  🔴 Duplicate symbol checks: DISABLED');
      console.log('  🔴 Margin ratio checks: DISABLED');
      
      console.log('\n💡 What this means:');
      console.log('  ✅ ALL signals will now be accepted for execution');
      console.log('  ✅ No quality filters will be applied');
      console.log('  ✅ Poor risk/reward ratios will be executed');
      console.log('  ✅ High leverage signals will be accepted');
      
      console.log('\n🎯 Next Steps:');
      console.log('  1. Test signal execution with latest failed signals');
      console.log('  2. Monitor executions carefully');
      console.log('  3. Re-enable risk management when needed');
      
    } else {
      console.log('\n❌ Failed to save settings');
      console.log('💡 Check file permissions and disk space');
    }
    
  } catch (error) {
    console.error('❌ Error disabling risk management:', error.message);
  }
}

disableRiskManagement();
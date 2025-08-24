const BingXService = require('./src/services/bingxService');

async function testBingXAPI() {
  try {
    console.log('Testing BingX API connection...');
    
    const bingx = new BingXService();
    await bingx.initialize();
    
    console.log('Getting futures account info...');
    const accountInfo = await bingx.getAccountInfo();
    console.log('Futures Account Info:', accountInfo);
    
    console.log('Getting spot balance...');
    const spotBalance = await bingx.getSpotBalance();
    console.log('Spot Balance (USDT):', spotBalance);
    
    console.log('Getting positions...');
    const positions = await bingx.getPositions();
    console.log('Current Positions:', positions);
    
    // Test a simple market data call
    console.log('Testing market data...');
    try {
      const priceData = await bingx.getSymbolPrice('BTC-USDT');
      console.log('BTC Price:', priceData);
    } catch (err) {
      console.log('Market data test failed:', err.message);
    }
    
  } catch (error) {
    console.error('BingX API Test Failed:', error.message);
    console.error('Full error:', error);
  }
}

testBingXAPI();
const db = require('../src/database/connection');

async function addTPPercentageColumns() {
  try {
    console.log('Adding TP percentage columns...');
    
    // Add tp_percentages column to channels table
    await db.query(`
      ALTER TABLE channels 
      ADD COLUMN IF NOT EXISTS tp_percentages DECIMAL(5,2)[] DEFAULT ARRAY[25.0, 25.0, 50.0]
    `);
    
    console.log('Added tp_percentages column to channels table');
    
    // Add tp_percentages column to positions table  
    await db.query(`
      ALTER TABLE positions 
      ADD COLUMN IF NOT EXISTS tp_percentages DECIMAL(5,2)[]
    `);
    
    console.log('Added tp_percentages column to positions table');
    
    // Update existing channels with default TP percentages
    await db.query(`
      UPDATE channels 
      SET tp_percentages = ARRAY[25.0, 25.0, 50.0] 
      WHERE tp_percentages IS NULL
    `);
    
    console.log('Updated existing channels with default TP percentages');
    console.log('Migration completed successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

addTPPercentageColumns();
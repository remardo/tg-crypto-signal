const fs = require('fs');
const path = require('path');
const db = require('./connection');

async function runMigration() {
  try {
    const migrationPath = path.join(__dirname, 'migrations', '002_add_tp_percentages.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Running migration: 002_add_tp_percentages.sql');
    await db.query(migrationSQL);
    console.log('Migration completed successfully');
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
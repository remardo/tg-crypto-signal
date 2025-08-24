const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'tg_crypto_signal',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

// Configuration for creating database (connects to default 'postgres' database)
const createDbConfig = {
  ...dbConfig,
  database: 'postgres' // Connect to default database to create new one
};

async function createDatabase() {
  const client = new Pool(createDbConfig);
  
  try {
    console.log('🔄 Checking if database exists...');
    
    // Check if database exists
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbConfig.database]
    );
    
    if (result.rows.length === 0) {
      console.log(`🚀 Creating database: ${dbConfig.database}`);
      await client.query(`CREATE DATABASE "${dbConfig.database}"`);
      console.log(`✅ Database '${dbConfig.database}' created successfully!`);
    } else {
      console.log(`ℹ️  Database '${dbConfig.database}' already exists.`);
    }
  } catch (error) {
    console.error('❌ Error creating database:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

async function runMigrations() {
  const client = new Pool(dbConfig);
  
  try {
    console.log('🔄 Connecting to database...');
    await client.query('SELECT NOW()'); // Test connection
    console.log('✅ Connected to database successfully!');
    
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    console.log(`📁 Found ${migrationFiles.length} migration files`);
    
    for (const file of migrationFiles) {
      // Check if migration has already been applied
      const result = await client.query(
        'SELECT 1 FROM migrations WHERE filename = $1',
        [file]
      );
      
      if (result.rows.length === 0) {
        console.log(`🔄 Running migration: ${file}`);
        
        // Read and execute migration file
        const migrationPath = path.join(migrationsDir, file);
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        await client.query('BEGIN');
        try {
          await client.query(migrationSQL);
          await client.query(
            'INSERT INTO migrations (filename) VALUES ($1)',
            [file]
          );
          await client.query('COMMIT');
          console.log(`✅ Migration '${file}' applied successfully!`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      } else {
        console.log(`⏭️  Migration '${file}' already applied, skipping.`);
      }
    }
    
    console.log('🎉 All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

async function verifyDatabase() {
  const client = new Pool(dbConfig);
  
  try {
    console.log('🔍 Verifying database setup...');
    
    // Check if tables exist
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    const tables = result.rows.map(row => row.table_name);
    console.log('📋 Tables created:', tables);
    
    // Check specific tables that should exist
    const expectedTables = ['channels', 'signals', 'positions', 'sub_accounts', 'orders', 'signal_logs', 'migrations'];
    const missingTables = expectedTables.filter(table => !tables.includes(table));
    
    if (missingTables.length === 0) {
      console.log('✅ All expected tables are present!');
    } else {
      console.log('⚠️  Missing tables:', missingTables);
    }
    
    // Test a simple query
    const testQuery = await client.query('SELECT COUNT(*) FROM channels');
    console.log(`📊 Channels table is accessible (current count: ${testQuery.rows[0].count})`);
    
  } catch (error) {
    console.error('❌ Verification error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  try {
    console.log('🚀 Starting database setup...\n');
    
    // Step 1: Create database
    await createDatabase();
    console.log('');
    
    // Step 2: Run migrations
    await runMigrations();
    console.log('');
    
    // Step 3: Verify setup
    await verifyDatabase();
    console.log('');
    
    console.log('🎉 Database setup completed successfully!');
    console.log('💡 You can now start your application with: npm start');
    
  } catch (error) {
    console.error('\n💥 Database setup failed:', error.message);
    console.log('\n📝 Troubleshooting tips:');
    console.log('1. Make sure PostgreSQL is running');
    console.log('2. Check your database credentials in .env file');
    console.log('3. Ensure the postgres user has the correct password');
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--verify-only')) {
  verifyDatabase().catch(console.error);
} else if (args.includes('--create-db-only')) {
  createDatabase().catch(console.error);
} else {
  main();
}
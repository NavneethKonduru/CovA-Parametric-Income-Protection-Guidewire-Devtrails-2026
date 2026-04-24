const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Manually parse .env to avoid dependency issues
function getEnvUrl() {
  try {
    const envPath = path.join(__dirname, '../02-app-backend/.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/DATABASE_URL=["']?([^"'\n]+)["']?/);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
}

const connectionString = getEnvUrl();

if (!connectionString) {
  console.error('ERROR: DATABASE_URL not found in .env file.');
  process.exit(1);
}

async function run() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Neon PostgreSQL...');
    await client.connect();
    console.log('Connected successfully.\n');

    // 1. Run init.sql
    console.log('--- Step 1: Initializing Schema (init.sql) ---');
    const initSql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
    await client.query(initSql);
    console.log('DONE: Schemas and types created.\n');

    // 2. Run Migrations 001-010
    console.log('--- Step 2: Running Migrations 001-010 ---');
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of migrationFiles) {
      console.log(`Executing ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
    }
    console.log('DONE: All migrations applied.\n');

    // 3. Run Seeds
    console.log('--- Step 3: Seeding Baseline Data ---');
    const seedsDir = path.join(__dirname, 'seeds');
    const seedFiles = fs.readdirSync(seedsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of seedFiles) {
      console.log(`Seeding ${file}...`);
      const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
      await client.query(sql);
    }
    console.log('DONE: Data seeded successfully.\n');

    console.log('🎉 MIGRATION COMPLETE: Your Neon database is now fully populated.');
    
  } catch (err) {
    console.error('\n❌ MIGRATION FAILED:');
    console.error(err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.where) console.error('Where:', err.where);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();

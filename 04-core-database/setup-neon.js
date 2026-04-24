/**
 * ============================================================================
 * CovA Database Setup for Neon PostgreSQL
 * ============================================================================
 * Runs all migrations and seeds against a Neon PostgreSQL instance.
 * Uses the pg module directly (no psql dependency needed).
 *
 * Usage:
 *   DATABASE_URL=postgresql://...@ep-xxx.neon.tech/cova_db node db/setup-neon.js
 *
 * This replaces setup.sh for environments where psql is not installed.
 * ============================================================================
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required.');
  console.error('   Example: DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/cova_db node db/setup-neon.js');
  process.exit(1);
}

const isNeon = DATABASE_URL.includes('.neon.tech') || DATABASE_URL.includes('neon.tech');
const sslConfig = isNeon ? { rejectUnauthorized: false } : false;

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 3,
  ssl: sslConfig,
  connectionTimeoutMillis: 15000,
  statement_timeout: 120000, // 2 min for big migrations
});

const DB_DIR = path.join(__dirname);

// File execution order
const INIT_FILE = path.join(DB_DIR, 'init.sql');

const MIGRATION_FILES = [
  '001_public_schema.sql',
  '002_weather_schema.sql',
  '003_fraud_schema.sql',
  '004_financial_schema.sql',
  '005_simulation_schema.sql',
  '006_ml_schema.sql',
  '007_reporting_schema.sql',
  '008_system_schema.sql',
  '009_hypertables.sql',
  '010_indexes_and_triggers.sql',
].map(f => path.join(DB_DIR, 'migrations', f));

const SEED_FILES = [
  'seed_regions.sql',
  'seed_insurer_config.sql',
  'seed_admin_config.sql',
  'seed_scenarios.sql',
  'seed_demo_workers.sql',
].map(f => path.join(DB_DIR, 'seeds', f));

/**
 * Execute a SQL file against the database.
 * Handles multi-statement SQL with DO blocks and triggers.
 */
async function executeSQLFile(filePath, label) {
  const fileName = path.basename(filePath);
  const sql = fs.readFileSync(filePath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log(`  ✓ ${label}: ${fileName}`);
    return true;
  } catch (err) {
    // For some expected warnings (like TimescaleDB not available), continue
    if (err.message.includes('timescaledb') || err.message.includes('hypertable')) {
      console.log(`  ⚠ ${label}: ${fileName} (TimescaleDB not available — skipped hypertables)`);
      return true;
    }
    console.error(`  ❌ ${label}: ${fileName}`);
    console.error(`     Error: ${err.message}`);
    // Try to extract position info
    if (err.position) {
      const lines = sql.substring(0, parseInt(err.position)).split('\n');
      console.error(`     At line ~${lines.length}`);
    }
    return false;
  } finally {
    client.release();
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CovA Database Setup (Neon PostgreSQL)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Target: ${DATABASE_URL.replace(/\/\/.*@/, '//<credentials>@')}`);
  console.log(`  SSL:    ${isNeon ? 'Enabled (Neon)' : 'Disabled (local)'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test connection
  try {
    const result = await pool.query('SELECT current_database() as db, version() as ver');
    console.log(`✓ Connected to: ${result.rows[0].db}`);
    console.log(`  PostgreSQL: ${result.rows[0].ver.split(',')[0]}\n`);
  } catch (err) {
    console.error(`❌ Connection failed: ${err.message}`);
    process.exit(1);
  }

  let success = true;
  const startTime = Date.now();

  // 1. Initialization
  console.log('▸ Phase 1: Initialization (extensions, schemas, types)');
  if (!await executeSQLFile(INIT_FILE, 'Init')) {
    console.error('\n❌ Init failed. Cannot proceed.');
    process.exit(1);
  }
  console.log('');

  // 2. Migrations
  console.log('▸ Phase 2: Migrations (10 files)');
  for (const file of MIGRATION_FILES) {
    const ok = await executeSQLFile(file, 'Migration');
    if (!ok) success = false;
  }
  console.log('');

  // 3. Seeds
  console.log('▸ Phase 3: Seed Data (5 files)');
  for (const file of SEED_FILES) {
    const ok = await executeSQLFile(file, 'Seed');
    if (!ok) success = false;
  }
  console.log('');

  // 4. Verification
  console.log('▸ Phase 4: Verification');

  // Count tables
  const tableResult = await pool.query(`
    SELECT schemaname, COUNT(*)::integer as count
    FROM pg_tables
    WHERE schemaname IN ('public','weather','fraud','financial','simulation','ml','reporting','system')
    GROUP BY schemaname
    ORDER BY schemaname
  `);

  console.log('\n  Schema                Tables');
  console.log('  ──────                ──────');
  let totalTables = 0;
  for (const row of tableResult.rows) {
    console.log(`  ${row.schemaname.padEnd(20)} ${row.count}`);
    totalTables += row.count;
  }
  console.log(`  ${'TOTAL'.padEnd(20)} ${totalTables}`);

  // Count seed data
  const seedCounts = await pool.query(`
    SELECT 'workers' as table_name, COUNT(*)::integer as rows FROM public.workers
    UNION ALL SELECT 'policies', COUNT(*) FROM public.policies
    UNION ALL SELECT 'worker_signals', COUNT(*) FROM public.worker_signals
    UNION ALL SELECT 'insurer_config', COUNT(*) FROM public.insurer_config
    UNION ALL SELECT 'admin_config', COUNT(*) FROM public.admin_config
    UNION ALL SELECT 'region_mapping', COUNT(*) FROM weather.region_mapping
    UNION ALL SELECT 'scenario_library', COUNT(*) FROM simulation.scenario_library
    UNION ALL SELECT 'simulation_state', COUNT(*) FROM simulation.state
    UNION ALL SELECT 'system_config', COUNT(*) FROM system.config
    ORDER BY table_name
  `);

  console.log('\n  Seed Data             Rows');
  console.log('  ─────────             ────');
  for (const row of seedCounts.rows) {
    console.log(`  ${row.table_name.padEnd(20)} ${row.rows}`);
  }

  // Check extensions
  const extResult = await pool.query(`
    SELECT extname FROM pg_extension
    WHERE extname IN ('postgis','pgcrypto','pg_trgm','timescaledb')
    ORDER BY extname
  `);
  console.log(`\n  Extensions: ${extResult.rows.map(r => r.extname).join(', ') || 'none (core only)'}`);

  // Database size
  const sizeResult = await pool.query(`
    SELECT pg_size_pretty(pg_database_size(current_database())) as size
  `);
  console.log(`  Database size: ${sizeResult.rows[0].size}`);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n═══════════════════════════════════════════════════════════');
  if (success) {
    console.log(`  ✅ Setup complete! (${duration}s)`);
    console.log('');
    console.log('  Next steps:');
    console.log('    1. Run weather ingestion: DATABASE_URL=... node db/ingest-weather.js');
    console.log('    2. Update backend/.env with DATABASE_URL');
    console.log('    3. Start the server: cd backend && npm start');
  } else {
    console.log(`  ⚠️  Setup completed with some errors. Review above. (${duration}s)`);
  }
  console.log('═══════════════════════════════════════════════════════════\n');

  await pool.end();
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});

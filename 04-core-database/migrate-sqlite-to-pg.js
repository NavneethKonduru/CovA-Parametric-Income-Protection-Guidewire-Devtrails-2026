/**
 * ============================================================================
 * SQLite → PostgreSQL Data Migration Script
 * ============================================================================
 * Reads all rows from the existing SQLite cova.db, maps column names from
 * camelCase to snake_case, tags all data with data_mode = 'demo', and
 * bulk inserts into PostgreSQL.
 *
 * Usage: node db/migrate-sqlite-to-pg.js
 *
 * Prerequisites:
 *   - PostgreSQL must be running with all migrations applied
 *   - DATABASE_URL environment variable must be set
 *   - better-sqlite3 and pg packages must be installed
 * ============================================================================
 */

const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// ============================================================================
// CONFIG
// ============================================================================

const SQLITE_PATH = path.join(__dirname, '..', 'backend', 'data', 'cova.db');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://cova:cova@localhost:5432/cova_db';

// ============================================================================
// COLUMN NAME MAPPING: camelCase (SQLite) → snake_case (PostgreSQL)
// ============================================================================

const COLUMN_MAP = {
  // workers table
  workerId: 'worker_id',
  hourlyRate: 'hourly_rate',
  enrolledDate: 'enrolled_date',
  upiId: 'upi_id',
  isSimulated: 'is_simulated',
  dailyClaimsCap: 'daily_claims_cap',
  phoneHash: 'phone_hash',
  seasonalFactor: 'seasonal_factor',
  peakHoursPerWeek: 'peak_hours_per_week',

  // policies table
  workerName: 'worker_name',
  weeklyPremium: 'weekly_premium',
  dailyCoverCap: 'daily_cover_cap',
  effectiveDate: 'effective_date',
  expiryDate: 'expiry_date',
  paymentTxnId: 'payment_txn_id',
  paymentRef: 'payment_ref',
  createdAt: 'created_at',

  // claims table
  disruptionType: 'disruption_type',
  timeSlot: 'time_slot',
  hoursLost: 'hours_lost',
  triggerLevel: 'trigger_level',
  validationStatus: 'validation_status',
  validationReason: 'validation_reason',
  payoutAmount: 'payout_amount',
  payoutTxnId: 'payout_txn_id',
  fraudResult: 'fraud_result',
  policyId: 'policy_id',

  // payout_log
  claimId: 'claim_id',
  txnId: 'txn_reference',
  upiRef: 'payment_ref_legacy', // Not directly mapped, stored in metadata

  // worker_signals
  gnss_variance: 'gnss_variance',
  platform_active: 'platform_active',
  signal_mode: 'signal_mode',
  updated_at: 'updated_at',

  // disruption_events
  // columns already snake_case in SQLite

  // insurer_config, admin_config
  // columns already snake_case in SQLite
};

/**
 * Map a SQLite column name to its PostgreSQL equivalent.
 */
function mapColumnName(col) {
  return COLUMN_MAP[col] || col;
}

/**
 * Map a row's keys from camelCase to snake_case.
 */
function mapRow(row) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[mapColumnName(key)] = value;
  }
  return mapped;
}

// ============================================================================
// TABLE MIGRATION DEFINITIONS
// ============================================================================

const MIGRATIONS = [
  {
    sqlite_table: 'workers',
    pg_table: 'public.workers',
    addDataMode: true,
    transform: (row) => {
      row.is_simulated = Boolean(row.is_simulated || row.isSimulated);
      // Parse fraudResult as JSONB if present
      return row;
    },
    pg_columns: [
      'id', 'name', 'phone', 'zone', 'platform', 'archetype',
      'hourly_rate', 'status', 'enrolled_date', 'upi_id',
      'is_simulated', 'daily_claims_cap', 'phone_hash', 'seasonal_factor',
      'email', 'aadhaar_hash', 'peak_hours_per_week', 'data_mode'
    ]
  },
  {
    sqlite_table: 'policies',
    pg_table: 'public.policies',
    addDataMode: true,
    pg_columns: [
      'id', 'worker_id', 'worker_name', 'zone', 'platform', 'archetype',
      'weekly_premium', 'daily_cover_cap', 'status',
      'effective_date', 'expiry_date', 'upi_id',
      'payment_txn_id', 'payment_ref', 'data_mode'
    ]
  },
  {
    sqlite_table: 'claims',
    pg_table: 'public.claims',
    addDataMode: true,
    transform: (row) => {
      // Parse fraudResult text → JSONB
      if (row.fraud_result && typeof row.fraud_result === 'string') {
        try {
          row.fraud_result = JSON.parse(row.fraud_result);
        } catch (e) {
          row.fraud_result = null;
        }
      }
      return row;
    },
    pg_columns: [
      'id', 'worker_id', 'policy_id', 'worker_name',
      'zone', 'disruption_type', 'date', 'time_slot', 'hours_lost',
      'cdi', 'trigger_level', 'validation_status', 'validation_reason',
      'payout_amount', 'payout_txn_id', 'ai_explanation',
      'fraud_result', 'fraud_confidence', 'status', 'data_mode'
    ]
  },
  {
    sqlite_table: 'disruption_events',
    pg_table: 'public.disruption_events',
    addDataMode: true,
    pg_columns: ['zone', 'condition', 'cdi', 'data_mode', 'timestamp']
  },
  {
    sqlite_table: 'payout_log',
    pg_table: 'public.payout_log',
    addDataMode: true,
    transform: (row) => {
      // Map old payout_log columns to new schema
      row.claim_id = row.claim_id || row.claimId;
      row.worker_id = row.worker_id || row.workerId;
      row.txn_reference = row.txn_reference || row.txnId || row.txn_id;
      row.amount = row.amount || 0;
      row.status = row.status || 'success';
      return row;
    },
    pg_columns: [
      'claim_id', 'worker_id', 'amount', 'status',
      'txn_reference', 'data_mode'
    ]
  },
  {
    sqlite_table: 'worker_signals',
    pg_table: 'public.worker_signals',
    addDataMode: false, // worker_signals has no data_mode column
    pg_columns: [
      'worker_id', 'lat', 'lng', 'gnss_variance', 'velocity',
      'zone_entry', 'platform_active', 'signal_mode'
    ],
    transform: (row) => {
      row.worker_id = row.worker_id || row.workerId;
      row.platform_active = Boolean(row.platform_active);
      return row;
    }
  },
  {
    sqlite_table: 'insurer_config',
    pg_table: 'public.insurer_config',
    addDataMode: false,
    pg_columns: ['key', 'value', 'min_value', 'max_value']
  },
  {
    sqlite_table: 'admin_config',
    pg_table: 'public.admin_config',
    addDataMode: false,
    pg_columns: ['key', 'value']
  },
  {
    sqlite_table: 'simulation_state',
    pg_table: 'simulation.state',
    addDataMode: false,
    pg_columns: ['id', 'current_scenario'],
    transform: (row) => {
      row.id = row.id || 1;
      return row;
    }
  }
];

// ============================================================================
// MIGRATION ENGINE
// ============================================================================

async function migrateTable(sqliteDb, pgPool, migration) {
  const { sqlite_table, pg_table, pg_columns, addDataMode, transform } = migration;

  // Read from SQLite
  let rows;
  try {
    rows = sqliteDb.prepare(`SELECT * FROM ${sqlite_table}`).all();
  } catch (err) {
    console.log(`   ⚠ Table ${sqlite_table} not found in SQLite, skipping.`);
    return { table: sqlite_table, source: 0, migrated: 0, skipped: true };
  }

  if (rows.length === 0) {
    console.log(`   ○ ${sqlite_table}: 0 rows (empty)`);
    return { table: sqlite_table, source: 0, migrated: 0 };
  }

  let migrated = 0;
  const client = await pgPool.connect();

  try {
    await client.query('BEGIN');

    for (const rawRow of rows) {
      // Map column names
      let row = mapRow(rawRow);

      // Apply custom transform
      if (transform) row = transform(row);

      // Add data_mode
      if (addDataMode) row.data_mode = 'demo';

      // Build INSERT
      const values = pg_columns.map(col => {
        let val = row[col];
        // Handle JSONB serialization
        if (val !== null && val !== undefined && typeof val === 'object') {
          return JSON.stringify(val);
        }
        return val !== undefined ? val : null;
      });

      const placeholders = pg_columns.map((_, i) => `$${i + 1}`).join(', ');
      const colNames = pg_columns.join(', ');

      try {
        await client.query(
          `INSERT INTO ${pg_table} (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values
        );
        migrated++;
      } catch (err) {
        console.warn(`   ⚠ Row insert failed for ${pg_table}: ${err.message}`);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`   ✓ ${sqlite_table} → ${pg_table}: ${rows.length} source → ${migrated} migrated`);
  return { table: sqlite_table, source: rows.length, migrated };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  CovA: SQLite → PostgreSQL Migration');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Source:  ${SQLITE_PATH}`);
  console.log(`  Target:  ${DATABASE_URL.replace(/\/\/.*@/, '//<credentials>@')}`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Check SQLite file exists
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`❌ SQLite database not found: ${SQLITE_PATH}`);
    console.error('   Make sure cova.db exists in backend/data/');
    process.exit(1);
  }

  // Open SQLite
  const sqliteDb = new Database(SQLITE_PATH, { readonly: true });
  console.log('✓ SQLite database opened.\n');

  // Connect to PostgreSQL
  const pgPool = new Pool({ connectionString: DATABASE_URL, max: 5 });
  try {
    const testResult = await pgPool.query('SELECT current_database() as db');
    console.log(`✓ PostgreSQL connected: ${testResult.rows[0].db}\n`);
  } catch (err) {
    console.error(`❌ PostgreSQL connection failed: ${err.message}`);
    console.error('   Make sure DATABASE_URL is set and PostgreSQL is running.');
    process.exit(1);
  }

  // Run migrations
  console.log('Migrating tables...\n');
  const results = [];
  const startTime = Date.now();

  for (const migration of MIGRATIONS) {
    const result = await migrateTable(sqliteDb, pgPool, migration);
    results.push(result);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  // Print report
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  MIGRATION REPORT');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('  Table                    Source   Migrated   Status');
  console.log('  ─────────────────────    ──────   ────────   ──────');

  let totalSource = 0;
  let totalMigrated = 0;

  for (const r of results) {
    const name = r.table.padEnd(23);
    const source = String(r.source).padStart(6);
    const migrated = String(r.migrated).padStart(8);
    const status = r.skipped ? '⚠ SKIP' : r.source === r.migrated ? '✓ OK' : '⚠ PARTIAL';
    console.log(`  ${name} ${source}   ${migrated}   ${status}`);
    totalSource += r.source;
    totalMigrated += r.migrated;
  }

  console.log('  ─────────────────────    ──────   ────────   ──────');
  console.log(`  TOTAL                   ${String(totalSource).padStart(6)}   ${String(totalMigrated).padStart(8)}`);
  console.log('');
  console.log(`  Duration: ${totalTime}s`);
  console.log(`  All data tagged: data_mode = 'demo'`);
  console.log('');

  if (totalSource === totalMigrated) {
    console.log('  ✅ Migration completed successfully. All rows migrated.');
  } else {
    console.log(`  ⚠️  ${totalSource - totalMigrated} rows were skipped (conflicts or errors).`);
  }

  console.log('\n═══════════════════════════════════════════════════════\n');

  // Cleanup
  sqliteDb.close();
  await pgPool.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

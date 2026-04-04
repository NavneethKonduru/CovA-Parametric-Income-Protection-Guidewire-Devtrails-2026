const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'cova.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// ============================================================
// CREATE TABLES
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    zone TEXT,
    platform TEXT,
    archetype TEXT,
    hourlyRate REAL,
    status TEXT,
    enrolledDate TEXT,
    upiId TEXT,
    isSimulated INTEGER DEFAULT 0,
    dailyClaimsCap REAL DEFAULT 8.0,
    phoneHash TEXT,
    seasonalFactor REAL DEFAULT 1.0
  );

  CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    workerId TEXT,
    workerName TEXT,
    zone TEXT,
    disruptionType TEXT,
    date TEXT,
    timeSlot TEXT,
    hoursLost REAL,
    cdi REAL,
    triggerLevel TEXT,
    validationStatus TEXT,
    validationReason TEXT,
    payoutAmount REAL,
    payoutTxnId TEXT,
    ai_explanation TEXT,
    fraudResult TEXT,
    fraud_confidence REAL DEFAULT 0.0,
    status TEXT
  );

  CREATE TABLE IF NOT EXISTS disruption_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone TEXT,
    condition TEXT,
    cdi REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS insurer_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    min_value TEXT,
    max_value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS simulation_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    current_scenario TEXT,
    active_since TEXT,
    simulated_conditions TEXT
  );

  CREATE TABLE IF NOT EXISTS policies (
    id TEXT PRIMARY KEY,
    workerId TEXT NOT NULL,
    workerName TEXT,
    zone TEXT,
    platform TEXT,
    archetype TEXT,
    weeklyPremium REAL,
    dailyCoverCap REAL,
    status TEXT DEFAULT 'active',
    effectiveDate TEXT,
    expiryDate TEXT,
    upiId TEXT,
    paymentTxnId TEXT,
    paymentRef TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS worker_signals (
    workerId TEXT PRIMARY KEY,
    lat REAL,
    lng REAL,
    gnss_variance REAL,
    velocity REAL,
    zone_entry TEXT,
    platform_active INTEGER DEFAULT 1,
    signal_mode TEXT DEFAULT 'auto_genuine',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payout_log (
    id TEXT PRIMARY KEY,
    claimId TEXT,
    workerId TEXT,
    amount REAL,
    upiId TEXT,
    txnId TEXT,
    upiRef TEXT,
    status TEXT DEFAULT 'success',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add columns if they don't exist (for DB migration)
try { db.exec('ALTER TABLE workers ADD COLUMN upiId TEXT'); } catch(e) { /* already exists */ }
try { db.exec('ALTER TABLE workers ADD COLUMN isSimulated INTEGER DEFAULT 0'); } catch(e) { /* already exists */ }
try { db.exec('ALTER TABLE workers ADD COLUMN dailyClaimsCap REAL DEFAULT 8.0'); } catch(e) { /* already exists */ }
try { db.exec('ALTER TABLE claims ADD COLUMN fraud_confidence REAL DEFAULT 0.0'); } catch(e) { /* already exists */ }
try { db.exec('ALTER TABLE workers ADD COLUMN phoneHash TEXT'); } catch(e) { /* already exists */ }
try { db.exec('ALTER TABLE workers ADD COLUMN seasonalFactor REAL DEFAULT 1.0'); } catch(e) { /* already exists */ }
try { db.exec('ALTER TABLE workers ADD COLUMN email TEXT'); } catch(e) { /* already exists */ }
try { db.exec('ALTER TABLE workers ADD COLUMN aadhaar TEXT'); } catch(e) { /* already exists */ }
try { db.exec('ALTER TABLE workers ADD COLUMN peakHoursPerWeek REAL DEFAULT 20'); } catch(e) { /* already exists */ }
try { db.exec('ALTER TABLE claims ADD COLUMN policyId TEXT'); } catch(e) { /* already exists */ }

// ============================================================
// SEED: Workers
// ============================================================
const workerCount = db.prepare('SELECT COUNT(*) as count FROM workers').get().count;
if (workerCount === 0) {
  const workersDataPath = path.join(__dirname, 'workers.json');
  if (fs.existsSync(workersDataPath)) {
    const workersInfo = require(workersDataPath);
    const insert = db.prepare(`
      INSERT INTO workers (id, name, phone, zone, platform, archetype, hourlyRate, status, enrolledDate)
      VALUES (@id, @name, @phone, @zone, @platform, @archetype, @hourlyRate, @status, @enrolledDate)
    `);
    const insertMany = db.transaction((workers) => {
      for (const worker of workers) {
        insert.run({
          id: worker.id,
          name: worker.name,
          phone: worker.phone || '',
          zone: worker.zone || '',
          platform: worker.platform || '',
          archetype: worker.archetype || '',
          hourlyRate: worker.hourlyRate || 0,
          status: worker.status || 'active',
          enrolledDate: worker.enrolledDate || new Date().toISOString()
        });
      }
    });
    insertMany(workersInfo);
    console.log(`[DB] Seeded ${workersInfo.length} workers.`);
  }
}

// ============================================================
// SEED: Insurer Config
// ============================================================
const insurerConfigCount = db.prepare('SELECT COUNT(*) as count FROM insurer_config').get().count;
if (insurerConfigCount === 0) {
  const insertConfig = db.prepare(`
    INSERT OR IGNORE INTO insurer_config (key, value, min_value, max_value)
    VALUES (?, ?, ?, ?)
  `);
  const seedConfigs = db.transaction(() => {
    insertConfig.run('base_premium_rate', '35', '29', '89');
    insertConfig.run('max_payout_per_event', '1200', '500', '2000');
    insertConfig.run('cdi_trigger_threshold', '0.6', '0.5', '0.8');
    insertConfig.run('covered_zones', '["ZONE_A","ZONE_B","ZONE_C"]', null, null);
    insertConfig.run('weekly_coverage_cap', '3000', '1000', '5000');
  });
  seedConfigs();
  console.log('[DB] Seeded insurer_config defaults.');
}

// ============================================================
// SEED: Admin Config
// ============================================================
const adminConfigCount = db.prepare('SELECT COUNT(*) as count FROM admin_config').get().count;
if (adminConfigCount === 0) {
  const insertAdmin = db.prepare(`
    INSERT OR IGNORE INTO admin_config (key, value)
    VALUES (?, ?)
  `);
  const seedAdmin = db.transaction(() => {
    insertAdmin.run('cdi_weights', JSON.stringify({ weather: 0.40, demand: 0.35, peer: 0.25 }));
    insertAdmin.run('fraud_rules', JSON.stringify({
      FREQUENCY_ANOMALY: { enabled: true, threshold: 3, action: 'flag' },
      ZONE_MISMATCH: { enabled: true, action: 'auto_reject' },
      OFF_HOUR_CLAIM: { enabled: true, action: 'auto_reject' },
      PEER_DIVERGENCE: { enabled: true, threshold: 70, action: 'flag' },
      DUPLICATE_CLAIM: { enabled: true, action: 'auto_reject' },
      AMOUNT_ANOMALY: { enabled: true, threshold: 1.5, action: 'flag' },
      TELEPORTATION_SPEED: { enabled: true, threshold: 100, action: 'auto_reject' },
      SWARM_DETECTED: { enabled: true, threshold: 5, action: 'flag' },
      GNSS_ZERO_VARIANCE: { enabled: true, action: 'flag' },
      ZONE_HOPPING: { enabled: true, minPrePresenceMins: 30, action: 'auto_reject' }
    }));
    insertAdmin.run('zone_risk_factors', JSON.stringify({ ZONE_A: 1.0, ZONE_B: 1.3, ZONE_C: 0.8 }));
  });
  seedAdmin();
  console.log('[DB] Seeded admin_config defaults.');
}

// Ensure cdi_strategy default exists
db.prepare(`
  INSERT OR IGNORE INTO admin_config (key, value, updated_at)
  VALUES ('cdi_strategy', 'any_dominant', CURRENT_TIMESTAMP)
`).run();

// ============================================================
// SEED: 100 Simulated Workers
// ============================================================
try {
  const { seedSimulatedWorkers } = require('../simulation/worker-seeder');
  seedSimulatedWorkers(db);
} catch (e) {
  console.log('[DB] Simulation seeder not available:', e.message);
}

// ============================================================
// HELPER: Read config from DB
// ============================================================

/**
 * Get a single insurer config value
 * @param {string} key
 * @returns {*} parsed value
 */
function getInsurerConfig(key) {
  const row = db.prepare('SELECT value FROM insurer_config WHERE key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch (e) { /* ignore */ }
  if (!isNaN(row.value)) return parseFloat(row.value);
  return row.value;
}

/**
 * Get a single admin config value
 * @param {string} key
 * @returns {*} parsed value
 */
function getAdminConfig(key) {
  const row = db.prepare('SELECT value FROM admin_config WHERE key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch (e) { /* ignore */ }
  return row.value;
}

module.exports = db;
module.exports.getInsurerConfig = getInsurerConfig;
module.exports.getAdminConfig = getAdminConfig;

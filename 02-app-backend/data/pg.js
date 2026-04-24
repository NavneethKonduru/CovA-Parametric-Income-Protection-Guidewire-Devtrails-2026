/**
 * ============================================================================
 * CovA PostgreSQL Connection Module
 * ============================================================================
 * Replaces better-sqlite3 (db.js) with async PostgreSQL via node-postgres (pg).
 *
 * Exports:
 *   pool           — Primary pg.Pool (read/write, 20 connections)
 *   replicaPool    — Read replica pg.Pool (10 connections, falls back to primary)
 *   cache          — CacheClient (Redis if REDIS_URL set, else in-memory Map)
 *   query()        — Parameterized query helper
 *   queryReplica() — Read-only query routed to replica
 *   transaction()  — BEGIN/COMMIT/ROLLBACK wrapper
 *   getDataMode()  — Returns current 'real'|'demo' mode
 *   setDataMode()  — Updates mode in DB + memory (runtime switching)
 *   getInsurerConfig() — Backward-compatible config reader
 *   getAdminConfig()   — Backward-compatible config reader
 *   shutdown()     — Graceful pool drain
 *
 * Environment Variables:
 *   DATABASE_URL      — Primary PostgreSQL connection string (required)
 *   DATABASE_URL_READ — Read replica connection string (optional, falls back to primary)
 *   REDIS_URL         — Redis connection string (optional, falls back to in-memory)
 *   COVA_MODE         — Initial mode: 'real' | 'demo' (default: 'demo')
 * ============================================================================
 */

const { Pool } = require('pg');

// ============================================================================
// 1. IN-MEMORY CACHE (Redis fallback)
// ============================================================================
// When Redis is unavailable, this provides the same interface using a Map
// with TTL support. All cache consumers use CacheClient — swapping to Redis
// later requires only setting REDIS_URL, zero code changes.
// ============================================================================

class MemoryCache {
  constructor() {
    this._store = new Map();
    this._timers = new Map();
  }

  async get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    return entry;
  }

  async set(key, value, ttlSeconds) {
    this._store.set(key, value);
    if (this._timers.has(key)) clearTimeout(this._timers.get(key));
    if (ttlSeconds) {
      this._timers.set(key, setTimeout(() => {
        this._store.delete(key);
        this._timers.delete(key);
      }, ttlSeconds * 1000));
    }
  }

  async del(key) {
    this._store.delete(key);
    if (this._timers.has(key)) {
      clearTimeout(this._timers.get(key));
      this._timers.delete(key);
    }
  }

  async hget(hash, field) {
    const h = this._store.get(hash);
    if (!h || typeof h !== 'object') return null;
    return h[field] || null;
  }

  async hset(hash, field, value) {
    let h = this._store.get(hash);
    if (!h || typeof h !== 'object') h = {};
    h[field] = value;
    this._store.set(hash, h);
  }

  async hgetall(hash) {
    return this._store.get(hash) || null;
  }

  async keys(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this._store.keys()).filter(k => regex.test(k));
  }

  async flushdb() {
    for (const timer of this._timers.values()) clearTimeout(timer);
    this._store.clear();
    this._timers.clear();
  }

  async quit() {
    this.flushdb();
  }
}

/**
 * CacheClient wraps either ioredis or MemoryCache with the same interface.
 * Detects Redis availability at startup. Falls back to in-memory with a warning.
 */
class CacheClient {
  constructor() {
    this._backend = null;
    this._isRedis = false;
  }

  async initialize() {
    if (process.env.REDIS_URL) {
      try {
        const Redis = require('ioredis');
        const redis = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 3,
          connectTimeout: 5000,
          lazyConnect: true,
          retryStrategy: (times) => Math.min(times * 500, 3000),
        });
        await redis.connect();
        await redis.ping();
        this._backend = redis;
        this._isRedis = true;
      } catch (err) {
        this._backend = new MemoryCache();
        this._isRedis = false;
      }
    } else {
      this._backend = new MemoryCache();
      this._isRedis = false;
    }
  }

  get isRedis() { return this._isRedis; }

  // Proxy all methods to the backend
  async get(key) { return this._backend.get(key); }
  async set(key, value, ...args) {
    if (this._isRedis && args.length > 0) {
      // ioredis: set(key, value, 'EX', ttl)
      return this._backend.set(key, value, 'EX', args[0]);
    }
    return this._backend.set(key, value, args[0]);
  }
  async del(key) { return this._backend.del(key); }
  async hget(hash, field) { return this._backend.hget(hash, field); }
  async hset(hash, field, value) { return this._backend.hset(hash, field, value); }
  async hgetall(hash) { return this._backend.hgetall(hash); }
  async keys(pattern) { return this._backend.keys(pattern); }
  async quit() { if (this._backend && this._backend.quit) await this._backend.quit(); }
}

// ============================================================================
// 2. CONNECTION POOLS
// ============================================================================

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://cova:cova@localhost:5432/cova_db';

/**
 * Detect if we're connecting to Neon (cloud-hosted, requires SSL).
 * Neon connection strings always contain '.neon.tech' in the hostname.
 * When detected: enable SSL, reduce pool size to conserve free-tier compute.
 */
const isNeon = DATABASE_URL.includes('.neon.tech') || DATABASE_URL.includes('neon.tech');
const sslConfig = isNeon ? { rejectUnauthorized: false } : false;

if (isNeon) {
  // Silent: handled centrally in server.js
}

/**
 * Primary pool — read/write operations.
 * Neon: 5 connections (free tier), Local: 20 connections.
 */
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: isNeon ? 10 : 20, // Increased for Neon
  idleTimeoutMillis: isNeon ? 60000 : 10000, // 60s for Neon
  connectionTimeoutMillis: isNeon ? 30000 : 5000, // 30s for Neon
  statement_timeout: 30000,
  application_name: 'cova_primary',
  ssl: sslConfig,
});

pool.on('error', (err) => {
  console.error('[PG] Primary pool unexpected error:', err.message);
});

pool.on('connect', (client) => {
  // Set search_path for every new connection
  // This ensures unqualified table names resolve to public schema
  client.query('SET search_path TO public, weather, fraud, financial, system, ml, reporting');
});

/**
 * Read replica pool — dashboard queries, report generation, ML exports.
 * Falls back to primary if DATABASE_URL_READ is not configured.
 */
const replicaConnectionString = process.env.DATABASE_URL_READ || DATABASE_URL;
const replicaPool = new Pool({
  connectionString: replicaConnectionString,
  max: isNeon ? 5 : 10,
  idleTimeoutMillis: isNeon ? 60000 : 10000,
  connectionTimeoutMillis: isNeon ? 30000 : 5000,
  statement_timeout: 30000,
  application_name: 'cova_replica',
  ssl: sslConfig,
});

replicaPool.on('error', (err) => {
  console.error('[PG] Replica pool unexpected error:', err.message);
});

if (replicaConnectionString === DATABASE_URL) {
  // Silent: handled centrally in server.js
}

// ============================================================================
// 3. DATA MODE MANAGEMENT
// ============================================================================
// Supports runtime switching via setDataMode().
// Initial mode from COVA_MODE env var, persisted to system.config table.
// ============================================================================

let _currentDataMode = process.env.COVA_MODE || 'demo';
let _isAvailable = false;

/**
 * Check if the database is currently connected and available.
 * @returns {boolean}
 */
function isAvailable() {
  return _isAvailable;
}

/**
 * Get the current data mode ('real' | 'demo').
 * @returns {string} Current data mode
 */
function getDataMode() {
  return _currentDataMode;
}

/**
 * Set the data mode at runtime. Updates both in-memory state and system.config.
 * Does NOT delete existing data — both modes coexist in the database.
 *
 * @param {string} mode - 'real' or 'demo'
 * @throws {Error} if mode is invalid
 */
async function setDataMode(mode) {
  if (!['real', 'demo'].includes(mode)) {
    throw new Error(`Invalid data_mode: ${mode}. Must be 'real' or 'demo'.`);
  }
  const oldMode = _currentDataMode;
  _currentDataMode = mode;

  // Persist to system.config table
  try {
    await pool.query(
      `INSERT INTO system.config (key, value, description, updated_at, updated_by)
       VALUES ('current_mode', $1, 'Current operational mode', NOW(), 'system')
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [mode]
    );

    // Log the mode switch as a system event
    await pool.query(
      `INSERT INTO system.events (type, description, metadata, timestamp)
       VALUES ('MODE_SWITCH', $1, $2, NOW())`,
      [
        `Mode switched from ${oldMode} to ${mode}`,
        JSON.stringify({ old_mode: oldMode, new_mode: mode })
      ]
    );
  } catch (err) {
    console.warn('[PG] Could not persist mode change to DB:', err.message);
    // Mode is still changed in-memory even if DB write fails
  }

  console.log(`[PG] Data mode switched: ${oldMode} → ${mode}`);
  return { oldMode, newMode: mode };
}

/**
 * Load the persisted data mode from system.config at startup.
 * Falls back to COVA_MODE env var if DB is unavailable.
 */
async function loadPersistedMode() {
  try {
    const result = await pool.query(
      `SELECT value FROM system.config WHERE key = 'current_mode'`
    );
    if (result.rows.length > 0) {
      _currentDataMode = result.rows[0].value;
    }
  } catch (err) {
    console.warn('[PG] Could not load persisted mode, using env:', _currentDataMode);
  }
}

// ============================================================================
// 4. QUERY HELPERS
// ============================================================================

/**
 * Execute a parameterized query against the primary pool.
 *
 * @param {string} text - SQL query with $1, $2, ... placeholders
 * @param {Array} params - Parameter values
 * @returns {Promise<pg.QueryResult>}
 *
 * @example
 *   const { rows } = await query(
 *     'SELECT * FROM workers WHERE zone = $1 AND data_mode = $2',
 *     ['ZONE_A', getDataMode()]
 *   );
 */
async function query(text, params = []) {
  if (!_isAvailable) {
    // Return empty results instead of crashing
    return { rows: [], rowCount: 0, command: 'MOCK', oid: 0 };
  }

  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log slow queries (> 500ms)
    if (duration > 500) {
      console.warn(`[PG] Slow query (${duration}ms):`, text.substring(0, 120));
    }

    return result;
  } catch (err) {
    console.error(`[PG] Query error: ${err.message}`, { text: text.substring(0, 100) });
    // If it's a connection error, mark as unavailable
    if (err.message.includes('ECONNREFUSED') || err.message.includes('terminated')) {
      _isAvailable = false;
    }
    return { rows: [], rowCount: 0, error: err.message };
  }
}

/**
 * Execute a read-only query against the replica pool.
 * Used for dashboard queries, reports, and ML exports.
 *
 * @param {string} text - SQL query
 * @param {Array} params - Parameter values
 * @returns {Promise<pg.QueryResult>}
 */
async function queryReplica(text, params = []) {
  if (!_isAvailable) return { rows: [], rowCount: 0 };
  try {
    return await replicaPool.query(text, params);
  } catch (err) {
    return { rows: [], rowCount: 0, error: err.message };
  }
}

/**
 * Execute a multi-step transaction. All queries within the callback
 * use the same client and are wrapped in BEGIN/COMMIT with automatic
 * ROLLBACK on error.
 *
 * @param {Function} callback - async (client) => { await client.query(...) }
 * @returns {Promise<*>} Return value of the callback
 *
 * @example
 *   const result = await transaction(async (client) => {
 *     await client.query('INSERT INTO claims ...', [...]);
 *     await client.query('INSERT INTO fraud.detection_log ...', [...]);
 *     await client.query('INSERT INTO payout_log ...', [...]);
 *     return { success: true };
 *   });
 */
async function transaction(callback) {
  if (!_isAvailable) {
    console.warn('[PG] Skipping transaction: database unavailable');
    return null;
  }
  
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('[PG] Transaction error:', err.message);
    throw err;
  } finally {
    if (client) client.release();
  }
}

// ============================================================================
// 5. CONFIG HELPERS (backward-compatible with db.js)
// ============================================================================

/**
 * Get a single insurer config value.
 * Backward-compatible with the synchronous db.js version — but now async.
 *
 * @param {string} key - Config key
 * @returns {Promise<*>} Parsed value (JSON-parsed if possible, else number or string)
 */
async function getInsurerConfig(key) {
  if (!_isAvailable) {
    // Hardcoded defaults for demo mode when DB is down
    const defaults = {
      'cdi_trigger_threshold': 0.6,
      'covered_zones': ['ZONE_A', 'ZONE_B', 'ZONE_C'],
      'payout_cap_daily': 8.0,
      'hourly_rate_default': 120
    };
    return defaults[key] || null;
  }
  
  const result = await query('SELECT value FROM public.insurer_config WHERE key = $1', [key]);
  if (result.rows.length === 0) return null;
  const val = result.rows[0].value;
  try { return JSON.parse(val); } catch (e) { /* not JSON */ }
  if (!isNaN(val)) return parseFloat(val);
  return val;
}

/**
 * Get a single admin config value.
 * Backward-compatible with the synchronous db.js version — but now async.
 *
 * @param {string} key - Config key
 * @returns {Promise<*>} Parsed value (JSON-parsed if possible, else string)
 */
async function getAdminConfig(key) {
  if (!_isAvailable) {
    const defaults = {
      'cdi_weights': { weather: 0.35, demand: 0.25, peer: 0.05, civic: 0.15, telemetry_drop: 0.10, historical: 0.10 },
      'cdi_strategy': 'weighted_sum',
      'decorrelate_signals': false
    };
    return defaults[key] || null;
  }

  const result = await query('SELECT value FROM public.admin_config WHERE key = $1', [key]);
  if (result.rows.length === 0) return null;
  const val = result.rows[0].value;
  try { return JSON.parse(val); } catch (e) { /* not JSON */ }
  return val;
}

// ============================================================================
// 6. LIFECYCLE
// ============================================================================

/**
 * Gracefully shut down all connections.
 * Call this from process signal handlers (SIGTERM, SIGINT).
 */
async function shutdown() {
  console.log('[PG] Shutting down connection pools...');
  await cache.quit();
  await pool.end();
  await replicaPool.end();
  console.log('[PG] All pools closed.');
}

// ============================================================================
// 7. INITIALIZATION
// ============================================================================

// Cache client — initialized lazily
const cache = new CacheClient();

/**
 * Initialize the database module. Call this once at server startup.
 * - Tests primary pool connection
 * - Initializes cache (Redis or in-memory)
 * - Loads persisted data mode
 */
async function initialize() {
  try {
    // Test primary pool
    const testResult = await pool.query('SELECT NOW() as now, current_database() as db');
    // Initialize cache
    await cache.initialize();

    // Load persisted mode
    await loadPersistedMode();

    _isAvailable = true;
    return true;
  } catch (err) {
    console.error('[PG] Initialization failed:', err.message || err);
    console.error('[PG] Full error object:', err);
    console.error('[PG] Make sure DATABASE_URL is set and PostgreSQL is running.');
    _isAvailable = false;
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Connection pools
  pool,
  replicaPool,
  cache,

  // Query helpers
  query,
  queryReplica,
  transaction,

  // Mode management
  getDataMode,
  setDataMode,
  isAvailable,

  // Config helpers (backward-compatible)
  getInsurerConfig,
  getAdminConfig,

  // Lifecycle
  initialize,
  shutdown,
};

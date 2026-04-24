/**
 * ============================================================================
 * System Repository
 * ============================================================================
 * Data access layer for the system schema: events, metrics, audit_log,
 * process_log, and config.
 *
 * Handles operational logging, KV metrics, audit trails, and system config.
 * ============================================================================
 */

const { query, getDataMode } = require('../data/pg');

// ============================================================================
// SYSTEM EVENTS
// ============================================================================

/**
 * Log a system event. Every significant system action creates a row here:
 * CLAIM_BATCH, CDI_UPDATE, MODE_SWITCH, FRAUD_ALERT, CRON_TICK, ERROR, etc.
 *
 * @param {string} type - Event type identifier
 * @param {string} [description] - Human-readable description
 * @param {Object} [metadata] - Structured event data
 * @returns {Promise<Object>}
 */
async function logEvent(type, description, metadata = {}) {
  const { rows } = await query(
    `INSERT INTO system.events (type, description, metadata)
     VALUES ($1, $2, $3) RETURNING *`,
    [type, description || null, JSON.stringify(metadata)]
  );
  return rows[0];
}

/**
 * Get recent system events, optionally filtered by type.
 *
 * @param {Object} [opts] - Options
 * @param {string} [opts.type] - Event type filter
 * @param {number} [opts.limit=50] - Max results
 * @returns {Promise<Object[]>}
 */
async function getEvents(opts = {}) {
  let sql = 'SELECT * FROM system.events';
  const params = [];
  let idx = 1;

  if (opts.type) {
    sql += ` WHERE type = $${idx++}`;
    params.push(opts.type);
  }

  sql += ' ORDER BY timestamp DESC';

  if (opts.limit) {
    sql += ` LIMIT $${idx++}`;
    params.push(opts.limit);
  } else {
    sql += ' LIMIT 50';
  }

  const { rows } = await query(sql, params);
  return rows;
}

// ============================================================================
// SYSTEM METRICS (KV Store)
// ============================================================================

/**
 * Get a system metric value (KV store).
 *
 * @param {string} key - Metric key (e.g., 'total_claims_processed')
 * @returns {Promise<string|null>} Metric value or null
 */
async function getMetric(key) {
  const { rows } = await query(
    'SELECT value FROM system.metrics WHERE key = $1', [key]
  );
  return rows[0]?.value || null;
}

/**
 * Set a system metric value (upsert).
 *
 * @param {string} key - Metric key
 * @param {string|number} value - Metric value
 * @returns {Promise<void>}
 */
async function setMetric(key, value) {
  await query(
    `INSERT INTO system.metrics (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, String(value)]
  );
}

/**
 * Increment a numeric metric by a delta. Atomic operation.
 *
 * @param {string} key - Metric key
 * @param {number} [delta=1] - Increment amount
 * @returns {Promise<string>} New value
 */
async function incrementMetric(key, delta = 1) {
  const { rows } = await query(
    `INSERT INTO system.metrics (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET
       value = (COALESCE(system.metrics.value::numeric, 0) + $3)::text,
       updated_at = NOW()
     RETURNING value`,
    [key, String(delta), delta]
  );
  return rows[0].value;
}

/**
 * Get all system metrics as a key-value object.
 *
 * @returns {Promise<Object>} { key: value, ... }
 */
async function getAllMetrics() {
  const { rows } = await query('SELECT key, value FROM system.metrics');
  const result = {};
  for (const row of rows) result[row.key] = row.value;
  return result;
}

// ============================================================================
// AUDIT LOG
// ============================================================================

/**
 * Write an audit log entry. Records who changed what, when, with before/after values.
 * Required for IRDAI regulatory compliance.
 *
 * @param {Object} entry - Audit entry
 * @returns {Promise<Object>}
 */
async function auditLog(entry) {
  const { rows } = await query(
    `INSERT INTO system.audit_log (
      user_email, user_role, ip_address, action,
      table_name, record_id, old_values, new_values
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *`,
    [
      entry.user_email || null, entry.user_role || null,
      entry.ip_address || null, entry.action,
      entry.table_name, entry.record_id || null,
      entry.old_values ? JSON.stringify(entry.old_values) : null,
      entry.new_values ? JSON.stringify(entry.new_values) : null
    ]
  );
  return rows[0];
}

// ============================================================================
// PROCESS LOG
// ============================================================================

/**
 * Write a process log entry. Used by engines for structured trace logging.
 * All log entries in a pipeline share a correlation_id.
 *
 * @param {Object} entry - Log entry
 * @returns {Promise<Object>}
 */
async function processLog(entry) {
  const { rows } = await query(
    `INSERT INTO system.process_log (
      correlation_id, stage, category, message, data
    ) VALUES ($1,$2,$3,$4,$5)
    RETURNING *`,
    [
      entry.correlation_id || null, entry.stage,
      entry.category || 'info', entry.message || null,
      entry.data ? JSON.stringify(entry.data) : null
    ]
  );
  return rows[0];
}

/**
 * Get process log entries for a correlation ID.
 *
 * @param {string} correlationId - Pipeline correlation ID
 * @returns {Promise<Object[]>}
 */
async function getProcessLog(correlationId) {
  const { rows } = await query(
    `SELECT * FROM system.process_log
     WHERE correlation_id = $1
     ORDER BY timestamp ASC`,
    [correlationId]
  );
  return rows;
}

// ============================================================================
// SYSTEM CONFIG
// ============================================================================

/**
 * Get a system config value.
 *
 * @param {string} key - Config key
 * @returns {Promise<string|null>}
 */
async function getConfig(key) {
  const { rows } = await query(
    'SELECT value FROM system.config WHERE key = $1', [key]
  );
  return rows[0]?.value || null;
}

/**
 * Set a system config value (upsert).
 *
 * @param {string} key - Config key
 * @param {string} value - Config value
 * @param {string} [updatedBy] - Who changed it
 * @returns {Promise<void>}
 */
async function setConfig(key, value, updatedBy = 'system') {
  await query(
    `INSERT INTO system.config (key, value, updated_at, updated_by)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW(), updated_by = $3`,
    [key, value, updatedBy]
  );
}

module.exports = {
  // Events
  logEvent,
  getEvents,
  // Metrics
  getMetric,
  setMetric,
  incrementMetric,
  getAllMetrics,
  // Audit
  auditLog,
  // Process Log
  processLog,
  getProcessLog,
  // Config
  getConfig,
  setConfig,
};

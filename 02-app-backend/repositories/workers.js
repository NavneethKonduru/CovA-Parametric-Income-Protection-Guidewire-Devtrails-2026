/**
 * ============================================================================
 * Workers Repository
 * ============================================================================
 * Data access layer for the public.workers and public.worker_signals tables.
 * All methods accept dataMode as a parameter for mode-aware queries.
 * Uses parameterized queries (never string concatenation).
 * Returns plain JS objects (no ORM).
 * ============================================================================
 */

const { query, transaction, getDataMode, isAvailable } = require('../data/pg');

/**
 * Find a worker by ID.
 *
 * @param {string} id - Worker ID (e.g., 'W001', 'SIM_W050')
 * @param {string} [dataMode] - Data mode filter. Defaults to current mode.
 * @returns {Promise<Object|null>} Worker record or null
 */
async function findById(id, dataMode = getDataMode()) {
  if (!isAvailable()) {
    // Return a mock worker for the most common demo ID
    return {
      id: id || 'W001',
      name: 'Demo Worker',
      zone: 'ZONE_A',
      status: 'active',
      platform: 'Blinkit',
      hourly_rate: 120,
      daily_claims_cap: 8.0,
      upi_id: 'worker@upi',
      enrolled_date: '2026-01-01'
    };
  }
  const { rows } = await query(
    `SELECT * FROM public.workers WHERE id = $1 AND data_mode = $2`,
    [id, dataMode]
  );
  return rows[0] || null;
}

/**
 * Find all workers in a specific zone.
 *
 * @param {string} zone - Zone ID ('ZONE_A', 'ZONE_B', 'ZONE_C')
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object[]>} Array of worker records
 */
async function findByZone(zone, dataMode = getDataMode()) {
  const { rows } = await query(
    `SELECT * FROM public.workers WHERE zone = $1 AND data_mode = $2 ORDER BY id`,
    [zone, dataMode]
  );
  return rows;
}

/**
 * Find all active workers, optionally filtered by zone.
 * Used by the CDI engine to determine eligible workers for claim generation.
 *
 * @param {Object} [filters] - Optional filters
 * @param {string} [filters.zone] - Zone filter
 * @param {string} [filters.platform] - Platform filter
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object[]>} Array of active workers
 */
async function findActive(filters = {}, dataMode = getDataMode()) {
  let sql = `SELECT * FROM public.workers WHERE status = 'active' AND data_mode = $1`;
  const params = [dataMode];
  let paramIdx = 2;

  if (filters.zone) {
    sql += ` AND zone = $${paramIdx++}`;
    params.push(filters.zone);
  }
  if (filters.platform) {
    sql += ` AND platform = $${paramIdx++}`;
    params.push(filters.platform);
  }

  sql += ' ORDER BY id';
  const { rows } = await query(sql, params);
  return rows;
}

/**
 * Create a new worker.
 *
 * @param {Object} worker - Worker data
 * @param {string} [dataMode] - Data mode tag
 * @returns {Promise<Object>} Created worker record
 */
async function create(worker, dataMode = getDataMode()) {
  const { rows } = await query(
    `INSERT INTO public.workers (
      id, name, email, phone, phone_hash, aadhaar_hash,
      zone, platform, archetype, hourly_rate,
      status, enrolled_date, upi_id,
      is_simulated, daily_claims_cap, seasonal_factor, peak_hours_per_week,
      data_mode
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    RETURNING *`,
    [
      worker.id, worker.name, worker.email || null, worker.phone || null,
      worker.phone_hash || null, worker.aadhaar_hash || null,
      worker.zone, worker.platform, worker.archetype || 'balanced',
      worker.hourly_rate || 120,
      worker.status || 'active', worker.enrolled_date || new Date().toISOString().split('T')[0],
      worker.upi_id || null,
      worker.is_simulated || false, worker.daily_claims_cap || 8.0,
      worker.seasonal_factor || 1.0, worker.peak_hours_per_week || 20,
      dataMode
    ]
  );
  return rows[0];
}

/**
 * Update a worker's status. Triggers updated_at via the table trigger.
 *
 * @param {string} id - Worker ID
 * @param {string} status - New status ('active', 'inactive', 'suspended', 'churned')
 * @returns {Promise<Object|null>} Updated worker or null
 */
async function updateStatus(id, status) {
  const { rows } = await query(
    `UPDATE public.workers SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return rows[0] || null;
}

/**
 * Get the latest telemetry signals for a worker.
 *
 * @param {string} workerId - Worker ID
 * @returns {Promise<Object|null>} Worker signals or null
 */
async function getSignals(workerId) {
  const { rows } = await query(
    `SELECT * FROM public.worker_signals WHERE worker_id = $1`,
    [workerId]
  );
  return rows[0] || null;
}

/**
 * Update (upsert) worker telemetry signals. Called on every GPS ping.
 * This table only holds the LATEST state — full history goes to telemetry_raw.
 *
 * @param {string} workerId - Worker ID
 * @param {Object} signals - Signal data (lat, lng, gnss_variance, velocity, etc.)
 * @returns {Promise<Object>} Updated signals
 */
async function updateSignals(workerId, signals) {
  const { rows } = await query(
    `INSERT INTO public.worker_signals (
      worker_id, lat, lng, gnss_variance, velocity,
      zone_entry, platform_active, signal_mode,
      satellite_count, cn0_mean, cn0_stddev, signal_authenticity_score,
      device_id, device_model, os_version
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    ON CONFLICT (worker_id) DO UPDATE SET
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      gnss_variance = EXCLUDED.gnss_variance,
      velocity = EXCLUDED.velocity,
      zone_entry = COALESCE(EXCLUDED.zone_entry, public.worker_signals.zone_entry),
      platform_active = EXCLUDED.platform_active,
      signal_mode = EXCLUDED.signal_mode,
      satellite_count = EXCLUDED.satellite_count,
      cn0_mean = EXCLUDED.cn0_mean,
      cn0_stddev = EXCLUDED.cn0_stddev,
      signal_authenticity_score = EXCLUDED.signal_authenticity_score,
      device_id = EXCLUDED.device_id,
      device_model = EXCLUDED.device_model,
      os_version = EXCLUDED.os_version
    RETURNING *`,
    [
      workerId, signals.lat, signals.lng,
      signals.gnss_variance || 0, signals.velocity || 0,
      signals.zone_entry || null, signals.platform_active !== false,
      signals.signal_mode || 'auto_genuine',
      signals.satellite_count || null, signals.cn0_mean || null,
      signals.cn0_stddev || null, signals.signal_authenticity_score || null,
      signals.device_id || null, signals.device_model || null,
      signals.os_version || null
    ]
  );
  return rows[0];
}

/**
 * Count workers by zone and status. Used for dashboard aggregations.
 *
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object[]>} Array of { zone, status, count }
 */
async function countByZoneAndStatus(dataMode = getDataMode()) {
  const { rows } = await query(
    `SELECT zone, status, COUNT(*)::integer as count
     FROM public.workers
     WHERE data_mode = $1
     GROUP BY zone, status
     ORDER BY zone, status`,
    [dataMode]
  );
  return rows;
}

/**
 * Get all workers with their signals (joined). Used by the CDI engine
 * to count active peer workers per zone.
 *
 * @param {string} zone - Zone filter
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object[]>} Workers with signal data
 */
async function findActiveWithSignals(zone, dataMode = getDataMode()) {
  const { rows } = await query(
    `SELECT w.*, ws.lat, ws.lng, ws.gnss_variance, ws.velocity,
            ws.platform_active, ws.signal_mode, ws.satellite_count,
            ws.cn0_mean, ws.signal_authenticity_score
     FROM public.workers w
     LEFT JOIN public.worker_signals ws ON w.id = ws.worker_id
     WHERE w.zone = $1 AND w.status = 'active' AND w.data_mode = $2
     ORDER BY w.id`,
    [zone, dataMode]
  );
  return rows;
}

module.exports = {
  findById,
  findByZone,
  findActive,
  create,
  updateStatus,
  getSignals,
  updateSignals,
  countByZoneAndStatus,
  findActiveWithSignals,
};

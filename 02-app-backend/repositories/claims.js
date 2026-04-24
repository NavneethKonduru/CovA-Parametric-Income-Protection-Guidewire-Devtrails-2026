/**
 * ============================================================================
 * Claims Repository
 * ============================================================================
 * Data access layer for the public.claims table.
 * Handles claim lifecycle: creation → fraud check → payout → completion.
 * All queries filter by data_mode for strict mode separation.
 * ============================================================================
 */

const { query, transaction, getDataMode, isAvailable } = require('../data/pg');

/**
 * Normalize a claim row from PostgreSQL.
 * PG returns NUMERIC/DECIMAL columns as strings to preserve precision.
 * We convert them to JavaScript numbers for safe frontend consumption
 * (prevents .toFixed() / arithmetic errors on string values).
 */
function normalizeRow(row) {
  if (!row) return row;
  return {
    ...row,
    cdi: row.cdi != null ? parseFloat(row.cdi) : 0,
    payout_amount: row.payout_amount != null ? parseFloat(row.payout_amount) : 0,
    hours_lost: row.hours_lost != null ? parseFloat(row.hours_lost) : 0,
    fraud_confidence: row.fraud_confidence != null ? parseFloat(row.fraud_confidence) : 0,
  };
}

/**
 * Find a claim by ID.
 * @param {string} id - Claim ID (e.g., 'CLM_1234_ABCD1234')
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object|null>}
 */
async function findById(id, dataMode = getDataMode()) {
  const { rows } = await query(
    `SELECT * FROM public.claims WHERE id = $1 AND data_mode = $2`,
    [id, dataMode]
  );
  return rows[0] ? normalizeRow(rows[0]) : null;
}

/**
 * Find all claims for a specific worker, ordered by date descending.
 * Used by the worker app to show claim history.
 *
 * @param {string} workerId - Worker ID
 * @param {Object} [opts] - Optional filters
 * @param {number} [opts.limit=50] - Max results
 * @param {number} [opts.offset=0] - Pagination offset
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object[]>}
 */
async function findByWorker(workerId, opts = {}, dataMode = getDataMode()) {
  if (!isAvailable()) {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    return [
      {
        id: 'CLM_DEMO_001',
        worker_id: workerId,
        date: today,
        disruption_type: 'SEVERE_RAIN',
        status: 'paid',
        payout_amount: 450.00,
        cdi: 0.85,
        zone: 'ZONE_A',
        created_at: new Date().toISOString()
      },
      {
        id: 'CLM_DEMO_002',
        worker_id: workerId,
        date: yesterday,
        disruption_type: 'PLATFORM_OUTAGE',
        status: 'processing_payout',
        payout_amount: 320.00,
        cdi: 0.72,
        zone: 'ZONE_A',
        created_at: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: 'CLM_DEMO_003',
        worker_id: workerId,
        date: yesterday,
        disruption_type: 'CIVIC_CURFEW',
        status: 'pending_telemetry',
        payout_amount: 0.00,
        cdi: 0.65,
        zone: 'ZONE_A',
        created_at: new Date(Date.now() - 7200000).toISOString()
      }
    ];
  }
  const limit = opts.limit || 50;
  const offset = opts.offset || 0;
  const { rows } = await query(
    `SELECT * FROM public.claims
     WHERE worker_id = $1 AND data_mode = $2
     ORDER BY date DESC, created_at DESC
     LIMIT $3 OFFSET $4`,
    [workerId, dataMode, limit, offset]
  );
  return rows.map(normalizeRow);
}

/**
 * Find claims within a date range, optionally filtered by zone and status.
 * Used by dashboard and reporting queries.
 *
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {Object} [filters] - Optional filters
 * @param {string} [filters.zone] - Zone filter
 * @param {string} [filters.status] - Status filter
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object[]>}
 */
async function findByDateRange(startDate, endDate, filters = {}, dataMode = getDataMode()) {
  if (!isAvailable()) {
    return findByWorker('DEMO_ALL'); // Return same mock set
  }
  let sql = `SELECT * FROM public.claims WHERE date BETWEEN $1 AND $2 AND data_mode = $3`;
  const params = [startDate, endDate, dataMode];
  let idx = 4;

  if (filters.zone) {
    sql += ` AND zone = $${idx++}`;
    params.push(filters.zone);
  }
  if (filters.status) {
    sql += ` AND status = $${idx++}`;
    params.push(filters.status);
  }

  sql += ' ORDER BY date DESC, created_at DESC';
  const { rows } = await query(sql, params);
  return rows.map(normalizeRow);
}

/**
 * Create a new claim. This is step 10 in the claim processing flow.
 * The claim starts with status = 'pending' and goes through fraud check.
 *
 * @param {Object} claim - Claim data
 * @param {string} [dataMode] - Data mode tag
 * @returns {Promise<Object>} Created claim
 */
async function create(claim, dataMode = getDataMode()) {
  const { rows } = await query(
    `INSERT INTO public.claims (
      id, worker_id, policy_id, worker_name,
      zone, disruption_type, date, time_slot, hours_lost,
      cdi, trigger_level,
      validation_status, validation_reason,
      payout_amount, payout_txn_id,
      ai_explanation, fraud_result, fraud_confidence,
      status, data_mode
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    RETURNING *`,
    [
      claim.id, claim.worker_id, claim.policy_id || null, claim.worker_name || null,
      claim.zone, claim.disruption_type, claim.date, claim.time_slot, claim.hours_lost,
      claim.cdi, claim.trigger_level,
      claim.validation_status || 'approved', claim.validation_reason || null,
      claim.payout_amount || 0, claim.payout_txn_id || null,
      claim.ai_explanation || null,
      claim.fraud_result ? JSON.stringify(claim.fraud_result) : null,
      claim.fraud_confidence || 0,
      claim.status || 'pending', dataMode
    ]
  );
  return rows[0] ? normalizeRow(rows[0]) : null;
}

/**
 * Update a claim's status. Used throughout the claim lifecycle:
 * pending → pending_payment → paid (happy path)
 * pending → flagged (fraud detected)
 * pending → rejected (validation failed)
 *
 * @param {string} id - Claim ID
 * @param {string} status - New status
 * @param {Object} [updates] - Additional fields to update
 * @returns {Promise<Object|null>}
 */
async function updateStatus(id, status, updates = {}) {
  const setClauses = ['status = $1'];
  const params = [status];
  let idx = 2;

  if (updates.payout_amount !== undefined) {
    setClauses.push(`payout_amount = $${idx++}`);
    params.push(updates.payout_amount);
  }
  if (updates.payout_txn_id !== undefined) {
    setClauses.push(`payout_txn_id = $${idx++}`);
    params.push(updates.payout_txn_id);
  }
  if (updates.ai_explanation !== undefined) {
    setClauses.push(`ai_explanation = $${idx++}`);
    params.push(updates.ai_explanation);
  }
  if (updates.fraud_result !== undefined) {
    setClauses.push(`fraud_result = $${idx++}`);
    params.push(JSON.stringify(updates.fraud_result));
  }
  if (updates.fraud_confidence !== undefined) {
    setClauses.push(`fraud_confidence = $${idx++}`);
    params.push(updates.fraud_confidence);
  }
  if (updates.validation_status !== undefined) {
    setClauses.push(`validation_status = $${idx++}`);
    params.push(updates.validation_status);
  }
  if (updates.validation_reason !== undefined) {
    setClauses.push(`validation_reason = $${idx++}`);
    params.push(updates.validation_reason);
  }

  params.push(id);
  const { rows } = await query(
    `UPDATE public.claims SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return rows[0] ? normalizeRow(rows[0]) : null;
}

/**
 * Count claims for a worker on a specific date. Used for daily cap enforcement.
 * A worker cannot claim more than daily_claims_cap hours per day.
 *
 * @param {string} workerId - Worker ID
 * @param {string} date - Date (YYYY-MM-DD)
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<{count: number, total_hours: number}>}
 */
async function countByWorkerAndDate(workerId, date, dataMode = getDataMode()) {
  const { rows } = await query(
    `SELECT COUNT(*)::integer as count,
            COALESCE(SUM(hours_lost), 0)::numeric as total_hours
     FROM public.claims
     WHERE worker_id = $1 AND date = $2 AND data_mode = $3
       AND status NOT IN ('rejected')`,
    [workerId, date, dataMode]
  );
  return rows[0];
}

/**
 * Get daily claim summary for dashboard. Groups claims by date with aggregated metrics.
 *
 * @param {number} [days=30] - Number of days to look back
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object[]>} Daily summaries
 */
async function getDailySummary(days = 30, dataMode = getDataMode()) {
  const { rows } = await query(
    `SELECT date,
            COUNT(*)::integer as total_claims,
            COUNT(*) FILTER (WHERE status = 'paid')::integer as paid,
            COUNT(*) FILTER (WHERE status = 'rejected')::integer as rejected,
            COUNT(*) FILTER (WHERE status = 'flagged')::integer as flagged,
            COALESCE(SUM(payout_amount) FILTER (WHERE status = 'paid'), 0) as total_payout,
            COALESCE(AVG(cdi), 0)::numeric(6,4) as avg_cdi,
            COUNT(DISTINCT worker_id)::integer as unique_workers
     FROM public.claims
     WHERE date >= CURRENT_DATE - $1::integer AND data_mode = $2
     GROUP BY date
     ORDER BY date DESC`,
    [days, dataMode]
  );
  return rows;
}

/**
 * Get claims with high fraud confidence for review.
 * Used by the fraud dashboard and admin panel.
 *
 * @param {number} [threshold=0.45] - Minimum fraud confidence
 * @param {number} [limit=50] - Max results
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object[]>}
 */
async function findFlagged(threshold = 0.45, limit = 50, dataMode = getDataMode()) {
  const { rows } = await query(
    `SELECT * FROM public.claims
     WHERE fraud_confidence > $1 AND data_mode = $2
     ORDER BY fraud_confidence DESC, created_at DESC
     LIMIT $3`,
    [threshold, dataMode, limit]
  );
  return rows.map(normalizeRow);
}

module.exports = {
  findById,
  findByWorker,
  findByDateRange,
  create,
  updateStatus,
  countByWorkerAndDate,
  getDailySummary,
  findFlagged,
};

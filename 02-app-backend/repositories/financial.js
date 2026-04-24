/**
 * ============================================================================
 * Financial Repository
 * ============================================================================
 * Data access layer for the financial schema: premium_collections,
 * daily_snapshots, actuarial_projections, and profit_loss.
 *
 * Handles premium tracking, daily metrics aggregation, and P&L recording.
 * ============================================================================
 */

const { query, queryReplica, getDataMode } = require('../data/pg');

/**
 * Record a premium collection event.
 *
 * @param {Object} premium - Premium data
 * @param {string} [dataMode] - Data mode tag
 * @returns {Promise<Object>}
 */
async function recordPremium(premium, dataMode = getDataMode()) {
  const { rows } = await query(
    `INSERT INTO financial.premium_collections (
      policy_id, worker_id, amount, collection_date,
      payment_method, payment_ref, status,
      base_premium, zone_loading, seasonal_loading, claims_history_adj,
      data_mode
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *`,
    [
      premium.policy_id, premium.worker_id, premium.amount,
      premium.collection_date, premium.payment_method || 'UPI',
      premium.payment_ref || null, premium.status || 'collected',
      premium.base_premium || null, premium.zone_loading || null,
      premium.seasonal_loading || null, premium.claims_history_adj || null,
      dataMode
    ]
  );
  return rows[0];
}

/**
 * Get or create a daily snapshot. Uses UPSERT with composite PK (date, data_mode).
 *
 * @param {string} date - Date (YYYY-MM-DD)
 * @param {string} [dataMode] - Data mode
 * @returns {Promise<Object>} The snapshot row
 */
async function getDailySnapshot(date, dataMode = getDataMode()) {
  const { rows } = await query(
    `SELECT * FROM financial.daily_snapshots WHERE date = $1 AND data_mode = $2`,
    [date, dataMode]
  );
  return rows[0] || null;
}

/**
 * Upsert a daily snapshot with aggregated metrics.
 * Called by the end-of-day batch job or on-demand from the dashboard.
 *
 * @param {Object} snapshot - Snapshot data
 * @param {string} [dataMode] - Data mode tag
 * @returns {Promise<Object>}
 */
async function upsertDailySnapshot(snapshot, dataMode = getDataMode()) {
  const { rows } = await query(
    `INSERT INTO financial.daily_snapshots (
      date, claims_count, claims_paid, claims_rejected, claims_flagged,
      total_payout, premium_collected,
      loss_ratio, expense_ratio, combined_ratio,
      fraud_attempts, fraud_blocked, fraud_detection_rate,
      env_changes, avg_cdi, active_workers, active_policies,
      data_mode
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    ON CONFLICT (date, data_mode) DO UPDATE SET
      claims_count = EXCLUDED.claims_count,
      claims_paid = EXCLUDED.claims_paid,
      claims_rejected = EXCLUDED.claims_rejected,
      claims_flagged = EXCLUDED.claims_flagged,
      total_payout = EXCLUDED.total_payout,
      premium_collected = EXCLUDED.premium_collected,
      loss_ratio = EXCLUDED.loss_ratio,
      expense_ratio = EXCLUDED.expense_ratio,
      combined_ratio = EXCLUDED.combined_ratio,
      fraud_attempts = EXCLUDED.fraud_attempts,
      fraud_blocked = EXCLUDED.fraud_blocked,
      fraud_detection_rate = EXCLUDED.fraud_detection_rate,
      env_changes = EXCLUDED.env_changes,
      avg_cdi = EXCLUDED.avg_cdi,
      active_workers = EXCLUDED.active_workers,
      active_policies = EXCLUDED.active_policies
    RETURNING *`,
    [
      snapshot.date,
      snapshot.claims_count || 0, snapshot.claims_paid || 0,
      snapshot.claims_rejected || 0, snapshot.claims_flagged || 0,
      snapshot.total_payout || 0, snapshot.premium_collected || 0,
      snapshot.loss_ratio || 0, snapshot.expense_ratio || 0,
      snapshot.combined_ratio || 0,
      snapshot.fraud_attempts || 0, snapshot.fraud_blocked || 0,
      snapshot.fraud_detection_rate || 100,
      snapshot.env_changes || 0, snapshot.avg_cdi || 0,
      snapshot.active_workers || 0, snapshot.active_policies || 0,
      dataMode
    ]
  );
  return rows[0];
}

/**
 * Get daily snapshots for a date range. Used by dashboard financial charts.
 *
 * @param {number} [days=30] - Number of days to look back
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object[]>}
 */
async function getSnapshotRange(days = 30, dataMode = getDataMode()) {
  const { rows } = await queryReplica(
    `SELECT * FROM financial.daily_snapshots
     WHERE date >= CURRENT_DATE - $1::integer AND data_mode = $2
     ORDER BY date ASC`,
    [days, dataMode]
  );
  return rows;
}

/**
 * Create an actuarial projection.
 *
 * @param {Object} projection - Projection data
 * @param {string} [dataMode] - Data mode tag
 * @returns {Promise<Object>}
 */
async function createProjection(projection, dataMode = getDataMode()) {
  const { rows } = await query(
    `INSERT INTO financial.actuarial_projections (
      projection_type, period_start, period_end,
      expected_claims, expected_payout, expected_premium_income,
      expected_loss_ratio, total_risk_exposure, var_95, var_99,
      confidence_level, model_version, assumptions, data_mode
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *`,
    [
      projection.projection_type, projection.period_start, projection.period_end,
      projection.expected_claims || null, projection.expected_payout || null,
      projection.expected_premium_income || null,
      projection.expected_loss_ratio || null,
      projection.total_risk_exposure || null,
      projection.var_95 || null, projection.var_99 || null,
      projection.confidence_level || null, projection.model_version || null,
      JSON.stringify(projection.assumptions || {}), dataMode
    ]
  );
  return rows[0];
}

/**
 * Record a profit/loss entry for a period.
 *
 * @param {Object} pnl - P&L data
 * @param {string} [dataMode] - Data mode tag
 * @returns {Promise<Object>}
 */
async function recordProfitLoss(pnl, dataMode = getDataMode()) {
  const { rows } = await query(
    `INSERT INTO financial.profit_loss (
      period_type, period_start, period_end,
      premium_income, other_income,
      claims_payout, operating_expenses, reinsurance_costs,
      loss_ratio, data_mode
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *`,
    [
      pnl.period_type, pnl.period_start, pnl.period_end,
      pnl.premium_income || 0, pnl.other_income || 0,
      pnl.claims_payout || 0, pnl.operating_expenses || 0,
      pnl.reinsurance_costs || 0, pnl.loss_ratio || null,
      dataMode
    ]
  );
  return rows[0];
}

module.exports = {
  recordPremium,
  getDailySnapshot,
  upsertDailySnapshot,
  getSnapshotRange,
  createProjection,
  recordProfitLoss,
};

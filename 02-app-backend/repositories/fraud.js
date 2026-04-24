/**
 * ============================================================================
 * Fraud Repository
 * ============================================================================
 * Data access layer for the fraud schema: detection_log, risk_scores,
 * device_blacklist, and anomaly_detections.
 *
 * Handles TCHC fraud analysis results, risk trend tracking, and device banning.
 * ============================================================================
 */

const { query, getDataMode } = require('../data/pg');

/**
 * Log a fraud detection result. Called after every claim's TCHC analysis.
 * One detection_log row per claim — records the full TCHC verdict.
 *
 * @param {Object} detection - Fraud detection result
 * @param {string} [dataMode] - Data mode tag
 * @returns {Promise<Object>}
 */
async function logDetection(detection, dataMode = getDataMode()) {
  const { rows } = await query(
    `INSERT INTO fraud.detection_log (
      claim_id, worker_id, fraud_score, risk_level, action,
      hardware_layer, temporal_layer, spatial_layer,
      flags, total_flags, safeguards_applied,
      rules_triggered, decision_explanation, data_mode
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *`,
    [
      detection.claim_id, detection.worker_id,
      detection.fraud_score, detection.risk_level, detection.action,
      detection.hardware_layer || false,
      detection.temporal_layer || false,
      detection.spatial_layer || false,
      JSON.stringify(detection.flags || []),
      detection.total_flags || 0,
      detection.safeguards_applied || 0,
      detection.rules_triggered || [],
      detection.decision_explanation || null,
      dataMode
    ]
  );
  return rows[0];
}

/**
 * Get fraud detection history for a worker. Used for repeat-offender analysis.
 *
 * @param {string} workerId - Worker ID
 * @param {number} [limit=20] - Max results
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object[]>}
 */
async function getDetectionsByWorker(workerId, limit = 20, dataMode = getDataMode()) {
  const { rows } = await query(
    `SELECT * FROM fraud.detection_log
     WHERE worker_id = $1 AND data_mode = $2
     ORDER BY created_at DESC LIMIT $3`,
    [workerId, dataMode, limit]
  );
  return rows;
}

/**
 * Record a risk score snapshot (per worker, zone, or time window).
 *
 * @param {Object} score - Risk score data
 * @param {string} [dataMode] - Data mode tag
 * @returns {Promise<Object>}
 */
async function recordRiskScore(score, dataMode = getDataMode()) {
  const { rows } = await query(
    `INSERT INTO fraud.risk_scores (
      scope_type, worker_id, zone, time_window,
      risk_score, claim_frequency, fraud_rate, anomaly_score,
      contributing_factors, data_mode
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *`,
    [
      score.scope_type, score.worker_id || null,
      score.zone || null, score.time_window || null,
      score.risk_score, score.claim_frequency || null,
      score.fraud_rate || null, score.anomaly_score || null,
      JSON.stringify(score.contributing_factors || {}),
      dataMode
    ]
  );
  return rows[0];
}

/**
 * Get latest risk scores for a worker or zone.
 *
 * @param {string} scopeType - 'worker', 'zone', or 'time_window'
 * @param {string} entityId - Worker ID or zone ID
 * @param {number} [limit=10] - Max results
 * @returns {Promise<Object[]>}
 */
async function getRiskScores(scopeType, entityId, limit = 10) {
  const field = scopeType === 'worker' ? 'worker_id' : 'zone';
  const { rows } = await query(
    `SELECT * FROM fraud.risk_scores
     WHERE scope_type = $1 AND ${field} = $2
     ORDER BY computed_at DESC LIMIT $3`,
    [scopeType, entityId, limit]
  );
  return rows;
}

/**
 * Add a device to the blacklist. Blacklisted devices trigger immediate
 * fraud flags on any claim submission.
 *
 * @param {Object} entry - Blacklist entry
 * @returns {Promise<Object>}
 */
async function blacklistDevice(entry) {
  const { rows } = await query(
    `INSERT INTO fraud.device_blacklist (device_id, reason, worker_id, claim_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (device_id) DO UPDATE SET
       reason = EXCLUDED.reason,
       is_active = TRUE,
       blacklisted_at = NOW()
     RETURNING *`,
    [
      entry.device_id, entry.reason,
      entry.worker_id || null, entry.claim_id || null,
      entry.expires_at || null
    ]
  );
  return rows[0];
}

/**
 * Check if a device is blacklisted.
 *
 * @param {string} deviceId - Device identifier
 * @returns {Promise<Object|null>} Blacklist entry or null
 */
async function checkBlacklist(deviceId) {
  const { rows } = await query(
    `SELECT * FROM fraud.device_blacklist
     WHERE device_id = $1 AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [deviceId]
  );
  return rows[0] || null;
}

/**
 * Log an anomaly detection (statistical or ML-detected pattern).
 *
 * @param {Object} anomaly - Anomaly data
 * @param {string} [dataMode] - Data mode tag
 * @returns {Promise<Object>}
 */
async function logAnomaly(anomaly, dataMode = getDataMode()) {
  const { rows } = await query(
    `INSERT INTO fraud.anomaly_detections (
      detection_type, entity_type, entity_id, description,
      severity, confidence, detection_data, data_mode
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *`,
    [
      anomaly.detection_type, anomaly.entity_type,
      anomaly.entity_id || null, anomaly.description,
      anomaly.severity || 'medium', anomaly.confidence || null,
      anomaly.detection_data ? JSON.stringify(anomaly.detection_data) : null,
      dataMode
    ]
  );
  return rows[0];
}

module.exports = {
  logDetection,
  getDetectionsByWorker,
  recordRiskScore,
  getRiskScores,
  blacklistDevice,
  checkBlacklist,
  logAnomaly,
};

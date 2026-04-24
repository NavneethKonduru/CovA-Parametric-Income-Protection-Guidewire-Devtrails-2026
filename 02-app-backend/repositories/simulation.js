/**
 * ============================================================================
 * Simulation Repository
 * ============================================================================
 * Data access layer for the simulation schema: runs, events, scenario_library,
 * insurer_simulations, and state.
 *
 * Manages demo mode execution tracking and insurer "what-if" analysis.
 * ============================================================================
 */

const { query, getDataMode } = require('../data/pg');

/**
 * Create a new simulation run. Called when the autonomous engine starts
 * or when an insurer triggers a what-if simulation.
 *
 * @param {Object} run - Run configuration
 * @returns {Promise<Object>} Created run with UUID
 */
async function createRun(run) {
  const { rows } = await query(
    `INSERT INTO simulation.runs (
      run_type, scenario_name, config, cycle_interval_ms,
      status, initiated_by
    ) VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *`,
    [
      run.run_type, run.scenario_name || null,
      JSON.stringify(run.config || {}),
      run.cycle_interval_ms || 60000,
      'running', run.initiated_by || 'system'
    ]
  );
  return rows[0];
}

/**
 * End a simulation run. Records final metrics and marks as completed.
 *
 * @param {string} runId - UUID of the run
 * @param {Object} [metrics] - Final metrics
 * @returns {Promise<Object|null>}
 */
async function endRun(runId, metrics = {}) {
  const { rows } = await query(
    `UPDATE simulation.runs SET
      status = $2,
      ended_at = NOW(),
      duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at)),
      total_events = COALESCE($3, total_events),
      total_claims = COALESCE($4, total_claims),
      total_fraud = COALESCE($5, total_fraud),
      total_payout = COALESCE($6, total_payout)
     WHERE id = $1
     RETURNING *`,
    [
      runId, metrics.status || 'completed',
      metrics.total_events || null, metrics.total_claims || null,
      metrics.total_fraud || null, metrics.total_payout || null
    ]
  );
  return rows[0] || null;
}

/**
 * Log a simulation event within a run.
 *
 * @param {Object} event - Event data
 * @returns {Promise<Object>}
 */
async function logEvent(event) {
  const { rows } = await query(
    `INSERT INTO simulation.events (
      run_id, event_type, zone, event_data,
      weather_preset, max_cdi, claims_generated, fraud_blocked
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *`,
    [
      event.run_id, event.event_type,
      event.zone || null, JSON.stringify(event.event_data || {}),
      event.weather_preset || null, event.max_cdi || null,
      event.claims_generated || 0, event.fraud_blocked || 0
    ]
  );
  return rows[0];
}

/**
 * Get all active scenarios from the scenario library.
 *
 * @returns {Promise<Object[]>}
 */
async function getScenarios() {
  const { rows } = await query(
    `SELECT * FROM simulation.scenario_library WHERE is_active = TRUE ORDER BY id`
  );
  return rows;
}

/**
 * Get a specific scenario by ID.
 *
 * @param {string} scenarioId - Scenario ID
 * @returns {Promise<Object|null>}
 */
async function getScenarioById(scenarioId) {
  const { rows } = await query(
    `SELECT * FROM simulation.scenario_library WHERE id = $1`,
    [scenarioId]
  );
  return rows[0] || null;
}

/**
 * Get the current simulation state (singleton row, id=1).
 *
 * @returns {Promise<Object|null>}
 */
async function getState() {
  const { rows } = await query(
    `SELECT * FROM simulation.state WHERE id = 1`
  );
  return rows[0] || null;
}

/**
 * Update the simulation state. Called every cycle by the autonomous engine.
 *
 * @param {Object} state - State updates
 * @returns {Promise<Object>}
 */
async function updateState(state) {
  const { rows } = await query(
    `INSERT INTO simulation.state (id, current_scenario, active_since,
      simulated_conditions, current_run_id, escalation_factor,
      storm_propagation_pct, cycle_count)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       current_scenario = COALESCE(EXCLUDED.current_scenario, simulation.state.current_scenario),
       active_since = COALESCE(EXCLUDED.active_since, simulation.state.active_since),
       simulated_conditions = COALESCE(EXCLUDED.simulated_conditions, simulation.state.simulated_conditions),
       current_run_id = COALESCE(EXCLUDED.current_run_id, simulation.state.current_run_id),
       escalation_factor = COALESCE(EXCLUDED.escalation_factor, simulation.state.escalation_factor),
       storm_propagation_pct = COALESCE(EXCLUDED.storm_propagation_pct, simulation.state.storm_propagation_pct),
       cycle_count = COALESCE(EXCLUDED.cycle_count, simulation.state.cycle_count)
     RETURNING *`,
    [
      state.current_scenario || null,
      state.active_since || null,
      state.simulated_conditions ? JSON.stringify(state.simulated_conditions) : null,
      state.current_run_id || null,
      state.escalation_factor || null,
      state.storm_propagation_pct || null,
      state.cycle_count || null
    ]
  );
  return rows[0];
}

/**
 * Create an insurer simulation (what-if analysis).
 *
 * @param {Object} sim - Simulation parameters
 * @returns {Promise<Object>}
 */
async function createInsurerSimulation(sim) {
  const { rows } = await query(
    `INSERT INTO simulation.insurer_simulations (
      insurer_id, simulation_name, assumptions, weather_scenario,
      worker_count, simulation_months, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *`,
    [
      sim.insurer_id || null, sim.simulation_name,
      JSON.stringify(sim.assumptions), sim.weather_scenario || null,
      sim.worker_count, sim.simulation_months || 12,
      'pending'
    ]
  );
  return rows[0];
}

/**
 * Update an insurer simulation with results.
 *
 * @param {string} simId - UUID of the simulation
 * @param {Object} results - Simulation results
 * @returns {Promise<Object>}
 */
async function updateInsurerSimulation(simId, results) {
  const { rows } = await query(
    `UPDATE simulation.insurer_simulations SET
      projected_premium_income = $2,
      projected_claims = $3,
      projected_payouts = $4,
      projected_loss_ratio = $5,
      projected_profit = $6,
      monthly_breakdown = $7,
      risk_metrics = $8,
      status = 'completed',
      completed_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      simId,
      results.projected_premium_income, results.projected_claims,
      results.projected_payouts, results.projected_loss_ratio,
      results.projected_profit,
      JSON.stringify(results.monthly_breakdown || {}),
      JSON.stringify(results.risk_metrics || {})
    ]
  );
  return rows[0] || null;
}

module.exports = {
  createRun,
  endRun,
  logEvent,
  getScenarios,
  getScenarioById,
  getState,
  updateState,
  createInsurerSimulation,
  updateInsurerSimulation,
};

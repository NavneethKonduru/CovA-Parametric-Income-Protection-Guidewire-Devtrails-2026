const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const db = require('../data/db');

// ============================================================
// CDI WEIGHTS
// ============================================================

/**
 * GET /api/admin/cdi-weights
 * Returns current CDI signal weights
 */
router.get('/cdi-weights', requireRole('admin'), (req, res) => {
  const row = db.prepare("SELECT value FROM admin_config WHERE key = 'cdi_weights'").get();
  const weights = row ? JSON.parse(row.value) : { weather: 0.40, demand: 0.35, peer: 0.25 };
  res.json({ weights, sum: parseFloat((weights.weather + weights.demand + weights.peer).toFixed(2)) });
});

/**
 * PATCH /api/admin/cdi-weights
 * Update CDI weights. Must sum to 1.0.
 * Body: { weather: 0.5, demand: 0.3, peer: 0.2 }
 */
router.patch('/cdi-weights', requireRole('admin'), (req, res) => {
  const { weather, demand, peer } = req.body;

  if (weather == null || demand == null || peer == null) {
    return res.status(400).json({ error: 'All three weights required: weather, demand, peer' });
  }

  const sum = parseFloat((weather + demand + peer).toFixed(2));
  if (sum !== 1.0) {
    return res.status(400).json({ error: `Weights must sum to 1.0, got ${sum}` });
  }

  const newWeights = { weather, demand, peer };
  db.prepare(`
    INSERT OR REPLACE INTO admin_config (key, value, updated_at)
    VALUES ('cdi_weights', ?, CURRENT_TIMESTAMP)
  `).run(JSON.stringify(newWeights));

  if (req.app.locals.broadcastEvent) {
    req.app.locals.broadcastEvent('CDI_WEIGHTS_UPDATED', newWeights);
  }

  console.log(`[ADMIN] CDI weights updated:`, newWeights);
  res.json({ message: 'CDI weights updated', weights: newWeights, sum });
});

/**
 * GET /api/admin/cdi-config
 * Returns current CDI strategy and signal decorrelation settings
 */
router.get('/cdi-config', requireRole('admin'), (req, res) => {
  const strategyRow = db.prepare("SELECT value FROM admin_config WHERE key = 'cdi_strategy'").get();
  const decorrelateRow = db.prepare("SELECT value FROM admin_config WHERE key = 'decorrelate_signals'").get();
  
  res.json({
    strategy: strategyRow ? strategyRow.value : 'weighted_sum',
    decorrelate: decorrelateRow ? JSON.parse(decorrelateRow.value) : false
  });
});

/**
 * POST /api/admin/cdi-config
 * Update CDI strategy and signal decorrelation settings
 * Body: { strategy: 'weighted_sum' | 'any_dominant' | 'min_two_factors', decorrelate: boolean }
 */
router.post('/cdi-config', requireRole('admin'), (req, res) => {
  const { strategy, decorrelate } = req.body;
  
  if (strategy) {
    db.prepare(`
      INSERT OR REPLACE INTO admin_config (key, value, updated_at)
      VALUES ('cdi_strategy', ?, CURRENT_TIMESTAMP)
    `).run(strategy);
  }
  
  if (decorrelate !== undefined) {
    db.prepare(`
      INSERT OR REPLACE INTO admin_config (key, value, updated_at)
      VALUES ('decorrelate_signals', ?, CURRENT_TIMESTAMP)
    `).run(JSON.stringify(decorrelate));
  }
  
  // Sync in-memory claims engine state
  const { setCDIStrategy, setDecorrelateSignals } = require('../engines/claims');
  if (strategy) setCDIStrategy(strategy);
  if (decorrelate !== undefined) setDecorrelateSignals(decorrelate);

  if (req.app.locals.broadcastEvent) {
    req.app.locals.broadcastEvent('CDI_CONFIG_UPDATED', { strategy, decorrelate });
  }

  console.log(`[ADMIN] CDI config updated: strategy=${strategy}, decorrelate=${decorrelate}`);
  res.json({ message: 'CDI config updated', strategy, decorrelate });
});

// ============================================================
// FRAUD RULES
// ============================================================

/**
 * GET /api/admin/fraud-rules
 * Returns current fraud rule configuration
 */
router.get('/fraud-rules', requireRole('admin'), (req, res) => {
  const row = db.prepare("SELECT value FROM admin_config WHERE key = 'fraud_rules'").get();
  const rules = row ? JSON.parse(row.value) : getDefaultFraudRules();
  res.json({ rules });
});

/**
 * PATCH /api/admin/fraud-rules
 * Update fraud rule thresholds/enabled status
 * Body: { FREQUENCY_ANOMALY: { enabled: true, threshold: 3 }, ... }
 */
router.patch('/fraud-rules', requireRole('admin'), (req, res) => {
  const updates = req.body;
  const row = db.prepare("SELECT value FROM admin_config WHERE key = 'fraud_rules'").get();
  const current = row ? JSON.parse(row.value) : getDefaultFraudRules();

  // Merge updates into current rules
  for (const [ruleName, ruleUpdate] of Object.entries(updates)) {
    if (current[ruleName]) {
      Object.assign(current[ruleName], ruleUpdate);
    }
  }

  db.prepare(`
    INSERT OR REPLACE INTO admin_config (key, value, updated_at)
    VALUES ('fraud_rules', ?, CURRENT_TIMESTAMP)
  `).run(JSON.stringify(current));

  console.log(`[ADMIN] Fraud rules updated`);
  res.json({ message: 'Fraud rules updated', rules: current });
});

// ============================================================
// ZONE RISK FACTORS
// ============================================================

/**
 * GET /api/admin/zone-risks
 * Returns zone risk factor multipliers
 */
router.get('/zone-risks', requireRole('admin'), (req, res) => {
  const row = db.prepare("SELECT value FROM admin_config WHERE key = 'zone_risk_factors'").get();
  const factors = row ? JSON.parse(row.value) : { ZONE_A: 1.0, ZONE_B: 1.3, ZONE_C: 0.8 };
  res.json({ factors });
});

/**
 * PATCH /api/admin/zone-risks
 * Body: { ZONE_A: 1.1, ZONE_B: 1.5 }
 */
router.patch('/zone-risks', requireRole('admin'), (req, res) => {
  const row = db.prepare("SELECT value FROM admin_config WHERE key = 'zone_risk_factors'").get();
  const current = row ? JSON.parse(row.value) : { ZONE_A: 1.0, ZONE_B: 1.3, ZONE_C: 0.8 };

  Object.assign(current, req.body);

  db.prepare(`
    INSERT OR REPLACE INTO admin_config (key, value, updated_at)
    VALUES ('zone_risk_factors', ?, CURRENT_TIMESTAMP)
  `).run(JSON.stringify(current));

  console.log(`[ADMIN] Zone risk factors updated:`, current);
  res.json({ message: 'Zone risk factors updated', factors: current });
});

// ============================================================
// DEMO CONTROLS
// ============================================================

/**
 * DELETE /api/demo/reset
 * Clear all claims and disruption events for a fresh demo
 */
router.delete('/reset', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM claims').run();
  db.prepare('DELETE FROM disruption_events').run();

  if (req.app.locals.broadcastEvent) {
    req.app.locals.broadcastEvent('DEMO_RESET', { timestamp: new Date().toISOString() });
  }

  console.log('[ADMIN] Demo state reset');
  res.json({ message: 'Demo state reset', timestamp: new Date().toISOString() });
});

/**
 * POST /api/demo/simulate
 * Trigger a simulation scenario from the scenario engine
 * Body: { scenario: "WHITEFIELD_MONSOON" | "FRAUD_ATTACK" | "PLATFORM_OUTAGE" | "MIXED_ATTACK" | "SECTION_144" | "CLEAR_ALL" }
 * Also supports legacy names: monsoon_zone_b, clear_weather, fraud_ghost_workers
 */
router.post('/simulate', requireRole('admin'), async (req, res) => {
  const { scenario, zone } = req.body;

  // Map legacy names to new scenario keys
  const legacyMap = {
    monsoon_zone_b: 'WHITEFIELD_MONSOON',
    clear_weather: 'CLEAR_ALL',
    fraud_ghost_workers: 'FRAUD_ATTACK'
  };

  const scenarioKey = legacyMap[scenario] || scenario;

  try {
    const { activateScenario } = require('../simulation/scenario-engine');
    const result = await activateScenario(scenarioKey, db, req.app.locals.broadcastEvent, { zone });
    console.log(`[ADMIN] Simulation: ${scenarioKey} ${zone ? `in ${zone}` : ''}`, result.scenario);

    if (req.app.locals.broadcastEvent) {
      req.app.locals.broadcastEvent('SIMULATION_TRIGGERED', { scenario: scenarioKey, zone, ...result });
    }

    res.json({ message: `Simulation '${scenarioKey}' triggered ${zone ? `in ${zone}` : ''}`, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/demo/scenarios
 * List all available simulation scenarios
 */
router.get('/scenarios', requireRole('admin'), (req, res) => {
  try {
    const { getAvailableScenarios } = require('../simulation/scenario-engine');
    res.json({ scenarios: getAvailableScenarios() });
  } catch (err) {
    res.status(500).json({ error: 'Scenario engine not available' });
  }
});

/**
 * POST /api/demo/simulate-custom
 * Custom simulation with individual condition parameters
 * Body: { zone, weather, demand, fraud }
 */
router.post('/simulate-custom', requireRole('admin'), async (req, res) => {
  const { zone, weather, demand, fraud } = req.body;
  
  try {
    const { executeCustomSimulation } = require('../simulation/scenario-engine');
    const result = await executeCustomSimulation(
      { zone, weather, demand, fraud },
      db,
      req.app.locals.broadcastEvent
    );
    
    res.json({ message: 'Custom simulation executed', result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/demo/simulation-options
 * Return available options for the simulation builder dropdowns
 */
router.get('/simulation-options', requireRole('admin'), (req, res) => {
  res.json({
    zones: ["ZONE_A", "ZONE_B", "ZONE_C", "ALL"],
    weatherPresets: {
      clear: { label: "Clear", severity: 0.05 },
      moderate_rain: { label: "Moderate Rain", severity: 0.50 },
      heavy_rain: { label: "Heavy Rain", severity: 0.85 },
      extreme_heat: { label: "Extreme Heat", severity: 0.80 },
      cyclone: { label: "Cyclone", severity: 1.00 }
    },
    demandLevels: {
      normal: { label: "Normal", score: 0.10 },
      moderate: { label: "Moderate Drop", score: 0.50 },
      severe: { label: "Severe Drop", score: 0.75 },
      collapse: { label: "Demand Collapse", score: 0.90 },
      outage: { label: "Platform Outage", score: 1.00 }
    },
    platformStatuses: ["normal", "degraded", "suspended", "outage"],
    fraudOptions: [0, 5, 10, 15]
  });
});

// ============================================================
// EXTERNAL ENVIRONMENT FACTORS
// ============================================================

const axios = require('axios');
const EXT_PORT = process.env.PORT || 3001;
const EXT_BASE = `http://localhost:${EXT_PORT}`;

/**
 * POST /api/admin/external-factors
 * Apply external environment factors from the Admin Panel.
 * Translates zone weather/demand overrides into mock API updates.
 * Body: { zones: { ZONE_A: { weather, demand }, ... }, platforms: { ... }, civic: { ... } }
 */
router.post('/external-factors', requireRole('admin'), async (req, res) => {
  const { zones, platforms, civic } = req.body;
  const results = { weather: [], demand: [], platforms: {}, civic: null };

  try {
    // 1. Apply per-zone weather and demand
    if (zones) {
      for (const [zone, config] of Object.entries(zones)) {
        // Weather preset
        if (config.weather) {
          try {
            await axios.post(`${EXT_BASE}/mock/weather/set/${zone}`, { preset: config.weather });
            results.weather.push({ zone, preset: config.weather, status: 'applied' });
          } catch (e) {
            results.weather.push({ zone, preset: config.weather, status: 'error', error: e.message });
          }
        }

        // Demand level (0-100 scale from slider → demand_score 0-1)
        if (config.demand !== undefined) {
          const demandPct = config.demand; // 0-100
          const demandScore = parseFloat(((100 - demandPct) / 100).toFixed(3)); // 100% = 0.0 score, 0% = 1.0
          const ordersPerHour = Math.round((demandPct / 100) * 85); // scale to baseline ~85
          try {
            await axios.post(`${EXT_BASE}/mock/demand/set/${zone}`, {
              demand_score: demandScore,
              orders_per_hour: ordersPerHour
            });
            results.demand.push({ zone, demandPct, demandScore, status: 'applied' });
          } catch (e) {
            results.demand.push({ zone, demandPct, status: 'error', error: e.message });
          }
        }
      }
    }

    // 2. Apply platform status overrides
    if (platforms) {
      for (const [platform, status] of Object.entries(platforms)) {
        results.platforms[platform] = status;
        // Platform status is applied via demand mock for each zone
        if (status !== 'normal') {
          for (const zone of ['ZONE_A', 'ZONE_B', 'ZONE_C']) {
            try {
              await axios.post(`${EXT_BASE}/mock/demand/set/${zone}`, { platform_status: status });
            } catch (e) { /* ignore */ }
          }
        }
      }
    }

    // 3. Apply civic event
    if (civic && civic.eventType && civic.eventType !== 'None') {
      const civicZones = civic.zone === 'ALL' ? ['ZONE_A', 'ZONE_B', 'ZONE_C'] : [civic.zone];
      for (const z of civicZones) {
        try {
          await axios.post(`${EXT_BASE}/mock/demand/set/${z}`, {
            demand_score: 0.85,
            orders_per_hour: 5,
            platform_status: 'suspended'
          });
        } catch (e) { /* ignore */ }
      }
      results.civic = { eventType: civic.eventType, zones: civicZones, status: 'applied' };
    }

    // 4. Broadcast
    if (req.app.locals.broadcastEvent) {
      req.app.locals.broadcastEvent('EXTERNAL_FACTORS_APPLIED', { zones, platforms, civic, timestamp: new Date().toISOString() });
    }

    console.log('[ADMIN] External factors applied:', JSON.stringify({ zones: Object.keys(zones || {}), civic: civic?.eventType }));
    res.json({ message: 'External factors applied', results });
  } catch (err) {
    console.error('[ADMIN] External factors error:', err.message);
    res.status(500).json({ error: 'Failed to apply external factors: ' + err.message });
  }
});

// ============================================================
// SYSTEM HEALTH
// ============================================================

/**
 * GET /api/admin/health
 * System health check with DB stats
 */
router.get('/health', requireRole('admin', 'insurer'), (req, res) => {
  const workerCount = db.prepare('SELECT COUNT(*) as c FROM workers').get().c;
  const claimCount = db.prepare('SELECT COUNT(*) as c FROM claims').get().c;
  const eventCount = db.prepare('SELECT COUNT(*) as c FROM disruption_events').get().c;
  const paidClaims = db.prepare("SELECT COUNT(*) as c FROM claims WHERE status = 'paid'").get().c;
  const totalPayout = db.prepare("SELECT COALESCE(SUM(payoutAmount), 0) as total FROM claims WHERE status = 'paid'").get().total;

  res.json({
    status: 'healthy',
    database: {
      workers: workerCount,
      claims: claimCount,
      events: eventCount,
      paidClaims,
      totalPayout
    },
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

function getDefaultFraudRules() {
  return {
    FREQUENCY_ANOMALY: { enabled: true, threshold: 3, action: 'flag', description: '>3 claims in 14 days' },
    ZONE_MISMATCH: { enabled: true, action: 'auto_reject', description: 'Worker zone ≠ claim zone' },
    OFF_HOUR_CLAIM: { enabled: true, action: 'auto_reject', description: 'Claim during off hours' },
    PEER_DIVERGENCE: { enabled: true, threshold: 70, action: 'flag', description: '>70% peers active but worker claims' },
    DUPLICATE_CLAIM: { enabled: true, action: 'auto_reject', description: 'Same date + same disruption type' },
    AMOUNT_ANOMALY: { enabled: true, threshold: 1.5, action: 'flag', description: '>150% weekly average' },
    TELEPORTATION_SPEED: { enabled: true, threshold: 100, action: 'auto_reject', description: '>100km/h between pings' },
    SWARM_DETECTED: { enabled: true, threshold: 5, action: 'flag', description: '5+ workers exact same GPS' },
    GNSS_ZERO_VARIANCE: { enabled: true, action: 'flag', description: 'All C/N0 values zero for outdoor claim' }
  };
}

// ============================================================
// FRAUD TCHC ENDPOINTS
// ============================================================

/**
 * GET /api/admin/blacklist
 * Returns all blacklisted device IDs and count.
 */
router.get('/blacklist', requireRole('admin'), (req, res) => {
  const { getBlacklist } = require('../engines/fraud');
  const blacklisted = getBlacklist();
  res.json({ blacklisted, count: blacklisted.length });
});

/**
 * DELETE /api/admin/blacklist/:deviceId
 * Removes a device from the blacklist (for demo purposes / reset).
 */
router.delete('/blacklist/:deviceId', requireRole('admin'), (req, res) => {
  const { removeFromBlacklist, getBlacklist } = require('../engines/fraud');
  const deviceId = req.params.deviceId;
  
  removeFromBlacklist(deviceId);
  const remaining = getBlacklist().length;
  
  res.json({ removed: deviceId, remaining });
});

/**
 * GET /api/admin/fraud-cluster/:zone
 * Returns spatial/temporal cluster analysis for a specific zone.
 */
router.get('/fraud-cluster/:zone', requireRole('admin'), (req, res) => {
  const { analyzeCluster } = require('../engines/fraud-cluster');
  const zone = req.params.zone.toUpperCase();
  
  const analysis = analyzeCluster(zone);
  res.json(analysis);
});

/**
 * GET /api/admin/ml-stats
 * Reads the latest ML training stats for the AI Premium Engine
 */
router.get('/ml-stats', requireRole('admin'), (req, res) => {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const statsPath = path.join(__dirname, '../ml/training_stats.json');
    if (!fs.existsSync(statsPath)) {
      return res.status(404).json({ error: "ML stats not found. Please run the Python training script." });
    }
    
    const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Error reading ML stats: " + err.message });
  }
});

module.exports = router;

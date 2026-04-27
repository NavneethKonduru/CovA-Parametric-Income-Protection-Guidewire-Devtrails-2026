/**
 * CovA Admin Routes — Clean Edition
 * Removed: duplicate seeding endpoints, scattered simulation buttons
 * Added: run-cron (force CDI evaluation), worker-fraud-demo (targeted fraud scenario)
 */

const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const pg = require('../data/pg');
const demoSequencer = require('../services/demo-sequencer');

// ============================================================
// CDI WEIGHTS
// ============================================================

router.get('/cdi-weights', requireRole('admin'), async (req, res) => {
  try {
    const weights = await pg.getAdminConfig('cdi_weights') || { weather: 0.40, demand: 0.35, peer: 0.25 };
    res.json({ weights, sum: parseFloat((weights.weather + weights.demand + weights.peer).toFixed(2)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/cdi-weights', requireRole('admin'), async (req, res) => {
  try {
    const { weather, demand, peer } = req.body;
    if (weather == null || demand == null || peer == null) {
      return res.status(400).json({ error: 'All three weights required: weather, demand, peer' });
    }
    const sum = parseFloat((weather + demand + peer).toFixed(2));
    if (sum !== 1.0) {
      return res.status(400).json({ error: `Weights must sum to 1.0, got ${sum}` });
    }
    const newWeights = { weather, demand, peer };
    await pg.query(
      `INSERT INTO admin_config (key, value, updated_at) VALUES ('cdi_weights', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(newWeights)],
    );
    if (req.app.locals.broadcastEvent) {
      req.app.locals.broadcastEvent('CDI_CONFIG_UPDATED', newWeights);
    }
    res.json({ message: 'CDI weights updated', weights: newWeights });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// SYSTEM HEALTH
// ============================================================

router.get('/health', requireRole('admin'), async (req, res) => {
  try {
    const dataMode = pg.getDataMode();
    const [workerRes, claimRes, paidRes, eventRes, fraudRes] = await Promise.all([
      pg.query('SELECT COUNT(*) as c FROM workers WHERE data_mode = $1', [dataMode]),
      pg.query('SELECT COUNT(*) as c FROM claims WHERE data_mode = $1', [dataMode]),
      pg.query("SELECT COUNT(*) as c FROM claims WHERE status IN ('paid','approved_auto','processing_payout','manual_approved') AND data_mode = $1", [dataMode]),
      pg.query('SELECT COUNT(*) as c FROM disruption_events WHERE data_mode = $1', [dataMode]),
      pg.query("SELECT COUNT(*) as c FROM claims WHERE status IN ('rejected_fraud','rejected_cap_reached','expired_no_evidence') AND data_mode = $1", [dataMode]),
    ]);

    const totalPayoutRes = await pg.query(
      "SELECT COALESCE(SUM(payout_amount),0) as total FROM claims WHERE status IN ('paid','approved_auto','processing_payout','manual_approved') AND data_mode = $1",
      [dataMode],
    );

    res.json({
      status: 'healthy',
      dataMode,
      uptime: process.uptime(),
      database: {
        workers: parseInt(workerRes.rows[0]?.c || 0),
        claims: parseInt(claimRes.rows[0]?.c || 0),
        paidClaims: parseInt(paidRes.rows[0]?.c || 0),
        events: parseInt(eventRes.rows[0]?.c || 0),
        fraudBlocked: parseInt(fraudRes.rows[0]?.c || 0),
        totalPayout: parseFloat(totalPayoutRes.rows[0]?.total || 0),
      },
      demoSequencer: demoSequencer.getDemoStatus(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DEMO SEQUENCER — SINGLE ENTRY POINT
// ============================================================

router.get('/demo-seq/status', requireRole('admin'), (req, res) => {
  res.json(demoSequencer.getDemoStatus());
});

router.post('/demo-seq/start', requireRole('admin'), (req, res) => {
  try {
    const status = demoSequencer.startDemo(pg);
    res.json({ message: 'Demo sequence started', status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/demo-seq/stop', requireRole('admin'), (req, res) => {
  demoSequencer.stopDemo();
  res.json({ message: 'Demo sequence stopped', status: demoSequencer.getDemoStatus() });
});

// ============================================================
// AUTO-PILOT — Continuous Simulation Engine
// ============================================================

router.get('/auto-pilot/status', requireRole('admin'), (req, res) => {
  res.json(demoSequencer.getAutoPilotStatus());
});

router.post('/auto-pilot/start', requireRole('admin'), async (req, res) => {
  try {
    const result = await demoSequencer.startAutoPilot(pg);
    res.json({ message: 'Auto-pilot engaged', ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/auto-pilot/stop', requireRole('admin'), (req, res) => {
  const result = demoSequencer.stopAutoPilot();
  res.json({ message: 'Auto-pilot disengaged', ...result });
});

// ============================================================
// DATA MODE TOGGLE
// ============================================================

router.post('/data-mode', requireRole('admin'), async (req, res) => {
  const { mode } = req.body;
  if (!['real', 'demo'].includes(mode)) {
    return res.status(400).json({ error: "Invalid mode. Use 'real' or 'demo'." });
  }
  try {
    await pg.setDataMode(mode);
    if (req.app.locals.broadcastEvent) {
      req.app.locals.broadcastEvent('DATA_MODE_SWITCHED', { mode, timestamp: new Date().toISOString() });
    }
    res.json({ message: `Switched to ${mode} mode`, mode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DEMO RESET
// ============================================================

router.delete('/reset', requireRole('admin'), async (req, res) => {
  try {
    const dataMode = pg.getDataMode();
    if (dataMode === 'real') {
      return res.status(403).json({ error: 'Cannot reset production data.' });
    }
    await pg.query('DELETE FROM fraud.detection_log WHERE data_mode = $1', [dataMode]);
    await pg.query('DELETE FROM claims WHERE data_mode = $1', [dataMode]);
    await pg.query('DELETE FROM disruption_events WHERE data_mode = $1', [dataMode]);
    // Reset ghost workers
    await pg.query("DELETE FROM workers WHERE id LIKE 'GHOST_%' AND data_mode = $1", [dataMode]);
    // Reset demo workers back to genuine mode in worker_signals
    await pg.query("UPDATE worker_signals SET signal_mode = 'auto_genuine' WHERE data_mode = $1", [dataMode]);

    if (req.app.locals.broadcastEvent) {
      req.app.locals.broadcastEvent('DEMO_RESET', { message: 'Sandbox cleared', dataMode });
    }
    res.json({ message: 'Demo state reset', dataMode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// FORCE CDI CRON (manual trigger)
// ============================================================

router.post('/run-cron', requireRole('admin'), async (req, res) => {
  try {
    const { runCron } = require('../cron/poller');
    await runCron(req.app.locals.broadcastEvent);
    res.json({ message: 'CDI cron executed', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// MANUAL ZONE SIMULATION
// ============================================================

router.post('/simulate-zone', requireRole('admin'), async (req, res) => {
  try {
    const { zone, scenario } = req.body;
    // scenario: 'monsoon' | 'heat' | 'platform_outage' | 'clear'
    const axios = require('axios');
    const port = process.env.PORT || 3001;

    const SCENARIOS = {
      monsoon: {
        weather: { rainfall_mm: 80 + Math.random() * 20, condition: 'heavy_rain', severity: 0.92 + Math.random() * 0.08 },
        demand: { demand_score: 0.85 + Math.random() * 0.12, platform_status: 'degraded' },
      },
      heat: {
        weather: { rainfall_mm: 0, condition: 'extreme_heat', severity: 0.80, temperature: 42 },
        demand: { demand_score: 0.60, platform_status: 'degraded' },
      },
      platform_outage: {
        weather: { rainfall_mm: 0, condition: 'clear', severity: 0.05 },
        demand: { demand_score: 0.95, platform_status: 'outage' },
      },
      clear: {
        weather: { rainfall_mm: 2, condition: 'clear', severity: 0.05, temperature: 28 },
        demand: { demand_score: 0.10, platform_status: 'normal' },
      },
    };

    const config = SCENARIOS[scenario] || SCENARIOS.clear;
    const targetZones = zone === 'ALL' ? ['ZONE_A', 'ZONE_B', 'ZONE_C'] : [zone];

    for (const z of targetZones) {
      await axios.post(`http://localhost:${port}/mock/weather/set/${z}`, config.weather).catch(() => {});
      await axios.post(`http://localhost:${port}/mock/demand/set/${z}`, config.demand).catch(() => {});
    }

    if (req.app.locals.broadcastEvent) {
      req.app.locals.broadcastEvent('ZONE_SIMULATED', { zone, scenario, config });
    }

    res.json({ message: `Zone simulation applied`, zone, scenario });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// TARGETED WORKER FRAUD DEMO
// ============================================================

router.post('/worker-fraud-demo', requireRole('admin'), async (req, res) => {
  try {
    const { workerId } = req.body;
    if (!workerId) return res.status(400).json({ error: 'workerId required' });

    const dataMode = pg.getDataMode();
    if (dataMode === 'real') {
      return res.status(403).json({ error: 'Fraud demo is blocked in production mode.' });
    }

    // Get the worker's zone
    const workerRes = await pg.query('SELECT id, name, zone FROM workers WHERE id = $1', [workerId]);
    if (!workerRes.rows.length) return res.status(404).json({ error: 'Worker not found' });

    const worker = workerRes.rows[0];
    const zone = worker.zone;
    const port = process.env.PORT || 3001;
    const axios = require('axios');

    // 1. Mark selected worker as fraudulent (auto_fraud mode) in worker_signals
    await pg.query("UPDATE worker_signals SET signal_mode = 'auto_fraud' WHERE worker_id = $1", [workerId]);

    // 2. Make OTHER workers in zone look clean (so contrast is visible)
    await pg.query(
      "UPDATE worker_signals ws SET signal_mode = 'auto_genuine' FROM workers w WHERE ws.worker_id = w.id AND w.zone = $1 AND w.id != $2 AND w.data_mode = $3",
      [zone, workerId, dataMode],
    );

    // 3. Trigger storm in that zone
    const severity = 0.82 + Math.random() * 0.12;
    await axios.post(`http://localhost:${port}/mock/weather/set/${zone}`, {
      rainfall_mm: 55 + Math.floor(Math.random() * 20),
      condition: 'heavy_rain',
      severity,
      temperature: 21,
    }).catch(() => {});

    await axios.post(`http://localhost:${port}/mock/demand/set/${zone}`, {
      demand_score: 0.72 + Math.random() * 0.12,
      platform_status: 'degraded',
    }).catch(() => {});

    // 4. Run cron twice (need 2 consecutive CDI breaches)
    const { runCron } = require('../cron/poller');
    await runCron(req.app.locals.broadcastEvent).catch(() => {});
    await new Promise(r => setTimeout(r, 2500));
    await runCron(req.app.locals.broadcastEvent).catch(() => {});

    if (req.app.locals.broadcastEvent) {
      req.app.locals.broadcastEvent('FRAUD_DEMO_TRIGGERED', {
        workerId,
        workerName: worker.name,
        zone,
        message: `Targeted fraud scenario active — ${worker.name} flagged in ${zone}`,
      });
    }

    res.json({ success: true, workerId, workerName: worker.name, zone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// WORKERS LIST (for dropdown)
// ============================================================

router.get('/workers-list', requireRole('admin'), async (req, res) => {
  try {
    const dataMode = pg.getDataMode();
    const result = await pg.query(
      `SELECT w.id, w.name, w.zone, w.platform, ws.signal_mode as mode, ws.signal_authenticity_score as fraud_score 
       FROM workers w
       LEFT JOIN worker_signals ws ON w.id = ws.worker_id
       WHERE w.data_mode = $1 AND w.id NOT LIKE 'GHOST_%'
       ORDER BY w.zone, w.name`,
      [dataMode],
    );
    res.json({ workers: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ANALYTICS (kept but trimmed)
// ============================================================

router.get('/analytics', requireRole('admin'), async (req, res) => {
  try {
    const dataMode = pg.getDataMode();

    const [system, hourly, cdiDist] = await Promise.all([
      pg.query(`
        SELECT 
          COUNT(DISTINCT w.id) as total_workers,
          COUNT(c.id) as total_claims,
          COALESCE(SUM(c.payout_amount),0) as total_payouts,
          COUNT(CASE WHEN c.status IN ('rejected','rejected_fraud') THEN 1 END) as fraud_blocked
        FROM workers w
        LEFT JOIN claims c ON c.worker_id = w.id AND c.data_mode = $1
        WHERE w.data_mode = $1
      `, [dataMode]),
      pg.query(`
        SELECT DATE_TRUNC('hour', created_at) as hour, COUNT(*) as processed
        FROM claims WHERE data_mode = $1 AND created_at > NOW() - INTERVAL '24 hours'
        GROUP BY hour ORDER BY hour
      `, [dataMode]),
      pg.query(`
        SELECT trigger_level, COUNT(*) as count
        FROM cdi_readings WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY trigger_level
      `).catch(() => ({ rows: [] })),
    ]);

    res.json({
      system: system.rows[0] || {},
      enginePerformance: hourly.rows,
      cdiDistribution: cdiDist.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

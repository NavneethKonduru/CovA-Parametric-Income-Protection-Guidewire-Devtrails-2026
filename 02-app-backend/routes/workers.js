const express = require('express');
const router = express.Router();
const pg = require('../data/pg');
const { requireRole } = require('../middleware/auth');
const { calculatePremium } = require('../engines/premium');
const crypto = require('crypto');
const axios = require('axios');

const signalStates = new Map();

// Restore signal states from DB on startup (async — done on first request)
let signalsRestored = false;
async function restoreSignals() {
  if (signalsRestored) return;
  try {
    const { rows } = await pg.query('SELECT * FROM worker_signals');
    for (const s of rows) {
      signalStates.set(s.worker_id, {
        lat: s.lat, lng: s.lng, gnss_variance: s.gnss_variance,
        velocity: s.velocity, zone_entry: s.zone_entry,
        platform_active: s.platform_active === true || s.platform_active === 1,
        mode: s.signal_mode || 'auto_genuine'
      });
    }
    console.log(`[SIGNALS] Restored ${rows.length} worker signal states from PostgreSQL`);
  } catch(e) {
    console.log('[SIGNALS] No saved signal states to restore:', e.message);
  }
  signalsRestored = true;
}

/**
 * POST /api/workers/register
 * Register a new delivery worker
 */
router.post('/register', async (req, res) => {
  try {
    await restoreSignals();
    const { name, phone, zone, platform, archetype, peakHoursPerWeek, upiId } = req.body;

    if (!name || !phone || !zone || !platform || !archetype) {
      return res.status(400).json({ error: "All fields required: name, phone, zone, platform, archetype" });
    }

    const phoneHash = crypto.createHash('sha256').update(phone).digest('hex');
    const dataMode = pg.getDataMode();

    const existingRes = await pg.query(
      "SELECT id FROM workers WHERE phone_hash = $1 AND status = 'active' AND data_mode = $2",
      [phoneHash, dataMode]
    );
    if (existingRes.rows.length > 0) {
      return res.status(409).json({ error: "UWID already active", message: "This worker is already covered by an active policy." });
    }

    const countRes = await pg.query('SELECT COUNT(*) as c FROM workers WHERE data_mode = $1', [dataMode]);
    const count = parseInt(countRes.rows[0].c);
    const id = `W${String(count + 1).padStart(3, '0')}`;
    
    // Calculate premium using ML engine
    const premium = calculatePremium(zone, archetype, { 
      peakHoursPerWeek: peakHoursPerWeek ? parseFloat(peakHoursPerWeek) : undefined 
    });

    let rzp_contact_id = `cont_mock_${id}_${Date.now()}`;
    let rzp_fund_account_id = `fa_mock_${id}_${Date.now()}`;

    try {
      if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && upiId) {
        const auth = {
          username: process.env.RAZORPAY_KEY_ID,
          password: process.env.RAZORPAY_KEY_SECRET
        };
        const contactRes = await axios.post('https://api.razorpay.com/v1/contacts', {
          name,
          contact: phone,
          type: "worker",
          reference_id: id
        }, { auth });
        
        if (contactRes.data && contactRes.data.id) {
          rzp_contact_id = contactRes.data.id;
          
          const fundRes = await axios.post('https://api.razorpay.com/v1/fund_accounts', {
            contact_id: rzp_contact_id,
            account_type: "vpa",
            vpa: { address: upiId }
          }, { auth });
          
          if (fundRes.data && fundRes.data.id) {
            rzp_fund_account_id = fundRes.data.id;
          }
        }
      }
    } catch (apiErr) {
      console.log('[WORKERS] Razorpay API failed, falling back to mock:', apiErr.message);
    }

    const newWorker = {
      id, name, phone, zone, platform, archetype,
      hourlyRate: premium.hourlyRate,
      seasonalFactor: premium.seasonalFactor,
      status: "active",
      enrolledDate: new Date().toISOString().split('T')[0],
      phoneHash,
      upiId: upiId || '',
      rzp_contact_id,
      rzp_fund_account_id
    };

    await pg.query(`
      INSERT INTO workers (id, name, phone, zone, platform, archetype, hourly_rate, status, 
        enrolled_date, seasonal_factor, phone_hash, upi_id, rzp_contact_id, rzp_fund_account_id, data_mode, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
    `, [id, name, phone, zone, platform, archetype, premium.hourlyRate, 'active',
        newWorker.enrolledDate, premium.seasonalFactor, phoneHash, newWorker.upiId, 
        newWorker.rzp_contact_id, newWorker.rzp_fund_account_id, dataMode]);

    // Seed signal state for new worker
    const ZONE_DEFAULT_COORDS = {
      ZONE_A: { lat: 12.9347, lng: 77.6101 },
      ZONE_B: { lat: 12.9698, lng: 77.7499 },
      ZONE_C: { lat: 12.9784, lng: 77.6408 }
    };
    const coords = ZONE_DEFAULT_COORDS[zone] || { lat: 12.9716, lng: 77.5946 };

    await pg.query(`
      INSERT INTO worker_signals (worker_id, lat, lng, gnss_variance, velocity, platform_active, signal_mode, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (worker_id) DO NOTHING
    `, [id, coords.lat, coords.lng, 5.0, 2.0, true, 'auto_genuine']);

    signalStates.set(id, {
      lat: coords.lat, lng: coords.lng,
      gnss_variance: 5.0, velocity: 2.0,
      platform_active: true, mode: 'auto_genuine'
    });

    // Auto-create policy for new worker
    let policy = null;
    try {
      const { createPolicyForWorker } = require('./policies');
      policy = await createPolicyForWorker(newWorker, premium);
    } catch(e) {
      console.log('[REGISTER] Policy creation skipped:', e.message);
    }

    if (req.app.locals.broadcastEvent) {
      req.app.locals.broadcastEvent('WORKER_REGISTERED', { worker: newWorker, premium, timestamp: Date.now() });
      req.app.locals.broadcastEvent('HEALTH_UPDATE_NEEDED', {});
    }

    res.status(201).json({ message: "Worker registered successfully", worker: newWorker, premium, policy });
  } catch (err) {
    console.error('[WORKERS] Register error:', err.message);
    res.status(500).json({ error: 'Registration failed', details: err.message });
  }
});

/**
 * PATCH /api/workers/:id/signal
 * Update worker signal state
 */
router.patch('/:id/signal', async (req, res) => {
  try {
    const workerId = req.params.id;
    const { lat, lng, gnss_variance, velocity, zone_entry, platform_active } = req.body;

    const dataMode = pg.getDataMode();
    if (dataMode === 'DEMO') {
      return res.status(200).json({ 
        status: 'passive_listener', 
        mode: 'DEMO', 
        message: 'System is in Demo Mode. Physical device sensors are ignored. Listening to simulated timeline.' 
      });
    }

    const currentState = signalStates.get(workerId) || {};
    const signalState = { ...currentState, lat, lng, gnss_variance, velocity, zone_entry, platform_active };
    signalStates.set(workerId, signalState);

    // Persist to PostgreSQL
    await pg.query(`
      INSERT INTO worker_signals (worker_id, lat, lng, gnss_variance, velocity, zone_entry, platform_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT(worker_id) DO UPDATE SET
        lat=EXCLUDED.lat, lng=EXCLUDED.lng, gnss_variance=EXCLUDED.gnss_variance,
        velocity=EXCLUDED.velocity, zone_entry=EXCLUDED.zone_entry,
        platform_active=EXCLUDED.platform_active, updated_at=NOW()
    `, [workerId, lat, lng, gnss_variance, velocity, zone_entry || null, platform_active !== false]);

    if (req.app.locals.broadcastEvent) {
      req.app.locals.broadcastEvent('WORKER_SIGNAL_UPDATE', { workerId, signalState });
    }

    res.json({ message: "Signal updated", signalState });
  } catch (err) {
    console.error('[WORKERS] Signal update error:', err.message);
    res.status(500).json({ error: 'Signal update failed' });
  }
});

/**
 * PATCH /api/workers/:id/mode
 * Update worker signal mode
 */
router.patch('/:id/mode', requireRole('admin'), async (req, res) => {
  try {
    const workerId = req.params.id;
    const { mode } = req.body;

    if (!["auto_genuine", "auto_fraud", "manual", "passive"].includes(mode)) {
      return res.status(400).json({ error: "Invalid mode" });
    }

    const currentState = signalStates.get(workerId) || {};
    currentState.mode = mode;
    signalStates.set(workerId, currentState);

    await pg.query(`
      INSERT INTO worker_signals (worker_id, signal_mode, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT(worker_id) DO UPDATE SET signal_mode=EXCLUDED.signal_mode, updated_at=NOW()
    `, [workerId, mode]);

    if (req.app.locals.broadcastEvent) {
      req.app.locals.broadcastEvent('WORKER_MODE_CHANGED', { workerId, mode });
    }

    res.json({ message: "Mode updated", mode });
  } catch (err) {
    console.error('[WORKERS] Mode update error:', err.message);
    res.status(500).json({ error: 'Mode update failed' });
  }
});

/**
 * GET /api/workers/:id/signal
 * Get current signal state
 */
router.get('/:id/signal', async (req, res) => {
  await restoreSignals();
  const workerId = req.params.id;
  const signalState = signalStates.get(workerId) || null;
  res.json({ signalState });
});

/**
 * GET /api/workers
 * List all workers
 */
router.get('/', async (req, res) => {
  try {
    const dataMode = pg.getDataMode();
    const { rows } = await pg.query('SELECT * FROM workers WHERE data_mode = $1', [dataMode]);
    res.json({ count: rows.length, workers: rows });
  } catch (err) {
    console.error('[WORKERS] List error:', err.message);
    res.status(500).json({ error: 'Failed to list workers' });
  }
});

/**
 * GET /api/workers/:id
 * Get worker details
 */
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pg.query('SELECT * FROM workers WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Worker not found" });

    const worker = rows[0];
    const premium = calculatePremium(worker.zone, worker.archetype, {
      seasonalFactor: worker.seasonal_factor || 1.0,
      hourlyRate: worker.hourly_rate
    });
    
    res.json({ worker, premium });
  } catch (err) {
    console.error('[WORKERS] Get error:', err.message);
    res.status(500).json({ error: 'Failed to get worker' });
  }
});

/**
 * GET /api/workers/:id/status
 * Consolidated dashboard data for the Native Android App (5 Questions).
 */
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const dataMode = pg.getDataMode();

    // 1. Fetch Worker & Policy Info
    const workerRes = await pg.query('SELECT * FROM workers WHERE id = $1', [id]);
    if (workerRes.rows.length === 0) return res.status(404).json({ error: "Worker not found" });
    const worker = workerRes.rows[0];

    // 2. Fetch Active Events in Worker's Zone
    const eventRes = await pg.query(
      "SELECT * FROM disruption_events WHERE zone = $1 AND data_mode = $2 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
      [worker.zone, dataMode]
    );
    const activeEvent = eventRes.rows[0] ? {
      id: eventRes.rows[0].id,
      zone: eventRes.rows[0].zone,
      cdiScore: parseFloat(eventRes.rows[0].cdi_score || 0) * 100,
      explanation: eventRes.rows[0].description,
      workerImpact: "Eligible pending sync",
      dataOrigin: "inferred"
    } : null;

    // 3. Fetch Sync Health (from telemetry router logic)
    const syncRes = await pg.query(
      `SELECT COUNT(*) as total, MAX(timestamp) as last FROM public.telemetry_raw WHERE worker_id = $1 AND data_mode = $2`,
      [id, dataMode]
    );
    const syncStatus = {
      bufferCount: syncRes.rows[0].total > 0 ? 0 : 3,
      lastSync: syncRes.rows[0].last || 'Never',
      pendingClaims: 1
    };

    // 4. Fetch Claims Summary
    const claimsRes = await pg.query(
      'SELECT id, status as state, payout_amount as amount FROM claims WHERE worker_id = $1 ORDER BY created_at DESC LIMIT 5',
      [id]
    );

    // 5. Fetch Payouts Summary
    const paidRes = await pg.query(
      "SELECT SUM(payout_amount) as total FROM claims WHERE worker_id = $1 AND status = 'paid'",
      [id]
    );

    res.json({
      coverageStatus: {
        protected: worker.status === 'active',
        zone: worker.zone,
        coverageEnd: "2024-12-31"
      },
      activeEvent,
      syncStatus,
      claims: claimsRes.rows,
      payouts: [
        { id: "total_settled", state: "settled", amount: parseFloat(paidRes.rows[0]?.total || 0) },
        { id: "current_queue", state: "queued", amount: 0 }
      ]
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch worker status: ' + err.message });
  }
});

module.exports = router;
module.exports.signalStates = signalStates;

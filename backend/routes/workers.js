const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { calculatePremium } = require('../engines/premium');
const crypto = require('crypto');

const signalStates = new Map();

// Restore signal states from DB on startup
try {
  const savedSignals = db.prepare('SELECT * FROM worker_signals').all();
  for (const s of savedSignals) {
    signalStates.set(s.workerId, {
      lat: s.lat, lng: s.lng, gnss_variance: s.gnss_variance,
      velocity: s.velocity, zone_entry: s.zone_entry,
      platform_active: s.platform_active === 1,
      mode: s.signal_mode || 'auto_genuine'
    });
  }
  console.log(`[SIGNALS] Restored ${savedSignals.length} worker signal states from DB`);
} catch(e) { console.log('[SIGNALS] No saved signal states to restore'); }

// Make sure the new seasonalFactor column exists to store ML state
try { db.exec('ALTER TABLE workers ADD COLUMN seasonalFactor REAL DEFAULT 1.0'); } catch(e) { /* already exists */ }

/**
 * POST /api/workers/register
 * Register a new delivery worker
 */
router.post('/register', (req, res) => {
  const { name, phone, zone, platform, archetype, peakHoursPerWeek, upiId } = req.body;

  if (!name || !phone || !zone || !platform || !archetype) {
    return res.status(400).json({ error: "All fields required: name, phone, zone, platform, archetype" });
  }

  const phoneHash = crypto.createHash('sha256').update(phone).digest('hex');

  const existingWorker = db.prepare('SELECT id FROM workers WHERE phoneHash = ? AND status = \'active\'').get(phoneHash);
  if (existingWorker) {
    return res.status(409).json({ error: "UWID already active", message: "This worker is already covered by an active policy." });
  }

  const count = db.prepare('SELECT COUNT(*) as c FROM workers').get().c;
  const id = `W${String(count + 1).padStart(3, '0')}`;
  
  // Calculate premium using ML engine - auto computes seasonalFactor
  const premium = calculatePremium(zone, archetype, { 
      peakHoursPerWeek: peakHoursPerWeek ? parseFloat(peakHoursPerWeek) : undefined 
  });

  const newWorker = {
    id,
    name,
    phone,
    zone,
    platform,
    archetype,
    hourlyRate: premium.hourlyRate,
    seasonalFactor: premium.seasonalFactor, // Store ML engine seasonal state
    status: "active",
    enrolledDate: new Date().toISOString().split('T')[0],
    phoneHash,
    upiId: upiId || ''
  };

  db.prepare(`
    INSERT INTO workers (id, name, phone, zone, platform, archetype, hourlyRate, status, enrolledDate, seasonalFactor, phoneHash, upiId)
    VALUES (@id, @name, @phone, @zone, @platform, @archetype, @hourlyRate, @status, @enrolledDate, @seasonalFactor, @phoneHash, @upiId)
  `).run(newWorker);

  // Bug Fix 5: Seed signal state for new worker
  const ZONE_DEFAULT_COORDS = {
    ZONE_A: { lat: 12.9347, lng: 77.6101 },
    ZONE_B: { lat: 12.9698, lng: 77.7499 },
    ZONE_C: { lat: 12.9784, lng: 77.6408 }
  };
  const coords = ZONE_DEFAULT_COORDS[zone] || { lat: 12.9716, lng: 77.5946 };

  db.prepare(`
    INSERT OR IGNORE INTO worker_signals 
      (workerId, lat, lng, gnss_variance, velocity, platform_active, signal_mode, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(newWorker.id, coords.lat, coords.lng, 5.0, 2.0, 1, 'auto_genuine');

  signalStates.set(newWorker.id, {
    lat: coords.lat, lng: coords.lng,
    gnss_variance: 5.0, velocity: 2.0,
    platform_active: true, mode: 'auto_genuine'
  });

  // Feature: Auto-create policy for new worker
  let policy = null;
  try {
    const { createPolicyForWorker } = require('./policies');
    policy = createPolicyForWorker(newWorker, premium);
  } catch(e) {
    console.log('[REGISTER] Policy creation skipped:', e.message);
  }

  if (req.app.locals.broadcastEvent) {
    req.app.locals.broadcastEvent('WORKER_REGISTERED', { worker: newWorker, premium, timestamp: Date.now() });
    req.app.locals.broadcastEvent('HEALTH_UPDATE_NEEDED', {});
  }

  res.status(201).json({ message: "Worker registered successfully", worker: newWorker, premium, policy });
});

/**
 * PATCH /api/workers/:id/signal
 * Update worker signal state
 */
router.patch('/:id/signal', (req, res) => {
  const workerId = req.params.id;
  const { lat, lng, gnss_variance, velocity, zone_entry, platform_active } = req.body;

  const currentState = signalStates.get(workerId) || {};
  const signalState = {
    ...currentState,
    lat, lng, gnss_variance, velocity, zone_entry, platform_active
  };
  
  signalStates.set(workerId, signalState);

  // Persist to DB
  db.prepare(`
    INSERT INTO worker_signals (workerId, lat, lng, gnss_variance, velocity, zone_entry, platform_active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(workerId) DO UPDATE SET
      lat=excluded.lat, lng=excluded.lng, gnss_variance=excluded.gnss_variance,
      velocity=excluded.velocity, zone_entry=excluded.zone_entry,
      platform_active=excluded.platform_active, updated_at=CURRENT_TIMESTAMP
  `).run(workerId, lat, lng, gnss_variance, velocity, zone_entry || null, platform_active ? 1 : 0);

  if (req.app.locals.broadcastEvent) {
    req.app.locals.broadcastEvent('WORKER_SIGNAL_UPDATE', { workerId, signalState });
  }

  res.json({ message: "Signal updated", signalState });
});

/**
 * PATCH /api/workers/:id/mode
 * Update worker signal mode
 */
router.patch('/:id/mode', (req, res) => {
  const workerId = req.params.id;
  const { mode } = req.body;

  if (!["auto_genuine", "auto_fraud", "manual", "passive"].includes(mode)) {
    return res.status(400).json({ error: "Invalid mode" });
  }

  const currentState = signalStates.get(workerId) || {};
  currentState.mode = mode;
  signalStates.set(workerId, currentState);

  // Persist to DB
  db.prepare(`
    INSERT INTO worker_signals (workerId, signal_mode, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(workerId) DO UPDATE SET signal_mode=excluded.signal_mode, updated_at=CURRENT_TIMESTAMP
  `).run(workerId, mode);

  if (req.app.locals.broadcastEvent) {
    req.app.locals.broadcastEvent('WORKER_MODE_CHANGED', { workerId, mode });
  }

  res.json({ message: "Mode updated", mode });
});

/**
 * GET /api/workers/:id/signal
 * Get current signal state
 */
router.get('/:id/signal', (req, res) => {
  const workerId = req.params.id;
  const signalState = signalStates.get(workerId) || null;
  res.json({ signalState });
});

/**
 * GET /api/workers
 * List all workers
 */
router.get('/', (req, res) => {
  const workersData = db.prepare('SELECT * FROM workers').all();
  res.json({ count: workersData.length, workers: workersData });
});

/**
 * GET /api/workers/:id
 * Get worker details
 */
router.get('/:id', (req, res) => {
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);
  if (!worker) return res.status(404).json({ error: "Worker not found" });

  const premium = calculatePremium(worker.zone, worker.archetype, {
      seasonalFactor: worker.seasonalFactor || 1.0,
      hourlyRate: worker.hourlyRate
  });
  
  res.json({ worker, premium });
});

module.exports = router;
module.exports.signalStates = signalStates;

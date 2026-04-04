const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { calculatePremium, getAllPremiumTiers } = require('../engines/premium');
const { getPremiumPreview } = require('../engines/premium-ml');

// In-memory policy store
let policyStore = [];
let policyCounter = 0;

/**
 * GET /api/policies/premium-table
 * Returns complete pricing grid for all zone x archetype combos
 * Includes explanation and seasonal context.
 */
router.get('/premium-table', (req, res) => {
  const tiers = getAllPremiumTiers();
  
  res.json({
    currentSeason: tiers.length > 0 && tiers[0].isMonsoonSeason ? 'monsoon' : 'dry',
    seasonalFactor: tiers.length > 0 ? tiers[0].seasonalFactor : 1.0,
    generatedAt: new Date().toISOString(),
    tiers
  });
});

/**
 * GET /api/policies/premium-preview
 * Get premium preview before creating a policy
 * Query params: ?zone=ZONE_B&archetype=heavy_peak&hourlyRate=150&peakHoursPerWeek=28
 */
router.get('/premium-preview', (req, res) => {
  const { zone, archetype, hourlyRate, peakHoursPerWeek } = req.query;
  
  if (!zone || !archetype) {
    return res.status(400).json({ error: "zone and archetype required in query params" });
  }

  const preview = getPremiumPreview({
    zone: zone, 
    archetype: archetype, 
    hourlyRate: parseFloat(hourlyRate) || 120,
    peakHoursPerWeek: peakHoursPerWeek ? parseFloat(peakHoursPerWeek) : undefined
  });
  
  res.json({ preview });
});

/**
 * POST /api/policies/create
 * Create a weekly insurance policy for a worker
 */
router.post('/create', (req, res) => {
  const { workerId, zone, archetype } = req.body;

  if (!workerId || !zone || !archetype) {
    return res.status(400).json({ error: "workerId, zone, and archetype required" });
  }

  policyCounter++;
  const premium = calculatePremium(zone, archetype);
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  const policy = {
    id: `POL_${String(policyCounter).padStart(3, '0')}`,
    workerId,
    zone,
    archetype,
    weeklyPremium: premium.weeklyPremium,
    seasonalFactor: premium.seasonalFactor,
    coverageStart: startDate.toISOString().split('T')[0],
    coverageEnd: endDate.toISOString().split('T')[0],
    status: "active",
    createdAt: startDate.toISOString()
  };

  policyStore.push(policy);
  res.status(201).json({ message: "Policy created", policy, premium });
});

/**
 * GET /api/policies
 * List all policies
 */
router.get('/', (req, res) => {
  res.json({ count: policyStore.length, policies: policyStore });
});

/**
 * GET /api/policies/:id
 * Get policy details
 */
router.get('/:id', (req, res) => {
  const policy = policyStore.find(p => p.id === req.params.id);
  if (!policy) return res.status(404).json({ error: "Policy not found" });
  res.json({ policy });
});

// Remove old POST calculate-preview
// router.post('/calculate-preview', (req, res) => { ... })

/**
 * GET /api/policies/:workerId
 * Get active policy for a specific worker
 */
router.get('/:workerId', (req, res) => {
  const policy = db.prepare('SELECT * FROM policies WHERE workerId = ? AND status = ?')
    .get(req.params.workerId, 'active');
  if (!policy) return res.status(404).json({ error: 'No active policy found' });
  res.json({ policy });
});

/**
 * Create a policy for a newly registered worker (called from workers.js)
 */
function createPolicyForWorker(worker, premium) {
  const policyId = `POL-${worker.id}-${Date.now()}`;
  const today = new Date();
  const expiry = new Date(today);
  expiry.setDate(today.getDate() + 365);

  db.prepare(`
    INSERT OR IGNORE INTO policies 
      (id, workerId, workerName, zone, platform, archetype, weeklyPremium, dailyCoverCap, 
       status, effectiveDate, expiryDate, upiId, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    policyId, worker.id, worker.name, worker.zone, worker.platform, worker.archetype,
    premium.weeklyPremium || 35,
    premium.maxDailyCover || 480,
    today.toISOString().split('T')[0],
    expiry.toISOString().split('T')[0],
    worker.upiId || ''
  );

  console.log(`[POLICY] Created policy ${policyId} for worker ${worker.id}`);

  return { policyId, effectiveDate: today.toISOString().split('T')[0], 
           expiryDate: expiry.toISOString().split('T')[0] };
}

module.exports = router;
module.exports.createPolicyForWorker = createPolicyForWorker;

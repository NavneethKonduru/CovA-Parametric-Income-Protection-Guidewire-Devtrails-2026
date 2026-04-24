const express = require('express');
const router = express.Router();
const pg = require('../data/pg');
const { calculatePremium, getAllPremiumTiers } = require('../engines/premium');
const { getPremiumPreview } = require('../engines/premium-ml');

/**
 * GET /api/policies/premium-table
 * Returns complete pricing grid for all zone x archetype combos
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
 */
router.get('/premium-preview', (req, res) => {
  const { zone, archetype, hourlyRate, peakHoursPerWeek } = req.query;
  if (!zone || !archetype) {
    return res.status(400).json({ error: "zone and archetype required in query params" });
  }
  const preview = getPremiumPreview({
    zone, archetype,
    hourlyRate: parseFloat(hourlyRate) || 120,
    peakHoursPerWeek: peakHoursPerWeek ? parseFloat(peakHoursPerWeek) : undefined
  });
  res.json({ preview });
});

/**
 * POST /api/policies/create
 * Create a weekly insurance policy for a worker
 */
router.post('/create', async (req, res) => {
  try {
    const { workerId, zone, archetype } = req.body;
    if (!workerId || !zone || !archetype) {
      return res.status(400).json({ error: "workerId, zone, and archetype required" });
    }

    const dataMode = pg.getDataMode();
    const premium = calculatePremium(zone, archetype);
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const policyId = `POL_${workerId}_${Date.now()}`;
    const policy = {
      id: policyId, workerId, zone, archetype,
      weeklyPremium: premium.weeklyPremium,
      seasonalFactor: premium.seasonalFactor,
      coverageStart: startDate.toISOString().split('T')[0],
      coverageEnd: endDate.toISOString().split('T')[0],
      status: "active",
      createdAt: startDate.toISOString()
    };

    await pg.query(`
      INSERT INTO policies (id, worker_id, zone, archetype, weekly_premium, daily_cover_cap,
        status, effective_date, expiry_date, data_mode, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, NOW(), NOW())
    `, [policyId, workerId, zone, archetype, premium.weeklyPremium, premium.maxDailyCover || 480,
        policy.coverageStart, policy.coverageEnd, dataMode]);

    res.status(201).json({ message: "Policy created", policy, premium });
  } catch (err) {
    console.error('[POLICIES] Create error:', err.message);
    res.status(500).json({ error: 'Policy creation failed', details: err.message });
  }
});

/**
 * GET /api/policies
 * List all policies
 */
router.get('/', async (req, res) => {
  try {
    const dataMode = pg.getDataMode();
    const { rows } = await pg.query('SELECT * FROM policies WHERE data_mode = $1', [dataMode]);
    res.json({ count: rows.length, policies: rows });
  } catch (err) {
    console.error('[POLICIES] List error:', err.message);
    res.status(500).json({ error: 'Failed to list policies' });
  }
});

/**
 * GET /api/policies/:workerId
 * Get active policy for a specific worker
 */
router.get('/:workerId', async (req, res) => {
  try {
    const dataMode = pg.getDataMode();
    const { rows } = await pg.query(
      "SELECT * FROM policies WHERE worker_id = $1 AND status = 'active' AND data_mode = $2",
      [req.params.workerId, dataMode]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No active policy found' });
    res.json({ policy: rows[0] });
  } catch (err) {
    console.error('[POLICIES] Get error:', err.message);
    res.status(500).json({ error: 'Failed to get policy' });
  }
});

/**
 * Create a policy for a newly registered worker (called from workers.js)
 */
async function createPolicyForWorker(worker, premium) {
  const policyId = `POL-${worker.id}-${Date.now()}`;
  const today = new Date();
  const expiry = new Date(today);
  expiry.setDate(today.getDate() + 365);
  const dataMode = pg.getDataMode();

  await pg.query(`
    INSERT INTO policies 
      (id, worker_id, worker_name, zone, platform, archetype, weekly_premium, daily_cover_cap, 
       status, effective_date, expiry_date, upi_id, data_mode, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10, $11, $12, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `, [policyId, worker.id, worker.name, worker.zone, worker.platform, worker.archetype,
      premium.weeklyPremium || 35, premium.maxDailyCover || 480,
      today.toISOString().split('T')[0], expiry.toISOString().split('T')[0],
      worker.upiId || '', dataMode]);

  console.log(`[POLICY] Created policy ${policyId} for worker ${worker.id}`);
  return { policyId, effectiveDate: today.toISOString().split('T')[0], 
           expiryDate: expiry.toISOString().split('T')[0] };
}

module.exports = router;
module.exports.createPolicyForWorker = createPolicyForWorker;

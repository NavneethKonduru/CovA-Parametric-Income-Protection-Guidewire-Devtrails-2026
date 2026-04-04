const express = require('express');
const router = express.Router();
const db = require('../data/db');
const { getCDISummary, getCDIHistory } = require('../engines/cdi-history');

/**
 * GET /api/dashboard/insurer
 * Aggregated live data for the Insurer Dashboard — reads from SQLite
 */
router.get('/insurer', (req, res) => {
  const workerCount = db.prepare('SELECT COUNT(*) as c FROM workers').get().c;
  const totalClaims = db.prepare('SELECT COUNT(*) as c FROM claims').get().c;
  const approved = db.prepare("SELECT COUNT(*) as c FROM claims WHERE status = 'paid'").get().c;
  const flagged = db.prepare("SELECT COUNT(*) as c FROM claims WHERE status = 'flagged'").get().c;
  const rejected = db.prepare("SELECT COUNT(*) as c FROM claims WHERE status = 'rejected'").get().c;
  const totalPayout = db.prepare("SELECT COALESCE(SUM(payoutAmount), 0) as total FROM claims WHERE status = 'paid'").get().total;

  // Premium collected estimate (workers × base rate)
  const baseRate = (() => {
    const row = db.prepare("SELECT value FROM insurer_config WHERE key = 'base_premium_rate'").get();
    return row ? parseFloat(row.value) : 35;
  })();
  const totalPremiumCollected = workerCount * baseRate;
  const lossRatio = totalPremiumCollected > 0 ? ((totalPayout / totalPremiumCollected) * 100) : 0;

  // Disruption type distribution from actual claims
  const disruptionDist = {};
  const distRows = db.prepare('SELECT disruptionType, COUNT(*) as c FROM claims GROUP BY disruptionType').all();
  for (const row of distRows) {
    disruptionDist[row.disruptionType] = row.c;
  }

  // Fraud summary from actual claims
  const fraudSummary = { totalFlags: 0, ruleBreakdown: {} };
  const allClaims = db.prepare('SELECT fraudResult FROM claims WHERE fraudResult IS NOT NULL').all();
  for (const c of allClaims) {
    try {
      const fr = JSON.parse(c.fraudResult);
      if (fr.flags && fr.flags.length > 0) {
        fraudSummary.totalFlags += fr.flags.length;
        for (const f of fr.flags) {
          fraudSummary.ruleBreakdown[f.rule] = (fraudSummary.ruleBreakdown[f.rule] || 0) + 1;
        }
      }
    } catch (e) { /* skip unparseable */ }
  }

  // Zone summary from workers table
  const zoneSummary = db.prepare(`
    SELECT zone, COUNT(*) as activeWorkers FROM workers
    WHERE status = 'active' AND zone IS NOT NULL
    GROUP BY zone
  `).all().map(z => {
    const names = { ZONE_A: 'Koramangala', ZONE_B: 'Whitefield', ZONE_C: 'Indiranagar' };
    const risks = { ZONE_A: 'medium', ZONE_B: 'high', ZONE_C: 'low' };
    const riskScores = { ZONE_A: 1.0, ZONE_B: 1.3, ZONE_C: 0.8 };
    return {
      id: z.zone,
      name: names[z.zone] || z.zone,
      riskLevel: risks[z.zone] || 'unknown',
      riskScore: riskScores[z.zone] || 1.0,
      activeWorkers: z.activeWorkers
    };
  });

  res.json({
    metrics: {
      lossRatio: parseFloat(lossRatio.toFixed(1)),
      totalPremiumCollected,
      totalClaimsPaid: totalPayout,
      activePolicies: workerCount,
      claimsSummary: {
        total: totalClaims,
        approved,
        flagged,
        rejected
      },
      disruptionDistribution: disruptionDist,
      fraudSummary
    },
    zoneSummary,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/dashboard/worker/:id
 * Aggregated live data for a Worker's Dashboard
 */
router.get('/worker/:id', (req, res) => {
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);
  if (!worker) return res.status(404).json({ error: "Worker not found" });

  // Real claims from DB
  const claims = db.prepare('SELECT * FROM claims WHERE workerId = ?').all(req.params.id);
  const totalEarnings = claims
    .filter(c => c.status === 'paid')
    .reduce((sum, c) => sum + (c.payoutAmount || 0), 0);

  const riskMessages = {
    ZONE_A: 'Moderate — standard conditions',
    ZONE_B: 'High — flood-prone area',
    ZONE_C: 'Low — stable conditions'
  };

  res.json({
    workerId: worker.id,
    name: worker.name,
    coverageStatus: worker.status === 'active'
      ? 'Active — Week of ' + new Date().toISOString().split('T')[0]
      : 'Inactive',
    premiumPaid: worker.hourlyRate ? Math.round(35 * (worker.zone === 'ZONE_B' ? 1.3 : worker.zone === 'ZONE_C' ? 0.8 : 1.0)) : 35,
    earningsProtectedThisMonth: parseFloat(totalEarnings.toFixed(2)),
    nextWeekRisk: riskMessages[worker.zone] || 'Unknown',
    recentClaims: claims.slice(0, 10)
  });
});

/**
 * GET /api/dashboard/cdi-history
 * Returns CDI history and trend summaries across all zones.
 */
router.get('/cdi-history', (req, res) => {
  const summary = getCDISummary();
  const history = {};
  
  // Extract history for each zone present in summary
  for (const zone of Object.keys(summary)) {
    history[zone] = getCDIHistory(zone, 20); // Get max history
  }

  res.json({
    timestamp: new Date().toISOString(),
    summary,
    history
  });
});

module.exports = router;

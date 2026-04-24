const express = require('express');
const router = express.Router();
const pg = require('../data/pg');
const { requireRole } = require('../middleware/auth');
const { generatePortfolioSummary } = require('../engines/groq-reporter');

/**
 * GET /api/reports/portfolio-summary
 * Aggregated metrics for the Partner/Insurer landing screens.
 */
router.get('/portfolio-summary', requireRole('insurer', 'admin'), async (req, res) => {
  try {
    const dataMode = pg.getDataMode();
    
    const stats = await pg.query(`
      SELECT 
        (SELECT COUNT(*) FROM workers WHERE data_mode = $1) as total_workers,
        (SELECT COUNT(*) FROM claims WHERE data_mode = $1) as total_claims,
        (SELECT COALESCE(SUM(payout_amount), 0) FROM claims WHERE data_mode = $1 AND status = 'paid') as total_payouts,
        (SELECT COUNT(*) FROM disruption_events WHERE data_mode = $1) as total_events
    `, [dataMode]);

    const { total_workers, total_claims, total_payouts, total_events } = stats.rows[0];
    
    // Generate AI Summary
    const aiAnalysis = await generatePortfolioSummary({
      workers: total_workers,
      claims: total_claims,
      payouts: parseFloat(total_payouts).toFixed(2)
    });

    // Honest actuarial metrics — no arbitrary multipliers
    const baseRate = await pg.getInsurerConfig('base_premium_rate') || 35;
    const totalPremium = parseInt(total_workers) * baseRate;
    const payoutsNum = parseFloat(total_payouts);
    const totalClaims = parseInt(total_claims);

    // Loss Ratio: payouts / premium × 100 (industry standard)
    const lossRatio = totalPremium > 0
      ? parseFloat(((payoutsNum / totalPremium) * 100).toFixed(1))
      : 0;

    // Fraud savings: sum of payouts blocked by fraud detection
    const fraudSavingsRes = await pg.query(
      "SELECT COALESCE(SUM(payout_amount),0) as s FROM claims WHERE status='rejected_fraud' AND data_mode=$1",
      [dataMode]
    );
    const fraudSavings = parseFloat(fraudSavingsRes.rows[0]?.s || 0);

    // Automation ratio: claims processed without manual intervention
    const manualReviewRes = await pg.query(
      "SELECT COUNT(*) as c FROM claims WHERE status='held_fraud_review' AND data_mode=$1",
      [dataMode]
    );
    const manualCount = parseInt(manualReviewRes.rows[0]?.c || 0);
    const automationRatio = totalClaims > 0
      ? parseFloat((((totalClaims - manualCount) / totalClaims) * 100).toFixed(1))
      : 100;

    res.json({
      workers: { value: parseInt(total_workers) },
      claims: { value: totalClaims },
      payouts: { value: payoutsNum.toFixed(2) },
      events: { value: parseInt(total_events) },
      portfolio: {
        lossRatio,
        fraudSavings: parseFloat(fraudSavings.toFixed(2)),
        automationRatio,
        premiumCollected: totalPremium,
        note: "Loss ratio = payouts / premium × 100. Target: <65% for parametric product."
      },
      aiAnalysis
    });
  } catch (err) {
    res.status(500).json({ error: 'Reporting failure: ' + err.message });
  }
});

/**
 * GET /api/reports/fraud-macro
 * High-level fraud trend analysis.
 */
router.get('/fraud-macro', requireRole('admin', 'insurer'), async (req, res) => {
  try {
    const dataMode = pg.getDataMode();
    const result = await pg.query(`
      SELECT
        COUNT(*) FILTER (WHERE risk_level IN ('high','critical')) as queue,
        COUNT(*) FILTER (WHERE 'TELEPORTATION_SPEED' = ANY(rules_triggered)) as impossible_movement,
        COUNT(*) FILTER (WHERE 'GNSS_ZERO_VARIANCE' = ANY(rules_triggered) OR
                               'GNSS_SYNTHETIC_SIGNAL' = ANY(rules_triggered)) as spoofing,
        COUNT(*) FILTER (WHERE 'DUPLICATE_CLAIM' = ANY(rules_triggered)) as replay
      FROM fraud.detection_log
      WHERE data_mode = $1 AND created_at >= NOW() - INTERVAL '24 hours'
    `, [dataMode]);
    const row = result.rows[0] || {};
    const queue = parseInt(row.queue || 0);
    res.json({
      queue,
      breakdown: {
        replay: parseInt(row.replay || 0),
        impossible_movement: parseInt(row.impossible_movement || 0),
        spoofing: parseInt(row.spoofing || 0)
      },
      priority: queue > 10 ? 'High' : queue > 0 ? 'Normal' : 'Clear'
    });
  } catch (err) {
    res.status(500).json({ error: 'Fraud reporting failure' });
  }
});

/**
 * GET /api/reports/worker/:id
 * Complete report data for worker PDF generation
 */
router.get('/worker/:id', requireRole('worker', 'admin', 'insurer'), async (req, res) => {
  const workerId = req.params.id;
  const dataMode = pg.getDataMode();

  const worker = await pg.query('SELECT * FROM workers WHERE id = $1', [workerId]);
  const claims = await pg.query(
    'SELECT * FROM claims WHERE worker_id = $1 AND data_mode = $2 ORDER BY created_at DESC',
    [workerId, dataMode]
  );
  const policy = await pg.query(
    'SELECT * FROM policies WHERE worker_id = $1 AND data_mode = $2 ORDER BY created_at DESC LIMIT 1',
    [workerId, dataMode]
  );

  const paidClaims = claims.rows.filter(c => c.status === 'paid');
  const totalPayout = paidClaims.reduce((s, c) => s + parseFloat(c.payout_amount || 0), 0);

  res.json({
    worker: worker.rows[0],
    policy: policy.rows[0],
    claims: claims.rows,
    summary: {
      totalClaims: claims.rows.length,
      paidClaims: paidClaims.length,
      totalPayout,
      avgPayout: paidClaims.length > 0 ? totalPayout / paidClaims.length : 0,
    },
    generatedAt: new Date().toISOString()
  });
});

/**
 * GET /api/reports/insurer
 * Complete report data for insurer PDF generation
 */
router.get('/insurer', requireRole('insurer', 'admin'), async (req, res) => {
  const dataMode = pg.getDataMode();

  const workers = await pg.query('SELECT COUNT(*) as c FROM workers WHERE data_mode = $1', [dataMode]);
  const claimStats = await pg.query(`
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'paid') as paid,
           COUNT(*) FILTER (WHERE status IN ('rejected','rejected_fraud')) as rejected,
           COALESCE(SUM(payout_amount) FILTER (WHERE status = 'paid'), 0) as total_payout
    FROM claims WHERE data_mode = $1
  `, [dataMode]);

  const zoneStats = await pg.query(`
    SELECT zone, COUNT(*) as claims,
           COALESCE(SUM(payout_amount) FILTER (WHERE status = 'paid'), 0) as payouts
    FROM claims WHERE data_mode = $1
    GROUP BY zone
  `, [dataMode]);

  res.json({
    workerCount: parseInt(workers.rows[0]?.c || 0),
    claims: claimStats.rows[0],
    zones: zoneStats.rows,
    generatedAt: new Date().toISOString()
  });
});

module.exports = router;

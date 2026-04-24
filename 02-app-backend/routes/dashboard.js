const express = require('express');
const router = express.Router();
const claimsRepo = require('../repositories/claims');
const workersRepo = require('../repositories/workers');
const pg = require('../data/pg');
const { requireRole } = require('../middleware/auth');
const { getCDISummary, getCDIHistory } = require('../engines/cdi-history');

/**
 * GET /api/dashboard/insurer
 * Aggregated live data for the Insurer Dashboard — reads from PostgreSQL
 */
router.get('/insurer', requireRole('insurer', 'admin'), async (req, res) => {
  if (!pg.isAvailable()) {
    // Return high-fidelity fallback for demo mode
    return res.json({
      metrics: {
        lossRatio: 14.5,
        totalPremiumCollected: 125000,
        totalClaimsPaid: 18125,
        activePolicies: 350,
        claimsSummary: { total: 42, approved: 38, flagged: 2, rejected: 2 },
        disruptionDistribution: { "SEVERE_RAIN": 28, "PLATFORM_OUTAGE": 10, "EXTREME_HEAT": 4 },
        fraudSummary: { totalFlags: 12, ruleBreakdown: { "VELOCITY_ANOMALY": 5, "REPLAY_ATTACK": 3, "GNSS_DRIFT": 4 } }
      },
      zoneSummary: [
        { id: 'ZONE_A', name: 'Koramangala', riskLevel: 'medium', riskScore: 1.0, activeWorkers: 120 },
        { id: 'ZONE_B', name: 'Whitefield', riskLevel: 'high', riskScore: 1.3, activeWorkers: 150 },
        { id: 'ZONE_C', name: 'Indiranagar', riskLevel: 'low', riskScore: 0.8, activeWorkers: 80 }
      ],
      timestamp: new Date().toISOString(),
      databaseStatus: 'unavailable_demo_mode'
    });
  }

  const workerCountRes = await pg.query('SELECT COUNT(*) as c FROM workers WHERE data_mode = $1', [pg.getDataMode()]);
  const workerCount = parseInt(workerCountRes.rows[0]?.c || 0);
  
  const claimStats = await pg.query(`
    SELECT 
      COUNT(*) as c,
      COUNT(*) FILTER (WHERE status = 'paid') as approved,
      COUNT(*) FILTER (WHERE status = 'flagged') as flagged,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
      COALESCE(SUM(payout_amount) FILTER (WHERE status = 'paid'), 0) as total_payout
    FROM claims WHERE data_mode = $1`, [pg.getDataMode()]);
    
  const totalClaims = parseInt(claimStats.rows[0]?.c || 0);
  const approved = parseInt(claimStats.rows[0]?.approved || 0);
  const flagged = parseInt(claimStats.rows[0]?.flagged || 0);
  const rejected = parseInt(claimStats.rows[0]?.rejected || 0);
  const totalPayout = parseFloat(claimStats.rows[0]?.total_payout || 0);

  const baseRate = await pg.getInsurerConfig('base_premium_rate') || 35;
  const totalPremiumCollected = workerCount * baseRate;
  const lossRatio = totalPremiumCollected > 0 ? ((totalPayout / totalPremiumCollected) * 100) : 0;

  // Fraud savings calculation
  const fraudSavingsRes = await pg.query(`
    SELECT COALESCE(SUM(payout_amount), 0) as savings 
    FROM claims WHERE status = 'rejected_fraud' AND data_mode = $1`, [pg.getDataMode()]);
  const fraudSavings = parseFloat(fraudSavingsRes.rows[0]?.savings || 0);

  // Historical trends (Last 30 days)
  const trendsRes = await pg.query(`
    SELECT date, 
            COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
           SUM(payout_amount) as payout
    FROM claims 
    WHERE date >= CURRENT_DATE - INTERVAL '30 days' AND data_mode = $1
    GROUP BY date ORDER BY date ASC`, [pg.getDataMode()]);

  // Calculate premium from actual worker count per day
  const historicalTrends = trendsRes.rows.map(r => ({
    ...r,
    premium: parseInt(r.paid_count || 0) > 0 ? parseInt(r.paid_count) * baseRate : 0
  }));
  
  // Zone performance metrics
  const zoneMetricsRes = await pg.query(`
    SELECT zone, 
           COALESCE(SUM(payout_amount), 0) as payout,
           COUNT(DISTINCT worker_id) * $2 as premium
    FROM claims 
    WHERE data_mode = $1
    GROUP BY zone`, [pg.getDataMode(), baseRate]);
  
  const zoneMetrics = zoneMetricsRes.rows.map(z => ({
    zone: z.zone,
    lossRatio: z.premium > 0 ? (parseFloat(z.payout) / parseFloat(z.premium)) * 100 : 0
  }));

  // Audit Logs (System Events)
  const auditLogsRes = await pg.query(`
    SELECT id, timestamp, type, description as trigger, 
           CASE WHEN type LIKE '%BREACH%' THEN 'Flagged' ELSE 'Approved' END as result,
           metadata->>'zone' as zone
    FROM system.events 
    ORDER BY timestamp DESC LIMIT 10`);

  // Fraud summary from actual claims
  const fraudSummary = { totalFlags: 0, ruleBreakdown: {} };
  const allClaimsRes = await pg.query('SELECT fraud_result FROM claims WHERE fraud_result IS NOT NULL AND data_mode = $1', [pg.getDataMode()]);
  for (const c of allClaimsRes.rows) {
    try {
      const fr = typeof c.fraud_result === 'string' ? JSON.parse(c.fraud_result) : c.fraud_result;
      if (fr && fr.flags && fr.flags.length > 0) {
        fraudSummary.totalFlags += fr.flags.length;
        for (const f of fr.flags) {
          fraudSummary.ruleBreakdown[f.rule] = (fraudSummary.ruleBreakdown[f.rule] || 0) + 1;
        }
      }
    } catch (e) { /* skip unparseable */ }
  }

  res.json({
    metrics: {
      lossRatio: parseFloat(lossRatio.toFixed(1)),
      totalPremiumCollected,
      totalClaimsPaid: totalPayout,
      activePolicies: workerCount,
      claimsSummary: { total: totalClaims, approved, flagged, rejected },
      fraudSummary
    },
    totalPremium: totalPremiumCollected,
    totalPayout,
    lossRatio: parseFloat(lossRatio.toFixed(1)),
    fraudSavings,
    historicalTrends,
    zoneMetrics,
    auditLogs: auditLogsRes.rows,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/dashboard/worker/:id
 * Aggregated live data for a Worker's Dashboard
 */
router.get('/worker/:id', requireRole('worker', 'admin', 'insurer'), async (req, res) => {
  let worker = await workersRepo.findById(req.params.id);
  
  if (!worker && !pg.isAvailable()) {
    // Return mock worker for demo mode
    worker = {
      id: req.params.id,
      name: 'Demo Worker',
      status: 'active',
      zone: 'ZONE_A',
      hourlyRate: 120
    };
  }
  
  if (!worker) return res.status(404).json({ error: "Worker not found" });

  // Real claims from DB
  const claims = await claimsRepo.findByWorker(req.params.id);
  const totalEarnings = claims
    .filter(c => c.status === 'paid')
    .reduce((sum, c) => sum + (parseFloat(c.payout_amount) || 0), 0);

  const riskMessages = {
    ZONE_A: 'Moderate — standard conditions',
    ZONE_B: 'High — flood-prone area',
    ZONE_C: 'Low — stable conditions'
  };

  // Fetch actual premium from active policy instead of hardcoded zone multiplier
  let premiumPaid = 35;
  try {
    const policyRow = await pg.query(
      "SELECT weekly_premium FROM policies WHERE worker_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
      [req.params.id]
    );
    premiumPaid = parseFloat(policyRow.rows[0]?.weekly_premium) || 35;
  } catch (e) { /* fallback to 35 */ }

  res.json({
    workerId: worker.id,
    name: worker.name,
    coverageStatus: worker.status === 'active'
      ? 'Active — Week of ' + new Date().toISOString().split('T')[0]
      : 'Inactive',
    premiumPaid,
    earningsProtectedThisMonth: parseFloat(totalEarnings.toFixed(2)) || 0.00,
    nextWeekRisk: riskMessages[worker.zone] || 'Unknown',
    recentClaims: claims || [],
    databaseStatus: pg.isAvailable() ? 'connected' : 'simulated'
  });
});

/**
 * GET /api/dashboard/cdi-history
 * Returns CDI history and trend summaries across all zones.
 */
router.get('/cdi-history', requireRole('admin', 'insurer'), (req, res) => {
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

/**
 * GET /api/dashboard/worker/:id/analytics
 * Rich analytics data for Worker Dashboard visualizations
 */
router.get('/worker/:id/analytics', requireRole('worker', 'admin', 'insurer'), async (req, res) => {
  const workerId = req.params.id;
  const dataMode = pg.getDataMode();

  // 1. Weekly payout trend (last 8 weeks)
  const weeklyPayouts = await pg.query(`
    SELECT DATE_TRUNC('week', created_at) as week,
           COUNT(*) as claim_count,
           COALESCE(SUM(payout_amount), 0) as total_payout
    FROM claims
    WHERE worker_id = $1 AND data_mode = $2 AND status = 'paid'
    GROUP BY DATE_TRUNC('week', created_at)
    ORDER BY week DESC LIMIT 8
  `, [workerId, dataMode]);

  // 2. Claims by disruption type (pie chart)
  const claimsByType = await pg.query(`
    SELECT disruption_type, COUNT(*) as count,
           COALESCE(SUM(payout_amount), 0) as total
    FROM claims
    WHERE worker_id = $1 AND data_mode = $2
    GROUP BY disruption_type
  `, [workerId, dataMode]);

  // 3. CDI history for worker's zone (last 24 hours from disruption_events)
  const workerRes = await pg.query('SELECT zone FROM workers WHERE id = $1', [workerId]);
  const zone = workerRes.rows[0]?.zone || 'ZONE_A';
  
  const cdiHistory = await pg.query(`
    SELECT timestamp, cdi, weather_score, demand_score, peer_score, condition
    FROM disruption_events
    WHERE zone = $1 AND data_mode = $2 AND timestamp >= NOW() - INTERVAL '24 hours'
    ORDER BY timestamp ASC
  `, [zone, dataMode]);

  // 4. Monthly summary (last 6 months)
  const monthlySummary = await pg.query(`
    SELECT DATE_TRUNC('month', created_at) as month,
           COUNT(*) as claims,
           COALESCE(SUM(payout_amount), 0) as payouts,
           ROUND(AVG(cdi)::numeric, 4) as avg_cdi
    FROM claims
    WHERE worker_id = $1 AND data_mode = $2
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY month DESC LIMIT 6
  `, [workerId, dataMode]);

  // 5. Premium vs payout comparison
  const policyRes = await pg.query(`
    SELECT weekly_premium, premiums_paid, effective_date
    FROM policies
    WHERE worker_id = $1 AND data_mode = $2 AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `, [workerId, dataMode]);
  
  const policy = policyRes.rows[0];
  const totalPremiumPaid = policy ? (policy.weekly_premium * policy.premiums_paid) : 0;
  const totalPayoutReceived = weeklyPayouts.rows.reduce((s, r) => s + parseFloat(r.total_payout), 0);

  // 6. Weather impact on worker's zone (last 30 days from weather.observations)
  const weatherTrend = await pg.query(`
    SELECT DATE_TRUNC('day', timestamp) as day,
           ROUND(AVG(weather_score)::numeric, 4) as avg_score,
           ROUND(MAX(weather_score)::numeric, 4) as max_score,
           ROUND(AVG(rainfall_mm)::numeric, 2) as avg_rainfall,
           ROUND(MAX(rainfall_mm)::numeric, 2) as max_rainfall
    FROM weather.observations
    WHERE zone = $1 AND timestamp >= NOW() - INTERVAL '30 days'
    GROUP BY DATE_TRUNC('day', timestamp)
    ORDER BY day ASC
  `, [zone]);

  res.json({
    workerId,
    zone,
    weeklyPayouts: weeklyPayouts.rows.reverse(),
    claimsByType: claimsByType.rows,
    cdiHistory: cdiHistory.rows,
    monthlySummary: monthlySummary.rows.reverse(),
    premiumVsPayout: { totalPremiumPaid, totalPayoutReceived, net: totalPayoutReceived - totalPremiumPaid },
    weatherTrend: weatherTrend.rows,
    generatedAt: new Date().toISOString()
  });
});

/**
 * GET /api/dashboard/insurer/analytics
 * Deep analytics for Insurer Dashboard visualizations
 */
router.get('/insurer/analytics', requireRole('insurer', 'admin'), async (req, res) => {
  const dataMode = pg.getDataMode();

  // 1. Daily claims trend (latest 30 days with activity)
  const dailyClaimsRes = await pg.query(`
    SELECT date,
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'paid') as paid,
           COUNT(*) FILTER (WHERE status IN ('rejected','rejected_fraud')) as rejected,
           COALESCE(SUM(payout_amount) FILTER (WHERE status = 'paid'), 0) as payout
    FROM claims WHERE data_mode = $1
    GROUP BY date ORDER BY date DESC LIMIT 30
  `, [dataMode]);
  const dailyClaims = dailyClaimsRes.rows.reverse();

  // 2. Zone-wise breakdown
  const zoneBreakdown = await pg.query(`
    SELECT zone,
           COUNT(*) as claims,
           COUNT(DISTINCT worker_id) as workers,
           COALESCE(SUM(payout_amount) FILTER (WHERE status = 'paid'), 0) as payouts,
           ROUND(AVG(cdi)::numeric, 4) as avg_cdi
    FROM claims WHERE data_mode = $1
    GROUP BY zone
  `, [dataMode]);

  // 3. Disruption type distribution
  const disruptionDist = await pg.query(`
    SELECT disruption_type, COUNT(*) as count,
           COALESCE(SUM(payout_amount), 0) as total_payout
    FROM claims WHERE data_mode = $1
    GROUP BY disruption_type ORDER BY count DESC
  `, [dataMode]);

  // 4. Fraud detection summary
  const fraudStats = await pg.query(`
    SELECT 
      COUNT(*) FILTER (WHERE status IN ('rejected','rejected_fraud')) as blocked,
      COUNT(*) FILTER (WHERE status = 'flagged') as flagged,
      COALESCE(SUM(payout_amount) FILTER (WHERE status IN ('rejected','rejected_fraud')), 0) as saved
    FROM claims WHERE data_mode = $1
  `, [dataMode]);

  // 5. Premium collection vs payout (monthly, 6 months)
  const monthlyFinancials = await pg.query(`
    SELECT DATE_TRUNC('month', created_at) as month,
           COUNT(DISTINCT worker_id) * 35 as premium_est,
           COALESCE(SUM(payout_amount) FILTER (WHERE status = 'paid'), 0) as payouts
    FROM claims WHERE data_mode = $1
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY month DESC LIMIT 6
  `, [dataMode]);

  // 6. Weather risk from observations (30 day trend)
  const weatherRisk = await pg.query(`
    SELECT zone, DATE_TRUNC('day', timestamp) as day,
           ROUND(AVG(weather_score)::numeric, 4) as avg_score,
           COUNT(*) FILTER (WHERE weather_score >= 0.6) as breach_hours
    FROM weather.observations
    WHERE timestamp >= NOW() - INTERVAL '30 days'
    GROUP BY zone, DATE_TRUNC('day', timestamp)
    ORDER BY day ASC
  `, []);

  res.json({
    dailyClaims,
    zoneBreakdown: zoneBreakdown.rows,
    disruptionDistribution: disruptionDist.rows,
    fraudStats: fraudStats.rows[0] || { blocked: 0, flagged: 0, saved: 0 },
    monthlyFinancials: monthlyFinancials.rows.reverse(),
    weatherRisk: weatherRisk.rows,
    generatedAt: new Date().toISOString()
  });
});

/**
 * GET /api/dashboard/qcommerce/analytics
 * Analytics for Q-Commerce employer dashboard
 */
router.get('/qcommerce/analytics', requireRole('qcommerce', 'admin'), async (req, res) => {
  const dataMode = pg.getDataMode();

  // Workers by platform
  const workersByPlatform = await pg.query(`
    SELECT platform, COUNT(*) as count, 
           COUNT(*) FILTER (WHERE status = 'active') as active
    FROM workers WHERE data_mode = $1
    GROUP BY platform
  `, [dataMode]);

  // Claims by platform
  const claimsByPlatform = await pg.query(`
    SELECT w.platform, COUNT(c.*) as claims,
           COALESCE(SUM(c.payout_amount) FILTER (WHERE c.status = 'paid'), 0) as payouts
    FROM claims c JOIN workers w ON c.worker_id = w.id
    WHERE c.data_mode = $1
    GROUP BY w.platform
  `, [dataMode]);

  // Zone disruption impact on delivery capacity
  const zoneImpact = await pg.query(`
    SELECT zone, DATE_TRUNC('day', timestamp) as day,
           COUNT(*) FILTER (WHERE cdi >= 0.6) as disrupted_hours,
           ROUND(AVG(cdi)::numeric, 4) as avg_cdi
    FROM disruption_events
    WHERE data_mode = $1 AND timestamp >= NOW() - INTERVAL '7 days'
    GROUP BY zone, DATE_TRUNC('day', timestamp)
    ORDER BY day ASC
  `, [dataMode]);

  // Cost sharing simulation (employer pays X%, worker pays rest)
  const totalWorkers = workersByPlatform.rows.reduce((s, r) => s + parseInt(r.count), 0);
  const basePremium = 35;
  const costSharingModels = [
    { model: '100% Worker', employerPct: 0, workerWeekly: basePremium, employerWeekly: 0, employerMonthly: 0 },
    { model: '50/50 Split', employerPct: 50, workerWeekly: basePremium * 0.5, employerWeekly: basePremium * 0.5 * totalWorkers, employerMonthly: basePremium * 0.5 * totalWorkers * 4 },
    { model: '70/30 Employer', employerPct: 70, workerWeekly: basePremium * 0.3, employerWeekly: basePremium * 0.7 * totalWorkers, employerMonthly: basePremium * 0.7 * totalWorkers * 4 },
    { model: '100% Employer', employerPct: 100, workerWeekly: 0, employerWeekly: basePremium * totalWorkers, employerMonthly: basePremium * totalWorkers * 4 },
  ];

  res.json({
    workersByPlatform: workersByPlatform.rows,
    claimsByPlatform: claimsByPlatform.rows,
    zoneImpact: zoneImpact.rows,
    costSharingModels,
    totalWorkers,
    basePremiumPerWeek: basePremium,
    generatedAt: new Date().toISOString()
  });
});

module.exports = router;

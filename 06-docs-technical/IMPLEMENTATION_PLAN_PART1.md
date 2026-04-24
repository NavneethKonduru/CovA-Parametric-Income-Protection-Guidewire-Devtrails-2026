# CovA 126 — COMPLETE IMPLEMENTATION PLAN (Part 1 of 3)
# For Gemini Pro 3.1 to execute sequentially

> **CRITICAL RULES FOR THE IMPLEMENTING AI:**
> 1. Execute tasks IN ORDER. Each task depends on previous ones.
> 2. Every dashboard gets its OWN visualizations + report download. NO separate analytics page.
> 3. All data comes from Neon PostgreSQL via `data/pg.js`. Never use `data/db.js` (legacy SQLite).
> 4. Frontend uses `recharts` (already installed). Use `AreaChart`, `BarChart`, `PieChart`, `LineChart`.
> 5. Backend pattern: route → `pg.query()` → return JSON. See `routes/dashboard.js` for examples.
> 6. Database URL is in `02-app-backend/.env` → `DATABASE_URL` pointing to Neon.
> 7. Working directory: `/Users/navneethkonduru/Desktop/Guidewire Devtrails 26/CovA 126/`

---

## PHASE 0: CLEANUP & DATA FOUNDATION (Do First)

### Task 0.1 — Kill SQLite Split-Brain

**Goal**: Remove all references to legacy SQLite `db.js` so nothing accidentally uses it.

**Steps**:
1. Run `grep -rn "require.*data/db" 02-app-backend/` to find any files still importing `data/db.js`
2. For each file found: replace `require('../data/db')` or `require('./data/db')` with `require('../data/pg')` or `require('./data/pg')`
3. Update any synchronous calls (db.js was sync) to async/await (pg.js is async)
4. Do NOT delete `data/db.js` yet — just ensure nothing imports it
5. Verify server starts: `cd 02-app-backend && node server.js`

**Verification**: `grep -rn "require.*data/db" 02-app-backend/` returns 0 results (excluding `db.js` itself)

---

### Task 0.2 — Ingest 5 Years of Weather Data into Neon

**Goal**: Load historical weather data from Open-Meteo into `weather.observations` table.

**Steps**:
1. `cd 04-core-database`
2. Copy the `.env` file: `cp ../02-app-backend/.env .env` (so the script can read DATABASE_URL)
3. Run: `DATABASE_URL="postgresql://neondb_owner:npg_oERYSLx7hj3g@ep-small-moon-a1zoxwf2-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require" WEATHER_YEARS=5 WEATHER_DATA_MODE=real node ingest-weather.js`
4. This will fetch ~131,400 rows (5 years × 3 zones × 8,760 hours) from Open-Meteo
5. Wait for completion (~3-5 minutes)
6. Verify output shows rows per zone and table size

**Verification**: Script prints "✅ COMPLETE" with ~40K+ rows per zone.

**IMPORTANT**: If the migrations haven't been run yet, first run:
```bash
DATABASE_URL="postgresql://neondb_owner:npg_oERYSLx7hj3g@ep-small-moon-a1zoxwf2-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require" node setup-neon.js
```

---

### Task 0.3 — Install jspdf + jspdf-autotable in Frontend

**Goal**: Enable PDF report download from every dashboard.

**Steps**:
1. `cd 01-app-frontend`
2. `npm install jspdf jspdf-autotable`

**These will be used by a shared `generatePDF()` utility in later tasks.**

---

## PHASE 1: BACKEND API ADDITIONS

### Task 1.1 — Worker Analytics API Endpoint

**File**: `02-app-backend/routes/dashboard.js`

**Add this NEW endpoint** after the existing `/worker/:id` route (after line 173):

```javascript
/**
 * GET /api/dashboard/worker/:id/analytics
 * Rich analytics data for Worker Dashboard visualizations
 */
router.get('/worker/:id/analytics', async (req, res) => {
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
```

---

### Task 1.2 — Insurer Analytics API Endpoint

**File**: `02-app-backend/routes/dashboard.js`

**Add this NEW endpoint** after the worker analytics route:

```javascript
/**
 * GET /api/dashboard/insurer/analytics
 * Deep analytics for Insurer Dashboard visualizations
 */
router.get('/insurer/analytics', async (req, res) => {
  const dataMode = pg.getDataMode();

  // 1. Daily claims trend (30 days)
  const dailyClaims = await pg.query(`
    SELECT date,
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'paid') as paid,
           COUNT(*) FILTER (WHERE status IN ('rejected','rejected_fraud')) as rejected,
           COALESCE(SUM(payout_amount) FILTER (WHERE status = 'paid'), 0) as payout
    FROM claims WHERE data_mode = $1 AND date >= CURRENT_DATE - 30
    GROUP BY date ORDER BY date ASC
  `, [dataMode]);

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
    dailyClaims: dailyClaims.rows,
    zoneBreakdown: zoneBreakdown.rows,
    disruptionDistribution: disruptionDist.rows,
    fraudStats: fraudStats.rows[0] || { blocked: 0, flagged: 0, saved: 0 },
    monthlyFinancials: monthlyFinancials.rows.reverse(),
    weatherRisk: weatherRisk.rows,
    generatedAt: new Date().toISOString()
  });
});
```

---

### Task 1.3 — Admin Analytics API Endpoint

**File**: `02-app-backend/routes/admin.js`

**Add this NEW endpoint** (find a suitable location after existing routes):

```javascript
/**
 * GET /api/admin/analytics
 * System-wide analytics for Admin Panel
 */
router.get('/analytics', async (req, res) => {
  const pg = require('../data/pg');
  const dataMode = pg.getDataMode();

  const systemMetrics = await pg.query(`
    SELECT
      (SELECT COUNT(*) FROM workers WHERE data_mode = $1) as total_workers,
      (SELECT COUNT(*) FROM claims WHERE data_mode = $1) as total_claims,
      (SELECT COUNT(*) FROM disruption_events WHERE data_mode = $1) as total_events,
      (SELECT COUNT(*) FROM claims WHERE status IN ('rejected','rejected_fraud') AND data_mode = $1) as fraud_blocked,
      (SELECT COALESCE(SUM(payout_amount),0) FROM claims WHERE status = 'paid' AND data_mode = $1) as total_payouts
  `, [dataMode]);

  // Engine performance (claims per hour, last 24h)
  const enginePerf = await pg.query(`
    SELECT DATE_TRUNC('hour', created_at) as hour,
           COUNT(*) as processed
    FROM claims WHERE data_mode = $1 AND created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY DATE_TRUNC('hour', created_at)
    ORDER BY hour ASC
  `, [dataMode]);

  // CDI trigger distribution
  const cdiDist = await pg.query(`
    SELECT trigger_level, COUNT(*) as count
    FROM claims WHERE data_mode = $1
    GROUP BY trigger_level
  `, [dataMode]);

  // Weather observations count by day (shows data coverage)
  const weatherCoverage = await pg.query(`
    SELECT DATE_TRUNC('day', timestamp) as day, zone, COUNT(*) as obs_count
    FROM weather.observations
    WHERE timestamp >= NOW() - INTERVAL '7 days'
    GROUP BY DATE_TRUNC('day', timestamp), zone
    ORDER BY day ASC
  `, []);

  res.json({
    system: systemMetrics.rows[0],
    enginePerformance: enginePerf.rows,
    cdiDistribution: cdiDist.rows,
    weatherCoverage: weatherCoverage.rows,
    generatedAt: new Date().toISOString()
  });
});
```

---

### Task 1.4 — Q-Commerce Analytics + Cost-Sharing API

**File**: `02-app-backend/routes/dashboard.js`

**Add these NEW endpoints**:

```javascript
/**
 * GET /api/dashboard/qcommerce/analytics
 * Analytics for Q-Commerce employer dashboard
 */
router.get('/qcommerce/analytics', async (req, res) => {
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
```

---

### Task 1.5 — Counterfactual Analysis API

**File**: Create NEW file `02-app-backend/routes/counterfactual.js`

```javascript
const express = require('express');
const router = express.Router();
const pg = require('../data/pg');

/**
 * GET /api/counterfactual/analysis
 * "What if CovA existed for the past 5 years?" analysis
 * Uses real weather.observations data to simulate claims
 */
router.get('/analysis', async (req, res) => {
  // Get weather breach stats from real historical data
  const breachStats = await pg.query(`
    SELECT 
      DATE_TRUNC('year', timestamp) as year,
      zone,
      COUNT(*) as total_observations,
      COUNT(*) FILTER (WHERE weather_score >= 0.6) as breach_hours,
      COUNT(*) FILTER (WHERE weather_score >= 0.8) as critical_hours,
      ROUND(AVG(weather_score)::numeric, 4) as avg_score,
      ROUND(MAX(rainfall_mm)::numeric, 2) as max_rainfall,
      ROUND(MAX(temperature_c)::numeric, 2) as max_temp
    FROM weather.observations
    GROUP BY DATE_TRUNC('year', timestamp), zone
    ORDER BY year ASC, zone ASC
  `);

  // Simulate claims based on weather breaches
  const WORKERS_PER_ZONE = 500; // Assumed scale
  const AVG_PAYOUT_PER_CLAIM = 280; // ₹280 average
  const WEEKLY_PREMIUM = 35;
  const CLAIM_PROBABILITY_ON_BREACH = 0.85;

  const yearlyProjections = [];
  const years = [...new Set(breachStats.rows.map(r => r.year))];
  
  for (const year of years) {
    const yearRows = breachStats.rows.filter(r => String(r.year) === String(year));
    let totalBreachHours = 0;
    let totalCriticalHours = 0;

    for (const row of yearRows) {
      totalBreachHours += parseInt(row.breach_hours || 0);
      totalCriticalHours += parseInt(row.critical_hours || 0);
    }

    // Each breach hour affects ~30% of workers in that zone
    const estimatedClaims = Math.round(totalBreachHours * 0.3 * CLAIM_PROBABILITY_ON_BREACH);
    const estimatedPayouts = estimatedClaims * AVG_PAYOUT_PER_CLAIM;
    const estimatedPremiumCollected = WORKERS_PER_ZONE * 3 * WEEKLY_PREMIUM * 52; // 3 zones, 52 weeks
    const lossRatio = estimatedPremiumCollected > 0 ? (estimatedPayouts / estimatedPremiumCollected * 100) : 0;

    yearlyProjections.push({
      year: new Date(year).getFullYear(),
      breachHours: totalBreachHours,
      criticalHours: totalCriticalHours,
      estimatedClaims,
      estimatedPayouts,
      estimatedPremiumCollected,
      lossRatio: Math.round(lossRatio * 10) / 10,
      workersProtected: WORKERS_PER_ZONE * 3,
      laeSaved: estimatedClaims * 2000 // ₹2000 per automated claim
    });
  }

  // Monthly breakdown for the most recent year
  const latestYear = years[years.length - 1];
  const monthlyBreakdown = await pg.query(`
    SELECT DATE_TRUNC('month', timestamp) as month, zone,
           COUNT(*) FILTER (WHERE weather_score >= 0.6) as breach_hours,
           ROUND(AVG(weather_score)::numeric, 4) as avg_score,
           ROUND(AVG(rainfall_mm)::numeric, 2) as avg_rainfall
    FROM weather.observations
    WHERE DATE_TRUNC('year', timestamp) = $1
    GROUP BY DATE_TRUNC('month', timestamp), zone
    ORDER BY month ASC
  `, [latestYear]);

  // Forward projection (same weather patterns, next 5 years with growth)
  const forwardProjection = yearlyProjections.map((yp, i) => ({
    year: new Date().getFullYear() + i,
    ...yp,
    workersProtected: Math.round(yp.workersProtected * Math.pow(1.15, i)), // 15% YoY growth
    estimatedClaims: Math.round(yp.estimatedClaims * Math.pow(1.15, i)),
    estimatedPayouts: Math.round(yp.estimatedPayouts * Math.pow(1.15, i)),
    estimatedPremiumCollected: Math.round(yp.estimatedPremiumCollected * Math.pow(1.15, i)),
  }));

  res.json({
    historical: yearlyProjections,
    monthlyBreakdown: monthlyBreakdown.rows,
    forwardProjection,
    assumptions: {
      workersPerZone: WORKERS_PER_ZONE,
      zones: 3,
      avgPayoutPerClaim: AVG_PAYOUT_PER_CLAIM,
      weeklyPremium: WEEKLY_PREMIUM,
      claimProbabilityOnBreach: CLAIM_PROBABILITY_ON_BREACH,
      growthRate: '15% YoY'
    },
    weatherDataRange: {
      earliest: breachStats.rows[0]?.year,
      latest: breachStats.rows[breachStats.rows.length - 1]?.year,
      totalObservations: breachStats.rows.reduce((s, r) => s + parseInt(r.total_observations || 0), 0)
    },
    generatedAt: new Date().toISOString()
  });
});

module.exports = router;
```

**Then register in `server.js`** — add after line 31:
```javascript
const counterfactualRouter = require('./routes/counterfactual');
```
And after line 115:
```javascript
app.use('/api/counterfactual', counterfactualRouter);
```

---

### Task 1.6 — PDF Report Data API

**File**: `02-app-backend/routes/reports.js`

**Add these endpoints** to the existing file:

```javascript
/**
 * GET /api/reports/worker/:id
 * Complete report data for worker PDF generation
 */
router.get('/worker/:id', async (req, res) => {
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
router.get('/insurer', async (req, res) => {
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
```

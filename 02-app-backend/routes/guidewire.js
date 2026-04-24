const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const gwClient = require('../services/guidewire-client');
const pg = require('../data/pg');

pg.query(`CREATE TABLE IF NOT EXISTS public.guidewire_submissions (
  id SERIAL PRIMARY KEY,
  tracking_id TEXT,
  claim_id TEXT,
  payload JSONB,
  status TEXT,
  data_mode TEXT DEFAULT 'demo',
  submitted_at TIMESTAMP
)`).catch(e => console.error(e));

/**
 * POST /api/guidewire/submit-claim
 * Submit a single claim and get Master Payload
 */
router.post('/submit-claim', (req, res) => {
  const {
    claimId, workerId, workerName, zone, disruptionType, cdi,
    hoursLost, payoutAmount, fraudResult, ai_explanation, claimStatus
  } = req.body;

  const random8digit = Math.floor(10000000 + Math.random() * 90000000);
  const random12hex = crypto.randomBytes(6).toString('hex').toUpperCase();

  const nowIso = new Date().toISOString();
  // Simulated dates
  const enrolledDate = new Date();
  enrolledDate.setMonth(enrolledDate.getMonth() - 6);
  const expirationDate = new Date(enrolledDate);
  expirationDate.setFullYear(expirationDate.getFullYear() + 1);

  const fraudScore = fraudResult?.score || 0;
  const fraudFlagsCount = fraudResult?.flags?.length || 0;

  // Map disruptionType to allowed lossTypes
  let mappedLossType = disruptionType || "WeatherDisruption";
  if (mappedLossType.toLowerCase().includes("weather")) mappedLossType = "WeatherDisruption";
  else if (mappedLossType.toLowerCase().includes("platform")) mappedLossType = "PlatformOutage";
  else if (mappedLossType.toLowerCase().includes("civic")) mappedLossType = "CivicDisruption";

  const masterPayload = {
    guidewire: {
      ClaimCenter: {
        claimNumber: `GW-CLM-${random8digit}`,
        claimType: "IncomeLoss_Parametric",
        lossType: mappedLossType,
        lossDate: nowIso,
        reportedDate: nowIso,
        status: require('../engines/state-machine').mapToGuidewireStatus(claimStatus || 'pending_telemetry'),
        totalIncurred: payoutAmount || 0,
        claimant: {
          displayName: workerName || "Unknown Worker",
          externalId: workerId || "unknown",
          contactType: "Person"
        },
        exposure: {
          primaryCoverage: "IncomeProtection_CDI",
          coveredAmount: payoutAmount || 0,
          hoursLost: hoursLost || 0,
          cdiScore: cdi || 0,
          triggerMechanism: "parametric_auto"
        }
      },
      PolicyCenter: {
        policyNumber: `GW-POL-COVA-${workerId || 'unknown'}`,
        product: "GigWorker_IncomeShield_v2",
        effectiveDate: enrolledDate.toISOString(),
        expirationDate: expirationDate.toISOString(),
        jurisdiction: "IN-KA",
        insurer: "Future Generali India Insurance"
      },
      BillingCenter: {
        accountNumber: `GW-ACC-${workerId || 'unknown'}`,
        premiumAmount: 35,
        currency: "INR",
        billingPeriod: "Weekly",
        paymentMethod: "UPI_AutoDebit"
      }
    },
    covaTCHC: {
      integrityLayer: "simulated",
      fraudScore: fraudScore,
      fraudFlags: fraudFlagsCount,
      aiExplanation: ai_explanation || "No explanation provided",
      processingMode: "webapp_simulation"
    },
    submittedAt: nowIso,
    acknowledgment: {
      trackingId: `GW-TRK-${random12hex}`,
      estimatedProcessingTime: "2 business days",
      status: "Received"
    }
  };

  // 2. Perform Real Orchestration Sync
  gwClient.orchestrateSync(masterPayload)
    .then(result => {
      masterPayload.acknowledgment.status = "SUCCESS";
      masterPayload.acknowledgment.guidewireId = result.guidewireId;
      console.log(`[GUIDEWIRE] Sync Success: ${result.guidewireId}`);
    })
    .catch(err => {
      masterPayload.acknowledgment.status = "RETRY_QUEUED";
      masterPayload.acknowledgment.error = err.message;
    });

  // Add to database
  pg.query(
    `INSERT INTO public.guidewire_submissions (tracking_id, claim_id, payload, status, data_mode, submitted_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [masterPayload.acknowledgment.trackingId, claimId || masterPayload.guidewire.ClaimCenter.claimNumber, JSON.stringify(masterPayload), masterPayload.acknowledgment.status, pg.getDataMode(), nowIso]
  ).catch(e => console.error(e));

  // Broadcast via app.locals
  if (req.app.locals.broadcastEvent) {
    req.app.locals.broadcastEvent("GUIDEWIRE_SUBMITTED", { 
      trackingId: masterPayload.acknowledgment.trackingId, 
      claimId: claimId || masterPayload.guidewire.ClaimCenter.claimNumber,
      status: masterPayload.acknowledgment.status
    }, { role: 'admin' });
  }

  res.json(masterPayload);
});

/**
 * POST /api/guidewire/submit-batch
 * Submit multiple claims as a single master transaction to reduce individual overhead.
 */
router.post('/submit-batch', (req, res) => {
  const { claims } = req.body;
  if (!Array.isArray(claims) || claims.length === 0) {
    return res.status(400).json({ error: 'Batch must be a non-empty array of claims.' });
  }

  const batchId = `GW-BATCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const nowIso = new Date().toISOString();

  const batchPayload = {
    batchId,
    submittedAt: nowIso,
    totalClaims: claims.length,
    totalPayout: claims.reduce((sum, c) => sum + (parseFloat(c.payoutAmount) || 0), 0),
    centerSummaries: {
      ClaimCenter: { status: "BULK_LOADED", priority: "standard" },
      PolicyCenter: { validation: "BATCH_PASS" },
      BillingCenter: { clearingMode: "BULK_SETTLEMENT" }
    },
    items: claims.map(c => ({
      claimId: c.claimId,
      workerId: c.workerId,
      amount: c.payoutAmount,
      cdi: c.cdi
    })),
    acknowledgment: {
      trackingId: `GW-TRK-BATCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      status: "SUCCESS"
    }
  };

  pg.query(
    `INSERT INTO public.guidewire_submissions (tracking_id, claim_id, payload, status, data_mode, submitted_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [batchPayload.acknowledgment.trackingId, batchId, JSON.stringify(batchPayload), batchPayload.acknowledgment.status, pg.getDataMode(), nowIso]
  ).catch(e => console.error(e));

  if (req.app.locals.broadcastEvent) {
    req.app.locals.broadcastEvent("GUIDEWIRE_BATCH_SUBMITTED", { 
      batchId, 
      count: claims.length,
      trackingId: batchPayload.acknowledgment.trackingId
    });
  }

  res.json(batchPayload);
});

/**
 * GET /api/guidewire/submissions
 * Returns last 50 submissions
 */
router.get('/submissions', async (req, res) => {
  try {
    const resDb = await pg.query("SELECT * FROM public.guidewire_submissions WHERE data_mode = $1 ORDER BY submitted_at DESC LIMIT 50", [pg.getDataMode()]);
    res.json(resDb.rows.map(r => r.payload));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/guidewire/latest
 * Returns the most recent master payload
 */
router.get('/latest', async (req, res) => {
  try {
    const resDb = await pg.query("SELECT * FROM public.guidewire_submissions WHERE data_mode = $1 ORDER BY submitted_at DESC LIMIT 1", [pg.getDataMode()]);
    if (resDb.rows.length === 0) {
      return res.status(404).json({ error: "No Guidewire payloads generated yet." });
    }
    res.json(resDb.rows[0].payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/guidewire/status
 * Returns API status
 */
router.get('/status', async (req, res) => {
  let submissionCount = 0;
  try {
    const result = await pg.query('SELECT COUNT(*) as c FROM guidewire_submissions WHERE data_mode = $1', [pg.getDataMode()]);
    submissionCount = parseInt(result.rows[0]?.c || 0);
  } catch (e) { /* non-critical */ }

  res.json({
    connected: false,
    mode: "simulation",
    simulationNote: "CovA payload structure is Guidewire ClaimCenter v3 compatible. Live sync requires GW Cloud tenant credentials.",
    submissionsInDB: submissionCount
  });
});

/**
 * POST /api/guidewire/policy-sync
 * Simulates PolicyCenter sync response
 */
router.post('/policy-sync', (req, res) => {
  const { workerId } = req.body;
  
  if (!workerId) {
    return res.status(400).json({ error: "workerId is required" });
  }

  const enrolledDate = new Date();
  enrolledDate.setMonth(enrolledDate.getMonth() - 2);
  const expirationDate = new Date(enrolledDate);
  expirationDate.setFullYear(expirationDate.getFullYear() + 1);

  const policyResponse = {
    status: "success",
    policyCenterSync: {
      workerId: workerId,
      policyNumber: `GW-POL-COVA-${workerId}`,
      status: "Active",
      syncTimestamp: new Date().toISOString(),
      details: {
        product: "GigWorker_IncomeShield_v2",
        effectiveDate: enrolledDate.toISOString(),
        expirationDate: expirationDate.toISOString(),
        basePremium: 35,
        currency: "INR",
        coverages: ["WeatherDisruption", "PlatformOutage", "CivicDisruption"]
      }
    }
  };

  res.json(policyResponse);
});

module.exports = router;

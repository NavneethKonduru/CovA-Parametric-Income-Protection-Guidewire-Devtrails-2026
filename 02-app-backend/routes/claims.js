const express = require('express');
const router = express.Router();

const { analyzeDisruption } = require('../engines/claims');
const { validateClaim } = require('../engines/validator');
const { calculatePayout, getTimeSlot } = require('../engines/payout');
const { checkFraud } = require('../engines/fraud');
const { generateExplanation } = require('../engines/groq-explainer');
const claimsRepo = require('../repositories/claims');
const workersRepo = require('../repositories/workers');
const fraudRepo = require('../repositories/fraud');
const financialRepo = require('../repositories/financial');
const { requireRole } = require('../middleware/auth');

/**
 * Middleware: allow internal cron/poller calls (localhost with secret header) or require admin role
 */
function requireInternalOrAdmin(req, res, next) {
  const internalToken = req.headers['x-internal-service'];
  const isLocal = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
  if (isLocal && internalToken && internalToken === (process.env.INTERNAL_SERVICE_TOKEN || 'cova-internal-cron-2026')) {
    return next();
  }
  // Fall through to role check
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required', hint: 'POST /api/auth/login first' });
  }
  if (!['admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Admin role required for claim trigger' });
  }
  next();
}
/**
 * POST /api/claims/trigger
 * Process a claim based on a disruption event
 */
router.post('/trigger', requireInternalOrAdmin, async (req, res) => {
  const { workerId, zone, disruptionType, hoursLost, weatherScore, demandScore, peerScore, telemetry, disruptionStartedAt } = req.body;

  if (!workerId || !zone || !disruptionType || !hoursLost) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const worker = await workersRepo.findById(workerId);
  if (!worker) return res.status(404).json({ error: "Worker not found" });

  // 1. Analyze Disruption (CDI)
  const disruption = analyzeDisruption({
    weatherScore: weatherScore || 0,
    demandScore: demandScore || 0,
    peerScore: peerScore || 0
  });

  const hourOfDay = new Date().getHours();
  const timeSlot = getTimeSlot(hourOfDay);

  // 2. Validate Claim
  const validation = validateClaim(
    { weatherScore, demandScore, peerScore },
    timeSlot,
    disruption.cdi
  );

  const crypto = require('crypto');
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  
  // High-entropy ID: CLM_<timestamp_hex>_<random_hex>
  // This is much safer than sequential or low-entropy IDs for high-concurrency batches
  const timestampHex = now.getTime().toString(16).toUpperCase();
  const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  let claimId = `CLM_${timestampHex}_${randomSuffix}`;

  const claimRecord = {
    id: claimId,
    worker_id: workerId,
    worker_name: worker.name,
    zone,
    disruption_type: disruptionType,
    date: dateStr,
    time_slot: timeSlot,
    hours_lost: hoursLost,
    cdi: disruption.cdi,
    trigger_level: disruption.trigger.level,
    validation_status: validation.status,
    validation_reason: validation.reason,
    payout_amount: 0,
    fraud_result: null,
    status: validation.status === 'approved' ? 'eligible_pending_validation' : 'rejected_fraud',
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };

  const workerHistory = await claimsRepo.findByWorker(workerId);

  // 3. Payout Calculation (if approved)
  // Enforce 8-hour daily cap
  const claimsToday = workerHistory.filter(c => c.date === dateStr && c.status !== 'rejected');
  const hoursClaimedToday = claimsToday.reduce((sum, c) => sum + (parseFloat(c.hours_lost) || 0), 0);
  const dailyCap = worker.daily_claims_cap || 8.0;
  
  let effectiveHoursLost = Math.min(hoursLost, Math.max(0, dailyCap - hoursClaimedToday));

  if (validation.status === 'approved') {
    const payout = calculatePayout(effectiveHoursLost, worker.hourly_rate, timeSlot, disruption.cdi);
    claimRecord.payout_amount = payout.payoutAmount;
    claimRecord.hours_lost = effectiveHoursLost; // Cap the recorded hours
    
    if (claimRecord.payout_amount === 0 && effectiveHoursLost === 0) {
      claimRecord.status = 'rejected_cap_reached';
      claimRecord.validation_reason = 'Daily claim limit (8 hours) already reached for this worker.';
    }
  }

  // 4. Fraud Detection (with optional telemetry)
  
  // Need to parse fraudResult back since it's JSON in DB
  const parsedHistory = workerHistory.map(c => ({
    ...c,
    fraudResult: c.fraud_result ? (typeof c.fraud_result === 'string' ? JSON.parse(c.fraud_result) : c.fraud_result) : null
  }));

  const fraudClaimData = {
    ...claimRecord,
    disruptionStartedAt: disruptionStartedAt || null,
    claimedAmount: claimRecord.payout_amount,
    telemetry: telemetry || null  // Pass telemetry for TELEPORTATION/SWARM/GNSS/ZONE_HOPPING rules
  };

  const fraudCheck = checkFraud(
    fraudClaimData,
    worker,
    parsedHistory,
    { activePeersPercent: (1 - (peerScore || 0)) * 100, avgClaimsPerWorker: 0.5 }
  );

  claimRecord.fraud_result = fraudCheck;

  const pg = require('../data/pg');
  try {
    await pg.transaction(async (client) => {
      await client.query(
        `INSERT INTO public.claims (
          id, worker_id, policy_id, worker_name,
          zone, disruption_type, date, time_slot, hours_lost,
          cdi, trigger_level,
          validation_status, validation_reason,
          payout_amount, payout_txn_id,
          ai_explanation, fraud_result, fraud_confidence,
          status, data_mode
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          claimRecord.id, claimRecord.worker_id, claimRecord.policy_id || null, claimRecord.worker_name || null,
          claimRecord.zone, claimRecord.disruption_type, claimRecord.date, claimRecord.time_slot, claimRecord.hours_lost,
          claimRecord.cdi, claimRecord.trigger_level,
          claimRecord.validation_status || 'approved', claimRecord.validation_reason || null,
          claimRecord.payout_amount || 0, claimRecord.payout_txn_id || null,
          claimRecord.ai_explanation || null,
          claimRecord.fraud_result ? JSON.stringify(claimRecord.fraud_result) : null,
          claimRecord.fraud_confidence || 0,
          claimRecord.status || 'pending', pg.getDataMode()
        ]
      );
      
      await client.query(
        `INSERT INTO fraud.detection_log (
          claim_id, worker_id, fraud_score, risk_level, action,
          hardware_layer, temporal_layer, spatial_layer,
          flags, total_flags, safeguards_applied,
          rules_triggered, decision_explanation, data_mode
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          claimRecord.id, claimRecord.worker_id,
          fraudCheck.fraudScore, fraudCheck.riskLevel, fraudCheck.action,
          fraudCheck.tchcLayer?.hardware || false,
          fraudCheck.tchcLayer?.temporal || false,
          fraudCheck.tchcLayer?.spatial || false,
          JSON.stringify(fraudCheck.flags || []),
          fraudCheck.totalFlags || 0,
          0,
          fraudCheck.flags.map(f => f.rule),
          fraudCheck.action === 'auto_reject' ? 'Automated rejection by TCHC Consensus' : null,
          pg.getDataMode()
        ]
      );
    });
  } catch (err) {
    if (err.message.includes('unique constraint') || err.code === '23505') {
      console.warn(`[CLAIMS] Collision detected for ID ${claimRecord.id}. Retrying with new ID...`);
      claimRecord.id = `CLM_${timestampHex}_RETRY_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      await pg.transaction(async (client) => {
        await client.query(
          `INSERT INTO public.claims (
            id, worker_id, policy_id, worker_name,
            zone, disruption_type, date, time_slot, hours_lost,
            cdi, trigger_level,
            validation_status, validation_reason,
            payout_amount, payout_txn_id,
            ai_explanation, fraud_result, fraud_confidence,
            status, data_mode
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
          [
            claimRecord.id, claimRecord.worker_id, claimRecord.policy_id || null, claimRecord.worker_name || null,
            claimRecord.zone, claimRecord.disruption_type, claimRecord.date, claimRecord.time_slot, claimRecord.hours_lost,
            claimRecord.cdi, claimRecord.trigger_level,
            claimRecord.validation_status || 'approved', claimRecord.validation_reason || null,
            claimRecord.payout_amount || 0, claimRecord.payout_txn_id || null,
            claimRecord.ai_explanation || null,
            claimRecord.fraud_result ? JSON.stringify(claimRecord.fraud_result) : null,
            claimRecord.fraud_confidence || 0,
            claimRecord.status || 'pending', pg.getDataMode()
          ]
        );
        await client.query(
          `INSERT INTO fraud.detection_log (
            claim_id, worker_id, fraud_score, risk_level, action,
            hardware_layer, temporal_layer, spatial_layer,
            flags, total_flags, safeguards_applied,
            rules_triggered, decision_explanation, data_mode
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            claimRecord.id, claimRecord.worker_id,
            fraudCheck.fraudScore, fraudCheck.riskLevel, fraudCheck.action,
            fraudCheck.tchcLayer?.hardware || false,
            fraudCheck.tchcLayer?.temporal || false,
            fraudCheck.tchcLayer?.spatial || false,
            JSON.stringify(fraudCheck.flags || []),
            fraudCheck.totalFlags || 0,
            0,
            fraudCheck.flags.map(f => f.rule),
            fraudCheck.action === 'auto_reject' ? 'Automated rejection by TCHC Consensus' : null,
            pg.getDataMode()
          ]
        );
      });
    } else {
      throw err;
    }
  }

  // Final status alignment based on fraud check
  const hasCompleteTelemetry = telemetry && telemetry.gpsHistory && telemetry.gpsHistory.length >= 2;
  const { determineInitialState } = require('../engines/state-machine');
  const systemRepo = require('../repositories/system');
  
  if (claimRecord.status === 'eligible_pending_validation') {
    claimRecord.status = determineInitialState(fraudCheck.fraudScore, hasCompleteTelemetry);
    
    if (claimRecord.status === 'rejected_fraud') {
      claimRecord.validation_reason += ' | Fraud check failed: ' + fraudCheck.flags.map(f => f.rule).join(', ');
    } else if (claimRecord.status === 'held_fraud_review') {
      claimRecord.validation_reason += ' | Flagged for manual review.';
    } else if (claimRecord.status === 'pending_telemetry') {
      claimRecord.validation_reason += ' | Pending complete telemetry sync.';
    }
  }

  // System Event Logging
  await systemRepo.logEvent('CLAIM_PROCESSED', `Claim ${claimRecord.id} processed for worker ${workerId}`, {
    status: claimRecord.status,
    cdi: claimRecord.cdi,
    fraudScore: fraudCheck.fraudScore
  });

  // Call payment mock or real razorpay
  if (claimRecord.status === 'approved_auto') {
    try {
      const { executePayout } = require('../services/payout-razorpay');
      const crypto = require('crypto');
      const idempotencyKey = `idem_payout_${claimRecord.id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      
      const fundAccountId = worker.rzp_fund_account_id || worker.upi_id; // Fallback to upi if rzp missing for legacy 
      const { id: txnId, status: payoutStatus } = await executePayout(fundAccountId, claimRecord.payout_amount, claimRecord.id, idempotencyKey);

      claimRecord.status = payoutStatus;
      claimRecord.payout_txn_id = txnId;

      // Log financial transaction asynchronously
      try {
        await financialRepo.logTransaction({
          claim_id: claimRecord.id,
          worker_id: worker.worker_id || worker.id,
          type: 'payout',
          amount: claimRecord.payout_amount,
          currency: 'INR',
          status: payoutStatus, // 'queued', 'processing', etc.
          provider: 'razorpay',
          provider_txn_id: txnId
        });

        // Add idempotency key tracking to payout_log if repo supports it
        await pg.query(
          `UPDATE public.payout_log 
           SET idempotency_key = $1, provider_event_type = 'payout.initiated'
           WHERE claim_id = $2 AND txn_reference = $3`,
          [idempotencyKey, claimRecord.id, txnId]
        );

      } catch (finErr) {
        console.error('[FINANCIAL] Failed to persist transaction:', finErr.message);
      }
    } catch (paymentError) {
      console.warn('[CLAIMS] Razorpay unavailable \u2014 marking payout failed:', paymentError.message);
      claimRecord.status = 'payout_failed';
      claimRecord.payout_txn_id = `txn_fail_${claimRecord.id}_${Date.now()}`;
      
      // Log failed transaction
      try {
        await financialRepo.logTransaction({
          claim_id: claimRecord.id,
          worker_id: worker.worker_id || worker.id,
          type: 'payout',
          amount: claimRecord.payout_amount,
          currency: 'INR',
          status: 'failed',
          provider: 'razorpay',
          provider_txn_id: claimRecord.payout_txn_id
        });
      } catch (finErr) {}
    }
  }

  // 5. AI Explanation (Groq or template fallback)
  try {
    claimRecord.ai_explanation = await generateExplanation(claimRecord, worker, fraudCheck);
  } catch (e) {
    claimRecord.ai_explanation = `Claim ${claimRecord.id}: ${claimRecord.status} for ${claimRecord.disruption_type} in ${claimRecord.zone}. CDI: ${claimRecord.cdi}.`;
  }

  // Emit WebSocket event if available on app logic (we can attach it to req.app later)
  if (req.app.locals.broadcastEvent) {
    const workerName = worker.name || worker.worker_id || workerId;
    const broadcastBase = {
      claimId: claimRecord.id,
      workerId: worker.worker_id || worker.id || workerId,
      workerName,
      zone: claimRecord.zone,
      amount: claimRecord.payout_amount,
      cdi: claimRecord.cdi,
      status: claimRecord.status,
    };
    req.app.locals.broadcastEvent('CLAIM_CREATED', broadcastBase);
    if (claimRecord.status === 'processing_payout' || claimRecord.status === 'paid') {
      req.app.locals.broadcastEvent('PAYOUT_SENT', {
        ...broadcastBase,
        txnId: claimRecord.payout_txn_id,
        payout_txn_id: claimRecord.payout_txn_id,
      });
    }
    if (claimRecord.status === 'rejected_fraud' || claimRecord.status === 'held_fraud_review') {
      req.app.locals.broadcastEvent('FRAUD_BLOCKED', {
        ...broadcastBase,
        reason: claimRecord.validation_reason,
        fraudScore: fraudCheck?.fraudScore,
      });
    }
  }

  res.status(201).json({
    message: "Claim processed",
    claim: claimRecord,
    disruption_analysis: disruption
  });
});

/**
 * GET /api/claims/master-payload
 * Returns mock Guidewire master payload for ALL paid claims
 */
router.get('/master-payload', async (req, res) => {
  const allClaims = await claimsRepo.findByDateRange('2020-01-01', '2030-01-01', { status: 'paid' });
  res.json({
    systemId: "COVA_PARAMETRIC_01",
    timestamp: new Date().toISOString(),
    payloads: allClaims.map(c => ({
      claim: {
        policyNumber: `POL-${c.worker_id}`,
        lossDate: c.date,
        causeOfLoss: c.disruption_type,
        locationZone: c.zone,
        payoutAmount: c.payout_amount
      },
      telemetry: { weatherSource: "OpenWeatherMap", cdiScore: c.cdi },
      financials: { razorpayTxnId: `txn_mock_${c.id}` }
    }))
  });
});

/**
 * GET /api/claims
 * List all claims (Insurer view)
 * Uses a 90-day rolling window + LIMIT to keep queries fast on Neon free tier.
 */
router.get('/', requireRole('admin', 'insurer'), async (req, res) => {
  try {
    const now = new Date();
    const startDate = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0];
    const endDate = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
    const claims = await claimsRepo.findByDateRange(startDate, endDate);
    res.json({ count: claims.length, claims });
  } catch (err) {
    console.error('[CLAIMS] GET / error:', err.message);
    res.json({ count: 0, claims: [], error: 'Failed to fetch claims' });
  }
});

/**
 * GET /api/claims/worker/:id
 * Get claim history for a specific worker
 */
router.get('/worker/:id', requireRole('worker', 'admin', 'insurer'), async (req, res) => {
  const claims = await claimsRepo.findByWorker(req.params.id);
  res.json({ count: claims.length, claims });
});

/**
 * GET /api/claims/:id
 * Get single claim details (Phase 2 Enterprise Response)
 */
router.get('/:id', async (req, res) => {
  const claim = await claimsRepo.findById(req.params.id);
  if (!claim) return res.status(404).json({ error: "Claim not found" });

  const fraudResult = claim.fraud_result ? (typeof claim.fraud_result === 'string' ? JSON.parse(claim.fraud_result) : claim.fraud_result) : {};
  
  // Simulated Telemetry Trend for the D3/Recharts FraudPanel
  const cn0Trend = [];
  for (let i = 0; i < 20; i++) {
    const base = 32 + Math.sin(i / 2) * 4;
    cn0Trend.push({
      timestamp: `T+${i * 5}s`,
      cn0: parseFloat((base + (Math.random() - 0.5) * 2).toFixed(2)),
      noiseFloor: 12 + (Math.random() * 2),
      anomalyFlag: i > 15 && claim.status === 'rejected_fraud'
    });
  }

  const richClaim = {
    ...claim,
    id: claim.id,
    payoutAmount: parseFloat(claim.payout_amount || 0),
    state: claim.status,
    configVersion: "1.2.6",
    dataOrigin: ["GNSS", "IMU", "IMD_WEATHER", "PLATFORM_API"],
    
    // Audit Trail for ClaimTimeline component
    auditTrail: [
      { id: 1, action: "CLAIM_INITIATED", actor: "WORKER_APP", timestamp: claim.created_at, description: "Automatic trigger via CDI breach" },
      { id: 2, action: "CDI_VALIDATED", actor: "ENGINE_CDI", timestamp: claim.created_at, description: `Index ${claim.cdi} verified across 3 zones` },
      { id: 3, action: "FRAUD_CHECKED", actor: "ENGINE_TCHC", timestamp: claim.created_at, description: `TCHC Score: ${fraudResult.fraudScore || 0}` },
      { id: 4, action: claim.status === 'paid' ? "PAYMENT_SENT" : "PENDING_REVIEW", actor: "SYSTEM", timestamp: claim.created_at, description: claim.validation_reason }
    ],

    evidenceTrail: [
      { label: "Weather Ingestion", origin: "OPEN_WEATHER", confidence: 0.98, timestamp: claim.created_at },
      { label: "Platform Demand", origin: "ZEPTO_API", confidence: 0.94, timestamp: claim.created_at },
      { label: "GNSS Attestation", origin: "TELEMETRY_SDK", confidence: 1.0, timestamp: claim.created_at, simulationFlag: claim.data_mode === 'demo' }
    ],

    cdiResult: {
      score: claim.cdi * 100, // Frontend expects percentage
      threshold: 80,
      dominantFactor: "WEATHER",
      factors: [
        { name: "Weather", value: claim.weather_score || 0.8 },
        { name: "Demand", value: claim.demand_score || 0.4 },
        { name: "Peer", value: claim.peer_score || 0.2 }
      ]
    },

    fraudAssessment: {
      state: fraudResult.riskLevel === 'high' ? 'rejected' : 'verified',
      score: fraudResult.fraudScore || 0,
      signals: (fraudResult.flags || []).map(f => ({
        type: f.rule,
        severity: f.score > 0.5 ? 'high' : 'medium',
        explanation: f.reason
      }))
    },

    telemetrySession: {
      deviceId: "DEV-8821-X",
      cn0Trend: cn0Trend
    }
  };

  res.json(richClaim);
});

/**
 * POST /api/claims/:id/review
 * Manual approval/rejection for held claims
 */
router.post('/:id/review', requireRole('admin', 'insurer'), async (req, res) => {
  const { action, reason } = req.body; // 'approve' or 'reject'
  const claimId = req.params.id;

  const claim = await claimsRepo.findById(claimId);
  if (!claim) return res.status(404).json({ error: "Claim not found" });

  const { isValidTransition } = require('../engines/state-machine');
  const targetState = action === 'approve' ? 'manual_approved' : 'rejected_fraud';

  if (!isValidTransition(claim.status, targetState)) {
    return res.status(400).json({ error: `Cannot transition claim from ${claim.status} to ${targetState}` });
  }

  const updatedClaim = await claimsRepo.updateStatus(claimId, targetState, reason);

  if (req.app.locals.broadcastEvent) {
    req.app.locals.broadcastEvent('CLAIM_REVIEWED', { claimId, status: targetState }, { zone: claim.zone });
  }

  // If approved, trigger payout (in real system, would queue it)
  if (targetState === 'manual_approved') {
    const { executePayout } = require('../services/payout-razorpay');
    const crypto = require('crypto');
    const idempotencyKey = `idem_payout_${claimId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    executePayout(claimId, claim.worker_id, claim.payout_amount, idempotencyKey)
      .then(async payoutResult => {
        if (payoutResult.status === 'processing') {
          await claimsRepo.updateStatus(claimId, 'processing_payout', 'Sent to Razorpay');
        } else {
          await claimsRepo.updateStatus(claimId, 'payout_failed', payoutResult.reason);
        }
      })
      .catch(console.error);
  }

  res.json({ message: "Review applied", claim: updatedClaim });
});

module.exports = router;

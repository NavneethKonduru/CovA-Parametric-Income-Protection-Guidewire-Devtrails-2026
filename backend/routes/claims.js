const express = require('express');
const router = express.Router();

const { analyzeDisruption } = require('../engines/claims');
const { validateClaim } = require('../engines/validator');
const { calculatePayout, getTimeSlot } = require('../engines/payout');
const { checkFraud } = require('../engines/fraud');
const { generateExplanation } = require('../engines/groq-explainer');
const db = require('../data/db');

/**
 * POST /api/claims/trigger
 * Process a claim based on a disruption event
 */
router.post('/trigger', async (req, res) => {
  const { workerId, zone, disruptionType, hoursLost, weatherScore, demandScore, peerScore, telemetry, disruptionStartedAt } = req.body;

  if (!workerId || !zone || !disruptionType || !hoursLost) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(workerId);
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

  const claimCount = db.prepare('SELECT COUNT(*) as c FROM claims').get().c + 1;
  const dateStr = new Date().toISOString().split('T')[0];

  const claimRecord = {
    id: `CLM_${String(claimCount).padStart(3, '0')}`,
    workerId,
    workerName: worker.name,
    zone,
    disruptionType,
    date: dateStr,
    timeSlot,
    hoursLost,
    cdi: disruption.cdi,
    triggerLevel: disruption.trigger.level,
    validationStatus: validation.status,
    validationReason: validation.reason,
    payoutAmount: 0,
    fraudResult: null,
    status: validation.status === 'approved' ? 'approved' : 'pending'
  };

  const workerHistory = db.prepare('SELECT * FROM claims WHERE workerId = ?').all(workerId);

  // 3. Payout Calculation (if approved)
  // Enforce 8-hour daily cap
  const claimsToday = workerHistory.filter(c => c.date === dateStr && c.status !== 'rejected');
  const hoursClaimedToday = claimsToday.reduce((sum, c) => sum + (parseFloat(c.hoursLost) || 0), 0);
  const dailyCap = worker.dailyClaimsCap || 8.0;
  
  let effectiveHoursLost = Math.min(hoursLost, Math.max(0, dailyCap - hoursClaimedToday));

  if (validation.status === 'approved') {
    const payout = calculatePayout(effectiveHoursLost, worker.hourlyRate, timeSlot, disruption.cdi);
    claimRecord.payoutAmount = payout.payoutAmount;
    claimRecord.hoursLost = effectiveHoursLost; // Cap the recorded hours
  }

  // 4. Fraud Detection (with optional telemetry)
  
  // Need to parse fraudResult back since it's JSON in DB
  const parsedHistory = workerHistory.map(c => ({
    ...c,
    fraudResult: c.fraudResult ? JSON.parse(c.fraudResult) : null
  }));

  const fraudClaimData = {
    ...claimRecord,
    disruptionStartedAt: disruptionStartedAt || null,
    claimedAmount: claimRecord.payoutAmount,
    telemetry: telemetry || null  // Pass telemetry for TELEPORTATION/SWARM/GNSS/ZONE_HOPPING rules
  };

  const fraudCheck = checkFraud(
    fraudClaimData,
    worker,
    parsedHistory,
    { activePeersPercent: (1 - (peerScore || 0)) * 100, avgClaimsPerWorker: 0.5 }
  );

  claimRecord.fraudResult = fraudCheck;

  // Final status alignment based on fraud check
  if (fraudCheck.action === 'auto_reject') {
    claimRecord.status = 'rejected';
    claimRecord.validationReason += ' | Fraud check failed: ' + fraudCheck.flags.map(f => f.rule).join(', ');
  } else if (fraudCheck.action === 'flag_for_review') {
    claimRecord.status = 'flagged';
  }

  // Call payment mock or real razorpay
  if (claimRecord.status === 'approved') {
    try {
      const { executePayout } = require('../services/payout-razorpay');
      
      // We pass the amount and claimId. The worker.upiId should be passed, but default is applied in the service if missing.
      const txnId = await executePayout(worker.upiId, claimRecord.payoutAmount, claimRecord.id);
      
      claimRecord.status = 'paid';
      claimRecord.payoutTxnId = txnId;
    } catch (paymentError) {
      console.warn('[CLAIMS] Razorpay unavailable \u2014 using demo TXN:', paymentError.message);
      claimRecord.status = 'paid';
      claimRecord.payoutTxnId = `txn_demo_${claimRecord.id}_${Date.now()}`;
    }
  }

  // 5. AI Explanation (Groq or template fallback)
  try {
    claimRecord.ai_explanation = await generateExplanation(claimRecord, worker, fraudCheck);
  } catch (e) {
    claimRecord.ai_explanation = `Claim ${claimRecord.id}: ${claimRecord.status} for ${claimRecord.disruptionType} in ${claimRecord.zone}. CDI: ${claimRecord.cdi}.`;
  }

  // Insert into SQLite
  db.prepare(`
    INSERT INTO claims (id, workerId, workerName, zone, disruptionType, date, timeSlot, hoursLost, cdi, triggerLevel, validationStatus, validationReason, payoutAmount, payoutTxnId, ai_explanation, fraudResult, status)
    VALUES (@id, @workerId, @workerName, @zone, @disruptionType, @date, @timeSlot, @hoursLost, @cdi, @triggerLevel, @validationStatus, @validationReason, @payoutAmount, @payoutTxnId, @ai_explanation, @fraudResult, @status)
  `).run({
    ...claimRecord,
    payoutTxnId: claimRecord.payoutTxnId || null,
    ai_explanation: claimRecord.ai_explanation || null,
    fraudResult: JSON.stringify(claimRecord.fraudResult)
  });

  // Emit WebSocket event if available on app logic (we can attach it to req.app later)
  if (req.app.locals.broadcastEvent) {
    req.app.locals.broadcastEvent('CLAIM_CREATED', { claimId: claimRecord.id, status: claimRecord.status });
    if (claimRecord.status === 'paid') {
      req.app.locals.broadcastEvent('PAYOUT_SENT', { claimId: claimRecord.id, amount: claimRecord.payoutAmount });
    }
    if (claimRecord.status === 'rejected' || claimRecord.status === 'flagged') {
      req.app.locals.broadcastEvent('FRAUD_BLOCKED', { claimId: claimRecord.id, reason: claimRecord.validationReason });
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
router.get('/master-payload', (req, res) => {
  const claims = db.prepare("SELECT * FROM claims WHERE status = 'paid'").all();
  res.json({
    systemId: "COVA_PARAMETRIC_01",
    timestamp: new Date().toISOString(),
    payloads: claims.map(c => ({
      claim: {
        policyNumber: `POL-${c.workerId}`,
        lossDate: c.date,
        causeOfLoss: c.disruptionType,
        locationZone: c.zone,
        payoutAmount: c.payoutAmount
      },
      telemetry: { weatherSource: "OpenWeatherMap", cdiScore: c.cdi },
      financials: { razorpayTxnId: c.payoutTxnId || 'pending' }
    }))
  });
});

/**
 * GET /api/claims
 * List all claims (Insurer view)
 */
router.get('/', (req, res) => {
  const claims = db.prepare('SELECT * FROM claims').all();
  res.json({ count: claims.length, claims });
});

/**
 * GET /api/claims/worker/:id
 * Get claim history for a specific worker
 */
router.get('/worker/:id', (req, res) => {
  const claims = db.prepare('SELECT * FROM claims WHERE workerId = ?').all(req.params.id);
  res.json({ count: claims.length, claims });
});

/**
 * GET /api/claims/:id
 * Get single claim details
 */
router.get('/:id', (req, res) => {
  const claim = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);
  if (!claim) return res.status(404).json({ error: "Claim not found" });
  res.json({ claim });
});

module.exports = router;

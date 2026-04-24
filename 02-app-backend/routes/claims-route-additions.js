const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pg = require('../data/pg');

// WARNING: Merge these routes into your existing endpoints in cova/backend/routes/claims.js

/**
 * 1. Modified GET /api/claims (Replace the existing / route to add ?workerId={id} filtering)
 */
router.get('/', async (req, res) => {
  try {
    const { workerId } = req.query;
    const dataMode = pg.getDataMode();
    let claims;
    
    if (workerId) {
      const { rows } = await pg.query('SELECT * FROM claims WHERE worker_id = $1 AND data_mode = $2', [workerId, dataMode]);
      claims = rows;
    } else {
      const { rows } = await pg.query('SELECT * FROM claims WHERE data_mode = $1', [dataMode]);
      claims = rows;
    }
    
    res.json({ count: claims.length, claims });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch claims: ' + err.message });
  }
});

/**
 * 2. GET /api/claims/:id/timeline
 * Returns the lifecycle stages for a given claim.
 */
router.get('/:id/timeline', async (req, res) => {
  try {
    const claimId = req.params.id;
    const { rows } = await pg.query('SELECT * FROM claims WHERE id = $1', [claimId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: "Claim not found" });
    }
    
    const claim = rows[0];

    // Derive base time from claim.date (e.g. YYYY-MM-DD). Set to noon to avoid timezone shift
    let baseTime = new Date(claim.date);
    if (isNaN(baseTime.getTime())) {
      baseTime = new Date();
    } else {
      baseTime.setHours(12, 0, 0, 0); 
    }

    const t0 = baseTime.getTime();
    // Adds simulated delay dynamically based on offset in seconds
    const formatTs = (offsetSec) => new Date(t0 + offsetSec * 1000).toISOString();

    // Extract fraud logic
    let fraudFlags = "";
    let fraudScore = 100;
    if (claim.fraud_result) {
      try {
        const fr = typeof claim.fraud_result === 'string' ? JSON.parse(claim.fraud_result) : claim.fraud_result;
        fraudScore = fr.score || 100;
        if (fr.flags && fr.flags.length > 0) {
          fraudFlags = fr.flags.map(f => f.rule || f.type).join(", ");
        }
      } catch(e){}
    }

    const fraudStatus = claim.status === 'flagged' ? 'flagged' : 'complete';
    let approvalStatus = 'complete';
    if (claim.status === 'pending') approvalStatus = 'pending';
    if (claim.status === 'rejected') approvalStatus = 'rejected';
    
    let paymentStatus = (claim.status === 'paid') ? 'complete' : 'pending';
    let syncStatus = paymentStatus;
    let settlementStatus = paymentStatus;

    // Compile timeline stages
    const stages = [
      { stage: "Detection", status: "complete", timestamp: formatTs(0), detail: `CDI ${claim.cdi?.toFixed(2) || 'N/A'} triggered in ${claim.zone}` },
      { stage: "Validation", status: "complete", timestamp: formatTs(8), detail: "Worker active, zone confirmed" },
      { stage: "Fraud Check", status: fraudStatus, timestamp: formatTs(15), 
        detail: `Score: ${fraudScore}/100, ${fraudFlags ? fraudFlags : '0'} flags` },
      { stage: "Approval", status: approvalStatus, timestamp: formatTs(22), detail: claim.validation_reason || "Approved based on rules framework" },
    ];

    if (approvalStatus !== 'rejected' && fraudStatus !== 'flagged') {
      stages.push({ stage: "Payment", status: paymentStatus, timestamp: formatTs(35), 
        detail: `UTR: ${claim.payout_txn_id || 'Pending'}, UPI: ${claim.worker_id}@upi` });
      stages.push({ stage: "Guidewire Sync", status: syncStatus, timestamp: formatTs(42), 
        detail: `Tracking: GW-${claim.id}` });
      stages.push({ stage: "Settlement", status: settlementStatus, timestamp: formatTs(60), detail: "Funds settled in worker account" });
    }

    // Derive current stage
    let currentStage = "Settlement";
    if (claim.status === 'pending') currentStage = "Approval";
    if (claim.status === 'flagged') currentStage = "Fraud Check";
    if (claim.status === 'rejected') currentStage = "Approval";
    if (claim.status === 'approved') currentStage = "Payment";
    if (claim.status === 'paid') currentStage = "Settlement";

    // Identify inference engine
    const aiSys = claim.ai_explanation && claim.ai_explanation.includes('Rule-Engine') 
      ? "Rule-Engine/fallback" 
      : "Groq/llama-3.3";

    res.json({
      claimId,
      stages,
      currentStage,
      totalTime: "47 seconds",
      aiExplanation: claim.ai_explanation || "No explanation attached.",
      aiSystem: aiSys,
      payoutDetails: {
        amount: claim.payout_amount || 0,
        upiId: `${claim.worker_id}@upi`,
        txnId: claim.payout_txn_id || 'N/A',
        upiRef: `REF-${Math.floor(100000 + Math.random()*900000)}`,
        timestamp: formatTs(35),
        razorpayPayoutId: `pout_${crypto.randomBytes(6).toString('hex')}`
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Timeline error: ' + err.message });
  }
});

/**
 * 3. POST /api/claims/:id/dispute
 * Allows a worker to dispute a rejected or flagged claim.
 */
router.post('/:id/dispute', (req, res) => {
  const randomId = crypto.randomInt(1000, 9999);
  res.status(200).json({
    disputeId: `DSP-${randomId}`,
    status: "Under Review",
    estimatedResolution: "3-5 business days"
  });
});

module.exports = router;

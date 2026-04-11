const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// In-memory array for last 50 submissions
const submissions = [];

/**
 * POST /api/guidewire/submit
 * Submit a Master Payload for all paid claims to Guidewire ClaimCenter
 */
router.post('/submit', (req, res) => {
  // Get all paid claims from database
  const db = require('../data/db');
  const paidClaims = db.prepare('SELECT * FROM claims WHERE status = \"paid\"').all();

  if (paidClaims.length === 0) {
    return res.status(400).json({ error: "No paid claims to submit" });
  }

  // Calculate total payout and other aggregates
  const totalPayout = paidClaims.reduce((sum, claim) => sum + (claim.payoutAmount || 0), 0);
  const claimsProcessed = paidClaims.length;

  // Generate master payload with aggregated data
  const random8digit = Math.floor(10000000 + Math.random() * 90000000);
  const random12hex = crypto.randomBytes(6).toString('hex').toUpperCase();
  const nowIso = new Date().toISOString();

  // Use first claim for individual fields (in real implementation, this would be more complex)
  const sampleClaim = paidClaims[0];

  const masterPayload = {
    guidewire_claim_id: `GW-CLM-${random8digit}`,
    status: "APPROVED_AUTO",
    claimsProcessed: claimsProcessed,
    claimsBlocked: 0, // In simulation, we assume all paid claims are valid
    totalPayout: totalPayout,
    lae_saved: claimsProcessed * 2000, // ₹2000 LAE saved per automated claim
    processingTime: `${Math.max(1, Math.round(claimsProcessed / 50))}s`,
    billingCenterTriggered: true,
    timestamp: nowIso,
    masterPayloadDetails: {
      claims: paidClaims.map(claim => ({
        claimId: claim.id,
        workerId: claim.workerId,
        workerName: claim.workerName,
        zone: claim.zone,
        disruptionType: claim.disruptionType,
        payoutAmount: claim.payoutAmount,
        cdi: claim.cdi,
        hoursLost: claim.hoursLost,
        payoutTxnId: claim.payoutTxnId
      }))
    }
  };

  // Add to in-memory store (last 50 submissions)
  submissions.unshift(masterPayload);
  if (submissions.length > 50) {
    submissions.pop();
  }

  // Broadcast via app.locals
  if (req.app.locals.broadcastEvent) {
    req.app.locals.broadcastEvent("GUIDEWIRE_SUBMITTED", {
      trackingId: masterPayload.masterPayloadDetails.trackingId || `GW-TRK-${random12hex}`,
      claimId: masterPayload.guidewire_claim_id
    });
  }

  console.log(`[GUIDEWIRE] Master payload submitted -> Tracking ID: GW-TRK-${random12hex}`);

  res.json(masterPayload);
});

/**
 * GET /api/guidewire/submissions
 * Returns last 50 submissions
 */
router.get('/submissions', (req, res) => {
  res.json(submissions);
});

/**
 * GET /api/guidewire/status
 * Returns API status
 */
router.get('/status', (req, res) => {
  res.json({
    connected: false,
    mode: "simulation",
    disclaimer: "Real Guidewire API requires enterprise credentials",
    submissionsToday: submissions.length
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

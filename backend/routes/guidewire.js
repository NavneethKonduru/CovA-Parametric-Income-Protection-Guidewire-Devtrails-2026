const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// In-memory array for last 50 submissions
const submissions = [];

/**
 * POST /api/guidewire/submit-claim
 * Submit a single claim and get Master Payload
 */
router.post('/submit-claim', (req, res) => {
  const {
    claimId, workerId, workerName, zone, disruptionType, cdi,
    hoursLost, payoutAmount, fraudResult, ai_explanation
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
      claimCenter: {
        claimNumber: `GW-CLM-${random8digit}`,
        claimType: "IncomeLoss_Parametric",
        lossType: mappedLossType,
        lossDate: nowIso,
        reportedDate: nowIso,
        status: "Open",
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
      policyCenter: {
        policyNumber: `GW-POL-COVA-${workerId || 'unknown'}`,
        product: "GigWorker_IncomeShield_v2",
        effectiveDate: enrolledDate.toISOString(),
        expirationDate: expirationDate.toISOString(),
        jurisdiction: "IN-KA",
        insurer: "Future Generali India Insurance"
      },
      billingCenter: {
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

  // Add to in-memory store (last 50)
  submissions.unshift(masterPayload);
  if (submissions.length > 50) {
    submissions.pop();
  }

  // Broadcast via app.locals
  if (req.app.locals.broadcastEvent) {
    req.app.locals.broadcastEvent("GUIDEWIRE_SUBMITTED", { 
      trackingId: masterPayload.acknowledgment.trackingId, 
      claimId: claimId || masterPayload.guidewire.claimCenter.claimNumber
    });
  }

  console.log(`[GUIDEWIRE] Claim submitted -> Tracking ID: ${masterPayload.acknowledgment.trackingId}`);

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

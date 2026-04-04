// ============================================================
// CLAIM VALIDATOR — Multi-Source Corroboration Engine
// ============================================================
// Validates claims using the "2 of 3" independent signal rule.
// This IS the fraud detection — built into the architecture.

const SIGNAL_THRESHOLD = 0.5; // Minimum score for a signal to "confirm"
const MIN_SIGNALS_REQUIRED = 2; // Need at least 2 of 3 signals

/**
 * Validate a claim using multi-source corroboration
 *
 * Rules:
 * 1. Off hours → always reject (no coverage 10PM-10AM)
 * 2. CDI < 0.4 → reject (insufficient disruption)
 * 3. Count signals ≥ 0.5 threshold → need at least 2 of 3
 * 4. CDI ≥ 0.6 AND 2+ signals → APPROVED
 * 5. CDI ≥ 0.4 AND only 1 signal → FLAGGED for review
 *
 * @param {object} signals - { weatherScore, demandScore, peerScore }
 * @param {string} timeSlot - "peak" | "active" | "off"
 * @param {number} cdi - pre-calculated CDI score
 * @returns {object} { status, reason, details }
 */
function validateClaim(signals, timeSlot, cdi) {
  const { weatherScore, demandScore, peerScore } = signals;

  // Rule 1: Off hours — no coverage
  if (timeSlot === "off") {
    return {
      status: "rejected",
      reason: "Disruption occurred during off-hours (10PM-10AM). No coverage during this period.",
      details: { rule: "OFF_HOURS", timeSlot }
    };
  }

  // Rule 2: CDI too low
  if (cdi < 0.4) {
    return {
      status: "rejected",
      reason: `CDI score ${cdi.toFixed(3)} is below minimum threshold (0.4). Disruption not significant enough.`,
      details: { rule: "LOW_CDI", cdi }
    };
  }

  // Count confirming signals (score ≥ 0.5)
  const confirmedSignals = [];
  if (weatherScore >= SIGNAL_THRESHOLD) confirmedSignals.push("weather");
  if (demandScore >= SIGNAL_THRESHOLD) confirmedSignals.push("demand");
  if (peerScore >= SIGNAL_THRESHOLD) confirmedSignals.push("peer");

  const signalCount = confirmedSignals.length;

  // Rule 3: CDI ≥ 0.8 AND 2+ signals → Critical auto-approve
  if (cdi >= 0.8 && signalCount >= MIN_SIGNALS_REQUIRED) {
    return {
      status: "approved",
      reason: `Critical disruption (CDI: ${cdi.toFixed(3)}). ${signalCount}/3 signals confirmed: [${confirmedSignals.join(', ')}]. Auto-approved for fast-track payout.`,
      details: { rule: "CRITICAL_AUTO_APPROVE", signalCount, confirmedSignals, cdi }
    };
  }

  // Rule 4: CDI ≥ 0.6 AND 2+ signals → Standard approve
  if (cdi >= 0.6 && signalCount >= MIN_SIGNALS_REQUIRED) {
    return {
      status: "approved",
      reason: `Disruption confirmed (CDI: ${cdi.toFixed(3)}). ${signalCount}/3 signals validated: [${confirmedSignals.join(', ')}]. Claim approved.`,
      details: { rule: "STANDARD_APPROVE", signalCount, confirmedSignals, cdi }
    };
  }

  // Rule 5: CDI ≥ 0.4 but insufficient signals → Flag for review
  if (cdi >= 0.4) {
    return {
      status: "flagged",
      reason: `CDI: ${cdi.toFixed(3)} suggests disruption, but only ${signalCount}/3 signals confirmed [${confirmedSignals.join(', ')}]. Requires manual review.`,
      details: { rule: "INSUFFICIENT_SIGNALS", signalCount, confirmedSignals, cdi }
    };
  }

  // Default reject
  return {
    status: "rejected",
    reason: "Claim does not meet validation criteria.",
    details: { rule: "DEFAULT_REJECT", signalCount, cdi }
  };
}

module.exports = { validateClaim, SIGNAL_THRESHOLD, MIN_SIGNALS_REQUIRED };

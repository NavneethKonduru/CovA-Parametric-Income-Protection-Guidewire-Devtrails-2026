// ============================================================
// CLAIM STATE MACHINE — Lifecycle Orchestration
// ============================================================

const VALID_TRANSITIONS = {
  // Entry points
  'pending_telemetry': ['approved_auto', 'held_fraud_review', 'rejected_fraud', 'expired_no_evidence'],
  'eligible_pending_validation': ['approved_auto', 'held_fraud_review', 'rejected_fraud', 'pending_telemetry'],
  
  // Intermediate holding states
  'held_fraud_review': ['manual_approved', 'rejected_fraud'],
  
  // Approval states
  'approved_auto': ['processing_payout'],
  'manual_approved': ['processing_payout'],
  
  // Payment states
  'processing_payout': ['paid', 'payout_failed'],
  'payout_failed': ['processing_payout'], // Can retry
  
  // Terminal states
  'paid': [],
  'rejected_fraud': [],
  'expired_no_evidence': []
};

/**
 * Validates if a state transition is legal
 * @param {string} fromState 
 * @param {string} toState 
 * @returns {boolean}
 */
function isValidTransition(fromState, toState) {
  if (!VALID_TRANSITIONS[fromState]) return false;
  return VALID_TRANSITIONS[fromState].includes(toState);
}

/**
 * Determines the initial state based on fraud score and telemetry completeness
 * @param {number} fraudScore (0.0 to 1.0)
 * @param {boolean} hasCompleteTelemetry
 * @returns {string} The determined next state
 */
function determineInitialState(fraudScore, hasCompleteTelemetry) {
  if (!hasCompleteTelemetry) {
    return 'pending_telemetry';
  }
  
  if (fraudScore >= 0.85) {
    return 'rejected_fraud';
  } else if (fraudScore >= 0.3) {
    return 'held_fraud_review';
  } else {
    return 'approved_auto';
  }
}

/**
 * Maps an internal CovA state to a Guidewire ClaimCenter status
 * @param {string} covaState 
 * @returns {string} Guidewire status string
 */
function mapToGuidewireStatus(covaState) {
  const map = {
    'pending_telemetry': 'Open - Awaiting Evidence',
    'eligible_pending_validation': 'Open - New',
    'held_fraud_review': 'Open - Under Investigation',
    'approved_auto': 'Approved',
    'manual_approved': 'Approved',
    'processing_payout': 'Approved - Payment Pending',
    'paid': 'Closed - Paid',
    'payout_failed': 'Open - Payment Failed',
    'rejected_fraud': 'Closed - Denied (Fraud)',
    'expired_no_evidence': 'Closed - Denied (No Evidence)'
  };
  return map[covaState] || 'Unknown';
}

module.exports = {
  VALID_TRANSITIONS,
  isValidTransition,
  determineInitialState,
  mapToGuidewireStatus
};

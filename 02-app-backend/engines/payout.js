// ============================================================
// PAYOUT CALCULATION ENGINE — Temporal-Weighted Payouts
// ============================================================
// Cova's key differentiator: payouts scale with WHEN the disruption
// hits relative to the worker's peak earning hours.

const TIME_MULTIPLIERS = {
  peak: 1.0,    // 12-2PM, 7-10PM — maximum earning potential
  active: 0.5,  // 10AM-12PM, 2-7PM — moderate earning potential
  off: 0.0      // 10PM-10AM — no coverage
};

const MAX_HOURS_PER_DAY = 8; // Cap at 8 hours per disruption

/**
 * Calculate payout for an approved claim
 * Formula: Hours_Lost × Hourly_Rate × Time_Multiplier × CDI_Factor
 *
 * @param {number} hoursLost - duration of disruption in hours
 * @param {number} hourlyRate - worker's average hourly earnings (150/120/80)
 * @param {string} timeSlot - "peak" | "active" | "off"
 * @param {number} cdi - CDI score (used as severity factor)
 * @returns {object} { payoutAmount, breakdown }
 */
function calculatePayout(hoursLost, hourlyRate, timeSlot, cdi) {
  const cappedHours = Math.min(hoursLost, MAX_HOURS_PER_DAY);
  const timeMultiplier = TIME_MULTIPLIERS[timeSlot] || 0;
  const cdiFactor = Math.min(cdi, 1.0);

  const payout = cappedHours * hourlyRate * timeMultiplier * cdiFactor;

  return {
    payoutAmount: parseFloat(payout.toFixed(2)),
    breakdown: {
      hoursLost: cappedHours,
      hourlyRate,
      timeSlot,
      timeMultiplier,
      cdiFactor: parseFloat(cdiFactor.toFixed(4)),
      formula: `${cappedHours}h × ₹${hourlyRate} × ${timeMultiplier} × ${cdiFactor.toFixed(3)} = ₹${payout.toFixed(2)}`
    }
  };
}

/**
 * Determine time slot from hour of day
 * @param {number} hour - 0 to 23
 * @returns {string} "peak" | "active" | "off"
 */
function getTimeSlot(hour) {
  // Peak: 12-13, 19-21
  if ((hour >= 12 && hour <= 13) || (hour >= 19 && hour <= 21)) return "peak";
  // Active: 10-11, 14-18
  if ((hour >= 10 && hour <= 11) || (hour >= 14 && hour <= 18)) return "active";
  return "off";
}

module.exports = { calculatePayout, getTimeSlot, TIME_MULTIPLIERS, MAX_HOURS_PER_DAY };

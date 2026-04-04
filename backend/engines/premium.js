const db = require('../data/db');
const { getAdminConfig, getInsurerConfig } = require('../data/db');
const { predictPremium, getPremiumExplanation, getSeasonalFactor, getModelStatus } = require('./premium-ml');

// ──────────────────────────────────────────────
// CONSTANTS & RULES
// ──────────────────────────────────────────────
const ZONE_MULTIPLIERS = {
  ZONE_A: 1.0,  // Standard
  ZONE_B: 1.3,  // High Risk (Flood Prone)
  ZONE_C: 0.8   // Low Risk
};

const ARCHETYPE_MULTIPLIERS = {
  heavy_peak: 1.4,
  balanced: 1.0,
  casual: 0.7
};

const ARCHETYPE_RATES = {
  heavy_peak: 150,
  balanced: 120,
  casual: 80
};

const DEFAULT_PEAK_HOURS = {
  heavy_peak: 30,
  balanced: 20,
  casual: 12
};

// ──────────────────────────────────────────────
// CORE CALCULATION
// ──────────────────────────────────────────────

/**
 * Calculates a personalized premium for a worker.
 *
 * @param {string} zone - Worker's delivery zone (e.g., 'ZONE_B')
 * @param {string} archetype - Worker's shift pattern (e.g., 'heavy_peak')
 * @param {object} [options] - Overrides for ML and manual adjustments
 * @returns {object} Full premium explanation and calculated values
 */
function calculatePremium(zone, archetype, options = {}) {
  const baseRate = getInsurerConfig('base_premium_rate') || 35;
  
  const zoneRisk = ZONE_MULTIPLIERS[zone] || 1.0;
  const archetypeFactor = ARCHETYPE_MULTIPLIERS[archetype] || 1.0;
  const hourlyRate = options.hourlyRate || ARCHETYPE_RATES[archetype] || 100;
  
  // A. Auto-compute seasonal factor
  const seasonalFactor = options.seasonalFactor || getSeasonalFactor();
  
  // B. Pass peak hours to ML Predictor
  const peakHoursPerWeek = options.peakHoursPerWeek || DEFAULT_PEAK_HOURS[archetype] || 20;

  const claimHistoryFactor = options.claimHistoryFactor || 1.0;

  // ML Predictor execution
  let prediction;
  let usedStrategy = '';
  try {
    prediction = predictPremium({
      zone,
      archetype,
      hourlyRate,
      seasonalFactor,
      claimHistoryFactor,
      peakHoursPerWeek
    });
    usedStrategy = getModelStatus().strategy;
    console.log(`[PREMIUM] Using strategy: ${usedStrategy}`);
  } catch (err) {
    console.warn(`[PREMIUM] ML predictor failed, falling back to emergency formula:`, err.message);
    const base = 35;
    const zRisk = ZONE_MULTIPLIERS[zone] || 1.0;
    const aRisk = ARCHETYPE_MULTIPLIERS[archetype] || 1.0;
    const sRisk = seasonalFactor || 1.0;
    const cRisk = claimHistoryFactor || 1.0;

    const zComp = base * (zRisk - 1.0) * 1.8;
    const aComp = base * aRisk;
    const sComp = base * 0.25 * (sRisk - 1.0);
    const cComp = base * 0.30 * (cRisk - 1.0);
    const pComp = (peakHoursPerWeek - 20) * 0.18;
    
    prediction = base + zComp + aComp + sComp + cComp + pComp;
    usedStrategy = 'emergency_fallback';
    console.log(`[PREMIUM] Using strategy: ${usedStrategy}`);
  }

  const clampedPremium = Math.round(Math.max(19, Math.min(89, prediction)));

  // C. Return with detailed explanation block
  return {
    premium: clampedPremium,
    weeklyPremium: clampedPremium,
    hourlyRate,
    modelUsed: usedStrategy,
    seasonalFactor,
    isMonsoonSeason: seasonalFactor > 1.1,
    explanation: getPremiumExplanation(zone, archetype, clampedPremium, seasonalFactor, claimHistoryFactor),
    breakdown: {
      baseRate,
      zoneRisk,
      archetypeFactor,
      seasonalFactor,
      claimHistoryFactor,
      peakHoursPerWeek,
      mlPrediction: prediction
    }
  };
}

/**
 * Generates an exhaustive list of all premium tiers.
 * Used by Insurer Dashboard & Onboarding pages.
 *
 * @returns {Array} Array of pricing configurations
 */
function getAllPremiumTiers() {
  const tiers = [];
  const seasonalFactor = getSeasonalFactor();
  const isMonsoonSeason = seasonalFactor > 1.1;

  for (const zone of Object.keys(ZONE_MULTIPLIERS)) {
    for (const archetype of Object.keys(ARCHETYPE_MULTIPLIERS)) {
      
      const calc = calculatePremium(zone, archetype, { seasonalFactor });
      
      // D. Include explanation and isMonsoonSeason
      tiers.push({
        zone,
        archetype,
        hourlyRate: ARCHETYPE_RATES[archetype],
        weeklyPremium: calc.weeklyPremium,
        multiplier: parseFloat((ZONE_MULTIPLIERS[zone] * ARCHETYPE_MULTIPLIERS[archetype] * seasonalFactor).toFixed(2)),
        explanation: calc.explanation,
        isMonsoonSeason
      });
    }
  }

  return tiers;
}

module.exports = {
  calculatePremium,
  getAllPremiumTiers,
  ZONE_MULTIPLIERS,
  ARCHETYPE_MULTIPLIERS,
  ARCHETYPE_RATES
};

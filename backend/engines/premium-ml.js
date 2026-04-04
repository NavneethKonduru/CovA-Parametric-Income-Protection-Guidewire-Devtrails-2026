const fs = require('fs');
const path = require('path');

let modelCoefficients = null;
let lastUsedStrategy = 'actuarial_fallback';

try {
  const modelPath = path.join(__dirname, '../ml/model_coefficients.json');
  if (fs.existsSync(modelPath)) {
    modelCoefficients = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  }
} catch (e) {
  console.warn("ML Model coefficients not found, using fallback linear rules.");
}

const ZONE_RISK = { ZONE_A: 1.0, ZONE_B: 1.3, ZONE_C: 0.8 };
const ARCHETYPE_FACTOR = { casual: 0.7, balanced: 1.0, heavy_peak: 1.4 };

/**
 * Get seasonal multiplier based on current month.
 * Deterministic mapping to Indian seasons.
 */
function getSeasonalFactor() {
  const month = new Date().getMonth() + 1; // 1-12
  if ([6, 7, 8, 9].includes(month)) return 1.30;     // Monsoon
  if ([10, 11].includes(month)) return 1.05;         // Post-monsoon
  if ([12, 1, 2, 3].includes(month)) return 0.82;    // Dry
  if ([4, 5].includes(month)) return 0.95;           // Pre-monsoon heat
  return 1.0;
}

/**
 * Predict individual worker premium using ML or actuarial fallback
 *
 * @param {object} params - { zone, archetype, hourlyRate, seasonalFactor, claimHistoryFactor, peakHoursPerWeek }
 */
function predictPremium(params) {
  const { zone, archetype, hourlyRate, seasonalFactor, claimHistoryFactor, peakHoursPerWeek = 20 } = params;
  
  // Strategy 1: GBR Lookup Table
  if (modelCoefficients && modelCoefficients.lookup_table) {
      // Map seasonal factor cleanly back to 4 possible buckets for dict lookup
      let season = 'dry';
      if (seasonalFactor >= 1.25) season = 'monsoon';
      else if (seasonalFactor >= 1.05) season = 'post-monsoon';
      else if (seasonalFactor >= 0.95) season = 'pre-monsoon';
      
      const lookupKey = `${zone}_${archetype}_${season}`;
      const basePremium = modelCoefficients.lookup_table[lookupKey];
      
      if (basePremium) {
          const claimsAdjustment = 35 * 0.30 * (claimHistoryFactor - 1.0);
          const perHourRate = modelCoefficients.peak_hours_per_week?.per_hour_rate || 0.18;
          const peakHoursAdjustment = (peakHoursPerWeek - 20) * perHourRate;
          
          let finalPremium = Math.round(basePremium + claimsAdjustment + peakHoursAdjustment);
          lastUsedStrategy = 'gbr_lookup_table';
          return Math.max(19, Math.min(89, finalPremium));
      }
  }

  // Strategy 2: Actuarial Fallback (when model not trained yet)
  lastUsedStrategy = 'actuarial_fallback';

  const base = 35;
  const zRisk = ZONE_RISK[zone] || 1.0;
  const aRisk = ARCHETYPE_FACTOR[archetype] || 1.0;
  const sRisk = seasonalFactor || 1.0;
  const cRisk = claimHistoryFactor || 1.0;

  const zComp = base * (zRisk - 1.0) * 1.8;
  const aComp = base * aRisk;
  const sComp = base * 0.25 * (sRisk - 1.0);
  const cComp = base * 0.30 * (cRisk - 1.0);
  const pComp = (peakHoursPerWeek - 20) * 0.18;
  
  const premium = base + zComp + aComp + sComp + cComp + pComp;
  return Math.round(Math.max(19, Math.min(89, premium)));
}

/**
 * Provide human-readable, context-aware pricing explanation
 */
function getPremiumExplanation(zone, archetype, premium, seasonalFactor, claimHistoryFactor) {
  const parts = [];
  
  if (zone === 'ZONE_B') {
      parts.push("Whitefield has 30% higher flood risk than Bangalore average.");
  }
  
  if (archetype === 'heavy_peak') {
      parts.push("Your heavy-peak schedule covers the 2 highest-risk daily windows.");
  }
  
  if (seasonalFactor > 1.1) {
      parts.push("Monsoon season (Jun–Sep) adds a 30% weather risk loading.");
  }
  
  if (claimHistoryFactor < 0.95) {
      const discount = Math.round(35 * 0.30 * (1.0 - claimHistoryFactor));
      parts.push(`Your clean claim history earns a ₹${discount} loyalty discount.`);
  } else if (claimHistoryFactor > 1.1) {
      const loading = Math.round(35 * 0.30 * (claimHistoryFactor - 1.0));
      parts.push(`Your prior claims history adds a ₹${loading} risk loading.`);
  }
  
  if (parts.length === 0) {
      parts.push("Your premium strictly aligns with the geographic baseline for your delivery zone.");
  }

  return parts.join(' ').substring(0, 400); 
}

/**
 * High-level pre-enrollment preview 
 */
function getPremiumPreview(params) {
    const sFactor = params.seasonalFactor || getSeasonalFactor();
    const cFactor = params.claimHistoryFactor || 1.0;
    const premium = predictPremium({ ...params, seasonalFactor: sFactor, claimHistoryFactor: cFactor });
    return {
        premium,
        explanation: getPremiumExplanation(params.zone, params.archetype, premium, sFactor, cFactor)
    };
}

/**
 * Returns the current status of the ML model
 */
function getModelStatus() {
  return {
    strategy: lastUsedStrategy,
    modelLoaded: modelCoefficients !== null,
    lookupTableSize: modelCoefficients?.lookup_table ? Object.keys(modelCoefficients.lookup_table).length : 0
  };
}

module.exports = { predictPremium, getPremiumPreview, getPremiumExplanation, getSeasonalFactor, getModelStatus };

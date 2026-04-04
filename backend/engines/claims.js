// ============================================================
// CLAIMS ENGINE — Composite Disruption Index (CDI) Calculator
// ============================================================
// Production-grade CDI engine with:
//   • Raw signal normalization (physical → 0–1 scores)
//   • EMA smoothing (alpha = 0.35)
//   • Zone-adjusted threshold sensitivity
//   • Signal contribution explanations
//   • CDI history integration

const cdiHistory = require('./cdi-history');

// ──────────────────────────────────────────────
//  MODULE STATE
// ──────────────────────────────────────────────

let CDI_STRATEGY = 'any_dominant';
let DECORRELATE_SIGNALS = false;

/**
 * Updates the current CDI trigger strategy.
 * @param {string} strategy - 'weighted_sum' | 'any_dominant' | 'min_two_factors'
 */
function setCDIStrategy(strategy) {
  CDI_STRATEGY = strategy;
}

/**
 * Toggles demand/weather correlation decorrelation.
 * @param {boolean} bool - True to apply decorrelation, false otherwise.
 */
function setDecorrelateSignals(bool) {
  DECORRELATE_SIGNALS = bool;
}

// ──────────────────────────────────────────────
//  CONSTANTS
// ──────────────────────────────────────────────

const WEIGHTS = {
  weather: 0.40,
  demand: 0.35,
  peer: 0.25,
};

const TRIGGER_THRESHOLDS = {
  none: 0.4,      // CDI < 0.4 → no trigger
  watch: 0.6,     // 0.4 ≤ CDI < 0.6 → watch/alert
  standard: 0.8,  // 0.6 ≤ CDI < 0.8 → auto-initiate claim
  critical: 1.0,  // CDI ≥ 0.8 → instant auto-approve
};

/** Zone sensitivity multipliers for threshold adjustment */
const ZONE_SENSITIVITY = {
  ZONE_A: 1.00,  // Standard sensitivity
  ZONE_B: 0.92,  // Triggers earlier — historically flood-prone
  ZONE_C: 1.08,  // Requires more evidence — low-risk area
};

/** EMA smoothing factor: 0.35 = moderately reactive */
const EMA_ALPHA = 0.35;

/** Expected active worker ratio by time-of-day slot */
const EXPECTED_ACTIVE_RATIOS = {
  peak: 0.85,    // 12–14, 19–22
  active: 0.60,  // 8–12, 14–19
  off: 0.20,     // 22–8
};

// ──────────────────────────────────────────────
//  IN-MEMORY EMA STATE
// ──────────────────────────────────────────────

/** @type {Map<string, number>} Previous smoothed CDI per zone */
const previousCDI = new Map();

// ──────────────────────────────────────────────
//  TIME SLOT HELPER
// ──────────────────────────────────────────────

/**
 * Determine the time slot (peak/active/off) from the current hour.
 *
 * @param {number} hour - Hour of the day (0–23)
 * @returns {'peak'|'active'|'off'}
 */
function getTimeSlot(hour) {
  if ((hour >= 12 && hour <= 13) || (hour >= 19 && hour <= 21)) return 'peak';
  if (hour >= 8 && hour <= 21) return 'active';
  return 'off';
}

// ──────────────────────────────────────────────
//  SIGNAL NORMALIZATION FUNCTIONS
// ──────────────────────────────────────────────

/**
 * Normalize raw weather data into a 0–1 weather score.
 *
 * Logic:
 *  - rainfall_score = min(rainfall_mm / 80, 1.0) — 80mm/hr is IMD "very heavy"
 *  - heat_score = temp > 42°C ? min((temp - 42) / 8, 1.0) : 0 — extreme starts at 42°C
 *  - wind_score = min(wind_speed_kmh / 60, 1.0) — 60km/h = cyclonic
 *  - final = min(max(rainfall, heat) + wind * 0.2, 1.0)
 *
 * @param {object} rawWeather - { rainfall_mm, temperature_celsius|temperature, wind_speed_kmh, condition }
 * @returns {number} Weather score 0.0–1.0
 */
function normalizeWeatherScore(rawWeather) {
  if (!rawWeather || typeof rawWeather !== 'object') return 0;

  const rainfall_mm = rawWeather.rainfall_mm || 0;
  // Accept either 'temperature_celsius' or 'temperature' (mock API uses 'temperature')
  const temperature = rawWeather.temperature_celsius ?? rawWeather.temperature ?? 0;
  const wind_speed_kmh = rawWeather.wind_speed_kmh || 0;

  // Rainfall: 80mm/hr = extreme (IMD "very heavy rainfall" = 64.5mm+)
  const rainfall_score = Math.min(rainfall_mm / 80, 1.0);

  // Heat: extreme starts at 42°C, caps at 50°C
  const heat_score = temperature > 42
    ? Math.min((temperature - 42) / 8, 1.0)
    : 0;

  // Wind: 60 km/h = cyclonic conditions
  const wind_score = Math.min(wind_speed_kmh / 60, 1.0);

  // Weather score dominated by worst condition, wind is additive bonus
  const score = Math.min(Math.max(rainfall_score, heat_score) + (wind_score * 0.2), 1.0);

  return parseFloat(Math.max(0, Math.min(score, 1.0)).toFixed(4));
}

/**
 * Normalize raw demand data into a 0–1 demand disruption score.
 *
 * Uses a sigmoid curve for smooth transition:
 *  - Below 40% demand drop → low score
 *  - Above 60% demand drop → high score
 *  - Platform outage/suspended → 0.95
 *
 * @param {object} rawDemand - { current_orders, baseline_orders, platform_status }
 * @returns {number} Demand score 0.0–1.0
 */
function normalizeDemandScore(rawDemand) {
  if (!rawDemand || typeof rawDemand !== 'object') return 0;

  const platform_status = rawDemand.platform_status || 'normal';

  // Platform outage/suspended is a near-certain disruption
  if (platform_status === 'outage' || platform_status === 'suspended') {
    return 0.95;
  }

  const current_orders = rawDemand.current_orders ?? 0;
  const baseline_orders = rawDemand.baseline_orders ?? 1;

  if (baseline_orders <= 0) return 0;

  const drop = (baseline_orders - current_orders) / baseline_orders;

  // Sigmoid S-curve: smooth transition centered at 40% drop
  // Below 40% drop = low score, above 60% drop = high score
  const demandScore = 1 / (1 + Math.exp(-10 * (drop - 0.4)));

  return parseFloat(Math.max(0, Math.min(demandScore, 1.0)).toFixed(4));
}

/**
 * Normalize raw peer offline data into a 0–1 peer disruption score.
 *
 * Compares current active workers to expected active count for the
 * current time slot. Amplified by 1.2x since peer dropout is a strong signal.
 *
 * @param {object} rawPeer - { active_now, active_7day_avg, time_slot }
 * @returns {number} Peer score 0.0–1.0
 */
function normalizePeerScore(rawPeer) {
  if (!rawPeer || typeof rawPeer !== 'object') return 0;

  const active_now = rawPeer.active_now ?? 0;
  const active_7day_avg = rawPeer.active_7day_avg ?? 1;
  const time_slot = rawPeer.time_slot || 'active';

  const expectedRatio = EXPECTED_ACTIVE_RATIOS[time_slot] || 0.60;
  const expected_active = active_7day_avg * expectedRatio;

  if (expected_active <= 0) return 0;

  const drop_ratio = Math.max(0, (expected_active - active_now) / expected_active);

  // Amplify by 1.2x — peer dropout is a strong disruption signal
  const score = Math.min(drop_ratio * 1.2, 1.0);

  return parseFloat(Math.max(0, Math.min(score, 1.0)).toFixed(4));
}

// ──────────────────────────────────────────────
//  CORE CDI CALCULATION
// ──────────────────────────────────────────────

/**
 * Calculate Composite Disruption Index (CDI).
 * CDI = (0.40 × weather) + (0.35 × demand) + (0.25 × peer)
 *
 * @param {number} weatherScore - 0.0 to 1.0
 * @param {number} demandScore  - 0.0 to 1.0
 * @param {number} peerScore    - 0.0 to 1.0
 * @param {object} [customWeights] - Optional override for weights
 * @returns {number} CDI value 0.0–1.0
 */
function calculateCDI(weatherScore, demandScore, peerScore, customWeights) {
  const w = customWeights || WEIGHTS;

  let effectiveDemand = demandScore;
  if (DECORRELATE_SIGNALS) {
    effectiveDemand = demandScore * (1 - 0.4 * weatherScore);
  }

  const cdi = (w.weather * weatherScore) +
              (w.demand * effectiveDemand) +
              (w.peer * peerScore);
  return parseFloat(Math.min(Math.max(cdi, 0), 1.0).toFixed(4));
}

// ──────────────────────────────────────────────
//  EMA SMOOTHING
// ──────────────────────────────────────────────

/**
 * Apply Exponential Moving Average smoothing to a CDI reading.
 * smoothedCDI = alpha × newCDI + (1 - alpha) × previousCDI
 *
 * On first reading for a zone, smoothedCDI = newCDI.
 *
 * @param {string} zone - Zone ID
 * @param {number} newCDI - Raw CDI value
 * @returns {number} Smoothed CDI value
 */
function applyEMASmoothing(zone, newCDI) {
  if (!previousCDI.has(zone)) {
    previousCDI.set(zone, newCDI);
    return parseFloat(newCDI.toFixed(4));
  }

  const prev = previousCDI.get(zone);
  const smoothed = (EMA_ALPHA * newCDI) + ((1 - EMA_ALPHA) * prev);
  const result = parseFloat(Math.min(Math.max(smoothed, 0), 1.0).toFixed(4));
  previousCDI.set(zone, result);
  return result;
}

// ──────────────────────────────────────────────
//  ZONE-AWARE THRESHOLD
// ──────────────────────────────────────────────

/**
 * Get the effective threshold for a zone, adjusted by zone sensitivity.
 *
 * @param {number} baseThreshold - The insurer-configured base threshold
 * @param {string} zone - Zone ID
 * @returns {{effectiveThreshold: number, sensitivityFactor: number}}
 */
function getEffectiveThreshold(baseThreshold, zone) {
  const sensitivityFactor = ZONE_SENSITIVITY[zone] || 1.0;
  const effectiveThreshold = parseFloat((baseThreshold * sensitivityFactor).toFixed(4));
  return { effectiveThreshold, sensitivityFactor };
}

// ──────────────────────────────────────────────
//  TRIGGER LEVEL
// ──────────────────────────────────────────────

/**
 * Determine trigger level from CDI score.
 *
 * @param {number} cdi - CDI score (0.0 to 1.0)
 * @returns {{level: string, description: string, shouldTriggerClaim: boolean}}
 */
function getTriggerLevel(cdi) {
  if (cdi >= 0.8) {
    return {
      level: 'critical',
      description: 'Critical disruption — instant auto-approve',
      shouldTriggerClaim: true,
    };
  } else if (cdi >= 0.6) {
    return {
      level: 'standard',
      description: 'Significant disruption — auto-initiate claim, validate with signals',
      shouldTriggerClaim: true,
    };
  } else if (cdi >= 0.4) {
    return {
      level: 'watch',
      description: 'Moderate disruption — alert workers, monitor zone',
      shouldTriggerClaim: false,
    };
  } else {
    return {
      level: 'none',
      description: 'Normal conditions — no action needed',
      shouldTriggerClaim: false,
    };
  }
}

// ──────────────────────────────────────────────
//  DISRUPTION NARRATIVE BUILDER
// ──────────────────────────────────────────────

/**
 * Build a human-readable disruption narrative from signal data.
 *
 * @param {object} params
 * @param {number} params.weatherScore
 * @param {number} params.demandScore
 * @param {number} params.peerScore
 * @param {object} [params.rawWeather] - Original weather data for context
 * @param {object} [params.rawDemand] - Original demand data for context
 * @param {string} [params.zone]
 * @returns {string} Human-readable narrative
 */
function buildNarrative({ weatherScore, demandScore, peerScore, rawWeather, rawDemand, zone }) {
  const parts = [];

  // Find dominant signal
  const signals = [
    { name: 'weather', score: weatherScore },
    { name: 'demand', score: demandScore },
    { name: 'peer', score: peerScore },
  ];
  signals.sort((a, b) => b.score - a.score);
  const dominant = signals[0].name;

  // Weather narrative
  if (rawWeather && weatherScore > 0.2) {
    const rainfall = rawWeather.rainfall_mm || 0;
    const temp = rawWeather.temperature_celsius ?? rawWeather.temperature ?? 0;
    const wind = rawWeather.wind_speed_kmh || 0;
    const condition = rawWeather.condition || 'unknown';

    if (rainfall > 40) {
      parts.push(`Heavy rainfall (${rainfall}mm/hr) is ${dominant === 'weather' ? 'the primary driver' : 'contributing'}.`);
    } else if (temp > 42) {
      parts.push(`Extreme heat (${temp}°C) is ${dominant === 'weather' ? 'the primary driver' : 'contributing'}.`);
    } else if (wind > 50) {
      parts.push(`Cyclonic winds (${wind}km/h) are ${dominant === 'weather' ? 'the primary driver' : 'contributing'}.`);
    } else if (condition !== 'clear') {
      parts.push(`Weather conditions (${condition}) are ${dominant === 'weather' ? 'the primary driver' : 'a factor'}.`);
    }
  }

  // Demand narrative
  if (rawDemand && demandScore > 0.2) {
    const current = rawDemand.current_orders ?? 0;
    const baseline = rawDemand.baseline_orders ?? 1;
    const dropPct = baseline > 0 ? Math.round(((baseline - current) / baseline) * 100) : 0;
    const platform = rawDemand.platform_status || 'normal';
    const zoneName = { ZONE_A: 'Koramangala', ZONE_B: 'Whitefield', ZONE_C: 'Indiranagar' }[zone] || zone;

    if (platform === 'outage' || platform === 'suspended') {
      parts.push(`Platform is in ${platform} mode in ${zoneName}.`);
    } else if (dropPct > 0) {
      parts.push(`Order demand in ${zoneName} has dropped ${dropPct}% below baseline.`);
    }
  }

  // Peer narrative
  if (peerScore > 0.2) {
    const peerPct = Math.round(peerScore * 100);
    parts.push(`${peerPct}% of zone workers have gone offline.`);
  }

  if (parts.length === 0) {
    return 'Conditions are within normal operating parameters.';
  }

  return parts.join(' ');
}

// ──────────────────────────────────────────────
//  MAIN ANALYSIS FUNCTION
// ──────────────────────────────────────────────

/**
 * Process a full disruption event for a zone.
 * Calculates CDI, applies EMA smoothing, determines trigger level,
 * records to history, and builds an explanation narrative.
 *
 * @param {object} signals - { weatherScore, demandScore, peerScore }
 * @param {object} [options] - Optional configuration
 * @param {string} [options.zone] - Zone ID for EMA + history tracking
 * @param {number} [options.baseThreshold] - Insurer-configured threshold for zone sensitivity
 * @param {object} [options.rawWeather] - Raw weather data for narrative
 * @param {object} [options.rawDemand] - Raw demand data for narrative
 * @param {object} [options.customWeights] - Optional CDI weight overrides
 * @returns {object} Full disruption analysis result
 */
function analyzeDisruption(signals, options = {}) {
  const { weatherScore, demandScore, peerScore } = signals;
  const { zone, baseThreshold, rawWeather, rawDemand, customWeights } = options;

  // 1. Calculate raw CDI
  const rawCDI = calculateCDI(weatherScore, demandScore, peerScore, customWeights);

  // 2. Apply EMA smoothing (if zone is provided)
  let smoothedCDI = rawCDI;
  if (zone) {
    smoothedCDI = applyEMASmoothing(zone, rawCDI);
  }

  // 3. Zone-adjusted threshold
  let thresholdInfo = null;
  if (baseThreshold && zone) {
    thresholdInfo = getEffectiveThreshold(baseThreshold, zone);
  }

  // 4. Trigger level (based on smoothed CDI)
  const trigger = getTriggerLevel(smoothedCDI);

  // Apply trigger strategies based on raw scores (not effectiveDemand)
  if (CDI_STRATEGY === 'any_dominant') {
    if (weatherScore >= 0.65 || demandScore >= 0.65 || peerScore >= 0.65) {
      trigger.shouldTriggerClaim = true;
      if (trigger.level === 'none' || trigger.level === 'watch') {
        trigger.level = 'standard';
        trigger.description = 'Triggered via any_dominant strategy';
      }
    }
  } else if (CDI_STRATEGY === 'min_two_factors') {
    let factors = 0;
    if (weatherScore >= 0.50) factors++;
    if (demandScore >= 0.50) factors++;
    if (peerScore >= 0.50) factors++;
    if (factors >= 2) {
      trigger.shouldTriggerClaim = true;
      if (trigger.level === 'none' || trigger.level === 'watch') {
        trigger.level = 'standard';
        trigger.description = 'Triggered via min_two_factors strategy';
      }
    }
  }

  // Calculate effective demand for contributions to match rawCDI
  let effectiveDemandContrib = demandScore;
  if (DECORRELATE_SIGNALS) {
    effectiveDemandContrib = demandScore * (1 - 0.4 * weatherScore);
  }

  // 5. Signal contribution analysis
  const contributions = {
    weather: parseFloat((WEIGHTS.weather * weatherScore).toFixed(4)),
    demand: parseFloat((WEIGHTS.demand * effectiveDemandContrib).toFixed(4)),
    peer: parseFloat((WEIGHTS.peer * peerScore).toFixed(4)),
  };

  // Identify dominant signal
  const dominantSignal = Object.entries(contributions)
    .sort(([, a], [, b]) => b - a)[0][0];

  // 6. Build human-readable narrative
  const disruption_narrative = buildNarrative({
    weatherScore, demandScore, peerScore,
    rawWeather, rawDemand, zone,
  });

  // 7. Record to CDI history
  if (zone) {
    cdiHistory.addCDIReading(zone, rawCDI, smoothedCDI, {
      weather: weatherScore,
      demand: demandScore,
      peer: peerScore,
    });
  }

  return {
    cdi: smoothedCDI,
    rawCDI,
    smoothedCDI,
    trigger,
    signals: {
      weather: { score: weatherScore, weight: WEIGHTS.weather, contribution: contributions.weather },
      demand: { score: demandScore, weight: WEIGHTS.demand, contribution: contributions.demand },
      peer: { score: peerScore, weight: WEIGHTS.peer, contribution: contributions.peer },
    },
    dominantSignal,
    disruption_narrative,
    thresholdInfo,
    zoneTrend: zone ? cdiHistory.getZoneTrend(zone) : null,
  };
}

// ──────────────────────────────────────────────
//  CDI HISTORY ACCESSOR
// ──────────────────────────────────────────────

/**
 * Get recent CDI history for a zone (delegates to cdi-history module).
 *
 * @param {string} zone - Zone ID
 * @param {number} [limit=10]
 * @returns {Array}
 */
function getCDIHistory(zone, limit = 10) {
  return cdiHistory.getCDIHistory(zone, limit);
}

// ──────────────────────────────────────────────
//  EXPORTS
// ──────────────────────────────────────────────

module.exports = {
  // Core functions (backward compatible)
  calculateCDI,
  getTriggerLevel,
  analyzeDisruption,

  // Constants
  WEIGHTS,
  TRIGGER_THRESHOLDS,
  ZONE_SENSITIVITY,
  EMA_ALPHA,
  EXPECTED_ACTIVE_RATIOS,

  // Normalization functions (new)
  normalizeWeatherScore,
  normalizeDemandScore,
  normalizePeerScore,

  // Threshold functions (new)
  getEffectiveThreshold,
  getTimeSlot,

  // History accessor (new)
  getCDIHistory,

  // Config accessors
  setCDIStrategy,
  setDecorrelateSignals,
  getCurrentStrategy: () => CDI_STRATEGY
};

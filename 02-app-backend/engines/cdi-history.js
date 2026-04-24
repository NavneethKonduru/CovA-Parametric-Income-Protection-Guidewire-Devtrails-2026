// ============================================================
// CDI HISTORY — In-Memory CDI Reading Store
// ============================================================
// Maintains a per-zone circular buffer of CDI readings for trend
// analysis and Insurer Dashboard charting. Resets on server restart.

// NOTE: getTriggerLevel is loaded lazily inside addCDIReading() to break
// the circular dependency between claims.js ↔ cdi-history.js.

/** @type {Map<string, Array<{timestamp: string, rawCDI: number, smoothedCDI: number, signals: object, triggerLevel: string}>>} */
const history = new Map();

const MAX_BUFFER_SIZE = 20;

/**
 * Add a CDI reading to the zone's history buffer.
 * Maintains a circular buffer of MAX_BUFFER_SIZE entries per zone.
 *
 * @param {string} zone - Zone ID (e.g., 'ZONE_A')
 * @param {number} rawCDI - Raw (unsmoothed) CDI value
 * @param {number} smoothedCDI - EMA-smoothed CDI value
 * @param {object} signals - Signal breakdown { weather, demand, peer }
 * @param {string} [timestamp] - ISO timestamp (defaults to now)
 */
function addCDIReading(zone, rawCDI, smoothedCDI, signals, timestamp) {
  if (!history.has(zone)) {
    history.set(zone, []);
  }

  const buffer = history.get(zone);
  // Lazy require to avoid circular dependency
  const { getTriggerLevel } = require('./claims');
  const trigger = getTriggerLevel(smoothedCDI);

  const entry = {
    timestamp: timestamp || new Date().toISOString(),
    rawCDI: parseFloat(rawCDI.toFixed(4)),
    smoothedCDI: parseFloat(smoothedCDI.toFixed(4)),
    signals: {
      weather: parseFloat((signals.weather || 0).toFixed(4)),
      demand: parseFloat((signals.demand || 0).toFixed(4)),
      peer: parseFloat((signals.peer || 0).toFixed(4)),
    },
    triggerLevel: trigger.level,
  };

  buffer.push(entry);

  // Circular buffer: drop oldest when exceeding max size
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.shift();
  }
}

/**
 * Get the last N CDI readings for a zone.
 *
 * @param {string} zone - Zone ID
 * @param {number} [limit=10] - Maximum number of readings to return
 * @returns {Array<{timestamp: string, rawCDI: number, smoothedCDI: number, signals: object, triggerLevel: string}>}
 */
function getCDIHistory(zone, limit = 10) {
  const buffer = history.get(zone);
  if (!buffer || buffer.length === 0) {
    return [];
  }
  return buffer.slice(-limit);
}

/**
 * Calculate the linear trend of smoothedCDI over recent readings.
 * Uses the last 5 readings to determine direction and slope.
 *
 * @param {string} zone - Zone ID
 * @returns {{direction: 'rising'|'falling'|'stable', slope: number, acceleration: number}}
 */
function getZoneTrend(zone) {
  const buffer = history.get(zone);
  if (!buffer || buffer.length < 2) {
    return { direction: 'stable', slope: 0, acceleration: 0 };
  }

  const recent = buffer.slice(-5);
  const values = recent.map(r => r.smoothedCDI);

  // Slope: (last - first) / count
  const slope = (values[values.length - 1] - values[0]) / (values.length - 1);

  // Acceleration: compute successive slopes, then slope of those slopes
  let acceleration = 0;
  if (values.length >= 3) {
    const slopes = [];
    for (let i = 1; i < values.length; i++) {
      slopes.push(values[i] - values[i - 1]);
    }
    // Acceleration = slope of the slopes
    if (slopes.length >= 2) {
      acceleration = (slopes[slopes.length - 1] - slopes[0]) / (slopes.length - 1);
    }
  }

  // Direction classification
  let direction = 'stable';
  if (slope > 0.01) {
    direction = 'rising';
  } else if (slope < -0.01) {
    direction = 'falling';
  }

  return {
    direction,
    slope: parseFloat(slope.toFixed(6)),
    acceleration: parseFloat(acceleration.toFixed(6)),
  };
}

/**
 * Get a summary of CDI state across all tracked zones.
 * Includes current value, trend, max and average of last 10 readings.
 *
 * @returns {Object<string, {current: number, trend: object, maxLast10: number, avgLast10: number}>}
 */
function getCDISummary() {
  const summary = {};

  for (const [zone, buffer] of history.entries()) {
    if (buffer.length === 0) continue;

    const recent = buffer.slice(-10);
    const values = recent.map(r => r.smoothedCDI);
    const current = values[values.length - 1];
    const maxLast10 = Math.max(...values);
    const avgLast10 = parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4));

    summary[zone] = {
      current: parseFloat(current.toFixed(4)),
      trend: getZoneTrend(zone),
      maxLast10: parseFloat(maxLast10.toFixed(4)),
      avgLast10,
      readingCount: buffer.length,
      lastUpdate: buffer[buffer.length - 1].timestamp,
    };
  }

  return summary;
}

/**
 * Clear all CDI history. Used by demo reset.
 */
function clearHistory() {
  history.clear();
}

module.exports = {
  addCDIReading,
  getCDIHistory,
  getZoneTrend,
  getCDISummary,
  clearHistory,
};

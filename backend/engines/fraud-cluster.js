// ============================================================
// FRAUD CLUSTER ANALYSIS — TCHC Spatial/Temporal Consensus
// ============================================================
// Handles zone-level cluster analysis running on windowed data.
// Detects device farms and coordinated ghost worker attacks.

/** @type {Map<string, Array<{workerId: string, lat: number, lon: number, timestamp: number, deviceId: string}>>} */
const zoneWindow = new Map();

/**
 * Calculate temporal entropy to test if claims are suspiciously clumped.
 *
 * @param {number[]} timestamps - Array of epoch timestamps (ms)
 * @returns {{entropy: number, isSuspicious: boolean, meanIntervalMs: number}}
 */
function calculateTemporalEntropyMs(timestamps) {
  if (!timestamps || timestamps.length < 2) {
    return { entropy: 1.0, isSuspicious: false, meanIntervalMs: 60000 };
  }
  
  const sorted = [...timestamps].sort((a, b) => a - b);
  let totalInterval = 0;
  
  for (let i = 1; i < sorted.length; i++) {
    totalInterval += (sorted[i] - sorted[i - 1]);
  }
  
  const meanIntervalMs = totalInterval / (sorted.length - 1);
  const entropy = (meanIntervalMs / 1000) / 60; // Normalize to 60s window
  
  return {
    entropy,
    isSuspicious: entropy < 0.05, // e.g. <3 seconds mean interval is highly suspicious
    meanIntervalMs
  };
}

/**
 * Register a claim event into the temporal zone window.
 * Prunes entries older than 60 seconds automatically.
 *
 * @param {string} zone - Delivery zone ID
 * @param {string} workerId - Worker ID filing the claim
 * @param {number} lat - GPS latitude
 * @param {number} lon - GPS longitude
 * @param {number} timestamp - Epoch timestamp (ms)
 * @param {string} deviceId - Hardware device ID
 */
function registerClaim(zone, workerId, lat, lon, timestamp, deviceId) {
  if (!zoneWindow.has(zone)) {
    zoneWindow.set(zone, []);
  }
  
  const window = zoneWindow.get(zone);
  window.push({ workerId, lat, lon, timestamp, deviceId });

  // Prune entries older than 60 seconds
  const cutoff = Date.now() - 60000;
  const pruned = window.filter(c => c.timestamp >= cutoff);
  zoneWindow.set(zone, pruned);
}

/**
 * Get all claims registered for a zone within the specified recent window.
 *
 * @param {string} zone - Delivery zone ID
 * @param {number} windowSeconds - How many seconds to look back (max 60)
 * @returns {Array<{workerId: string, lat: number, lon: number, timestamp: number, deviceId: string}>}
 */
function getClaimsWindow(zone, windowSeconds = 30) {
  const window = zoneWindow.get(zone);
  if (!window) return [];
  
  const cutoff = Date.now() - (windowSeconds * 1000);
  return window.filter(c => c.timestamp >= cutoff);
}

/**
 * Run GPS coordinate clustering and temporal analysis on the current window.
 *
 * @param {string} zone - Delivery zone ID
 * @returns {object} Analysis result including recommended system action
 */
function analyzeCluster(zone) {
  const claims = getClaimsWindow(zone, 30); // Use 30-second active window
  const totalClaims = claims.length;
  
  let maxClusterSize = 0;
  let suspiciousClusterCount = 0;

  // Group by coordinates rounded to 4 decimal places (~11m precision)
  const clusters = {};
  
  claims.forEach(c => {
    if (c.lat != null && c.lon != null) {
      const key = `${parseFloat(c.lat).toFixed(4)},${parseFloat(c.lon).toFixed(4)}`;
      clusters[key] = (clusters[key] || 0) + 1;
    }
  });

  for (const key in clusters) {
    const size = clusters[key];
    if (size > maxClusterSize) {
      maxClusterSize = size;
    }
    if (size >= 3) {
      suspiciousClusterCount++;
    }
  }

  const temporalEntropy = calculateTemporalEntropyMs(claims.map(c => c.timestamp));

  // Determine recommended action
  let recommendedAction = 'normal';
  if (maxClusterSize >= 5 || (suspiciousClusterCount >= 3 && temporalEntropy.isSuspicious)) {
    recommendedAction = 'block_zone';
  } else if (maxClusterSize >= 3 || suspiciousClusterCount >= 1 || (totalClaims >= 5 && temporalEntropy.isSuspicious)) {
    recommendedAction = 'elevated';
  }

  return {
    totalClaims,
    windowSeconds: 30,
    maxClusterSize,
    suspiciousClusterCount,
    temporalEntropy: {
      entropy: temporalEntropy.entropy,
      isSuspicious: temporalEntropy.isSuspicious,
      meanIntervalMs: temporalEntropy.meanIntervalMs
    },
    recommendedAction
  };
}

/**
 * Clear the active claim window for a zone.
 * Primarily used by the scenario engine's CLEAR_ALL command.
 *
 * @param {string} zone - Delivery zone ID
 */
function clearZoneWindow(zone) {
  if (zoneWindow.has(zone)) {
    zoneWindow.set(zone, []);
  }
}

module.exports = {
  registerClaim,
  getClaimsWindow,
  analyzeCluster,
  clearZoneWindow
};

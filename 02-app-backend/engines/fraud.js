// ============================================================
// FRAUD DETECTION ENGINE — TCHC Consensus Layer
// ============================================================
// Tri-Modal Cryptographic Hex-Grid Consensus (TCHC) implementation.
// Validates HARDWARE, TEMPORAL, and SPATIAL signals.

const BLACKLISTED_DEVICES = new Set();

const RULE_WEIGHTS = {
  FREQUENCY_ANOMALY: 0.15,
  ZONE_MISMATCH: 0.85,
  OFF_HOUR_CLAIM: 0.80,
  PEER_DIVERGENCE: 0.20,
  DUPLICATE_CLAIM: 0.90,
  AMOUNT_ANOMALY: 0.25,
  TELEPORTATION_SPEED: 0.95,
  SWARM_DETECTED: 0.75,
  GNSS_ZERO_VARIANCE: 0.70,
  GNSS_LOW_VARIANCE_STORM: 0.65,
  GNSS_SYNTHETIC_SIGNAL: 0.45,
  ZONE_HOPPING: 0.80,
  TEMPORAL_SWARM: 0.90,
  GPS_COORDINATE_CLUSTER: 0.70,
  DEVICE_BLACKLISTED: 1.00
};

/**
 * Implements the Haversine formula for great-circle distance.
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in km
 */
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRadian = angle => (Math.PI / 180) * angle;

  const dLat = toRadian(lat2 - lat1);
  const dLon = toRadian(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadian(lat1)) * Math.cos(toRadian(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(4));
}

/**
 * Calculates velocity (km/h) between two pings.
 * @param {object} ping1 - { lat, lon, timestamp }
 * @param {object} ping2 - { lat, lon, timestamp }
 * @returns {number} Velocity in km/h
 */
function calculateVelocityKmh(ping1, ping2) {
  const dist = haversineDistanceKm(ping1.lat, ping1.lon, ping2.lat, ping2.lon);
  const timeDeltaHours = (ping2.timestamp - ping1.timestamp) / 3600000;
  if (timeDeltaHours <= 0) return 0;
  return parseFloat((dist / timeDeltaHours).toFixed(4));
}

/**
 * Computes standard deviation of a C/N0 array (GNSS variance).
 * @param {number[]} cn0Array 
 * @returns {number} Standard deviation in dB-Hz
 */
function calculateGNSSVariance(cn0Array) {
  if (!cn0Array || cn0Array.length === 0) return 0;
  const mean = cn0Array.reduce((s, v) => s + v, 0) / cn0Array.length;
  const variance = cn0Array.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / cn0Array.length;
  return Math.sqrt(variance);
}

/**
 * Determines if worker is stationary based on accelerometer variance.
 * Used for the Indoor Pardon rule.
 */
function isWorkerStationary(accelerometerData) {
  if (!accelerometerData) return false;
  try {
    const data = typeof accelerometerData === 'string' ? JSON.parse(accelerometerData) : accelerometerData;
    if (!Array.isArray(data) || data.length === 0) return false;
    
    if (typeof data[0] === 'number') return false; 
    
    const mags = data.map(a => Math.sqrt((a.x||0)**2 + (a.y||0)**2 + (a.z||0)**2));
    const mean = mags.reduce((s, v) => s + v, 0) / mags.length;
    const variance = mags.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / mags.length;
    
    return variance < 0.1;
  } catch (e) {
    return false;
  }
}

/**
 * Measures how "clumped" vs "spread" a set of timestamps are.
 * @param {number[]} timestamps 
 * @returns {object} { entropy, isSuspicious, meanInterval }
 */
function calculateTemporalEntropy(timestamps) {
  if (!timestamps || timestamps.length < 2) return { entropy: 1.0, isSuspicious: false, meanInterval: 60 };
  
  const sorted = [...timestamps].sort((a, b) => a - b);
  let totalIntervalSec = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalIntervalSec += (sorted[i] - sorted[i - 1]) / 1000;
  }
  
  const meanInterval = totalIntervalSec / (sorted.length - 1);
  const entropy = meanInterval / 60; // Normalize to 60s window
  
  return {
    entropy,
    isSuspicious: entropy < 0.05, // e.g., < 3s mean interval
    meanInterval
  };
}

/**
 * Exported blacklist utilities.
 */
function addToBlacklist(deviceId) {
  if (deviceId) {
    BLACKLISTED_DEVICES.add(deviceId);
  }
}

function removeFromBlacklist(deviceId) {
  if (deviceId) {
    BLACKLISTED_DEVICES.delete(deviceId);
  }
}

function getBlacklist() {
  return Array.from(BLACKLISTED_DEVICES);
}

function clearBlacklist() {
  BLACKLISTED_DEVICES.clear();
}

/**
 * Run fraud checks on a claim with TCHC analysis.
 *
 * @param {object} claim 
 * @param {object} worker 
 * @param {array} claimHistory 
 * @param {object} zonePeerData 
 * @returns {object} Analysis result including flags and composite fraud score
 */
function checkFraud(claim, worker, claimHistory = [], zonePeerData = {}) {
  const flags = [];
  const telemetry = claim.telemetry || {};
  const tchcLayer = { hardware: false, temporal: false, spatial: false };

  // RULE 13: DEVICE_BLACKLIST
  if (telemetry.deviceId && BLACKLISTED_DEVICES.has(telemetry.deviceId)) {
    flags.push({
      rule: "DEVICE_BLACKLISTED",
      severity: "critical",
      description: `Device ${telemetry.deviceId} is blacklisted for prior fraud. All future claims from this device are permanently rejected.`,
      auto_reject: true
    });
  }

  // Basic historical rules
  const recentClaims = claimHistory.filter(c => {
    const daysDiff = (new Date(claim.date) - new Date(c.date)) / (1000 * 60 * 60 * 24);
    return daysDiff >= 0 && daysDiff <= 14;
  });
  if (recentClaims.length > 3) {
    flags.push({
      rule: "FREQUENCY_ANOMALY",
      severity: "medium",
      description: `Worker filed ${recentClaims.length} claims in 14 days (threshold: 3).`
    });
  }

  if (claim.zone && worker.zone && claim.zone !== worker.zone) {
    tchcLayer.spatial = true;
    flags.push({
      rule: "ZONE_MISMATCH",
      severity: "high",
      description: `Claim filed for ${claim.zone}, but worker registered in ${worker.zone}`
    });
  }

  if (claim.timeSlot === "off") {
    flags.push({
      rule: "OFF_HOUR_CLAIM",
      severity: "high",
      description: "Claim filed for disruption during off-hours (10PM-10AM). No coverage."
    });
  }

  const duplicate = claimHistory.find(c => c.date === claim.date && c.disruptionType === claim.disruptionType);
  if (duplicate) {
    flags.push({
      rule: "DUPLICATE_CLAIM",
      severity: "high",
      description: `Duplicate claim: same date and type already exists.`
    });
  }

  // TCHC: NEW RULE - REPLAY_TRACE_DETECTED (Spatial/Temporal)
  if (telemetry.gpsHistory && Array.isArray(telemetry.gpsHistory) && telemetry.gpsHistory.length >= 2) {
    // Generate a simple trace signature by rounding coordinates
    const traceSignature = telemetry.gpsHistory.map(p => `${parseFloat(p.lat).toFixed(3)},${parseFloat(p.lon).toFixed(3)}`).join('|');
    const recentTraces = claimHistory
      .filter(c => c.id !== claim.id && c.fraudResult && c.fraudResult.telemetry && c.fraudResult.telemetry.gpsHistory)
      .map(c => c.fraudResult.telemetry.gpsHistory.map(p => `${parseFloat(p.lat).toFixed(3)},${parseFloat(p.lon).toFixed(3)}`).join('|'));
    
    if (recentTraces.includes(traceSignature)) {
      tchcLayer.spatial = true;
      tchcLayer.temporal = true;
      flags.push({
        rule: "REPLAY_TRACE_DETECTED",
        severity: "critical",
        description: `Exact GPS coordinate sequence matches a previous claim. GPS replay attack detected.`,
        auto_reject: true
      });
      if (telemetry.deviceId) addToBlacklist(telemetry.deviceId);
    }
  }

  // TCHC: NEW RULE - DEVICE_FINGERPRINT_CHANGE (Hardware)
  if (telemetry.deviceId && claimHistory.length > 0) {
    // Find the most recent claim with a deviceId
    const lastClaim = claimHistory.sort((a, b) => new Date(b.date) - new Date(a.date)).find(c => c.fraudResult && c.fraudResult.telemetry && c.fraudResult.telemetry.deviceId);
    if (lastClaim && lastClaim.fraudResult.telemetry.deviceId !== telemetry.deviceId) {
      tchcLayer.hardware = true;
      flags.push({
        rule: "DEVICE_FINGERPRINT_CHANGE",
        severity: "medium",
        description: `Worker filed claim from device ${telemetry.deviceId}, but previously used ${lastClaim.fraudResult.telemetry.deviceId}.`
      });
    }
  }

  // TCHC: NEW RULE - CONVENIENCE_TIMING (Temporal)
  if (claim.disruptionStartedAt && telemetry.zoneEntryTimestamp) {
    const disruptionTime = new Date(claim.disruptionStartedAt).getTime();
    const entryTime = new Date(telemetry.zoneEntryTimestamp).getTime();
    const diffSec = Math.abs((disruptionTime - entryTime) / 1000);
    
    if (diffSec <= 60 && telemetry.velocityKmh < 1) {
      tchcLayer.temporal = true;
      flags.push({
        rule: "CONVENIENCE_TIMING",
        severity: "high",
        description: `Worker stopped moving within 60s of CDI disruption trigger. Suspicious timing pattern.`
      });
    }
  }

  // TCHC: RULE 7 - TELEPORTATION_SPEED (Temporal)
  if (telemetry.gpsHistory && Array.isArray(telemetry.gpsHistory) && telemetry.gpsHistory.length >= 2) {
    let maxVelocity = 0;
    for (let i = 1; i < telemetry.gpsHistory.length; i++) {
        const vel = calculateVelocityKmh(telemetry.gpsHistory[i-1], telemetry.gpsHistory[i]);
        if (vel > maxVelocity) maxVelocity = vel;
    }
    if (maxVelocity > 100) {
        tchcLayer.temporal = true;
        const isDefinitive = maxVelocity > 300;
        flags.push({
            rule: "TELEPORTATION_SPEED",
            severity: "critical",
            description: `Worker velocity ${maxVelocity.toFixed(0)} km/h between pings exceeds physical limit (100 km/h). Likely GPS spoofing.`,
            auto_reject: isDefinitive
        });
        if (telemetry.deviceId) addToBlacklist(telemetry.deviceId);
    }
  } else if (telemetry.velocityKmh != null && telemetry.velocityKmh > 100) {
    tchcLayer.temporal = true;
    flags.push({
      rule: "TELEPORTATION_SPEED",
      severity: "critical",
      description: `Worker velocity ${telemetry.velocityKmh.toFixed(0)} km/h exceeds physical limit (100 km/h). Likely GPS spoofing.`,
      auto_reject: telemetry.velocityKmh > 300
    });
    if (telemetry.deviceId) addToBlacklist(telemetry.deviceId);
  }

  // TCHC: RULE 9 - GNSS SIGNAL ANOMALY (Hardware)
  if (telemetry.cn0Array && Array.isArray(telemetry.cn0Array) && telemetry.cn0Array.length > 0) {
    const variance = calculateGNSSVariance(telemetry.cn0Array);
    const mean = telemetry.cn0Array.reduce((s, v) => s + v, 0) / telemetry.cn0Array.length;
    const isStormActive = ['SEVERE_WEATHER', 'CYCLONE'].includes(claim.disruptionType);
    
    tchcLayer.hardware = true; // Actively evaluated hardware layer
    
    const isStationary = isWorkerStationary(telemetry.accelerometer);

    if (isStationary && variance === 0) {
      flags.push({
          rule: "INDOOR_PARDON",
          severity: "low",
          description: `GNSS variance is 0, but accelerometer confirms device is stationary. Forgiven.`
      });
    } else if (variance === 0 && !isStationary && telemetry.cn0Array.length > 1) {
        flags.push({
            rule: "GNSS_SYNTHETIC_SIGNAL",
            severity: "critical",
            description: `GNSS variance is exactly 0.000 while device is in motion. This is physically impossible for real atmospheric GNSS and indicates a mock location app.`,
            auto_reject: true
        });
    } else if (mean === 0) {
        if (!isStationary) {
            flags.push({
                rule: "GNSS_ZERO_VARIANCE",
                severity: "high",
                description: `All ${telemetry.cn0Array.length} C/N0 satellite values are zero. Device is indoors or using synthetic GPS signal.`
            });
        }
    } else if (variance < 2.0 && mean > 0 && mean < 30 && isStormActive) {
        if (!isStationary) {
            flags.push({
                rule: "GNSS_LOW_VARIANCE_STORM",
                severity: "high",
                description: `C/N0 standard deviation ${variance.toFixed(2)} dB-Hz is too uniform for outdoor device during storm (expected: >5.0 dB-Hz). Mean signal ${mean.toFixed(1)} dB-Hz suggests indoor or simulated environment.`
            });
        }
    } else if (variance < 1.5 && mean > 40) {
        flags.push({
            rule: "GNSS_SYNTHETIC_SIGNAL",
            severity: "medium",
            description: `C/N0 values are suspiciously perfect. Real outdoor devices show natural variance from atmospheric multipath. Possible hardware-layer GPS spoofing.`
        });
    }
  }

  // TCHC: RULE 10 - ZONE HOPPING (Spatial)
  if (telemetry.zoneEntryTimestamp && claim.disruptionStartedAt) {
    const entryTime = new Date(telemetry.zoneEntryTimestamp).getTime();
    const disruptionTime = new Date(claim.disruptionStartedAt).getTime();
    const presenceDurationMins = (disruptionTime - entryTime) / (1000 * 60);

    if (presenceDurationMins < 30) {
      // LOOSEN FOR DEMO: If it's a demo/simulation, don't auto-reject for zone hopping 
      // unless it's extremely egregious (e.g. < 1 min)
      const isDemo = claim.data_mode === 'demo' || (claim.id && claim.id.includes('SIM_'));
      const minThreshold = isDemo ? 1 : 30;
      
      if (presenceDurationMins < minThreshold) {
        tchcLayer.spatial = true;
        flags.push({
          rule: "ZONE_HOPPING",
          severity: "critical",
          description: `Worker entered ${claim.zone} only ${Math.max(0, Math.round(presenceDurationMins))} mins before disruption. Minimum ${minThreshold} mins pre-presence required.`,
          auto_reject: true
        });
      }
    }
  }

  // TCHC: RULE 11 & 12 - SWARM & CLUSTERING (Temporal/Spatial Consensus)
  if (telemetry.zoneClaimsWindow && Array.isArray(telemetry.zoneClaimsWindow)) {
      const window = telemetry.zoneClaimsWindow;
      
      // RULE 11: TEMPORAL_SWARM
      if (window.length >= 5) {
          const entropy = calculateTemporalEntropy(window.map(c => c.timestamp));
          if (entropy.isSuspicious) {
              tchcLayer.temporal = true;
              flags.push({
                  rule: "TEMPORAL_SWARM",
                  severity: "critical",
                  description: `${window.length} claims from ${claim.zone} arrived within 3 seconds of each other (mean interval: ${entropy.meanInterval.toFixed(2)}s). Human organic storm response pattern is impossible at this speed. Coordinated bot attack detected.`,
                  auto_reject: true
              });
              if (telemetry.deviceId) addToBlacklist(telemetry.deviceId);
          }
      }
      
      // RULE 12: GPS_COORDINATE_CLUSTER
      const clusters = {};
      window.forEach(c => {
          if (c.lat != null && c.lon != null) {
              const key = `${parseFloat(c.lat).toFixed(4)},${parseFloat(c.lon).toFixed(4)}`;
              clusters[key] = (clusters[key] || 0) + 1;
          }
      });
      let maxCluster = 0;
      for (const key in clusters) {
          if (clusters[key] > maxCluster) maxCluster = clusters[key];
      }
      if (maxCluster >= 3) {
          tchcLayer.spatial = true;
          flags.push({
              rule: "GPS_COORDINATE_CLUSTER",
              severity: "high",
              description: `${maxCluster} workers claimed from GPS coordinates within 11 meters of each other. Organic delivery workers occupy different streets/locations. Statistically impossible clustering indicates device farm.`
          });
      }
  }

  // Composite Fraud Score: 1 - Π(1 - weight_i)
  let fraudScore = 1 - flags.reduce((product, flag) => {
    return product * (1 - (RULE_WEIGHTS[flag.rule] || 0.3));
  }, 1.0);
  fraudScore = parseFloat(Math.min(fraudScore, 1.0).toFixed(4));

  // Determine Action
  const autoRejectRules = ["ZONE_MISMATCH", "OFF_HOUR_CLAIM", "DUPLICATE_CLAIM", "ZONE_HOPPING"];
  const hasAutoReject = flags.some(f => f.auto_reject || autoRejectRules.includes(f.rule));

  let riskLevel, action;
  if (hasAutoReject || fraudScore >= 0.85) {
    riskLevel = "high";
    action = "auto_reject";
  } else if (flags.length > 0 || fraudScore >= 0.45) {
    riskLevel = "medium";
    action = "flag_for_review";
  } else {
    riskLevel = "low";
    action = "pass";
  }

  return {
    isFraudulent: action === "auto_reject" || action === "flag_for_review",
    flags,
    riskLevel,
    action,
    fraudScore,
    totalFlags: flags.length,
    tchcLayer
  };
}

/**
 * Generate fraud summary for insurer dashboard
 */
function generateFraudSummary(allClaims) {
  const summary = {
    totalClaims: allClaims.length,
    autoRejected: allClaims.filter(c => c.fraudResult?.action === "auto_reject").length,
    flaggedForReview: allClaims.filter(c => c.fraudResult?.action === "flag_for_review").length,
    passed: allClaims.filter(c => c.fraudResult?.action === "pass").length,
    ruleBreakdown: {}
  };

  allClaims.forEach(c => {
    if (c.fraudResult?.flags) {
      c.fraudResult.flags.forEach(f => {
        summary.ruleBreakdown[f.rule] = (summary.ruleBreakdown[f.rule] || 0) + 1;
      });
    }
  });

  return summary;
}

module.exports = {
  checkFraud,
  generateFraudSummary,
  addToBlacklist,
  getBlacklist,
  removeFromBlacklist,
  clearBlacklist
};

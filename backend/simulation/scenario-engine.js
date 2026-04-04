// ============================================================
// SCENARIO ENGINE — Admin-Triggerable Simulation Scenarios
// ============================================================
// 5 named scenarios that demonstrate CovA's full operational logic.
// Each scenario modifies mock APIs + optionally injects fraud.

const axios = require('axios');

const PORT = process.env.PORT || 3001;
const BASE = `http://localhost:${PORT}`;

const SCENARIOS = {
  // ──────────────────────────────────────────
  // Scenario 1: Whitefield Monsoon
  // ──────────────────────────────────────────
  WHITEFIELD_MONSOON: {
    name: 'Whitefield Monsoon',
    description: 'Heavy monsoon — flood conditions. CDI ~0.76 → standard trigger.',
    async execute(db, broadcastEvent, { zone = 'ZONE_B' } = {}) {
      // Set target zone weather to severe
      await axios.post(`${BASE}/mock/weather/set/${zone}`, {
        rainfall_mm: 55, condition: 'heavy_rain', severity: 0.85, temperature: 24
      });
      // Set target zone demand drop
      await axios.post(`${BASE}/mock/demand/set/${zone}`, {
        demand_score: 0.68, orders_per_hour: 12, platform_status: 'degraded'
      });

      if (broadcastEvent) {
        broadcastEvent('SCENARIO_ACTIVATED', {
          scenario: 'WHITEFIELD_MONSOON',
          zone,
          expectedCDI: 0.759,
          expectedTrigger: 'standard'
        });
      }

      return {
        scenario: 'WHITEFIELD_MONSOON',
        zone,
        weather: { severity: 0.85, rainfall_mm: 55 },
        demand: { dropScore: 0.68 },
        status: 'active',
        note: `CDI will breach on next 2 cron cycles → auto-trigger claims for ${zone} workers`
      };
    }
  },

  // ──────────────────────────────────────────
  // Scenario 2: Coordinated Fraud Attack
  // ──────────────────────────────────────────
  FRAUD_ATTACK: {
    name: 'Coordinated Fraud Attack',
    description: 'Ghost workers with GPS spoofing attempt to file claims.',
    async execute(db, broadcastEvent, { zone = 'ZONE_B' } = {}) {
      const { injectGhostWorkers } = require('./fraud-injector');
      const result = injectGhostWorkers(db, {
        count: 15,
        targetZone: zone,
        cn0Array: [0, 0, 0],
        velocityKmh: 350
      });

      if (broadcastEvent) {
        broadcastEvent('FRAUD_SIMULATION', {
          scenario: 'FRAUD_ATTACK',
          zone,
          ghostWorkers: result.workerIds,
          flags: ['TELEPORTATION_SPEED', 'SWARM_DETECTED', 'GNSS_ZERO_VARIANCE'],
          expectedResult: `All ${result.count} blocked by fraud engine`
        });
      }

      // Trigger claims for ghost workers through real pipeline
      const claimResults = [];
      for (const wId of result.workerIds) {
        try {
          const res = await axios.post(`${BASE}/api/claims/trigger`, {
            workerId: wId,
            zone: zone,
            disruptionType: 'SEVERE_WEATHER',
            hoursLost: 6,
            weatherScore: 0.85,
            demandScore: 0.68,
            peerScore: 0.72,
            telemetry: {
              velocityKmh: 350,
              cn0Array: [0, 0, 0],
              swarmCount: 15
            }
          });
          claimResults.push({ workerId: wId, status: res.data?.claim?.status || 'unknown' });
        } catch (e) {
          claimResults.push({ workerId: wId, status: 'error', error: e.response?.data?.error || e.message });
        }
      }

      return {
        scenario: 'FRAUD_ATTACK',
        zone,
        injected: result.count,
        workerIds: result.workerIds,
        claimResults,
        blocked: claimResults.filter(c => c.status === 'rejected').length,
        flagged: claimResults.filter(c => c.status === 'flagged').length
      };
    }
  },

  // ──────────────────────────────────────────
  // Scenario 3: Platform Outage (Zepto)
  // ──────────────────────────────────────────
  PLATFORM_OUTAGE: {
    name: 'Platform Outage (Zepto)',
    description: 'Zepto platform goes down. Only Zepto workers trigger, Blinkit unaffected.',
    async execute(db, broadcastEvent, { zone = 'ZONE_B' } = {}) {
      // Set demand very low for target zone (simulating Zepto outage)
      await axios.post(`${BASE}/mock/demand/set/${zone}`, {
        demand_score: 0.75, orders_per_hour: 3, platform_status: 'outage'
      });
      // Weather stays normal
      await axios.post(`${BASE}/mock/weather/set/${zone}`, {
        rainfall_mm: 5, condition: 'clear', severity: 0.1, temperature: 32
      });

      if (broadcastEvent) {
        broadcastEvent('SCENARIO_ACTIVATED', {
          scenario: 'PLATFORM_OUTAGE',
          zone,
          platform: 'zepto',
          note: 'Demand-driven trigger — weather normal'
        });
      }

      return {
        scenario: 'PLATFORM_OUTAGE',
        zone,
        platform: 'zepto',
        weather: 'normal',
        demand: { dropScore: 0.75 },
        note: `CDI trigger from demand+peer signals only for ${zone} Zepto workers.`
      };
    }
  },

  // ──────────────────────────────────────────
  // Scenario 4: Mixed (Genuine + Fraud Simultaneous)
  // ──────────────────────────────────────────
  MIXED_ATTACK: {
    name: 'Mixed Attack (Genuine + Fraud)',
    description: 'Genuine monsoon triggers real workers while ghost workers attempt infiltration.',
    async execute(db, broadcastEvent, { zone = 'ZONE_B' } = {}) {
      // Set up genuine monsoon first
      await axios.post(`${BASE}/mock/weather/set/${zone}`, {
        rainfall_mm: 50, condition: 'heavy_rain', severity: 0.80, temperature: 25
      });
      await axios.post(`${BASE}/mock/demand/set/${zone}`, {
        demand_score: 0.60, orders_per_hour: 15, platform_status: 'degraded'
      });

      // Inject 10 ghost workers
      const { injectGhostWorkers } = require('./fraud-injector');
      const fraudResult = injectGhostWorkers(db, {
        count: 10,
        targetZone: zone,
        cn0Array: [0, 0, 0],
        velocityKmh: 200
      });

      // File fraudulent claims
      const fraudClaims = [];
      for (const wId of fraudResult.workerIds) {
        try {
          const res = await axios.post(`${BASE}/api/claims/trigger`, {
            workerId: wId,
            zone: zone,
            disruptionType: 'SEVERE_WEATHER',
            hoursLost: 5,
            weatherScore: 0.80,
            demandScore: 0.60,
            peerScore: 0.65,
            telemetry: { velocityKmh: 200, cn0Array: [0, 0, 0], swarmCount: 10 }
          });
          fraudClaims.push({ workerId: wId, status: res.data?.claim?.status || 'unknown' });
        } catch (e) {
          fraudClaims.push({ workerId: wId, status: 'error' });
        }
      }

      if (broadcastEvent) {
        broadcastEvent('SCENARIO_ACTIVATED', {
          scenario: 'MIXED_ATTACK',
          zone,
          ghostWorkers: fraudResult.workerIds.length,
          note: 'Genuine monsoon + fraud injection simultaneously'
        });
      }

      return {
        scenario: 'MIXED_ATTACK',
        genuine: { zone, weatherSeverity: 0.80, note: 'Real workers trigger via cron' },
        fraud: { injected: fraudResult.count, blocked: fraudClaims.filter(c => c.status === 'rejected').length },
        note: `Genuine workers in ${zone} paid via cron. Ghost workers blocked.`
      };
    }
  },

  // ──────────────────────────────────────────
  // Scenario 5: Section 144 Curfew
  // ──────────────────────────────────────────
  SECTION_144: {
    name: 'Section 144 Curfew',
    description: 'All zones disrupted by social event. Weather normal, but peer offline 85% + demand collapse 90%.',
    async execute(db, broadcastEvent) {
      // All zones: social disruption, not weather
      for (const zone of ['ZONE_A', 'ZONE_B', 'ZONE_C']) {
        await axios.post(`${BASE}/mock/weather/set/${zone}`, {
          rainfall_mm: 0, condition: 'clear', severity: 0.05, temperature: 32
        });
        await axios.post(`${BASE}/mock/demand/set/${zone}`, {
          demand_score: 0.90, orders_per_hour: 2, platform_status: 'suspended'
        });
      }

      if (broadcastEvent) {
        broadcastEvent('SCENARIO_ACTIVATED', {
          scenario: 'SECTION_144',
          zones: ['ZONE_A', 'ZONE_B', 'ZONE_C'],
          note: 'All-zone social disruption. CDI triggers from demand+peer, NOT weather.'
        });
      }

      return {
        scenario: 'SECTION_144',
        allZones: true,
        weather: 'clear (social event, not weather)',
        demand: 0.90,
        peerOffline: 0.85,
        note: 'CDI triggers across all zones from social signals. All 100 workers affected.'
      };
    }
  },

  // ──────────────────────────────────────────
  // Utility: Clear all scenarios
  // ──────────────────────────────────────────
  CLEAR_ALL: {
    name: 'Clear All Scenarios',
    description: 'Reset all zones to normal conditions.',
    async execute(db, broadcastEvent) {
      for (const zone of ['ZONE_A', 'ZONE_B', 'ZONE_C']) {
        await axios.post(`${BASE}/mock/weather/set/${zone}`, {
          rainfall_mm: 2, condition: 'clear', severity: 0.05, temperature: 32
        });
        await axios.post(`${BASE}/mock/demand/set/${zone}`, {
          demand_score: 0.1, orders_per_hour: 45, platform_status: 'normal'
        });
      }

      // Remove ghost workers
      db.prepare("DELETE FROM workers WHERE id LIKE 'GHOST_%'").run();

      if (broadcastEvent) {
        broadcastEvent('SCENARIO_CLEARED', { timestamp: new Date().toISOString() });
      }

      return { scenario: 'CLEAR_ALL', status: 'All zones reset to normal' };
    }
  }
};

/**
 * Activate a named scenario
 * @param {string} scenarioKey - One of the SCENARIOS keys
 * @param {object} db - better-sqlite3 instance
 * @param {Function} broadcastEvent - WebSocket broadcast function
 * @returns {object} Scenario execution result
 */
async function activateScenario(scenarioKey, db, broadcastEvent, options = {}) {
  const scenario = SCENARIOS[scenarioKey];
  if (!scenario) {
    const available = Object.keys(SCENARIOS);
    throw new Error(`Unknown scenario: ${scenarioKey}. Available: ${available.join(', ')}`);
  }

  console.log(`[SCENARIO] Activating: ${scenario.name} ${options.zone ? `in ${options.zone}` : ''}`);
  const result = await scenario.execute(db, broadcastEvent, options);
  console.log(`[SCENARIO] ${scenario.name} — complete`);
  return result;
}

function getAvailableScenarios() {
  return Object.entries(SCENARIOS).map(([key, s]) => ({
    key,
    name: s.name,
    description: s.description
  }));
}

async function executeCustomSimulation({ zone, weather, demand, fraud }, db, broadcastEvent) {
  const zones = zone === 'ALL' ? ['ZONE_A', 'ZONE_B', 'ZONE_C'] : [zone];
  const results = { zones: [], fraud: null };
  
  for (const z of zones) {
    // 1. Set weather conditions
    if (weather?.preset) {
      await axios.post(`${BASE}/mock/weather/set/${z}`, { preset: weather.preset });
    } else if (weather) {
      await axios.post(`${BASE}/mock/weather/set/${z}`, {
        rainfall_mm: weather.rainfall_mm || 5,
        condition: weather.condition || 'clear',
        severity: weather.severity || 0.1,
        temperature: weather.temperature || 32
      });
    }
    
    // 2. Set demand conditions
    if (demand) {
      await axios.post(`${BASE}/mock/demand/set/${z}`, {
        demand_score: demand.demand_score || 0.1,
        orders_per_hour: demand.orders_per_hour || 45,
        platform_status: demand.platform_status || 'normal'
      });
    }
    
    results.zones.push({ zone: z, weather: weather?.preset || 'custom', demand: demand?.demand_score });
  }
  
  // 3. Inject fraud if requested
  if (fraud?.ghostCount > 0) {
    const targetZone = zone === 'ALL' ? 'ZONE_B' : zone;  // Default fraud to ZONE_B if ALL
    const { injectGhostWorkers } = require('./fraud-injector');
    const fraudResult = injectGhostWorkers(db, {
      count: fraud.ghostCount,
      targetZone,
      cn0Array: [0, 0, 0],
      velocityKmh: 350
    });
    
    // Trigger claims for ghost workers
    const fraudClaims = [];
    for (const wId of fraudResult.workerIds) {
      try {
        const claimRes = await axios.post(`${BASE}/api/claims/trigger`, {
          workerId: wId,
          zone: targetZone,
          disruptionType: 'SEVERE_WEATHER',
          hoursLost: 6,
          weatherScore: weather?.severity || 0.85,
          demandScore: demand?.demand_score || 0.68,
          peerScore: 0.72,
          telemetry: { velocityKmh: 350, cn0Array: [0, 0, 0], swarmCount: fraud.ghostCount }
        });
        fraudClaims.push({ workerId: wId, status: claimRes.data?.claim?.status || 'unknown' });
      } catch (e) {
        fraudClaims.push({ workerId: wId, status: 'error', error: e.response?.data?.error || e.message });
      }
    }
    
    results.fraud = {
      injected: fraudResult.count,
      blocked: fraudClaims.filter(c => c.status === 'rejected').length,
      flagged: fraudClaims.filter(c => c.status === 'flagged').length,
      claims: fraudClaims
    };
  }
  
  // 4. Broadcast event
  if (broadcastEvent) {
    broadcastEvent('CUSTOM_SIMULATION', {
      zones: results.zones,
      fraud: results.fraud,
      timestamp: new Date().toISOString()
    });
  }
  
  return results;
}

module.exports = { activateScenario, getAvailableScenarios, executeCustomSimulation, SCENARIOS };

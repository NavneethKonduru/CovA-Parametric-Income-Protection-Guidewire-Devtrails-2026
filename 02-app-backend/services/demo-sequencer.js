/**
 * CovA Demo Sequencer — Auto-Pilot Edition
 * 
 * TWO MODES:
 *   1. Manual Demo: Single-shot demo triggered by admin button
 *   2. Auto-Pilot:  Continuous simulation loop that runs on its own,
 *                   cycling through zones with randomized scenarios every 45s
 * 
 * Auto-pilot starts automatically on server boot in demo mode.
 */

const { activateScenario } = require('../simulation/scenario-engine');

let isRunning = false;
let currentStep = 0;
let totalSteps = 0;
let demoInterval = null;
let broadcastFn = null;
let activeZone = null;
let demoTimeline = null;

// Auto-pilot state
let autoPilotRunning = false;
let autoPilotTimer = null;
let autoPilotCycleCount = 0;

const ZONE_NAMES = {
  ZONE_A: 'Koramangala',
  ZONE_B: 'Whitefield',
  ZONE_C: 'Indiranagar',
};

const WEATHER_OPTIONS = [
  { rainfall_mm: 52, condition: 'heavy_rain', severity: 0.82, temperature: 22 },
  { rainfall_mm: 61, condition: 'heavy_rain', severity: 0.88, temperature: 21 },
  { rainfall_mm: 74, condition: 'heavy_rain', severity: 0.91, temperature: 20 },
  { rainfall_mm: 58, condition: 'heavy_rain', severity: 0.85, temperature: 23 },
  { rainfall_mm: 90, condition: 'heavy_rain', severity: 0.95, temperature: 19 },
];

const DEMAND_OPTIONS = [
  { demand_score: 0.72, orders_per_hour: 11, platform_status: 'degraded' },
  { demand_score: 0.68, orders_per_hour: 9, platform_status: 'degraded' },
  { demand_score: 0.79, orders_per_hour: 8, platform_status: 'degraded' },
  { demand_score: 0.85, orders_per_hour: 5, platform_status: 'degraded' },
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// AUTO-PILOT — Continuous Simulation Engine
// ============================================================

/**
 * Runs a single auto-pilot cycle:
 *  1. Pick random zone + weather
 *  2. Set severe conditions
 *  3. Set up fraud actors organically
 *  4. Force 2 CDI cron cycles → auto-trigger claims
 *  5. Wait for claims to process → payouts go through
 *  6. Clear weather → next cycle
 */
async function runAutoPilotCycle(pgModule) {
  const port = process.env.PORT || 3001;
  const axios = require('axios');
  const { runCron } = require('../cron/poller');

  const zone = pick(['ZONE_A', 'ZONE_B', 'ZONE_C']);
  const zoneName = ZONE_NAMES[zone];
  const weather = pick(WEATHER_OPTIONS);
  const demand = pick(DEMAND_OPTIONS);
  const fraudCount = Math.floor(Math.random() * 4) + 2;
  autoPilotCycleCount++;
  const cycleId = `C${autoPilotCycleCount}`;

  activeZone = zone;

  console.log(`\n[AUTO-PILOT] ━━━ Cycle ${cycleId}: Storm → ${zoneName} (severity ${weather.severity}) ━━━`);

  try {
    // ── Phase 1: Set severe weather + demand drop ──
    await axios.post(`http://localhost:${port}/mock/weather/set/${zone}`, weather).catch(() => {});
    await axios.post(`http://localhost:${port}/mock/demand/set/${zone}`, demand).catch(() => {});

    if (broadcastFn) {
      broadcastFn('AUTO_PILOT_CYCLE', {
        cycleId, phase: 'WEATHER_SET', zone, zoneName,
        severity: weather.severity, rainfall: weather.rainfall_mm,
        message: `🌧️ Storm hitting ${zoneName} — ${weather.rainfall_mm}mm rainfall`
      });
    }

    // ── Phase 2: Set up fraud actors organically in the DB ──
    const dataMode = pgModule.getDataMode();
    try {
      // Reset all workers to genuine first
      await pgModule.query(
        `UPDATE worker_signals SET signal_mode = 'auto_genuine' FROM workers w 
         WHERE worker_signals.worker_id = w.id AND w.zone = $1 AND w.data_mode = $2`,
        [zone, dataMode]
      );

      // Pick random workers as fraud actors
      const workersRes = await pgModule.query(
        'SELECT id FROM workers WHERE zone = $1 AND data_mode = $2', [zone, dataMode]
      );
      if (workersRes.rows.length > 0) {
        const shuffled = workersRes.rows.sort(() => 0.5 - Math.random());
        const fraudIds = shuffled.slice(0, Math.min(fraudCount, shuffled.length)).map(w => w.id);
        if (fraudIds.length > 0) {
          await pgModule.query(
            "UPDATE worker_signals SET signal_mode = 'auto_fraud' WHERE worker_id = ANY($1)",
            [fraudIds]
          );
          console.log(`[AUTO-PILOT] ${cycleId}: Set ${fraudIds.length} fraud actors in ${zone}`);
        }
      }
    } catch (e) {
      console.warn(`[AUTO-PILOT] Fraud setup warning:`, e.message);
    }

    // ── Phase 3: Force CDI breach — run cron twice for 2-cycle persistence ──
    await sleep(3000);
    console.log(`[AUTO-PILOT] ${cycleId}: Running CDI cron #1...`);
    await runCron(broadcastFn).catch(e => console.warn('[AUTO-PILOT] Cron 1:', e.message));

    if (broadcastFn) {
      broadcastFn('AUTO_PILOT_CYCLE', {
        cycleId, phase: 'CDI_BREACH_1', zone, zoneName,
        message: `⚡ CDI rising in ${zoneName} — 1st threshold breach`
      });
    }

    await sleep(4000);
    console.log(`[AUTO-PILOT] ${cycleId}: Running CDI cron #2 → Claims will auto-trigger...`);
    await runCron(broadcastFn).catch(e => console.warn('[AUTO-PILOT] Cron 2:', e.message));

    if (broadcastFn) {
      broadcastFn('AUTO_PILOT_CYCLE', {
        cycleId, phase: 'CLAIMS_TRIGGERED', zone, zoneName,
        message: `💰 Claims triggered for ${zoneName} workers — TCHC fraud engine active`
      });
    }

    // ── Phase 4: Let claims finish processing ──
    await sleep(5000);

    // ── Phase 5: Read results and broadcast summary ──
    try {
      const statsRes = await pgModule.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status IN ('paid','approved_auto','processing_payout')) as paid,
          COUNT(*) FILTER (WHERE status IN ('rejected_fraud','held_fraud_review')) as blocked,
          COALESCE(SUM(payout_amount) FILTER (WHERE status IN ('paid','approved_auto','processing_payout')), 0) as total_payout
        FROM claims 
        WHERE zone = $1 AND data_mode = $2 
          AND created_at >= NOW() - INTERVAL '2 minutes'
      `, [zone, dataMode]);

      const stats = statsRes.rows[0];
      console.log(`[AUTO-PILOT] ${cycleId}: Results — ${stats.paid} paid, ${stats.blocked} blocked, ₹${parseFloat(stats.total_payout).toFixed(0)} disbursed`);

      if (broadcastFn) {
        broadcastFn('AUTO_PILOT_CYCLE', {
          cycleId, phase: 'RESULTS', zone, zoneName,
          paid: parseInt(stats.paid), blocked: parseInt(stats.blocked),
          totalPayout: parseFloat(stats.total_payout),
          message: `✅ Cycle ${cycleId} complete — ${stats.paid} genuine claims paid (₹${parseFloat(stats.total_payout).toFixed(0)}), ${stats.blocked} fraud blocked`
        });
      }
    } catch (e) {
      console.warn(`[AUTO-PILOT] Stats query warning:`, e.message);
    }

    // ── Phase 6: Clear severe weather ──
    await axios.post(`http://localhost:${port}/mock/weather/set/${zone}`, {
      rainfall_mm: 2, condition: 'clear', severity: 0.05, temperature: 32
    }).catch(() => {});
    await axios.post(`http://localhost:${port}/mock/demand/set/${zone}`, {
      demand_score: 0.1, orders_per_hour: 45, platform_status: 'normal'
    }).catch(() => {});

    console.log(`[AUTO-PILOT] ${cycleId}: Weather cleared for ${zoneName}. Next cycle in ~30s.\n`);

  } catch (err) {
    console.error(`[AUTO-PILOT] Cycle ${cycleId} error:`, err.message);
  }
}

/**
 * Start the auto-pilot continuous simulation.
 * Runs a new storm cycle every ~45 seconds, hitting different zones.
 */
async function startAutoPilot(pgModule) {
  if (autoPilotRunning) return { status: 'already_running', cycleCount: autoPilotCycleCount };
  if (!pgModule) pgModule = require('../data/pg');
  if (pgModule.getDataMode() === 'real') {
    throw new Error('Auto-pilot is strictly blocked in PRODUCTION mode.');
  }

  autoPilotRunning = true;
  autoPilotCycleCount = 0;

  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║  🚀 AUTO-PILOT ENGAGED — Continuous Simulation   ║');
  console.log('║  Storms will cycle across zones every ~45 seconds ║');
  console.log('║  Claims, fraud detection, and payouts run live    ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  if (broadcastFn) {
    broadcastFn('AUTO_PILOT_STARTED', {
      message: 'Continuous simulation engine engaged',
      cycleInterval: '45s',
      timestamp: new Date().toISOString()
    });
  }

  // Run first cycle immediately
  await runAutoPilotCycle(pgModule);

  // Then loop every 45 seconds
  autoPilotTimer = setInterval(async () => {
    if (!autoPilotRunning) return;
    try {
      await runAutoPilotCycle(pgModule);
    } catch (e) {
      console.error('[AUTO-PILOT] Cycle failed:', e.message);
    }
  }, 45000);

  return { status: 'started', message: 'Auto-pilot engaged — cycling every 45s' };
}

function stopAutoPilot() {
  if (!autoPilotRunning) return { status: 'not_running' };
  autoPilotRunning = false;
  if (autoPilotTimer) {
    clearInterval(autoPilotTimer);
    autoPilotTimer = null;
  }
  if (broadcastFn) {
    broadcastFn('AUTO_PILOT_STOPPED', {
      message: 'Auto-pilot disengaged',
      totalCycles: autoPilotCycleCount,
      timestamp: new Date().toISOString()
    });
  }
  console.log(`[AUTO-PILOT] Stopped after ${autoPilotCycleCount} cycles.`);
  return { status: 'stopped', totalCycles: autoPilotCycleCount };
}

function getAutoPilotStatus() {
  return {
    isRunning: autoPilotRunning,
    cycleCount: autoPilotCycleCount,
    activeZone,
  };
}

// ============================================================
// MANUAL DEMO — Single-shot sequence (existing logic)
// ============================================================

function buildTimeline(pg, port) {
  const zone = pick(['ZONE_A', 'ZONE_B', 'ZONE_C']);
  const zoneName = ZONE_NAMES[zone];
  const weather = pick(WEATHER_OPTIONS);
  const demand = pick(DEMAND_OPTIONS);
  const fraudCount = Math.floor(Math.random() * 5) + 3;
  const cdiPeak = (weather.severity * 0.6 + demand.demand_score * 0.4).toFixed(2);

  activeZone = zone;

  console.log(`[DEMO_SEQ] Story: Storm hits ${zoneName} — severity ${weather.severity} — ${fraudCount} fraud actors injected organically`);

  const jitter = () => Math.floor(Math.random() * 4000) - 2000;

  return {
    zone,
    zoneName,
    steps: [
      {
        timeMs: 0,
        name: `Baseline — All zones nominal`,
        emoji: '🟢',
        action: async () => {
          await activateScenario('CLEAR_ALL', pg, broadcastFn);
          broadcastFn('DEMO_PROGRESS', {
            step: 0, total: 6, name: `Baseline — ${zoneName} clear skies`,
            zone, description: 'System monitoring all zones. CDI nominal.',
          });
        },
      },
      {
        timeMs: 12000 + jitter(),
        name: `Heavy rain detected — ${zoneName}`,
        emoji: '🌧️',
        action: async () => {
          const dataMode = pg.getDataMode();
          await pg.query(`UPDATE worker_signals SET signal_mode = 'auto_genuine' FROM workers w WHERE worker_signals.worker_id = w.id AND w.zone = $1 AND w.data_mode = $2`, [zone, dataMode]);
          
          const workersRes = await pg.query(`SELECT id FROM workers WHERE zone = $1 AND data_mode = $2`, [zone, dataMode]);
          if (workersRes.rows.length > 0) {
            const shuffled = workersRes.rows.sort(() => 0.5 - Math.random());
            const fraudIds = shuffled.slice(0, Math.min(fraudCount, shuffled.length)).map(w => w.id);
            if (fraudIds.length > 0) {
              await pg.query(`UPDATE worker_signals SET signal_mode = 'auto_fraud' WHERE worker_id = ANY($1)`, [fraudIds]);
              console.log(`[DEMO_SEQ] Set ${fraudIds.length} workers in ${zone} to auto_fraud mode.`);
            }
          }

          const axios = require('axios');
          await axios.post(`http://localhost:${port}/mock/weather/set/${zone}`, weather)
            .catch(e => console.warn('[DEMO_SEQ] Weather set failed:', e.message));
          broadcastFn('DEMO_PROGRESS', {
            step: 1, total: 5, name: `Rain detected — ${zoneName}`,
            zone, description: `${weather.rainfall_mm}mm/hr · CDI climbing`,
          });
        },
      },
      {
        timeMs: 26000 + jitter(),
        name: `Demand collapse — ${zoneName}`,
        emoji: '📉',
        action: async () => {
          const axios = require('axios');
          await axios.post(`http://localhost:${port}/mock/demand/set/${zone}`, demand)
            .catch(e => console.warn('[DEMO_SEQ] Demand set failed:', e.message));
          broadcastFn('DEMO_PROGRESS', {
            step: 2, total: 5, name: `Demand collapsing — ${zoneName}`,
            zone, description: `Orders dropped ${Math.round((1 - demand.demand_score) * 100)}% — Platform ${demand.platform_status}`,
          });
        },
      },
      {
        timeMs: 42000 + jitter(),
        name: `CDI breach — claims auto-triggered`,
        emoji: '⚡',
        action: async () => {
          const { runCron } = require('../cron/poller');
          await runCron(broadcastFn).catch(e => console.warn('[DEMO_SEQ] Cron 1:', e.message));
          setTimeout(() => {
            runCron(broadcastFn).catch(e => console.warn('[DEMO_SEQ] Cron 2:', e.message));
          }, 3000);
          broadcastFn('DEMO_PROGRESS', {
            step: 3, total: 5, name: `CDI Breach — ${Math.round(cdiPeak * 100)}% — Claims & Fraud Lab Active`,
            zone, description: `Threshold exceeded. Parametric engine processing legitimate claims while TCHC actively blocks GPS spoofers.`,
          });
        },
      },
      {
        timeMs: 62000 + jitter(),
        name: `Sequence complete — payouts processed`,
        emoji: '✅',
        action: async () => {
          broadcastFn('DEMO_PROGRESS', {
            step: 4, total: 5, name: `Complete — Legitimate claims paid, fraud blocked`,
            zone, description: `Demo sequence ended. The engine organically caught synthetic signals and processed genuine ones.`,
          });
          stopDemo();
        },
      },
    ],
  };
}

function initDemoSequencer(broadcastEvent) {
  broadcastFn = broadcastEvent;
}

function startDemo(pg) {
  const pgModule = pg || require('../data/pg');
  if (pgModule.getDataMode() === 'real') {
    throw new Error('Demo sequence is strictly blocked in PRODUCTION mode.');
  }
  if (isRunning) return { alreadyRunning: true };

  isRunning = true;
  currentStep = 0;

  const port = process.env.PORT || 3001;
  demoTimeline = buildTimeline(pgModule, port);
  totalSteps = demoTimeline.steps.length;

  broadcastFn('DEMO_STARTED', {
    message: `Automated Demo Sequence started — Storm targeting ${demoTimeline.zoneName}`,
    zone: demoTimeline.zone,
    zoneName: demoTimeline.zoneName,
  });

  const startTime = Date.now();

  demoInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;

    if (currentStep < demoTimeline.steps.length) {
      const nextEvent = demoTimeline.steps[currentStep];
      if (elapsed >= nextEvent.timeMs) {
        console.log(`[DEMO_SEQ] Step ${currentStep}: ${nextEvent.name}`);
        nextEvent.action(pgModule).catch(e => console.error('[DEMO_SEQ] Step error:', e.message));
        currentStep++;
      }
    } else {
      stopDemo();
    }
  }, 500);

  return getDemoStatus();
}

function stopDemo() {
  if (!isRunning) return;
  clearInterval(demoInterval);
  isRunning = false;
  if (broadcastFn) broadcastFn('DEMO_STOPPED', { message: 'Demo Sequence Ended' });
  console.log('[DEMO_SEQ] Stopped');
}

function getDemoStatus() {
  return {
    isRunning,
    currentStep,
    totalSteps,
    activeZone,
    autoPilot: getAutoPilotStatus(),
    timeline: demoTimeline
      ? demoTimeline.steps.map((s, i) => ({
          step: i,
          name: s.name,
          emoji: s.emoji,
          timeMs: s.timeMs,
          done: i < currentStep,
          active: i === currentStep && isRunning,
        }))
      : [],
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { 
  initDemoSequencer, 
  startDemo, 
  stopDemo, 
  getDemoStatus, 
  startAutoPilot, 
  stopAutoPilot, 
  getAutoPilotStatus 
};

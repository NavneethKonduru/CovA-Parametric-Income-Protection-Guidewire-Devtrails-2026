/**
 * CovA Demo Sequencer — Randomized Edition
 * Each run picks a random zone, random severity, random worker subset.
 * The story arc is always the same (escalation → breach → claims → fraud → payouts)
 * but the specifics are never identical, making it feel real.
 */

const { activateScenario, executeCustomSimulation } = require('../simulation/scenario-engine');

let isRunning = false;
let currentStep = 0;
let totalSteps = 0;
let demoInterval = null;
let broadcastFn = null;
let activeZone = null;
let demoTimeline = null;

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
];

const DEMAND_OPTIONS = [
  { demand_score: 0.72, orders_per_hour: 11, platform_status: 'degraded' },
  { demand_score: 0.68, orders_per_hour: 9, platform_status: 'degraded' },
  { demand_score: 0.79, orders_per_hour: 8, platform_status: 'degraded' },
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildTimeline(pg, port) {
  const zone = pick(['ZONE_A', 'ZONE_B', 'ZONE_C']);
  const zoneName = ZONE_NAMES[zone];
  const weather = pick(WEATHER_OPTIONS);
  const demand = pick(DEMAND_OPTIONS);
  const fraudCount = Math.floor(Math.random() * 5) + 3; // 3-7 fraud actors
  const cdiPeak = (weather.severity * 0.6 + demand.demand_score * 0.4).toFixed(2);

  activeZone = zone;

  console.log(`[DEMO_SEQ] Story: Storm hits ${zoneName} — severity ${weather.severity} — ${fraudCount} fraud actors injected organically`);

  // Vary timing slightly so it never feels like a script
  const jitter = () => Math.floor(Math.random() * 4000) - 2000; // ±2s

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
          // Prepare the fraud mix organically in the database
          const dataMode = pg.getDataMode();
          await pg.query(`UPDATE worker_signals SET signal_mode = 'auto_genuine' FROM workers w WHERE worker_signals.worker_id = w.id AND w.zone = $1 AND w.data_mode = $2`, [zone, dataMode]);
          
          // Select a random subset to become fraud actors
          const workersRes = await pg.query(`SELECT id FROM workers WHERE zone = $1 AND data_mode = $2`, [zone, dataMode]);
          if (workersRes.rows.length > 0) {
            // Shuffle and pick fraudCount workers
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

module.exports = { initDemoSequencer, startDemo, stopDemo, getDemoStatus };

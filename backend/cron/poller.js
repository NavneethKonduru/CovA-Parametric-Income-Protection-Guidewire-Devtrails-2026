const axios = require('axios');
const db = require('../data/db');
const { getInsurerConfig, getAdminConfig } = require('../data/db');
const {
  normalizeWeatherScore,
  normalizeDemandScore,
  normalizePeerScore,
  analyzeDisruption,
  getEffectiveThreshold,
  getTimeSlot,
  setCDIStrategy,
  setDecorrelateSignals
} = require('../engines/claims');
const cdiHistory = require('../engines/cdi-history');
const PORT = process.env.PORT || 3001;

/** @type {Object<string, number>} Consecutive CDI threshold breaches per zone */
let consecutiveBreaches = {};

/**
 * Main cron cycle — runs every 30 seconds.
 * Fetches live signals, calculates CDI with EMA smoothing,
 * and auto-triggers claims after 2 consecutive threshold breaches.
 *
 * @param {Function} broadcastEvent - WebSocket broadcast function
 */
async function runCron(broadcastEvent) {
  // Read config from DB each cycle (insurer can change these live)
  const cdiThreshold = getInsurerConfig('cdi_trigger_threshold') || 0.6;
  const coveredZones = getInsurerConfig('covered_zones') || ['ZONE_A', 'ZONE_B', 'ZONE_C'];
  const cdiWeights = getAdminConfig('cdi_weights') || { weather: 0.40, demand: 0.35, peer: 0.25 };
  
  // Read and sync CDI strategy/config
  const cdiStrategy = getAdminConfig('cdi_strategy') || 'weighted_sum';
  const decorrelateSignals = getAdminConfig('decorrelate_signals') || false;
  
  setCDIStrategy(cdiStrategy);
  setDecorrelateSignals(decorrelateSignals === 'true' || decorrelateSignals === true);

  if (broadcastEvent) {
    broadcastEvent('CRON_POLL', { timestamp: new Date().toISOString(), threshold: cdiThreshold });
  }

  // Only check covered zones that have workers
  const zones = db.prepare('SELECT DISTINCT zone FROM workers WHERE zone IS NOT NULL').all()
    .filter(z => coveredZones.includes(z.zone));

  for (const { zone } of zones) {
    try {
      // ─── Fetch raw signal data from mock APIs ───
      const weatherRes = await axios.get(`http://localhost:${PORT}/mock/weather/${zone}`);
      const demandRes = await axios.get(`http://localhost:${PORT}/mock/demand/${zone}`);

      const rawWeather = weatherRes.data;
      const rawDemand = demandRes.data;

      // ─── Normalize weather score from raw data ───
      const weatherScore = normalizeWeatherScore({
        rainfall_mm: rawWeather.rainfall_mm || 0,
        temperature_celsius: rawWeather.temperature || 0,
        wind_speed_kmh: rawWeather.wind_speed_kmh || 0,
        condition: rawWeather.condition || 'clear',
      });

      // ─── Normalize demand score from raw data ───
      const demandScore = normalizeDemandScore({
        current_orders: rawDemand.current_orders || 0,
        baseline_orders: rawDemand.baseline_orders || 1,
        platform_status: rawDemand.platform_status || 'normal',
      });

      // ─── Calculate peer score from actual worker DB data ───
      const activeWorkers = db.prepare(
        "SELECT COUNT(*) as c FROM workers WHERE zone = ? AND status = 'active'"
      ).get(zone).c;
      const totalWorkers = db.prepare(
        "SELECT COUNT(*) as c FROM workers WHERE zone = ?"
      ).get(zone).c;

      const hourNow = new Date().getHours();
      const timeSlot = getTimeSlot(hourNow);

      const peerScore = normalizePeerScore({
        active_now: activeWorkers,
        active_7day_avg: totalWorkers,
        time_slot: timeSlot,
      });

      // ─── Run full CDI analysis with EMA smoothing ───
      const analysis = analyzeDisruption(
        { weatherScore, demandScore, peerScore },
        {
          zone,
          baseThreshold: cdiThreshold,
          rawWeather,
          rawDemand,
          customWeights: cdiWeights,
        }
      );

      const { rawCDI, smoothedCDI, thresholdInfo, disruption_narrative, dominantSignal, zoneTrend } = analysis;
      const cdi = smoothedCDI;

      // ─── Zone-adjusted effective threshold ───
      const { effectiveThreshold, sensitivityFactor } = thresholdInfo ||
        getEffectiveThreshold(cdiThreshold, zone);

      console.log(`[CRON] ${zone}: CDI ${cdi.toFixed(3)} (raw: ${rawCDI.toFixed(3)}, threshold: ${effectiveThreshold.toFixed(3)}, dominant: ${dominantSignal})`);

      // ─── Broadcast CDI update for live dashboards ───
      if (broadcastEvent) {
        broadcastEvent('CDI_UPDATE', {
          zone,
          cdi: smoothedCDI,
          rawCDI,
          smoothedCDI,
          threshold: cdiThreshold,
          effectiveThreshold,
          sensitivityFactor,
          triggered: smoothedCDI >= effectiveThreshold,
          signals: { weather: weatherScore, demand: demandScore, peer: peerScore },
          dominantSignal,
          disruption_narrative,
          zoneTrend,
          timeSlot,
        });
      }

      // ─── Log disruption event to DB with smoothed CDI ───
      try {
        // Attempt to store smoothed_cdi (column may not exist in older schemas)
        db.prepare(`
          INSERT INTO disruption_events (zone, condition, cdi)
          VALUES (?, ?, ?)
        `).run(zone, rawWeather.condition || 'unknown', smoothedCDI);
      } catch (dbErr) {
        // Fallback: store without smoothed column
        db.prepare(`
          INSERT INTO disruption_events (zone, condition, cdi)
          VALUES (?, ?, ?)
        `).run(zone, rawWeather.condition || 'unknown', smoothedCDI);
      }

      // ─── Threshold breach detection (uses zone-adjusted threshold) ───
      if (smoothedCDI >= effectiveThreshold) {
        consecutiveBreaches[zone] = (consecutiveBreaches[zone] || 0) + 1;

        if (broadcastEvent) {
          broadcastEvent('THRESHOLD_BREACH', {
            zone,
            cdi: smoothedCDI,
            rawCDI,
            threshold: cdiThreshold,
            effectiveThreshold,
            sensitivityFactor,
            consecutiveCycles: consecutiveBreaches[zone],
            dominantSignal,
            disruption_narrative,
          });
          
          if (consecutiveBreaches[zone] === 1) {
            broadcastEvent('STAGE_1_ALERT', {
              zone,
              message: `⚡ ${zone} disruption detected. CovA is processing your claim. Money will arrive in your UPI within 2 minutes if conditions persist.`
            });
          }
        }

        // ─── 2-cycle persistence gate ───
        if (consecutiveBreaches[zone] >= 2) {
          console.log(`[CRON] ⚡ ${zone}: CDI ${cdi.toFixed(3)} breached for 2+ cycles → AUTO-TRIGGERING CLAIMS`);

          const disruptionStartedAt = new Date(Date.now() - 60000).toISOString();
          consecutiveBreaches[zone] = 0; // reset after trigger

          // Determine disruption type from dominant signal and weather condition
          let disruptionType = 'SEVERE_WEATHER';
          const condition = (rawWeather.condition || '').toLowerCase();
          if (condition.includes('cyclone')) disruptionType = 'CYCLONE';
          else if (condition.includes('heat')) disruptionType = 'EXTREME_HEAT';
          else if (condition.includes('rain') || condition.includes('flood')) disruptionType = 'SEVERE_WEATHER';
          else if (rawDemand.platform_status === 'outage') disruptionType = 'PLATFORM_OUTAGE';
          else if (rawDemand.platform_status === 'suspended') disruptionType = 'CIVIC_CURFEW';

          // Fetch workers with their signal states for fraud-aware claim triggering
          const todayDate = new Date().toISOString().split('T')[0];
          const workersInZone = db.prepare(`
            SELECT w.id, w.name, w.zone, ws.lat, ws.lng, ws.gnss_variance, ws.velocity, ws.zone_entry, ws.platform_active, ws.signal_mode
            FROM workers w 
            LEFT JOIN worker_signals ws ON w.id = ws.workerId
            LEFT JOIN claims c ON w.id = c.workerId AND c.date = ? 
            WHERE w.zone = ? AND w.status = 'active' AND c.id IS NULL
          `).all(todayDate, zone);

          const BATCH_SIZE = 50;
          const BATCH_DELAY_MS = 100;
          
          console.log(`[CRON] Triggering ${workersInZone.length} fraud-aware claims for ${zone} in batches of ${BATCH_SIZE}`);
          for (let i = 0; i < workersInZone.length; i += BATCH_SIZE) {
            const batch = workersInZone.slice(i, i + BATCH_SIZE);
            await Promise.all(
              batch.map(w => {
                const mode = w.signal_mode || 'auto_genuine';
                const isFraud = mode === 'auto_fraud';
                const wLat = w.lat || 12.9716;
                const wLng = w.lng || 77.5946;
                
                // Generate telemetry based on signal mode
                const telemetry = {
                  workerId: w.id,
                  lat: wLat,
                  lng: wLng,
                  gnss_variance: w.gnss_variance || 5.0,
                  velocity: w.velocity || 2.0,
                  zone_entry: w.zone_entry,
                  cn0Array: isFraud 
                    ? [22.1, 22.0, 21.9, 22.2]  // Low variance = fraud signal
                    : [28, 32, 35, 31, 29, 33],  // Normal variance = genuine
                  gpsHistory: isFraud
                    ? [
                        { lat: wLat + 0.5, lon: wLng + 0.5, timestamp: Date.now() - 2000 },
                        { lat: wLat, lon: wLng, timestamp: Date.now() }
                      ] // Teleportation pattern
                    : [
                        { lat: wLat - 0.001, lon: wLng - 0.001, timestamp: Date.now() - 30000 },
                        { lat: wLat, lon: wLng, timestamp: Date.now() }
                      ] // Normal movement
                };
                
                return axios.post(`http://localhost:${PORT}/api/claims/trigger`, {
                  workerId: w.id,
                  zone,
                  disruptionType,
                  hoursLost: 4,
                  weatherScore,
                  demandScore,
                  peerScore,
                  disruptionStartedAt,
                  telemetry,
                }).catch(e => console.error(`[CRON] Claim trigger error for ${w.id}:`, e.response?.data?.error || e.message));
              })
            );
            
            if (broadcastEvent) {
              broadcastEvent('CLAIM_BATCH_PROGRESS', {
                zone,
                processed: Math.min(i + BATCH_SIZE, workersInZone.length),
                total: workersInZone.length
              });
            }
            if (i + BATCH_SIZE < workersInZone.length) {
              await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
            }
          }
        } else {
          console.log(`[CRON] ⚠️  ${zone}: CDI ${cdi.toFixed(3)} breached cycle ${consecutiveBreaches[zone]}/2`);
        }
      } else {
        consecutiveBreaches[zone] = 0;
      }
    } catch (err) {
      console.error(`[CRON] Error checking zone ${zone}:`, err.message);
    }

    // Auto-signal broadcast: generate and broadcast signal updates for admin panel feed
    try {
      const workersForBroadcast = db.prepare(
        "SELECT w.id, w.name, w.zone, ws.signal_mode, ws.lat, ws.lng, ws.gnss_variance FROM workers w LEFT JOIN worker_signals ws ON w.id = ws.workerId WHERE w.zone = ? AND w.status = 'active' LIMIT 10"
      ).all(zone);
      
      for (const w of workersForBroadcast) {
        const mode = w.signal_mode || 'auto_genuine';
        const isFraud = mode === 'auto_fraud';
        
        const autoSignal = {
          workerId: w.id,
          name: w.name,
          zone: w.zone,
          mode,
          lat: (w.lat || 12.9716) + (isFraud ? 0 : (Math.random() - 0.5) * 0.001),
          lng: (w.lng || 77.5946) + (isFraud ? 0 : (Math.random() - 0.5) * 0.001),
          gnss_variance: isFraud 
            ? parseFloat((0.3 + Math.random() * 0.4).toFixed(2))
            : parseFloat((3 + weatherScore * 5 + Math.random() * 4).toFixed(2)),
          velocity: isFraud 
            ? Math.floor(Math.random() * 400)
            : Math.floor(Math.random() * 25),
          platform_active: isFraud ? Math.random() > 0.3 : true,
          fraud_indicator: isFraud,
          cdi_contribution: analysis.cdi
        };
        
        if (broadcastEvent) {
          broadcastEvent('WORKER_SIGNAL_UPDATE', autoSignal);
        }
      }
    } catch (sigErr) {
      // Non-critical — don't fail the cron cycle
    }
  }
}

/**
 * Start the CDI cron poller.
 * Runs every 30 seconds, config-aware (reads threshold + weights from DB each cycle).
 *
 * @param {Function} broadcastEvent - WebSocket broadcast function
 */
function startCron(broadcastEvent) {
  setInterval(() => runCron(broadcastEvent), 30000);
  console.log('[CRON] Started 30s poller for CDI calculation.');
  console.log('[CRON] Config-aware: reads threshold + weights from DB each cycle.');
  console.log('[CRON] Peer score: derived from worker DB (not weather-derived).');
  console.log('[CRON] CDI smoothing: EMA (alpha=0.35) with zone-adjusted thresholds.');
}

module.exports = { startCron };

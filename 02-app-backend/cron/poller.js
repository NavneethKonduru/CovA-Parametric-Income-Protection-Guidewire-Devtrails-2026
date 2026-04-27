const axios = require('axios');
const pg = require('../data/pg');
const {
  normalizeWeatherScore,
  normalizeDemandScore,
  normalizePeerScore,
  normalizeCivicScore,
  normalizeTelemetryDropScore,
  normalizeHistoricalScore,
  analyzeDisruption,
  getEffectiveThreshold,
  setCDIStrategy,
  setDecorrelateSignals,
  buildRetroactiveClaimContext
} = require('../engines/claims');
const { getTimeSlot } = require('../engines/payout');
const cdiHistory = require('../engines/cdi-history');
const PORT = process.env.PORT || 3001;



/**
 * Main cron cycle — runs every 30 seconds.
 * Fetches live signals, calculates CDI with EMA smoothing,
 * and auto-triggers claims after 2 consecutive threshold breaches.
 *
 * @param {Function} broadcastEvent - WebSocket broadcast function
 */
async function runCron(broadcastEvent) {
  // Read config from DB each cycle (insurer can change these live)
  const cdiThreshold = await pg.getInsurerConfig('cdi_trigger_threshold') || (process.env.COVA_MODE === 'demo' ? 0.45 : 0.6);
  const coveredZones = await pg.getInsurerConfig('covered_zones') || ['ZONE_A', 'ZONE_B', 'ZONE_C'];
  let cdiWeights = await pg.getAdminConfig('cdi_weights') || { weather: 0.35, demand: 0.25, peer: 0.05, civic: 0.15, telemetry_drop: 0.10, historical: 0.10 };
  const reqKeys = ['weather', 'demand', 'peer', 'civic', 'telemetry_drop', 'historical'];
  let substituted = false;
  for (const k of reqKeys) {
    if (cdiWeights[k] === undefined) {
      cdiWeights[k] = { weather: 0.35, demand: 0.25, peer: 0.05, civic: 0.15, telemetry_drop: 0.10, historical: 0.10 }[k];
      substituted = true;
    }
  }
  if (substituted) console.warn('[CRON] Substituted missing CDI weights with defaults to avoid NaN.');
  
  // Read and sync CDI strategy/config
  const cdiStrategy = await pg.getAdminConfig('cdi_strategy') || 'weighted_sum';
  const decorrelateSignals = await pg.getAdminConfig('decorrelate_signals') || false;
  
  setCDIStrategy(cdiStrategy);
  setDecorrelateSignals(decorrelateSignals === 'true' || decorrelateSignals === true);

  if (broadcastEvent) {
    broadcastEvent('CRON_POLL', { timestamp: new Date().toISOString(), threshold: cdiThreshold });
  }

  // Only check covered zones that have workers (PostgreSQL)
  const dataMode = pg.getDataMode();
  let zones = [];
  try {
    const zonesRes = await pg.query(
      'SELECT DISTINCT zone FROM workers WHERE zone IS NOT NULL AND data_mode = $1',
      [dataMode]
    );
    zones = zonesRes.rows.filter(z => coveredZones.includes(z.zone));
    
    // Fallback for demo mode: if no workers in DB, still simulate for all covered zones
    if (zones.length === 0 && !pg.isAvailable()) {
      zones = coveredZones.map(z => ({ zone: z }));
    }
  } catch (e) {
    if (!pg.isAvailable()) zones = coveredZones.map(z => ({ zone: z }));
  }

  for (const { zone } of zones) {
    let analysis; // declare here so it's accessible in signal broadcast
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

      // ─── Calculate peer score from actual worker DB data (PostgreSQL) ───
      const activeRes = await pg.query(
        "SELECT COUNT(*) as c FROM workers WHERE zone = $1 AND status = 'active' AND data_mode = $2",
        [zone, dataMode]
      );
      const totalRes = await pg.query(
        "SELECT COUNT(*) as c FROM workers WHERE zone = $1 AND data_mode = $2",
        [zone, dataMode]
      );
      const activeWorkers = parseInt(activeRes.rows[0]?.c || 0);
      const totalWorkers = parseInt(totalRes.rows[0]?.c || 0);

      const hourNow = new Date().getHours();
      const timeSlot = getTimeSlot(hourNow);

      const peerScore = normalizePeerScore({
        active_now: activeWorkers,
        active_7day_avg: totalWorkers,
        time_slot: timeSlot,
      });

      // ─── Fetch Civic Data ───
      const civicRes = await pg.query(
        "SELECT is_active FROM weather.civic_disruptions WHERE data_mode = $1 AND is_active = TRUE AND affected_zones @> ARRAY[$2::text]",
        [dataMode, zone]
      );
      const rawCivic = { is_active: civicRes.rowCount > 0 };
      const civicScore = normalizeCivicScore(rawCivic);

      // ─── Fetch Telemetry Drop Data ───
      const telemetryDropRes = await pg.query(
        "SELECT COUNT(*) as total, SUM(CASE WHEN velocity < 1 THEN 1 ELSE 0 END) as stationary FROM worker_signals ws JOIN workers w ON ws.worker_id = w.id WHERE w.zone = $1 AND w.data_mode = $2",
        [zone, dataMode]
      );
      const rawTelemetryDrop = { 
        total_workers: parseInt(telemetryDropRes.rows[0]?.total || 0),
        stationary_workers: parseInt(telemetryDropRes.rows[0]?.stationary || 0)
      };
      const telemetryDropScore = normalizeTelemetryDropScore(rawTelemetryDrop);

      // ─── Fetch Historical Data ───
      const historicalRes = await pg.query(
        "SELECT AVG(cdi) as baseline FROM disruption_events WHERE zone = $1 AND timestamp > NOW() - INTERVAL '30 days'",
        [zone]
      );
      
      let rawHistorical = null;
      let historicalScore = 0;
      
      // Calculate a temporary rawCDI without historical score to compare against baseline
      const wWeather = cdiWeights.weather ?? 0.35;
      const wDemand = cdiWeights.demand ?? 0.25;
      const wPeer = cdiWeights.peer ?? 0.05;
      const wCivic = cdiWeights.civic ?? 0.15;
      const wTelemetry = cdiWeights.telemetry_drop ?? 0.10;
      const wHistorical = cdiWeights.historical ?? 0.10;
      
      const customWeightsFull = {
        weather: wWeather, demand: wDemand, peer: wPeer,
        civic: wCivic, telemetry_drop: wTelemetry, historical: wHistorical
      };

      const tempCDI = (wWeather * weatherScore) + (wDemand * demandScore) + (wPeer * peerScore) + (wCivic * civicScore) + (wTelemetry * telemetryDropScore);
      
      if (historicalRes.rows[0] && historicalRes.rows[0].baseline) {
        rawHistorical = { current_cdi: tempCDI, baseline_cdi: parseFloat(historicalRes.rows[0].baseline) };
        historicalScore = normalizeHistoricalScore(rawHistorical);
      }

      // ─── Run full CDI analysis with EMA smoothing ───
      analysis = analyzeDisruption(
        { weatherScore, demandScore, peerScore, civicScore, telemetryDropScore, historicalScore },
        {
          zone,
          baseThreshold: cdiThreshold,
          rawWeather,
          rawDemand,
          rawCivic,
          customWeights: customWeightsFull,
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

      // ─── Log disruption event to PostgreSQL ───
      try {
        await pg.query(
          `INSERT INTO disruption_events (zone, condition, cdi, weather_score, demand_score, peer_score, trigger_level, data_mode, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [zone, rawWeather.condition || 'unknown', smoothedCDI, weatherScore, demandScore, peerScore,
           analysis.trigger?.level || 'none', dataMode]
        );
      } catch (dbErr) {
        // Fallback: minimal insert
        try {
          await pg.query(
            `INSERT INTO disruption_events (zone, condition, cdi, data_mode, timestamp) VALUES ($1, $2, $3, $4, NOW())`,
            [zone, rawWeather.condition || 'unknown', smoothedCDI, dataMode]
          );
        } catch (e2) {
          console.error(`[CRON] Could not log disruption event for ${zone}:`, e2.message);
        }
      }

      // ─── Threshold breach detection (uses zone-adjusted threshold) ───
      let currentBreaches = 0;
      if (smoothedCDI >= effectiveThreshold) {
        await pg.query(`INSERT INTO disruption_breach_state (zone, consecutive_breaches, last_updated) VALUES ($1, 1, NOW()) ON CONFLICT (zone) DO UPDATE SET consecutive_breaches = disruption_breach_state.consecutive_breaches + 1, last_updated = NOW()`, [zone]);
        const breachRes = await pg.query('SELECT consecutive_breaches FROM disruption_breach_state WHERE zone = $1', [zone]);
        currentBreaches = breachRes.rows[0]?.consecutive_breaches || 0;

        if (broadcastEvent) {
          broadcastEvent('THRESHOLD_BREACH', {
            zone,
            cdi: smoothedCDI,
            rawCDI,
            threshold: cdiThreshold,
            effectiveThreshold,
            sensitivityFactor,
            consecutiveCycles: currentBreaches,
            dominantSignal,
            disruption_narrative,
          });
          
          if (currentBreaches === 1) {
            broadcastEvent('STAGE_1_ALERT', {
              zone,
              message: `⚡ ${zone} disruption detected. CovA is processing your claim. Money will arrive in your UPI within 2 minutes if conditions persist.`
            });
          }
        }

        // ─── 2-cycle persistence gate ───
        if (currentBreaches >= 2) {
          console.log(`[CRON] ⚡ ${zone}: CDI ${cdi.toFixed(3)} breached for 2+ cycles → AUTO-TRIGGERING CLAIMS`);

          const disruptionStartedAt = new Date(Date.now() - 60000).toISOString();
          await pg.query('UPDATE disruption_breach_state SET consecutive_breaches = 0, last_updated = NOW() WHERE zone = $1', [zone]);

          // Determine disruption type from dominant signal and weather condition
          let disruptionType = 'SEVERE_WEATHER';
          const condition = (rawWeather.condition || '').toLowerCase();
          if (condition.includes('cyclone')) disruptionType = 'CYCLONE';
          else if (condition.includes('heat')) disruptionType = 'EXTREME_HEAT';
          else if (condition.includes('rain') || condition.includes('flood')) disruptionType = 'SEVERE_WEATHER';
          else if (rawDemand.platform_status === 'outage') disruptionType = 'PLATFORM_OUTAGE';
          else if (rawDemand.platform_status === 'suspended') disruptionType = 'CIVIC_CURFEW';

          // Fetch workers with their signal states for fraud-aware claim triggering (PostgreSQL)
          const todayDate = new Date().toISOString().split('T')[0];
          const workersRes = await pg.query(`
            SELECT w.id, w.name, w.zone, ws.lat, ws.lng, ws.gnss_variance, ws.velocity, 
                   ws.zone_entry, ws.platform_active, ws.signal_mode
            FROM workers w 
            LEFT JOIN worker_signals ws ON w.id = ws.worker_id
            LEFT JOIN claims c ON w.id = c.worker_id AND c.date = $1 AND c.data_mode = $3 AND c.time_slot = $4
            WHERE w.zone = $2 AND w.status = 'active' AND w.data_mode = $3 AND c.id IS NULL
          `, [todayDate, zone, dataMode, timeSlot]);

          const workersInZone = workersRes.rows;
          const BATCH_SIZE = 10;
          const BATCH_DELAY_MS = 500;
          
          console.log(`[CRON] Triggering ${workersInZone.length} fraud-aware claims for ${zone} in batches of ${BATCH_SIZE}`);
          for (let i = 0; i < workersInZone.length; i += BATCH_SIZE) {
            const batch = workersInZone.slice(i, i + BATCH_SIZE);
            await Promise.all(
              batch.map(w => {
                const mode = w.signal_mode || 'auto_genuine';
                // Block synthetic fraud generation in PRODUCTION mode
                const isFraud = mode === 'auto_fraud' && dataMode !== 'real';
                const wLat = parseFloat(w.lat) || 12.9716;
                const wLng = parseFloat(w.lng) || 77.5946;
                
                // Generate telemetry based on signal mode
                const telemetry = {
                  workerId: w.id,
                  lat: wLat,
                  lng: wLng,
                  gnss_variance: parseFloat(w.gnss_variance) || 5.0,
                  velocity: parseFloat(w.velocity) || 2.0,
                  zone_entry: w.zone_entry,
                  cn0Array: isFraud 
                    ? [22.1, 22.0, 21.9, 22.2]
                    : [28, 32, 35, 31, 29, 33],
                  gpsHistory: isFraud
                    ? [
                        { lat: wLat + 0.003, lon: wLng + 0.003, timestamp: Date.now() - 2000 },
                        { lat: wLat, lon: wLng, timestamp: Date.now() }
                      ]
                    : [
                        { lat: wLat - 0.001, lon: wLng - 0.001, timestamp: Date.now() - 30000 },
                        { lat: wLat, lon: wLng, timestamp: Date.now() }
                      ]
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
                }, {
                  headers: { 'X-Internal-Service': process.env.INTERNAL_SERVICE_TOKEN || 'cova-internal-cron-2026' }
                }).catch(e => console.error(`[CRON] Claim trigger error for ${w.id}:`, e.response?.data?.error || e.message));
              })
            );
            
            if (broadcastEvent) {
              broadcastEvent('CLAIM_BATCH_PROGRESS', {
                zone,
                processed: Math.min(i + BATCH_SIZE, workersInZone.length),
                total: workersInZone.length
              }, { zone, dataMode });
            }
            if (i + BATCH_SIZE < workersInZone.length) {
              await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
            }
          }
        } else {
          console.log(`[CRON] ⚠️  ${zone}: CDI ${cdi.toFixed(3)} breached cycle ${currentBreaches}/2`);
        }
      } else {
        await pg.query('UPDATE disruption_breach_state SET consecutive_breaches = 0, last_updated = NOW() WHERE zone = $1', [zone]);
      }

      // ─── LATE ARRIVAL / OFFLINE SYNC SWEEP ───
      try {
        // 1. Check if there was a valid disruption in the last 2 hours
        const recentDisruptionRes = await pg.query(
          `SELECT * FROM disruption_events 
           WHERE zone = $1 AND data_mode = $2 
             AND trigger_level IN ('standard', 'critical')
             AND timestamp >= NOW() - INTERVAL '2 hours'
           ORDER BY timestamp DESC LIMIT 1`,
          [zone, dataMode]
        );

        if (recentDisruptionRes.rows && recentDisruptionRes.rows.length > 0) {
          const historicalDisruption = recentDisruptionRes.rows[0];
          const todayDate = new Date().toISOString().split('T')[0];

          // 2. Find workers with telemetry in the last 2 hours who don't have a claim today
          // We look for workers who are currently offline (status != 'active') to match "offline-sync" requirement
          const lateWorkersRes = await pg.query(`
            SELECT w.id, w.name, w.zone, ws.lat, ws.lng,
                   MIN(t.timestamp) as telemetry_start,
                   MAX(t.timestamp) as telemetry_end
            FROM telemetry_raw t
            JOIN workers w ON t.worker_id = w.id
            LEFT JOIN worker_signals ws ON w.id = ws.worker_id
            LEFT JOIN claims c ON w.id = c.worker_id AND c.date = $1 AND c.data_mode = $3
            WHERE w.zone = $2 
              AND t.data_mode = $3
              AND t.timestamp >= NOW() - INTERVAL '2 hours'
              AND w.status != 'active'
              AND c.id IS NULL
            GROUP BY w.id, w.name, w.zone, ws.lat, ws.lng
          `, [todayDate, zone, dataMode]);

          const lateWorkers = lateWorkersRes.rows;
          
          if (lateWorkers.length > 0) {
            console.log(`[CRON] Found ${lateWorkers.length} offline-synced workers for ${zone}. Processing retroactive claims.`);
            
            for (const w of lateWorkers) {
              const claimContext = buildRetroactiveClaimContext({
                worker: w,
                zone,
                telemetryStart: w.telemetry_start,
                telemetryEnd: w.telemetry_end,
                historicalDisruption
              });
              
              // Trigger the retroactive claim
              await axios.post(`http://localhost:${PORT}/api/claims/trigger`, claimContext, {
                  headers: { 'X-Internal-Service': process.env.INTERNAL_SERVICE_TOKEN || 'cova-internal-cron-2026' }
                })
                .catch(e => console.error(`[CRON] Retroactive claim trigger error for ${w.id}:`, e.response?.data?.error || e.message));
            }
          }
        }
      } catch (lateErr) {
        console.error(`[CRON] Error during late arrival sweep for zone ${zone}:`, lateErr.message);
      }

    } catch (err) {
      console.error(`[CRON] Error checking zone ${zone}:`, err.message);
    }

    // Auto-signal broadcast: generate and broadcast signal updates for admin panel feed
    try {
      const signalRes = await pg.query(
        `SELECT w.id, w.name, w.zone, ws.signal_mode, ws.lat, ws.lng, ws.gnss_variance 
         FROM workers w LEFT JOIN worker_signals ws ON w.id = ws.worker_id 
         WHERE w.zone = $1 AND w.status = 'active' AND w.data_mode = $2 LIMIT 10`,
        [zone, dataMode]
      );
      
      for (const w of signalRes.rows) {
        const mode = w.signal_mode || 'auto_genuine';
        // Block synthetic fraud generation in PRODUCTION mode
        const isFraud = mode === 'auto_fraud' && dataMode !== 'real';
        const wLat = parseFloat(w.lat) || 12.9716;
        const wLng = parseFloat(w.lng) || 77.5946;
        const currentWeatherScore = analysis?.rawCDI || 0;
        
        const autoSignal = {
          workerId: w.id,
          name: w.name,
          zone: w.zone,
          mode,
          lat: wLat + (isFraud ? 0 : (Math.random() - 0.5) * 0.001),
          lng: wLng + (isFraud ? 0 : (Math.random() - 0.5) * 0.001),
          gnss_variance: isFraud 
            ? parseFloat((0.3 + Math.random() * 0.4).toFixed(2))
            : parseFloat((3 + currentWeatherScore * 5 + Math.random() * 4).toFixed(2)),
          velocity: isFraud 
            ? Math.floor(Math.random() * 400)
            : Math.floor(Math.random() * 25),
          platform_active: isFraud ? Math.random() > 0.3 : true,
          fraud_indicator: isFraud,
          cdi_contribution: analysis?.smoothedCDI || 0
        };
        
        if (broadcastEvent) {
          broadcastEvent('WORKER_SIGNAL_UPDATE', autoSignal, { zone, dataMode });
        }
      }
    } catch (sigErr) {
      // Non-critical — don't fail the cron cycle
    }
  }

  // 3. Expire pending telemetry claims > 24h
  try {
    const expiredRes = await pg.query(
      `UPDATE public.claims 
       SET status = 'expired_no_evidence', validation_reason = validation_reason || ' | Expired after 24h without complete telemetry', updated_at = NOW()
       WHERE status = 'pending_telemetry' AND created_at < NOW() - INTERVAL '24 hours'
       RETURNING id`
    );
    if (expiredRes.rowCount > 0 && broadcastEvent) {
      console.log(`[CRON] Expired ${expiredRes.rowCount} claims lacking telemetry.`);
      for (const row of expiredRes.rows) {
        broadcastEvent('CLAIM_EXPIRED', { claimId: row.id, status: 'expired_no_evidence' });
      }
    }
  } catch (err) {
    console.error('[CRON] Error expiring pending claims:', err.message);
  }
}

/**
 * Start the CDI cron poller.
 * Runs every 30 seconds, config-aware (reads threshold + weights from DB each cycle).
 *
 * @param {Function} broadcastEvent - WebSocket broadcast function
 */
function startCron(broadcastEvent) {
  pg.query(`
    CREATE TABLE IF NOT EXISTS disruption_breach_state (
      zone TEXT PRIMARY KEY,
      consecutive_breaches INTEGER NOT NULL DEFAULT 0,
      last_updated TIMESTAMPTZ DEFAULT NOW()
    )
  `).then(() => pg.query(`
    INSERT INTO disruption_breach_state (zone, consecutive_breaches)
    VALUES ('ZONE_A', 0), ('ZONE_B', 0), ('ZONE_C', 0)
    ON CONFLICT (zone) DO NOTHING
  `)).catch(e => console.error('[CRON] Could not create breach state table', e));
  setInterval(() => runCron(broadcastEvent), 30000);
  console.log('[CRON] Started 30s poller for CDI calculation (PostgreSQL mode).');
  console.log('[CRON] Config-aware: reads threshold + weights from DB each cycle.');
  console.log('[CRON] Peer score: derived from worker DB (not weather-derived).');
  console.log('[CRON] CDI smoothing: EMA (alpha=0.35) with zone-adjusted thresholds.');
}

module.exports = { startCron, runCron };

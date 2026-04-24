const express = require('express');
const router = express.Router();
const pg = require('../data/pg');
const { requireRole, requireTelemetryAuth } = require('../middleware/auth');

/**
 * POST /api/telemetry/ingest
 * Accepts high-frequency GPS/sensor data from the Kotlin mobile app.
 * Writes to telemetry_raw (TimescaleDB hypertable) and updates worker_signals.
 */
router.post('/ingest', requireTelemetryAuth, async (req, res) => {
  try {
    const { session_id, device_id, worker_id, gps_fixes, sensor_samples } = req.body;

    if (!worker_id || !device_id) {
      return res.status(400).json({ error: 'worker_id and device_id are required' });
    }

    const dataMode = pg.getDataMode();

    // 1. Process GPS fixes
    let latestFix = null;
    if (gps_fixes && Array.isArray(gps_fixes) && gps_fixes.length > 0) {
      // Sort by timestamp descending to get the latest
      const sortedFixes = [...gps_fixes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      latestFix = sortedFixes[0];

      // Batch insert into telemetry_raw
      for (const fix of sortedFixes) {
        // Validate bounds
        if (fix.lat < -90 || fix.lat > 90 || fix.lng < -180 || fix.lng > 180) continue;
        if (fix.speed_kph > 500) continue; // Unrealistic speed drop

        await pg.query(
          `INSERT INTO public.telemetry_raw (
            worker_id, lat, lng, satellite_count, cn0_values,
            gnss_variance, velocity_kmh, heading, gyro_variance,
            accelerometer, network_type, signal_strength, device_id,
            battery_level, data_mode, timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (worker_id, timestamp) DO NOTHING`,
          [
            worker_id, fix.lat, fix.lng, fix.satellite_count || 0,
            fix.cn0_values || [], fix.gnss_variance || 0,
            fix.speed_kph || 0, fix.heading || 0, fix.gyro_variance || 0,
            sensor_samples ? JSON.stringify(sensor_samples) : null,
            fix.network_type || 'unknown', fix.signal_strength || 0,
            device_id, fix.battery_level || 100, dataMode,
            fix.timestamp || new Date().toISOString()
          ]
        );
      }
    }

    // 2. Update latest worker_signal state for fast poller access
    if (latestFix) {
      await pg.query(
        `INSERT INTO public.worker_signals (
          worker_id, lat, lng, gnss_variance, velocity,
          device_id, data_mode, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT(worker_id) DO UPDATE SET
          lat = EXCLUDED.lat, lng = EXCLUDED.lng,
          gnss_variance = EXCLUDED.gnss_variance,
          velocity = EXCLUDED.velocity,
          device_id = EXCLUDED.device_id,
          updated_at = NOW()`,
        [
          worker_id, latestFix.lat, latestFix.lng,
          latestFix.gnss_variance || 0, latestFix.speed_kph || 0, device_id, dataMode
        ]
      );

      // Broadcast update to dashboards
      if (req.app.locals.broadcastEvent) {
        req.app.locals.broadcastEvent('WORKER_SIGNAL_UPDATE', {
          workerId: worker_id,
          signalState: {
            lat: latestFix.lat,
            lng: latestFix.lng,
            velocity: latestFix.speed_kph || 0,
            gnss_variance: latestFix.gnss_variance || 0
          }
        });
      }
    }

    // 3. Instant Retroactive Sync check for offline batches
    if (req.body.is_offline_batch || req.body.offline_batch) {
      try {
        const { buildRetroactiveClaimContext } = require('../engines/claims');
        const axios = require('axios');
        const PORT = process.env.PORT || 3001;

        // Fetch worker details to check zone
        const workerRes = await pg.query('SELECT * FROM workers WHERE id = $1', [worker_id]);
        if (workerRes.rows.length > 0) {
          const worker = workerRes.rows[0];
          
          // Check for recent disruption in worker's zone
          const disruptionRes = await pg.query(
            `SELECT * FROM disruption_events 
             WHERE zone = $1 AND data_mode = $2 
               AND trigger_level IN ('standard', 'critical')
               AND timestamp >= NOW() - INTERVAL '2 hours'
             ORDER BY timestamp DESC LIMIT 1`,
            [worker.zone, dataMode]
          );

          if (disruptionRes.rows.length > 0) {
             const claimContext = buildRetroactiveClaimContext({
                worker,
                zone: worker.zone,
                telemetryStart: gps_fixes[gps_fixes.length - 1].timestamp,
                telemetryEnd: gps_fixes[0].timestamp,
                historicalDisruption: disruptionRes.rows[0]
             });
             
             // Trigger asynchronously
             axios.post(`http://localhost:${PORT}/api/claims/trigger`, claimContext, {
               headers: { 'X-Internal-Service': process.env.INTERNAL_SERVICE_TOKEN || 'cova-internal-cron-2026' }
             }).catch(e => {
               console.error('[TELEMETRY] Offline batch claim trigger failed:', e.message);
             });
             console.log(`[TELEMETRY] Instant retroactive claim triggered for offline batch from ${worker_id}`);
          }
        }
      } catch (err) {
        console.error('[TELEMETRY] Failed to process offline batch retroactive claims:', err.message);
      }
    }

    res.status(202).json({
      status: 'accepted',
      processed: {
        gps_fixes: gps_fixes ? gps_fixes.length : 0,
        sensor_samples: sensor_samples ? sensor_samples.length : 0
      }
    });
  } catch (err) {
    console.error('[TELEMETRY] Ingest error:', err.message);
    res.status(500).json({ error: 'Failed to ingest telemetry' });
  }
});

/**
 * GET /api/telemetry/sync/:workerId
 * Returns the sync health and buffered session counts for the mobile app.
 */
router.get('/sync/:workerId', async (req, res) => {
  try {
    const { workerId } = req.params;
    const dataMode = pg.getDataMode();

    // Query for last 24h sync activity
    const result = await pg.query(
      `SELECT 
        COUNT(*) as total_fixes,
        COUNT(*) FILTER (WHERE gnss_variance < 5) as high_accuracy_fixes,
        MAX(timestamp) as last_sync
       FROM public.telemetry_raw 
       WHERE worker_id = $1 AND data_mode = $2 AND timestamp > NOW() - INTERVAL '24 hours'`,
      [workerId, dataMode]
    );

    const stats = result.rows[0];
    
    // In a real production environment, 'buffered' would be calculated 
    // by comparing the client's local DB count with the server's record.
    // For the demo, we simulate a small buffer if sync happened recently.
    const lastSyncTime = stats.last_sync ? new Date(stats.last_sync) : null;
    const isRecentlySynced = lastSyncTime && (Date.now() - lastSyncTime.getTime() < 300000); // 5 mins

    res.json({
      bufferCount: isRecentlySynced ? 0 : 3,
      lastSync: lastSyncTime ? lastSyncTime.toISOString() : 'Never',
      pendingClaims: 1,
      gnssStatus: stats.high_accuracy_fixes > (stats.total_fixes * 0.8) ? 'EXCELLENT' : 'DEGRADED',
      details: {
        totalFixes24h: parseInt(stats.total_fixes || 0),
        accuracyRate: stats.total_fixes > 0 ? (stats.high_accuracy_fixes / stats.total_fixes) : 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sync status: ' + err.message });
  }
});

module.exports = router;

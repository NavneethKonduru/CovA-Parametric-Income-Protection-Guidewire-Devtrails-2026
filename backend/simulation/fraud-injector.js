// ============================================================
// FRAUD INJECTOR — Creates Ghost Workers for Fraud Simulation
// ============================================================
// Injects fake worker profiles with GPS spoofing signatures
// so the fraud engine can catch them in real-time.

/**
 * Inject ghost workers into the database for fraud simulation.
 * Automatically generates TCHC telemetry signatures for each worker.
 * 
 * @param {object} db - better-sqlite3 instance
 * @param {object} options
 * @param {number} options.count - Number of ghost workers to inject
 * @param {string} options.targetZone - Zone to inject into
 * @param {Array} options.cn0Array - C/N0 values (override default low variance)
 * @param {number} options.velocityKmh - Velocity between pings (override)
 * @returns {object} { count, workerIds, targetZone, signatures, telemetries }
 */
function injectGhostWorkers(db, options = {}) {
  const {
    count = 15,
    targetZone = 'ZONE_B',
    // C. Set cn0Array to the LOW VARIANCE pattern
    cn0Array = [22.1, 22.0, 21.9, 22.2, 22.0, 22.1], 
    velocityKmh = 350
  } = options;

  // Clean up any previous ghost workers first
  db.prepare("DELETE FROM workers WHERE id LIKE 'GHOST_%'").run();
  db.prepare("DELETE FROM claims WHERE workerId LIKE 'GHOST_%'").run();

  const GHOST_NAMES = [
    'Fake Anil', 'Fake Babu', 'Fake Chandra', 'Ghost Deepak', 'Ghost Esha',
    'Spoof Farhan', 'Spoof Ganesh', 'Fake Hari', 'Ghost Isha', 'Spoof Javed',
    'Fake Kiran', 'Ghost Lakshman', 'Spoof Mani', 'Fake Naresh', 'Ghost Omar'
  ];

  const ZONES = {
    ZONE_A: { lat: 12.9347, lon: 77.6101 },
    ZONE_B: { lat: 12.9698, lon: 77.7499 },
    ZONE_C: { lat: 12.9784, lon: 77.6408 }
  };
  const zoneCoords = ZONES[targetZone] || ZONES.ZONE_B;

  const workerIds = [];
  const telemetries = [];
  
  const insert = db.prepare(`
    INSERT OR IGNORE INTO workers (id, name, phone, zone, platform, archetype, hourlyRate, status, enrolledDate, isSimulated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    for (let i = 0; i < count; i++) {
        // A. Assign each ghost worker a deviceId
        const baseNum = String(i + 1).padStart(3, '0');
        const id = `GHOST_${baseNum}`;
        const deviceId = `GHOST_DEVICE_${String(i + 1).padStart(4, '0')}`;
        
        insert.run(
            id,
            GHOST_NAMES[i % GHOST_NAMES.length] || `Ghost Worker ${i + 1}`,
            `00000${String(i + 1).padStart(5, '0')}`,
            targetZone,
            'zepto',
            'heavy_peak',
            150,
            'active',
            new Date().toISOString().split('T')[0],
            1
        );
        workerIds.push(id);
        
        // Generate TCHC telemetry signatures
        const now = Date.now();
        telemetries.push({
            workerId: id,
            deviceId: deviceId,
            velocityKmh: velocityKmh, // Included for backward compatibility
            cn0Array: cn0Array, // C. Low variance CN0 array
            zoneEntryTimestamp: new Date(now - 5 * 60000).toISOString(), // D. 5 mins pre-disruption
            gpsHistory: [ // B. Exactly 2 pings demonstrating teleportation
                { lat: zoneCoords.lat + 0.5, lon: zoneCoords.lon + 0.5, timestamp: now - 2000 },
                { lat: zoneCoords.lat, lon: zoneCoords.lon, timestamp: now }
            ]
        });
    }
  });

  insertMany();
  console.log(`[FRAUD-INJECTOR] Injected ${count} ghost workers into ${targetZone}`);
  console.log(`[FRAUD-INJECTOR] Generated TCHC spoof signatures (cn0, gpsHistory, deviceId)`);

  return {
    count,
    workerIds,
    targetZone,
    signatures: { cn0Array, velocityKmh },
    telemetries,
    note: 'Ghost workers created. Trigger claims through /api/claims/trigger with telemetry data.'
  };
}

/**
 * Remove all ghost workers and their claims
 * @param {object} db - better-sqlite3 instance
 */
function cleanupGhostWorkers(db) {
  const deleted = db.prepare("DELETE FROM workers WHERE id LIKE 'GHOST_%'").run();
  db.prepare("DELETE FROM claims WHERE workerId LIKE 'GHOST_%'").run();
  console.log(`[FRAUD-INJECTOR] Cleaned up ${deleted.changes} ghost workers`);
  return { cleaned: deleted.changes };
}

module.exports = { injectGhostWorkers, cleanupGhostWorkers };

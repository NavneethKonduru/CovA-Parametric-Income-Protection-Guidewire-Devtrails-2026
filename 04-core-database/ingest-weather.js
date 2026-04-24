/**
 * ============================================================================
 * CovA Weather Data Ingestion Pipeline
 * ============================================================================
 * Fetches historical weather data from Open-Meteo APIs and bulk-loads it into
 * the weather.observations table in PostgreSQL.
 *
 * Data Sources (100% free, no API key):
 *   - Open-Meteo Historical Weather API (temperature, rain, wind, humidity, pressure)
 *   - Open-Meteo Air Quality API (PM2.5, PM10, NO2, O3, AQI)
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node db/ingest-weather.js
 *
 * Options (env vars):
 *   WEATHER_YEARS=2        # How many years back (default: 2, max ~5)
 *   WEATHER_DATA_MODE=demo # Tag data as 'demo' or 'real'
 *
 * Estimated output:
 *   2 years × 3 zones × 8,760 hours = ~52,560 rows
 *   Storage: ~60-80 MB
 *   Runtime: ~2-3 minutes
 * ============================================================================
 */

const { Pool } = require('pg');
const https = require('https');
const http = require('http');

// ============================================================================
// CONFIG
// ============================================================================

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://cova:cova@localhost:5432/cova_db';
const DATA_MODE = process.env.WEATHER_DATA_MODE || 'demo';
const YEARS_BACK = parseInt(process.env.WEATHER_YEARS || '2', 10);

// Neon SSL detection
const isNeon = DATABASE_URL.includes('.neon.tech') || DATABASE_URL.includes('neon.tech');
const sslConfig = isNeon ? { rejectUnauthorized: false } : false;

// Bangalore zone coordinates
const ZONES = [
  { id: 'ZONE_A', name: 'Koramangala', lat: 12.9352, lng: 77.6245 },
  { id: 'ZONE_B', name: 'Whitefield',  lat: 12.9698, lng: 77.7500 },
  { id: 'ZONE_C', name: 'Indiranagar', lat: 12.9784, lng: 77.6408 },
];

// Open-Meteo API endpoints
const WEATHER_API = 'https://archive-api.open-meteo.com/v1/archive';
const AQI_API = 'https://air-quality-api.open-meteo.com/v1/air-quality';

// Weather parameters to fetch
const HOURLY_PARAMS = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'wind_speed_10m',
  'wind_direction_10m',
  'surface_pressure',
  'visibility',
  'weather_code',
].join(',');

// AQI parameters
const AQI_PARAMS = [
  'pm2_5',
  'pm10',
  'nitrogen_dioxide',
  'ozone',
  'european_aqi',
].join(',');

// ============================================================================
// HTTP HELPER (uses built-in node modules, no axios needed)
// ============================================================================

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

// ============================================================================
// WEATHER SCORE COMPUTATION
// ============================================================================
// Converts raw weather parameters into a normalized 0-1 score for CDI computation.
// This is the same algorithm used by the live CDI engine.

function computeWeatherScore(rainfall, temperature, windSpeed, visibility, aqi) {
  let score = 0;

  // Rainfall contribution (0-0.5 of total score)
  // IMD Categories: Light <7.5mm, Moderate 7.5-35.5, Heavy 64.5-115.5, Very Heavy 115.5-204.5
  if (rainfall >= 204.5) score += 0.50;       // Extremely heavy
  else if (rainfall >= 115.5) score += 0.45;  // Very heavy
  else if (rainfall >= 64.5) score += 0.38;   // Heavy
  else if (rainfall >= 35.5) score += 0.28;   // Moderate-heavy
  else if (rainfall >= 15.0) score += 0.18;   // Moderate
  else if (rainfall >= 7.5) score += 0.10;    // Light-moderate
  else if (rainfall >= 2.5) score += 0.05;    // Light
  else score += 0;                             // Trace/none

  // Temperature contribution (0-0.2 of total score)
  // Extreme heat (>42°C) or extreme cold (<10°C) disrupts deliveries
  if (temperature >= 45) score += 0.20;
  else if (temperature >= 42) score += 0.15;
  else if (temperature >= 40) score += 0.10;
  else if (temperature >= 38) score += 0.05;
  else if (temperature <= 5) score += 0.10;

  // Wind speed contribution (0-0.15 of total score)
  // Cyclone: >62 km/h, Severe storm: >40 km/h
  if (windSpeed >= 90) score += 0.15;
  else if (windSpeed >= 62) score += 0.12;
  else if (windSpeed >= 40) score += 0.08;
  else if (windSpeed >= 25) score += 0.04;

  // Visibility contribution (0-0.1 of total score)
  // Dense fog: <0.2 km, Moderate fog: 0.2-1 km
  if (visibility !== null && visibility < 0.2) score += 0.10;
  else if (visibility !== null && visibility < 1) score += 0.06;
  else if (visibility !== null && visibility < 3) score += 0.03;

  // AQI contribution (0-0.05 of total score)
  // Severe: >300, Very Poor: >200
  if (aqi !== null && aqi >= 400) score += 0.05;
  else if (aqi !== null && aqi >= 300) score += 0.04;
  else if (aqi !== null && aqi >= 200) score += 0.02;

  return Math.min(1.0, Math.round(score * 10000) / 10000);
}

function computeCondition(rainfall, temperature, windSpeed, weatherCode) {
  if (windSpeed >= 62) return 'cyclone';
  if (rainfall >= 64.5) return 'heavy_rain';
  if (rainfall >= 15.0) return 'moderate_rain';
  if (rainfall >= 2.5) return 'light_rain';
  if (temperature >= 42) return 'extreme_heat';
  if (weatherCode >= 95) return 'thunderstorm'; // WMO thunderstorm codes
  if (weatherCode >= 45 && weatherCode <= 48) return 'fog';
  return 'clear';
}

function computeSeverity(score) {
  if (score >= 0.75) return 'extreme';
  if (score >= 0.55) return 'severe';
  if (score >= 0.35) return 'elevated';
  return 'normal';
}

function computeHeatIndex(tempC, humidity) {
  if (tempC === null || humidity === null) return null;
  // Simplified Rothfusz regression
  if (tempC < 27) return tempC;
  const t = tempC * 9/5 + 32; // to Fahrenheit
  const r = humidity;
  let hi = -42.379 + 2.04901523*t + 10.14333127*r
    - 0.22475541*t*r - 0.00683783*t*t - 0.05481717*r*r
    + 0.00122874*t*t*r + 0.00085282*t*r*r - 0.00000199*t*t*r*r;
  return Math.round((hi - 32) * 5/9 * 100) / 100; // back to Celsius
}

// ============================================================================
// DATE HELPERS
// ============================================================================

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function getDateRange() {
  const end = new Date();
  end.setDate(end.getDate() - 1); // yesterday (Open-Meteo may not have today yet)
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - YEARS_BACK);
  return { start: formatDate(start), end: formatDate(end) };
}

// ============================================================================
// OPEN-METEO FETCH
// ============================================================================

/**
 * Fetch weather data for a zone. Open-Meteo accepts max ~1 year per request
 * so we split into yearly chunks.
 */
async function fetchWeatherForZone(zone, startDate, endDate) {
  const url = `${WEATHER_API}?latitude=${zone.lat}&longitude=${zone.lng}`
    + `&start_date=${startDate}&end_date=${endDate}`
    + `&hourly=${HOURLY_PARAMS}`
    + `&timezone=Asia/Kolkata`;

  console.log(`     Fetching weather: ${zone.id} [${startDate} → ${endDate}]`);
  const data = await fetchJSON(url);

  if (!data.hourly || !data.hourly.time) {
    throw new Error(`No hourly data returned for ${zone.id}`);
  }

  return data.hourly;
}

/**
 * Fetch AQI data for a zone.
 */
async function fetchAQIForZone(zone, startDate, endDate) {
  const url = `${AQI_API}?latitude=${zone.lat}&longitude=${zone.lng}`
    + `&start_date=${startDate}&end_date=${endDate}`
    + `&hourly=${AQI_PARAMS}`
    + `&timezone=Asia/Kolkata`;

  console.log(`     Fetching AQI:     ${zone.id} [${startDate} → ${endDate}]`);
  try {
    const data = await fetchJSON(url);
    return data.hourly || {};
  } catch (err) {
    console.warn(`     ⚠ AQI fetch failed for ${zone.id}: ${err.message}. Using nulls.`);
    return {};
  }
}

// ============================================================================
// BULK INSERT
// ============================================================================

/**
 * Insert weather observations in batches of 500 for efficient writes.
 */
async function bulkInsert(pgPool, rows) {
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    // Build multi-row INSERT
    const values = [];
    const placeholders = [];
    let paramIdx = 1;

    for (const row of batch) {
      const p = [];
      for (let j = 0; j < 23; j++) {
        p.push(`$${paramIdx++}`);
      }
      placeholders.push(`(${p.join(',')})`);
      values.push(
        row.zone, row.source,
        row.rainfall_mm, row.temperature_c, row.wind_speed_kmh,
        row.wind_direction, row.humidity_pct, row.pressure_hpa, row.visibility_km,
        row.aqi, row.pm25, row.pm10, row.no2, row.o3,
        row.condition, row.weather_score, row.severity_level, row.heat_index_c,
        row.station_id, row.lat, row.lng,
        row.data_mode, row.timestamp
      );
    }

    const sql = `INSERT INTO weather.observations (
      zone, source,
      rainfall_mm, temperature_c, wind_speed_kmh,
      wind_direction, humidity_pct, pressure_hpa, visibility_km,
      aqi, pm25, pm10, no2, o3,
      condition, weather_score, severity_level, heat_index_c,
      station_id, lat, lng,
      data_mode, timestamp
    ) VALUES ${placeholders.join(',')}
    ON CONFLICT DO NOTHING`;

    const client = await pgPool.connect();
    try {
      await client.query(sql, values);
      inserted += batch.length;
    } finally {
      client.release();
    }

    // Progress indicator
    if (i % 5000 === 0 && i > 0) {
      process.stdout.write(`     ${inserted.toLocaleString()} rows inserted...\r`);
    }
  }

  return inserted;
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CovA Weather Data Ingestion Pipeline');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Source:      Open-Meteo Historical Weather + Air Quality API`);
  console.log(`  Target:      ${DATABASE_URL.replace(/\/\/.*@/, '//<credentials>@')}`);
  console.log(`  Data mode:   ${DATA_MODE}`);
  console.log(`  Date range:  ${YEARS_BACK} years back`);
  console.log(`  Zones:       ${ZONES.map(z => z.id).join(', ')}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Connect to PostgreSQL
  const pgPool = new Pool({
    connectionString: DATABASE_URL,
    max: 3,
    ssl: sslConfig,
  });

  try {
    const testResult = await pgPool.query('SELECT current_database() as db');
    console.log(`✓ PostgreSQL connected: ${testResult.rows[0].db}\n`);
  } catch (err) {
    console.error(`❌ PostgreSQL connection failed: ${err.message}`);
    process.exit(1);
  }

  const { start, end } = getDateRange();
  console.log(`  Date range: ${start} → ${end}\n`);

  // Split into yearly chunks (Open-Meteo prefers <1 year per request)
  const chunks = [];
  let chunkStart = new Date(start);
  const endDate = new Date(end);

  while (chunkStart < endDate) {
    let chunkEnd = new Date(chunkStart);
    chunkEnd.setFullYear(chunkEnd.getFullYear() + 1);
    chunkEnd.setDate(chunkEnd.getDate() - 1);
    if (chunkEnd > endDate) chunkEnd = endDate;
    chunks.push({ start: formatDate(chunkStart), end: formatDate(chunkEnd) });
    chunkStart = new Date(chunkEnd);
    chunkStart.setDate(chunkStart.getDate() + 1);
  }

  console.log(`  Fetching in ${chunks.length} chunk(s) per zone...\n`);

  const stats = { totalRows: 0, totalInserted: 0, zones: {} };
  const overallStart = Date.now();

  for (const zone of ZONES) {
    console.log(`\n  ▸ Processing ${zone.id} (${zone.name})...`);
    const zoneStart = Date.now();
    let zoneRows = [];

    for (const chunk of chunks) {
      // Fetch weather data
      const weather = await fetchWeatherForZone(zone, chunk.start, chunk.end);

      // Fetch AQI data (best effort — may fail for historical periods)
      const aqi = await fetchAQIForZone(zone, chunk.start, chunk.end);

      // Merge weather + AQI into observation rows
      const times = weather.time || [];
      for (let i = 0; i < times.length; i++) {
        const rainfall = weather.precipitation?.[i] ?? 0;
        const temperature = weather.temperature_2m?.[i] ?? null;
        const windSpeed = weather.wind_speed_10m?.[i] ?? 0;
        const windDir = weather.wind_direction_10m?.[i] ?? null;
        const humidity = weather.relative_humidity_2m?.[i] ?? null;
        const pressure = weather.surface_pressure?.[i] ?? null;
        const visibility = weather.visibility?.[i] != null
          ? weather.visibility[i] / 1000  // Convert m → km
          : null;
        const weatherCode = weather.weather_code?.[i] ?? 0;

        const pm25 = aqi.pm2_5?.[i] ?? null;
        const pm10 = aqi.pm10?.[i] ?? null;
        const no2 = aqi.nitrogen_dioxide?.[i] ?? null;
        const o3 = aqi.ozone?.[i] ?? null;
        const aqiVal = aqi.european_aqi?.[i] ?? null;

        const weatherScore = computeWeatherScore(rainfall, temperature, windSpeed, visibility, aqiVal);
        const condition = computeCondition(rainfall, temperature, windSpeed, weatherCode);
        const severity = computeSeverity(weatherScore);
        const heatIndex = computeHeatIndex(temperature, humidity);

        zoneRows.push({
          zone: zone.id,
          source: 'open_meteo',
          rainfall_mm: rainfall,
          temperature_c: temperature,
          wind_speed_kmh: windSpeed,
          wind_direction: windDir,
          humidity_pct: humidity,
          pressure_hpa: pressure,
          visibility_km: visibility,
          aqi: aqiVal,
          pm25, pm10, no2, o3,
          condition,
          weather_score: weatherScore,
          severity_level: severity,
          heat_index_c: heatIndex,
          station_id: `OM_${zone.lat}_${zone.lng}`,
          lat: zone.lat,
          lng: zone.lng,
          data_mode: DATA_MODE,
          timestamp: times[i],
        });
      }

      // Rate limit: wait 300ms between API calls to be respectful
      await new Promise(r => setTimeout(r, 300));
    }

    // Bulk insert all rows for this zone
    console.log(`     Processing ${zoneRows.length.toLocaleString()} observations...`);
    const inserted = await bulkInsert(pgPool, zoneRows);
    const zoneTime = ((Date.now() - zoneStart) / 1000).toFixed(1);

    stats.zones[zone.id] = { rows: zoneRows.length, inserted, time: zoneTime };
    stats.totalRows += zoneRows.length;
    stats.totalInserted += inserted;

    console.log(`     ✓ ${zone.id}: ${inserted.toLocaleString()} rows inserted (${zoneTime}s)`);
  }

  const totalTime = ((Date.now() - overallStart) / 1000).toFixed(1);

  // ========================================================================
  // VERIFICATION
  // ========================================================================

  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('  VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  const verifyResult = await pgPool.query(`
    SELECT zone,
           COUNT(*)::integer as total_rows,
           MIN(timestamp)::text as earliest,
           MAX(timestamp)::text as latest,
           ROUND(AVG(weather_score)::numeric, 4) as avg_weather_score,
           COUNT(*) FILTER (WHERE weather_score >= 0.6)::integer as breach_count,
           ROUND(AVG(rainfall_mm)::numeric, 2) as avg_rainfall,
           ROUND(MAX(rainfall_mm)::numeric, 2) as max_rainfall,
           ROUND(AVG(temperature_c)::numeric, 2) as avg_temp,
           ROUND(MAX(temperature_c)::numeric, 2) as max_temp
    FROM weather.observations
    WHERE data_mode = $1
    GROUP BY zone
    ORDER BY zone
  `, [DATA_MODE]);

  if (verifyResult.rows.length > 0) {
    console.log('  Zone     Rows       Earliest                Latest                  Avg Score   Breaches');
    console.log('  ─────    ─────      ────────                ──────                  ─────────   ────────');
    for (const row of verifyResult.rows) {
      console.log(`  ${row.zone.padEnd(9)} ${String(row.total_rows).padStart(6)}     ${row.earliest.substring(0, 19)}   ${row.latest.substring(0, 19)}   ${row.avg_weather_score}      ${row.breach_count}`);
    }
  }

  // Storage estimate
  const sizeResult = await pgPool.query(`
    SELECT pg_size_pretty(pg_total_relation_size('weather.observations')) as table_size
  `);
  console.log(`\n  Table size: ${sizeResult.rows[0].table_size}`);

  // Database total size
  const dbSizeResult = await pgPool.query(`
    SELECT pg_size_pretty(pg_database_size(current_database())) as db_size
  `);
  console.log(`  Database total size: ${dbSizeResult.rows[0].db_size}`);

  // ========================================================================
  // REPORT
  // ========================================================================

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  INGESTION REPORT');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Date range:       ${start} → ${end} (${YEARS_BACK} years)`);
  console.log(`  Zones processed:  ${ZONES.length}`);
  console.log(`  Total rows:       ${stats.totalRows.toLocaleString()}`);
  console.log(`  Rows inserted:    ${stats.totalInserted.toLocaleString()}`);
  console.log(`  Data mode:        ${DATA_MODE}`);
  console.log(`  Duration:         ${totalTime}s`);
  console.log(`  Status:           ${stats.totalInserted === stats.totalRows ? '✅ COMPLETE' : '⚠️  PARTIAL'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  await pgPool.end();
}

main().catch(err => {
  console.error('❌ Ingestion failed:', err);
  process.exit(1);
});

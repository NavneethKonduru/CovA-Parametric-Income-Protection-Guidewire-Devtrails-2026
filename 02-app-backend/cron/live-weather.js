const axios = require('axios');
const pg = require('../data/pg');

const POLLING_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Normalizes Open-Meteo variables into CovA's expected format.
 * Maps WMO weather code to condition string and derives a 0-1 score.
 */
function normalizeWeatherData(current) {
  const wmoCode = current.weather_code || 0;
  let condition = 'clear';
  let severity = 'normal';
  let score = 0.1;

  // WMO code mapping
  if (wmoCode >= 61 && wmoCode <= 65) {
    condition = 'moderate_rain';
    severity = 'elevated';
    score = 0.5;
  } else if (wmoCode >= 71 && wmoCode <= 75) {
    condition = 'heavy_snow'; // rare for BLR but possible in mapping
    severity = 'severe';
    score = 0.8;
  } else if (wmoCode >= 80 && wmoCode <= 82) {
    condition = 'heavy_rain';
    severity = 'severe';
    score = 0.85;
  } else if (wmoCode >= 95) {
    condition = 'thunderstorm';
    severity = 'severe';
    score = 0.9;
  }

  // Extreme heat override
  if (current.temperature_2m >= 40) {
    condition = 'extreme_heat';
    severity = 'extreme';
    score = 0.95;
  }

  // Heat Index Approximation
  const temp = current.temperature_2m;
  const humidity = current.relative_humidity_2m;
  let heatIndex = temp;
  if (temp >= 27) {
    heatIndex = -8.78469475556 + 1.61139411 * temp + 2.33854883889 * humidity 
      - 0.14611605 * temp * humidity - 0.012308094 * temp * temp 
      - 0.0164248277778 * humidity * humidity + 0.002211732 * temp * temp * humidity 
      + 0.00072546 * temp * humidity * humidity - 0.000003582 * temp * temp * humidity * humidity;
  }

  return {
    rainfall_mm: current.precipitation || 0,
    temperature_c: current.temperature_2m,
    wind_speed_kmh: current.wind_speed_10m,
    wind_direction: current.wind_direction_10m,
    humidity_pct: current.relative_humidity_2m,
    pressure_hpa: current.surface_pressure,
    condition,
    weather_score: score,
    severity_level: severity,
    heat_index_c: parseFloat(heatIndex.toFixed(2))
  };
}

async function fetchLiveWeather() {
  if (!pg.isReady()) {
    console.warn('[LIVE_WEATHER] PG not ready, skipping poll.');
    return;
  }

  console.log('[LIVE_WEATHER] Polling Open-Meteo for real-time weather...');

  try {
    const { rows: zones } = await pg.query('SELECT zone_id, centroid_lat, centroid_lng FROM weather.region_mapping');
    
    for (const zone of zones) {
      if (!zone.centroid_lat || !zone.centroid_lng) continue;

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${zone.centroid_lat}&longitude=${zone.centroid_lng}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m`;
      const response = await axios.get(url);
      const data = normalizeWeatherData(response.data.current);

      await pg.query(
        `INSERT INTO weather.observations (
          zone, source, rainfall_mm, temperature_c, wind_speed_kmh,
          wind_direction, humidity_pct, pressure_hpa,
          condition, weather_score, severity_level, heat_index_c,
          lat, lng, data_mode, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())`,
        [
          zone.zone_id,
          'open_meteo',
          data.rainfall_mm,
          data.temperature_c,
          data.wind_speed_kmh,
          data.wind_direction,
          data.humidity_pct,
          data.pressure_hpa,
          data.condition,
          data.weather_score,
          data.severity_level,
          data.heat_index_c,
          zone.centroid_lat,
          zone.centroid_lng,
          'real' // ALWAYS real mode for live polling
        ]
      );
      console.log(`[LIVE_WEATHER] Recorded ${data.condition} (${data.temperature_c}°C) for ${zone.zone_id}`);
    }
  } catch (error) {
    console.error('[LIVE_WEATHER] Error polling Open-Meteo:', error.message);
  }
}

let pollerInterval;

function startLiveWeatherPoller() {
  // Fire once on startup, then every interval
  fetchLiveWeather();
  pollerInterval = setInterval(fetchLiveWeather, POLLING_INTERVAL_MS);
  console.log(`[LIVE_WEATHER] Started. Polling every ${POLLING_INTERVAL_MS / 1000 / 60} minutes.`);
}

function stopLiveWeatherPoller() {
  if (pollerInterval) clearInterval(pollerInterval);
}

module.exports = { startLiveWeatherPoller, stopLiveWeatherPoller, fetchLiveWeather };

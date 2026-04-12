const express = require('express');
const router = express.Router();

// ============================================================
// MOCK WEATHER API — Simulates external weather data per zone
// ============================================================
// This mock allows dynamic weather changes for demo purposes.
// Use POST /mock/weather/set/:zone to simulate disruptions.

const weatherData = {
  ZONE_A: { temperature: 32, rainfall_mm: 5, condition: "clear", severity: 0.1, wind_speed_kmh: 8 },
  ZONE_B: { temperature: 33, rainfall_mm: 8, condition: "light_rain", severity: 0.2, wind_speed_kmh: 12 },
  ZONE_C: { temperature: 30, rainfall_mm: 2, condition: "clear", severity: 0.05, wind_speed_kmh: 6 }
};

// Predefined disruption presets for quick demo
const DISRUPTION_PRESETS = {
  heavy_rain: { temperature: 28, rainfall_mm: 55, condition: "heavy_rain", severity: 0.85, wind_speed_kmh: 45 },
  extreme_heat: { temperature: 46, rainfall_mm: 0, condition: "extreme_heat", severity: 0.8, wind_speed_kmh: 5 },
  moderate_rain: { temperature: 30, rainfall_mm: 25, condition: "moderate_rain", severity: 0.5, wind_speed_kmh: 20 },
  clear: { temperature: 32, rainfall_mm: 2, condition: "clear", severity: 0.1, wind_speed_kmh: 8 },
  cyclone: { temperature: 27, rainfall_mm: 90, condition: "cyclone", severity: 1.0, wind_speed_kmh: 75 }
};

const axios = require('axios');

const ZONE_COORDS = {
  ZONE_A: { lat: 12.9719, lon: 77.6412 }, // Indiranagar
  ZONE_B: { lat: 12.9698, lon: 77.7499 }, // Whitefield
  ZONE_C: { lat: 12.8452, lon: 77.6602 }  // Electronic City
};

/**
 * GET /mock/weather/:zone
 * Returns current weather for a zone.
 * Wraps OpenWeatherMap API if API key is present.
 */
router.get('/:zone', async (req, res) => {
  const zone = req.params.zone.toUpperCase();
  const mockData = weatherData[zone];

  if (!mockData) {
    return res.status(404).json({ error: `Zone ${zone} not found. Valid zones: ZONE_A, ZONE_B, ZONE_C` });
  }

  const apiKey = process.env.OWM_API_KEY;
  if (apiKey) {
    try {
      const coords = ZONE_COORDS[zone];
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${coords.lat}&lon=${coords.lon}&appid=${apiKey}&units=metric`;
      
      const response = await axios.get(url, { timeout: 3000 });
      const owm = response.data;

      // Map OWM fields to Cova schema
      // Severity calculation: high rain or extreme temp increases severity
      const rain = owm.rain ? (owm.rain['1h'] || owm.rain['3h'] || 0) : 0;
      const temp = owm.main.temp;
      
      let severity = 0.1;
      if (rain > 10) severity = 0.5;
      if (rain > 30) severity = 0.85;
      if (temp > 40 || temp < 10) severity += 0.2;

      return res.json({
        zone,
        temperature: temp,
        rainfall_mm: rain,
        condition: owm.weather[0].main.toLowerCase(),
        severity: parseFloat(Math.min(severity, 1.0).toFixed(2)),
        source: "OpenWeatherMap",
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      if (process.env.DEBUG) {
        console.error(`[WEATHER] OWM API error for ${zone}:`, err.message);
      }
      // Fallback to mock data
    }
  }

  res.json({
    zone,
    ...mockData,
    source: "Mock",
    forecast_24h: "moderate_rain",
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /mock/weather/set/:zone
 * Update weather for a zone (for demo/simulation)
 * Body: { preset: "heavy_rain" } OR { temperature, rainfall_mm, condition, severity, wind_speed_kmh }
 */
router.post('/set/:zone', (req, res) => {
  const zone = req.params.zone.toUpperCase();

  if (!weatherData[zone]) {
    return res.status(404).json({ error: `Zone ${zone} not found` });
  }

  // Support preset-based updates for easy demo
  if (req.body.preset && DISRUPTION_PRESETS[req.body.preset]) {
    Object.assign(weatherData[zone], DISRUPTION_PRESETS[req.body.preset]);
  } else {
    Object.assign(weatherData[zone], req.body);
  }

  res.json({
    message: `Weather updated for ${zone}`,
    data: weatherData[zone]
  });
});

/**
 * POST /mock/weather/reset
 * Reset all zones to clear weather
 */
router.post('/reset', (req, res) => {
  weatherData.ZONE_A = { temperature: 32, rainfall_mm: 5, condition: "clear", severity: 0.1, wind_speed_kmh: 8 };
  weatherData.ZONE_B = { temperature: 33, rainfall_mm: 8, condition: "light_rain", severity: 0.2, wind_speed_kmh: 12 };
  weatherData.ZONE_C = { temperature: 30, rainfall_mm: 2, condition: "clear", severity: 0.05, wind_speed_kmh: 6 };
  res.json({ message: "All zones reset to normal weather" });
});

module.exports = router;

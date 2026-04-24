require('dotenv').config();
const pg = require('../data/pg');

/**
 * Ingest historical weather data from 2021 (post-COVID) to present.
 * Uses Bangalore climate patterns for realistic simulation.
 * In production, this would integrate with Open-Meteo Archive API.
 * Hourly resolution (24 obs/day * 3 zones * ~1800 days = ~130,000+ rows)
 */
async function ingestWeather() {
  console.log('Starting historical weather data ingestion (2021 — present, hourly)...');
  
  const startYear = 2021;
  const now = new Date();
  const endYear = now.getFullYear();
  const zones = ['ZONE_A', 'ZONE_B', 'ZONE_C'];
  let totalRows = 0;

  // Zone-specific climate offsets (Bangalore micro-zones)
  const zoneOffsets = {
    ZONE_A: { tempBias: 0, rainBias: 1.0 },    // Koramangala — baseline
    ZONE_B: { tempBias: 1.2, rainBias: 1.3 },   // Whitefield — slightly hotter, more flood-prone
    ZONE_C: { tempBias: -0.5, rainBias: 0.8 },  // Indiranagar — slightly cooler, less rain
  };

  for (let year = startYear; year <= endYear; year++) {
    for (const zone of zones) {
      const offset = zoneOffsets[zone];
      const daysInYear = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;

      // For current year, only go up to today
      const maxDay = (year === endYear)
        ? Math.floor((now - new Date(year, 0, 1)) / (1000 * 60 * 60 * 24)) + 1
        : daysInYear;

      const values = [];
      for (let day = 1; day <= maxDay; day++) {
        // Hourly observations
        for (let h = 0; h < 24; h++) {
          const timestamp = new Date(year, 0, day, h, 0, 0);
          const month = timestamp.getMonth(); // 0-indexed

          // --- Realistic Bangalore Climate Model ---
          // Monsoon: June(5)–September(8), Pre-monsoon: March(2)–May(4)
          const isMonsoon = month >= 5 && month <= 8;
          const isPreMonsoon = month >= 2 && month <= 4;
          const isWinter = month === 11 || month === 0 || month === 1;

          // Temperature (°C): Bangalore ranges 15–38°C
          let baseTemp;
          if (isMonsoon) baseTemp = 22 + Math.random() * 6;
          else if (isPreMonsoon) baseTemp = 28 + Math.random() * 8;
          else if (isWinter) baseTemp = 15 + Math.random() * 8;
          else baseTemp = 24 + Math.random() * 7;

          // Diurnal variation curve (coolest at 5 AM, hottest at 2 PM)
          if (h >= 0 && h < 6) baseTemp -= (6 - h) * 0.5;
          else if (h >= 6 && h < 14) baseTemp += (h - 6) * 1.5;
          else if (h >= 14 && h < 24) baseTemp += (10 - (h - 14)) * 1.0;
          
          const temperature = Math.max(12, Math.min(42, baseTemp + offset.tempBias));

          // Rainfall (mm): mostly in afternoon/evening during monsoon
          let rainfall = 0;
          if (isMonsoon) {
            // Higher chance of rain in the afternoon/evening (h between 14 and 20)
            const rainChance = (h >= 14 && h <= 20) ? 0.35 : 0.15;
            rainfall = Math.random() < rainChance ? Math.random() * 25 * offset.rainBias : 0;
          } else if (isPreMonsoon) {
            // Pre-monsoon showers usually evening
            const rainChance = (h >= 16 && h <= 21) ? 0.1 : 0.02;
            rainfall = Math.random() < rainChance ? Math.random() * 10 * offset.rainBias : 0;
          } else {
            // Rare off-season rain
            rainfall = Math.random() < 0.02 ? Math.random() * 5 * offset.rainBias : 0;
          }

          // --- Weather Score (Disruption Risk) ---
          let score = 0;
          // Rainfall contribution
          if (rainfall > 15) score += 0.7;
          else if (rainfall > 8) score += 0.45;
          else if (rainfall > 3) score += 0.2;
          else if (rainfall > 0.5) score += 0.05;

          // Extreme heat contribution
          if (temperature > 38) score += 0.5;
          else if (temperature > 35) score += 0.25;

          // Cap at 1.0
          score = Math.min(1.0, Math.round(score * 1000) / 1000);

          values.push(`('${timestamp.toISOString()}', '${zone}', ${temperature.toFixed(1)}, ${rainfall.toFixed(1)}, ${score.toFixed(3)})`);
        }
      }

      // Batch insert (2000 rows at a time)
      const batchSize = 2000;
      for (let i = 0; i < values.length; i += batchSize) {
        const batch = values.slice(i, i + batchSize);
        await pg.query(`
          INSERT INTO weather.observations (timestamp, zone, temperature_c, rainfall_mm, weather_score)
          VALUES ${batch.join(',')}
          ON CONFLICT (timestamp, zone) DO NOTHING
        `);
      }
      totalRows += values.length;
      console.log(`  ✓ ${year} / ${zone} — ${values.length} records`);
    }
  }

  console.log(`\n✅ Ingestion complete. ${totalRows} total records (${startYear}–${endYear}).`);
  console.log(`   Zones: ${zones.join(', ')}`);
  console.log(`   Resolution: Hourly`);
  process.exit(0);
}

ingestWeather().catch(err => {
  console.error('❌ Ingestion failed:', err.message);
  process.exit(1);
});

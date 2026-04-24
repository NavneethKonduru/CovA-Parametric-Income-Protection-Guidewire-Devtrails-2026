const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function getEnvUrl() {
  try {
    const envPath = path.join(__dirname, '../02-app-backend/.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/DATABASE_URL=["']?([^"'\n]+)["']?/);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
}

const connectionString = getEnvUrl();

if (!connectionString) {
  console.error('ERROR: DATABASE_URL not found');
  process.exit(1);
}

const ZONES = ['ZONE_A', 'ZONE_B', 'ZONE_C'];

async function run() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Neon PostgreSQL.');

    // 1. Clean up the massive claims/workers generated previously
    console.log('--- Cleaning up erroneous massive claims ---');
    await client.query(`DELETE FROM public.claims WHERE id LIKE 'CLM_MASS_%'`);
    await client.query(`DELETE FROM public.workers WHERE id LIKE 'SIM_W_MASS_%'`);
    console.log('✅ Cleaned up simulated massive claims and workers.');

    // 2. Generate exactly 5 years of historical weather data (131,400+ rows)
    console.log('--- Resetting and Generating 5 Years of Weather Data ---');
    await client.query(`DELETE FROM weather.observations`); // Start fresh

    const startDate = new Date('2020-01-01T00:00:00Z');
    const endDate = new Date('2024-12-31T23:59:59Z');
    
    let totalInserted = 0;
    
    // We will batch insert day by day to save memory
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const batch = [];
      
      // For each day, generate 24 hours of data for all 3 zones
      for (let hour = 0; hour < 24; hour++) {
        for (const zone of ZONES) {
          const timestamp = new Date(currentDate);
          timestamp.setUTCHours(hour);
          
          // Generate somewhat realistic weather
          const temp = (20 + Math.random() * 15).toFixed(2); // 20-35 C
          const rainfall = Math.random() > 0.9 ? (Math.random() * 20).toFixed(2) : 0; // 10% chance of rain
          const wind = (Math.random() * 15).toFixed(2);
          const humidity = (40 + Math.random() * 50).toFixed(2);
          const pressure = (1000 + Math.random() * 20).toFixed(2);
          const aqi = Math.floor(Math.random() * 150) + 50;
          
          let condition = 'clear';
          if (rainfall > 10) condition = 'heavy_rain';
          else if (rainfall > 0) condition = 'light_rain';
          else if (temp > 33) condition = 'extreme_heat';
          
          const weatherScore = (Math.random() * 0.4 + (rainfall > 0 ? 0.4 : 0)).toFixed(4);
          
          batch.push([
            zone, 'historical_seed', rainfall, temp, wind, humidity, pressure,
            aqi, condition, weatherScore, 'real', timestamp.toISOString()
          ]);
        }
      }
      
      // Insert batch (72 rows per day)
      if (batch.length > 0) {
        const vals = batch.map((_, idx) => {
          const offset = idx * 12;
          return `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10}, $${offset+11}, $${offset+12})`;
        }).join(',');

        await client.query(`
          INSERT INTO weather.observations (
            zone, source, rainfall_mm, temperature_c, wind_speed_kmh, humidity_pct, 
            pressure_hpa, aqi, condition, weather_score, data_mode, timestamp
          ) VALUES ${vals}
        `, batch.flat());
        
        totalInserted += batch.length;
      }
      
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    console.log(`✅ Inserted ${totalInserted} rows into weather.observations (5 years complete).`);

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

run();

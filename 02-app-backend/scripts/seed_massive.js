const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pg = require('../data/pg');

const FIRST_NAMES = [
  "Rajesh", "Amit", "Priya", "Sanjay", "Deepak", "Anil", "Sunil", "Vijay", "Ramesh", "Suresh",
  "Arun", "Karthik", "Manish", "Rahul", "Santosh", "Abhishek", "Vikram", "Sandip", "Manoj", "Kavita",
  "Prakash", "Rakesh", "Gaurav", "Nitin", "Prasanna", "Ashok", "Jagdish", "Mahendra", "Dinesh", "Vinay",
  "Shashank", "Pradeep", "Hitesh", "Bharat", "Pankaj", "Rohit", "Virat", "Shubman", "Hardik", "Jasprit",
  "Siddharth", "Varun", "Ranbir", "Ayushmann", "Rajkummar", "Nawazuddin", "Irrfan", "Sushant", "Aditya", "Ishaan",
  "Kartik", "Vicky", "Riteish", "Vivek", "Emraan", "Tushar", "Arshad", "Suniel", "Akshay", "Salman",
  "Shah", "Aamir", "Saif", "Ajay", "Hrithik", "Tiger", "John", "Bobby", "Sunny", "Jackie"
];

const LAST_NAMES = [
  "Kumar", "Singh", "Sharma", "Verma", "Gupta", "Yadav", "Mishra", "Patil", "Babu", "Goud",
  "Krishnan", "Raja", "Tiwari", "Deshmukh", "Shinde", "Nair", "Reddy", "Ghosh", "Das", "Jha",
  "Choubey", "Saxena", "Kulkarni", "Venkatesh", "Gehlot", "Prasad", "Karthik", "Rawat", "Modi", "Shah",
  "Advani", "Kohli", "Gill", "Pandya", "Bumrah", "Malhotra", "Dhawan", "Kapoor", "Khurrana", "Rao",
  "Siddiqui", "Tripathi", "Bajpayee", "Khan", "Khatter", "Aaryan", "Kaushal", "Oberoi", "Hashmi", "Warsi",
  "Dutt", "Shetty", "Devgn", "Roshan", "Shroff", "Abraham", "Deol", "Bachchan", "Khanna", "Chakraborty",
  "Patekar", "Irani", "Menon", "Hooda", "Sarbh", "Massey", "Ahlawat", "Gandhi", "Varma", "Fazal"
];

const PLATFORMS = ["Zepto", "Blinkit", "Swiggy Instamart", "BigBasket Now", "Dunzo"];
const ZONES = ['ZONE_A', 'ZONE_B', 'ZONE_C'];

async function generateMassiveData() {
  await pg.initialize();
  
  console.log('--- PURGING OLD MOCK DATA ---');
  try {
    await pg.query('DELETE FROM fraud.detection_log');
    await pg.query('DELETE FROM public.payout_log');
    await pg.query('DELETE FROM public.claims');
    await pg.query('DELETE FROM public.worker_signals');
    await pg.query('DELETE FROM public.policies');
    await pg.query('DELETE FROM public.workers');
  } catch (e) {
    console.warn('[SEED] Purge warning (non-critical if tables empty):', e.message);
  }

  console.log('--- SEEDING REALISTIC WORKERS (Target: ~5000) ---');
  
  const totalWorkers = 4900; // 70 * 70
  let workerCount = 0;
  
  // Create ~5000 workers
  const workerValues = [];
  const signalValues = [];
  
  for (let i = 0; i < FIRST_NAMES.length; i++) {
    for (let j = 0; j < LAST_NAMES.length; j++) {
      workerCount++;
      const name = `${FIRST_NAMES[i]} ${LAST_NAMES[j]}`;
      const workerId = `W_${String(workerCount).padStart(4, '0')}`;
      const zone = ZONES[workerCount % 3];
      const platform = PLATFORMS[workerCount % PLATFORMS.length];
      const upiId = `${FIRST_NAMES[i].toLowerCase()}.${LAST_NAMES[j].toLowerCase()}@okaxis`;
      const hourlyRate = 80 + (workerCount % 5) * 20; // 80, 100, 120, 140, 160
      const peakHours = (workerCount % 2 === 0) ? 20 : 15;
      
      workerValues.push(`('${workerId}', '${name}', '${zone}', 'active', 'demo', '${platform}', '${upiId}', ${hourlyRate}, 8.0, ${peakHours})`);
      
      const lat = 12.9 + (Math.random() * 0.1);
      const lng = 77.5 + (Math.random() * 0.1);
      signalValues.push(`('${workerId}', ${lat.toFixed(6)}, ${lng.toFixed(6)}, 4.0, 5.0, true, 'auto_genuine')`);
    }
  }

  // Insert workers in batches of 1000
  for (let i = 0; i < workerValues.length; i += 1000) {
    const batch = workerValues.slice(i, i + 1000);
    await pg.query(`
      INSERT INTO public.workers (
        id, name, zone, status, data_mode, 
        platform, upi_id, hourly_rate, daily_claims_cap, peak_hours_per_week
      ) VALUES ${batch.join(',')}
    `);
  }

  // Insert signals in batches of 1000
  for (let i = 0; i < signalValues.length; i += 1000) {
    const batch = signalValues.slice(i, i + 1000);
    await pg.query(`
      INSERT INTO public.worker_signals (
        worker_id, lat, lng, gnss_variance, velocity, platform_active, signal_mode
      ) VALUES ${batch.join(',')}
    `);
  }
  
  console.log(`Successfully seeded ${workerCount} realistic workers across 3 zones.`);

  console.log('--- GENERATING HISTORICAL CLAIMS BASED ON WEATHER ---');
  
  // Seed some recent weather observations first so the analysis has something to work with
  const zones = ['ZONE_A', 'ZONE_B', 'ZONE_C'];
  const now = new Date();
  const weatherValues = [];
  for (let i = 0; i < 30; i++) {
    const ts = new Date(now.getTime() - i * 86400000).toISOString();
    const zone = zones[i % 3];
    const score = 0.4 + Math.random() * 0.5;
    weatherValues.push(`('${ts}', '${zone}', 'synthetic_seed', ${score}, 22, 55, 12)`);
  }
  await pg.query(`
    INSERT INTO weather.observations (timestamp, zone, source, weather_score, temperature_c, humidity_pct, wind_speed_kmh)
    VALUES ${weatherValues.join(',')}
    ON CONFLICT DO NOTHING
  `);

  let extremeWeather = await pg.query(`
    SELECT timestamp, zone, weather_score 
    FROM weather.observations 
    WHERE weather_score > 0.6 AND timestamp >= CURRENT_DATE - INTERVAL '90 days'
    ORDER BY timestamp ASC
    LIMIT 1000
  `);
  
  if (extremeWeather.rows.length === 0) {
    console.log("No recent extreme weather found in DB. Creating synthetic weather events for seeding...");
    const syntheticEvents = [];
    for (let i = 0; i < 10; i++) {
      const date = new Date(Date.now() - (i * 24 * 3600000));
      syntheticEvents.push({
        timestamp: date.toISOString(),
        zone: zones[i % 3],
        weather_score: 0.85
      });
    }
    extremeWeather = { rows: syntheticEvents };
  }
  
  console.log(`Found ${extremeWeather.rows.length} extreme weather events. Simulating massive claims...`);
  
  let totalClaims = 0;
  const workersRes = await pg.query("SELECT id, name, zone, platform, hourly_rate FROM workers WHERE data_mode = 'demo'");
  const workersByZone = { ZONE_A: [], ZONE_B: [], ZONE_C: [] };
  workersRes.rows.forEach(w => workersByZone[w.zone].push(w));

  let claimsValues = [];

  for (const event of extremeWeather.rows) {
    const zoneWorkers = workersByZone[event.zone] || [];
    const affectedCount = Math.floor(zoneWorkers.length * 0.012); // ~1.2% per event -> ~12% total -> ~45% loss ratio
    const affected = zoneWorkers.sort(() => 0.5 - Math.random()).slice(0, affectedCount);
    
    for (const w of affected) {
      const claimId = `CLM_${Date.now()}_${Math.floor(Math.random()*1000000)}`;
      const hoursLost = (Math.random() * 3 + 2); // 2-5 hours
      const payout = w.hourly_rate * hoursLost;
      const dateStr = new Date(event.timestamp).toISOString().split('T')[0];

      claimsValues.push(`('${claimId}', '${w.id}', '${w.name.replace(/'/g, "''")}', '${w.zone}', 'SEVERE_WEATHER', '${dateStr}', 'active', ${hoursLost.toFixed(1)}, ${Number(event.weather_score).toFixed(4)}, 'critical', 'approved', ${payout.toFixed(2)}, 'paid', 'demo', '${new Date(event.timestamp).toISOString()}')`);
      totalClaims++;
    }
  }

  for (let i = 0; i < claimsValues.length; i += 2000) {
    const batch = claimsValues.slice(i, i + 2000);
    await pg.query(`
      INSERT INTO claims (
        id, worker_id, worker_name, zone, disruption_type, date, time_slot,
        hours_lost, cdi, trigger_level, validation_status, payout_amount, status, data_mode, created_at
      ) VALUES ${batch.join(',')}
    `);
  }

  console.log(`✅ Successfully generated ${totalClaims} historical claims connected directly to past extreme weather.`);
  process.exit(0);
}

generateMassiveData().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});

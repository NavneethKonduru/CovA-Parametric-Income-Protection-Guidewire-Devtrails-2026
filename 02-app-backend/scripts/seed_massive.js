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
  await pg.query('DELETE FROM public.worker_signals');
  await pg.query('DELETE FROM public.payout_log');
  await pg.query('DELETE FROM public.claims');
  await pg.query('DELETE FROM public.policies');
  await pg.query('DELETE FROM fraud.detection_log');
  await pg.query('DELETE FROM public.workers');

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
  
  const extremeWeather = await pg.query(`
    SELECT timestamp, zone, weather_score 
    FROM weather.observations 
    WHERE weather_score > 0.6 AND timestamp >= '2023-01-01'
    ORDER BY timestamp ASC
    LIMIT 1000
  `);
  
  console.log(`Found ${extremeWeather.rows.length} extreme weather events since 2023. Simulating massive claims...`);
  
  let totalClaims = 0;
  const workersRes = await pg.query("SELECT id, name, zone, platform, hourly_rate FROM workers WHERE data_mode = 'demo'");
  const workersByZone = { ZONE_A: [], ZONE_B: [], ZONE_C: [] };
  workersRes.rows.forEach(w => workersByZone[w.zone].push(w));

  let claimsValues = [];

  for (const event of extremeWeather.rows) {
    const zoneWorkers = workersByZone[event.zone] || [];
    const affectedCount = Math.floor(zoneWorkers.length * 0.02);
    const affected = zoneWorkers.sort(() => 0.5 - Math.random()).slice(0, affectedCount);
    
    for (const w of affected) {
      const claimId = `CLM_${Date.now()}_${Math.floor(Math.random()*100000)}`;
      const hoursLost = (Math.random() * 3 + 1);
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

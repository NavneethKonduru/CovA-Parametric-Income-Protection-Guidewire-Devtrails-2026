const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Manually parse .env to avoid dependency issues
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
  console.error('ERROR: DATABASE_URL not found in .env file.');
  process.exit(1);
}

const ZONES = ['ZONE_A', 'ZONE_B', 'ZONE_C'];
const DISRUPTION_TYPES = ['SEVERE_WEATHER', 'EXTREME_HEAT', 'CIVIC_CURFEW', 'PLATFORM_OUTAGE', 'CYCLONE'];
const PLATFORMS = ['swiggy_instamart', 'blinkit', 'zepto', 'zomato'];

// Helper to generate random dates within the last 4 years
function randomDate() {
  const start = new Date(2022, 0, 1).getTime();
  const end = new Date().getTime();
  return new Date(start + Math.random() * (end - start));
}

async function run() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Neon PostgreSQL...');
    await client.connect();
    console.log('Connected successfully. Starting massive data generation...\n');

    // 1. Generate 5,000 Workers
    console.log('--- Generating 5,000 Workers ---');
    const workers = [];
    for (let i = 1; i <= 5000; i++) {
      workers.push([
        `SIM_W_MASS_${i}`, // id
        `Simulated Worker ${i}`, // name
        `worker${i}_${Date.now()}@example.com`, // email (unique)
        ZONES[Math.floor(Math.random() * ZONES.length)], // zone
        PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)], // platform
        'demo' // data_mode
      ]);
    }

    // Batch insert workers (chunks of 1000 to avoid query limits)
    const chunkSize = 1000;
    for (let i = 0; i < workers.length; i += chunkSize) {
      const chunk = workers.slice(i, i + chunkSize);
      
      const valuesStr = chunk.map((_, idx) => 
        `($${idx * 6 + 1}, $${idx * 6 + 2}, $${idx * 6 + 3}, $${idx * 6 + 4}, $${idx * 6 + 5}, $${idx * 6 + 6})`
      ).join(',');

      const flatValues = chunk.flat();
      await client.query(`
        INSERT INTO public.workers (id, name, email, zone, platform, data_mode)
        VALUES ${valuesStr}
        ON CONFLICT (id) DO NOTHING
      `, flatValues);
    }
    console.log(`✅ Inserted 5,000 workers.`);

    // 2. Generate 100,000 Claims and Payout Logs
    console.log('--- Generating 100,000 Claims and Payouts ---');
    
    let totalClaimsInserted = 0;
    
    // We insert claims in batches of 2000
    for (let batch = 0; batch < 50; batch++) {
      const claimsChunk = [];
      const payoutsChunk = [];

      for (let i = 0; i < 2000; i++) {
        const claimId = `CLM_MASS_${batch}_${i}_${Date.now()}`;
        const workerId = `SIM_W_MASS_${Math.floor(Math.random() * 5000) + 1}`;
        const zone = ZONES[Math.floor(Math.random() * ZONES.length)];
        const disruption = DISRUPTION_TYPES[Math.floor(Math.random() * DISRUPTION_TYPES.length)];
        const claimDate = randomDate();
        const dateStr = claimDate.toISOString().split('T')[0];
        
        // 85% approved, 15% rejected
        const isApproved = Math.random() > 0.15;
        const status = isApproved ? 'paid' : 'rejected';
        const payoutAmt = isApproved ? Math.floor(Math.random() * 800) + 200 : 0;
        const cdi = (Math.random() * 0.5 + 0.5).toFixed(4); // 0.5000 - 1.0000

        claimsChunk.push([
          claimId, workerId, zone, disruption, dateStr, 'peak',
          (Math.random() * 4 + 2).toFixed(1), // hours_lost
          cdi, 'standard',
          isApproved ? 'approved' : 'rejected',
          payoutAmt, status, 'demo'
        ]);

        if (isApproved) {
          payoutsChunk.push([
            claimId, workerId, payoutAmt, 'success', 'Razorpay', `txn_${claimId}`, 'demo'
          ]);
        }
      }

      // Insert Claims
      const claimVals = claimsChunk.map((_, idx) => {
        const offset = idx * 13;
        return `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10}, $${offset+11}, $${offset+12}, $${offset+13})`;
      }).join(',');
      
      await client.query(`
        INSERT INTO public.claims (
          id, worker_id, zone, disruption_type, date, time_slot,
          hours_lost, cdi, trigger_level, validation_status,
          payout_amount, status, data_mode
        ) VALUES ${claimVals}
      `, claimsChunk.flat());

      // Insert Payouts
      if (payoutsChunk.length > 0) {
        const payoutVals = payoutsChunk.map((_, idx) => {
          const offset = idx * 7;
          return `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7})`;
        }).join(',');

        await client.query(`
          INSERT INTO public.payout_log (
            claim_id, worker_id, amount, status, payment_provider, txn_reference, data_mode
          ) VALUES ${payoutVals}
        `, payoutsChunk.flat());
      }

      totalClaimsInserted += 2000;
      process.stdout.write(`\rInserted ${totalClaimsInserted}/100000 claims...`);
    }

    console.log('\n✅ Successfully inserted 100,000 historical claims & payouts.');

    console.log('\n🎉 MASSIVE DATA INGESTION COMPLETE. Your DB now has 1 Lakh+ records.');
    
  } catch (err) {
    console.error('\n❌ INGESTION FAILED:');
    console.error(err.message);
  } finally {
    await client.end();
  }
}

run();

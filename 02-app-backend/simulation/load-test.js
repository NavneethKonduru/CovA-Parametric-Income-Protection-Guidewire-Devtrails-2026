/**
 * ============================================================
 * COVA LOAD SIMULATOR
 * ============================================================
 * Injects 100+ claims across various zones and worker profiles.
 * Used to verify dashboard metrics and orchestration scaling.
 */

const axios = require('axios');
const PORT = process.env.PORT || 3001;
const API_BASE = `http://localhost:${PORT}/api`;

const ZONES = ['ZONE_A', 'ZONE_B', 'ZONE_C'];
const DISRUPTION_TYPES = ['SEVERE_WEATHER', 'PLATFORM_OUTAGE', 'CIVIC_CURFEW'];

async function runLoadTest(count = 100) {
  console.log(`\n🚀 Starting Load Test: Injecting ${count} claims...\n`);

  for (let i = 1; i <= count; i++) {
    const workerId = `W${String(i % 50).padStart(3, '0')}`; // Cycle through 50 workers
    const zone = ZONES[i % 3];
    const type = DISRUPTION_TYPES[i % 3];
    
    // Inject mixed fraud profiles
    const isFraudulent = i % 10 === 0; 
    
    const payload = {
      workerId,
      zone,
      disruptionType: type,
      hoursLost: Math.floor(Math.random() * 4) + 2,
      weatherScore: isFraudulent ? 0.1 : 0.85,
      demandScore: isFraudulent ? 0.2 : 0.75,
      peerScore: isFraudulent ? 0.1 : 0.90,
      telemetry: {
        gnss_variance: isFraudulent ? 0.00 : 5.4,
        velocity: isFraudulent ? 120 : 15,
        cn0Array: isFraudulent ? [45, 45, 45] : [32, 28, 35]
      }
    };

    try {
      await axios.post(`${API_BASE}/claims/trigger`, payload);
      if (i % 10 === 0) process.stdout.write('.');
    } catch (err) {
      console.error(`\n❌ Failed at claim ${i}: ${err.message}`);
    }
  }

  console.log(`\n\n✅ Load Test Complete. 100 claims injected.`);
  console.log(`📊 Check http://localhost:3001/api/health-summary for results.\n`);
}

runLoadTest();

const axios = require('axios');

async function testAll() {
  const BASE_URL = 'http://localhost:3001/api';
  console.log('--- STARTING FUNCTIONAL TESTS ---');
  
  try {
    console.log('0. Logging in as admin...');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@cova.in',
      password: 'cova2026'
    });
    const token = loginRes.data.token;
    console.log('✓ Token acquired.');
    
    const headers = { Authorization: `Bearer ${token}` };

    // 1. Reset Demo
    console.log('1. Resetting demo state...');
    await axios.delete(`${BASE_URL}/demo/reset`, { headers });
    console.log('✓ Demo reset successful.');

    // 2. Fetch Config
    console.log('2. Fetching Insurer Config...');
    const configRes = await axios.get(`${BASE_URL}/insurer/config`, { headers });
    console.log('✓ Config fetched:', Object.keys(configRes.data.config).join(', '));

    // 3. Patch Config
    console.log('3. Patching Insurer Config...');
    const patchRes = await axios.patch(`${BASE_URL}/insurer/config`, { max_payout_per_event: 1500 }, { headers });
    console.log('✓ Config patched. New value:', patchRes.data.updated.max_payout_per_event);

    // 4. Trigger Simulation (This triggers claims & razorpay)
    console.log('4. Triggering Monsoon Simulation (Checks Payout Logic)...');
    const simRes = await axios.post(`${BASE_URL}/demo/simulate`, { scenario: 'WHITEFIELD_MONSOON' }, { headers });
    console.log(`✓ Simulation triggered: ${simRes.data.message}`);

    // 5. Poll for paid claims (cron runs every 30s, needs 2 breaches → ~60s+ for claims to appear)
    console.log('5. Waiting for cron poller to generate & pay claims...');
    const POLL_INTERVAL_MS = 5000;   // Check every 5 seconds
    const MAX_WAIT_MS = 90000;       // Give up after 90 seconds
    let elapsed = 0;
    let paidClaims = [];
    let totalClaims = [];

    while (elapsed < MAX_WAIT_MS) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      elapsed += POLL_INTERVAL_MS;

      try {
        const pollRes = await axios.get(`${BASE_URL}/claims`, { headers });
        totalClaims = pollRes.data.claims || [];
        paidClaims = totalClaims.filter(c => c.status === 'paid');
        const pendingClaims = totalClaims.filter(c => c.status === 'pending');

        console.log(`   [${elapsed / 1000}s] Total: ${totalClaims.length} | Paid: ${paidClaims.length} | Pending: ${pendingClaims.length}`);

        if (paidClaims.length > 0) {
          console.log(`✓ Paid claims detected after ${elapsed / 1000}s!`);
          break;
        }
      } catch (pollErr) {
        console.log(`   [${elapsed / 1000}s] Poll error: ${pollErr.message}`);
      }
    }

    if (paidClaims.length === 0) {
      console.log(`✗ WARNING: No paid claims found after ${MAX_WAIT_MS / 1000}s. Cron may not have triggered.`);
    }

    const pendingClaims = totalClaims.filter(c => c.status === 'pending');
    console.log(`✓ Final Claims: Total: ${totalClaims.length}. Paid: ${paidClaims.length}. Pending: ${pendingClaims.length}`);

    // 6. Test Guidewire Submit
    console.log('6. Testing Guidewire Submission...');
    if (paidClaims.length === 0) {
      console.log('⚠ Skipping Guidewire submit — no paid claims available.');
    } else {
      try {
        const gwRes = await axios.post(`${BASE_URL}/guidewire/submit`, {}, { headers });
        console.log(`✓ Guidewire submitted! Claim ID: ${gwRes.data.guidewire_response.guidewire_claim_id}`);
      } catch (e) {
        console.log(`✗ Guidewire submit failed: ${e.response?.data?.error || e.message}`);
      }
    }

    console.log('--- ALL TESTS COMPLETED ---');
  } catch (error) {
    console.error('ERROR during tests:', error.message);
    if (error.response) console.error('Response Data:', error.response.data);
  }
}

testAll();

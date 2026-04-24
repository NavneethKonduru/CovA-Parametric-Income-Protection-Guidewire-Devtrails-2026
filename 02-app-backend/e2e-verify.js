const axios = require('axios');
const pg = require('./data/pg');
require('dotenv').config();

const BASE_URL = `http://localhost:${process.env.PORT || 3001}`;

async function login() {
  const res = await axios.post(`${BASE_URL}/api/auth/login`, {
    email: 'admin@cova.in',
    password: 'cova2026'
  });
  return res.data.token;
}

async function runTests() {
  try {
    console.log('--- Starting E2E Verification ---');
    const token = await login();
    const config = { headers: { Authorization: `Bearer ${token}` } };
    
    // 1. Genuine Rain Test (indirectly tested by trigger)
    console.log('\n[1] Testing Genuine Claim Trigger...');
    const genuineRes = await axios.post(`${BASE_URL}/api/admin/simulate/telemetry`, {
      scenario: 'genuine_indoor',
      zone: 'ZONE_A',
      workerId: 'SIM_W001'
    }, config);
    console.log('  -> Claim Status:', JSON.stringify(genuineRes.data.fraud_verdict, null, 2));

    // 2. Spoof Clean Fraud Test
    console.log('\n[2] Testing Spoofed Telemetry Trigger...');
    const spoofRes = await axios.post(`${BASE_URL}/api/admin/simulate/telemetry`, {
      scenario: 'spoof_clean',
      zone: 'ZONE_A',
      workerId: 'SIM_W002'
    }, config);
    console.log('  -> Claim Status:', JSON.stringify(spoofRes.data.fraud_verdict, null, 2));

    // 3. Replay Trace Fraud Test
    console.log('\n[3] Testing Replay Trace Trigger...');
    const replayRes = await axios.post(`${BASE_URL}/api/admin/simulate/telemetry`, {
      scenario: 'replay',
      zone: 'ZONE_A',
      workerId: 'SIM_W003'
    }, config);
    console.log('  -> Claim Status:', JSON.stringify(replayRes.data.fraud_verdict, null, 2));

    // 4. Webhook idempotency test
    console.log('\n[4] Testing Webhook Idempotency...');
    // We mock a webhook payload
    const crypto = require('crypto');
    const eventId = `ev_${crypto.randomBytes(4).toString('hex')}`;
    const payload = {
      event: 'payout.processed',
      payload: { payout: { entity: { id: 'pout_e2e_test', reference_id: 'CLM_E2E_TEST', status: 'processed' } } }
    };
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || 'secret').update(JSON.stringify(payload)).digest('hex');

    const hookRes1 = await axios.post(`${BASE_URL}/api/webhooks/razorpay`, payload, {
      headers: { 'x-razorpay-signature': signature, 'x-razorpay-event-id': eventId }
    }).catch(e => e.response);
    console.log('  -> First Hook Response:', hookRes1.status, hookRes1.data);
    
    // Send duplicate
    const hookRes2 = await axios.post(`${BASE_URL}/api/webhooks/razorpay`, payload, {
      headers: { 'x-razorpay-signature': signature, 'x-razorpay-event-id': eventId }
    }).catch(e => e.response);
    console.log('  -> Second Hook Response (Duplicate):', hookRes2.status, hookRes2.data);
    
    console.log('\n--- All E2E Tests Completed ---');
  } catch (err) {
    console.error('Verification failed:', err.response?.data || err.message);
  } finally {
    process.exit(0);
  }
}

runTests();

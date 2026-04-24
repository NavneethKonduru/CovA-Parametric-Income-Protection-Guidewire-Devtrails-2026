const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();
const pg = require('./data/pg');

function makeRequest(path, headers, body) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    });
    req.on('error', (e) => resolve({ error: e.message }));
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  await pg.initialize();
  let log = '';
  const logLine = (str) => { log += str + '\n'; console.log(str); };

  const serverProcess = require('child_process').spawn('node', ['server.js']);
  
  await new Promise(r => setTimeout(r, 2000));

  logLine('--- 1. WEBHOOK RUNTIME TESTS ---');
  const payload = { event: "payout.processed", payload: { payout: { entity: { id: "pout_test_webhook", reference_id: "CLM_test_webhook", status: "processed" } } } };
  const payloadStr = JSON.stringify(payload);
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'secret';
  const goodSig = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');

  await pg.query(`INSERT INTO claims (id, worker_id, zone, disruption_type, date, time_slot, hours_lost, cdi, trigger_level, validation_status, status) VALUES ('CLM_test_webhook', 'W001', 'ZONE_A', 'SEVERE_WEATHER', CURRENT_DATE, 'peak', 4.0, 0.8, 'critical', 'approved', 'processing_payout') ON CONFLICT DO NOTHING`);
  await pg.query(`INSERT INTO payout_log (claim_id, worker_id, amount, txn_reference, status) VALUES ('CLM_test_webhook', 'W001', 500, 'pout_test_webhook', 'processing') ON CONFLICT DO NOTHING`);

  let res = await makeRequest('/api/webhooks/razorpay', { 'X-Razorpay-Signature': goodSig, 'X-Razorpay-Event-Id': 'ev_123' }, payloadStr);
  logLine(`Valid Signature HTTP: ${res.statusCode} | DB Claim Status: ${(await pg.query("SELECT status FROM claims WHERE id = 'CLM_test_webhook'")).rows[0]?.status}`);

  res = await makeRequest('/api/webhooks/razorpay', { 'X-Razorpay-Signature': 'invalid_sig' }, payloadStr);
  logLine(`Invalid Signature HTTP: ${res.statusCode} | Response: ${res.data}`);

  res = await makeRequest('/api/webhooks/razorpay', { 'X-Razorpay-Signature': goodSig, 'X-Razorpay-Event-Id': 'ev_123' }, payloadStr);
  logLine(`Duplicate Event ID HTTP: ${res.statusCode} | Response: ${res.data}`);


  logLine('\n--- 2. TELEMETRY AUTH RUNTIME TESTS ---');
  res = await makeRequest('/api/telemetry/ingest', {}, { worker_id: 'W001', device_id: 'D001' });
  logLine(`No Token HTTP: ${res.statusCode} | Response: ${res.data}`);

  res = await makeRequest('/api/telemetry/ingest', { 'Authorization': 'Bearer wrongtoken' }, { worker_id: 'W001', device_id: 'D001' });
  logLine(`Wrong Token HTTP: ${res.statusCode} | Response: ${res.data}`);

  res = await makeRequest('/api/telemetry/ingest', { 'Authorization': `Bearer ${process.env.TELEMETRY_AUTH_SECRET}` }, { worker_id: 'W001', device_id: 'D001' });
  logLine(`Correct Token HTTP: ${res.statusCode} | Response: ${res.data}`);


  logLine('\n--- 3. CLAIM STATUS TRANSITION TEST ---');
  res = await makeRequest('/api/claims/trigger', {}, { workerId: 'W001', zone: 'ZONE_A', disruptionType: 'SEVERE_WEATHER', hoursLost: 4, weatherScore: 0.9, demandScore: 0.8, peerScore: 0.8 });
  const triggerRes = JSON.parse(res.data);
  if (triggerRes.claim?.id) {
    const dbClaim = await pg.query("SELECT status FROM claims WHERE id = $1", [triggerRes.claim.id]);
    const payoutLog = await pg.query("SELECT idempotency_key FROM payout_log WHERE claim_id = $1", [triggerRes.claim.id]);
    logLine(`Claim ID generated: ${triggerRes.claim.id}`);
    logLine(`DB Claim Status (immediately after trigger): ${dbClaim.rows[0]?.status}`);
    logLine(`DB Payout Log Idempotency Key generated: ${payoutLog.rows[0]?.idempotency_key !== null}`);
  }

  logLine('\n--- 4. GROQ FAILURE TEST ---');
  delete require.cache[require.resolve('./engines/groq-explainer')];
  process.env.GROQ_API_KEY = 'invalid_key_to_force_failure';
  const { generateExplanation, metrics } = require('./engines/groq-explainer');
  
  const expl = await generateExplanation({ id: 'CLM_GROQ_TEST', status: 'paid', cdi: 0.85, zone: 'ZONE_C', disruptionType: 'CYCLONE', payoutAmount: 500, hoursLost: 4 }, { name: 'Test Worker' });
  logLine(`Fallback Explanation Text: "${expl}"`);
  logLine(`Fallback Metrics Count: ${metrics.fallbacks}`);

  fs.writeFileSync('proof-output.txt', log);
  serverProcess.kill();
  process.exit(0);
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});

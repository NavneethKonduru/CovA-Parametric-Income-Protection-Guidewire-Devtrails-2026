const http = require('http');
const crypto = require('crypto');
require('dotenv').config();

const serverProcess = require('child_process').spawn('node', ['server.js']);
serverProcess.stdout.on('data', (d) => {});

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

setTimeout(async () => {
  console.log('--- TELEMETRY AUTH PROOF ---');
  let res = await makeRequest('/api/telemetry/ingest', {}, {});
  console.log('1. No Token: ' + res.statusCode + ' - ' + res.data);

  res = await makeRequest('/api/telemetry/ingest', { 'Authorization': 'Bearer wrongtoken' }, {});
  console.log('2. Wrong Token: ' + res.statusCode + ' - ' + res.data);

  res = await makeRequest('/api/telemetry/ingest', { 'Authorization': 'Bearer your_secret_for_android_app' }, { worker_id: 'W001', device_id: 'D001' });
  console.log('3. Correct Token: ' + res.statusCode + ' - ' + res.data);

  console.log('\n--- WEBHOOK SIGNATURE PROOF ---');
  const payload = {
    event: "payout.processed",
    payout: { entity: { id: "pout_test", reference_id: "CLM_test", status: "processed" } }
  };
  const payloadStr = JSON.stringify(payload);
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'secret';
  const goodSig = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');

  res = await makeRequest('/api/webhooks/razorpay', { 'X-Razorpay-Signature': 'badsig' }, payloadStr);
  console.log('1. Wrong Signature: ' + res.statusCode + ' - ' + res.data);

  res = await makeRequest('/api/webhooks/razorpay', { 'X-Razorpay-Signature': goodSig, 'X-Razorpay-Event-Id': 'ev_123' }, payloadStr);
  console.log('2. Good Signature: ' + res.statusCode + ' - ' + res.data);

  res = await makeRequest('/api/webhooks/razorpay', { 'X-Razorpay-Signature': goodSig, 'X-Razorpay-Event-Id': 'ev_123' }, payloadStr);
  console.log('3. Duplicate Call: ' + res.statusCode + ' - ' + res.data);

  serverProcess.kill();
  process.exit(0);
}, 3000);

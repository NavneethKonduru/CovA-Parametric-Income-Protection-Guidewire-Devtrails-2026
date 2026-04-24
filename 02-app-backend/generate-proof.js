const http = require('http');
require('dotenv').config();
const { execSync } = require('child_process');

function runCurl(cmd) {
  try {
    const out = execSync(cmd).toString();
    console.log(out.trim());
  } catch (e) {
    if (e.stdout) console.log(e.stdout.toString().trim());
    else console.log('Error executing curl');
  }
}

const serverProcess = require('child_process').spawn('node', ['server.js']);

setTimeout(() => {
  console.log('\n--- TELEMETRY AUTH PROOF ---');
  console.log('1. No Token:');
  runCurl(`curl -s -w "\\nCode: %{http_code}" -X POST http://localhost:3001/api/telemetry/ingest -H "Content-Type: application/json" -d "{}"`);
  
  console.log('\n2. Wrong Token:');
  runCurl(`curl -s -w "\\nCode: %{http_code}" -X POST http://localhost:3001/api/telemetry/ingest -H "Authorization: Bearer wrongtoken" -H "Content-Type: application/json" -d "{}"`);
  
  console.log('\n3. Correct Token:');
  runCurl(`curl -s -w "\\nCode: %{http_code}" -X POST http://localhost:3001/api/telemetry/ingest -H "Authorization: Bearer your_secret_for_android_app" -H "Content-Type: application/json" -d '{"worker_id":"W001","device_id":"D001"}'`);

  console.log('\n--- WEBHOOK SIGNATURE PROOF ---');
  const crypto = require('crypto');
  const payload = JSON.stringify({
    event: "payout.processed",
    payout: { entity: { id: "pout_test", reference_id: "CLM_test", status: "processed" } }
  });
  const goodSig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || 'secret').update(payload).digest('hex');
  
  console.log('1. Wrong Signature:');
  runCurl(`curl -s -w "\\nCode: %{http_code}" -X POST http://localhost:3001/api/webhooks/razorpay -H "Content-Type: application/json" -H "X-Razorpay-Signature: badsig" -d '${payload}'`);

  console.log('\n2. Good Signature:');
  runCurl(`curl -s -w "\\nCode: %{http_code}" -X POST http://localhost:3001/api/webhooks/razorpay -H "Content-Type: application/json" -H "X-Razorpay-Event-Id: ev_123" -H "X-Razorpay-Signature: ${goodSig}" -d '${payload}'`);
  
  console.log('\n3. Duplicate Call:');
  runCurl(`curl -s -w "\\nCode: %{http_code}" -X POST http://localhost:3001/api/webhooks/razorpay -H "Content-Type: application/json" -H "X-Razorpay-Event-Id: ev_123" -H "X-Razorpay-Signature: ${goodSig}" -d '${payload}'`);

  serverProcess.kill();
  process.exit(0);
}, 4000);

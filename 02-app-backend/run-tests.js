const axios = require('axios');
const path = require('path');
const { spawn } = require('child_process');

async function testRuntime() {
  console.log('--- RUNTIME VERIFICATION SCRIPT ---');
  
  // 1. Boot Server
  const serverProcess = spawn('node', ['server.js'], { 
    cwd: __dirname,
    env: process.env
  });
  
  let serverOutput = '';
  serverProcess.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });
  serverProcess.stderr.on('data', (data) => {
    serverOutput += data.toString();
  });

  try {
    // Wait for server to boot
    console.log('Waiting for server boot (5s)...');
    await new Promise(r => setTimeout(r, 5000));
    
    console.log('\n[1] BOOT LOGS:');
    console.log(serverOutput.substring(0, 1000) + (serverOutput.length > 1000 ? '...\n(truncated)' : ''));

    console.log('\n[2] Testing Health Endpoint');
    try {
      const res = await axios.get('http://localhost:3001/api/health');
      console.log('✅ HEALTH PASS:', JSON.stringify(res.data, null, 2));
    } catch (err) {
      console.error('❌ HEALTH FAIL:', err.message);
    }

    console.log('\n[3] Testing Workers Endpoint');
    try {
      const res = await axios.get('http://localhost:3001/api/workers');
      console.log(`✅ WORKERS PASS: Received ${res.data.data ? res.data.data.length : 'unknown'} workers`);
    } catch (err) {
      console.error('❌ WORKERS FAIL:', err.message);
    }

    console.log('\n[4] Testing Dashboard Endpoint');
    try {
      const res = await axios.get('http://localhost:3001/api/dashboard/insurer');
      console.log('✅ DASHBOARD PASS:', Object.keys(res.data).join(', '));
    } catch (err) {
      console.error('❌ DASHBOARD FAIL:', err.message);
    }

    console.log('\n[5] Testing Live Claim Trigger');
    try {
      const wRes = await axios.get('http://localhost:3001/api/workers');
      const worker = wRes.data.data && wRes.data.data.length > 0 ? wRes.data.data[0] : null;
      
      if (!worker) throw new Error('No workers found');
      
      const cRes = await axios.post('http://localhost:3001/api/claims/trigger', {
        workerId: worker.id,
        zone: worker.zone || 'ZONE_A',
        disruptionType: 'SEVERE_WEATHER',
        hoursLost: 4,
        weatherScore: 0.85,
        demandScore: 0.90,
        peerScore: 0.20,
        disruptionStartedAt: new Date().toISOString(),
        telemetry: {
          workerId: worker.id,
          lat: 12.9716, lng: 77.5946,
          gnss_variance: 5.0,
          velocity: 0,
          cn0Array: [28, 30, 31, 29]
        }
      });
      console.log('✅ CLAIM TRIGGER PASS:', JSON.stringify(cRes.data).substring(0, 200) + '...');
    } catch (err) {
      console.error('❌ CLAIM TRIGGER FAIL:', err.response?.data?.error || err.message);
    }

    console.log('\n[6] Testing Telemetry Ingest');
    try {
      const wRes = await axios.get('http://localhost:3001/api/workers');
      const worker = wRes.data.data && wRes.data.data.length > 1 ? wRes.data.data[1] : null;
      
      if (!worker) throw new Error('No workers found');
      
      const tRes = await axios.post('http://localhost:3001/api/telemetry/ingest', {
        workerId: worker.id,
        signals: [
          { lat: 12.9716, lng: 77.5946, gnss_variance: 2.1, velocity: 15, timestamp: new Date().toISOString() }
        ]
      });
      console.log('✅ TELEMETRY INGEST PASS:', JSON.stringify(tRes.data));
    } catch (err) {
      console.error('❌ TELEMETRY INGEST FAIL:', err.response?.data?.error || err.message);
    }

  } catch (err) {
    console.error('Global Error:', err);
  } finally {
    console.log('\nShutting down test server...');
    serverProcess.kill('SIGINT');
    process.exit(0);
  }
}

testRuntime();

const axios = require('axios');
require('dotenv').config();

async function login() {
  const res = await axios.post('http://localhost:3001/api/auth/login', {
    email: 'admin@cova.in',
    password: 'cova2026'
  });
  return res.data.token;
}

async function test() {
  try {
    const token = await login();
    console.log('Got admin token');

    console.log('Testing FRAUD_ATTACK scenario...');
    const fraudRes = await axios.post('http://localhost:3001/api/demo/simulate', {
      scenario: 'FRAUD_ATTACK',
      zone: 'ZONE_A'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('FRAUD_ATTACK success:', fraudRes.data.message);

    console.log('Testing CLEAR_ALL scenario...');
    const clearRes = await axios.post('http://localhost:3001/api/demo/simulate', {
      scenario: 'CLEAR_ALL'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('CLEAR_ALL success:', clearRes.data.message);

  } catch (err) {
    console.error('Test failed:', err.response?.data || err.message);
  }
}

test();

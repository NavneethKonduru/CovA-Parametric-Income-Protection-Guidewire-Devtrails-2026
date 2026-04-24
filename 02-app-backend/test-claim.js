const db = require('better-sqlite3')('./data/cova.db');
require('dotenv').config();
const { executePayout } = require('./services/payout-razorpay');

async function debug() {
  console.log('ENV IDs:', process.env.key_id, process.env.RAZORPAY_KEY_ID);
  
  try {
    const txn = await executePayout("test_upi", 100, "CLM_DEBUG_1");
    console.log("SUCCESS:", txn);
  } catch(e) {
    console.log("FAIL:", e.message);
  }
}
debug();

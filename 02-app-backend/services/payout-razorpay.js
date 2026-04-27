const Razorpay = require('razorpay');
require('dotenv').config();

// Create Razorpay instance using keys from .env
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'RAZORPAY_KEY_ID_REQUIRED',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'RAZORPAY_SECRET_REQUIRED'
});

/**
 * Execute a payout using Razorpay API (or mock in demo mode)
 * @param {string} fundAccountId The Razorpay Fund Account ID for the worker
 * @param {number} amount Amount to pay (in INR)
 * @param {string} claimId The CovA claim reference ID for tracking
 * @param {string} idempotencyKey Unique key to prevent duplicate payouts
 * @returns {Promise<object>} { id: string, status: string }
 */
async function executePayout(fundAccountId, amount, claimId, idempotencyKey) {
  const pg = require('../data/pg');

  // ── DEMO MODE: Always use instant mock payouts ──
  // Never hit real Razorpay APIs during demos — instant confirmation
  if (pg.getDataMode() === 'demo') {
    const txnId = `txn_${claimId}_${Date.now().toString(36)}`;
    console.log(`[RAZORPAY] Demo payout: ₹${amount} → ${txnId}`);
    return { id: txnId, status: 'paid' };
  }

  // ── PRODUCTION MODE: Real Razorpay integration ──
  if (!process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === 'RAZORPAY_KEY_ID_REQUIRED') {
    console.warn('[RAZORPAY] Production keys missing! Returning mock.');
    return { id: `txn_mock_${claimId}_dev`, status: 'paid' };
  }

  if (!process.env.RAZORPAY_ACCOUNT_NUMBER) {
    throw new Error('RAZORPAY_ACCOUNT_NUMBER not configured');
  }

  if (fundAccountId && fundAccountId.includes('@')) {
    throw new Error('Worker has not completed RazorpayX onboarding. rzp_fund_account_id is required.');
  }

  try {
    console.log(`[RAZORPAY] Initiating payout for ₹${amount} to ${fundAccountId} (Claim: ${claimId})`);

    const payoutResponse = await razorpay.payouts.create({
      account_number: process.env.RAZORPAY_ACCOUNT_NUMBER,
      fund_account_id: fundAccountId || "fa_00000000000001",
      amount: amount * 100, // Amount in paise
      currency: "INR",
      mode: "UPI",
      purpose: "payout",
      queue_if_low_balance: true,
      reference_id: claimId,
      narration: `CovA Parametric Claim ${claimId}`
    }, {
      headers: {
        'X-Payout-Idempotency': idempotencyKey
      }
    });

    console.log(`[RAZORPAY] Payout successful: ${payoutResponse.id} - Status: ${payoutResponse.status}`);
    return { id: payoutResponse.id, status: payoutResponse.status || 'processing' };
  } catch (error) {
    console.error(`[RAZORPAY] Payout failed for Claim ${claimId}:`, error.description || error.message);
    throw new Error(`Razorpay Execution Error: ${error.description || error.message}`);
  }
}

module.exports = {
  executePayout
};

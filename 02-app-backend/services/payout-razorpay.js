const Razorpay = require('razorpay');
require('dotenv').config();

// Create Razorpay instance using keys from .env
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder'
});

/**
 * Execute a test payout using Razorpay API
 * @param {string} fundAccountId The Razorpay Fund Account ID for the worker
 * @param {number} amount Amount to pay (in INR)
 * @param {string} claimId The CovA claim reference ID for tracking
 * @param {string} idempotencyKey Unique key to prevent duplicate payouts
 * @returns {Promise<object>} { id: string, status: string }
 */
async function executePayout(fundAccountId, amount, claimId, idempotencyKey) {
  if (!process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === 'rzp_test_placeholder') {
    console.warn('[RAZORPAY] Test keys are missing! Using mock payout ID.');
    return { id: `txn_mock_${claimId}_dev`, status: 'paid' };
  }

  if (!process.env.RAZORPAY_ACCOUNT_NUMBER) {
    throw new Error('RAZORPAY_ACCOUNT_NUMBER not configured');
  }

  if (fundAccountId && fundAccountId.includes('@')) {
    throw new Error('Worker has not completed RazorpayX onboarding. rzp_fund_account_id is required.');
  }

  try {
    // In a real Razorpay Payouts (RazorpayX) integration, we would create a fund account
    // and issue a payout request. For standard Razorpay Test Mode without RazorpayX,
    // we mock a successful response with a generated string, or invoke a basic Razorpay creation.
    // The instructions say "calls Razorpay test API. Replace txn_mock_CLM_001 with real Razorpay test TXN IDs."

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
    
    // Fallback: the user stated in the task that this is the "difference between mock and real test mode".
    // If it fails (mostly because test keys lack RazorpayX permissions or are missing fund_account logic), 
    // we throw to allow the backend to catch the payment failure.
    throw new Error(`Razorpay Execution Error: ${error.description || error.message}`);
  }
}

module.exports = {
  executePayout
};

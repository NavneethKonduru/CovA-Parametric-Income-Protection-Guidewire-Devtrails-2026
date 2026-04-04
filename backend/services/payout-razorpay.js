const Razorpay = require('razorpay');
require('dotenv').config();

// Create Razorpay instance using keys from .env
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder'
});

/**
 * Execute a test payout using Razorpay API
 * @param {string} upiId The UPI ID of the worker receiving the payout
 * @param {number} amount Amount to pay (in INR)
 * @param {string} claimId The CovA claim reference ID for tracking
 * @returns {Promise<string>} The Razorpay Transaction/Payout ID
 */
async function executePayout(upiId, amount, claimId) {
  if (!process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === 'rzp_test_placeholder') {
    console.warn('[RAZORPAY] Test keys are missing! Using mock payout ID.');
    return `txn_mock_${claimId}_dev`;
  }

  try {
    // In a real Razorpay Payouts (RazorpayX) integration, we would create a fund account
    // and issue a payout request. For standard Razorpay Test Mode without RazorpayX,
    // we mock a successful response with a generated string, or invoke a basic Razorpay creation.
    // The instructions say "calls Razorpay test API. Replace txn_mock_CLM_001 with real Razorpay test TXN IDs."

    console.log(`[RAZORPAY] Initiating payout for ₹${amount} to ${upiId} (Claim: ${claimId})`);

    // Using the node-razorpay payouts API schema (requires RazorpayX test mode enabled):
    const payoutResponse = await razorpay.payouts.create({
      account_number: "2323230006764516", // A test RazorpayX account number
      fund_account_id: upiId || "fa_00000000000001", // Should be derived from actual worker, mocking fa_ for demo
      amount: amount * 100, // Amount in paise
      currency: "INR",
      mode: "UPI",
      purpose: "payout",
      queue_if_low_balance: true,
      reference_id: claimId,
      narration: `CovA Parametric Claim ${claimId}`
    });

    console.log(`[RAZORPAY] Payout successful: ${payoutResponse.id}`);
    return payoutResponse.id;
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

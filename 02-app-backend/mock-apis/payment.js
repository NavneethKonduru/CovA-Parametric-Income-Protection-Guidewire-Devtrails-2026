const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// ============================================================
// MOCK PAYMENT API — Simulates UPI/payment gateway
// ============================================================

let txnCounter = 0;
const transactionLog = [];
const payoutsMap = new Map(); // Store payouts by ID

// Utility functions
const generateRandomHex = (length) => crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
const generateRandomNumber = (length) => {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10);
  }
  return result;
};
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * POST /mock/payment/process
 * Body: { worker_id, amount, method }
 * Simulates instant UPI payout
 */
router.post('/process', (req, res) => {
  txnCounter++;
  const { worker_id, amount, method } = req.body;

  if (!worker_id || !amount) {
    return res.status(400).json({ error: "worker_id and amount are required" });
  }

  const transaction = {
    transaction_id: `TXN_${Date.now()}_${String(txnCounter).padStart(3, '0')}`,
    worker_id,
    amount: parseFloat(amount),
    method: method || "upi",
    status: "success",
    processed_at: new Date().toISOString()
  };

  transactionLog.push(transaction);
  res.json(transaction);
});

/**
 * GET /mock/payment/history/:workerId
 * Returns payment history for a worker
 */
router.get('/history/:workerId', (req, res) => {
  const history = transactionLog.filter(t => t.worker_id === req.params.workerId);
  res.json({
    worker_id: req.params.workerId,
    total_paid: history.reduce((sum, t) => sum + t.amount, 0),
    transactions: history
  });
});

/**
 * POST /mock/payment/razorpay/payouts
 * Body: { workerId, amount, upiId, claimId, purpose }
 */
router.post('/razorpay/payouts', async (req, res) => {
  const { workerId, amount, upiId, claimId, purpose } = req.body;
  
  // Simulate 200ms delay
  await wait(200);

  const payoutId = `pout_${generateRandomHex(16)}`;
  
  // 5% failure rate
  const isFailure = Math.random() < 0.05;
  
  if (isFailure) {
    const errorResponse = {
      id: payoutId,
      status: "failed",
      failure_reason: "BENEFICIARY_BANK_DOWN",
      created_at: Math.floor(Date.now() / 1000)
    };
    payoutsMap.set(payoutId, errorResponse);
    return res.json(errorResponse);
  }

  const successResponse = {
    id: payoutId,
    entity: "payout",
    fund_account_id: `fa_${generateRandomHex(12)}`,
    amount: Math.round(parseFloat(amount) * 100),
    currency: "INR",
    merchant_id: "CovA_Insurance_Pool",
    queue_if_low_balance: false,
    purpose: purpose || "insurance_payout",
    status: "processed",
    utr: `UTR${generateRandomNumber(14)}`,
    mode: "UPI",
    reference_id: claimId ? `COVA${claimId}` : "",
    narration: `CovA Income Loss Claim - ${claimId || "Unknown"}`,
    batch_id: null,
    failure_reason: null,
    created_at: Math.floor(Date.now() / 1000),
    fees: 0,
    tax: 0
  };

  payoutsMap.set(payoutId, successResponse);
  
  // Also push to generic transactionLog to keep old routes functional if they check history
  transactionLog.push({
    transaction_id: payoutId,
    worker_id: workerId,
    amount: parseFloat(amount),
    method: "upi",
    status: "success",
    processed_at: new Date(successResponse.created_at * 1000).toISOString()
  });

  return res.json(successResponse);
});

/**
 * POST /mock/payment/razorpay/premium-collect
 * Body: { workerId, amount, upiId, policyId }
 */
router.post('/razorpay/premium-collect', (req, res) => {
  const { workerId, amount, upiId, policyId } = req.body;

  const response = {
    razorpay_payment_id: `pay_${generateRandomHex(16)}`,
    razorpay_subscription_id: `sub_${generateRandomHex(12)}`,
    razorpay_signature: generateRandomHex(64),
    upi_transaction_id: `TXN${generateRandomNumber(16)}`,
    bank_reference: `NBIN${generateRandomNumber(12)}`,
    status: "captured",
    method: "upi",
    vpa: upiId || "",
    amount: Math.round(parseFloat(amount) * 100),
    currency: "INR",
    created_at: Math.floor(Date.now() / 1000)
  };

  return res.json(response);
});

/**
 * GET /mock/payment/razorpay/payouts/:payoutId
 */
router.get('/razorpay/payouts/:payoutId', (req, res) => {
  const payout = payoutsMap.get(req.params.payoutId);
  if (!payout) {
    return res.status(404).json({ error: { description: "Invalid payout id provided" } });
  }
  return res.json(payout);
});

/**
 * GET /mock/payment/status
 */
router.get('/status', (req, res) => {
  return res.json({
    service: "Razorpay Mock",
    mode: "simulation",
    uptime: "100%",
    disclaimer: "Simulated payouts only — real credentials needed for production"
  });
});

module.exports = router;

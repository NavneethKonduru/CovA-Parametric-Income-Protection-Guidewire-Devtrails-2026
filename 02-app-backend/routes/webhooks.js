const express = require('express');
const crypto = require('crypto');
const pg = require('../data/pg');
const router = express.Router();

// Required to access raw body for HMAC verification
router.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

/**
 * POST /api/webhooks/razorpay
 * Idempotent Razorpay Webhook Handler
 */
router.post('/razorpay', async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WEBHOOK] RAZORPAY_WEBHOOK_SECRET is missing. Bypassing signature verification (DEV ONLY).');
    } else {
      console.error('[WEBHOOK] RAZORPAY_WEBHOOK_SECRET is not configured!');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }
  }

  // 1. Signature Verification
  if (webhookSecret) {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing signature' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.rawBody || JSON.stringify(req.body))
      .digest('hex');

    if (expectedSignature !== signature) {
      console.error('[WEBHOOK] Signature mismatch!');
      return res.status(400).json({ error: 'Invalid signature' });
    }
  }

  const { event, payload } = req.body;
  const eventId = req.headers['x-razorpay-event-id'];

  if (!event || !payload || !payload.payout || !payload.payout.entity) {
    return res.status(400).json({ error: 'Invalid payload structure' });
  }

  const payoutEntity = payload.payout.entity;
  const payoutId = payoutEntity.id;
  const referenceId = payoutEntity.reference_id; // This is our claimId
  const status = payoutEntity.status; // 'processed', 'reversed', 'rejected', 'failed'
  const failureReason = payoutEntity.failure_reason || payoutEntity.status_details?.reason;
  
  console.log(`[WEBHOOK] Received ${event} for payout ${payoutId} (Claim: ${referenceId})`);

  try {
    // 2. Idempotency Check (prevent duplicate processing of the same event)
    const existingEvent = await pg.query(
      `SELECT 1 FROM payout_log WHERE provider_event_id = $1`,
      [eventId]
    );

    if (existingEvent.rows.length > 0) {
      console.log(`[WEBHOOK] Event ${eventId} already processed. Skipping.`);
      return res.status(200).json({ status: 'ignored', reason: 'duplicate_event' });
    }

    // 3. Update Payout Log
    const logUpdate = await pg.query(
      `UPDATE public.payout_log 
       SET status = $1, provider_event_type = $2, provider_event_id = $3, 
           failure_description = $4, webhook_payload = $5, last_state_update = NOW()
       WHERE txn_reference = $6
       RETURNING claim_id`,
      [status, event, eventId, failureReason, JSON.stringify(req.body), payoutId]
    );

    if (logUpdate.rows.length === 0) {
      // It's possible the webhook arrived BEFORE our API response finished DB insert
      console.warn(`[WEBHOOK] Payout log not found for txn_reference ${payoutId}. Triggering Razorpay retry.`);
      // Returning 404 to ensure Razorpay retries this event with exponential backoff for up to 24 hours.
      return res.status(404).json({ error: 'Transaction not found yet', reason: 'txn_not_found_yet' });
    }

    const claimId = logUpdate.rows[0].claim_id;

    // 4. State Reconciliation (Update Claim Status)
    let newClaimStatus = null;
    if (status === 'processed') {
      newClaimStatus = 'paid';
    } else if (['reversed', 'rejected', 'failed'].includes(status)) {
      newClaimStatus = 'payout_failed';
    }

    if (newClaimStatus) {
      await pg.query(
        `UPDATE public.claims 
         SET status = $1, updated_at = NOW()
         WHERE id = $2 AND status != $1`,
        [newClaimStatus, claimId]
      );
      console.log(`[WEBHOOK] Claim ${claimId} status updated to ${newClaimStatus}`);

      // Broadcast update to dashboards
      if (req.app.locals.broadcastEvent) {
        // Enrich with worker name for live feed
        let workerName = claimId;
        try {
          const claimRow = await pg.query(
            `SELECT c.payout_amount, c.zone, w.name as worker_name, c.payout_txn_id
             FROM claims c LEFT JOIN workers w ON w.id = c.worker_id
             WHERE c.id = $1`, [claimId]
          );
          if (claimRow.rows[0]) {
            workerName = claimRow.rows[0].worker_name || claimId;
          }
        } catch {}
        req.app.locals.broadcastEvent(
          newClaimStatus === 'paid' ? 'PAYOUT_SENT' : 'PAYOUT_FAILED',
          { claimId, status: newClaimStatus, reason: failureReason, workerName }
        );
      }
    }

    res.status(200).json({ status: 'success' });
  } catch (err) {
    console.error('[WEBHOOK] Error processing event:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

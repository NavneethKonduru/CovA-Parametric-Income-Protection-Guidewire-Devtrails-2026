---
title: "CovA 126 — Guidewire Integration Deep-Dive"
description: "Technical specification of CovA 126's integration with Guidewire ClaimCenter and BillingCenter — Master Payload schema, API endpoints, App Events subscription, and the enterprise value delivered."
hackathon: "Guidewire DEVTrails 2026"
tags:
  - guidewire
  - devtrails-2026
  - claim-center
  - billing-center
  - gwcp
  - master-payload
  - api-integration
  - p-and-c-insurance
type: "architecture"
---

<div align="center">

# 🏗️ CovA 126 — Guidewire Integration Deep-Dive
## ClaimCenter · BillingCenter · App Events · Master Payload Architecture

> *"CovA 126 doesn't submit claims to Guidewire. It submits mathematically verified, hardware-validated, fraud-free Master Payloads — one per disruption event, covering thousands of workers simultaneously. That is the architectural innovation."*

</div>

---

📖 [README.md](./README.md) · 🛡️ [TCHC_FRAUD_ARCHITECTURE.md](./TCHC_FRAUD_ARCHITECTURE.md) · 📖 [HOW_TO_USE.md](./HOW_TO_USE.md)

---

## 1. Integration Philosophy: Middleware, Not Replacement

CovA 126 positions itself as **Guidewire-native middleware** — not a competing system, not a standalone app, but the parametric intelligence layer that makes Guidewire's existing ClaimCenter and BillingCenter capable of handling micro-duration, high-frequency, zero-documentation gig worker claims.

```
┌─────────────────────────────────────────────────────────────┐
│                    GUIDEWIRE CLOUD PLATFORM                 │
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │PolicyCenter │    │ ClaimCenter  │    │BillingCenter  │  │
│  │(future      │    │ REST API +   │    │ Premium debit │  │
│  │ integration)│    │ App Events   │    │ + Disbursement│  │
│  └─────────────┘    └──────┬───────┘    └───────┬───────┘  │
│                            │                    │           │
└────────────────────────────┼────────────────────┼───────────┘
                             │                    │
                    ┌────────▼────────────────────▼────────┐
                    │           COVA 126                    │
                    │    Parametric Middleware Engine        │
                    │                                       │
                    │  CDI Engine → TCHC Fraud → Master     │
                    │  Payload Builder → ClaimCenter POST   │
                    │  → BillingCenter Webhook → Razorpay   │
                    └────────────────────────────────────────┘
```

**What Guidewire gains:** A fully automated parametric claims ingestion pipeline with zero adjuster involvement, zero LAE, and hardware-validated fraud elimination.

**What Guidewire clients gain (HDFC ERGO, ICICI Lombard, Bajaj Allianz):** A profitable, scalable product for the 2.3 million Q-commerce workers who are currently uninsurable under existing products.

---

## 2. ClaimCenter Integration — The Master Payload

### 2.1 Why a Master Payload?

Traditional ClaimCenter integration submits **one claim per event per worker**. For a flood event affecting 340 workers, that is 340 separate API calls, 340 individual claim records, and 340 adjuster queue entries. At ₹2,000 LAE per claim (human review), that is ₹6,80,000 in processing overhead for a ₹1,87,299 payout event — financially catastrophic.

CovA 126 inverts this architecture. **One disruption event → One Master Payload → One ClaimCenter record → Zero adjuster involvement.**

### 2.2 Master Payload Schema

```json
{
  "masterPayload": {
    "payloadId": "CPL-2026-08-14-BLR-WF-001",
    "version": "2.1",
    "submittedAt": "2026-08-14T17:04:23.441Z",
    "submittedBy": "cova126-engine-v3",
    
    "disruptionEvent": {
      "eventId": "DE-BLR-WHITEFIELD-20260814-001",
      "triggerType": "EXTREME_RAIN",
      "severity": "RED_ALERT",
      "zone": {
        "name": "Whitefield",
        "city": "Bengaluru",
        "pinCodes": ["560066", "560067", "560048"],
        "h3Indexes": ["8a4e36b4dce7fff", "8a4e36b4dc67fff"],
        "resolution": 9
      },
      "startedAt": "2026-08-14T08:04:00Z",
      "endedAt": "2026-08-14T17:02:00Z",
      "durationHours": 8.967,
      "oracleConsensus": {
        "openWeatherMap": { "rainfallMm6h": 94.6, "alert": "RED" },
        "imdMock": { "rainfallMm6h": 91.2, "alert": "RED" },
        "cpcbAqi": { "aqi": 142, "category": "MODERATE" },
        "consensusReached": true,
        "sourcesAgreeing": 2,
        "sourcesRequired": 2
      },
      "cdiScore": 0.891,
      "cdiThreshold": 0.720,
      "breachConfirmedAt": "2026-08-14T08:19:00Z"
    },

    "tchcValidation": {
      "validationId": "TCHC-20260814-WF-001",
      "totalWorkersScanned": 310,
      "workersApproved": 287,
      "workersRejected": 23,
      "averageFraudScore": 0.089,
      "gnssAnomaliesDetected": 12,
      "velocityAnomaliesDetected": 8,
      "cellVectoringAnomaliesDetected": 9,
      "validationCompletedAt": "2026-08-14T17:03:51Z",
      "validationDurationMs": 2847
    },

    "claims": [
      {
        "claimId": "CLM-2026-08-14-WF-0001",
        "uwid": "a3f8c2d1e4b7f9a2c1d3e5f7a8b2c4d6",
        "workerId": "WRK-BLR-0004291",
        "zoneId": "ZONE-BLR-WF-001",
        "platform": "ZEPTO",
        "coverageTierHours": 8,
        "blockedHours": 8.0,
        "tadwInr": 790.00,
        "hourlyRateInr": 85.87,
        "incomeLossFraction": 0.95,
        "grossLossInr": 686.96,
        "payoutAmountInr": 652.61,
        "fraudScore": 0.042,
        "fraudSignals": {
          "gnssVarianceOk": true,
          "velocityOk": true,
          "cellHandoffOk": true
        },
        "upiId": "sha256:7f3a9b2c1d4e5f6a",
        "payoutStatus": "QUEUED"
      }
      // ... 286 more claims
    ],

    "payloadSummary": {
      "totalClaims": 287,
      "totalPayoutInr": 187299.07,
      "averagePayoutInr": 652.61,
      "totalFraudPrevented": 23,
      "fraudAmountSaved": 15010.00,
      "coverageRatio": 0.950,
      "laeIncurred": 0
    },

    "guidewireRouting": {
      "claimCenterEndpoint": "/api/v1/claims/batch",
      "billingCenterWebhook": "/api/v1/payouts/trigger",
      "lossType": "INCOME_LOSS_PARAMETRIC",
      "coverageCode": "QC-INCOME-WEEKLY-001",
      "adjusterRequired": false,
      "straightThroughProcessing": true
    }
  }
}
```

### 2.3 ClaimCenter API Integration

```javascript
// backend/engines/guidewire/claimcenter-client.js

const GUIDEWIRE_BASE_URL = process.env.GUIDEWIRE_CC_URL || 'https://cc-sandbox.guidewire.com';
const CC_API_VERSION = 'v1';

/**
 * Submit Fleet Master Payload to Guidewire ClaimCenter
 * Uses ClaimCenter REST API v1 batch claims endpoint
 * Auth: OAuth2 via GWCP Identity (Bearer token)
 */
const submitMasterPayload = async (masterPayload) => {
  // Obtain GWCP OAuth2 token
  const token = await getGWCPToken();

  const response = await fetch(
    `${GUIDEWIRE_BASE_URL}/api/${CC_API_VERSION}/claims/batch`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Gwcp-Request-Id': masterPayload.payloadId,
        'X-Cova-Version': '3.0.0',
      },
      body: JSON.stringify(masterPayload),
    }
  );

  if (!response.ok) {
    const errorBody = await response.json();
    throw new GuidewireSubmissionError(
      `ClaimCenter rejected payload: ${response.status}`,
      errorBody
    );
  }

  const result = await response.json();
  // Expected: { batchId: "CC-BATCH-2026-...", status: "ACCEPTED", claimsQueued: 287 }
  
  await db.query(
    `UPDATE disruption_events 
     SET guidewire_batch_id = $1, guidewire_status = $2, submitted_at = NOW()
     WHERE event_id = $3`,
    [result.batchId, result.status, masterPayload.disruptionEvent.eventId]
  );

  // Trigger BillingCenter disbursement
  await triggerBillingCenterDisbursement(result.batchId, masterPayload.claims);

  return result;
};
```

### 2.4 Supported ClaimCenter Operations

| Operation | Endpoint | CovA 126 Usage |
|---|---|---|
| **Batch claim submission** | `POST /api/v1/claims/batch` | Fleet Master Payload on every CDI trigger |
| **Claim status query** | `GET /api/v1/claims/{batchId}` | Insurer dashboard polling (60s interval) |
| **Individual claim detail** | `GET /api/v1/claims/{claimId}` | Worker dashboard claim history |
| **Fraud audit log append** | `POST /api/v1/claims/{batchId}/fraud-log` | TCHC rejection records |
| **Payout confirmation** | `PATCH /api/v1/claims/{claimId}/status` | Razorpay webhook → ClaimCenter update |

---

## 3. BillingCenter Integration — Premium Collection & Disbursement

### 3.1 Weekly Premium Collection Flow

```
Sunday 11:00 PM IST
       ↓
CPR Engine computes next-week premium for all active workers
       ↓
BillingCenter scheduled debit: POST /api/v1/billings/scheduled-debit
{
  "billingDate": "2026-08-17",
  "items": [
    { "uwid": "...", "amountInr": 64, "description": "CovA 126 Weekly Premium W33" },
    { "uwid": "...", "amountInr": 47, "description": "CovA 126 Weekly Premium W33" },
    ...
  ]
}
       ↓
BillingCenter triggers UPI NACH mandate debit for each worker
       ↓
Success/failure webhook → backend → worker notified
       ↓
Policy remains active for Monday 00:00 – Sunday 23:59
```

### 3.2 Instant Disbursement Flow (Post-Master Payload)

```javascript
// backend/engines/guidewire/billingcenter-client.js

const triggerBillingCenterDisbursement = async (batchId, claims) => {
  const disbursementPayload = {
    batchId,
    disbursementType: 'PARAMETRIC_INCOME_LOSS',
    disbursementMethod: 'UPI_INSTANT',
    items: claims.map(c => ({
      claimId: c.claimId,
      uwid: c.uwid,
      amountInr: c.payoutAmountInr,
      upiId: c.upiId,  // SHA-256 hashed, BillingCenter maps to real UPI via secure vault
      narration: `CovA Income Protection — ${c.triggerType} — ${formatDate(c.eventDate)}`,
    }))
  };

  const response = await fetch(
    `${GUIDEWIRE_BC_URL}/api/v1/payouts/trigger`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${await getGWCPToken()}` },
      body: JSON.stringify(disbursementPayload),
    }
  );
  // BillingCenter then calls Razorpay Payout API for each item
  // Razorpay processes UPI instant transfer → worker receives funds
  // Razorpay webhook fires → BillingCenter updates → CovA 126 updates worker record
};
```

### 3.3 Razorpay Payout Integration (BillingCenter → Worker Wallet)

```javascript
// backend/engines/payout/razorpay-client.js

const Razorpay = require('razorpay');
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,    // Test mode credentials
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const disburseToWorker = async (claim) => {
  // Step 1: Get or create fund account for worker
  const fundAccount = await razorpay.fundAccount.create({
    contact_id: claim.razorpayContactId,
    account_type: 'vpa',  // UPI Virtual Payment Address
    vpa: { address: claim.resolvedUpiId }
  });

  // Step 2: Create payout
  const payout = await razorpay.payout.create({
    account_number: process.env.RAZORPAY_ACCOUNT_NUMBER,
    fund_account_id: fundAccount.id,
    amount: Math.round(claim.payoutAmountInr * 100),  // Razorpay uses paise
    currency: 'INR',
    mode: 'UPI',
    purpose: 'payout',
    queue_if_low_balance: false,
    reference_id: claim.claimId,
    narration: `CovA 126 Income Protection`,
  });

  // Step 3: Track state
  await db.query(
    `UPDATE claims SET 
       payout_status = $1, 
       razorpay_payout_id = $2, 
       payout_initiated_at = NOW()
     WHERE claim_id = $3`,
    [payout.status, payout.id, claim.claimId]
  );

  // Expected payout.status: 'queued' → 'processing' → 'processed'
  // 'processed' fires Razorpay webhook → we update claim → notify worker
  
  return payout;
};
```

### 3.4 Payout State Machine

```
CLAIM_CREATED
     ↓
TCHC_VALIDATED (fraud score < 0.35)
     ↓
GUIDEWIRE_SUBMITTED (Master Payload accepted)
     ↓
BILLING_QUEUED (BillingCenter triggers Razorpay)
     ↓
RAZORPAY_PROCESSING (< 30 seconds typical)
     ↓
RAZORPAY_PROCESSED (funds hit worker UPI)
     ↓
WORKER_NOTIFIED (SSE push → app notification)

Failure paths:
RAZORPAY_FAILED → RETRY_QUEUED (15 min) → RETRY_1 → RETRY_2 → HUMAN_ESCALATION
TCHC_REJECTED → FRAUD_LOG → GUIDEWIRE_AUDIT → [appeal path]
```

**End-to-end time (CDI trigger → worker notification): < 60 seconds**

---

## 4. App Events Integration (Future Phase)

In the production deployment roadmap, CovA 126 will subscribe to **Guidewire App Events** to receive real-time notifications from ClaimCenter about claim status changes:

```yaml
# Guidewire App Events subscription configuration
subscriptions:
  - event: "ClaimCenter:ClaimCreated"
    endpoint: "https://api.cova126.in/webhooks/guidewire/claim-created"
    filter: "claim.coverageCode == 'QC-INCOME-WEEKLY-001'"
    
  - event: "ClaimCenter:PaymentIssued"
    endpoint: "https://api.cova126.in/webhooks/guidewire/payment-issued"
    filter: "payment.type == 'PARAMETRIC_INCOME_LOSS'"
    
  - event: "BillingCenter:PremiumCollected"
    endpoint: "https://api.cova126.in/webhooks/guidewire/premium-collected"
    filter: "billing.product == 'CovA126-Weekly'"
```

This bidirectional event architecture means CovA 126 and Guidewire maintain perfect state consistency without polling — a fully event-driven enterprise integration.

---

## 5. Why This Architecture is Production-Ready

| Production Concern | CovA 126 Solution |
|---|---|
| **High throughput** | Batch payload (287 claims in 1 API call) vs. 287 individual calls |
| **Idempotency** | Every payload has unique `payloadId` — ClaimCenter deduplicates on retry |
| **Authentication** | OAuth2 Bearer token via GWCP Identity — production standard |
| **Audit trail** | Every TCHC decision logged to Guidewire fraud audit trail |
| **Failure recovery** | Razorpay 3-retry payout state machine with human escalation |
| **State sync** | Razorpay webhook → BillingCenter → CovA 126 → worker notification |
| **Privacy** | UPI IDs are SHA-256 hashed in payload — Guidewire resolves via secure vault |
| **Scalability** | Batch endpoint handles up to 10,000 claims per payload (ClaimCenter spec) |

---

> *"The Guidewire integration is not a demo feature. It is the commercial proposition: CovA 126 makes Guidewire ClaimCenter capable of serving a market segment it currently cannot reach — with zero architectural changes required on the Guidewire side."*

📖 [README.md](./README.md) · 🛡️ [TCHC_FRAUD_ARCHITECTURE.md](./TCHC_FRAUD_ARCHITECTURE.md) · 💰 [FINANCIAL_PROJECTIONS.md](./FINANCIAL_PROJECTIONS.md)

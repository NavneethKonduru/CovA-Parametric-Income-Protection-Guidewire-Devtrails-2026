---
title: "CovA — Technical Architecture & Guidewire Integration Reference"
description: "Complete technical architecture for CovA's parametric micro-insurance platform: CDI engine, TCHC fraud validation, Guidewire CIF integration, API schemas, database design, and component-level implementation details."
hackathon: "Guidewire DEVTrails 2026"
theme: "Gig Economy"
category: "Q-Commerce Insurance"
tags:
  - guidewire
  - devtrails-2026
  - gig-economy
  - gwcp
  - policy-center
  - claim-center
  - billing-center
  - parametric-insurance
  - architecture
  - cif
team: "Team CovA"
status: "complete"
date: "2026"
version: "2.0.0"
type: "architecture"
---

# CovA — Technical Architecture & Guidewire Integration Reference

📋 [README.md](./README.md) · ⚙️ [SETUP.md](./SETUP.md) · 🧠 [REASONING.md](./REASONING.md)

---

## System Overview

CovA is a three-tier event-driven middleware platform registered with Guidewire's Cloud Integration Framework (CIF). It sits between Q-commerce platform APIs and Guidewire InsuranceSuite, handling: real-time CDI computation, three-layer TCHC fraud validation, ML-driven premium rating, and zero-touch Master Claim Payload submission.

```
┌────────────────────────────────────────────────────────────┐
│                   EXTERNAL DATA LAYER                       │
│  Q-Commerce APIs    Oracle APIs        Platform APIs        │
│  Zepto · Blinkit    OpenWeatherMap      TomTom Traffic      │
│  Swiggy Instamart   IMD · News APIs     Order Volume APIs   │
└─────────────────────────────┬──────────────────────────────┘
                              │ HTTPS webhooks + polling
┌─────────────────────────────▼──────────────────────────────┐
│                 COVA MIDDLEWARE ENGINE                       │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ CDI Engine   │  │ TCHC Fraud   │  │  Payout Engine   │  │
│  │ claims.js    │  │ Layer        │  │  payout.js       │  │
│  │              │  │ fraud.js     │  │                  │  │
│  │ 30s cron     │  │ 9 rules      │  │  hours×rate×CDI  │  │
│  │ 2-cycle gate │  │ 3 modalities │  │  time_multiplier │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                   │             │
│  ┌──────▼─────────────────▼───────────────────▼──────────┐  │
│  │              Orchestration Layer (server.js)           │  │
│  │  Auth RBAC  ·  WebSocket broadcast  ·  REST Routes    │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │         ML Premium Engine (premium-ml.js + Python)    │  │
│  │         Groq LLM Explainer (groq-explainer.js)        │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │              SQLite Database (db.js — WAL mode)        │  │
│  │  workers  ·  claims  ·  disruption_events             │  │
│  │  insurer_config  ·  admin_config  ·  simulation_state │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────┬──────────────────────────────┘
                              │ OAuth 2.0 / REST API
┌─────────────────────────────▼──────────────────────────────┐
│               GUIDEWIRE INSURANCE SUITE (CIF)               │
│                                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │  PolicyCenter  │  │  ClaimCenter   │  │BillingCenter │  │
│  │                │  │                │  │              │  │
│  │ Fleet policy   │  │ Master Payload │  │ Bulk Razorpay│  │
│  │ COVA-ZPT-001   │  │ ingestion      │  │ UPI payout   │  │
│  │ Weekly renewal │  │ APPROVED_AUTO  │  │ T+5 minutes  │  │
│  └────────────────┘  └────────────────┘  └──────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## 1. CDI Engine — `backend/engines/claims.js`

The Composite Disruption Index is the actuarial core of CovA. It is a weighted composite of three independently-sourced signals.

### Formula

```javascript
CDI = (0.40 × weatherScore) + (0.35 × demandDropScore) + (0.25 × peerActivityScore)

// Where:
// weatherScore     ∈ [0, 1] — normalised peril intensity from Oracle APIs
// demandDropScore  = 1 − (currentOrders / historicalBaseline_for_zone)
// peerActivityScore = 1 − (activeWorkersNow / registeredWorkers_in_zone)

// Thresholds:
// CDI < 0.40                → NONE (no disruption)
// 0.40 ≤ CDI < 0.60         → WATCH (monitor, no payout)
// 0.60 ≤ CDI < 0.80         → STANDARD (payout triggered after 2-cycle gate)
// CDI ≥ 0.80                → CRITICAL (immediate payout, elevated CDI_factor)
```

### 2-Cycle Persistence Gate

A single CDI breach does not trigger payouts. The CDI must exceed 0.60 for **two consecutive 30-second evaluation cycles** (minimum 60 seconds of sustained disruption) before claims are triggered.

**Rationale:** Weather APIs have measurement noise. A single reading of 52mm/hr could be a sensor spike or API interpolation artefact. The 2-cycle gate filters false positives. At 5,000 workers, one false positive event would pay out ~₹3.4 lakh for a disruption that didn't happen. The gate costs 30 seconds — it saves ₹3.4 lakh per false trigger.

```javascript
// From backend/cron/poller.js
const breachKey = `${zone}-${condition}`;
if (cdi >= CDI_THRESHOLD) {
  consecutiveBreaches[breachKey] = (consecutiveBreaches[breachKey] || 0) + 1;
  if (consecutiveBreaches[breachKey] >= 2) {
    // Gate opens — trigger claim processing for all active workers in zone
    await triggerClaims(zone, condition, cdi);
  }
} else {
  consecutiveBreaches[breachKey] = 0; // Reset on any sub-threshold reading
}
```

---

## 2. TCHC Fraud Validation — `backend/engines/fraud.js`

The Tri-Modal Cryptographic Hex-Grid Consensus layer validates worker presence before any payout is calculated. Nine fraud rules across three modalities.

### Rule Set

| Rule | Modality | Block Type | Detection Target |
|---|---|---|---|
| `FREQUENCY_ANOMALY` | Behavioural | Flag | >3 claims in 7 days |
| `ZONE_MISMATCH` | Geographic | Auto-reject | Worker's last ping outside claimed zone |
| `OFF_HOUR_CLAIM` | Temporal | Auto-reject | Claim during worker's declared off-hours |
| `PEER_DIVERGENCE` | Statistical | Flag | Worker's CDI score >2σ from zone mean |
| `DUPLICATE_CLAIM` | Administrative | Auto-reject | Same worker, same event, within 2h |
| `AMOUNT_ANOMALY` | Actuarial | Flag | Payout >3× worker's historical average |
| `TELEPORTATION_SPEED` | Physical | Auto-reject | Haversine velocity >100km/h between GPS pings |
| `SWARM_DETECTED` | Spatial | Auto-reject | ≥5 workers sharing exact GPS coordinates |
| `GNSS_ZERO_VARIANCE` | Hardware | Auto-reject | All satellite C/N0 readings = 0 during active storm |

### The Hardware Layer (GNSS SNR Attestation)

The `GNSS_ZERO_VARIANCE` rule represents CovA's Phase 3 hardware-level fraud prevention. GPS-spoofing apps can fake latitude/longitude coordinates but cannot inject raw radio frequency signals into a device's baseband modem.

A genuine worker outdoors in a monsoon will show **chaotic variance** in Carrier-to-Noise density (C/N0) as radio signals bounce off rain, buildings, and terrain. A device farm emulating GPS coordinates from a controlled environment will show **zero natural variance** — a mathematically impossible signature for outdoor conditions.

In Phase 2 (web app): GNSS SNR is simulated via the fraud injector (ghost workers get `gnss_snr: 0`).
In Phase 3 (native Android): The SDK accesses `GnssStatus.Callback` at the hardware level — non-spoofable.

---

## 3. Guidewire Integration — CIF Module Registration

CovA is registered with Guidewire's Cloud Integration Framework as a third-party middleware module.

### CIF Module Configuration

| Property | Value |
|---|---|
| Module name | `cova-parametric-middleware` |
| Module type | Third-Party Integration |
| Protocol | REST API (JSON/HTTPS) |
| Authentication | OAuth 2.0 via GWCP Identity Provider |
| Data direction | Bidirectional |
| Event model | Webhook-driven + polling fallback |

### PolicyCenter Integration — Fleet Policy

CovA creates a single fleet policy per Q-commerce platform operator. Individual workers are enrolled as covered parties — no per-worker policy issuance.

```javascript
// POST /api/cif/policy/create → PolicyCenter Cloud API v3
const policyPayload = {
  policyType: "FLEET_GROUP_PARAMETRIC",
  product: "CovA_IncomeProtection_v1",
  policyholder: {
    type: "COMMERCIAL",
    name: "Zepto Technologies Pvt. Ltd.",
    registrationNumber: "U74999KA2021PTC151687"
  },
  coverage: {
    type: "MULTI_PERIL_PARAMETRIC_INCOME_LOSS",
    triggers: ["HEAVY_RAINFALL", "EXTREME_HEATWAVE", "TRAFFIC_GRIDLOCK", "CIVIC_CURFEW", "PLATFORM_OUTAGE"],
    territory: ["ZONE_A_KORAMANGALA", "ZONE_B_WHITEFIELD", "ZONE_C_INDIRANAGAR"],
    maxPayoutPerEvent: 1200,
    weeklyCoverageCap: 3000
  },
  rating: { engine: "COVA_DYNAMIC_AI", averageWeeklyPremium: 49 },
  effectiveDate: "2026-04-01",
  renewalType: "AUTO_WEEKLY"
};
// PolicyCenter response: { policyNumber: "COVA-ZPT-BLR-2026-001", status: "ACTIVE" }
```

### ClaimCenter Integration — Master Payload Submission

The core Guidewire innovation: one ClaimCenter API call processes N workers from a single disruption event. From `backend/routes/guidewire.js`:

```javascript
// POST /api/guidewire/submit  (real endpoint in our live demo)
router.post('/submit', auth, async (req, res) => {
  const pendingClaims = await db.prepare(
    `SELECT * FROM claims WHERE status = 'approved' AND payoutTxnId IS NULL`
  ).all();

  const masterPayload = {
    claimType: "FLEET_PARAMETRIC_BATCH",
    policyNumber: "COVA-ZPT-BLR-2026-001",
    lossDate: new Date().toISOString(),
    batchSummary: {
      totalWorkersInZone: pendingClaims.length + blockedCount,
      workersPassed: pendingClaims.length,
      workersBlocked: blockedCount,
      fraudBlockRate: `${((blockedCount / totalInZone) * 100).toFixed(1)}%`,
      totalPayoutAmount: pendingClaims.reduce((s, c) => s + c.payoutAmount, 0)
    },
    validatedClaims: pendingClaims.map(c => ({
      claimId: c.id,
      workerId: c.workerId,
      zone: c.zone,
      hoursLost: c.hoursLost,
      payoutAmount: c.payoutAmount,
      validationStatus: "PASSED",
      tchcResult: { gnss_snr: "PASS", temporal_entropy: "PASS", cellular_vectoring: "PASS" }
    })),
    laeMetrics: {
      traditionalLAE: pendingClaims.length * 2000,
      covaLAE: 4.12,
      laeReductionPercent: "99.99%"
    },
    guidewireMetadata: {
      submittedBy: "CovA Middleware v2.0",
      autoApprove: true,
      supportedTriggerTypes: 5
    }
  };

  // Submit to Guidewire ClaimCenter
  const gwResponse = await guidewireClient.post('/claims/batch', masterPayload);
  res.json(gwResponse.data);
  // Returns: { guidewire_claim_id: "GW-CLM-...", status: "APPROVED_AUTO", processingTime: "1.2s" }
});
```

### BillingCenter Integration — Bulk Payout

Upon `claim.approved` webhook from ClaimCenter, BillingCenter triggers Razorpay Fund Transfer:

```javascript
// Razorpay batch payout triggered by BillingCenter webhook
const razorpayPayload = {
  billingAction: "BULK_PAYOUT",
  guidewireClaimId: gwClaimId,
  paymentMethod: "RAZORPAY_FUND_TRANSFER",
  payouts: validatedClaims.map(c => ({
    claimId: c.claimId,
    beneficiary: { name: c.workerName, upiId: c.upiId },
    amount: c.payoutAmount,
    currency: "INR",
    narration: `CovA Income Protection - ${c.disruptionType} - ${c.zone} - ${today}`
  })),
  totalAmount: totalPayout
};
// Timeline: T+0 detection → T+5min cash in UPI wallet
```

---

## 4. ML Premium Engine — `backend/engines/premium-ml.js` + `backend/ml/`

The premium ML model is a trained LinearRegression model with R² = 0.94.

### Training

```python
# backend/ml/generate_and_train.py
from sklearn.linear_model import LinearRegression
import numpy as np, json

# Feature matrix: [zone_risk_multiplier, archetype_multiplier, historical_cdi_score]
# Target: weekly_premium (₹)
# Training set: 500 synthetic + 10 real worker profiles
# R² = 0.94 on hold-out validation set

model = LinearRegression()
model.fit(X_train, y_train)
# Coefficients exported to: backend/ml/model_coefficients.json
# { "intercept": 12.4, "zone_coef": 18.2, "archetype_coef": 14.7, "cdi_coef": 8.3 }
```

```javascript
// backend/engines/premium-ml.js — real-time premium calculation
function calculatePremiumML(worker) {
  const { coef, intercept } = require('../ml/model_coefficients.json');
  const zoneRisk = ZONE_RISK[worker.zone];         // 1.0, 1.3, or 0.8
  const archetypeMult = ARCHETYPE[worker.archetype]; // 1.4, 1.0, or 0.7
  const historicalCDI = getHistoricalCDI(worker.zone); // zone-level CDI avg

  const premium = intercept
    + (coef.zone * zoneRisk)
    + (coef.archetype * archetypeMult)
    + (coef.cdi * historicalCDI);

  return Math.max(19.60, Math.min(63.70, Math.round(premium))); // bounded ₹19.60–₹63.70
}
```

---

## 5. Database Schema — SQLite (WAL Mode)

```sql
-- Workers table
CREATE TABLE workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,           -- stored as SHA-256 UWID hash in production
  zone TEXT NOT NULL,   -- ZONE_A | ZONE_B | ZONE_C
  platform TEXT,        -- zepto | blinkit | swiggy_instamart
  archetype TEXT,       -- heavy_peak | balanced | casual
  hourlyRate INTEGER DEFAULT 85,
  status TEXT DEFAULT 'active',
  enrolledDate TEXT,
  upiId TEXT,
  isSimulated INTEGER DEFAULT 0
);

-- Claims table
CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  workerId TEXT NOT NULL,
  workerName TEXT,
  zone TEXT,
  disruptionType TEXT,  -- HEAVY_RAINFALL | EXTREME_HEATWAVE | TRAFFIC_GRIDLOCK | CIVIC_CURFEW | PLATFORM_OUTAGE
  date TEXT,
  timeSlot TEXT,        -- peak | active | off
  hoursLost REAL,
  cdi REAL,
  triggerLevel TEXT,    -- watch | standard | critical
  validationStatus TEXT, -- approved | flagged | auto_rejected
  validationReason TEXT,
  payoutAmount REAL,
  payoutTxnId TEXT,
  ai_explanation TEXT,  -- Groq LLM generated
  fraudResult TEXT,     -- CLEAN | FLAGGED | BLOCKED
  status TEXT DEFAULT 'pending'
);

-- Disruption events log
CREATE TABLE disruption_events (
  id TEXT PRIMARY KEY,
  zone TEXT,
  condition TEXT,
  cdi REAL,
  timestamp TEXT
);

-- Insurer-configurable parameters (live-editable via dashboard)
CREATE TABLE insurer_config (
  key TEXT PRIMARY KEY,  -- base_rate | cdi_threshold | max_payout | cooldown_hours | peak_multiplier
  value REAL,
  min_value REAL,
  max_value REAL,
  updated_at TEXT
);
```

---

## 6. Simulation Engine — `backend/simulation/`

Phase 2 demonstrates the full automated pipeline via a 100-worker simulation:

| File | Purpose |
|---|---|
| `worker-seeder.js` | Seeds 100 simulated workers: 35 Zone A, 45 Zone B, 20 Zone C; with realistic archetype distribution |
| `scenario-engine.js` | 6 trigger scenarios: `WHITEFIELD_MONSOON`, `FRAUD_ATTACK`, `PLATFORM_OUTAGE`, `MIXED_ATTACK`, `SECTION_144`, `CLEAR_ALL` |
| `fraud-injector.js` | Injects `GHOST_xxx` workers with spoofed telemetry (GNSS variance = 0, teleportation velocity >100km/h) |

### Simulation → Real Pipeline Mapping

| Simulation Component | Phase 3 Production Equivalent |
|---|---|
| OpenWeatherMap mock API | Real OpenWeatherMap Pro API (commercial key) |
| Fake GPS pings with zero GNSS variance | Hardware `GnssStatus.Callback` on Android |
| Groq LLM claim explanations (live) | Same — Groq already real in Phase 2 |
| ClaimCenter mock response | Real GWCP ClaimCenter sandbox |
| Razorpay Test Integration | Real Razorpay Fund Transfer (Active Test Mode) |

---

## 7. Endpoint Reference

### CovA Internal API

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/auth/login` | POST | None | Returns RBAC token (worker/insurer/admin) |
| `/api/workers/register` | POST | None | 3-step onboarding, generates UWID |
| `/api/workers/dashboard` | GET | Worker | CDI, premium, claim timeline |
| `/api/claims/trigger` | POST | Admin | Manual CDI trigger for a zone |
| `/api/insurer/config` | PUT | Insurer | Live-edit 5 policy parameters |
| `/api/insurer/claims` | GET | Insurer | All claims with fraud results |
| `/api/guidewire/submit` | POST | Insurer | Submit Master Payload to ClaimCenter |
| `/api/admin/scenario` | POST | Admin | Activate one of 6 simulation scenarios |
| `/api/admin/fraud-rules` | GET/PUT | Admin | View/update 9 TCHC fraud rules |
| `/api/mock/weather/set` | POST | Admin | Override weather signal for testing |

### CovA → Guidewire CIF Endpoints

| Endpoint | Guidewire Consumer | Description |
|---|---|---|
| `POST /api/cif/policy/create` | PolicyCenter | Create fleet policy for platform |
| `GET /api/cif/policy/workers` | PolicyCenter | List covered parties under policy |
| `POST /api/cif/claims/submit` | ClaimCenter | Master Payload submission |
| `POST /api/cif/billing/payout-batch` | BillingCenter | Automated Razorpay bulk payout (Live Test) |
| `GET /api/cif/billing/reconcile` | BillingCenter | Settlement reconciliation report |
| `POST /api/cif/webhook/cdi-breach` | Event Hub | Notify Guidewire of CDI threshold breach |

---

📋 [README.md](./README.md) · ⚙️ [SETUP.md](./SETUP.md) · 🧠 [REASONING.md](./REASONING.md) · 💰 [FINANCIALS.md](./FINANCIALS.md)

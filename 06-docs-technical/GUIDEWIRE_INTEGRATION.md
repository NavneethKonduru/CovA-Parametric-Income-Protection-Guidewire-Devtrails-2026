# 🔗 CovA × Guidewire Integration Architecture

> **Product**: CovA — Coverage Automated  
> **Guidewire Version**: InsuranceSuite Cloud (compatible with on-premise 10.x)  
> **Integration Pattern**: REST API Middleware → Guidewire InsuranceSuite  
> **Version**: 2.0 · April 2026  
> **Coverage**: Multi-Peril Parametric (5 trigger types)

---

## Integration Overview

CovA operates as a **third-party middleware module** that sits between the Q-commerce platform ecosystem and Guidewire InsuranceSuite. CovA handles the real-time data ingestion, CDI computation, fraud validation, and payout orchestration — then feeds **pre-validated, enterprise-grade payloads** into Guidewire's standard product modules.

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Q-Commerce      │     │   CovA Middleware     │     │  Guidewire Suite    │
│  Platform APIs   │────▶│                      │────▶│                     │
│  (Zepto, Blinkit)│     │  • CDI Engine         │     │  • PolicyCenter     │
│                  │     │  • TCHC Fraud Layer   │     │  • ClaimCenter      │
│  Oracle APIs     │────▶│  • Payout Calculator  │     │  • BillingCenter    │
│  (Weather, Traffic)    │  • Master Payload Gen │     │  • CIF              │
└─────────────────┘     └──────────────────────┘     └─────────────────────┘
```

---

## 1. PolicyCenter — Fleet Policy Creation

### Guidewire Product Mapping

| Guidewire Concept | CovA Implementation |
|-------------------|---------------------|
| **Product** | "CovA Parametric Income Protection" — Group Micro-Insurance |
| **Policy Type** | Fleet / Group Policy |
| **Policyholder** | Q-Commerce Platform (e.g., Zepto Technologies Pvt. Ltd.) |
| **Named Insured** | Zepto as fleet operator — workers are beneficiaries |
| **Coverage** | Multi-peril income loss: 5 parametric trigger types under one composite index |
| **Policy Period** | Rolling weekly (auto-renew with premium deduction) |
| **Jurisdiction** | India — IRDAI regulated |

### Policy Creation Flow

```
1. Zepto signs B2B fleet agreement with insurer (HDFC ERGO)
2. CovA registers as middleware module in PolicyCenter
3. PolicyCenter creates master fleet policy:
   └── PolicyNumber: COVA-ZPT-BLR-2026-001
   └── Policyholder: Zepto Technologies Pvt. Ltd.
   └── CoverageType: PARAMETRIC_INCOME_LOSS
   └── Territory: Bangalore (ZONE_A, ZONE_B, ZONE_C)
   └── EffectiveDate: 2026-04-01
   └── Rating: CovA Dynamic AI Premium Engine
4. Individual workers enrolled as "Covered Parties" under fleet policy
   └── No individual policy issuance (reduces admin overhead by 99%)
```

### PolicyCenter API Payload

```json
{
  "policyType": "FLEET_GROUP_PARAMETRIC",
  "product": "CovA_IncomeProtection_v1",
  "policyholder": {
    "type": "COMMERCIAL",
    "name": "Zepto Technologies Pvt. Ltd.",
    "registrationNumber": "U74999KA2021PTC151687",
    "contactEmail": "insurance@zeptonow.com"
  },
  "coverage": {
    "type": "MULTI_PERIL_PARAMETRIC_INCOME_LOSS",
    "triggers": ["HEAVY_RAINFALL", "EXTREME_HEATWAVE", "TRAFFIC_GRIDLOCK", "CIVIC_CURFEW", "PLATFORM_OUTAGE"],
    "triggerShares": {"HEAVY_RAINFALL": 0.50, "EXTREME_HEATWAVE": 0.10, "TRAFFIC_GRIDLOCK": 0.20, "CIVIC_CURFEW": 0.13, "PLATFORM_OUTAGE": 0.07},
    "territory": ["ZONE_A_KORAMANGALA", "ZONE_B_WHITEFIELD", "ZONE_C_INDIRANAGAR"],
    "maxPayoutPerEvent": 1200,
    "weeklyCoverageCap": 3000
  },
  "rating": {
    "engine": "COVA_DYNAMIC_AI",
    "basePremium": 35,
    "riskFactors": ["ZONE_RISK", "ARCHETYPE_MULTIPLIER", "HISTORICAL_CDI"],
    "averageWeeklyPremium": 49
  },
  "coveredPartyCount": 500,
  "effectiveDate": "2026-04-01",
  "expirationDate": "2027-03-31",
  "renewalType": "AUTO_WEEKLY"
}
```

---

## 2. ClaimCenter — Master Payload Ingestion

### The Core Innovation: One Claim, Not 500

Traditional workflow: A monsoon hits, 500 workers file individual claims → 500 separate ClaimCenter entries → 500 human adjusters → ₹10,00,000 in LAE.

**CovA workflow**: A monsoon hits → CovA's CDI engine detects the disruption → TCHC validates all 500 workers at the edge → CovA sends **ONE Master Claim Payload** to ClaimCenter → Guidewire processes a single fleet claim → BillingCenter triggers bulk payout.

```
Traditional:  500 workers × 1 claim each  = 500 ClaimCenter entries  ❌
CovA:         500 workers × 1 master batch = 1 ClaimCenter entry     ✅
LAE Saved:    500 × ₹2,000 = ₹10,00,000 per event
```

### ClaimCenter Submission Flow

```
1. CDI breaches threshold in ZONE_B (Whitefield)
2. CovA auto-creates disruption event (DisruptionEvent record)
3. CovA identifies all active workers in ZONE_B (165 workers online)
4. TCHC Integrity Layer validates each worker:
   ├── GNSS SNR check (hardware physics)
   ├── Temporal entropy check (organic vs synthetic movement)
   └── Cellular vectoring check (tower handoff history)
5. Fraud engine flags/blocks spoofed claims:
   ├── 35% blocked (58 ghost workers)
   └── 107 verified genuine workers pass
6. CovA packages everything into ONE Master Payload
7. POST /api/guidewire/submit → ClaimCenter receives single entry
8. ClaimCenter creates: GW-CLM-{timestamp}
```

### Master Payload → ClaimCenter

```json
{
  "claimType": "FLEET_PARAMETRIC_BATCH",
  "policyNumber": "COVA-ZPT-BLR-2026-001",
  "lossDate": "2026-04-01T14:30:00+05:30",
  "reportedDate": "2026-04-01T14:31:12+05:30",
  "lossDescription": "Parametric CDI threshold breach in ZONE_B (Whitefield). Heavy rainfall event: 62mm/hr precipitation. CDI: 0.78 (threshold: 0.60). Auto-triggered claims for verified fleet workers.",
  "disruptionEvent": {
    "eventId": "EVT-20260401-143000-ZONE_B",
    "zone": "ZONE_B",
    "triggerType": "HEAVY_RAINFALL",
    "triggerTypeEnum": ["HEAVY_RAINFALL", "EXTREME_HEATWAVE", "TRAFFIC_GRIDLOCK", "CIVIC_CURFEW", "PLATFORM_OUTAGE"],
    "cdiScore": 0.78,
    "threshold": 0.60,
    "consecutiveCycles": 3,
    "cdiComponents": {
      "weatherScore": 0.85,
      "demandScore": 0.68,
      "peerScore": 0.72
    },
    "oracleSource": "OpenWeatherMap",
    "oracleData": {
      "precipitation_mm_hr": 62,
      "temperature_c": 24,
      "wind_speed_kmh": 35,
      "condition": "heavy_rain",
      "_note": "oracleData schema varies by triggerType — see per-peril schemas below"
    }
  },
  "batchSummary": {
    "totalWorkersInZone": 165,
    "workersValidated": 165,
    "workersPassed": 107,
    "workersBlocked": 58,
    "fraudBlockRate": "35.2%",
    "totalPayoutAmount": 36380,
    "averagePayoutPerWorker": 340,
    "currency": "INR"
  },
  "validatedClaims": [
    {
      "claimId": "CLM-001",
      "workerId": "W042",
      "workerName": "Rajesh Kumar",
      "zone": "ZONE_B",
      "hoursLost": 3,
      "hourlyRate": 85,
      "timeMultiplier": 1.5,
      "cdiFactor": 0.89,
      "payoutAmount": 340,
      "validationStatus": "PASSED",
      "tchcResult": {
        "gnss_snr": "PASS",
        "temporal_entropy": "PASS",
        "cellular_vectoring": "PASS"
      },
      "fraudResult": "CLEAN",
      "upiId": "rajesh.kumar@paytm"
    }
  ],
  "blockedClaims": [
    {
      "workerId": "W099",
      "blockReason": "GNSS_ZERO_VARIANCE",
      "details": "Zero satellite signal variance during active storm — device farm signature detected"
    }
  ],
  "laeMetrics": {
    "traditionalLAE": 330000,
    "covaLAE": 4.12,
    "laeSaved": 329995.88,
    "laeReductionPercent": "99.99%"
  },
  "guidewireMetadata": {
    "submissionTimestamp": "2026-04-01T14:31:12+05:30",
    "submittedBy": "CovA Middleware v2.0",
    "expectedProcessingTime": "< 5 minutes",
    "autoApprove": true,
    "perilAgnostic": true,
    "supportedTriggerTypes": 5
  }
}
```

### ClaimCenter Response

```json
{
  "guidewire_claim_id": "GW-CLM-20260401143112",
  "status": "APPROVED_AUTO",
  "claimsProcessed": 107,
  "claimsBlocked": 58,
  "totalPayout": 36380,
  "lae_saved": 329995.88,
  "message": "Master payload processed. 107 verified claims approved for bulk payout.",
  "processingTime": "1.2s",
  "billingCenterTriggered": true
}
```

### Per-Peril Oracle Data Schemas

The `oracleData` field in the Master Payload varies by `triggerType`:

**HEAVY_RAINFALL:**
```json
{"precipitation_mm_hr": 62, "temperature_c": 24, "wind_speed_kmh": 35, "condition": "heavy_rain"}
```

**EXTREME_HEATWAVE:**
```json
{"temperature_c": 47, "heat_index_c": 52, "sustained_hours": 3, "condition": "extreme_heat", "platform_standdown": true}
```

**TRAFFIC_GRIDLOCK:**
```json
{"avg_speed_kmh": 3.2, "travel_time_ratio": 5.1, "historical_avg_speed": 22, "condition": "gridlock", "source": "TomTom"}
```

**CIVIC_CURFEW:**
```json
{"curfew_type": "SECTION_144", "authority": "Karnataka State Police", "duration_hours": 5, "condition": "civic_curfew"}
```

**PLATFORM_OUTAGE:**
```json
{"platform": "Zepto", "outage_type": "DARK_STORE_CLOSURE", "reason": "cold_storage_failure", "condition": "platform_outage"}
```

---

## 3. BillingCenter — Bulk Razorpay Payout Trigger

### Payment Flow

Once ClaimCenter approves the Master Payload, BillingCenter orchestrates the actual money movement.

| Step | Guidewire BillingCenter | CovA Implementation |
|------|------------------------|---------------------|
| 1 | Receive approved claim batch | BillingCenter webhook → CovA payout engine |
| 2 | Calculate individual disbursals | Already computed in Master Payload |
| 3 | Generate payment instructions | CovA creates Razorpay batch payout request |
| 4 | Execute payments | Razorpay Fund Account → UPI instant transfer |
| 5 | Record transaction IDs | payoutTxnId stored per claim in CovA DB |
| 6 | Reconciliation report | CovA sends settlement report back to BillingCenter |

### BillingCenter → Razorpay Integration

```json
{
  "billingAction": "BULK_PAYOUT",
  "guidewireClaimId": "GW-CLM-20260401143112",
  "paymentMethod": "RAZORPAY_FUND_TRANSFER",
  "payouts": [
    {
      "claimId": "CLM-001",
      "beneficiary": {
        "name": "Rajesh Kumar",
        "upiId": "rajesh.kumar@paytm",
        "ifsc": null,
        "accountNumber": null
      },
      "amount": 340,
      "currency": "INR",
      "narration": "CovA Income Protection - Heavy Rainfall - ZONE_B - 2026-04-01"
    }
  ],
  "totalAmount": 36380,
  "totalPayouts": 107,
  "razorpayBatchId": "batch_RZP_CovA_20260401"
}
```

### Payout Timeline

```
T+0:00  CDI breach detected
T+0:30  TCHC validation complete (all workers)
T+0:45  Master Payload generated
T+1:00  ClaimCenter processes and approves
T+1:30  BillingCenter triggers Razorpay batch
T+2:00  Razorpay initiates UPI transfers
T+5:00  ₹340 lands in Rajesh Kumar's wallet
────────────────────────────────────────
Total: Under 5 minutes from disruption to cash-in-hand
```

---

## 4. Cloud Integration Framework (CIF) — CovA as Middleware Module

### CIF Module Registration

CovA registers with Guidewire's Cloud Integration Framework as a **third-party middleware module**, not a standalone application.

| CIF Property | CovA Configuration |
|-------------|-------------------|
| **Module Name** | `cova-parametric-middleware` |
| **Module Type** | Third-Party Integration |
| **Category** | Parametric / Index-Based Insurance |
| **Protocol** | REST API (JSON over HTTPS) |
| **Authentication** | OAuth 2.0 / API Key |
| **Data Direction** | Bidirectional (CovA ↔ Guidewire) |
| **Event Model** | Webhook-driven + Polling fallback |

### CIF Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GUIDEWIRE CIF LAYER                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ PolicyCenter │  │ ClaimCenter  │  │BillingCenter │      │
│  │              │  │              │  │              │      │
│  │ Fleet policy │  │ Master claim │  │ Bulk payout  │      │
│  │ creation     │  │ ingestion    │  │ trigger      │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │                │
│         └────────┬────────┴────────┬────────┘                │
│                  │                 │                          │
│            ┌─────▼─────────────────▼─────┐                   │
│            │   CIF Integration Gateway   │                   │
│            │   (REST API + Webhooks)     │                   │
│            └─────────────┬───────────────┘                   │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │
                    HTTPS / OAuth 2.0
                           │
┌──────────────────────────┼───────────────────────────────────┐
│                          │                                   │
│            ┌─────────────▼───────────────┐                   │
│            │   CovA Middleware Engine    │                   │
│            │                             │                   │
│            │  ┌───────────────────────┐  │                   │
│            │  │  CDI Computation      │  │                   │
│            │  │  Engine               │  │                   │
│            │  └───────────────────────┘  │                   │
│            │  ┌───────────────────────┐  │                   │
│            │  │  TCHC Fraud           │  │                   │
│            │  │  Validation Layer     │  │                   │
│            │  └───────────────────────┘  │                   │
│            │  ┌───────────────────────┐  │                   │
│            │  │  Dynamic AI Premium   │  │                   │
│            │  │  Rating Engine        │  │                   │
│            │  └───────────────────────┘  │                   │
│            │  ┌───────────────────────┐  │                   │
│            │  │  Master Payload       │  │                   │
│            │  │  Generator            │  │                   │
│            │  └───────────────────────┘  │                   │
│            └─────────────────────────────┘                   │
│                                                              │
│                  COVA MIDDLEWARE LAYER                        │
└──────────────────────────────────────────────────────────────┘
```

### CIF Endpoints Exposed by CovA

| Endpoint | Method | Purpose | Guidewire Consumer |
|----------|--------|---------|--------------------|
| `/api/cif/policy/create` | POST | Create fleet policy for platform | PolicyCenter |
| `/api/cif/policy/workers` | GET | List covered workers under policy | PolicyCenter |
| `/api/cif/claims/master-payload` | GET | Preview pending master payload | ClaimCenter |
| `/api/cif/claims/submit` | POST | Submit master payload to ClaimCenter | ClaimCenter |
| `/api/cif/billing/payout-batch` | POST | Trigger bulk Razorpay payout | BillingCenter |
| `/api/cif/billing/reconcile` | GET | Payout reconciliation report | BillingCenter |
| `/api/cif/health` | GET | Middleware health check | CIF Monitor |
| `/api/cif/webhook/cdi-breach` | POST | Notify Guidewire of CDI threshold breach | Event Hub |

### CIF Event Subscriptions (Guidewire → CovA)

| Event | Direction | Trigger |
|-------|-----------|---------|
| `policy.created` | GW → CovA | New fleet policy activated |
| `policy.renewed` | GW → CovA | Weekly auto-renewal processed |
| `claim.approved` | GW → CovA | ClaimCenter approves master payload |
| `billing.processed` | GW → CovA | BillingCenter confirms payout batch sent |
| `config.updated` | GW → CovA | Insurer updates policy parameters |

---

## 5. Integration Summary Matrix

| Guidewire Module | CovA Function | Data Flow | Key Innovation |
|-----------------|---------------|-----------|----------------|
| **PolicyCenter** | Fleet policy creation for Zepto/Blinkit | CovA → GW | Single B2B policy covers entire fleet — 5 peril types, no product proliferation |
| **ClaimCenter** | Multi-peril Master Payload ingestion | CovA → GW | **1 API call processes 500 claims across any peril type** — 99.99% LAE reduction |
| **BillingCenter** | Bulk Razorpay payout trigger | GW → CovA → Razorpay | Automated UPI disbursement in <5 minutes — peril-agnostic |
| **CIF** | CovA as registered middleware module | Bidirectional | Full event-driven integration — same workflow for rain, heat, traffic, curfew, or outage |

---

> *CovA — the first **multi-peril** parametric insurance middleware purpose-built for Guidewire InsuranceSuite.*  
> *5 perils. 1 composite index. 0 human touch. Built by Team ClaimCrypt for Guidewire DEVTrails 2026.*

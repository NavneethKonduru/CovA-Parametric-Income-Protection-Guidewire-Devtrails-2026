# 04 — Production Backend Blueprint: CovA

> **Status**: Corrective Architecture Document  
> **Audit Date**: April 18, 2026

---

## 1. ARCHITECTURE OVERVIEW

### 1.1 Current Architecture

```
server.js (Express + WebSocket)
├── middleware/auth.js          → JWT extraction, role checking
├── mock-apis/                  → weather.js, demand.js, payment.js (simulate external APIs)
├── data/
│   ├── db.js                   → 🔴 SQLite (better-sqlite3) — LEGACY, MUST DELETE
│   ├── pg.js                   → ✅ PostgreSQL (pg) — TARGET
│   ├── workers.json            → 🔴 10 hardcoded workers — MUST DELETE
│   └── zones.json              → Zone configuration
├── repositories/               → ✅ 8 async PG data access modules (mostly dead code)
│   ├── claims.js, workers.js   → ✅ Used by 2 routes
│   ├── fraud.js, financial.js  → 💀 Zero callers
│   ├── simulation.js, ml.js    → 💀 Zero callers
│   ├── weather.js, system.js   → 💀 Zero callers
├── engines/                    → ✅ Pure business logic (DB-independent except premium.js)
│   ├── claims.js               → CDI computation, normalization, EMA smoothing
│   ├── fraud.js                → TCHC 16-rule heuristic engine
│   ├── validator.js            → Claim eligibility validation
│   ├── payout.js               → Payout calculation
│   ├── premium.js              → 🔴 Uses SQLite for config reads
│   ├── premium-ml.js           → ML-based premium preview
│   ├── groq-explainer.js       → AI claim explanation via Groq API
│   ├── cdi-history.js          → In-memory CDI trend tracking
│   └── fraud-cluster.js        → Spatial fraud clustering
├── routes/                     → 9 Express routers
│   ├── claims.js               → ✅ Migrated to PG
│   ├── dashboard.js            → ✅ Migrated to PG
│   ├── admin.js                → 🔴 SQLite
│   ├── workers.js              → 🔴 SQLite
│   ├── policies.js             → 🔴 SQLite
│   ├── insurer.js              → 🔴 SQLite
│   ├── guidewire.js            → ✅ No DB needed (in-memory simulation)
│   ├── auth.js                 → ✅ No DB needed (static credentials)
│   └── claims-route-additions.js → 🔴 SQLite
├── cron/
│   ├── poller.js               → 🔴 SQLite — THE HEARTBEAT OF THE SYSTEM
│   └── live-weather.js         → ✅ PG
├── ml/
│   └── feature_pipeline.js     → ✅ PG (writes to JSON file, not ml.feature_store)
├── simulation/
│   ├── scenario-engine.js      → 🔴 Likely SQLite
│   ├── worker-seeder.js        → 🔴 SQLite (accepts db param)
│   └── fraud-injector.js       → 🔴 Likely SQLite
└── services/
    └── payout-razorpay.js      → ✅ External API only
```

### 1.2 File-by-File SQLite Contamination (Confirmed by grep)

| File | SQLite Import Line | db.prepare() Calls | Migration Priority |
|------|--------------------|--------------------|--------------------|
| `cron/poller.js` | Line 2-3 | ~15 calls | 🔴 P0 — System heartbeat |
| `routes/admin.js` | Line 4 | ~30 calls | 🔴 P0 — Admin controls |
| `routes/workers.js` | Line 3 | ~12 calls | 🔴 P0 — Worker registration |
| `routes/policies.js` | Line 3 | ~4 calls | P1 |
| `routes/insurer.js` | Line 4 | ~6 calls | P1 |
| `engines/premium.js` | Line 1-2 | ~3 calls (config reads) | P1 |
| `routes/claims-route-additions.js` | Line 4 | ~5 calls | P2 (may be deprecated) |

---

## 2. THE CLAIM PIPELINE: STEP-BY-STEP ANALYSIS

The blueprint specifies a 22-step claim pipeline (§6.2). Here is what is implemented:

| Step | Blueprint Description | Implementation | Status |
|------|----------------------|----------------|--------|
| 1 | READ weather.observations | `poller.js` fetches from mock API | ⚠️ Uses mock, not DB |
| 2 | READ Redis cache (demand) | `poller.js` fetches from mock API | ⚠️ No Redis |
| 3 | READ worker_signals (peer count) | `poller.js` queries SQLite | 🔴 Wrong DB |
| 4 | COMPUTE CDI | `engines/claims.js` — fully functional | ✅ |
| 5 | INSERT disruption_events | `poller.js` inserts to SQLite | 🔴 Wrong DB |
| 6 | WRITE CDI to Redis | `engines/cdi-history.js` in-memory | ⚠️ No Redis |
| 7 | READ workers WHERE zone | `poller.js` queries SQLite | 🔴 Wrong DB |
| 8 | READ policies WHERE worker_id | Not checked in poller | 🔴 Missing |
| 9 | READ claims (daily cap) | `routes/claims.js` via claimsRepo | ✅ |
| 10 | INSERT claims (pending) | `routes/claims.js` via claimsRepo | ✅ |
| 11 | READ fraud history | Not implemented | 🔴 Missing |
| 12 | COMPUTE fraud check | `engines/fraud.js` — fully functional | ✅ |
| 13 | INSERT fraud.detection_log | **NOT DONE** — result stored inline | 🔴 Missing |
| 14 | UPDATE claims SET status | `routes/claims.js` via claimsRepo | ✅ |
| 15 | COMPUTE payout | `engines/payout.js` | ✅ |
| 16 | UPDATE claims pending_payment | `routes/claims.js` | ✅ |
| 17 | CALL payment API | `services/payout-razorpay.js` with fallback | ✅ |
| 18 | INSERT payout_log | **NOT DONE in PG path** | 🔴 Missing |
| 19 | UPDATE claims SET paid | `routes/claims.js` | ✅ |
| 20 | ASYNC AI explanation | `engines/groq-explainer.js` | ✅ |
| 21 | UPDATE claims SET explanation | `routes/claims.js` | ✅ |
| 22 | UPDATE system.metrics + events | **NOT DONE in PG path** | 🔴 Missing |

**Pipeline completeness**: 12 of 22 steps implemented (55%). 5 steps use wrong database. 5 steps missing entirely.

---

## 3. THE TCHC FRAUD ENGINE: DETAILED ANALYSIS

### 3.1 Rule Inventory (`engines/fraud.js`)

| Rule ID | Name | Detection Method | Action | Status |
|---------|------|-----------------|--------|--------|
| FR-01 | TELEPORTATION_SPEED | Distance/time between GPS pings > 100 km/h | auto_reject | ✅ Functional |
| FR-02 | GNSS_ZERO_VARIANCE | CN0 variance = 0 (perfect GPS = spoofing) | flag | ✅ Functional |
| FR-03 | SWARM_DETECTED | 5+ workers at exact same lat/lng | flag | ✅ Functional |
| FR-04 | PEER_DIVERGENCE | Worker claims disruption but 70%+ peers active | flag | ✅ Functional |
| FR-05 | FREQUENCY_ANOMALY | 3+ claims in rolling window | flag | ✅ Functional |
| FR-06 | ZONE_MISMATCH | Claim zone ≠ GPS zone | auto_reject | ✅ Functional |
| FR-07 | OFF_HOUR_CLAIM | Claim outside platform hours | auto_reject | ✅ Functional |
| FR-08 | DUPLICATE_CLAIM | Same worker + same date | auto_reject | ✅ Functional |
| FR-09 | AMOUNT_ANOMALY | Payout > 1.5x zone average | flag | ✅ Functional |
| FR-10 | ZONE_HOPPING | Worker enters zone < 30 min before claim | auto_reject | ✅ Functional |

**Assessment**: The fraud engine is **the strongest module in the codebase**. All 10 rules are implemented as pure functions with no database dependency. The engine receives telemetry data as input parameters and returns a structured verdict.

**Gap**: Verdicts are stored inline in `claims.fraud_result` (JSONB), but NOT written to the dedicated `fraud.detection_log` table. This prevents historical fraud analytics.

### 3.2 Fraud Score Calculation

```javascript
// Composite score: fraudScore = 1 - ∏(1 - weight_i) for triggered malicious flags
// Example: 2 flags with weights 0.3 and 0.5
// fraudScore = 1 - (1-0.3)(1-0.5) = 1 - 0.7*0.5 = 1 - 0.35 = 0.65
```

### 3.3 Decision Logic

| Fraud Score | Action | Claim Status |
|-------------|--------|-------------|
| 0.00 - 0.30 | pass | paid |
| 0.31 - 0.59 | flag_for_review | flagged |
| 0.60 - 1.00 | auto_reject | rejected |

---

## 4. CDI ENGINE: DETAILED ANALYSIS

### 4.1 CDI Formula

```
CDI = W_weather × weatherScore + W_demand × demandScore + W_peer × peerScore
```

Default weights (from admin_config): `weather=0.40, demand=0.35, peer=0.25`

### 4.2 EMA Smoothing

```javascript
smoothedCDI = alpha * rawCDI + (1 - alpha) * previousSmoothedCDI
// alpha = 0.35 (configurable)
```

Purpose: Prevents single-cycle spikes from triggering mass payouts. A disruption must persist for at least 2 cycles (60 seconds) before claims fire.

### 4.3 Zone-Adjusted Thresholds

```javascript
effectiveThreshold = baseThreshold * sensitivityFactor
// ZONE_A (medium): sensitivityFactor = 1.0 → threshold = 0.60
// ZONE_B (high):   sensitivityFactor = 0.85 → threshold = 0.51 (triggers easier)
// ZONE_C (low):    sensitivityFactor = 1.15 → threshold = 0.69 (harder to trigger)
```

### 4.4 2-Cycle Persistence Gate

```
Cycle 1: CDI > threshold → consecutiveBreaches[zone] = 1 → STAGE_1_ALERT broadcast
Cycle 2: CDI > threshold → consecutiveBreaches[zone] = 2 → CLAIMS TRIGGERED
Cycle 3: CDI < threshold → consecutiveBreaches[zone] = 0 → reset
```

**Assessment**: The CDI engine is sound. EMA smoothing + persistence gate + zone adjustment is a robust design for parametric triggering.

---

## 5. PAYMENT INTEGRATION

### 5.1 Razorpay Integration (`services/payout-razorpay.js`)

- Attempts real UPI payout via Razorpay Route API
- Requires `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `.env`
- **Graceful fallback**: If keys missing or API fails, generates `txn_demo_CLM_xxx_timestamp`
- Worker always sees "paid" status regardless of real/simulated payment

### 5.2 Mock Payment API (`mock-apis/payment.js`)

- Simulates Razorpay response with random success/failure
- Returns realistic `txn_xxx` IDs and timestamps
- Used when the system calls `POST /mock/payment/process`

---

## 6. WEBSOCKET EVENT SYSTEM

### 6.1 Current Events Broadcast

| Event | Producer | Data |
|-------|----------|------|
| `CONNECTED` | server.js | Welcome message |
| `CRON_POLL` | poller.js | timestamp, threshold |
| `CDI_UPDATE` | poller.js | zone, cdi, signals, threshold, triggered |
| `THRESHOLD_BREACH` | poller.js | zone, cdi, consecutive cycles |
| `STAGE_1_ALERT` | poller.js | zone, worker-facing message |
| `CLAIM_BATCH_PROGRESS` | poller.js | zone, processed/total |
| `WORKER_SIGNAL_UPDATE` | poller.js | worker telemetry |
| `CLAIM_CREATED` | routes/claims.js | claim data |
| `FRAUD_BLOCKED` | routes/claims.js | fraud verdict |
| `PAYOUT_SENT` | routes/claims.js | payout data |
| `WORKER_REGISTERED` | routes/workers.js | worker data |
| `INSURER_CONFIG_UPDATED` | routes/insurer.js | config changes |
| `DEMO_RESET` | routes/admin.js | timestamp |
| `GUIDEWIRE_SUBMITTED` | routes/guidewire.js | tracking ID |

**Assessment**: WebSocket broadcasting is well-implemented. 14 event types cover the major state changes. However, there is no subscription model — all clients receive all events.

### 6.2 Missing: Client Subscription Model

Blueprint §6.1 specifies Redis Streams for fan-out. Current implementation is simple broadcast. For a hackathon demo, this is acceptable. For production, each client should subscribe to specific zones/workers.

---

## 7. MISSING BACKEND SYSTEMS

### 7.1 Telemetry Ingestion (🔴 Critical)

**What the blueprint requires** (§5.10, §6.1):

```
POST /api/telemetry/ingest
Body: {
  worker_id, lat, lng, satellite_count, cn0_values[],
  gnss_variance, velocity_kmh, heading, gyro_variance,
  device_id, battery_level
}

Pipeline:
1. Validate input (bounds check lat/lng, velocity 0-500)
2. INSERT into telemetry_raw (hypertable)
3. UPDATE worker_signals (latest state)
4. If claim is active → run real-time TCHC fraud check
5. Broadcast WORKER_SIGNAL_UPDATE via WebSocket
```

**What exists**: `PATCH /api/workers/:id/signal` in `workers.js` — updates signal state but:
- Uses SQLite
- Doesn't write to telemetry_raw
- Doesn't validate bounds
- Doesn't run fraud check

### 7.2 Daily Financial Snapshot (🔴 High)

**Blueprint §15**: Daily 00:05 UTC cron job aggregating:
- Total claims, paid/rejected/flagged counts
- Total payout, premium collected
- Loss ratio, fraud detection rate
- Active workers, active policies

**Current state**: No cron job exists. `financial.daily_snapshots` table is defined but never written to.

### 7.3 Civic Disruption CDI Override (🔴 Critical)

**Blueprint §5.3.4**: The poller should check `weather.civic_disruptions` before computing CDI:

```sql
SELECT cdi_override FROM weather.civic_disruptions
WHERE is_active = TRUE AND $zone = ANY(affected_zones)
  AND start_time <= NOW() AND (end_time IS NULL OR end_time > NOW());

-- If civic_override exists: final_cdi = MAX(weather_cdi, civic_override)
```

**Current state**: Not implemented. Poller only checks weather + demand + peer.

---

## 8. ERROR HANDLING & GRACEFUL DEGRADATION

### 8.1 Current Error Handling

| Component | Failure Mode | Current Handling | Quality |
|-----------|-------------|-----------------|---------|
| Mock weather API | HTTP error | try/catch, skip zone | ✅ Good |
| Mock demand API | HTTP error | try/catch, skip zone | ✅ Good |
| Razorpay payout | API timeout/error | Fallback to demo txn | ✅ Good |
| Groq AI explanation | API timeout/error | Fallback to template | ✅ Good |
| SQLite DB | Lock contention | WAL mode + busy_timeout | ✅ Good |
| PostgreSQL | Connection drop | `pg.js` has isReady() check | ✅ Good |
| Claim trigger | Any error | try/catch per worker, continue batch | ✅ Good |

### 8.2 Missing Error Handling

| Component | Missing | Impact |
|-----------|---------|--------|
| Health check | No DB connectivity check | Can't detect DB down |
| Poller startup | No check if DB has required tables | Crash on first cycle |
| WebSocket | No auth, no rate limiting | DoS possible |
| Admin actions | No audit trail | IRDAI non-compliant |

---

## 9. CORRECTIVE ACTION: MIGRATION SEQUENCE

### Phase 1: Eliminate SQLite (Day 1)

1. Add `pg.getInsurerConfig()` and `pg.getAdminConfig()` helper functions that mirror `db.js` exports
2. Migrate `engines/premium.js` to use `pg.js` config functions
3. Migrate `routes/insurer.js` to use `pg.js`
4. Migrate `routes/policies.js` to use `pg.js`
5. Migrate `routes/workers.js` to use `pg.js` + `workersRepo`
6. Migrate `cron/poller.js` to use `pg.js` + repositories (LARGEST task)
7. Migrate `routes/admin.js` to use `pg.js` + repositories
8. Delete `data/db.js`, `data/workers.json`, `data/cova.db`
9. Remove `better-sqlite3` from package.json

### Phase 2: Wire Dead Repositories (Day 2)

1. Connect `repositories/fraud.js` — write detection_log on each claim
2. Connect `repositories/system.js` — write audit_log on admin actions
3. Connect `repositories/system.js` — write system events on claim batches

### Phase 3: Missing Features (Day 3)

1. Create `routes/telemetry.js` — POST /api/telemetry/ingest
2. Add civic disruption check to poller CDI cycle
3. Create daily financial snapshot cron
4. Add DB connectivity to /api/health

### Phase 4: Verification (Day 4)

1. npm start — verify server boots
2. Cron poller runs one cycle
3. POST /api/claims/trigger — end-to-end
4. GET /api/dashboard/insurer — returns real data
5. WebSocket receives CDI_UPDATE
6. POST /api/telemetry/ingest — stores and broadcasts

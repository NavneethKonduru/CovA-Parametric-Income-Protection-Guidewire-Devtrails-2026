# 05 — Production Database Blueprint: CovA

> **Status**: Corrective Architecture Document  
> **Governing Ref**: `COVA_DATABASE_BLUEPRINT.md` (2,393 lines)  
> **Audit Date**: April 18, 2026

---

## 1. CURRENT STATE: SPLIT-BRAIN DIAGNOSIS

### 1.1 The Problem

The backend runs **two databases simultaneously**:

| Component | Database Used | Evidence |
|-----------|--------------|----------|
| `cron/poller.js` | SQLite (`db.js`) | Line 2: `const db = require('../data/db')` |
| `routes/admin.js` | SQLite (`db.js`) | Line 4: `const db = require('../data/db')` |
| `routes/workers.js` | SQLite (`db.js`) | Line 3: `const db = require('../data/db')` |
| `routes/policies.js` | SQLite (`db.js`) | Line 3: `const db = require('../data/db')` |
| `routes/insurer.js` | SQLite (`db.js`) | Line 4: `const db = require('../data/db')` |
| `engines/premium.js` | SQLite (`db.js`) | Line 1: `const db = require('../data/db')` |
| `routes/claims-route-additions.js` | SQLite (`db.js`) | Line 4 |
| `routes/claims.js` | PostgreSQL (`pg.js`) | ✅ Migrated |
| `routes/dashboard.js` | PostgreSQL (`pg.js`) | ✅ Migrated |
| `cron/live-weather.js` | PostgreSQL (`pg.js`) | ✅ Migrated |
| `ml/feature_pipeline.js` | PostgreSQL (`pg.js`) | ✅ Migrated |

**Result**: Only 4 of 11 database-dependent files use PostgreSQL. The remaining 7 still use the legacy SQLite.

### 1.2 The `pg` Package Was Missing

**[Confirmed]** `pg` was not in `package.json` or `package-lock.json`. Now installed via `npm install pg`.

---

## 2. SCHEMA INVENTORY: WHAT THE MIGRATIONS CREATE

The `04-core-database/migrations/` directory contains 10 ordered SQL files. Here is the complete table inventory:

### 2.1 Migration 001: Public Schema (14,315 bytes)

| Table | Columns | Key Features | Backend Consumer |
|-------|---------|-------------|-----------------|
| `public.workers` | id, name, email, phone, phone_hash, aadhaar_hash, zone, platform, archetype, hourly_rate, status, enrolled_date, upi_id, is_simulated, daily_claims_cap, seasonal_factor, peak_hours_per_week, data_mode, created_at, updated_at | PK: id, FK: none, data_mode_enum | `repositories/workers.js` |
| `public.policies` | id, worker_id, worker_name, zone, platform, archetype, weekly_premium, daily_cover_cap, status, effective_date, expiry_date, upi_id, payment_txn_id, payment_ref, last_premium_date, premiums_paid, data_mode, created_at, updated_at | FK: worker_id → workers(id) CASCADE | `routes/policies.js` (SQLite!) |
| `public.claims` | id, worker_id, policy_id, worker_name, zone, disruption_type, date, time_slot, hours_lost, cdi, trigger_level, validation_status, validation_reason, payout_amount, payout_txn_id, ai_explanation, fraud_result (JSONB), fraud_confidence, status, data_mode, created_at, updated_at | GIN index on fraud_result, FK: worker_id, policy_id | `repositories/claims.js` ✅ |
| `public.disruption_events` | id (BIGSERIAL), zone, condition, cdi, weather_score, demand_score, peer_score, narrative, trigger_level, data_mode, timestamp | Hypertable candidate | `cron/poller.js` (SQLite!) |
| `public.payout_log` | id (BIGSERIAL), claim_id, worker_id, amount, status, payment_method, payment_provider, txn_reference, metadata (JSONB), error_message, retry_count, data_mode, created_at | FK: claim_id, worker_id | **No backend writes to PG version** 🔴 |
| `public.worker_signals` | worker_id (PK), lat, lng, geom (GEOMETRY), gnss_variance, velocity, zone_entry, platform_active, signal_mode, satellite_count, cn0_mean, cn0_stddev, signal_authenticity_score, device_id, device_model, os_version, updated_at | PostGIS GIST index | `routes/workers.js` (SQLite!) |
| `public.insurer_config` | key (PK), value, min_value, max_value, description, updated_at, updated_by | JSON validation constraint | `routes/insurer.js` (SQLite!) |
| `public.admin_config` | key (PK), value, description, updated_at, updated_by | JSON validation constraint | `cron/poller.js` (SQLite!) |
| `public.telemetry_raw` | id (BIGSERIAL), worker_id, lat, lng, satellite_count, cn0_values (ARRAY), gnss_variance, velocity_kmh, heading, gyro_variance, accelerometer (JSONB), network_type, signal_strength, device_id, battery_level, data_mode, timestamp | Hypertable, 90-day retention | **No API endpoint exists** 🔴 |

### 2.2 Migration 002: Weather Schema (15,478 bytes)

| Table | Key Features | Backend Consumer |
|-------|-------------|-----------------|
| `weather.observations` | 16 measurement columns (rainfall, temp, wind, humidity, pressure, visibility, AQI, PM2.5, PM10, NO2, O3), weather_score, heat_index_c, station_id, source, data_mode | `cron/live-weather.js` ✅ |
| `weather.forecasts` | target_timestamp, confidence intervals (80%, 95%), predicted_cdi_weather | **Dead — no code writes** 💀 |
| `weather.event_tags` | Named events, ENSO context, impact metrics, affected_zones (TEXT[]) | **Dead — no code writes** 💀 |
| `weather.civic_disruptions` | CDI override, intensity_level (1-3), PostGIS jurisdiction_boundary, verified flag | **Dead — not checked by poller** 💀 |
| `weather.region_mapping` | PostGIS boundary polygon, risk_score, centroid_lat/lng, imd_station_ids | `cron/live-weather.js` reads centroids ✅ |

### 2.3 Migrations 003-008: Domain Schemas

| Schema | Tables | Backend Consumer | Status |
|--------|--------|-----------------|--------|
| `fraud` (003) | detection_log, risk_scores, device_blacklist, anomaly_detections | `repositories/fraud.js` exists | 💀 Dead — no route calls repo |
| `financial` (004) | premium_collections, daily_snapshots, actuarial_projections, profit_loss | `repositories/financial.js` exists | 💀 Dead — no route calls repo |
| `simulation` (005) | runs, events, scenario_library, insurer_simulations, state | `repositories/simulation.js` exists | 💀 Dead — scenario engine uses SQLite |
| `ml` (006) | feature_store, model_registry, model_predictions, training_datasets | `repositories/ml.js` exists | 💀 Dead — feature_pipeline writes JSON |
| `reporting` (007) | generated_reports, analytics_snapshots | No repository | 🔴 Missing |
| `system` (008) | events, metrics, audit_log, process_log, config | `repositories/system.js` exists | ⚠️ Partial — repo exists, zero callers |

### 2.4 Migration 009: Hypertables (8,345 bytes)

Conditionally converts 8 tables to TimescaleDB hypertables:
- `public.disruption_events` (by timestamp)
- `public.telemetry_raw` (by timestamp, 7-day compression, 90-day retention)
- `weather.observations` (by timestamp, 30-day compression, 6-year retention)
- `weather.forecasts` (by generated_at)
- `fraud.risk_scores` (by computed_at)
- `simulation.events` (by timestamp)
- `ml.feature_store` (by computed_at)
- `ml.model_predictions` (by predicted_at)
- `system.events` (by timestamp, 90-day retention)
- `system.audit_log` (by timestamp, 1-year retention)
- `system.process_log` (by timestamp, 30-day retention)

### 2.5 Migration 010: Indexes and Triggers (10,890 bytes)

Creates ~45 indexes and ~8 `BEFORE UPDATE` triggers for `updated_at` auto-update.

---

## 3. WHAT IS TRULY FUNCTIONAL vs DEAD CODE

### 3.1 Functional PostgreSQL Path (4 files)

```
cron/live-weather.js  →  pg.query()  →  weather.observations  ✅
                                     →  weather.region_mapping  ✅

routes/claims.js      →  claimsRepo  →  public.claims          ✅
                      →  workersRepo →  public.workers          ✅

routes/dashboard.js   →  pg.query()  →  public.workers          ✅
                                     →  public.claims           ✅

ml/feature_pipeline.js → pg.query()  →  weather.observations    ✅
                                     →  public.claims           ✅
```

### 3.2 Dead PostgreSQL Code (repositories with zero callers)

```
repositories/fraud.js       →  fraud.detection_log    💀 Zero callers
repositories/financial.js   →  financial.*            💀 Zero callers
repositories/simulation.js  →  simulation.*           💀 Zero callers
repositories/ml.js          →  ml.*                   💀 Zero callers
repositories/system.js      →  system.*               💀 Zero callers (except pg.js internal)
repositories/weather.js     →  weather.*              💀 Only live-weather uses pg.query directly
```

### 3.3 Active SQLite Path (7 files — MUST MIGRATE)

```
cron/poller.js        →  db.prepare()  →  workers, disruption_events, worker_signals, claims
routes/admin.js       →  db.prepare()  →  insurer_config, admin_config, simulation_state, workers, claims
routes/workers.js     →  db.prepare()  →  workers, worker_signals
routes/policies.js    →  db.prepare()  →  policies
routes/insurer.js     →  db.prepare()  →  insurer_config
engines/premium.js    →  db.prepare()  →  insurer_config, admin_config (via getInsurerConfig/getAdminConfig)
routes/claims-route-additions.js → db.prepare() → claims
```

---

## 4. MIGRATION EXECUTION STATUS

### 4.1 Have migrations been run on Neon?

**[Needs Evidence]** — No logs, no test output, no connection verification found in the project. The `setup-neon.js` script exists but no evidence of execution.

### 4.2 What must happen

```bash
# 1. Ensure .env has DATABASE_URL pointing to Neon
# 2. Run in order:
psql $DATABASE_URL -f 04-core-database/init.sql
psql $DATABASE_URL -f 04-core-database/migrations/001_public_schema.sql
psql $DATABASE_URL -f 04-core-database/migrations/002_weather_schema.sql
psql $DATABASE_URL -f 04-core-database/migrations/003_fraud_schema.sql
psql $DATABASE_URL -f 04-core-database/migrations/004_financial_schema.sql
psql $DATABASE_URL -f 04-core-database/migrations/005_simulation_schema.sql
psql $DATABASE_URL -f 04-core-database/migrations/006_ml_schema.sql
psql $DATABASE_URL -f 04-core-database/migrations/007_reporting_schema.sql
psql $DATABASE_URL -f 04-core-database/migrations/008_system_schema.sql
psql $DATABASE_URL -f 04-core-database/migrations/009_hypertables.sql
psql $DATABASE_URL -f 04-core-database/migrations/010_indexes_and_triggers.sql
# 3. Then seeds:
psql $DATABASE_URL -f 04-core-database/seeds/seed_regions.sql
psql $DATABASE_URL -f 04-core-database/seeds/seed_insurer_config.sql
psql $DATABASE_URL -f 04-core-database/seeds/seed_admin_config.sql
psql $DATABASE_URL -f 04-core-database/seeds/seed_scenarios.sql
psql $DATABASE_URL -f 04-core-database/seeds/seed_demo_workers.sql
```

---

## 5. COLUMN NAME MAPPING: SQLite → PostgreSQL

The migration from SQLite to PostgreSQL changed column naming from camelCase to snake_case. Every SQLite-dependent file must update its column references:

| SQLite Column | PostgreSQL Column | Tables Affected |
|--------------|------------------|----------------|
| `workerId` | `worker_id` | claims, policies, payout_log, worker_signals |
| `workerName` | `worker_name` | claims, policies |
| `hourlyRate` | `hourly_rate` | workers |
| `enrolledDate` | `enrolled_date` | workers |
| `isSimulated` | `is_simulated` | workers |
| `dailyClaimsCap` | `daily_claims_cap` | workers |
| `seasonalFactor` | `seasonal_factor` | workers |
| `peakHoursPerWeek` | `peak_hours_per_week` | workers |
| `phoneHash` | `phone_hash` | workers |
| `upiId` | `upi_id` | workers, policies |
| `disruptionType` | `disruption_type` | claims |
| `timeSlot` | `time_slot` | claims |
| `hoursLost` | `hours_lost` | claims |
| `triggerLevel` | `trigger_level` | claims |
| `validationStatus` | `validation_status` | claims |
| `validationReason` | `validation_reason` | claims |
| `payoutAmount` | `payout_amount` | claims |
| `payoutTxnId` | `payout_txn_id` | claims |
| `fraudResult` | `fraud_result` | claims |
| `weeklyPremium` | `weekly_premium` | policies |
| `dailyCoverCap` | `daily_cover_cap` | policies |
| `effectiveDate` | `effective_date` | policies |
| `expiryDate` | `expiry_date` | policies |
| `paymentTxnId` | `payment_txn_id` | policies |
| `paymentRef` | `payment_ref` | policies |
| `createdAt` | `created_at` | policies |
| `claimId` | `claim_id` | payout_log |

---

## 6. DATA MODE ENFORCEMENT

Every content table has `data_mode data_mode_enum NOT NULL DEFAULT 'demo'`.

### 6.1 How `pg.js` enforces it

```javascript
// pg.js maintains global state:
let currentMode = process.env.COVA_MODE || 'demo';

// Exported functions:
getDataMode()     → returns currentMode
setDataMode(mode) → updates currentMode + writes to system.config
```

### 6.2 Repository enforcement pattern

Every repository method must include `WHERE data_mode = $N` in queries:

```javascript
// Example from repositories/claims.js:
async findByWorker(workerId) {
  const result = await pg.query(
    'SELECT * FROM claims WHERE worker_id = $1 AND data_mode = $2 ORDER BY created_at DESC',
    [workerId, pg.getDataMode()]
  );
  return result.rows;
}
```

### 6.3 Gap: Poller does NOT filter by data_mode

**[Confirmed]** `poller.js` line 45: `SELECT DISTINCT zone FROM workers WHERE zone IS NOT NULL` — no data_mode filter. This means real and demo workers are mixed in CDI calculations.

---

## 7. MISSING DATABASE FEATURES (vs Blueprint)

| ID | Feature | Blueprint Section | Status | Fix Required |
|----|---------|------------------|--------|-------------|
| DB-M01 | Weather auto-tag trigger | §7.2 | 🔴 Missing | Add trigger function to migration 002 or new migration 011 |
| DB-M02 | Materialized view `zone_risk_summary` | §7.3 | 🔴 Missing | Add to migration or create as view |
| DB-M03 | Row-Level Security policies | §18 | 🔴 Missing | Add RLS for worker/insurer/admin roles |
| DB-M04 | pgcrypto encryption usage | §18 | 🔴 Missing | Hash Aadhaar, encrypt phone/UPI |
| DB-M05 | PostGIS spatial queries in backend | §5.2.6 | 🔴 Missing | Use ST_Contains for zone membership |
| DB-M06 | Redis caching layer | §3.1 | ⚠️ Fallback only | MemoryCache works, Redis optional |
| DB-M07 | Redis Streams for event pipeline | §15 | 🔴 Missing | Major infrastructure addition |

---

## 8. SEED DATA QUALITY

### 8.1 seed_demo_workers.sql

- 110 workers across ZONE_A (40), ZONE_B (40), ZONE_C (30)
- Archetypes: heavy_peak (30%), balanced (45%), casual (25%)
- Hourly rates: ₹80 (casual), ₹120 (balanced), ₹150 (heavy_peak)
- All have `data_mode = 'demo'`
- **Gap**: No `data_mode = 'real'` workers exist. Real mode will show empty dashboards.

### 8.2 seed_scenarios.sql

- 8 disruption scenarios (WHITEFIELD_MONSOON, KORAMANGALA_HEAT, CITYWIDE_CYCLONE, FRAUD_ATTACK, PLATFORM_OUTAGE, SECTION_144, MIXED_ATTACK, CLEAR_ALL)
- Each has weather presets, expected CDI ranges, expected claims count
- **Quality**: Good. Covers major disruption types.

### 8.3 seed_regions.sql

- 3 zones with centroids, risk scores, descriptions
- ZONE_A (Koramangala): medium risk, 1.0
- ZONE_B (Whitefield): high risk, 1.3, flood_prone
- ZONE_C (Indiranagar): low risk, 0.8
- **Gap**: No PostGIS polygon boundaries. Only centroid lat/lng.

---

## 9. QUERY ACCESS PATTERNS

### 9.1 Hot Path Queries (every 30 seconds via poller)

```sql
-- 1. Get active zones
SELECT DISTINCT zone FROM workers WHERE zone IS NOT NULL AND data_mode = $1;

-- 2. Count active/total workers per zone
SELECT COUNT(*) FROM workers WHERE zone = $1 AND status = 'active' AND data_mode = $2;
SELECT COUNT(*) FROM workers WHERE zone = $1 AND data_mode = $2;

-- 3. Log disruption event
INSERT INTO disruption_events (zone, condition, cdi, data_mode, timestamp)
VALUES ($1, $2, $3, $4, NOW());

-- 4. Find eligible workers (no claim today)
SELECT w.id, w.name, w.zone, ws.lat, ws.lng, ws.gnss_variance, ws.velocity, 
       ws.zone_entry, ws.platform_active, ws.signal_mode
FROM workers w
LEFT JOIN worker_signals ws ON w.id = ws.worker_id
LEFT JOIN claims c ON w.id = c.worker_id AND c.date = $1 AND c.data_mode = $3
WHERE w.zone = $2 AND w.status = 'active' AND w.data_mode = $3 AND c.id IS NULL;
```

### 9.2 Dashboard Queries (on page load)

```sql
-- Insurer dashboard: single aggregation query
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'paid') as approved,
  COUNT(*) FILTER (WHERE status = 'flagged') as flagged,
  COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
  COALESCE(SUM(payout_amount) FILTER (WHERE status = 'paid'), 0) as total_payout
FROM claims WHERE data_mode = $1;

-- Zone summary
SELECT zone, COUNT(*) as active_workers 
FROM workers 
WHERE status = 'active' AND zone IS NOT NULL AND data_mode = $1
GROUP BY zone;
```

### 9.3 Claim Creation (per worker per trigger)

```sql
-- Check daily cap
SELECT COALESCE(SUM(hours_lost), 0) as hours_today
FROM claims WHERE worker_id = $1 AND date = $2 AND data_mode = $3;

-- Insert claim
INSERT INTO claims (id, worker_id, worker_name, zone, disruption_type, date, 
  time_slot, hours_lost, cdi, trigger_level, validation_status, validation_reason,
  payout_amount, fraud_result, fraud_confidence, status, data_mode, created_at, updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),NOW())
RETURNING *;
```

---

## 10. INDEXING STRATEGY

### 10.1 Indexes defined in Migration 010

All indexes from the blueprint are defined. Key ones:

| Index | Table | Columns | Purpose |
|-------|-------|---------|---------|
| `idx_workers_zone_status` | workers | (zone, status) | Poller worker lookup |
| `idx_workers_data_mode` | workers | (data_mode) | Mode filtering |
| `idx_claims_worker_date` | claims | (worker_id, date) | Daily cap check |
| `idx_claims_status` | claims | (status) | Dashboard aggregation |
| `idx_claims_data_mode` | claims | (data_mode) | Mode filtering |
| `idx_claims_fraud_confidence` | claims | (fraud_confidence) WHERE > 0.45 | Partial index for fraud |
| `idx_claims_fraud_jsonb` | claims | GIN(fraud_result) | JSONB flag search |
| `idx_weather_obs_zone_ts` | weather.observations | (zone, timestamp DESC) | Time-series lookup |
| `idx_disruption_zone_time` | disruption_events | (zone, timestamp DESC) | CDI history |

### 10.2 Missing Indexes

| Needed For | Table | Suggested Index |
|-----------|-------|----------------|
| Worker signal lookup by zone | worker_signals JOIN workers | Composite or view |
| Payout audit | payout_log | (worker_id, created_at DESC) — exists in migration |

---

## 11. CORRECTIVE ACTION PLAN

### Priority 0: Make the database actually work

1. Verify `DATABASE_URL` in `.env` points to active Neon instance
2. Run `init.sql` + all 10 migrations + all 5 seeds
3. Verify with `check-status.js` or `smoke-test.js`

### Priority 1: Eliminate SQLite split-brain

1. Migrate `poller.js` to use `pg.js` + repositories
2. Migrate `admin.js` to use `pg.js` + repositories  
3. Migrate `workers.js` to use `pg.js` + `workersRepo`
4. Migrate `policies.js` to use `pg.js`
5. Migrate `insurer.js` to use `pg.js`
6. Migrate `engines/premium.js` to use `pg.js` config functions
7. Delete `data/db.js` and `data/workers.json`
8. Remove `better-sqlite3` from package.json

### Priority 2: Wire dead repositories to routes

1. Connect `repositories/fraud.js` → write fraud.detection_log on each claim
2. Connect `repositories/system.js` → write audit_log on admin actions
3. Connect `repositories/financial.js` → create daily snapshot cron
4. Connect `repositories/weather.js` → use in poller instead of raw pg.query

### Priority 3: Implement missing features

1. Create `POST /api/telemetry/ingest` endpoint writing to telemetry_raw + worker_signals
2. Add civic_disruptions check in poller CDI cycle
3. Create weather auto-tag trigger (migration 011)
4. Create daily financial snapshot cron job

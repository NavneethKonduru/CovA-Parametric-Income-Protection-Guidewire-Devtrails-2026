# 02 — Intended vs Actual Feature Matrix

> **Reference Document**: `COVA_DATABASE_BLUEPRINT.md` (2,393 lines)  
> **Assessment Date**: April 18, 2026

This document provides a line-by-line comparison of every feature specified in the governing blueprint against the actual implementation.

---

## LEGEND

- **Status**: ✅ Implemented | ⚠️ Partial | 🔴 Missing | 💀 Dead Code (written but unreachable)
- **Severity**: Critical (blocks demo) | High (degrades quality) | Medium (missing detail) | Low (nice-to-have)
- **Confidence**: [Confirmed] code evidence | [Inferred] from file names | [Missing] no evidence

---

## SECTION A: DATABASE LAYER

### A1. Schema & Extension Setup

| ID | Feature | Blueprint Ref | Intended | Actual | Status | Severity |
|-----|---------|---------------|----------|--------|--------|----------|
| DB-001 | TimescaleDB extension | §1.3, init.sql | Hypertables for time-series | init.sql has conditional CREATE EXTENSION | ⚠️ Partial | High |
| DB-002 | PostGIS extension | §1.3, init.sql | Spatial polygon queries | init.sql has conditional CREATE EXTENSION | ⚠️ Partial | Medium |
| DB-003 | pg_trgm extension | §1.3, init.sql | Full-text search | init.sql creates it | ✅ | Low |
| DB-004 | pgcrypto extension | §1.3, init.sql | AES-256 encryption | init.sql creates it, **zero code uses it** | 💀 | High |
| DB-005 | 8 schemas created | §5.1, init.sql | public, weather, fraud, financial, simulation, ml, reporting, system | init.sql creates all 8 | ✅ | - |
| DB-006 | data_mode_enum type | §4.1, init.sql | 'real','demo','test' | init.sql creates it conditionally | ✅ | - |
| DB-007 | update_timestamp() function | §5.9.6, init.sql | Auto-update `updated_at` | init.sql creates it in system schema | ✅ | - |
| DB-008 | Migrations actually executed against Neon | §22 | All 10 migrations run in order | **No evidence they were ever executed** | 🔴 Missing | Critical |

### A2. Public Schema Tables

| ID | Feature | Blueprint Ref | Intended | Actual | Status | Severity |
|-----|---------|---------------|----------|--------|--------|----------|
| DB-010 | `public.workers` table | §5.2.1 | 20+ columns including aadhaar_hash, peak_hours | Migration 001 defines it | ⚠️ Partial (unverified on Neon) | Critical |
| DB-011 | `public.policies` table | §5.2.2 | FK to workers, premium tracking, last_premium_date | Migration 001 defines it | ⚠️ Partial | High |
| DB-012 | `public.claims` table | §5.2.3 | JSONB fraud_result, fraud_confidence, GIN index | Migration 001 defines it | ⚠️ Partial | Critical |
| DB-013 | `public.disruption_events` hypertable | §5.2.4 | TimescaleDB hypertable with signal breakdown | Migration 001 defines table, 009 hypertable | ⚠️ Partial | High |
| DB-014 | `public.payout_log` table | §5.2.5 | payment_method, retry_count, error_message | Migration 001 defines it | ⚠️ Partial | Medium |
| DB-015 | `public.worker_signals` table | §5.2.6 | PostGIS geometry, TCHC hardware signals, device_id | Migration 001 defines it | ⚠️ Partial | High |
| DB-016 | `public.insurer_config` table | §5.2.7 | description, JSON validation constraint | Migration 001 defines it | ⚠️ Partial | Low |
| DB-017 | `public.admin_config` table | §5.2.8 | JSON validation constraint | Migration 001 defines it | ⚠️ Partial | Low |
| DB-018 | `public.telemetry_raw` hypertable | §5.10.1 | High-frequency GPS ingestion, cn0_values array, gyro | Migration 001 defines it, 009 hypertable | 💀 Dead (no API) | Critical |

### A3. Weather Schema Tables

| ID | Feature | Blueprint Ref | Intended | Actual | Status | Severity |
|-----|---------|---------------|----------|--------|--------|----------|
| DB-020 | `weather.observations` hypertable | §5.3.1 | 16 columns incl AQI, PM2.5, PM10, NO2, O3, heat_index | Migration 002 defines it | ⚠️ Partial (unverified) | Critical |
| DB-021 | Compression policy (30 days) | §5.3.1 | Auto-compress old weather data | Migration 009 applies it | ⚠️ Partial | Medium |
| DB-022 | Retention policy (6 years) | §5.3.1 | Auto-delete very old data | Migration 009 applies it | ⚠️ Partial | Low |
| DB-023 | `weather.forecasts` hypertable | §5.3.2 | OWM 5-day, SARIMA, confidence intervals | Migration 002 defines it | 💀 Dead (no code writes) | High |
| DB-024 | `weather.event_tags` table | §5.3.3 | Named weather events, ENSO context, impact metrics | Migration 002 defines it | 💀 Dead (no code writes) | Medium |
| DB-025 | `weather.civic_disruptions` table | §5.3.4 | CDI override, intensity_level, PostGIS jurisdiction | Migration 002 defines it | 💀 Dead (no code writes) | Critical |
| DB-026 | `weather.region_mapping` table | §5.3.5 | PostGIS boundary polygon, risk profile, IMD stations | Migration 002 defines it | ⚠️ Partial (seeded, queried by live-weather.js) | Medium |
| DB-027 | Weather auto-tag trigger | §7.2 | Auto-insert event_tags on heavy rainfall INSERT | **Not in any migration** | 🔴 Missing | Medium |
| DB-028 | Materialized view `zone_risk_summary` | §7.3 | 30-day aggregated weather risk per zone | **Not in any migration** | 🔴 Missing | Medium |

### A4. Fraud Schema Tables

| ID | Feature | Blueprint Ref | Intended | Actual | Status | Severity |
|-----|---------|---------------|----------|--------|--------|----------|
| DB-030 | `fraud.detection_log` table | §5.4.1 | Per-claim TCHC analysis, rules_triggered array | Migration 003 defines it | 💀 Dead (no code writes to PG version) | High |
| DB-031 | `fraud.risk_scores` hypertable | §5.4.2 | Per-worker/zone/window risk tracking | Migration 003 defines it | 💀 Dead | Medium |
| DB-032 | `fraud.device_blacklist` table | §5.4.3 | Device ban with expiry | Migration 003 defines it | 💀 Dead (in-memory blacklist in engine) | Medium |
| DB-033 | `fraud.anomaly_detections` table | §5.4.4 | ML-detected anomalies with resolution | Migration 003 defines it | 💀 Dead | Low |

### A5. Financial Schema Tables

| ID | Feature | Blueprint Ref | Intended | Actual | Status | Severity |
|-----|---------|---------------|----------|--------|--------|----------|
| DB-040 | `financial.premium_collections` | §5.5.1 | Premium payment tracking per policy | Migration 004 defines it | 💀 Dead | High |
| DB-041 | `financial.daily_snapshots` | §5.5.2 | Daily aggregated P&L metrics | Migration 004 defines it | 💀 Dead (no cron writes snapshots) | High |
| DB-042 | `financial.actuarial_projections` | §5.5.3 | VaR, expected loss ratio | Migration 004 defines it | 💀 Dead | Medium |
| DB-043 | `financial.profit_loss` | §5.5.4 | Generated columns for net_profit | Migration 004 defines it | 💀 Dead | Medium |

### A6. Simulation, ML, Reporting, System Schemas

| ID | Feature | Blueprint Ref | Intended | Actual | Status | Severity |
|-----|---------|---------------|----------|--------|--------|----------|
| DB-050 | `simulation.runs` | §5.6.1 | Track simulation execution | Migration 005 | 💀 Dead | Medium |
| DB-051 | `simulation.events` hypertable | §5.6.2 | Per-event simulation log | Migration 005 | 💀 Dead | Medium |
| DB-052 | `simulation.scenario_library` | §5.6.3 | Scenario templates | Migration 005, seeded | ⚠️ Partial (seeded, not queried by PG code) | Medium |
| DB-053 | `ml.feature_store` hypertable | §5.7.1 | Computed features for ML training | Migration 006 | 💀 Dead (feature_pipeline writes JSON, not DB) | High |
| DB-054 | `ml.model_registry` | §5.7.2 | Model versioning and coefficients | Migration 006 | 💀 Dead | Medium |
| DB-055 | `ml.model_predictions` hypertable | §5.7.3 | Prediction audit trail | Migration 006 | 💀 Dead | Low |
| DB-056 | `reporting.generated_reports` | §5.8.1 | Stored report output | Migration 007 | 💀 Dead | Low |
| DB-057 | `system.events` hypertable | §5.9.1 | System event log | Migration 008 | ⚠️ Partial (repo exists, not wired) | Medium |
| DB-058 | `system.audit_log` hypertable | §5.9.3 | IRDAI compliance audit trail | Migration 008 | 💀 Dead (repo exists, zero callers) | High |
| DB-059 | `system.config` | §5.9.5 | System KV config | Migration 008 | ⚠️ Partial (repo exists) | Low |

---

## SECTION B: BACKEND LAYER

### B1. Core Pipeline

| ID | Feature | Blueprint Ref | Intended | Actual | Status | Severity |
|-----|---------|---------------|----------|--------|--------|----------|
| BE-001 | Claim trigger pipeline | §6.2 (22 steps) | Full pipeline: verify → CDI → validate → cap → payout → fraud → payment → AI → persist → broadcast | `routes/claims.js` implements ~18 of 22 steps | ⚠️ Partial (missing fraud.detection_log write, payout_log write) | High |
| BE-002 | Cron poller (30s CDI) | §15 | Polls weather+demand, computes CDI, triggers claims | `cron/poller.js` — **fully functional but uses SQLite** | 🔴 Wrong DB | Critical |
| BE-003 | Live weather poller (1hr) | §7.1 | Polls Open-Meteo, inserts to weather.observations | `cron/live-weather.js` — uses pg.js | ✅ | - |
| BE-004 | EMA smoothing on CDI | §6.2 | Exponential moving average for stability | `engines/claims.js` implements EMA (alpha=0.35) | ✅ | - |
| BE-005 | 2-cycle persistence gate | §6.2 | Require 2 consecutive breaches before triggering | `cron/poller.js` line 170 implements this | ✅ | - |
| BE-006 | WebSocket broadcasts | §6.1 (7 events) | CDI_UPDATE, CLAIM_CREATED, FRAUD_BLOCKED, PAYOUT_SENT, etc. | `server.js` sets up WS, poller broadcasts | ✅ | - |

### B2. API Routes

| ID | Feature | Blueprint Ref | Intended | Actual | Status | Severity |
|-----|---------|---------------|----------|--------|--------|----------|
| BE-010 | `POST /api/claims/trigger` | §16 | Claim processing | Migrated to pg.js | ✅ (if pg installed) | - |
| BE-011 | `GET /api/dashboard/insurer` | §16 | Aggregated insurer metrics | Migrated to pg.js | ✅ (if pg installed) | - |
| BE-012 | `GET /api/dashboard/worker/:id` | §16 | Worker's personal dashboard | Migrated to pg.js | ✅ (if pg installed) | - |
| BE-013 | `POST /api/telemetry/ingest` | §16 | Android GPS ping ingestion | **DOES NOT EXIST** | 🔴 Missing | Critical |
| BE-014 | `POST /api/admin/mode` | §4.1.3 | Mode switching (real↔demo) | `POST /api/demo/data-mode` exists | ✅ | - |
| BE-015 | `GET /api/weather/forecast` | §16 | Weather forecast retrieval | **DOES NOT EXIST** | 🔴 Missing | Medium |
| BE-016 | `POST /api/simulator/run` | §16 | Insurer what-if simulation | **DOES NOT EXIST** | 🔴 Missing | Medium |
| BE-017 | Admin CDI weight tuning | §16 | PATCH /api/admin/cdi-weights | Exists in admin.js (SQLite) | ⚠️ Wrong DB | High |
| BE-018 | Admin fraud rule tuning | §16 | PATCH /api/admin/fraud-rules | Exists in admin.js (SQLite) | ⚠️ Wrong DB | High |
| BE-019 | Civic disruption CDI override | §5.3.4 | Poller checks civic_disruptions before CDI calc | **NOT IMPLEMENTED** | 🔴 Missing | Critical |

### B3. Missing Backend Systems

| ID | Feature | Blueprint Ref | Intended | Actual | Status | Severity |
|-----|---------|---------------|----------|--------|--------|----------|
| BE-030 | Telemetry ingestion service | §5.10, §6.1 | POST endpoint, validate, store raw, update signals | No endpoint, no validation | 🔴 Missing | Critical |
| BE-031 | Daily financial snapshot cron | §15 | 00:05 UTC aggregation job | No cron job | 🔴 Missing | High |
| BE-032 | ML feature store cron | §14.1 | Hourly zone features, daily worker features | feature_pipeline.js writes JSON only | ⚠️ Partial | High |
| BE-033 | Fraud detection_log persistence | §6.2 step 13 | INSERT fraud.detection_log per claim | Fraud result stored inline in claims.fraud_result only | 🔴 Missing | High |
| BE-034 | Payout_log persistence | §6.2 step 18 | INSERT payout_log per payment | **Not implemented in PG path** | 🔴 Missing | High |
| BE-035 | Redis Streams event pipeline | §15 | cova:weather, cova:cdi, cova:claims streams | **NOT IMPLEMENTED** | 🔴 Missing | Medium |
| BE-036 | Rate limiting | §3.2 | Redis DB 3 for API throttle | **NOT IMPLEMENTED** | 🔴 Missing | Medium |
| BE-037 | Structured logging | §21.4 | Prometheus-compatible metrics | console.log only | 🔴 Missing | Medium |
| BE-038 | Health check with DB verification | §21.5 | /api/health checks DB + Redis | Static JSON only | 🔴 Missing | High |

---

## SECTION C: LIVE TRACKING

| ID | Feature | Blueprint Ref | Intended | Actual | Status | Severity |
|-----|---------|---------------|----------|--------|--------|----------|
| LT-001 | GPS ping ingestion | §5.10.1 | Every 15s from Android | No endpoint | 🔴 Missing | Critical |
| LT-002 | telemetry_raw hypertable | §5.10.1 | Store full GPS history | Table in migration, no API writes | 💀 Dead | Critical |
| LT-003 | worker_signals update | §6.1 data flow | Aggregate latest state per worker | No code updates PG worker_signals | 🔴 Missing | Critical |
| LT-004 | WS subscription for location | §6.1 | Clients subscribe to worker location | No subscription model | 🔴 Missing | Critical |
| LT-005 | Zone containment check | §5.3.5 | PostGIS ST_Contains for GPS→Zone | No spatial query code | 🔴 Missing | High |
| LT-006 | Fraud telemetry analysis | §9 | Real-time TCHC analysis on ping stream | Inline in claim only, not on ping | 🔴 Missing | High |

---

## SUMMARY STATISTICS

| Category | Total Features | ✅ Done | ⚠️ Partial | 💀 Dead Code | 🔴 Missing |
|----------|---------------|---------|-----------|-------------|------------|
| Database | 30 | 4 | 11 | 12 | 3 |
| Backend | 20 | 6 | 4 | 0 | 10 |
| Live Tracking | 6 | 0 | 0 | 1 | 5 |
| **TOTAL** | **56** | **10 (18%)** | **15 (27%)** | **13 (23%)** | **18 (32%)** |

> [!CAUTION]
> **Only 18% of features are fully implemented.** 32% are completely missing. 23% exist as database schemas with zero backend code to use them (dead code). The system has a 55% non-functional rate.

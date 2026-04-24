# 01 — Executive Reality Check: CovA Engineering Audit

> **Audit Date**: April 18, 2026  
> **Auditor Role**: Principal Architect / Production-Readiness Reviewer  
> **Severity**: 🔴 CRITICAL — System is not production-ready. Multiple subsystems are missing or non-functional.  
> **Governing Document**: `COVA_DATABASE_BLUEPRINT.md` (2,393 lines, 110 KB)

---

## 1. BLUNT DIAGNOSIS

### 1.1 What Was Promised

The `COVA_DATABASE_BLUEPRINT.md` defines an **enterprise-grade, dual-mode parametric insurance platform** with:

- **8 PostgreSQL schemas** (`public`, `weather`, `fraud`, `financial`, `simulation`, `ml`, `reporting`, `system`)
- **~35 tables** across those schemas (workers, claims, policies, weather.observations, weather.forecasts, weather.civic_disruptions, weather.event_tags, weather.region_mapping, fraud.detection_log, fraud.risk_scores, fraud.device_blacklist, fraud.anomaly_detections, financial.premium_collections, financial.daily_snapshots, financial.actuarial_projections, financial.profit_loss, simulation.runs, simulation.events, simulation.scenario_library, simulation.insurer_simulations, simulation.state, ml.feature_store, ml.model_registry, ml.model_predictions, ml.training_datasets, reporting.generated_reports, reporting.analytics_snapshots, system.events, system.metrics, system.audit_log, system.process_log, system.config, public.telemetry_raw, public.worker_signals, public.disruption_events, public.payout_log, public.insurer_config, public.admin_config)
- **6 TimescaleDB hypertables** with compression and retention policies
- **PostGIS geospatial queries** with polygon boundaries
- **Redis caching layer** (5 databases: sessions, CDI EMA, event streams, rate limiting, feature cache)
- **Real-time event pipeline** via Redis Streams with consumer groups
- **Row-Level Security** per role (worker/insurer/admin)
- **IRDAI-compliant audit logging**
- **ML Feature Store** with model registry and predictions
- **Weather auto-tagging triggers**
- **Materialized views** for dashboard performance
- **Telemetry ingestion** (360M pings/month at scale)
- **Live tracking** of worker GPS coordinates
- **Privacy walls** between consumers

### 1.2 What Actually Exists

| Layer | Status | Evidence |
|-------|--------|----------|
| **PostgreSQL schemas** | ✅ Migration SQL files exist (10 files) | `04-core-database/migrations/001-010` |
| **pg.js connection module** | ✅ Written (487 lines) | `02-app-backend/data/pg.js` |
| **8 Repository modules** | ✅ Written | `02-app-backend/repositories/*.js` (8 files) |
| **SQLite db.js** | 🔴 STILL ACTIVE and used by critical paths | `02-app-backend/data/db.js` (266 lines, importing `better-sqlite3`) |
| **Cron poller** | 🔴 Uses `db.js` (SQLite), NOT `pg.js` | `cron/poller.js` line 2: `const db = require('../data/db')` |
| **Admin routes** | 🔴 Uses `db.js` (SQLite), NOT `pg.js` | `routes/admin.js` line 4: `const db = require('../data/db')` |
| **Worker routes** | ❓ Not audited vs SQLite/PG | `routes/workers.js` |
| **Policy routes** | ❓ Not audited vs SQLite/PG | `routes/policies.js` |
| **Insurer routes** | ❓ Not audited vs SQLite/PG | `routes/insurer.js` |
| **Guidewire routes** | ❓ Not audited vs SQLite/PG | `routes/guidewire.js` |
| **Redis cache** | ⚠️ MemoryCache fallback only | `pg.js` has `MemoryCache` class, no Redis client |
| **Redis Streams** | 🔴 NOT IMPLEMENTED | Zero event stream code exists |
| **Row-Level Security** | 🔴 NOT IMPLEMENTED | No RLS policies in any migration |
| **Telemetry ingestion** | 🔴 NOT IMPLEMENTED | No `/api/telemetry/ingest` endpoint exists |
| **Live tracking (GPS)** | 🔴 NOT IMPLEMENTED | No WebSocket subscription for location updates |
| **Weather auto-tag trigger** | 🔴 NOT IMPLEMENTED | Blueprint defines it, no migration includes it |
| **Materialized views** | 🔴 NOT IMPLEMENTED | Not in any migration file |
| **ML model_registry** | ⚠️ Schema exists in migration, no backend code uses it | `repositories/ml.js` references tables but untested |
| **Financial P&L** | ⚠️ Schema exists, no code writes to it | `repositories/financial.js` exists but no route calls it |
| **Audit log** | ⚠️ Schema + repo exist, not wired to any route | `repositories/system.js` has `auditLog()` but never called |
| **PostGIS queries** | 🔴 NOT IMPLEMENTED | No code issues spatial SQL |
| **Encryption (pgcrypto)** | 🔴 NOT IMPLEMENTED | Aadhaar stored as raw text in workers.json |
| **Database actually running** | 🔴 UNVERIFIED | No evidence the PostgreSQL database has ever been initialized with these migrations |
| **`pg` npm package** | 🔴 NOT IN package.json | Dependencies list has no `pg` package |

### 1.3 The Dual-Database Split Brain Problem

**This is the single biggest architectural failure.** The system is running two databases simultaneously:

```
┌────────────────────────────────────────────────────────────────────┐
│                     CURRENT SPLIT-BRAIN STATE                      │
│                                                                    │
│  server.js starts → loads db.js (SQLite) → creates cova.db        │
│                   → loads poller.js → uses db.js (SQLite)          │
│                                                                    │
│  routes/claims.js    → REFACTORED to use pg.js ✅                  │
│  routes/dashboard.js → REFACTORED to use pg.js ✅                  │
│  routes/admin.js     → STILL uses db.js (SQLite) 🔴               │
│  routes/workers.js   → Unknown (likely db.js) ❓                   │
│  routes/policies.js  → Unknown (likely db.js) ❓                   │
│  routes/insurer.js   → Unknown (likely db.js) ❓                   │
│  routes/guidewire.js → Unknown (likely db.js) ❓                   │
│  cron/poller.js      → STILL uses db.js (SQLite) 🔴               │
│  simulation/*        → STILL uses db.js (SQLite) 🔴               │
│                                                                    │
│  repositories/*.js   → All written for pg.js ✅                    │
│  BUT: No route except claims.js + dashboard.js imports them       │
│                                                                    │
│  RESULT: System CANNOT start if DATABASE_URL is not set            │
│          AND ALSO requires cova.db to exist for poller + admin     │
│          → TWO databases, neither fully connected                  │
└────────────────────────────────────────────────────────────────────┘
```

**[Confirmed]** — `poller.js` line 2 imports `db.js`. `admin.js` line 4 imports `db.js`. `package.json` lists `better-sqlite3` but NOT `pg`.

### 1.4 The "10 Workers" Question

The user asked "Why are there 10 separate workers?" This refers to the **10 hardcoded seed workers** in `data/workers.json`, which has exactly 10 entries. This is NOT a "10 worker processes" issue — it's a data issue.

The `db.js` seeds these 10 workers at startup (line 140-167). The simulation layer (`worker-seeder.js`) then adds 100 simulated `SIM_W*` workers, bringing the total to 110.

**Why 10 is wrong**: The blueprint specifies "110 workers (10 hardcoded + 100 simulated)" — but:
- The 10 "hardcoded" workers have no policies, no historical claims, no telemetry
- They exist only as JSON stubs with no UPI IDs, no Aadhaar hashes
- They serve no purpose that 100 simulated workers don't already cover
- The `workers.json` file has 10 entries with incomplete data (missing `email`, `aadhaar_hash`, `peak_hours_per_week`)
- **Recommendation**: Eliminate the 10 hardcoded workers. Use only the seeded workers from `seed_demo_workers.sql` (PostgreSQL path).

---

## 2. TOP FAILURES IN PLANNING FIDELITY

| # | Failure | Severity | Evidence |
|---|---------|----------|----------|
| F-001 | **Migration never executed** — PostgreSQL tables likely don't exist on Neon | 🔴 Critical | No `setup-neon.js` run evidence, no connection test logs |
| F-002 | **Split-brain database** — SQLite and PG coexist, critical paths use wrong one | 🔴 Critical | `poller.js:2`, `admin.js:4` import `db.js` |
| F-003 | **`pg` package not installed** — `package.json` has no `pg` dependency | 🔴 Critical | `package.json` line 14-25 |
| F-004 | **No telemetry ingestion endpoint** — Blueprint Section 5.10 defines `telemetry_raw` table, no API exists | 🔴 Critical | No file matching `/api/telemetry` in routes/ |
| F-005 | **No live tracking** — Blueprint Sections 6, 15 promise real-time GPS, none built | 🔴 Critical | No WebSocket subscription handler for location |
| F-006 | **Redis not implemented** — Blueprint Section 3.1 requires Redis 7, none exists | 🟡 High | `pg.js` uses `MemoryCache` fallback; no `ioredis` in deps |
| F-007 | **Audit logging never wired** — `system.auditLog()` exists but zero callers | 🟡 High | `grep` confirms no route calls `auditLog()` |
| F-008 | **Financial system dead code** — `repositories/financial.js` exists, no routes | 🟡 High | No route imports `financial.js` |
| F-009 | **Weather forecast table unused** — `weather.forecasts` schema exists, no code | 🟡 High | No code references `weather.forecasts` |
| F-010 | **Weather civic_disruptions unused** — Blueprint's "Master Override" table, no code | 🟡 High | Poller doesn't check civic disruptions |
| F-011 | **ML pipeline untested** — `feature_pipeline.js` written, never verified against live DB | 🟡 High | ML directory has no test, no training_features.json |
| F-012 | **Feature files are 76 and 101 lines** — User expected 1000+ lines of real detail | 🟡 High | `DATABASE_ARCHITECTURE.md` = 76 lines, `BACKEND_ARCHITECTURE.md` = 101 lines |
| F-013 | **No `.env` file or template** — `DATABASE_URL` required but not documented | 🟡 Medium | No `.env.example` in backend directory |
| F-014 | **No health check for database** — `/api/health` doesn't check DB connectivity | 🟡 Medium | `server.js` line 93: only returns static JSON |
| F-015 | **WebSocket auth missing** — Any client can connect to WS without auth | 🟡 Medium | `server.js` line 49: no auth check on WS connection |

---

## 3. WHAT MUST HAPPEN FOR RECOVERY

### Phase A: Database Integrity (BLOCKING)
1. Add `pg` to `package.json` dependencies
2. Create `.env.example` with `DATABASE_URL`, `COVA_MODE`, `GROQ_API_KEY`
3. Verify migrations run against Neon PostgreSQL
4. Verify seed data loads

### Phase B: Complete SQLite Elimination (BLOCKING)
1. Refactor `poller.js` to use `pg.js` + repositories (CRITICAL — this is the heartbeat)
2. Refactor `admin.js` to use `pg.js` + repositories
3. Audit and refactor `workers.js`, `policies.js`, `insurer.js`, `guidewire.js`
4. Remove `db.js` entirely
5. Remove `better-sqlite3` from `package.json`
6. Remove `cova.db` and `workers.json` (replaced by PostgreSQL seeds)

### Phase C: Missing Feature Implementation
1. Telemetry ingestion endpoint (`POST /api/telemetry/ingest`)
2. Live tracking WebSocket subscriptions
3. Civic disruption check in poller CDI cycle
4. Weather auto-tagging trigger
5. Audit log wiring in admin operations
6. Financial snapshot cron job

### Phase D: Verification
1. `npm start` — server boots without errors
2. PostgreSQL connection verified in health check
3. Cron poller runs one cycle successfully
4. Claim trigger pipeline end-to-end
5. Dashboard returns real aggregated data
6. WebSocket broadcasts CDI updates

---

## 4. FILE-BY-FILE SQLITE DEPENDENCY MAP

Every file that still imports `db.js` must be migrated. Here is the complete map:

| File | Imports `db.js`? | Imports `pg.js`/repo? | Status |
|------|-----------------|----------------------|--------|
| `data/db.js` | Self | N/A | 🔴 Must be deleted after migration |
| `data/pg.js` | No | Self | ✅ Ready |
| `cron/poller.js` | **YES** (line 2-3) | No | 🔴 MUST MIGRATE |
| `cron/live-weather.js` | No | YES (pg) | ✅ Already migrated |
| `routes/claims.js` | No | YES (repos) | ✅ Already migrated |
| `routes/dashboard.js` | No | YES (pg + repos) | ✅ Already migrated |
| `routes/admin.js` | **YES** (line 4) | Partial (data-mode only) | 🔴 MUST MIGRATE |
| `routes/workers.js` | **LIKELY YES** | Unknown | ❓ MUST AUDIT |
| `routes/policies.js` | **LIKELY YES** | Unknown | ❓ MUST AUDIT |
| `routes/insurer.js` | **LIKELY YES** | Unknown | ❓ MUST AUDIT |
| `routes/guidewire.js` | **LIKELY YES** | Unknown | ❓ MUST AUDIT |
| `routes/auth.js` | No (static) | No | ✅ No DB needed |
| `simulation/scenario-engine.js` | **LIKELY YES** | Unknown | ❓ MUST AUDIT |
| `simulation/worker-seeder.js` | **YES** (accepts db param) | No | 🔴 MUST MIGRATE |
| `simulation/fraud-injector.js` | **LIKELY YES** | Unknown | ❓ MUST AUDIT |
| `ml/feature_pipeline.js` | No | YES (pg) | ✅ Already migrated |
| `engines/claims.js` | No | No | ✅ Pure logic |
| `engines/fraud.js` | No | No | ✅ Pure logic |
| `engines/payout.js` | No | No | ✅ Pure logic |
| `engines/validator.js` | No | No | ✅ Pure logic |
| `engines/premium.js` | No | No | ✅ Pure logic |
| `engines/premium-ml.js` | No | No | ✅ Pure logic |
| `engines/groq-explainer.js` | No | No | ✅ Pure logic (external API) |
| `engines/cdi-history.js` | No | No | ✅ In-memory state |
| `engines/fraud-cluster.js` | No | No | ✅ Pure logic |

**Summary**: 7-9 files still import or depend on `db.js`. 8 repository files + 2 migrated routes use `pg.js`.

---

## 5. DEPENDENCY TREE CRISIS

```
package.json dependencies:
  ✅ axios           — HTTP client for mock APIs and external calls
  🔴 better-sqlite3  — MUST BE REMOVED after migration
  ✅ cors            — CORS middleware
  ❓ cova-root       — `file:..` reference (what is this?)
  ✅ dotenv          — .env loading
  ✅ express         — Web framework
  ✅ groq-sdk        — AI explanation generation
  ✅ h3-js           — Hexagonal spatial indexing (unused?)
  ✅ razorpay         — Payment integration
  ✅ ws              — WebSocket

  MISSING:
  🔴 pg              — PostgreSQL client (THE MOST CRITICAL DEPENDENCY)
  🟡 ioredis         — Redis client (needed for production cache/streams)
```

**[Confirmed]** — The `pg` package is NOT listed in `package.json`. Any code that calls `require('pg')` (like `pg.js` line 28) will crash with `MODULE_NOT_FOUND` unless `pg` was installed but not saved to `package.json`.

---

## 6. RECOVERY PRIORITY MATRIX

| Priority | Task | Blocks | Estimated Effort |
|----------|------|--------|-----------------|
| P0 | Add `pg` to package.json + npm install | Everything | 5 min |
| P0 | Create `.env` with DATABASE_URL | Everything | 5 min |
| P0 | Run init.sql + migrations on Neon | Everything | 30 min |
| P0 | Migrate `poller.js` from SQLite to PG | Cron, Claims, CDI | 2 hours |
| P0 | Migrate `admin.js` from SQLite to PG | Admin panel, Config | 2 hours |
| P1 | Audit + migrate remaining routes | Full API coverage | 3 hours |
| P1 | Implement telemetry ingestion | Live tracking | 2 hours |
| P1 | Wire audit logging | IRDAI compliance | 1 hour |
| P2 | Implement civic disruption check | CDI Override | 1 hour |
| P2 | Wire financial snapshot cron | Insurer reports | 2 hours |
| P2 | Create comprehensive feature docs | Documentation | 4 hours |
| P3 | Redis integration | Production cache | 3 hours |
| P3 | RLS policies | Security | 2 hours |
| P3 | PostGIS spatial queries | Zone containment | 2 hours |

---

> [!CAUTION]
> **Bottom line**: The system cannot currently start in production mode. The PostgreSQL database likely has no tables. The `pg` npm package is missing. The cron poller — the heartbeat of the entire platform — still runs on SQLite. Only 2 of 9 route files have been migrated. The 8 repository modules are dead code with no callers except `claims.js` and `dashboard.js`.
>
> The feature documentation delivered is 76 lines (database) and 101 lines (backend) — against a governing blueprint of 2,393 lines. This is a ~96% content deficit.
>
> Recovery is possible. The architectural bones are sound (repository pattern, schema segregation, engine isolation). But the wiring is incomplete and the system is in a split-brain state between two databases.

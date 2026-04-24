# CovA: Master Execution Blueprint & Architecture Audit

> **Status:** Final Execution Blueprint
> **System:** CovA — Dual-Mode Parametric Insurance Platform
> **Target Execution Engine:** Gemini High Pro 3.1
> **Date:** April 20, 2026

---

## 1. Executive Gap Audit

### What is already complete

- **Core Actuarial & Fraud Engines:** The pure-math logic for CDI computation (`claims.js`), TCHC fraud heuristics (`fraud.js`), and payout bounds (`payout.js`) are functionally robust and mathematically correct.
- **Frontend Baselines:** React-based dashboards for Worker, Insurer, and Admin are scaffolded. The CDI gauge, claim timeline, and basic WS connectivity are present.
- **Guidewire Architecture:** The concept of the "Master Claim Payload" to bypass 500 individual claims is defined and mapped.

### What is partially complete

- **Database Architecture:** `05-PRODUCTION-DATABASE-BLUEPRINT.md` dictates a TimescaleDB/PostGIS PostgreSQL cluster with 8 schemas. The migration scripts exist, but **backend code (poller, routes) still queries the legacy `cova.db` SQLite file.**
- **Dual-Mode Separation:** `COVA_MODE` is defined conceptually, but the strict data isolation (`data_mode` discriminator) is not universally enforced at the ingestion and read layers.
- **Demo Timelapse:** `autonomous-engine.js` generates weather, but the _exact_ 5-minute automated sequence mapped in the `DEMO_SCRIPT.md` is not orchestrated as a single automated run.

### What is missing

- **Native App Telemetry Integration:** The `POST /api/telemetry/ingest` endpoint is completely missing. Android sensors cannot feed into the system.
- **Q-Commerce Dashboard:** Strongly requested in recent prompts but missing real data integration and metrics wiring.
- **Civic Disruption Override:** A critical use case feature where non-weather disruptions (curfews) override the CDI formula is missing from the poller.
- **Guidewire Mock Sink:** We generate the Guidewire Master Payload but lack the mock `POST /api/cif/claims/submit` sink to simulate the complete transaction loop.
- **Redis Streaming & Rate Limiting:** Required for enterprise-grade sync across all 4 web apps and the mobile app.
- **Financial Snapshots:** The `financial.daily_snapshots` table and cron are missing.

### What is weak or ambiguous

- **Sync / WebSocket Orchestration:** WS is implemented as a blind broadcast. It lacks a subscription model (rooms/channels) necessary to keep 4 web apps + 1 mobile app perfectly synced without cross-contamination.
- **Fraud Persistence:** Fraud engine returns inline verdicts, but the `fraud.detection_log` is dead code. We cannot demonstrate historical fraud analytics.

### What is risky or inconsistent

- **Database Schizophrenia:** The single biggest risk is that half the app uses `pg.js` and the core `poller.js` heartbeat uses SQLite. A crash is imminent if this is not unified instantly.
- **Mode Leakage:** If the demo injects 150mm/hr rainfall into the production database without the `data_mode = 'demo'` guardrail, the real ML premium pricing model will be corrupted.

---

## 2. Full Feature Inventory

### Core Platform & Data

- [x] SQLite fallback architecture (to be deprecated)
- [ ] PostgreSQL migration for all active routes
- [ ] `data_mode` (real vs demo) discriminator enforcement
- [ ] Redis caching & pub/sub channels

### Worker App (PWA / Frontend)

- [x] Multi-step onboarding (UWID creation)
- [x] Policy activation & CDI Gauge
- [ ] Mock UPI payment flow (Razorpay integration wrapper)
- [ ] "Piggy Bank" loyalty retention toggle

### Insurer App

- [x] Live claims table visualization
- [ ] Guidewire "Submit Batch" action
- [ ] Financial projection KPIs (Expected Loss vs Actual)

### Admin App

- [x] Mode toggle (Demo / Prod)
- [x] Scenario trigger buttons
- [ ] Single-click "Start 5-Min Presentation Demo" orchestrator

### Q-Commerce Dashboard (Platform View)

- [ ] Fleet disruption metrics
- [ ] Demand drop visualization
- [ ] Worker offline percentage gauges

### Native App (Kotlin)

- [x] Background sensor collection
- [ ] Retroactive offline sync (handling ping buffers when reconnecting)
- [ ] Passive listener mode (for Demo runs)

### Demo Mode vs Production Mode

- [x] Autonomous weather generation
- [ ] Hard fencing: Poller throws 403 if synthetic data injected in Prod mode.
- [ ] Timelapse loop: 60-90s accelerated cycles for demo.

### Fraud Engine

- [x] 10 heuristic rules (Teleportation, GNSS zero variance, swarm)
- [ ] Fraud log persistence for BI
- [ ] Indoor Pardon Rule (Accelerometer stationary = forgive bad GNSS)

### Claim & Premium Engines

- [x] CDI Formula (0.4W + 0.35D + 0.25P)
- [x] GBR Lookup Table + Actuarial Fallback
- [ ] Dynamic explanation string generation for premium changes

### Weather / Telemetry / Risk Intelligence

- [x] OpenWeatherMap fallback
- [ ] `POST /api/telemetry/ingest`
- [ ] Zone containment spatial checks

### Guidewire Integration

- [x] Master payload schema defined
- [ ] `/api/guidewire/latest` endpoint for visualization
- [ ] Mock CIF sink

### Sync & Orchestration

- [x] Basic WS broadcast
- [ ] Typed WS events per app surface

---

## 3. Missing-Feature Detection

| Feature Name                  | Expected From                  | Status  | Why it Matters                                                                        | Exact Fix Required                                                                                             |
| ----------------------------- | ------------------------------ | ------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Telemetry Ingest API**      | Database Blueprint §5.10       | Missing | The Android app has nowhere to send its hardware sensor data.                         | Create `routes/telemetry.js` with `POST /api/telemetry/ingest` validating bounds and checking fraud.           |
| **Q-Commerce Dashboard**      | Recent Prompts / Use Case      | Missing | A critical stakeholder (Zepto) is missing their analytics surface.                    | Create `QCommerceDashboard.jsx` showing fleet status, demand degradation, and active policies.                 |
| **Demo Sequencer**            | Demo Script                    | Missing | Judges expect a flawless 5-10 minute automated run; manual clicking is risky.         | Create `services/demo-sequencer.js` that orchestrates the 6 shots in `DEMO_SCRIPT.md` automatically via WS.    |
| **Civic Disruption Override** | Blueprints §5.3.4              | Missing | Parametric isn't just weather; if Section 144 is declared, weather doesn't matter.    | Update `poller.js` to check `weather.civic_disruptions` before computing CDI.                                  |
| **Retroactive Offline Sync**  | CDI Late Arrival Sync Prompt   | Missing | If workers are in a flood, networks go down. Claims must process when they reconnect. | Update `telemetry.js` to accept batched arrays of past pings and trigger retroactive claim checks.             |
| **Indoor Pardon Rule**        | Fraud Upgrades Prompt          | Missing | GPS drifts indoors; we shouldn't ban a worker waiting in a restaurant.                | Update `engines/fraud.js` to ignore GNSS variance if `accelerometer.stationary == true`.                       |
| **Guidewire Latest Endpoint** | Enterprise Integrations Prompt | Missing | Judges need to see the exact JSON payload sent to ClaimCenter.                        | Create `GET /api/guidewire/latest` that returns the last generated master payload for the Admin UI code block. |
| **Production DB Purge**       | Phase 1 Tasks                  | Partial | The app is still querying `cova.db` SQLite instead of PostgreSQL.                     | Nuke all SQLite imports. Port `poller.js`, `admin.js`, and `workers.js` to `pg.js`.                            |

---

## 4. Master Task Breakdown

### T1: Database & Mode Eradication (Foundation)

- **Priority:** Critical (P0)
- **Dependency:** None
- **Owner:** Backend / Data
- **Acceptance Criteria:** `grep -r "better-sqlite3" .` returns zero matches in active code. `poller.js` uses `data/pg.js`. Every insert forces `data_mode` from `process.env.COVA_MODE`.

### T2: Native Telemetry & Sync (Integration)

- **Priority:** Critical (P0)
- **Dependency:** T1
- **Owner:** Backend / Mobile
- **Acceptance Criteria:** `POST /api/telemetry/ingest` accepts `{worker_id, lat, lng, gnss_variance, is_offline_batch}`. "Indoor Pardon" rule added to `fraud.js`. Offline retroactive claim checks fire if `is_offline_batch` is true.

### T3: Demo Sequencer Orchestration (Demo)

- **Priority:** High (P1)
- **Dependency:** T1
- **Owner:** Orchestration
- **Acceptance Criteria:** `POST /api/admin/demo-seq/start` initiates a state machine that fires weather events, injects ghost workers, triggers claims, and submits to Guidewire precisely following the 6 shots in `DEMO_SCRIPT.md`.

### T4: Surface Completeness: Q-Commerce & Guidewire (Frontend)

- **Priority:** High (P1)
- **Dependency:** None
- **Owner:** Frontend
- **Acceptance Criteria:** `QCommerceDashboard.jsx` visualizes platform demand drops. `AdminPanel.jsx` contains a "Guidewire Sync Viewer" that polls `GET /api/guidewire/latest` and renders the JSON payload in a beautifully formatted code block.

### T5: Actuarial Polish & Payouts (Integration)

- **Priority:** Medium (P2)
- **Dependency:** None
- **Owner:** Backend
- **Acceptance Criteria:** Actuarial logic uses `time_of_day_risk` and `historical_zone_flooding_probability`. Razorpay mock is wired completely with realistic network latencies.

---

## 5. Unified Implementation Sequence

**STEP 1: The Great Nuke & Purge (Foundation & Data)**
Rip out all SQLite dependencies. Wire `poller.js` and `admin.js` to PostgreSQL. Enforce `data_mode`.

**STEP 2: The Ingestion Layer (Sensors & Weather)**
Build the `telemetry.js` route. Add the "Indoor Pardon" fraud rule. Implement the Civic Disruption override.

**STEP 3: The Complete Surfaces (UI/UX)**
Build the Q-Commerce dashboard. Add the Guidewire JSON viewer to the Admin panel. Polish the Insurer dashboard tables. Ensure WebSocket pushes to all 4 surfaces.

**STEP 4: The Autonomous Sequencer (Demo Automation)**
Build the master Demo Orchestrator. Wire it to a single "START DEMO" button in the Admin Panel that runs the exact 2-minute timeline.

**STEP 5: Guardrails & Polish (Presentation Hardening)**
Verify hard fencing (no mock data in production). Polish UI empty states, loading skeletons, and markdown reports.

---

## 6. Gemini Execution Plan

Gemini High Pro 3.1: Execute these exact, atomic tasks in sequence. Do not skip steps.

1. **TASK_DB_1**: Open `02-app-backend/cron/poller.js`. Remove `db.js` import. Replace all `db.prepare().all()` calls with `pg.query()`. Ensure every query includes `data_mode = 'real' OR 'demo'` logic.
2. **TASK_DB_2**: Open `02-app-backend/routes/admin.js`. Remove `db.js` import. Replace with `pg.js`.
3. **TASK_API_1**: Create `02-app-backend/routes/telemetry.js`. Implement `POST /ingest`. Add logic to detect `offline_batch` array and trigger `claims.processRetroactiveClaims()`.
4. **TASK_FRAUD_1**: Edit `02-app-backend/engines/fraud.js`. Add rule `INDOOR_PARDON`: `if (telemetry.cn0_variance < 0.1 && telemetry.velocity == 0 && telemetry.gyro_movement > threshold) return 'pass'`.
5. **TASK_UI_1**: Create `01-app-frontend/src/pages/QCommerceDashboard.jsx`. Add KPI tiles for Fleet Active %, Demand Degradation, and Disruption Status. Add to router.
6. **TASK_UI_2**: Edit `01-app-frontend/src/pages/AdminPanel.jsx`. Add a `<pre><code>` block that fetches `/api/guidewire/latest`.
7. **TASK_DEMO_1**: Create `02-app-backend/services/demo-sequencer.js`. Create an async function `runFullDemo()` that uses `setTimeout` to trigger the weather, inject fraud, and execute payouts over exactly 120 seconds.
8. **TASK_DEMO_2**: Edit `02-app-backend/simulation/scenario-engine.js`. Add hard fence: `if (process.env.COVA_MODE === 'production') throw new Error('Cannot inject synthetic events in production');`

### Critical Guardrails for Gemini

- **No SQLite:** Under no circumstances should you write an `import db from '../data/db.js'`. Only use PostgreSQL.
- **Strict Mode Enforcement:** Never write an INSERT statement without the `data_mode` column specified.
- **No Generic Variable Names:** Use enterprise-grade naming conventions (`disruptionEventPayload`, `telemetryBatchResult`).
- **Surface Sync:** When updating a state on the backend, ensure you `ws.send()` the update to the frontend immediately.

# PROJECT_BRAIN.md — CovA Architecture Reference

## What we are building
Single React app (three role-based contexts) + Node.js/Express backend + SQLite.
One deployment on Render.com. Three routes: /worker /insurer /admin.
110 workers in seed data (10 original + 100 simulated). Real operational simulation via admin controls.

## Core system components

### CDI Engine: `engines/claims.js`
Formula: `(0.40 × weather) + (0.35 × demand) + (0.25 × peer)`
Thresholds: <0.4 = none, 0.4-0.6 = watch, 0.6-0.8 = standard, ≥0.8 = critical
⛔ DO NOT change weights without master node approval

### Fraud Engine: `engines/fraud.js` — 9 rules
Base rules: FREQUENCY_ANOMALY, ZONE_MISMATCH, OFF_HOUR_CLAIM, PEER_DIVERGENCE, DUPLICATE_CLAIM, AMOUNT_ANOMALY
New rules: TELEPORTATION_SPEED (>100km/h), SWARM_DETECTED (5+ same GPS), GNSS_ZERO_VARIANCE (all C/N0 = 0)
Auto-reject: ZONE_MISMATCH, OFF_HOUR_CLAIM, DUPLICATE_CLAIM, TELEPORTATION_SPEED
⛔ DO NOT change thresholds without master node approval

### Payout Engine: `engines/payout.js`
Peak (12-14h inclusive, 19-22h) = 1.0x, Active = 0.5x, Off = 0x
Formula: `hours × rate × time_multiplier × CDI_factor`
✅ BUG FIXED: `hour <= 14` (was `hour < 14`)

### Premium Engine: `engines/premium.js`
Zone × archetype formula. Base rate ₹35/week.

### Validator: `engines/validator.js`
2-of-3 signal rule. CDI ≥ 0.6 + 2 signals = approved. CDI ≥ 0.4 + 1 signal = flagged.

## Database schema (SQLite — `backend/data/db.js`)
- `workers`: id, name, phone, zone, platform, archetype, hourlyRate, status, enrolledDate, upiId, isSimulated
- `claims`: id, workerId, workerName, zone, disruptionType, date, timeSlot, hoursLost, cdi, triggerLevel, validationStatus, validationReason, payoutAmount, payoutTxnId, ai_explanation, fraudResult, status
- `disruption_events`: id, zone, condition, cdi, timestamp
- `insurer_config`: key, value, min_value, max_value, updated_at
- `admin_config`: key, value, updated_at
- `simulation_state`: id, current_scenario, active_since, simulated_conditions

## Zone definitions
- ZONE_A: Koramangala — lat 12.9347, lon 77.6101 — risk 1.0x
- ZONE_B: Whitefield — lat 12.9698, lon 77.7499 — risk 1.3x
- ZONE_C: Indiranagar — lat 12.9784, lon 77.6408 — risk 0.8x

## Simulation engine (`/backend/simulation/`)
- `worker-seeder.js` — 100 workers: 35 ZONE_A, 45 ZONE_B, 20 ZONE_C
- `scenario-engine.js` — 6 scenarios: WHITEFIELD_MONSOON, FRAUD_ATTACK, PLATFORM_OUTAGE, MIXED_ATTACK, SECTION_144, CLEAR_ALL
- `fraud-injector.js` — creates GHOST_xxx workers with spoofing telemetry

## Current build state
- Backend engines: ✅ all functional (CDI, fraud, payout, premium, validator)
- Frontend pages: ✅ Login, Onboarding, WorkerDashboard, InsurerDashboard, AdminPanel
- Database: ✅ SQLite with better-sqlite3, WAL mode, auto-seeding
- Auth: ✅ token-based RBAC (worker, insurer, admin)
- WebSocket: ✅ broadcasting from server, consumed by all dashboards
- Cron: ✅ 30s poller with 2-cycle persistence gate
- Mock APIs: ✅ weather, demand, payment — all with set/reset endpoints
- Simulation: ✅ 100-worker seeder + 6 scenarios + fraud injector
- Dashboard: ✅ live SQLite queries (was hardcoded)
- ML model: ❌ does not exist yet
- Groq AI: ❌ not integrated yet

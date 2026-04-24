# CovA Backend Architecture: Deep Dive

This document provides a minute, exhaustive breakdown of the CovA Node.js backend. It details the exact logic flow, why specific coding paradigms were chosen, the status of external integrations (mocked vs. real), and how the system degrades gracefully when failures occur.

---

## 1. Core Architecture & The Repository Pattern

The backend is a Node.js + Express application. During Phase 2, the backend underwent a massive architectural shift from a monolithic, synchronous SQLite approach to an asynchronous, domain-driven PostgreSQL approach.

**Why the change?**
- **Legacy SQLite (`better-sqlite3`)**: Used `db.prepare('SELECT...').get()`. This is synchronous and blocks the Node.js event loop. If 1,000 workers filed a claim during a localized cyclone, the entire server would freeze.
- **The Repository Pattern (`repositories/`)**: We abstracted all database calls into isolated files (`claims.js`, `workers.js`, `system.js`). These use the `pg` library (`await query(...)`), which is inherently asynchronous, non-blocking, and leverages connection pooling.

**Is it true/working?**
- **YES.** The critical routes (`routes/claims.js` and `routes/dashboard.js`) have been fully refactored to use `claimsRepo` and `workersRepo`, entirely severing their dependence on SQLite.

---

## 2. The Core Pipeline: `POST /api/claims/trigger`

When a worker's mobile app detects a civic disruption (or when a simulation fires), it hits this endpoint. The pipeline is strictly ordered:

1. **Verification**: Checks if `workerId` exists via `workersRepo`.
2. **CDI Calculation**: `analyzeDisruption()` merges weather, demand, and peer scores into a single `CDI` (Civic Disruption Index) value.
3. **Validation**: `validateClaim()` checks if the CDI crosses the trigger threshold for the worker's zone and time slot.
4. **Cap Enforcement**: Calculates `hoursClaimedToday`. If a worker's `daily_claims_cap` is 8 hours, and they already claimed 6, a new claim for 4 hours is automatically clamped to 2 hours.
5. **Payout Calculation**: `calculatePayout()` multiplies `effectiveHoursLost` by `worker.hourly_rate`.
6. **Fraud Check**: The payload is passed to the TCHC Fraud Engine (detailed below).
7. **Payment Dispatch**: Attempts Razorpay integration.
8. **AI Explanation**: Uses Groq (or fallback) to generate a human-readable explanation of the claim decision.
9. **Persistence**: Saved via `claimsRepo.create()`.

---

## 3. The TCHC Anti-Fraud Engine

Parametric insurance is highly susceptible to GPS spoofing and bot farms. The fraud engine (`engines/fraud.js`) processes the claim *before* payment.

**How it works (The Heuristics):**
- **TELEPORTATION_SPEED**: Checks the distance and timestamp between the last ping and current ping. If speed > 100km/h, it auto-rejects.
- **GNSS_ZERO_VARIANCE**: Fake GPS apps often emit perfect satellite signals. If the `C/N0` variance is perfectly `0` for an outdoor claim, it flags the claim.
- **SWARM_DETECTED**: If 5+ workers submit claims from the exact same 6-decimal latitude/longitude simultaneously, they are flagged as a bot farm.
- **PEER_DIVERGENCE**: If a worker claims they cannot work due to a flood, but the platform API shows 70% of peers in that exact zone are actively delivering orders, the claim is flagged for manual review.

**Is it true/working or hardcoded?**
- The heuristic rules are **fully functional code**. However, because we do not have a live fleet of 10,000 riders, the *telemetry data* fed into the engine during demos is synthesized by the Simulation Engine.

---

## 4. Payment Dispatch & Graceful Degradation

**The Razorpay Integration (`services/payout-razorpay.js`)**
- The system attempts to use the Razorpay API to execute a real-time UPI payout (UPI Route).
- **Fallback Mechanism**: Financial APIs fail. Network requests timeout. If Razorpay throws an error (or if API keys are missing in the `.env`), the system catches the `paymentError`.
- **Graceful Degradation**: Instead of crashing the claim pipeline, the backend logs a warning (`[CLAIMS] Razorpay unavailable — using demo TXN`) and generates a mock transaction ID (`txn_demo_CLM_001_1710000000`). The worker still sees a successful UI state, ensuring the demo or user experience doesn't break.

---

## 5. Cron Pollers: `live-weather.js`

To power the Parametric model, we need real-time data.
- **The Poller**: `setInterval` runs every hour. It queries `weather.region_mapping` for the exact centroid lat/lng of all active zones.
- **The Integration**: It makes an HTTP request to the free `api.open-meteo.com`.
- **Normalization**: Open-Meteo returns raw WMO codes (e.g., `95`). The backend uses a mapping function to convert `95` to `thunderstorm`, assigns it a `severity` of `severe`, and calculates a normalized `weather_score` of `0.9`. It also mathematically calculates the Heat Index.
- **Persistence**: It `INSERT`s this into the TimescaleDB hyper-table.

---

## 6. ML Feature Pipeline (`feature_pipeline.js`)

Node.js is not ideal for training XGBoost models.
- **The Design Choice**: Instead of forcing Python/Tensorflow to run inside the Node process, `feature_pipeline.js` acts as an ETL (Extract, Transform, Load) script.
- **How it works**: It runs a massive SQL `WITH` clause aggregating daily weather (Max Temp, Avg Wind) and joining it with Daily Claims (Total Payouts, Claims Count).
- **Output**: It dumps this clean, joined dataset into `training_features.json`. 
- **The Future State**: In production, an AWS Lambda or Python microservice would pick up this JSON file, retrain the actuarial XGBoost model, and deploy the new `.onnx` weights.

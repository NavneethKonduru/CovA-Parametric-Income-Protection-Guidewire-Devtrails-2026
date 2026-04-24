# 👑 MASTER NODE: NAVNEETH'S COMPLETE R&D & EXECUTION PLAYBOOK

This document is for your eyes only. It breaks down the exact technical implementations, database schemas, and Node.js logic required for you to successfully build the central "TCHC Core" architecture over the next 4 weeks.

Your job is the most important: **You route data between all the other nodes.**

---

## 1. THE DATABASE (Supabase + PostgreSQL)
You must use Supabase for this hackathon. It provides two critical enterprise features out-of-the-box:
1. **Real-time WebSockets:** Sherene's React dashboard can listen to the database and update dots on the map instantly without you writing a WebSocket server from scratch.
2. **PostGIS Support:** It handles spatial mapping natively.

### Core Tables Required:
*   `active_workers`
    *   `worker_id` (UUID, Primary Key)
    *   `upi_id` (String)
    *   `current_h3_index` (String, length 15 - e.g., '89283082a3fffff')
    *   `last_active` (Timestamp)
*   `telemetry_logs` (Used by Sharvesh for fraud detection)
    *   `log_id` (UUID)
    *   `worker_id` (UUID, Foreign Key)
    *   `lat` (Float), `lon` (Float)
    *   `cn0_hardware_array` (JSONB - e.g., `[22.4, 0.0, 15.1, 31.8]`)
    *   `timestamp` (Timestamp)
*   `disruption_events` (Controlled by Rahul's Oracle)
    *   `event_id` (UUID)
    *   `h3_index` (String)
    *   `trigger_type` (Enum: 'FLOOD', 'CURFEW', 'GRIDLOCK')
    *   `is_active` (Boolean)

---

## 2. THE BRAIN (Node.js API Architecture)
You need to initialize a fast, stateless backend API. **Fastify** or **Express.js** are perfect here. Do not overcomplicate it.

### Required Package Installations:
`npm install express @supabase/supabase-js h3-js axios`

**Why `h3-js`?** 
The mobile app doesn't know about Hex-Grids; it only knows its Lat/Long. When the app pings your server, you use the H3 library to instantly convert `(12.9716, 77.5946)` into a grid ID so you can group workers together.

### The REST Endpoints You Must Build:

**A. The Edge Ingestion Endpoint**
*   **Route:** `POST /api/worker/ping`
*   **Payload In:** `{"worker_id": "uuid", "lat": 12.92, "lon": 77.63, "cn0_array": [24.1, 19.3...], "velocity": 12.4}`
*   **Your Server Logic:**
    1. Import `import { latLngToCell } from "h3-js";`
    2. Convert the incoming Lat/Long to an H3 grid at Resolution 9 (Roughly 500m radius).
    3. Update the `active_workers` table with this new `current_h3_index`.
    4. Insert the physical metrics into `telemetry_logs`.

**B. The Oracle Trigger Endpoint**
*   **Route:** `POST /api/oracle/trigger`
*   **Payload In:** `{"h3_index": "89283082a3fffff", "trigger_type": "FLOOD"}`
*   **Your Server Logic:**
    1. Check the Bearer Token to ensure the request is actually coming from Rahul's authorized cron script.
    2. Update `disruption_events` table -> Set `is_active = true` for that specific grid.
    3. **Trigger the Orchestrator** (See Section 3).

---

## 3. THE ORCHESTRATOR (Master Payload Genesis)
This is the single most important function in your codebase. When the Oracle endpoint triggers a flood in an H3 grid, you must execute the "TCHC Integrity Check" before releasing the payout.

### The Logic Workflow (Write this in a massive `processDisruption()` async function):

1. **The Grid Sweep:** Query Supabase: `SELECT worker_id FROM active_workers WHERE current_h3_index = '89283082a3fffff'`. You now have an array of 500 workers claiming to be stuck in the flood.
2. **The Intelligence Handoff (Fraud Check):** Do NOT approve them yet. You must take their data from `telemetry_logs` and HTTP POST it into **Sharvesh's Python Math API**. 
3. **The Cleansing:** Sharvesh's API returns: `[{"worker_id": "uuid1", "is_fraud": false}, {"worker_id": "uuid2", "is_fraud": true}]`. You programmatically discard every worker ID flagged as true (Synthetic Bots or Zero-Satellite Emulators). 
4. **The Consolidation:** You are left with exactly 124 mathematically verified humans.
5. **Guidewire ClaimCenter Schema Generation:** Build the JSON object that drops the Insurer's LAE (Loss Adjustment Expense).
   ```json
   {
      "enterprise_policy_id": "ZEPTO_BLR_FLEET",
      "disruption_type": "PARAMETRIC_FLOOD",
      "grid_id": "89283082a3fffff",
      "total_verified_workers": 124,
      "payout_per_worker_inr": 200.00,
      "verified_payout_targets": [
         "upi_driver1@okicici",
         "upi_driver2@ybl"
      ]
   }
   ```
6. **The Financial Handoff:** You take that JSON payload and HTTP POST it directly to **Vimmy's Razorpay Microservice**. Vimmy's script reads the UPI array and physically executes the money transfer. 

**Boom.** You just processed a massive enterprise insurance claim in 4 seconds with 0 human intervention and 100% fraud immunity.

---

## 4. IMMEDIATE NEXT STEPS FOR YOU
1.  Initialize a GitHub repo folder for the backend: `mkdir claimcrypt-backend && cd claimcrypt-backend`
2.  `npm init -y`
3.  Set up an Express server with the `/api/worker/ping` route successfully receiving mock JSON from Postman.
4.  Write a script using `h3-js` that successfully parses a Bangalore Lat/Long into an H3 string and logs it to the terminal. 

Once you verify that you can parse H3 indexes locally, your entire routing architecture is ready to connect.

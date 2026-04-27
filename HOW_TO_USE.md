---
title: "CovA 126 — How To Use: Setup, Walkthrough & Demo Guide"
description: "Complete local environment setup, credential guide, simulation walkthrough, and judge-specific demo path for CovA 126 — the parametric income protection platform for Q-Commerce delivery partners."
hackathon: "Guidewire DEVTrails 2026"
tags:
  - guidewire
  - devtrails-2026
  - setup
  - demo-guide
  - how-to-use
  - local-development
type: "setup"
---

<div align="center">

# 📖 CovA 126 — How To Use
## Complete Setup · Demo Walkthrough · Judge Guide

> *"This document gets you from zero to a live parametric claim payout in under 5 minutes."*

</div>

---

📖 [README.md](./README.md) · 🏗️ [GUIDEWIRE_INTEGRATION.md](./GUIDEWIRE_INTEGRATION.md) · 🛡️ [TCHC_FRAUD_ARCHITECTURE.md](./TCHC_FRAUD_ARCHITECTURE.md)

---

## Platform Status At a Glance

| Component | Status | Access |
|---|---|---|
| **Web App** | ✅ Ready | `http://localhost:5173` (local) · Hosted URL deploying |
| **Backend API** | ✅ Ready | `http://localhost:3001` (local) |
| **Mobile App** | 🔄 In Development | Android APK — ETA post-submission |
| **Hosted Demo** | 🔄 Deploying | `https://cova-126.onrender.com` — watch repo for commit |

---

## Part 1: Local Setup (First-Time)

### Prerequisites

```bash
node --version   # Required: v18.0.0+
npm --version    # Required: v9.0.0+
python --version # Required: v3.9+ (for AI engine)
git --version    # Required: any recent version
```

> [!NOTE]
> **No PostgreSQL required for demo.** The platform automatically uses SQLite if `DATABASE_URL` is not set. For production-grade testing with PostgreSQL, see Part 4.

### Step 1 — Clone & Install

```bash
# Clone the repository
git clone https://github.com/NavneethKonduru/CovA-Parametric-Income-Protection-Guidewire-Devtrails-2026.git
cd cova-126

# Install all dependencies (backend + frontend) in one command
npm run setup

# What this runs:
#   cd 02-app-backend && npm install
#   cd 01-app-frontend && npm install
#   cd 02-app-backend && python -m pip install -r requirements.txt --quiet
```

### Step 2 — Environment Configuration

```bash
# Copy the example env file
cp 02-app-backend/.env.example 02-app-backend/.env

# Open and edit .env:
nano 02-app-backend/.env
```

**Required `.env` variables:**

```env
# ── REQUIRED ──────────────────────────────────────────────
GROQ_API_KEY=your_groq_api_key_here
# Get free key at: https://console.groq.com
# Without this: platform runs fully, claim explanations use template text

# ── OPTIONAL (defaults to SQLite if not set) ──────────────
DATABASE_URL=postgresql://user:password@host:5432/cova126
# Leave blank for SQLite auto-init (recommended for demo)

# ── OPTIONAL (Razorpay test mode) ─────────────────────────
RAZORPAY_KEY_ID=rzp_test_your_key
RAZORPAY_KEY_SECRET=your_razorpay_test_secret
# Without these: payout simulation uses mock response (still demonstrates full flow)

# ── OPTIONAL (Weather API) ────────────────────────────────
OPENWEATHER_API_KEY=your_openweather_api_key
# Without this: platform uses pre-seeded mock oracle data (all simulations work perfectly)

# ── SYSTEM (do not change) ────────────────────────────────
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173
CDI_POLL_INTERVAL_MS=30000
SESSION_SECRET=cova126-dev-secret-change-in-production
```

> [!TIP]
> **Minimum viable setup for demo:** Only `GROQ_API_KEY` is needed. Everything else has working fallbacks. If you skip Groq, all features work — claim explanations show template text instead of LLM-generated text.

### Step 3 — Launch

```bash
# From the root cova-126 directory
npm run dev

# Output you should see:
# [backend]  ✅ CovA 126 API running on http://localhost:3001
# [backend]  ✅ SQLite database initialised (cova126.db)
# [backend]  ✅ CDI polling engine started (30s interval)
# [backend]  ✅ SSE event broadcaster ready
# [frontend] ✅ Vite dev server running on http://localhost:5173
```

Open `http://localhost:5173` in your browser. You should see the CovA 126 login screen.

---

## Part 2: Demo Credentials & Role Overview

| Role | Email | Password | Dashboard Access |
|---|---|---|---|
| 🏍️ **Worker** | `worker@cova.in` | `cova2026` | Q-Commerce Panel — personal coverage view |
| 🏦 **Insurer** | `insurer@cova.in` | `cova2026` | Insurer Panel — claims, loss ratio, Guidewire submit |
| 🛡️ **Admin** | `admin@cova.in` | `cova2026` | Admin Panel + all dashboards |

### What Each Role Sees

**Worker Dashboard (Q-Commerce Panel)**
- Active weekly policy status and premium breakdown
- Real-time CDI score for their zone (updates every 30s)
- Earnings protected counter (cumulative payouts received)
- Active disruption alerts (live zone trigger feed)
- Claim history with Groq LLM explanations
- Coverage tier adjustment (4h / 8h / 12h per day)

**Insurer Dashboard**
- Live loss ratio (recomputes on every claim)
- Gross Written Premium (weekly collected)
- Zone heatmap — claim frequency by PIN code
- 7-day predictive claim forecast (AI risk × active policies)
- Trigger frequency analysis (rain vs. heat vs. AQI vs. curfew)
- Guidewire Master Payload submit button

**Admin Dashboard**
- Total active policies and weekly GWP
- Fraud queue — manual review cases with TCHC score breakdown
- Weekly premium trend chart (last 12 weeks)
- **DataMode toggle: Production ↔ Demo** (switches all panels)
- System health: API uptime, CDI poll status, SSE connections
- 6 simulation scenario buttons

---

## Part 3: The 5-Minute Judge Demo Path

Follow this exact sequence to see the complete CovA 126 flow in under 5 minutes.

### Step 1 — Worker Onboarding (60 seconds)

```
1. Open http://localhost:5173
2. Click "New Worker? Register here"
3. Complete 3-step onboarding:
   Step 1: Platform ID → Enter "ZEPTO-BLR-004291"
   Step 2: Zone selection → Select "Whitefield, Bengaluru"
   Step 3: Coverage tier → Select "8 hours/day (Standard)"
4. Observe: ML premium calculated live — should show ~₹64/week for Whitefield, July scenario
5. Click "Activate Coverage" → UPI mandate authorization (simulated)
6. You are now covered. Policy status: ACTIVE
```

### Step 2 — Trigger a Disruption (15 seconds)

```
1. Open a new tab: http://localhost:5173
2. Login as Admin (admin@cova.in / cova2026)
3. Navigate to Admin Panel
4. Click the orange button: "🌧️ Whitefield Monsoon"
5. Confirm the simulation modal
6. Watch the CDI gauge on screen begin rising (0.72 → 0.89)
```

### Step 3 — Watch the Automated Claim Pipeline (60 seconds)

```
No action needed. Watch the following happen automatically:

0s:   CDI threshold breached (0.891 > 0.720)
2s:   TCHC validation begins — 310 workers scanned
~3s:  287 workers cleared, 23 blocked (fraud flagged)
4s:   Income loss calculated: ₹652.61 per cleared worker
5s:   Fleet Master Payload assembled (287 claims, 1 JSON object)
~8s:  Guidewire ClaimCenter POST — accepted (watch green status badge)
~12s: BillingCenter webhook fires → Razorpay payout triggered
~45s: Razorpay processes — payout.status: "processed"
~50s: Worker dashboard updates via SSE push (no page refresh)
~55s: Worker receives push notification (simulated): "₹652.61 credited"
```

### Step 4 — Check the Insurer Dashboard (30 seconds)

```
1. Switch to the Insurer Panel tab (insurer@cova.in)
2. Observe (updates have already arrived via SSE — no refresh needed):
   - Loss Ratio: Updated to reflect 287 new claims
   - Whitefield zone: Now red on the zone heatmap
   - Total Paid Out: Increased by ₹1,87,299
   - Claims Filed: +287
3. Click "Submit to Guidewire ClaimCenter" (if not auto-submitted)
4. Watch the Master Payload JSON appear in the modal — this is real Guidewire payload format
5. Click "Submit" — watch ClaimCenter acceptance response
```

### Step 5 — Return to Worker View (30 seconds)

```
1. Switch back to the Worker tab (worker@cova.in)
2. Observe:
   - Earnings Protected: +₹652.61
   - Policy Status: Still ACTIVE (coverage continues)
   - Claim History: New entry — "Extreme Rain, Whitefield, ₹652.61 — PAID"
   - Click the claim entry → Groq LLM explanation appears:
     "Your income was protected today because Whitefield zone recorded 94.6mm 
      of rainfall in 6 hours, triggering a Red Alert. Our CDI engine confirmed 
      the disruption at 08:19 IST. Based on your 30-day average daily earnings 
      of ₹790, you received ₹652.61 — 95% of your 8 blocked earning hours."
```

### Step 6 — Counterfactual Panel (45 seconds)

```
1. Navigate to Counterfactual Panel (Admin or Insurer access)
2. Observe the Whitefield Monsoon event entry:
   - Estimated income lost: ₹1,97,157 (all 287 workers × ₹686.96)
   - CovA payout: ₹1,87,299
   - Coverage ratio: 95.0%
   - Coverage gap: ₹9,858
3. Panel note: "The 5% gap reflects the Orange Alert rain fraction. 
   Consider 'Rain Plus' tier for sub-₹35 gap reduction."
4. Export this as CSV → Reports Panel
```

**Total demo time: ~4.5 minutes.** The 5-minute video follows this exact sequence.

---

## Part 4: Advanced Configuration

### PostgreSQL Setup (Production Mode)

```bash
# Install PostgreSQL (if not already installed)
brew install postgresql@16  # macOS
# or: sudo apt-get install postgresql-16  # Ubuntu

# Create database
createdb cova126

# Set in .env
DATABASE_URL=postgresql://localhost:5432/cova126

# Run migrations
cd 02-app-backend
npm run db:migrate
npm run db:seed  # Seeds demo workers, zones, and oracle data
```

### Running the Python AI Engine Separately

```bash
# If the Python engine isn't starting automatically:
cd 02-app-backend/engines/ai
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload

# Backend will detect the AI engine at http://localhost:8001
# Without it: premium uses the pre-computed table fallback
```

### DataMode: Production vs Demo

The Admin panel has a **DataMode toggle** in the top-right corner:

| Mode | Behaviour |
|---|---|
| **Demo** | All dashboards show seeded simulation data — guaranteed impressive numbers for a fresh install |
| **Production** | All dashboards read live from your database — shows real data from actual interactions |

For judge demos on a fresh install: **leave in Demo mode**. Switch to Production after running several simulations.

### Adjusting CDI Poll Interval

```env
# In .env — default is 30 seconds
CDI_POLL_INTERVAL_MS=30000

# For faster demos (more responsive):
CDI_POLL_INTERVAL_MS=10000

# For production (reduce API calls):
CDI_POLL_INTERVAL_MS=60000
```

---

## Part 5: Troubleshooting

### "CDI engine not starting"

```bash
# Check if port 3001 is already in use
lsof -i :3001
# Kill existing process if needed: kill -9 [PID]

# Or change the port:
PORT=3002 npm run dev
# And update VITE_API_BASE_URL in 01-app-frontend/.env
```

### "Groq API rate limit"

The free tier allows 30 requests/minute. During rapid demos with many claims:

```env
# Temporarily disable Groq LLM (use template explanations)
# Comment out in .env:
# GROQ_API_KEY=...

# Platform continues working — explanations use structured template text
```

### "Simulation doesn't trigger claims"

```bash
# Check the CDI engine is running
curl http://localhost:3001/api/health
# Should return: { "cdiEngine": "running", "lastPoll": "...", "activeWorkers": N }

# Check that workers are registered with a matching zone
curl http://localhost:3001/api/workers?zone=ZONE-BLR-WF-001

# Ensure the simulation zone matches registered workers
# Admin panel → "Zone Debug" tab → verify worker-zone mapping
```

### "Razorpay payout failing"

```bash
# Razorpay test mode requires valid test credentials
# If not configured, payouts use mock response (full flow still demonstrated)

# To verify mock mode is active:
curl http://localhost:3001/api/health | grep payoutMode
# Should return: { "payoutMode": "mock" } if no Razorpay keys configured
```

### "Guidewire payload rejected"

```bash
# In demo mode, Guidewire ClaimCenter uses a mock endpoint
# The sandbox URL returns HTTP 200 Accepted for all valid payloads

# To inspect the payload before submission:
# Admin Panel → "View Last Payload" button
# Compare against Master Payload schema in GUIDEWIRE_INTEGRATION.md
```

---

## Part 6: File Structure Reference

```
cova-126/
│
├── 01-app-frontend/                  # React + Vite Web App
│   ├── src/
│   │   ├── panels/
│   │   │   ├── AdminPanel.tsx         # Admin: policies, fraud, trend
│   │   │   ├── InsurerPanel.tsx       # Insurer: GWP, loss ratio, heatmap
│   │   │   ├── QCommercePanel.tsx     # Worker: coverage, claims, triggers
│   │   │   ├── CounterfactualPanel.tsx # "What would workers have earned?"
│   │   │   └── ReportsPanel.tsx       # IRDAI-format export
│   │   ├── context/
│   │   │   └── AppContext.tsx         # Global state — no hardcoded numbers
│   │   └── hooks/
│   │       └── useDashboardData.ts   # Polling hook — all dashboards
│   └── package.json
│
├── 02-app-backend/                   # Node.js Express API
│   ├── routes/
│   │   ├── metrics.js                # /api/metrics/* — all dashboard data
│   │   ├── policies.js               # /api/policies/* — CRUD
│   │   ├── claims.js                 # /api/claims/* — claim lifecycle
│   │   └── payouts.js                # /api/payouts/* — Razorpay integration
│   ├── engines/
│   │   ├── cdi_engine.js             # CDI computation + oracle polling
│   │   ├── tchc/                     # TCHC 3-modal fraud validation
│   │   ├── cpr_engine.py             # CPR premium (Python, R²=0.94)
│   │   ├── groq_client.js            # LLM claim explanations
│   │   ├── guidewire/                # ClaimCenter + BillingCenter clients
│   │   └── payout/                   # Razorpay payout state machine
│   ├── middleware/
│   │   └── dataMode.js               # Production/Demo mode middleware
│   ├── data/
│   │   ├── demo-metrics.json         # Seeded data for Demo mode
│   │   ├── zones.json                # Zone definitions + risk scores
│   │   └── mock-oracles/             # OpenWeatherMap + IMD + CPCB mocks
│   └── .env.example
│
├── 03-app-mobile/                    # Android / Kotlin (in development)
│   └── README.md                     # Mobile setup when available
│
├── 04-core-database/
│   ├── schema/
│   │   ├── base.sql                  # Core tables
│   │   └── metrics_views.sql         # All dashboard SQL views
│   └── migrations/                   # Sequential migration files
│
├── 05-simulation-engine/
│   ├── triggers/                     # 6 named scenario definitions
│   └── cron.js                       # 30-second auto-trigger loop
│
├── 06-docs-technical/
│   └── API_CONTRACTS.md              # Full API specification
│
└── 07-pitch-materials/
    └── CovA126_Final_Pitch.pdf       # Phase 3 pitch deck
```

---

## Part 7: API Reference (Key Endpoints)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Platform health check — CDI status, DB connection, payout mode |
| `POST` | `/api/auth/login` | Login with role credentials |
| `POST` | `/api/workers/register` | Register new worker (3-step onboarding) |
| `GET` | `/api/metrics/admin` | Admin dashboard data (policies, claims, fraud) |
| `GET` | `/api/metrics/insurer` | Insurer dashboard (GWP, loss ratio, heatmap, forecast) |
| `GET` | `/api/metrics/worker/:id` | Worker dashboard (policy, claims, triggers) |
| `GET` | `/api/metrics/counterfactual` | Counterfactual analysis data |
| `GET` | `/api/metrics/reports` | Report data (weekly-claims / zone-risk / fraud-log) |
| `POST` | `/api/simulation/trigger` | Fire a named simulation scenario |
| `POST` | `/api/guidewire/submit` | Submit Master Payload to ClaimCenter |
| `GET` | `/api/events/stream` | Server-Sent Events stream (dashboard live updates) |

---

> *"If you can run `npm run dev`, open a browser, and click one button — you have seen the complete future of parametric gig income insurance. That is intentional."*

📖 [README.md](./README.md) · 🏗️ [GUIDEWIRE_INTEGRATION.md](./GUIDEWIRE_INTEGRATION.md) · 🛡️ [TCHC_FRAUD_ARCHITECTURE.md](./TCHC_FRAUD_ARCHITECTURE.md)

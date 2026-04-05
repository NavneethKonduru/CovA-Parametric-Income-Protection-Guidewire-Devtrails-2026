---
title: "CovA — Setup Guide: Local Development & Environment Configuration"
description: "Complete setup instructions for running CovA locally — backend, frontend, ML model, and environment configuration. Includes Groq API key setup and demo credentials."
hackathon: "Guidewire DEVTrails 2026"
theme: "Gig Economy"
category: "Q-Commerce Insurance"
tags:
  - guidewire
  - devtrails-2026
  - setup
  - local-development
  - node-js
  - react
team: "Team CovA"
status: "complete"
date: "2026"
version: "2.0.0"
type: "setup"
---

# CovA — Setup Guide

📋 [README.md](./README.md) · 🏗️ [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Prerequisites

| Requirement | Version | Check command |
|---|---|---|
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Python | 3.9+ (optional, for ML retraining) | `python --version` |

---

## 1. Clone & Install

```bash
git clone https://github.com/team-cova/cova.git
cd cova

# Installs both backend and frontend dependencies
npm run setup
```

The `setup` script runs `npm install` in `/backend` and `/frontend` sequentially.

---

## 2. Environment Configuration

Create `backend/.env` with the following variables:

```env
# Required — get a free key at console.groq.com
GROQ_API_KEY=gsk_your_key_here

# Optional — defaults shown below
PORT=3001
NODE_ENV=development

# Mock API toggles (true = use mock, false = call real API)
MOCK_WEATHER=true
MOCK_PAYMENT=true
MOCK_DEMAND=true

# Guidewire CIF credentials (Phase 3 — leave empty for Phase 2 demo)
GWCP_CLIENT_ID=
GWCP_CLIENT_SECRET=
POLICY_CENTER_BASE_URL=
CLAIM_CENTER_BASE_URL=
BILLING_CENTER_BASE_URL=
```

**Getting a Groq API key:** Free tier available at [console.groq.com](https://console.groq.com). The free tier supports ~14,400 requests/day — sufficient for demo use. Without a Groq key, claim generation still works but AI explanations will show a fallback template.

---

## 3. Start the Application

```bash
# Start both backend (port 3001) and frontend (port 5173)
npm run dev
```

On first run, the backend auto-seeds the SQLite database:
- 10 demo workers (including the 3 credential-linked accounts)
- 100 simulated workers (35 Zone A, 45 Zone B, 20 Zone C)
- Default insurer configuration
- Default admin configuration

Expected output:
```
[BACKEND] Server running on http://localhost:3001
[BACKEND] Database seeded: 110 workers, 3 zones
[BACKEND] Cron engine started (30s interval)
[FRONTEND] Local: http://localhost:5173
```

---

## 4. Demo Credentials

| Role | Email | Password | Access |
|---|---|---|---|
| Worker | `worker@cova.in` | `cova2026` | WorkerDashboard |
| Insurer | `insurer@cova.in` | `cova2026` | InsurerDashboard |
| Admin | `admin@cova.in` | `cova2026` | AdminPanel |

---

## 5. Verify the Pipeline

```bash
# Test the claim trigger endpoint directly
curl -X POST http://localhost:3001/api/admin/trigger \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{"zone": "ZONE_B", "condition": "HEAVY_RAINFALL", "cdi": 0.78}'

# Get an admin token first:
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@cova.in", "password": "cova2026"}'
# → { "token": "eyJ..." }

# Test Guidewire submission (insurer token required):
curl -X POST http://localhost:3001/api/guidewire/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <insurer_token>"
# → { "guidewire_claim_id": "GW-CLM-...", "status": "APPROVED_AUTO", ... }
```

---

## 6. Optional: Retrain the ML Model

```bash
cd backend/ml
pip install scikit-learn pandas numpy

python generate_and_train.py
# Outputs: model_coefficients.json (loaded by premium-ml.js at runtime)
# Expected: R² ≥ 0.90 on validation set
```

---

## 7. Production Deployment (Render.com)

The repo includes `render.yaml` for one-click Render.com deployment. The live demo at `cova-frontend.onrender.com` is deployed from the `main` branch.

**Note:** Render free tier spins down after 15 minutes of inactivity. First request after inactivity may take 30–45 seconds to cold-start. This is expected behaviour — not a bug.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `better-sqlite3` build error on Apple Silicon | Run `npm rebuild better-sqlite3 --build-from-source` |
| Groq API rate limit (429) | Wait 60 seconds or use a different API key |
| Frontend shows blank screen | Check `VITE_API_URL` in `frontend/.env` — default is `http://localhost:3001` |
| Cron not triggering claims | Check `backend/logs.txt` — CDI must breach 0.60 for 2 consecutive cycles |
| Claims not appearing in Insurer dashboard | WebSocket connection may have dropped — refresh the page |

---

📋 [README.md](./README.md) · 🏗️ [ARCHITECTURE.md](./ARCHITECTURE.md) · 🎬 [DEMO.md](./DEMO.md)

# 📋 MASTER_CONTEXT.md — CovA Single Source of Truth

> **Team**: ClaimCrypt | **Hackathon**: Guidewire DEVTrails 2026
> **Last Updated**: 2026-03-31 | **Phase**: 2 (Scale)
> **Sprint Deadline**: April 2, 2026 (internal) | April 4 (submission)

---

## PROJECT IDENTITY

```
PROJECT: CovA — Coverage Automated
GOAL: One-platform, three-role parametric insurance system.
      Worker gets paid in <5min. Insurer configures risk parameters.
      Admin controls core engine. Guidewire receives master payload.
STACK: React/Vite/Tailwind (role-based routes), Node.js/Express,
       SQLite, OpenWeatherMap, Groq, Razorpay test, h3-js, ws
ARCHITECTURE: Single deployment · 3 role contexts (Worker/Insurer/Admin) ·
              Role selector at login · Shared backend · Shared DB
STATE: Backend engines built | Frontend = ✅ COMPLETE | Cron exists |
       SQLite/PostgreSQL schema ready | Payout active (Razorpay test) |
       AI Risk Model active | WebSocket/SSE broadcast ready
SPRINT: 6 days to April 2 internal deadline
SUCCESS: Worker enrolls → insurer configures policy → monsoon simulates →
         auto-claim fires → fraud blocked → UPI paid → Guidewire submits →
         all three role views show coherent live state
CONSTRAINTS: Income loss only · Weekly premium · Insurer controls:
             premium rate + payout cap + trigger sensitivity + zones ·
             Admin controls: CDI weights + fraud rules + simulation
```

---

## ARCHITECTURE DECISION

> **Single React app. Three role-based contexts. One Node.js backend. One SQLite DB. One deployment.**

This is the correct enterprise architecture — identical to how Guidewire ClaimCenter works (one platform, multiple portals). Separate deployments add complexity with zero benefit in a hackathon context. Judges are Guidewire professionals who understand role-based access control.

### Three Role Contexts

| Context | Route | Form Factor | Aesthetic |
|---------|-------|-------------|-----------|
| **Worker App** | `/worker` | Mobile-first (375px) | Dark navy (#0F172A), large text, single-column, thumb-friendly |
| **Insurer Platform** | `/insurer` | Desktop-first (1440px) | White bg, wide layout, data tables, enterprise aesthetic |
| **Admin Panel** | `/admin` | Desktop, minimal | Dark grey (#1a1a2e), developer-tooling aesthetic, utilitarian |

### Authentication
Demo mode: role selector login screen with three credential sets (worker@cova.in / insurer@cova.in / admin@cova.in). JWT or session token. Role-based middleware protects routes.

---

## DATA & CONTROL FLOW

```
WORKER PHONE
  ↓ captures: GPS → H3 · Platform · Work pattern · UPI ID
  ↓ sends to:

COVA BACKEND (Node.js + SQLite)
  stores: worker profile · policy · telemetry logs
  runs every 30s: CDI engine per zone
    ← pulls: OpenWeatherMap (coordinate-level)
    ← pulls: platform demand mock / Oracle
    ← computes: peer offline ratio from active workers

  when CDI ≥ threshold for 2+ cycles:
    → creates DisruptionEvent
    → auto-triggers claims for zone workers
    → runs fraud check (6+ rules)
    → calculates payout (hours × rate × time multiplier × CDI factor)
    → calls Razorpay payout API
    → emits WebSocket events to all connected dashboards
    → generates Groq AI explanation per claim

  ↓ feeds:

INSURER VIEW — SEE: live CDI · claims feed · fraud flags ·
                     loss ratio · premium pool · zone risk map ·
                     master payload for Guidewire
             — EDIT: base_premium_rate (₹29–₹89) ·
                     max_payout_per_event (₹500–₹2000) ·
                     cdi_trigger_threshold (slider 0.5–0.8) ·
                     covered_zones (checkbox) ·
                     weekly_coverage_cap

ADMIN VIEW  — SEE: everything + fraud rule weights +
                   CDI formula config + system health + audit log
            — EDIT: CDI signal weights · fraud rule thresholds ·
                    zone risk factors · simulation controls ·
                    insurer permission boundaries
```

**Key principle: every layer can only see and touch what belongs to it — enforced by API design.**

---

## INSURER CONTROLS (What They Actually Configure)

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `base_premium_rate` | number | ₹29–₹89 | ₹35 |
| `max_payout_per_event` | number | ₹500–₹2000 | ₹1200 |
| `cdi_trigger_threshold` | number | 0.5–0.8 | 0.6 |
| `covered_zones` | string[] | from defined zones | all zones |
| `weekly_coverage_cap` | number | ₹1000–₹5000 | ₹3000 |

**Insurers DO NOT control:** CDI formula weights, fraud algorithms, data sources, individual claim outcomes.

---

## API CONTRACTS (Phase 2)

### Auth
```
POST /api/auth/login         → { role, token, redirectPath }
```

### Worker Routes (role: worker)
```
POST /api/workers             → Register worker
GET  /api/workers/:id         → Get worker details
GET  /api/dashboard/worker/:id → Worker dashboard data
GET  /api/claims/worker/:wid  → Worker claim history
POST /api/policies/calculate-preview → Preview premium
```

### Insurer Routes (role: insurer)
```
GET   /api/insurer/config      → Get current config
PATCH /api/insurer/config      → Update config (within ranges)
GET   /api/dashboard/insurer   → Insurer dashboard data
GET   /api/claims/master-payload → Master payload for Guidewire
POST  /api/guidewire/submit    → Submit to Guidewire (mock)
```

### Admin Routes (role: admin)
```
GET/PATCH  /api/admin/cdi-weights    → CDI formula weights
GET/PATCH  /api/admin/fraud-rules    → Fraud rule thresholds
DELETE     /api/demo/reset           → Reset demo state
POST       /api/demo/simulate        → Simulation controls
```

### WebSocket Events
```
CLAIM_CREATED    → { claimId, workerId, zone, status }
CLAIM_UPDATED    → { claimId, newStatus, payoutAmount }
CDI_UPDATE       → { zone, cdi, threshold, triggered }
FRAUD_BLOCKED    → { workerId, flags[] }
PAYOUT_SENT      → { claimId, amount, txnId }
```

---

## ROLE MAP

```
Navneeth  → owns: role-based auth · SQLite · WebSocket · cron · H3 ·
                  admin panel backend · deploy · INTEGRATION_CONTRACT.md
           | delivers: running backend + 3 auth contexts + deployed URL
           | ✗: frontend screens · ML training · Razorpay account

Vimmy     → owns: insurer config panel logic · Razorpay payout ·
                  Guidewire schema · financial model · coverage doc · video
           | delivers: insurer config endpoints + 3 docs + video

Rahul     → owns: OWM live weather · cron wiring · bug fixes ·
                  persistence gate · daily cap · mass claim detector
           | delivers: auto-firing cron + live weather + fixed routes

Sherene   → owns: all 3 role-based UI contexts · CDI gauge ·
                  claim timeline · insurer config panel UI ·
                  admin panel UI · WS live feed · H3 map
           | delivers: 3 distinct-looking role UIs with live data

Sharvesh  → owns: sklearn ML premium · Groq explanations ·
                  3 new fraud rules · TCHC Python service ·
                  insurer risk scoring model
           | delivers: model_coefficients.json + Groq in claims +
                       enhanced fraud.js + tchc-checker.py
```

---

## MINIMUM WINNING BUILD

### Must Have (demo breaks without these)
- [ ] Worker onboarding → ML premium → policy activation
- [ ] Auto-trigger cron → CDI breach → zero-touch claim creation
- [ ] Fraud detection → ghost worker blocked → AI explanation
- [ ] Razorpay test payout → visible TXN ID
- [ ] Insurer config panel → adjustable parameter affects worker premium
- [ ] Guidewire master payload submit → mock GW response with LAE saved
- [ ] Demo reset button

### Nice to Have
- [ ] Leaflet H3 map with zone hexagons
- [ ] Tamil/Hindi toggle on worker app
- [ ] 5-day weather forecast driving premium adjustment
- [ ] TCHC Python microservice (FastAPI)

### Do NOT Build
- ~~Separate Blinkit/Zepto dashboard~~ (insurer covers this)
- ~~Bank onboarding portal~~
- ~~Native Android code~~ (Phase 3)
- ~~Blockchain/smart contracts~~

---

## QUALITY GATES

| Check | Owner | Gate |
|-------|-------|------|
| 3 routes look completely different | Sherene | Judge cannot mistake worker for insurer view |
| Insurer config change affects live system | Navneeth + Sherene | Premium rate change visible in next onboarding |
| CDI threshold from insurer config used in cron | Rahul | Threshold change reflected in terminal log |
| Admin CDI weights sum to 1.0 and propagate | Navneeth | Weight change → CDI formula output changes |
| SQLite survives restart | Navneeth | All data persists across server restarts |
| Zero-touch claim fires automatically | Rahul | Simulate rain → claims in DB, no manual API |
| Fraud simulation catches all 3 ghost types | Sharvesh | TELEPORTATION + SWARM + GNSS_ZERO_VARIANCE |
| Groq explanation in every claim | Sharvesh | ai_explanation non-null |
| Guidewire modal shows credible response | Vimmy + Navneeth | guidewire_claim_id + lae_saved in modal |
| Demo reset leaves clean state | Navneeth + Sherene | Second demo run identical to first |

---

## RISKS

- `⛔` Insurer config panel is a three-way dependency (Navneeth endpoints + Vimmy params + Sherene UI). Resolve by Day 2.
- `🔴` If insurer config is not built, insurer is a passive viewer and B2B story collapses. **Non-negotiable.**
- `🟡` Three UI aesthetics require upfront design decisions. Define themes in STEP 1, do not revisit.
- `🟢` TCHC FastAPI is optional for Phase 2 — fraud rules can live in fraud.js with simulated data.

# 📋 TEAM TECHNICAL ASSIGNMENTS: PHASE 2 SPRINT

> **Architecture**: Single React app · 3 role-based contexts · One backend · One deployment
> **Sprint**: March 31 → April 2 (internal) | April 4 (submission)

---

## 👑 NAVNEETH (Master Node)
**Owns**: Role-based auth · SQLite schema · WebSocket · Cron · H3 · Admin backend · Deploy · INTEGRATION_CONTRACT.md

| Step | Task | Delivers | Blocks |
|------|------|----------|--------|
| 1 | Role-based auth system | POST /api/auth/login · middleware · 3 credentials | Sherene (frontend routes) |
| 2 | SQLite upgrade + bug fixes | insurer_config table · fix payout/timeSlot | Rahul (cron) · Vimmy (config) |
| 3 | Insurer config endpoints | GET/PATCH /api/insurer/config | Sherene (config panel UI) |
| 4 | WebSocket + Cron + Admin | WS broadcast · config-aware cron · admin CRUD · demo reset | Sherene (admin panel) |
| 5 | H3 + Master payload + Deploy | H3 zones · GW submit · Render URL · CONTRACT.md | Everyone (integration) |

---

## 💸 VIMMY (Enterprise Handoff Node)
**Owns**: Insurer config panel logic · Razorpay · Guidewire schema · 3 docs · Video

| Step | Task | Delivers |
|------|------|----------|
| 1 | COVERAGE_POLICY.md | Coverage scope + exclusions doc |
| 2 | FINANCIAL_MODEL.md | Unit economics + loss ratios |
| 3 | GUIDEWIRE_INTEGRATION.md + schema | GW integration doc + JSON schema |
| 4 | Insurer controls doc + Razorpay | INSURER_CONTROLS.md + payout-razorpay.js |
| 5 | Demo video | ≤2min video covering all 3 role views |

---

## 🌐 RAHUL (Oracle Node)
**Owns**: OWM live weather · Cron wiring · Bug fixes · Persistence gate · Daily cap · Mass claim

| Step | Task | Delivers |
|------|------|----------|
| 1 | Bug fixes + OWM key | Patched payout + time slot + OWM API key |
| 2 | Live weather service | weather-live.js with coordinate-based OWM |
| 3 | Config-aware cron + persistence gate | Cron reads threshold from DB · 2-cycle gate |
| 4 | Daily cap + mass claim detector | 8h cap · MASS_CLAIM_EVENT rule |

---

## 🖥️ SHERENE (UI Node)
**Owns**: All 3 role UIs · CDI gauge · Claim timeline · Insurer config panel UI · Admin panel UI · WS feed · H3 map

| Step | Task | Delivers |
|------|------|----------|
| 1 | Tailwind + role-based routing | Login screen · /worker /insurer /admin · 3 themes |
| 2 | Worker PWA - all screens | Onboarding · Policy card · CDI gauge · Claim timeline |
| 3 | Insurer dashboard | Config panel · Zone risk · Claims feed · GW submit modal |
| 4 | Admin panel + polish | CDI weights · Fraud toggles · Simulation · H3 map |

---

## 🧠 SHARVESH (AI/ML Node)
**Owns**: sklearn ML · Groq explanations · 3 fraud rules · TCHC service · Risk scoring

| Step | Task | Delivers |
|------|------|----------|
| 1 | Synthetic training data | 500-row training_data.csv |
| 2 | Train + export model | model_coefficients.json + premium-predictor.js |
| 3 | Groq claim explanations | groq-explainer.js · ai_explanation in claims |
| 4 | Fraud upgrades + TCHC | TELEPORTATION + SWARM + GNSS rules + optional FastAPI |

---

## ⛔ CRITICAL DEPENDENCIES

```
Navneeth STEP 3 (insurer config endpoints)
  → unblocks Sherene STEP 3 (insurer config UI)
  → unblocks Rahul STEP 3 (config-aware cron)
  → unblocks Vimmy STEP 4 (insurer controls doc)
```

**Day 1 priority**: Navneeth completes STEPs 1-3. This unblocks 3 people across 4 tasks.

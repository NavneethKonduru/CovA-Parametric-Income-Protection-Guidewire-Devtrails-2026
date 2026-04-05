---
title: "CovA — Design Reasoning: Why Every Architectural Decision Was Made This Way"
description: "The honest engineering and business reasoning behind every major design decision in CovA — including the decisions we debated, the trade-offs we accepted, and the limitations we acknowledge."
hackathon: "Guidewire DEVTrails 2026"
theme: "Gig Economy"
category: "Q-Commerce Insurance"
tags:
  - guidewire
  - devtrails-2026
  - gig-economy
  - reasoning
  - architecture
  - parametric-insurance
  - design-decisions
team: "Team CovA"
status: "complete"
date: "2026"
version: "2.0.0"
type: "reasoning"
---

# CovA — Design Reasoning

> *This document explains why we built CovA the way we built it. Not the features — the thinking. Every major decision was debated. Most had a harder path we considered and rejected. We document both.*

📋 [README.md](./README.md) · 🏗️ [ARCHITECTURE.md](./ARCHITECTURE.md) · 🛡️ [COVERAGE_EXCLUSIONS.md](./COVERAGE_EXCLUSIONS.md)

---

## 1. Why Parametric Insurance — Not Indemnity

**The decision:** CovA uses a parametric trigger (CDI threshold breach) rather than indemnity (worker files a claim for actual loss suffered).

**The alternative we considered:** Indemnity-based micro-insurance — worker submits proof of income loss (screenshot of zero orders, platform notification), adjuster verifies, payout issued.

**Why we rejected it:** The adjuster. A ₹200 payout with ₹2,000 in adjudication cost is a 10:1 loss on every claim. The math is not repairable at any scale. The product cannot exist at this ticket size with human verification. Parametric is not a design preference — it is the only financially viable model for micro-ticket insurance.

**The trade-off we accepted:** Basis risk. There will be cases where the CDI breaches 0.60 but a specific worker was not actually affected (they were already home). There will be cases where a worker is genuinely disrupted but the CDI doesn't breach because one of the three signal components didn't move fast enough. This is the fundamental limitation of parametric insurance. We have minimised it with the CDI composite (three independent signals) and the 15-minute presence-check requirement — but we have not eliminated it.

---

## 2. Why the CDI Uses Three Signals (Not Just Weather)

**The decision:** CDI = 40% weather + 35% demand drop + 25% peer activity.

**The alternative we considered:** Pure weather trigger — rain above 50mm/hr = payout. Simple, auditable, defensible.

**Why we rejected it:** Rain does not equal income loss. Zepto continues operating in moderate rain. Workers continue delivering. A pure weather trigger would pay out during light monsoons when most workers are still earning. The demand drop signal is the actual income signal — if orders are not being placed or fulfilled, that is income loss, not rain.

The three-signal composite is what makes CovA actuarially defensible. It means the product only triggers when: (a) external conditions are dangerous, AND (b) the platform has effectively stopped, AND (c) workers are actually not working. All three. Not just one.

**The trade-off we accepted:** Complexity. Three signals means three API dependencies. If OpenWeatherMap has an outage, weatherScore defaults to 0 — and the CDI cannot breach on demand alone. We have a polling fallback architecture for this, but it adds system complexity. We chose that over an oversimplified trigger.

---

## 3. Why the 2-Cycle Persistence Gate

**The decision:** CDI must breach 0.60 for two consecutive 30-second cycles before claims trigger.

**Why this exists:** At 5,000 enrolled workers, one false positive event pays out approximately ₹17 lakh. Weather API sensor spikes (a single anomalous reading) happen roughly 3–4 times per month. Without the gate, we would have 3–4 false payout events per month, each costing ₹17 lakh. That is ₹51–68 lakh/month in false payouts. The gate costs 30 seconds of delay. It saves the product.

**The alternative we considered:** Removing the gate for speed. We want the 5-minute payout story. A 30-second gate delay is barely noticeable in the end-to-end timeline (CDI breach at T+0, gate passes at T+30, claims processed by T+38, UPI credit at T+5:00).

**Regulatory basis:** IRDAI's parametric sandbox guidelines and global parametric insurance industry practice (AXA Climate, Etherisc) both use a minimum 2-consecutive-reading confirmation rule. The gate is not just good engineering — it is industry standard.

---

## 4. Why One Master Payload Instead of Individual Claims

**The decision:** CovA submits one ClaimCenter payload for all N workers in a disruption event — not N individual payloads.

**The alternative we considered:** Per-worker claim submission. Standard ClaimCenter FNOL flow for each affected worker.

**Why we rejected it:** ClaimCenter is designed for individual claim lifecycle management. Sending 500 individual claims creates 500 separate ClaimCenter records, each requiring lifecycle tracking, adjuster assignment, and manual review queuing. At ₹2,000 LAE per claim, that is ₹10,00,000 in adjudication costs for a ₹1.65 lakh payout event.

The Master Payload is the architectural innovation. It treats the disruption event — not the individual worker — as the primary claims unit. One event. One record. One approval. All 500 workers in the `validatedClaims` array. The insurer's claims team sees one clean fleet record, not 500 individual entries.

**The implementation challenge:** We had to design a custom `FLEET_PARAMETRIC_BATCH` claim type that ClaimCenter's API can accept. This required mapping CovA's internal claim schema to Guidewire's standard claim schema — including the `lossDate`, `reportedDate`, `batchSummary`, and per-worker `validatedClaims` array. The full schema is in ARCHITECTURE.md.

---

## 5. Why SQLite (Not PostgreSQL)

**The decision:** SQLite with WAL mode, not PostgreSQL + PostGIS.

**The alternative we considered:** PostgreSQL + PostGIS for native H3 hex-grid spatial indexing — as documented in the Phase 1 architecture. This is what production CovA would use.

**Why we used SQLite for Phase 2:** Render.com single-deployment constraint. The Phase 2 requirement is to demonstrate the full automated pipeline — onboarding, premium, CDI triggers, fraud validation, claims processing, Guidewire submission — with a single deployable unit. PostgreSQL requires a separate database service, adds connection pooling complexity, and creates a second point of failure for a judged demo. SQLite with WAL mode handles our 110-worker simulation load without issue.

**Phase 3 migration path:** `backend/data/db.js` is abstracted behind a query interface. Migrating to PostgreSQL requires only replacing the `db.js` adapter — no changes to any engine or route file. The schema is PostgreSQL-compatible (no SQLite-specific types used).

---

## 6. Why a Web App in Phase 2, Not Mobile

**The decision:** Phase 2 delivers a React web app (PWA), not a native Android app.

**The alternative we considered:** Skipping to native Android with Flutter for Phase 2 — getting hardware GNSS access earlier.

**Why we chose web first:** The TCHC hardware layer is Phase 3 because it requires Android's `GnssStatus.Callback` and `TelephonyManager` APIs — which are only accessible from native code. Building native Android in Phase 2 would mean 6 weeks of mobile development for a feature we couldn't properly validate in a browser-based demo environment.

Instead, we built the complete insurance platform logic — CDI engine, fraud rules, Guidewire integration, ML premium, Groq AI — in a fully functional web app that demonstrably works end-to-end. The hardware GNSS layer is simulated accurately in the fraud injector (ghost workers get zero GNSS variance). Phase 3 replaces the simulation with the real hardware read.

**The core principle:** Demonstrate the insurance product, not the mobile platform. Phase 2 judges can evaluate the CDI logic, the Guidewire integration, and the zero-touch pipeline without installing an APK. Phase 3 delivers the hardware defence.

---

## 7. Why Multi-Peril (Not Single-Peril Rainfall Only)

**The decision:** CovA covers five peril types under one CDI composite.

**The alternative we considered:** Starting with rainfall only — the highest-frequency peril (3 events/year/worker) — and adding others in later phases.

**Why we built multi-peril from the start:** The business case requires it. A single-peril policy (rainfall only) generates 3 CDI events/year at ₹200 average = ₹600 in annual expected claims, against ₹2,548 in premium. That is a 23.5% loss ratio — superficially profitable, but so low that insurers would doubt the pricing and workers would feel they never benefit.

The multi-peril composite at 6 events/year/worker creates a 71.4% loss ratio — which is exactly where the product should sit. Workers experience payouts 6 times per year on average. Insurers run a profitable book. The product feels real to both parties.

**The CDI innovation:** The composite index prevents multi-peril double-counting. A simultaneous monsoon + traffic gridlock = one CDI breach, not two payouts. This is actuarially critical — without it, the 6-event annual frequency would instead be 8–10, and the loss ratio would exceed 100%.

---

## 8. Why Weekly Premium (Not Per-Shift or Daily)

**The decision:** Weekly micro-premium, auto-deducted from platform wallet. Not per-shift (₹2–3 per shift start) or daily (₹7/day).

**The alternative we considered:** Per-shift premium — most granular, directly tied to earning period. If you don't work, you don't pay.

**Why we chose weekly:** Platform wallet mechanics. Q-commerce platforms pay workers weekly or bi-weekly, with micro-deductions throughout the week. A per-shift deduction (18–22 deductions per week) creates wallet reconciliation overhead for the platform's finance team and introduces payment failure risk on every shift start.

Weekly deduction = 1 transaction per worker per week. For a 5,000-worker fleet: 5,000 weekly transactions versus 90,000–110,000 per-shift transactions. The operations cost difference is significant at scale.

**The trade-off:** A worker who does one shift per week pays the same ₹49 as one who does 5 shifts. This creates a mild adverse selection pressure (casual workers are over-charged relative to their risk exposure). The archetype multiplier partially corrects this — casual workers pay ₹19.60–₹31.85, heavy-peak workers pay ₹39.20–₹63.70. But it is not a perfect solution.

---

## 9. Why Groq LLM for Claim Explanations

**The decision:** Every auto-generated claim gets a plain-language AI explanation (Groq LLaMA-3 70B).

**The alternative we considered:** Template-based explanations. "Your zone experienced heavy rainfall. CDI breached threshold. Payout of ₹X processed."

**Why we chose LLM:** Trust and comprehension. A delivery worker reading a payout notification needs to understand why they received money — not to understand the CDI formula, but to trust the system. An LLM can generate: *"Heavy rain hit Whitefield at 14:30. Zepto suspended deliveries in your zone. Our sensor picked up that 68 of your fellow riders also stopped working. You were confirmed in the zone. ₹200 was sent to your wallet. This is your income protection working."*

That message builds trust. A template message builds compliance. For a product that requires workers to stay enrolled, trust is the most important metric.

**Implementation note:** Groq is already live in Phase 2. It is not simulated. Every claim generated in the demo has a real Groq API call behind the `ai_explanation` field.

---

## 10. Limitations We Acknowledge

**Basis risk:** The CDI will occasionally pay workers who weren't genuinely disrupted, and occasionally miss workers who were. This is intrinsic to parametric insurance. We have minimised it but not eliminated it.

**Simulation vs. production TCHC:** The Phase 2 TCHC is software-simulated. Ghost workers are rejected because the fraud injector sets their GNSS variance to zero — not because we actually read their baseband hardware. Phase 3 delivers the real hardware validation.

**Guidewire integration is against a mock endpoint:** Our `POST /api/guidewire/submit` calls a Guidewire-shaped mock API, not a live GWCP ClaimCenter sandbox. The payload schema is exact — the endpoint is not. Phase 3 requires GWCP sandbox credentials.

**SQLite at production scale:** WAL-mode SQLite handles our 110-worker simulation. At 50,000 workers with 20 concurrent CDI evaluations, it will not. Phase 3 migration to PostgreSQL + PostGIS is documented and the codebase is architected for it.

**Weather API rate limits:** OpenWeatherMap free tier supports 60 calls/minute. Our 30-second polling across 3 zones uses 6 calls/minute. At production scale (30+ zones across 5 cities), we require the Professional API tier (₹8,000/month budgeted in FINANCIALS.md).

---

📋 [README.md](./README.md) · 🏗️ [ARCHITECTURE.md](./ARCHITECTURE.md) · 💰 [FINANCIALS.md](./FINANCIALS.md) · 🛡️ [COVERAGE_EXCLUSIONS.md](./COVERAGE_EXCLUSIONS.md)

---
title: "CovA — Coverage Scope, Explicit Exclusions & Policy Terms"
description: "Complete definition of what CovA covers, what it categorically excludes, and the actuarial and regulatory rationale for each boundary. This document directly addresses the parametric product definition requirements for IRDAI-compliant micro-insurance."
hackathon: "Guidewire DEVTrails 2026"
theme: "Gig Economy"
category: "Q-Commerce Insurance"
tags:
  - guidewire
  - devtrails-2026
  - gig-economy
  - q-commerce
  - micro-insurance
  - coverage-exclusions
  - parametric-insurance
  - irdai
  - policy-terms
team: "Team CovA"
status: "complete"
date: "2026"
version: "2.0.0"
type: "coverage-policy"
---

# CovA — Coverage Scope, Explicit Exclusions & Policy Terms

> *"A parametric insurance product without explicit exclusions is not an insurance product. It is an open-ended financial liability."*
> *This document corrects the only gap in our Phase 1 submission — and does so with actuarial precision.*

📋 [README.md](./README.md) · 💰 [FINANCIALS.md](./FINANCIALS.md) · 🏗️ [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 1. What CovA Insures: A Single, Precise Definition

**CovA insures the loss of delivery income earned by a registered Q-commerce delivery worker during a parametrically-confirmed external disruption event in their active coverage zone.**

Three conditions must be simultaneously true for a payout to trigger:

1. **Parametric trigger confirmed:** The Composite Disruption Index (CDI) in the worker's zone must breach ≥ 0.60 for two consecutive 30-second evaluation cycles (i.e., a sustained minimum of 60 seconds — not a transient spike).
2. **Presence confirmed:** The worker must have had an active telemetry ping within the coverage zone within 15 minutes prior to the CDI breach.
3. **Fraud validation passed:** The worker must pass all three layers of the TCHC Integrity Layer (GNSS SNR attestation, temporal entropy check, cellular vectoring check).

If all three conditions are met, the payout is automatic, mathematical, and proportional to verified hours lost.

---

## 2. Covered Perils

CovA operates a **multi-peril Composite Disruption Index (CDI)**. Five peril categories contribute to the CDI — but payouts are not additive when multiple perils co-occur. The CDI composite prevents double-counting: a simultaneous monsoon + traffic gridlock is one CDI breach, not two payouts.

| # | Peril | CDI Weight | Trigger Oracle | Trigger Threshold | Avg Annual Events/Worker |
|---|---|---|---|---|---|
| 1 | **Heavy Rainfall / Urban Flooding** | 40% | OpenWeatherMap | Precipitation ≥ 50mm/hr in covered zone | 3.0 events |
| 2 | **Extreme Heatwave** | 10% | IMD / OpenWeatherMap | Temperature ≥ 38°C + confirmed platform stand-down | 0.6 events |
| 3 | **Severe Traffic Gridlock** | 20% | TomTom Traffic API | Average zone speed ≤ 5 km/hr | 1.2 events |
| 4 | **Civic Curfew / Section 144** | 13% | Government notification (confirmed via platform API) | Area restriction declared by state authority | 0.8 events |
| 5 | **Platform-Declared Outage** | 17% | Q-commerce platform API | Dark store closure / platform emergency suspension | 0.4 events |

**CDI Formula:**
```
CDI = (0.40 × weatherScore) + (0.35 × demandDropScore) + (0.25 × peerActivityScore)

Where:
  weatherScore     = normalised peril signal (0–1) from Oracle APIs
  demandDropScore  = (1 − currentOrders/historicalBaseline) for the zone
  peerActivityScore = (1 − activeWorkers/registeredWorkers) in the zone

CDI ≥ 0.60 sustained for 2 cycles → Disruption confirmed → Claims triggered
```

**Payout formula:**
```
Payout = hoursLost × workerHourlyRate × timeMultiplier × CDI_factor

Where:
  hoursLost        = duration of CDI breach (capped at 8 hours per rolling 24h)
  workerHourlyRate = worker's declared platform hourly rate (default ₹85/hr)
  timeMultiplier   = 1.5× (peak: 12:00–14:00 and 19:00–22:00), 0.5× (active), 0× (off)
  CDI_factor       = normalised CDI score at time of breach (0.60–1.00 → 0.70–1.00 mapped)
```

---

## 3. Explicit Coverage Exclusions

The following are **categorically and permanently excluded** from all CovA policies. For each exclusion, the document provides: the regulatory basis, the actuarial necessity, and the specific claim scenario it prevents.

### Group 1: Medical & Life Risks

**1.1 — Personal Accident / Bodily Injury**

CovA does not cover medical expenses, hospitalisation, disability payments, or any physical harm suffered by a delivery worker — regardless of whether the harm occurs during a covered disruption or not.

*Regulatory basis:* Personal accident insurance in India is regulated separately under the IRDAI Personal Accident Product Guidelines (2019) and requires distinct underwriting, claims investigation, and medical assessment. CovA holds no license for this product class.

*Actuarial necessity:* Per-injury claims require physical evidence review and human adjuster involvement. A single personal injury claim processed under CovA's zero-LAE pipeline would consume the entire LAE budget for 100 parametric claims. Including this risk would raise the combined ratio above 130%, making the product economically non-viable.

*Specific scenario excluded:* Arjun falls off his bike during a monsoon and fractures his wrist. The medical bills are **not covered** under CovA — even though the monsoon was a CDI-triggering event. His income lost while hospitalised is also not covered (see 1.3).

**1.2 — Health Insurance / Medical Expenses**

CovA does not cover doctor visits, hospitalisation, diagnostics, medication, or any other medical expenditure incurred by the worker or their dependents.

*Reason:* Health insurance is governed by IRDAI Health Insurance Regulations (2016) and requires a separate regulatory framework, network of hospitals, TPA partnerships, and actuarial tables that are entirely distinct from parametric income-protection products.

**1.3 — Life Insurance / Death Benefit**

CovA does not provide any death benefit, terminal illness benefit, or survivor payment in the event of a worker's death.

*Reason:* Life insurance requires an IRDAI life insurance license (CovA operates under general insurance framework), separate mortality pricing tables, and long-term reserve commitments incompatible with a weekly micro-premium model.

---

### Group 2: Asset & Motor Risks

**2.1 — Vehicle Damage / Loss**

CovA does not cover damage to, theft of, or loss of the delivery worker's vehicle (motorcycle, cycle, e-bike, or any other delivery conveyance) — even if the vehicle is damaged during a CDI-covered disruption event.

*Regulatory basis:* Motor vehicle insurance is regulated separately under the IRDAI Motor Vehicles Act and the Insurance Act 1938 (Motor provisions). CovA is not a motor insurer.

*Actuarial necessity:* Vehicle repair costs average ₹8,000–₹35,000 per incident in India. Including vehicle damage would increase the expected annual claims cost per worker from ₹1,200 to ₹5,000+, destroying the premium-to-payout balance.

**2.2 — Asset / Equipment Loss**

CovA does not cover loss or damage to any equipment owned by the worker, including mobile phones, delivery bags, or personal protective equipment.

---

### Group 3: Behavioural & Subjective Risks

**3.1 — Voluntary Absence**

CovA does not pay for income lost when a worker voluntarily chooses not to work during a period that would otherwise have been a shift, regardless of CDI levels or weather conditions.

*Why:* A parametric trigger cannot distinguish between a worker who stopped working because of a flood (covered) and a worker who stopped working because they chose to (not covered). CovA resolves this through zone presence confirmation — a worker must have been telemetry-active in the zone prior to the disruption to be eligible.

**3.2 — Low Demand / Slow Periods**

CovA does not cover reduced earnings resulting from low order volumes during normal operating conditions, platform algorithm changes, or seasonal demand troughs. The CDI's demand component only triggers when order volumes drop sharply and suddenly in combination with other peril signals — not for gradual slowdowns.

*Actuarial necessity:* Gradual economic decline has no natural parametric trigger point and is unboundable. Including it would create an open-ended liability incompatible with reinsurance modelling.

**3.3 — Earnings Loss from Platform Rating Penalties**

CovA does not cover income reduction caused by a platform downgrading a worker's delivery tier, imposing penalties for late deliveries, or any other platform-specific rating action against the individual worker.

*Reason:* These events are within the control of the worker and/or platform, and cannot be confirmed by external Oracle signals. They are subjective, bilateral, and non-parametric.

---

### Group 4: Geographic, Temporal & Administrative Exclusions

**4.1 — Losses Outside Registered Coverage Zones**

CovA coverage is geographically bounded to the worker's registered delivery zone (Zone A: Koramangala, Zone B: Whitefield, Zone C: Indiranagar — with production expansion via Uber H3 Resolution 9 spatial indexing). Income lost while the worker is operating outside their registered zone is not covered.

*Why:* Zone-level CDI computation is the core actuarial unit. We cannot compute a CDI for a worker who is outside the zone for which the CDI is calculated.

**4.2 — Multi-Platform Concurrent Claims (Anti-Stacking Clause)**

A worker registered on both Zepto and Blinkit cannot receive simultaneous payouts from both platform fleet policies. The UWID (Unified Worker Identifier — a SHA-256 hash of the worker's verified mobile number) enforces single-policy activation at any given time. The secondary platform policy automatically moves to `SUSPENDED` state when the primary is active.

*Why:* Without this exclusion, a worker could theoretically receive double income protection for the same hour of disruption. This is a form of moral hazard that would inflate the loss ratio above viable levels.

**4.3 — Claims During Policy Lapse**

No claims are valid during a lapsed policy period. A policy lapses 72 hours after a failed weekly premium deduction. No backdated claims for the lapsed period are accepted upon reinstatement.

*Why:* Standard insurance principle of insurable interest and continuous coverage. Allowing backdated claims post-reinstatement would create adverse selection — workers would allow policies to lapse and re-enrol only when a disruption is imminent.

**4.4 — Claims Blocked by TCHC Fraud Validation**

Workers whose claim is blocked by any of the three TCHC validation layers (GNSS SNR zero-variance, teleportation velocity anomaly, or cellular vectoring failure) are **permanently ineligible** for payout for that specific disruption event. They may remain enrolled in the policy — but their claim for the event in question is void.

*Why:* The TCHC validation is the actuarial backbone of the product. Overriding it for any claim — even one that turns out to be genuine — would undermine the statistical integrity of the entire fraud model.

**4.5 — Income from Non-Delivery Sources**

CovA insures delivery income only — the per-delivery earnings and shift-hour income from Q-commerce platform activity. Tips, bonuses, referral income, non-platform freelance income, or income from secondary employment are outside scope.

---

## 4. The Exclusions Are the Product

This is worth stating explicitly for evaluators: **these exclusions are not a list of things CovA failed to build. They are the precise boundary conditions that make the product actuarially sound, regulatory-compliant, and economically viable.**

Without exclusions 1.1–1.3 (medical and life), CovA's loss ratio exceeds 200%. Without exclusion 3.1 (voluntary absence), adverse selection destroys premium adequacy within two monsoon seasons. Without exclusion 4.2 (anti-stacking), a dual-platform worker can receive 2× income protection for the same disruption hour.

Each exclusion exists because of a specific actuarial, regulatory, or fraud-prevention necessity — not because of product laziness.

| Exclusion | If Removed — Loss Ratio Impact |
|---|---|
| Personal accident / bodily injury | +60–80 percentage points |
| Vehicle damage | +40–60 percentage points |
| Voluntary absence (no presence-check) | +30–40 percentage points |
| Multi-platform concurrent claims | +15–25 percentage points |
| TCHC fraud blocking | +35–50 percentage points |

> Full loss ratio modelling at each sensitivity level: [FINANCIALS.md](./FINANCIALS.md)

---

## 5. Policy Term Summary

| Parameter | Value |
|---|---|
| Policy type | Group / Fleet Parametric |
| Policyholder | Q-commerce platform operator (e.g., Zepto Technologies Pvt. Ltd.) |
| Covered parties | Registered delivery workers enrolled under the fleet policy |
| Premium frequency | Weekly (auto-deducted from platform partner wallet) |
| Average premium | ₹49/worker/week (ML-calculated, zone and archetype adjusted) |
| Coverage period | Rolling weekly, auto-renewed |
| Grace period on lapse | 72 hours |
| Payout cap | 8 hours of lost income per rolling 24-hour period |
| Cool-down period | 2 hours post-approved disruption block |
| Exclusion list | 12 specific categories across 4 groups (see above) |
| Regulatory framework | IRDAI Parametric/Index-Based Insurance; India Social Security Code 2020 |
| Privacy | DPDP Act 2023 compliant |
| Jurisdiction | India — Tier-1 cities (Bangalore, Mumbai, Delhi NCR, Chennai, Hyderabad) |

---

📋 [README.md](./README.md) · 💰 [FINANCIALS.md](./FINANCIALS.md) · 🏗️ [ARCHITECTURE.md](./ARCHITECTURE.md) · 🧠 [REASONING.md](./REASONING.md)

# CovA — Coverage Policy & Terms

This document outlines the operational terms, lapse protocols, and data privacy commitments for policies managed under the CovA parametric platform.

---

## 1. Disruption Coverage Clauses

**Trigger Conditions:**
A payout is triggered when the Composite Disruption Index (CDI) exceeds 0.70 for at least 30 consecutive minutes (2 evaluation cycles) within a registered delivery zone. The CDI is composed of:
1. Weather Signal (Hyper-local precipitation/temperature)
2. Demand Signal (Order volume vs. historical baseline)
3. Peer Activity Signal (Percentage drop in active delivery partners in the zone)

**Limits:**
- **Daily Cap:** Maximum payout of 8 hours of lost income per rolling 24-hour period.
- **Cool-down:** No consecutive claims allowed within a 2-hour window following an approved disruption block.
- **Geographic Restrictions:** The worker must have telemetry pinged within the covered zone 15 minutes prior to the disruption event to prevent "rain-chasing" behavior.

---

## 2. Multi-Platform Exclusivity

CovA employs a Unified Worker Identifier (UWID) generated as a one-way secure hash of the worker’s verified mobile number (SHA-256).

- **Anti-Stacking Clause:** A worker may not hold simultaneous active policies across multiple delivery platforms (e.g., holding a covered session on Zepto and Swiggy simultaneously).
- **Enforcement:** If the UWID registry detects an overlapping active enrollment, the secondary policy is automatically held in a 'Suspended' state, and no premiums are deducted by the secondary platform until the primary policy is concluded or transferred.

---

## 3. Lapse Protocols & Wallet Balances

Premiums are collected on a recurring weekly basis through micro-deductions from the delivery platform’s partner wallet.

**Lapse:**
- **Grace Period:** 72 hours from the failed deduction attempt.
- **Suspension:** If the wallet balance remains insufficient after 72 hours, the policy status moves to `lapsed`.
- **Reinstatement:** Coverage automatically reinstates upon the next successful premium deduction. No back-dated claims are valid during the elapsed period.

---

## 4. DPDP Act 2023 Compliance Clause

CovA is fully compliant with the Digital Personal Data Protection (DPDP) Act of 2023. We ensure absolute privacy and security of worker data:

1. **Minimization Strategy:** CovA does not ingest or store Personally Identifiable Information (PII) such as plaintext names or phone numbers directly within the core risk engine. We use the one-way hashed UWID.
2. **Telemetry Ephemerality:** Live location telemetry is processed entirely in-memory at the edge/platform API level. We do not store historical pathing data over 24 hours unless an anomaly triggers a manual fraud flag, at which point an 8-day retention window applies exclusively for auditor review.
3. **Data Principal Rights:** All workers hold the explicit right to view, correct, and erase their data associated with the Guidewire ClaimCenter via a one-click process in their platform's partner app.
4. **Purpose Limitation:** Any telemetry shared with CovA by the delivery platform is strictly restricted to executing the parametric contract and confirming geographical presence. Data will never be sold or utilized for targeted marketing.

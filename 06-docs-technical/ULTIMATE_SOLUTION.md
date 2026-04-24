# 🏆 ClaimCrypt: Ultimate Solution Technical Specification

## I. System Overview
ClaimCrypt is a "Full-Stack" parametric insurance middleware. It bridges the gap between the volatile reality of a Q-Commerce delivery partner and the rigid legacy requirements of Guidewire-based insurers.

## II. Detailed Persona Scenarios & Workflows

### Scenario 1: The "Bangalore Monsoon" Lockdown
*   **Persona:** Arjun, a Zepto delivery partner in HSR Layout.
*   **Event:** A sudden cyclonic storm hits at 7:30 PM (Peak Dinner Hour).
*   **TCHC Trigger:** 
    1.  **Inverse-Oracle:** Zepto app displays "Deliveries Suspended" for the HSR Dark Store.
    2.  **Hardware Attestation:** Arjun’s phone records a 60-second drop in GNSS SNR (covered by shelter) and a 3mbar drop in Barometric pressure.
    3.  **Kinematic Handoff:** Arjun’s cell tower logs show he triggered 4 towers in the last 15 minutes, proving he was active.
*   **Payout:** Guidewire BillingCenter triggers a UPI transfer for every minute the store is closed, at Arjun’s peak hourly rate.

### Scenario 2: The "Fraud Syndicate" Attempt
*   **Persona:** 50 users in a Telegram group in Delhi.
*   **Event:** They use mock-location apps to claim they are stranded in a flooded zone in Chennai.
*   **Detection:**
    1.  **Temporal Entropy:** All 50 claims appear within a 5-second window with identical GPS coordinates.
    2.  **Hardware Fail:** 0.0s "Time to Shelter" (instant teleportation) and 0 GNSS SNR (indoor basement).
*   **Action:** Claims auto-rejected; device IDs blacklisted across the Guidewire PolicyCenter database.

## III. AI/ML Deep Dive

### 1. Dynamic Premium Engine (DPE)
*   **Function:** Calculates individual weekly premiums.
*   **Parameters:** 
    *   `Global_Risk (Season)`
    *   `Local_Risk (Hex-Grid Topography)`
    *   `Worker_Risk (Historical Active Hours)`
*   **Model:** Bayesian Hierarchical Model.

### 2. Fraud Entropy Classifier (FEC)
*   **Function:** Differentiates between cluster-wide real events vs. coordinated attacks.
*   **Model:** Random Forest Classifier trained on previous "Sync-Attack" patterns vs. "Chaotic-Natural" patterns.

## IV. Technical Implementation Plan

| Milestone | Deliverables |
|-----------|--------------|
| **Phase 1 (Now)** | Finalize TCHC Logic & Guidewire CIF Schema. |
| **Phase 2 (W3-4)** | Build Node.js TCHC Engine + Mock Platform Scrapers. |
| **Phase 3 (W5-6)** | Develop the "God-Mode" Insurer Dashboard & BillingCenter UPI Hooks. |

## V. Choice of Platform: Hybrid Strategy
We have chosen a **Hybrid Implementation (Mobile SDK + Web Dashboard)**.
*   **Why Mobile for Workers?** Required to access hardware-level APIs (Barometer, GNSS SNR, Telephony) that are strictly prohibited/unavailable in Browser environments.
*   **Why Web for Insurers?** Guidewire Admins require a high-resolution, multi-panel Command Center for risk monitoring, which is ergonomically suited for desktop browsers.

# 🚀 CLAIMCRYPT: MASTER SOLUTION & ARCHITECTURE GUIDE

This document serves as the absolute source of truth for the ClaimCrypt phase 2 & 3 build. It defines exactly what is being built, who uses what, how the user journey flows, and how every single disruption scenario is mathematically validated.

---

## 🏗️ 1. WHAT ARE WE BUILDING? (The Product Suite)

To win this hackathon, you are not building one single app. You are building an **Enterprise Ecosystem** consisting of three interconnected parts:

### A. The ClaimCrypt Edge App (Mobile)
*   **What is it:** A lightweight native Android or Flutter app.
*   **Who downloads it:** The Gig Economy Worker (e.g., Zepto/Swiggy Delivery Partner).
*   **What it does:** It runs in the background. It allows the worker to buy weekly parametrized insurance, and quietly transmits their GPS location and raw physical baseband data (`GnssStatus` C/N0 satellite signals) to the backend.

### B. The ClaimCrypt TCHC Core (Backend)
*   **What is it:** The brain of the operation. A Node.js (or Python/FastAPI) server connected to a PostgreSQL (Supabase) database with PostGIS for spatial queries.
*   **Who uses it:** No humans. It is entirely automated.
*   **What it does:** Ingests the telemetry streams from thousands of Edge Apps. It houses the **AI Dynamic Pricing Engine** and the **Fraud Rules Engine**. It talks to external Weather APIs and to Razorpay for instant payouts. 

### C. The Command Center (Web Dashboard)
*   **What is it:** A visually stunning React/Next.js web application.
*   **Who uses it:** Insurance Executives, Fraud Analysts, and Guidewire System Administrators. This is the primary screen you will show the judges.
*   **What it does:** Visualizes the entire system. It shows a live map of all workers, tracks incoming storm systems, and visually demonstrates the Fraud Engine blocking synthetic spoofers while approving genuine workers. 

---

## 🛤️ 2. THE COMPLETE USER JOURNEY

Here is exactly what happens, step-by-step, during the Phase 2 & 3 Demo:

### Phase A: Onboarding & AI Premium Calculation (Phase 2 Focus)
1.  **Registration:** The Worker opens the Edge App and registers their phone number and UPI ID (for instant payouts).
2.  **AI Pricing:** The app pings the backend with their current location (e.g., Koramangala, Bangalore).
3.  **Dynamic Policy Generation:** The backend checks the historical risk of that specific H3 Hex-Grid using your AI model. Since Koramangala is prone to flooding, the AI returns a "High Risk Weekly Premium: ₹65". If they were in a safe zone, it would be ₹25. 
4.  **Purchase:** The worker taps "Activate Coverage". The policy is live.

### Phase B: The Disruption Event (The Trigger)
1.  **The Storm:** A massive (simulated) monsoon hits Bangalore. 
2.  **Automated API Ingestion:** Your backend constantly polls the **OpenWeatherMap API**. Suddenly, the API reports `Precipitation > 50mm` in the Koramangala grid.
3.  **Zero-Touch Activation:** No human has manually done anything. The backend automatically flips the state of that specific Hex-Grid to **"DISRUPTION ACTIVE"**.

### Phase C: Fraud Validation & The Grid-Lock Defense (Phase 3 Focus)
Before paying anyone, the backend (TCHC Core) must mathematically prove the worker was actually trapped in the flood. This prevents organized syndicates from draining the premiums.

1.  **Telemetry Ingestion:** The backend checks all active workers inside the flooded Hex-Grid.
2.  **Hardware Physics Check:** It checks the `GnssStatus` (C/N0) variance in their payload. 
    *   *Real Worker:* Has bouncing satellite variance because they are outside fighting the rain.
    *   *GPS Spoofer (Fraudster):* Has zero variance, or reports `0` satellites, because they are using an emulator in a basement. The system instantly rejects them.
3.  **Temporal & Spatial Reality Check:** The backend checks the worker's historical trajectory. 
    *   *Real Worker:* Was actively moving around the grid for the last 3 hours before the flood hit.
    *   *GPS Spoofer (Fraudster):* Magically "teleported" into the grid 1 second *after* the flood triggered, traveling at 900 km/h. The system instantly rejects them.

### Phase D: The Zero-Touch Payout
1.  **Master Payload Generation:** The system identifies exactly 124 genuine, mathematically-verified workers trapped in the grid. It discards the 350 spoofed fraud attempts.
2.  **Guidewire / Admin Sync:** The dashboard flashes green. It compiles a single, clean "Master Payout Payload" (combining all 124 workers into one API call to reduce processing overhead).
3.  **Instant Cash:** The backend hits the **Razorpay / Stripe / UPI Sandbox API**. Less than 5 seconds after the weather API triggered the flood alert, all 124 workers receive ₹200 directly into their bank accounts. 
4.  **The User Experience:** The worker didn't take a single photo, fill out a form, or call a helpline. They just got paid instantly while waiting out the rain.

---

## 🛡️ 3. SCENARIO VALIDATION CHEAT SHEET

When judges ask "But what if X happens?", refer to this logic:

### Problem 1: Someone uses a standard Android Fake GPS app.
**How it validates:** We DO NOT trust the Android OS location. We query the `GnssStatus` hardware API. The fake GPS app rewrites software coordinates, but it cannot inject raw hardware baseband noise. No physical satellite line-of-sight = instant rejection.

### Problem 2: A syndicate uses a device farm (50 phones) already located near the flood zone.
**How it validates:** We measure *Temporal Entropy*. Real humans act chaotically. They pull over at different times, take different routes, and huddle randomly. If 50 devices report the exact same velocity drop at the exact same millisecond, and their coordinates cluster with zero mathematical entropy, the ML engine flags it as a coordinated "Syndicate Farm" and rejects the entire cluster.

### Problem 3: A worker was sitting at home in the flood zone, off-duty, but tries to claim the money.
**How it validates:** Our system requires pre-event trajectory validation. To qualify for the payout, your history must show continuous movement and delivery-like behavior in the 2-4 hours leading up to the trigger. If your phone was stationary in a residential apartment complex before the storm hit, you are not classified as an "active gig worker" and do not receive the payout.

### Problem 4: The disruption isn't weather (e.g., Section 144 Curfew).
**How it validates:** We shift our Automated Trigger from the Weather API to a Government Notification Parser (or manual Admin override for the demo). The hardware validation logic remains identical. You must prove hardware-level physical presence at the barricade.

---

## 📅 4. HACKATHON ROADMAP ALIGNMENT

### To do in Phase 2 (March 21 - April 4):
*   Build the bare-bones Mobile App (Worker tracking & Policy Registration).
*   Build the Backend (Database + the AI Dynamic Premium Calculator).
*   Build the API pollers (Weather API triggers).
*   **Demo 1 (2 mins):** Show the mobile app taking in dynamic pricing, and a weather API triggering a claim.

### To do in Phase 3 (April 5 - 17):
*   Implement the Fraud Engine (Hardware GNSS checking + Velocity checking).
*   Build the Command Center (React visual dashboard for the Admin).
*   Integrate Razorpay / Stripe Sandbox for the final Instant Payout jump.
*   **Demo 2 (5 mins):** Show the entire automated ecosystem surviving a massive simulated GPS-spoofing attack and paying only the verified workers instantly.

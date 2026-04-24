# ⚙️ DEEP R&D: S RAHUL KANTH

## A. Assigned Cluster: Civil Disruption & Spatial Paralysis (The Kinetic Layer)
**Your Scenarios:** 
1. Local Strike / Bandh
2. Area Lockdown / Riot

**Why these scenarios?** 
These are geopolitical blockades characterized by mass spatial stagnation (zero kinetic movement). They require heavy backend integration: executing NLP sentiment scrapers and processing huge PostGIS spatial intersects.

---

## B. Deep Work Instructions
*   **What you must figure out:** The exact geofence ingestion architecture. If a riot seals off a 2km radius, how does the Node backend efficiently flag the 300 workers *inside* that specific polygon in real-time?
*   **Required Depth / Edge Cases:** Explain exactly how PostGIS handles spatial intersects at scale. Define the failure conditions: what happens if workers are stuck physically *outside* the riot geofence but claim they cannot enter their target zone?

---

## C. REQUIRED SUBMISSION FORMAT
*For EACH of your 2 assigned scenarios above, you must completely fill out the format beneath this line. Do not alter the headings.*

***

### 1. Scenario Breakdown
*(What is the technical reality of this disruption event?)*

### 2. Key Risks / Failures
*(How will fraudsters attempt to abuse this specific trigger? What are the edge cases?)*

### 3. Possible Solutions
*(List 2-3 distinct backend engineering approaches to validate this event.)*

### 4. Best Approach
*(Select the absolute best backend architectural decision from above.)*

### 5. Module Connections
*(How does this geofence logic connect to Vimmy's Guidewire Payload?)*

---

## D. PHASE 2 & 3 TECHNICAL ASSIGNMENT
**Your Concrete Mission:** You are the Event Oracle. You build the automated external triggers.
1. **Automated Webhook API:** Write a standalone Cron script (Node.js/Python) running every 5 minutes.
2. **The Logic:** Call the OpenWeatherMap API (Precipitation) or TomTom Traffic Index for specific H3 Grids.
3. **The Trigger:** If disruption thresholds are breached (e.g., Rain > 50mm), instantly fire a POST webhook to Navneeth's backend: `{"grid": "89283082...", "status": "DISRUPTED"}`.

# 🖥️ DEEP R&D: SHERENE FAUSTINA A

## A. Assigned Cluster: Infrastructure Failure & Device Catastrophe (The Edge Layer)
**Your Scenarios:** 
1. Internet Shutdown (State-level network blackout)
2. Personal Phone Failure (Catastrophic accident / water damage)

**Why these scenarios are grouped:** 
Both scenarios involve the ultimate crisis: the worker losing the physical ability to transmit data to the cloud. They require deep on-device (Edge) resilience, local caching mechanics, and specialized offline UI logic.

**Why you?** 
As the Frontend/Edge UI developer, you build the exact environment the worker interacts with. You must control what the device caches locally when the 4G dies, what the offline screen looks like, and how the "Last Known Good State" (LKGS) drops before battery death.

---

## B. Deep Work Instructions
*   **What you must figure out:** Exactly how the Flutter SDK securely caches GNSS/Cell hashes to an encrypted local SQLite file during a 12-hour internet cut. If a phone is crushed under a tire in a flood, how do we prove the worker was legit *before* the crash (The LKGS Protocol)?
*   **Required Depth / Edge Cases:** Detail the local encryption method. What happens if the worker clears their app cache before the internet comes back? How do we display an offline UI that reassures the panicking worker that their payout is accruing locally on the device layer?

---

## C. REQUIRED SUBMISSION FORMAT
*For EACH of your 2 assigned scenarios above, you must completely fill out the format beneath this line. Do not alter the headings.*

***

### 1. Scenario Breakdown
*(What is the technical reality of this disruption event?)*

### 2. Key Risks / Failures
*(How will fraudsters attempt to abuse this offline trigger? What are the edge cases?)*

### 3. Possible Solutions
*(List 2-3 distinct Edge-caching or UI recovery approaches to handle this event.)*

### 4. Best Approach
*(Select the absolute best architectural decision from above. Explain WHY it is the most reliable for gig economy smartphones.)*

### 5. Module Connections
*(How does this local offline buffer reconnect to Rahul's backend when the network restores?)*

---

## D. PHASE 2 & 3 TECHNICAL ASSIGNMENT
**Your Concrete Mission:** You build the Command Center Enterprise Dashboard (What the judges see).
1. **The Framework:** Initialize a React or Next.js premium web application.
2. **The Live Map:** Integrate Mapbox GL JS or Leaflet. Draw H3 Hexagons geographically over Bangalore.
3. **Visualizing the Integrity Layer:** Hook up to Navneeth's backend. Visually demonstrate active workers plotting on the grid, map regions flashing red during a Rahul Weather Trigger, and Swarm Bots being blocked (red dots) vs Verified claims (green dots).

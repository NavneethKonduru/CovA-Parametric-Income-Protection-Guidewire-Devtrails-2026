# 🧠 DEFENSE NODE: SHARVESH'S COMPLETE R&D & EXECUTION PLAYBOOK

This document is for your eyes only. It breaks down the exact technical implementations, algorithms, and logic required for you to successfully build the "AI Pricing & Fraud Defense" layer over the next 4 weeks.

Your job is the brain: **You price the risk dynamically, and you mathematically block the spoofers.**

---

## 1. THE AI PRICING ENGINE (Phase 2 Focus)
Traditional insurers price micro-insurance statically (e.g., everyone pays ₹10/day). You must build an AI model that prices it dynamically based on the hyper-local geographic risk. 

### The Strategy (Uber H3 + Regression):
1. **The Data Gathering:** Download a dataset of historical flooding or traffic accidents in Bangalore from Kaggle or the Indian Meteorological Department (IMD). 
2. **The Mapping:** You must map the (Lat/Long) of these historical floods to Uber's H3 Hex-Grids at Resolution 9 (roughly 500m wide). 
3. **The AI Model:** Train a simple regression model (Scikit-learn in Python). 
   *   *Input:* `H3_Index`
   *   *Features:* Historical_Flood_Count, Average_Elevation.
   *   *Output:* Predicted_Weekly_Premium (₹25 to ₹65). 
4. **The Integration:** Serve this model via a fast Python API (FastAPI). 
   *   When the mobile app registers a user, it sends: `GET /premium?lat=12.9&lon=77.6`
   *   Your API returns: `{"h3_index": "89283082...", "baseline_premium_inr": 45}`. Navneeth then stores this in the database.

---

## 2. THE FRAUD ENGINE: TEMPORAL ENTROPY (Phase 3 Focus)
For Phase 3, you are tasked with catching GPS-spoofing swarms (where 500 emulator bots teleport into a flooded area purely to steal the payout). Software GPS checks (`isFromMockProvider`) can be hacked. **Math cannot be hacked.**

### Fraud Rule 1: The Haversine Teleportation Check
You must calculate the speed of the worker between their last two location pings. 

**The Python R&D:**
1. You receive `Ping A` (Timestamp: 10:00:00, Location: X) and `Ping B` (Timestamp: 10:00:15, Location Y).
2. Calculate the distance between X and Y using the **Haversine Formula** (which accounts for the curvature of the Earth). 
3. Calculate: `Speed = Distance / Time_Difference`.
4. **The Fraud Threshold:** If the speed exceeds 100 km/h in dense Bangalore traffic, it is physically impossible. The worker just spoofed their GPS. **Flag as `is_fraud: true`.**

### Fraud Rule 2: The Grid-Lock Swarm Clustering
Syndicate device farms often run scripts that set 50 different phones to the exact same fake GPS coordinate. 

**The Python R&D:**
1. Navneeth hands you an array of 500 worker GPS coordinates taking place roughly at the exact same geographical area during the flood.
2. Group the coordinates. If `Count(Workers) > 10` where `Latitude` and `Longitude` match perfectly out to 5 or 6 decimal places at the exact same microsecond, human organic noise is absent. This is a script. 
3. **The Fraud Threshold:** Flag the entire cluster as a Swarm. **Flag all 10 grouped workers as `is_fraud: true`.**

---

## 3. THE FRAUD ENGINE: HARDWARE PHYSICS (Phase 3 Focus)
This is the ultimate block against Mock Location apps. 

### Fraud Rule 3: The C/N0 Hardware Check
The Mobile App developer is extracting the raw `GnssStatus` (Carrier-to-Noise density / SNR) from the phone's physical baseband chip, which represents satellite signal strength bouncing off buildings. 

**The Python R&D:**
1. Navneeth hands you a JSON array attached to the worker's ping: `cn0_array: [0.0, 0.0, 0.0]`. 
2. Real phones outdoors experience high variance (e.g., `[18.4, 25.1, 14.2]`). 
3. Mock Location apps (like FakeGPS Free) running on Android Emulators cannot generate real satellite hardware noise. They return `0` satellites, or flatline arrays like `[0.0]`. 
4. **The Fraud Threshold:** If the variance of `cn0_array == 0` AND the user is claiming to be stuck outdoors in a flood, they are lying. **Flag as `is_fraud: true`.**

### Your Deliverable Output:
Your Python FastAPI microservice receives `[Worker_A, Worker_B, Worker_C]` from Navneeth's main server. You crunch the Math and Physics above. You return:
`[{"worker": "A", "fraud": false}, {"worker": "B", "fraud": true}]`

You are the filter that protects the insurance premium capital.

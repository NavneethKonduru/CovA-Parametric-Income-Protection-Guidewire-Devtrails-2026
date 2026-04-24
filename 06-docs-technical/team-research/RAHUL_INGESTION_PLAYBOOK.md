# 🌐 INGESTION NODE: RAHUL'S COMPLETE R&D & EXECUTION PLAYBOOK

This document is for your eyes only. It breaks down the exact technical implementations, APIs, and Node.js logic required for you to successfully build the "Event Oracle" architecture over the next 4 weeks.

Your job is the trigger: **If your code does not run, the insurance policy never activates.**

---

## 1. THE ARCHITECTURE (The Cron Job)
You are not building a web app; you are building a Headless Microservice. Your code needs to run continuously in the background, polling external data providers, and checking if conditions correspond to a disruption event.

### The Stack You Need:
*   **Runtime:** Node.js or Python.
*   **Libraries:** `node-cron` (or Python `schedule`), `axios` (or `requests`), `dotenv` (to hide your API keys).

---

## 2. THE APIS (External Truth Sources)
Originally, we discussed scraping Swiggy or Zepto. Do not do this. It is unreliable for a hackathon demo and you will get blocked. Instead, use authoritative, public APIS that explicitly prove a localized disruption is occurring.

### API Option A: OpenWeatherMap (For Floods/Monsoons)
*   **The Goal:** Trigger a payout when an area is physically flooded and workers cannot drive.
*   **The R&D:** Look at the OpenWeatherMap `One Call API 3.0`. You want to poll the **Precipitation (mm/h)** metric for a specific Lat/Long in Bangalore.
*   **The Threshold:** Write logic that checks: `if (precipitation > 50) { triggerState = true; }`

### API Option B: TomTom Traffic API (For Section 144 / Gridlocks)
*   **The Goal:** Trigger a payout when severe, unmapped gridlocks or curfews physically prevent movement.
*   **The R&D:** Look at the TomTom `Traffic Index`. You can query a specific radius.
*   **The Threshold:** Write logic that checks: `if (current_travel_time > 3x_historical_average) { triggerState = true; }`

*(For the Phase 2 Demo video, you will likely hardcode an endpoint that lets you manually force this trigger to `true` while simulating the polling, so you can execute the demo perfectly.)*

---

## 3. THE HAND-OFF (The Webhook to Master Node)
Once your script detects `precipitation > 50mm` at `(12.92, 77.63)`, you must pass this information into Navneeth's server.

### The Webhook Mechanics:
1. **Convert the Location:** Use the Uber H3 library (`h3-js`) inside your script to instantly convert the localized coordinates into a 15-character hex string (e.g., `89283082a3fffff`). 
2. **Format the Payload:**
   ```json
   {
      "trigger_type": "FLOOD",
      "h3_index": "89283082a3fffff",
      "severity": "CRITICAL",
      "timestamp": "2026-03-24T10:00:00Z"
   }
   ```
3. **Fire the HTTP POST:** Use `axios.post('http://navneeth-server-ip/api/oracle/trigger', payload)`. 

### The Demo Strategy (What you actually build for Phase 2):
For your deliverable in 2 weeks, build a massive **"NUCLEAR BUTTON"** UI or a simple CLI script. 

When you press "Enter" in your terminal, it prints:
`[POLLING] OpenWeather API... (Lat: 12.9, Lon: 77.6). Rainfall: 65mm. THRESHOLD REACHED.`
`[WEBHOOK] Firing H3 Index '89283...ff' to Master Node.`
`[STATUS] 200 OK. Master Node has activated the disruption logic state.`

This is exactly what the judges need to see to understand that the system is fully automated.

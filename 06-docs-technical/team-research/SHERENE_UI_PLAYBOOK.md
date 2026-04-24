# 🖥️ UX NODE: SHERENE'S COMPLETE R&D & EXECUTION PLAYBOOK

This document is for your eyes only. It breaks down the exact technical implementations, libraries, and visualization logic required for you to successfully build the "Command Center Enterprise Dashboard" over the next 4 weeks.

Your job is the entire visual presentation: **If the judges cannot "see" the AI working, it doesn't exist.**

---

## 1. THE ENTERPRISE DASHBOARD (Phase 2 & 3)
Hackathon judges look at screens for 2 days straight. Your screen needs to be dark mode, hyper-professional, and look like a military logistics center. You are building the UI for an Insurance Claim Administrator, not a customer.

### The Stack You Need:
*   **Framework:** React or Next.js.
*   **Styling:** TailwindCSS + Shadcn/ui (for fast, beautiful enterprise components like data tables and sidebars).
*   **Mapping Engine:** Mapbox GL JS (highly recommended) or Leaflet.js. 

---

## 2. THE VISUAL LAYERS (The Mapbox R&D)
The centerpiece of the application is a massive, screen-filling map of Bangalore. 

### R&D Task 1: The Base Map
Register for a free Mapbox developer account. Grab your Public API Key. Integrate `react-map-gl` to render a dark-styled map centered on Bangalore (Lat: `12.9716`, Lon: `77.5946`). 

### R&D Task 2: Drawing H3 Hex-Grids (The GeoJSON)
You must visually represent the "Risk Grids" that Sharvesh's AI built. 
1. Use the `h3-js` library on your frontend. 
2. Write a function that takes an array of H3 indexes (e.g., `["8928...", "8929..."]`) and converts them into GeoJSON polygon coordinates. 
3. Draw these polygons over the Mapbox map. Give them a faint blue opacity (e.g., 20%).

### R&D Task 3: The Fraud Block Visualization (Crucial for Demo)
This is what wins the hackathon. You must show the math working. 
1. Navneeth's server will send you an array of workers: `[{"id": 1, "lat": 12.92, "lng": 77.6, "fraud": false}, {"id": 2, "lat": 12.92, "lng": 77.6, "fraud": true}]`
2. **The Good Workers:** rendered as slightly glowing GREEN dots on your map. 
3. **The GPS Spoofers:** rendered as bright RED dots on your map. 

---

## 3. THE DEMO CHOREOGRAPHY
For the final 5-minute pitch video, you are the stage director. Here is what you must build into the UI to make the demo flawless:

1. **The Neutral State:** The dashboard loads. The map is covered in blue hexagons. 500 green dots (workers) are slowly moving around Bangalore (Mocked data from Navneeth's WebSocket/API).
2. **The Oracle Trigger (The Storm):** Suddenly, Rahul's API script triggers a "Heavy Rain" event for Koramangala. **Your UI Must React:** The specific Koramangala Hexagon abruptly turns flashing **RED** or bright ORANGE. A toast notification slides in: `[Critical Disruption Alert] Koramangala Grid Breached.`
3. **The Synthetic Swarm (The Fraud):** Suddenly, 300 new dots appear inside the red hexagon. But they aren't green. Sharvesh's math flags them as teleporting GPS spoofers. **Your UI Must React:** These dots render as **RED**. A sidebar log updates rapidly: `Worker_400 Blocked: GNSS Zero Variance.` `Worker_401 Blocked: GPS Temporal Teleportation.`
4. **The Payout (The Resolution):** A large button illuminates on the dashboard: `[Approve Master Payload]`. The Admin clicks it. The red dots disappear, the green dots flash, and a massive green checkmark overlays the grid: `0 Loss Adjustment Expense. Payout Processing.`

---

## 4. IMMEDIATE NEXT STEPS FOR YOU
1. Initialize the Next.js app with TailwindCSS.
2. Sign up for a free Mapbox account and get a map rendering on `localhost:3000`. 
3. Hardcode a mock JSON array of workers and render them as colored markers on the map to prove to yourself that you understand map overlays.

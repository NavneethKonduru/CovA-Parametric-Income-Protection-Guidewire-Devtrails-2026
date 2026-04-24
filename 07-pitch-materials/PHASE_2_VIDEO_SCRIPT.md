# 🎬 PHASE 2: "PROTECT YOUR WORKER" 
**2-Minute Demo Video Script & Storyboard**

*Deadline: April 4 | Theme: Automation & Protection*
*Goal: Visually demonstrate Registration, AI Dynamic Pricing, the Automated API Trigger, and the Zero-Touch Claim generation.*

---

## [0:00 - 0:15] INTRODUCTION
**Visual:** Screen recording of the new ClaimCrypt Mobile App (can be a simple Flutter/React Native UI running on an emulator, or even a very polished Figma prototype if code isn't ready).
**Voiceover:** "Gig workers shouldn't lose their livelihood because of unpredictable weather. Welcome to ClaimCrypt, an automated parametric insurance engine designed for Guidewire. In Phase 2, we are demonstrating our Zero-Touch policy creation and disruption triggering."

## [0:15 - 0:45] REGISTRATION & AI DYNAMIC PRICING
**Visual:** Worker logs into the app. They enter their UPI ID. The app fetches their current GPS location (e.g., Koramangala, Bangalore) and calls the backend API. The screen flashes: *"Calculating Local Risk..."* and then shows *"Weekly Premium: ₹65"*.
**Voiceover:** "When a worker registers, ClaimCrypt doesn't offer a flat rate. Our Machine Learning backend maps their current location exactly to an Uber H3 Hex-Grid. By analyzing historical weather and flood data for this specific 500-meter zone, the AI dynamically prices their weekly premium. The worker clicks Subscribe, and they are protected."

## [0:45 - 1:20] THE AUTOMATED TRIGGER (THE DISRUPTION)
**Visual:** Split screen. On the left: A dark-mode Admin Dashboard showing the map of Bangalore wrapped in H3 Hexagons. The worker is a green dot. On the right: A terminal window running the Node.js backend cron job.
**Voiceover:** "Now, a monsoon hits. ClaimCrypt requires zero human reporting. Our backend continuously polls the OpenWeatherMap API for live precipitation data."
**Visual:** The terminal logs show: `[POLL] Koramangala Grid: Rainfall 55mm/hr. THRESHOLD BREACHED. Triggering Disruption Webhook.`
**Visual:** On the React dashboard, the specific H3 Hexagon covering Koramangala instantly turns **RED**. The insurance policy is now actively triggered.

## [1:20 - 1:50] THE ZERO-TOUCH CLAIM
**Visual:** Back to the Mobile App. A push notification drops down: *"Heavy Rainfall Detected in your Grid. Deliveries Suspended. Your ₹200 Claim is Processing."*
**Visual:** The Admin Dashboard shows the worker's green dot inside the red grid. A sidebar log reads: `[MATH VALIDATION] Worker_024 Trajectory Verified. Grouping into Master Payload.`
**Voiceover:** "Because the external API serves as the absolute source of truth, the worker doesn't need to take a photo or file a manual claim. The system mathematically verifies they are trapped in the disrupted zone, groups them immediately into a Master Payload, and prepares the payout for Guidewire ClaimCenter."

## [1:50 - 2:00] OUTRO
**Visual:** The Dashboard shows: *"1 Worker Verified. Master Claim Ready for Guidewire Hand-off."*
**Voiceover:** "In Phase 3, we will demonstrate our hardware-level fraud defense crushing GPS-spoofers, and execute the instant Razorpay payout. ClaimCrypt: Zero Touch. Zero Fraud."

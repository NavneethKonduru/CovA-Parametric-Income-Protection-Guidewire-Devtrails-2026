# Phase 2 Demo Script — 2 Minutes Exactly

## SHOT 1: Hook (0:00–0:12)
[Screen: Black screen, then CovA login page appears]
NARRATION:
"10 million delivery workers in India lose income every time disruption strikes —
floods, heatwaves, traffic gridlocks, curfews, platform outages.
Traditional insurance takes 14 days to process a ₹200 claim.
CovA does it in under 5 minutes. Automatically. For any disruption type."

## SHOT 2: Worker Onboarding (0:12–0:40)
[Screen: Login → click Worker → Onboarding step 1]
NARRATION:
"A Zepto rider in Whitefield opens CovA. Three steps."
[Fill name, phone]
"Zone selection — our ML model already knows Whitefield is high-risk. Not just floods — it compounds flood risk AND traffic gridlock."
[Select Zone B - Whitefield, archetype: Heavy Peak]
"Premium appears: ₹63.70 this week. That's ₹9 a day — for full 5-peril coverage."
[Enter UPI ID: raju.kumar@okaxis]
"One click. Covered against rain, heat, gridlock, curfews, and outages."
[Click 'Activate Coverage' — WorkerDashboard appears]
"The CDI gauge shows current zone conditions. The Composite Disruption Index monitors all 5 peril types simultaneously. All calm. For now."

## SHOT 3: Admin Triggers Disruption (0:40–0:55)
[Screen: Switch to Admin tab — show calm log]
NARRATION:
"Switch to admin view. Watch the cron poller — fires every 30 seconds, monitoring weather, traffic, and platform status."
[Point at log showing CDI updates]
"I'll trigger a Whitefield monsoon."
[Click 'Whitefield Monsoon' button]
"CDI is rising. Weather 85%, demand collapse 68%, 72% of peers offline."
"The Composite Disruption Index hits 0.76 — above our trigger threshold."

## SHOT 4: Claims Auto-Fire (0:55–1:20)
[Screen: Switch to Insurer tab — show claims table]
NARRATION:
"Switch to insurer view. Watch the claims table — no page refresh."
[Wait, claims appear one by one via WebSocket]
"40 workers. All auto-claimed. Zero of them touched the app."
[Point to rejected claims]
"Three ghost workers — GPS spoofing, zero satellite signal variance."
"TCHC fraud engine blocked them instantly."
[Point to paid claims]
"37 genuine workers. All paid. TXN IDs from Razorpay."

## SHOT 5: Guidewire Submit (1:20–1:40)
[Screen: Insurer dashboard, Guidewire panel visible]
NARRATION:
"One insurer action: Submit to Guidewire ClaimCenter."
[Click 'Submit to Guidewire ClaimCenter' button]
[Guidewire modal appears]
"GW_2026_MASTER_001. Accepted."
"37 claims consolidated into one master payload."
"LAE saved: ₹74,000 on this single event."
"Same single workflow handles all 5 peril types — no product proliferation."

## SHOT 6: Worker Gets Paid (1:40–1:55)
[Screen: Worker tab — ClaimTimeline showing PAID]
NARRATION:
"Back to Raju's screen. Status: PAID."
[Show payout speed timer]
"Detection to payout: 4 minutes 23 seconds."
"Traditional insurance: 14 days. CovA: 4 minutes. For rain, heat, gridlock, curfew, or outage."
"And 12 explicit exclusions ensure this product is IRDAI-compliant — no health, no life, no accident. Income-loss only."

## SHOT 7: Close (1:55–2:00)
[Screen: CovA logo / login page]
NARRATION:
"That's CovA. Five perils. One index. Zero touch. Protect your worker."

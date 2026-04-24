# SIMULATION_SPEC.md — CovA Operational Simulation Design

## Goal
100 simulated workers across 3 Bangalore zones.
Admin can trigger scenarios that demonstrate real operational logic.
Judges can be given worker or insurer access and experience real flows.

## Worker distribution
- Zone A (Koramangala): 35 workers — mixed platforms, medium risk
- Zone B (Whitefield): 45 workers — Zepto/Blinkit heavy, high risk
- Zone C (Indiranagar): 20 workers — casual/part-time, low risk

## Worker archetypes (distributed across 100)
- heavy_peak: 40 workers — ₹150/hr, peak hours only
- balanced: 40 workers — ₹120/hr, throughout day
- casual: 20 workers — ₹80/hr, irregular

## Simulation scenarios (admin-triggerable)

### WHITEFIELD_MONSOON
Zone B weather severity 0.85, demand drop 0.68, peer offline 0.72.
CDI = ~0.759 → standard trigger. Expected: ~45 Zone B workers get auto-claims.

### FRAUD_ATTACK
15 ghost workers injected into Zone B. All with cn0_array = [0,0,0] and velocity 350km/h.
Expected: all 15 blocked by TELEPORTATION_SPEED + GNSS_ZERO_VARIANCE rules.

### PLATFORM_OUTAGE
Zepto platform goes down in Zone B. Weather stays normal.
CDI triggers only on demand signal. Zepto workers in Zone B trigger, Blinkit workers do not.

### MIXED_ATTACK
Zone B genuine monsoon + 10 ghost workers simultaneously.
Expected: real workers paid via cron, ghost workers blocked by fraud engine.

### SECTION_144
All zones: peer offline 85%, demand collapse 90%, weather normal.
CDI triggers across all zones from social signals, not weather.

### CLEAR_ALL
Reset all zones to normal. Remove ghost workers.

## Live demo access model
- Worker login: worker@cova.in (password: cova2026)
- Insurer login: insurer@cova.in (password: cova2026)
- Admin login: admin@cova.in (password: cova2026)

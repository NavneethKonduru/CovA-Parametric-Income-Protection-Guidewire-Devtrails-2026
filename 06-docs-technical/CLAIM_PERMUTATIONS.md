# CovA — Claim Trigger Permutations & Logic Flow

This document outlines every possible combination of inputs that can trigger a claim, and how the system (CDI, Validator, and TCHC Fraud Engine) handles each.

## 1. Trigger Permutations

| Trigger Path | Input Signals | Logic Gate | Final Status | Payout |
| :--- | :--- | :--- | :--- | :--- |
| **Standard Parametric** | Rain > 50mm/hr, Demand < 0.3 | CDI > 0.6 | `paid` | Full |
| **Traffic Gridlock** | TomTom Speed < 5km/h, Peer Offline > 40% | CDI > 0.65 | `paid` | Full |
| **Civic Curfew** | Admin Override or Civic Oracle = TRUE | CDI = 1.0 (Fixed) | `paid` | Max |
| **Platform Outage** | Demand = 0.0, Weather = Normal | Outage Rule | `paid` | Balanced |
| **Retroactive Sync** | Offline `telemetry_raw` + Past Disruption | Time-Match | `paid` (Retro) | Full |
| **Daily Cap Reached** | Worker already claimed 8 hours today | Cap Check | `rejected_cap_reached` | ₹0 |
| **Low Severity** | Rain = 10mm/hr (Light) | CDI < 0.4 | `rejected` | ₹0 |

## 2. Fraud Detection Scenarios (TCHC Engine)

| Scenario | Fraud Signal | Detection Rule | System Action |
| :--- | :--- | :--- | :--- |
| **Genuine Worker** | Jittery GNSS, Consistent Speed | `GNSS_VARIANCE_PASS` | `APPROVED` |
| **GPS Spoofing** | 0.000 GNSS Variance while Velocity > 0 | `SYNTHETIC_SIGNAL_CRITICAL` | `AUTO_REJECT` |
| **Teleportation** | Distance jump > 5km in 1 min | `SPEED_ANOMALY` | `AUTO_REJECT` |
| **Ghost Swarm** | 10 workers at exact same coordinate | `CLUSTER_DENSITY` | `HELD_FOR_REVIEW` |
| **Indoor Pardon** | 0.000 GNSS Variance, Accelerometer = 0 | `STATIONARY_INDOOR` | `PASSED` |

## 3. The "Processing" States

The system has two states that appear as "Processing" to the user:
- `eligible_pending_validation`: Claim is logically sound but waiting for the final TCHC consensus score.
- `pending_telemetry`: Waiting for the Android app to upload the high-frequency buffer to confirm the worker was actually in-zone during the breach.

> [!NOTE]
> The **"Clear Processing"** button in the Admin Panel exists to manually move these stuck states in case of missing telemetry sync.

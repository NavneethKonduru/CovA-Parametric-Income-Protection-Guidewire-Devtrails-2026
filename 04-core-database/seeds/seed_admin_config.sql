-- ============================================================================
-- Seed: Admin Configuration
-- ============================================================================
-- 5 system-level config rows matching current db.js seed data.
-- These are shared across modes (no data_mode column).
-- ============================================================================

INSERT INTO public.admin_config (key, value, description) VALUES
    (
        'cdi_weights',
        '{"weather":0.40,"demand":0.35,"peer":0.25}',
        'CDI component weights. weather + demand + peer must sum to 1.0.'
    ),
    (
        'fraud_rules',
        '{
            "FREQUENCY_ANOMALY": {"enabled": true, "threshold": 3, "weight": 0.15, "action": "flag", "description": "Worker claims more than 3x in 24 hours"},
            "ZONE_MISMATCH": {"enabled": true, "weight": 0.25, "action": "auto_reject", "description": "Worker GPS not in claimed zone"},
            "OFF_HOUR_CLAIM": {"enabled": true, "weight": 0.10, "action": "auto_reject", "description": "Claim filed during off-peak hours with no disruption"},
            "PEER_DIVERGENCE": {"enabled": true, "threshold": 70, "weight": 0.12, "action": "flag", "description": "Worker claims disruption but 70%+ peers are active"},
            "DUPLICATE_CLAIM": {"enabled": true, "weight": 0.30, "action": "auto_reject", "description": "Identical claim already filed for same time slot"},
            "AMOUNT_ANOMALY": {"enabled": true, "threshold": 1.5, "weight": 0.08, "action": "flag", "description": "Payout amount exceeds 1.5x zone average"},
            "TELEPORTATION_SPEED": {"enabled": true, "threshold": 100, "weight": 0.25, "action": "auto_reject", "description": "Worker moved faster than 100 km/h between pings"},
            "SWARM_DETECTED": {"enabled": true, "threshold": 5, "weight": 0.15, "action": "flag", "description": "5+ claims from same device ID cluster"},
            "GNSS_ZERO_VARIANCE": {"enabled": true, "weight": 0.20, "action": "flag", "description": "GPS variance is exactly 0 (likely spoofed signal)"},
            "ZONE_HOPPING": {"enabled": true, "minPrePresenceMins": 30, "weight": 0.10, "action": "auto_reject", "description": "Worker was in zone for less than 30 minutes before claiming"},
            "DEVICE_BLACKLISTED": {"enabled": true, "weight": 0.30, "action": "auto_reject", "description": "Device ID is on the fraud blacklist"},
            "CN0_ANOMALY": {"enabled": true, "threshold": 20, "weight": 0.15, "action": "flag", "description": "Satellite signal strength below 20 dB-Hz (indoor/spoofed)"},
            "VELOCITY_IMPOSSIBLE": {"enabled": true, "threshold": 300, "weight": 0.25, "action": "auto_reject", "description": "Reported velocity exceeds 300 km/h (impossible)"},
            "CLUSTER_TIMING": {"enabled": true, "threshold": 3, "weight": 0.12, "action": "flag", "description": "3+ workers from same cluster file within 30 seconds"},
            "SATELLITE_COUNT_LOW": {"enabled": true, "threshold": 4, "weight": 0.10, "action": "flag", "description": "Fewer than 4 GPS satellites (unreliable fix)"},
            "SIGNAL_AUTHENTICITY_LOW": {"enabled": true, "threshold": 0.3, "weight": 0.20, "action": "flag", "description": "Hardware signal authenticity score below 0.3"}
        }',
        'Full TCHC fraud rule definitions. 16 rules with enabled/threshold/weight/action.'
    ),
    (
        'zone_risk_factors',
        '{"ZONE_A":1.0,"ZONE_B":1.3,"ZONE_C":0.8}',
        'Risk multipliers per zone. Higher = more premium, lower = less.'
    ),
    (
        'cdi_strategy',
        'any_dominant',
        'CDI computation strategy: any_dominant, weighted_avg, max_signal.'
    ),
    (
        'autonomous_fraud_enabled',
        'true',
        'Whether the autonomous engine injects simulated fraud workers in demo mode.'
    )
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

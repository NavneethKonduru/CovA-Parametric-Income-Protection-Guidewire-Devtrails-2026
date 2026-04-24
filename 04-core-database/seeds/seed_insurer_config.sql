-- ============================================================================
-- Seed: Insurer Configuration
-- ============================================================================
-- 5 insurer-adjustable parameters matching current db.js seed data.
-- These are shared across modes (no data_mode column).
-- ============================================================================

INSERT INTO public.insurer_config (key, value, min_value, max_value, description) VALUES
    ('base_premium_rate', '35', 29, 89,
     'Base weekly premium in INR. Adjusted by zone risk, archetype, season, and claims history.'),
    ('max_payout_per_event', '1200', 500, 2000,
     'Maximum payout per disruption event in INR. Hard cap regardless of hours lost.'),
    ('cdi_trigger_threshold', '0.6', 0.5, 0.8,
     'CDI value that triggers claim eligibility. Below this, no claims auto-trigger.'),
    ('covered_zones', '["ZONE_A","ZONE_B","ZONE_C"]', NULL, NULL,
     'JSON array of zone IDs where policies are active and claims are eligible.'),
    ('weekly_coverage_cap', '3000', 1000, 5000,
     'Maximum total weekly payout per worker across all claims in INR.')
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    min_value = EXCLUDED.min_value,
    max_value = EXCLUDED.max_value,
    description = EXCLUDED.description,
    updated_at = NOW();

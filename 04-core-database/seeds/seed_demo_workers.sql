-- ============================================================================
-- Seed: Demo Workers (10 Hardcoded + 100 Simulated)
-- ============================================================================
-- All workers tagged with data_mode = 'demo'.
-- 10 hardcoded workers (W001-W010) match the existing workers.json.
-- 100 simulated workers (SIM_W001-SIM_W100) distributed across zones/platforms.
-- ============================================================================

-- ============================================================================
-- 10 Hardcoded Workers (from workers.json)
-- ============================================================================
INSERT INTO public.workers (
    id, name, phone, zone, platform, archetype, hourly_rate,
    status, enrolled_date, is_simulated, data_mode
) VALUES
    ('W001', 'Raju Kumar',     '9876543210', 'ZONE_A', 'zomato',  'heavy_peak', 150, 'active', '2026-03-10', FALSE, 'demo'),
    ('W002', 'Priya Sharma',   '9876543211', 'ZONE_B', 'swiggy',  'balanced',   120, 'active', '2026-03-10', FALSE, 'demo'),
    ('W003', 'Amit Patel',     '9876543212', 'ZONE_C', 'zomato',  'casual',      80, 'active', '2026-03-11', FALSE, 'demo'),
    ('W004', 'Meera Reddy',    '9876543213', 'ZONE_A', 'swiggy',  'heavy_peak', 150, 'active', '2026-03-11', FALSE, 'demo'),
    ('W005', 'Suresh Yadav',   '9876543214', 'ZONE_B', 'zomato',  'balanced',   120, 'active', '2026-03-12', FALSE, 'demo'),
    ('W006', 'Lakshmi Devi',   '9876543215', 'ZONE_A', 'swiggy',  'casual',      80, 'active', '2026-03-12', FALSE, 'demo'),
    ('W007', 'Rahul Singh',    '9876543216', 'ZONE_B', 'zomato',  'heavy_peak', 150, 'active', '2026-03-13', FALSE, 'demo'),
    ('W008', 'Anita Kumari',   '9876543217', 'ZONE_C', 'swiggy',  'balanced',   120, 'active', '2026-03-13', FALSE, 'demo'),
    ('W009', 'Vijay Nair',     '9876543218', 'ZONE_A', 'zomato',  'balanced',   120, 'active', '2026-03-14', FALSE, 'demo'),
    ('W010', 'Deepa Rao',      '9876543219', 'ZONE_C', 'swiggy',  'heavy_peak', 150, 'active', '2026-03-14', FALSE, 'demo')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    zone = EXCLUDED.zone,
    platform = EXCLUDED.platform,
    archetype = EXCLUDED.archetype,
    hourly_rate = EXCLUDED.hourly_rate,
    data_mode = EXCLUDED.data_mode;

-- ============================================================================
-- 100 Simulated Workers (SIM_W001 to SIM_W100)
-- ============================================================================
-- Distribution: ZONE_A: 40%, ZONE_B: 35%, ZONE_C: 25%
-- Platforms: zepto, blinkit, swiggy_instamart, zomato, swiggy
-- Archetypes: heavy_peak (30%), balanced (45%), casual (25%)
-- ============================================================================

-- Generate 100 simulated workers using a series
INSERT INTO public.workers (
    id, name, zone, platform, archetype, hourly_rate,
    status, enrolled_date, is_simulated, data_mode, daily_claims_cap, seasonal_factor
)
SELECT
    'SIM_W' || LPAD(n::text, 3, '0'),
    'Sim Worker ' || n,
    CASE
        WHEN n <= 40 THEN 'ZONE_A'
        WHEN n <= 75 THEN 'ZONE_B'
        ELSE 'ZONE_C'
    END,
    CASE n % 5
        WHEN 0 THEN 'zepto'
        WHEN 1 THEN 'blinkit'
        WHEN 2 THEN 'swiggy_instamart'
        WHEN 3 THEN 'zomato'
        WHEN 4 THEN 'swiggy'
    END,
    CASE
        WHEN n % 100 < 30 THEN 'heavy_peak'
        WHEN n % 100 < 75 THEN 'balanced'
        ELSE 'casual'
    END,
    CASE
        WHEN n % 100 < 30 THEN 150
        WHEN n % 100 < 75 THEN 120
        ELSE 80
    END,
    'active',
    '2026-03-01'::date + (n % 14),
    TRUE,
    'demo',
    8.0,
    CASE
        WHEN n % 4 = 0 THEN 1.15  -- Monsoon workers
        WHEN n % 4 = 1 THEN 0.95
        WHEN n % 4 = 2 THEN 1.05
        ELSE 1.0
    END
FROM generate_series(1, 100) AS n
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Create worker_signals entries for all workers (latest state = default)
-- ============================================================================
INSERT INTO public.worker_signals (worker_id, lat, lng, gnss_variance, velocity, platform_active, signal_mode)
SELECT
    w.id,
    -- Approximate centroid of each zone with slight jitter
    CASE w.zone
        WHEN 'ZONE_A' THEN 12.9352 + (random() * 0.01 - 0.005)
        WHEN 'ZONE_B' THEN 12.9698 + (random() * 0.01 - 0.005)
        WHEN 'ZONE_C' THEN 12.9784 + (random() * 0.01 - 0.005)
    END,
    CASE w.zone
        WHEN 'ZONE_A' THEN 77.6245 + (random() * 0.01 - 0.005)
        WHEN 'ZONE_B' THEN 77.7500 + (random() * 0.01 - 0.005)
        WHEN 'ZONE_C' THEN 77.6408 + (random() * 0.01 - 0.005)
    END,
    round((random() * 2)::numeric, 4),      -- gnss_variance 0-2
    round((random() * 25)::numeric, 4),      -- velocity 0-25 km/h
    TRUE,
    'auto_genuine'
FROM public.workers w
WHERE w.data_mode = 'demo'
ON CONFLICT (worker_id) DO NOTHING;

-- ============================================================================
-- Create default policies for all demo workers
-- ============================================================================
INSERT INTO public.policies (
    id, worker_id, worker_name, zone, platform, archetype,
    weekly_premium, daily_cover_cap, status, effective_date, expiry_date,
    data_mode
)
SELECT
    'POL_' || w.id,
    w.id,
    w.name,
    w.zone,
    w.platform,
    w.archetype,
    -- Premium based on archetype and zone risk
    CASE w.archetype
        WHEN 'heavy_peak' THEN 49
        WHEN 'balanced'   THEN 35
        WHEN 'casual'     THEN 19
    END *
    CASE w.zone
        WHEN 'ZONE_A' THEN 1.0
        WHEN 'ZONE_B' THEN 1.1
        WHEN 'ZONE_C' THEN 0.9
    END,
    960,
    'active',
    w.enrolled_date,
    w.enrolled_date + INTERVAL '1 year',
    'demo'
FROM public.workers w
WHERE w.data_mode = 'demo'
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Seed: Scenario Library
-- ============================================================================
-- 8 demo scenarios used by the autonomous engine in demo mode.
-- Each defines weather parameters, expected CDI ranges, and claim expectations.
-- ============================================================================

INSERT INTO simulation.scenario_library (
    id, name, description, category, config_template,
    expected_cdi_range, expected_claims, expected_fraud_rate,
    rainfall_mm, temperature_c, wind_speed_kmh, label, is_active
) VALUES
    (
        'clear_skies',
        'Clear Skies',
        'Normal baseline conditions. No disruption. CDI stays below threshold.',
        'weather',
        '{"rainfall_mm": 0, "temperature_c": 30, "wind_speed_kmh": 8, "humidity_pct": 55, "visibility_km": 10}',
        '[0.05, 0.25]'::numrange,
        '[0, 2]'::int4range,
        0.02,
        0, 30, 8, 'Baseline', TRUE
    ),
    (
        'light_rain',
        'Light Rain',
        'Mild showers. CDI rises but stays below trigger threshold for most workers.',
        'weather',
        '{"rainfall_mm": 15, "temperature_c": 26, "wind_speed_kmh": 12, "humidity_pct": 75, "visibility_km": 6}',
        '[0.20, 0.50]'::numrange,
        '[0, 5]'::int4range,
        0.05,
        15, 26, 12, 'Light Rain', TRUE
    ),
    (
        'heavy_monsoon',
        'Heavy Monsoon',
        'IMD "Heavy" rainfall category (65+ mm/hr). Full claim cycle triggers.',
        'weather',
        '{"rainfall_mm": 85, "temperature_c": 24, "wind_speed_kmh": 25, "humidity_pct": 92, "visibility_km": 2}',
        '[0.65, 0.90]'::numrange,
        '[10, 30]'::int4range,
        0.08,
        85, 24, 25, 'Heavy Monsoon', TRUE
    ),
    (
        'cyclone',
        'Cyclone Event',
        'Severe cyclonic storm. Wind > 60 km/h, very heavy rain. CDI at critical.',
        'weather',
        '{"rainfall_mm": 150, "temperature_c": 22, "wind_speed_kmh": 85, "humidity_pct": 95, "visibility_km": 0.5}',
        '[0.90, 1.00]'::numrange,
        '[25, 50]'::int4range,
        0.03,
        150, 22, 85, 'Cyclone', TRUE
    ),
    (
        'extreme_heat',
        'Extreme Heat Wave',
        'Temperature > 42°C. Delivery riders at health risk. CDI elevated.',
        'weather',
        '{"rainfall_mm": 0, "temperature_c": 44, "wind_speed_kmh": 5, "humidity_pct": 25, "visibility_km": 8}',
        '[0.55, 0.80]'::numrange,
        '[8, 20]'::int4range,
        0.06,
        0, 44, 5, 'Heat Wave', TRUE
    ),
    (
        'flood',
        'Urban Flooding',
        'Post-heavy-rain urban flooding. Roads impassable. Extended disruption.',
        'weather',
        '{"rainfall_mm": 120, "temperature_c": 25, "wind_speed_kmh": 15, "humidity_pct": 98, "visibility_km": 1}',
        '[0.80, 0.98]'::numrange,
        '[20, 40]'::int4range,
        0.04,
        120, 25, 15, 'Flood', TRUE
    ),
    (
        'smog_event',
        'Severe Smog / AQI Emergency',
        'AQI > 400. Outdoor work stoppage. Compound health + visibility disruption.',
        'weather',
        '{"rainfall_mm": 0, "temperature_c": 28, "wind_speed_kmh": 3, "aqi": 450, "pm25": 280, "visibility_km": 0.8}',
        '[0.50, 0.75]'::numrange,
        '[5, 15]'::int4range,
        0.05,
        0, 28, 3, 'Smog', TRUE
    ),
    (
        'bandh_curfew',
        'Bandh / Curfew',
        'Government-ordered shutdown. Civic CDI override active. Weather normal.',
        'civic',
        '{"rainfall_mm": 0, "temperature_c": 30, "wind_speed_kmh": 8, "civic_disruption": true, "intensity_level": 3, "cdi_override": 1.0}',
        '[0.70, 1.00]'::numrange,
        '[15, 35]'::int4range,
        0.02,
        0, 30, 8, 'Bandh/Curfew', TRUE
    )
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    config_template = EXCLUDED.config_template,
    expected_cdi_range = EXCLUDED.expected_cdi_range,
    expected_claims = EXCLUDED.expected_claims,
    is_active = EXCLUDED.is_active;

-- Initialize simulation state singleton
INSERT INTO simulation.state (id, current_scenario, cycle_count)
VALUES (1, 'clear_skies', 0)
ON CONFLICT (id) DO NOTHING;

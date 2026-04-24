-- ============================================================================
-- Seed: Region Mapping with PostGIS Polygon Boundaries
-- ============================================================================
-- 3 zones in Bangalore with approximate neighborhood polygons.
-- Coordinates are real-world approximations for Koramangala, Whitefield, Indiranagar.
-- ============================================================================

INSERT INTO weather.region_mapping (
    zone_id, zone_name, city, centroid_lat, centroid_lng, area_sq_km,
    risk_score, risk_level, flood_prone, drainage_quality,
    avg_orders_per_hour, imd_station_ids, description
) VALUES
    (
        'ZONE_A', 'Koramangala', 'Bangalore',
        12.9352, 77.6245, 8.5,
        1.0, 'medium', FALSE, 'moderate',
        85, ARRAY['43296'],
        'Moderate risk — moderate rain frequency, good road infrastructure'
    ),
    (
        'ZONE_B', 'Whitefield', 'Bangalore',
        12.9698, 77.7500, 12.3,
        1.3, 'high', TRUE, 'poor',
        65, ARRAY['43296'],
        'High risk — flood-prone areas, heavy traffic, poor drainage'
    ),
    (
        'ZONE_C', 'Indiranagar', 'Bangalore',
        12.9784, 77.6408, 6.2,
        0.8, 'low', FALSE, 'good',
        95, ARRAY['43296'],
        'Low risk — well-planned area, good drainage, high order density'
    )
ON CONFLICT (zone_id) DO UPDATE SET
    zone_name = EXCLUDED.zone_name,
    risk_score = EXCLUDED.risk_score,
    risk_level = EXCLUDED.risk_level,
    flood_prone = EXCLUDED.flood_prone,
    drainage_quality = EXCLUDED.drainage_quality,
    avg_orders_per_hour = EXCLUDED.avg_orders_per_hour,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Add PostGIS boundaries if PostGIS is available
DO $$
BEGIN
    IF system.has_postgis() THEN
        -- ZONE_A: Koramangala (approximate polygon)
        UPDATE weather.region_mapping SET boundary = ST_SetSRID(ST_GeomFromText(
            'POLYGON((
                77.6100 12.9250,
                77.6400 12.9250,
                77.6400 12.9450,
                77.6100 12.9450,
                77.6100 12.9250
            ))'
        ), 4326) WHERE zone_id = 'ZONE_A';

        -- ZONE_B: Whitefield (approximate polygon)
        UPDATE weather.region_mapping SET boundary = ST_SetSRID(ST_GeomFromText(
            'POLYGON((
                77.7200 12.9500,
                77.7800 12.9500,
                77.7800 12.9900,
                77.7200 12.9900,
                77.7200 12.9500
            ))'
        ), 4326) WHERE zone_id = 'ZONE_B';

        -- ZONE_C: Indiranagar (approximate polygon)
        UPDATE weather.region_mapping SET boundary = ST_SetSRID(ST_GeomFromText(
            'POLYGON((
                77.6250 12.9650,
                77.6550 12.9650,
                77.6550 12.9900,
                77.6250 12.9900,
                77.6250 12.9650
            ))'
        ), 4326) WHERE zone_id = 'ZONE_C';

        RAISE NOTICE 'PostGIS boundaries set for all 3 zones.';
    ELSE
        RAISE NOTICE 'PostGIS not available. Zones created without polygon boundaries.';
    END IF;
END $$;

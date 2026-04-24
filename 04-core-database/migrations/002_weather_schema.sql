-- ============================================================================
-- Migration 002: Weather Schema
-- ============================================================================
-- Tables: observations, forecasts, event_tags, civic_disruptions, region_mapping
-- Also: auto_tag_event() trigger function, zone_risk_summary materialized view
-- ============================================================================

-- ============================================================================
-- 1. weather.observations (Hypertable candidate)
-- ============================================================================
-- THE SINGLE MOST CRITICAL TABLE IN COVA.
-- Every CDI computation, claim trigger, premium calculation, and insurer report
-- traces back to a row here. This is the "ground truth" of parametric insurance.
--
-- Data sources:
--   - Open-Meteo API (free, no key): temperature, humidity, precipitation, wind, pressure
--   - Open-Meteo Air Quality API: PM2.5, PM10, NO2, O3, AQI
--   - Mock API (demo mode): simulated weather for accelerated demo cycles
--
-- ~43,800 rows/zone over 5 years of hourly historical data.
-- ~432 rows/day in real-time mode (10-min polling × 3 zones).
-- ============================================================================
CREATE TABLE IF NOT EXISTS weather.observations (
    id              BIGSERIAL,
    zone            TEXT NOT NULL,
    source          TEXT NOT NULL,                       -- 'open_meteo','open_meteo_aqi','cpcb','mock','autonomous_engine'

    -- Core Measurements (from Open-Meteo / IMD AWS)
    rainfall_mm     NUMERIC(8,2),                       -- mm/hr — PRIMARY CDI trigger
    temperature_c   NUMERIC(6,2),                       -- Celsius — heat disruption trigger
    wind_speed_kmh  NUMERIC(8,2),                       -- km/h — cyclone/storm trigger
    wind_direction  NUMERIC(5,1),                       -- 0-360 degrees — storm path prediction
    humidity_pct    NUMERIC(5,2),                       -- 0-100% — heat index calculation
    pressure_hpa    NUMERIC(8,2),                       -- hPa — storm onset detection
    visibility_km   NUMERIC(8,2),                       -- km — fog/smog event trigger

    -- Air Quality (from Open-Meteo AQI / CPCB CAAQMS)
    aqi             INTEGER,                            -- Composite Air Quality Index (0-500)
    pm25            NUMERIC(8,2),                       -- PM2.5 μg/m³ — fine particulate
    pm10            NUMERIC(8,2),                       -- PM10 μg/m³ — coarse particulate
    no2             NUMERIC(8,2),                       -- NO2 μg/m³ — traffic congestion correlation
    o3              NUMERIC(8,2),                       -- O3 μg/m³ — afternoon heat+ozone compound

    -- Derived Scores (computed at ingestion time)
    condition       TEXT,                                -- 'clear','light_rain','moderate_rain','heavy_rain','extreme_heat','cyclone','smog'
    weather_score   NUMERIC(6,4),                       -- Normalized 0-1 score for CDI computation
    severity_level  TEXT,                                -- 'normal','elevated','severe','extreme'
    heat_index_c    NUMERIC(6,2),                       -- Feels-like temperature (temp + humidity)

    -- Geospatial (station-level data)
    station_id      TEXT,                               -- IMD AWS station ID or Open-Meteo grid point
    lat             NUMERIC(10,6),
    lng             NUMERIC(10,6),

    -- Mode
    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',

    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id, timestamp)
);

-- ============================================================================
-- 2. weather.forecasts (Hypertable candidate)
-- ============================================================================
-- Weather predictions at various time horizons. Used for proactive worker alerts,
-- insurer risk projections, and premium adjustment modeling.
-- ============================================================================
CREATE TABLE IF NOT EXISTS weather.forecasts (
    id              BIGSERIAL,
    zone            TEXT NOT NULL,
    source          TEXT NOT NULL,                       -- 'open_meteo_forecast','sarima','arima_corrected','monte_carlo'
    forecast_type   TEXT NOT NULL,                       -- 'short_term' (0-48h),'medium_term' (2-4w),'seasonal' (1-6m)

    -- Prediction
    target_timestamp TIMESTAMPTZ NOT NULL,               -- When this forecast is FOR
    rainfall_mm     NUMERIC(8,2),
    temperature_c   NUMERIC(6,2),
    wind_speed_kmh  NUMERIC(8,2),

    -- Confidence
    confidence      NUMERIC(5,4),                       -- 0.0-1.0
    lower_bound_80  NUMERIC(8,2),                       -- 80% CI lower
    upper_bound_80  NUMERIC(8,2),                       -- 80% CI upper
    lower_bound_95  NUMERIC(8,2),                       -- 95% CI lower
    upper_bound_95  NUMERIC(8,2),                       -- 95% CI upper

    -- Risk mapping
    predicted_cdi_weather NUMERIC(6,4),                 -- Predicted weather score
    predicted_claim_probability NUMERIC(6,4),

    -- Mode
    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',

    -- When this forecast was GENERATED
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id, generated_at)
);

-- ============================================================================
-- 3. weather.event_tags
-- ============================================================================
-- Named weather events (e.g., "Cyclone Bharath", "March Heat Wave"). Auto-tagged
-- by the trigger on weather.observations or manually tagged by admin.
-- Links observations to human-understandable events for reporting and ML training.
-- ============================================================================
CREATE TABLE IF NOT EXISTS weather.event_tags (
    id              BIGSERIAL PRIMARY KEY,
    event_name      TEXT NOT NULL,                       -- 'Cyclone Bharath','March Heat Wave'
    event_type      TEXT NOT NULL,                       -- 'cyclone','heatwave','flood','thunderstorm'

    -- Temporal
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ,
    duration_hours  NUMERIC(8,2),

    -- Spatial
    affected_zones  TEXT[] NOT NULL,                     -- {'ZONE_A','ZONE_B'}

    -- Severity
    max_rainfall_mm NUMERIC(8,2),
    max_temperature_c NUMERIC(6,2),
    max_wind_kmh    NUMERIC(8,2),
    peak_cdi        NUMERIC(6,4),
    imd_category    TEXT,                               -- 'Heavy','Very Heavy','Extremely Heavy'

    -- Impact
    claims_triggered INTEGER DEFAULT 0,
    total_payout    NUMERIC(12,2) DEFAULT 0,
    workers_affected INTEGER DEFAULT 0,

    -- ENSO context
    enso_phase      TEXT,                               -- 'El Nino','La Nina','Neutral'
    oni_index       NUMERIC(4,2),                       -- Oceanic Nino Index

    -- Mode
    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. weather.civic_disruptions (Curfew, Bandh, Section 144)
-- ============================================================================
-- CRITICAL TABLE: Acts as a "Master Override" to the weather-based CDI.
-- On a sunny day with a government-ordered curfew, all weather sensors read
-- "normal" but the worker earns ₹0. This table ensures workers get paid even
-- when the disruption is civic, not meteorological.
--
-- cdi_override column: When active AND higher than weather CDI, this value
-- replaces the weather CDI. final_cdi = MAX(weather_cdi, civic_cdi_override).
--
-- Historical data: ~80-120 verified civic disruption events over 5 years
-- from SDMA notifications, police orders, news archives, BBMP records.
-- ============================================================================
CREATE TABLE IF NOT EXISTS weather.civic_disruptions (
    id              BIGSERIAL PRIMARY KEY,

    -- Event Classification
    disruption_type TEXT NOT NULL,                       -- 'CURFEW','BANDH','SECTION_144','PROTEST','VIP_MOVEMENT','FESTIVAL_CLOSURE','CIVIC_UNREST','STRIKE'
    source          TEXT NOT NULL,                       -- 'sdma_notification','police_order','news_verified','platform_report'
    source_reference TEXT,                              -- URL or notification ID for audit trail
    source_hash     TEXT,                               -- SHA-256 of the official notification document

    -- Intensity Levels (determines CDI override magnitude)
    intensity_level INTEGER NOT NULL DEFAULT 2,          -- 1=Night Only, 2=Partial, 3=Full Lockdown
    -- LEVEL 1: Night Curfew (10 PM - 6 AM) — minimal impact on peak delivery shifts
    -- LEVEL 2: Partial Shutdown (essential services only) — major impact on gig workers
    -- LEVEL 3: Full Lockdown / Complete Curfew — CDI auto-locked at 1.0

    cdi_override    NUMERIC(6,4),                       -- Direct CDI value override
    -- Level 1 → cdi_override = 0.3 (minor, only night shifts affected)
    -- Level 2 → cdi_override = 0.7 (major, most deliveries stopped)
    -- Level 3 → cdi_override = 1.0 (total, all work impossible)

    -- Temporal
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ,                        -- NULL = ongoing/indefinite
    duration_hours  NUMERIC(8,2),                       -- Computed or estimated duration
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,      -- Active = currently enforced

    -- Spatial — Curfews are NOT always city-wide
    affected_zones  TEXT[] NOT NULL,                     -- {'ZONE_A','ZONE_B'} — specific zones hit
    jurisdiction    TEXT,                               -- 'koramangala_ps','indiranagar_ps','city_wide'

    -- Reasoning / Context
    reason          TEXT NOT NULL,                       -- 'Communal tension in Koramangala'
    official_order_number TEXT,                         -- 'DM/BLR/2026/SEC144/0047'

    -- Impact Metrics (populated after the event ends)
    workers_affected INTEGER DEFAULT 0,
    claims_triggered INTEGER DEFAULT 0,
    total_payout    NUMERIC(12,2) DEFAULT 0,
    platform_order_drop_pct NUMERIC(5,2),               -- Measured % drop in orders

    -- Verification
    verified        BOOLEAN DEFAULT FALSE,              -- Verified by a second source?
    verified_by     TEXT,
    verified_at     TIMESTAMPTZ,

    -- Mode
    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add PostGIS jurisdiction_boundary conditionally
DO $$
BEGIN
    IF system.has_postgis() THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'weather' AND table_name = 'civic_disruptions'
              AND column_name = 'jurisdiction_boundary'
        ) THEN
            ALTER TABLE weather.civic_disruptions
                ADD COLUMN jurisdiction_boundary GEOMETRY(Polygon, 4326);
        END IF;
    END IF;
END $$;

-- ============================================================================
-- 5. weather.region_mapping
-- ============================================================================
-- Zone definitions with PostGIS polygon boundaries. Maps zone IDs to physical
-- neighborhoods with risk profiles and baseline metrics.
-- ============================================================================
CREATE TABLE IF NOT EXISTS weather.region_mapping (
    zone_id         TEXT PRIMARY KEY,                    -- 'ZONE_A'
    zone_name       TEXT NOT NULL,                       -- 'Koramangala'
    city            TEXT NOT NULL DEFAULT 'Bangalore',

    -- Risk profile
    centroid_lat    NUMERIC(10,6) NOT NULL,
    centroid_lng    NUMERIC(10,6) NOT NULL,
    area_sq_km      NUMERIC(8,2),

    risk_score      NUMERIC(4,2) NOT NULL DEFAULT 1.0,   -- 0.8 (low) to 1.3 (high)
    risk_level      TEXT NOT NULL DEFAULT 'medium',       -- 'low','medium','high'
    flood_prone     BOOLEAN DEFAULT FALSE,
    drainage_quality TEXT DEFAULT 'moderate',             -- 'poor','moderate','good'

    -- Baseline metrics
    avg_orders_per_hour INTEGER DEFAULT 80,
    imd_station_ids TEXT[],                             -- Mapped IMD AWS stations

    description     TEXT,

    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add PostGIS boundary column conditionally
DO $$
BEGIN
    IF system.has_postgis() THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'weather' AND table_name = 'region_mapping'
              AND column_name = 'boundary'
        ) THEN
            ALTER TABLE weather.region_mapping
                ADD COLUMN boundary GEOMETRY(Polygon, 4326);
        END IF;
    END IF;
END $$;

-- ============================================================================
-- 6. Trigger Function: weather.auto_tag_event()
-- ============================================================================
-- Automatically creates an event_tag when heavy rainfall is detected in a
-- real-mode weather observation. Only fires for data_mode = 'real'.
-- ============================================================================
CREATE OR REPLACE FUNCTION weather.auto_tag_event()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.rainfall_mm >= 65.0 AND NEW.data_mode = 'real' THEN
        INSERT INTO weather.event_tags (
            event_name, event_type, start_time, affected_zones,
            max_rainfall_mm, imd_category, data_mode
        ) VALUES (
            'Auto-detected heavy rainfall in ' || NEW.zone,
            'heavy_rain', NEW.timestamp, ARRAY[NEW.zone], NEW.rainfall_mm,
            CASE
                WHEN NEW.rainfall_mm >= 204.5 THEN 'Extremely Heavy'
                WHEN NEW.rainfall_mm >= 115.5 THEN 'Very Heavy'
                WHEN NEW.rainfall_mm >= 64.5 THEN 'Heavy'
            END,
            NEW.data_mode
        ) ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to observations
DROP TRIGGER IF EXISTS trg_weather_auto_tag ON weather.observations;
CREATE TRIGGER trg_weather_auto_tag
    AFTER INSERT ON weather.observations
    FOR EACH ROW EXECUTE FUNCTION weather.auto_tag_event();

-- ============================================================================
-- 7. Materialized View: weather.zone_risk_summary
-- ============================================================================
-- Pre-aggregated risk metrics per zone for dashboard display.
-- Refreshed every 5 minutes by a cron job or on-demand.
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS weather.zone_risk_summary AS
SELECT zone, data_mode,
    DATE_TRUNC('day', timestamp) as date,
    AVG(weather_score) as avg_weather_score,
    MAX(weather_score) as max_weather_score,
    AVG(rainfall_mm) as avg_rainfall,
    MAX(rainfall_mm) as max_rainfall,
    COUNT(*) FILTER (WHERE weather_score >= 0.6) as breach_count,
    COUNT(*) as observation_count
FROM weather.observations
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY zone, data_mode, DATE_TRUNC('day', timestamp)
WITH NO DATA;  -- Populate on first REFRESH

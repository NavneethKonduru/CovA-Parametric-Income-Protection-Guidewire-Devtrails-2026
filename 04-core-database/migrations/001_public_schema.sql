-- ============================================================================
-- Migration 001: Public Schema — Core Insurance Entities
-- ============================================================================
-- Tables: workers, policies, claims, disruption_events, payout_log,
--         worker_signals, insurer_config, admin_config, telemetry_raw
-- ============================================================================

-- ============================================================================
-- 1. public.workers
-- ============================================================================
-- Core worker profiles. 10 hardcoded + 100 simulated for demo mode.
-- Real workers enrolled via Android app or admin panel.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workers (
    -- Identity
    id              TEXT PRIMARY KEY,                    -- 'W001', 'SIM_W001'
    name            TEXT NOT NULL,                       -- 'Raju Kumar'
    email           TEXT UNIQUE,                         -- 'raju@example.com'
    phone           TEXT,                               -- '9876543210'
    phone_hash      TEXT,                               -- SHA-256 for deduplication
    aadhaar_hash    TEXT,                               -- SHA-256 of Aadhaar (NEVER store raw)

    -- Profile
    zone            TEXT NOT NULL,                       -- 'ZONE_A', 'ZONE_B', 'ZONE_C'
    platform        TEXT NOT NULL,                       -- 'zepto', 'blinkit', 'swiggy_instamart'
    archetype       TEXT NOT NULL DEFAULT 'balanced',    -- 'heavy_peak', 'balanced', 'casual'
    hourly_rate     NUMERIC(10,2) NOT NULL DEFAULT 120,  -- Rs 80, 120, 150

    -- Status
    status          TEXT NOT NULL DEFAULT 'active',      -- 'active', 'inactive', 'suspended', 'churned'
    enrolled_date   DATE NOT NULL DEFAULT CURRENT_DATE,

    -- UPI (for payouts)
    upi_id          TEXT,                               -- 'worker@okaxis'

    -- Flags
    is_simulated    BOOLEAN NOT NULL DEFAULT FALSE,      -- TRUE for SIM_W* workers
    daily_claims_cap NUMERIC(4,1) NOT NULL DEFAULT 8.0,  -- Max claimable hours/day
    seasonal_factor NUMERIC(4,2) NOT NULL DEFAULT 1.0,   -- Monsoon loading factor
    peak_hours_per_week NUMERIC(4,1) DEFAULT 20,         -- Declared peak hours

    -- Mode
    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. public.policies
-- ============================================================================
-- Insurance policy records. One worker can have multiple policies over time,
-- but typically only one is 'active' at any given point.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.policies (
    id              TEXT PRIMARY KEY,                    -- 'POL_SIM_001', 'POL_REAL_001'
    worker_id       TEXT NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
    worker_name     TEXT,                               -- Denormalized for fast reads

    -- Policy details
    zone            TEXT NOT NULL,
    platform        TEXT,
    archetype       TEXT,
    weekly_premium  NUMERIC(10,2) NOT NULL,              -- Rs 19-89
    daily_cover_cap NUMERIC(10,2) NOT NULL DEFAULT 960,  -- Max daily payout

    -- Status
    status          TEXT NOT NULL DEFAULT 'active',       -- 'active', 'lapsed', 'cancelled', 'expired'
    effective_date  DATE NOT NULL,
    expiry_date     DATE NOT NULL,

    -- Payment tracking
    upi_id          TEXT,
    payment_txn_id  TEXT,                               -- Premium payment reference
    payment_ref     TEXT,
    last_premium_date DATE,                             -- Last premium collection date
    premiums_paid   INTEGER NOT NULL DEFAULT 0,          -- Count of premiums collected

    -- Mode
    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. public.claims
-- ============================================================================
-- Claim records with full fraud analysis results. The most heavily queried
-- table in the system — dashboards, reports, worker app all read from here.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.claims (
    id                  TEXT PRIMARY KEY,                 -- 'CLM_1234_ABCD1234'
    worker_id           TEXT NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
    policy_id           TEXT REFERENCES public.policies(id),
    worker_name         TEXT,                            -- Denormalized

    -- Disruption context
    zone                TEXT NOT NULL,
    disruption_type     TEXT NOT NULL,                    -- 'SEVERE_WEATHER','PLATFORM_OUTAGE','EXTREME_HEAT','CYCLONE','CIVIC_CURFEW'
    date                DATE NOT NULL,
    time_slot           TEXT NOT NULL,                    -- 'peak', 'active', 'off'
    hours_lost          NUMERIC(4,1) NOT NULL,            -- 0.0-8.0

    -- CDI data
    cdi                 NUMERIC(6,4) NOT NULL,            -- 0.0000-1.0000
    trigger_level       TEXT NOT NULL,                    -- 'none', 'watch', 'standard', 'critical'

    -- Validation
    validation_status   TEXT NOT NULL,                    -- 'approved', 'rejected'
    validation_reason   TEXT,

    -- Payout
    payout_amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
    payout_txn_id       TEXT,                            -- Razorpay/UPI transaction ID

    -- AI
    ai_explanation      TEXT,                            -- Groq-generated explanation

    -- Fraud
    fraud_result        JSONB,                           -- Full TCHC analysis result
    fraud_confidence    NUMERIC(6,4) DEFAULT 0.0,        -- 0.0000-1.0000

    -- Status
    status              TEXT NOT NULL DEFAULT 'pending',  -- 'pending','pending_payment','paid','flagged','rejected'

    -- Mode
    data_mode           data_mode_enum NOT NULL DEFAULT 'demo',

    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. public.disruption_events
-- ============================================================================
-- CDI breach events per zone. Becomes a TimescaleDB hypertable in migration 009.
-- Composite PK (id, timestamp) required for hypertable partitioning.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.disruption_events (
    id              BIGSERIAL,
    zone            TEXT NOT NULL,
    condition       TEXT NOT NULL,                       -- 'clear','light_rain','heavy_rain','extreme_heat','cyclone'
    cdi             NUMERIC(6,4) NOT NULL,

    -- Signal breakdown
    weather_score   NUMERIC(6,4),
    demand_score    NUMERIC(6,4),
    peer_score      NUMERIC(6,4),

    -- Context
    narrative       TEXT,                                -- Human-readable disruption description
    trigger_level   TEXT,                                -- 'none','watch','standard','critical'

    -- Mode
    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',

    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id, timestamp)
);

-- ============================================================================
-- 5. public.payout_log
-- ============================================================================
-- Payment transaction records. Every claim payout attempt (success or failure)
-- creates a row here. Used for financial reconciliation.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payout_log (
    id              BIGSERIAL PRIMARY KEY,
    claim_id        TEXT NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    worker_id       TEXT NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,

    amount          NUMERIC(10,2) NOT NULL,
    status          TEXT NOT NULL DEFAULT 'success',     -- 'success','failed','pending','reversed'
    payment_method  TEXT DEFAULT 'UPI',                  -- 'UPI','bank_transfer','simulated'
    payment_provider TEXT DEFAULT 'Razorpay',            -- 'Razorpay','simulated'
    txn_reference   TEXT,                               -- External payment reference

    metadata        JSONB DEFAULT '{}',                  -- { method, provider, txnId, ... }
    error_message   TEXT,                               -- If status = 'failed'
    retry_count     INTEGER DEFAULT 0,

    -- Mode
    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. public.worker_signals
-- ============================================================================
-- Latest telemetry state per worker. Updated on every GPS ping from Android.
-- Contains TCHC hardware signals used for fraud detection.
-- Only stores the MOST RECENT state — full history goes to telemetry_raw.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.worker_signals (
    worker_id               TEXT PRIMARY KEY REFERENCES public.workers(id) ON DELETE CASCADE,

    -- Location
    lat                     NUMERIC(10,6),
    lng                     NUMERIC(10,6),

    -- GNSS telemetry
    gnss_variance           NUMERIC(8,4),
    velocity                NUMERIC(8,4),                -- km/h
    zone_entry              TEXT,                         -- Zone entry timestamp

    -- Platform state
    platform_active         BOOLEAN DEFAULT TRUE,
    signal_mode             TEXT DEFAULT 'auto_genuine',  -- 'auto_genuine', 'auto_fraud'

    -- TCHC Hardware signals
    satellite_count         INTEGER,
    cn0_mean                NUMERIC(6,2),
    cn0_stddev              NUMERIC(6,2),
    signal_authenticity_score NUMERIC(5,3),               -- 0.000-1.000

    -- Device info (for fraud blacklisting)
    device_id               TEXT,
    device_model            TEXT,
    os_version              TEXT,

    -- Mode
    data_mode               data_mode_enum NOT NULL DEFAULT 'demo',

    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add PostGIS geometry column conditionally
DO $$
BEGIN
    IF system.has_postgis() THEN
        -- Add geom column only if PostGIS is available
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'worker_signals' AND column_name = 'geom'
        ) THEN
            ALTER TABLE public.worker_signals ADD COLUMN geom GEOMETRY(Point, 4326);
        END IF;
    END IF;
END $$;

-- ============================================================================
-- 7. public.insurer_config
-- ============================================================================
-- Insurer-adjustable parameters. Shared across modes (no data_mode column).
-- 5 default rows: base_premium_rate, max_payout_per_event, cdi_trigger_threshold,
-- covered_zones, weekly_coverage_cap.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.insurer_config (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    min_value       NUMERIC,
    max_value       NUMERIC,
    description     TEXT,                               -- Human-readable parameter description
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by      TEXT,                               -- Who changed it

    -- JSON validation constraint
    CONSTRAINT chk_covered_zones CHECK (
        (key = 'covered_zones' AND value::jsonb IS NOT NULL) OR
        (key != 'covered_zones')
    )
);

-- ============================================================================
-- 8. public.admin_config
-- ============================================================================
-- System-level configuration. Shared across modes (no data_mode column).
-- 5 default rows: cdi_weights, fraud_rules, zone_risk_factors, cdi_strategy,
-- autonomous_fraud_enabled.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_config (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    description     TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by      TEXT,

    CONSTRAINT chk_json_configs CHECK (
        (key IN ('cdi_weights','fraud_rules','zone_risk_factors') AND value::jsonb IS NOT NULL)
        OR key NOT IN ('cdi_weights','fraud_rules','zone_risk_factors')
    )
);

-- ============================================================================
-- 9. public.telemetry_raw
-- ============================================================================
-- Full telemetry history from Android devices. Every 15-second GPS ping is stored
-- here. Becomes a TimescaleDB hypertable with 7-day compression and 90-day retention.
-- Composite PK (id, timestamp) required for hypertable partitioning.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.telemetry_raw (
    id              BIGSERIAL,
    worker_id       TEXT NOT NULL,
    lat             NUMERIC(10,6) NOT NULL,
    lng             NUMERIC(10,6) NOT NULL,
    satellite_count INTEGER,
    cn0_values      NUMERIC(6,2)[],
    gnss_variance   NUMERIC(8,4),
    velocity_kmh    NUMERIC(8,4),
    heading         NUMERIC(5,1),
    gyro_variance   NUMERIC(8,4),
    accelerometer   JSONB,
    network_type    TEXT,
    signal_strength INTEGER,
    device_id       TEXT,
    battery_level   INTEGER,
    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

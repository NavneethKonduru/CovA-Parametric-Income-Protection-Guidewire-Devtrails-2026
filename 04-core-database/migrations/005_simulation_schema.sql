-- ============================================================================
-- Migration 005: Simulation Schema
-- ============================================================================
-- Tables: runs, events, scenario_library, insurer_simulations, state
-- ============================================================================

-- ============================================================================
-- 1. simulation.runs
-- ============================================================================
-- Tracks every simulation execution. A "run" is a complete demo cycle or
-- insurer simulation from start to finish. Used to compare scenarios.
-- ============================================================================
CREATE TABLE IF NOT EXISTS simulation.runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_type        TEXT NOT NULL,                       -- 'autonomous_demo','insurer_simulation','stress_test','scenario'
    scenario_name   TEXT,
    config          JSONB NOT NULL DEFAULT '{}',

    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    duration_seconds NUMERIC(10,2),
    cycle_interval_ms INTEGER DEFAULT 60000,

    total_events    INTEGER DEFAULT 0,
    total_claims    INTEGER DEFAULT 0,
    total_fraud     INTEGER DEFAULT 0,
    total_payout    NUMERIC(14,2) DEFAULT 0,

    status          TEXT NOT NULL DEFAULT 'running',      -- 'running','completed','aborted','failed'
    initiated_by    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. simulation.events (Hypertable candidate)
-- ============================================================================
-- Individual events within a simulation run. Every weather preset, CDI change,
-- claim generation, or fraud block is recorded here.
-- ============================================================================
CREATE TABLE IF NOT EXISTS simulation.events (
    id              BIGSERIAL,
    run_id          UUID REFERENCES simulation.runs(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    zone            TEXT,
    event_data      JSONB NOT NULL DEFAULT '{}',
    weather_preset  TEXT,
    max_cdi         NUMERIC(6,4),
    claims_generated INTEGER DEFAULT 0,
    fraud_blocked   INTEGER DEFAULT 0,

    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

-- ============================================================================
-- 3. simulation.scenario_library
-- ============================================================================
-- Pre-configured scenario templates for demo mode. Each scenario defines
-- weather parameters, expected CDI ranges, and claim expectations.
-- ============================================================================
CREATE TABLE IF NOT EXISTS simulation.scenario_library (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    category        TEXT NOT NULL,                        -- 'weather','civic','compound','seasonal'
    config_template JSONB NOT NULL,

    expected_cdi_range  NUMRANGE,                        -- e.g., '[0.6, 0.95]'
    expected_claims     INT4RANGE,                       -- e.g., '[5, 25]'
    expected_fraud_rate NUMERIC(5,4),

    rainfall_mm     NUMERIC(8,2),
    temperature_c   NUMERIC(6,2),
    wind_speed_kmh  NUMERIC(8,2),
    label           TEXT,                                -- UI display label

    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. simulation.insurer_simulations
-- ============================================================================
-- Insurer "what-if" analysis runs. Input assumptions + Monte Carlo outputs.
-- Allows insurers to model profitability under different weather scenarios.
-- ============================================================================
CREATE TABLE IF NOT EXISTS simulation.insurer_simulations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insurer_id      TEXT,
    simulation_name TEXT NOT NULL,

    assumptions     JSONB NOT NULL,
    weather_scenario TEXT,
    worker_count    INTEGER NOT NULL,
    simulation_months INTEGER NOT NULL DEFAULT 12,

    projected_premium_income NUMERIC(14,2),
    projected_claims        INTEGER,
    projected_payouts       NUMERIC(14,2),
    projected_loss_ratio    NUMERIC(8,4),
    projected_profit        NUMERIC(14,2),

    monthly_breakdown   JSONB,
    risk_metrics        JSONB,

    status          TEXT NOT NULL DEFAULT 'pending',      -- 'pending','running','completed','failed'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

-- ============================================================================
-- 5. simulation.state
-- ============================================================================
-- Singleton row tracking the current demo simulation state. Only id=1 exists.
-- Updated every cycle by the autonomous engine.
-- ============================================================================
CREATE TABLE IF NOT EXISTS simulation.state (
    id                  INTEGER PRIMARY KEY DEFAULT 1,
    current_scenario    TEXT,
    active_since        TIMESTAMPTZ,
    simulated_conditions JSONB,
    current_run_id      UUID REFERENCES simulation.runs(id),
    escalation_factor   NUMERIC(4,2) DEFAULT 1.0,
    storm_propagation_pct NUMERIC(5,2) DEFAULT 30.0,
    cycle_count         INTEGER DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

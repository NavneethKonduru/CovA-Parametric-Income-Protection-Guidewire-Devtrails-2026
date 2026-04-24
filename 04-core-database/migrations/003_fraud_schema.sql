-- ============================================================================
-- Migration 003: Fraud Schema
-- ============================================================================
-- Tables: detection_log, risk_scores, device_blacklist, anomaly_detections
-- ============================================================================

-- ============================================================================
-- 1. fraud.detection_log
-- ============================================================================
-- Every claim runs through the TCHC (Temporal-Hardware-Contextual-Historical)
-- fraud analysis pipeline. The full result is stored here for audit and ML training.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fraud.detection_log (
    id              BIGSERIAL PRIMARY KEY,
    claim_id        TEXT NOT NULL REFERENCES public.claims(id),
    worker_id       TEXT NOT NULL REFERENCES public.workers(id),

    -- TCHC Analysis
    fraud_score     NUMERIC(6,4) NOT NULL,               -- 0.0000-1.0000
    risk_level      TEXT NOT NULL,                        -- 'low','medium','high'
    action          TEXT NOT NULL,                        -- 'pass','flag_for_review','auto_reject'

    -- TCHC Layer Results
    hardware_layer  BOOLEAN DEFAULT FALSE,               -- Hardware signal anomaly detected
    temporal_layer  BOOLEAN DEFAULT FALSE,               -- Temporal pattern anomaly detected
    spatial_layer   BOOLEAN DEFAULT FALSE,               -- Spatial anomaly detected

    -- Flags
    flags           JSONB NOT NULL DEFAULT '[]',          -- Array of detected fraud indicators
    total_flags     INTEGER NOT NULL DEFAULT 0,
    safeguards_applied INTEGER DEFAULT 0,

    -- Rules triggered (denormalized for fast filtering)
    rules_triggered TEXT[] DEFAULT '{}',

    -- Decision context
    decision_explanation TEXT,

    -- Mode
    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. fraud.risk_scores (Hypertable candidate)
-- ============================================================================
-- Time-series risk scores computed per worker, zone, or time window.
-- Used for trend analysis and proactive fraud alerts.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fraud.risk_scores (
    id              BIGSERIAL,
    scope_type      TEXT NOT NULL,                       -- 'worker','zone','time_window'
    worker_id       TEXT REFERENCES public.workers(id),
    zone            TEXT,
    time_window     TEXT,

    risk_score      NUMERIC(6,4) NOT NULL,
    claim_frequency NUMERIC(6,4),
    fraud_rate      NUMERIC(6,4),
    anomaly_score   NUMERIC(6,4),

    contributing_factors JSONB DEFAULT '{}',
    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',

    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, computed_at)
);

-- ============================================================================
-- 3. fraud.device_blacklist
-- ============================================================================
-- Devices identified as fraud tools (GPS spoofers, device farms, rooted phones).
-- Checked during telemetry ingestion to immediately flag submissions.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fraud.device_blacklist (
    device_id       TEXT PRIMARY KEY,
    reason          TEXT NOT NULL,
    worker_id       TEXT,
    claim_id        TEXT,
    blacklisted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT TRUE
);

-- ============================================================================
-- 4. fraud.anomaly_detections
-- ============================================================================
-- Statistical and ML-detected anomalies that don't directly map to a single
-- claim but indicate systemic issues (e.g., cluster of claims from same IP,
-- impossible velocity patterns across multiple workers).
-- ============================================================================
CREATE TABLE IF NOT EXISTS fraud.anomaly_detections (
    id              BIGSERIAL PRIMARY KEY,
    detection_type  TEXT NOT NULL,                       -- 'statistical','ml_isolation_forest','pattern_match'
    entity_type     TEXT NOT NULL,                       -- 'worker','zone','claim_batch'
    entity_id       TEXT,
    description     TEXT NOT NULL,
    severity        TEXT NOT NULL DEFAULT 'medium',       -- 'low','medium','high','critical'
    confidence      NUMERIC(5,4),
    detection_data  JSONB,

    resolved        BOOLEAN DEFAULT FALSE,
    resolution_note TEXT,
    resolved_by     TEXT,
    resolved_at     TIMESTAMPTZ,

    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

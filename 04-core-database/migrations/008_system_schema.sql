-- ============================================================================
-- Migration 008: System Schema
-- ============================================================================
-- Tables: events, metrics, audit_log, process_log, config
-- ============================================================================

-- ============================================================================
-- 1. system.events (Hypertable candidate)
-- ============================================================================
-- High-volume event log. Every significant system action (claim batch, mode switch,
-- fraud alert, cron tick) creates a row here. Retention: 90 days.
-- ============================================================================
CREATE TABLE IF NOT EXISTS system.events (
    id              BIGSERIAL,
    type            TEXT NOT NULL,                        -- 'CLAIM_BATCH','CDI_UPDATE','MODE_SWITCH','FRAUD_ALERT','CRON_TICK','ERROR'
    description     TEXT,
    metadata        JSONB DEFAULT '{}',
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

-- ============================================================================
-- 2. system.metrics
-- ============================================================================
-- Simple KV store for cumulative counters. Low-cardinality (~10 rows).
-- e.g., total_claims_processed, total_fraud_blocked, total_payouts_sent.
-- ============================================================================
CREATE TABLE IF NOT EXISTS system.metrics (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. system.audit_log (Hypertable candidate)
-- ============================================================================
-- Row-level change tracking. Records who changed what, when, and the before/after
-- values. Required for regulatory compliance (IRDAI sandbox requirements).
-- Retention: 1 year.
-- ============================================================================
CREATE TABLE IF NOT EXISTS system.audit_log (
    id              BIGSERIAL,
    user_email      TEXT,
    user_role       TEXT,
    ip_address      INET,
    action          TEXT NOT NULL,                        -- 'INSERT','UPDATE','DELETE','CONFIG_CHANGE'
    table_name      TEXT NOT NULL,
    record_id       TEXT,
    old_values      JSONB,
    new_values      JSONB,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

-- ============================================================================
-- 4. system.process_log (Hypertable candidate)
-- ============================================================================
-- Engine trace/debug logs. Each engine cycle writes structured log entries with
-- a correlation_id linking all steps in a processing pipeline.
-- Retention: 30 days.
-- ============================================================================
CREATE TABLE IF NOT EXISTS system.process_log (
    id              BIGSERIAL,
    correlation_id  TEXT,                                -- Groups all log entries from one pipeline run
    stage           TEXT NOT NULL,                        -- 'weather_fetch','cdi_compute','claim_trigger','fraud_check','payout'
    category        TEXT NOT NULL,                        -- 'info','warning','error','metric'
    message         TEXT,
    data            JSONB,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

-- ============================================================================
-- 5. system.config
-- ============================================================================
-- System-level configuration KV store. Includes current_mode ('real'/'demo'),
-- feature flags, and operational settings.
-- ============================================================================
CREATE TABLE IF NOT EXISTS system.config (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    description     TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by      TEXT
);

-- Seed the initial mode config
INSERT INTO system.config (key, value, description)
VALUES ('current_mode', 'demo', 'Current operational mode: real or demo')
ON CONFLICT (key) DO NOTHING;

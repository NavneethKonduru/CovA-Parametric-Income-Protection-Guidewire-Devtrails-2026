-- ============================================================================
-- Migration 007: Reporting Schema
-- ============================================================================
-- Tables: generated_reports, analytics_snapshots
-- ============================================================================

-- ============================================================================
-- 1. reporting.generated_reports
-- ============================================================================
-- Stores generated reports (risk assessments, business pitches, financial summaries,
-- fraud audits). Content stored as JSONB for flexible rendering + optional
-- HTML and PDF output paths.
-- ============================================================================
CREATE TABLE IF NOT EXISTS reporting.generated_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type     TEXT NOT NULL,                        -- 'risk_assessment','business_pitch','financial_summary','fraud_audit','forecast_summary','analytics_snapshot'
    title           TEXT NOT NULL,
    content         JSONB NOT NULL,                      -- Structured report data
    content_html    TEXT,                                -- Pre-rendered HTML
    content_pdf_path TEXT,                               -- Path to generated PDF
    parameters      JSONB DEFAULT '{}',                  -- Input parameters used to generate
    date_range_start DATE,
    date_range_end  DATE,
    zones           TEXT[],
    generated_by    TEXT,                                -- 'system','admin@cova'
    generation_time_ms INTEGER,                          -- How long report took to generate
    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. reporting.analytics_snapshots
-- ============================================================================
-- Time-bucketed aggregated metrics for dashboards and BI. Computed by batch
-- jobs and stored for fast retrieval without re-aggregating raw data.
-- ============================================================================
CREATE TABLE IF NOT EXISTS reporting.analytics_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    snapshot_type   TEXT NOT NULL,                        -- 'hourly_summary','daily_summary','zone_comparison','fraud_trends'
    metrics         JSONB NOT NULL,                      -- Flexible metrics payload
    zone            TEXT,
    period_start    TIMESTAMPTZ NOT NULL,
    period_end      TIMESTAMPTZ NOT NULL,
    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Migration 004: Financial Schema
-- ============================================================================
-- Tables: premium_collections, daily_snapshots, actuarial_projections, profit_loss
-- ============================================================================

-- ============================================================================
-- 1. financial.premium_collections
-- ============================================================================
-- Records every premium payment collected from workers. Links policies to
-- actual payment events. Used to compute premium income for P&L.
-- ============================================================================
CREATE TABLE IF NOT EXISTS financial.premium_collections (
    id              BIGSERIAL PRIMARY KEY,
    policy_id       TEXT NOT NULL REFERENCES public.policies(id),
    worker_id       TEXT NOT NULL REFERENCES public.workers(id),

    amount          NUMERIC(10,2) NOT NULL,
    collection_date DATE NOT NULL,
    payment_method  TEXT DEFAULT 'UPI',
    payment_ref     TEXT,
    status          TEXT NOT NULL DEFAULT 'collected',    -- 'collected','failed','waived'

    -- Premium breakdown (how we arrived at this amount)
    base_premium    NUMERIC(10,2),
    zone_loading    NUMERIC(10,2),                       -- Zone risk adjustment
    seasonal_loading NUMERIC(10,2),                      -- Monsoon season adjustment
    claims_history_adj NUMERIC(10,2),                    -- Claims history adjustment

    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. financial.daily_snapshots
-- ============================================================================
-- End-of-day aggregated metrics. One row per (date, data_mode).
-- Primary source for the insurer dashboard's financial charts.
-- ============================================================================
CREATE TABLE IF NOT EXISTS financial.daily_snapshots (
    date            DATE NOT NULL,

    claims_count    INTEGER DEFAULT 0,
    claims_paid     INTEGER DEFAULT 0,
    claims_rejected INTEGER DEFAULT 0,
    claims_flagged  INTEGER DEFAULT 0,

    total_payout    NUMERIC(12,2) DEFAULT 0,
    premium_collected NUMERIC(12,2) DEFAULT 0,

    loss_ratio      NUMERIC(8,4) DEFAULT 0,              -- payouts / premium
    expense_ratio   NUMERIC(8,4) DEFAULT 0,
    combined_ratio  NUMERIC(8,4) DEFAULT 0,

    fraud_attempts  INTEGER DEFAULT 0,
    fraud_blocked   INTEGER DEFAULT 0,
    fraud_detection_rate NUMERIC(5,2) DEFAULT 100,

    env_changes     INTEGER DEFAULT 0,                   -- Weather/CDI change events
    avg_cdi         NUMERIC(6,4) DEFAULT 0,

    active_workers  INTEGER DEFAULT 0,
    active_policies INTEGER DEFAULT 0,

    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',

    PRIMARY KEY (date, data_mode)
);

-- ============================================================================
-- 3. financial.actuarial_projections
-- ============================================================================
-- Forward-looking risk projections. Monthly, quarterly, and annual predictions
-- of claim volumes, payouts, and premium income. Used by insurer simulation.
-- ============================================================================
CREATE TABLE IF NOT EXISTS financial.actuarial_projections (
    id              BIGSERIAL PRIMARY KEY,
    projection_type TEXT NOT NULL,                       -- 'monthly','quarterly','annual'
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,

    expected_claims         INTEGER,
    expected_payout         NUMERIC(14,2),
    expected_premium_income NUMERIC(14,2),
    expected_loss_ratio     NUMERIC(8,4),

    total_risk_exposure     NUMERIC(14,2),
    var_95                  NUMERIC(14,2),               -- Value at Risk 95th pct
    var_99                  NUMERIC(14,2),               -- Value at Risk 99th pct

    confidence_level NUMERIC(5,4),
    model_version   TEXT,
    assumptions     JSONB DEFAULT '{}',

    -- Actual results (filled in after the period ends)
    actual_claims   INTEGER,
    actual_payout   NUMERIC(14,2),
    actual_premium  NUMERIC(14,2),
    actual_loss_ratio NUMERIC(8,4),

    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. financial.profit_loss
-- ============================================================================
-- P&L summary per period. Uses GENERATED ALWAYS AS for computed columns
-- (total_revenue, total_costs, net_profit) to prevent calculation errors.
-- ============================================================================
CREATE TABLE IF NOT EXISTS financial.profit_loss (
    id              BIGSERIAL PRIMARY KEY,
    period_type     TEXT NOT NULL,                       -- 'daily','weekly','monthly'
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,

    premium_income      NUMERIC(14,2) NOT NULL DEFAULT 0,
    other_income        NUMERIC(14,2) DEFAULT 0,
    total_revenue       NUMERIC(14,2) GENERATED ALWAYS AS (
        premium_income + COALESCE(other_income, 0)
    ) STORED,

    claims_payout       NUMERIC(14,2) NOT NULL DEFAULT 0,
    operating_expenses  NUMERIC(14,2) DEFAULT 0,
    reinsurance_costs   NUMERIC(14,2) DEFAULT 0,
    total_costs         NUMERIC(14,2) GENERATED ALWAYS AS (
        claims_payout + COALESCE(operating_expenses, 0) + COALESCE(reinsurance_costs, 0)
    ) STORED,

    net_profit          NUMERIC(14,2) GENERATED ALWAYS AS (
        premium_income + COALESCE(other_income, 0)
        - claims_payout - COALESCE(operating_expenses, 0) - COALESCE(reinsurance_costs, 0)
    ) STORED,

    loss_ratio          NUMERIC(8,4),
    data_mode           data_mode_enum NOT NULL DEFAULT 'demo',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

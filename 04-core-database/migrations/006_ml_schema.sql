-- ============================================================================
-- Migration 006: ML Schema
-- ============================================================================
-- Tables: feature_store, model_registry, model_predictions, training_datasets
-- ============================================================================

-- ============================================================================
-- 1. ml.feature_store (Hypertable candidate)
-- ============================================================================
-- Computed feature vectors for ML models. Features are pre-computed on a schedule
-- (hourly for zone features, daily for worker features) and stored here.
-- This avoids re-computing features at inference time.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ml.feature_store (
    id              BIGSERIAL,
    entity_type     TEXT NOT NULL,                       -- 'worker','zone','global'
    entity_id       TEXT NOT NULL,                       -- Worker ID, Zone ID, or '*'
    features        JSONB NOT NULL,                      -- { zone_risk: 1.3, avg_rainfall: 12.5, ... }
    feature_version TEXT NOT NULL DEFAULT 'v1',           -- Schema version for backward compat
    window_start    TIMESTAMPTZ NOT NULL,                -- Start of aggregation window
    window_end      TIMESTAMPTZ NOT NULL,                -- End of aggregation window
    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',

    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, computed_at)
);

-- ============================================================================
-- 2. ml.model_registry
-- ============================================================================
-- Tracks every trained model version. Only one model per model_name can have
-- status = 'production' at a time. Coefficients for small models (like the
-- GBR lookup tables) are stored inline as JSONB.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ml.model_registry (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name      TEXT NOT NULL,                        -- 'premium_predictor','fraud_classifier','claim_forecaster'
    model_version   TEXT NOT NULL,                        -- 'v1.0','v1.1-beta'
    algorithm       TEXT NOT NULL,                        -- 'xgboost','isolation_forest','sarima','linear_regression'
    hyperparameters JSONB,

    training_data_start DATE,
    training_data_end   DATE,
    training_samples    INTEGER,
    feature_count       INTEGER,
    feature_names       TEXT[],

    metrics         JSONB NOT NULL,                      -- { r2: 0.85, mae: 12.3, rmse: 18.7 }
    model_artifact_path TEXT,                            -- Path to serialized model file
    coefficient_json    JSONB,                           -- Inline coefficients for small models

    status          TEXT NOT NULL DEFAULT 'training',     -- 'training','validated','production','retired'
    promoted_at     TIMESTAMPTZ,
    parent_model_id UUID REFERENCES ml.model_registry(id),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(model_name, model_version)
);

-- ============================================================================
-- 3. ml.model_predictions (Hypertable candidate)
-- ============================================================================
-- Stores every prediction made by an ML model, with optional actual values
-- for backtesting. Used for model monitoring and drift detection.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ml.model_predictions (
    id              BIGSERIAL,
    model_id        UUID NOT NULL REFERENCES ml.model_registry(id),
    model_name      TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    input_features  JSONB,

    prediction      NUMERIC(12,4),
    prediction_label TEXT,
    confidence      NUMERIC(5,4),
    prediction_metadata JSONB DEFAULT '{}',

    -- Backtesting (filled in post-hoc)
    actual_value    NUMERIC(12,4),
    prediction_error NUMERIC(12,4),

    data_mode       data_mode_enum NOT NULL DEFAULT 'demo',
    predicted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, predicted_at)
);

-- ============================================================================
-- 4. ml.training_datasets
-- ============================================================================
-- Metadata about exported training datasets. Tracks data provenance for
-- reproducibility: what data range, how many rows, train/val/test split ratios.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ml.training_datasets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_name    TEXT NOT NULL,
    model_name      TEXT NOT NULL,
    row_count       INTEGER NOT NULL,
    feature_count   INTEGER NOT NULL,
    date_range_start DATE,
    date_range_end  DATE,
    storage_format  TEXT NOT NULL DEFAULT 'parquet',
    storage_path    TEXT NOT NULL,
    checksum        TEXT,                                -- SHA-256 of the dataset file
    version         TEXT NOT NULL DEFAULT 'v1',
    parent_dataset_id UUID REFERENCES ml.training_datasets(id),
    train_ratio     NUMERIC(3,2) DEFAULT 0.80,
    validation_ratio NUMERIC(3,2) DEFAULT 0.10,
    test_ratio      NUMERIC(3,2) DEFAULT 0.10,
    data_mode       data_mode_enum NOT NULL DEFAULT 'real',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

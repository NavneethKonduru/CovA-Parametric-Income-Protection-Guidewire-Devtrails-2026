-- ============================================================================
-- Migration 010: Indexes and Triggers
-- ============================================================================
-- All B-tree, GIN, GIST, and partial indexes consolidated.
-- All updated_at triggers attached.
-- Uses CREATE INDEX IF NOT EXISTS for idempotency.
-- ============================================================================

-- ============================================================================
-- PUBLIC SCHEMA INDEXES
-- ============================================================================

-- workers
CREATE INDEX IF NOT EXISTS idx_workers_zone_status ON public.workers(zone, status);
CREATE INDEX IF NOT EXISTS idx_workers_data_mode ON public.workers(data_mode);
CREATE INDEX IF NOT EXISTS idx_workers_platform ON public.workers(platform);
CREATE INDEX IF NOT EXISTS idx_workers_archetype ON public.workers(archetype);
CREATE INDEX IF NOT EXISTS idx_workers_status ON public.workers(status);

-- policies
CREATE INDEX IF NOT EXISTS idx_policies_worker ON public.policies(worker_id, status);
CREATE INDEX IF NOT EXISTS idx_policies_status ON public.policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_data_mode ON public.policies(data_mode);
CREATE INDEX IF NOT EXISTS idx_policies_expiry ON public.policies(expiry_date)
    WHERE status = 'active';

-- claims
CREATE INDEX IF NOT EXISTS idx_claims_worker_date ON public.claims(worker_id, date);
CREATE INDEX IF NOT EXISTS idx_claims_status ON public.claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_date_status ON public.claims(date, status);
CREATE INDEX IF NOT EXISTS idx_claims_data_mode ON public.claims(data_mode);
CREATE INDEX IF NOT EXISTS idx_claims_zone_date ON public.claims(zone, date);
CREATE INDEX IF NOT EXISTS idx_claims_disruption ON public.claims(disruption_type);
CREATE INDEX IF NOT EXISTS idx_claims_fraud_confidence ON public.claims(fraud_confidence)
    WHERE fraud_confidence > 0.45;
CREATE INDEX IF NOT EXISTS idx_claims_created_at ON public.claims(created_at);

-- GIN index on fraud_result JSONB for filtering by fraud flags
CREATE INDEX IF NOT EXISTS idx_claims_fraud_jsonb ON public.claims
    USING GIN (fraud_result jsonb_path_ops);

-- disruption_events
CREATE INDEX IF NOT EXISTS idx_disruption_zone_time ON public.disruption_events(zone, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_disruption_data_mode ON public.disruption_events(data_mode, timestamp DESC);

-- payout_log
CREATE INDEX IF NOT EXISTS idx_payout_claim ON public.payout_log(claim_id);
CREATE INDEX IF NOT EXISTS idx_payout_worker ON public.payout_log(worker_id);
CREATE INDEX IF NOT EXISTS idx_payout_status ON public.payout_log(status);
CREATE INDEX IF NOT EXISTS idx_payout_data_mode ON public.payout_log(data_mode);

-- worker_signals — PostGIS GIST index (conditional)
DO $$
BEGIN
    IF system.has_postgis() THEN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_worker_signals_geom') THEN
            CREATE INDEX idx_worker_signals_geom ON public.worker_signals USING GIST (geom);
        END IF;
    END IF;
END $$;

-- telemetry_raw
CREATE INDEX IF NOT EXISTS idx_telemetry_worker ON public.telemetry_raw(worker_id, timestamp DESC);

-- ============================================================================
-- WEATHER SCHEMA INDEXES
-- ============================================================================

-- observations
CREATE INDEX IF NOT EXISTS idx_weather_obs_zone_ts ON weather.observations(zone, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_weather_obs_source ON weather.observations(source, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_weather_obs_condition ON weather.observations(condition, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_weather_obs_data_mode ON weather.observations(data_mode, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_weather_obs_aqi ON weather.observations(aqi)
    WHERE aqi >= 300;

-- forecasts
CREATE INDEX IF NOT EXISTS idx_weather_fcst_zone_target ON weather.forecasts(zone, target_timestamp);
CREATE INDEX IF NOT EXISTS idx_weather_fcst_type ON weather.forecasts(forecast_type, zone);

-- event_tags
CREATE INDEX IF NOT EXISTS idx_weather_events_time ON weather.event_tags(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_weather_events_type ON weather.event_tags(event_type);
CREATE INDEX IF NOT EXISTS idx_weather_events_zones ON weather.event_tags USING GIN (affected_zones);

-- civic_disruptions
CREATE INDEX IF NOT EXISTS idx_civic_active ON weather.civic_disruptions(is_active)
    WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_civic_time ON weather.civic_disruptions(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_civic_zones ON weather.civic_disruptions USING GIN (affected_zones);
CREATE INDEX IF NOT EXISTS idx_civic_type ON weather.civic_disruptions(disruption_type);
CREATE INDEX IF NOT EXISTS idx_civic_data_mode ON weather.civic_disruptions(data_mode);

-- civic_disruptions — PostGIS GIST index (conditional)
DO $$
BEGIN
    IF system.has_postgis() THEN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_civic_boundary') THEN
            CREATE INDEX idx_civic_boundary ON weather.civic_disruptions
                USING GIST (jurisdiction_boundary);
        END IF;
    END IF;
END $$;

-- region_mapping — PostGIS GIST index (conditional)
DO $$
BEGIN
    IF system.has_postgis() THEN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_region_boundary') THEN
            CREATE INDEX idx_region_boundary ON weather.region_mapping
                USING GIST (boundary);
        END IF;
    END IF;
END $$;

-- ============================================================================
-- FRAUD SCHEMA INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_fraud_claim ON fraud.detection_log(claim_id);
CREATE INDEX IF NOT EXISTS idx_fraud_worker ON fraud.detection_log(worker_id);
CREATE INDEX IF NOT EXISTS idx_fraud_score ON fraud.detection_log(fraud_score)
    WHERE fraud_score > 0.45;
CREATE INDEX IF NOT EXISTS idx_fraud_action ON fraud.detection_log(action);
CREATE INDEX IF NOT EXISTS idx_fraud_rules ON fraud.detection_log USING GIN (rules_triggered);
CREATE INDEX IF NOT EXISTS idx_fraud_data_mode ON fraud.detection_log(data_mode);

CREATE INDEX IF NOT EXISTS idx_risk_scores_worker ON fraud.risk_scores(worker_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_scores_zone ON fraud.risk_scores(zone, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_blacklist_active ON fraud.device_blacklist(is_active)
    WHERE is_active = TRUE;

-- ============================================================================
-- FINANCIAL SCHEMA INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_premium_worker ON financial.premium_collections(worker_id, collection_date);
CREATE INDEX IF NOT EXISTS idx_premium_policy ON financial.premium_collections(policy_id);
CREATE INDEX IF NOT EXISTS idx_premium_date ON financial.premium_collections(collection_date);

CREATE INDEX IF NOT EXISTS idx_snapshots_date ON financial.daily_snapshots(date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_mode ON financial.daily_snapshots(data_mode);

CREATE INDEX IF NOT EXISTS idx_projections_period ON financial.actuarial_projections(period_start, period_end);

-- ============================================================================
-- SIMULATION SCHEMA INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sim_events_run ON simulation.events(run_id, timestamp DESC);

-- ============================================================================
-- ML SCHEMA INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_features_entity ON ml.feature_store(entity_type, entity_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_models_name_status ON ml.model_registry(model_name, status);
CREATE INDEX IF NOT EXISTS idx_predictions_model ON ml.model_predictions(model_id, predicted_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_entity ON ml.model_predictions(entity_type, entity_id);

-- ============================================================================
-- REPORTING SCHEMA INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_reports_type ON reporting.generated_reports(report_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_type_period ON reporting.analytics_snapshots(snapshot_type, period_start DESC);

-- ============================================================================
-- SYSTEM SCHEMA INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sys_events_type ON system.events(type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON system.audit_log(user_email, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table ON system.audit_log(table_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_process_log_corr ON system.process_log(correlation_id);

-- ============================================================================
-- TRIGGERS: updated_at auto-update
-- ============================================================================

-- Workers
DROP TRIGGER IF EXISTS trg_workers_updated_at ON public.workers;
CREATE TRIGGER trg_workers_updated_at
    BEFORE UPDATE ON public.workers
    FOR EACH ROW EXECUTE FUNCTION system.update_timestamp();

-- Policies
DROP TRIGGER IF EXISTS trg_policies_updated_at ON public.policies;
CREATE TRIGGER trg_policies_updated_at
    BEFORE UPDATE ON public.policies
    FOR EACH ROW EXECUTE FUNCTION system.update_timestamp();

-- Claims
DROP TRIGGER IF EXISTS trg_claims_updated_at ON public.claims;
CREATE TRIGGER trg_claims_updated_at
    BEFORE UPDATE ON public.claims
    FOR EACH ROW EXECUTE FUNCTION system.update_timestamp();

-- Worker Signals
DROP TRIGGER IF EXISTS trg_worker_signals_updated_at ON public.worker_signals;
CREATE TRIGGER trg_worker_signals_updated_at
    BEFORE UPDATE ON public.worker_signals
    FOR EACH ROW EXECUTE FUNCTION system.update_timestamp();

-- Civic Disruptions
DROP TRIGGER IF EXISTS trg_civic_updated_at ON weather.civic_disruptions;
CREATE TRIGGER trg_civic_updated_at
    BEFORE UPDATE ON weather.civic_disruptions
    FOR EACH ROW EXECUTE FUNCTION system.update_timestamp();

-- ============================================================================
-- COMPLETE
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '=== Migration 010 complete: All indexes and triggers created. ===';
END $$;

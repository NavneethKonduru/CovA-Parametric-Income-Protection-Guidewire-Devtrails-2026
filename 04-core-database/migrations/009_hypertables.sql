-- ============================================================================
-- Migration 009: TimescaleDB Hypertables
-- ============================================================================
-- Converts 11 tables to hypertables (if TimescaleDB is available).
-- Sets compression and retention policies where appropriate.
--
-- If TimescaleDB is NOT installed, this migration does nothing — all tables
-- remain as regular PostgreSQL tables with full functionality.
-- ============================================================================

DO $$
DECLARE
    _has_timescaledb BOOLEAN;
BEGIN
    -- Check if TimescaleDB extension is loaded
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb')
    INTO _has_timescaledb;

    IF NOT _has_timescaledb THEN
        RAISE WARNING '=== TimescaleDB not available. Skipping hypertable creation. ===';
        RAISE WARNING 'All tables remain as regular PostgreSQL tables.';
        RAISE WARNING 'To enable: CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;';
        RETURN;
    END IF;

    RAISE NOTICE '=== TimescaleDB detected. Creating hypertables... ===';

    -- ========================================================================
    -- 1. public.disruption_events → hypertable by timestamp
    -- ========================================================================
    BEGIN
        PERFORM create_hypertable('public.disruption_events', 'timestamp',
            migrate_data => true, if_not_exists => true);
        RAISE NOTICE 'Created hypertable: public.disruption_events';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not create hypertable for disruption_events: %', SQLERRM;
    END;

    -- ========================================================================
    -- 2. public.telemetry_raw → hypertable by timestamp
    --    Compression: 7 days, Retention: 90 days
    -- ========================================================================
    BEGIN
        PERFORM create_hypertable('public.telemetry_raw', 'timestamp',
            migrate_data => true, if_not_exists => true);
        PERFORM add_compression_policy('public.telemetry_raw', INTERVAL '7 days',
            if_not_exists => true);
        PERFORM add_retention_policy('public.telemetry_raw', INTERVAL '90 days',
            if_not_exists => true);
        RAISE NOTICE 'Created hypertable: public.telemetry_raw (compress: 7d, retain: 90d)';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not create hypertable for telemetry_raw: %', SQLERRM;
    END;

    -- ========================================================================
    -- 3. weather.observations → hypertable by timestamp
    --    Compression: 30 days, Retention: 6 years
    -- ========================================================================
    BEGIN
        PERFORM create_hypertable('weather.observations', 'timestamp',
            migrate_data => true, if_not_exists => true);
        PERFORM add_compression_policy('weather.observations', INTERVAL '30 days',
            if_not_exists => true);
        PERFORM add_retention_policy('weather.observations', INTERVAL '6 years',
            if_not_exists => true);
        RAISE NOTICE 'Created hypertable: weather.observations (compress: 30d, retain: 6y)';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not create hypertable for weather.observations: %', SQLERRM;
    END;

    -- ========================================================================
    -- 4. weather.forecasts → hypertable by generated_at
    -- ========================================================================
    BEGIN
        PERFORM create_hypertable('weather.forecasts', 'generated_at',
            migrate_data => true, if_not_exists => true);
        RAISE NOTICE 'Created hypertable: weather.forecasts';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not create hypertable for weather.forecasts: %', SQLERRM;
    END;

    -- ========================================================================
    -- 5. fraud.risk_scores → hypertable by computed_at
    -- ========================================================================
    BEGIN
        PERFORM create_hypertable('fraud.risk_scores', 'computed_at',
            migrate_data => true, if_not_exists => true);
        RAISE NOTICE 'Created hypertable: fraud.risk_scores';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not create hypertable for fraud.risk_scores: %', SQLERRM;
    END;

    -- ========================================================================
    -- 6. simulation.events → hypertable by timestamp
    -- ========================================================================
    BEGIN
        PERFORM create_hypertable('simulation.events', 'timestamp',
            migrate_data => true, if_not_exists => true);
        RAISE NOTICE 'Created hypertable: simulation.events';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not create hypertable for simulation.events: %', SQLERRM;
    END;

    -- ========================================================================
    -- 7. ml.feature_store → hypertable by computed_at
    -- ========================================================================
    BEGIN
        PERFORM create_hypertable('ml.feature_store', 'computed_at',
            migrate_data => true, if_not_exists => true);
        RAISE NOTICE 'Created hypertable: ml.feature_store';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not create hypertable for ml.feature_store: %', SQLERRM;
    END;

    -- ========================================================================
    -- 8. ml.model_predictions → hypertable by predicted_at
    -- ========================================================================
    BEGIN
        PERFORM create_hypertable('ml.model_predictions', 'predicted_at',
            migrate_data => true, if_not_exists => true);
        RAISE NOTICE 'Created hypertable: ml.model_predictions';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not create hypertable for ml.model_predictions: %', SQLERRM;
    END;

    -- ========================================================================
    -- 9. system.events → hypertable by timestamp
    --    Retention: 90 days
    -- ========================================================================
    BEGIN
        PERFORM create_hypertable('system.events', 'timestamp',
            migrate_data => true, if_not_exists => true);
        PERFORM add_retention_policy('system.events', INTERVAL '90 days',
            if_not_exists => true);
        RAISE NOTICE 'Created hypertable: system.events (retain: 90d)';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not create hypertable for system.events: %', SQLERRM;
    END;

    -- ========================================================================
    -- 10. system.audit_log → hypertable by timestamp
    --     Retention: 1 year
    -- ========================================================================
    BEGIN
        PERFORM create_hypertable('system.audit_log', 'timestamp',
            migrate_data => true, if_not_exists => true);
        PERFORM add_retention_policy('system.audit_log', INTERVAL '1 year',
            if_not_exists => true);
        RAISE NOTICE 'Created hypertable: system.audit_log (retain: 1y)';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not create hypertable for system.audit_log: %', SQLERRM;
    END;

    -- ========================================================================
    -- 11. system.process_log → hypertable by timestamp
    --     Retention: 30 days
    -- ========================================================================
    BEGIN
        PERFORM create_hypertable('system.process_log', 'timestamp',
            migrate_data => true, if_not_exists => true);
        PERFORM add_retention_policy('system.process_log', INTERVAL '30 days',
            if_not_exists => true);
        RAISE NOTICE 'Created hypertable: system.process_log (retain: 30d)';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not create hypertable for system.process_log: %', SQLERRM;
    END;

    RAISE NOTICE '=== Hypertable creation complete. 11 tables converted. ===';
END $$;

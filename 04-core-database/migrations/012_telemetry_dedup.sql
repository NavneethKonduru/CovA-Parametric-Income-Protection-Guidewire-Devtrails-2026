-- ============================================================================
-- Migration 012: Telemetry Deduplication
-- ============================================================================
-- Adds a unique index to telemetry_raw to enforce deduplication on 
-- (worker_id, timestamp) for the ON CONFLICT DO NOTHING clause in telemetry.js
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_worker_ts 
ON public.telemetry_raw(worker_id, timestamp);

DO $$
BEGIN
    RAISE NOTICE '=== Migration 012 complete: Telemetry unique index created. ===';
END $$;

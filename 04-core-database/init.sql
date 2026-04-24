-- ============================================================================
-- CovA Database Initialization Script
-- ============================================================================
-- Purpose: Create database, enable extensions, create schemas, types, and
--          utility functions. Run this ONCE before any migration files.
--
-- Target:  PostgreSQL 16 with TimescaleDB + PostGIS
-- Usage:   psql -U postgres -f db/init.sql
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
-- TimescaleDB: hypertables for time-series data (weather, telemetry, events)
-- PostGIS:     geospatial queries (zone polygons, worker GPS containment)
-- pg_trgm:     trigram-based full-text search (worker/claim lookup)
-- pgcrypto:    SHA-256 hashing (Aadhaar), AES-256 encryption (phone, UPI)
-- ============================================================================

-- TimescaleDB must be loaded first (it modifies the planner)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
        CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
        RAISE NOTICE 'TimescaleDB extension enabled.';
    ELSE
        RAISE WARNING 'TimescaleDB extension not available. Hypertables will be regular tables.';
    END IF;
END $$;

-- PostGIS for geospatial support
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
        CREATE EXTENSION IF NOT EXISTS postgis;
        RAISE NOTICE 'PostGIS extension enabled.';
    ELSE
        RAISE WARNING 'PostGIS extension not available. Spatial columns will use plain NUMERIC lat/lng.';
    END IF;
END $$;

-- pg_trgm for trigram-based search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- pgcrypto for hashing and encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 2. SCHEMAS
-- ============================================================================
-- 8 schemas organizing the database by domain:
--   public     → Core insurance entities (workers, claims, policies)
--   weather    → Weather observations, forecasts, civic disruptions
--   fraud      → Fraud detection, risk scoring, device blacklists
--   financial  → Premium collections, P&L, actuarial projections
--   simulation → Demo mode scenario runs, event logs
--   ml         → Feature store, model registry, predictions
--   reporting  → Generated reports, BI snapshots
--   system     → Operational logs, events, metrics, audit trail
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS weather;
CREATE SCHEMA IF NOT EXISTS fraud;
CREATE SCHEMA IF NOT EXISTS financial;
CREATE SCHEMA IF NOT EXISTS simulation;
CREATE SCHEMA IF NOT EXISTS ml;
CREATE SCHEMA IF NOT EXISTS reporting;
CREATE SCHEMA IF NOT EXISTS system;

-- ============================================================================
-- 3. CUSTOM TYPES
-- ============================================================================

-- data_mode_enum: Discriminator for real vs demo vs test data.
-- Every content table includes this column. Queries MUST filter by data_mode.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'data_mode_enum') THEN
        CREATE TYPE data_mode_enum AS ENUM ('real', 'demo', 'test');
        RAISE NOTICE 'Created data_mode_enum type.';
    END IF;
END $$;

-- ============================================================================
-- 4. UTILITY FUNCTIONS
-- ============================================================================

-- system.update_timestamp(): Trigger function that auto-updates `updated_at`
-- to NOW() on any row modification. Used by all tables with an updated_at column.
CREATE OR REPLACE FUNCTION system.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION system.update_timestamp() IS
    'Trigger function: auto-sets updated_at = NOW() on row update. Attach via BEFORE UPDATE trigger.';

-- ============================================================================
-- 5. HELPER: Check if TimescaleDB is available
-- ============================================================================
-- Used by migration 009 to conditionally create hypertables.

CREATE OR REPLACE FUNCTION system.has_timescaledb()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 6. HELPER: Check if PostGIS is available
-- ============================================================================

CREATE OR REPLACE FUNCTION system.has_postgis()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- INITIALIZATION COMPLETE
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'CovA Database initialized successfully.';
    RAISE NOTICE 'Schemas: public, weather, fraud, financial, simulation, ml, reporting, system';
    RAISE NOTICE 'Run migrations next: db/migrations/001_*.sql through 010_*.sql';
    RAISE NOTICE '============================================';
END $$;

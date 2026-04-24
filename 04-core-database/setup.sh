#!/bin/bash
# ============================================================================
# CovA Database Setup Script
# ============================================================================
# Runs all migrations and seeds in order against a PostgreSQL instance.
#
# Usage:
#   ./db/setup.sh                              # Uses default connection
#   DATABASE_URL=postgresql://... ./db/setup.sh  # Uses custom connection
# ============================================================================

set -e

DB_URL="${DATABASE_URL:-postgresql://cova:cova@localhost:5432/cova_db}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "═══════════════════════════════════════════════════════"
echo "  CovA Database Setup"
echo "═══════════════════════════════════════════════════════"
echo "  Target: ${DB_URL/\/\/.*@/\/\/<credentials>@}"
echo "═══════════════════════════════════════════════════════"
echo ""

# 1. Initialization
echo "▸ Running init.sql (extensions, schemas, types, functions)..."
psql "$DB_URL" -f "$SCRIPT_DIR/init.sql" 2>&1 | grep -E "NOTICE|WARNING|ERROR"
echo ""

# 2. Migrations (in order)
echo "▸ Running migrations..."
for f in "$SCRIPT_DIR"/migrations/*.sql; do
    fname=$(basename "$f")
    echo "  → $fname"
    psql "$DB_URL" -f "$f" 2>&1 | grep -E "NOTICE|WARNING|ERROR" || true
done
echo ""

# 3. Seeds
echo "▸ Running seed data..."
for f in "$SCRIPT_DIR"/seeds/*.sql; do
    fname=$(basename "$f")
    echo "  → $fname"
    psql "$DB_URL" -f "$f" 2>&1 | grep -E "NOTICE|WARNING|ERROR" || true
done
echo ""

# 4. Verification
echo "▸ Verifying table counts..."
psql "$DB_URL" -c "
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname IN ('public','weather','fraud','financial','simulation','ml','reporting','system')
ORDER BY schemaname, tablename;
" 2>&1

echo ""
echo "▸ Verifying seed data..."
psql "$DB_URL" -c "
SELECT 'workers' as table_name, COUNT(*) as rows FROM public.workers
UNION ALL SELECT 'policies', COUNT(*) FROM public.policies
UNION ALL SELECT 'insurer_config', COUNT(*) FROM public.insurer_config
UNION ALL SELECT 'admin_config', COUNT(*) FROM public.admin_config
UNION ALL SELECT 'region_mapping', COUNT(*) FROM weather.region_mapping
UNION ALL SELECT 'scenario_library', COUNT(*) FROM simulation.scenario_library
ORDER BY table_name;
" 2>&1

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ CovA Database setup complete!"
echo "═══════════════════════════════════════════════════════"

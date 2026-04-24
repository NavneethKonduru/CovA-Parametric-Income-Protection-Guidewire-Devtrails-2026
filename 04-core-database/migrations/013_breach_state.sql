-- ============================================================
-- Migration 013: Disruption Breach State
-- ============================================================
-- Persists the consecutive-breach counter per zone so that
-- server restarts don't reset the 2-cycle auto-payout gate.
-- ============================================================

CREATE TABLE IF NOT EXISTS disruption_breach_state (
  zone                TEXT PRIMARY KEY,
  consecutive_breaches INTEGER NOT NULL DEFAULT 0,
  last_updated        TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-seed all operational zones
INSERT INTO disruption_breach_state (zone, consecutive_breaches)
VALUES ('ZONE_A', 0), ('ZONE_B', 0), ('ZONE_C', 0)
ON CONFLICT (zone) DO NOTHING;

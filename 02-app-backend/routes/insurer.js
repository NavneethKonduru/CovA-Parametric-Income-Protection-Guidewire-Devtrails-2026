const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const pg = require('../data/pg');

/**
 * GET /api/insurer/config
 * Returns all insurer-configurable parameters with current values and ranges.
 * Accessible by: insurer, admin
 */
router.get('/config', requireRole('insurer', 'admin'), async (req, res) => {
  if (!pg.isAvailable()) {
    // Demo fallback config
    return res.json({
      config: {
        base_premium_rate: { value: 35, min: 29, max: 89, updatedAt: new Date() },
        max_payout_per_event: { value: 1200, min: 500, max: 2000, updatedAt: new Date() },
        cdi_trigger_threshold: { value: 0.6, min: 0.5, max: 0.8, updatedAt: new Date() },
        covered_zones: { value: ["ZONE_A", "ZONE_B", "ZONE_C"], min: null, max: null, updatedAt: new Date() },
        weekly_coverage_cap: { value: 3000, min: 1000, max: 5000, updatedAt: new Date() }
      },
      timestamp: new Date().toISOString(),
      databaseStatus: 'simulated'
    });
  }
  try {
    const { rows } = await pg.query('SELECT * FROM insurer_config');

    const config = {};
    for (const row of rows) {
      let value = row.value;
      try { value = JSON.parse(value); } catch (e) { /* keep as string */ }
      if (typeof value === 'string' && !isNaN(value)) value = parseFloat(value);

      config[row.key] = {
        value,
        min: row.min_value ? parseFloat(row.min_value) : null,
        max: row.max_value ? parseFloat(row.max_value) : null,
        updatedAt: row.updated_at
      };
    }

    res.json({ config, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[INSURER] Config read error:', err.message);
    res.status(500).json({ error: 'Failed to read config' });
  }
});

/**
 * PATCH /api/insurer/config
 * Update one or more config parameters within permitted ranges.
 * Body: { base_premium_rate: 45, cdi_trigger_threshold: 0.7, ... }
 * Accessible by: insurer, admin
 */
router.patch('/config', requireRole('insurer', 'admin'), async (req, res) => {
  try {
    const updates = req.body;
    const results = {};
    const errors = [];

    for (const [key, newValue] of Object.entries(updates)) {
      const { rows } = await pg.query('SELECT * FROM insurer_config WHERE key = $1', [key]);

      if (rows.length === 0) {
        errors.push({ key, error: 'Unknown config key' });
        continue;
      }

      const row = rows[0];

      // Range validation for numeric values
      if (row.min_value !== null && row.max_value !== null) {
        const numVal = parseFloat(newValue);
        const min = parseFloat(row.min_value);
        const max = parseFloat(row.max_value);

        if (isNaN(numVal) || numVal < min || numVal > max) {
          errors.push({ key, error: `Value must be between ${min} and ${max}`, received: newValue });
          continue;
        }
      }

      const storeValue = typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue);
      await pg.query(
        'UPDATE insurer_config SET value = $1, updated_at = NOW() WHERE key = $2',
        [storeValue, key]
      );
      results[key] = newValue;
    }

    // Broadcast config change
    if (req.app.locals.broadcastEvent && Object.keys(results).length > 0) {
      req.app.locals.broadcastEvent('INSURER_CONFIG_UPDATED', results);
    }

    console.log(`[INSURER] Config updated:`, results);

    if (errors.length > 0) {
      return res.status(207).json({ updated: results, errors });
    }

    res.json({ message: 'Config updated', updated: results });
  } catch (err) {
    console.error('[INSURER] Config update error:', err.message);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const db = require('../data/db');

/**
 * GET /api/insurer/config
 * Returns all insurer-configurable parameters with current values and ranges.
 * Accessible by: insurer, admin
 */
router.get('/config', requireRole('insurer', 'admin'), (req, res) => {
  const rows = db.prepare('SELECT * FROM insurer_config').all();

  const config = {};
  for (const row of rows) {
    let value = row.value;
    // Try to parse JSON values (e.g., arrays)
    try { value = JSON.parse(value); } catch (e) { /* keep as string */ }
    // Try to parse as number
    if (typeof value === 'string' && !isNaN(value)) value = parseFloat(value);

    config[row.key] = {
      value,
      min: row.min_value ? parseFloat(row.min_value) : null,
      max: row.max_value ? parseFloat(row.max_value) : null,
      updatedAt: row.updated_at
    };
  }

  res.json({
    config,
    timestamp: new Date().toISOString()
  });
});

/**
 * PATCH /api/insurer/config
 * Update one or more config parameters within permitted ranges.
 * Body: { base_premium_rate: 45, cdi_trigger_threshold: 0.7, ... }
 * Accessible by: insurer, admin
 */
router.patch('/config', requireRole('insurer', 'admin'), (req, res) => {
  const updates = req.body;
  const results = {};
  const errors = [];

  const updateStmt = db.prepare(`
    UPDATE insurer_config
    SET value = ?, updated_at = CURRENT_TIMESTAMP
    WHERE key = ?
  `);

  for (const [key, newValue] of Object.entries(updates)) {
    const row = db.prepare('SELECT * FROM insurer_config WHERE key = ?').get(key);

    if (!row) {
      errors.push({ key, error: 'Unknown config key' });
      continue;
    }

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

    // Store value — stringify arrays/objects, keep numbers as strings
    const storeValue = typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue);
    updateStmt.run(storeValue, key);
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
});

module.exports = router;

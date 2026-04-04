const express = require('express');
const router = express.Router();

// ============================================================
// MOCK DEMAND API — Simulates platform order volume per zone
// ============================================================

const demandData = {
  ZONE_A: { current_orders: 78, baseline_orders: 85 },
  ZONE_B: { current_orders: 60, baseline_orders: 65 },
  ZONE_C: { current_orders: 90, baseline_orders: 95 }
};

/**
 * GET /mock/demand/:zone
 * Returns current demand data for a zone
 */
router.get('/:zone', (req, res) => {
  const zone = req.params.zone.toUpperCase();
  const data = demandData[zone];

  if (!data) {
    return res.status(404).json({ error: `Zone ${zone} not found` });
  }

  const dropPercent = ((data.baseline_orders - data.current_orders) / data.baseline_orders * 100);

  res.json({
    zone,
    current_orders: data.current_orders,
    baseline_orders: data.baseline_orders,
    drop_percentage: parseFloat(dropPercent.toFixed(1)),
    demand_score: data._overrideDemandScore || parseFloat((dropPercent / 100).toFixed(3)),
    platform_status: data.platform_status || 'normal',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /mock/demand/set/:zone
 * Update demand for a zone (for demo/simulation)
 * Body: { current_orders: 15 } — baseline stays same to show drop
 */
router.post('/set/:zone', (req, res) => {
  const zone = req.params.zone.toUpperCase();

  if (!demandData[zone]) {
    return res.status(404).json({ error: `Zone ${zone} not found` });
  }

  if (req.body.current_orders !== undefined) {
    demandData[zone].current_orders = req.body.current_orders;
  }

  // Support direct demand_score override (from scenario engine)
  if (req.body.demand_score !== undefined) {
    demandData[zone]._overrideDemandScore = parseFloat(req.body.demand_score);
  }
  if (req.body.orders_per_hour !== undefined) {
    demandData[zone].current_orders = req.body.orders_per_hour;
  }
  if (req.body.platform_status !== undefined) {
    demandData[zone].platform_status = req.body.platform_status;
  }

  const dropPercent = ((demandData[zone].baseline_orders - demandData[zone].current_orders) / demandData[zone].baseline_orders * 100);

  res.json({
    message: `Demand updated for ${zone}`,
    drop_percentage: parseFloat(dropPercent.toFixed(1)),
    demand_score: demandData[zone]._overrideDemandScore || parseFloat((dropPercent / 100).toFixed(3)),
    data: demandData[zone]
  });
});

/**
 * POST /mock/demand/reset
 * Reset all zones to normal demand
 */
router.post('/reset', (req, res) => {
  demandData.ZONE_A = { current_orders: 78, baseline_orders: 85 };
  demandData.ZONE_B = { current_orders: 60, baseline_orders: 65 };
  demandData.ZONE_C = { current_orders: 90, baseline_orders: 95 };
  res.json({ message: "All zones reset to normal demand" });
});

module.exports = router;

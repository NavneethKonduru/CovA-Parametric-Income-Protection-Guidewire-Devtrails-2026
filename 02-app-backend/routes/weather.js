const express = require('express');
const router = express.Router();
const weatherIntel = require('../engines/weather-intelligence');

/**
 * GET /api/weather/forecast/:zone
 * Returns 48-hour CDI forecast for a specific zone
 */
router.get('/forecast/:zone', (req, res) => {
  const zone = req.params.zone.toUpperCase();
  const forecast = weatherIntel.generateShortTermForecast(zone);
  res.json(forecast);
});

/**
 * GET /api/weather/risk-outlook
 * Returns risk assessment for all operational zones
 */
router.get('/risk-outlook', (req, res) => {
  const outlook = weatherIntel.getRiskOutlook();
  res.json(outlook);
});

module.exports = router;

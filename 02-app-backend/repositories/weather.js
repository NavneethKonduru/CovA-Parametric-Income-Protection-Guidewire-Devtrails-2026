/**
 * ============================================================================
 * Weather Repository
 * ============================================================================
 * Data access layer for the weather schema: observations, forecasts,
 * event_tags, civic_disruptions, and region_mapping.
 *
 * This repository handles:
 * - Weather data ingestion from Open-Meteo and mock APIs
 * - Civic disruption management (CDI override system)
 * - Zone/region metadata queries
 * ============================================================================
 */

const { query, queryReplica, getDataMode } = require('../data/pg');

// ============================================================================
// OBSERVATIONS
// ============================================================================

/**
 * Insert a weather observation. Called by the weather poller (real mode)
 * or autonomous engine (demo mode).
 *
 * @param {Object} obs - Observation data
 * @param {string} [dataMode] - Data mode tag
 * @returns {Promise<Object>} Inserted observation
 */
async function insertObservation(obs, dataMode = getDataMode()) {
  const { rows } = await query(
    `INSERT INTO weather.observations (
      zone, source, rainfall_mm, temperature_c, wind_speed_kmh,
      wind_direction, humidity_pct, pressure_hpa, visibility_km,
      aqi, pm25, pm10, no2, o3,
      condition, weather_score, severity_level, heat_index_c,
      station_id, lat, lng, data_mode, timestamp
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
    RETURNING *`,
    [
      obs.zone, obs.source || 'open_meteo',
      obs.rainfall_mm || 0, obs.temperature_c, obs.wind_speed_kmh || 0,
      obs.wind_direction || null, obs.humidity_pct || null,
      obs.pressure_hpa || null, obs.visibility_km || null,
      obs.aqi || null, obs.pm25 || null, obs.pm10 || null,
      obs.no2 || null, obs.o3 || null,
      obs.condition || 'clear', obs.weather_score || 0,
      obs.severity_level || 'normal', obs.heat_index_c || null,
      obs.station_id || null, obs.lat || null, obs.lng || null,
      dataMode, obs.timestamp || new Date().toISOString()
    ]
  );
  return rows[0];
}

/**
 * Get the latest weather observation for each zone.
 * Primary query for the CDI engine — runs every 30 seconds.
 *
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object[]>} Latest observation per zone
 */
async function getLatestByZone(dataMode = getDataMode()) {
  const { rows } = await query(
    `SELECT DISTINCT ON (zone) *
     FROM weather.observations
     WHERE data_mode = $1
     ORDER BY zone, timestamp DESC`,
    [dataMode]
  );
  return rows;
}

/**
 * Get the latest weather observation for a specific zone.
 *
 * @param {string} zone - Zone ID
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object|null>}
 */
async function getLatestForZone(zone, dataMode = getDataMode()) {
  const { rows } = await query(
    `SELECT * FROM weather.observations
     WHERE zone = $1 AND data_mode = $2
     ORDER BY timestamp DESC LIMIT 1`,
    [zone, dataMode]
  );
  return rows[0] || null;
}

/**
 * Get weather observation history for a zone within a time range.
 * Used by dashboards and ML feature computation.
 *
 * @param {string} zone - Zone ID
 * @param {string} startTime - ISO timestamp
 * @param {string} endTime - ISO timestamp
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object[]>}
 */
async function getHistory(zone, startTime, endTime, dataMode = getDataMode()) {
  const { rows } = await queryReplica(
    `SELECT * FROM weather.observations
     WHERE zone = $1 AND timestamp BETWEEN $2 AND $3 AND data_mode = $4
     ORDER BY timestamp ASC`,
    [zone, startTime, endTime, dataMode]
  );
  return rows;
}

// ============================================================================
// FORECASTS
// ============================================================================

/**
 * Insert a weather forecast. Called by the forecast ingestion pipeline.
 *
 * @param {Object} forecast - Forecast data
 * @param {string} [dataMode] - Data mode tag
 * @returns {Promise<Object>}
 */
async function insertForecast(forecast, dataMode = getDataMode()) {
  const { rows } = await query(
    `INSERT INTO weather.forecasts (
      zone, source, forecast_type, target_timestamp,
      rainfall_mm, temperature_c, wind_speed_kmh,
      confidence, lower_bound_80, upper_bound_80,
      lower_bound_95, upper_bound_95,
      predicted_cdi_weather, predicted_claim_probability,
      data_mode
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING *`,
    [
      forecast.zone, forecast.source || 'open_meteo_forecast',
      forecast.forecast_type || 'short_term', forecast.target_timestamp,
      forecast.rainfall_mm, forecast.temperature_c, forecast.wind_speed_kmh,
      forecast.confidence || null, forecast.lower_bound_80 || null,
      forecast.upper_bound_80 || null, forecast.lower_bound_95 || null,
      forecast.upper_bound_95 || null,
      forecast.predicted_cdi_weather || null,
      forecast.predicted_claim_probability || null,
      dataMode
    ]
  );
  return rows[0];
}

/**
 * Get forecasts for a zone targeting a specific time range.
 *
 * @param {string} zone - Zone ID
 * @param {string} startTime - Target start time
 * @param {string} endTime - Target end time
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object[]>}
 */
async function getForecasts(zone, startTime, endTime, dataMode = getDataMode()) {
  const { rows } = await queryReplica(
    `SELECT * FROM weather.forecasts
     WHERE zone = $1 AND target_timestamp BETWEEN $2 AND $3 AND data_mode = $4
     ORDER BY target_timestamp ASC`,
    [zone, startTime, endTime, dataMode]
  );
  return rows;
}

// ============================================================================
// CIVIC DISRUPTIONS
// ============================================================================

/**
 * Insert a civic disruption event (curfew, bandh, Section 144, etc.).
 * The cdi_override value acts as a "Master Override" to the weather-based CDI.
 *
 * Business logic: final_cdi = MAX(weather_cdi, civic_cdi_override)
 * This ensures workers get paid even on sunny days with curfews.
 *
 * @param {Object} disruption - Civic disruption data
 * @param {string} [dataMode] - Data mode tag
 * @returns {Promise<Object>}
 */
async function insertCivicDisruption(disruption, dataMode = getDataMode()) {
  const { rows } = await query(
    `INSERT INTO weather.civic_disruptions (
      disruption_type, source, source_reference, source_hash,
      intensity_level, cdi_override,
      start_time, end_time, duration_hours, is_active,
      affected_zones, jurisdiction,
      reason, official_order_number,
      verified, data_mode
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    RETURNING *`,
    [
      disruption.disruption_type, disruption.source,
      disruption.source_reference || null, disruption.source_hash || null,
      disruption.intensity_level || 2, disruption.cdi_override || 0.7,
      disruption.start_time, disruption.end_time || null,
      disruption.duration_hours || null, disruption.is_active !== false,
      disruption.affected_zones, disruption.jurisdiction || null,
      disruption.reason, disruption.official_order_number || null,
      disruption.verified || false, dataMode
    ]
  );
  return rows[0];
}

/**
 * Get active civic disruptions for a specific zone.
 * Called by the CDI engine EVERY polling cycle to check for overrides.
 *
 * Query logic: active + zone matches + currently within time window.
 *
 * @param {string} zone - Zone ID to check
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object[]>} Active disruptions (may be empty)
 */
async function getActiveCivicDisruptions(zone, dataMode = getDataMode()) {
  const { rows } = await query(
    `SELECT cdi_override, disruption_type, intensity_level, reason,
            start_time, end_time, affected_zones
     FROM weather.civic_disruptions
     WHERE is_active = TRUE
       AND $1 = ANY(affected_zones)
       AND start_time <= NOW()
       AND (end_time IS NULL OR end_time > NOW())
       AND data_mode = $2
     ORDER BY cdi_override DESC`,
    [zone, dataMode]
  );
  return rows;
}

/**
 * Deactivate a civic disruption (when the curfew/bandh ends).
 *
 * @param {number} id - Disruption ID
 * @param {Object} [impact] - Impact metrics to record
 * @returns {Promise<Object|null>}
 */
async function deactivateCivicDisruption(id, impact = {}) {
  const { rows } = await query(
    `UPDATE weather.civic_disruptions SET
      is_active = FALSE,
      end_time = COALESCE(end_time, NOW()),
      duration_hours = EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time)) / 3600,
      workers_affected = COALESCE($2, workers_affected),
      claims_triggered = COALESCE($3, claims_triggered),
      total_payout = COALESCE($4, total_payout),
      platform_order_drop_pct = COALESCE($5, platform_order_drop_pct)
     WHERE id = $1
     RETURNING *`,
    [
      id, impact.workers_affected || null, impact.claims_triggered || null,
      impact.total_payout || null, impact.platform_order_drop_pct || null
    ]
  );
  return rows[0] || null;
}

// ============================================================================
// REGION MAPPING
// ============================================================================

/**
 * Get all region/zone definitions.
 *
 * @returns {Promise<Object[]>} Array of zone definitions
 */
async function getRegionMapping() {
  const { rows } = await query(
    `SELECT zone_id, zone_name, city, centroid_lat, centroid_lng,
            area_sq_km, risk_score, risk_level, flood_prone,
            drainage_quality, avg_orders_per_hour, imd_station_ids, description
     FROM weather.region_mapping
     ORDER BY zone_id`
  );
  return rows;
}

/**
 * Get a specific zone definition.
 *
 * @param {string} zoneId - Zone ID
 * @returns {Promise<Object|null>}
 */
async function getZone(zoneId) {
  const { rows } = await query(
    `SELECT * FROM weather.region_mapping WHERE zone_id = $1`,
    [zoneId]
  );
  return rows[0] || null;
}

// ============================================================================
// EVENT TAGS
// ============================================================================

/**
 * Get recent weather event tags.
 *
 * @param {number} [limit=20] - Max results
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object[]>}
 */
async function getEventTags(limit = 20, dataMode = getDataMode()) {
  const { rows } = await queryReplica(
    `SELECT * FROM weather.event_tags
     WHERE data_mode = $1
     ORDER BY start_time DESC
     LIMIT $2`,
    [dataMode, limit]
  );
  return rows;
}

module.exports = {
  // Observations
  insertObservation,
  getLatestByZone,
  getLatestForZone,
  getHistory,
  // Forecasts
  insertForecast,
  getForecasts,
  // Civic Disruptions
  insertCivicDisruption,
  getActiveCivicDisruptions,
  deactivateCivicDisruption,
  // Regions
  getRegionMapping,
  getZone,
  // Event Tags
  getEventTags,
};

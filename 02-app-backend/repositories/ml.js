/**
 * ============================================================================
 * ML Repository
 * ============================================================================
 * Data access layer for the ml schema: feature_store, model_registry,
 * model_predictions, and training_datasets.
 *
 * Supports the ML pipeline: feature computation → model training →
 * prediction logging → backtesting.
 * ============================================================================
 */

const { query, queryReplica, getDataMode } = require('../data/pg');

/**
 * Store computed features for an entity. Features are pre-computed on a schedule
 * and stored here to avoid expensive re-computation at inference time.
 *
 * @param {Object} entry - Feature entry
 * @param {string} [dataMode] - Data mode tag
 * @returns {Promise<Object>}
 */
async function storeFeatures(entry, dataMode = getDataMode()) {
  const { rows } = await query(
    `INSERT INTO ml.feature_store (
      entity_type, entity_id, features, feature_version,
      window_start, window_end, data_mode
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *`,
    [
      entry.entity_type, entry.entity_id,
      JSON.stringify(entry.features), entry.feature_version || 'v1',
      entry.window_start, entry.window_end, dataMode
    ]
  );
  return rows[0];
}

/**
 * Get the latest features for an entity.
 *
 * @param {string} entityType - 'worker', 'zone', or 'global'
 * @param {string} entityId - Entity identifier
 * @param {string} [dataMode] - Data mode filter
 * @returns {Promise<Object|null>}
 */
async function getFeatures(entityType, entityId, dataMode = getDataMode()) {
  const { rows } = await queryReplica(
    `SELECT * FROM ml.feature_store
     WHERE entity_type = $1 AND entity_id = $2 AND data_mode = $3
     ORDER BY computed_at DESC LIMIT 1`,
    [entityType, entityId, dataMode]
  );
  return rows[0] || null;
}

/**
 * Register a new trained model. Stores metadata, hyperparameters,
 * and performance metrics. Coefficients for small models stored inline.
 *
 * @param {Object} model - Model metadata
 * @returns {Promise<Object>}
 */
async function registerModel(model) {
  const { rows } = await query(
    `INSERT INTO ml.model_registry (
      model_name, model_version, algorithm, hyperparameters,
      training_data_start, training_data_end, training_samples,
      feature_count, feature_names,
      metrics, model_artifact_path, coefficient_json,
      status, parent_model_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *`,
    [
      model.model_name, model.model_version, model.algorithm,
      model.hyperparameters ? JSON.stringify(model.hyperparameters) : null,
      model.training_data_start || null, model.training_data_end || null,
      model.training_samples || null, model.feature_count || null,
      model.feature_names || null,
      JSON.stringify(model.metrics),
      model.model_artifact_path || null,
      model.coefficient_json ? JSON.stringify(model.coefficient_json) : null,
      model.status || 'training',
      model.parent_model_id || null
    ]
  );
  return rows[0];
}

/**
 * Get the active (production) model for a given model name.
 * Only one model per model_name should have status = 'production'.
 *
 * @param {string} modelName - e.g., 'premium_predictor', 'fraud_classifier'
 * @returns {Promise<Object|null>}
 */
async function getActiveModel(modelName) {
  const { rows } = await query(
    `SELECT * FROM ml.model_registry
     WHERE model_name = $1 AND status = 'production'
     ORDER BY promoted_at DESC LIMIT 1`,
    [modelName]
  );
  return rows[0] || null;
}

/**
 * Promote a model to production status. Demotes the current production model.
 *
 * @param {string} modelId - UUID of the model to promote
 * @returns {Promise<Object>}
 */
async function promoteModel(modelId) {
  // Get the model to find its name
  const { rows: modelRows } = await query(
    `SELECT model_name FROM ml.model_registry WHERE id = $1`, [modelId]
  );
  if (modelRows.length === 0) throw new Error(`Model ${modelId} not found`);

  const modelName = modelRows[0].model_name;

  // Demote current production model
  await query(
    `UPDATE ml.model_registry SET status = 'retired'
     WHERE model_name = $1 AND status = 'production'`,
    [modelName]
  );

  // Promote new model
  const { rows } = await query(
    `UPDATE ml.model_registry SET status = 'production', promoted_at = NOW()
     WHERE id = $1 RETURNING *`,
    [modelId]
  );
  return rows[0];
}

/**
 * Log a model prediction. Used for monitoring and backtesting.
 *
 * @param {Object} prediction - Prediction data
 * @param {string} [dataMode] - Data mode tag
 * @returns {Promise<Object>}
 */
async function logPrediction(prediction, dataMode = getDataMode()) {
  const { rows } = await query(
    `INSERT INTO ml.model_predictions (
      model_id, model_name, entity_type, entity_id,
      input_features, prediction, prediction_label,
      confidence, prediction_metadata, data_mode
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *`,
    [
      prediction.model_id, prediction.model_name,
      prediction.entity_type, prediction.entity_id,
      prediction.input_features ? JSON.stringify(prediction.input_features) : null,
      prediction.prediction || null, prediction.prediction_label || null,
      prediction.confidence || null,
      prediction.prediction_metadata ? JSON.stringify(prediction.prediction_metadata) : null,
      dataMode
    ]
  );
  return rows[0];
}

/**
 * Register a training dataset (metadata only — actual data stored as Parquet).
 *
 * @param {Object} dataset - Dataset metadata
 * @param {string} [dataMode] - Data mode tag
 * @returns {Promise<Object>}
 */
async function createDataset(dataset, dataMode = getDataMode()) {
  const { rows } = await query(
    `INSERT INTO ml.training_datasets (
      dataset_name, model_name, row_count, feature_count,
      date_range_start, date_range_end,
      storage_format, storage_path, checksum, version,
      parent_dataset_id, train_ratio, validation_ratio, test_ratio,
      data_mode
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING *`,
    [
      dataset.dataset_name, dataset.model_name,
      dataset.row_count, dataset.feature_count,
      dataset.date_range_start || null, dataset.date_range_end || null,
      dataset.storage_format || 'parquet', dataset.storage_path,
      dataset.checksum || null, dataset.version || 'v1',
      dataset.parent_dataset_id || null,
      dataset.train_ratio || 0.80, dataset.validation_ratio || 0.10,
      dataset.test_ratio || 0.10, dataMode
    ]
  );
  return rows[0];
}

module.exports = {
  storeFeatures,
  getFeatures,
  registerModel,
  getActiveModel,
  promoteModel,
  logPrediction,
  createDataset,
};

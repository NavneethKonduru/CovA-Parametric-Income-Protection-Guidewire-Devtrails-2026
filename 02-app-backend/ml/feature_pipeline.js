const fs = require('fs');
const path = require('path');
const pg = require('../data/pg');

async function buildFeaturePipeline() {
  console.log('[ML_PIPELINE] Starting daily feature extraction for XGBoost Model...');
  
  if (!pg.isReady()) {
    console.error('[ML_PIPELINE] PostgreSQL not connected. Exiting.');
    return;
  }

  try {
    // We aggregate the 52,560 hourly rows into daily feature rows per zone.
    // We also join with claims data to create a 'target' variable (payouts).
    const query = `
      WITH DailyWeather AS (
        SELECT 
          zone,
          DATE_TRUNC('day', timestamp) as date,
          MAX(temperature_c) as max_temp,
          MAX(rainfall_mm) as max_rainfall,
          AVG(wind_speed_kmh) as avg_wind,
          MAX(weather_score) as max_weather_score,
          AVG(pm25) as avg_pm25,
          MAX(heat_index_c) as max_heat_index
        FROM weather.observations
        WHERE data_mode = 'demo'
        GROUP BY 1, 2
      ),
      DailyClaims AS (
        SELECT 
          zone,
          date as claim_date,
          COUNT(*) as total_claims,
          COALESCE(SUM(payout_amount), 0) as total_payouts
        FROM public.claims
        WHERE data_mode = 'demo' AND status = 'paid'
        GROUP BY 1, 2
      )
      SELECT 
        w.zone,
        w.date,
        w.max_temp,
        w.max_rainfall,
        w.avg_wind,
        w.max_weather_score,
        w.avg_pm25,
        w.max_heat_index,
        COALESCE(c.total_claims, 0) as claims_count,
        COALESCE(c.total_payouts, 0) as total_payouts,
        CASE WHEN c.total_claims > 0 THEN 1 ELSE 0 END as had_disruption
      FROM DailyWeather w
      LEFT JOIN DailyClaims c ON w.zone = c.zone AND w.date = c.claim_date
      ORDER BY w.date ASC, w.zone ASC
    `;

    console.log('[ML_PIPELINE] Executing aggregation query across 2 years of history...');
    const result = await pg.query(query);

    const outputPath = path.join(__dirname, 'training_features.json');
    fs.writeFileSync(outputPath, JSON.stringify(result.rows, null, 2));

    console.log(`[ML_PIPELINE] Successfully extracted ${result.rows.length} daily feature rows.`);
    console.log(`[ML_PIPELINE] Saved features to: ${outputPath}`);
    
    // In a full production system, this would trigger an API call to a Python ML microservice
    // to retrain the XGBoost model and save the new ONNX/Pickle file to S3.
    console.log('[ML_PIPELINE] Pipeline complete. Ready for ML model retraining ingestion.');

  } catch (error) {
    console.error('[ML_PIPELINE] Error during feature extraction:', error.message);
  }
}

// If run directly
if (require.main === module) {
  pg.initialize().then(ok => {
    if(ok) {
      buildFeaturePipeline().then(() => pg.shutdown());
    }
  });
}

module.exports = { buildFeaturePipeline };

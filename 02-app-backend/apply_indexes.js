require('dotenv').config({ override: true });
const pg = require('./data/pg');

async function apply() {
  await pg.initialize();
  try {
    await pg.query("CREATE INDEX IF NOT EXISTS idx_workers_zone_status_mode ON workers(zone, status, data_mode);");
    await pg.query("CREATE INDEX IF NOT EXISTS idx_claims_worker_date_mode ON claims(worker_id, date, data_mode, time_slot);");
    await pg.query("CREATE INDEX IF NOT EXISTS idx_policies_status_mode ON policies(status, data_mode);");
    console.log("✅ Successfully created indexes to prevent slow queries");
  } catch (err) {
    console.error("❌ Failed to create indexes:", err.message);
  }
  await pg.shutdown();
}

apply();

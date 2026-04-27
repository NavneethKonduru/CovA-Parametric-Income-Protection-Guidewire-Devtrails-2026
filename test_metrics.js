require('dotenv').config({ override: true });
const pg = require('./02-app-backend/data/pg');

async function test() {
  await pg.initialize();
  const res = await pg.query("SELECT * FROM vw_claims_metrics");
  console.log('Claims metrics:', res.rows[0]);
  const hm = await pg.query("SELECT * FROM vw_zone_claim_heatmap");
  console.log('Heatmap:', hm.rows);
  await pg.shutdown();
}
test();

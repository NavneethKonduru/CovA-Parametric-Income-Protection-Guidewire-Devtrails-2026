/**
 * Quick smoke test: verify PG integration + repositories work end-to-end.
 * Run: node db/smoke-test.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pg = require('../backend/data/pg');

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  CovA Smoke Test — PG Integration');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('1. Testing PG connection...');
  const ok = await pg.initialize();
  console.log(`   PG Ready: ${ok}`);
  console.log(`   Data Mode: ${pg.getDataMode()}`);

  if (!ok) { console.error('❌ PG init failed'); process.exit(1); }

  console.log('\n2. Testing workers repository...');
  const workersRepo = require('../backend/repositories/workers');
  const workers = await workersRepo.findActive({}, pg.getDataMode());
  console.log(`   Active workers: ${workers.length}`);

  console.log('\n3. Testing claims repository...');
  const claimsRepo = require('../backend/repositories/claims');
  const summary = await claimsRepo.getDailySummary(7, pg.getDataMode());
  console.log(`   Claims (last 7 days): ${summary.length} days with claims`);

  console.log('\n4. Testing weather repository...');
  const weatherRepo = require('../backend/repositories/weather');
  const obs = await weatherRepo.getLatest('ZONE_A', pg.getDataMode());
  console.log(`   Latest ZONE_A observation: ${obs ? obs.timestamp : 'none'}`);

  console.log('\n5. Testing config helpers...');
  const threshold = await pg.getInsurerConfig('cdi_trigger_threshold');
  console.log(`   CDI threshold: ${threshold}`);
  const weights = await pg.getAdminConfig('cdi_weights');
  console.log(`   CDI weights: ${JSON.stringify(weights)}`);

  console.log('\n6. Quick query tests...');
  const wCount = await pg.query('SELECT COUNT(*)::int as c FROM public.workers WHERE data_mode = $1', [pg.getDataMode()]);
  const cCount = await pg.query('SELECT COUNT(*)::int as c FROM public.claims WHERE data_mode = $1', [pg.getDataMode()]);
  const oCount = await pg.query('SELECT COUNT(*)::int as c FROM weather.observations WHERE data_mode = $1', [pg.getDataMode()]);
  console.log(`   Workers: ${wCount.rows[0].c}`);
  console.log(`   Claims: ${cCount.rows[0].c}`);
  console.log(`   Weather observations: ${oCount.rows[0].c}`);

  const dbSize = await pg.query('SELECT pg_size_pretty(pg_database_size(current_database())) as s');
  console.log(`   DB size: ${dbSize.rows[0].s}`);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ✅ All tests passed!');
  console.log('═══════════════════════════════════════════════════════\n');

  await pg.shutdown();
}

main().catch(err => {
  console.error('❌ Smoke test failed:', err.message);
  process.exit(1);
});

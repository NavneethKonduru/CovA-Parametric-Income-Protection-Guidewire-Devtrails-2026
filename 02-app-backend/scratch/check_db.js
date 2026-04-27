const pg = require('../data/pg');

async function checkData() {
  await pg.initialize();
  
  console.log('Current Data Mode:', pg.getDataMode());
  
  const modes = ['real', 'demo'];
  
  for (const mode of modes) {
    console.log(`\n--- MODE: ${mode.toUpperCase()} ---`);
    
    const workerRes = await pg.query('SELECT COUNT(*) as c FROM workers WHERE data_mode = $1', [mode]);
    console.log(`Workers: ${workerRes.rows[0].c}`);
    
    const claimRes = await pg.query('SELECT COUNT(*) as c FROM claims WHERE data_mode = $1', [mode]);
    console.log(`Claims: ${claimRes.rows[0].c}`);
    
    if (claimRes.rows[0].c > 0) {
      const statusRes = await pg.query('SELECT status, COUNT(*) as c FROM claims WHERE data_mode = $1 GROUP BY status', [mode]);
      console.log('Claim Statuses:');
      statusRes.rows.forEach(r => console.log(`  ${r.status}: ${r.c}`));
    }
  }
  
  await pg.shutdown();
}

checkData().catch(console.error);

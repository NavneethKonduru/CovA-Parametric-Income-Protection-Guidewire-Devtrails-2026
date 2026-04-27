const pg = require('../data/pg');

async function verify() {
  await pg.initialize();
  const now = new Date();
  const startDate = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0];
  const endDate = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
  
  const { rows } = await pg.query(
    'SELECT COUNT(*) as c FROM claims WHERE date BETWEEN $1 AND $2 AND data_mode = $3',
    [startDate, endDate, 'demo']
  );
  
  console.log(`Claims in last 90 days (Demo): ${rows[0].c}`);
  
  const payoutRes = await pg.query(
    'SELECT SUM(payout_amount) as total FROM claims WHERE status = \'paid\' AND data_mode = \'demo\''
  );
  console.log(`Total Paid (Demo): ₹${payoutRes.rows[0].total}`);
  
  await pg.shutdown();
}

verify().catch(console.error);

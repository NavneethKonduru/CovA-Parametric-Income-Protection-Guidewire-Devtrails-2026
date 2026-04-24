const { Client } = require('pg');
require('dotenv').config();
async function test() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const res1 = await client.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \'workers\' AND column_name LIKE \'%rzp%\'');
  console.log('Workers Columns:', res1.rows);
  const res2 = await client.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \'payout_log\' AND column_name IN (\'idempotency_key\', \'provider_event_type\', \'webhook_payload\', \'failure_code\')');
  console.log('Payout Log Columns:', res2.rows);
  await client.end();
}
test().catch(console.error);

const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config();

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB');
    
    const sql = fs.readFileSync('../04-core-database/migrations/011_payment_lifecycle.sql', 'utf8');
    await client.query(sql);
    
    console.log('Migration 011 applied successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

migrate();

#!/usr/bin/env node
/**
 * Migration: Add data_mode column to tables missing it.
 * Run: node migrate-mode-columns.js
 */
require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('Connected to database.');

  // 1. guidewire_submissions
  await client.query("ALTER TABLE public.guidewire_submissions ADD COLUMN IF NOT EXISTS data_mode TEXT DEFAULT 'demo'");
  console.log('✅ guidewire_submissions: data_mode column added');

  // 2. fraud.detection_log
  await client.query("ALTER TABLE fraud.detection_log ADD COLUMN IF NOT EXISTS data_mode TEXT DEFAULT 'demo'");
  console.log('✅ fraud.detection_log: data_mode column added');

  await client.end();
  console.log('Done. Both tables now have data_mode column.');
}

run().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runSQLFile(filePath) {
  console.log(`Running ${filePath}...`);
  const sql = fs.readFileSync(filePath, 'utf8');
  try {
    await pool.query(sql);
    console.log(`✅ Success`);
  } catch (err) {
    console.error(`❌ Error in ${filePath}:`, err.message);
  }
}

async function main() {
  const dbDir = path.join(__dirname, '../04-core-database');
  
  await runSQLFile(path.join(dbDir, 'init.sql'));
  
  const migDir = path.join(dbDir, 'migrations');
  for (const file of fs.readdirSync(migDir).sort()) {
    if (file.endsWith('.sql')) await runSQLFile(path.join(migDir, file));
  }
  
  const seedDir = path.join(dbDir, 'seeds');
  for (const file of fs.readdirSync(seedDir).sort()) {
    if (file.endsWith('.sql')) await runSQLFile(path.join(seedDir, file));
  }
  
  console.log("Done seeding.");
  pool.end();
}

main();

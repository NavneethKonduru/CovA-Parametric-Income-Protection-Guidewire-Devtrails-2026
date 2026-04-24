/**
 * Quick diagnostic: check what's already set up in the Neon database.
 * Usage: node db/check-status.js
 */
const { Pool } = require('../backend/node_modules/pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_oERYSLx7hj3g@ep-small-moon-a1zoxwf2-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

(async () => {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  CovA Database Status Check');
    console.log('═══════════════════════════════════════════════════════\n');

    // Test connection
    const info = await pool.query('SELECT current_database() as db, version() as ver');
    console.log('✓ Connected to:', info.rows[0].db);
    console.log('  PostgreSQL:', info.rows[0].ver.split(',')[0]);

    // Check extensions
    const ext = await pool.query("SELECT extname FROM pg_extension ORDER BY extname");
    console.log('\n  Extensions:', ext.rows.map(r => r.extname).join(', '));

    // Check schemas
    const schemas = await pool.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY schema_name");
    console.log('\n  Schemas:', schemas.rows.map(r => r.schema_name).join(', '));

    // Check tables per schema
    const tables = await pool.query("SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname, tablename");
    console.log('\n  Tables (' + tables.rows.length + ' total):');
    let currentSchema = '';
    for (const t of tables.rows) {
      if (t.schemaname !== currentSchema) {
        currentSchema = t.schemaname;
        console.log('    [' + currentSchema + ']');
      }
      console.log('      - ' + t.tablename);
    }

    // Check custom types
    const types = await pool.query("SELECT typname FROM pg_type WHERE typname = 'data_mode_enum'");
    console.log('\n  data_mode_enum type:', types.rows.length > 0 ? '✓ exists' : '✗ missing');

    // Check row counts for key tables
    const tablesToCheck = [
      'public.workers', 'public.policies', 'public.claims',
      'public.insurer_config', 'public.admin_config',
      'weather.observations', 'weather.region_mapping', 'weather.civic_disruptions',
      'simulation.scenario_library', 'simulation.state',
      'system.config',
    ];
    console.log('\n  Row counts:');
    for (const table of tablesToCheck) {
      try {
        const r = await pool.query('SELECT COUNT(*)::integer as c FROM ' + table);
        const label = table.split('.')[1];
        console.log('    ' + label.padEnd(22) + r.rows[0].c);
      } catch (e) {
        const label = table.split('.')[1];
        console.log('    ' + label.padEnd(22) + '(not found)');
      }
    }

    // DB size
    const size = await pool.query('SELECT pg_size_pretty(pg_database_size(current_database())) as s');
    console.log('\n  Database size:', size.rows[0].s);

    // Check functions
    const funcs = await pool.query("SELECT routine_schema, routine_name FROM information_schema.routines WHERE routine_schema IN ('system','weather') ORDER BY routine_schema, routine_name");
    if (funcs.rows.length > 0) {
      console.log('\n  Functions:');
      for (const f of funcs.rows) {
        console.log('    ' + f.routine_schema + '.' + f.routine_name);
      }
    }

    console.log('\n═══════════════════════════════════════════════════════\n');
    await pool.end();
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }
})();

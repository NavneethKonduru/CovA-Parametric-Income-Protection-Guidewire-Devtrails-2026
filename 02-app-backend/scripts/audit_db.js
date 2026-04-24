const pg = require('../data/pg');
async function run() {
  try {
    const initialized = await pg.initialize();
    if (!initialized) {
      console.error('Failed to initialize database connection.');
      process.exit(1);
    }
    const tables = [
      'public.workers', 
      'public.claims', 
      'public.telemetry_raw', 
      'public.disruption_events',
      'fraud.detection_log',
      'system.audit_log'
    ];
    
    console.log('--- DATABASE INVENTORY ---');
    for (const table of tables) {
      const res = await pg.query(`SELECT COUNT(*) as count FROM ${table}`);
      if (res.error) {
        console.log(`[${table}]: ERROR - ${res.error}`);
      } else {
        console.log(`[${table}]: ${res.rows[0].count}`);
      }
    }

    const zr = await pg.query("SELECT id, status, payout_amount FROM public.claims WHERE status='paid' AND payout_amount=0");
    console.log('Zero Rupee Claims:', zr.rows);

    const proc = await pg.query("SELECT id, status FROM public.claims WHERE status LIKE '%pend%' OR status LIKE '%proc%'");
    console.log('Processing/Pending Claims:', proc.rows);

    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
run();

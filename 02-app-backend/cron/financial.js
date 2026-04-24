/**
 * ============================================================================
 * Financial Snapshot Job
 * ============================================================================
 * Daily end-of-day (EOD) aggregation for the financial dashboard.
 * Populates financial.daily_snapshots with P&L and Loss Ratio metrics.
 * ============================================================================
 */

const pg = require('../data/pg');

async function runFinancialSnapshot() {
  const dataMode = pg.getDataMode();
  const today = new Date().toISOString().split('T')[0];

  console.log(`[FINANCIAL] Starting snapshot for ${today} (Mode: ${dataMode})`);

  try {
    // 1. Get Claim Stats
    const claimsRes = await pg.query(`
      SELECT 
        COUNT(*)::integer as total,
        COUNT(*) FILTER (WHERE status = 'paid')::integer as paid,
        COUNT(*) FILTER (WHERE status = 'rejected')::integer as rejected,
        COUNT(*) FILTER (WHERE status = 'flagged')::integer as flagged,
        COALESCE(SUM(payout_amount), 0)::numeric FILTER (WHERE status = 'paid') as total_payout
      FROM public.claims
      WHERE DATE(created_at) = $1 AND data_mode = $2
    `, [today, dataMode]);

    if (claimsRes.error) throw new Error(claimsRes.error);
    const claimStats = claimsRes.rows[0] || { total: 0, paid: 0, rejected: 0, flagged: 0, total_payout: 0 };

    // 2. Get Worker/Policy Stats
    const workerRes = await pg.query(`
      SELECT COUNT(*)::integer as total FROM public.workers WHERE status = 'active' AND data_mode = $1
    `, [dataMode]);

    if (workerRes.error) throw new Error(workerRes.error);
    const activeWorkers = parseInt(workerRes.rows[0]?.total || 0);

    // 3. Get CDI/Environment Stats
    const eventRes = await pg.query(`
      SELECT COALESCE(AVG(cdi_score), 0)::numeric as avg_cdi, COUNT(*)::integer as count 
      FROM public.disruption_events 
      WHERE DATE(created_at) = $1 AND data_mode = $2
    `, [today, dataMode]);

    if (eventRes.error) throw new Error(eventRes.error);
    const envStats = eventRes.rows[0] || { avg_cdi: 0, count: 0 };

    // 4. Calculate Premium Collected (35 INR per active worker for the week/7 days)
    const premiumCollected = activeWorkers * 5; // Simplified daily premium

    // 5. Calculate Ratios
    const totalPayout = parseFloat(claimStats.total_payout || 0);
    const lossRatio = premiumCollected > 0 ? (totalPayout / premiumCollected) : 0;
    const expenseRatio = 0.15; // Placeholder for OpEx
    const combinedRatio = lossRatio + expenseRatio;

    // 6. Upsert into financial.daily_snapshots
    await pg.query(`
      INSERT INTO financial.daily_snapshots (
        date, claims_count, claims_paid, claims_rejected, claims_flagged,
        total_payout, premium_collected, loss_ratio, expense_ratio, combined_ratio,
        avg_cdi, active_workers, active_policies, data_mode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (date, data_mode) DO UPDATE SET
        claims_count = EXCLUDED.claims_count,
        claims_paid = EXCLUDED.claims_paid,
        claims_rejected = EXCLUDED.claims_rejected,
        claims_flagged = EXCLUDED.claims_flagged,
        total_payout = EXCLUDED.total_payout,
        premium_collected = EXCLUDED.premium_collected,
        loss_ratio = EXCLUDED.loss_ratio,
        avg_cdi = EXCLUDED.avg_cdi,
        active_workers = EXCLUDED.active_workers,
        active_policies = EXCLUDED.active_policies
    `, [
      today,
      parseInt(claimStats.total || 0),
      parseInt(claimStats.paid || 0),
      parseInt(claimStats.rejected || 0),
      parseInt(claimStats.flagged || 0),
      totalPayout,
      premiumCollected,
      lossRatio,
      expenseRatio,
      combinedRatio,
      parseFloat(envStats.avg_cdi || 0),
      activeWorkers,
      activeWorkers,
      dataMode
    ]);

    console.log(`[FINANCIAL] Snapshot complete for ${today}. Loss Ratio: ${(lossRatio * 100).toFixed(1)}%`);

  } catch (err) {
    console.error(`[FINANCIAL] Snapshot failed:`, err.message);
  }
}

// Export for manual trigger or scheduler
module.exports = { runFinancialSnapshot };

// Auto-run if script is called directly
if (require.main === module) {
  runFinancialSnapshot().then(() => process.exit());
}

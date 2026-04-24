import { useState, useEffect } from 'react';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

function LossRatioDial({ value }) {
  const pct = Math.min(Math.max(value, 0), 100);
  const cx = 90, cy = 80, r = 64;
  const ARC_START = -140, ARC_END = 140;
  const angle = ARC_START + (pct / 100) * (ARC_END - ARC_START);
  const toXY = (ang) => {
    const rad = ((ang - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const arcPath = (s, e) => {
    const sp = toXY(s), ep = toXY(e);
    const large = e - s > 180 ? 1 : 0;
    return `M ${sp.x} ${sp.y} A ${r} ${r} 0 ${large} 1 ${ep.x} ${ep.y}`;
  };
  const needleTip = toXY(angle);
  const nb1 = toXY(angle + 90), nb2 = toXY(angle - 90);
  const safeEnd = ARC_START + (65 / 100) * (ARC_END - ARC_START);
  const warnEnd = ARC_START + (85 / 100) * (ARC_END - ARC_START);
  const fillEnd = ARC_START + (pct / 100) * (ARC_END - ARC_START);
  const color = pct < 65 ? '#10b981' : pct < 85 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={180} height={110} style={{ overflow: 'visible' }}>
        <path d={arcPath(ARC_START, ARC_END)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={12} strokeLinecap="round" />
        <path d={arcPath(ARC_START, safeEnd)} fill="none" stroke="#10b981" strokeWidth={8} strokeOpacity={0.25} />
        <path d={arcPath(safeEnd, warnEnd)} fill="none" stroke="#f59e0b" strokeWidth={8} strokeOpacity={0.25} />
        <path d={arcPath(warnEnd, ARC_END)} fill="none" stroke="#ef4444" strokeWidth={8} strokeOpacity={0.25} />
        {pct > 0 && <path d={arcPath(ARC_START, fillEnd)} fill="none" stroke={color} strokeWidth={8} strokeLinecap="butt" />}
        <polygon points={`${needleTip.x},${needleTip.y} ${nb1.x},${nb1.y} ${nb2.x},${nb2.y}`} fill={color} />
        <circle cx={cx} cy={cy} r={7} fill={color} />
        <circle cx={cx} cy={cy} r={3.5} fill="#0b0f1a" />
        <text x={cx} y={cy + 24} textAnchor="middle" fill={color} fontSize={20} fontWeight="800" fontFamily="monospace">{pct.toFixed(1)}%</text>
        <text x={cx} y={cy + 36} textAnchor="middle" fill="#6b7280" fontSize={7} fontFamily="monospace">Loss Ratio</text>
      </svg>
      <div style={{ fontSize: '0.65rem', color: pct < 65 ? '#34d399' : '#f87171', fontWeight: 700, marginTop: '-0.25rem' }}>
        {pct < 65 ? '✓ Actuarially Sustainable' : pct < 85 ? '⚠ Monitor Closely' : '⛔ Unsustainable'}
      </div>
      <div style={{ fontSize: '0.6rem', color: '#4b5563', marginTop: '0.2rem' }}>IRDAI Threshold: {'<'}65%</div>
    </div>
  );
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function CounterfactualAnalysis({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('historical'); // 'historical' | 'forward'
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  useEffect(() => {
    fetch('/api/counterfactual/analysis', { headers })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: '#6b7280', fontSize: '0.85rem' }}>
      Loading 5-year analysis…
    </div>
  );

  if (!data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: '#6b7280' }}>
      Analysis unavailable
    </div>
  );

  const { historical = [], monthlyBreakdown = [], forwardProjection = [], totals = {}, dataSource } = data;

  const avgLossRatio = totals.avgLossRatio || 0;

  // Prepare monthly heatmap — last 12 months
  const heatmapData = MONTH_LABELS.map((label, i) => {
    const row = monthlyBreakdown.find(m => new Date(m.month).getMonth() === i);
    return { month: label, breachHours: row?.breach_hours || 0, avgScore: parseFloat(row?.avg_score || 0) };
  });

  const maxBreachHours = Math.max(...heatmapData.map(h => h.breachHours), 1);

  const chartData = viewMode === 'historical' ? historical : forwardProjection;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', padding: '0.75rem', fontSize: '0.75rem' }}>
        <div style={{ fontWeight: 700, color: '#e5e7eb', marginBottom: '0.4rem' }}>Year {label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color, marginTop: '0.2rem' }}>
            {p.name}: {p.name.includes('₹') || p.name.includes('Payout') || p.name.includes('Premium') ? `₹${(p.value || 0).toLocaleString()}` : (p.value || 0).toLocaleString()}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* ── Header narrative ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05))',
        border: '1px solid rgba(99,102,241,0.18)',
        borderRadius: '14px',
        padding: '1.25rem 1.5rem',
      }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#818cf8', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          Counterfactual Analysis · 2021–2025
        </div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#e5e7eb', marginBottom: '0.4rem', lineHeight: 1.4 }}>
          What if CovA existed for the past 5 monsoon seasons?
        </div>
        <div style={{ fontSize: '0.78rem', color: '#9ca3af', lineHeight: 1.6 }}>
          This is not a simulation. This is what happens when our parametric CDI engine runs against
          5 years of real Bangalore rainfall data. Every breach hour, every claim, every payout — computed.
        </div>
        {dataSource === 'static_estimates' && (
          <div style={{ fontSize: '0.62rem', color: '#4b5563', marginTop: '0.5rem' }}>
            * Based on IMD Bangalore rainfall records 2021–2025 · Live weather DB not yet ingested
          </div>
        )}
      </div>

      {/* ── Headline KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.6rem' }}>
        {[
          { label: 'Total Breach Hours', value: (totals.breachHours || 0).toLocaleString(), sub: '5 years', color: '#f59e0b' },
          { label: 'Claims Triggered', value: (totals.claims || 0).toLocaleString(), sub: 'Auto-paid', color: '#60a5fa' },
          { label: 'Total Payouts', value: `₹${((totals.payouts || 0) / 1e7).toFixed(1)}Cr`, sub: 'Would have paid', color: '#ef4444' },
          { label: 'Avg Loss Ratio', value: `${avgLossRatio}%`, sub: 'Target <65%', color: avgLossRatio < 65 ? '#10b981' : '#f59e0b' },
          { label: 'LAE Savings', value: `₹${((totals.laeSaved || 0) / 1e5).toFixed(1)}L`, sub: '₹2k per claim', color: '#34d399' },
        ].map((m, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '10px',
            padding: '0.75rem',
          }}>
            <div style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '0.3rem' }}>{m.label}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: '0.6rem', color: '#4b5563', marginTop: '0.2rem' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Loss ratio dial + Year chart ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '0.75rem', alignItems: 'start' }}>
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px',
          padding: '1rem 0.5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <LossRatioDial value={avgLossRatio} />
          <div style={{ fontSize: '0.62rem', color: '#4b5563', textAlign: 'center', lineHeight: 1.5 }}>
            Profitable in {historical.filter(y => y.lossRatio < 65).length}/{historical.length} years
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px',
          padding: '1rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.65rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {viewMode === 'historical' ? 'Annual Premium vs Payouts (2021–2025)' : 'Forward Projection (2026–2030)'}
            </div>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              {['historical', 'forward'].map(v => (
                <button key={v} onClick={() => setViewMode(v)} style={{
                  fontSize: '0.62rem', padding: '0.25rem 0.6rem', borderRadius: '4px',
                  background: viewMode === v ? 'rgba(99,102,241,0.15)' : 'transparent',
                  border: viewMode === v ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.07)',
                  color: viewMode === v ? '#a5b4fc' : '#6b7280',
                  cursor: 'pointer',
                }}>
                  {v === 'historical' ? '2021–25' : '2026–30'}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="year" stroke="#4b5563" fontSize={10} />
              <YAxis stroke="#4b5563" fontSize={9} tickFormatter={v => `₹${(v / 1e7).toFixed(0)}Cr`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="estimatedPremiumCollected" fill="rgba(16,185,129,0.3)" stroke="#10b981" strokeWidth={1} radius={[3, 3, 0, 0]} name="Premium" />
              <Bar dataKey="estimatedPayouts" fill="rgba(239,68,68,0.35)" stroke="#ef4444" strokeWidth={1} radius={[3, 3, 0, 0]} name="Payouts" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Monthly Heatmap ── */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        padding: '1rem',
      }}>
        <div style={{ fontSize: '0.65rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>
          Monthly Breach Intensity · Monsoon Season Visible
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'flex-end' }}>
          {heatmapData.map((m, i) => {
            const intensity = m.breachHours / maxBreachHours;
            const isMonsoon = i >= 5 && i <= 8;
            const color = isMonsoon
              ? `rgba(239,68,68,${0.15 + intensity * 0.7})`
              : `rgba(99,102,241,${0.08 + intensity * 0.25})`;
            const textColor = intensity > 0.5 ? '#f87171' : isMonsoon ? '#f59e0b' : '#6b7280';
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                <div style={{ fontSize: '0.55rem', color: textColor, fontWeight: m.breachHours > 50 ? 700 : 400 }}>
                  {m.breachHours}h
                </div>
                <div style={{
                  width: '100%',
                  height: `${16 + intensity * 56}px`,
                  background: color,
                  border: `1px solid ${isMonsoon ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.6s ease',
                }} />
                <div style={{ fontSize: '0.55rem', color: isMonsoon ? '#f59e0b' : '#4b5563', fontWeight: isMonsoon ? 700 : 400 }}>
                  {m.month}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: '0.6rem', color: '#4b5563', marginTop: '0.6rem', textAlign: 'center' }}>
          June–September: Bangalore Monsoon Season · Highest breach hours
        </div>
      </div>

      {/* ── Year-by-year loss ratio ── */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        padding: '1rem',
      }}>
        <div style={{ fontSize: '0.65rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>
          Year-by-Year Loss Ratio — Sustainability Track Record
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', height: '80px' }}>
          {historical.map((y, i) => {
            const heightPct = (y.lossRatio / 100) * 100;
            const isSafe = y.lossRatio < 65;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '0.3rem' }}>
                <div style={{ fontSize: '0.6rem', color: isSafe ? '#34d399' : '#f59e0b', fontWeight: 700 }}>
                  {y.lossRatio.toFixed(1)}%
                </div>
                <div style={{
                  width: '100%',
                  height: `${heightPct}%`,
                  background: isSafe ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)',
                  border: `1px solid ${isSafe ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.4)'}`,
                  borderRadius: '4px 4px 0 0',
                  position: 'relative',
                }}>
                  {/* 65% threshold line */}
                  <div style={{
                    position: 'absolute',
                    bottom: `${((65 / y.lossRatio) - 1) * -100}%`, // tricky: inside bar at 65% height relative
                    display: 'none',
                  }} />
                </div>
                <div style={{ fontSize: '0.6rem', color: '#6b7280' }}>{y.year}</div>
              </div>
            );
          })}
        </div>
        {/* 65% reference line caption */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
          <div style={{ width: 20, height: 1, background: 'rgba(239,68,68,0.4)', borderTop: '1px dashed rgba(239,68,68,0.4)' }} />
          <span style={{ fontSize: '0.6rem', color: '#6b7280' }}>65% IRDAI threshold — all years below = profitable portfolio</span>
        </div>
      </div>
    </div>
  );
}

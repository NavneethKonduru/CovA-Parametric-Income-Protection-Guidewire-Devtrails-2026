import { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';

const ExecutiveReporting = ({ token, onLogout }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportRange, setReportRange] = useState('30d');

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch(`/api/dashboard/insurer?range=${reportRange}`, { headers })
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [reportRange]);

  if (loading) return <div className="loading-screen">Analyzing Actuarial Datasets...</div>;

  const summary = [
    { label: 'Total GWP (Gross Written Premium)', value: `₹${(data?.totalPremium || 0).toLocaleString()}`, trend: '+12.5%', color: '#3b82f6' },
    { label: 'Net Claims Settled', value: `₹${(data?.totalPayout || 0).toLocaleString()}`, trend: '+5.2%', color: '#f87171' },
    { label: 'Gross Loss Ratio', value: `${data?.lossRatio?.toFixed(1) || 0}%`, trend: 'Target: 65%', color: '#fbbf24' },
    { label: 'Fraud Savings (TCHC)', value: `₹${(data?.fraudSavings || 0).toLocaleString()}`, trend: 'Blocked: 34%', color: '#10b981' }
  ];

  const perilData = [
    { name: 'Rain/Flood', value: 45, color: '#3b82f6' },
    { name: 'Heatwave', value: 15, color: '#f59e0b' },
    { name: 'Gridlock', value: 25, color: '#ef4444' },
    { name: 'Civic/Curfew', value: 10, color: '#8b5cf6' },
    { name: 'Platform Outage', value: 5, color: '#6b7280' }
  ];

  const COLORS = perilData.map(d => d.color);

  return (
    <div className="dashboard-container reporting-view">
      <header className="dashboard-header">
        <div className="header-brand">
          <div className="logo-icon">C</div>
          <h1>CovA <span className="view-tag">Executive Reporting</span></h1>
        </div>
        <div className="header-actions">
          <select value={reportRange} onChange={e => setReportRange(e.target.value)} className="range-select">
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last Quarter</option>
            <option value="1y">Full Year</option>
          </select>
          <button className="btn-secondary" onClick={() => window.print()}>Generate PDF Audit</button>
          <button className="logout-btn" onClick={onLogout}>Exit</button>
        </div>
      </header>

      <main className="reporting-main">
        {/* KPI Cards */}
        <section className="kpi-grid">
          {summary.map((kpi, idx) => (
            <div key={idx} className="kpi-card" style={{ borderTop: `4px solid ${kpi.color}` }}>
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value">{kpi.value}</div>
              <div className="kpi-trend" style={{ color: kpi.color }}>{kpi.trend}</div>
            </div>
          ))}
        </section>

        <div className="reporting-charts">
          {/* Main Financial Trend */}
          <div className="chart-box large">
            <h3>Revenue vs Claims (Actuarial Projections)</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data?.historicalTrends || []}>
                  <defs>
                    <linearGradient id="colorGwp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorClaims" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f87171" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                    itemStyle={{ fontSize: '12px' }}
                  />
                  <Area type="monotone" dataKey="premium" stroke="#3b82f6" fillOpacity={1} fill="url(#colorGwp)" name="GWP" />
                  <Area type="monotone" dataKey="payout" stroke="#f87171" fillOpacity={1} fill="url(#colorClaims)" name="Claims" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-row">
            {/* Peril Breakdown */}
            <div className="chart-box">
              <h3>Peril Risk Distribution</h3>
              <div className="chart-container" style={{ display: 'flex', alignItems: 'center' }}>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={perilData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {perilData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pie-legend">
                  {perilData.map(p => (
                    <div key={p.name} className="legend-item">
                      <span className="dot" style={{ background: p.color }}></span>
                      <span className="name">{p.name}</span>
                      <span className="val">{p.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Zone Performance */}
            <div className="chart-box">
              <h3>Zone Loss Ratios (Parametric Accuracy)</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data?.zoneMetrics || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="zone" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                    />
                    <Bar dataKey="lossRatio" fill="#fbbf24" radius={[4, 4, 0, 0]} name="Loss Ratio %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Audit Log Table */}
        <section className="audit-table-section">
          <div className="section-header">
            <h3>Parametric Compliance Audit Log</h3>
            <button className="btn-text">View Full Ledger</button>
          </div>
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Event Type</th>
                <th>Zone</th>
                <th>Trigger Logic</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {data?.auditLogs?.map(log => (
                <tr key={log.id}>
                  <td>{new Date(log.timestamp).toLocaleString()}</td>
                  <td><span className={`tag ${log.type.toLowerCase()}`}>{log.type}</span></td>
                  <td>{log.zone}</td>
                  <td>{log.trigger}</td>
                  <td className={log.result === 'Approved' ? 'text-success' : 'text-danger'}>{log.result}</td>
                </tr>
              )) || (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>No recent audit events</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .reporting-view {
          background: #0a0a0a;
          color: #f3f4f6;
          min-height: 100vh;
        }
        .reporting-main {
          padding: 2rem;
          max-width: 1400px;
          margin: 0 auto;
        }
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        .kpi-card {
          background: #111827;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        }
        .kpi-label {
          font-size: 0.8rem;
          color: #9ca3af;
          margin-bottom: 0.5rem;
        }
        .kpi-value {
          font-size: 1.8rem;
          font-weight: 700;
          margin-bottom: 0.25rem;
        }
        .kpi-trend {
          font-size: 0.85rem;
          font-weight: 500;
        }
        .chart-box {
          background: #111827;
          padding: 1.5rem;
          border-radius: 12px;
          margin-bottom: 1.5rem;
        }
        .chart-box h3 {
          font-size: 1rem;
          margin-bottom: 1.5rem;
          color: #d1d5db;
        }
        .chart-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }
        .pie-legend {
          padding-left: 1rem;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
          font-size: 0.85rem;
        }
        .dot { width: 8px; height: 8px; borderRadius: 50%; }
        .legend-item .val { margin-left: auto; color: #9ca3af; }
        
        .audit-table-section {
          background: #111827;
          padding: 1.5rem;
          border-radius: 12px;
        }
        .audit-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
          font-size: 0.85rem;
        }
        .audit-table th {
          text-align: left;
          padding: 0.75rem;
          color: #6b7280;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .audit-table td {
          padding: 1rem 0.75rem;
          border-bottom: 1px solid rgba(255,255,255,0.02);
        }
        .tag {
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
        }
        .tag.cdi_breach { background: rgba(239,68,68,0.1); color: #f87171; }
        .tag.claim_batch { background: rgba(59,130,246,0.1); color: #3b82f6; }
        .text-success { color: #10b981; }
        .text-danger { color: #f87171; }

        @media print {
          .dashboard-header .header-actions { display: none; }
          .reporting-view { background: #fff; color: #000; }
          .chart-box, .kpi-card, .audit-table-section { background: #fff; border: 1px solid #ddd; }
          .kpi-label, .chart-box h3 { color: #333; }
          .kpi-value { color: #000; }
        }
      `}} />
    </div>
  );
};

export default ExecutiveReporting;

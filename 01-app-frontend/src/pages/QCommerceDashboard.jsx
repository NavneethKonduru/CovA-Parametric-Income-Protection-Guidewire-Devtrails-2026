import { useState, useEffect } from 'react';
import ModeBanner from '../components/ModeBanner';
import StatusBadge from '../components/StatusBadge';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { generatePDF } from '../utils/generatePDF';
export default function QCommerceDashboard({ token, onLogout, dataMode }) {
  const [demandData, setDemandData] = useState({ ZONE_A: {}, ZONE_B: {}, ZONE_C: {} });
  const [platformStatus, setPlatformStatus] = useState('normal');
  const [demoState, setDemoState] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    // Initial fetch
    fetch('/api/dashboard/qcommerce/analytics', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setAnalytics(d)).catch(() => {});
    const fetchDemand = async () => {
      try {
        const zones = ['ZONE_A', 'ZONE_B', 'ZONE_C'];
        const newData = {};
        for (const zone of zones) {
          const res = await fetch(`/mock/demand/${zone}`);
          if (res.ok) {
            newData[zone] = await res.json();
          }
        }
        setDemandData(newData);
        // Just take ZONE_B platform status as representative for now
        if (newData['ZONE_B'] && newData['ZONE_B'].platform_status) {
          setPlatformStatus(newData['ZONE_B'].platform_status);
        }
      } catch (err) {
        console.error('Failed to fetch demand data', err);
      }
    };
    fetchDemand();

    // Setup WS
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:5000`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'SCENARIO_ACTIVATED' || message.type === 'CUSTOM_SIMULATION') {
          setTimeout(fetchDemand, 1000); // refresh after simulation applied
        } else if (message.type === 'DEMO_PROGRESS') {
          setDemoState(message.payload);
          fetchDemand();
        } else if (message.type === 'DEMO_STOPPED') {
          setDemoState(null);
        }
      } catch (err) {
        // ignore ws errors
      }
    };

    const interval = setInterval(fetchDemand, 10000);

    return () => {
      ws.close();
      clearInterval(interval);
    };
    // eslint-disable-next-line
  }, [dataMode]);

  const getStatusColor = (status) => {
    if (status === 'normal') return '#10B981';
    if (status === 'degraded') return '#F59E0B';
    if (status === 'suspended' || status === 'outage') return '#EF4444';
    return '#6b7280';
  };

  const downloadReport = async () => {
    if (!analytics) return;
    
    let aiText = "AI Analysis is currently processing...";
    try {
      const res = await fetch('/api/reports/portfolio-summary', { headers: { 'x-cova-mode': dataMode } });
      const data = await res.json();
      if (data.aiAnalysis) aiText = data.aiAnalysis;
    } catch (e) {
      console.error("Failed to fetch AI analysis", e);
    }

    generatePDF('Q-Commerce Employer Report', [
      { heading: 'Executive AI Summary', type: 'kpi', data: [
        { label: 'Groq Insight', value: aiText }
      ]},
      { heading: 'Fleet Coverage Summary', type: 'kpi', data: [
        { label: 'Platform', value: 'Q-Commerce Network' },
        { label: 'Active Fleet Workers', value: analytics.totalWorkers || 0 },
        { label: 'Claims Processed', value: analytics.claimsByPlatform?.reduce((s, p) => s + parseInt(p.claims), 0) || 0 },
        { label: 'Monthly Premium (50% Cost Share)', value: `₹${(analytics.costSharingModels?.find(m => m.employerPct === 50)?.employerMonthly || 0).toLocaleString()}` }
      ]},
      { heading: 'Zone Disruption Status', type: 'table', data: {
        columns: ['Zone', 'Disruption Risk', 'Platform Status'],
        rows: ['ZONE_A', 'ZONE_B', 'ZONE_C'].map(zone => [
          zone, 
          ((demandData[zone]?.demand_score || 0) * 100).toFixed(0) + '%',
          demandData[zone]?.platform_status || 'normal'
        ])
      }},
    ], 'CovA_QCommerce_Report.pdf');
  };

  return (
    <div className="admin-layout" style={{ minHeight: '100vh', background: '#0F172A', color: '#f3f4f6' }}>
      <ModeBanner mode={dataMode} />
      
      <header className="admin-header" style={{ padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: '#fff' }}>📦 Q-Commerce Aggregator Control</h1>
          <StatusBadge status={platformStatus} size="sm" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {demoState && (
            <div style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '0.4rem 0.8rem', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.4)', fontSize: '0.8rem', color: '#93c5fd' }}>
              ▶️ Sequence: {demoState.name} ({demoState.time})
            </div>
          )}
          <button onClick={onLogout} style={{ background: 'transparent', border: '1px solid #4b5563', color: '#d1d5db', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </header>

      <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          {/* Overview KPIs */}
          <div style={{ background: '#1E293B', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ fontSize: '0.85rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Active Orders (Network)</h3>
            <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#fff' }}>
              {Object.values(demandData).reduce((sum, d) => sum + (d.current_orders || 0), 0)}
              <span style={{ fontSize: '1rem', color: '#6b7280', fontWeight: 400 }}> / hr</span>
            </div>
          </div>
          
          <div style={{ background: '#1E293B', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ fontSize: '0.85rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Available Fleet Supply</h3>
            <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#10B981' }}>
              {platformStatus === 'normal' ? 'Optimal' : platformStatus === 'degraded' ? 'Strained' : 'Critical'}
            </div>
          </div>
          
          <div style={{ background: '#1E293B', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ fontSize: '0.85rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.5rem' }}>CovA Sync Status</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 8px #10B981' }}></div>
              <span style={{ fontSize: '1.2rem', fontWeight: 600, color: '#fff' }}>Connected</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem' }}>Streaming telemetry at 30s intervals</div>
          </div>
        </div>

        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#f3f4f6' }}>Zone Health Radar</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          {['ZONE_A', 'ZONE_B', 'ZONE_C'].map(zone => {
            const d = demandData[zone] || {};
            const score = d.demand_score || 0;
            const status = d.platform_status || 'normal';
            
            return (
              <div key={zone} style={{ background: '#1E293B', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: getStatusColor(status) }}></div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', margin: '0 0 0.25rem 0' }}>{zone}</h3>
                    <div style={{ fontSize: '0.8rem', color: getStatusColor(status), textTransform: 'uppercase', fontWeight: 500 }}>
                      {status}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.4rem 0.8rem', borderRadius: '6px', textAlign: 'right' }}>
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase' }}>Orders/Hr</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>{d.current_orders || 0}</div>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
                    <span style={{ color: '#9ca3af' }}>Demand Score (Volatility)</span>
                    <span style={{ color: '#fff', fontWeight: 500 }}>{(score * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${score * 100}%`, background: getStatusColor(status), transition: 'width 0.5s ease' }}></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* === Q-COMMERCE ANALYTICS CHARTS === */}
        {analytics && (
          <div style={{ marginTop: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.1rem', color: '#f3f4f6', margin: 0 }}>📊 Employer Analytics & Cost Sharing</h2>
              <button onClick={downloadReport} style={{
                padding: '0.5rem 1.2rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #06B6D4, #3B82F6)', color: '#fff', fontWeight: 600, fontSize: '0.85rem'
              }}>📄 Download Employer Report</button>
            </div>
            
            <div className="admin-grid">
              {/* Active Fleet by Zone */}
              <div className="admin-panel">
                <h3>Active Fleet by Zone</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={analytics.fleetStatus}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="zone" stroke="#6b7280" fontSize={10} />
                    <YAxis stroke="#6b7280" fontSize={10} />
                    <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
                    <Bar dataKey="workers" fill="#3B82F6" radius={[4,4,0,0]} name="Fleet Size" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Employer Cost Sharing Overview */}
              <div className="admin-panel">
                <h3>Premium Cost Distribution</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={[
                      { name: 'Employer Paid (50%)', value: analytics.financials?.employerContribution || 0 },
                      { name: 'Worker Paid (50%)', value: analytics.financials?.workerContribution || 0 }
                    ]} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70}>
                      <Cell fill="#8B5CF6" />
                      <Cell fill="#10B981" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Employer ROI Trend */}
              <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>Employer ROI (Claims vs Subsidy)</h3>
                  <div style={{ fontSize: '0.85rem', color: '#10B981', fontWeight: 600 }}>Net Value: ₹{((analytics.financials?.totalPayouts || 0) - (analytics.financials?.employerContribution || 0)).toLocaleString()}</div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={[{
                    name: 'Current Period',
                    employerSubsidy: analytics.financials?.employerContribution || 0,
                    workerPayouts: analytics.financials?.totalPayouts || 0
                  }]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="#6b7280" fontSize={10} />
                    <YAxis stroke="#6b7280" fontSize={10} />
                    <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
                    <Bar dataKey="employerSubsidy" fill="#EF4444" radius={[4,4,0,0]} name="Employer Cost (₹)" />
                    <Bar dataKey="workerPayouts" fill="#10B981" radius={[4,4,0,0]} name="Benefits Received (₹)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

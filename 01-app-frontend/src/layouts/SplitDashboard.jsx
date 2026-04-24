import { useState, useEffect } from 'react';
import InsurerDashboard from '../pages/InsurerDashboard';
import AdminPanel from '../pages/AdminPanel';
import CounterfactualAnalysis from '../pages/CounterfactualAnalysis';

export default function SplitDashboard({ token, onLogout }) {
  const [dataMode, setDataMode] = useState('demo');
  const [leftTab, setLeftTab] = useState('insurer'); // 'insurer' | 'counterfactual'

  useEffect(() => {
    // Get initial mode from server
    fetch('/api/health', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (d.dataMode) setDataMode(d.dataMode); })
      .catch(() => {});
  }, [token]);

  const handleModeChange = (mode) => {
    setDataMode(mode);
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '55fr 45fr',
      height: '100vh',
      overflow: 'hidden',
      background: '#0b0f1a',
    }}>
      {/* ── LEFT PANEL: Insurer View ── */}
      <div style={{
        borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Left tab bar */}
        <div style={{
          display: 'flex',
          gap: '0',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.3)',
          padding: '0 1rem',
          flexShrink: 0,
        }}>
          {[
            { key: 'insurer', label: '📊 Insurer View' },
            { key: 'counterfactual', label: '📈 Counterfactual' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setLeftTab(tab.key)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: leftTab === tab.key ? '2px solid #6366f1' : '2px solid transparent',
                color: leftTab === tab.key ? '#a5b4fc' : '#6b7280',
                padding: '0.55rem 0.9rem',
                fontSize: '0.72rem',
                fontWeight: leftTab === tab.key ? 700 : 400,
                cursor: 'pointer',
                letterSpacing: '0.25px',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Left content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {leftTab === 'insurer' ? (
            <InsurerDashboard
              token={token}
              dataMode={dataMode}
            />
          ) : (
            <div style={{ padding: '1rem' }}>
              <CounterfactualAnalysis token={token} />
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL: Admin Controls ── */}
      <div style={{ overflowY: 'auto' }}>
        <AdminPanel
          token={token}
          onLogout={onLogout}
          dataMode={dataMode}
          onDataModeChange={handleModeChange}
        />
      </div>
    </div>
  );
}

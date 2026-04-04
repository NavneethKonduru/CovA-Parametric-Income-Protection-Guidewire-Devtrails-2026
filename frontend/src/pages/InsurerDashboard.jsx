import { useState, useEffect, useRef } from 'react';

export default function InsurerDashboard({ token, onLogout }) {
  const [config, setConfig] = useState(null);
  const [claims, setClaims] = useState([]);
  const [health, setHealth] = useState(null);
  const [cdiData, setCdiData] = useState({});
  const [gwModal, setGwModal] = useState(null);
  const [toast, setToast] = useState(null);
  const wsRef = useRef(null);

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetch('/api/insurer/config', { headers }).then(r => r.json()).then(d => setConfig(d.config));
    fetch('/api/claims', { headers }).then(r => r.json()).then(d => setClaims(d.claims || []));
    fetch('/api/admin/health', { headers }).then(r => r.json()).then(d => setHealth(d)).catch(() => {});

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'CDI_UPDATE') {
        setCdiData(prev => ({ ...prev, [msg.payload.zone]: msg.payload }));
      }
      if (['CLAIM_CREATED', 'PAYOUT_SENT', 'FRAUD_BLOCKED', 'DEMO_RESET'].includes(msg.type)) {
        fetch('/api/claims', { headers }).then(r => r.json()).then(d => setClaims(d.claims || []));
        fetch('/api/admin/health', { headers }).then(r => r.json()).then(d => setHealth(d)).catch(() => {});
      }
      if (msg.type === 'WORKER_REGISTERED') {
        fetch('/api/admin/health', { headers }).then(r => r.json()).then(d => setHealth(d)).catch(() => {});
      }
    };
    return () => ws.close();
  }, []);

  const updateConfig = async (key, value) => {
    const res = await fetch('/api/insurer/config', {
      method: 'PATCH', headers,
      body: JSON.stringify({ [key]: value }),
    });
    const data = await res.json();
    if (res.ok || res.status === 207) {
      showToast(`${key} updated`);
      fetch('/api/insurer/config', { headers }).then(r => r.json()).then(d => setConfig(d.config));
    } else {
      showToast(data.errors?.[0]?.error || 'Update failed', 'error');
    }
  };

  const submitToGuidewire = async () => {
    const res = await fetch('/api/guidewire/submit', { method: 'POST', headers });
    const data = await res.json();
    if (res.ok) setGwModal(data);
    else showToast(data.error || 'No paid claims to submit', 'error');
  };

  const totalClaims = claims.length;
  const paidClaims = claims.filter(c => c.status === 'paid');
  const rejectedClaims = claims.filter(c => c.status === 'rejected');
  const flaggedClaims = claims.filter(c => c.status === 'flagged');
  const totalPayout = paidClaims.reduce((s, c) => s + (c.payoutAmount || 0), 0);
  const totalPremium = (health?.database?.workers || 10) * (config?.base_premium_rate?.value || 35);
  const lossRatio = totalPremium > 0 ? ((totalPayout / totalPremium) * 100) : 0;
  const laeSaved = paidClaims.length * 2000;

  const zoneNames = { ZONE_A: 'Koramangala', ZONE_B: 'Whitefield', ZONE_C: 'Indiranagar' };

  return (
    <div className="admin-layout">
      {/* Header */}
      <div className="admin-header">
        <h1>🏢 CovA Insurer Dashboard</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="live-dot"></span>
          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Live Services</span>
          <button className="btn-logout" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="admin-content">
        {/* Top Metric Cards */}
        <div className="metrics-dark-grid">
          <div className="metric-dark">
            <div className="metric-label">Loss Ratio</div>
            <div className="metric-value" style={{
              color: lossRatio < 65 ? '#10B981' : lossRatio < 85 ? '#F59E0B' : '#EF4444'
            }}>
              {lossRatio.toFixed(1)}%
            </div>
            <div className="metric-sub">Target: &lt;65%</div>
          </div>
          <div className="metric-dark">
            <div className="metric-label">Active Workers</div>
            <div className="metric-value">{health?.database?.workers || '—'}</div>
            <div className="metric-sub">Covered locally</div>
          </div>
          <div className="metric-dark">
            <div className="metric-label">Total Payout</div>
            <div className="metric-value">₹{totalPayout.toLocaleString()}</div>
            <div className="metric-sub">Premium pool: ₹{totalPremium.toLocaleString()}</div>
          </div>
          <div className="metric-dark">
            <div className="metric-label">Claims Pipeline</div>
            <div className="metric-value">{totalClaims}</div>
            <div className="metric-sub">
              <span style={{ color: '#34d399' }}>{paidClaims.length} paid</span>
              {' · '}
              <span style={{ color: '#fbbf24' }}>{flaggedClaims.length} flag</span>
              {' · '}
              <span style={{ color: '#f87171' }}>{rejectedClaims.length} rej</span>
            </div>
          </div>
          <div className="metric-dark">
            <div className="metric-label">LAE Saved</div>
            <div className="metric-value" style={{ color: '#10B981' }}>₹{laeSaved.toLocaleString()}</div>
            <div className="metric-sub">₹2,000 per automated claim</div>
          </div>
        </div>

        <div className="admin-grid">
          {/* Zone Risk Cards */}
          {['ZONE_A', 'ZONE_B', 'ZONE_C'].map(zone => {
            const d = cdiData[zone] || { cdi: 0, threshold: 0.6 };
            const isRed = d.cdi >= 0.6;
            const isAmber = d.cdi >= 0.4 && d.cdi < 0.6;

            return (
              <div
                key={zone}
                className={`zone-card-dark ${isRed ? 'triggered' : isAmber ? 'warning' : ''}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#f9fafb', fontSize: '0.95rem' }}>
                      {zoneNames[zone]}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{zone}</div>
                  </div>
                  <div style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '6px',
                    background: isRed ? 'rgba(239,68,68,0.12)' : isAmber ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)',
                    color: isRed ? '#f87171' : isAmber ? '#fbbf24' : '#34d399',
                    border: `1px solid ${isRed ? 'rgba(239,68,68,0.2)' : isAmber ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'}`,
                  }}>
                    {d.triggered ? '⚠️ TRIGGERED' : '✓ NORMAL'}
                  </div>
                </div>

                <div style={{
                  fontSize: '2rem',
                  fontWeight: 800,
                  color: isRed ? '#f87171' : isAmber ? '#fbbf24' : '#34d399',
                  marginBottom: '0.5rem',
                }}>
                  {(d.cdi * 100).toFixed(1)}
                  <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#6b7280', marginLeft: '0.25rem' }}>% CDI</span>
                </div>

                {/* Gauge bar */}
                <div style={{
                  height: '6px',
                  background: 'rgba(255,255,255,0.08)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(d.cdi * 100, 100)}%`,
                    background: isRed ? 'linear-gradient(90deg, #EF4444, #F87171)' :
                                isAmber ? 'linear-gradient(90deg, #F59E0B, #FBBF24)' :
                                'linear-gradient(90deg, #10B981, #34D399)',
                    borderRadius: '3px',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            );
          })}

          {/* Guidewire Integration Panel */}
          <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
            <div className="gw-panel-dark">
              <div className="gw-bg-icon">⚡</div>
              <h3 style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '1.5px',
                color: 'rgba(129,140,248,0.7)',
                marginBottom: '1rem',
              }}>Guidewire ClaimCenter Integration</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem', position: 'relative', zIndex: 1 }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(129,140,248,0.6)' }}>Paid Claims Ready</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{paidClaims.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(129,140,248,0.6)' }}>Total Payload</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>₹{totalPayout.toLocaleString()}</div>
                </div>
              </div>

              <div style={{
                padding: '0.75rem',
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.15)',
                borderRadius: '8px',
                marginBottom: '1rem',
                position: 'relative',
                zIndex: 1,
              }}>
                <div style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: 600, marginBottom: '0.25rem' }}>
                  💰 Estimated LAE Savings
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#34d399' }}>
                  ₹{laeSaved.toLocaleString()}
                </div>
              </div>

              <button
                className="btn-guidewire-dark"
                onClick={submitToGuidewire}
                disabled={paidClaims.length === 0}
              >
                ✅ Submit to Guidewire ClaimCenter
              </button>
            </div>
          </div>

          {/* Policy Configuration */}
          {config && (
            <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
              <h3>📋 Policy Configuration Rules</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Base Premium Rate */}
                <div>
                  <div className="admin-slider-row">
                    <label>Base Premium</label>
                    <input type="range"
                      min={config.base_premium_rate.min} max={config.base_premium_rate.max} step="1"
                      value={config.base_premium_rate.value}
                      onChange={e => setConfig(prev => ({ ...prev, base_premium_rate: { ...prev.base_premium_rate, value: parseFloat(e.target.value) } }))}
                      onMouseUp={e => updateConfig('base_premium_rate', e.target.value)}
                    />
                    <span className="val">₹{config.base_premium_rate.value}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#6b7280', paddingLeft: '110px' }}>
                    <span>₹{config.base_premium_rate.min}</span>
                    <span>₹{config.base_premium_rate.max}</span>
                  </div>
                </div>

                {/* Max Payout */}
                <div>
                  <div className="admin-slider-row">
                    <label>Max Payout</label>
                    <input type="range"
                      min={config.max_payout_per_event.min} max={config.max_payout_per_event.max} step="50"
                      value={config.max_payout_per_event.value}
                      onChange={e => setConfig(prev => ({ ...prev, max_payout_per_event: { ...prev.max_payout_per_event, value: parseFloat(e.target.value) } }))}
                      onMouseUp={e => updateConfig('max_payout_per_event', e.target.value)}
                    />
                    <span className="val">₹{config.max_payout_per_event.value}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#6b7280', paddingLeft: '110px' }}>
                    <span>₹{config.max_payout_per_event.min}</span>
                    <span>₹{config.max_payout_per_event.max}</span>
                  </div>
                </div>

                {/* CDI Trigger Threshold */}
                <div>
                  <div className="admin-slider-row">
                    <label>CDI Threshold</label>
                    <input type="range"
                      min={config.cdi_trigger_threshold.min} max={config.cdi_trigger_threshold.max} step="0.05"
                      value={config.cdi_trigger_threshold.value}
                      onChange={e => setConfig(prev => ({ ...prev, cdi_trigger_threshold: { ...prev.cdi_trigger_threshold, value: parseFloat(e.target.value) } }))}
                      onMouseUp={e => updateConfig('cdi_trigger_threshold', e.target.value)}
                    />
                    <span className="val">{config.cdi_trigger_threshold.value}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#6b7280', paddingLeft: '110px' }}>
                    <span>{config.cdi_trigger_threshold.min}</span>
                    <span>{config.cdi_trigger_threshold.max}</span>
                  </div>
                </div>

                {/* Weekly Coverage Cap */}
                {config.weekly_coverage_cap && (
                  <div>
                    <div className="admin-slider-row">
                      <label>Weekly Cap</label>
                      <input type="range"
                        min={config.weekly_coverage_cap.min} max={config.weekly_coverage_cap.max} step="100"
                        value={config.weekly_coverage_cap.value}
                        onChange={e => setConfig(prev => ({ ...prev, weekly_coverage_cap: { ...prev.weekly_coverage_cap, value: parseFloat(e.target.value) } }))}
                        onMouseUp={e => updateConfig('weekly_coverage_cap', e.target.value)}
                      />
                      <span className="val">₹{config.weekly_coverage_cap.value}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#6b7280', paddingLeft: '110px' }}>
                      <span>₹{config.weekly_coverage_cap.min}</span>
                      <span>₹{config.weekly_coverage_cap.max}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Covered Zones */}
              {config.covered_zones && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="admin-slider-row">
                    <label>Covered Zones</label>
                    <input
                      type="text"
                      style={{
                        flex: 1,
                        padding: '0.6rem 0.85rem',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 'var(--radius-sm)',
                        color: '#fff',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                      defaultValue={Array.isArray(config.covered_zones.value) ? JSON.stringify(config.covered_zones.value) : config.covered_zones.value}
                      onBlur={e => {
                        try {
                          const val = JSON.parse(e.target.value);
                          updateConfig('covered_zones', val);
                        } catch {
                          showToast('Invalid format. Must be a JSON array like ["ZONE_A"]', 'error');
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') e.target.blur();
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Claims Table */}
          <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
            <h3>
              <span className="live-dot"></span>
              Recent Claims Activity ({totalClaims})
            </h3>
            <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <table className="claims-table-dark">
                <thead>
                  <tr>
                    <th>Claim ID</th>
                    <th>Worker</th>
                    <th>Zone</th>
                    <th>CDI Risk</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Status</th>
                    <th>Razorpay Ext Txn</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.length > 0 ? claims.slice(0, 20).map(claim => (
                    <tr key={claim.id}>
                      <td className="mono">{claim.id}</td>
                      <td className="bold">{claim.workerName}</td>
                      <td>{claim.zone}</td>
                      <td style={{ fontWeight: 500 }}>{(claim.cdi || 0).toFixed(3)}</td>
                      <td className="amount">₹{(claim.payoutAmount || 0).toLocaleString()}</td>
                      <td>
                        <span className={`status-badge ${claim.status}`}>
                          {claim.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {claim.status === 'paid' && claim.payoutTxnId ? (
                          <span className="success-mono" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            💳 {claim.payoutTxnId.replace('txn_', '')}
                          </span>
                        ) : (
                          <span style={{ color: '#4b5563' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                        No claims processed yet. Use Admin Panel to trigger simulation scenarios.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Guidewire Success Modal — Dark Theme */}
      {gwModal && (
        <div className="modal-dark-overlay">
          <div className="modal-dark">
            <div className="modal-dark-header" style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
              }}>✅</div>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Guidewire Submission Complete</h2>
                <p style={{ fontSize: '0.8rem', opacity: 0.85, margin: '0.25rem 0 0' }}>
                  {gwModal.guidewire_response?.message}
                </p>
              </div>
            </div>

            <div className="modal-dark-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div className="gw-stat">
                  <div className="gw-stat-label">Guidewire Master Claim ID</div>
                  <div className="gw-stat-value">{gwModal.guidewire_response?.guidewire_claim_id}</div>
                </div>
                <div className="gw-stat" style={{ borderColor: 'rgba(16,185,129,0.2)' }}>
                  <div className="gw-stat-label" style={{ color: '#34d399' }}>LAE Saved</div>
                  <div className="gw-stat-value" style={{ color: '#34d399' }}>
                    ₹{gwModal.guidewire_response?.lae_saved?.toLocaleString()}
                  </div>
                </div>
              </div>

              <h4 style={{ fontWeight: 600, color: '#f9fafb', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Payload Sent:</h4>
              <pre>{JSON.stringify(gwModal.masterPayload, null, 2)}</pre>
            </div>

            <div className="modal-dark-footer">
              <button className="btn-modal-close" onClick={() => setGwModal(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

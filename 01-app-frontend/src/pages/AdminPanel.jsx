import { useState, useEffect, useRef, useCallback } from 'react';
import CounterfactualAnalysis from './CounterfactualAnalysis';

const ZONE_NAMES = { ZONE_A: 'Koramangala', ZONE_B: 'Whitefield', ZONE_C: 'Indiranagar', ALL: 'All Zones' };

const SCENARIO_PRESETS = [
  { key: 'clear',           label: 'Clear Skies',     emoji: '☀️', desc: 'Baseline — CDI resets to normal' },
  { key: 'monsoon',         label: 'Heavy Monsoon',    emoji: '🌧️', desc: 'Rain + demand collapse → CDI breach' },
  { key: 'heat',            label: 'Extreme Heat',     emoji: '🌡️', desc: 'Platform stress + heat advisory' },
  { key: 'platform_outage', label: 'Platform Outage',  emoji: '📴', desc: 'All platforms degraded, no weather' },
];

export default function AdminPanel({ token, onLogout, dataMode, onDataModeChange }) {
  const [mainTab, setMainTab] = useState('controls'); // 'controls' | 'counterfactual'
  const [health, setHealth] = useState(null);
  const [demoStatus, setDemoStatus] = useState({ isRunning: false, currentStep: 0, timeline: [] });
  const [workersList, setWorkersList] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [fraudWorkerLoading, setFraudWorkerLoading] = useState(false);
  const [simZone, setSimZone] = useState('ZONE_B');
  const [simScenario, setSimScenario] = useState('monsoon');
  const [simLoading, setSimLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [log, setLog] = useState([]);
  const wsRef = useRef(null);
  const logRef = useRef(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const isProduction = dataMode === 'real' || dataMode === 'REAL';

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const refreshHealth = useCallback(() => {
    fetch('/api/admin/health', { headers }).then(r => r.json()).then(d => {
      setHealth(d);
      if (d.demoSequencer) setDemoStatus(d.demoSequencer);
    }).catch(() => {});
  }, []);

  const refreshWorkers = useCallback(() => {
    fetch('/api/admin/workers-list', { headers }).then(r => r.json()).then(d => {
      setWorkersList(d.workers || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    refreshHealth();
    refreshWorkers();
    const iv = setInterval(refreshHealth, 8000);

    // WebSocket for log + status sync
    let ws, reconnectTimeout;
    const connectWs = () => {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:5000/ws';
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => { ws.send(JSON.stringify({ type: 'AUTH', payload: { token } })); };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          // Track demo progress
          if (msg.type === 'DEMO_PROGRESS') {
            setDemoStatus(prev => ({ ...prev, isRunning: true, currentStep: msg.payload?.step ?? prev.currentStep }));
          }
          if (msg.type === 'DEMO_STARTED') setDemoStatus(prev => ({ ...prev, isRunning: true, currentStep: 0 }));
          if (msg.type === 'DEMO_STOPPED') setDemoStatus(prev => ({ ...prev, isRunning: false }));
          if (msg.type === 'DATA_MODE_SWITCHED') onDataModeChange?.(msg.payload?.mode);
          if (msg.type === 'DEMO_RESET') { refreshHealth(); refreshWorkers(); }

          // Add to log (only important types)
          const logTypes = ['CDI_UPDATE','CLAIM_CREATED','PAYOUT_SENT','FRAUD_BLOCKED','DEMO_PROGRESS','DEMO_STARTED','DEMO_STOPPED','DEMO_RESET','ZONE_SIMULATED','FRAUD_DEMO_TRIGGERED','DATA_MODE_SWITCHED'];
          if (logTypes.includes(msg.type)) {
            setLog(prev => [{
              time: new Date().toLocaleTimeString('en-IN', { hour12: false }),
              type: msg.type,
              payload: msg.payload,
            }, ...prev].slice(0, 80));
          }
        } catch {}
      };
      ws.onclose = () => { reconnectTimeout = setTimeout(connectWs, 5000); };
      ws.onerror = () => ws.close();
    };
    connectWs();
    return () => { clearInterval(iv); clearTimeout(reconnectTimeout); if (ws) { ws.onclose = null; ws.close(); } };
  }, [dataMode]);

  // ── Actions ──

  const switchMode = async (mode) => {
    if (mode === 'real' && !window.confirm('Switch to PRODUCTION? All simulation controls will lock.')) return;
    await fetch('/api/admin/data-mode', { method: 'POST', headers, body: JSON.stringify({ mode }) });
    onDataModeChange?.(mode);
    refreshHealth();
    showToast(`Switched to ${mode === 'real' ? 'Production' : 'Demo'} mode`);
  };

  const startDemo = async () => {
    const res = await fetch('/api/admin/demo-seq/start', { method: 'POST', headers });
    const data = await res.json();
    if (res.ok) { setDemoStatus(data.status || {}); showToast('Demo sequence started'); }
    else showToast(data.error || 'Failed to start', 'error');
  };

  const stopDemo = async () => {
    await fetch('/api/admin/demo-seq/stop', { method: 'POST', headers });
    showToast('Demo stopped');
  };

  const resetState = async () => {
    if (!window.confirm('Clear all demo claims, events, and ghost workers?')) return;
    const res = await fetch('/api/admin/reset', { method: 'DELETE', headers });
    if (res.ok) { showToast('Demo state cleared'); refreshHealth(); refreshWorkers(); }
    else showToast('Reset failed', 'error');
  };

  const applyZoneScenario = async () => {
    setSimLoading(true);
    const res = await fetch('/api/admin/simulate-zone', {
      method: 'POST', headers,
      body: JSON.stringify({ zone: simZone, scenario: simScenario }),
    });
    setSimLoading(false);
    if (res.ok) showToast(`Applied ${simScenario} to ${ZONE_NAMES[simZone]}`);
    else showToast('Simulation failed', 'error');
  };

  const triggerFraudDemo = async () => {
    if (!selectedWorkerId) return showToast('Select a worker first', 'error');
    setFraudWorkerLoading(true);
    const res = await fetch('/api/admin/worker-fraud-demo', {
      method: 'POST', headers,
      body: JSON.stringify({ workerId: selectedWorkerId }),
    });
    const data = await res.json();
    setFraudWorkerLoading(false);
    if (res.ok) showToast(`Fraud scenario active for ${data.workerName}`);
    else showToast(data.error || 'Failed', 'error');
  };

  const forceCron = async () => {
    const res = await fetch('/api/admin/run-cron', { method: 'POST', headers });
    if (res.ok) showToast('CDI evaluation triggered');
    else showToast('Cron failed', 'error');
  };

  const selectedWorker = workersList.find(w => w.id === selectedWorkerId);
  const db = health?.database || {};

  // Log color by event type
  const logColor = (type) => {
    if (type?.includes('FRAUD') || type?.includes('BREACH')) return '#f87171';
    if (type?.includes('PAID') || type?.includes('CLAIM_CREATED') || type?.includes('PAYOUT')) return '#34d399';
    if (type?.includes('DEMO')) return '#818cf8';
    if (type?.includes('MODE')) return '#f59e0b';
    return '#6b7280';
  };

  return (
    <div style={{ background: '#0b0f1a', minHeight: '100vh', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.5px', color: '#fff' }}>
          Admin Control Room
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['controls', 'counterfactual'].map(tab => (
            <button key={tab} onClick={() => setMainTab(tab)} style={{
              fontSize: '0.72rem', padding: '0.35rem 0.85rem', borderRadius: '6px',
              background: mainTab === tab ? 'rgba(99,102,241,0.15)' : 'transparent',
              border: mainTab === tab ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(255,255,255,0.08)',
              color: mainTab === tab ? '#a5b4fc' : '#6b7280',
              cursor: 'pointer', fontWeight: mainTab === tab ? 700 : 400, textTransform: 'capitalize',
            }}>
              {tab === 'controls' ? '⚙️ Controls' : '📊 Counterfactual'}
            </button>
          ))}
          {onLogout && (
            <button onClick={onLogout} style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af', padding: '0.35rem 0.75rem', borderRadius: '6px', cursor: 'pointer' }}>
              Logout
            </button>
          )}
        </div>
      </div>

      {/* ── Counterfactual Tab ── */}
      {mainTab === 'counterfactual' && <CounterfactualAnalysis token={token} />}

      {mainTab === 'controls' && (
        <>
          {/* ── Section 1: Mode Toggle ── */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Operational Mode
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                onClick={() => switchMode('demo')}
                style={{
                  flex: 1, padding: '0.7rem 1rem', borderRadius: '10px', cursor: 'pointer',
                  background: !isProduction ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.03)',
                  border: !isProduction ? '2px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  color: !isProduction ? '#f59e0b' : '#6b7280',
                  fontWeight: 700, fontSize: '0.82rem',
                  transition: 'all 0.2s',
                }}>
                <div>🧪 Demo Mode</div>
                <div style={{ fontSize: '0.62rem', fontWeight: 400, marginTop: '0.2rem', opacity: 0.7 }}>Simulation active</div>
              </button>
              <button
                onClick={() => switchMode('real')}
                style={{
                  flex: 1, padding: '0.7rem 1rem', borderRadius: '10px', cursor: 'pointer',
                  background: isProduction ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
                  border: isProduction ? '2px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  color: isProduction ? '#10b981' : '#6b7280',
                  fontWeight: 700, fontSize: '0.82rem',
                  transition: 'all 0.2s',
                }}>
                <div>🏭 Production</div>
                <div style={{ fontSize: '0.62rem', fontWeight: 400, marginTop: '0.2rem', opacity: 0.7 }}>Real monitoring</div>
              </button>
            </div>

            {/* System stats mini-row */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.72rem', color: '#6b7280' }}>
              {[
                ['Workers', db.workers ?? '—'],
                ['Claims', db.claims ?? '—'],
                ['Paid', db.paidClaims ?? '—'],
                ['Fraud Blocked', db.fraudBlocked ?? '—'],
                ['Total Payout', `₹${(db.totalPayout || 0).toFixed(0)}`],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <span style={{ fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{l}</span>
                  <span style={{ color: '#e5e7eb', fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Production lock overlay sections ── */}
          {isProduction && (
            <div style={{
              background: 'rgba(239,68,68,0.04)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '12px',
              padding: '1.25rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f87171', marginBottom: '0.4rem' }}>
                Production Mode — All Controls Locked
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                Synthetic injections are strictly blocked to protect production data integrity.
                Switch to Demo Mode to enable simulation.
              </div>
            </div>
          )}

          {!isProduction && (
            <>
              {/* ── Section 2: Demo Orchestrator ── */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  Demo Orchestrator
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '0.85rem' }}>
                  <button
                    onClick={startDemo}
                    disabled={demoStatus.isRunning}
                    style={{
                      padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: demoStatus.isRunning ? 'not-allowed' : 'pointer',
                      background: demoStatus.isRunning ? '#1f2937' : 'linear-gradient(135deg, #10b981, #059669)',
                      color: demoStatus.isRunning ? '#6b7280' : '#fff',
                      fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.5px',
                      boxShadow: demoStatus.isRunning ? 'none' : '0 4px 20px rgba(16,185,129,0.3)',
                    }}>
                    ▶ START DEMO
                    {!demoStatus.isRunning && (
                      <div style={{ fontSize: '0.58rem', fontWeight: 400, marginTop: '0.2rem', opacity: 0.8 }}>Random zone & severity</div>
                    )}
                  </button>
                  <button
                    onClick={stopDemo}
                    disabled={!demoStatus.isRunning}
                    style={{
                      padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: !demoStatus.isRunning ? 'not-allowed' : 'pointer',
                      background: !demoStatus.isRunning ? '#1f2937' : 'rgba(239,68,68,0.15)',
                      border: !demoStatus.isRunning ? '1px solid transparent' : '1px solid rgba(239,68,68,0.3)',
                      color: !demoStatus.isRunning ? '#6b7280' : '#f87171',
                      fontWeight: 700, fontSize: '0.82rem',
                    }}>
                    ⏹ STOP
                  </button>
                  <button
                    onClick={resetState}
                    disabled={demoStatus.isRunning}
                    style={{
                      padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)',
                      background: 'transparent', color: demoStatus.isRunning ? '#374151' : '#9ca3af',
                      fontWeight: 600, fontSize: '0.82rem', cursor: demoStatus.isRunning ? 'not-allowed' : 'pointer',
                    }}>
                    🔄 RESET
                  </button>
                </div>

                {/* Timeline */}
                {demoStatus.isRunning && demoStatus.timeline?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {demoStatus.timeline.map((step, i) => {
                      const isPast = i < demoStatus.currentStep;
                      const isCurrent = i === demoStatus.currentStep;
                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.6rem', borderRadius: '6px',
                          background: isCurrent ? 'rgba(99,102,241,0.12)' : 'transparent',
                          border: isCurrent ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                          opacity: isPast ? 0.5 : 1,
                          transition: 'all 0.3s',
                        }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem',
                            background: isPast ? '#10b981' : isCurrent ? '#6366f1' : '#1f2937',
                            animation: isCurrent ? 'stepPulse 1.5s infinite' : 'none',
                          }}>
                            {isPast ? '✓' : step.emoji || (i + 1)}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: isCurrent ? '#e5e7eb' : '#6b7280', fontWeight: isCurrent ? 600 : 400 }}>
                            {step.name}
                          </span>
                          <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: '#374151', fontFamily: 'monospace' }}>
                            T+{Math.floor((step.timeMs || 0) / 1000)}s
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Section 3: Zone Simulation ── */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  Zone Simulation
                </div>

                {/* Zone selector */}
                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  {['ZONE_A', 'ZONE_B', 'ZONE_C', 'ALL'].map(z => (
                    <button key={z} onClick={() => setSimZone(z)} style={{
                      padding: '0.35rem 0.7rem', borderRadius: '6px', fontSize: '0.72rem',
                      background: simZone === z ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                      border: simZone === z ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(255,255,255,0.08)',
                      color: simZone === z ? '#a5b4fc' : '#9ca3af',
                      cursor: 'pointer', fontWeight: simZone === z ? 700 : 400,
                    }}>
                      {ZONE_NAMES[z] || z}
                    </button>
                  ))}
                </div>

                {/* Scenario presets */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {SCENARIO_PRESETS.map(s => (
                    <button key={s.key} onClick={() => setSimScenario(s.key)} style={{
                      padding: '0.6rem 0.75rem', borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                      background: simScenario === s.key ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.03)',
                      border: simScenario === s.key ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(255,255,255,0.07)',
                    }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: simScenario === s.key ? 700 : 400, color: simScenario === s.key ? '#fbbf24' : '#e5e7eb' }}>
                        {s.emoji} {s.label}
                      </div>
                      <div style={{ fontSize: '0.62rem', color: '#6b7280', marginTop: '0.1rem' }}>{s.desc}</div>
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={applyZoneScenario}
                    disabled={simLoading}
                    style={{
                      flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                      background: simLoading ? '#1f2937' : 'rgba(245,158,11,0.15)',
                      border: '1px solid rgba(245,158,11,0.25)',
                      color: simLoading ? '#6b7280' : '#fbbf24',
                      fontWeight: 700, fontSize: '0.82rem',
                    }}>
                    {simLoading ? 'Applying…' : `⚡ Apply to ${ZONE_NAMES[simZone]}`}
                  </button>
                  <button
                    onClick={forceCron}
                    style={{
                      padding: '0.6rem 0.9rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.04)', color: '#9ca3af',
                      fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer',
                    }}
                    title="Force CDI evaluation now"
                  >
                    ⏩ CDI Now
                  </button>
                </div>
              </div>

              {/* ── Section 4: Fraud Lab ── */}
              <div style={{
                background: 'rgba(239,68,68,0.04)',
                border: '1px solid rgba(239,68,68,0.15)',
                borderRadius: '12px',
                padding: '1rem 1.25rem',
              }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(239,68,68,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '0.65rem' }}>
                  🎯 Fraud Lab — Targeted Demo
                </div>
                <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.75rem', lineHeight: 1.6 }}>
                  Pick a specific worker, mark them as fraudulent, trigger a storm in their zone.
                  Their claim gets rejected. Clean neighbours in the same zone get approved.
                </div>

                {/* Worker dropdown */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <select
                    value={selectedWorkerId}
                    onChange={e => setSelectedWorkerId(e.target.value)}
                    style={{
                      width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px',
                      background: '#111827', border: '1px solid rgba(255,255,255,0.12)',
                      color: selectedWorkerId ? '#e5e7eb' : '#6b7280',
                      fontSize: '0.78rem', outline: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="">— Select a worker to flag —</option>
                    {['ZONE_A', 'ZONE_B', 'ZONE_C'].map(zone => (
                      <optgroup key={zone} label={ZONE_NAMES[zone]}>
                        {workersList.filter(w => w.zone === zone).map(w => (
                          <option key={w.id} value={w.id}>
                            {w.name} · {w.platform}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Selected worker card */}
                {selectedWorker && (
                  <div style={{
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: '8px',
                    padding: '0.6rem 0.75rem',
                    marginBottom: '0.75rem',
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'center',
                  }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                      👤
                    </div>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f87171' }}>{selectedWorker.name}</div>
                      <div style={{ fontSize: '0.65rem', color: '#6b7280' }}>{selectedWorker.zone} · {selectedWorker.platform}</div>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: '0.62rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: '#f87171', fontWeight: 700 }}>
                      WILL BE FLAGGED
                    </div>
                  </div>
                )}

                <button
                  onClick={triggerFraudDemo}
                  disabled={!selectedWorkerId || fraudWorkerLoading}
                  style={{
                    width: '100%', padding: '0.7rem', borderRadius: '10px', border: 'none', cursor: !selectedWorkerId ? 'not-allowed' : 'pointer',
                    background: !selectedWorkerId ? '#1f2937' : 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: !selectedWorkerId ? '#6b7280' : '#fff',
                    fontWeight: 800, fontSize: '0.85rem',
                    boxShadow: selectedWorkerId ? '0 4px 20px rgba(239,68,68,0.25)' : 'none',
                  }}>
                  {fraudWorkerLoading ? 'Activating scenario…' : '🎯 Trigger Fraud Scenario'}
                </button>

                {!selectedWorkerId && (
                  <div style={{ fontSize: '0.62rem', color: '#4b5563', textAlign: 'center', marginTop: '0.5rem' }}>
                    Select a worker above to enable this
                  </div>
                )}
              </div>

              {/* ── Section 5: Event Log ── */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                  System Event Stream
                </div>
                <div ref={logRef} style={{ maxHeight: '200px', overflowY: 'auto', padding: '0.25rem 0', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem' }}>
                  {log.length === 0 ? (
                    <div style={{ padding: '1rem', color: '#374151', textAlign: 'center' }}>Waiting for events…</div>
                  ) : (
                    log.map((entry, i) => (
                      <div key={i} style={{
                        padding: '0.25rem 1rem',
                        display: 'flex',
                        gap: '0.6rem',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                      }}>
                        <span style={{ color: '#374151', flexShrink: 0, fontSize: '0.6rem' }}>{entry.time}</span>
                        <span style={{ color: logColor(entry.type), fontWeight: 600 }}>{entry.type}</span>
                        {entry.payload?.zone && <span style={{ color: '#6b7280' }}>{entry.payload.zone}</span>}
                        {entry.payload?.workerName && <span style={{ color: '#9ca3af' }}>{entry.payload.workerName}</span>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999,
          background: toast.type === 'error' ? '#7f1d1d' : '#064e3b',
          border: `1px solid ${toast.type === 'error' ? '#ef4444' : '#10b981'}`,
          color: '#fff', padding: '0.75rem 1.25rem', borderRadius: '10px', fontSize: '0.82rem',
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes stepPulse { 0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0.4)} 50%{box-shadow:0 0 0 8px rgba(99,102,241,0)} }
      `}</style>
    </div>
  );
}

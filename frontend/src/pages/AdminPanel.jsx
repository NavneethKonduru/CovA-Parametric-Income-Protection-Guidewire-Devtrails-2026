import { useState, useEffect, useRef } from 'react';
import { API_BASE, getWsUrl } from '../config';

const WEATHER_PRESETS = [
  { key: 'clear', label: 'Clear', severity: 0.05 },
  { key: 'light_rain', label: 'Light Rain', severity: 0.20 },
  { key: 'moderate_rain', label: 'Moderate Rain', severity: 0.50 },
  { key: 'heavy_rain', label: 'Heavy Rain', severity: 0.85 },
  { key: 'extreme_heat', label: 'Extreme Heat', severity: 0.80 },
  { key: 'cyclone', label: 'Cyclone', severity: 1.00 },
];

const DEMAND_LEVELS = [
  { key: 'normal', label: 'Normal', score: 0.10 },
  { key: 'moderate', label: 'Moderate Drop', score: 0.50 },
  { key: 'severe', label: 'Severe Drop', score: 0.75 },
  { key: 'collapse', label: 'Demand Collapse', score: 0.90 },
  { key: 'outage', label: 'Platform Outage', score: 1.00 },
];

const PLATFORM_STATUSES = ['normal', 'degraded', 'suspended', 'outage'];
const FRAUD_OPTIONS = [
  { count: 0, label: 'None' },
  { count: 5, label: '5 Ghost Workers' },
  { count: 10, label: '10 Ghost Workers' },
  { count: 15, label: '15 Ghost Workers' },
];

const QUICK_PRESETS = [
  { key: 'WHITEFIELD_MONSOON', label: '🌧️ Whitefield Monsoon (Zone B)', fills: { zone: 'ZONE_B', weather: 'heavy_rain', demandDrop: 'severe', platformStatus: 'degraded', fraudCount: 0 } },
  { key: 'FRAUD_ATTACK', label: '👻 Fraud Attack (15 Ghosts)', fills: { zone: 'ZONE_B', weather: 'clear', demandDrop: 'normal', platformStatus: 'normal', fraudCount: 15 } },
  { key: 'PLATFORM_OUTAGE', label: '📱 Platform Outage (Zepto)', fills: { zone: 'ZONE_B', weather: 'clear', demandDrop: 'outage', platformStatus: 'outage', fraudCount: 0 } },
  { key: 'MIXED_ATTACK', label: '⚡ Mixed: Monsoon + Fraud', fills: { zone: 'ZONE_B', weather: 'heavy_rain', demandDrop: 'moderate', platformStatus: 'degraded', fraudCount: 10 } },
  { key: 'SECTION_144', label: '🚨 Section 144 Curfew (All Zones)', fills: { zone: 'ALL', weather: 'clear', demandDrop: 'collapse', platformStatus: 'suspended', fraudCount: 0 } },
];

const WORKER_MODES = [
  { key: 'auto_genuine', label: '🤖 Auto-Genuine', desc: '(environment-correlated signals, normal variance)' },
  { key: 'auto_fraud', label: '🚨 Auto-Fraud', desc: '(impossible speeds, zero variance, pattern repeating)' },
  { key: 'manual', label: '✋ Manual', desc: '(use Signal tab values)' },
  { key: 'passive', label: '📡 Passive', desc: '(no signal — worker offline)' }
];

export default function AdminPanel({ token, onLogout }) {
  const [weights, setWeights] = useState({ weather: 0.4, demand: 0.35, peer: 0.25 });
  const [cdiConfig, setCdiConfig] = useState({ strategy: 'weighted_sum', decorrelate: false });
  const [health, setHealth] = useState(null);
  const [log, setLog] = useState([]);
  const [toast, setToast] = useState(null);
  const [simLoading, setSimLoading] = useState(false);
  const wsRef = useRef(null);

  // Custom simulation builder state
  const [customSim, setCustomSim] = useState({
    zone: 'ZONE_B',
    weather: 'clear',
    demandDrop: 'normal',
    platformStatus: 'normal',
    fraudCount: 0,
  });

  // External Factors state
  const [extFactors, setExtFactors] = useState({
    zones: {
      ZONE_A: { weather: 'clear', demand: 100 },
      ZONE_B: { weather: 'clear', demand: 100 },
      ZONE_C: { weather: 'clear', demand: 100 }
    },
    platforms: {
      Zepto: 'normal',
      Blinkit: 'normal',
      Swiggy: 'normal'
    },
    civic: { zone: 'ZONE_A', eventType: 'None' }
  });

  // Worker Control state
  const [workersList, setWorkersList] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [workerTab, setWorkerTab] = useState('Signal');
  const [workerSignal, setWorkerSignal] = useState({ lat: 12.9716, lng: 77.5946, variance: 5.0, velocity: 0, isActive: true });
  const [workerMode, setWorkerMode] = useState('auto_genuine');
  const [workerStatus, setWorkerStatus] = useState(null);
  const [workerClaims, setWorkerClaims] = useState([]);
  const [signalLog, setSignalLog] = useState([]);

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const fetchWorkers = () => {
    fetch(`${API_BASE}/api/workers`, { headers })
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setWorkersList(d);
        else if (d.workers) setWorkersList(d.workers);
        else if (d.data) setWorkersList(d.data);
      })
      .catch(() => {});
  };

  const fetchHealth = () => {
    fetch(`${API_BASE}/api/admin/health`, { headers })
      .then(r => r.json())
      .then(d => d.status === 'healthy' && setHealth(d))
      .catch(() => {});
  };

  useEffect(() => {
    // Fetch initial data
    fetch(`${API_BASE}/api/admin/cdi-weights`, { headers }).then(r => r.json()).then(d => d.weights && setWeights(d.weights)).catch(() => {});
    fetch(`${API_BASE}/api/admin/cdi-config`, { headers }).then(r => r.json()).then(d => d.strategy && setCdiConfig({ strategy: d.strategy, decorrelate: d.decorrelate })).catch(() => {});
    fetchHealth();
    fetchWorkers();

    // WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const time = new Date().toLocaleTimeString();

        if (msg.type === 'CDI_CONFIG_UPDATED') {
          setCdiConfig({ strategy: msg.payload.strategy, decorrelate: msg.payload.decorrelate });
        } else if (['WORKER_SIGNAL_UPDATE', 'WORKER_MODE_CHANGED', 'WORKER_REGISTERED'].includes(msg.type)) {
          setSignalLog(prev => [{ type: msg.type, time, ...msg.payload }, ...prev].slice(0, 20));
          if (msg.type === 'WORKER_REGISTERED') fetchWorkers();
        } else {
          setLog(prev => [{ type: msg.type, time, ...msg.payload }, ...prev].slice(0, 50));
          if (['CLAIM_CREATED', 'DEMO_RESET', 'PAYOUT_SENT'].includes(msg.type)) {
            fetchHealth();
          }
        }
      } catch (e) { }
    };
    return () => ws.close();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (selectedWorkerId) {
      // Fetch signal state
      fetch(`${API_BASE}/api/workers/${selectedWorkerId}/signal`, { headers })
        .then(r => r.json())
        .then(data => {
           if (data.signal) {
             setWorkerSignal({
               lat: data.signal.lat || 12.9716,
               lng: data.signal.lng || 77.5946,
               variance: data.signal.variance ?? 5.0,
               velocity: data.signal.velocity ?? 0,
               isActive: data.signal.isActive ?? true
             });
             setWorkerMode(data.mode || 'auto_genuine');
             setWorkerStatus(data.worker || null);
           }
        }).catch(() => {});
      
      // Fetch claims matching this worker
      fetch(`${API_BASE}/api/claims?workerId=${selectedWorkerId}`, { headers })
        .then(r => r.json())
        .then(data => {
           if (Array.isArray(data)) setWorkerClaims(data.slice(0, 5));
           else if (data.data) setWorkerClaims(data.data.slice(0, 5));
           else setWorkerClaims([]);
        }).catch(() => {});
    } else {
      setWorkerStatus(null);
      setWorkerClaims([]);
    }
    // eslint-disable-next-line
  }, [selectedWorkerId]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const updateWeights = async () => {
    const sum = weights.weather + weights.demand + weights.peer;
    if (Math.abs(sum - 1.0) > 0.01) {
      showToast(`Weights must sum to 1.0 (got ${sum.toFixed(2)})`, 'error');
      return;
    }
    const res = await fetch(`${API_BASE}/api/admin/cdi-weights`, { method: 'PATCH', headers, body: JSON.stringify(weights) });
    const data = await safeFetchJson(res);
    if (res.ok) showToast('CDI weights updated');
    else showToast(data.error || 'Failed to update weights', 'error');
  };

  const updateCdiConfig = async () => {
    const res = await fetch(`${API_BASE}/api/admin/cdi-config`, { method: 'POST', headers, body: JSON.stringify(cdiConfig) });
    const data = await safeFetchJson(res);
    if (res.ok) showToast('CDI Config updated');
    else showToast(data.error || 'Failed to update config', 'error');
  };

  const simulate = async (scenario) => {
    setSimLoading(true);
    const res = await fetch(`${API_BASE}/api/demo/simulate`, { method: 'POST', headers, body: JSON.stringify({ scenario }) });
    const data = await safeFetchJson(res);
    if (res.ok) showToast(`Simulation: ${scenario}`);
    else showToast(data.error || 'Simulation failed', 'error');
    setSimLoading(false);
  };

  const runCustomSim = async () => {
    setSimLoading(true);
    const weatherPreset = WEATHER_PRESETS.find(w => w.key === customSim.weather);
    const demandLevel = DEMAND_LEVELS.find(d => d.key === customSim.demandDrop);

    const body = {
      zone: customSim.zone,
      weather: { preset: customSim.weather },
      demand: { demand_score: demandLevel?.score || 0.1, platform_status: customSim.platformStatus },
      fraud: { ghostCount: customSim.fraudCount },
    };

    try {
      const res = await fetch(`${API_BASE}/api/demo/simulate-custom`, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) {
        showToast(`Custom simulation executed — ${customSim.zone} · ${weatherPreset?.label} · ${demandLevel?.label}`);
      } else {
        showToast(data.error || 'Simulation failed', 'error');
      }
    } catch (err) {
      showToast('Network error: ' + err.message, 'error');
    }
    setSimLoading(false);
  };

  const safeFetchJson = async (response) => {
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('application/json')) return response.json();
    const text = await response.text();
    console.error('[AdminPanel] Non-JSON response:', response.status, text.substring(0, 200));
    throw new Error(`Server error (${response.status})`);
  };

  const applyExtFactors = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/external-factors`, { method: 'POST', headers, body: JSON.stringify(extFactors) });
      const data = await safeFetchJson(res);
      if (res.ok) showToast('External factors applied');
      else showToast(data.error || 'Failed to apply factors', 'error');
    } catch (err) {
      showToast('Network error: ' + err.message, 'error');
    }
  };

  const applySignalOverride = async () => {
    if (!selectedWorkerId) return;
    try {
      const res = await fetch(`${API_BASE}/api/workers/${selectedWorkerId}/signal`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(workerSignal)
      });
      if (res.ok) showToast('Signal override applied');
      else {
        const data = await res.json();
        showToast(data.error || 'Failed to apply signal', 'error');
      }
    } catch (err) {
      showToast('Network error: ' + err.message, 'error');
    }
  };

  const applyModeOverride = async () => {
    if (!selectedWorkerId) return;
    try {
      const res = await fetch(`${API_BASE}/api/workers/${selectedWorkerId}/mode`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ mode: workerMode })
      });
      if (res.ok) showToast('Mode updated');
      else {
        const data = await res.json();
        showToast(data.error || 'Failed to update mode', 'error');
      }
    } catch (err) {
      showToast('Network error: ' + err.message, 'error');
    }
  };

  const applyPreset = (presetKey) => {
    const preset = QUICK_PRESETS.find(p => p.key === presetKey);
    if (preset) setCustomSim(preset.fills);
  };

  const resetDemo = async () => {
    const res = await fetch(`${API_BASE}/api/demo/reset`, { method: 'DELETE', headers });
    if (res.ok) {
      showToast('Demo state reset');
      fetchHealth();
      fetchWorkers();
    }
  };

  const weightSum = weights ? (weights.weather + weights.demand + weights.peer).toFixed(2) : "0.00";

  return (
    <div className="admin-layout">
      <div className="admin-header">
        <h1>⚙️ CovA Admin Panel</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="live-dot"></span>
          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>System Active</span>
          <button className="btn-logout" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="admin-content">
        <div className="admin-grid">
          {/* CDI Weights & Strategy */}
          <div className="admin-panel">
            <h3>CDI Configuration</h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <strong style={{ fontSize: '0.85rem' }}>Weights</strong>
              {weights && ['weather', 'demand', 'peer'].map(key => (
                <div key={key} className="admin-slider-row">
                  <label>{key}</label>
                  <input
                    type="range" min="0" max="1" step="0.05"
                    value={weights[key]}
                    onChange={e => setWeights(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                  />
                  <span className="val">{weights[key]?.toFixed(2)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: weightSum === '1.00' ? 'var(--cova-accent)' : 'var(--cova-danger)' }}>
                  Sum: {weightSum}
                </span>
                <button className="btn-sim" style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={updateWeights}>
                  Apply Weights
                </button>
              </div>
            </div>

            <div className="sim-divider"></div>
            
            <div>
              <strong style={{ fontSize: '0.85rem' }}>Strategy overrides</strong>
              <div className="sim-builder-row" style={{ marginTop: '0.5rem' }}>
                <label>Trigger Strategy</label>
                <select
                  value={cdiConfig.strategy}
                  onChange={e => setCdiConfig(prev => ({ ...prev, strategy: e.target.value }))}
                >
                  <option value="weighted_sum">Weighted Sum</option>
                  <option value="any_dominant">Any Dominant</option>
                  <option value="min_two_factors">Min Two Factors</option>
                </select>
              </div>
              <div className="sim-builder-row">
                <label>Signal Decorrelation</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input 
                    type="checkbox" 
                    checked={cdiConfig.decorrelate} 
                    onChange={e => setCdiConfig(prev => ({ ...prev, decorrelate: e.target.checked }))} 
                  />
                  <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Enable</span>
                </div>
              </div>
              <button className="btn-sim" style={{ width: '100%', marginTop: '0.5rem' }} onClick={updateCdiConfig}>
                Update Strategy
              </button>
            </div>
          </div>

          {/* System Health */}
          <div className="admin-panel">
            <h3>System Health</h3>
            {health && health.database ? (
              <div style={{ fontSize: '0.85rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>Workers: <strong>{health.database.workers}</strong></div>
                  <div>Claims: <strong>{health.database.claims}</strong></div>
                  <div>Paid: <strong>{health.database.paidClaims}</strong></div>
                  <div>Total Payout: <strong>₹{health.database.totalPayout.toFixed(0)}</strong></div>
                  <div>Events: <strong>{health.database.events}</strong></div>
                  <div>Uptime: <strong>{(health.uptime / 60).toFixed(1)}m</strong></div>
                </div>
              </div>
            ) : (
              <span style={{ color: '#9ca3af' }}>Loading...</span>
            )}
          </div>

          {/* ========== SIMULATION CONTROLS ========== */}
          <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
            <h3>🎮 Simulation Controls</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.5rem', fontWeight: 500 }}>
                  📋 Quick Preset — auto-fills builder
                </div>
                <div className="sim-builder-row">
                  <label>Preset</label>
                  <select value="" onChange={(e) => e.target.value && applyPreset(e.target.value)}>
                    <option value="">— Select a preset —</option>
                    {QUICK_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.5rem', fontWeight: 500 }}>
                  🔧 Custom Scenario Builder
                </div>
                <div className="sim-builder-row">
                  <label>Target Zone</label>
                  <select value={customSim.zone} onChange={e => setCustomSim(prev => ({ ...prev, zone: e.target.value }))}>
                    <option value="ZONE_A">Zone A — Koramangala</option>
                    <option value="ZONE_B">Zone B — Whitefield</option>
                    <option value="ZONE_C">Zone C — Indiranagar</option>
                    <option value="ALL">All Zones</option>
                  </select>
                </div>
                <div className="sim-builder-row">
                  <label>Weather</label>
                  <select value={customSim.weather} onChange={e => setCustomSim(prev => ({ ...prev, weather: e.target.value }))}>
                    {WEATHER_PRESETS.map(w => <option key={w.key} value={w.key}>{w.label} (severity: {w.severity.toFixed(2)})</option>)}
                  </select>
                </div>
                <div className="sim-builder-row">
                  <label>Demand Drop</label>
                  <select value={customSim.demandDrop} onChange={e => setCustomSim(prev => ({ ...prev, demandDrop: e.target.value }))}>
                    {DEMAND_LEVELS.map(d => <option key={d.key} value={d.key}>{d.label} (score: {d.score.toFixed(2)})</option>)}
                  </select>
                </div>
                <div className="sim-builder-row">
                  <label>Platform</label>
                  <select value={customSim.platformStatus} onChange={e => setCustomSim(prev => ({ ...prev, platformStatus: e.target.value }))}>
                    {PLATFORM_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                <div className="sim-builder-row">
                  <label>Fraud</label>
                  <select value={customSim.fraudCount} onChange={e => setCustomSim(prev => ({ ...prev, fraudCount: parseInt(e.target.value) }))}>
                    {FRAUD_OPTIONS.map(f => <option key={f.count} value={f.count}>{f.label}</option>)}
                  </select>
                </div>
                
                <button className="btn-run-sim" onClick={runCustomSim} disabled={simLoading} style={{ marginTop: '0.5rem' }}>
                  {simLoading ? '⏳ Running...' : '▶ Run Custom Simulation'}
                </button>
              </div>
            </div>

            <div className="sim-divider"></div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-sim" style={{ flex: 1, background: 'rgba(16,185,129,0.12)', color: '#34d399', borderColor: 'rgba(16,185,129,0.2)' }} onClick={() => simulate('CLEAR_ALL')} disabled={simLoading}>
                ☀️ Clear All Scenarios
              </button>
              <button className="btn-danger" style={{ flex: 1 }} onClick={resetDemo} disabled={simLoading}>
                🗑️ Reset Demo State
              </button>
            </div>
          </div>

          {/* ========== EXTERNAL FACTORS PANEL ========== */}
          <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
            <h3>🌎 External Environment Factors</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem' }}>
              {['ZONE_A', 'ZONE_B', 'ZONE_C'].map(z => (
                <div key={z} style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>{z}</h4>
                  <div className="sim-builder-row">
                    <label>Weather</label>
                    <select 
                      value={extFactors.zones[z]?.weather || 'clear'} 
                      onChange={e => setExtFactors(prev => ({ ...prev, zones: { ...prev.zones, [z]: { ...prev.zones[z], weather: e.target.value } } }))}
                    >
                      <option value="clear">Clear</option>
                      <option value="light_rain">Light Rain</option>
                      <option value="heavy_rain">Heavy Rain</option>
                      <option value="cyclone">Cyclone</option>
                      <option value="extreme_heat">Extreme Heat</option>
                    </select>
                  </div>
                  <div className="admin-slider-row" style={{ marginTop: '0.5rem' }}>
                    <label>Demand</label>
                    <input 
                      type="range" min="0" max="100" step="5"
                      value={extFactors.zones[z]?.demand || 100}
                      onChange={e => setExtFactors(prev => ({ ...prev, zones: { ...prev.zones, [z]: { ...prev.zones[z], demand: parseInt(e.target.value) } } }))}
                    />
                    <span className="val">{extFactors.zones[z]?.demand || 100}%</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>Platforms</h4>
                {['Zepto', 'Blinkit', 'Swiggy'].map(p => (
                  <div key={p} className="sim-builder-row" style={{ marginBottom: '0.5rem' }}>
                    <label>{p}</label>
                    <select 
                      value={extFactors.platforms[p]} 
                      onChange={e => setExtFactors(prev => ({ ...prev, platforms: { ...prev.platforms, [p]: e.target.value } }))}
                    >
                      <option value="normal">Normal</option>
                      <option value="degraded">Degraded</option>
                      <option value="outage">Outage</option>
                    </select>
                  </div>
                ))}
              </div>

              <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>Civic Event</h4>
                <div className="sim-builder-row" style={{ marginBottom: '0.5rem' }}>
                  <label>Event Zone</label>
                  <select value={extFactors.civic.zone} onChange={e => setExtFactors(prev => ({ ...prev, civic: { ...prev.civic, zone: e.target.value } }))}>
                    <option value="ALL">All Zones</option>
                    <option value="ZONE_A">Zone A</option>
                    <option value="ZONE_B">Zone B</option>
                    <option value="ZONE_C">Zone C</option>
                  </select>
                </div>
                <div className="sim-builder-row">
                  <label>Event Type</label>
                  <select value={extFactors.civic.eventType} onChange={e => setExtFactors(prev => ({ ...prev, civic: { ...prev.civic, eventType: e.target.value } }))}>
                    <option value="None">None</option>
                    <option value="Section144">Section 144</option>
                    <option value="Strike">Transport Strike</option>
                    <option value="Festival">Major Festival</option>
                  </select>
                </div>
              </div>
            </div>
            <button className="btn-sim" style={{ width: '100%', marginTop: '1rem' }} onClick={applyExtFactors}>
              Apply External Factors
            </button>
          </div>

          {/* ========== TARGET WORKER CONTROL ========== */}
          <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
            <h3>🎯 Worker Control</h3>

            <div className="sim-builder-row" style={{ marginBottom: '1rem' }}>
              <label>Select Worker</label>
              <select value={selectedWorkerId} onChange={e => setSelectedWorkerId(e.target.value)}>
                <option value="">— Select Worker to Control —</option>
                {workersList.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} — {w.zone} — {w.platform} {w.isSimulated ? '(sim)' : '(real)'}
                  </option>
                ))}
              </select>
            </div>

            {selectedWorkerId && (
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  {['Signal', 'Mode', 'Status'].map(tab => (
                    <button 
                      key={tab}
                      style={{ flex: 1, padding: '0.75rem', background: workerTab === tab ? 'rgba(99,102,241,0.1)' : 'transparent', border: 'none', color: workerTab === tab ? '#818cf8' : '#9ca3af', fontWeight: workerTab === tab ? 600 : 400, cursor: 'pointer', borderBottom: workerTab === tab ? '2px solid #818cf8' : '2px solid transparent' }}
                      onClick={() => setWorkerTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div style={{ padding: '1rem' }}>
                  {workerTab === 'Signal' && (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="sim-builder-row">
                          <label>Latitude</label>
                          <input type="number" step="0.0001" value={workerSignal.lat} onChange={e => setWorkerSignal(p => ({ ...p, lat: parseFloat(e.target.value) }))} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.3rem', borderRadius: '4px' }} />
                        </div>
                        <div className="sim-builder-row">
                          <label>Longitude</label>
                          <input type="number" step="0.0001" value={workerSignal.lng} onChange={e => setWorkerSignal(p => ({ ...p, lng: parseFloat(e.target.value) }))} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.3rem', borderRadius: '4px' }} />
                        </div>
                      </div>
                      
                      <div className="admin-slider-row">
                        <label>GNSS Variance</label>
                        <input type="range" min="0" max="50" step="0.5" value={workerSignal.variance} onChange={e => setWorkerSignal(p => ({ ...p, variance: parseFloat(e.target.value) }))} />
                        <span className="val">{workerSignal.variance?.toFixed(1)}</span>
                      </div>
                      
                      <div className="admin-slider-row">
                        <label>Velocity (m/s)</label>
                        <input type="range" min="0" max="30" step="1" value={workerSignal.velocity} onChange={e => setWorkerSignal(p => ({ ...p, velocity: parseInt(e.target.value) }))} />
                        <span className="val">{workerSignal.velocity}</span>
                      </div>

                      <div className="sim-builder-row" style={{ marginTop: '0.5rem' }}>
                        <label>Platform Active</label>
                        <input type="checkbox" checked={workerSignal.isActive} onChange={e => setWorkerSignal(p => ({ ...p, isActive: e.target.checked }))} style={{ width: 'auto' }} />
                      </div>

                      <button className="btn-sim" onClick={applySignalOverride} style={{ marginTop: '0.5rem' }}>
                        Apply Signal Override
                      </button>
                    </div>
                  )}

                  {workerTab === 'Mode' && (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {WORKER_MODES.map(m => (
                        <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: workerMode === m.key ? 'rgba(99,102,241,0.1)' : 'transparent', borderRadius: '4px', cursor: 'pointer', border: workerMode === m.key ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent' }}>
                          <input 
                            type="radio" 
                            name="workerMode" 
                            value={m.key} 
                            checked={workerMode === m.key} 
                            onChange={e => setWorkerMode(e.target.value)} 
                          />
                          <div>
                            <div style={{ fontWeight: 500, color: '#e5e7eb' }}>{m.label}</div>
                            <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{m.desc}</div>
                          </div>
                        </label>
                      ))}
                      <button className="btn-sim" onClick={applyModeOverride} style={{ marginTop: '1rem' }}>
                        Set Mode
                      </button>
                    </div>
                  )}

                  {workerTab === 'Status' && (
                    <div style={{ display: 'grid', gap: '1rem', fontSize: '0.85rem' }}>
                      {workerStatus ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '4px' }}>
                          <div>Name: <strong>{workerStatus.name || 'Unknown'}</strong></div>
                          <div>Zone: <strong>{workerStatus.zone || 'None'}</strong></div>
                          <div>Platform: <strong>{workerStatus.platform || 'None'}</strong></div>
                          <div>Archetype: <strong>{workerStatus.archetype || 'None'}</strong></div>
                          <div>Premium: <strong>₹{workerStatus.premium || 0}</strong></div>
                          <div>Fraud Score: <strong style={{ color: workerStatus.fraud_score > 0.6 ? '#f87171' : '#34d399' }}>{workerStatus.fraud_score?.toFixed(2) || '0.00'}</strong></div>
                        </div>
                      ) : (
                        <div style={{ color: '#9ca3af' }}>No status available.</div>
                      )}
                      
                      <div>
                        <strong style={{ color: '#e5e7eb', display: 'block', marginBottom: '0.5rem' }}>Recent Claims</strong>
                        {workerClaims.length > 0 ? (
                          workerClaims.map((c, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#9ca3af' }}>
                              <span>{new Date(c.created_at || Date.now()).toLocaleString()}</span>
                              <span>₹{c.amount}</span>
                              <span style={{ color: c.status === 'PAID' ? '#34d399' : '#fbbf24' }}>{c.status}</span>
                            </div>
                          ))
                        ) : (
                          <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No claims found.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Real-time Signal Feed */}
          <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
            <h3>📡 Real-time Signal Feed</h3>
            <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.8rem', fontFamily: 'monospace', background: 'rgba(0,0,0,0.4)', padding: '0.5rem', borderRadius: '4px' }}>
              {signalLog.length === 0 ? (
                <div style={{ color: '#6b7280', padding: '0.5rem' }}>Waiting for worker signals...</div>
              ) : (
                signalLog.map((entry, i) => {
                  let color = '#9ca3af';
                  if (entry.type === 'WORKER_SIGNAL_UPDATE') {
                    color = entry.isFraud ? '#f87171' : '#34d399';
                  } else if (entry.type === 'WORKER_REGISTERED') {
                    color = '#60a5fa';
                  } else if (entry.type === 'WORKER_MODE_CHANGED') {
                    color = '#fbbf24';
                  }

                  return (
                    <div key={i} style={{ padding: '0.2rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', color }}>
                      <span style={{ color: '#6b7280' }}>[{entry.time}]</span>{' '}
                      <strong>{entry.type}</strong>{' '}
                      {entry.workerId && <span>Worker: {entry.workerId}</span>}{' '}
                      {entry.mode && <span>Mode: {entry.mode}</span>}{' '}
                      {entry.lat && entry.lng && <span>Pos: {entry.lat.toFixed(4)}, {entry.lng.toFixed(4)}</span>}{' '}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Live System Log */}
          <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
            <h3><span className="live-dot"></span> System Event Stream</h3>
            <div style={{ maxHeight: '250px', overflowY: 'auto', fontSize: '0.8rem', fontFamily: 'monospace', background: 'rgba(0,0,0,0.4)', padding: '0.5rem', borderRadius: '4px' }}>
              {log.length === 0 ? (
                <div style={{ color: '#6b7280', padding: '0.5rem' }}>Waiting for system events...</div>
              ) : (
                log.map((entry, i) => (
                  <div key={i} style={{
                    padding: '0.2rem 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    color: entry.type?.includes('BREACH') || entry.type?.includes('FRAUD') ? '#f87171' :
                           entry.type?.includes('PAID') || entry.type?.includes('CLAIM_CREATED') ? '#34d399' : '#9ca3af'
                  }}>
                    <span style={{ color: '#6b7280' }}>[{entry.time}]</span>{' '}
                    <strong>{entry.type}</strong>{' '}
                    {entry.zone && <span>Zone: {entry.zone}</span>}{' '}
                    {entry.cdi != null && <span>CDI: {entry.cdi.toFixed(3)}</span>}{' '}
                    {entry.claimId && <span>{entry.claimId}</span>}{' '}
                    {entry.scenario && <span>{entry.scenario}</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

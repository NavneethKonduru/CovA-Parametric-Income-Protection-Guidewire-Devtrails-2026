import React, { useState, useEffect, useRef, useCallback } from 'react';
import ModeBanner from '../components/ModeBanner';
import ConnectionStatus from '../components/ConnectionStatus';
import StatusBadge from '../components/StatusBadge';
import EvidenceDrawer from '../components/EvidenceDrawer';
import { SkeletonMetrics, SkeletonTable } from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import CDIGaugeLarge from '../components/CDIGaugeLarge';
import LiveEventFeed from '../components/LiveEventFeed';
import WorkerMap from '../components/WorkerMap';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { generatePDF } from '../utils/generatePDF';

const ZONE_NAMES = { ZONE_A: 'Koramangala', ZONE_B: 'Whitefield', ZONE_C: 'Indiranagar' };

// Status config for claim rows
const STATUS_META = {
  paid: { glow: '#10b981', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.2)' },
  PAID: { glow: '#10b981', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.2)' },
  rejected: { glow: '#ef4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)' },
  rejected_fraud: { glow: '#ef4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)' },
  pending: { glow: '#f59e0b', bg: 'rgba(245,158,11,0.04)', border: 'transparent' },
  flagged: { glow: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)' },
};

// Demo timeline steps shown in the progress bar
const DEMO_STEP_LABELS = [
  { emoji: '🟢', label: 'Baseline' },
  { emoji: '🌧️', label: 'Rain' },
  { emoji: '📉', label: 'Demand' },
  { emoji: '⚡', label: 'Breach' },
  { emoji: '👻', label: 'Fraud' },
  { emoji: '✅', label: 'Done' },
];

export default function InsurerDashboard({ token, onLogout, dataMode }) {
  const [config, setConfig] = useState(null);
  const [claims, setClaims] = useState([]);
  const [health, setHealth] = useState(null);
  const [cdiData, setCdiData] = useState({});
  const [workers, setWorkers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [expandedClaim, setExpandedClaim] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [demoStep, setDemoStep] = useState(-1);
  const [demoRunning, setDemoRunning] = useState(false);
  const [newClaimIds, setNewClaimIds] = useState(new Set());
  const [gwModal, setGwModal] = useState(null);
  const [toast, setToast] = useState(null);
  const wsRef = useRef(null);
  const prevClaimIds = useRef(new Set());

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const refreshClaims = useCallback(() => {
    fetch('/api/claims', { headers }).then(r => r.json()).then(d => {
      const newClaims = d.claims || [];
      const currentIds = new Set(newClaims.map(c => c.id));
      const flashIds = new Set([...currentIds].filter(id => !prevClaimIds.current.has(id)));
      if (flashIds.size > 0) {
        setNewClaimIds(flashIds);
        setTimeout(() => setNewClaimIds(new Set()), 2500);
      }
      prevClaimIds.current = currentIds;
      setClaims(newClaims);
    }).catch(() => {});
  }, []);

  const refreshHealth = useCallback(() => {
    fetch('/api/health', { headers }).then(r => r.json()).then(d => setHealth(d)).catch(() => {});
  }, []);

  const refreshWorkers = useCallback(() => {
    fetch('/api/workers', { headers }).then(r => r.json()).then(d => setWorkers(d.workers || [])).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/insurer/config', { headers }).then(r => r.json()).then(d => { if (d.config) setConfig(d.config); }).catch(() => {}),
      fetch('/api/claims', { headers }).then(r => r.json()).then(d => {
        const cl = d.claims || [];
        prevClaimIds.current = new Set(cl.map(c => c.id));
        setClaims(cl);
      }).catch(() => {}),
      fetch('/api/health', { headers }).then(r => r.json()).then(d => setHealth(d)).catch(() => {}),
      fetch('/api/workers', { headers }).then(r => r.json()).then(d => setWorkers(d.workers || [])).catch(() => {}),
      fetch('/api/dashboard/insurer/analytics', { headers }).then(r => r.json()).then(d => setAnalytics(d)).catch(() => {}),
    ]).finally(() => setLoading(false));

    let ws, reconnectTimeout;
    const connectWs = () => {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:5000/ws';
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => { setWsStatus('connected'); };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'CDI_UPDATE') {
            setCdiData(prev => ({ ...prev, [msg.payload.zone]: msg.payload }));
          }
          if (['CLAIM_CREATED', 'PAYOUT_SENT', 'FRAUD_BLOCKED', 'DEMO_RESET'].includes(msg.type)) {
            refreshClaims();
            refreshHealth();
          }
          if (msg.type === 'WORKER_REGISTERED' || msg.type === 'DEMO_RESET') {
            refreshWorkers();
            refreshHealth();
          }
          if (msg.type === 'DEMO_PROGRESS') {
            setDemoStep(msg.payload?.step ?? -1);
            setDemoRunning(true);
          }
          if (msg.type === 'DEMO_STARTED') {
            setDemoRunning(true);
            setDemoStep(0);
          }
          if (msg.type === 'DEMO_STOPPED' || msg.type === 'DEMO_RESET') {
            setDemoRunning(false);
            setDemoStep(-1);
          }
          if (msg.type === 'DATA_MODE_SWITCHED') {
            refreshClaims();
            refreshHealth();
            refreshWorkers();
          }
        } catch {}
      };
      ws.onerror = () => setWsStatus('disconnected');
      ws.onclose = () => {
        setWsStatus('reconnecting');
        reconnectTimeout = setTimeout(connectWs, 5000);
      };
    };
    connectWs();
    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [dataMode]);

  // Derived metrics
  const totalClaims = claims.length;
  const paidClaims = claims.filter(c => ['paid', 'PAID'].includes(c.status));
  const pendingClaims = claims.filter(c => ['pending', 'processing_payout', 'approved_auto', 'eligible_pending_validation'].includes(c.status));
  const rejectedClaims = claims.filter(c => ['rejected', 'rejected_fraud'].includes(c.status));
  const flaggedClaims = claims.filter(c => ['flagged', 'held_fraud_review'].includes(c.status));
  const totalPayout = paidClaims.reduce((s, c) => s + parseFloat(c.payout_amount || c.amount || 0), 0);
  const workerCount = health?.database?.workers || 0;
  const premiumRate = config?.base_premium_rate?.value || 35;
  const totalPremium = (workerCount || 20) * (premiumRate || 35);
  const lossRatio = totalPremium > 0 ? (totalPayout / totalPremium) * 100 : 0;
  const laeSaved = paidClaims.length * 2000;

  const filteredClaims = activeTab === 'all' ? claims
    : activeTab === 'paid' ? paidClaims
    : activeTab === 'pending' ? pendingClaims
    : activeTab === 'flagged' ? flaggedClaims
    : activeTab === 'rejected' ? rejectedClaims
    : claims;

  const submitToGuidewire = async () => {
    const res = await fetch('/api/guidewire/submit', { method: 'POST', headers });
    const data = await res.json();
    if (res.ok) setGwModal(data);
    else showToast(data.error || 'No paid claims to submit', 'error');
  };

  const isProduction = dataMode === 'real' || dataMode === 'REAL';

  return (
    <div className="admin-layout" style={{ background: '#0b0f1a', minHeight: '100vh', padding: '1rem 1.25rem' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.5px', color: '#fff' }}>
            CovA Insurer
          </span>
          <ModeBanner mode={dataMode} compact />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ConnectionStatus status={wsStatus} />
          {onLogout && (
            <button
              onClick={onLogout}
              style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af', padding: '0.3rem 0.75rem', borderRadius: '6px', cursor: 'pointer' }}
            >Logout</button>
          )}
        </div>
      </div>

      {/* ── Demo Progress Bar (shown only when demo is running) ── */}
      {demoRunning && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0',
          marginBottom: '0.75rem',
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: '10px',
          padding: '0.6rem 1rem',
          overflowX: 'auto',
        }}>
          <span style={{ fontSize: '0.65rem', color: '#818cf8', fontWeight: 700, letterSpacing: '1px', marginRight: '0.75rem', flexShrink: 0, textTransform: 'uppercase' }}>
            Demo
          </span>
          {DEMO_STEP_LABELS.map((step, i) => (
            <React.Fragment key={i}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.2rem',
                padding: '0 0.6rem',
                opacity: i > demoStep ? 0.3 : 1,
                transition: 'opacity 0.4s',
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: i < demoStep ? '#10b981' : i === demoStep ? '#6366f1' : 'rgba(255,255,255,0.08)',
                  border: i === demoStep ? '2px solid #818cf8' : '1px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem',
                  animation: i === demoStep ? 'stepPulse 1.5s infinite' : 'none',
                  transition: 'background 0.5s',
                }}>
                  {i < demoStep ? '✓' : step.emoji}
                </div>
                <span style={{ fontSize: '0.58rem', color: i === demoStep ? '#c7d2fe' : '#6b7280', whiteSpace: 'nowrap' }}>
                  {step.label}
                </span>
              </div>
              {i < DEMO_STEP_LABELS.length - 1 && (
                <div style={{
                  flex: 1, height: 2, minWidth: 16,
                  background: i < demoStep ? '#10b981' : 'rgba(255,255,255,0.07)',
                  transition: 'background 0.5s',
                  borderRadius: 2,
                }} />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* ── Production locked state ── */}
      {isProduction && (
        <ModeBanner mode={dataMode} />
      )}

      {/* ── KPI Row ── */}
      {loading ? <SkeletonMetrics count={6} /> : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '0.6rem',
          marginBottom: '1rem',
        }}>
          {[
            { label: 'Loss Ratio', value: `${lossRatio.toFixed(1)}%`, sub: 'Target <65%', color: lossRatio < 65 ? '#10b981' : lossRatio < 85 ? '#f59e0b' : '#ef4444' },
            { label: 'Workers', value: workerCount, sub: 'Active portfolio', color: '#e5e7eb' },
            { label: 'Total Paid', value: `₹${totalPayout.toLocaleString()}`, sub: `Pool ₹${totalPremium.toLocaleString()}`, color: '#60a5fa' },
            { label: 'Claims', value: totalClaims, sub: `${paidClaims.length} paid · ${pendingClaims.length} pending · ${rejectedClaims.length} rej`, color: '#e5e7eb' },
            { label: 'LAE Saved', value: `₹${laeSaved.toLocaleString()}`, sub: '₹2k per auto-claim', color: '#34d399' },
            { label: 'Fraud Blocked', value: rejectedClaims.length, sub: 'TCHC active', color: '#f87171' },
          ].map((m, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '10px',
              padding: '0.75rem',
            }}>
              <div style={{ fontSize: '0.62rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '0.3rem' }}>{m.label}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: m.color, lineHeight: 1.1 }}>{m.value}</div>
              <div style={{ fontSize: '0.6rem', color: '#4b5563', marginTop: '0.3rem' }}>{m.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main 3-col layout: CDI + Map + Feed ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1fr', gap: '0.75rem', marginBottom: '1rem', alignItems: 'start' }}>

        {/* CDI Gauge */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px',
          padding: '1rem 0.5rem 0.75rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>CDI Score</div>
          <CDIGaugeLarge cdiData={cdiData} />
          {/* Mini zone bars */}
          {['ZONE_A', 'ZONE_B', 'ZONE_C'].map(zone => {
            const d = cdiData[zone] || {};
            const pct = Math.min((d.cdi || 0) * 100, 100);
            const color = pct >= 60 ? '#ef4444' : pct >= 40 ? '#f59e0b' : '#10b981';
            return (
              <div key={zone} style={{ width: '100%', padding: '0 0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: '#6b7280', marginBottom: '2px' }}>
                  <span>{ZONE_NAMES[zone]}</span>
                  <span style={{ color }}>{pct.toFixed(0)}%</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Worker Map */}
        <WorkerMap workers={workers} cdiData={cdiData} claims={claims} />

        {/* Live Event Feed */}
        <LiveEventFeed token={token} />
      </div>

      {/* ── Zone Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
        {['ZONE_A', 'ZONE_B', 'ZONE_C'].map(zone => {
          const d = cdiData[zone] || { cdi: 0 };
          const pct = (d.cdi || 0) * 100;
          const isRed = pct >= 60;
          const isAmber = pct >= 40 && pct < 60;
          const borderColor = isRed ? 'rgba(239,68,68,0.35)' : isAmber ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.06)';
          const bgColor = isRed ? 'rgba(239,68,68,0.06)' : isAmber ? 'rgba(245,158,11,0.04)' : 'rgba(255,255,255,0.02)';
          return (
            <div key={zone} style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: '10px', padding: '0.85rem', transition: 'all 0.6s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f9fafb' }}>{ZONE_NAMES[zone]}</div>
                  <div style={{ fontSize: '0.62rem', color: '#6b7280' }}>{zone}</div>
                </div>
                <span style={{
                  fontSize: '0.62rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '6px',
                  background: isRed ? 'rgba(239,68,68,0.15)' : isAmber ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)',
                  color: isRed ? '#f87171' : isAmber ? '#fbbf24' : '#34d399',
                }}>
                  {d.triggered ? '⚠️ TRIGGERED' : '✓ NOMINAL'}
                </span>
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: isRed ? '#f87171' : isAmber ? '#fbbf24' : '#34d399' }}>
                {pct.toFixed(1)}<span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 400 }}> %</span>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, marginTop: '0.5rem', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 3,
                  background: isRed ? 'linear-gradient(90deg,#ef4444,#f87171)' : isAmber ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#10b981,#34d399)',
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Claims Table ── */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', overflow: 'hidden', marginBottom: '1rem' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 0.5rem' }}>
          {[
            { key: 'all', label: 'All', count: totalClaims },
            { key: 'pending', label: 'Pending', count: pendingClaims.length },
            { key: 'paid', label: 'Approved', count: paidClaims.length },
            { key: 'flagged', label: 'Under Review', count: flaggedClaims.length },
            { key: 'rejected', label: 'Rejected', count: rejectedClaims.length },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === t.key ? '2px solid #6366f1' : '2px solid transparent',
                color: activeTab === t.key ? '#a5b4fc' : '#6b7280',
                padding: '0.65rem 0.85rem',
                fontSize: '0.72rem',
                fontWeight: activeTab === t.key ? 700 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.2s',
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{
                  fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '20px',
                  background: activeTab === t.key ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.07)',
                  color: activeTab === t.key ? '#c7d2fe' : '#6b7280',
                }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? <SkeletonTable rows={5} cols={7} /> : filteredClaims.length === 0 ? (
          <EmptyState icon="📭" title="No claims here" subtitle="Claims appear as the CDI engine triggers them automatically." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['', 'Claim ID', 'Worker', 'Zone', 'CDI', 'Amount', 'Status', 'Txn ID'].map((h, i) => (
                    <th key={i} style={{ padding: '0.55rem 0.75rem', textAlign: i >= 5 ? 'right' : 'left', color: '#6b7280', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredClaims.slice(0, 40).map(claim => {
                  const isExpanded = expandedClaim === claim.id;
                  const isNew = newClaimIds.has(claim.id);
                  const meta = STATUS_META[claim.status] || {};
                  return (
                    <React.Fragment key={claim.id}>
                      <tr
                        onClick={() => setExpandedClaim(isExpanded ? null : claim.id)}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          cursor: 'pointer',
                          background: isNew ? meta.bg || 'rgba(99,102,241,0.06)' : 'transparent',
                          borderLeft: meta.border ? `3px solid ${meta.border}` : '3px solid transparent',
                          animation: isNew ? 'claimFlash 2s ease-out' : 'none',
                          transition: 'background 0.3s',
                        }}
                      >
                        <td style={{ padding: '0.55rem 0.5rem', color: '#4b5563' }}>
                          <span style={{ fontSize: '0.65rem', transition: 'transform 0.2s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>›</span>
                        </td>
                        <td style={{ padding: '0.55rem 0.5rem', fontFamily: 'monospace', color: '#9ca3af', fontSize: '0.72rem' }}>
                          {String(claim.id).slice(0, 8)}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', fontWeight: 600, color: '#e5e7eb' }}>
                          {claim.workerName || claim.worker_name || claim.worker_id}
                        </td>
                        <td style={{ padding: '0.55rem 0.5rem', color: '#9ca3af', fontSize: '0.72rem' }}>{claim.zone}</td>
                        <td style={{ padding: '0.55rem 0.5rem', fontWeight: 600, color: (claim.cdi || 0) >= 0.6 ? '#f87171' : '#fbbf24' }}>
                          {(parseFloat(claim.cdi || 0) * 100).toFixed(1)}%
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', fontWeight: 700, color: '#e5e7eb' }}>
                          ₹{parseFloat(claim.payout_amount || claim.amount || 0).toFixed(0)}
                        </td>
                        <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right' }}>
                          <StatusBadge status={claim.status} size="sm" />
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.65rem', color: '#34d399' }}>
                          {claim.payout_txn_id ? `💳 ${claim.payout_txn_id.slice(0, 12)}` : '—'}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ background: 'rgba(0,0,0,0.25)' }}>
                          <td colSpan={8} style={{ padding: '0.5rem 1rem' }}>
                            <EvidenceDrawer claim={claim} expanded />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Guidewire + Analytics ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        {/* Guidewire */}
        <div style={{
          background: 'rgba(99,102,241,0.06)',
          border: '1px solid rgba(99,102,241,0.18)',
          borderRadius: '12px',
          padding: '1.25rem',
        }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#818cf8', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '1rem' }}>
            Guidewire ClaimCenter
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.62rem', color: 'rgba(129,140,248,0.6)' }}>Ready Claims</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{paidClaims.length}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.62rem', color: 'rgba(129,140,248,0.6)' }}>Payload</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>₹{totalPayout.toLocaleString()}</div>
            </div>
          </div>
          <div style={{ padding: '0.6rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '8px', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.62rem', color: '#34d399', fontWeight: 600, marginBottom: '0.2rem' }}>💰 LAE Savings</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#34d399' }}>₹{laeSaved.toLocaleString()}</div>
          </div>
          <button
            onClick={submitToGuidewire}
            disabled={paidClaims.length === 0}
            style={{
              width: '100%', padding: '0.6rem', borderRadius: '8px', border: 'none', cursor: paidClaims.length === 0 ? 'not-allowed' : 'pointer',
              background: paidClaims.length > 0 ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#1f2937',
              color: paidClaims.length > 0 ? '#fff' : '#6b7280', fontWeight: 700, fontSize: '0.8rem',
            }}
          >
            ✅ Submit to Guidewire
          </button>
        </div>

        {/* Analytics Charts */}
        {analytics ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '1rem' }}>
              <div style={{ fontSize: '0.65rem', color: '#6b7280', marginBottom: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Claims Trend</div>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={analytics.dailyClaims || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" stroke="#4b5563" fontSize={8} />
                  <YAxis stroke="#4b5563" fontSize={8} />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff', fontSize: '0.75rem' }} />
                  <Area type="monotone" dataKey="paid" stroke="#10b981" fill="rgba(16,185,129,0.08)" name="Paid" />
                  <Area type="monotone" dataKey="rejected" stroke="#ef4444" fill="rgba(239,68,68,0.06)" name="Rejected" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '1rem' }}>
              <div style={{ fontSize: '0.65rem', color: '#6b7280', marginBottom: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Zone Performance</div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={analytics.zoneBreakdown || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="zone" stroke="#4b5563" fontSize={8} />
                  <YAxis stroke="#4b5563" fontSize={8} />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff', fontSize: '0.75rem' }} />
                  <Bar dataKey="paid" fill="#10b981" radius={[3, 3, 0, 0]} name="Paid" />
                  <Bar dataKey="rejected" fill="#ef4444" radius={[3, 3, 0, 0]} name="Rejected" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563', fontSize: '0.8rem' }}>
            Loading analytics…
          </div>
        )}
      </div>

      {/* ── Guidewire Modal ── */}
      {gwModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', maxWidth: '600px', width: '90%', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#a5b4fc' }}>Guidewire Payload</h3>
              <button onClick={() => setGwModal(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            <pre style={{ background: '#0b0f1a', padding: '1rem', borderRadius: '8px', color: '#34d399', fontSize: '0.75rem', fontFamily: 'monospace', overflowX: 'auto' }}>
              {JSON.stringify(gwModal, null, 2)}
            </pre>
          </div>
        </div>
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
        @keyframes claimFlash { 0%{background:rgba(99,102,241,0.18)} 100%{background:transparent} }
      `}</style>
    </div>
  );
}

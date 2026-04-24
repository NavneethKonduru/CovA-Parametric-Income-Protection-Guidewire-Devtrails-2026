import { useEffect, useRef, useState } from 'react';

const EVENT_CONFIG = {
  CDI_UPDATE: {
    format: (p) => {
      const pct = ((p.cdi || 0) * 100).toFixed(1);
      return p.triggered
        ? `⚡ CDI BREACH — ${p.zone} — ${pct}% — Threshold exceeded`
        : `📊 CDI Update — ${p.zone} — ${pct}%`;
    },
    color: (p) => (p.triggered ? '#f87171' : '#94a3b8'),
    important: (p) => !!p.triggered,
  },
  CLAIM_CREATED: {
    format: (p) => `📋 Claim Created — ${p.workerName || p.worker_id || p.workerId} — ${p.zone} — ₹${p.amount || p.payout_amount || 280}`,
    color: () => '#fbbf24',
    important: () => true,
  },
  FRAUD_BLOCKED: {
    format: (p) => `❌ Fraud Blocked — ${p.workerName || p.workerId} — ${p.reason || 'Synthetic signal detected'}`,
    color: () => '#f87171',
    important: () => true,
  },
  PAYOUT_SENT: {
    format: (p) => `✅ Payout Sent — ${p.workerName || p.worker_id} — ₹${p.amount || p.payout_amount} — ${p.txnId || p.payout_txn_id || ''}`,
    color: () => '#34d399',
    important: () => true,
  },
  DEMO_PROGRESS: {
    format: (p) => `🎬 ${p.name || 'Demo step'}`,
    color: () => '#818cf8',
    important: () => true,
  },
  DEMO_STARTED: {
    format: (p) => `▶ Demo Sequence Started — ${p.zoneName ? `Storm targeting ${p.zoneName}` : ''}`,
    color: () => '#a78bfa',
    important: () => true,
  },
  DEMO_STOPPED: {
    format: () => `⏹ Demo Sequence Ended`,
    color: () => '#6b7280',
    important: () => false,
  },
  DEMO_RESET: {
    format: () => `🔄 Sandbox Reset — All demo data cleared`,
    color: () => '#f59e0b',
    important: () => true,
  },
  DATA_MODE_SWITCHED: {
    format: (p) => `🔀 Mode switched → ${(p.mode || '').toUpperCase()}`,
    color: (p) => (p.mode === 'real' ? '#10b981' : '#f59e0b'),
    important: () => true,
  },
  WORKER_REGISTERED: {
    format: (p) => `👤 Worker Registered — ${p.name || p.workerId} — ${p.zone || ''}`,
    color: () => '#60a5fa',
    important: () => false,
  },
  FRAUD_DEMO_TRIGGERED: {
    format: (p) => `🎯 Fraud Lab — ${p.workerName} flagged in ${p.zone}`,
    color: () => '#fb923c',
    important: () => true,
  },
  ZONE_SIMULATED: {
    format: (p) => `⚡ Zone Simulation — ${p.zone} — ${p.scenario}`,
    color: () => '#f59e0b',
    important: () => true,
  },
};

export default function LiveEventFeed({ wsUrl, token }) {
  const [events, setEvents] = useState([]);
  const feedRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    let ws, reconnectTimeout;

    const connect = () => {
      const url = wsUrl || (typeof window !== 'undefined'
        ? (window.location.protocol === 'https:' ? 'wss' : 'ws') + '://' + window.location.hostname + ':5000/ws'
        : 'ws://localhost:5000/ws');

      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (token) ws.send(JSON.stringify({ type: 'AUTH', payload: { token } }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const cfg = EVENT_CONFIG[msg.type];
          if (!cfg) return;

          const text = cfg.format(msg.payload || {});
          const color = cfg.color(msg.payload || {});
          const important = cfg.important(msg.payload || {});

          setEvents(prev => [{
            id: Date.now() + Math.random(),
            type: msg.type,
            text,
            color,
            important,
            ts: new Date().toLocaleTimeString('en-IN', { hour12: false }),
          }, ...prev].slice(0, 60));
        } catch {}
      };

      ws.onclose = () => { reconnectTimeout = setTimeout(connect, 5000); };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [wsUrl, token]);

  return (
    <div style={{
      background: 'rgba(0,0,0,0.35)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '12px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: '220px',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.6rem 1rem',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: '#10b981',
          boxShadow: '0 0 6px #10b981',
          animation: 'livePulse 2s infinite',
          display: 'inline-block',
        }} />
        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1.5px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
          Live Event Stream
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#4b5563' }}>
          {events.length} events
        </span>
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.5rem 0',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '0.72rem',
        }}
      >
        {events.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#374151', fontSize: '0.75rem' }}>
            Waiting for system events…
          </div>
        ) : (
          events.map((ev) => (
            <div
              key={ev.id}
              style={{
                display: 'flex',
                gap: '0.75rem',
                padding: '0.3rem 1rem',
                alignItems: 'flex-start',
                animation: 'feedSlideIn 0.25s ease-out',
                background: ev.important ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderLeft: ev.important ? `2px solid ${ev.color}30` : '2px solid transparent',
              }}
            >
              <span style={{ color: '#374151', flexShrink: 0, paddingTop: '0.05rem', fontSize: '0.65rem' }}>
                {ev.ts}
              </span>
              <span style={{ color: ev.color, flex: 1, lineHeight: 1.5 }}>
                {ev.text}
              </span>
            </div>
          ))
        )}
      </div>

      <style>{`
        @keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes feedSlideIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}

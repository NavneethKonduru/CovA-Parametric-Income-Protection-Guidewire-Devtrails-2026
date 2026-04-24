import { useMemo } from 'react';

// Deterministic position within zone bounds based on worker id hash
function seededRand(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  const a = Math.abs(h) / 2147483647;
  return a;
}

// Zone SVG polygons (relative coords for a 320×220 canvas)
const ZONES = {
  ZONE_A: {
    label: 'Koramangala',
    sub: 'Zone A',
    color: '#6366f1',
    polygon: '40,180 100,165 115,130 80,100 40,120',
    center: { x: 75, y: 145 },
    workerBounds: { x: [45, 108], y: [115, 175] },
  },
  ZONE_B: {
    label: 'Whitefield',
    sub: 'Zone B',
    color: '#06b6d4',
    polygon: '190,60 260,55 275,110 250,150 200,140 185,100',
    center: { x: 232, y: 105 },
    workerBounds: { x: [195, 265], y: [65, 145] },
  },
  ZONE_C: {
    label: 'Indiranagar',
    sub: 'Zone C',
    color: '#10b981',
    polygon: '120,90 175,80 195,120 175,155 130,160 110,130',
    center: { x: 153, y: 120 },
    workerBounds: { x: [115, 188], y: [88, 155] },
  },
};

function workerPos(worker, zone) {
  const bounds = ZONES[zone]?.workerBounds || { x: [50, 200], y: [50, 180] };
  const rx = seededRand(worker.id + 'x');
  const ry = seededRand(worker.id + 'y');
  return {
    x: bounds.x[0] + rx * (bounds.x[1] - bounds.x[0]),
    y: bounds.y[0] + ry * (bounds.y[1] - bounds.y[0]),
  };
}

function workerColor(worker, cdiData) {
  const zone = worker.zone;
  const zd = cdiData[zone] || {};
  const cdi = zd.cdi || 0;

  if (worker.id?.startsWith('GHOST_')) return '#6b7280';
  if (worker.mode === 'auto_fraud' || worker.fraud_score > 0.7) return '#ef4444';
  if (worker.latestClaim?.status === 'paid') return '#10b981';
  if (worker.latestClaim?.status === 'rejected' || worker.latestClaim?.status === 'rejected_fraud') return '#ef4444';
  if (worker.latestClaim?.status === 'pending') return '#f59e0b';
  if (cdi >= 0.6) return '#f59e0b';
  return ZONES[zone]?.color || '#6366f1';
}

export default function WorkerMap({ workers = [], cdiData = {}, claims = [] }) {
  // Attach latest claim to each worker
  const workersWithClaims = useMemo(() => {
    return workers.map(w => {
      const wClaims = claims.filter(c => (c.worker_id || c.workerId) === w.id);
      const latest = wClaims.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
      return { ...w, latestClaim: latest };
    });
  }, [workers, claims]);

  return (
    <div style={{
      background: 'rgba(0,0,0,0.3)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.6rem 1rem',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '1.5px',
        color: 'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
      }}>
        Bangalore Zone Map
      </div>

      <div style={{ padding: '0.5rem', position: 'relative' }}>
        <svg viewBox="0 0 320 220" width="100%" style={{ display: 'block' }}>
          {/* Background */}
          <rect width="320" height="220" fill="transparent" />

          {/* Road hints */}
          <line x1="0" y1="130" x2="320" y2="110" stroke="rgba(255,255,255,0.04)" strokeWidth={12} />
          <line x1="160" y1="0" x2="150" y2="220" stroke="rgba(255,255,255,0.04)" strokeWidth={8} />

          {/* Zone polygons */}
          {Object.entries(ZONES).map(([zoneId, zone]) => {
            const zd = cdiData[zoneId] || {};
            const cdi = zd.cdi || 0;
            const isBreached = cdi >= 0.6;
            const isElevated = cdi >= 0.4;
            const fillOpacity = isBreached ? 0.18 : isElevated ? 0.12 : 0.07;
            const strokeColor = isBreached ? '#ef4444' : isElevated ? '#f59e0b' : zone.color;

            return (
              <g key={zoneId}>
                <polygon
                  points={zone.polygon}
                  fill={strokeColor}
                  fillOpacity={fillOpacity}
                  stroke={strokeColor}
                  strokeWidth={isBreached ? 1.5 : 1}
                  strokeOpacity={isBreached ? 0.8 : 0.35}
                  style={{ transition: 'all 0.8s ease' }}
                />
                {isBreached && (
                  <polygon
                    points={zone.polygon}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={2}
                    strokeOpacity={0.4}
                    style={{ animation: 'zonePulse 1.5s infinite' }}
                  />
                )}
                {/* Zone label */}
                <text x={zone.center.x} y={zone.center.y - 8} textAnchor="middle" fill={strokeColor} fontSize={8} fontWeight="700" fontFamily="monospace" fillOpacity={0.9}>
                  {zone.label}
                </text>
                <text x={zone.center.x} y={zone.center.y + 4} textAnchor="middle" fill={strokeColor} fontSize={7} fontFamily="monospace" fillOpacity={0.6}>
                  {(cdi * 100).toFixed(0)}% CDI
                </text>
              </g>
            );
          })}

          {/* Worker dots */}
          {workersWithClaims.map(worker => {
            if (!worker.zone || !ZONES[worker.zone]) return null;
            const pos = workerPos(worker, worker.zone);
            const color = workerColor(worker, cdiData);
            const isFraud = worker.mode === 'auto_fraud' || worker.fraud_score > 0.7 || worker.id?.startsWith('GHOST_');
            const hasClaim = !!worker.latestClaim;

            return (
              <g key={worker.id}>
                {hasClaim && (
                  <circle cx={pos.x} cy={pos.y} r={7} fill={color} fillOpacity={0.2}
                    style={{ animation: 'dotRing 1.5s infinite' }} />
                )}
                <circle
                  cx={pos.x} cy={pos.y} r={3.5}
                  fill={color}
                  stroke="rgba(0,0,0,0.5)"
                  strokeWidth={0.5}
                  style={{
                    animation: isFraud ? 'dotBlink 0.8s infinite' : 'none',
                  }}
                />
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div style={{
          display: 'flex',
          gap: '0.75rem',
          padding: '0.4rem 0.25rem 0',
          flexWrap: 'wrap',
        }}>
          {[
            { color: '#6366f1', label: 'Active' },
            { color: '#10b981', label: 'Paid' },
            { color: '#f59e0b', label: 'Pending' },
            { color: '#ef4444', label: 'Rejected / Fraud' },
            { color: '#6b7280', label: 'Ghost' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: l.color }} />
              <span style={{ fontSize: '0.6rem', color: '#6b7280' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes zonePulse { 0%,100%{stroke-opacity:0.4} 50%{stroke-opacity:0.05} }
        @keyframes dotRing { 0%,100%{r:7;opacity:0.2} 50%{r:11;opacity:0.05} }
        @keyframes dotBlink { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';

function polarToXY(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const s = polarToXY(cx, cy, r, startDeg);
  const e = polarToXY(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

const ARC_START = -140;
const ARC_END = 140;

export default function CDIGaugeLarge({ cdiData = {} }) {
  const [displayCDI, setDisplayCDI] = useState(0);
  const [topZone, setTopZone] = useState(null);
  const [triggered, setTriggered] = useState(false);
  const animRef = useRef(null);
  const currentRef = useRef(0);

  useEffect(() => {
    // Find highest CDI zone
    let maxCDI = 0;
    let maxZone = null;
    Object.entries(cdiData).forEach(([zone, d]) => {
      const v = parseFloat(d?.cdi || d?.smoothedCDI || 0);
      if (v > maxCDI) { maxCDI = v; maxZone = zone; }
    });

    setTopZone(maxZone);
    setTriggered(maxCDI >= 0.6);

    // Animate needle smoothly
    const target = maxCDI;
    const start = currentRef.current;
    const startTime = performance.now();
    const duration = 800;

    cancelAnimationFrame(animRef.current);
    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const val = start + (target - start) * ease;
      currentRef.current = val;
      setDisplayCDI(val);
      if (progress < 1) animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animRef.current);
  }, [cdiData]);

  const cx = 120, cy = 110, r = 88;
  const pct = Math.min(displayCDI, 1);
  const needleAngle = ARC_START + pct * (ARC_END - ARC_START);
  const needleTip = polarToXY(cx, cy, r - 12, needleAngle);
  const needleBase1 = polarToXY(cx, cy, 10, needleAngle + 90);
  const needleBase2 = polarToXY(cx, cy, 10, needleAngle - 90);

  const ZONE_NAMES = { ZONE_A: 'Koramangala', ZONE_B: 'Whitefield', ZONE_C: 'Indiranagar' };

  // Color ramp
  const color = pct < 0.4 ? '#10b981' : pct < 0.6 ? '#f59e0b' : '#ef4444';
  const glow = pct >= 0.6 ? `drop-shadow(0 0 8px ${color}80)` : 'none';

  // Arc segments: 0–40% green, 40–60% amber, 60–100% red
  const seg1End = ARC_START + 0.4 * (ARC_END - ARC_START);
  const seg2End = ARC_START + 0.6 * (ARC_END - ARC_START);
  const fillEnd = ARC_START + pct * (ARC_END - ARC_START);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      <svg width={240} height={160} style={{ overflow: 'visible', filter: glow }}>
        {/* Track */}
        <path d={arcPath(cx, cy, r, ARC_START, ARC_END)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={14} strokeLinecap="round" />

        {/* Zone ticks */}
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map(v => {
          const ang = ARC_START + v * (ARC_END - ARC_START);
          const outer = polarToXY(cx, cy, r + 10, ang);
          const inner = polarToXY(cx, cy, r - 10, ang);
          return <line key={v} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} />;
        })}

        {/* Fill arc up to CDI value, segmented by color */}
        {pct > 0 && (
          <>
            {/* Green segment (0–40%) */}
            {pct > 0 && (
              <path
                d={arcPath(cx, cy, r, ARC_START, Math.min(fillEnd, seg1End))}
                fill="none" stroke="#10b981" strokeWidth={10} strokeLinecap="butt"
                style={{ transition: 'none' }}
              />
            )}
            {/* Amber segment (40–60%) */}
            {pct > 0.4 && (
              <path
                d={arcPath(cx, cy, r, seg1End, Math.min(fillEnd, seg2End))}
                fill="none" stroke="#f59e0b" strokeWidth={10} strokeLinecap="butt"
              />
            )}
            {/* Red segment (60–100%) */}
            {pct > 0.6 && (
              <path
                d={arcPath(cx, cy, r, seg2End, fillEnd)}
                fill="none" stroke="#ef4444" strokeWidth={10} strokeLinecap="butt"
              />
            )}
          </>
        )}

        {/* Threshold marker at 60% */}
        {(() => {
          const threshAng = ARC_START + 0.6 * (ARC_END - ARC_START);
          const tp = polarToXY(cx, cy, r + 16, threshAng);
          return (
            <g>
              <line
                x1={polarToXY(cx, cy, r - 16, threshAng).x}
                y1={polarToXY(cx, cy, r - 16, threshAng).y}
                x2={polarToXY(cx, cy, r + 16, threshAng).x}
                y2={polarToXY(cx, cy, r + 16, threshAng).y}
                stroke="#ef4444" strokeWidth={2} strokeDasharray="3,2"
              />
              <text x={tp.x} y={tp.y + 4} textAnchor="middle" fill="#ef4444" fontSize={7} fontFamily="monospace">60%</text>
            </g>
          );
        })()}

        {/* Needle */}
        <polygon
          points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
          fill={color}
          style={{ transition: 'fill 0.5s ease' }}
        />
        <circle cx={cx} cy={cy} r={8} fill={color} style={{ transition: 'fill 0.5s ease' }} />
        <circle cx={cx} cy={cy} r={4} fill="#0b0f1a" />

        {/* Center text */}
        <text x={cx} y={cy + 28} textAnchor="middle" fill={color} fontSize={22} fontWeight="800" fontFamily="'IBM Plex Mono', monospace">
          {(pct * 100).toFixed(1)}
        </text>
        <text x={cx} y={cy + 42} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={9} fontFamily="monospace">
          CDI %
        </text>

        {/* Labels */}
        <text x={polarToXY(cx, cy, r + 22, ARC_START).x} y={polarToXY(cx, cy, r + 22, ARC_START).y + 4} textAnchor="middle" fill="#6b7280" fontSize={8} fontFamily="monospace">0</text>
        <text x={polarToXY(cx, cy, r + 22, ARC_END).x} y={polarToXY(cx, cy, r + 22, ARC_END).y + 4} textAnchor="middle" fill="#6b7280" fontSize={8} fontFamily="monospace">100</text>
      </svg>

      {/* Status */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '1px',
          color: pct >= 0.6 ? '#f87171' : pct >= 0.4 ? '#fbbf24' : '#34d399',
          textTransform: 'uppercase',
          animation: pct >= 0.6 ? 'cdiPulse 1s infinite' : 'none',
        }}>
          {pct >= 0.6 ? '⚠️ BREACH' : pct >= 0.4 ? '⚡ ELEVATED' : '✓ NOMINAL'}
        </div>
        {topZone && (
          <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: '0.2rem' }}>
            {ZONE_NAMES[topZone] || topZone}
          </div>
        )}
      </div>

      <style>{`
        @keyframes cdiPulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
      `}</style>
    </div>
  );
}

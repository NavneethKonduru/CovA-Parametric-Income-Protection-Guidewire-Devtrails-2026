import { useMemo } from 'react';

const SIGNALS = [
  { key: 'weather', label: 'Weather', icon: '🌧️', desc: 'Precipitation & temperature' },
  { key: 'demand', label: 'Demand', icon: '📦', desc: 'Platform order volume' },
  { key: 'peer', label: 'Peer Offline', icon: '👥', desc: 'Workers gone offline' },
];

function getBarColor(value) {
  if (value < 0.4) return { bg: 'linear-gradient(90deg, #10B981, #34D399)', glow: 'rgba(16, 185, 129, 0.3)' };
  if (value < 0.6) return { bg: 'linear-gradient(90deg, #F59E0B, #FBBF24)', glow: 'rgba(245, 158, 11, 0.3)' };
  return { bg: 'linear-gradient(90deg, #EF4444, #F87171)', glow: 'rgba(239, 68, 68, 0.3)' };
}

function getCDIColor(value) {
  if (value < 0.4) return '#10B981';
  if (value < 0.6) return '#F59E0B';
  return '#EF4444';
}

function getCDILabel(value) {
  if (value < 0.3) return 'Normal';
  if (value < 0.4) return 'Elevated';
  if (value < 0.6) return 'Watch';
  if (value < 0.8) return 'Disruption';
  return 'Critical';
}

export default function CDIGauge({ signals = {}, cdi = 0, threshold = 0.6 }) {
  const weatherVal = signals.weather ?? signals.weatherScore ?? 0;
  const demandVal = signals.demand ?? signals.demandScore ?? 0;
  const peerVal = signals.peer ?? signals.peerScore ?? 0;

  const signalValues = {
    weather: weatherVal,
    demand: demandVal,
    peer: peerVal,
  };

  const cdiColor = useMemo(() => getCDIColor(cdi), [cdi]);
  const cdiLabel = useMemo(() => getCDILabel(cdi), [cdi]);
  const cdiPercent = Math.min(cdi * 100, 100);

  return (
    <div style={{ padding: '0' }}>
      {/* Individual Signal Bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {SIGNALS.map((signal) => {
          const value = signalValues[signal.key] || 0;
          const pct = Math.min(value * 100, 100);
          const barStyle = getBarColor(value);

          return (
            <div key={signal.key}>
              {/* Label row */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.35rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.85rem' }}>{signal.icon}</span>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.6)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>{signal.label}</span>
                </div>
                <span style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: value < 0.4 ? '#10B981' : value < 0.6 ? '#F59E0B' : '#EF4444',
                  fontVariantNumeric: 'tabular-nums',
                }}>{(value * 100).toFixed(0)}%</span>
              </div>

              {/* Bar track */}
              <div style={{
                position: 'relative',
                height: '10px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '5px',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: barStyle.bg,
                  borderRadius: '5px',
                  transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: `0 0 8px ${barStyle.glow}`,
                }} />
              </div>

              {/* Description */}
              <div style={{
                fontSize: '0.65rem',
                color: 'rgba(255,255,255,0.3)',
                marginTop: '0.15rem',
              }}>{signal.desc}</div>
            </div>
          );
        })}
      </div>

      {/* Combined CDI Score */}
      <div style={{
        marginTop: '1.25rem',
        padding: '1rem',
        background: `${cdiColor}10`,
        border: `1px solid ${cdiColor}25`,
        borderRadius: '12px',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '0.65rem',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          color: 'rgba(255,255,255,0.4)',
          marginBottom: '0.25rem',
        }}>Combined Disruption Index</div>

        <div style={{
          fontSize: '2.5rem',
          fontWeight: 800,
          color: cdiColor,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          textShadow: `0 0 24px ${cdiColor}40`,
        }}>
          {(cdi * 100).toFixed(1)}
          <span style={{ fontSize: '1rem', fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>%</span>
        </div>

        {/* Status label */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          marginTop: '0.5rem',
          padding: '0.2rem 0.75rem',
          borderRadius: '20px',
          background: `${cdiColor}18`,
          border: `1px solid ${cdiColor}30`,
        }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: cdiColor,
            boxShadow: `0 0 6px ${cdiColor}`,
            animation: cdi >= 0.6 ? 'pulse 1.5s infinite' : 'none',
          }} />
          <span style={{
            fontSize: '0.72rem',
            fontWeight: 600,
            color: cdiColor,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>{cdiLabel}</span>
        </div>

        {/* Threshold marker */}
        <div style={{
          marginTop: '0.75rem',
          position: 'relative',
          height: '4px',
          background: 'rgba(255,255,255,0.06)',
          borderRadius: '2px',
          overflow: 'visible',
        }}>
          <div style={{
            height: '100%',
            width: `${cdiPercent}%`,
            background: cdiColor,
            borderRadius: '2px',
            transition: 'width 0.6s ease',
          }} />
          {/* Threshold line */}
          <div style={{
            position: 'absolute',
            left: `${threshold * 100}%`,
            top: '-4px',
            width: '2px',
            height: '12px',
            background: 'rgba(255,255,255,0.5)',
            borderRadius: '1px',
          }} />
          <div style={{
            position: 'absolute',
            left: `${threshold * 100}%`,
            top: '14px',
            transform: 'translateX(-50%)',
            fontSize: '0.55rem',
            color: 'rgba(255,255,255,0.35)',
            whiteSpace: 'nowrap',
          }}>threshold {(threshold * 100).toFixed(0)}%</div>
        </div>
      </div>
    </div>
  );
}

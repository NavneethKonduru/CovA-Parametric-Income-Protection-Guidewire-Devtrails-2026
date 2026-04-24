/**
 * LoadingSkeleton — Shimmer loading placeholders.
 * Variants: metric (compact card), row (table row), card (full panel), inline (text)
 */
export function SkeletonBlock({ width = '100%', height = '1rem', radius = '4px', style = {} }) {
  return (
    <div className="skeleton-shimmer" style={{ width, height, borderRadius: radius, ...style }} />
  );
}

export function SkeletonMetrics({ count = 5 }) {
  return (
    <div className="metrics-dark-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="metric-dark" style={{ padding: '1.25rem' }}>
          <SkeletonBlock width="60%" height="0.7rem" style={{ marginBottom: '0.75rem' }} />
          <SkeletonBlock width="45%" height="1.75rem" style={{ marginBottom: '0.5rem' }} />
          <SkeletonBlock width="80%" height="0.65rem" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 6 }) {
  return (
    <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBlock key={i} width="70%" height="0.65rem" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '0.5rem', padding: '0.75rem 1rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {Array.from({ length: cols }).map((_, ci) => (
            <SkeletonBlock key={ci} width={ci === 0 ? '90%' : '60%'} height="0.75rem" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonZones() {
  return (
    <div className="admin-grid" style={{ marginBottom: '1.25rem' }}>
      {[1, 2, 3].map(i => (
        <div key={i} className="zone-card-dark" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <SkeletonBlock width="40%" height="0.9rem" />
            <SkeletonBlock width="20%" height="1.2rem" radius="6px" />
          </div>
          <SkeletonBlock width="35%" height="2rem" style={{ marginBottom: '0.75rem' }} />
          <SkeletonBlock height="6px" radius="3px" />
        </div>
      ))}
    </div>
  );
}

export default function LoadingSkeleton({ variant = 'card' }) {
  if (variant === 'metrics') return <SkeletonMetrics />;
  if (variant === 'table') return <SkeletonTable />;
  if (variant === 'zones') return <SkeletonZones />;

  return (
    <div className="admin-panel" style={{ padding: '2rem' }}>
      <SkeletonBlock width="30%" height="0.85rem" style={{ marginBottom: '1rem' }} />
      <SkeletonBlock height="1.5rem" style={{ marginBottom: '0.75rem' }} />
      <SkeletonBlock width="80%" height="0.75rem" style={{ marginBottom: '0.5rem' }} />
      <SkeletonBlock width="60%" height="0.75rem" />
    </div>
  );
}

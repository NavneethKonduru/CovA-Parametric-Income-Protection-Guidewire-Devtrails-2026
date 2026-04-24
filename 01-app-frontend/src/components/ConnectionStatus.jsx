/**
 * ConnectionStatus — WebSocket health indicator.
 * States: connected (green), reconnecting (yellow pulse), disconnected (red)
 */
export default function ConnectionStatus({ status = 'disconnected' }) {
  const config = {
    connected:    { color: 'var(--status-safe)',   label: 'Live',          animate: false },
    reconnecting: { color: 'var(--status-watch)',  label: 'Reconnecting…', animate: true },
    disconnected: { color: 'var(--status-danger)', label: 'Offline',       animate: false },
  };

  const c = config[status] || config.disconnected;

  return (
    <div className="conn-status" title={`WebSocket: ${c.label}`}>
      <span
        className={`conn-dot ${c.animate ? 'conn-dot-pulse' : ''}`}
        style={{ background: c.color, boxShadow: `0 0 6px ${c.color}` }}
      />
      <span className="conn-label">{c.label}</span>
    </div>
  );
}

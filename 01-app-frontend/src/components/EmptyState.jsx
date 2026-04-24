/**
 * EmptyState — Contextual empty state with icon, message, and optional action.
 */
export default function EmptyState({ icon = '📭', title, subtitle, action, onAction }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-title">{title || 'No data available'}</div>
      {subtitle && <div className="empty-state-subtitle">{subtitle}</div>}
      {action && onAction && (
        <button className="empty-state-action" onClick={onAction}>{action}</button>
      )}
    </div>
  );
}

/**
 * StatusBadge — maps all 10 CovA claim states + Guidewire statuses to semantic visual badges.
 * Supports: sm | md (default) | lg sizes.
 */
const STATE_MAP = {
  // === CovA claim lifecycle states (from engines/state-machine.js) ===
  pending_telemetry:           { label: 'AWAITING EVIDENCE',   color: 'var(--status-processing)', bg: 'var(--status-processing-bg)' },
  eligible_pending_validation: { label: 'VALIDATING',          color: 'var(--status-info)',       bg: 'var(--status-info-bg)' },
  held_fraud_review:           { label: 'UNDER REVIEW',        color: 'var(--status-held)',       bg: 'var(--status-held-bg)' },
  approved_auto:               { label: 'AUTO-APPROVED',       color: 'var(--status-safe)',       bg: 'var(--status-safe-bg)' },
  manual_approved:             { label: 'MANUALLY APPROVED',   color: 'var(--status-safe)',       bg: 'var(--status-safe-bg)' },
  processing_payout:           { label: 'PROCESSING PAYOUT',   color: 'var(--status-processing)', bg: 'var(--status-processing-bg)' },
  paid:                        { label: 'PAID',                color: 'var(--status-safe)',       bg: 'var(--status-safe-bg)' },
  payout_failed:               { label: 'PAYOUT FAILED',       color: 'var(--status-danger)',     bg: 'var(--status-danger-bg)' },
  rejected_fraud:              { label: 'REJECTED — FRAUD',    color: 'var(--status-danger)',     bg: 'var(--status-danger-bg)' },
  rejected:                    { label: 'REJECTED',            color: 'var(--status-danger)',     bg: 'var(--status-danger-bg)' },
  expired_no_evidence:         { label: 'EXPIRED',             color: 'var(--text-disabled)',     bg: 'rgba(75,85,99,0.15)' },
  // Legacy / simplified states
  approved:                    { label: 'APPROVED',            color: 'var(--status-safe)',       bg: 'var(--status-safe-bg)' },
  flagged:                     { label: 'FLAGGED',             color: 'var(--status-held)',       bg: 'var(--status-held-bg)' },
  pending:                     { label: 'PENDING',             color: 'var(--status-info)',       bg: 'var(--status-info-bg)' },
  PAID:                        { label: 'PAID',                color: 'var(--status-safe)',       bg: 'var(--status-safe-bg)' },
};

export default function StatusBadge({ status, size = 'md', className = '' }) {
  const key = (status || 'pending').toLowerCase();
  const config = STATE_MAP[key] || STATE_MAP[status] || { label: (status || 'UNKNOWN').toUpperCase(), color: 'var(--text-muted)', bg: 'rgba(107,114,128,0.15)' };
  
  const sizeClass = size === 'sm' ? 'status-badge-sm' : size === 'lg' ? 'status-badge-lg' : '';

  return (
    <span
      className={`cova-status-badge ${sizeClass} ${className}`}
      style={{ color: config.color, background: config.bg, borderColor: config.color }}
    >
      {config.label}
    </span>
  );
}

/** Returns the human-readable label for a claim state */
export function getStatusLabel(status) {
  const key = (status || 'pending').toLowerCase();
  return (STATE_MAP[key] || STATE_MAP[status])?.label || (status || 'UNKNOWN').toUpperCase();
}

/** Returns the semantic color for a claim state */
export function getStatusColor(status) {
  const key = (status || 'pending').toLowerCase();
  return (STATE_MAP[key] || STATE_MAP[status])?.color || 'var(--text-muted)';
}

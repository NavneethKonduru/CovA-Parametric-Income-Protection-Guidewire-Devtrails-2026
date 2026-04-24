import StatusBadge from './StatusBadge';

/**
 * EvidenceDrawer — Expandable claim evidence chain for insurer/admin view.
 * Shows CDI signals, TCHC fraud analysis, AI explanation, payout details, Guidewire status.
 */

const SEVERITY_COLORS = {
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)' },
  high:     { color: '#F97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.2)' },
  medium:   { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
  low:      { color: '#6B7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.2)' },
};

const TCHC_LABELS = {
  hardware: { icon: '🔧', label: 'Hardware Layer', desc: 'GNSS/device signal validation' },
  temporal: { icon: '⏱️', label: 'Temporal Layer', desc: 'Timing & velocity analysis' },
  spatial:  { icon: '📍', label: 'Spatial Layer', desc: 'Location & zone verification' },
};

function FraudFlagRow({ flag }) {
  const sev = SEVERITY_COLORS[flag.severity] || SEVERITY_COLORS.medium;
  return (
    <div className="evidence-flag" style={{ borderLeftColor: sev.color }}>
      <div className="evidence-flag-header">
        <span className="evidence-flag-rule">{flag.rule?.replace(/_/g, ' ')}</span>
        <span className="evidence-flag-severity" style={{ color: sev.color, background: sev.bg, borderColor: sev.border }}>
          {flag.severity?.toUpperCase()}
        </span>
      </div>
      <div className="evidence-flag-desc">{flag.description}</div>
      {flag.auto_reject && (
        <div className="evidence-flag-reject">⛔ Auto-reject triggered</div>
      )}
    </div>
  );
}

function TCHCLayers({ tchcLayer }) {
  if (!tchcLayer) return null;
  return (
    <div className="evidence-tchc">
      <div className="evidence-section-title">TCHC Consensus Layers</div>
      <div className="evidence-tchc-grid">
        {Object.entries(TCHC_LABELS).map(([key, config]) => {
          const active = tchcLayer[key];
          return (
            <div key={key} className={`evidence-tchc-layer ${active ? 'active' : 'inactive'}`}>
              <span className="evidence-tchc-icon">{config.icon}</span>
              <div>
                <div className="evidence-tchc-label">{config.label}</div>
                <div className="evidence-tchc-desc">{config.desc}</div>
              </div>
              <span className={`evidence-tchc-status ${active ? 'triggered' : ''}`}>
                {active ? 'TRIGGERED' : 'CLEAR'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EvidenceDrawer({ claim, expanded = true }) {
  if (!expanded || !claim) return null;

  const fraudResult = typeof claim.fraud_result === 'string'
    ? (() => { try { return JSON.parse(claim.fraud_result); } catch { return null; } })()
    : claim.fraud_result;

  const flags = fraudResult?.flags || [];
  const fraudScore = parseFloat(claim.fraud_confidence || fraudResult?.fraudScore || 0);
  const cdi = parseFloat(claim.cdi || 0);
  const payout = parseFloat(claim.payout_amount || claim.payoutAmount || 0);

  return (
    <div className="evidence-drawer">
      {/* CDI Context */}
      <div className="evidence-section">
        <div className="evidence-section-title">Trigger Context</div>
        <div className="evidence-kv-grid">
          <div className="evidence-kv">
            <span className="evidence-kv-label">CDI at Trigger</span>
            <span className="evidence-kv-value">{(cdi * 100).toFixed(1)}%</span>
          </div>
          <div className="evidence-kv">
            <span className="evidence-kv-label">Disruption Type</span>
            <span className="evidence-kv-value">{claim.disruption_type || claim.disruptionType || '—'}</span>
          </div>
          <div className="evidence-kv">
            <span className="evidence-kv-label">Time Slot</span>
            <span className="evidence-kv-value">{claim.time_slot || claim.timeSlot || '—'}</span>
          </div>
          <div className="evidence-kv">
            <span className="evidence-kv-label">Hours Lost</span>
            <span className="evidence-kv-value">{parseFloat(claim.hours_lost || 0).toFixed(1)}h</span>
          </div>
          <div className="evidence-kv">
            <span className="evidence-kv-label">Zone</span>
            <span className="evidence-kv-value">{claim.zone || '—'}</span>
          </div>
          <div className="evidence-kv">
            <span className="evidence-kv-label">Validation</span>
            <span className="evidence-kv-value">{claim.validation_status || '—'}</span>
          </div>
        </div>
      </div>

      {/* Fraud Analysis */}
      <div className="evidence-section">
        <div className="evidence-section-title">Fraud Screening</div>
        <div className="evidence-fraud-header">
          <div className="evidence-kv">
            <span className="evidence-kv-label">Fraud Confidence</span>
            <span className="evidence-kv-value" style={{
              color: fraudScore >= 0.85 ? 'var(--status-danger)' : fraudScore >= 0.45 ? 'var(--status-held)' : 'var(--status-safe)'
            }}>
              {(fraudScore * 100).toFixed(1)}%
            </span>
          </div>
          <div className="evidence-kv">
            <span className="evidence-kv-label">Action</span>
            <span className="evidence-kv-value">{fraudResult?.action?.replace(/_/g, ' ') || 'pass'}</span>
          </div>
          <div className="evidence-kv">
            <span className="evidence-kv-label">Flags</span>
            <span className="evidence-kv-value">{flags.length}</span>
          </div>
        </div>

        <TCHCLayers tchcLayer={fraudResult?.tchcLayer} />

        {flags.length > 0 && (
          <div className="evidence-flags-list">
            {flags.map((flag, i) => <FraudFlagRow key={i} flag={flag} />)}
          </div>
        )}

        {flags.length === 0 && (
          <div className="evidence-clean">✓ No fraud flags — clean evidence chain</div>
        )}
      </div>

      {/* AI Explanation */}
      {claim.ai_explanation && (
        <div className="evidence-section">
          <div className="evidence-section-title">AI Decision Summary</div>
          <div className="evidence-ai">
            <span className="evidence-ai-badge">Groq/llama-3.3</span>
            <p className="evidence-ai-text">{claim.ai_explanation}</p>
          </div>
        </div>
      )}

      {/* Payout */}
      {payout > 0 && (
        <div className="evidence-section">
          <div className="evidence-section-title">Settlement</div>
          <div className="evidence-kv-grid">
            <div className="evidence-kv">
              <span className="evidence-kv-label">Payout Amount</span>
              <span className="evidence-kv-value" style={{ color: 'var(--status-safe)', fontWeight: 700 }}>₹{payout.toLocaleString()}</span>
            </div>
            {(claim.payout_txn_id || claim.payoutTxnId) && (
              <div className="evidence-kv">
                <span className="evidence-kv-label">Transaction ID</span>
                <span className="evidence-kv-value" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {claim.payout_txn_id || claim.payoutTxnId}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Data Origin */}
      <div className="evidence-footer">
        <span className="evidence-data-origin">
          {claim.data_mode === 'DEMO' ? '🔶 DEMO DATA' : claim.data_mode === 'real' ? '🟢 PRODUCTION' : `📋 ${claim.data_mode || 'DEMO'}`}
        </span>
        <span className="evidence-timestamp">
          {claim.created_at ? new Date(claim.created_at).toLocaleString() : '—'}
        </span>
      </div>
    </div>
  );
}

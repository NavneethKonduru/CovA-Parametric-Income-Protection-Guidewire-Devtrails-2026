/**
 * ModeBanner — Environment awareness indicator.
 * Shows DEMO MODE (amber) or PRODUCTION (green) to prevent mode confusion.
 */
export default function ModeBanner({ mode, compact = false }) {
  const isDemo = !mode || mode === 'DEMO' || mode === 'demo';

  if (compact) {
    return (
      <span className={`mode-pill ${isDemo ? 'mode-demo' : 'mode-prod'}`}>
        <span className="mode-pill-dot" />
        {isDemo ? 'DEMO' : 'PROD'}
      </span>
    );
  }

  if (!isDemo) return null; // Production doesn't need a banner, just the pill

  return (
    <div className="mode-banner mode-banner-demo">
      <span className="mode-banner-icon">⚡</span>
      <span className="mode-banner-text">
        DEMO ENVIRONMENT — Simulation data active. Not connected to production systems.
      </span>
    </div>
  );
}

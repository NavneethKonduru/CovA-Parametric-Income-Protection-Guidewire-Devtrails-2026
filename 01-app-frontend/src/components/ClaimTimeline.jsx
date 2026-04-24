import React, { useState, useEffect } from 'react';

export default function ClaimTimeline({ claimId, claim }) {
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Maintain compatibility if the parent passes `claim` object instead of purely `claimId`
  const effectiveClaimId = claimId || claim?.id;

  const fetchTimeline = async () => {
    if (!effectiveClaimId) {
      setLoading(false);
      return;
    }
    
    try {
      const res = await fetch(`/api/claims/${effectiveClaimId}/timeline`);
      if (!res.ok) throw new Error('Failed to fetch timeline');
      const data = await res.json();
      setTimeline(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeline();
    
    // Poll every 10 seconds if not settled
    const interval = setInterval(() => {
      if (timeline && timeline.currentStage !== "Settlement") {
        fetchTimeline();
      }
    }, 10000);
    
    return () => clearInterval(interval);
  }, [effectiveClaimId, timeline?.currentStage]);

  const handleDispute = async () => {
    try {
      const res = await fetch(`/api/claims/${effectiveClaimId}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: "Disputed from UI", description: "Worker initiated dispute" })
      });
      const data = await res.json();
      alert(`Dispute ${data.disputeId} logged. Status: ${data.status}. Est: ${data.estimatedResolution}`);
    } catch (err) {
      alert('Failed to log dispute');
    }
  };

  if (loading && !timeline) return <div style={{ color: '#fff', padding: '1rem', fontSize: '0.9rem' }}>Loading timeline...</div>;
  if (error) return <div style={{ color: '#ef4444', padding: '1rem', fontSize: '0.9rem' }}>Error: {error}</div>;
  if (!timeline) return null;

  return (
    <div style={{ background: '#1c1c1c', padding: '1.25rem', borderRadius: '12px', color: '#fff', fontFamily: 'sans-serif' }}>
      <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1rem', fontWeight: 600, color: '#f3f4f6' }}>Claim Lifecycle</h3>
      
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {timeline.stages.map((stage, idx) => {
          const isLast = idx === timeline.stages.length - 1;
          
          let iconColor = '#6b7280'; // pending
          if (stage.status === 'complete') iconColor = '#10b981'; // green
          if (stage.status === 'flagged') iconColor = '#f97316'; // orange
          if (stage.status === 'rejected') iconColor = '#ef4444'; // red
          if (stage.status === 'pending') iconColor = '#eab308'; // yellow

          return (
            <div key={idx} style={{ display: 'flex', position: 'relative' }}>
              {/* Timeline connector line */}
              {!isLast && (
                <div style={{
                  position: 'absolute', top: '24px', left: '11px', width: '2px', height: '100%',
                  background: stage.status === 'complete' ? '#10b981' : '#374151', zIndex: 0
                }} />
              )}
              
              {/* Stage Dot/Icon */}
              <div style={{
                width: '24px', height: '24px', borderRadius: '50%', background: iconColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1, marginTop: '2px', flexShrink: 0,
                boxShadow: `0 0 0 4px #1c1c1c`
              }}>
                {stage.status === 'complete' && <span style={{ color: '#fff', fontSize: '10px', fontWeight: 'bold' }}>✓</span>}
                {stage.status === 'flagged' && <span style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>!</span>}
                {stage.status === 'rejected' && <span style={{ color: '#fff', fontSize: '10px', fontWeight: 'bold' }}>✕</span>}
                {stage.status === 'pending' && <span style={{ color: '#fff', fontSize: '14px', lineHeight: '14px', transform: 'translateY(-2px)' }}>⋯</span>}
              </div>

              {/* Stage Content */}
              <div style={{ marginLeft: '1rem', paddingBottom: isLast ? '0' : '1.5rem', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 500, color: '#f3f4f6' }}>{stage.stage}</div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    {new Date(stage.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </div>
                </div>
                
                <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.25rem', lineHeight: '1.4' }}>
                  {stage.detail}
                </div>

                {stage.stage === 'Fraud Check' && stage.status === 'flagged' && (
                  <div style={{
                    marginTop: '0.5rem', padding: '0.4rem 0.6rem', borderRadius: '6px',
                    background: 'rgba(249, 115, 22, 0.1)', color: '#f97316', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', border: '1px solid rgba(249, 115, 22, 0.2)'
                  }}>
                    ⚠️ Under Manual Review
                  </div>
                )}

                {stage.stage === 'Payment' && stage.status === 'complete' && timeline.payoutDetails && (
                  <div style={{
                    marginTop: '0.75rem', padding: '0.8rem', borderRadius: '8px',
                    background: '#262626', border: '1px solid #404040', fontFamily: 'monospace', fontSize: '0.75rem', color: '#d1d5db'
                  }}>
                    <div style={{ color: '#10b981', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.8rem' }}>💸 Payout Confirmed</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}><span>Amount:</span> <span>₹{timeline.payoutDetails.amount}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}><span>UPI:</span> <span>{timeline.payoutDetails.upiId}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}><span>Transaction ID:</span> <span>{timeline.payoutDetails.txnId}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}><span>UPI Ref:</span> <span>{timeline.payoutDetails.upiRef}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}><span>Time:</span> <span>{new Date(timeline.payoutDetails.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Razorpay:</span> <span>{timeline.payoutDetails.razorpayPayoutId}</span></div>
                  </div>
                )}

                {stage.stage === 'Settlement' && (
                  <button onClick={handleDispute} style={{
                    marginTop: '0.75rem', padding: '0.4rem 0.8rem', borderRadius: '6px',
                    background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', cursor: 'pointer', fontSize: '0.75rem', transition: 'all 0.2s ease'
                  }}>
                    Raise Dispute
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer / AI Summary */}
      <div style={{
        marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)',
        fontSize: '0.8rem'
      }}>
        {timeline.aiExplanation && (
          <div style={{ marginBottom: '1rem', color: '#9ca3af', lineHeight: '1.5', background: 'rgba(6, 182, 212, 0.05)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(6, 182, 212, 0.1)' }}>
            <div style={{ color: 'rgba(6, 182, 212, 0.8)', fontWeight: 600, marginBottom: '0.25rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🤖 AI Summary</div>
            {timeline.aiExplanation}
          </div>
        )}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#6b7280'
        }}>
          <div>Total Lifecycle: <span style={{ color: '#d1d5db' }}>{timeline.totalTime}</span></div>
          <div style={{
            padding: '0.2rem 0.5rem', background: '#374151', borderRadius: '4px', color: '#f3f4f6', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.3px'
          }}>
            [AI: {timeline.aiSystem || "Groq/llama-3.3"}]
          </div>
        </div>
      </div>
    </div>
  );
}

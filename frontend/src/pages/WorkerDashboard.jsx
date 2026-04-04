import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL, getWsUrl } from '../utils/api';
import CDIGauge from '../components/CDIGauge';
import ClaimTimeline from '../components/ClaimTimeline';

export default function WorkerDashboard({ token, workerId, onLogout }) {
  const [worker, setWorker] = useState(null);
  const [premium, setPremium] = useState({});
  const [claims, setClaims] = useState([]);
  const [cdiData, setCdiData] = useState({});
  const [signalState, setSignalState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedClaimId, setExpandedClaimId] = useState(null);
  const wsRef = useRef(null);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchData = async () => {
    try {
      const id = workerId || 'W001';
      
      // Fetch worker data
      const wRes = await fetch(`${API_BASE_URL}/api/workers/${id}`, { headers });
      if (wRes.ok) {
        const wData = await wRes.json();
        setWorker(wData.worker);
        setPremium(wData.premium || {});
      }

      // Fetch claims
      const cRes = await fetch(`${API_BASE_URL}/api/claims?workerId=${id}`, { headers });
      if (cRes.ok) {
        const cData = await cRes.json();
        setClaims(cData.claims || cData || []);
      } else {
        // Fallback backward compatibility
        const cResFallback = await fetch(`${API_BASE_URL}/api/claims/worker/${id}`, { headers });
        if (cResFallback.ok) {
          const cDataFallback = await cResFallback.json();
          setClaims(cDataFallback.claims || []);
        }
      }

      // Fetch current signal state
      const sRes = await fetch(`${API_BASE_URL}/api/workers/${id}/signal`, { headers });
      if (sRes.ok) {
        const sData = await sRes.json();
        setSignalState(sData.signalState);
      }
      
    } catch (err) {
      console.error('Fetch error:', err);
    }
    setLoading(false);
  };

  // Initial Data Fetch
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

    // WebSocket for live updates
    useEffect(() => {
      const wsUrl = getWsUrl();
      const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const id = workerId || 'W001';

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'CDI_UPDATE') {
        setCdiData(prev => ({ ...prev, [msg.payload.zone]: msg.payload }));
      }
      if (msg.type === 'WORKER_SIGNAL_UPDATE' && (msg.workerId === id || msg.payload?.workerId === id)) {
        setSignalState(msg.payload?.signalState || msg.signalState || msg.payload);
      }
      if (msg.type === 'HEALTH_UPDATE_NEEDED') {
        fetchData();
      }
      if (msg.type === 'CLAIM_CREATED' || msg.type === 'PAYOUT_SENT') {
        // Just refresh claims
        fetch(`/api/claims?workerId=${id}`, { headers })
          .then(async r => {
            if (r.ok) { const d = await r.json(); return d.claims || d; }
            const fb = await fetch(`/api/claims/worker/${id}`, { headers });
            const d = await fb.json();
            return d.claims || [];
          })
          .then(c => setClaims(c))
          .catch(e => console.error(e));
      }
    };

    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="admin-layout">
        <div className="admin-header"><h1>🏍️ CovA Worker Dashboard</h1></div>
        <div className="admin-content">
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '4rem 0', gap: '1rem',
          }}>
            <div style={{
              width: '40px', height: '40px', border: '3px solid rgba(6, 182, 212, 0.2)',
              borderTopColor: '#06B6D4', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem' }}>Loading dashboard...</span>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  const zone = worker?.zone || 'ZONE_A';
  const platform = worker?.platform || 'Unknown';
  const zoneCdi = cdiData[zone];
  const cdiValue = zoneCdi?.cdi || 0;
  const zoneNames = { ZONE_A: 'Koramangala', ZONE_B: 'Whitefield', ZONE_C: 'Indiranagar' };

  // Premium Economics calculations
  const enrolledDate = worker?.enrolledDate || new Date().toISOString().split('T')[0];
  const enrolledYear = new Date(enrolledDate).getFullYear();
  const enrolledMonth = new Date(enrolledDate).getMonth();
  const enrolledDay = new Date(enrolledDate).getDate();
  const expiryDate = new Date(enrolledYear + 1, enrolledMonth, enrolledDay).toISOString().split('T')[0];

  const weeksActive = Math.max(1, Math.floor((new Date() - new Date(enrolledDate)) / (1000 * 60 * 60 * 24 * 7)));
  const weeklyPremium = premium?.weeklyPremium || worker?.weeklyPremium || 49;
  const totalPremium = weeklyPremium * weeksActive;
  const dailyCoverCap = premium?.dailyCoverCap || (worker?.hourlyRate ? worker.hourlyRate * 8 : 680);
  
  const modelUsed = premium?.modelUsed || premium?.strategy || 'actuarial_formula';
  const modelIsML = modelUsed === 'gbr_lookup_table';

  // Claims and Payout Calculations
  const paidClaims = claims.filter(c => c.status === 'paid');
  const totalPayouts = paidClaims.reduce((sum, c) => sum + (c.payoutAmount || 0), 0);
  const netPosition = totalPayouts - totalPremium;
  const last3Payouts = [...paidClaims].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 3);
  const pendingClaims = claims.filter(c => c.status === 'pending' || c.status === 'approved').length;

  return (
    <div className="worker-layout">
      {/* Header */}
      <div className="worker-header">
        <h1>🏍️ CovA Worker Dashboard</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {signalState?.platform_active ? <span className="live-dot" style={{ background: '#10B981'}}></span> : <span className="live-dot" style={{ background: '#EF4444'}}></span>}
          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
            {worker?.name || 'Worker'} · {zoneNames[zone] || zone}
          </span>
          {onLogout && (
            <button className="btn-logout" onClick={onLogout}>Logout</button>
          )}
        </div>
      </div>

      <div className="worker-content">

        {/* 1. POLICY CARD */}
        <div className="admin-panel" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🛡️ CovA Income Shield
              </div>
              <div style={{ fontFamily: 'monospace', color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Policy: POL-{worker?.id}-{enrolledDate.replace(/-/g, '')}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                display: 'inline-block', padding: '0.25rem 0.6rem', borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)',
                color: '#10B981', fontSize: '0.75rem', fontWeight: 600,
              }}>
                ACTIVE ✅
              </div>
              <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Valid until: {expiryDate}
              </div>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', background: '#1f1f1f', padding: '1rem', borderRadius: '8px' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase' }}>Zone</div>
              <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 500 }}>{zoneNames[zone] || zone}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase' }}>Platform</div>
              <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 500 }}>{platform}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase' }}>Daily Cover Cap</div>
              <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 500 }}>₹{dailyCoverCap}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase' }}>Weekly Premium</div>
              <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 500 }}>₹{weeklyPremium}</div>
            </div>
            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #333', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Pricing Engine</div>
              <div style={{
                padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600,
                background: modelIsML ? 'rgba(59, 130, 246, 0.15)' : 'rgba(107, 114, 128, 0.15)',
                color: modelIsML ? '#3B82F6' : '#9ca3af', border: `1px solid ${modelIsML ? 'rgba(59, 130, 246, 0.3)' : 'rgba(107, 114, 128, 0.3)'}`
              }}>
                {modelIsML ? 'ML/GBR' : 'Actuarial Formula'}
              </div>
            </div>
          </div>
        </div>

        {/* 4. PREMIUM ECONOMICS */}
        <div className="admin-panel" style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: '0 0 0.25rem 0' }}>Premium Economics</h3>
            <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
              You've paid <span style={{ color: '#fff' }}>₹{totalPremium}</span> in premiums, received <span style={{ color: '#fff' }}>₹{totalPayouts}</span> in payouts
            </div>
          </div>
          <div style={{
            padding: '0.5rem 1rem', borderRadius: '8px', 
            background: netPosition >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: netPosition >= 0 ? '#10B981' : '#EF4444', 
            fontWeight: 700, fontSize: '1.1rem'
          }}>
            Net: {netPosition >= 0 ? '+' : '-'}₹{Math.abs(netPosition)}
          </div>
        </div>

        <div className="admin-grid">
          {/* Signal Status Component */}
          <div className="admin-panel">
            <h3>Live Worker Signal</h3>
            {signalState ? (
              <div style={{ fontSize: '0.85rem', color: '#d1d5db', lineHeight: '1.6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Location:</span> <span>{signalState.lat?.toFixed(4)}, {signalState.lng?.toFixed(4)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Velocity:</span> <span>{signalState.velocity} km/h</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>App Status:</span> 
                  <span style={{ color: signalState.platform_active ? '#10B981' : '#EF4444' }}>
                    {signalState.platform_active ? 'Online' : 'Offline'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Signal Mode:</span> 
                  <span style={{ textTransform: 'capitalize' }}>{signalState.signal_mode}</span>
                </div>
              </div>
            ) : (
               <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Waiting for signals...</div>
            )}
          </div>

          {/* 3. PAYOUT HISTORY */}
          <div className="admin-panel">
            <h3>Payout History</h3>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#10B981' }}>
              ₹{totalPayouts.toFixed(0)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem', marginBottom: '1rem' }}>
              Total Paid Out ({paidClaims.length} claims)
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {last3Payouts.length > 0 ? last3Payouts.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.4rem', background: '#1c1c1c', borderRadius: '4px' }}>
                  <span style={{ color: '#fff' }}>₹{p.payoutAmount}</span>
                  <span style={{ color: '#9ca3af' }}>{new Date(p.timestamp).toLocaleDateString()}</span>
                </div>
              )) : (
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>No payouts yet</div>
              )}
            </div>
          </div>

          {/* Existing CDI Gauge */}
          <div className="admin-panel">
            <h3>Zone Disruption Index — {zoneNames[zone]}</h3>
            <CDIGauge
              signals={zoneCdi?.signals || {
                weather: zoneCdi?.weatherScore || 0,
                demand: zoneCdi?.demandScore || 0,
                peer: zoneCdi?.peerScore || 0,
              }}
              cdi={cdiValue}
              threshold={zoneCdi?.threshold || 0.6}
            />
          </div>

          {/* 2. CLAIMS LIST with expandable timeline */}
          <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <span className="live-dot"></span>
                Claims History ({claims.length})
              </span>
              {pendingClaims > 0 && (
                <span style={{
                  padding: '0.15rem 0.5rem', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.12)',
                  color: '#06B6D4', fontSize: '0.65rem', fontWeight: 600,
                }}>{pendingClaims} pending</span>
              )}
            </h3>

            {claims.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', color: 'rgba(255,255,255,0.25)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }}>🛡️</div>
                <div style={{ fontSize: '0.85rem' }}>No claims yet</div>
                <div style={{ fontSize: '0.72rem', marginTop: '0.25rem', color: 'rgba(255,255,255,0.15)' }}>
                  When a disruption hits your zone, claims trigger automatically.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {claims.slice(0, 10).map((claim) => (
                  <div key={claim.id} style={{ border: '1px solid #333', borderRadius: '8px', overflow: 'hidden' }}>
                    
                    {/* Collapsible Row Header */}
                    <div 
                      onClick={() => setExpandedClaimId(expandedClaimId === claim.id ? null : claim.id)}
                      style={{ 
                        padding: '1rem', background: '#1f1f1f', cursor: 'pointer', 
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        borderBottom: expandedClaimId === claim.id ? '1px solid #333' : 'none'
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ 
                          width: '8px', height: '8px', borderRadius: '50%',
                          background: claim.status === 'paid' ? '#10B981' : claim.status === 'rejected' ? '#EF4444' : '#F59E0B' 
                        }} />
                        <div>
                          <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 500 }}>Claim {claim.id}</div>
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.2rem' }}>
                            {new Date(claim.timestamp).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 600 }}>
                            ₹{claim.payoutAmount || 0}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase', marginTop: '0.2rem' }}>
                            {claim.status}
                          </div>
                        </div>
                        <div style={{ color: '#6b7280', transform: expandedClaimId === claim.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                          ▼
                        </div>
                      </div>
                    </div>
                    
                    {/* Expanded Content: ClaimTimeline */}
                    {expandedClaimId === claim.id && (
                      <div style={{ padding: '1rem', background: '#141414' }} onClick={e => e.stopPropagation()}>
                        <ClaimTimeline claimId={claim.id} claim={claim} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

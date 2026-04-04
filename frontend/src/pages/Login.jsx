import { useState } from 'react';
import { API_BASE_URL } from '../utils/api';

export default function Login({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const roles = [
    { email: 'worker@cova.in', role: 'worker', icon: '🏍️', name: 'Delivery Worker', desc: 'Mobile-first — onboard, track CDI, view claims' },
    { email: 'insurer@cova.in', role: 'insurer', icon: '🏢', name: 'Insurer (HDFC ERGO)', desc: 'Configure policy, monitor claims, submit to Guidewire' },
    { email: 'admin@cova.in', role: 'admin', icon: '⚙️', name: 'ClaimCrypt Admin', desc: 'CDI weights, fraud rules, simulations, system health' },
  ];

  const handleRoleClick = async (email) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(API_BASE_URL + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'cova2026' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      onLogin(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="login-screen" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)' }}>
      <div className="login-container" style={{ 
        background: 'rgba(6, 182, 212, 0.03)', 
        borderColor: 'rgba(6, 182, 212, 0.15)',
        boxShadow: '0 0 80px rgba(6, 182, 212, 0.08), 0 8px 32px rgba(0,0,0,0.4)'
      }}>
        {/* Glowing CovA Logo */}
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{
            fontSize: '0.7rem',
            fontWeight: 600,
            letterSpacing: '3px',
            textTransform: 'uppercase',
            color: 'rgba(6, 182, 212, 0.6)',
          }}>⚡ POWERED BY GUIDEWIRE</span>
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight" style={{ 
          background: 'linear-gradient(135deg, #06B6D4, #22D3EE, #fff)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '0.25rem',
        }}>CovA</h1>
        <p className="tagline" style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem' }}>
          Coverage, Automated — Parametric Income Protection
        </p>

        {/* Subtle divider */}
        <div style={{ 
          height: '1px', 
          background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.3), transparent)', 
          margin: '1.5rem 0' 
        }} />

        <div className="role-cards">
          {roles.map((r) => (
            <button
              key={r.role}
              className="role-card group"
              onClick={() => handleRoleClick(r.email)}
              disabled={loading}
              style={{
                borderColor: 'rgba(6, 182, 212, 0.1)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.4)';
                e.currentTarget.style.background = 'rgba(6, 182, 212, 0.08)';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(6, 182, 212, 0.15)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.1)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span className="role-icon">{r.icon}</span>
              <div className="role-info">
                <h3 style={{ color: '#E2E8F0' }}>{r.name}</h3>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.76rem' }}>{r.desc}</p>
              </div>
              <span style={{ 
                marginLeft: 'auto', 
                color: 'rgba(6, 182, 212, 0.4)', 
                fontSize: '1.2rem',
                transition: 'transform 0.2s ease'
              }}>→</span>
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-4 text-sm" style={{ color: '#EF4444' }}>{error}</p>
        )}

        <div className="login-footer" style={{ color: 'rgba(255,255,255,0.2)' }}>
          <span style={{ color: 'rgba(6, 182, 212, 0.4)' }}>●</span> Team ClaimCrypt · Guidewire DEVTrails 2026
        </div>
      </div>
    </div>
  );
}

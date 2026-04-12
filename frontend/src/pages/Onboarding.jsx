import { useState, useEffect } from 'react';
import { API_BASE, getWsUrl } from '../config';

const ZONES = [
  { id: 'ZONE_A', name: 'Koramangala', risk: 'Medium', riskFactor: 1.0, color: '#F59E0B' },
  { id: 'ZONE_B', name: 'Whitefield', risk: 'High', riskFactor: 1.3, color: '#EF4444' },
  { id: 'ZONE_C', name: 'Indiranagar', risk: 'Low', riskFactor: 0.8, color: '#10B981' },
];

const PLATFORMS = ['Zepto', 'Blinkit', 'Swiggy Instamart', 'Dunzo', 'BigBasket Now'];
const ARCHETYPES = [
  { id: 'heavy_peak', label: 'Heavy Peak', time: '12-2PM, 7-10PM', desc: 'Maximum surge hours', multiplier: 1.4, icon: '🔥' },
  { id: 'balanced', label: 'Balanced', time: 'All hours', desc: 'Even distribution', multiplier: 1.0, icon: '⚖️' },
  { id: 'casual', label: 'Casual', time: 'Off-peak', desc: 'Fewer hours, lower risk', multiplier: 0.7, icon: '🌤️' },
];

const BASE_PREMIUM = 35;
const HOURLY_RATE = 100;

export default function Onboarding({ token, onWorkerCreated }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    upiId: '',
    aadhaar: '',
    dpdpConsent: false,
    zone: '',
    platform: '',
    archetype: '',
    peakHoursPerWeek: 20
  });

  const [formErrors, setFormErrors] = useState({});
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paymentState, setPaymentState] = useState('idle'); // idle, processing, success
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const selectedZone = ZONES.find(z => z.id === form.zone);
  const selectedArchetype = ARCHETYPES.find(a => a.id === form.archetype);

  // Update premium preview when dependencies change
  useEffect(() => {
    let active = true;

    const fetchPreview = async () => {
      if (!form.zone || !form.archetype) return;

      try {
        const res = await fetch(`${API_BASE}/api/workers/premium-preview?zone=${form.zone}&archetype=${form.archetype}&peakHours=${form.peakHoursPerWeek}`);
        if (res.ok) {
          const data = await res.json();
          if (active) setPreview(data.premium);
        } else {
          throw new Error('API not available');
        }
      } catch (err) {
        // Fallback to local computation
        if (active) {
          const zFactor = ZONES.find(z => z.id === form.zone)?.riskFactor || 1.0;
          const aFactor = ARCHETYPES.find(a => a.id === form.archetype)?.multiplier || 1.0;
          const premium = (BASE_PREMIUM * zFactor * aFactor).toFixed(2);
          setPreview(premium);
        }
      }
    };

    fetchPreview();

    return () => {
      active = false;
    };
  }, [form.zone, form.archetype, form.peakHoursPerWeek]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    // Clear specific field error when user types
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleArchetypeClick = (id) => {
    setForm(prev => ({ ...prev, archetype: id }));
    if (formErrors.archetype) {
      setFormErrors(prev => ({ ...prev, archetype: null }));
    }
  };

  const validateStep = (currentStep) => {
    let errors = {};
    if (currentStep === 1) {
      if (!form.name.trim()) errors.name = 'Full Name is required.';
      if (!form.phone.trim()) {
        errors.phone = 'Phone number is required.';
      } else if (!/^\d{10}$/.test(form.phone)) {
        errors.phone = 'Phone number must be exactly 10 digits.';
      }
      
      if (!form.upiId.trim()) {
        errors.upiId = 'UPI ID is required.';
      } else if (!form.upiId.includes('@')) {
        errors.upiId = 'UPI ID must contain an "@" symbol.';
      }
      
      if (!form.dpdpConsent) errors.dpdpConsent = 'Consent to the DPDP Act 2023 is required to proceed.';
    } else if (currentStep === 2) {
      if (!form.zone) errors.zone = 'Please select a delivery zone.';
      if (!form.platform) errors.platform = 'Please select a primary platform.';
      if (!form.archetype) errors.archetype = 'Please select a working archetype.';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(s => s + 1);
    }
  };

  const handleBack = () => {
    setStep(s => s - 1);
  };

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage('');
    }, 3000);
  };

  const simulatePayment = () => {
    setPaymentState('processing');
    setTimeout(() => {
      setPaymentState('success');
      setPaymentDetails({
        txnId: `TXN${Date.now()}`,
        upiRef: `COVA${Math.random().toString(36).substring(2, 10).toUpperCase()}`
      });
    }, 3000);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    
    // Convert to numbers if needed
    const payload = {
      ...form,
      rating: 4.8 // Fixed rating based on old app assumption or omit if not needed
    };

    try {
      const res = await fetch(`${API_BASE}/api/workers/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      // Guard against non-JSON responses (e.g. backend crash returning HTML)
      const contentType = res.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('[Onboarding] Non-JSON response from /api/workers/register:', res.status, text.substring(0, 200));
        throw new Error(`Server error (${res.status}). Please ensure the backend is running.`);
      }

      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setResult(data);
      setStep(5);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-[100dvh] bg-gray-900 text-white font-sans flex flex-col relative">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[60] bg-gray-800 border border-gray-600 text-white px-4 py-2 rounded-lg shadow-xl animate-fade-in text-sm font-medium whitespace-nowrap">
          {toastMessage}
        </div>
      )}

      {/* Sticky Header with Progress */}
      <div className="sticky top-0 z-50 p-4 border-b border-cyan-500/20 bg-gray-900/95 backdrop-blur-md flex justify-between items-center shadow-lg">
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-emerald-400">
          CovA
        </h1>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs font-semibold px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            Step {step}/5
          </span>
        </div>
      </div>
      
      {/* Sticky Progress Bar */}
      <div className="sticky top-[69px] z-40 bg-gray-900 w-full flex h-1">
        {[1, 2, 3, 4, 5].map(s => (
          <div key={s} className={`flex-1 transition-all duration-300 ${s <= step ? 'bg-gradient-to-r from-cyan-500 to-emerald-500' : 'bg-gray-800'}`} />
        ))}
      </div>

      <div className="p-6 flex-1 flex flex-col">
        <div className="flex-1">
          {/* STEP 1: Personal Info */}
          {step === 1 && (
            <div className="animate-fade-in space-y-4">
              <div className="text-center mb-6">
                <div className="text-4xl mb-2">🏍️</div>
                <h2 className="text-xl font-bold">Get Covered in 60 Seconds</h2>
                <p className="text-sm text-gray-400 mt-1">Zero-touch parametric income protection</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Full Name <span className="text-red-400">*</span></label>
                  <input name="name" value={form.name} onChange={handleChange} className={`w-full bg-gray-800 border ${formErrors.name ? 'border-red-500' : 'border-gray-700'} rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors`} placeholder="Enter your full name" />
                  {formErrors.name && <p className="text-red-400 text-xs mt-1">{formErrors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Phone Number <span className="text-red-400">*</span></label>
                  <input type="tel" name="phone" value={form.phone} onChange={handleChange} className={`w-full bg-gray-800 border ${formErrors.phone ? 'border-red-500' : 'border-gray-700'} rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors`} placeholder="10-digit mobile number" />
                  {formErrors.phone ? (
                     <p className="text-red-400 text-xs mt-1">{formErrors.phone}</p>
                  ) : (
                     <p className="text-xs text-cyan-400 mt-1 opacity-80">Your UWID will be derived from this</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Email <span className="text-gray-500 font-normal">(optional)</span></label>
                  <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors" placeholder="your@email.com" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">UPI ID <span className="text-red-400">*</span></label>
                  <input name="upiId" value={form.upiId} onChange={handleChange} className={`w-full bg-gray-800 border ${formErrors.upiId ? 'border-red-500' : 'border-gray-700'} rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors`} placeholder="yourname@upi" />
                  {formErrors.upiId ? (
                     <p className="text-red-400 text-xs mt-1">{formErrors.upiId}</p>
                  ) : (
                     <p className="text-xs text-emerald-400 mt-1 opacity-80">Payouts go here</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Aadhaar <span className="text-gray-500 font-normal">(optional for KYC)</span></label>
                  <input type="number" name="aadhaar" value={form.aadhaar} onChange={handleChange} maxLength={12} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors" placeholder="12-digit Aadhaar number" />
                  <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded text-xs font-medium">
                    <span>⚠️</span> Simulated KYC — Phase 3 will use DigiLocker
                  </div>
                </div>

                <div className={`flex flex-col gap-1 mt-4 bg-gray-800/50 p-3 rounded-lg border ${formErrors.dpdpConsent ? 'border-red-500/50' : 'border-gray-700'}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" name="dpdpConsent" checked={form.dpdpConsent} onChange={handleChange} className="mt-1 w-4 h-4 rounded text-cyan-500 bg-gray-700 border-gray-600 focus:ring-cyan-500" id="dpdpConsent" />
                    <label htmlFor="dpdpConsent" className="text-sm text-gray-300 cursor-pointer">
                      I consent to data collection under India's DPDP Act 2023 <span className="text-red-400">*</span>
                    </label>
                  </div>
                  {formErrors.dpdpConsent && <p className="text-red-400 text-xs pl-7">{formErrors.dpdpConsent}</p>}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Work Profile */}
          {step === 2 && (
            <div className="animate-fade-in space-y-5">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold">Your Work Profile</h2>
                <p className="text-sm text-gray-400 mt-1">Configure your delivery patterns to preview premium</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 uppercase tracking-wide">Delivery Zone</label>
                <div className="space-y-2">
                  {ZONES.map(z => (
                    <button key={z.id} type="button" onClick={() => {
                        handleChange({ target: { name: 'zone', value: z.id, type: 'text' }});
                      }} 
                      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${form.zone === z.id ? 'bg-cyan-500/10 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}>
                      <div className="text-left">
                        <div className="font-semibold text-white">{z.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">Factor: {z.riskFactor}×</div>
                      </div>
                      <span className="text-xs font-bold px-2 py-1 rounded" style={{ backgroundColor: `${z.color}15`, color: z.color, border: `1px solid ${z.color}30` }}>
                        {z.risk}
                      </span>
                    </button>
                  ))}
                  {formErrors.zone && <p className="text-red-400 text-xs">{formErrors.zone}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 uppercase tracking-wide">Primary Platform</label>
                <select name="platform" value={form.platform} onChange={handleChange} className={`w-full bg-gray-800 border ${formErrors.platform ? 'border-red-500' : 'border-gray-700'} rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 appearance-none`}>
                  <option value="" disabled>Select your platform...</option>
                  {PLATFORMS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {formErrors.platform && <p className="text-red-400 text-xs mt-1">{formErrors.platform}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 uppercase tracking-wide">Working Archetype</label>
                <div className="space-y-2">
                  {ARCHETYPES.map(a => (
                    <button key={a.id} type="button" onClick={() => handleArchetypeClick(a.id)} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${form.archetype === a.id ? 'bg-cyan-500/10 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}>
                      <span className="text-2xl">{a.icon}</span>
                      <div className="text-left flex-1">
                        <div className="font-semibold text-white">{a.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{a.time} • Factor: {a.multiplier}×</div>
                      </div>
                      {form.archetype === a.id && <span className="text-cyan-400 text-lg">✓</span>}
                    </button>
                  ))}
                  {formErrors.archetype && <p className="text-red-400 text-xs">{formErrors.archetype}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 uppercase tracking-wide">Peak Hours Per Week: {form.peakHoursPerWeek}h</label>
                <input type="range" name="peakHoursPerWeek" min="10" max="40" step="5" value={form.peakHoursPerWeek} onChange={handleChange} className="w-full accent-cyan-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>10 hours</span>
                  <span>40 hours</span>
                </div>
              </div>

              {preview && (
                <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-cyan-500/10 to-emerald-500/10 border border-cyan-500/20 text-center">
                  <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">Live Premium Preview</div>
                  <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
                    ₹{preview}<span className="text-lg text-gray-500 font-medium">/wk</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Coverage Summary */}
          {step === 3 && (
            <div className="animate-fade-in space-y-6">
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold text-white">Coverage Summary</h2>
                <p className="text-sm text-gray-400">Review your policy details</p>
              </div>

              <div className="bg-gradient-to-b from-gray-800 to-gray-800/50 rounded-2xl border border-gray-700 overflow-hidden shadow-xl">
                <div className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 p-4 border-b border-gray-700/50 flex justify-between items-center">
                  <div>
                    <div className="text-xs text-cyan-400 font-bold uppercase tracking-wider mb-1">Policy Preview Card</div>
                    <div className="font-mono text-sm text-white">POL-{Date.now().toString().slice(-6)}-PREVIEW</div>
                  </div>
                  <div className="text-2xl">📋</div>
                </div>
                
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Platform</div>
                      <div className="font-semibold text-gray-200">{form.platform}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Zone</div>
                      <div className="font-semibold text-gray-200">{selectedZone?.name}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Archetype</div>
                      <div className="font-semibold text-gray-200">{selectedArchetype?.label}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Weekly Premium</div>
                      <div className="font-bold text-cyan-400">₹{preview}</div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-700">
                    <div className="text-xs text-gray-500 mb-1">Coverage Scope</div>
                    <div className="font-medium text-emerald-400">Income loss up to ₹{HOURLY_RATE * 8}/day</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Effective</div>
                      <div className="font-mono text-sm text-gray-300">{new Date().toLocaleDateString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Expiry</div>
                      <div className="font-mono text-sm text-gray-300">{new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                ⚠️ This is a preview. Policy activates after payment.
              </div>
            </div>
          )}

          {/* STEP 4: Payment Simulation */}
          {step === 4 && (
            <div className="animate-fade-in flex flex-col items-center justify-center min-h-[400px]">
              
              {paymentState === 'idle' && (
                <div className="w-full space-y-6 text-center">
                  <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-700">
                    <span className="text-3xl">💸</span>
                  </div>
                  <h2 className="text-2xl font-bold">Complete Payment</h2>
                  <p className="text-gray-400">Initiating mandate for UPI ID:<br/><span className="text-white font-medium">{form.upiId}</span></p>
                  
                  <div className="py-6">
                    <button onClick={simulatePayment} className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-bold text-lg shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all transform active:scale-95">
                      Pay ₹{preview}/week
                    </button>
                  </div>
                </div>
              )}

              {paymentState === 'processing' && (
                <div className="w-full text-center space-y-4">
                  <div className="w-16 h-16 border-4 border-gray-700 border-t-emerald-500 rounded-full animate-spin mx-auto"></div>
                  <div className="text-lg font-medium text-emerald-400 animate-pulse">Processing UPI payment...</div>
                  <p className="text-sm text-gray-500">Please accept the mandate on your UPI app</p>
                </div>
              )}

              {paymentState === 'success' && paymentDetails && (
                <div className="w-full space-y-6 animate-fade-in-up">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                      <span className="text-4xl text-emerald-500">✅</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1">Payment Confirmed</h2>
                    <p className="text-emerald-400 font-medium">Mandate setup successful</p>
                  </div>

                  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3 text-sm">
                    <div className="flex justify-between border-b border-gray-700 pb-2">
                      <span className="text-gray-400">Transaction ID</span>
                      <span className="font-mono text-white">{paymentDetails.txnId}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-700 pb-2">
                      <span className="text-gray-400">UPI Ref</span>
                      <span className="font-mono text-white">{paymentDetails.upiRef}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-700 pb-2">
                      <span className="text-gray-400">Amount</span>
                      <span className="font-bold text-white">₹{preview} / week</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">To</span>
                      <span className="text-white">CovA Insurance Pool</span>
                    </div>
                  </div>

                  <button onClick={handleSubmit} disabled={loading} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold transition-all disabled:opacity-70 flex justify-center items-center gap-2">
                    {loading ? (
                       <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    ) : 'Continue to Register →'}
                  </button>
                  {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                </div>
              )}
            </div>
          )}

          {/* STEP 5: Registration Success / Policy Card Display */}
          {step === 5 && result && (
            <div className="animate-fade-in space-y-6 pb-8 text-center pt-4">
              <h1 className="text-2xl font-bold text-white">You're Covered! 🛡️</h1>
              <p className="text-gray-400 mt-2">Welcome to CovA, {result.worker?.name || form.name}</p>

              {/* ASCII-inspired styled Policy Card */}
              <div className="bg-[#0f172a] rounded-xl border border-cyan-500/50 p-6 shadow-[0_0_30px_rgba(6,182,212,0.15)] font-mono text-sm text-left relative overflow-hidden mt-6 mx-auto">
                {/* Decorative top border */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-blue-500"></div>
                
                <div className="text-center font-bold text-emerald-400 mb-4 pb-4 border-b border-gray-700/60 flex items-center justify-center gap-2 text-base">
                  <span className="text-xl">🛡️</span> CovA Income Shield Policy
                </div>
                
                <div className="space-y-2 text-gray-300">
                  {(() => {
                     const workerId = result.worker?.id || 'NEW-01';
                     const policyData = result.policy || {};
                     const policyId = policyData.policyId || `POL-${workerId}-PREVIEW`;
                     const effectiveDate = policyData.effectiveDate || new Date().toISOString().split('T')[0];
                     const expiryDate = policyData.expiryDate || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];
                     const finalPremium = result.premium?.weeklyPremium || preview;
                     const maxDailyCover = result.premium?.maxDailyCover || (HOURLY_RATE * 8);

                     return (
                        <>
                           <div><span className="text-cyan-400/80">Policy No:</span> {policyId}</div>
                           
                           <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center py-1">
                              <div><span className="text-cyan-400/80">Worker:</span> {result.worker?.name || form.name}</div>
                              <div className="text-gray-600">|</div>
                              <div><span className="text-cyan-400/80">UWID:</span> {workerId}</div>
                           </div>

                           <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center pb-2 border-b border-gray-700/60">
                              <div><span className="text-cyan-400/80">Zone:</span> {(result.worker?.zone || form.zone).replace('ZONE_', '')}</div>
                              <div className="text-gray-600">|</div>
                              <div><span className="text-cyan-400/80">Platform:</span> {result.worker?.platform || form.platform}</div>
                           </div>

                           <div className="pt-2">
                             <span className="text-cyan-400/80">Premium:</span> ₹{finalPremium}/week
                           </div>
                           <div>
                             <span className="text-cyan-400/80">Daily Cover Cap:</span> ₹{maxDailyCover}/day
                           </div>
                           <div className="py-2 border-b border-gray-700/60 flex items-center gap-2">
                             <span className="text-cyan-400/80">Status:</span> 
                             <span className="bg-emerald-500/10 text-emerald-400 px-2 rounded font-bold border border-emerald-500/20">ACTIVE ✅</span>
                           </div>

                           <div className="pt-2 text-xs opacity-80">
                              <div><span className="text-cyan-400/80">Valid:</span> {effectiveDate} → {expiryDate}</div>
                              <div className="mt-1"><span className="text-cyan-400/80">UPI:</span> {form.upiId}</div>
                           </div>
                        </>
                     );
                  })()}
                </div>
              </div>

              <div className="space-y-3 mt-8">
                <button 
                  onClick={() => showToast("PDF download — Phase 3 feature")} 
                  className="w-full py-3 rounded-xl bg-gray-800 border border-gray-700 hover:bg-gray-700 text-white font-medium transition-all"
                >
                  Download Policy PDF
                </button>

                <button 
                  onClick={() => onWorkerCreated && onWorkerCreated(result.worker)} 
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold transition-all shadow-lg shadow-cyan-500/20"
                >
                  Go to My Dashboard →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Form Navigation */}
        {step < 5 && step !== 4 && (
          <div className="flex gap-3 mt-8 pt-4 border-t border-gray-800">
            {step > 1 && (
               <button type="button" onClick={handleBack} className="px-5 py-3 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 font-medium hover:bg-gray-700 transition-colors">
                Back
               </button>
            )}
            <button type="button" onClick={handleNext} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold transition-all active:scale-[0.98]">
              Continue →
            </button>
          </div>
        )}
        
        {/* Navigation for step 3 is different because Step 4 transition doesn't need to validate form fields immediately, it just changes step */}
        {step === 3 && (
            <div className="flex gap-3 mt-8 pt-4 border-t border-gray-800">
            <button type="button" onClick={handleBack} className="px-5 py-3 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 font-medium hover:bg-gray-700 transition-colors">
              Back
             </button>
             <button type="button" onClick={() => setStep(4)} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold transition-all active:scale-[0.98]">
               Proceed to Payment →
             </button>
           </div>
        )}

      </div>
    </div>
  );
}

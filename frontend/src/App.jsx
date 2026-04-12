import { useState } from 'react';
import { API_BASE, getWsUrl } from './config';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import WorkerDashboard from './pages/WorkerDashboard';
import InsurerDashboard from './pages/InsurerDashboard';
import AdminPanel from './pages/AdminPanel';
import './index.css';

function App() {
  const [auth, setAuth] = useState(() => {
    const stored = sessionStorage.getItem('cova_auth');
    return stored ? JSON.parse(stored) : null;
  });

  const [currentWorker, setCurrentWorker] = useState(null);
  const [workerView, setWorkerView] = useState('onboarding'); // 'onboarding' | 'dashboard'

  const handleLogin = (data) => {
    setAuth(data);
    sessionStorage.setItem('cova_auth', JSON.stringify(data));
  };

  const handleLogout = () => {
    if (auth?.token) {
      fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}` },
      }).catch(() => {});
    }
    setAuth(null);
    setCurrentWorker(null);
    setWorkerView('onboarding');
    sessionStorage.removeItem('cova_auth');
  };

  const handleWorkerCreated = (worker) => {
    setCurrentWorker(worker);
    setWorkerView('dashboard');
  };

  // Not logged in → show login
  if (!auth) {
    return <Login onLogin={handleLogin} />;
  }

  // Route based on role
  const { role, token } = auth;

  if (role === 'worker') {
    if (workerView === 'dashboard' && currentWorker) {
      return <WorkerDashboard token={token} workerId={currentWorker.id} onLogout={handleLogout} />;
    }
    return (
      <Onboarding
        token={token}
        onWorkerCreated={handleWorkerCreated}
      />
    );
  }

  if (role === 'insurer') {
    return <InsurerDashboard token={token} onLogout={handleLogout} />;
  }

  if (role === 'admin') {
    return <AdminPanel token={token} onLogout={handleLogout} />;
  }

  return <Login onLogin={handleLogin} />;
}

export default App;

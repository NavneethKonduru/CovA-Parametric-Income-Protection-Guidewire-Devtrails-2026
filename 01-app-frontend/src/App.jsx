import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import WorkerDashboard from './pages/WorkerDashboard';
import InsurerDashboard from './pages/InsurerDashboard';
import ExecutiveReporting from './pages/ExecutiveReporting';
import QCommerceDashboard from './pages/QCommerceDashboard';
import SplitDashboard from './layouts/SplitDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

function App() {
  const [auth, setAuth] = useState(() => {
    const stored = sessionStorage.getItem('cova_auth');
    return stored ? JSON.parse(stored) : null;
  });

  const [currentWorker, setCurrentWorker] = useState(null);
  const [workerView, setWorkerView] = useState('onboarding');
  const [dataMode, setDataMode] = useState('demo');

  useEffect(() => {
    const fetchHealth = () => {
      fetch('/api/health')
        .then(r => r.json())
        .then(d => { setDataMode(d.dataMode || d.mode || 'demo'); })
        .catch(() => setDataMode('demo'));
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = (data) => {
    setAuth(data);
    sessionStorage.setItem('cova_auth', JSON.stringify(data));
  };

  const handleLogout = () => {
    if (auth?.token) {
      fetch('/api/auth/logout', {
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

  if (!auth) {
    return (
      <ErrorBoundary showDetails={false}>
        <Login onLogin={handleLogin} dataMode={dataMode} />
      </ErrorBoundary>
    );
  }

  const { role, token } = auth;

  if (role === 'worker') {
    if (workerView === 'dashboard' && currentWorker) {
      return (
        <ErrorBoundary showDetails={false}>
          <WorkerDashboard token={token} workerId={currentWorker.id} onLogout={handleLogout} dataMode={dataMode} />
        </ErrorBoundary>
      );
    }
    return (
      <ErrorBoundary showDetails={false}>
        <Onboarding token={token} onWorkerCreated={handleWorkerCreated} />
      </ErrorBoundary>
    );
  }

  // ADMIN: gets the full split-screen dashboard
  if (role === 'admin') {
    return (
      <ErrorBoundary showDetails>
        <SplitDashboard token={token} onLogout={handleLogout} />
      </ErrorBoundary>
    );
  }

  if (role === 'insurer') {
    return (
      <ErrorBoundary showDetails>
        <InsurerDashboard token={token} onLogout={handleLogout} dataMode={dataMode} />
      </ErrorBoundary>
    );
  }

  if (role === 'analyst') {
    return (
      <ErrorBoundary showDetails>
        <ExecutiveReporting token={token} onLogout={handleLogout} />
      </ErrorBoundary>
    );
  }

  if (role === 'qcommerce') {
    return (
      <ErrorBoundary showDetails>
        <QCommerceDashboard token={token} onLogout={handleLogout} dataMode={dataMode} />
      </ErrorBoundary>
    );
  }

  return <Login onLogin={handleLogin} dataMode={dataMode} />;
}

export default App;

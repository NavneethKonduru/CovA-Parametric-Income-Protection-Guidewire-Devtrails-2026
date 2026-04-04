require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

// Auth middleware
const { extractUser, requireRole } = require('./middleware/auth');

// Mock API routes
const weatherMock = require('./mock-apis/weather');
const demandMock = require('./mock-apis/demand');
const paymentMock = require('./mock-apis/payment');

// Application routes
const authRouter = require('./routes/auth');
const workersRouter = require('./routes/workers');
const policiesRouter = require('./routes/policies');
const claimsRouter = require('./routes/claims');
const dashboardRouter = require('./routes/dashboard');
const guidewireRouter = require('./routes/guidewire');
const insurerRouter = require('./routes/insurer');
const adminRouter = require('./routes/admin');

// Cron poller
const { startCron } = require('./cron/poller');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json());
app.use(extractUser); // Attach user to req from Bearer token

// WebSocket broadcast helper
app.locals.broadcastEvent = (type, payload) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type, payload, timestamp: new Date().toISOString() }));
    }
  });
};

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  ws.send(JSON.stringify({ type: 'CONNECTED', payload: 'Welcome to Cova WS' }));
});

// ============================================================
// MOCK EXTERNAL APIs (simulate 3rd party services)
// ============================================================
app.use('/mock/weather', weatherMock);
app.use('/mock/demand', demandMock);
app.use('/mock/payment', paymentMock);

// ============================================================
// APPLICATION API ROUTES
// ============================================================

// Auth — no token needed
app.use('/api/auth', authRouter);

// Workers — open for demo (worker can register without auth)
app.use('/api/workers', workersRouter);

// Policies — open for demo
app.use('/api/policies', policiesRouter);

// Claims — open for demo (cron triggers these)
app.use('/api/claims', claimsRouter);

// Dashboard — open for demo (read-only data)
app.use('/api/dashboard', dashboardRouter);

// Guidewire — open for demo
app.use('/api/guidewire', guidewireRouter);

// Insurer config — requires insurer or admin role
app.use('/api/insurer', insurerRouter);

// Admin panel — requires admin role
app.use('/api/admin', adminRouter);

// Demo controls — mounted from admin router but aliased for convenience
app.use('/api/demo', adminRouter);

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    product: 'Cova',
    team: 'ClaimCrypt',
    version: '0.2.0',
    architecture: 'role-based-single-app',
    roles: ['worker', 'insurer', 'admin'],
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🛡️  Cova Backend v0.2.0 — Role-Based Architecture`);
  console.log(`   API:       http://localhost:${PORT}/api/health`);
  console.log(`   Auth:      POST http://localhost:${PORT}/api/auth/login`);
  console.log(`   WS:        ws://localhost:${PORT}`);
  console.log(`   Mock:      http://localhost:${PORT}/mock/weather/ZONE_A`);
  console.log(`   Roles:     worker | insurer | admin`);
  console.log(`\n   Team ClaimCrypt — DEVTrails 2026\n`);

  // Start the orchestration cron
  startCron(app.locals.broadcastEvent);
});

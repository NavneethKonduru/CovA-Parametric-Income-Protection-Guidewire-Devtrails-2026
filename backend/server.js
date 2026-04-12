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

// API Welcome Page (Sleek Landing Page)
app.get('/api-info', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CovA | API Engine</title>
        <style>
            :root {
                --bg: #0f172a;
                --text: #f8fafc;
                --cyan: #06b6d4;
                --emerald: #10b981;
                --gray: #64748b;
            }
            body { 
                margin: 0; 
                font-family: 'Inter', -apple-system, sans-serif; 
                background: var(--bg); 
                color: var(--text);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                overflow: hidden;
            }
            .container { 
                text-align: center; 
                padding: 2rem;
                z-index: 10;
                animation: fadeIn 1s ease-out;
            }
            .logo {
                font-size: 4rem;
                margin-bottom: 1rem;
                filter: drop-shadow(0 0 20px rgba(6, 182, 212, 0.4));
            }
            h1 {
                margin: 0;
                font-size: 2.5rem;
                letter-spacing: -0.05em;
                background: linear-gradient(to right, var(--cyan), var(--emerald));
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                font-weight: 800;
            }
            .status {
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                margin-top: 1rem;
                padding: 0.5rem 1rem;
                background: rgba(16, 185, 129, 0.1);
                border: 1px solid rgba(16, 185, 129, 0.2);
                border-radius: 99px;
                color: var(--emerald);
                font-size: 0.875rem;
                font-weight: 600;
            }
            .pulse {
                width: 8px;
                height: 8px;
                background: var(--emerald);
                border-radius: 50%;
                box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
                animation: pulse 2s infinite;
            }
            .links {
                margin-top: 3rem;
                display: flex;
                gap: 1.5rem;
                justify-content: center;
            }
            a {
                color: var(--gray);
                text-decoration: none;
                font-size: 0.875rem;
                transition: all 0.2s;
                padding: 0.5rem 1rem;
                border: 1px solid transparent;
                border-radius: 8px;
            }
            a:hover {
                color: var(--cyan);
                background: rgba(6, 182, 212, 0.05);
                border-color: rgba(6, 182, 212, 0.2);
            }
            .footer {
                position: absolute;
                bottom: 2rem;
                font-size: 0.75rem;
                color: var(--gray);
                letter-spacing: 0.1em;
                text-transform: uppercase;
            }
            @keyframes pulse {
                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .glow {
                position: absolute;
                width: 600px;
                height: 600px;
                background: radial-gradient(circle, rgba(6,182,212,0.05) 0%, rgba(15,23,42,0) 70%);
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                pointer-events: none;
            }
        </style>
    </head>
    <body>
        <div class="glow"></div>
        <div class="container">
            <div class="logo">🛡️</div>
            <h1>CovA Engine</h1>
            <div class="status">
                <div class="pulse"></div>
                SYSTEMS OPERATIONAL
            </div>
            
            <div class="links">
                <a href="/api/health">Endpoint Health</a>
                <a href="/api/workers">Worker Registry</a>
                <a href="/api/guidewire/status">Guidewire Status</a>
            </div>
        </div>
        <div class="footer">Team ClaimCrypt • DEVTrails 2026</div>
    </body>
    </html>
  `);
});

// ============================================================
// FRONTEND STATIC SERVING (Unified Deployment)
// ============================================================
app.use(express.static(path.join(__dirname, '../frontend/dist')));

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

// Catch-all route to serve the React app for any unmatched route
app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
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

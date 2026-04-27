require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

// PostgreSQL connection module
const pg = require('./data/pg');

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
const telemetryRouter = require('./routes/telemetry');
const webhooksRouter = require('./routes/webhooks');
const weatherRouter = require('./routes/weather');
const reportsRouter = require('./routes/reports');
const counterfactualRouter = require('./routes/counterfactual');
// Cron poller
const { startCron } = require('./cron/poller');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ============================================================
// MIDDLEWARE
// ============================================================
const corsOptions = {
  origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL, 'http://localhost:3000'] : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(extractUser); // Attach user to req from Bearer token

// WebSocket broadcast helper
const wsSubscribers = new Map();

app.locals.broadcastEvent = (type, payload, filter = {}) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      const sub = wsSubscribers.get(client) || {};
      if (filter.role && sub.role !== filter.role) return;
      if (filter.dataMode && sub.dataMode !== filter.dataMode) return;
      if (filter.zone && sub.zone !== filter.zone) return;
      
      client.send(JSON.stringify({ type, payload, timestamp: new Date().toISOString() }));
    }
  });
};

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'AUTH') {
        const { token, zone } = data.payload || data;
        let role = 'worker', dataMode = 'real';
        if (token) {
          const jwt = require('jsonwebtoken');
          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cova_secret_2026');
            role = decoded.role || role;
            dataMode = decoded.data_mode || dataMode;
          } catch(e){}
        }
        wsSubscribers.set(ws, { role, dataMode, zone });
        ws.send(JSON.stringify({ type: 'AUTH_SUCCESS' }));
      }
    } catch(e){}
  });

  ws.on('close', () => {
    wsSubscribers.delete(ws);
  });

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

// Telemetry ingestion
app.use('/api/telemetry', telemetryRouter);

// Webhooks
app.use('/api/webhooks', webhooksRouter);

// Weather Predictions (New for Phase 2)
app.use('/api/weather', weatherRouter);

// --- Phase 2 Enterprise Aliases ---
// Map the frontend's expected generic endpoints to our existing role-based routers
app.use('/api/reports', reportsRouter);
app.use('/api/counterfactual', counterfactualRouter);

// Dashboard Aliases for Frontend Parity
app.use('/api/cdi-config', adminRouter); // For CDI Mode/Threshold updates
app.use('/api/orchestration-events', guidewireRouter); // For Guidewire Monitor
app.use('/api/cdi-live', weatherRouter); // For Live CDI Readout

// Consolidated Health Summary for Enterprise Dashboards
app.get('/api/health-summary', async (req, res) => {
  const dbAvailable = pg.isAvailable();
  const dataMode = pg.getDataMode();

  let claimsActive = 0, claimsTrend = 0;
  let fraudQueue = 0;
  let cdiAvg = 0, cdiMax = 0;
  let syncCount = 0;

  if (dbAvailable) {
    try {
      const [claimRes, claimPrevRes, fraudRes, cdiRes, syncRes] = await Promise.all([
        pg.query("SELECT COUNT(*) as c FROM claims WHERE status='approved' AND data_mode=$1", [dataMode]),
        pg.query("SELECT COUNT(*) as c FROM claims WHERE status='approved' AND data_mode=$1 AND created_at < NOW() - INTERVAL '1 hour'", [dataMode]),
        pg.query("SELECT COUNT(*) as c FROM fraud.detection_log WHERE risk_level IN ('high','critical') AND created_at > NOW() - INTERVAL '1 hour' AND data_mode=$1", [dataMode]),
        pg.query("SELECT COALESCE(AVG(cdi),0) as avg, COALESCE(MAX(cdi),0) as max FROM disruption_events WHERE data_mode=$1 AND timestamp > NOW() - INTERVAL '1 hour'", [dataMode]),
        pg.query("SELECT COUNT(*) as c FROM guidewire_submissions WHERE submitted_at > NOW() - INTERVAL '1 hour' AND data_mode=$1", [dataMode])
      ]);
      claimsActive = parseInt(claimRes.rows[0]?.c || 0);
      const claimsPrev = parseInt(claimPrevRes.rows[0]?.c || 0);
      claimsTrend = claimsPrev > 0 ? Math.round(((claimsActive - claimsPrev) / claimsPrev) * 100) : 0;
      fraudQueue = parseInt(fraudRes.rows[0]?.c || 0);
      cdiAvg = parseFloat(cdiRes.rows[0]?.avg || 0);
      cdiMax = parseFloat(cdiRes.rows[0]?.max || 0);
      syncCount = parseInt(syncRes.rows[0]?.c || 0);
    } catch (e) {
      console.error('[HEALTH-SUMMARY] DB query error:', e.message);
    }
  }

  res.json({
    status: dbAvailable ? 'UP' : 'DEGRADED',
    dataMode: dataMode.toUpperCase(),
    claims: { active: claimsActive, trend: claimsTrend },
    sync: { avgLag: syncCount > 0 ? 0.8 : 0, recentSyncs: syncCount },
    fraud: { queue: fraudQueue },
    cdi: { confidence: parseFloat(cdiAvg.toFixed(2)), peak: parseFloat(cdiMax.toFixed(2)) },
    timestamp: new Date().toISOString()
  });
});

// Live CDI Readout for Admin Console
app.get('/api/cdi-live', async (req, res) => {
  const dataMode = pg.getDataMode();
  try {
    const recent = await pg.query(
      "SELECT zone, cdi, condition, timestamp FROM disruption_events WHERE data_mode=$1 ORDER BY timestamp DESC LIMIT 3",
      [dataMode]
    );
    res.json({
      readings: recent.rows,
      updatedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('[CDI-LIVE] Query error:', e.message);
    res.json({ readings: [], updatedAt: new Date().toISOString() });
  }
});

// Orchestration Events for Integration Console
app.get('/api/orchestration-events', async (req, res) => {
  try {
    const resDb = await pg.query("SELECT * FROM public.guidewire_submissions WHERE data_mode = $1 ORDER BY submitted_at DESC LIMIT 50", [pg.getDataMode()]);
    const events = resDb.rows.map((r, i) => {
      const s = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
      return {
        id: `EVT_${i}`,
        type: "GUIDEWIRE_SYNC",
        status: s.acknowledgment.status,
        timestamp: s.submittedAt || r.submitted_at,
        canRetry: s.acknowledgment.status !== 'Received',
        payload: s
      };
    });
    res.json(events);
  } catch (e) {
    res.json([]);
  }
});

// Health check (public) — now checks database connectivity
app.get('/api/health', async (req, res) => {
  const dbAvailable = pg.isAvailable();
  const dbStatus = dbAvailable ? 'connected' : 'disconnected';
  const dbMode = pg.getDataMode();

  // Fetch worker count for Insurer Dashboard's "Active Workers" card
  let workerCount = 0;
  if (dbAvailable) {
    try {
      const { rows } = await pg.query(
        `SELECT COUNT(*)::integer as count FROM public.workers WHERE data_mode = $1`,
        [dbMode]
      );
      workerCount = rows[0]?.count || 0;
    } catch (e) { /* non-critical */ }
  }

  res.json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    product: 'Cova',
    team: 'ClaimCrypt',
    version: '0.3.0',
    architecture: 'role-based-single-app',
    database: { status: dbStatus, mode: dbMode, engine: 'PostgreSQL (Neon)', workers: workerCount },
    roles: ['worker', 'insurer', 'admin'],
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3001;

async function boot() {
  // Initialize PostgreSQL connection pool + cache + mode
  const dbReady = await pg.initialize();
  if (!dbReady) {
    console.warn('\n⚠️  PostgreSQL not available. Server will start but database operations will fail.');
    console.warn('   Set DATABASE_URL in .env and ensure migrations have been run.\n');
  }

  server.listen(PORT, () => {
    console.log(`\n================================================================`);
    console.log(` 🛡️  CovA Core Orchestration Engine v0.3.0`);
    console.log(`================================================================`);
    console.log(` [Network]`);
    console.log(`   API Endpoint:    http://localhost:${PORT}/api/health`);
    console.log(`   WebSocket:       ws://localhost:${PORT}`);
    console.log(`   Auth Server:     POST /api/auth/login`);
    console.log(`\n [Infrastructure]`);
    console.log(`   Database Engine: PostgreSQL (Neon)`);
    console.log(`   Primary DB:      ${dbReady ? '✅ Connected (Read/Write)' : '❌ Disconnected'}`);
    console.log(`   Replica DB:      ${process.env.DATABASE_URL_READ ? '✅ Connected (Read-Only)' : '⚠️ Fallback to Primary'}`);
    console.log(`   Cache Layer:     ${pg.cache.isRedis ? '✅ Redis Connected' : '⚠️ In-Memory Fallback'}`);
    console.log(`\n [Operational State]`);
    console.log(`   Data Mode:       ${pg.getDataMode().toUpperCase()}`);
    console.log(`   Simulated Feeds: http://localhost:${PORT}/mock/weather/:zone`);
    console.log(`   Active Roles:    Worker, Insurer, Admin`);
    console.log(`================================================================\n`);

    // Start the orchestration cron
    startCron(app.locals.broadcastEvent);
    
    // Init the demo sequencer
    const demoSequencer = require('./services/demo-sequencer');
    demoSequencer.initDemoSequencer(app.locals.broadcastEvent);

    // Auto-start the simulation auto-pilot in demo mode
    if (pg.getDataMode() === 'demo') {
      setTimeout(async () => {
        try {
          console.log('[SERVER] Demo mode detected — launching auto-pilot simulation...');
          await demoSequencer.startAutoPilot(pg);
        } catch (e) {
          console.error('[SERVER] Auto-pilot start failed:', e.message);
        }
      }, 12000); // Wait 12s for cron + DB to fully initialize
    }
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[SERVER] SIGTERM received. Shutting down...');
  await pg.shutdown();
  server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[SERVER] SIGINT received. Shutting down...');
  await pg.shutdown();
  server.close();
  process.exit(0);
});

boot().catch(err => {
  console.error('[SERVER] Boot failed:', err);
  process.exit(1);
});

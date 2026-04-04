// ============================================================
// AUTH MIDDLEWARE — Role-Based Access Control
// ============================================================
// Simple token-based auth for hackathon demo.
// Production: replace with OAuth2 / JWT.

const crypto = require('crypto');

// In-memory token store: token → { role, email, name }
const tokenStore = new Map();

// Demo credentials
const DEMO_USERS = {
  'worker@cova.in':  { password: 'cova2026', role: 'worker',  name: 'Demo Worker',  redirectPath: '/worker' },
  'insurer@cova.in': { password: 'cova2026', role: 'insurer', name: 'Demo Insurer', redirectPath: '/insurer' },
  'admin@cova.in':   { password: 'cova2026', role: 'admin',   name: 'Demo Admin',   redirectPath: '/admin' }
};

/**
 * Generate a random token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Login: validate credentials, return token
 * @param {string} email
 * @param {string} password
 * @returns {object|null} { token, role, name, redirectPath } or null
 */
function login(email, password) {
  const user = DEMO_USERS[email];
  if (!user || user.password !== password) return null;

  const token = generateToken();
  tokenStore.set(token, { role: user.role, email, name: user.name });

  return {
    token,
    role: user.role,
    name: user.name,
    redirectPath: user.redirectPath
  };
}

/**
 * Get user from token
 * @param {string} token
 * @returns {object|null}
 */
function getUserFromToken(token) {
  return tokenStore.get(token) || null;
}

/**
 * Logout: remove token
 */
function logout(token) {
  tokenStore.delete(token);
}

/**
 * Express middleware: extract user from Authorization header
 * Sets req.user = { role, email, name } if valid token present
 * Does NOT block — use requireRole() for that
 */
function extractUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const user = getUserFromToken(token);
    if (user) {
      req.user = user;
      req.token = token;
    }
  }
  next();
}

/**
 * Express middleware factory: require specific role(s)
 * Usage: router.get('/admin/config', requireRole('admin'), handler)
 *        router.get('/insurer/data', requireRole('insurer', 'admin'), handler)
 *
 * @param  {...string} roles - allowed roles
 * @returns {Function} Express middleware
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', hint: 'POST /api/auth/login first' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role '${req.user.role}' cannot access this resource. Required: ${roles.join(' or ')}`
      });
    }
    next();
  };
}

module.exports = {
  login,
  logout,
  getUserFromToken,
  extractUser,
  requireRole,
  generateToken,
  tokenStore,
  DEMO_USERS
};

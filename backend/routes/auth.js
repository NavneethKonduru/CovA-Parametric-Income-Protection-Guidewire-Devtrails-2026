const express = require('express');
const router = express.Router();
const { login, logout, getUserFromToken, DEMO_USERS } = require('../middleware/auth');

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { token, role, name, redirectPath }
 */
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const result = login(email, password);
  if (!result) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  console.log(`[AUTH] ${result.role} logged in: ${email}`);
  res.json(result);
});

/**
 * GET /api/auth/me
 * Returns current user from Bearer token
 */
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.slice(7);
  const user = getUserFromToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  res.json({ user });
});

/**
 * POST /api/auth/logout
 * Invalidates the current token
 */
router.post('/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    logout(authHeader.slice(7));
  }
  res.json({ message: 'Logged out' });
});

/**
 * GET /api/auth/roles
 * Returns available demo roles (for frontend role selector)
 */
router.get('/roles', (req, res) => {
  const roles = Object.entries(DEMO_USERS).map(([email, user]) => ({
    email,
    role: user.role,
    name: user.name,
    redirectPath: user.redirectPath
  }));
  res.json({ roles });
});

module.exports = router;

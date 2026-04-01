'use strict';
/**
 * middleware/auth.js
 *
 * Reads JWT from httpOnly cookie (ol_tok) first,
 * falls back to Authorization: Bearer header for
 * Jobber Pro desktop app + API clients.
 *
 * Cookie is set by auth routes on login.
 * Header is used by Electron / mobile / API consumers.
 */

const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  // 1. Try httpOnly cookie first (web browser)
  let token = req.cookies && req.cookies.ol_tok;

  // 2. Fall back to Authorization header (desktop app / API)
  if (!token) {
    const header = req.headers['authorization'];
    if (header && header.startsWith('Bearer ')) {
      token = header.slice(7);
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    // Clear stale cookie if present
    res.clearCookie('ol_tok');
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const adminOnly = (req, res, next) => {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { auth, adminOnly };

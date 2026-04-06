'use strict';

/**
 * routes/admin.auth.js
 * Exports: adminLogin, adminLogout, adminLoginLimiter
 * Used in src/index.js:
 *   const { adminLogin, adminLogout, adminLoginLimiter } = require('./routes/admin.auth');
 */

const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');
const pool       = require('../db/pool');

// ─── Rate limiter: max 10 login attempts per 15 min per IP ───────────────────
const adminLoginLimiter = rateLimit({
  windowMs : 15 * 60 * 1000,
  max      : 10,
  message  : { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders  : false,
});

// ─── POST /api/admin/login ────────────────────────────────────────────────────
async function adminLogin(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required.' });
    }

    // Fetch admin by email
    const { rows } = await pool.query(
      `SELECT id, name, email, password_hash, role, is_active
       FROM admins WHERE email = $1 LIMIT 1`,
      [email.trim().toLowerCase()]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const admin = rows[0];

    if (!admin.is_active) {
      return res.status(403).json({ success: false, message: 'Admin account is disabled.' });
    }

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Sign JWT — same secret as user JWTs, but payload has adminId
    const token = jwt.sign(
      { adminId: admin.id, role: admin.role || 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Audit log (best-effort)
    pool.query(
      `INSERT INTO admin_audit_log (admin_id, action, ip_address, success)
       VALUES ($1, 'LOGIN', $2, true)`,
      [admin.id, req.ip]
    ).catch(() => {});

    return res.json({
      success: true,
      token,
      admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (err) {
    console.error('[adminLogin]', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

// ─── POST /api/admin/logout ───────────────────────────────────────────────────
async function adminLogout(req, res) {
  // JWT is stateless — client drops token.
  // Audit log if token present (best-effort).
  try {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
      const token = auth.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded?.adminId) {
        pool.query(
          `INSERT INTO admin_audit_log (admin_id, action, ip_address, success)
           VALUES ($1, 'LOGOUT', $2, true)`,
          [decoded.adminId, req.ip]
        ).catch(() => {});
      }
    }
  } catch (_) {}

  return res.json({ success: true, message: 'Logged out.' });
}

module.exports = { adminLogin, adminLogout, adminLoginLimiter };

'use strict';

const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool      = require('../db/pool');

const adminLoginLimiter = rateLimit({
  windowMs : 15 * 60 * 1000,
  max      : 10,
  message  : { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders  : false,
});

async function adminLogin(req, res) {
  try {
    const { mobile, mpin } = req.body || {};

    if (!mobile || !mpin) {
      return res.status(400).json({ success: false, message: 'Mobile and MPIN required.' });
    }

    const { rows } = await pool.query(
      `SELECT id, name, email, mobile, mpin_hash, password_hash, role, is_active
       FROM admins WHERE mobile = $1 LIMIT 1`,
      [mobile.trim()]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const admin = rows[0];

    if (!admin.is_active) {
      return res.status(403).json({ success: false, message: 'Admin account is disabled.' });
    }

    const hashToCheck = admin.mpin_hash || admin.password_hash;
    if (!hashToCheck) {
      return res.status(500).json({ success: false, message: 'Admin account not configured.' });
    }

    const match = await bcrypt.compare(String(mpin), hashToCheck);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { adminId: admin.id, role: admin.role || 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    pool.query(
      `INSERT INTO admin_audit_log (admin_id, action, ip_address, success)
       VALUES ($1, 'LOGIN', $2, true)`,
      [admin.id, req.ip]
    ).catch(() => {});

    return res.json({
      success: true,
      token,
      admin: { id: admin.id, name: admin.name, email: admin.email, mobile: admin.mobile, role: admin.role },
    });
  } catch (err) {
    console.error('[adminLogin]', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

async function adminLogout(req, res) {
  try {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
      const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
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

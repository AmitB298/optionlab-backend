/**
 * routes/admin.auth.js  [FIXED v2.1]
 *
 * FIXES:
 *  1. Shared pool from ../db/pool — no more standalone new Pool()
 *  2. JWT_SECRET fallback 'optionlab-secret-2024' removed — throws on startup
 *     if env var not set (matches admin.middleware.js behaviour)
 */

'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const pool                  = require('../db/pool');
const { adminLoginLimiter } = require('../lib/rateLimit');

// Fail hard at startup if JWT_SECRET is missing
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('[admin.auth] JWT_SECRET environment variable is not set.');
}

const DUMMY_HASH = '$2a$12$invalidhashpaddingtomatchbcryptlengthXXXXXXXXXXXXXXXXXXX';

// ─── POST /api/admin/login ────────────────────────────────────────────────────
async function adminLogin(req, res) {
  const mobile = typeof req.body?.mobile === 'string' ? req.body.mobile.trim() : '';
  const mpin   = typeof req.body?.mpin   === 'string' ? req.body.mpin.trim()   : '';

  if (!mobile || !mpin) {
    return res.status(400).json({ success: false, message: 'mobile and mpin required' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, name, mobile, mpin_hash, is_active FROM admins WHERE mobile = $1`,
      [mobile]
    );

    const hashToCompare = rows.length ? rows[0].mpin_hash : DUMMY_HASH;
    const mpinValid     = await bcrypt.compare(mpin, hashToCompare);

    if (!rows.length || !mpinValid || !rows[0].is_active) {
      if (rows.length) {
        pool.query(
          `INSERT INTO admin_audit_log (admin_id, action, ip_address, user_agent, success)
           VALUES ($1, 'ADMIN_LOGIN_FAILED', $2, $3, false)`,
          [rows[0].id, req.ip, (req.headers['user-agent'] || '').slice(0, 500)]
        ).catch(console.error);
      }
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const admin = rows[0];
    const jti   = crypto.randomUUID();
    const token = jwt.sign(
      { adminId: admin.id, mobile: admin.mobile, name: admin.name, role: 'admin', jti },
      JWT_SECRET,
      { expiresIn: '12h', algorithm: 'HS256' }
    );

    pool.query(
      `INSERT INTO admin_audit_log (admin_id, action, ip_address, user_agent, success)
       VALUES ($1, 'ADMIN_LOGIN', $2, $3, true)`,
      [admin.id, req.ip, (req.headers['user-agent'] || '').slice(0, 500)]
    ).catch(console.error);

    return res.json({
      success: true,
      token,
      admin: { id: admin.id, name: admin.name, mobile: admin.mobile },
    });
  } catch (err) {
    console.error('[AdminAuth] Login error:', err.message);
    return res.status(500).json({ success: false, message: 'Login service unavailable' });
  }
}

// ─── POST /api/admin/logout ───────────────────────────────────────────────────
async function adminLogout(req, res) {
  const header = req.headers['authorization'];
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      pool.query(
        `INSERT INTO admin_audit_log (admin_id, action, ip_address, success)
         VALUES ($1, 'ADMIN_LOGOUT', $2, true)`,
        [decoded.adminId, req.ip]
      ).catch(console.error);
    } catch (_) { /* expired token — fine */ }
  }
  return res.json({ success: true });
}

module.exports = { adminLogin, adminLogout, adminLoginLimiter };

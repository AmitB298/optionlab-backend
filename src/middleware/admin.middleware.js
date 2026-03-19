/**
 * middleware/admin.middleware.js  [FIXED v2.1]
 *
 * FIXES:
 *  1. Shared pool from config/db.js — no more standalone new Pool()
 *     (was adding surplus connections, undoing the v2.1 pool consolidation)
 *  2. JWT_SECRET fallback 'optionlab-secret-2024' removed — now throws on startup
 *     if JWT_SECRET env var is not set in Railway
 *  3. req.admin now exposes adminId (not id) — matches what admin.routes.js reads
 *     everywhere: req.admin.adminId. Previously req.admin.adminId was undefined
 *     on every single request, silently breaking self-deactivation guard,
 *     subscription history audit, bulk deactivate self-guard, announcement created_by.
 */
'use strict';

const jwt = require('jsonwebtoken');
require('dotenv').config();

// FIX #1 — shared pool, not a new one just for this file
const pool = require('../config/db');

// FIX #2 — fail hard at startup if JWT_SECRET is missing
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('[admin.middleware] JWT_SECRET environment variable is not set.');
}

function adminSecurityHeaders(req, res, next) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
}

async function requireAdmin(req, res, next) {
  const header = req.headers['authorization'];
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const token = header.slice(7).trim();
  let decoded;
  try {
    // FIX #2 — JWT_SECRET variable (validated above), no fallback string
    decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session' });
  }

  if (decoded.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Insufficient privileges' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, name, mobile, is_active FROM admins WHERE id = $1 AND is_active = true',
      [decoded.adminId]
    );
    if (!rows.length) {
      return res.status(403).json({ success: false, message: 'Admin account inactive or not found' });
    }

    // FIX #3 — expose adminId (not id) so admin.routes.js req.admin.adminId works
    // Previously: { id: rows[0].id, ... } — req.admin.adminId was undefined everywhere
    req.admin = Object.freeze({
      adminId: rows[0].id,      // ← FIX: was `id: rows[0].id`
      name:    rows[0].name,
      mobile:  rows[0].mobile,
      role:    'admin',
    });
  } catch (dbErr) {
    console.error('[AdminMiddleware] DB error:', dbErr.message);
    return res.status(500).json({ success: false, message: 'Authentication service unavailable' });
  }

  next();
}

const SENSITIVE_FIELDS = new Set([
  'mpin', 'new_mpin', 'password', 'mpin_hash',
  'api_key', 'totp_secret', 'token', 'otp',
]);

function sanitiseBody(body) {
  if (!body || typeof body !== 'object') return {};
  const safe = {};
  for (const [k, v] of Object.entries(body)) {
    if (SENSITIVE_FIELDS.has(k.toLowerCase())) safe[k] = '[REDACTED]';
    else if (typeof v === 'string')                safe[k] = v.slice(0, 500);
    else if (typeof v === 'number' || typeof v === 'boolean') safe[k] = v;
    else if (Array.isArray(v))                     safe[k] = '[Array(' + v.length + ')]';
    else                                           safe[k] = '[Object]';
  }
  return safe;
}

function auditLog(action) {
  return function auditMiddleware(req, res, next) {
    const originalJson = res.json.bind(res);
    res.json = function auditedJson(body) {
      const success = !body?.error && res.statusCode < 400;
      const rawId = req.params?.userId || req.body?.userId || null;
      let targetId = null;
      if (rawId !== null) {
        const n = parseInt(rawId, 10);
        if (Number.isInteger(n) && n > 0) targetId = n;
      }
      pool.query(
        `INSERT INTO admin_audit_log
           (admin_id, action, target_user_id, payload, success, ip_address, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          req.admin?.adminId || null,   // FIX #3 — was req.admin?.id (always null)
          action,
          targetId,
          JSON.stringify({
            body:   sanitiseBody(req.body),
            params: req.params || {},
            query:  req.query  || {},
          }),
          success,
          req.ip || null,
          (req.headers?.['user-agent'] || '').slice(0, 500),
        ]
      ).catch(err => console.error('[AuditLog] Write failed:', err.message));
      return originalJson(body);
    };
    next();
  };
}

module.exports = { requireAdmin, auditLog, adminSecurityHeaders };

/**
 * middleware/admin.middleware.js
 * Adapted for live Railway DB: admins table, JWT uses adminId field.
 */
'use strict';

const jwt    = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'optionlab-secret-2024', { algorithms: ['HS256'] });
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
    if (!rows.length) return res.status(403).json({ success: false, message: 'Admin account inactive or not found' });
    req.admin = Object.freeze({ id: rows[0].id, name: rows[0].name, mobile: rows[0].mobile, role: 'admin' });
  } catch (dbErr) {
    console.error('[AdminMiddleware] DB error:', dbErr.message);
    return res.status(500).json({ success: false, message: 'Authentication service unavailable' });
  }
  next();
}

const SENSITIVE_FIELDS = new Set(['mpin','new_mpin','password','mpin_hash','api_key','totp_secret','token','otp']);

function sanitiseBody(body) {
  if (!body || typeof body !== 'object') return {};
  const safe = {};
  for (const [k, v] of Object.entries(body)) {
    if (SENSITIVE_FIELDS.has(k.toLowerCase())) safe[k] = '[REDACTED]';
    else if (typeof v === 'string') safe[k] = v.slice(0, 500);
    else if (typeof v === 'number' || typeof v === 'boolean') safe[k] = v;
    else if (Array.isArray(v)) safe[k] = '[Array(' + v.length + ')]';
    else safe[k] = '[Object]';
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
      if (rawId !== null) { const n = parseInt(rawId, 10); if (Number.isInteger(n) && n > 0) targetId = n; }
      pool.query(
        'INSERT INTO admin_audit_log (admin_id, action, target_user_id, payload, success, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [req.admin?.id||null, action, targetId, JSON.stringify({body:sanitiseBody(req.body),params:req.params||{},query:req.query||{}}), success, req.ip||null, (req.headers?.['user-agent']||'').slice(0,500)]
      ).catch(err => console.error('[AuditLog] Write failed:', err.message));
      return originalJson(body);
    };
    next();
  };
}

module.exports = { requireAdmin, auditLog, adminSecurityHeaders };

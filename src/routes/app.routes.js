'use strict';

/**
 * app.routes.js
 *
 * Safe endpoints for the Jobber desktop app.
 * NO broker credentials ever touch this server.
 *
 * Jobber app calls:
 *   POST /api/app/heartbeat   — "I am alive" ping every 2 min
 *   GET  /api/app/status      — app checks its own session info
 */

const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const pool       = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || 'optionlab_secret';

// ── JWT auth middleware ────────────────────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// ── POST /api/app/heartbeat ───────────────────────────────────────────────────
// Called by Jobber every 2 minutes while running.
// Accepts ONLY: appVersion, platform, isMarketConnected
// NEVER stores: api_key, mpin, totp_secret, client_code or any broker data
router.post('/heartbeat', auth, async (req, res) => {
  try {
    const { appVersion, platform, isMarketConnected } = req.body;
    const userId = req.user.id;
    const ip     = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || null;

    // Upsert into app_sessions — one row per user, updated on each heartbeat
    await pool.query(
      `INSERT INTO app_sessions (user_id, app_version, platform, is_market_connected, last_seen_at, ip_address)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (user_id) DO UPDATE SET
         app_version          = EXCLUDED.app_version,
         platform             = EXCLUDED.platform,
         is_market_connected  = EXCLUDED.is_market_connected,
         last_seen_at         = NOW(),
         ip_address           = EXCLUDED.ip_address`,
      [userId, appVersion || null, platform || null, isMarketConnected || false, ip]
    );

    // Also update users.last_login_at
    await pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [userId]
    ).catch(() => {});

    return res.json({ success: true, message: 'ok' });
  } catch (err) {
    console.error('[heartbeat]', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET /api/app/status (v2 — DB plan for announcements) ───────────────────────────────────────────────────────
// App checks its own session and gets any admin announcements
router.get('/status', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [userRes, sessionRes] = await Promise.all([
      pool.query('SELECT id, name, mobile, plan, is_active FROM users WHERE id = $1', [userId]),
      pool.query('SELECT app_version, platform, is_market_connected, last_seen_at FROM app_sessions WHERE user_id = $1', [userId]),
    ]);

    // Use DB plan (not JWT plan) so announcements target filter works correctly
    const userPlan = userRes.rows[0]?.plan || 'FREE';
    const announcementsRes = await pool.query(
      `SELECT id, title, body, type, created_at FROM announcements
       WHERE is_active = true
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (target = 'all'
              OR (target = 'paid'  AND $1 = 'PAID')
              OR (target = 'free'  AND $1 = 'FREE')
              OR (target = 'trial' AND $1 = 'TRIAL'))
       ORDER BY created_at DESC LIMIT 5`,
      [userPlan]
    );

    if (!userRes.rows.length) return res.status(404).json({ success: false, message: 'User not found' });

    const user = userRes.rows[0];
    if (!user.is_active) return res.status(403).json({ success: false, message: 'Account deactivated' });

    return res.json({
      success: true,
      user: { id: user.id, name: user.name, mobile: user.mobile, plan: user.plan },
      session: sessionRes.rows[0] || null,
      announcements: announcementsRes.rows,
    });
  } catch (err) {
    console.error('[app/status]', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

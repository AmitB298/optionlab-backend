'use strict';

/**
 * routes/jobber.routes.js
 *
 * Receives heartbeat pings from the Jobber Pro desktop app.
 * Writes to the app_sessions table so the admin panel can show
 * which users have the app running and whether they're connected
 * to Angel One.
 *
 * POST /api/jobber/heartbeat
 *   Body: { app_version, platform, is_market_connected }
 *   Auth: Bearer JWT (same token issued by /api/auth/login)
 */

const express      = require('express');
const router       = express.Router();
const { Pool }     = require('pg');
const jwt          = require('jsonwebtoken');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Lightweight JWT check (no DB hit for speed) ───────────────────────────────
function verifyToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token' });
  }
  try {
    const decoded = jwt.verify(
      header.slice(7),
      process.env.JWT_SECRET || 'optionlab-secret-2024'
    );
    req.user = decoded;          // { id, mobile, plan, iat, exp }
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// ── POST /api/jobber/heartbeat ────────────────────────────────────────────────
router.post('/heartbeat', verifyToken, async (req, res) => {
  const userId          = req.user.id;
  const app_version     = typeof req.body.app_version     === 'string'  ? req.body.app_version.slice(0, 20)  : 'unknown';
  const platform        = typeof req.body.platform        === 'string'  ? req.body.platform.slice(0, 20)     : 'win32';
  const is_market_connected = req.body.is_market_connected === true;
  const ip_address      = req.ip || null;

  try {
    await pool.query(
      `INSERT INTO app_sessions (user_id, app_version, platform, is_market_connected, last_seen_at, ip_address, created_at)
       VALUES ($1, $2, $3, $4, NOW(), $5, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         app_version        = EXCLUDED.app_version,
         platform           = EXCLUDED.platform,
         is_market_connected = EXCLUDED.is_market_connected,
         last_seen_at       = NOW(),
         ip_address         = EXCLUDED.ip_address`,
      [userId, app_version, platform, is_market_connected, ip_address]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('[jobber/heartbeat]', err.message);
    return res.status(500).json({ success: false, message: 'Heartbeat failed' });
  }
});

// ── GET /api/jobber/sessions (admin only — for admin panel) ───────────────────
// Returns all active Jobber sessions (last seen within 10 minutes)
router.get('/sessions', verifyToken, async (req, res) => {
  // Only allow admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin only' });
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        s.user_id,
        u.name,
        u.mobile,
        u.plan,
        s.app_version,
        s.platform,
        s.is_market_connected,
        s.last_seen_at,
        s.ip_address,
        CASE WHEN s.last_seen_at > NOW() - INTERVAL '10 minutes' THEN true ELSE false END AS is_online
      FROM app_sessions s
      JOIN users u ON u.id = s.user_id
      ORDER BY s.last_seen_at DESC
    `);

    return res.json({ success: true, sessions: rows });
  } catch (err) {
    console.error('[jobber/sessions]', err.message);
    return res.status(500).json({ success: false });
  }
});

module.exports = router;

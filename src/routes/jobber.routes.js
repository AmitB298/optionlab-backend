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
const jwt          = require('jsonwebtoken');

const pool = require('../db/pool');

// ── Lightweight JWT check (no DB hit for speed) ───────────────────────────────
function verifyToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token' });
  }
  try {
    const decoded = jwt.verify(
      header.slice(7),
      process.env.JWT_SECRET
    );
    req.user = decoded;          // { id, mobile, plan, iat, exp }
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// ── POST /api/jobber/heartbeat ────────────────────────────────────────────────
router.post('/heartbeat', verifyToken, async (req, res) => {
  const userId              = req.user.id;
  const app_version         = typeof req.body.app_version     === 'string' ? req.body.app_version.slice(0, 20) : 'unknown';
  const platform            = typeof req.body.platform        === 'string' ? req.body.platform.slice(0, 20)    : 'win32';
  const is_market_connected = req.body.is_market_connected === true;
  const ip_address          = req.ip || null;
  const fyers_client_id     = typeof req.body.fyers_client_id === 'string' ? req.body.fyers_client_id.trim().toUpperCase() : null;

  try {
    // ── DB se fresh user check — plan + expiry ────────────────────────────
    const { rows: [user] } = await pool.query(
      `SELECT plan, plan_expires_at, is_active, broker_client_id FROM users WHERE id = $1`,
      [userId]
    );

    if (!user || !user.is_active) {
      return res.status(403).json({ success: false, message: 'Account inactive' });
    }

    // Plan check — FREE users Jobber use nahi kar sakte
    const allowedPlans = ['TRIAL', 'DAILY', 'WEEKLY', 'MONTHLY'];
    if (!allowedPlans.includes((user.plan || '').toUpperCase())) {
      return res.status(403).json({ success: false, message: 'Active plan required to use Jobber Pro', code: 'NO_PLAN' });
    }

    // Expiry check
    if (user.plan_expires_at && new Date(user.plan_expires_at) < new Date()) {
      return res.status(403).json({ success: false, message: 'Plan expired. Please renew.', code: 'PLAN_EXPIRED' });
    }

    // ── Fyers ID validation ───────────────────────────────────────────────
    if (fyers_client_id) {
      // Check: kya yeh Fyers ID kisi aur user ki hai?
      const { rows: otherUser } = await pool.query(
        `SELECT id FROM users WHERE broker_client_id = $1 AND id != $2 LIMIT 1`,
        [fyers_client_id, userId]
      );
      if (otherUser.length > 0) {
        return res.status(403).json({ success: false, message: 'Fyers ID mismatch — account suspended', code: 'FYERS_FRAUD' });
      }

      // Update broker_client_id if not set
      if (!user.broker_client_id) {
        await pool.query(`UPDATE users SET broker_client_id = $1 WHERE id = $2`, [fyers_client_id, userId]);
      }
    }
    // ─────────────────────────────────────────────────────────────────────
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

    return res.json({
      success: true,
      plan: user.plan,
      expires_at: user.plan_expires_at
    });
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


// ── GET /api/app/status — Jobber Pro health check ────────────────────────
router.get('/status', (req, res) => {
  return res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    market: 'NSE',
  });
});
module.exports = router;

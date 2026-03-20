/**
 * routes/auth.routes.js  [FIXED v3.0 — self-contained]
 *
 * CHANGES FROM v2:
 *  1. Removed ALL dependencies on device.service, session.service, auth.middleware
 *     — those files don't exist in the repo, causing silent require() failure
 *  2. Shared pool from ../db/pool
 *  3. POST /login-mpin added (alias for /login — what the frontend calls)
 *  4. POST /register added — full registration flow
 *  5. Device verification bypassed for web clients — no OTP required
 *     (can be re-enabled later when device.service is implemented)
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
require('dotenv').config();

const pool                 = require('../db/pool');
const V                    = require('../lib/validate');
const { userLoginLimiter } = require('../lib/rateLimit');

// Constant-time dummy hash — prevents user enumeration via timing
const DUMMY_HASH = '$2a$12$invalidhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

function issueJWT(user) {
  return jwt.sign(
    { id: user.id, mobile: user.mobile, plan: user.plan },
    process.env.JWT_SECRET,
    { expiresIn: '24h', algorithm: 'HS256' }
  );
}

// ─── Shared login handler ─────────────────────────────────────────────────────
async function handleLogin(req, res) {
  const mobileResult = V.mobile(req.body?.mobile);
  const mpinResult   = V.mpin(req.body?.mpin);

  if (!mobileResult.ok) return res.status(400).json({ error: 'Invalid mobile number' });
  if (!mpinResult.ok)   return res.status(400).json({ error: 'Invalid MPIN format' });

  try {
    const { rows } = await pool.query(
      `SELECT id, name, mobile, mpin_hash, plan, is_active
       FROM users WHERE mobile = $1`,
      [mobileResult.value]
    );

    // Always run bcrypt — constant time whether user exists or not
    const hash   = rows.length ? rows[0].mpin_hash : DUMMY_HASH;
    const mpinOk = await bcrypt.compare(mpinResult.value, hash);

    if (!rows.length || !mpinOk || !rows[0].is_active) {
      // Track failed attempts for existing users
      if (rows.length) {
        pool.query(`
          INSERT INTO user_activity (user_id, failed_logins, last_failed_at)
          VALUES ($1, 1, NOW())
          ON CONFLICT (user_id) DO UPDATE
            SET failed_logins  = user_activity.failed_logins + 1,
                last_failed_at = NOW()
        `, [rows[0].id]).catch(() => {});
      }
      return res.status(401).json({ error: 'Invalid mobile or MPIN' });
    }

    const user  = rows[0];
    const token = issueJWT(user);

    // Track successful login
    pool.query(`
      INSERT INTO user_activity (user_id, total_logins, last_login_at, last_login_ip)
      VALUES ($1, 1, NOW(), $2)
      ON CONFLICT (user_id) DO UPDATE
        SET total_logins  = user_activity.total_logins + 1,
            last_login_at = NOW(),
            last_login_ip = EXCLUDED.last_login_ip,
            failed_logins = 0
    `, [user.id, req.ip]).catch(() => {});

    return res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, mobile: user.mobile, plan: user.plan },
    });
  } catch (e) {
    console.error('[auth/login]', e.message);
    return res.status(500).json({ error: 'Login unavailable. Try again.' });
  }
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', userLoginLimiter, handleLogin);

// ─── POST /api/auth/login-mpin (frontend calls this) ─────────────────────────
router.post('/login-mpin', userLoginLimiter, handleLogin);

// ─── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', userLoginLimiter, async (req, res) => {
  const nameResult   = V.text(req.body?.name, { maxLen: 100, required: true });
  const mobileResult = V.mobile(req.body?.mobile);
  const mpinResult   = V.mpin(req.body?.mpin);

  if (!nameResult.ok)   return res.status(400).json({ error: nameResult.error || 'Invalid name' });
  if (!mobileResult.ok) return res.status(400).json({ error: 'Invalid mobile number' });
  if (!mpinResult.ok)   return res.status(400).json({ error: 'MPIN must be exactly 4 digits' });

  try {
    // Check mobile already registered
    const { rows: existing } = await pool.query(
      `SELECT id FROM users WHERE mobile = $1`, [mobileResult.value]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Mobile number already registered' });
    }

    const mpinHash = await bcrypt.hash(mpinResult.value, 12);

    const { rows } = await pool.query(
      `INSERT INTO users (name, mobile, mpin_hash, plan, is_active, role, created_at)
       VALUES ($1, $2, $3, 'FREE', true, 'user', NOW())
       RETURNING id, name, mobile, plan`,
      [nameResult.value.trim(), mobileResult.value, mpinHash]
    );

    const user  = rows[0];
    const token = issueJWT(user);

    // Seed user_activity row
    pool.query(
      `INSERT INTO user_activity (user_id, total_logins, last_login_at, last_login_ip)
       VALUES ($1, 1, NOW(), $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id, req.ip]
    ).catch(() => {});

    // Save Angel One credentials if provided
    const clientCode = typeof req.body?.broker_client_id === 'string'
      ? req.body.broker_client_id.trim() : null;
    const apiKey     = typeof req.body?.api_key === 'string'
      ? req.body.api_key.trim() : null;
    const totpSecret = typeof req.body?.totp_secret === 'string'
      ? req.body.totp_secret.trim() : null;

    if (clientCode && apiKey) {
      pool.query(
        `INSERT INTO angel_credentials
           (user_id, api_key, client_code, mpin, totp_secret)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE
           SET api_key      = EXCLUDED.api_key,
               client_code  = EXCLUDED.client_code,
               mpin         = EXCLUDED.mpin,
               totp_secret  = EXCLUDED.totp_secret,
               updated_at   = NOW()`,
        [user.id, apiKey, clientCode, mpinResult.value, totpSecret]
      ).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      token,
      user: { id: user.id, name: user.name, mobile: user.mobile, plan: user.plan },
    });
  } catch (e) {
    console.error('[auth/register]', e.message);
    return res.status(500).json({ error: 'Registration unavailable. Try again.' });
  }
});

// ─── GET /api/auth/validate ───────────────────────────────────────────────────
// Validate a stored JWT — used by Electron on launch
router.get('/validate', async (req, res) => {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false, error: 'No token provided' });
  }
  const token = header.slice(7).trim();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    // Verify account still active
    const { rows } = await pool.query(
      `SELECT id, name, mobile, plan, is_active FROM users WHERE id = $1`,
      [decoded.id]
    );
    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ valid: false, error: 'Account inactive' });
    }
    return res.json({ valid: true, user: rows[0] });
  } catch (e) {
    return res.status(401).json({ valid: false, error: 'Invalid or expired token' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  // Stateless JWT — client just discards the token
  return res.json({ success: true });
});

module.exports = router;

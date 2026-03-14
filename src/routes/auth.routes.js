/**
 * routes/auth.routes.js
 *
 * All authentication endpoints.
 * Used by: Electron app (login, validate) + web browser (resume, logout).
 *
 * What Electron sends to Railway: mobile, mpin (to log in), hardware device headers.
 * What Railway sends back: JWT token + { id, mobile, plan, name }.
 * That is the entire contract. No trading data crosses this boundary.
 *
 * Endpoints:
 *   POST /api/auth/login        → MPIN login, device fingerprint check
 *   GET  /api/auth/resume       → cookie-based resume (web browser)
 *   POST /api/auth/logout       → revoke cookie session
 *   POST /api/auth/logout-all   → revoke all sessions (all devices)
 *   GET  /api/auth/validate     → validate stored JWT (Electron on launch)
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
require('dotenv').config();

const V                   = require('../lib/validate');
const { userLoginLimiter } = require('../lib/rateLimit');
const { verifyToken }      = require('../middleware/auth.middleware');

const {
  generateDeviceFingerprint,
  isDeviceTrusted,
  initiateDeviceVerification,
} = require('../services/device.service');

const {
  generateRememberToken,
  saveRememberToken,
  validateRememberToken,
  revokeRememberToken,
  revokeAllUserSessions,
} = require('../services/session.service');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Constant-time dummy hash — prevents user enumeration via timing
const DUMMY_HASH = '$2a$12$invalidhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

const COOKIE_NAME = 'jbpro_session';
const COOKIE_OPTS = Object.freeze({
  httpOnly: true,
  secure:   true,
  sameSite: 'strict',
  maxAge:   30 * 24 * 60 * 60 * 1000,
  path:     '/',
});

function issueJWT(user) {
  return jwt.sign(
    { id: user.id, mobile: user.mobile, plan: user.plan },
    process.env.JWT_SECRET,
    { expiresIn: '24h', algorithm: 'HS256' }
  );
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', userLoginLimiter, async (req, res) => {
  const mobileResult = V.mobile(req.body?.mobile);
  const mpinResult   = V.mpin(req.body?.mpin);

  if (!mobileResult.ok || !mpinResult.ok) {
    return res.status(400).json({ error: 'Invalid mobile or MPIN' });
  }

  const rememberDevice = req.body?.rememberDevice !== false;

  try {
    const { rows } = await pool.query(
      `SELECT id, name, mobile, mpin_hash, plan, is_active
       FROM users WHERE mobile = $1`,
      [mobileResult.value]
    );

    // Always run bcrypt — constant time whether user exists or not
    const hash     = rows.length ? rows[0].mpin_hash : DUMMY_HASH;
    const mpinOk   = await bcrypt.compare(mpinResult.value, hash);

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

    const user = rows[0];

    // Device fingerprint — is this machine trusted?
    const fp = generateDeviceFingerprint(req);
    const { trusted } = await isDeviceTrusted(user.id, fp.deviceId);

    if (!trusted) {
      // New device — send OTP before trusting
      await initiateDeviceVerification(user.id, user.mobile, fp.deviceId, fp.deviceName);
      return res.status(202).json({
        deviceVerificationRequired: true,
        userId:   user.id,
        deviceId: fp.deviceId,
        message:  'New device detected. OTP sent to your registered mobile.',
      });
    }

    // Trusted device — issue JWT
    const token = issueJWT(user);

    // Track successful login
    pool.query(`
      INSERT INTO user_activity (user_id, total_logins, last_login_at, last_login_ip, last_device)
      VALUES ($1, 1, NOW(), $2, $3)
      ON CONFLICT (user_id) DO UPDATE
        SET total_logins  = user_activity.total_logins + 1,
            last_login_at = NOW(),
            last_login_ip = EXCLUDED.last_login_ip,
            last_device   = EXCLUDED.last_device,
            failed_logins = 0
    `, [user.id, req.ip, fp.deviceName]).catch(() => {});

    // Set remember-me cookie for web browser sessions
    if (rememberDevice) {
      const { raw, hash: tokenHash } = generateRememberToken();
      await saveRememberToken(user.id, fp.deviceId, tokenHash, req.ip,
        (req.headers['user-agent'] || '').slice(0, 500));
      res.cookie(COOKIE_NAME, raw, COOKIE_OPTS);
    }

    return res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, mobile: user.mobile, plan: user.plan },
    });
  } catch (e) {
    console.error('[auth/login]', e.message);
    return res.status(500).json({ error: 'Login unavailable. Try again.' });
  }
});

// ─── GET /api/auth/resume ─────────────────────────────────────────────────────
// Web browser: check remember-me cookie, issue fresh JWT if valid
router.get('/resume', async (req, res) => {
  try {
    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw || typeof raw !== 'string') {
      return res.status(401).json({ mustLogin: true });
    }

    const user = await validateRememberToken(raw);
    if (!user || !user.is_active) {
      res.clearCookie(COOKIE_NAME, { path: '/' });
      return res.status(401).json({ mustLogin: true });
    }

    const token = issueJWT(user);
    return res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, mobile: user.mobile, plan: user.plan },
    });
  } catch (e) {
    console.error('[auth/resume]', e.message);
    return res.status(500).json({ error: 'Session service unavailable.' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  try {
    const raw = req.cookies?.[COOKIE_NAME];
    if (raw) await revokeRememberToken(raw);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.json({ success: true });
  } catch {
    return res.json({ success: true }); // always succeed on logout
  }
});

// ─── POST /api/auth/logout-all ────────────────────────────────────────────────
router.post('/logout-all', async (req, res) => {
  try {
    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw) return res.status(401).json({ error: 'Not authenticated' });

    const user = await validateRememberToken(raw);
    if (!user) {
      res.clearCookie(COOKIE_NAME, { path: '/' });
      return res.status(401).json({ error: 'Session expired' });
    }

    await revokeAllUserSessions(user.user_id);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.json({ success: true });
  } catch (e) {
    console.error('[auth/logout-all]', e.message);
    return res.status(500).json({ error: 'Logout service unavailable.' });
  }
});

// ─── GET /api/auth/validate ───────────────────────────────────────────────────
// Electron on launch: verify stored JWT is still valid + account still active
router.get('/validate', verifyToken, (req, res) => {
  return res.json({ valid: true, user: req.user });
});



// ─── POST /api/auth/register ──────────────────────────────────────────────────
// Called by register.html: { name, mobile, mpin, clientId }
router.post('/register', async (req, res) => {
  const { name, mobile, mpin, clientId } = req.body || {};

  if (!name || !mobile || !mpin) {
    return res.status(400).json({ success: false, error: 'Name, mobile and MPIN are required' });
  }
  if (!/^[6-9]\d{9}$/.test(mobile)) {
    return res.status(400).json({ success: false, error: 'Invalid mobile number' });
  }
  if (!/^\d{4,6}$/.test(mpin)) {
    return res.status(400).json({ success: false, error: 'MPIN must be 4-6 digits' });
  }

  try {
    // Check duplicate mobile
    const existing = await pool.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Mobile number already registered' });
    }

    const mpinHash = await bcrypt.hash(mpin, 12);

    const result = await pool.query(
      `INSERT INTO users (name, mobile, mpin_hash, plan, is_active, role, angel_client_code, created_at)
       VALUES ($1, $2, $3, 'FREE', true, 'user', $4, NOW())
       RETURNING id, name, mobile, plan`,
      [name.trim(), mobile, mpinHash, clientId || null]
    );

    const user = result.rows[0];
    const token = issueJWT(user);

    // Log to admin audit
    pool.query(
      `INSERT INTO admin_audit_log (action, target_user_id, success, ip_address, created_at)
       VALUES ('user_register', $1, true, $2, NOW())`,
      [user.id, req.ip]
    ).catch(() => {});

    return res.status(201).json({
      success: true,
      token,
      user: { id: user.id, name: user.name, mobile: user.mobile, plan: user.plan },
    });
  } catch (e) {
    console.error('[auth/register]', e.message);
    return res.status(500).json({ success: false, error: 'Registration failed. Try again.' });
  }
});

// ─── POST /api/auth/login-mpin ────────────────────────────────────────────────
// Called by index.html: { mobile, mpin }
router.post('/login-mpin', userLoginLimiter, async (req, res) => {
  const { mobile, mpin } = req.body || {};

  if (!mobile || !mpin) {
    return res.status(400).json({ success: false, error: 'Mobile and MPIN are required' });
  }
  if (!/^[6-9]\d{9}$/.test(mobile)) {
    return res.status(400).json({ success: false, error: 'Invalid mobile number' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, name, mobile, mpin_hash, plan, is_active, role FROM users WHERE mobile = $1',
      [mobile]
    );

    const hash   = rows.length ? rows[0].mpin_hash : '$2a$12$invalidhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    const mpinOk = await bcrypt.compare(mpin, hash);

    if (!rows.length || !mpinOk || !rows[0].is_active) {
      // Track failed logins
      if (rows.length) {
        pool.query(
          `UPDATE users SET login_count = COALESCE(login_count, 0) WHERE id = $1`,
          [rows[0].id]
        ).catch(() => {});
      }
      return res.status(401).json({ success: false, error: 'Invalid mobile or MPIN' });
    }

    const user = rows[0];
    const token = issueJWT(user);

    // Update last login
    pool.query(
      `UPDATE users SET last_login_at = NOW(), login_count = COALESCE(login_count, 0) + 1 WHERE id = $1`,
      [user.id]
    ).catch(() => {});

    return res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, mobile: user.mobile, plan: user.plan, role: user.role },
    });
  } catch (e) {
    console.error('[auth/login-mpin]', e.message);
    return res.status(500).json({ success: false, error: 'Login unavailable. Try again.' });
  }
});

module.exports = router;

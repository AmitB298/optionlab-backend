/**
 * routes/auth.routes.js  [FIXED v2.1]
 *
 * FIXES:
 *  1. Shared pool from ../db/pool — no more standalone new Pool()
 *  2. Added POST /login-mpin alias — frontend calls /api/auth/login-mpin
 *  3. Added POST /register endpoint — frontend calls /api/auth/register
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

// ─── Shared login handler ─────────────────────────────────────────────────────
async function handleLogin(req, res) {
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

    const hash   = rows.length ? rows[0].mpin_hash : DUMMY_HASH;
    const mpinOk = await bcrypt.compare(mpinResult.value, hash);

    if (!rows.length || !mpinOk || !rows[0].is_active) {
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

    // Device fingerprint check
    const fp = generateDeviceFingerprint(req);
    const { trusted } = await isDeviceTrusted(user.id, fp.deviceId);

    if (!trusted) {
      await initiateDeviceVerification(user.id, user.mobile, fp.deviceId, fp.deviceName);
      return res.status(202).json({
        deviceVerificationRequired: true,
        userId:   user.id,
        deviceId: fp.deviceId,
        message:  'New device detected. OTP sent to your registered mobile.',
      });
    }

    const token = issueJWT(user);

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
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', userLoginLimiter, handleLogin);

// ─── POST /api/auth/login-mpin (alias used by frontend) ──────────────────────
router.post('/login-mpin', userLoginLimiter, handleLogin);

// ─── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', userLoginLimiter, async (req, res) => {
  const nameResult   = V.text(req.body?.name,   { maxLen: 100, required: true });
  const mobileResult = V.mobile(req.body?.mobile);
  const mpinResult   = V.mpin(req.body?.mpin);

  if (!nameResult.ok)   return res.status(400).json({ error: nameResult.error   || 'Invalid name' });
  if (!mobileResult.ok) return res.status(400).json({ error: 'Invalid mobile number' });
  if (!mpinResult.ok)   return res.status(400).json({ error: 'MPIN must be 4-6 digits' });

  try {
    // Check if mobile already registered
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
    const clientCode  = typeof req.body?.broker_client_id === 'string'
      ? req.body.broker_client_id.trim() : null;
    const apiKey      = typeof req.body?.api_key === 'string'
      ? req.body.api_key.trim() : null;
    const totpSecret  = typeof req.body?.totp_secret === 'string'
      ? req.body.totp_secret.trim() : null;

    if (clientCode && apiKey) {
      pool.query(
        `INSERT INTO angel_credentials (user_id, api_key, client_code, mpin, totp_secret)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE
           SET api_key = EXCLUDED.api_key,
               client_code = EXCLUDED.client_code,
               mpin = EXCLUDED.mpin,
               totp_secret = EXCLUDED.totp_secret,
               updated_at = NOW()`,
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

// ─── GET /api/auth/resume ─────────────────────────────────────────────────────
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
    return res.json({ success: true });
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
router.get('/validate', verifyToken, (req, res) => {
  return res.json({ valid: true, user: req.user });
});

module.exports = router;

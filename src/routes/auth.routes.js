'use strict';
/**
 * auth.routes.js v7.0 — httpOnly cookie auth
 *
 * POST /api/auth/login-mpin   → sets ol_tok cookie + returns user
 * POST /api/auth/register     → sets ol_tok cookie + returns user
 * POST /api/auth/login-email  → magic link login
 * GET  /api/auth/validate     → reads cookie or Bearer, returns user
 * POST /api/auth/logout       → clears cookie
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const pool     = require('../db/pool');
const { createLimiter } = require('../lib/rateLimit');

const router = express.Router();

// Bug #5: Fail fast if JWT_SECRET missing
if (!process.env.JWT_SECRET) {
  console.error('[auth] FATAL: JWT_SECRET not set');
  process.exit(1);
}

// ── Rate limiters ─────────────────────────────────────────────────────────
const loginLimiter = createLimiter({
  max:      10,
  windowMs: 15 * 60 * 1000,
  blockMs:  15 * 60 * 1000,
  message:  'Too many login attempts. Try again in 15 minutes.',
  keyFn:    (req) => `login:${req.ip}:${(req.body?.mobile || '').slice(-4)}`,
});

const registerLimiter = createLimiter({
  max:      5,
  windowMs: 60 * 60 * 1000,
  blockMs:  60 * 60 * 1000,
  message:  'Too many registration attempts. Try again in 1 hour.',
  keyFn:    (req) => `register:${req.ip}`,
});

const JWT_SECRET    = process.env.JWT_SECRET;
const SALT_ROUNDS   = 12;
const TOKEN_EXPIRES = '7d';

// Cookie config — httpOnly, Secure in prod, SameSite=Strict
const COOKIE_OPTS = {
  httpOnly:  true,
  secure:    process.env.NODE_ENV === 'production',
  sameSite:  'none',
  maxAge:    7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path:      '/',
};

function isValidMobile(v) {
  return /^[6-9]\d{9}$/.test(v);
}
function isValidMpin(v) {
  return /^\d{4,6}$/.test(v);
}
function isValidName(v) {
  return typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 100;
}
function isValidReferral(v) {
  return !v || /^[A-Z0-9\-]{1,30}$/.test(v.toUpperCase());
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, mobile: user.mobile, email: user.email, plan: user.plan },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRES }
  );
}

function setCookie(res, token) {
  res.cookie('ol_tok', token, COOKIE_OPTS);
}

function updateActivity(userId, ip, device) {
  pool.query(`
    INSERT INTO user_activity (user_id, total_logins, last_login_at, last_login_ip, last_device, session_count)
    VALUES ($1, 1, NOW(), $2, $3, 1)
    ON CONFLICT (user_id) DO UPDATE SET
      total_logins  = user_activity.total_logins + 1,
      last_login_at = NOW(),
      last_login_ip = $2,
      last_device   = $3,
      session_count = user_activity.session_count + 1,
      failed_logins = 0
  `, [userId, ip || null, device || null]).catch(e =>
    console.error('[auth] activity update failed:', e.message)
  );
}

// ── POST /api/auth/login-mpin ─────────────────────────────────────────────
router.post('/login-mpin', loginLimiter, async (req, res) => {
  try {
    const mobile = (req.body.mobile || '').trim();
    const mpin   = (req.body.mpin   || '').trim();

    if (!isValidMobile(mobile)) return res.status(400).json({ error: 'Invalid mobile number' });
    if (!isValidMpin(mpin))     return res.status(400).json({ error: 'MPIN must be 4-6 digits' });

    const { rows } = await pool.query(
      `SELECT id, name, mobile, email, mpin_hash, broker_client_id, plan, is_active
       FROM users WHERE mobile = $1 AND role = 'user'`,
      [mobile]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Mobile not registered. Please create an account.' });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account suspended. Contact support.' });
    }

    const match = await bcrypt.compare(mpin, user.mpin_hash);
    if (!match) {
      // Track failed login
      pool.query(`
        INSERT INTO user_activity (user_id, failed_logins, last_failed_at)
        VALUES ($1, 1, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          failed_logins  = user_activity.failed_logins + 1,
          last_failed_at = NOW()
      `, [user.id]).catch(() => {});
      return res.status(401).json({ error: 'Incorrect MPIN' });
    }

    const token = signToken(user);
    setCookie(res, token);
    updateActivity(user.id, req.ip, req.headers['user-agent']?.slice(0, 100));

    return res.json({
      success: true,
      token,   // also return for Jobber Pro desktop app (can't use cookies)
      user: {
        id:     user.id,
        name:   user.name,
        mobile: user.mobile,
        email:  user.email,
        plan:   user.plan,
      },
    });
  } catch (e) {
    console.error('[auth] login-mpin:', e.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// Alias for backwards compat
router.post('/login', (req, res, next) => {
  req.url = '/login-mpin';
  router.handle(req, res, next);
});

// ── POST /api/auth/register ───────────────────────────────────────────────
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const emailToken = (req.body.email_token || '').trim();
    if (!emailToken) {
      return res.status(400).json({ error: 'Email verification required. Please verify your email first.' });
    }

    let emailPayload;
    try {
      emailPayload = jwt.verify(emailToken, JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'Email verification expired. Please start registration again.' });
    }

    const verifiedEmail = emailPayload.email;
    if (!verifiedEmail) {
      return res.status(400).json({ error: 'Invalid email token.' });
    }

    const name         = (req.body.name             || '').trim();
    const mobile       = (req.body.mobile           || '').trim();
    const mpin         = (req.body.mpin             || '').trim();
    const angelId      = (req.body.broker_client_id || '').trim().toUpperCase();
    const experience   = (req.body.experience       || '').trim().toLowerCase();
    const tradingStyle = (req.body.trading_style    || '').trim().toLowerCase();
    const referralCode = (req.body.referral_code    || '').trim().toUpperCase() || null;

    if (!isValidName(name))     return res.status(400).json({ error: 'Name must be 2-100 characters' });
    if (!isValidMobile(mobile)) return res.status(400).json({ error: 'Invalid mobile number' });
    if (!isValidMpin(mpin))     return res.status(400).json({ error: 'MPIN must be 4-6 digits' });
    if (!isValidReferral(referralCode)) return res.status(400).json({ error: 'Invalid referral code format' });

    // Check duplicates
    const { rows: existing } = await pool.query(
      `SELECT id FROM users WHERE mobile = $1 OR email = $2`,
      [mobile, verifiedEmail]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Account already exists with this mobile or email.' });
    }

    const mpinHash = await bcrypt.hash(mpin, SALT_ROUNDS);

    const { rows: [newUser] } = await pool.query(`
      INSERT INTO users
        (name, email, mobile, mpin_hash, broker_client_id,
         experience, trading_style, referral_code, plan, is_active, role, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'FREE', true, 'user', NOW())
      RETURNING id, name, email, mobile, broker_client_id, plan
    `, [name.trim(), verifiedEmail, mobile, mpinHash,
        angelId || null, experience || null, tradingStyle || null, referralCode]);

    const token = signToken(newUser);
    setCookie(res, token);
    updateActivity(newUser.id, req.ip, req.headers['user-agent']?.slice(0, 100));

    return res.status(201).json({
      success: true,
      token,
      user: {
        id:     newUser.id,
        name:   newUser.name,
        mobile: newUser.mobile,
        email:  newUser.email,
        plan:   newUser.plan,
      },
    });
  } catch (e) {
    console.error('[auth] register:', e.message);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/auth/login-email (magic link) ───────────────────────────────
router.post('/login-email', async (req, res) => {
  const emailToken = (req.body.email_token || '').trim();
  if (!emailToken) return res.status(400).json({ error: 'Email token required' });

  try {
    let payload;
    try {
      payload = jwt.verify(emailToken, JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'Link expired or invalid. Request a new one.' });
    }

    const { rows } = await pool.query(
      `SELECT id, name, mobile, email, plan, is_active FROM users WHERE email = $1 AND role = 'user'`,
      [payload.email]
    );

    if (!rows.length) return res.status(404).json({ error: 'Account not found' });
    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'Account suspended' });

    const token = signToken(user);
    setCookie(res, token);
    updateActivity(user.id, req.ip, req.headers['user-agent']?.slice(0, 100));

    return res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, mobile: user.mobile, email: user.email, plan: user.plan },
    });
  } catch (e) {
    console.error('[auth] login-email:', e.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ── GET /api/auth/validate ────────────────────────────────────────────────
router.get('/validate', (req, res) => {
  // Read from cookie or Bearer header
  let token = req.cookies?.ol_tok;
  if (!token) {
    const h = req.headers['authorization'];
    if (h?.startsWith('Bearer ')) token = h.slice(7);
  }
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ valid: true, user: decoded });
  } catch {
    res.clearCookie('ol_tok');
    return res.status(401).json({ error: 'Token expired' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('ol_tok', { path: '/' });
  return res.json({ success: true });
});

module.exports = router;

'use strict';

/**
 * routes/auth.routes.js  [v6.0 — Magic link email verification]
 *
 * login-mpin  — mobile + MPIN, unchanged
 * register    — accepts email_token JWT (from magic link flow), not otp_token
 *               email extracted from JWT, not from req.body
 *               new fields: experience, trading_style, referral_code
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');                          // bcryptjs — pure JS, no native compile needed
const jwt      = require('jsonwebtoken');
const pool = require('../db/pool');
const { validateMobile, validateMpin, validateName, validateAngelId } = require('../validate');

const router = express.Router();

const JWT_SECRET      = process.env.JWT_SECRET;
const SALT_ROUNDS     = 12;
const SESSION_EXPIRES = '7d';

// ─── helpers ────────────────────────────────────────────────────────────────
function isValidExperience(v) {
  return ['beginner', 'intermediate', 'pro'].includes(v);
}
function isValidStyle(v) {
  return ['intraday', 'positional', 'both'].includes(v);
}
function isValidReferral(v) {
  return !v || /^[A-Z0-9\-]{1,30}$/.test(v.toUpperCase());
}

/* ══════════════════════════════════════════════════════════════
   POST /api/auth/login-mpin
   Body: { mobile, mpin }
══════════════════════════════════════════════════════════════ */
router.post('/login-mpin', async (req, res) => {
  try {
    const mobile = (req.body.mobile || '').trim();
    const mpin   = (req.body.mpin   || '').trim();

    const mv = validateMobile(mobile);
    if (!mv.ok) return res.status(400).json({ error: mv.error });

    const mpv = validateMpin(mpin);
    if (!mpv.ok) return res.status(400).json({ error: mpv.error });

    const result = await pool.query(
      'SELECT id, name, mobile, email, mpin_hash, broker_client_id, plan, is_active FROM users WHERE mobile = $1',
      [mv.value]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Mobile number not registered. Please create an account.' });
    }

    const user  = result.rows[0];
    const match = await bcrypt.compare(mpv.value, user.mpin_hash);

    if (!match || !user.is_active) {
      // Track failed logins (fire-and-forget, only for wrong MPIN on active accounts)
      if (user.is_active && !match) {
        pool.query(`
          INSERT INTO user_activity (user_id, failed_logins, last_failed_at)
          VALUES ($1, 1, NOW())
          ON CONFLICT (user_id) DO UPDATE
            SET failed_logins  = user_activity.failed_logins + 1,
                last_failed_at = NOW()
        `, [user.id]).catch(() => {});
      }
      return res.status(401).json({ error: 'Invalid mobile or MPIN' });
    }

    // Track successful login (fire-and-forget)
    pool.query(`
      INSERT INTO user_activity (user_id, total_logins, last_login_at, last_login_ip)
      VALUES ($1, 1, NOW(), $2)
      ON CONFLICT (user_id) DO UPDATE
        SET total_logins  = user_activity.total_logins + 1,
            last_login_at = NOW(),
            last_login_ip = EXCLUDED.last_login_ip,
            failed_logins = 0
    `, [user.id, req.ip]).catch(() => {});

    const token = jwt.sign(
      { id: user.id, mobile: user.mobile, email: user.email, plan: user.plan },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRES }
    );

    console.log(`[Auth] Login: ${user.mobile}`);
    return res.json({
      success: true,
      token,
      user: {
        id:               user.id,
        name:             user.name,
        mobile:           user.mobile,
        email:            user.email,
        plan:             user.plan,
        broker_client_id: user.broker_client_id,
      },
    });

  } catch (err) {
    console.error('[Auth] login-mpin error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// Also mount on /login for backwards compat
router.post('/login', async (req, res, next) => {
  req.url = '/login-mpin';
  router.handle(req, res, next);
});

/* ══════════════════════════════════════════════════════════════
   POST /api/auth/register
   Body: {
     email_token,       ← JWT from magic link flow
     name,
     mobile,
     mpin,
     broker_client_id,
     experience,
     trading_style,
     referral_code,     ← optional
   }
══════════════════════════════════════════════════════════════ */
router.post('/register', async (req, res) => {
  try {
    /* ── 1. Verify email_token JWT ── */
    const emailToken = (req.body.email_token || '').trim();
    if (!emailToken) {
      return res.status(400).json({ error: 'Email verification required. Please verify your email first.' });
    }

    let emailPayload;
    try {
      emailPayload = jwt.verify(emailToken, JWT_SECRET);
    } catch (jwtErr) {
      return res.status(400).json({ error: 'Email verification expired. Please start registration again.' });
    }

    if (emailPayload.purpose !== 'email_verification') {
      return res.status(400).json({ error: 'Invalid verification token.' });
    }

    const verifiedEmail  = emailPayload.email;
    const verificationId = emailPayload.verification_id;

    /* ── 2. Confirm verification row is still valid in DB ── */
    const verifyRow = await pool.query(
      `SELECT id FROM email_verifications
       WHERE id = $1 AND email = $2
         AND verified = true AND used = false AND expires_at > NOW()`,
      [verificationId, verifiedEmail]
    );

    if (verifyRow.rows.length === 0) {
      return res.status(400).json({ error: 'Email verification has expired or already been used. Please start again.' });
    }

    /* ── 3. Validate all other fields ── */
    const name         = (req.body.name             || '').trim();
    const mobile       = (req.body.mobile           || '').trim();
    const mpin         = (req.body.mpin             || '').trim();
    const angelId      = (req.body.broker_client_id || '').trim().toUpperCase();
    const experience   = (req.body.experience       || '').trim().toLowerCase();
    const tradingStyle = (req.body.trading_style    || '').trim().toLowerCase();
    const referralCode = (req.body.referral_code    || '').trim().toUpperCase() || null;

    const nv = validateName(name);
    if (!nv.ok) return res.status(400).json({ error: nv.error });

    const mv = validateMobile(mobile);
    if (!mv.ok) return res.status(400).json({ error: mv.error });

    const mpv = validateMpin(mpin);
    if (!mpv.ok) return res.status(400).json({ error: mpv.error });

    const av = validateAngelId(angelId);
    if (!av.ok) return res.status(400).json({ error: av.error });

    if (!isValidExperience(experience)) {
      return res.status(400).json({ error: 'Invalid experience level. Must be beginner, intermediate, or pro.' });
    }
    if (!isValidStyle(tradingStyle)) {
      return res.status(400).json({ error: 'Invalid trading style. Must be intraday, positional, or both.' });
    }
    if (!isValidReferral(referralCode)) {
      return res.status(400).json({ error: 'Invalid referral code format.' });
    }

    /* ── 4. Duplicate checks ── */
    const dupMobile = await pool.query('SELECT id FROM users WHERE mobile = $1', [mv.value]);
    if (dupMobile.rows.length > 0) {
      return res.status(409).json({ error: 'This mobile number is already registered. Please login instead.' });
    }

    const dupEmail = await pool.query('SELECT id FROM users WHERE email = $1', [verifiedEmail]);
    if (dupEmail.rows.length > 0) {
      return res.status(409).json({ error: 'This email is already registered. Please login instead.' });
    }

    const dupAngel = await pool.query('SELECT id FROM users WHERE broker_client_id = $1', [av.value]);
    if (dupAngel.rows.length > 0) {
      return res.status(409).json({ error: 'This Angel One Client ID is already registered.' });
    }

    /* ── 5. Hash MPIN ── */
    const mpinHash = await bcrypt.hash(mpv.value, SALT_ROUNDS);

    /* ── 6. Insert user ── */
    const insertResult = await pool.query(
      `INSERT INTO users
         (name, email, mobile, mpin_hash, broker_client_id,
          experience, trading_style, referral_code, plan, is_active, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'FREE', true, 'user', NOW())
       RETURNING id, name, email, mobile, broker_client_id, experience, trading_style, plan`,
      [nv.value, verifiedEmail, mv.value, mpinHash, av.value, experience, tradingStyle, referralCode]
    );

    const newUser = insertResult.rows[0];

    /* ── 7. Mark email_verification as used ── */
    await pool.query(
      `UPDATE email_verifications SET used = true, used_at = NOW() WHERE id = $1`,
      [verificationId]
    );

    /* ── 8. Seed user_activity (fire-and-forget) ── */
    pool.query(
      `INSERT INTO user_activity (user_id, total_logins, last_login_at, last_login_ip)
       VALUES ($1, 1, NOW(), $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [newUser.id, req.ip]
    ).catch(() => {});

    /* ── 9. Mirror into angel_credentials (fire-and-forget) ── */
    const apiKey     = typeof req.body.api_key     === 'string' ? req.body.api_key.trim()     : null;
    const totpSecret = typeof req.body.totp_secret === 'string' ? req.body.totp_secret.trim() : null;
    pool.query(
      `INSERT INTO angel_credentials (user_id, client_code, api_key, totp_secret)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET client_code = EXCLUDED.client_code,
             api_key     = COALESCE(EXCLUDED.api_key, angel_credentials.api_key),
             totp_secret = COALESCE(EXCLUDED.totp_secret, angel_credentials.totp_secret),
             updated_at  = NOW()`,
      [newUser.id, av.value, apiKey, totpSecret]
    ).catch(() => {});

    /* ── 10. Issue session JWT ── */
    const token = jwt.sign(
      { id: newUser.id, mobile: newUser.mobile, email: newUser.email, plan: newUser.plan },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRES }
    );

    console.log(`[Auth] Registered: ${newUser.mobile} / ${verifiedEmail}`);
    return res.status(201).json({
      success: true,
      token,
      user: {
        id:               newUser.id,
        name:             newUser.name,
        email:            newUser.email,
        mobile:           newUser.mobile,
        plan:             newUser.plan,
        broker_client_id: newUser.broker_client_id,
        experience:       newUser.experience,
        trading_style:    newUser.trading_style,
      },
    });

  } catch (err) {
    console.error('[Auth] register error:', err.message);

    if (err.code === '23505') {
      if (err.constraint && err.constraint.includes('mobile'))           return res.status(409).json({ error: 'This mobile number is already registered.' });
      if (err.constraint && err.constraint.includes('email'))            return res.status(409).json({ error: 'This email is already registered.' });
      if (err.constraint && err.constraint.includes('broker_client_id')) return res.status(409).json({ error: 'This Angel One Client ID is already registered.' });
      return res.status(409).json({ error: 'Account already exists with these details.' });
    }

    return res.status(500).json({ error: 'Registration unavailable. Please try again.' });
  }
});

/* ── GET /api/auth/validate ── */
router.get('/validate', async (req, res) => {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false, error: 'No token provided' });
  }
  const token = header.slice(7).trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const { rows } = await pool.query(
      'SELECT id, name, email, mobile, plan, is_active FROM users WHERE id = $1',
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

/* ── POST /api/auth/logout ── */
router.post('/logout', (req, res) => res.json({ success: true }));

module.exports = router;

/**
 * routes/auth.routes.js  [v4.0 — Angel One ID mandatory + immutable]
 *
 * CHANGES FROM v3:
 *  1. broker_client_id is now MANDATORY at registration — no optional path
 *  2. broker_client_id validated via V.angelOneId() — 6-10 alphanumeric, auto-uppercase
 *  3. broker_client_id stored in BOTH users.broker_client_id AND angel_credentials.client_code
 *  4. broker_client_id is NEVER updated in any route — immutability enforced here + DB trigger
 *  5. mpin validator updated to 4-6 digits (web=6, Electron=4)
 *  6. Duplicate broker_client_id check added — one Angel One ID per account
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

  // ── Validate all fields ──────────────────────────────────────────────────
  const nameResult     = V.text(req.body?.name, { maxLen: 100, required: true });
  const mobileResult   = V.mobile(req.body?.mobile);
  const mpinResult     = V.mpin(req.body?.mpin);
  const angelIdResult  = V.angelOneId(req.body?.broker_client_id);  // MANDATORY

  if (!nameResult.ok)    return res.status(400).json({ error: nameResult.error || 'Invalid name' });
  if (!mobileResult.ok)  return res.status(400).json({ error: 'Invalid mobile number' });
  if (!mpinResult.ok)    return res.status(400).json({ error: mpinResult.error });
  if (!angelIdResult.ok) return res.status(400).json({ error: angelIdResult.error });

  try {
    // ── Check mobile already registered ────────────────────────────────────
    const { rows: existingMobile } = await pool.query(
      `SELECT id FROM users WHERE mobile = $1`,
      [mobileResult.value]
    );
    if (existingMobile.length) {
      return res.status(409).json({ error: 'Mobile number already registered' });
    }

    // ── Check Angel One ID already registered (one ID per account) ─────────
    const { rows: existingAngel } = await pool.query(
      `SELECT id FROM users WHERE broker_client_id = $1`,
      [angelIdResult.value]
    );
    if (existingAngel.length) {
      return res.status(409).json({ error: 'This Angel One Client ID is already linked to an account' });
    }

    // ── Hash MPIN ───────────────────────────────────────────────────────────
    const mpinHash = await bcrypt.hash(mpinResult.value, 12);

    // ── Insert user — broker_client_id stored permanently ──────────────────
    // NOTE: broker_client_id column must be NOT NULL in schema.
    // A DB trigger (trg_lock_broker_client_id) prevents any future UPDATE
    // from changing this column. See migration below.
    const { rows } = await pool.query(
      `INSERT INTO users (name, mobile, mpin_hash, broker_client_id, plan, is_active, role, created_at)
       VALUES ($1, $2, $3, $4, 'FREE', true, 'user', NOW())
       RETURNING id, name, mobile, plan, broker_client_id`,
      [
        nameResult.value.trim(),
        mobileResult.value,
        mpinHash,
        angelIdResult.value,   // always uppercase, always present
      ]
    );

    const user  = rows[0];
    const token = issueJWT(user);

    // ── Seed user_activity row ──────────────────────────────────────────────
    pool.query(
      `INSERT INTO user_activity (user_id, total_logins, last_login_at, last_login_ip)
       VALUES ($1, 1, NOW(), $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id, req.ip]
    ).catch(() => {});

    // ── Mirror into angel_credentials for SmartAPI use ──────────────────────
    // api_key and totp_secret are optional at registration — user adds them in Setup.
    // client_code is always written here since we just validated it.
    const apiKey     = typeof req.body?.api_key === 'string'
      ? req.body.api_key.trim() : null;
    const totpSecret = typeof req.body?.totp_secret === 'string'
      ? req.body.totp_secret.trim() : null;

    pool.query(
      `INSERT INTO angel_credentials
         (user_id, client_code, api_key, totp_secret)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET client_code  = EXCLUDED.client_code,
             api_key      = COALESCE(EXCLUDED.api_key, angel_credentials.api_key),
             totp_secret  = COALESCE(EXCLUDED.totp_secret, angel_credentials.totp_secret),
             updated_at   = NOW()`,
      [user.id, angelIdResult.value, apiKey, totpSecret]
    ).catch(() => {});

    return res.status(201).json({
      success: true,
      token,
      user: {
        id:               user.id,
        name:             user.name,
        mobile:           user.mobile,
        plan:             user.plan,
        broker_client_id: user.broker_client_id,
      },
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
  return res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// REQUIRED DATABASE MIGRATION
// Run this once against your Railway PostgreSQL before deploying this file.
//
// -- 1. Add broker_client_id column to users (if not already present)
// ALTER TABLE users ADD COLUMN IF NOT EXISTS broker_client_id VARCHAR(10);
//
// -- 2. Make it NOT NULL (after backfilling any existing rows if needed)
// ALTER TABLE users ALTER COLUMN broker_client_id SET NOT NULL;
//
// -- 3. Unique constraint — one Angel One ID per account
// CREATE UNIQUE INDEX IF NOT EXISTS uq_users_broker_client_id
//   ON users (broker_client_id);
//
// -- 4. Immutability trigger — prevents any UPDATE from changing the column
// CREATE OR REPLACE FUNCTION lock_broker_client_id()
// RETURNS TRIGGER AS $$
// BEGIN
//   IF OLD.broker_client_id IS DISTINCT FROM NEW.broker_client_id THEN
//     RAISE EXCEPTION 'broker_client_id cannot be changed after registration';
//   END IF;
//   RETURN NEW;
// END;
// $$ LANGUAGE plpgsql;
//
// CREATE TRIGGER trg_lock_broker_client_id
// BEFORE UPDATE ON users
// FOR EACH ROW EXECUTE FUNCTION lock_broker_client_id();
// ─────────────────────────────────────────────────────────────────────────────

module.exports = router;

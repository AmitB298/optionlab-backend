/**
 * routes/user.routes.js
 *
 * Everything a logged-in user can do via the Railway API.
 * This is intentionally minimal — Jobber is an Electron app,
 * so the only things that need to cross the wire are:
 *
 *   - Who am I? (profile)
 *   - Which devices have I trusted? (device management)
 *   - Change my MPIN
 *   - Any announcements from admin?
 *
 * Angel One credentials, options data, trading — all local to Electron.
 * None of that comes here.
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const { auth: verifyToken } = require('../middleware/auth');
const pool = require('../db/pool');
const V    = require('../lib/validate');

router.use(verifyToken);

function err500(res, e) {
  console.error('[user.routes]', e.message);
  return res.status(500).json({ error: 'Request failed' });
}

// ─── GET /api/user/profile ────────────────────────────────────────────────────
// What the Electron app needs to show in the user's account section.
// Returns: identity, plan, login history, trusted device list.
// Does NOT return: anything about Angel One, trading, options.
router.get('/profile', async (req, res) => {
  try {
    const uid = req.user.id;

    const [userRes, devicesRes] = await Promise.all([
      pool.query(`
        SELECT u.id, u.name, u.email, u.mobile, u.plan, u.created_at,
               u.experience, u.trading_style, u.referral_code, u.is_active,
               u.broker_client_id,
               CASE WHEN u.mpin_hash IS NOT NULL THEN true ELSE false END AS is_mpin_set,
               ua.total_logins, ua.last_login_at, ua.last_login_ip, ua.failed_logins,
               COALESCE(ac.client_code, u.broker_client_id) AS angel_one_client_id
        FROM users u
        LEFT JOIN user_activity ua ON ua.user_id = u.id
        LEFT JOIN angel_credentials ac ON ac.user_id = u.id
        WHERE u.id = $1
      `, [uid]),

      pool.query(`
        SELECT id, device_name, platform, is_trusted, last_seen_at, verified_at, created_at
        FROM trusted_devices
        WHERE user_id = $1 AND is_trusted = true
        ORDER BY last_seen_at DESC NULLS LAST
      `, [uid]),
    ]);

    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' });

    const u = userRes.rows[0];
    return res.json({
      id:                  u.id,
      name:                u.name,
      full_name:           u.name,
      email:               u.email,
      mobile:              u.mobile,
      plan:                u.plan,
      created_at:          u.created_at,
      createdAt:           u.created_at,
      is_active:           u.is_active !== false,
      is_mpin_set:         u.is_mpin_set,
      experience:          u.experience,
      trading_style:       u.trading_style,
      referral_code:       u.referral_code,
      broker_client_id:    u.broker_client_id,
      angel_one_client_id: u.angel_one_client_id,
      totalLogins:         u.total_logins  || 0,
      total_logins:        u.total_logins  || 0,
      lastLoginAt:         u.last_login_at || null,
      last_login_at:       u.last_login_at || null,
      lastLoginIp:         u.last_login_ip || null,
      failedLogins:        u.failed_logins || 0,
      devices:             devicesRes.rows,
    });
  } catch (e) { return err500(res, e); }
});

// ─── PATCH /api/user/profile ──────────────────────────────────────────────────
// User can only update their display name.
router.patch('/profile', async (req, res) => {
  const nameResult = V.text(req.body?.name, { maxLen: 100, required: true });
  if (!nameResult.ok) return res.status(400).json({ error: nameResult.error });

  try {
    await pool.query(`UPDATE users SET name = $1 WHERE id = $2`, [nameResult.value, req.user.id]);
    return res.json({ success: true, name: nameResult.value });
  } catch (e) { return err500(res, e); }
});

// ─── GET /api/user/devices ────────────────────────────────────────────────────
router.get('/devices', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, device_name, platform, ip_address,
             is_trusted, last_seen_at, verified_at, created_at
      FROM trusted_devices
      WHERE user_id = $1
      ORDER BY last_seen_at DESC NULLS LAST
    `, [req.user.id]);
    return res.json({ devices: rows });
  } catch (e) { return err500(res, e); }
});

// ─── DELETE /api/user/devices/:id ─────────────────────────────────────────────
// User can revoke any of their own trusted devices.
router.delete('/devices/:id', async (req, res) => {
  const idResult = V.userId(req.params.id);
  if (!idResult.ok) return res.status(400).json({ error: 'Invalid device ID' });

  try {
    const { rowCount } = await pool.query(
      // user_id = $2 ensures users can only touch their OWN devices
      `DELETE FROM trusted_devices WHERE id = $1 AND user_id = $2`,
      [idResult.value, req.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Device not found' });
    return res.json({ success: true });
  } catch (e) { return err500(res, e); }
});

// ─── POST /api/user/change-mpin ───────────────────────────────────────────────
// User changes their own MPIN. Requires current MPIN to authorise.
// Forces re-login on all devices after change.
router.post('/change-mpin', async (req, res) => {
  const currentResult = V.mpin(req.body?.current_mpin);
  const newResult     = V.mpin(req.body?.new_mpin);

  if (!currentResult.ok) return res.status(400).json({ error: 'current_mpin must be a 4-digit string' });
  if (!newResult.ok)     return res.status(400).json({ error: 'new_mpin must be a 4-digit string' });
  if (currentResult.value === newResult.value) {
    return res.status(400).json({ error: 'New MPIN must differ from current' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT mpin_hash FROM users WHERE id = $1`, [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentResult.value, rows[0].mpin_hash);
    if (!valid) return res.status(401).json({ error: 'Current MPIN is incorrect' });

    const newHash = await bcrypt.hash(newResult.value, 12);
    await pool.query(`UPDATE users SET mpin_hash = $1 WHERE id = $2`, [newHash, req.user.id]);

    // Security: force re-login everywhere after MPIN change
    await pool.query(`DELETE FROM remember_tokens WHERE user_id = $1`, [req.user.id]);
    await pool.query(`UPDATE trusted_devices SET is_trusted = false WHERE user_id = $1`, [req.user.id]);

    return res.json({ success: true, message: 'MPIN changed. Please log in again.' });
  } catch (e) { return err500(res, e); }
});

// ─── GET /api/user/announcements ──────────────────────────────────────────────
// Admin-published notices targeted at this user's plan tier.
// Electron app can show these in an in-app notification bar.
router.get('/announcements', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, title, body, type, created_at
      FROM admin_announcements
      WHERE is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (target = 'all'
             OR (target = 'paid'  AND $1 = 'PAID')
             OR (target = 'free'  AND $1 = 'FREE')
             OR (target = 'trial' AND $1 = 'TRIAL'))
      ORDER BY created_at DESC
      LIMIT 5
    `, [req.user.plan]);
    return res.json({ announcements: rows });
  } catch (e) { return err500(res, e); }
});

// ── ALIASES: map legacy/frontend endpoint names to current routes ─────────────

// GET /api/user/me → alias for /api/user/profile
router.get('/me', async (req, res) => {
  try {
    const uid = req.user.id;
    const [userRes, devicesRes] = await Promise.all([
      pool.query(`
        SELECT u.id, u.name, u.email, u.mobile, u.plan, u.created_at,
               u.referral_code, u.experience, u.trading_style,
               u.plan_expires_at, u.broker_client_id, u.is_active,
               CASE WHEN u.mpin_hash IS NOT NULL THEN true ELSE false END AS is_mpin_set,
               ua.total_logins, ua.last_login_at, ua.last_login_ip, ua.session_count,
               CASE WHEN ac.user_id IS NOT NULL THEN true ELSE false END AS has_angel_creds,
               ac.client_code AS angel_one_client_id,
               COALESCE((SELECT COUNT(*) FROM download_log dl WHERE dl.user_id = u.id), 0) AS total_downloads,
               (SELECT dl.created_at FROM download_log dl WHERE dl.user_id = u.id ORDER BY dl.created_at DESC LIMIT 1) AS last_download_at
        FROM users u
        LEFT JOIN user_activity ua ON ua.user_id = u.id
        LEFT JOIN angel_credentials ac ON ac.user_id = u.id
        WHERE u.id = $1
      `, [uid]),
      pool.query(`
        SELECT id, device_name, platform, ip_address, is_trusted,
               last_seen_at, verified_at, created_at
        FROM trusted_devices WHERE user_id = $1
        ORDER BY last_seen_at DESC NULLS LAST LIMIT 10
      `, [uid]),
    ]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' });
    const u = userRes.rows[0];
    // Return in format frontend expects
    return res.json({
      user: {
        id:                  u.id,
        name:                u.name,
        full_name:           u.name,
        email:               u.email,
        mobile:              u.mobile,
        plan:                u.plan,
        plan_expires_at:     u.plan_expires_at,
        subscription_end:    u.plan_expires_at,  // alias for frontend compatibility
        referral_code:       u.referral_code,
        broker_client_id:    u.broker_client_id,
        angel_one_client_id: u.angel_one_client_id,
        has_angel_creds:     u.has_angel_creds,
        experience:          u.experience,
        trading_style:       u.trading_style,
        is_active:           u.is_active !== false,
        is_mpin_set:         u.is_mpin_set,
        total_logins:        u.total_logins || 0,
        session_count:       u.session_count || 0,
        last_login_at:       u.last_login_at,
        last_login_ip:       u.last_login_ip,
        created_at:          u.created_at,
        total_downloads:     parseInt(u.total_downloads) || 0,
        last_download_at:    u.last_download_at,
        devices:             devicesRes.rows,
      }
    });
  } catch (e) {
    console.error('[user/me]', e.message);
    return res.status(500).json({ error: 'Failed to load profile' });
  }
});

// POST /api/user/update → alias for PATCH /api/user/profile
router.post('/update', async (req, res) => {
  const uid = req.user.id;
  const allowed = ['name', 'experience', 'trading_style', 'broker_client_id'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }
  try {
    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`);
    const values = [...Object.values(updates), uid];
    await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
      values
    );
    return res.json({ success: true, message: 'Profile updated' });
  } catch (e) {
    console.error('[user/update]', e.message);
    return res.status(500).json({ error: 'Update failed' });
  }
});

// GET /api/user/angel-credentials
router.get('/angel-credentials', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT client_code, updated_at FROM angel_credentials WHERE user_id = $1`,
      [req.user.id]
    );
    return res.json({ 
      credentials: rows[0] || null,
      client_code: rows[0]?.client_code || null,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load credentials' });
  }
});

// POST /api/user/angel-credentials — save/update Angel One client code
router.post('/angel-credentials', async (req, res) => {
  const client_code = (req.body.client_code || req.body.broker_client_id || '').trim().toUpperCase();
  if (!client_code || !/^[A-Z0-9]{4,12}$/.test(client_code)) {
    return res.status(400).json({ error: 'Invalid client code format' });
  }
  try {
    // Update in users table
    await pool.query(
      `UPDATE users SET broker_client_id = $1 WHERE id = $2`,
      [client_code, req.user.id]
    );
    // Upsert in angel_credentials (only client_code — API key stays local on desktop)
    await pool.query(`
      INSERT INTO angel_credentials (user_id, client_code, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id) DO UPDATE SET client_code = $2, updated_at = NOW()
    `, [req.user.id, client_code]);
    return res.json({ success: true, client_code });
  } catch (e) {
    console.error('[angel-credentials]', e.message);
    return res.status(500).json({ error: 'Failed to save credentials' });
  }
});

module.exports = router;

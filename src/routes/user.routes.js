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
const { Pool } = require('pg');
require('dotenv').config();

const { verifyToken } = require('../middleware/auth');
const V = require('../lib/validate');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
        SELECT u.id, u.name, u.mobile, u.plan, u.created_at,
               ua.total_logins, ua.last_login_at, ua.last_login_ip, ua.failed_logins
        FROM users u
        LEFT JOIN user_activity ua ON ua.user_id = u.id
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
      id:           u.id,
      name:         u.name,
      mobile:       u.mobile,
      plan:         u.plan,
      createdAt:    u.created_at,
      totalLogins:  u.total_logins  || 0,
      lastLoginAt:  u.last_login_at || null,
      lastLoginIp:  u.last_login_ip || null,
      failedLogins: u.failed_logins || 0,
      devices:      devicesRes.rows,
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

module.exports = router;

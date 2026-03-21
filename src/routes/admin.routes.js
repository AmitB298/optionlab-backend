/**
 * routes/admin.routes.js  [HARDENED v2.1]
 *
 * FIXED:
 *  - Removed standalone `new Pool()` — now uses shared pool from ../db/pool
 *    (was opening surplus connections on every require)
 *  - All other hardening from v2 kept intact
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
require('dotenv').config();

const { requireAdmin, auditLog, adminSecurityHeaders } = require('../middleware/admin.middleware');
const V    = require('../lib/validate');
const pool = require('../db/pool');   // FIXED: shared pool, not new Pool()

// ─── Security headers + auth on every route ──────────────────────────────────
router.use(adminSecurityHeaders);
router.use(requireAdmin);

// ─── Shared error handler ────────────────────────────────────────────────────
function dbError(res, err) {
  console.error('[AdminRoutes] DB error:', err.message);
  return res.status(500).json({ error: 'Database operation failed' });
}

// ─── Helper: validate userId param ───────────────────────────────────────────
function parseUserId(req, res) {
  const r = V.userId(req.params.userId);
  if (!r.ok) { res.status(400).json({ error: 'Invalid user ID' }); return null; }
  return r.value;
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ════════════════════════════════════════════════════════════════════════════

router.get('/stats', async (req, res) => {
  try {
    const [users, devices, activity, revenue] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)                                                       AS total,
          COUNT(*) FILTER (WHERE is_active = true)                      AS active,
          COUNT(*) FILTER (WHERE plan = 'PAID')                         AS paid,
          COUNT(*) FILTER (WHERE plan = 'FREE')                         AS free,
          COUNT(*) FILTER (WHERE flagged = true)                        AS flagged,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')  AS new_7d,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS new_30d
        FROM users WHERE role = 'user'
      `),
      pool.query(`
        SELECT
          COUNT(*)                                           AS total_devices,
          COUNT(*) FILTER (WHERE is_trusted = true)         AS trusted,
          COUNT(DISTINCT user_id)                           AS users_with_devices
        FROM trusted_devices
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '1 day')  AS dau,
          COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days') AS wau,
          COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '30 days')AS mau
        FROM user_activity
      `),
      pool.query(`
        SELECT
          COUNT(*)                                                          AS total_upgrades,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS upgrades_30d
        FROM subscription_history WHERE plan_to = 'PAID'
      `),
    ]);
    res.json({
      users:    users.rows[0],
      devices:  devices.rows[0],
      activity: activity.rows[0],
      revenue:  revenue.rows[0],
    });
  } catch (err) { return dbError(res, err); }
});

// ════════════════════════════════════════════════════════════════════════════
// USERS LIST
// ════════════════════════════════════════════════════════════════════════════

router.get('/users', async (req, res) => {
  try {
    const pg       = V.page(req.query.page);
    const lim      = V.limit(req.query.limit, 100);
    const offset   = (pg.value - 1) * lim.value;
    const search   = V.text(req.query.search, { maxLen: 100 });
    const planVal  = V.plan(req.query.plan);
    const flagged  = req.query.flagged === 'true';

    const statusRaw = req.query.status;
    const status = ['active', 'inactive'].includes(statusRaw) ? statusRaw : '';

    const SORT_COLS = { created_at: 'u', last_login_at: 'ua', name: 'u', mobile: 'u' };
    const sortKey   = V.sortColumn(req.query.sort, Object.keys(SORT_COLS), 'created_at');
    const sortDir   = V.sortDir(req.query.dir);
    const sortTable = SORT_COLS[sortKey.value];
    const orderExpr = `${sortTable}.${sortKey.value} ${sortDir.value} NULLS LAST`;

    let where  = [`u.role = 'user'`];
    const params = [];

    if (search.value) {
      params.push(`%${search.value}%`);
      where.push(`(u.name ILIKE $${params.length} OR u.mobile ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    if (planVal.ok) {
      params.push(planVal.value);
      where.push(`u.plan = $${params.length}`);
    }
    if (status === 'active')   where.push(`u.is_active = true`);
    if (status === 'inactive') where.push(`u.is_active = false`);
    if (flagged)               where.push(`u.flagged = true`);

    const whereClause = 'WHERE ' + where.join(' AND ');
    params.push(lim.value, offset);

    const { rows: users } = await pool.query(`
      SELECT
        u.id, u.name, u.email, u.mobile, u.plan, u.is_active, u.flagged,
        u.flag_reason, u.notes, u.created_at,
        ua.last_login_at, ua.total_logins, ua.last_login_ip, ua.last_device,
        ua.failed_logins,
        (SELECT COUNT(*) FROM trusted_devices td
         WHERE td.user_id = u.id AND td.is_trusted = true)       AS trusted_devices,
        CASE WHEN ac.user_id IS NOT NULL THEN true ELSE false END AS has_angel_credentials
      FROM users u
      LEFT JOIN user_activity ua ON ua.user_id = u.id
      LEFT JOIN angel_credentials ac ON ac.user_id = u.id
      ${whereClause}
      ORDER BY ${orderExpr}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countParams = params.slice(0, -2);
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM users u
       LEFT JOIN user_activity ua ON ua.user_id = u.id ${whereClause}`,
      countParams
    );

    res.json({
      users,
      pagination: {
        page:  pg.value,
        limit: lim.value,
        total: parseInt(countRows[0].count, 10),
        pages: Math.ceil(countRows[0].count / lim.value),
      },
    });
  } catch (err) { return dbError(res, err); }
});

// ════════════════════════════════════════════════════════════════════════════
// USER DETAIL
// ════════════════════════════════════════════════════════════════════════════

router.get('/users/:userId', async (req, res) => {
  const uid = parseUserId(req, res);
  if (!uid) return;

  try {
    const [userRes, devicesRes, subHistRes, auditRes] = await Promise.all([
      pool.query(`
        SELECT u.id, u.name, u.email, u.mobile, u.plan, u.is_active, u.flagged,
               u.flag_reason, u.notes, u.role, u.created_at,
               u.experience, u.trading_style, u.referral_code,
               ua.total_logins, ua.last_login_at, ua.last_login_ip,
               ua.last_device, ua.failed_logins, ua.session_count,
               CASE WHEN ac.user_id IS NOT NULL THEN true ELSE false END AS has_angel_creds,
               ac.client_code AS angel_client_code
        FROM users u
        LEFT JOIN user_activity ua ON ua.user_id = u.id
        LEFT JOIN angel_credentials ac ON ac.user_id = u.id
        WHERE u.id = $1
      `, [uid]),

      pool.query(`
        SELECT id, device_name, platform, ip_address, is_trusted,
               trust_expires_at, verified_at, last_seen_at, created_at
        FROM trusted_devices WHERE user_id = $1 ORDER BY last_seen_at DESC NULLS LAST
      `, [uid]),

      pool.query(`
        SELECT sh.id, sh.plan_from, sh.plan_to, sh.reason,
               sh.amount, sh.payment_ref, sh.created_at,
               u.name AS changed_by_name
        FROM subscription_history sh
        LEFT JOIN admins u ON u.id = sh.changed_by
        WHERE sh.user_id = $1 ORDER BY sh.created_at DESC LIMIT 20
      `, [uid]),

      pool.query(`
        SELECT action, success, ip_address, created_at
        FROM admin_audit_log
        WHERE target_user_id = $1 ORDER BY created_at DESC LIMIT 30
      `, [uid]),
    ]);

    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' });

    const user = { ...userRes.rows[0] };
    delete user.mpin_hash;
    delete user.password;

    res.json({
      user,
      devices:    devicesRes.rows,
      subHistory: subHistRes.rows,
      auditTrail: auditRes.rows,
    });
  } catch (err) { return dbError(res, err); }
});

// ════════════════════════════════════════════════════════════════════════════
// USER ACTIONS
// ════════════════════════════════════════════════════════════════════════════

router.patch('/users/:userId/status', auditLog('TOGGLE_USER_STATUS'), async (req, res) => {
  const uid = parseUserId(req, res);
  if (!uid) return;

  const activeResult = V.bool(req.body?.is_active);
  if (!activeResult.ok) return res.status(400).json({ error: 'is_active must be true or false' });
  const isActive = activeResult.value;

  try {
    if (!isActive && uid === req.admin.adminId) {
      return res.status(400).json({ error: 'You cannot deactivate your own admin account' });
    }

    await pool.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [isActive, uid]);

    if (!isActive) {
      await pool.query(`DELETE FROM remember_tokens WHERE user_id = $1`, [uid]);
    }

    return res.json({ success: true, message: `User ${isActive ? 'activated' : 'deactivated'}` });
  } catch (err) { return dbError(res, err); }
});

router.patch('/users/:userId/plan', auditLog('CHANGE_USER_PLAN'), async (req, res) => {
  const uid = parseUserId(req, res);
  if (!uid) return;

  const planResult   = V.plan(req.body?.plan);
  const reasonResult = V.text(req.body?.reason, { maxLen: 500 });
  const amtResult    = V.amount(req.body?.amount);
  const refResult    = V.paymentRef(req.body?.payment_ref);

  if (!planResult.ok)   return res.status(400).json({ error: planResult.error });
  if (!reasonResult.ok) return res.status(400).json({ error: reasonResult.error });
  if (!amtResult.ok)    return res.status(400).json({ error: amtResult.error });
  if (!refResult.ok)    return res.status(400).json({ error: refResult.error });

  try {
    const { rows } = await pool.query(`SELECT plan FROM users WHERE id = $1`, [uid]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const oldPlan = rows[0].plan;
    await pool.query(`UPDATE users SET plan = $1 WHERE id = $2`, [planResult.value, uid]);
    await pool.query(
      `INSERT INTO subscription_history
         (user_id, plan_from, plan_to, changed_by, reason, amount, payment_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [uid, oldPlan, planResult.value, req.admin.adminId,
       reasonResult.value, amtResult.value, refResult.value]
    );

    return res.json({ success: true, message: `Plan changed: ${oldPlan} → ${planResult.value}` });
  } catch (err) { return dbError(res, err); }
});

router.post('/users/:userId/reset-mpin', auditLog('RESET_USER_MPIN'), async (req, res) => {
  const uid = parseUserId(req, res);
  if (!uid) return;

  const mpinResult = V.mpin(req.body?.new_mpin);
  if (!mpinResult.ok) {
    return res.status(400).json({ error: 'new_mpin must be a 4-digit string' });
  }

  try {
    const hash = await bcrypt.hash(mpinResult.value, 12);
    await pool.query(`UPDATE users SET mpin_hash = $1 WHERE id = $2`, [hash, uid]);
    await pool.query(`DELETE FROM remember_tokens WHERE user_id = $1`, [uid]);
    await pool.query(`UPDATE trusted_devices SET is_trusted = false WHERE user_id = $1`, [uid]);

    return res.json({ success: true, message: 'MPIN reset. User must re-login on all devices.' });
  } catch (err) { return dbError(res, err); }
});

router.post('/users/:userId/force-logout', auditLog('FORCE_LOGOUT'), async (req, res) => {
  const uid = parseUserId(req, res);
  if (!uid) return;

  try {
    await pool.query(`DELETE FROM remember_tokens WHERE user_id = $1`, [uid]);
    await pool.query(`UPDATE trusted_devices SET is_trusted = false WHERE user_id = $1`, [uid]);
    return res.json({ success: true, message: 'User logged out from all devices.' });
  } catch (err) { return dbError(res, err); }
});

router.delete('/users/:userId/devices/:deviceId', auditLog('REVOKE_DEVICE'), async (req, res) => {
  const uid = parseUserId(req, res);
  if (!uid) return;

  const devResult = V.userId(req.params.deviceId);
  if (!devResult.ok) return res.status(400).json({ error: 'Invalid device ID' });

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM trusted_devices WHERE id = $1 AND user_id = $2`,
      [devResult.value, uid]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Device not found' });
    return res.json({ success: true, message: 'Device revoked.' });
  } catch (err) { return dbError(res, err); }
});

router.patch('/users/:userId/flag', auditLog('FLAG_USER'), async (req, res) => {
  const uid = parseUserId(req, res);
  if (!uid) return;

  const flaggedResult = V.bool(req.body?.flagged);
  if (!flaggedResult.ok) return res.status(400).json({ error: 'flagged must be true or false' });

  const reasonResult = V.text(req.body?.flag_reason, { maxLen: 300 });
  if (!reasonResult.ok) return res.status(400).json({ error: reasonResult.error });

  try {
    await pool.query(
      `UPDATE users SET flagged = $1, flag_reason = $2 WHERE id = $3`,
      [flaggedResult.value, reasonResult.value, uid]
    );
    return res.json({ success: true });
  } catch (err) { return dbError(res, err); }
});

router.patch('/users/:userId/notes', auditLog('UPDATE_NOTES'), async (req, res) => {
  const uid = parseUserId(req, res);
  if (!uid) return;

  const notesResult = V.text(req.body?.notes, { maxLen: 2000 });
  if (!notesResult.ok) return res.status(400).json({ error: notesResult.error });

  try {
    await pool.query(`UPDATE users SET notes = $1 WHERE id = $2`, [notesResult.value, uid]);
    return res.json({ success: true });
  } catch (err) { return dbError(res, err); }
});

// ════════════════════════════════════════════════════════════════════════════
// BULK ACTIONS
// ════════════════════════════════════════════════════════════════════════════

router.post('/users/bulk-action', auditLog('BULK_ACTION'), async (req, res) => {
  const idsResult    = V.userIdArray(req.body?.userIds, 100);
  const actionResult = V.bulkAction(req.body?.action);

  if (!idsResult.ok)    return res.status(400).json({ error: idsResult.error });
  if (!actionResult.ok) return res.status(400).json({ error: actionResult.error });

  const ids    = idsResult.value;
  const action = actionResult.value;

  try {
    let message = '';

    if (action === 'activate') {
      await pool.query(`UPDATE users SET is_active = true  WHERE id = ANY($1::int[])`, [ids]);
      message = `${ids.length} user(s) activated`;

    } else if (action === 'deactivate') {
      const safeIds = ids.filter(id => id !== req.admin.adminId);
      if (!safeIds.length) return res.status(400).json({ error: 'Cannot deactivate yourself' });
      await pool.query(`UPDATE users SET is_active = false WHERE id = ANY($1::int[])`, [safeIds]);
      await pool.query(`DELETE FROM remember_tokens WHERE user_id = ANY($1::int[])`, [safeIds]);
      message = `${safeIds.length} user(s) deactivated`;

    } else if (action === 'set_plan') {
      const planResult = V.plan(req.body?.payload?.plan);
      if (!planResult.ok) return res.status(400).json({ error: planResult.error });
      await pool.query(`UPDATE users SET plan = $1 WHERE id = ANY($2::int[])`,
        [planResult.value, ids]);
      message = `${ids.length} user(s) set to ${planResult.value}`;

    } else if (action === 'force_logout') {
      await pool.query(`DELETE FROM remember_tokens WHERE user_id = ANY($1::int[])`, [ids]);
      await pool.query(`UPDATE trusted_devices SET is_trusted = false WHERE user_id = ANY($1::int[])`, [ids]);
      message = `${ids.length} user(s) force-logged out`;
    }

    return res.json({ success: true, message });
  } catch (err) { return dbError(res, err); }
});

// ════════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ════════════════════════════════════════════════════════════════════════════

router.get('/audit', async (req, res) => {
  try {
    const pg     = V.page(req.query.page);
    const lim    = V.limit(req.query.limit, 50);
    const offset = (pg.value - 1) * lim.value;

    const { rows } = await pool.query(`
      SELECT al.id, al.action, al.success, al.ip_address, al.created_at,
             u.name   AS admin_name,
             t.name   AS target_name,
             t.mobile AS target_mobile,
             t.email  AS target_email
      FROM admin_audit_log al
      LEFT JOIN admins u ON u.id = al.admin_id
      LEFT JOIN users t ON t.id = al.target_user_id
      ORDER BY al.created_at DESC
      LIMIT $1 OFFSET $2
    `, [lim.value, offset]);

    return res.json({ logs: rows });
  } catch (err) { return dbError(res, err); }
});

// ════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ════════════════════════════════════════════════════════════════════════════

router.get('/announcements', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, body, type, target, is_active, created_at, expires_at
       FROM admin_announcements ORDER BY created_at DESC`
    );
    return res.json({ announcements: rows });
  } catch (err) { return dbError(res, err); }
});

router.post('/announcements', auditLog('CREATE_ANNOUNCEMENT'), async (req, res) => {
  const titleResult   = V.text(req.body?.title,  { maxLen: 255, required: true });
  const bodyResult    = V.text(req.body?.body,   { maxLen: 5000, required: true });
  const typeResult    = V.announcementType(req.body?.type);
  const targetResult  = V.announcementTarget(req.body?.target);
  const expiresResult = V.isoDatetime(req.body?.expires_at);

  if (!titleResult.ok)   return res.status(400).json({ error: titleResult.error });
  if (!bodyResult.ok)    return res.status(400).json({ error: bodyResult.error });
  if (!expiresResult.ok) return res.status(400).json({ error: expiresResult.error });

  try {
    const { rows } = await pool.query(
      `INSERT INTO admin_announcements (title, body, type, target, created_by, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, title, type, target, is_active, created_at`,
      [titleResult.value, bodyResult.value, typeResult.value,
       targetResult.value, req.admin.adminId, expiresResult.value]
    );
    return res.json({ success: true, announcement: rows[0] });
  } catch (err) { return dbError(res, err); }
});

router.patch('/announcements/:id', auditLog('TOGGLE_ANNOUNCEMENT'), async (req, res) => {
  const idResult = V.userId(req.params.id);
  if (!idResult.ok) return res.status(400).json({ error: 'Invalid announcement ID' });

  const activeResult = V.bool(req.body?.is_active);
  if (!activeResult.ok) return res.status(400).json({ error: 'is_active must be boolean' });

  try {
    const { rowCount } = await pool.query(
      `UPDATE admin_announcements SET is_active = $1 WHERE id = $2`,
      [activeResult.value, idResult.value]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Announcement not found' });
    return res.json({ success: true });
  } catch (err) { return dbError(res, err); }
});

module.exports = router;

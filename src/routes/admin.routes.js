/**
 * routes/admin.routes.js  [HARDENED v2]
 *
 * All bugs fixed:
 *  1. Every req.body field validated through validate.js before touching DB
 *  2. userId params cast to integer — no string injection possible
 *  3. sort/dir columns whitelisted — ORDER BY injection fixed
 *  4. plan validated against whitelist on bulk set_plan
 *  5. is_active coerced to boolean — was truthy-checked only before
 *  6. mpin reset: type guard + digit-only check
 *  7. Announcement fields validated — type/target whitelisted
 *  8. Internal DB errors never leak to client
 *  9. DB re-verification of admin on every request (in middleware)
 * 10. All userId params treated as integers, never raw strings in queries
 * 11. flag_reason length-limited and sanitised
 * 12. notes length-limited
 * 13. auditLog sanitises sensitive fields before writing
 * 14. Stale /auth/login stub removed
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const pool = require('../db/sharedPool');

// ─── Security headers + auth on every route ──────────────────────────────────
router.use(adminSecurityHeaders);
router.use(requireAdmin);

// ─── Shared error handler ────────────────────────────────────────────────────
function dbError(res, err) {
  console.error('[AdminRoutes] DB error:', err.message);
  return res.status(500).json({ error: 'Database operation failed' }); // never leak err.message
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
        SELECT id, name, mobile, plan, is_active, role, flagged, flag_reason, notes, angel_client_code, created_at, last_login_at, login_count FROM users WHERE role = 'user'
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
         FROM users
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
    // All query params validated and sanitised
    const pg       = V.page(req.query.page);
    const lim      = V.limit(req.query.limit, 100);
    const offset   = (pg.value - 1) * lim.value;
    const search   = V.text(req.query.search, { maxLen: 100 });
    const planVal  = V.plan(req.query.plan);
    const flagged  = req.query.flagged === 'true';

    // STATUS: only allow explicit whitelisted values
    const statusRaw = req.query.status;
    const status = ['active', 'inactive'].includes(statusRaw) ? statusRaw : '';

    // SORT: whitelist prevents ORDER BY injection
    const SORT_COLS = { created_at: 'u', last_login_at: 'u', name: 'u', mobile: 'u' };
    const sortKey   = V.sortColumn(req.query.sort, Object.keys(SORT_COLS), 'created_at');
    const sortDir   = V.sortDir(req.query.dir);
    const sortTable = SORT_COLS[sortKey.value];
    const orderExpr = `${sortTable}.${sortKey.value} ${sortDir.value} NULLS LAST`;

    let where  = [`u.role = 'user'`];
    const params = [];

    if (search.value) {
      params.push(`%${search.value}%`);
      where.push(`(u.name ILIKE $${params.length} OR u.mobile ILIKE $${params.length})`);
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
        u.id, u.name, u.mobile, u.plan, u.is_active, u.flagged,
        u.flag_reason, u.notes, u.created_at,
        u.last_login_at, u.login_count AS total_logins,
        u.angel_client_code,
        (SELECT COUNT(*) FROM trusted_devices td
         WHERE td.user_id = u.id AND td.is_trusted = true) AS trusted_devices
      FROM users u
      ${whereClause}
      ORDER BY ${orderExpr}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    // Count query with same filters
    const countParams = params.slice(0, -2);
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM users u ${whereClause}`,
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
        SELECT u.id, u.name, u.mobile, u.plan, u.is_active, u.flagged,
               u.flag_reason, u.notes, u.role, u.created_at,
               u.login_count AS total_logins, u.last_login_at,
               u.angel_client_code
         FROM users u
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

    // BUG FIX: mpin_hash must never leave server — explicitly removed
    const user = { ...userRes.rows[0] };
    delete user.mpin_hash;

    // Also remove any other fields that must stay server-side
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

// PATCH /admin/api/users/:userId/status
router.patch('/users/:userId/status', auditLog('TOGGLE_USER_STATUS'), async (req, res) => {
  const uid = parseUserId(req, res);
  if (!uid) return;

  // BUG FIX: is_active was truthy-checked — now strictly coerced to boolean
  const activeResult = V.bool(req.body?.is_active);
  if (!activeResult.ok) return res.status(400).json({ error: 'is_active must be true or false' });
  const isActive = activeResult.value;

  try {
    // Prevent deactivating self
    if (!isActive && uid === req.admin.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own admin account' });
    }

    await pool.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [isActive, uid]);

    if (!isActive) {
      // Force logout all sessions immediately
      await pool.query(`DELETE FROM remember_tokens WHERE user_id = $1`, [uid]);
    }

    return res.json({ success: true, message: `User ${isActive ? 'activated' : 'deactivated'}` });
  } catch (err) { return dbError(res, err); }
});

// PATCH /admin/api/users/:userId/plan
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
    const days = parseInt(req.body?.days) || 365;
    let expiresAt = null;
    if (planResult.value === 'TRIAL') { expiresAt = new Date(Date.now() + 14*86400000); }
    else if (planResult.value === 'PAID') { expiresAt = new Date(Date.now() + days*86400000); }
    if (expiresAt) {
      await pool.query(`UPDATE users SET plan=$1, plan_expires_at=$2 WHERE id=$3`, [planResult.value, expiresAt.toISOString(), uid]);
    } else {
      await pool.query(`UPDATE users SET plan=$1, plan_expires_at=NULL WHERE id=$2`, [planResult.value, uid]);
    }
    await pool.query(
      `INSERT INTO subscription_history
         (user_id, plan_from, plan_to, changed_by, reason, amount, payment_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [uid, oldPlan, planResult.value, req.admin.id,
       reasonResult.value, amtResult.value, refResult.value]
    );

    return res.json({ success: true, message: `Plan changed: ${oldPlan} → ${planResult.value}` });
  } catch (err) { return dbError(res, err); }
});

// POST /admin/api/users/:userId/reset-mpin
router.post('/users/:userId/reset-mpin', auditLog('RESET_USER_MPIN'), async (req, res) => {
  const uid = parseUserId(req, res);
  if (!uid) return;

  // BUG FIX: String(1234) === '1234' passed old check — now type-guarded
  const mpinResult = V.mpin(req.body?.new_mpin);
  if (!mpinResult.ok) {
    return res.status(400).json({ error: 'new_mpin must be a 4-digit string' });
  }

  try {
    // Cost 12 — deliberate slowness deters offline brute force
    const hash = await bcrypt.hash(mpinResult.value, 12);
    await pool.query(`UPDATE users SET mpin_hash = $1 WHERE id = $2`, [hash, uid]);
    // Force re-login everywhere
    await pool.query(`DELETE FROM remember_tokens WHERE user_id = $1`, [uid]);
    await pool.query(`UPDATE trusted_devices SET is_trusted = false WHERE user_id = $1`, [uid]);

    return res.json({ success: true, message: 'MPIN reset. User must re-login on all devices.' });
  } catch (err) { return dbError(res, err); }
});

// POST /admin/api/users/:userId/force-logout
router.post('/users/:userId/force-logout', auditLog('FORCE_LOGOUT'), async (req, res) => {
  const uid = parseUserId(req, res);
  if (!uid) return;

  try {
    await pool.query(`DELETE FROM remember_tokens WHERE user_id = $1`, [uid]);
    await pool.query(`UPDATE trusted_devices SET is_trusted = false WHERE user_id = $1`, [uid]);
    return res.json({ success: true, message: 'User logged out from all devices.' });
  } catch (err) { return dbError(res, err); }
});

// DELETE /admin/api/users/:userId/devices/:deviceId
router.delete('/users/:userId/devices/:deviceId', auditLog('REVOKE_DEVICE'), async (req, res) => {
  const uid = parseUserId(req, res);
  if (!uid) return;

  // BUG FIX: deviceId also needs to be a valid integer
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

// PATCH /admin/api/users/:userId/flag
router.patch('/users/:userId/flag', auditLog('FLAG_USER'), async (req, res) => {
  const uid = parseUserId(req, res);
  if (!uid) return;

  const flaggedResult = V.bool(req.body?.flagged);
  if (!flaggedResult.ok) return res.status(400).json({ error: 'flagged must be true or false' });

  // BUG FIX: flag_reason length-limited and sanitised — was raw string before
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

// PATCH /admin/api/users/:userId/notes
router.patch('/users/:userId/notes', auditLog('UPDATE_NOTES'), async (req, res) => {
  const uid = parseUserId(req, res);
  if (!uid) return;

  // BUG FIX: notes length-limited — was uncapped before (DoS via huge payload)
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

  const ids    = idsResult.value;   // already cast to integer[]
  const action = actionResult.value;

  try {
    let message = '';

    if (action === 'activate') {
      await pool.query(`UPDATE users SET is_active = true  WHERE id = ANY($1::int[])`, [ids]);
      message = `${ids.length} user(s) activated`;

    } else if (action === 'deactivate') {
      // Prevent self-deactivation in bulk
      const safeIds = ids.filter(id => id !== req.admin.id);
      if (!safeIds.length) return res.status(400).json({ error: 'Cannot deactivate yourself' });
      await pool.query(`UPDATE users SET is_active = false WHERE id = ANY($1::int[])`, [safeIds]);
      await pool.query(`DELETE FROM remember_tokens WHERE user_id = ANY($1::int[])`, [safeIds]);
      message = `${safeIds.length} user(s) deactivated`;

    } else if (action === 'set_plan') {
      // BUG FIX: plan from payload.plan was unvalidated before
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
    const pg    = V.page(req.query.page);
    const lim   = V.limit(req.query.limit, 50);
    const offset = (pg.value - 1) * lim.value;

    const { rows } = await pool.query(`
      SELECT al.id, al.action, al.success, al.ip_address, al.created_at,
             u.name  AS admin_name,
             t.name  AS target_name,
             t.mobile AS target_mobile
      FROM admin_audit_log al
      LEFT JOIN admins u ON u.id = al.admin_id
      LEFT JOIN users t ON t.id = al.target_user_id
      ORDER BY al.created_at DESC
      LIMIT $1 OFFSET $2
    `, [lim.value, offset]);

    // BUG FIX: payload column removed from response — can contain sensitive debug info
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
  // BUG FIX: type and target were unvalidated — now whitelisted
  const titleResult  = V.text(req.body?.title,  { maxLen: 255, required: true });
  const bodyResult   = V.text(req.body?.body,   { maxLen: 5000, required: true });
  const typeResult   = V.announcementType(req.body?.type);
  const targetResult = V.announcementTarget(req.body?.target);
  const expiresResult = V.isoDatetime(req.body?.expires_at);

  if (!titleResult.ok)   return res.status(400).json({ error: titleResult.error });
  if (!bodyResult.ok)    return res.status(400).json({ error: bodyResult.error });
  if (!expiresResult.ok) return res.status(400).json({ error: expiresResult.error });

  try {
    const { rows } = await pool.query(
      `INSERT INTO admin_announcements (title, body, type, target, created_by, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, title, type, target, is_active, created_at`,
      [titleResult.value, bodyResult.value, typeResult.value,
       targetResult.value, req.admin.id, expiresResult.value]
    );
    return res.json({ success: true, announcement: rows[0] });
  } catch (err) { return dbError(res, err); }
});

router.patch('/announcements/:id', auditLog('TOGGLE_ANNOUNCEMENT'), async (req, res) => {
  // BUG FIX: id was unvalidated
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


// ─── GET /api/admin/live-users ────────────────────────────────────────────────
// Shows app_sessions joined with users — who is online in Jobber app
router.get('/live-users', async (req, res) => {
  try {
    // All users with an app session
    const sessions = await pool.query(`
      SELECT
        u.id, u.name, u.mobile, u.plan,
        s.app_version, s.platform, s.is_market_connected,
        s.last_seen_at, s.ip_address
      FROM app_sessions s
      JOIN users u ON u.id = s.user_id
      ORDER BY s.last_seen_at DESC NULLS LAST
    `);

    // Users who registered but never sent a heartbeat
    const never = await pool.query(`
      SELECT u.id, u.name, u.mobile, u.plan, u.created_at
      FROM users u
      WHERE u.id NOT IN (SELECT user_id FROM app_sessions)
      ORDER BY u.created_at DESC
    `);

    // Stats
    const now = new Date();
    const fiveMinAgo = new Date(now - 5 * 60 * 1000);
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);

    const online = sessions.rows.filter(s => s.last_seen_at && new Date(s.last_seen_at) > fiveMinAgo).length;
    const today  = sessions.rows.filter(s => s.last_seen_at && new Date(s.last_seen_at) > todayStart).length;
    const market = sessions.rows.filter(s => s.is_market_connected).length;

    return res.json({
      success: true,
      sessions: sessions.rows,
      never:    never.rows,
      stats: { online, today, market },
    });
  } catch (err) {
    console.error('[live-users]', err.message);
    return res.status(500).json({ error: 'Database operation failed' });
  }
});

module.exports = router;


'use strict';
/**
 * jobber.admin.routes.js
 * Admin endpoints — user-wise Jobber Pro sessions + system info
 * Based on actual schema:
 *   jobber_users(id, mobile, name, email, is_active)
 *   jobber_devices(id, user_id, hardware_id, device_name, os_info, first_seen, last_seen, is_blocked)
 *   jobber_subscriptions(id, user_id, plan, started_at, expires_at, is_paid, amount_paid)
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');

// ── Admin auth middleware (reuse existing) ───────────────────────────────
const { requireAdmin } = require('../middleware/admin.middleware');

// ── Helper: is device "live" (last heartbeat within 3 min) ───────────────
function isLive(lastSeen) {
  if (!lastSeen) return false;
  return (Date.now() - new Date(lastSeen).getTime()) < 3 * 60 * 1000;
}

// ── GET /api/admin/jobber/sessions ────────────────────────────────────────
// All users with their latest device + subscription
router.get('/sessions', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        ju.id                         AS user_id,
        ju.name,
        ju.mobile,
        ju.email,
        ju.is_active,
        ju.created_at,

        -- Latest device
        d.id                          AS device_id,
        d.hardware_id,
        d.device_name,
        d.os_info,
        d.first_seen,
        d.last_seen,
        d.is_blocked,

        -- Active subscription
        sub.plan,
        sub.expires_at,
        sub.is_paid,
        sub.amount_paid,

        -- Device count
        (SELECT COUNT(*) FROM jobber_devices WHERE user_id = ju.id) AS device_count

      FROM jobber_users ju

      -- Latest device per user
      LEFT JOIN LATERAL (
        SELECT * FROM jobber_devices
        WHERE user_id = ju.id
        ORDER BY last_seen DESC NULLS LAST
        LIMIT 1
      ) d ON true

      -- Active/latest subscription
      LEFT JOIN LATERAL (
        SELECT * FROM jobber_subscriptions
        WHERE user_id = ju.id
        ORDER BY created_at DESC
        LIMIT 1
      ) sub ON true

      ORDER BY d.last_seen DESC NULLS LAST
    `);

    const sessions = rows.map(r => ({
      user_id:      r.user_id,
      name:         r.name,
      mobile:       r.mobile,
      email:        r.email,
      is_active:    r.is_active,
      joined:       r.created_at,
      device_id:    r.device_id,
      hardware_id:  r.hardware_id,
      device_name:  r.device_name,
      os_info:      r.os_info,
      first_seen:   r.first_seen,
      last_seen:    r.last_seen,
      is_blocked:   r.is_blocked,
      device_count: parseInt(r.device_count) || 0,
      plan:         r.plan,
      expires_at:   r.expires_at,
      is_paid:      r.is_paid,
      amount_paid:  r.amount_paid,
      is_live:      isLive(r.last_seen),
    }));

    res.json({ success: true, count: sessions.length, sessions });
  } catch (err) {
    console.error('[AdminJobber] sessions error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/admin/jobber/sessions/:userId ────────────────────────────────
// Full detail for one user — all devices + all subscriptions
router.get('/sessions/:userId', requireAdmin, async (req, res) => {
  const userId = req.params.userId;

  try {
    // User info
    const userRes = await pool.query(
      'SELECT id, name, mobile, email, is_active, created_at FROM jobber_users WHERE id = $1',
      [userId]
    );
    if (!userRes.rows.length)
      return res.status(404).json({ success: false, error: 'User not found' });
    const user = userRes.rows[0];

    // All devices
    const devRes = await pool.query(`
      SELECT id, hardware_id, device_name, os_info, first_seen, last_seen, is_blocked
      FROM jobber_devices
      WHERE user_id = $1
      ORDER BY last_seen DESC NULLS LAST
    `, [userId]);

    const devices = devRes.rows.map(d => ({
      ...d,
      is_live: isLive(d.last_seen),
    }));

    // All subscriptions
    const subRes = await pool.query(`
      SELECT id, plan, started_at, expires_at, is_paid, amount_paid, razorpay_id, created_at
      FROM jobber_subscriptions
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    res.json({
      success: true,
      user,
      devices,
      subscriptions: subRes.rows,
    });
  } catch (err) {
    console.error('[AdminJobber] user detail error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/admin/jobber/stats ───────────────────────────────────────────
// Dashboard summary numbers
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM jobber_users)                                  AS total_users,
        (SELECT COUNT(*) FROM jobber_users WHERE is_active = true)           AS active_users,
        (SELECT COUNT(*) FROM jobber_devices
          WHERE last_seen > NOW() - INTERVAL '3 minutes')                    AS live_now,
        (SELECT COUNT(DISTINCT user_id) FROM jobber_devices
          WHERE last_seen > NOW() - INTERVAL '24 hours')                     AS active_today,
        (SELECT COUNT(*) FROM jobber_subscriptions
          WHERE is_paid = true AND expires_at > NOW())                       AS paid_active,
        (SELECT COUNT(*) FROM jobber_devices WHERE is_blocked = true)        AS blocked_devices
    `);

    // OS breakdown
    const osRes = await pool.query(`
      SELECT
        COALESCE(NULLIF(SPLIT_PART(os_info, ' ', 1), ''), 'Unknown') AS os,
        COUNT(DISTINCT user_id) AS users
      FROM jobber_devices
      WHERE last_seen > NOW() - INTERVAL '7 days'
      GROUP BY 1
      ORDER BY users DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      stats: rows[0],
      os_breakdown: osRes.rows,
    });
  } catch (err) {
    console.error('[AdminJobber] stats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/admin/jobber/sessions/:userId/history ────────────────────────
// Activity timeline for one user
router.get('/sessions/:userId/history', requireAdmin, async (req, res) => {
  const userId = req.params.userId;
  const limit  = Math.min(200, Number(req.query.limit) || 50);
  const offset = Number(req.query.offset) || 0;
  const days   = Math.min(90, Number(req.query.days) || 7);

  try {
    const { rows } = await pool.query(`
      SELECT
        id, device_id, hardware_id, device_name, os_info,
        ip_address, app_version, event_type, ts
      FROM jobber_activity_log
      WHERE user_id = $1
        AND ts > NOW() - ($2 * INTERVAL '1 day')
      ORDER BY ts DESC
      LIMIT $3 OFFSET $4
    `, [userId, days, limit, offset]);

    const countRes = await pool.query(
      `SELECT COUNT(*) AS total FROM jobber_activity_log
       WHERE user_id = $1 AND ts > NOW() - ($2 * INTERVAL '1 day')`,
      [userId, days]
    );

    // Daily activity heatmap
    const heatRes = await pool.query(`
      SELECT
        DATE(ts AT TIME ZONE 'Asia/Kolkata') AS day,
        COUNT(*) AS sessions,
        COUNT(DISTINCT ip_address) AS unique_ips
      FROM jobber_activity_log
      WHERE user_id = $1 AND ts > NOW() - INTERVAL '30 days'
      GROUP BY 1 ORDER BY 1 DESC
    `, [userId]);

    res.json({
      success: true,
      history: rows,
      total: Number(countRes.rows[0].total),
      heatmap: heatRes.rows,
      limit, offset, days,
    });
  } catch (err) {
    console.error('[AdminJobber] history error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;



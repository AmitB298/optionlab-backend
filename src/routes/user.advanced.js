'use strict';
/**
 * user.advanced.js — Enhanced User Routes
 *
 * GET /api/user/dashboard      — All dashboard data in one call
 * GET /api/user/referral-stats — Referral code stats for this user
 * GET /api/user/app-session    — Latest Jobber Pro heartbeat for this user
 * GET /api/user/subscription   — Plan details + history
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { auth: verifyToken } = require('../middleware/auth');

router.use(verifyToken);

function err500(res, e) {
  console.error('[user.advanced]', e.message);
  return res.status(500).json({ error: 'Request failed' });
}

// ── GET /api/user/dashboard ───────────────────────────────────────────────────
// Single endpoint — returns everything the dashboard needs
router.get('/dashboard', async (req, res) => {
  const uid = req.user.id;
  try {
    const [
      userRes,
      devicesRes,
      announcementsRes,
      subHistoryRes,
      appSessionRes,
      referralStatsRes,
    ] = await Promise.all([
      // Full user profile
      pool.query(`
        SELECT u.id, u.name, u.mobile, u.email, u.plan, u.created_at,
               u.referral_code, u.experience, u.trading_style,
               u.plan_expires_at, u.is_active,
               CASE WHEN u.mpin_hash IS NOT NULL THEN true ELSE false END AS is_mpin_set,
               COALESCE(ua.total_logins, 0) AS total_logins,
               ua.last_login_at, ua.last_login_ip,
               ua.last_device,
               COALESCE(ua.session_count, 0) AS session_count,
               CASE WHEN ac.user_id IS NOT NULL THEN true ELSE false END AS has_angel_creds
        FROM users u
        LEFT JOIN user_activity ua ON ua.user_id = u.id
        LEFT JOIN angel_credentials ac ON ac.user_id = u.id
        WHERE u.id = $1
      `, [uid]),

      // Trusted devices
      pool.query(`
        SELECT id, device_name, platform, ip_address, is_trusted,
               last_seen_at, verified_at, created_at
        FROM trusted_devices
        WHERE user_id = $1
        ORDER BY last_seen_at DESC NULLS LAST
        LIMIT 10
      `, [uid]),

      // Active announcements for user's plan
      pool.query(`
        SELECT id, title, body, type, created_at
        FROM admin_announcements
        WHERE is_active = true
          AND (target = 'all'
            OR (target = 'paid' AND $2 = 'PAID')
            OR (target = 'free' AND $2 != 'PAID'))
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY created_at DESC
        LIMIT 5
      `, [uid, req.user.plan || 'FREE']),

      // Subscription history
      pool.query(`
        SELECT plan_from, plan_to, reason, amount, payment_ref, created_at
        FROM subscription_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [uid]),

      // Latest Jobber Pro session
      pool.query(`
        SELECT app_version, platform, is_market_connected,
               last_seen_at, ip_address,
               CASE WHEN last_seen_at > NOW() - INTERVAL '10 minutes'
                    THEN true ELSE false END AS is_online
        FROM app_sessions
        WHERE user_id = $1
      `, [uid]).catch(() => ({ rows: [] })),

      // Referral stats — how many users signed up with MY referral code
      // A user's referral_code in the users table is the code they USED
      // We need to find what code belongs to THIS user
      // The user's own referral code = their mobile number based code or stored separately
      // For now: count users who signed up with a code matching this user
      pool.query(`
        SELECT
          COUNT(*) AS referred_users,
          COUNT(*) FILTER (WHERE plan = 'PAID') AS referred_paid,
          COALESCE(SUM(sh.amount), 0) AS total_revenue_generated
        FROM users ref_user
        LEFT JOIN subscription_history sh ON sh.user_id = ref_user.id AND sh.plan_to = 'PAID'
        WHERE ref_user.referral_code = (
          SELECT rc.code FROM referral_codes rc
          WHERE rc.owner_mobile = (SELECT mobile FROM users WHERE id = $1)
          LIMIT 1
        )
        AND ref_user.role = 'user'
      `, [uid]).catch(() => ({ rows: [{ referred_users: 0, referred_paid: 0, total_revenue_generated: 0 }] })),
    ]);

    if (!userRes.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const u = userRes.rows[0];

    // Calculate days since signup
    const daysSince = Math.floor((Date.now() - new Date(u.created_at)) / 86400000);

    // Plan expiry info
    const planExpiry = u.plan_expires_at ? new Date(u.plan_expires_at) : null;
    const daysUntilExpiry = planExpiry
      ? Math.max(0, Math.floor((planExpiry - Date.now()) / 86400000))
      : null;

    return res.json({
      user: {
        id:              u.id,
        name:            u.name,
        full_name:       u.name,
        mobile:          u.mobile,
        email:           u.email,
        plan:            u.plan,
        createdAt:       u.created_at,
        created_at:      u.created_at,
        daysSince,
        planExpiresAt:   u.plan_expires_at,
        daysUntilExpiry,
        referralCode:    u.referral_code,
        referral_code:   u.referral_code,
        experience:      u.experience,
        tradingStyle:    u.trading_style,
        trading_style:   u.trading_style,
        hasAngelCreds:   u.has_angel_creds,
        is_active:       u.is_active !== false,
        is_mpin_set:     u.is_mpin_set,
        totalLogins:     u.total_logins || 0,
        total_logins:    u.total_logins || 0,
        lastLoginAt:     u.last_login_at,
        last_login_at:   u.last_login_at,
        lastLoginIp:     u.last_login_ip,
        lastDevice:      u.last_device,
        sessionCount:    u.session_count || 0,
      },
      devices:         devicesRes.rows,
      announcements:   announcementsRes.rows,
      subHistory:      subHistoryRes.rows,
      appSession:      appSessionRes.rows[0] || null,
      referralStats:   referralStatsRes.rows[0] || { referred_users: 0, referred_paid: 0, total_revenue_generated: 0 },
    });
  } catch (e) { return err500(res, e); }
});

// ── GET /api/user/subscription ────────────────────────────────────────────────
router.get('/subscription', async (req, res) => {
  const uid = req.user.id;
  try {
    const [planRes, histRes] = await Promise.all([
      pool.query(`
        SELECT plan, plan_expires_at, created_at FROM users WHERE id = $1
      `, [uid]),
      pool.query(`
        SELECT plan_from, plan_to, reason, amount, payment_ref, created_at
        FROM subscription_history WHERE user_id = $1
        ORDER BY created_at DESC LIMIT 20
      `, [uid]),
    ]);

    const u = planRes.rows[0];
    return res.json({
      plan:          u.plan,
      planExpiresAt: u.plan_expires_at,
      memberSince:   u.created_at,
      history:       histRes.rows,
    });
  } catch (e) { return err500(res, e); }
});

// ── GET /api/user/app-session ─────────────────────────────────────────────────
router.get('/app-session', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT app_version, platform, is_market_connected,
             last_seen_at, ip_address,
             CASE WHEN last_seen_at > NOW() - INTERVAL '10 minutes'
                  THEN true ELSE false END AS is_online
      FROM app_sessions WHERE user_id = $1
    `, [req.user.id]).catch(() => ({ rows: [] }));
    return res.json({ session: rows[0] || null });
  } catch (e) { return err500(res, e); }
});

module.exports = router;

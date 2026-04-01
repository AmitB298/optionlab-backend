'use strict';
/**
 * admin.advanced.js — Advanced Admin API Routes
 *
 * GET /api/admin/analytics/overview     — DAU/WAU/MAU charts, retention
 * GET /api/admin/analytics/signups      — Signups over time (30d)
 * GET /api/admin/analytics/revenue      — MRR, upgrades over time
 * GET /api/admin/analytics/activity     — Real-time active users
 * GET /api/admin/referrals              — Full referral tracking
 * GET /api/admin/referrals/:code        — Referral code detail
 * POST /api/admin/referrals             — Create referral code
 * PATCH /api/admin/referrals/:code      — Update discount/commission
 * GET /api/admin/health                 — System health (DB, response times)
 * GET /api/admin/subscriptions          — Subscription management view
 * POST /api/admin/subscriptions/manual  — Manual payment record
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAdmin, auditLog, adminSecurityHeaders } = require('../middleware/admin.middleware');

router.use(adminSecurityHeaders);
router.use(requireAdmin);

function dbError(res, err) {
  console.error('[AdminAdvanced]', err.message);
  return res.status(500).json({ error: 'Database operation failed' });
}

// ══════════════════════════════════════════════════════════════════════════
// ANALYTICS — SIGNUPS OVER TIME (last 30 days, daily)
// ══════════════════════════════════════════════════════════════════════════
router.get('/analytics/signups', async (req, res) => {
  try {
    const { rows: daily } = await pool.query(`
      SELECT
        DATE_TRUNC('day', created_at)::date AS date,
        COUNT(*)                             AS signups,
        COUNT(*) FILTER (WHERE plan = 'PAID') AS paid_signups
      FROM users
      WHERE role = 'user'
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `);

    const { rows: monthly } = await pool.query(`
      SELECT
        DATE_TRUNC('month', created_at)::date AS month,
        COUNT(*)                               AS signups
      FROM users
      WHERE role = 'user'
        AND created_at > NOW() - INTERVAL '12 months'
      GROUP BY 1
      ORDER BY 1
    `);

    const { rows: totals } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')   AS last_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')  AS last_30d,
        COUNT(*)                                                           AS all_time
      FROM users WHERE role = 'user'
    `);

    return res.json({ daily, monthly, totals: totals[0] });
  } catch (err) { return dbError(res, err); }
});

// ══════════════════════════════════════════════════════════════════════════
// ANALYTICS — REVENUE / MRR
// ══════════════════════════════════════════════════════════════════════════
router.get('/analytics/revenue', async (req, res) => {
  try {
    // Upgrades per day last 30 days
    const { rows: daily } = await pool.query(`
      SELECT
        DATE_TRUNC('day', created_at)::date AS date,
        COUNT(*)                             AS upgrades,
        COALESCE(SUM(amount), 0)             AS revenue
      FROM subscription_history
      WHERE plan_to = 'PAID'
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `);

    // Monthly revenue last 12 months
    const { rows: monthly } = await pool.query(`
      SELECT
        DATE_TRUNC('month', created_at)::date AS month,
        COUNT(*)                               AS upgrades,
        COALESCE(SUM(amount), 0)               AS revenue
      FROM subscription_history
      WHERE plan_to = 'PAID'
        AND created_at > NOW() - INTERVAL '12 months'
      GROUP BY 1
      ORDER BY 1
    `);

    // Current MRR: paid users * plan price
    const { rows: mrr } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE plan = 'PAID')  AS paid_users,
        COUNT(*) FILTER (WHERE plan = 'TRIAL') AS trial_users,
        -- Calculate MRR based on 1499/user/month (configurable)
        COUNT(*) FILTER (WHERE plan = 'PAID') * 1499 AS mrr_inr
      FROM users WHERE role = 'user'
    `);

    // Revenue by referral code
    const { rows: byReferral } = await pool.query(`
      SELECT
        u.referral_code,
        COUNT(*)                 AS users,
        COUNT(*) FILTER (WHERE u.plan = 'PAID') AS paid_users,
        COALESCE(SUM(sh.amount), 0) AS total_revenue
      FROM users u
      LEFT JOIN subscription_history sh ON sh.user_id = u.id AND sh.plan_to = 'PAID'
      WHERE u.referral_code IS NOT NULL AND u.role = 'user'
      GROUP BY u.referral_code
      ORDER BY total_revenue DESC
      LIMIT 20
    `).catch(() => ({ rows: [] }));

    // upgrades_30d for overview card
    const upgrades_30d = daily.reduce((sum, d) => sum + (parseInt(d.upgrades) || 0), 0);

    return res.json({ daily, monthly, mrr: mrr[0], byReferral, upgrades_30d });
  } catch (err) { return dbError(res, err); }
});

// ══════════════════════════════════════════════════════════════════════════
// ANALYTICS — DAU/WAU/MAU TREND
// ══════════════════════════════════════════════════════════════════════════
router.get('/analytics/overview', async (req, res) => {
  try {
    // Daily active users last 30 days
    const { rows: dau } = await pool.query(`
      SELECT
        DATE_TRUNC('day', last_login_at)::date AS date,
        COUNT(DISTINCT user_id)                 AS active_users
      FROM user_activity
      WHERE last_login_at > NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `).catch(() => ({ rows: [] }));

    // Retention: % of users active in week 2, 3, 4 after signup
    const { rows: retention } = await pool.query(`
      SELECT
        EXTRACT(WEEK FROM u.created_at)::int AS cohort_week,
        COUNT(DISTINCT u.id)                  AS cohort_size,
        COUNT(DISTINCT CASE
          WHEN ua.last_login_at > u.created_at + INTERVAL '7 days' THEN u.id
        END)                                  AS retained_w2,
        COUNT(DISTINCT CASE
          WHEN ua.last_login_at > u.created_at + INTERVAL '14 days' THEN u.id
        END)                                  AS retained_w3,
        COUNT(DISTINCT CASE
          WHEN ua.last_login_at > u.created_at + INTERVAL '21 days' THEN u.id
        END)                                  AS retained_w4
      FROM users u
      LEFT JOIN user_activity ua ON ua.user_id = u.id
      WHERE u.role = 'user'
        AND u.created_at > NOW() - INTERVAL '12 weeks'
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 12
    `).catch(() => ({ rows: [] }));

    // Plan distribution over time
    const { rows: planTrend } = await pool.query(`
      SELECT
        DATE_TRUNC('month', created_at)::date AS month,
        plan,
        COUNT(*)                               AS users
      FROM users
      WHERE role = 'user'
        AND created_at > NOW() - INTERVAL '6 months'
      GROUP BY 1, 2
      ORDER BY 1, 2
    `).catch(() => ({ rows: [] }));

    // Trading style breakdown
    const { rows: tradingStyles } = await pool.query(`
      SELECT trading_style, COUNT(*) AS users
      FROM users
      WHERE role = 'user' AND trading_style IS NOT NULL AND trading_style != ''
      GROUP BY 1
      ORDER BY 2 DESC
    `).catch(() => ({ rows: [] }));

    // Experience breakdown
    const { rows: experience } = await pool.query(`
      SELECT experience, COUNT(*) AS users
      FROM users
      WHERE role = 'user' AND experience IS NOT NULL AND experience != ''
      GROUP BY 1
      ORDER BY 2 DESC
    `).catch(() => ({ rows: [] }));

    return res.json({ dau, retention, planTrend, tradingStyles, experience });
  } catch (err) { return dbError(res, err); }
});

// ══════════════════════════════════════════════════════════════════════════
// REAL-TIME ACTIVITY FEED
// ══════════════════════════════════════════════════════════════════════════
router.get('/analytics/activity', async (req, res) => {
  try {
    // Users online in last 10 minutes (via jobber heartbeat or last_login_at)
    const { rows: online } = await pool.query(`
      SELECT
        u.id, u.name, u.mobile, u.plan,
        ua.last_login_at, ua.last_login_ip, ua.last_device,
        ua.total_logins
      FROM users u
      JOIN user_activity ua ON ua.user_id = u.id
      WHERE u.role = 'user'
        AND ua.last_login_at > NOW() - INTERVAL '10 minutes'
      ORDER BY ua.last_login_at DESC
      LIMIT 50
    `).catch(() => ({ rows: [] }));

    // Recent signups (last 24h)
    const { rows: recentSignups } = await pool.query(`
      SELECT id, name, mobile, plan, experience, trading_style,
             referral_code, created_at
      FROM users
      WHERE role = 'user'
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 20
    `);

    // Recent plan changes (last 24h)
    const { rows: recentUpgrades } = await pool.query(`
      SELECT
        sh.id, sh.plan_from, sh.plan_to, sh.amount,
        sh.payment_ref, sh.created_at,
        u.name, u.mobile
      FROM subscription_history sh
      JOIN users u ON u.id = sh.user_id
      WHERE sh.created_at > NOW() - INTERVAL '24 hours'
      ORDER BY sh.created_at DESC
      LIMIT 20
    `);

    // Hourly login trend today
    const { rows: hourlyLogins } = await pool.query(`
      SELECT
        EXTRACT(HOUR FROM last_login_at)::int AS hour,
        COUNT(DISTINCT user_id)               AS logins
      FROM user_activity
      WHERE last_login_at::date = CURRENT_DATE
      GROUP BY 1
      ORDER BY 1
    `).catch(() => ({ rows: [] }));

    return res.json({ online, recentSignups, recentUpgrades, hourlyLogins,
      onlineCount: online.length });
  } catch (err) { return dbError(res, err); }
});

// ══════════════════════════════════════════════════════════════════════════
// REFERRAL SYSTEM
// ══════════════════════════════════════════════════════════════════════════

// GET all referral codes with full stats
router.get('/referrals', async (req, res) => {
  try {
    // First get codes that exist in a referral_codes table if it exists,
    // otherwise derive from users.referral_code usage
    const { rows: codes } = await pool.query(`
      SELECT
        u.referral_code                                        AS code,
        COUNT(DISTINCT u.id)                                  AS total_users,
        COUNT(DISTINCT u.id) FILTER (WHERE u.plan = 'PAID')  AS paid_users,
        COUNT(DISTINCT u.id) FILTER (WHERE u.plan = 'FREE')  AS free_users,
        COUNT(DISTINCT u.id) FILTER (
          WHERE u.created_at > NOW() - INTERVAL '30 days'
        )                                                      AS users_30d,
        COALESCE(SUM(sh.amount), 0)                           AS total_revenue,
        COALESCE(AVG(sh.amount) FILTER (WHERE sh.amount > 0), 0) AS avg_order_value,
        MIN(u.created_at)                                     AS first_used,
        MAX(u.created_at)                                     AS last_used
      FROM users u
      LEFT JOIN subscription_history sh ON sh.user_id = u.id
        AND sh.plan_to = 'PAID'
      WHERE u.referral_code IS NOT NULL
        AND u.referral_code != ''
        AND u.role = 'user'
      GROUP BY u.referral_code
      ORDER BY total_revenue DESC, total_users DESC
    `).catch(() => ({ rows: [] }));

    // Also get managed referral codes if table exists
    const { rows: managed } = await pool.query(`
      SELECT * FROM referral_codes ORDER BY created_at DESC
    `).catch(() => ({ rows: [] }));

    return res.json({ codes, managed });
  } catch (err) { return dbError(res, err); }
});

// GET users who used a specific referral code
router.get('/referrals/:code', async (req, res) => {
  const code = (req.params.code || '').toUpperCase().trim();
  if (!code || code.length > 20) return res.status(400).json({ error: 'Invalid code' });

  try {
    const { rows: users } = await pool.query(`
      SELECT
        u.id, u.name, u.mobile, u.email, u.plan, u.is_active,
        u.created_at, ua.last_login_at, ua.total_logins,
        COALESCE(SUM(sh.amount), 0) AS total_paid
      FROM users u
      LEFT JOIN user_activity ua ON ua.user_id = u.id
      LEFT JOIN subscription_history sh ON sh.user_id = u.id AND sh.plan_to = 'PAID'
      WHERE u.referral_code = $1 AND u.role = 'user'
      GROUP BY u.id, ua.last_login_at, ua.total_logins
      ORDER BY u.created_at DESC
    `, [code]);

    const { rows: stats } = await pool.query(`
      SELECT
        COUNT(*)                                         AS total_users,
        COUNT(*) FILTER (WHERE plan = 'PAID')           AS paid_users,
        COUNT(*) FILTER (WHERE plan = 'FREE')           AS free_users,
        MIN(created_at)                                  AS first_used,
        MAX(created_at)                                  AS last_used,
        ROUND(COUNT(*) FILTER (WHERE plan = 'PAID') * 100.0
          / NULLIF(COUNT(*), 0), 1)                     AS conversion_rate
      FROM users
      WHERE referral_code = $1 AND role = 'user'
    `, [code]);

    // Get managed code config if exists
    const { rows: config } = await pool.query(
      `SELECT * FROM referral_codes WHERE code = $1`, [code]
    ).catch(() => ({ rows: [] }));

    return res.json({ code, users, stats: stats[0], config: config[0] || null });
  } catch (err) { return dbError(res, err); }
});

// POST create/manage a referral code
router.post('/referrals', auditLog('CREATE_REFERRAL_CODE'), async (req, res) => {
  const { code, owner_name, owner_mobile, discount_pct, commission_pct, notes } = req.body;

  if (!code || typeof code !== 'string' || code.length < 3 || code.length > 20) {
    return res.status(400).json({ error: 'Code must be 3–20 characters' });
  }
  if (discount_pct !== undefined && (discount_pct < 0 || discount_pct > 100)) {
    return res.status(400).json({ error: 'discount_pct must be 0–100' });
  }
  if (commission_pct !== undefined && (commission_pct < 0 || commission_pct > 100)) {
    return res.status(400).json({ error: 'commission_pct must be 0–100' });
  }

  try {
    // Ensure referral_codes table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referral_codes (
        id             SERIAL PRIMARY KEY,
        code           VARCHAR(20) UNIQUE NOT NULL,
        owner_name     VARCHAR(100),
        owner_mobile   VARCHAR(15),
        discount_pct   NUMERIC(5,2) DEFAULT 0,
        commission_pct NUMERIC(5,2) DEFAULT 0,
        is_active      BOOLEAN DEFAULT true,
        notes          TEXT,
        created_by     INT REFERENCES admins(id),
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const { rows } = await pool.query(`
      INSERT INTO referral_codes
        (code, owner_name, owner_mobile, discount_pct, commission_pct, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (code) DO UPDATE SET
        owner_name     = EXCLUDED.owner_name,
        owner_mobile   = EXCLUDED.owner_mobile,
        discount_pct   = EXCLUDED.discount_pct,
        commission_pct = EXCLUDED.commission_pct,
        notes          = EXCLUDED.notes,
        updated_at     = NOW()
      RETURNING *
    `, [
      code.toUpperCase(),
      owner_name || null,
      owner_mobile || null,
      discount_pct || 0,
      commission_pct || 0,
      notes || null,
      req.admin.adminId,
    ]);

    return res.json({ success: true, referral: rows[0] });
  } catch (err) { return dbError(res, err); }
});

// PATCH update referral code discount/commission
router.patch('/referrals/:code', auditLog('UPDATE_REFERRAL_CODE'), async (req, res) => {
  const code = (req.params.code || '').toUpperCase();
  const { discount_pct, commission_pct, is_active, owner_name, owner_mobile, notes } = req.body;

  try {
    const { rowCount } = await pool.query(`
      UPDATE referral_codes SET
        discount_pct   = COALESCE($1, discount_pct),
        commission_pct = COALESCE($2, commission_pct),
        is_active      = COALESCE($3, is_active),
        owner_name     = COALESCE($4, owner_name),
        owner_mobile   = COALESCE($5, owner_mobile),
        notes          = COALESCE($6, notes),
        updated_at     = NOW()
      WHERE code = $7
    `, [discount_pct, commission_pct, is_active, owner_name, owner_mobile, notes, code]);

    if (rowCount === 0) return res.status(404).json({ error: 'Referral code not found' });
    return res.json({ success: true, message: `Referral code ${code} updated` });
  } catch (err) { return dbError(res, err); }
});

// ══════════════════════════════════════════════════════════════════════════
// SYSTEM HEALTH
// ══════════════════════════════════════════════════════════════════════════
router.get('/health', async (req, res) => {
  const start = Date.now();
  const checks = {};

  // DB ping
  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    checks.database = { status: 'ok', latency_ms: Date.now() - dbStart };
  } catch (e) {
    checks.database = { status: 'error', error: e.message };
  }

  // DB pool stats
  try {
    checks.pool = {
      total:   pool.totalCount,
      idle:    pool.idleCount,
      waiting: pool.waitingCount,
    };
  } catch (e) { checks.pool = { status: 'unknown' }; }

  // Table row counts
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users)                AS users,
        (SELECT COUNT(*) FROM subscription_history) AS subscriptions,
        (SELECT COUNT(*) FROM trusted_devices)      AS devices,
        (SELECT COUNT(*) FROM admin_audit_log)      AS audit_logs,
        (SELECT COUNT(*) FROM admin_announcements)  AS announcements
    `);
    checks.tables = rows[0];
  } catch (e) { checks.tables = { status: 'error' }; }

  // DB size
  try {
    const { rows } = await pool.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size,
             pg_database_size(current_database()) AS db_bytes
    `);
    checks.storage = rows[0];
  } catch (e) { checks.storage = { status: 'unknown' }; }

  // Recent error rate from audit log
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE success = false) AS failures,
        COUNT(*)                                 AS total
      FROM admin_audit_log
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);
    checks.recentErrors = rows[0];
  } catch (e) { checks.recentErrors = { status: 'unknown' }; }

  const overall = Object.values(checks).every(c => c.status !== 'error') ? 'healthy' : 'degraded';

  return res.json({
    status:      overall,
    uptime_ms:   process.uptime() * 1000,
    response_ms: Date.now() - start,
    node_version: process.version,
    memory:      process.memoryUsage(),
    checks,
    timestamp:   new Date().toISOString(),
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════

// Full subscription history with filters
router.get('/subscriptions', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    const type   = req.query.type; // 'upgrade' | 'downgrade' | 'manual'

    let where = [];
    const params = [];

    if (type === 'upgrade') where.push(`sh.plan_to = 'PAID'`);
    if (type === 'downgrade') where.push(`sh.plan_to = 'FREE'`);
    if (type === 'manual') where.push(`sh.payment_ref IS NOT NULL`);

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    params.push(limit, offset);

    const { rows } = await pool.query(`
      SELECT
        sh.id, sh.plan_from, sh.plan_to, sh.reason,
        sh.amount, sh.payment_ref, sh.created_at,
        u.id AS user_id, u.name, u.mobile, u.email, u.plan AS current_plan,
        a.name AS changed_by_name
      FROM subscription_history sh
      JOIN users u ON u.id = sh.user_id
      LEFT JOIN admins a ON a.id = sh.changed_by
      ${whereClause}
      ORDER BY sh.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const { rows: totals } = await pool.query(`
      SELECT
        COUNT(*)                                              AS total,
        COALESCE(SUM(amount), 0)                             AS total_revenue,
        COUNT(*) FILTER (WHERE plan_to = 'PAID')            AS upgrades,
        COUNT(*) FILTER (WHERE plan_to = 'FREE')            AS downgrades,
        COALESCE(AVG(amount) FILTER (WHERE amount > 0), 0)  AS avg_amount
      FROM subscription_history
    `);

    return res.json({ subscriptions: rows, totals: totals[0], page, limit });
  } catch (err) { return dbError(res, err); }
});

// Manual payment record — grant paid plan without Razorpay
router.post('/subscriptions/manual', auditLog('MANUAL_PAYMENT'), async (req, res) => {
  const { user_id, plan, amount, payment_ref, reason, expires_days } = req.body;

  if (!user_id || !Number.isInteger(+user_id)) {
    return res.status(400).json({ error: 'Valid user_id required' });
  }
  if (!['PAID', 'TRIAL', 'FREE', 'SUSPENDED'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan' });
  }
  if (!reason || typeof reason !== 'string' || reason.length < 3) {
    return res.status(400).json({ error: 'Reason required (min 3 chars)' });
  }

  try {
    const { rows: user } = await pool.query(
      `SELECT id, name, mobile, plan FROM users WHERE id = $1 AND role = 'user'`,
      [+user_id]
    );
    if (!user.length) return res.status(404).json({ error: 'User not found' });

    const oldPlan = user[0].plan;

    // Update plan
    await pool.query(`UPDATE users SET plan = $1 WHERE id = $2`, [plan, +user_id]);

    // If expires_days provided, set plan_expires_at
    if (expires_days && Number.isInteger(+expires_days) && +expires_days > 0) {
      await pool.query(
        `UPDATE users SET plan_expires_at = NOW() + INTERVAL '${+expires_days} days' WHERE id = $1`,
        [+user_id]
      ).catch(() => {}); // column may not exist yet
    }

    // Record in subscription_history
    await pool.query(`
      INSERT INTO subscription_history
        (user_id, plan_from, plan_to, changed_by, reason, amount, payment_ref)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      +user_id, oldPlan, plan, req.admin.adminId,
      reason,
      parseFloat(amount) || 0,
      payment_ref || `MANUAL-${Date.now()}`,
    ]);

    return res.json({
      success: true,
      message: `${user[0].name} (${user[0].mobile}): ${oldPlan} → ${plan}`,
    });
  } catch (err) { return dbError(res, err); }
});

module.exports = router;

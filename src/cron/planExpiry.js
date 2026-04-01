'use strict';
/**
 * cron/planExpiry.js — Plan expiry enforcement
 *
 * downgradeExpiredPlans() — finds expired paid users, resets to FREE
 * warnExpiringPlans()     — flags users expiring in 3 days (for email)
 * getUserValidPlan()      — real-time check at heartbeat/API level
 */

const pool = require('../db/pool');

// ── Ensure column exists (idempotent) ─────────────────────────────────────
async function ensureSchema() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ
  `).catch(e => console.error('[expiry] schema check:', e.message));
}

// ── Downgrade all expired users ───────────────────────────────────────────
async function downgradeExpiredPlans() {
  const start = Date.now();
  try {
    const { rows: expired } = await pool.query(`
      SELECT id, name, mobile, plan, plan_expires_at
      FROM users
      WHERE plan != 'FREE'
        AND plan_expires_at IS NOT NULL
        AND plan_expires_at < NOW()
        AND is_active = true
        AND role = 'user'
    `);

    if (!expired.length) {
      console.log(`[expiry] No expired plans (${Date.now() - start}ms)`);
      return { downgraded: 0 };
    }

    console.log(`[expiry] Downgrading ${expired.length} expired plan(s)`);
    let count = 0;

    for (const user of expired) {
      try {
        await pool.query(
          `UPDATE users SET plan = 'FREE', plan_expires_at = NULL WHERE id = $1`,
          [user.id]
        );
        await pool.query(`
          INSERT INTO subscription_history
            (user_id, plan_from, plan_to, reason, amount, payment_ref, created_at)
          VALUES ($1, $2, 'FREE', 'Auto-downgrade: plan expired', 0, 'SYSTEM_EXPIRY', NOW())
        `, [user.id, user.plan]);
        console.log(`[expiry] Downgraded user ${user.id} (${user.mobile}) — was ${user.plan}, expired ${user.plan_expires_at}`);
        count++;
      } catch (e) {
        console.error(`[expiry] Failed user ${user.id}:`, e.message);
      }
    }
    return { downgraded: count };
  } catch (e) {
    console.error('[expiry] downgradeExpiredPlans:', e.message);
    return { downgraded: 0, error: e.message };
  }
}

// ── Warn users expiring in 3 days ─────────────────────────────────────────
async function warnExpiringPlans() {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, email, mobile, plan, plan_expires_at
      FROM users
      WHERE plan != 'FREE'
        AND plan_expires_at IS NOT NULL
        AND plan_expires_at BETWEEN NOW() AND NOW() + INTERVAL '3 days'
        AND is_active = true
        AND role = 'user'
    `);
    if (rows.length) {
      console.log(`[expiry] ${rows.length} plan(s) expiring within 3 days:`,
        rows.map(u => `${u.mobile} (${u.plan_expires_at})`).join(', '));
    }
    // TODO: hook into emailService.sendExpiryWarning(user) here
    return { warned: rows.length };
  } catch (e) {
    console.error('[expiry] warnExpiringPlans:', e.message);
    return { warned: 0, error: e.message };
  }
}

// ── Real-time plan check at heartbeat/token-validate level ────────────────
// Returns the correct current plan (downgrades in DB if expired)
async function getUserValidPlan(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT plan, plan_expires_at FROM users WHERE id = $1`,
      [userId]
    );
    if (!rows.length) return null;
    const { plan, plan_expires_at } = rows[0];

    if (plan !== 'FREE' && plan_expires_at && new Date(plan_expires_at) < new Date()) {
      // Expired — downgrade immediately
      await pool.query(
        `UPDATE users SET plan = 'FREE', plan_expires_at = NULL WHERE id = $1`,
        [userId]
      );
      await pool.query(`
        INSERT INTO subscription_history
          (user_id, plan_from, plan_to, reason, amount, payment_ref, created_at)
        VALUES ($1, $2, 'FREE', 'Real-time expiry check', 0, 'SYSTEM_EXPIRY_RT', NOW())
      `, [userId, plan]).catch(() => {});
      console.log(`[expiry] Real-time downgrade: user ${userId} ${plan} → FREE`);
      return 'FREE';
    }
    return plan;
  } catch (e) {
    console.error('[expiry] getUserValidPlan:', e.message);
    return null;
  }
}

module.exports = { ensureSchema, downgradeExpiredPlans, warnExpiringPlans, getUserValidPlan };

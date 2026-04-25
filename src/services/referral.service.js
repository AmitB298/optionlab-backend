'use strict';
/**
 * src/services/referral.service.js
 * OptionsLab — Referral System Brain
 *
 * Rewards (in paise — 100 paise = ₹1):
 *   signup_completed → referrer +₹10  (1000 paise) — 7-day hold
 *   plan_upgraded    → referrer +₹150 (15000 paise) — 7-day hold
 *   plan_renewed     → referrer +₹75  (7500 paise)  — 7-day hold
 *
 * Milestones (instant credit, no hold):
 *   3  Pro conversions → +₹200 (20000 paise)
 *   10 Pro conversions → +₹500 (50000 paise) + 30 free days
 *   25 Pro conversions → +₹1000 (100000 paise) + 60 free days
 *
 * Wallet Rules:
 *   - Minimum ₹1,499 (149900 paise) to redeem 1 Pro subscription
 *   - Cash withdrawal: NEVER
 *   - Wallet = OptionsLab subscription credit only
 */

const pool = require('../db/pool');

const REWARDS = {
  signup_completed: 1000,
  plan_upgraded:    15000,
  plan_renewed:     7500,
};

const MILESTONES = [
  { threshold: 25, tier: 'gold',   bonusPaise: 100000, freeDays: 60, label: '🥇 Gold'   },
  { threshold: 10, tier: 'silver', bonusPaise: 50000,  freeDays: 30, label: '🥈 Silver' },
  { threshold: 3,  tier: 'bronze', bonusPaise: 20000,  freeDays: 0,  label: '🥉 Bronze' },
];
const TIER_ORDER = { none: 0, bronze: 1, silver: 2, gold: 3 };

async function ensureWallet(client, userId) {
  await client.query(
    `INSERT INTO referral_wallet (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

async function findReferrer(referralCode) {
  if (!referralCode) return null;
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE referral_code = $1 AND is_active = true`,
    [referralCode.toUpperCase()]
  );
  return rows[0] || null;
}

async function alreadyRewarded(client, referrerId, refereeId, eventType) {
  const { rows } = await client.query(
    `SELECT id FROM referral_events
     WHERE referrer_id = $1 AND referee_id = $2 AND event_type = $3 AND status != 'cancelled'`,
    [referrerId, refereeId, eventType]
  );
  return rows.length > 0;
}

async function checkMilestone(client, referrerId) {
  const { rows } = await client.query(
    `SELECT total_conversions, tier FROM referral_wallet WHERE user_id = $1`,
    [referrerId]
  );
  if (!rows.length) return null;

  const { total_conversions: conversions, tier: currentTier } = rows[0];

  for (const milestone of MILESTONES) {
    if (conversions >= milestone.threshold && TIER_ORDER[currentTier] < TIER_ORDER[milestone.tier]) {
      await client.query(
        `UPDATE referral_wallet
         SET tier = $1, balance_paise = balance_paise + $2, lifetime_earned = lifetime_earned + $2
         WHERE user_id = $3`,
        [milestone.tier, milestone.bonusPaise, referrerId]
      );
      await client.query(
        `INSERT INTO referral_events
           (referrer_id, referee_id, event_type, reward_amount, status, release_at, notes)
         VALUES ($1, NULL, 'milestone_bonus', $2, 'credited', NOW(), $3)`,
        [referrerId, milestone.bonusPaise, `Reached ${milestone.label} tier!`]
      );
      if (milestone.freeDays > 0) {
        await client.query(
          `UPDATE users SET plan_expires_at = GREATEST(plan_expires_at, NOW()) + ($1 || ' days')::interval WHERE id = $2`,
          [milestone.freeDays, referrerId]
        );
      }
      console.log(`[referral] ✅ Milestone: User ${referrerId} reached ${milestone.label}`);
      return milestone;
    }
  }
  return null;
}

async function processSignupReward(refereeId, referralCode) {
  if (!referralCode) return;
  try {
    const referrer = await findReferrer(referralCode);
    if (!referrer) return;
    if (referrer.id === refereeId) { console.warn(`[referral] Self-referral blocked`); return; }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureWallet(client, referrer.id);
      await ensureWallet(client, refereeId);
      const isDuplicate = await alreadyRewarded(client, referrer.id, refereeId, 'signup_completed');
      if (isDuplicate) { await client.query('ROLLBACK'); return; }

      const releaseAt = new Date();
      releaseAt.setDate(releaseAt.getDate() + 7);

      await client.query(
        `INSERT INTO referral_events (referrer_id, referee_id, event_type, reward_amount, status, release_at, notes)
         VALUES ($1, $2, 'signup_completed', $3, 'pending', $4, $5)`,
        [referrer.id, refereeId, REWARDS.signup_completed, releaseAt, `Friend signed up with code ${referralCode}`]
      );
      await client.query(
        `UPDATE users SET referred_by_code = $1 WHERE id = $2 AND referred_by_code IS NULL`,
        [referralCode, refereeId]
      );
      await client.query('COMMIT');
      console.log(`[referral] ✅ Signup: referrer ${referrer.id} ← ₹10 pending (referee ${refereeId})`);
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (e) { console.error('[referral] processSignupReward error:', e.message); }
}

async function processUpgradeReward(userId, orderId, isRenewal = false) {
  try {
    const { rows } = await pool.query(`SELECT referred_by_code FROM users WHERE id = $1`, [userId]);
    if (!rows.length || !rows[0].referred_by_code) return;

    const referrer = await findReferrer(rows[0].referred_by_code);
    if (!referrer) return;

    const eventType = isRenewal ? 'plan_renewed' : 'plan_upgraded';
    const amount    = isRenewal ? REWARDS.plan_renewed : REWARDS.plan_upgraded;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureWallet(client, referrer.id);
      await ensureWallet(client, userId);

      if (!isRenewal) {
        const isDuplicate = await alreadyRewarded(client, referrer.id, userId, 'plan_upgraded');
        if (isDuplicate) { await client.query('ROLLBACK'); return; }
      }

      const releaseAt = new Date();
      releaseAt.setDate(releaseAt.getDate() + 7);

      await client.query(
        `INSERT INTO referral_events (referrer_id, referee_id, event_type, reward_amount, status, release_at, notes)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
        [referrer.id, userId, eventType, amount, releaseAt, `Order: ${orderId}`]
      );

      if (!isRenewal) {
        await client.query(
          `UPDATE referral_wallet SET total_conversions = total_conversions + 1 WHERE user_id = $1`,
          [referrer.id]
        );
        await checkMilestone(client, referrer.id);
      }

      await client.query('COMMIT');
      console.log(`[referral] ✅ ${isRenewal ? 'Renewal' : 'Upgrade'}: referrer ${referrer.id} ← pending`);
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (e) { console.error('[referral] processUpgradeReward error:', e.message); }
}

const PRO_PLAN_PAISE = 149900;

async function redeemWallet(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT balance_paise FROM referral_wallet WHERE user_id = $1 FOR UPDATE`, [userId]
    );
    if (!rows.length || rows[0].balance_paise < PRO_PLAN_PAISE) {
      await client.query('ROLLBACK');
      const balance = rows[0]?.balance_paise || 0;
      return { success: false, message: `Minimum ₹1,499 chahiye. Abhi ₹${balance/100} hai.`, currentBalance: balance };
    }
    await client.query(`UPDATE referral_wallet SET balance_paise = balance_paise - $1 WHERE user_id = $2`, [PRO_PLAN_PAISE, userId]);
    await client.query(`UPDATE users SET plan = 'pro', plan_expires_at = GREATEST(COALESCE(plan_expires_at, NOW()), NOW()) + INTERVAL '30 days' WHERE id = $1`, [userId]);
    await client.query(
      `INSERT INTO referral_events (referrer_id, referee_id, event_type, reward_amount, status, release_at, notes)
       VALUES ($1, NULL, 'wallet_redeemed', $2, 'credited', NOW(), $3)`,
      [userId, -PRO_PLAN_PAISE, 'Redeemed wallet for 1 month Pro']
    );
    const { rows: updated } = await client.query(`SELECT balance_paise FROM referral_wallet WHERE user_id = $1`, [userId]);
    await client.query('COMMIT');
    return { success: true, message: '1 month Pro add ho gaya!', currentBalance: updated[0].balance_paise };
  } catch (e) { await client.query('ROLLBACK'); return { success: false, message: 'Failed. Try again.' }; }
  finally { client.release(); }
}

async function getReferralStats(userId) {
  try {
    const { rows: walletRows } = await pool.query(`SELECT balance_paise, lifetime_earned, tier, total_conversions FROM referral_wallet WHERE user_id = $1`, [userId]);
    const { rows: userRows }   = await pool.query(`SELECT referral_code FROM users WHERE id = $1`, [userId]);
    const wallet = walletRows[0] || { balance_paise: 0, lifetime_earned: 0, tier: 'none', total_conversions: 0 };
    const { rows: events }     = await pool.query(`SELECT event_type, reward_amount, status, release_at, credited_at, notes, created_at FROM referral_events WHERE referrer_id = $1 ORDER BY created_at DESC LIMIT 10`, [userId]);
    const { rows: pendingRows }= await pool.query(`SELECT COALESCE(SUM(reward_amount), 0) AS pending_paise FROM referral_events WHERE referrer_id = $1 AND status = 'pending'`, [userId]);
    const conversions = wallet.total_conversions;
    const nextMilestone = MILESTONES.slice().reverse().find(m => m.threshold > conversions && TIER_ORDER[m.tier] > TIER_ORDER[wallet.tier]);
    return {
      referral_code: userRows[0]?.referral_code || null,
      balance_inr: wallet.balance_paise / 100,
      lifetime_earned_inr: wallet.lifetime_earned / 100,
      pending_inr: parseInt(pendingRows[0].pending_paise) / 100,
      tier: wallet.tier,
      total_conversions: wallet.total_conversions,
      can_redeem: wallet.balance_paise >= PRO_PLAN_PAISE,
      redeem_threshold_inr: PRO_PLAN_PAISE / 100,
      next_milestone: nextMilestone ? { label: nextMilestone.label, threshold: nextMilestone.threshold, remaining: nextMilestone.threshold - conversions, bonus_inr: nextMilestone.bonusPaise / 100, free_days: nextMilestone.freeDays } : null,
      recent_events: events.map(e => ({ type: e.event_type, amount_inr: e.reward_amount / 100, status: e.status, release_at: e.release_at, notes: e.notes, created_at: e.created_at })),
    };
  } catch (e) { console.error('[referral] getReferralStats error:', e.message); return null; }
}

async function releasePendingRewards() {
  try {
    const { rows: pending } = await pool.query(`SELECT id, referrer_id, reward_amount FROM referral_events WHERE status = 'pending' AND release_at <= NOW()`);
    if (!pending.length) { console.log('[referral-cron] No pending rewards'); return { released: 0 }; }
    let released = 0;
    for (const event of pending) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`UPDATE referral_events SET status = 'credited', credited_at = NOW() WHERE id = $1`, [event.id]);
        await ensureWallet(client, event.referrer_id);
        await client.query(`UPDATE referral_wallet SET balance_paise = balance_paise + $1, lifetime_earned = lifetime_earned + $1 WHERE user_id = $2`, [event.reward_amount, event.referrer_id]);
        await client.query('COMMIT');
        released++;
      } catch (e) { await client.query('ROLLBACK'); console.error(`[referral-cron] Failed event ${event.id}:`, e.message); }
      finally { client.release(); }
    }
    console.log(`[referral-cron] Released ${released} rewards`);
    return { released };
  } catch (e) { console.error('[referral-cron] error:', e.message); return { released: 0 }; }
}

module.exports = { processSignupReward, processUpgradeReward, redeemWallet, getReferralStats, releasePendingRewards };

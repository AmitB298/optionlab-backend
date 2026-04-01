'use strict';
/**
 * payments.routes.js — Razorpay Integration
 *
 * POST /api/payments/create-order   → create Razorpay order
 * POST /api/payments/verify         → verify payment signature → grant plan
 * POST /api/payments/webhook        → Razorpay webhook (server-to-server)
 * GET  /api/payments/history        → user payment history
 */

const express  = require('express');
const crypto   = require('crypto');
const router   = express.Router();
const pool     = require('../db/pool');
const { auth } = require('../middleware/auth');
const { createLimiter } = require('../lib/rateLimit');

// ── Rate limiters ─────────────────────────────────────────────────────────
// 5 order attempts per user per 15 minutes (prevents Razorpay quota abuse)
const createOrderLimiter = createLimiter({
  max:      5,
  windowMs: 15 * 60 * 1000,
  blockMs:  30 * 60 * 1000,
  message:  'Too many payment attempts. Please wait 30 minutes.',
  keyFn:    (req) => `payment_order:${req.user?.id || req.ip}`,
});

// 10 verify attempts per user per hour (signature verification)
const verifyLimiter = createLimiter({
  max:      10,
  windowMs: 60 * 60 * 1000,
  blockMs:  60 * 60 * 1000,
  message:  'Too many verification attempts.',
  keyFn:    (req) => `payment_verify:${req.user?.id || req.ip}`,
});

const RAZORPAY_KEY_ID     = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET      = process.env.RAZORPAY_WEBHOOK_SECRET;

// Plan pricing in paise (100 paise = ₹1)
const PLAN_PRICING = {
  monthly:   { amount: 149900, label: 'Professional Monthly', plan: 'PAID', days: 30  },
  quarterly: { amount: 399900, label: 'Professional Quarterly', plan: 'PAID', days: 90 },
  annual:    { amount: 1199900, label: 'Professional Annual', plan: 'PAID', days: 365 },
};

// ── Razorpay API helper (no SDK needed, just HTTPS) ───────────────────────
async function razorpayRequest(method, path, body) {
  const credentials = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
  const url = `https://api.razorpay.com/v1${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Basic ${credentials}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.description || `Razorpay error: ${res.status}`);
  return data;
}

// ── POST /api/payments/create-order ──────────────────────────────────────
router.post('/create-order', auth, createOrderLimiter, async (req, res) => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: 'Payment system not configured. Contact support.' });
  }

  const planType = req.body.plan_type;
  if (!PLAN_PRICING[planType]) {
    return res.status(400).json({
      error: 'Invalid plan type',
      valid: Object.keys(PLAN_PRICING),
    });
  }

  const plan    = PLAN_PRICING[planType];
  const userId  = req.user.id;
  const receipt = `ol_${userId}_${Date.now()}`;

  try {
    // Fetch user details for prefill
    const { rows } = await pool.query(
      `SELECT name, email, mobile FROM users WHERE id = $1`,
      [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const user = rows[0];

    // Create Razorpay order
    const order = await razorpayRequest('POST', '/orders', {
      amount:   plan.amount,
      currency: 'INR',
      receipt,
      notes: {
        user_id:   userId.toString(),
        plan_type: planType,
        plan:      plan.plan,
      },
    });

    return res.json({
      success:      true,
      order_id:     order.id,
      amount:       plan.amount,
      currency:     'INR',
      key_id:       RAZORPAY_KEY_ID,
      plan_label:   plan.label,
      plan_days:    plan.days,
      // Prefill data for checkout
      user_name:    user.name,
      user_email:   user.email || '',
      user_mobile:  user.mobile,
    });
  } catch (e) {
    console.error('[payments] create-order:', e.message);
    return res.status(500).json({ error: 'Could not create payment order. Please try again.' });
  }
});

// ── POST /api/payments/verify ─────────────────────────────────────────────
// Called by frontend after Razorpay checkout success
router.post('/verify', auth, verifyLimiter, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_type } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan_type) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }
  if (!PLAN_PRICING[plan_type]) {
    return res.status(400).json({ error: 'Invalid plan type' });
  }
  // Bug #15: Guard against missing secret
  if (!RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: 'Payment system not configured' });
  }

  // Verify HMAC signature
  const expectedSig = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSig !== razorpay_signature) {
    console.error('[payments] Signature mismatch', { userId: req.user.id, order: razorpay_order_id });
    return res.status(400).json({ error: 'Payment verification failed. Signature mismatch.' });
  }

  const plan      = PLAN_PRICING[plan_type];
  const userId    = req.user.id;
  const expiresAt = new Date(Date.now() + plan.days * 24 * 60 * 60 * 1000);

  // Bug #4: Transaction with row lock prevents race condition on double-click
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock user row — prevents concurrent upgrade from same payment
    const { rows: [user] } = await client.query(
      `SELECT plan FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (!user) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    // Idempotency check inside transaction
    const { rows: existing } = await client.query(
      `SELECT id FROM subscription_history WHERE payment_ref = $1`,
      [razorpay_payment_id]
    );
    if (existing.length) {
      await client.query('ROLLBACK');
      return res.json({ success: true, message: 'Already processed', plan: plan.plan });
    }

    // Upgrade plan
    await client.query(
      `UPDATE users SET plan = $1, plan_expires_at = $2 WHERE id = $3`,
      [plan.plan, expiresAt, userId]
    );

    // Record history
    await client.query(`
      INSERT INTO subscription_history
        (user_id, plan_from, plan_to, reason, amount, payment_ref, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [userId, user.plan, plan.plan,
        `Razorpay: ${plan_type} · order ${razorpay_order_id}`,
        (plan.amount / 100).toFixed(2), razorpay_payment_id]);

    await client.query('COMMIT');
    console.log(`[payments] Upgraded user ${userId} to ${plan.plan} via ${razorpay_payment_id}`);
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('[payments] verify transaction failed:', e.message);
    return res.status(500).json({ error: 'Payment recorded but plan update failed. Contact support with: ' + razorpay_payment_id });
  } finally {
    client.release();
  }

  return res.json({
    success:      true,
    plan:         plan.plan,
    plan_expires: expiresAt.toISOString(),
    message:      `Upgraded to ${plan.label}. Enjoy Jobber Pro!`,
  });
});

// ── POST /api/payments/webhook ────────────────────────────────────────────
// Razorpay server-to-server webhook — backup verification
// Set webhook URL in Razorpay dashboard: https://yourdomain/api/payments/webhook
router.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  if (!WEBHOOK_SECRET) return res.status(200).json({ status: 'ignored' });

  const signature = req.headers['x-razorpay-signature'];
  const body      = req.body;

  const expectedSig = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  if (expectedSig !== signature) {
    console.error('[payments/webhook] Invalid signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(body.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Handle payment.captured event
  if (event.event === 'payment.captured') {
    const payment = event.payload.payment.entity;
    const notes   = payment.notes || {};
    const userId  = parseInt(notes.user_id);
    const planKey = notes.plan_type;

    if (userId && planKey && PLAN_PRICING[planKey]) {
      const plan      = PLAN_PRICING[planKey];
      const expiresAt = new Date(Date.now() + plan.days * 24 * 60 * 60 * 1000);

      // Check idempotency
      const { rows: existing } = await pool.query(
        `SELECT id FROM subscription_history WHERE payment_ref = $1`,
        [payment.id]
      ).catch(() => ({ rows: [] }));

      if (!existing.length) {
        await pool.query(
          `UPDATE users SET plan = $1, plan_expires_at = $2 WHERE id = $3`,
          [plan.plan, expiresAt, userId]
        ).catch(e => console.error('[webhook] plan update failed:', e.message));

        await pool.query(`
          INSERT INTO subscription_history
            (user_id, plan_from, plan_to, reason, amount, payment_ref, created_at)
          VALUES ($1, 'FREE', $2, $3, $4, $5, NOW())
          ON CONFLICT DO NOTHING
        `, [userId, plan.plan, `Webhook: ${event.event}`, (plan.amount/100).toFixed(2), payment.id])
          .catch(e => console.error('[webhook] history insert failed:', e.message));

        console.log(`[payments/webhook] Auto-upgraded user ${userId} via webhook`);
      }
    }
  }

  return res.json({ status: 'ok' });
});

// ── GET /api/payments/history ─────────────────────────────────────────────
router.get('/history', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT plan_from, plan_to, reason, amount, payment_ref, created_at
      FROM subscription_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [req.user.id]);
    return res.json({ history: rows });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load history' });
  }
});

// ── GET /api/payments/pricing ─────────────────────────────────────────────
router.get('/pricing', (req, res) => {
  return res.json({
    plans: Object.entries(PLAN_PRICING).map(([key, p]) => ({
      key,
      label:   p.label,
      amount:  p.amount,
      amountInr: p.amount / 100,
      days:    p.days,
      plan:    p.plan,
    })),
  });
});

module.exports = router;

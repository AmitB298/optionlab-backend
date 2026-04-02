'use strict';

/**
 * payments.routes.js — Razorpay Integration (v2)
 *
 * Routes:
 *   POST /api/payments/create-order   → create Razorpay order + insert into orders table
 *   POST /api/payments/verify         → verify signature + insert into payments table + upgrade plan
 *   POST /api/payments/webhook        → Razorpay webhook (payment.captured, refund.created, etc.)
 *   GET  /api/payments/history        → user's own payment history
 *   GET  /api/payments/receipt/:id    → single receipt for a payment
 *
 * Admin routes (admin.routes.js handles these via payment_ledger view):
 *   GET  /api/admin/payments          → full ledger
 */

const express  = require('express');
const crypto   = require('crypto');
const Razorpay = require('razorpay');

const pool     = require('../db/pool');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// ── Plan catalogue ────────────────────────────────────────────
// Single source of truth for pricing. Update here, nowhere else.
const PLANS = {
  monthly: {
    label:        'OptionsLab Pro – Monthly',
    plan_granted: 'PRO',
    amount_paise: 99900,          // ₹999
    duration_days: 31,
  },
  annual: {
    label:        'OptionsLab Elite – Annual',
    plan_granted: 'ELITE',
    amount_paise: 349900,         // ₹3,499
    duration_days: 365,
  },
};

// ── Razorpay client (lazy — only fails if keys missing at call time) ──
function getRazorpay() {
  const key_id     = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error('Razorpay keys not configured');
  }
  return new Razorpay({ key_id, key_secret });
}

// ── Helpers ───────────────────────────────────────────────────
function planExpiresAt(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function verifySignature(order_id, payment_id, signature) {
  const body   = `${order_id}|${payment_id}`;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');
  return expected === signature;
}

// ─────────────────────────────────────────────────────────────
// POST /api/payments/create-order
// Creates a Razorpay order and records it in the orders table.
// ─────────────────────────────────────────────────────────────
router.post('/create-order', auth, async (req, res) => {
  const { plan_type } = req.body;
  const user_id = req.user.id;

  const plan = PLANS[plan_type];
  if (!plan) {
    return res.status(400).json({ error: `Unknown plan_type: ${plan_type}` });
  }

  let rzp;
  try {
    rzp = getRazorpay();
  } catch {
    return res.status(503).json({ error: 'Payment system not configured' });
  }

  // Fetch user name/email for Razorpay prefill
  let user;
  try {
    const r = await pool.query(
      'SELECT name, mobile, email FROM users WHERE id = $1',
      [user_id]
    );
    user = r.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
  } catch (e) {
    console.error('[payments/create-order] DB error fetching user:', e.message);
    return res.status(500).json({ error: 'Internal error' });
  }

  const receipt = `rcpt_${user_id}_${Date.now()}`;

  // Create order in Razorpay
  let rzpOrder;
  try {
    rzpOrder = await rzp.orders.create({
      amount:   plan.amount_paise,
      currency: 'INR',
      receipt,
      notes: {
        user_id:   String(user_id),
        plan_type,
        user_name: user.name || '',
      },
    });
  } catch (e) {
    console.error('[payments/create-order] Razorpay error:', e.message);
    return res.status(502).json({ error: 'Failed to create payment order' });
  }

  // Persist to orders table
  try {
    await pool.query(
      `INSERT INTO orders
         (user_id, razorpay_order_id, plan_type, plan_label,
          amount_paise, currency, status, receipt, ip_address)
       VALUES ($1,$2,$3,$4,$5,'INR','created',$6,$7)`,
      [
        user_id,
        rzpOrder.id,
        plan_type,
        plan.label,
        plan.amount_paise,
        receipt,
        req.ip || null,
      ]
    );
  } catch (e) {
    console.error('[payments/create-order] DB insert error:', e.message);
    // Don't fail the user — Razorpay order exists, log and continue
  }

  return res.json({
    order_id:    rzpOrder.id,
    amount:      plan.amount_paise,
    currency:    'INR',
    plan_label:  plan.label,
    key_id:      process.env.RAZORPAY_KEY_ID,
    // prefill data for Razorpay checkout
    user_name:   user.name   || '',
    user_email:  user.email  || '',
    user_mobile: user.mobile || '',
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/payments/verify
// Verifies Razorpay signature, writes payment row, upgrades plan.
// ─────────────────────────────────────────────────────────────
router.post('/verify', auth, async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    plan_type,
  } = req.body;

  const user_id = req.user.id;

  // Validate required fields
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan_type) {
    return res.status(400).json({ error: 'Missing payment fields' });
  }

  const plan = PLANS[plan_type];
  if (!plan) {
    return res.status(400).json({ error: `Unknown plan_type: ${plan_type}` });
  }

  // Verify HMAC signature
  const sig_valid = verifySignature(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  );

  if (!sig_valid) {
    console.warn('[payments/verify] Signature mismatch for user', user_id);
    // Still record the failed attempt
    await recordPayment({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      user_id,
      plan_type,
      plan,
      sig_valid: false,
      status:    'failed',
      ip:        req.ip,
    });
    return res.status(400).json({ error: 'Payment verification failed' });
  }

  const expires_at = planExpiresAt(plan.duration_days);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Update order status → paid
    await client.query(
      `UPDATE orders SET status = 'paid', updated_at = NOW()
       WHERE razorpay_order_id = $1`,
      [razorpay_order_id]
    );

    // 2. Fetch order row to get orders.id FK
    const orderRes = await client.query(
      'SELECT id FROM orders WHERE razorpay_order_id = $1',
      [razorpay_order_id]
    );
    const order_db_id = orderRes.rows[0]?.id || null;

    // 3. Insert into payments table
    await client.query(
      `INSERT INTO payments
         (order_id, user_id, razorpay_order_id, razorpay_payment_id,
          razorpay_signature, amount_paise, currency, plan_type, plan_label,
          status, signature_valid, plan_granted, plan_expires_at, source, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,'INR',$7,$8,'captured',$9,$10,$11,'checkout',$12)`,
      [
        order_db_id,
        user_id,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        plan.amount_paise,
        plan_type,
        plan.label,
        true,                    // signature_valid
        plan.plan_granted,
        expires_at,
        req.ip || null,
      ]
    );

    // 4. Upgrade user plan
    await client.query(
      `UPDATE users
       SET plan = $1, plan_expires_at = $2, updated_at = NOW()
       WHERE id = $3`,
      [plan.plan_granted, expires_at, user_id]
    );

    // 5. Insert into subscription_history (existing table — keep backward compat)
    await client.query(
      `INSERT INTO subscription_history
         (user_id, plan, started_at, expires_at, payment_id, amount)
       VALUES ($1,$2,NOW(),$3,$4,$5)
       ON CONFLICT DO NOTHING`,
      [
        user_id,
        plan.plan_granted,
        expires_at,
        razorpay_payment_id,
        plan.amount_paise / 100,
      ]
    ).catch(() => {}); // silently skip if subscription_history schema differs

    await client.query('COMMIT');

    console.log(
      `[payments/verify] ✓ user ${user_id} upgraded to ${plan.plan_granted} via ${razorpay_payment_id}`
    );

    return res.json({
      success:         true,
      plan:            plan.plan_granted,
      plan_expires_at: expires_at,
      payment_id:      razorpay_payment_id,
    });

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[payments/verify] DB error:', e.message);
    return res.status(500).json({ error: 'Plan upgrade failed — contact support' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/payments/webhook
// Handles Razorpay server-to-server events.
// Idempotent — safe to receive the same event multiple times.
// ─────────────────────────────────────────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // If webhook secret is configured, verify it
  if (secret) {
    const sig = req.headers['x-razorpay-signature'];
    const expected = crypto
      .createHmac('sha256', secret)
      .update(req.body)
      .digest('hex');

    if (sig !== expected) {
      console.warn('[payments/webhook] Signature mismatch — rejected');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ error: 'Bad JSON' });
  }

  const eventType = event.event;
  console.log(`[payments/webhook] Received: ${eventType}`);

  try {
    if (eventType === 'payment.captured') {
      const p      = event.payload.payment.entity;
      const notes  = p.notes || {};
      const userId = parseInt(notes.user_id, 10);

      if (!userId) {
        console.warn('[payments/webhook] payment.captured — no user_id in notes');
        return res.json({ ok: true });
      }

      const plan_type = notes.plan_type;
      const plan      = PLANS[plan_type];

      if (plan) {
        // Check if already processed (idempotency)
        const existing = await pool.query(
          'SELECT id FROM payments WHERE razorpay_payment_id = $1',
          [p.id]
        );

        if (existing.rows.length === 0) {
          const expires_at    = planExpiresAt(plan.duration_days);
          const orderRes      = await pool.query(
            'SELECT id FROM orders WHERE razorpay_order_id = $1',
            [p.order_id]
          );
          const order_db_id = orderRes.rows[0]?.id || null;

          await pool.query(
            `INSERT INTO payments
               (order_id, user_id, razorpay_order_id, razorpay_payment_id,
                razorpay_signature, amount_paise, currency, plan_type, plan_label,
                status, signature_valid, plan_granted, plan_expires_at, source)
             VALUES ($1,$2,$3,$4,'',$5,'INR',$6,$7,'captured',true,$8,$9,'webhook')
             ON CONFLICT (razorpay_payment_id) DO NOTHING`,
            [
              order_db_id, userId, p.order_id, p.id,
              p.amount, plan_type, plan.label,
              plan.plan_granted, expires_at,
            ]
          );

          await pool.query(
            `UPDATE users SET plan = $1, plan_expires_at = $2, updated_at = NOW()
             WHERE id = $3`,
            [plan.plan_granted, expires_at, userId]
          );

          await pool.query(
            `UPDATE orders SET status = 'paid', updated_at = NOW()
             WHERE razorpay_order_id = $1`,
            [p.order_id]
          );

          console.log(`[payments/webhook] ✓ user ${userId} upgraded to ${plan.plan_granted}`);
        } else {
          console.log(`[payments/webhook] payment ${p.id} already processed — skipping`);
        }
      }
    }

    if (eventType === 'refund.created') {
      const rf = event.payload.refund.entity;
      const payRes = await pool.query(
        'SELECT id, user_id FROM payments WHERE razorpay_payment_id = $1',
        [rf.payment_id]
      );

      if (payRes.rows.length > 0) {
        const { id: payment_db_id, user_id } = payRes.rows[0];
        await pool.query(
          `INSERT INTO refunds
             (payment_id, user_id, razorpay_refund_id, amount_paise, reason, status, initiated_by)
           VALUES ($1,$2,$3,$4,$5,'processed','webhook')
           ON CONFLICT (razorpay_refund_id) DO NOTHING`,
          [payment_db_id, user_id, rf.id, rf.amount, rf.notes?.reason || null]
        );

        // Downgrade plan on full refund
        if (rf.amount >= payRes.rows[0]?.amount_paise) {
          await pool.query(
            `UPDATE users SET plan = 'FREE', plan_expires_at = NULL, updated_at = NOW()
             WHERE id = $1`,
            [user_id]
          );
          console.log(`[payments/webhook] Refund processed — user ${user_id} downgraded to FREE`);
        }

        // Mark payment as refunded
        await pool.query(
          `UPDATE payments SET status = 'refunded' WHERE razorpay_payment_id = $1`,
          [rf.payment_id]
        );
      }
    }

  } catch (e) {
    console.error('[payments/webhook] Handler error:', e.message);
    // Still return 200 so Razorpay doesn't retry endlessly
  }

  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// GET /api/payments/history
// Returns the logged-in user's own payment history.
// ─────────────────────────────────────────────────────────────
router.get('/history', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         p.id,
         p.created_at       AS paid_at,
         p.plan_label,
         p.plan_type,
         ROUND(p.amount_paise / 100.0, 2) AS amount_inr,
         p.status,
         p.plan_granted,
         p.plan_expires_at,
         p.razorpay_payment_id,
         o.razorpay_order_id
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    return res.json({ payments: rows });
  } catch (e) {
    console.error('[payments/history]', e.message);
    return res.status(500).json({ error: 'Could not fetch payment history' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/payments/receipt/:payment_id
// Returns a single receipt (user can only fetch their own).
// ─────────────────────────────────────────────────────────────
router.get('/receipt/:payment_id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         p.*,
         ROUND(p.amount_paise / 100.0, 2) AS amount_inr,
         u.name   AS user_name,
         u.mobile AS user_mobile,
         u.email  AS user_email,
         o.receipt
       FROM payments p
       JOIN users  u ON u.id = p.user_id
       JOIN orders o ON o.id = p.order_id
       WHERE p.razorpay_payment_id = $1
         AND p.user_id = $2`,
      [req.params.payment_id, req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    return res.json({ receipt: rows[0] });
  } catch (e) {
    console.error('[payments/receipt]', e.message);
    return res.status(500).json({ error: 'Could not fetch receipt' });
  }
});

// ─────────────────────────────────────────────────────────────
// Internal helper — record a payment row (used for failed attempts)
// ─────────────────────────────────────────────────────────────
async function recordPayment({ razorpay_order_id, razorpay_payment_id,
  razorpay_signature, user_id, plan_type, plan, sig_valid, status, ip }) {
  try {
    const orderRes = await pool.query(
      'SELECT id FROM orders WHERE razorpay_order_id = $1',
      [razorpay_order_id]
    );
    const order_db_id = orderRes.rows[0]?.id || null;

    await pool.query(
      `INSERT INTO payments
         (order_id, user_id, razorpay_order_id, razorpay_payment_id,
          razorpay_signature, amount_paise, currency, plan_type, plan_label,
          status, signature_valid, source, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,'INR',$7,$8,$9,$10,'checkout',$11)
       ON CONFLICT (razorpay_payment_id) DO NOTHING`,
      [
        order_db_id, user_id,
        razorpay_order_id, razorpay_payment_id, razorpay_signature,
        plan.amount_paise, plan_type, plan.label,
        status, sig_valid, ip || null,
      ]
    );
  } catch (e) {
    console.error('[payments] recordPayment error:', e.message);
  }
}

module.exports = router;

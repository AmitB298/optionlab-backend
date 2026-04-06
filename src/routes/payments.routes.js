// src/routes/payments.js
// Cashfree Payment Integration for OptionsLab
// Plans: Pro ₹1,499/month | Elite ₹3,499/month

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const pool = require('../db/pool'); // adjust path if needed

// ── ENV vars needed (add to Railway) ────────────────────────────────────────
// CASHFREE_APP_ID     = your production App ID
// CASHFREE_SECRET_KEY = your production Secret Key
// CASHFREE_ENV        = "TEST" | "PROD"
// FRONTEND_URL        = https://optionslab.in
// ────────────────────────────────────────────────────────────────────────────

const CF_APP_ID  = process.env.CASHFREE_APP_ID;
const CF_SECRET  = process.env.CASHFREE_SECRET_KEY;
const CF_ENV     = process.env.CASHFREE_ENV || 'TEST';
const CF_BASE    = CF_ENV === 'PROD'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';

const PLANS = {
  pro:   { amount: 1499, name: 'OptionsLab Pro',   months: 1 },
  elite: { amount: 3499, name: 'OptionsLab Elite',  months: 1 },
};

// ── Middleware: verify JWT (reuse your existing auth middleware) ──────────────
const { authenticateToken } = require('../middleware/auth');

// ── Helper: call Cashfree API ────────────────────────────────────────────────
async function cashfreeRequest(method, path, body = null) {
  const url  = `${CF_BASE}${path}`;
  const opts = {
    method,
    headers: {
      'Content-Type':    'application/json',
      'x-api-version':   '2023-08-01',
      'x-client-id':     CF_APP_ID,
      'x-client-secret': CF_SECRET,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Cashfree API error');
  return data;
}

// ── POST /api/payments/create-order ─────────────────────────────────────────
// Body: { plan: "pro" | "elite" }
// Returns: { payment_session_id, order_id } — frontend uses this to open Cashfree checkout
router.post('/create-order', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });

    const user   = req.user; // set by authMiddleware
    const planInfo = PLANS[plan];
    const orderId  = `OL_${user.id}_${plan}_${Date.now()}`;

    const order = await cashfreeRequest('POST', '/orders', {
      order_id:       orderId,
      order_amount:   planInfo.amount,
      order_currency: 'INR',
      customer_details: {
        customer_id:    String(user.id),
        customer_name:  user.name  || 'User',
        customer_email: user.email || '',
        customer_phone: user.phone || '9999999999',
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL}/payment-status?order_id={order_id}`,
        notify_url: `${process.env.RAILWAY_PUBLIC_DOMAIN || process.env.BACKEND_URL}/api/payments/webhook`,
      },
      order_note: `OptionsLab ${planInfo.name}`,
    });

    // Save pending order in DB
    await pool.query(
      `INSERT INTO payment_orders (order_id, user_id, plan, amount, status, created_at)
       VALUES ($1, $2, $3, $4, 'PENDING', NOW())
       ON CONFLICT (order_id) DO NOTHING`,
      [orderId, user.id, plan, planInfo.amount]
    );

    res.json({
      order_id:           orderId,
      payment_session_id: order.payment_session_id,
      amount:             planInfo.amount,
      plan:               plan,
    });
  } catch (err) {
    console.error('[create-order]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/webhook ───────────────────────────────────────────────
// Cashfree calls this after payment — DO NOT add authMiddleware here
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // ── Verify Cashfree webhook signature ────────────────────────────────────
    const rawBody   = req.body.toString('utf8');
    const timestamp = req.headers['x-webhook-timestamp'];
    const signature = req.headers['x-webhook-signature'];

    const signedData = timestamp + rawBody;
    const expected   = crypto
      .createHmac('sha256', CF_SECRET)
      .update(signedData)
      .digest('base64');

    if (expected !== signature) {
      console.warn('[webhook] Invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody);
    const { type, data } = event;

    console.log('[webhook] Event:', type, data?.order?.order_id);

    // ── Handle successful payment ─────────────────────────────────────────────
    if (type === 'PAYMENT_SUCCESS_WEBHOOK') {
      const orderId = data.order.order_id;
      const cfOrderId = data.payment?.cf_payment_id;

      // Get order from DB
      const { rows } = await pool.query(
        'SELECT * FROM payment_orders WHERE order_id = $1',
        [orderId]
      );
      if (!rows.length) return res.json({ ok: true }); // unknown order

      const order = rows[0];
      if (order.status === 'PAID') return res.json({ ok: true }); // already processed

      // Calculate expiry
      const plan      = PLANS[order.plan];
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + plan.months);

      // Update payment_orders
      await pool.query(
        `UPDATE payment_orders SET status = 'PAID', cf_payment_id = $1, paid_at = NOW() WHERE order_id = $2`,
        [cfOrderId, orderId]
      );

      // Activate user subscription
      await pool.query(
        `UPDATE users
         SET plan = $1, plan_expires_at = $2, updated_at = NOW()
         WHERE id = $3`,
        [order.plan, expiresAt, order.user_id]
      );

      console.log(`[webhook] ✅ User ${order.user_id} upgraded to ${order.plan} until ${expiresAt}`);
    }

    // ── Handle failed payment ─────────────────────────────────────────────────
    if (type === 'PAYMENT_FAILED_WEBHOOK') {
      const orderId = data.order.order_id;
      await pool.query(
        `UPDATE payment_orders SET status = 'FAILED' WHERE order_id = $1`,
        [orderId]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[webhook]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/payments/verify/:orderId ────────────────────────────────────────
// Frontend polls this after redirect to confirm payment status
router.get('/verify/:orderId', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;

    // Check DB first
    const { rows } = await pool.query(
      'SELECT * FROM payment_orders WHERE order_id = $1 AND user_id = $2',
      [orderId, req.user.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Order not found' });

    const order = rows[0];

    // If still pending, check with Cashfree directly
    if (order.status === 'PENDING') {
      const cfOrder = await cashfreeRequest('GET', `/orders/${orderId}`);
      if (cfOrder.order_status === 'PAID') {
        // Webhook may have been delayed — activate manually
        const plan      = PLANS[order.plan];
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + plan.months);

        await pool.query(
          `UPDATE payment_orders SET status = 'PAID', paid_at = NOW() WHERE order_id = $1`,
          [orderId]
        );
        await pool.query(
          `UPDATE users SET plan = $1, plan_expires_at = $2 WHERE id = $3`,
          [order.plan, expiresAt, order.user_id]
        );
        order.status = 'PAID';
      }
    }

    res.json({
      status:  order.status,
      plan:    order.plan,
      amount:  order.amount,
    });
  } catch (err) {
    console.error('[verify]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/payments/status ──────────────────────────────────────────────────
// Returns current user's plan info
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT plan, plan_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const { plan, plan_expires_at } = rows[0];
    const isActive = plan_expires_at && new Date(plan_expires_at) > new Date();

    res.json({
      plan:       isActive ? plan : 'free',
      expires_at: plan_expires_at,
      is_active:  isActive,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

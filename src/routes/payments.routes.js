// src/routes/payments.routes.js
// Cashfree Payment Integration for OptionsLab
// Plans: Pro ₹1,499/month | Elite ₹3,499/month

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const pool    = require('../db/pool');
const { processUpgradeReward } = require('../services/referral.service'); // ← REFERRAL HOOK

const CF_APP_ID  = process.env.CASHFREE_APP_ID;
const CF_SECRET  = process.env.CASHFREE_SECRET_KEY;
const CF_ENV     = process.env.CASHFREE_ENV || 'TEST';
const CF_BASE    = CF_ENV === 'PROD'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';

const DEFAULT_PLANS = {
  trial:   { amount: 199,  name: 'OptionsLab Trial',   days: 7  },
  daily:   { amount: 299,  name: 'OptionsLab Daily',   days: 1  },
  weekly:  { amount: 999,  name: 'OptionsLab Weekly',  days: 7  },
  monthly: { amount: 1499, name: 'OptionsLab Monthly', days: 30 },
};

async function getPlans() {
  try {
    const { rows } = await pool.query(`SELECT plan_key, amount, name, days FROM plan_config WHERE is_active = true`);
    if (!rows.length) return DEFAULT_PLANS;
    const plans = {};
    rows.forEach(r => { plans[r.plan_key] = { amount: Number(r.amount), name: r.name, days: r.days }; });
    return plans;
  } catch (_) { return DEFAULT_PLANS; }
}

async function activatePlan(orderId, cfPayId, order, days) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  const { rowCount } = await pool.query(
    `UPDATE payment_orders SET status='PAID', cf_payment_id=$1, paid_at=NOW()
     WHERE order_id=$2 AND status='PENDING'`,
    [cfPayId, orderId]
  );
  if (rowCount === 0) return false;
  await pool.query(
    `UPDATE users SET plan=$1, plan_expires_at=$2, updated_at=NOW() WHERE id=$3`,
    [order.plan, expiresAt, order.user_id]
  );
  console.log(`[payments] User ${order.user_id} -> ${order.plan} until ${expiresAt.toISOString()}`);
  return true;
}

const { auth: authenticateToken } = require('../middleware/auth');

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
router.post('/create-order', authenticateToken, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });

    const user     = req.user;
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
        notify_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
      },
      order_note: `OptionsLab ${planInfo.name}`,
    });

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
      plan,
    });
  } catch (err) {
    console.error('[create-order]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/webhook ───────────────────────────────────────────────
// Manually collect raw body so HMAC works regardless of Content-Type header
router.post('/webhook', (req, res, next) => {
  let chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks).toString('utf8');
    next();
  });
  req.on('error', next);
}, async (req, res) => {
  try {
    const rawBody   = req.rawBody || '';
    const timestamp = req.headers['x-webhook-timestamp'];
    const signature = req.headers['x-webhook-signature'];

    const expected = crypto
      .createHmac('sha256', CF_SECRET)
      .update(timestamp + rawBody)
      .digest('base64');

    if (expected !== signature) {
      console.warn('[webhook] Invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody);
    const { type, data } = event;
    console.log('[webhook] Event:', type, data?.order?.order_id);

    if (type === 'PAYMENT_SUCCESS_WEBHOOK') {
      const orderId   = data.order.order_id;
      const cfPayId   = data.payment?.cf_payment_id;

      const { rows } = await pool.query(
        'SELECT * FROM payment_orders WHERE order_id = $1', [orderId]
      );
      if (!rows.length) return res.json({ ok: true });
      const order = rows[0];
      const plans = await getPlans();
      const days  = plans[order.plan]?.days ?? 30;
      const activated = await activatePlan(orderId, cfPayId, order, days);
      if (!activated) { console.log(`[webhook] Duplicate skipped: ${orderId}`); return res.json({ ok: true }); }

      // ── REFERRAL HOOK ───────────────────────────────────────────────────
      // Check if this is renewal (user already had this plan before) or fresh upgrade
      const { rows: prevOrders } = await pool.query(
        `SELECT id FROM payment_orders
         WHERE user_id = $1 AND plan = $2 AND status = 'PAID' AND order_id != $3`,
        [order.user_id, order.plan, orderId]
      );
      const isRenewal = prevOrders.length > 0;
      processUpgradeReward(order.user_id, orderId, isRenewal).catch(console.error);
      // ───────────────────────────────────────────────────────────────────
    }

    if (type === 'PAYMENT_FAILED_WEBHOOK') {
      await pool.query(
        `UPDATE payment_orders SET status='FAILED' WHERE order_id=$1`,
        [data.order.order_id]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[webhook]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/payments/verify/:orderId ────────────────────────────────────────
router.get('/verify/:orderId', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM payment_orders WHERE order_id=$1 AND user_id=$2',
      [orderId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });

    const order = rows[0];

    if (order.status === 'PENDING') {
      const cfOrder = await cashfreeRequest('GET', `/orders/${orderId}`);
      if (cfOrder.order_status === 'PAID') {
        // Fetch cf_payment_id from payments list
        let cfPayId = null;
        try {
          const cfPayments = await cashfreeRequest('GET', `/orders/${orderId}/payments`);
          // cfPayments is an array of payment objects
          const paid = Array.isArray(cfPayments)
            ? cfPayments.find(p => p.payment_status === 'SUCCESS')
            : null;
          cfPayId = paid?.cf_payment_id || null;
        } catch (e) {
          console.warn('[verify] Could not fetch cf_payment_id:', e.message);
        }

        const vPlans = await getPlans();
        const vDays  = vPlans[order.plan]?.days ?? 30;
        const vActivated = await activatePlan(orderId, cfPayId, order, vDays);
        if (!vActivated) { order.status = 'PAID'; return res.json({ status: 'PAID', plan: order.plan, amount: order.amount }); }

        // Referral hook
        const { rows: prevOrders } = await pool.query(
          `SELECT id FROM payment_orders WHERE user_id=$1 AND plan=$2 AND status='PAID' AND order_id!=$3`,
          [order.user_id, order.plan, orderId]
        );
        const isRenewal = prevOrders.length > 0;
        processUpgradeReward(order.user_id, orderId, isRenewal).catch(console.error);

        order.status = 'PAID';
      }
    }

    res.json({ status: order.status, plan: order.plan, amount: order.amount });
  } catch (err) {
    console.error('[verify]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/payments/status ──────────────────────────────────────────────────
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT plan, plan_expires_at FROM users WHERE id=$1', [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const { plan, plan_expires_at } = rows[0];
    const isActive = plan_expires_at && new Date(plan_expires_at) > new Date();

    res.json({ plan: isActive ? plan : 'free', expires_at: plan_expires_at, is_active: isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/payments/plans ──────────────────────────────────────────────────
router.get('/plans', async (req, res) => {
  try {
    const plans = await getPlans();
    res.json({ plans });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

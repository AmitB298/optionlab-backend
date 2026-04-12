-- =============================================================
-- Migration 003: payments + orders tables
-- Safe to run multiple times (IF NOT EXISTS throughout)
-- Author: OptionsLab
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. ORDERS
--    One row per Razorpay order created (before payment)
--    Status lifecycle: created → attempted → paid | failed | expired
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                  SERIAL        PRIMARY KEY,
  user_id             INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Razorpay identifiers
  razorpay_order_id   VARCHAR(64)   NOT NULL UNIQUE,

  -- What the user is buying
  plan_type           VARCHAR(20)   NOT NULL,          -- 'monthly' | 'annual'
  plan_label          VARCHAR(100),                    -- 'OptionsLab Pro – Monthly'
  amount_paise        INTEGER       NOT NULL,          -- amount in paise (₹999 → 99900)
  currency            CHAR(3)       NOT NULL DEFAULT 'INR',

  -- Lifecycle
  status              VARCHAR(20)   NOT NULL DEFAULT 'created',
  --  created   → order generated, user hasn't opened checkout yet
  --  attempted → user opened Razorpay popup
  --  paid      → payment captured (set by verify endpoint)
  --  failed    → payment explicitly failed
  --  expired   → never paid, cleaned up by cron

  -- Metadata
  receipt             VARCHAR(64),                     -- e.g. 'rcpt_<userId>_<ts>'
  notes               JSONB         DEFAULT '{}',
  ip_address          VARCHAR(45),
  user_agent          TEXT,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id
  ON orders(user_id);

CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id
  ON orders(razorpay_order_id);

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders(status);

-- ─────────────────────────────────────────────────────────────
-- 2. PAYMENTS
--    One row per successful (or failed) Razorpay payment event
--    Always linked to an order
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                    SERIAL        PRIMARY KEY,
  order_id              INTEGER       NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id               INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Razorpay identifiers (from verify payload)
  razorpay_order_id     VARCHAR(64)   NOT NULL,
  razorpay_payment_id   VARCHAR(64)   NOT NULL UNIQUE,
  razorpay_signature    TEXT          NOT NULL,

  -- Amounts
  amount_paise          INTEGER       NOT NULL,
  currency              CHAR(3)       NOT NULL DEFAULT 'INR',

  -- Plan being purchased
  plan_type             VARCHAR(20)   NOT NULL,         -- 'monthly' | 'annual'
  plan_label            VARCHAR(100),

  -- Outcome
  status                VARCHAR(20)   NOT NULL DEFAULT 'captured',
  --  captured  → payment verified and plan upgraded
  --  refunded  → full refund issued
  --  disputed  → chargeback raised

  -- Signature verification
  signature_valid       BOOLEAN       NOT NULL DEFAULT FALSE,

  -- Plan grant result (set after users table is updated)
  plan_granted          VARCHAR(50),                    -- 'PRO' | 'ELITE'
  plan_expires_at       TIMESTAMPTZ,

  -- Webhook / source
  source                VARCHAR(20)   DEFAULT 'checkout',  -- 'checkout' | 'webhook'

  -- Audit
  ip_address            VARCHAR(45),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id
  ON payments(user_id);

CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id
  ON payments(razorpay_order_id);

CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_id
  ON payments(razorpay_payment_id);

CREATE INDEX IF NOT EXISTS idx_payments_status
  ON payments(status);

-- ─────────────────────────────────────────────────────────────
-- 3. REFUNDS  (stub table — ready when you need it)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refunds (
  id                    SERIAL        PRIMARY KEY,
  payment_id            INTEGER       NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  user_id               INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  razorpay_refund_id    VARCHAR(64)   NOT NULL UNIQUE,
  amount_paise          INTEGER       NOT NULL,
  reason                TEXT,
  status                VARCHAR(20)   NOT NULL DEFAULT 'processed',
  initiated_by          VARCHAR(20)   DEFAULT 'admin',   -- 'admin' | 'webhook'

  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_payment_id
  ON refunds(payment_id);

-- ─────────────────────────────────────────────────────────────
-- 4. Auto-update orders.updated_at on any row change
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_orders_updated_at ON orders;
CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5. Admin view: full payment ledger (convenience query)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW payment_ledger AS
  SELECT
    p.id                    AS payment_id,
    p.created_at            AS paid_at,
    u.id                    AS user_id,
    u.name                  AS user_name,
    u.mobile                AS user_mobile,
    p.plan_type,
    p.plan_label,
    ROUND(p.amount_paise / 100.0, 2) AS amount_inr,
    p.status                AS payment_status,
    p.plan_granted,
    p.plan_expires_at,
    p.razorpay_payment_id,
    o.razorpay_order_id,
    p.source
  FROM payments p
  JOIN users    u ON u.id = p.user_id
  JOIN orders   o ON o.id = p.order_id
  ORDER BY p.created_at DESC;

-- done

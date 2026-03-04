-- ============================================================
-- Migration 013: 充值订单表
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_orders (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID NOT NULL,
  stripe_session_id     TEXT UNIQUE,
  stripe_payment_intent TEXT,
  credits_amount        INT NOT NULL,
  price_cents           INT NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'aud',
  status                TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | failed
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at               TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_credit_orders_user   ON credit_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_orders_session ON credit_orders (stripe_session_id);

ALTER TABLE credit_orders DISABLE ROW LEVEL SECURITY;

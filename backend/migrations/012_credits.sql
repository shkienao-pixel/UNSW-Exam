-- ============================================================
-- Migration 012: 积分系统
-- user_credits: 用户余额（快速读取）
-- credit_transactions: 不可删除的流水账
-- ============================================================

-- 用户余额表
CREATE TABLE IF NOT EXISTS user_credits (
  user_id    UUID PRIMARY KEY,
  balance    INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 积分流水表
CREATE TABLE IF NOT EXISTS credit_transactions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL,
  amount     INT NOT NULL,            -- 正=赚，负=花
  type       TEXT NOT NULL,           -- earn_type 或 spend_type
  ref_id     TEXT,                    -- 关联 artifact_id / output_id 等
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_credit_txn_user   ON credit_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_txn_type   ON credit_transactions (type);

-- 禁止 RLS（与其他表一致）
ALTER TABLE user_credits        DISABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions DISABLE ROW LEVEL SECURITY;

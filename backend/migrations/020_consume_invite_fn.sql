-- Migration 020: 原子消费邀请码的 PostgreSQL 函数
-- 用 FOR UPDATE 行锁保证并发安全，返回 bool 表示是否消费成功
-- Run in Supabase SQL Editor

CREATE OR REPLACE FUNCTION consume_invite(p_id uuid, p_current_use_count int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE invites
  SET use_count = use_count + 1
  WHERE id = p_id
    AND use_count = p_current_use_count   -- 乐观锁
    AND use_count < max_uses;             -- 不超上限
  RETURN FOUND;
END;
$$;

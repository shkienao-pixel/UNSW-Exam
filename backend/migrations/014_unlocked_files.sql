-- Migration 014: user_unlocked_files
-- 记录用户花积分解锁的 past_exam / assignment 文件访问权限
-- 在 Supabase Dashboard SQL Editor 中执行

CREATE TABLE IF NOT EXISTS user_unlocked_files (
  id          bigserial PRIMARY KEY,
  user_id     uuid        NOT NULL,
  artifact_id bigint      NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, artifact_id)
);

CREATE INDEX IF NOT EXISTS idx_unlocked_files_user   ON user_unlocked_files (user_id);
CREATE INDEX IF NOT EXISTS idx_unlocked_files_artifact ON user_unlocked_files (artifact_id);

-- Migration 015: Async generation job queue
-- 异步生成任务队列表 — 用于非阻塞 AI 生成（summary/quiz/outline/flashcards）
-- 执行方式：Supabase SQL Editor 手动粘贴运行

CREATE TABLE IF NOT EXISTS generation_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  course_id   UUID NOT NULL,
  job_type    TEXT NOT NULL,        -- 'summary' | 'quiz' | 'outline' | 'flashcards'
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | done | failed
  output_id   BIGINT REFERENCES outputs(id) ON DELETE SET NULL,
  error_msg   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gen_jobs_user     ON generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_gen_jobs_status   ON generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_gen_jobs_created  ON generation_jobs(created_at DESC);

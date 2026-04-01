-- Migration 020: Classroom jobs table
-- 互动课堂生成任务表 — 对接 OpenMAIC 课堂生成 API
-- 执行方式：Supabase SQL Editor 手动粘贴运行

CREATE TABLE IF NOT EXISTS classroom_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  course_id        UUID NOT NULL,
  mode             TEXT NOT NULL DEFAULT 'course_material',
  -- 'course_material' | 'exam_analysis'
  topic_focus      TEXT NOT NULL,
  artifact_ids     BIGINT[] NOT NULL DEFAULT '{}',
  openmaic_job_id  TEXT,                 -- OpenMAIC 返回的 jobId
  classroom_url    TEXT,                 -- 生成完成后的课堂 URL
  status           TEXT NOT NULL DEFAULT 'pending',
  -- pending | running | succeeded | failed
  progress         INT NOT NULL DEFAULT 0,
  step             TEXT,                 -- OpenMAIC 内部步骤描述
  error_msg        TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classroom_jobs_user    ON classroom_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_classroom_jobs_course  ON classroom_jobs(course_id);
CREATE INDEX IF NOT EXISTS idx_classroom_jobs_status  ON classroom_jobs(status);
CREATE INDEX IF NOT EXISTS idx_classroom_jobs_created ON classroom_jobs(created_at DESC);

-- RLS: 用户只能看到自己的任务
ALTER TABLE classroom_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "classroom_jobs_owner" ON classroom_jobs
  FOR ALL USING (auth.uid() = user_id);

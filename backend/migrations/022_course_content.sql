-- 022_course_content.sql

-- 1. artifacts 加 week 字段
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS week INTEGER CHECK (week BETWEEN 1 AND 10);

-- 2. 课程级共享内容表
CREATE TABLE IF NOT EXISTS course_content (
  id           SERIAL PRIMARY KEY,
  course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('summary', 'outline')),
  content_json JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'published', 'hidden')),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, content_type)
);

-- 3. 用户解锁记录表
CREATE TABLE IF NOT EXISTS user_content_unlocks (
  id            SERIAL PRIMARY KEY,
  user_id       UUID NOT NULL,
  course_id     UUID NOT NULL,
  content_type  TEXT NOT NULL CHECK (content_type IN ('summary', 'outline')),
  unlocked_at   TIMESTAMPTZ DEFAULT now(),
  credits_spent INTEGER NOT NULL,
  UNIQUE(user_id, course_id, content_type)
);

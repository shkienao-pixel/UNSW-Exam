-- Block-based rich text notes (BlockNote editor content)
CREATE TABLE IF NOT EXISTS block_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  course_id   text,
  content     jsonb       NOT NULL DEFAULT '[]',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- One global note per user (course_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS block_notes_user_global_idx
  ON block_notes (user_id) WHERE course_id IS NULL;

-- One note per user per course
CREATE UNIQUE INDEX IF NOT EXISTS block_notes_user_course_idx
  ON block_notes (user_id, course_id) WHERE course_id IS NOT NULL;

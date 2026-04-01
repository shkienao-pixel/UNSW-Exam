-- 互动课堂表
CREATE TABLE IF NOT EXISTS classrooms (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     uuid        NOT NULL,
  course_id   uuid        NOT NULL,
  title       text        NOT NULL DEFAULT '互动课堂',
  scenes      jsonb       NOT NULL DEFAULT '[]',
  artifact_ids integer[]  DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classrooms_user_course_idx
  ON classrooms (user_id, course_id, created_at DESC);

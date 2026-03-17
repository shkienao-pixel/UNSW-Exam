-- 032: 用户笔记表（存储截图和可选文字标注）
-- 笔记与题目无关，是用户自由上传的学习截图

CREATE TABLE IF NOT EXISTS user_notes (
  id         BIGSERIAL    PRIMARY KEY,
  user_id    UUID         NOT NULL,
  course_id  UUID         REFERENCES courses(id) ON DELETE SET NULL,
  image_url  TEXT         NOT NULL,
  storage_path TEXT       NOT NULL,
  caption    TEXT         NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notes_user   ON user_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notes_course ON user_notes(user_id, course_id);

COMMENT ON TABLE user_notes IS '用户学习笔记（截图 + 可选标注）';

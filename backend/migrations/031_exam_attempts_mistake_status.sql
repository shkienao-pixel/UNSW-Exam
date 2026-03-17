-- 031: 给 exam_attempts 添加错题本状态字段
-- mistake_status: NULL=不在错题集, active=待复习, mastered=已掌握
-- 答错时由 grade_answers() 自动设置为 active，用户手动标记已掌握

ALTER TABLE exam_attempts
  ADD COLUMN IF NOT EXISTS mistake_status TEXT
    CHECK (mistake_status IN ('active', 'mastered')) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mastered_at TIMESTAMPTZ DEFAULT NULL;

-- 为错题列表查询创建索引（只索引有状态的行）
CREATE INDEX IF NOT EXISTS idx_exam_attempts_mistake
  ON exam_attempts(user_id, course_id, mistake_status)
  WHERE mistake_status IS NOT NULL;

COMMENT ON COLUMN exam_attempts.mistake_status IS 'NULL=不在错题集; active=待复习; mastered=已掌握';
COMMENT ON COLUMN exam_attempts.mastered_at IS '标记为已掌握的时间';

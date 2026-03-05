-- 016_exam_date.sql
-- Add exam_date field to courses table (set by admin, shown as countdown to users)

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS exam_date TIMESTAMPTZ NULL;

COMMENT ON COLUMN courses.exam_date IS '管理员设置的考试日期，用于前端倒计时显示';

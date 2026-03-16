-- Migration 027: 给 exam_questions 加 page_image_url 列
-- 存储该题所在页面的截图 URL（仅当页面含图表/公式时才有值）
-- 执行方式：Supabase SQL Editor 手动粘贴运行

ALTER TABLE exam_questions
  ADD COLUMN IF NOT EXISTS page_image_url TEXT;

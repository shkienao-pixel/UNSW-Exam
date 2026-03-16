-- 029: track whether a question has a visual element (diagram/figure/table)
-- has_visual=true but page_image_url=null means the crop failed — frontend shows a warning

ALTER TABLE exam_questions
  ADD COLUMN IF NOT EXISTS has_visual BOOLEAN DEFAULT FALSE;

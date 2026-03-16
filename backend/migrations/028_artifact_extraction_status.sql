-- 028: add extraction_status to artifacts table
-- Values: NULL = not started, 'extracting' = in progress, 'done' = completed, 'failed' = no questions extracted

ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS extraction_status TEXT;

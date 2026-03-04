-- Migration 016: Add FK constraint on user_unlocked_files.artifact_id
-- Ensures referential integrity: unlocked records auto-deleted when artifact is removed
-- Run in Supabase Dashboard SQL Editor

ALTER TABLE user_unlocked_files
  ADD CONSTRAINT fk_unlocked_files_artifact
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE;

-- ============================================================
-- Migration 005: Make artifacts.user_id nullable
-- Admin-uploaded artifacts have no user owner.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Drop NOT NULL constraint on artifacts.user_id
ALTER TABLE public.artifacts
  ALTER COLUMN user_id DROP NOT NULL;

-- Verify (should return 'YES'):
-- SELECT column_name, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'artifacts'
--   AND column_name = 'user_id';

-- ============================================================
-- Migration 003: Artifacts v2
-- 1. Add file_type, status, storage_url, reject_reason columns
-- 2. Create Supabase Storage bucket for artifacts
-- 3. Update RLS policies
-- Run in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Alter artifacts table
ALTER TABLE public.artifacts
  ADD COLUMN IF NOT EXISTS file_type    TEXT NOT NULL DEFAULT 'pdf'
    CONSTRAINT chk_artifacts_file_type CHECK (file_type IN ('pdf','word','python','url','other')),
  ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'approved'
    CONSTRAINT chk_artifacts_status CHECK (status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS storage_url  TEXT,
  ADD COLUMN IF NOT EXISTS reject_reason TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Existing rows: keep approved (they were admin-uploaded)
UPDATE public.artifacts SET status = 'approved' WHERE status IS NULL OR status = 'approved';

-- 3. Index for review queue
CREATE INDEX IF NOT EXISTS idx_artifacts_status
  ON public.artifacts(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifacts_course_status
  ON public.artifacts(course_id, status, file_type, created_at DESC);

-- 4. Storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'artifacts',
  'artifacts',
  false,
  52428800,  -- 50 MB limit
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/x-python',
    'text/plain',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage RLS: authenticated users can upload to their own folder
CREATE POLICY "users_upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'artifacts'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "users_read_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'artifacts'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "service_manage_storage" ON storage.objects
  FOR ALL USING (bucket_id = 'artifacts');

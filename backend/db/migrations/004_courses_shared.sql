-- ============================================================
-- Migration 004: Courses become shared / admin-managed
-- Users can browse all courses but cannot create them.
-- Only the admin panel creates/deletes courses.
-- ============================================================

-- 1. Make user_id nullable on courses (admin-created courses have no owner)
ALTER TABLE public.courses
  ALTER COLUMN user_id DROP NOT NULL;

-- 2. Drop the old unique constraint (user_id, code) — course codes are now globally unique
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS uq_courses_user_code;

ALTER TABLE public.courses
  ADD CONSTRAINT uq_courses_code UNIQUE (code);

-- 3. Add created_by to track who (admin) created it
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. Update RLS: all authenticated users can SELECT courses
DROP POLICY IF EXISTS "users_own_courses" ON public.courses;

CREATE POLICY "anyone_can_read_courses" ON public.courses
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only service_role (admin) can insert/update/delete
CREATE POLICY "service_manage_courses" ON public.courses
  FOR ALL USING (true);

-- 5. Artifacts: approved artifacts are visible to all authenticated users in that course
DROP POLICY IF EXISTS "users_own_artifacts" ON public.artifacts;

-- Read: approved artifacts visible to all authenticated users;
--        pending/rejected visible only to uploader
CREATE POLICY "read_approved_artifacts" ON public.artifacts
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (
      status = 'approved'
      OR auth.uid() = user_id
      OR auth.uid() = uploaded_by
    )
  );

-- Write: users can insert their own artifacts
CREATE POLICY "users_insert_own_artifacts" ON public.artifacts
  FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() = uploaded_by);

-- Delete: users can delete their own; service_role can delete any
CREATE POLICY "users_delete_own_artifacts" ON public.artifacts
  FOR DELETE USING (auth.uid() = user_id);

-- Update: only service_role (for approval/rejection)
CREATE POLICY "service_update_artifacts" ON public.artifacts
  FOR UPDATE USING (true);

-- 6. Update index for global course listing
CREATE INDEX IF NOT EXISTS idx_courses_code ON public.courses(code);

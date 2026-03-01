-- ============================================================
-- Migration 006: artifact_chunks — cleaned & chunked content
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

CREATE TABLE IF NOT EXISTS public.artifact_chunks (
    id          BIGSERIAL   PRIMARY KEY,
    artifact_id BIGINT      NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
    course_id   UUID        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    chunk_index INTEGER     NOT NULL,
    content     TEXT        NOT NULL,
    char_count  INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chunks_artifact ON public.artifact_chunks(artifact_id);
CREATE INDEX IF NOT EXISTS idx_chunks_course   ON public.artifact_chunks(course_id);
CREATE INDEX IF NOT EXISTS idx_chunks_course_idx ON public.artifact_chunks(course_id, chunk_index);

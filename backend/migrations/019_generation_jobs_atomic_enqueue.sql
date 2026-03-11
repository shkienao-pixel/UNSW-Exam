-- Migration 019: atomic enqueue with per-user inflight limit
-- Safe to run multiple times.

-- Atomically enqueue a generation job if the user hasn't exceeded inflight limit.
-- Returns one row:
--   job_id UUID | accepted BOOLEAN | inflight_count INTEGER
CREATE OR REPLACE FUNCTION enqueue_generation_job(
  p_user_id UUID,
  p_course_id UUID,
  p_job_type TEXT,
  p_request_payload JSONB,
  p_max_inflight INTEGER
)
RETURNS TABLE(job_id UUID, accepted BOOLEAN, inflight_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inflight INTEGER;
  v_job_id UUID;
BEGIN
  -- Serialize enqueue attempts per user within this transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT COUNT(*)
    INTO v_inflight
    FROM generation_jobs
   WHERE user_id = p_user_id
     AND status IN ('pending', 'processing');

  IF v_inflight >= GREATEST(p_max_inflight, 0) THEN
    RETURN QUERY
    SELECT NULL::UUID, FALSE, v_inflight;
    RETURN;
  END IF;

  INSERT INTO generation_jobs (
    user_id,
    course_id,
    job_type,
    status,
    request_payload
  ) VALUES (
    p_user_id,
    p_course_id,
    p_job_type,
    'pending',
    COALESCE(p_request_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_job_id;

  RETURN QUERY
  SELECT v_job_id, TRUE, v_inflight + 1;
END;
$$;


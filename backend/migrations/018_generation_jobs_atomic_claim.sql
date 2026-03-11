-- Migration 018: atomic generation job claim function for multi-worker safety
-- Safe to run multiple times.

-- Better index for pending-queue scan + ordering.
CREATE INDEX IF NOT EXISTS idx_gen_jobs_status_created
  ON generation_jobs (status, created_at);

-- Atomically claim the oldest pending generation job.
-- Uses row-level lock + SKIP LOCKED so concurrent workers won't grab the same row.
CREATE OR REPLACE FUNCTION claim_next_generation_job()
RETURNS SETOF generation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job generation_jobs%ROWTYPE;
BEGIN
  SELECT *
    INTO v_job
    FROM generation_jobs
   WHERE status = 'pending'
   ORDER BY created_at ASC
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE generation_jobs
     SET status = 'processing',
         updated_at = now()
   WHERE id = v_job.id
   RETURNING * INTO v_job;

  RETURN NEXT v_job;
END;
$$;


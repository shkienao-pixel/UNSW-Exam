-- Migration 017: persist generation request payload for async worker execution
-- Safe to run multiple times.

ALTER TABLE generation_jobs
  ADD COLUMN IF NOT EXISTS request_payload JSONB NOT NULL DEFAULT '{}'::jsonb;


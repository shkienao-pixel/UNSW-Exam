-- Migration 007: Invite-only registration system
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS invites (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text        UNIQUE NOT NULL,
  note       text,                          -- e.g. "for John's friend group"
  max_uses   int         NOT NULL DEFAULT 1,
  use_count  int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz                    -- NULL = never expires
);

-- No user-level access; admin uses service role key directly
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_users" ON invites FOR ALL USING (false);

-- Index for fast code lookups
CREATE INDEX IF NOT EXISTS invites_code_idx ON invites (code);

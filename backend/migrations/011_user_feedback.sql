-- Migration 011: User Feedback System
-- Collects in-app feedback with page context for rapid bug triage.

CREATE TABLE IF NOT EXISTS user_feedback (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    content     TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
    page_url    TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'in_progress', 'resolved')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast queries: admin list sorted by time; status filter
CREATE INDEX IF NOT EXISTS user_feedback_created_idx  ON user_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS user_feedback_status_idx   ON user_feedback (status, created_at DESC);

COMMENT ON TABLE user_feedback IS
    'In-app user feedback with page_url context for bug triage and feature requests.';
COMMENT ON COLUMN user_feedback.page_url IS
    'window.location.pathname at time of submission — identifies which page triggered the feedback.';
COMMENT ON COLUMN user_feedback.status IS
    'pending → in_progress → resolved (admin-managed workflow)';

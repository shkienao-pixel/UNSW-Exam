-- Migration 009: Review Plan Tables
-- Stores per-user exam review settings and per-node progress.
-- RLS is disabled (project-wide pattern); application layer filters by user_id.

-- ── Review settings: one row per user+course ──────────────────────────────────
CREATE TABLE IF NOT EXISTS course_review_settings (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL,
    course_id        TEXT        NOT NULL,
    review_start_at  TIMESTAMPTZ,
    exam_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS review_settings_user_course_idx
    ON course_review_settings (user_id, course_id);

-- ── Review node progress: one row per user+course+node ────────────────────────
CREATE TABLE IF NOT EXISTS course_review_nodes (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL,
    course_id         TEXT        NOT NULL,
    node_id           TEXT        NOT NULL,       -- stable slug derived from outline heading
    done              BOOLEAN     NOT NULL DEFAULT FALSE,
    priority          TEXT        CHECK (priority IN ('high', 'medium', 'low')),
    estimate_minutes  INT,
    status            TEXT        NOT NULL DEFAULT 'not_started'
                          CHECK (status IN ('not_started', 'learned', 'review_due', 'mastered')),
    last_reviewed_at  TIMESTAMPTZ,
    next_review_at    TIMESTAMPTZ,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, course_id, node_id)
);

CREATE INDEX IF NOT EXISTS review_nodes_user_course_idx
    ON course_review_nodes (user_id, course_id);

CREATE INDEX IF NOT EXISTS review_nodes_due_idx
    ON course_review_nodes (user_id, course_id, next_review_at)
    WHERE status = 'review_due';

COMMENT ON TABLE course_review_settings IS
    'Exam date and review window per user/course.';
COMMENT ON TABLE course_review_nodes IS
    'Per-node done/priority/spaced-repetition state per user/course.';

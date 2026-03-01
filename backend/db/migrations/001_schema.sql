-- ============================================================
-- UNSW Exam Master: Supabase PostgreSQL Schema v1
-- Paste into: Supabase Dashboard > SQL Editor > New query
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- courses
-- ============================================================
CREATE TABLE IF NOT EXISTS public.courses (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code        TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_courses_user_code UNIQUE (user_id, code)
);

-- ============================================================
-- artifacts (PDF files — local disk Phase 1, Supabase Storage Phase 2)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.artifacts (
    id          BIGSERIAL   PRIMARY KEY,
    course_id   UUID        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name   TEXT        NOT NULL,
    file_hash   TEXT        NOT NULL,
    file_path   TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_artifacts_course_hash UNIQUE (course_id, file_hash)
);

-- ============================================================
-- scope_sets
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scope_sets (
    id          BIGSERIAL   PRIMARY KEY,
    course_id   UUID        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    is_default  BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_scope_sets_course_name UNIQUE (course_id, name)
);

-- ============================================================
-- scope_set_items
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scope_set_items (
    scope_set_id BIGINT NOT NULL REFERENCES public.scope_sets(id) ON DELETE CASCADE,
    artifact_id  BIGINT NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scope_set_id, artifact_id)
);

-- ============================================================
-- outputs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.outputs (
    id                  BIGSERIAL   PRIMARY KEY,
    course_id           UUID        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    output_type         TEXT        NOT NULL,
    scope_set_id        BIGINT      REFERENCES public.scope_sets(id) ON DELETE SET NULL,
    scope_artifact_ids  JSONB       NOT NULL DEFAULT '[]',
    scope               TEXT        NOT NULL DEFAULT 'course',
    model_used          TEXT        NOT NULL DEFAULT 'gpt-4o',
    status              TEXT        NOT NULL DEFAULT 'success',
    content             TEXT,
    path                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_outputs_type CHECK (
        output_type IN ('summary','graph','outline','quiz','flashcards')
    )
);

-- ============================================================
-- decks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.decks (
    id          BIGSERIAL   PRIMARY KEY,
    course_id   UUID        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    deck_type   TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_decks_type CHECK (deck_type IN ('vocab', 'mcq'))
);

-- ============================================================
-- cards
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cards (
    id          BIGSERIAL   PRIMARY KEY,
    deck_id     BIGINT      NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
    course_id   UUID        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_type   TEXT        NOT NULL,
    front       TEXT,
    back        TEXT,
    question    TEXT,
    options     JSONB,
    answer      TEXT,
    explanation TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_cards_type CHECK (card_type IN ('vocab', 'mcq'))
);

-- ============================================================
-- flashcards (RAG-driven smart flashcards)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.flashcards (
    id          TEXT        PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    course_id   UUID        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    deck_id     TEXT        NOT NULL,
    card_type   TEXT        NOT NULL,
    scope       JSONB       NOT NULL DEFAULT '{}',
    front       JSONB       NOT NULL DEFAULT '{}',
    back        JSONB       NOT NULL DEFAULT '{}',
    stats       JSONB       NOT NULL DEFAULT '{}',
    source_refs JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_flashcards_type CHECK (card_type IN ('mcq', 'knowledge'))
);

-- ============================================================
-- mistakes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mistakes (
    id              BIGSERIAL   PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    flashcard_id    TEXT        NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
    status          TEXT        NOT NULL DEFAULT 'active',
    added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    wrong_count     INTEGER     NOT NULL DEFAULT 1,
    last_wrong_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_mistakes_user_flashcard UNIQUE (user_id, flashcard_id),
    CONSTRAINT chk_mistakes_status CHECK (status IN ('active','mastered','archived'))
);

-- ============================================================
-- operation_metrics
-- ============================================================
CREATE TABLE IF NOT EXISTS public.operation_metrics (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    operation   TEXT        NOT NULL,
    course_id   UUID        REFERENCES public.courses(id) ON DELETE SET NULL,
    elapsed_s   REAL        NOT NULL,
    meta        JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- user_rate_limits (per-user daily quota tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_rate_limits (
    user_id              UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    llm_requests_today   INTEGER NOT NULL DEFAULT 0,
    index_requests_today INTEGER NOT NULL DEFAULT 0,
    window_date          DATE    NOT NULL DEFAULT CURRENT_DATE,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

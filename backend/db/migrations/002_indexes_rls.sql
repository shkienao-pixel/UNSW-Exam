-- ============================================================
-- UNSW Exam Master: Indexes + RLS Policies
-- Run AFTER 001_schema.sql
-- ============================================================

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_courses_user ON public.courses(user_id, code);

CREATE INDEX IF NOT EXISTS idx_artifacts_course_created
    ON public.artifacts(course_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_user
    ON public.artifacts(user_id);

CREATE INDEX IF NOT EXISTS idx_scope_sets_course_default
    ON public.scope_sets(course_id, is_default, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_scope_set_items_scope
    ON public.scope_set_items(scope_set_id, artifact_id);

CREATE INDEX IF NOT EXISTS idx_outputs_course_type_created
    ON public.outputs(course_id, output_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outputs_user
    ON public.outputs(user_id);

CREATE INDEX IF NOT EXISTS idx_decks_course_type
    ON public.decks(course_id, deck_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_deck
    ON public.cards(deck_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_flashcards_user_course_deck
    ON public.flashcards(user_id, course_id, deck_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flashcards_card_type
    ON public.flashcards(card_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mistakes_user_status
    ON public.mistakes(user_id, status, wrong_count DESC, last_wrong_at DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_operation_created
    ON public.operation_metrics(operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_user_created
    ON public.operation_metrics(user_id, created_at DESC);

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE public.courses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_sets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_set_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outputs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mistakes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_rate_limits  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- NOTE: FastAPI uses SERVICE_ROLE_KEY which bypasses RLS.
-- These policies protect direct Supabase client access (future Next.js frontend).
-- ============================================================

CREATE POLICY "users_own_courses" ON public.courses
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_artifacts" ON public.artifacts
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_scope_sets" ON public.scope_sets
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_scope_set_items" ON public.scope_set_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.scope_sets ss
            WHERE ss.id = scope_set_id AND ss.user_id = auth.uid()
        )
    );

CREATE POLICY "users_own_outputs" ON public.outputs
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_decks" ON public.decks
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_cards" ON public.cards
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_flashcards" ON public.flashcards
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_mistakes" ON public.mistakes
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Metrics: users read own; service_role inserts all
CREATE POLICY "users_read_own_metrics" ON public.operation_metrics
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "service_insert_metrics" ON public.operation_metrics
    FOR INSERT WITH CHECK (true);

-- Rate limits: users read own; service_role manages
CREATE POLICY "users_read_own_rate_limits" ON public.user_rate_limits
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "service_manage_rate_limits" ON public.user_rate_limits
    FOR ALL USING (true);

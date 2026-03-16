-- Migration 026: Exam Questions, Attempts, Favorites
-- 真题提取结果、模拟题生成、做题记录、收藏
-- 执行方式：Supabase SQL Editor 手动粘贴运行

-- ============================================================
-- exam_questions: 存储真题（提取）和模拟题（生成）的题目
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_questions (
    id              BIGSERIAL   PRIMARY KEY,
    course_id       UUID        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    artifact_id     BIGINT      REFERENCES public.artifacts(id) ON DELETE SET NULL,
    -- 来源类型：'past_exam'=真题提取；'mock'=AI模拟题
    source_type     TEXT        NOT NULL CHECK (source_type IN ('past_exam', 'mock')),
    -- 题目类型：'mcq'=选择题；'short_answer'=简答题
    question_type   TEXT        NOT NULL CHECK (question_type IN ('mcq', 'short_answer')),
    -- 题目在原卷中的序号（用于排序）
    question_index  INT         NOT NULL DEFAULT 0,
    question_text   TEXT        NOT NULL,
    -- MCQ 选项 JSON 数组，如 ["option A", "option B", "option C", "option D"]
    options         JSONB,
    -- MCQ 正确答案字母如 "A"；短答题参考答案文本
    correct_answer  TEXT,
    explanation     TEXT,
    -- 来自哪个模拟题批次（source_type='mock' 时使用，值等于 generation_jobs.id）
    mock_session_id TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_questions_course   ON exam_questions(course_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_artifact ON exam_questions(artifact_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_session  ON exam_questions(mock_session_id);

-- ============================================================
-- exam_attempts: 用户每次做题的答题记录（按题粒度，UPSERT 重做覆盖）
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_attempts (
    id              BIGSERIAL   PRIMARY KEY,
    user_id         UUID        NOT NULL,
    question_id     BIGINT      NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
    course_id       UUID        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    user_answer     TEXT        NOT NULL,
    is_correct      BOOLEAN,
    feedback        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_exam_attempts_user_question UNIQUE (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_user     ON exam_attempts(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_question ON exam_attempts(question_id);

-- ============================================================
-- exam_question_favorites: 用户收藏的题目
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_question_favorites (
    id              BIGSERIAL   PRIMARY KEY,
    user_id         UUID        NOT NULL,
    question_id     BIGINT      NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
    course_id       UUID        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_exam_favorites_user_question UNIQUE (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_favorites_user   ON exam_question_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_favorites_course ON exam_question_favorites(user_id, course_id);

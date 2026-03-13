-- Migration 025: Course Enrollments (Term-based access)
--
-- 学生每学期最多选 4 门课，每门课花 100 积分解锁，
-- 仅当学期有效（T1/T2/T3），换学期需重新选课。

CREATE TABLE IF NOT EXISTS enrollments (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID        NOT NULL,
    course_id   UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    term        TEXT        NOT NULL CHECK (term IN ('T1', 'T2', 'T3')),
    year        INT         NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, course_id, term, year)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user_term ON enrollments(user_id, term, year);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);

-- Migration 024: 14-Day Exam Planner
-- planner_blueprints: 管理员为每门课程设置的学习蓝图（静态任务池）
-- planner_progress:   每个用户对每个任务的完成状态

CREATE TABLE IF NOT EXISTS planner_blueprints (
    id          BIGSERIAL PRIMARY KEY,
    course_id   UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    blueprint   JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_id)
);

-- progress: 记录 (user_id, course_id, item_type, item_id) 的完成时间
-- item_type: 'kp' | 'paper'
-- item_id:   知识点 id 或 试卷 id（blueprint 中定义）
CREATE TABLE IF NOT EXISTS planner_progress (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID        NOT NULL,
    course_id   UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    item_type   TEXT        NOT NULL CHECK (item_type IN ('kp', 'paper')),
    item_id     TEXT        NOT NULL,
    done        BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, course_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_planner_blueprints_course ON planner_blueprints(course_id);
CREATE INDEX IF NOT EXISTS idx_planner_progress_user_course ON planner_progress(user_id, course_id);

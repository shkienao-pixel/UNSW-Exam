-- 真题解锁记录：用户解锁某份试卷后可无限次访问
CREATE TABLE IF NOT EXISTS exam_unlocks (
    user_id     UUID    NOT NULL,
    artifact_id INTEGER NOT NULL,
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, artifact_id)
);

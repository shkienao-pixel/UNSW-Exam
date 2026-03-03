-- Migration 010: Add doc_type semantic tag to artifacts
--
-- doc_type describes the SEMANTIC category of a document (what it IS),
-- distinct from file_type which describes FORMAT (pdf / word / url).
--
-- Routing rules enforced at the application layer:
--   knowledge_outline / knowledge_graph → priority: revision → lecture/tutorial
--   quiz generation                     → priority: past_exam → lecture/revision
--   course summary                      → lecture + revision only
--   AI Q&A                              → all types (full-library default)

-- 1. Add column (nullable → we fill existing rows below, then add default)
ALTER TABLE artifacts
    ADD COLUMN IF NOT EXISTS doc_type TEXT;

-- 2. Backfill existing rows with sensible defaults
--    URL artifacts stay 'other'; everything else defaults to 'lecture'
--    (safest assumption — admins can correct individual files via UI)
UPDATE artifacts
    SET doc_type = CASE
        WHEN file_type = 'url' THEN 'other'
        ELSE 'lecture'
    END
WHERE doc_type IS NULL;

-- 3. Now enforce NOT NULL + CHECK constraint
ALTER TABLE artifacts
    ALTER COLUMN doc_type SET NOT NULL,
    ALTER COLUMN doc_type SET DEFAULT 'lecture',
    ADD CONSTRAINT artifacts_doc_type_check
        CHECK (doc_type IN (
            'lecture',      -- 讲义 / Lecture slides
            'tutorial',     -- 辅导课 / Lab notes
            'revision',     -- 复习总结 / Study notes (PRIORITY for outline/graph)
            'past_exam',    -- 往年考题 (PRIORITY for quiz generation)
            'assignment',   -- 作业 / Project specs
            'other'         -- 其他
        ));

-- 4. Index for fast doc_type filter queries used by RAG routing
CREATE INDEX IF NOT EXISTS artifacts_doc_type_idx
    ON artifacts (course_id, doc_type, status);

COMMENT ON COLUMN artifacts.doc_type IS
    'Semantic document category used for RAG routing. '
    'Values: lecture | tutorial | revision | past_exam | assignment | other';

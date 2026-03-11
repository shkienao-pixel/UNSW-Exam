-- 020_fts_artifact_chunks.sql
-- 为 artifact_chunks.content 添加全文检索支持
-- 使用 'simple' 分词器（无语言特定词干化），兼容中英文混合内容

ALTER TABLE artifact_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_artifact_chunks_content_tsv
  ON artifact_chunks USING GIN (content_tsv);

-- 021_fts_rpc.sql
-- RPC function for FTS with ts_rank scoring
-- Called by sparse_retriever.py in the multi-path RAG pipeline

CREATE OR REPLACE FUNCTION search_chunks_fts(
    p_course_id    UUID,
    p_tsquery      TEXT,
    p_top_k        INTEGER DEFAULT 20,
    p_artifact_ids INTEGER[] DEFAULT '{}'
)
RETURNS TABLE(
    id            BIGINT,
    artifact_id   INTEGER,
    chunk_index   INTEGER,
    content       TEXT,
    ts_rank       FLOAT4
)
LANGUAGE SQL
STABLE
AS $$
    SELECT
        ac.id,
        ac.artifact_id,
        ac.chunk_index,
        ac.content,
        ts_rank(ac.content_tsv, to_tsquery('simple', p_tsquery)) AS ts_rank
    FROM artifact_chunks ac
    WHERE
        ac.course_id = p_course_id
        AND ac.content_tsv @@ to_tsquery('simple', p_tsquery)
        AND (cardinality(p_artifact_ids) = 0 OR ac.artifact_id = ANY(p_artifact_ids))
    ORDER BY ts_rank DESC
    LIMIT p_top_k;
$$;

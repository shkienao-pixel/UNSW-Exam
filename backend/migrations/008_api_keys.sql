-- Migration 008: API Key Management Table
-- Stores third-party LLM API keys managed via admin panel.
-- Provider DB key takes priority over environment variables at runtime.

CREATE TABLE IF NOT EXISTS api_keys (
    id          BIGSERIAL PRIMARY KEY,
    provider    TEXT        NOT NULL CHECK (provider IN ('openai', 'gemini', 'deepseek')),
    api_key     TEXT        NOT NULL,
    label       TEXT,                          -- Human-readable label e.g. "Production GPT Key"
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active key per provider at a time (enforced in application layer).
-- Index for fast lookup by provider + active status.
CREATE INDEX IF NOT EXISTS api_keys_provider_active_idx
    ON api_keys (provider, is_active);

-- Auto-update updated_at on row modification (requires moddatetime extension).
-- If moddatetime is not available, the application layer updates this field manually.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'moddatetime'
    ) THEN
        CREATE TRIGGER api_keys_updated_at
            BEFORE UPDATE ON api_keys
            FOR EACH ROW
            EXECUTE FUNCTION moddatetime(updated_at);
    END IF;
END $$;

COMMENT ON TABLE api_keys IS
    'LLM provider API keys managed via admin panel. One active key per provider.';

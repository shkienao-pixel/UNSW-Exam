-- Migration 034: flashcard_mistakes table
-- Stores flashcards marked as "forgot" or answered wrong by the user

CREATE TABLE IF NOT EXISTS flashcard_mistakes (
  id             BIGSERIAL    PRIMARY KEY,
  user_id        UUID         NOT NULL,
  course_id      UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  output_id      INTEGER      NOT NULL,
  card_index     INTEGER      NOT NULL,
  card_front     TEXT         NOT NULL DEFAULT '',
  card_back      TEXT         NOT NULL DEFAULT '',
  card_type      TEXT         NOT NULL DEFAULT 'vocab',
  mistake_status TEXT         NOT NULL DEFAULT 'active'
                              CHECK (mistake_status IN ('active', 'mastered')),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  mastered_at    TIMESTAMPTZ,
  UNIQUE (user_id, output_id, card_index)
);

CREATE INDEX IF NOT EXISTS idx_fc_mistakes_user_course
  ON flashcard_mistakes(user_id, course_id);

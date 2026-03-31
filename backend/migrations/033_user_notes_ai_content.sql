-- Migration 033: add ai_content column to user_notes
-- Stores GPT-4o Vision extracted text/description for each screenshot note

ALTER TABLE user_notes
  ADD COLUMN IF NOT EXISTS ai_content TEXT NOT NULL DEFAULT '';

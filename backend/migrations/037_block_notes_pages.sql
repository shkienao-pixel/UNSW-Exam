-- Add page column to block_notes for multi-page notebook support
ALTER TABLE block_notes ADD COLUMN IF NOT EXISTS page integer NOT NULL DEFAULT 1;

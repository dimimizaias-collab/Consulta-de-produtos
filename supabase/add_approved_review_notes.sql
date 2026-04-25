-- Add approved column to review_notes
-- Execute no SQL Editor do Supabase

ALTER TABLE review_notes
  ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT FALSE;

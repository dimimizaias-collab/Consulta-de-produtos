-- Add note_number and access_key columns to review_notes
-- Execute no SQL Editor do Supabase

ALTER TABLE review_notes ADD COLUMN IF NOT EXISTS note_number TEXT;
ALTER TABLE review_notes ADD COLUMN IF NOT EXISTS access_key  TEXT;

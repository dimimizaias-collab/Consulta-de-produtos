-- Add draft support to review_notes
-- Execute no SQL Editor do Supabase

ALTER TABLE review_notes ADD COLUMN IF NOT EXISTS is_draft  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE review_notes ADD COLUMN IF NOT EXISTS supplier_id TEXT;
ALTER TABLE review_notes ADD COLUMN IF NOT EXISTS raw_rows   JSONB;

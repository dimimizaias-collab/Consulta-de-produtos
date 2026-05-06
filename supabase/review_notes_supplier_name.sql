-- Add supplier_name column to review_notes
-- Execute no SQL Editor do Supabase

ALTER TABLE review_notes ADD COLUMN IF NOT EXISTS supplier_name TEXT;

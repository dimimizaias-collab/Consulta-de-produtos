-- Add nome_banco column to finance_favorecidos
-- Execute no SQL Editor do Supabase

ALTER TABLE finance_favorecidos
  ADD COLUMN IF NOT EXISTS nome_banco TEXT NOT NULL DEFAULT '';

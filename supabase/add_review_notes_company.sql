-- ============================================================
-- Empresa (loja) responsável pelo recebimento da nota
-- Execute este script no SQL Editor do Supabase
-- ============================================================

ALTER TABLE review_notes
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_review_notes_company_id ON review_notes(company_id);

-- ============================================================
-- Lock de edição por colaborador — impede dois usuários editando
-- a mesma nota ao mesmo tempo (ver botão de preço por empresa)
-- Execute este script no SQL Editor do Supabase
-- ============================================================

ALTER TABLE review_notes
  ADD COLUMN IF NOT EXISTS locked_by_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_by_name TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_review_notes_locked_by_id ON review_notes(locked_by_id);

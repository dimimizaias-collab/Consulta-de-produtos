-- Situacao de Entrada da nota (Registro / Aguardando Recebimento / Revisao / Aprovada)
-- Unifica os fluxos de "Criar Manifesto" e edicao de nota.
-- Execute no SQL Editor do Supabase

ALTER TABLE review_notes ADD COLUMN IF NOT EXISTS status TEXT;

UPDATE review_notes
SET status = CASE WHEN approved THEN 'aprovada' ELSE 'revisao' END
WHERE status IS NULL;

ALTER TABLE review_notes ALTER COLUMN status SET DEFAULT 'revisao';
ALTER TABLE review_notes ALTER COLUMN status SET NOT NULL;

ALTER TABLE review_notes DROP CONSTRAINT IF EXISTS review_notes_status_check;
ALTER TABLE review_notes ADD CONSTRAINT review_notes_status_check
  CHECK (status IN ('registro', 'aguardando_recebimento', 'revisao', 'aprovada'));

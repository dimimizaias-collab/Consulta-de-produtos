-- ============================================================
-- Situação da Distribuição — nota (Entrada de Mercadoria)
-- Execute no SQL Editor do Supabase
--
-- Área de Situação independente da Situação de Entrada (Registro/
-- Aguardando/Revisão/Aprovada), exclusiva pro fluxo de distribuição
-- entre lojas via item.distribuicaoByCompany. "Distribuição Enviada"
-- só pode ser selecionada com a nota em "Revisão" e, ao ser marcada,
-- gera os manifestos (1 por loja extra) na aba Distribuição.
-- ============================================================

ALTER TABLE review_notes
  ADD COLUMN IF NOT EXISTS distribution_status TEXT,
  ADD COLUMN IF NOT EXISTS distribution_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS distribution_sent_by_id UUID,
  ADD COLUMN IF NOT EXISTS distribution_sent_by_name TEXT;

ALTER TABLE review_notes DROP CONSTRAINT IF EXISTS review_notes_distribution_status_check;
ALTER TABLE review_notes ADD CONSTRAINT review_notes_distribution_status_check
  CHECK (distribution_status IS NULL OR distribution_status IN ('separacao', 'distribuicao_enviada'));

-- Rastreia qual nota gerou o manifesto (auto-gerado pela Situação da Distribuição) —
-- nulo para manifestos criados manualmente na aba Distribuição.
ALTER TABLE distribution_manifests
  ADD COLUMN IF NOT EXISTS source_note_id TEXT REFERENCES review_notes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_distribution_manifests_source_note_id ON distribution_manifests(source_note_id);

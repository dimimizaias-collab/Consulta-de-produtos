-- ============================================================
-- Distribuição — etapa "Aprovado" (confirmação de recebimento +
-- atualização de estoque), Medida por item e módulo de Falta/Sobra.
--
-- Antes só existia o fluxo de ENVIO (Registro -> Pedido enviado);
-- distribuicao.sql documentava a atualização de product_company_stock.count
-- como "fase futura" — esta migração implementa essa fase.
-- Execute no SQL Editor do Supabase.
-- ============================================================

ALTER TABLE distribution_manifests
  DROP CONSTRAINT IF EXISTS distribution_manifests_status_check;
ALTER TABLE distribution_manifests
  ADD CONSTRAINT distribution_manifests_status_check CHECK (status IN ('registro', 'pedido_enviado', 'aprovado'));

ALTER TABLE distribution_manifests
  ADD COLUMN IF NOT EXISTS approved_by_id   UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_name TEXT,
  ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ;

-- Medida (UN/CX/FD…) por item — não existia coluna de unidade no manifesto,
-- só na nota de compra (review_notes.items[].unit).
ALTER TABLE distribution_manifest_items
  ADD COLUMN IF NOT EXISTS measure TEXT NOT NULL DEFAULT 'UN';

-- Quantidade efetivamente recebida pela loja destino — separada de `qty`
-- (quantidade enviada pela origem) para alimentar o badge Falta/Sobra.
ALTER TABLE distribution_manifest_items
  ADD COLUMN IF NOT EXISTS qty_received NUMERIC(12,3);

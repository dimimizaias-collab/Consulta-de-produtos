-- ============================================================
-- Falta/Sobra no manifesto de Distribuição
-- Execute no SQL Editor do Supabase
--
-- Substitui o campo solto "Qtd. Receb." (qty_received) por um registro
-- explícito de divergência, no mesmo formato usado pelo módulo de
-- Falta/Sobra da nota (app/page.tsx, DiscrepancyData): { type, qty,
-- missingAll, obs, disregarded }. Acionado pelo botão na coluna Qtd.
-- Env. da tabela de itens do manifesto.
-- ============================================================

ALTER TABLE distribution_manifest_items
  ADD COLUMN IF NOT EXISTS discrepancy JSONB;

-- qty_received (adicionada em add_distribution_manifest_approval.sql) fica
-- sem uso a partir desta mudança — não é removida aqui pra não descartar
-- histórico de manifestos já recebidos antes desta migração.

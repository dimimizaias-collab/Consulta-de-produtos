-- ============================================================
-- Horário do preço de venda da loja destino — item do manifesto
-- Execute no SQL Editor do Supabase ANTES de publicar o código
--
-- O botão "Precificar para outra empresa" voltou para a nota: o
-- preço de venda da loja destino pode ser lançado na nota
-- (review_notes.items[].pricingByCompany[loja].precoAt) ou no
-- manifesto de Distribuição. Regra: vale o último salvo — esta
-- coluna guarda quando o preço do manifesto foi salvo, para
-- comparar com o horário do preço lançado na nota.
--
-- Preços já existentes ficam com NULL (contam como os mais antigos).
-- ============================================================

ALTER TABLE distribution_manifest_items
  ADD COLUMN IF NOT EXISTS sale_price_destination_at TIMESTAMPTZ;

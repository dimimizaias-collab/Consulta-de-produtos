-- ============================================================
-- Preço de venda / Ok da loja destino — item do manifesto
-- Execute no SQL Editor do Supabase
--
-- Decisão 3-B do plano de Distribuição: preço de venda + confirmação
-- ("Ok") de itens distribuídos para outra loja migram do mecanismo
-- antigo da nota (botão de preço / pricingByCompany, agora removido)
-- para dentro do próprio manifesto — a loja destino define seu preço
-- de venda e confirma o item recebido diretamente aqui.
-- ============================================================

ALTER TABLE distribution_manifest_items
  ADD COLUMN IF NOT EXISTS sale_price_destination NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

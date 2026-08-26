-- ============================================================
-- Custo por Empresa — Estoque & Preço
-- Execute no SQL Editor do Supabase
--
-- Hoje product_company_stock.price guarda o preço de VENDA propagado
-- na aprovação de nota (ver applyNoteToCompanyStock em app/page.tsx).
-- O custo (item.price na nota) nunca era persistido em lugar nenhum —
-- só existia dentro do JSONB de review_notes.items, sem acumular.
--
-- Este script adiciona cost_price (por loja), atualizado a cada
-- aprovação de nota com o ÚLTIMO custo recebido — sempre sobrescreve,
-- respeitando a mesma trava de "só avança se a data for mais recente"
-- já usada para price_received_date (evita nota aprovada fora de
-- ordem sobrescrever um custo mais novo). cost_received_date é campo
-- separado de price_received_date porque, em tese, são eventos que
-- podem divergir (ainda que hoje sempre venham da mesma nota).
-- ============================================================

ALTER TABLE product_company_stock
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE product_company_stock
  ADD COLUMN IF NOT EXISTS cost_received_date DATE;

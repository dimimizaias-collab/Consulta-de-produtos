-- ============================================================
-- Empresas extras já lançadas no product_company_stock delas
-- (preço de venda por empresa, via botão de preço na revisão)
-- Execute este script no SQL Editor do Supabase
-- ============================================================

ALTER TABLE review_notes
  ADD COLUMN IF NOT EXISTS stock_applied_companies JSONB NOT NULL DEFAULT '[]'::jsonb;

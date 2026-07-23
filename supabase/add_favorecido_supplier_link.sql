-- Execute este script no SQL Editor do Supabase
-- Vincula favorecidos do Controle Financeiro a fornecedores cadastrados na
-- Entrada de Mercadoria, para saber quais contas/nomes fiscais pertencem a
-- cada fornecedor.

ALTER TABLE finance_favorecidos
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_favorecidos_supplier_id
  ON finance_favorecidos(supplier_id);

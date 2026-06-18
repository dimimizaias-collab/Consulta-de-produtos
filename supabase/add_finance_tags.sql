-- Migration: Sistema de Tags para Controle Financeiro
-- Execute no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS finance_tags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT        NOT NULL UNIQUE,
  cor         TEXT        NOT NULL DEFAULT 'gray',
  descricao   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS tag_ids UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS finance_transactions_tag_ids_gin
  ON finance_transactions USING GIN(tag_ids);

INSERT INTO finance_tags (nome, cor, descricao) VALUES
  ('Fornecedor',       'blue',   'Pagamentos a fornecedores de mercadoria'),
  ('Fixo Mensal',      'purple', 'Despesas recorrentes todo mês'),
  ('Variável',         'amber',  'Despesas sem valor ou data fixos'),
  ('Imposto / Tributo','red',    'Impostos, taxas e tributos governamentais'),
  ('Folha de Pagamento','teal',  'Salários e encargos trabalhistas'),
  ('Investimento',     'green',  'Aportes em equipamentos, estoque ou melhorias')
ON CONFLICT (nome) DO NOTHING;

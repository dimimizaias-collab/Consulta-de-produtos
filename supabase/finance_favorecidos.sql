-- ============================================================
-- Dicionário de Favorecidos — Controle Financeiro
-- Execute no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS finance_favorecidos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_fiscal TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE finance_favorecidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_favorecidos_all"
  ON finance_favorecidos FOR ALL USING (true) WITH CHECK (true);

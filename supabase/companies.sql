-- ============================================================
-- Empresas / Lojas — Configurações > Dados
-- Execute este script no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social   TEXT        NOT NULL,
  nome_fantasia  TEXT        NOT NULL,
  cnpj           TEXT        NOT NULL,
  address        TEXT        NOT NULL DEFAULT '',
  logo           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_nome_fantasia ON companies(nome_fantasia);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_all"
  ON companies FOR ALL USING (true) WITH CHECK (true);

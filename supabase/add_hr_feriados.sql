-- Migration: Feriados (usados no cálculo de dia útil de pagamento de salário)
-- Execute no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS hr_feriados (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       DATE        NOT NULL UNIQUE,
  descricao  TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hr_feriados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_feriados_all" ON hr_feriados;
CREATE POLICY "hr_feriados_all"
  ON hr_feriados FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Recursos Humanos — Colaboradores
-- Execute este script no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS hr_employees (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           TEXT        NOT NULL,
  idade          INTEGER,
  cargo          TEXT        NOT NULL DEFAULT '',
  loja           TEXT        NOT NULL DEFAULT '',
  data_admissao  DATE        NOT NULL,
  salario        NUMERIC(12,2) NOT NULL DEFAULT 0,
  foto_url       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_employees_nome ON hr_employees(nome);

ALTER TABLE hr_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_employees_all"
  ON hr_employees FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Storage — criar o bucket "hr-employees-images" manualmente:
--    Supabase Dashboard → Storage → New Bucket
--    Nome: hr-employees-images
--    Public: SIM (habilitar "Public bucket")
-- ============================================================

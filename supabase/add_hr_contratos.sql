-- Migration: Dados Pessoais (data_nascimento/cpf) + Informações Contratuais (hr_contratos)
-- Execute no Supabase SQL Editor
--
-- Contexto: a Editar Colaborador passa a ter duas seções — "Dados Pessoais" (fixo, no
-- colaborador) e "Informações Contratuais" (um ou mais períodos por ano, com Loja/Cargo/
-- Data de Admissão/Salário próprios de cada período). Isso permite reajustes salariais,
-- trocas de cargo/loja e novas admissões ao longo dos anos sem perder o histórico.

-- 1. Dados Pessoais — novos campos no colaborador
ALTER TABLE hr_employees
  ADD COLUMN IF NOT EXISTS data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS cpf TEXT;

-- Se esta migration já tiver sido executada antes da correção (colaborador é pessoa física,
-- usa CPF e não CNPJ), renomeia a coluna criada por engano em vez de duplicar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hr_employees' AND column_name = 'cnpj')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hr_employees' AND column_name = 'cpf' )
  THEN
    ALTER TABLE hr_employees RENAME COLUMN cnpj TO cpf;
  END IF;
END $$;

-- Loja/Cargo/Data de Admissão/Salário agora vivem em hr_contratos (abaixo) — o cadastro de
-- um novo colaborador não preenche mais esses campos em hr_employees, então a constraint
-- NOT NULL de data_admissao (a única sem DEFAULT) precisa ser relaxada.
ALTER TABLE hr_employees ALTER COLUMN data_admissao DROP NOT NULL;

-- 2. Informações Contratuais — um período (mes_inicio..mes_fim de um ano) por card
CREATE TABLE IF NOT EXISTS hr_contratos (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id        UUID          NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  ano                   INTEGER       NOT NULL,
  mes_inicio            INTEGER       NOT NULL CHECK (mes_inicio BETWEEN 1 AND 12),
  mes_fim               INTEGER       NOT NULL CHECK (mes_fim BETWEEN 1 AND 12),
  loja                  TEXT          NOT NULL DEFAULT '',
  cargo                 TEXT          NOT NULL DEFAULT '',
  data_admissao         DATE          NOT NULL,
  salario_base          NUMERIC(12,2) NOT NULL DEFAULT 0,
  salario_complementar  NUMERIC(12,2) NOT NULL DEFAULT 0,
  dias_uteis_pagamento  INTEGER       NOT NULL DEFAULT 5,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CHECK (mes_fim >= mes_inicio)
);

CREATE INDEX IF NOT EXISTS idx_hr_contratos_colaborador ON hr_contratos(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_hr_contratos_ano ON hr_contratos(ano);

ALTER TABLE hr_contratos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_contratos_all"
  ON hr_contratos FOR ALL USING (true) WITH CHECK (true);

-- 3. Backfill: cada colaborador existente ganha um período único cobrindo o ano fiscal
--    2026 inteiro (Jan-Dez), preservando loja/cargo/data_admissao/salário atuais.
INSERT INTO hr_contratos (colaborador_id, ano, mes_inicio, mes_fim, loja, cargo, data_admissao, salario_base, salario_complementar, dias_uteis_pagamento)
SELECT id, 2026, 1, 12, loja, cargo, data_admissao, salario_base, salario_complementar, 5
FROM hr_employees
WHERE NOT EXISTS (SELECT 1 FROM hr_contratos WHERE hr_contratos.colaborador_id = hr_employees.id);

-- Migration: Caderninho — renomeia "tipo" para "modalidade" e adiciona a nova coluna "tipo"
-- (Despesa/Receita), usada para contar (+/-) no cálculo de salário do colaborador.
-- Execute no Supabase SQL Editor

ALTER TABLE hr_caderninho RENAME COLUMN tipo TO modalidade;
ALTER TABLE hr_caderninho DROP CONSTRAINT IF EXISTS hr_caderninho_tipo_check;
ALTER TABLE hr_caderninho ADD CONSTRAINT hr_caderninho_modalidade_check
  CHECK (modalidade IN ('Mercadoria', 'Vale', 'Bônus', 'Outros'));

ALTER TABLE hr_caderninho ADD COLUMN IF NOT EXISTS tipo TEXT CHECK (tipo IN ('Despesa', 'Receita'));

-- Backfill: todos os registros existentes são Mercadoria/Vale/Outros lançados até aqui como despesa.
UPDATE hr_caderninho SET tipo = 'Despesa' WHERE tipo IS NULL;
ALTER TABLE hr_caderninho ALTER COLUMN tipo SET NOT NULL;

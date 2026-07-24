-- Migration: Composição do Salário (Base + Complementar)
-- Execute no Supabase SQL Editor

ALTER TABLE hr_employees
  ADD COLUMN IF NOT EXISTS salario_base NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salario_complementar NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Backfill: para colaboradores já cadastrados, todo o salário atual vira "base" (sem complementar).
UPDATE hr_employees
  SET salario_base = salario
  WHERE salario_base = 0 AND salario <> 0;

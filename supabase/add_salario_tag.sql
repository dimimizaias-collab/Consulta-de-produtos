-- Migration: Tag exclusiva "Salários" para movimentações geradas pelo RH
-- Execute no Supabase SQL Editor

ALTER TABLE finance_tags
  ADD COLUMN IF NOT EXISTS exclusivo BOOLEAN NOT NULL DEFAULT false;

INSERT INTO finance_tags (nome, cor, descricao, exclusivo) VALUES
  ('Salários', 'red', 'Aplicada automaticamente a todas as parcelas de salário geradas pelo RH', true)
ON CONFLICT (nome) DO UPDATE SET cor = 'red', exclusivo = true;

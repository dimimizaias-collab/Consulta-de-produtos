-- ============================================================
-- Adiciona colunas de cadastro completo à tabela suppliers
-- Execute no SQL Editor do Supabase
-- ============================================================

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS documento    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS razao_social TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nome_fantasia TEXT NOT NULL DEFAULT '';

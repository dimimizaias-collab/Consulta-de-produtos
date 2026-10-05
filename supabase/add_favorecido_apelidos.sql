-- Execute no SQL Editor do Supabase
-- Apelidos do favorecido: nomes alternativos usados só na busca do
-- Controle Financeiro (ex.: "luz", "energia" → CEMIG Distribuição S.A.).
-- Os lançamentos continuam gravando o nome fiscal.

ALTER TABLE finance_favorecidos
  ADD COLUMN IF NOT EXISTS apelidos TEXT[] NOT NULL DEFAULT '{}';

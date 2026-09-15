-- ============================================================
-- NCM (Nomenclatura Comum do Mercosul) do produto — código fiscal de
-- 8 dígitos exigido pela tag <NCM> de qualquer NFe. Sem ele, XMLs de
-- NFe gerados pelo sistema (ex: distribuição entre lojas) ficam
-- fiscalmente inválidos para importação em um PDV/SEFAZ.
-- Execute este script no SQL Editor do Supabase
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS ncm TEXT;

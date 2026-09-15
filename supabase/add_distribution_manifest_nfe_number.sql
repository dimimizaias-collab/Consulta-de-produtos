-- ============================================================
-- Número numérico único global para o XML de NFe emulado gerado a
-- partir de um manifesto de distribuição (botão "Baixar XML" na tela
-- do manifesto). manifest_number (ex: "DIST-000012" ou "Fornecedor 01")
-- não serve pra isso: o formato "Fornecedor NN" reinicia a contagem por
-- fornecedor (get_next_distribution_manifest_number_for_supplier), o
-- que poderia gerar nNF duplicado pra emitente/série diferentes.
-- nfe_number é atribuído uma vez, na primeira geração do XML, via
-- sequence dedicada — garante unicidade independente do formato do
-- manifest_number.
-- Execute este script no SQL Editor do Supabase
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS distribution_manifest_nfe_number_seq START 1;

ALTER TABLE distribution_manifests ADD COLUMN IF NOT EXISTS nfe_number INTEGER;

CREATE OR REPLACE FUNCTION get_next_distribution_manifest_nfe_number()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nextval('distribution_manifest_nfe_number_seq')::INTEGER;
$$;

REVOKE ALL ON FUNCTION get_next_distribution_manifest_nfe_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_next_distribution_manifest_nfe_number() TO authenticated;

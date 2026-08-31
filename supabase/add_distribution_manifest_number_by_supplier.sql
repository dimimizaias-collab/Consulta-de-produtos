-- ============================================================
-- Numeração de manifesto pelo nome do Fornecedor — usada apenas nos
-- manifestos criados a partir do envio de Distribuição de uma nota
-- (handleSendDistribution, aba Notas). Formato: "<Fornecedor> <NN>",
-- ex. "Distribuidora ABC 01", "Distribuidora ABC 12".
--
-- Manifestos criados manualmente (botão "+" na aba Distribuição, sem
-- nota de origem) continuam usando get_next_distribution_manifest_number()
-- (formato DIST-000012) — lá não existe conceito de fornecedor.
--
-- Execute no SQL Editor do Supabase.
-- ============================================================

CREATE OR REPLACE FUNCTION get_next_distribution_manifest_number_for_supplier(p_supplier_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT := NULLIF(trim(p_supplier_name), '');
  v_max    INTEGER;
  v_next   INTEGER;
BEGIN
  IF v_prefix IS NULL THEN
    v_prefix := 'Fornecedor';
  END IF;

  -- Trava por hash do prefixo pra evitar corrida entre dois manifestos do mesmo
  -- fornecedor sendo gerados ao mesmo tempo (ex.: nota distribuída pra várias lojas
  -- de uma vez, um manifesto por loja destino, em sequência dentro da mesma transação).
  PERFORM pg_advisory_xact_lock(hashtext('dist_manifest_supplier:' || v_prefix));

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(substring(manifest_number FROM length(v_prefix) + 2), '\D', '', 'g'), '')::INTEGER
  ), 0)
  INTO v_max
  FROM distribution_manifests
  WHERE manifest_number LIKE v_prefix || ' %';

  v_next := v_max + 1;
  RETURN v_prefix || ' ' || lpad(v_next::text, 2, '0');
END;
$$;

REVOKE ALL ON FUNCTION get_next_distribution_manifest_number_for_supplier(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_next_distribution_manifest_number_for_supplier(TEXT) TO authenticated;

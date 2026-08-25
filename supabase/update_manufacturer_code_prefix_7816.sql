-- ============================================================
-- Ajusta o formato do código gerado: "7816" fixo + prefixo do
-- fabricante (3 dígitos) + sequência (5 dígitos), ex: 7816-007-00001
-- "7816" é constante fixa da empresa — se precisar mudar um dia,
-- é só alterar essa função de novo.
-- Execute no SQL Editor do Supabase, depois de add_manufacturers.sql.
-- ============================================================

CREATE OR REPLACE FUNCTION get_next_manufacturer_code(p_manufacturer_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_seq INTEGER;
BEGIN
  UPDATE manufacturers
  SET next_seq = next_seq + 1, updated_at = NOW()
  WHERE id = p_manufacturer_id AND active = true
  RETURNING prefix, next_seq - 1 INTO v_prefix, v_seq;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Fabricante não encontrado ou inativo: %', p_manufacturer_id;
  END IF;

  RETURN '7816-' || v_prefix || '-' || lpad(v_seq::text, 5, '0');
END;
$$;

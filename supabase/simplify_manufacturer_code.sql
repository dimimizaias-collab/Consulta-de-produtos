-- ============================================================
-- Simplifica o formato do código sugerido de SKU: remove o "7816-"
-- fixo e os zeros extras da sequência. Antes: 7816-147-00001 (14
-- caracteres). Agora: <prefixo 3 dígitos><sequência 2 dígitos>,
-- ex: 14701 — primeiro código gerado para o fabricante de prefixo 147.
-- A sequência com 2 dígitos comporta até 99 códigos por fabricante
-- sem crescer (a partir do 100º, o código só fica um pouco mais
-- longo: "147100" em vez de erro/estouro).
-- Execute no SQL Editor do Supabase.
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

  RETURN v_prefix || lpad(v_seq::text, 2, '0');
END;
$$;

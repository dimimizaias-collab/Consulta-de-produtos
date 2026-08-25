-- ============================================================
-- Fabricantes/Marcas — cadastro com prefixo numérico para geração
-- de código interno dos produtos (Fase 1: schema)
-- Execute no SQL Editor do Supabase
--
-- Prefixo: só dígitos, sempre normalizado para 3 caracteres
-- (zero-padded pelo app antes do insert/update, ex: "7" -> "007").
-- Código gerado pela RPC: "<prefixo 3 dígitos>-<sequência 5 dígitos>",
-- ex: "007-00001". A sequência é incrementada atomicamente via
-- UPDATE ... RETURNING, evitando colisão entre usuários simultâneos
-- (SKU/internal_code não tem constraint de unicidade hoje, então uma
-- colisão não daria erro — só um dado errado silencioso).
-- ============================================================

CREATE TABLE IF NOT EXISTS manufacturers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  cnpj          TEXT,
  prefix        TEXT        NOT NULL,
  active        BOOLEAN     NOT NULL DEFAULT true,
  next_seq      INTEGER     NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT manufacturers_prefix_unique UNIQUE (prefix),
  CONSTRAINT manufacturers_prefix_numeric CHECK (prefix ~ '^[0-9]{3}$'),
  CONSTRAINT manufacturers_next_seq_positive CHECK (next_seq >= 1)
);

CREATE INDEX IF NOT EXISTS idx_manufacturers_active ON manufacturers(active);
CREATE INDEX IF NOT EXISTS idx_manufacturers_name ON manufacturers(name);

-- Vínculo do produto ao fabricante — nullable, produto sem fabricante
-- continua existindo normalmente (equivalente ao "Geral" de hoje).
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer_id UUID REFERENCES manufacturers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_manufacturer_id ON products(manufacturer_id);

-- ── RLS ──────────────────────────────────────────────────────
-- Leitura liberada pra qualquer usuário autenticado (o cadastro
-- precisa aparecer em selects de produto em qualquer tela).
-- Escrita (insert/update/delete) restrita a role admin/gerente.
ALTER TABLE manufacturers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manufacturers_select_authenticated" ON manufacturers;
CREATE POLICY "manufacturers_select_authenticated"
  ON manufacturers FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "manufacturers_write_admin_gerente" ON manufacturers;
CREATE POLICY "manufacturers_write_admin_gerente"
  ON manufacturers FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
        AND usuarios.role IN ('admin', 'gerente')
        AND usuarios.ativo = true
    )
  );

DROP POLICY IF EXISTS "manufacturers_update_admin_gerente" ON manufacturers;
CREATE POLICY "manufacturers_update_admin_gerente"
  ON manufacturers FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
        AND usuarios.role IN ('admin', 'gerente')
        AND usuarios.ativo = true
    )
  );

DROP POLICY IF EXISTS "manufacturers_delete_admin_gerente" ON manufacturers;
CREATE POLICY "manufacturers_delete_admin_gerente"
  ON manufacturers FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
        AND usuarios.role IN ('admin', 'gerente')
        AND usuarios.ativo = true
    )
  );

-- ── RPC: próximo código interno de um fabricante ────────────
-- Incrementa next_seq atomicamente e devolve o código já formatado.
-- SECURITY DEFINER porque o UPDATE precisa passar mesmo pra quem só
-- tem policy de escrita restrita a admin/gerente — a checagem de quem
-- pode *gerar código* fica a cargo da tela (qualquer usuário que edita
-- produto pode gerar código; só o cadastro do fabricante em si é
-- restrito). Revoga de PUBLIC e concede só pra authenticated.
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

  RETURN v_prefix || '-' || lpad(v_seq::text, 5, '0');
END;
$$;

REVOKE ALL ON FUNCTION get_next_manufacturer_code(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_next_manufacturer_code(UUID) TO authenticated;

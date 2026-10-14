-- ============================================================
-- SKU numérico por categoria + subcategoria + fabricante
-- Execute no SQL Editor do Supabase.
--
-- Formato gerado (9 dígitos, só números):
--   <categoria 2><subcategoria 2><prefixo fabricante 3><sequência 2>
--   ex: 03 07 147 01 -> 030714701
-- A sequência é por combinação (categoria, subcategoria, fabricante).
-- A partir do 100º código da mesma combinação o código só fica um
-- dígito mais longo (0307147100), como já acontecia no formato antigo.
--
-- Categoria/subcategoria continuam gravadas como texto em products;
-- estas tabelas só dão um código numérico fixo para cada nome
-- (comparação sem diferenciar maiúsculas/espaços). O código da
-- subcategoria é por categoria: "Geral" pode ser 01 em várias.
-- Qualquer usuário autenticado pode criar categoria/subcategoria —
-- a RPC cria a que ainda não existir na hora de gerar o código.
--
-- O SKU não muda se o produto trocar de categoria depois: ele reflete
-- a categoria do momento em que foi gerado (já está nas etiquetas).
-- ============================================================

CREATE TABLE IF NOT EXISTS product_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  code        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_categories_code_unique UNIQUE (code),
  CONSTRAINT product_categories_code_numeric CHECK (code ~ '^[0-9]{2}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS product_categories_name_key
  ON product_categories (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS product_subcategories (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  UUID        NOT NULL REFERENCES product_categories(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  code         TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_subcategories_code_unique UNIQUE (category_id, code),
  CONSTRAINT product_subcategories_code_numeric CHECK (code ~ '^[0-9]{2}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS product_subcategories_name_key
  ON product_subcategories (category_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS sku_sequences (
  subcategory_id   UUID    NOT NULL REFERENCES product_subcategories(id) ON DELETE CASCADE,
  manufacturer_id  UUID    NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
  next_seq         INTEGER NOT NULL DEFAULT 1 CHECK (next_seq >= 1),
  PRIMARY KEY (subcategory_id, manufacturer_id)
);

-- ── RLS: leitura e cadastro liberados para qualquer autenticado ──
ALTER TABLE product_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE sku_sequences         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_categories_select_auth" ON product_categories;
CREATE POLICY "product_categories_select_auth" ON product_categories
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "product_categories_insert_auth" ON product_categories;
CREATE POLICY "product_categories_insert_auth" ON product_categories
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "product_subcategories_select_auth" ON product_subcategories;
CREATE POLICY "product_subcategories_select_auth" ON product_subcategories
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "product_subcategories_insert_auth" ON product_subcategories;
CREATE POLICY "product_subcategories_insert_auth" ON product_subcategories
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "sku_sequences_select_auth" ON sku_sequences;
CREATE POLICY "sku_sequences_select_auth" ON sku_sequences
  FOR SELECT TO authenticated USING (true);
-- escrita em sku_sequences só pela RPC (SECURITY DEFINER)

-- ── Backfill: códigos para as categorias/subcategorias já usadas ──
-- Ordem alfabética; categorias/subcategorias novas entram no fim.
INSERT INTO product_categories (name, code)
SELECT name, lpad(row_number() OVER (ORDER BY lower(name))::text, 2, '0')
FROM (
  SELECT DISTINCT ON (lower(btrim(category))) btrim(category) AS name
  FROM products
  WHERE category IS NOT NULL AND btrim(category) <> ''
  ORDER BY lower(btrim(category)), btrim(category)
) c
WHERE NOT EXISTS (SELECT 1 FROM product_categories);

INSERT INTO product_subcategories (category_id, name, code)
SELECT category_id, name,
       lpad(row_number() OVER (PARTITION BY category_id ORDER BY lower(name))::text, 2, '0')
FROM (
  SELECT DISTINCT ON (pc.id, lower(btrim(p.subcategory))) pc.id AS category_id, btrim(p.subcategory) AS name
  FROM products p
  JOIN product_categories pc ON lower(btrim(pc.name)) = lower(btrim(p.category))
  WHERE p.subcategory IS NOT NULL AND btrim(p.subcategory) <> ''
  ORDER BY pc.id, lower(btrim(p.subcategory)), btrim(p.subcategory)
) s
WHERE NOT EXISTS (SELECT 1 FROM product_subcategories);

-- ── RPC: próximo SKU ────────────────────────────────────────
-- Recebe os nomes (como estão no formulário). Categoria/subcategoria
-- vazias viram "Geral", igual ao que o app grava ao salvar.
CREATE OR REPLACE FUNCTION get_next_category_sku(
  p_category TEXT,
  p_subcategory TEXT,
  p_manufacturer_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat_name TEXT := COALESCE(NULLIF(btrim(p_category), ''), 'Geral');
  v_sub_name TEXT := COALESCE(NULLIF(btrim(p_subcategory), ''), 'Geral');
  v_cat_id UUID;
  v_cat_code TEXT;
  v_sub_id UUID;
  v_sub_code TEXT;
  v_prefix TEXT;
  v_seq INTEGER;
  v_sku TEXT;
BEGIN
  SELECT prefix INTO v_prefix FROM manufacturers WHERE id = p_manufacturer_id AND active = true;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Fabricante não encontrado ou inativo: %', p_manufacturer_id;
  END IF;

  -- Serializa a criação de códigos novos (evita dois usuários pegarem o mesmo número).
  PERFORM pg_advisory_xact_lock(hashtext('product_categories_codes'));

  SELECT id, code INTO v_cat_id, v_cat_code
  FROM product_categories WHERE lower(btrim(name)) = lower(v_cat_name);
  IF v_cat_id IS NULL THEN
    SELECT lpad((COALESCE(max(code::int), 0) + 1)::text, 2, '0') INTO v_cat_code FROM product_categories;
    IF length(v_cat_code) > 2 THEN
      RAISE EXCEPTION 'Limite de 99 categorias atingido';
    END IF;
    INSERT INTO product_categories (name, code) VALUES (v_cat_name, v_cat_code) RETURNING id INTO v_cat_id;
  END IF;

  SELECT id, code INTO v_sub_id, v_sub_code
  FROM product_subcategories WHERE category_id = v_cat_id AND lower(btrim(name)) = lower(v_sub_name);
  IF v_sub_id IS NULL THEN
    SELECT lpad((COALESCE(max(code::int), 0) + 1)::text, 2, '0') INTO v_sub_code
    FROM product_subcategories WHERE category_id = v_cat_id;
    IF length(v_sub_code) > 2 THEN
      RAISE EXCEPTION 'Limite de 99 subcategorias atingido em %', v_cat_name;
    END IF;
    INSERT INTO product_subcategories (category_id, name, code) VALUES (v_cat_id, v_sub_name, v_sub_code) RETURNING id INTO v_sub_id;
  END IF;

  -- Pega a próxima sequência; pula números que já existam como SKU
  -- (ex: digitados à mão) para não gerar duplicado.
  LOOP
    INSERT INTO sku_sequences (subcategory_id, manufacturer_id, next_seq)
    VALUES (v_sub_id, p_manufacturer_id, 2)
    ON CONFLICT (subcategory_id, manufacturer_id)
      DO UPDATE SET next_seq = sku_sequences.next_seq + 1
    RETURNING next_seq - 1 INTO v_seq;

    v_sku := v_cat_code || v_sub_code || v_prefix || lpad(v_seq::text, 2, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM products WHERE sku = v_sku);
  END LOOP;

  RETURN v_sku;
END;
$$;

REVOKE ALL ON FUNCTION get_next_category_sku(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_next_category_sku(TEXT, TEXT, UUID) TO authenticated;

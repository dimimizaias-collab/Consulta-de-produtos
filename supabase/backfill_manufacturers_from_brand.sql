-- ============================================================
-- Fase 2 — Backfill: cria os fabricantes a partir dos valores hoje
-- em products.brand e vincula cada produto ao fabricante criado.
--
-- Regras combinadas com o usuário:
--  - "Geral" e "Sem Marca" são placeholder, não viram fabricante —
--    produtos com esses valores ficam com manufacturer_id NULL.
--  - Merges de maiúscula/minúscula e um typo confirmado:
--      Hem / HEM              -> "Hem"
--      Credeal / CREDEAL      -> "Credeal"
--      Vinati / VINATI / Vintati -> "Vinati"  (Vintati = erro de digitação confirmado)
--      Guda / GUDA             -> "Guda"
--      Taj / TAJ               -> "Taj"
--      Tulasi / TULASI         -> "Tulasi"
--  - Prefixo (3 dígitos) atribuído por quantidade de produtos
--    decrescente: a marca com mais produtos recebe "001".
--  - Nenhum produto tem CNPJ preenchido hoje (conferido antes) —
--    fabricantes nascem sem CNPJ.
--
-- Execute no SQL Editor do Supabase, depois de add_manufacturers.sql
-- e update_manufacturer_code_prefix_7816.sql.
-- ============================================================

-- Função auxiliar temporária de canonicalização — só existe durante
-- esta migration, é removida no final.
CREATE OR REPLACE FUNCTION _canonical_brand(raw text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(btrim(raw))
    WHEN 'hem' THEN 'Hem'
    WHEN 'credeal' THEN 'Credeal'
    WHEN 'vinati' THEN 'Vinati'
    WHEN 'vintati' THEN 'Vinati'
    WHEN 'guda' THEN 'Guda'
    WHEN 'taj' THEN 'Taj'
    WHEN 'tulasi' THEN 'Tulasi'
    ELSE btrim(raw)
  END;
$$;

-- 1) Cria um fabricante por marca canônica (exclui Geral/Sem Marca/vazio),
--    prefixo = ranking por quantidade de produtos (desc), 3 dígitos.
WITH brand_counts AS (
  SELECT _canonical_brand(brand) AS canonical_name, COUNT(*) AS qtd
  FROM products
  WHERE brand IS NOT NULL
    AND btrim(brand) <> ''
    AND lower(btrim(brand)) NOT IN ('geral', 'sem marca')
  GROUP BY _canonical_brand(brand)
),
ranked AS (
  SELECT
    canonical_name,
    qtd,
    ROW_NUMBER() OVER (ORDER BY qtd DESC, canonical_name ASC) AS rn
  FROM brand_counts
)
INSERT INTO manufacturers (name, prefix)
SELECT canonical_name, lpad(rn::text, 3, '0')
FROM ranked
ORDER BY rn
ON CONFLICT DO NOTHING;

-- 2) Vincula cada produto ao fabricante correspondente (case-insensitive,
--    mesma canonicalização usada acima).
UPDATE products p
SET manufacturer_id = m.id
FROM manufacturers m
WHERE m.name = _canonical_brand(p.brand)
  AND p.brand IS NOT NULL
  AND btrim(p.brand) <> ''
  AND lower(btrim(p.brand)) NOT IN ('geral', 'sem marca');

-- Remove a função auxiliar — não faz parte do schema permanente.
DROP FUNCTION _canonical_brand(text);

-- ── Verificação — cole o resultado de volta pra eu conferir ──
SELECT
  (SELECT COUNT(*) FROM manufacturers) AS fabricantes_criados,
  (SELECT COUNT(*) FROM products WHERE manufacturer_id IS NOT NULL) AS produtos_vinculados,
  (SELECT COUNT(*) FROM products WHERE manufacturer_id IS NULL) AS produtos_sem_fabricante;

SELECT prefix, name, next_seq
FROM manufacturers
ORDER BY prefix
LIMIT 20;

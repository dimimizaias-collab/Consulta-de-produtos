-- Backfill único: produtos com EANs concatenados por vírgula em products.ean
-- (gerados pelas antigas telas de "múltiplos EANs" sem tabela própria) têm o
-- 1º código mantido em products.ean e os demais movidos para product_ean_codes.
--
-- Rodar UMA VEZ, manualmente, depois de aplicar add_product_ean_codes.sql.
-- Validar o SELECT abaixo antes de rodar o INSERT/UPDATE em produção.

-- Prévia (conferir antes de aplicar):
-- SELECT id, ean FROM products WHERE ean LIKE '%,%';

WITH split AS (
  SELECT
    p.id AS product_id,
    trim(code.value) AS ean,
    code.ordinality AS rn
  FROM products p,
       LATERAL unnest(string_to_array(p.ean, ',')) WITH ORDINALITY AS code(value, ordinality)
  WHERE p.ean LIKE '%,%'
)
INSERT INTO product_ean_codes (product_id, ean, description)
SELECT product_id, ean, NULL
FROM split
WHERE rn > 1 AND ean <> ''
ON CONFLICT (product_id, ean) DO NOTHING;

UPDATE products
SET ean = trim(split_part(ean, ',', 1))
WHERE ean LIKE '%,%';

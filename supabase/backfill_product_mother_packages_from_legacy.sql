-- Copia (NÃO move/apaga) os pares mãe/filho 1:1 legados — products.is_mother +
-- products.linked_product_id + products.units_per_mother — para o novo modelo
-- product_mother_packages. As colunas antigas e a lógica de propagação de estoque
-- que depende delas continuam existindo e funcionando normalmente em paralelo.
--
-- Idempotente: pode ser rodado mais de uma vez sem duplicar (checa se já existe
-- uma embalagem para o mesmo child_product_id com o mesmo EAN ou SKU).
--
-- Execute no SQL Editor do Supabase, depois de já ter rodado add_product_mother_packages.sql.

INSERT INTO product_mother_packages (child_product_id, sku, name, ean, location, category, subcategory, units_per_child)
SELECT
  mother.linked_product_id,
  mother.sku,
  mother.name,
  mother.ean,
  mother.location,
  mother.category,
  mother.subcategory,
  COALESCE(mother.units_per_mother, 1)
FROM products mother
WHERE mother.is_mother = true
  AND mother.linked_product_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM product_mother_packages existing
    WHERE existing.child_product_id = mother.linked_product_id
      AND (
        (mother.ean IS NOT NULL AND existing.ean = mother.ean)
        OR (mother.sku IS NOT NULL AND existing.sku = mother.sku)
      )
  );

-- Copia também os EANs extras do produto-mãe legado (product_ean_codes) como EANs
-- extras da nova embalagem correspondente (multi-EAN — fabricante trocou o código
-- de barras da caixa).
INSERT INTO product_mother_package_ean_codes (mother_package_id, ean, description)
SELECT DISTINCT
  pmp.id,
  pec.ean,
  pec.description
FROM product_ean_codes pec
JOIN products mother ON mother.id = pec.product_id AND mother.is_mother = true AND mother.linked_product_id IS NOT NULL
JOIN product_mother_packages pmp
  ON pmp.child_product_id = mother.linked_product_id
 AND ((mother.ean IS NOT NULL AND pmp.ean = mother.ean) OR (mother.sku IS NOT NULL AND pmp.sku = mother.sku))
WHERE NOT EXISTS (
  SELECT 1 FROM product_mother_package_ean_codes existing
  WHERE existing.mother_package_id = pmp.id AND existing.ean = pec.ean
);

-- Conferência: rode esta consulta depois para comparar quantos pares legados existem
-- vs. quantos foram migrados.
-- SELECT
--   (SELECT count(*) FROM products WHERE is_mother = true AND linked_product_id IS NOT NULL) AS pares_legados,
--   (SELECT count(*) FROM product_mother_packages) AS produtos_mae_novos;

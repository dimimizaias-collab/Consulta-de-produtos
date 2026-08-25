-- ============================================================
-- Fase 2 — Levantamento de valores existentes em brand/fabricante
-- Só leitura — não altera nada. Rode no SQL Editor do Supabase e
-- me devolva o resultado (pode exportar como CSV ou colar o texto).
-- ============================================================

-- 1) Valores distintos de "brand" (Marca), com quantos produtos usam cada um
SELECT
  brand,
  COUNT(*) AS qtd_produtos
FROM products
WHERE brand IS NOT NULL AND btrim(brand) <> ''
GROUP BY brand
ORDER BY qtd_produtos DESC, brand ASC;

-- 2) Valores distintos de "fabricante" (texto livre legado), com contagem
SELECT
  fabricante,
  COUNT(*) AS qtd_produtos
FROM products
WHERE fabricante IS NOT NULL AND btrim(fabricante) <> ''
GROUP BY fabricante
ORDER BY qtd_produtos DESC, fabricante ASC;

-- 3) Produtos onde brand e fabricante estão preenchidos e DIFERENTES —
--    são os casos que mais provavelmente precisam de decisão manual
--    de merge (ex: brand="Nestlé", fabricante="Nestle Brasil Ltda").
SELECT
  brand,
  fabricante,
  COUNT(*) AS qtd_produtos
FROM products
WHERE brand IS NOT NULL AND btrim(brand) <> ''
  AND fabricante IS NOT NULL AND btrim(fabricante) <> ''
  AND lower(btrim(brand)) <> lower(btrim(fabricante))
GROUP BY brand, fabricante
ORDER BY qtd_produtos DESC;

-- 4) Quantos produtos têm CNPJ preenchido — relevante porque o CNPJ vai
--    migrar do produto para o cadastro do fabricante (um CNPJ por
--    fabricante, não por produto) — se o mesmo brand/fabricante tiver
--    CNPJs diferentes em produtos diferentes, também precisa de decisão manual.
SELECT
  COALESCE(NULLIF(btrim(brand), ''), NULLIF(btrim(fabricante), ''), '(sem marca/fabricante)') AS marca_ou_fabricante,
  cnpj,
  COUNT(*) AS qtd_produtos
FROM products
WHERE cnpj IS NOT NULL AND btrim(cnpj) <> ''
GROUP BY 1, cnpj
ORDER BY marca_ou_fabricante, qtd_produtos DESC;

-- 5) Quantos produtos no total, e quantos já têm pelo menos um dos dois campos preenchido
SELECT
  COUNT(*) AS total_produtos,
  COUNT(*) FILTER (WHERE brand IS NOT NULL AND btrim(brand) <> '') AS com_brand,
  COUNT(*) FILTER (WHERE fabricante IS NOT NULL AND btrim(fabricante) <> '') AS com_fabricante,
  COUNT(*) FILTER (WHERE (brand IS NULL OR btrim(brand) = '') AND (fabricante IS NULL OR btrim(fabricante) = '')) AS sem_nenhum
FROM products;

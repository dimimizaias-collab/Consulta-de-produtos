-- ─── PASSO 1: Verificação — rode isso primeiro e confira os dados ─────────────
-- Mostra o estado atual de cada item nas duas notas erradas

SELECT
  rn.file_name,
  item->>'supplier_code'  AS codigo_fornecedor,
  item->>'name'           AS name_atual,
  item->>'product_name'   AS product_name,
  item->>'sku'            AS sku_atual
FROM review_notes rn,
     jsonb_array_elements(rn.items) AS item
WHERE rn.file_name IN (
  'Manifesto Manual — 05/05/2026, 11:28:44',
  'Manifesto Manual — 05/05/2026, 11:41:09'
)
ORDER BY rn.file_name, (item->>'seq')::int;


-- ─── PASSO 2: Correção — só rode após confirmar o SELECT acima ────────────────
-- Corrige: name = product_name | sku = '' quando começa com 'MAN-'

UPDATE review_notes
SET items = (
  SELECT jsonb_agg(
    item
    || jsonb_build_object('name', COALESCE(NULLIF(item->>'product_name', ''), item->>'description', item->>'name'))
    || jsonb_build_object('sku',  CASE WHEN (item->>'sku') LIKE 'MAN-%' THEN '' ELSE item->>'sku' END)
  )
  FROM jsonb_array_elements(items) AS item
)
WHERE file_name IN (
  'Manifesto Manual — 05/05/2026, 11:28:44',
  'Manifesto Manual — 05/05/2026, 11:41:09'
);

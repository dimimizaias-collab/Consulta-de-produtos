-- ============================================================
-- Backfill — Preço Custo zerado em itens de manifesto de Distribuição
-- já enviados antes da correção de handleSendDistribution (app/page.tsx),
-- que buscava cost_price em product_company_stock da origem em vez de
-- usar o valor da própria nota (só fica correto em product_company_stock
-- depois que a nota é Aprovada — a Distribuição é enviada em Revisão).
--
-- Recalcula cost_price = price / multiplier do item correspondente na
-- nota de origem (distribution_manifests.source_note_id), só para linhas
-- com custo zerado/nulo hoje. Não mexe em manifestos criados manualmente
-- (sem source_note_id) — esses não têm de onde puxar o valor da nota.
--
-- Execute no SQL Editor do Supabase. Rode primeiro o SELECT de conferência,
-- depois o UPDATE.
-- ============================================================

-- Conferência — o que vai ser alterado:
SELECT
  dm.manifest_number,
  dmi.id AS item_id,
  dmi.product_name,
  dmi.qty,
  dmi.cost_price AS cost_price_atual,
  nic.cost_price AS cost_price_novo,
  dmi.qty * nic.cost_price AS valor_total_novo
FROM distribution_manifest_items dmi
JOIN distribution_manifests dm ON dm.id = dmi.manifest_id
JOIN LATERAL (
  SELECT (COALESCE((item->>'price')::numeric, 0) / NULLIF(COALESCE((item->>'multiplier')::numeric, 1), 0)) AS cost_price
  FROM review_notes rn, jsonb_array_elements(rn.items) AS item
  WHERE rn.id = dm.source_note_id
    AND item->>'product_id' = dmi.product_id::text
  LIMIT 1
) nic ON true
WHERE dm.source_note_id IS NOT NULL
  AND (dmi.cost_price IS NULL OR dmi.cost_price = 0)
  AND nic.cost_price > 0;

-- Aplica a correção:
UPDATE distribution_manifest_items dmi
SET cost_price = nic.cost_price
FROM distribution_manifests dm,
LATERAL (
  SELECT (COALESCE((item->>'price')::numeric, 0) / NULLIF(COALESCE((item->>'multiplier')::numeric, 1), 0)) AS cost_price
  FROM review_notes rn, jsonb_array_elements(rn.items) AS item
  WHERE rn.id = dm.source_note_id
    AND item->>'product_id' = dmi.product_id::text
  LIMIT 1
) nic
WHERE dm.id = dmi.manifest_id
  AND dm.source_note_id IS NOT NULL
  AND (dmi.cost_price IS NULL OR dmi.cost_price = 0)
  AND nic.cost_price > 0;

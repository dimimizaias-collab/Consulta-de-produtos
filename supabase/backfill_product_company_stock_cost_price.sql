-- ============================================================
-- Backfill de custo por loja — Distribuição
-- Execute no SQL Editor do Supabase
--
-- add_product_company_stock_cost_price.sql só passou a gravar cost_price
-- em product_company_stock dali pra frente (nas próximas aprovações de
-- nota). Produtos com nota aprovada ANTES dessa migração ficam com
-- cost_price = 0 até a próxima compra, mesmo já tendo custo conhecido no
-- histórico de review_notes.
--
-- Este script varre as notas já aprovadas e preenche cost_price
-- retroativamente, usando o ÚLTIMO custo recebido por produto+loja —
-- mesma regra da Fase 2 (applyNoteToCompanyStock), só que aplicada de
-- uma vez sobre o histórico em vez de incrementalmente a cada aprovação.
--
-- Seguro rodar mais de uma vez: só sobrescreve se o valor atual ainda
-- não foi definido (cost_price = 0) ou se o histórico encontrado for
-- mais recente que a data já gravada — nunca "volta no tempo" um custo
-- que já tenha sido atualizado por uma aprovação de nota posterior.
-- ============================================================

WITH note_items AS (
  SELECT
    rn.company_id,
    (item->>'product_id')::uuid AS product_id,
    (item->>'price')::numeric AS cost_price,
    COALESCE(rn.received_date, rn.created_at::date) AS received_date
  FROM review_notes rn,
       jsonb_array_elements(rn.items) AS item
  WHERE rn.company_id IS NOT NULL
    AND rn.status = 'aprovada'
    AND item->>'product_id' IS NOT NULL
    AND COALESCE((item->>'product_price')::numeric, 0) > 0
    AND COALESCE((item->>'price')::numeric, 0) > 0
    AND NOT (
      (item->'discrepancy'->>'type') = 'falta'
      AND (item->'discrepancy'->>'missingAll')::boolean IS TRUE
    )
),
latest_cost AS (
  SELECT DISTINCT ON (company_id, product_id)
    company_id, product_id, cost_price, received_date
  FROM note_items
  ORDER BY company_id, product_id, received_date DESC NULLS LAST
)
UPDATE product_company_stock pcs
SET cost_price = lc.cost_price,
    cost_received_date = lc.received_date,
    updated_at = NOW()
FROM latest_cost lc
WHERE pcs.company_id = lc.company_id
  AND pcs.product_id = lc.product_id
  AND (
    pcs.cost_price = 0
    OR pcs.cost_received_date IS NULL
    OR lc.received_date > pcs.cost_received_date
  );

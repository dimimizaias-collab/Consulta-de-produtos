-- Backfill único: preenche parcelamento_id para parcelas antigas que ainda
-- dependem do agrupamento heurístico por texto (favorecido+tipo+tipo_pagamento+
-- estabelecimento+total_parcelas), criado antes da coluna parcelamento_id existir
-- (ver add_parcelamento_id.sql). Sem esse ID estável, editar o texto de uma única
-- parcela pode fazer o app.js perder o vínculo dela com as demais parcelas do
-- mesmo parcelamento na hora de somar "Total pago"/"Restante".
--
-- Rodar UMA VEZ, manualmente, depois de aplicar add_parcelamento_id.sql.
-- Validar o SELECT abaixo antes de rodar o UPDATE em produção.

-- Prévia (conferir antes de aplicar) — cada linha é um grupo legado que será unificado:
-- SELECT favorecido, tipo, tipo_pagamento, estabelecimento, total_parcelas, count(*) AS parcelas
-- FROM finance_transactions
-- WHERE parcelamento_id IS NULL AND total_parcelas IS NOT NULL AND total_parcelas > 1
-- GROUP BY favorecido, tipo, tipo_pagamento, estabelecimento, total_parcelas
-- ORDER BY count(*) DESC;

WITH legacy_groups AS (
  SELECT
    favorecido, tipo, tipo_pagamento, estabelecimento, total_parcelas,
    gen_random_uuid() AS new_parcelamento_id
  FROM finance_transactions
  WHERE parcelamento_id IS NULL
    AND total_parcelas IS NOT NULL
    AND total_parcelas > 1
  GROUP BY favorecido, tipo, tipo_pagamento, estabelecimento, total_parcelas
)
UPDATE finance_transactions ft
SET parcelamento_id = lg.new_parcelamento_id
FROM legacy_groups lg
WHERE ft.parcelamento_id IS NULL
  AND ft.total_parcelas IS NOT NULL
  AND ft.total_parcelas > 1
  AND ft.favorecido = lg.favorecido
  AND ft.tipo = lg.tipo
  AND ft.tipo_pagamento = lg.tipo_pagamento
  AND ft.estabelecimento = lg.estabelecimento
  AND ft.total_parcelas = lg.total_parcelas;

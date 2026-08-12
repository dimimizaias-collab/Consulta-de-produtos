-- Backfill único: preenche codigo_numero/codigo para movimentações já existentes.
-- Rodar UMA VEZ, manualmente, depois de aplicar add_codigo_movimentacao.sql.
--
-- A ordem dos grupos segue a data de criação mais antiga de cada grupo
-- (parcelamento_id, ou o próprio id da movimentação quando avulsa), preservando
-- a ordem cronológica de cadastro.

-- Prévia (conferir antes de aplicar):
-- SELECT COALESCE(parcelamento_id::text, id::text) AS grupo, min(created_at) AS primeira,
--        count(*) AS movimentacoes
-- FROM finance_transactions
-- WHERE codigo_numero IS NULL
-- GROUP BY 1
-- ORDER BY primeira;

WITH grupos AS (
  SELECT
    COALESCE(parcelamento_id::text, id::text) AS grupo_key,
    min(created_at) AS primeira_data
  FROM finance_transactions
  WHERE codigo_numero IS NULL
  GROUP BY 1
),
numerados AS (
  SELECT
    grupo_key,
    row_number() OVER (ORDER BY primeira_data) + COALESCE((SELECT max(codigo_numero) FROM finance_transactions), 0) AS numero
  FROM grupos
)
UPDATE finance_transactions ft
SET
  codigo_numero = n.numero,
  codigo = CASE
    WHEN ft.parcelamento_id IS NOT NULL
      THEN lpad(n.numero::TEXT, 2, '0') || '-' || finance_codigo_letra(COALESCE(ft.numero_parcela, 1))
    ELSE lpad(n.numero::TEXT, 2, '0')
  END
FROM numerados n
WHERE COALESCE(ft.parcelamento_id::text, ft.id::text) = n.grupo_key
  AND ft.codigo_numero IS NULL;

-- Ajusta a sequência para continuar a partir do maior número já usado,
-- evitando colisão com os próximos INSERTs feitos pelo trigger.
SELECT setval('finance_transactions_codigo_seq', (SELECT COALESCE(max(codigo_numero), 0) FROM finance_transactions));

-- ─────────────────────────────────────────────────────────────────────────────
-- Migração: corrigir vencimento de despesas parceladas antigas
--
-- Contexto: antes da correção em FinanceManager.tsx, ao inserir parcelas cada
-- linha era gravada com vencimento = NULL (herdado do objeto base do formulário).
-- A data correta da parcela ficava apenas no campo `data`.
-- A DespesasPage filtra por `vencimento IS NOT NULL`, então essas linhas
-- ficavam invisíveis no painel de Finanças.
--
-- Esta migração preenche `vencimento` com o valor de `data` para todas as
-- linhas de despesa que ainda estão com vencimento NULL.
--
-- Condições de segurança:
--   • Apenas tipo = 'Despesa'      — receitas não têm parcelas, não tocar
--   • Apenas vencimento IS NULL    — linhas que já têm vencimento não são alteradas
--   • data IS NOT NULL             — só preenche se houver data de origem
--
-- Execute no SQL Editor do Supabase (dashboard > SQL Editor > New query).
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE finance_transactions
SET    vencimento = data
WHERE  tipo       = 'Despesa'
  AND  vencimento IS NULL
  AND  data       IS NOT NULL;

-- Verificação: retorna o número de linhas atualizadas (deve ser > 0 se havia parcelas antigas)
SELECT
  COUNT(*) FILTER (WHERE tipo = 'Despesa' AND vencimento IS NULL AND data IS NOT NULL) AS pendentes_ainda,
  COUNT(*) FILTER (WHERE tipo = 'Despesa' AND vencimento IS NOT NULL)                  AS com_vencimento
FROM finance_transactions;

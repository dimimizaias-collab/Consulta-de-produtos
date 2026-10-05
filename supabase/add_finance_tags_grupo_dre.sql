-- Migration: Grupo da DRE em cada tag financeira (aba "Fluxo de Caixa")
-- Execute no Supabase SQL Editor
--
-- Cada movimentação cai no grupo da primeira tag dela que tiver grupo_dre definido.
-- Despesas sem tag classificada aparecem como "Não classificadas" no Fluxo de Caixa.

ALTER TABLE finance_tags
  ADD COLUMN IF NOT EXISTS grupo_dre TEXT
  CHECK (grupo_dre IN ('receita', 'custo_variavel', 'custo_fixo', 'despesa_variavel', 'despesa_fixa', 'investimento', 'ignorar'));

-- Sugestão inicial para as tags padrão (só onde ainda não há grupo definido).
UPDATE finance_tags SET grupo_dre = 'custo_variavel'   WHERE nome = 'Fornecedor'         AND grupo_dre IS NULL;
UPDATE finance_tags SET grupo_dre = 'despesa_fixa'     WHERE nome = 'Fixo Mensal'        AND grupo_dre IS NULL;
UPDATE finance_tags SET grupo_dre = 'despesa_variavel' WHERE nome = 'Variável'           AND grupo_dre IS NULL;
UPDATE finance_tags SET grupo_dre = 'despesa_variavel' WHERE nome = 'Imposto / Tributo'  AND grupo_dre IS NULL;
UPDATE finance_tags SET grupo_dre = 'despesa_fixa'     WHERE nome = 'Folha de Pagamento' AND grupo_dre IS NULL;
UPDATE finance_tags SET grupo_dre = 'despesa_fixa'     WHERE nome = 'Salários'           AND grupo_dre IS NULL;
UPDATE finance_tags SET grupo_dre = 'investimento'     WHERE nome = 'Investimento'       AND grupo_dre IS NULL;

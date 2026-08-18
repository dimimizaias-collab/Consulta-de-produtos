-- Execute este script no SQL Editor do Supabase
-- Adiciona suporte a Cartões de Crédito vinculados a uma Conta (finance_accounts),
-- e as colunas necessárias em finance_transactions para:
--   1. Vincular uma movimentação a um cartão (card_id) e à fatura/período em que ela caiu.
--   2. Marcar uma linha como a "fatura consolidada" mensal daquele cartão
--      (is_fatura_consolidada = TRUE), agregando o total das movimentações do período.
--   3. Guardar o valor real informado manualmente pelo usuário (valor_real) e a flag
--      que decide se o campo "Valor" exibido reflete o valor real ou o consolidado.
--
-- Uma conta pode ter N cartões (add_finance_cards.sql não força 1:1).
-- fatura_periodo guarda sempre o primeiro dia do mês/ano de referência da fatura
-- (ex: 2026-08-01), para permitir agrupar/filtrar sem recalcular a regra de
-- fechamento a cada consulta.

-- 1. Tabela de cartões
CREATE TABLE IF NOT EXISTS finance_cards (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID          NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
  nome           TEXT          NOT NULL,
  dia_fechamento INTEGER       NOT NULL CHECK (dia_fechamento BETWEEN 1 AND 31),
  dia_vencimento INTEGER       NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  limite         NUMERIC(12,2),
  codigo         TEXT          UNIQUE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_cards_account_id ON finance_cards(account_id);

-- Código curto e sequencial (C1, C2, C3...), gerado automaticamente no INSERT.
CREATE SEQUENCE IF NOT EXISTS finance_cards_codigo_seq;

CREATE OR REPLACE FUNCTION finance_cards_set_codigo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo IS NULL THEN
    NEW.codigo := 'C' || nextval('finance_cards_codigo_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_finance_cards_set_codigo ON finance_cards;
CREATE TRIGGER trg_finance_cards_set_codigo
  BEFORE INSERT ON finance_cards
  FOR EACH ROW
  EXECUTE FUNCTION finance_cards_set_codigo();

ALTER TABLE finance_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_cards_all"
  ON finance_cards FOR ALL USING (true) WITH CHECK (true);

-- 2. Colunas novas em finance_transactions
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES finance_cards(id) ON DELETE SET NULL;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS fatura_periodo DATE;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS is_fatura_consolidada BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS valor_real NUMERIC(12,2);
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS usar_valor_real BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_finance_transactions_card_id ON finance_transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_card_periodo ON finance_transactions(card_id, fatura_periodo);

-- Uma única linha de fatura consolidada por cartão/período.
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_transactions_fatura_consolidada
  ON finance_transactions(card_id, fatura_periodo)
  WHERE is_fatura_consolidada = TRUE;

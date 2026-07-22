-- Execute este script no SQL Editor do Supabase
-- Adiciona um identificador real de grupo de parcelamento, substituindo o
-- agrupamento heurístico (favorecido+tipo+pagamento+estabelecimento+total_parcelas)
-- por um UUID compartilhado entre as parcelas de uma mesma movimentação.

ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS parcelamento_id UUID;

CREATE INDEX IF NOT EXISTS idx_finance_transactions_parcelamento_id
  ON finance_transactions(parcelamento_id);

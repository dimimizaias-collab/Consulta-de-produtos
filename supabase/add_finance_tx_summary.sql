-- Adiciona colunas de resumo da movimentação vinculada em review_notes
-- Evita JOIN desnecessário na listagem de notas aprovadas

ALTER TABLE review_notes
  ADD COLUMN IF NOT EXISTS finance_tx_favorecido TEXT,
  ADD COLUMN IF NOT EXISTS finance_tx_valor       NUMERIC;

-- Índice parcial na FK de vinculação (já existente via add_transaction_link.sql)
-- Adicionado aqui caso ainda não exista
CREATE INDEX IF NOT EXISTS idx_review_notes_finance_tx
  ON review_notes(finance_transaction_id)
  WHERE finance_transaction_id IS NOT NULL;

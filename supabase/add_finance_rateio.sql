-- Migration: Rateio de movimentações entre estabelecimentos (Controle Financeiro)
-- Execute no Supabase SQL Editor
--
-- Uma movimentação rateada vira uma linha por estabelecimento (cada uma com o próprio
-- estabelecimento e valor), todas com o mesmo rateio_id. rateio_ordem = 0 é a parte
-- principal (representa o grupo na tabela). Movimentações parceladas e rateadas têm um
-- rateio_id por parcela, e as partes de todas as parcelas compartilham o parcelamento_id.

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS rateio_id         UUID,
  ADD COLUMN IF NOT EXISTS rateio_ordem      INT,
  ADD COLUMN IF NOT EXISTS rateio_percentual NUMERIC(7,4);

CREATE INDEX IF NOT EXISTS finance_transactions_rateio_idx
  ON finance_transactions (rateio_id) WHERE rateio_id IS NOT NULL;

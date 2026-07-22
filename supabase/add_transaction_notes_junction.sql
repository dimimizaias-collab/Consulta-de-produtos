-- Vínculo N:N entre movimentações financeiras e notas fiscais (review_notes)
-- Executar no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS finance_transaction_notes (
  transaction_id UUID NOT NULL REFERENCES finance_transactions(id) ON DELETE CASCADE,
  note_id        TEXT NOT NULL REFERENCES review_notes(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (transaction_id, note_id)
);

CREATE INDEX IF NOT EXISTS idx_ftn_note ON finance_transaction_notes(note_id);

-- Backfill: vínculos existentes criados pela Entrada de Mercadoria
INSERT INTO finance_transaction_notes (transaction_id, note_id)
SELECT finance_transaction_id, id FROM review_notes
WHERE finance_transaction_id IS NOT NULL
ON CONFLICT DO NOTHING;

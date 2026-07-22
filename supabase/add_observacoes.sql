-- Adiciona campo observacoes à tabela finance_transactions
-- Executar no SQL Editor do Supabase

ALTER TABLE finance_transactions
ADD COLUMN IF NOT EXISTS observacoes TEXT DEFAULT NULL;

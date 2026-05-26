-- Adiciona campo numero_cheque à tabela finance_transactions
-- Executar no SQL Editor do Supabase

ALTER TABLE finance_transactions
ADD COLUMN IF NOT EXISTS numero_cheque TEXT DEFAULT NULL;

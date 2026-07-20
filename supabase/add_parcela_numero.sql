-- Adiciona numero_parcela/total_parcelas à tabela finance_transactions
-- Executar no SQL Editor do Supabase

ALTER TABLE finance_transactions
ADD COLUMN IF NOT EXISTS numero_parcela INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS total_parcelas INTEGER DEFAULT NULL;

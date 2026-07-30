-- Adiciona campo data_pagamento à tabela finance_transactions
-- Guarda a data em que a despesa foi efetivamente paga (preenchida via o
-- questionário de conta+data ao marcar como paga uma despesa com vencimento)
-- Executar no SQL Editor do Supabase

ALTER TABLE finance_transactions
ADD COLUMN IF NOT EXISTS data_pagamento DATE DEFAULT NULL;

-- Adiciona campo genérico de identificação (usado pelos tipos de pagamento
-- que não têm um campo especial próprio, como Cheque/numero_cheque e Boleto/codigo_barras)
-- Executar no SQL Editor do Supabase

ALTER TABLE finance_transactions
ADD COLUMN IF NOT EXISTS identificacao TEXT DEFAULT NULL;

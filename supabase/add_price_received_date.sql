-- Add price_received_date column to products
-- Guarda a data de recebimento da nota que definiu o preco de venda atual,
-- para evitar que uma nota antiga sobrescreva um preco mais recente.
-- Execute no SQL Editor do Supabase

ALTER TABLE products ADD COLUMN IF NOT EXISTS price_received_date DATE;

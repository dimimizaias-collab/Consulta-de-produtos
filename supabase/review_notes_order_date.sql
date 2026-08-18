-- Add order_date column to review_notes (Entrada de Mercadoria)
-- Data do pedido — informada na aba Recebimento da nota
-- Execute no SQL Editor do Supabase

ALTER TABLE review_notes ADD COLUMN IF NOT EXISTS order_date DATE;

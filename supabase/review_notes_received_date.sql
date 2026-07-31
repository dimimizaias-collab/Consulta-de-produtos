-- Add received_date column to review_notes (Entrada de Mercadoria)
-- Data de recebimento — usada para compor o nome padrão da nota (Fornecedor - Data)
-- Execute no SQL Editor do Supabase

ALTER TABLE review_notes ADD COLUMN IF NOT EXISTS received_date DATE;

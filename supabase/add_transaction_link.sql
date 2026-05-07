-- Migration: link review_notes to finance_transactions
-- Run this in the Supabase SQL Editor

ALTER TABLE review_notes
  ADD COLUMN IF NOT EXISTS finance_transaction_id UUID
  REFERENCES finance_transactions(id) ON DELETE SET NULL;

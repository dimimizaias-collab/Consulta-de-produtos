-- Migration: agência e número da conta nas contas bancárias do fornecedor
-- Execute no Supabase SQL Editor

ALTER TABLE supplier_bank_accounts
  ADD COLUMN IF NOT EXISTS agencia TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS conta   TEXT NOT NULL DEFAULT '';

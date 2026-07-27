-- Migration: tipo de documento do fornecedor (CNPJ/CPF) + contas bancárias adicionais
-- Execute no Supabase SQL Editor

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS documento_tipo TEXT NOT NULL DEFAULT 'CNPJ'
    CHECK (documento_tipo IN ('CNPJ', 'CPF'));

-- Backfill heurístico para fornecedores já cadastrados: conta os dígitos do
-- documento existente (11 = CPF, 14 = CNPJ). Documentos vazios ou com outra
-- contagem de dígitos mantêm o default 'CNPJ'.
UPDATE suppliers
SET documento_tipo = 'CPF'
WHERE documento_tipo = 'CNPJ'
  AND length(regexp_replace(documento, '\D', '', 'g')) = 11;

-- Outras contas que um mesmo fornecedor possa usar para recebimento
-- (ex: sócio recebendo via PIX pessoal, conta secundária etc.)
CREATE TABLE IF NOT EXISTS supplier_bank_accounts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id         UUID        NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  nome                TEXT        NOT NULL,
  identificacao_tipo  TEXT        NOT NULL DEFAULT 'CNPJ' CHECK (identificacao_tipo IN ('CNPJ', 'CPF')),
  identificacao       TEXT        NOT NULL DEFAULT '',
  instituicao         TEXT        NOT NULL DEFAULT '',
  chave_pix           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE supplier_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_bank_accounts_all"
  ON supplier_bank_accounts FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_supplier_bank_accounts_supplier_id
  ON supplier_bank_accounts(supplier_id);

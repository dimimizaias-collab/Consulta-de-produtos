-- ============================================================
-- Controle Financeiro — Tabelas e Políticas
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- 1. Movimentações financeiras
CREATE TABLE IF NOT EXISTS finance_transactions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  data             DATE          NOT NULL,
  tipo             TEXT          NOT NULL CHECK (tipo IN ('Receita', 'Despesa')),
  tipo_pagamento   TEXT          NOT NULL,
  favorecido       TEXT          NOT NULL,
  estabelecimento  TEXT          NOT NULL,
  vencimento       DATE,
  valor_final      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_pago       NUMERIC(12,2) NOT NULL DEFAULT 0,
  pago             BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 2. Contas bancárias
CREATE TABLE IF NOT EXISTS finance_accounts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         TEXT        NOT NULL,
  banco        TEXT        NOT NULL DEFAULT '',
  agencia      TEXT        NOT NULL DEFAULT '',
  numero_conta TEXT        NOT NULL DEFAULT '',
  imagem_url   TEXT        NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Row Level Security (permissivo — ajuste quando adicionar autenticação)
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_accounts     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_transactions_all"
  ON finance_transactions FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "finance_accounts_all"
  ON finance_accounts FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 4. Storage — criar o bucket "finance-images" manualmente:
--    Supabase Dashboard → Storage → New Bucket
--    Nome: finance-images
--    Public: SIM (habilitar "Public bucket")
-- ============================================================

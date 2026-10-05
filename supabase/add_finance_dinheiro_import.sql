-- Migration: Importação das vendas em dinheiro (Retaguarda › Central de Vendas)
-- Execute no Supabase SQL Editor (depois de add_finance_rede_import.sql)
--
-- As vendas individuais ficam em finance_pdv_sales (conferência + evitar duplicidade pelo
-- rel_idMov do Retaguarda). No Controle Financeiro entra uma receita "Dinheiro" por dia de
-- venda, identificada por origem = 'retaguarda' + origem_ref
-- ('retaguarda:<cnpj da loja>:<data>:dinheiro'), recalculada quando o período é reimportado.
-- Vendas com pagamento misto guardam em valor_dinheiro só a parte paga em dinheiro,
-- informada pelo usuário na importação.

-- 1) Movimentações: nova origem
ALTER TABLE finance_transactions DROP CONSTRAINT IF EXISTS finance_transactions_origem_check;
ALTER TABLE finance_transactions
  ADD CONSTRAINT finance_transactions_origem_check CHECK (origem IN ('manual', 'hr_salario', 'rede', 'retaguarda'));

-- 2) Vendas individuais do Retaguarda
CREATE TABLE IF NOT EXISTS finance_pdv_sales (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id        TEXT,                               -- finance_import_logs.id
  id_mov           TEXT          NOT NULL UNIQUE,      -- rel_idMov do Retaguarda
  cnpj_loja        TEXT          NOT NULL,
  numero           TEXT,                               -- rel_nNF (nº da NFC-e ou do orçamento)
  tipo_doc         TEXT,                               -- Nota Fiscal 65 | Orçamento
  caixa            INT,
  data_venda       DATE          NOT NULL,
  hora_venda       TEXT,
  status           INT,                                -- 2 = finalizada, 3 = cancelada
  forma_pagamento  TEXT,                               -- ex.: DINHEIRO, DINHEIRO | DÉBITO
  valor_total      NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_dinheiro   NUMERIC(12,2) NOT NULL DEFAULT 0,   -- parte em dinheiro (= total se só dinheiro)
  misto            BOOLEAN       NOT NULL DEFAULT false,
  valida           BOOLEAN       NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_pdv_sales_dia_idx ON finance_pdv_sales (cnpj_loja, data_venda);
CREATE INDEX IF NOT EXISTS finance_pdv_sales_import_idx ON finance_pdv_sales (import_id);

-- 3) Configuração salva entre importações (linha única id = 1)
CREATE TABLE IF NOT EXISTS finance_pdv_config (
  id                INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  estabelecimentos  JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- { "<cnpj da loja>": "<estabelecimento do financeiro>" }
  tag_dinheiro      UUID,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4) RLS: precisa estar autenticado
ALTER TABLE finance_pdv_sales  ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_pdv_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_pdv_sales_authenticated" ON finance_pdv_sales;
CREATE POLICY "finance_pdv_sales_authenticated" ON finance_pdv_sales
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "finance_pdv_config_authenticated" ON finance_pdv_config;
CREATE POLICY "finance_pdv_config_authenticated" ON finance_pdv_config
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

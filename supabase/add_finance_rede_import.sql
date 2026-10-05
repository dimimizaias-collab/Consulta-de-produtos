-- Migration: Importação do relatório de vendas da Rede (maquininha) no Controle Financeiro
-- Execute no Supabase SQL Editor
--
-- As vendas individuais ficam em finance_rede_sales (só conferência + evitar duplicidade).
-- No Controle Financeiro entram movimentações agregadas por dia de recebimento:
-- receita de crédito, receita de débito, despesa de taxa MDR e despesa de antecipação.
-- Cada uma é identificada por origem = 'rede' + origem_ref
-- ('rede:<nº estabelecimento>:<data recebimento>:<credito|debito|mdr|antecipacao>'),
-- o que permite recalcular o dia quando o mesmo período é importado de novo.

-- 1) Movimentações: nova origem + referência única da origem
ALTER TABLE finance_transactions DROP CONSTRAINT IF EXISTS finance_transactions_origem_check;
ALTER TABLE finance_transactions
  ADD CONSTRAINT finance_transactions_origem_check CHECK (origem IN ('manual', 'hr_salario', 'rede'));

ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS origem_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS finance_transactions_origem_ref_key
  ON finance_transactions (origem_ref) WHERE origem_ref IS NOT NULL;

-- 2) Vendas individuais da Rede
CREATE TABLE IF NOT EXISTS finance_rede_sales (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id               TEXT,                           -- finance_import_logs.id
  numero_estabelecimento  TEXT        NOT NULL,
  nsu                     TEXT        NOT NULL,
  data_venda              DATE        NOT NULL,
  hora_venda              TEXT,
  data_recebimento        DATE        NOT NULL,
  modalidade              TEXT        NOT NULL,           -- credito | debito | pix
  tipo                    TEXT,                           -- à vista | parcelado sem juros ...
  parcelas                INT         NOT NULL DEFAULT 1,
  bandeira                TEXT,
  valor_bruto             NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxa_mdr                NUMERIC(8,5)  NOT NULL DEFAULT 0,
  valor_mdr               NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxa_antecipacao        NUMERIC(8,5)  NOT NULL DEFAULT 0,
  valor_antecipacao       NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_liquido           NUMERIC(12,2) NOT NULL DEFAULT 0,
  maquininha              TEXT,
  autorizacao             TEXT,
  status                  TEXT,
  cancelada               BOOLEAN     NOT NULL DEFAULT false,
  valor_cancelado         NUMERIC(12,2) NOT NULL DEFAULT 0,
  chargeback              BOOLEAN     NOT NULL DEFAULT false,
  valida                  BOOLEAN     NOT NULL DEFAULT true,  -- aprovada e não cancelada: entra na soma
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (numero_estabelecimento, nsu, data_venda)
);

CREATE INDEX IF NOT EXISTS finance_rede_sales_recebimento_idx
  ON finance_rede_sales (numero_estabelecimento, data_recebimento);
CREATE INDEX IF NOT EXISTS finance_rede_sales_import_idx ON finance_rede_sales (import_id);

-- 3) Configuração salva entre importações (linha única id = 1)
CREATE TABLE IF NOT EXISTS finance_rede_config (
  id                INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  estabelecimentos  JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- { "<nº Rede>": "<estabelecimento do financeiro>" }
  tag_credito       UUID,
  tag_debito        UUID,
  tag_mdr           UUID,
  tag_antecipacao   UUID,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4) RLS: mesmo padrão do resto do app (precisa estar autenticado)
ALTER TABLE finance_rede_sales  ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_rede_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_rede_sales_authenticated" ON finance_rede_sales;
CREATE POLICY "finance_rede_sales_authenticated" ON finance_rede_sales
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "finance_rede_config_authenticated" ON finance_rede_config;
CREATE POLICY "finance_rede_config_authenticated" ON finance_rede_config
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

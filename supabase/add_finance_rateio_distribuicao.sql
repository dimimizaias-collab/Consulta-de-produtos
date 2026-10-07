-- Migration: Rateio pela distribuição de mercadoria (Controle Financeiro)
-- Execute no Supabase SQL Editor (depois de add_finance_rateio.sql)
--
-- Quando o rateio de um pagamento é calculado pela distribuição das notas vinculadas
-- ("Ratear pela distribuição"), cada parte guarda um retrato dos custos por loja usados
-- no cálculo: { "notas": [...], "custos": { "<loja>": 1234.56 }, "total": 10000 }.
-- Serve para avisar quando a distribuição mudar depois ("rateio desatualizado").

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS rateio_distribuicao JSONB;

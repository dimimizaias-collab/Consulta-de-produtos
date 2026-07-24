-- Migration: vínculo de movimentações financeiras geradas pelo RH (salário)
-- Execute no Supabase SQL Editor
--
-- `origem = 'hr_salario'` identifica parcelas de salário geradas automaticamente a partir
-- de um período de Informações Contratuais — essas linhas ficam travadas para edição na
-- tela de Controle Financeiro (só é possível marcar como paga).

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS hr_employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hr_period_id UUID REFERENCES hr_contratos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'hr_salario'));

CREATE INDEX IF NOT EXISTS idx_finance_transactions_hr_period ON finance_transactions(hr_period_id);

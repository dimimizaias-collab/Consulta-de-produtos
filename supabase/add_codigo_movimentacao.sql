-- Execute este script no SQL Editor do Supabase
-- Adiciona um código de identificação sequencial a cada movimentação financeira.
-- Movimentações avulsas (sem parcelamento_id) recebem um código numérico: "01", "02"...
-- Movimentações com parcelas (mesmo parcelamento_id) compartilham o número base e
-- recebem um sufixo alfabético por ordem de numero_parcela: "01-a", "01-b", "01-c"...
--
-- O número é atribuído automaticamente via trigger no INSERT, cobrindo todos os
-- caminhos de criação (cadastro manual, parcelamento em lote, importação de extrato,
-- geração de folha em lib/hrSalarioFinance.ts) sem precisar alterar cada chamada.

ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS codigo_numero INTEGER;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS codigo TEXT;

CREATE INDEX IF NOT EXISTS idx_finance_transactions_codigo_numero
  ON finance_transactions(codigo_numero);

CREATE SEQUENCE IF NOT EXISTS finance_transactions_codigo_seq;

-- Converte a posição da parcela (1, 2, 3...) em sufixo alfabético (a, b, c...
-- z, aa, ab...), seguindo a mesma lógica de colunas de planilha.
CREATE OR REPLACE FUNCTION finance_codigo_letra(n INTEGER)
RETURNS TEXT AS $$
DECLARE
  result TEXT := '';
  i INTEGER := n;
BEGIN
  IF i IS NULL OR i < 1 THEN
    i := 1;
  END IF;
  WHILE i > 0 LOOP
    result := chr(97 + ((i - 1) % 26)) || result;
    i := (i - 1) / 26;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION finance_transactions_set_codigo()
RETURNS TRIGGER AS $$
DECLARE
  existing_numero INTEGER;
BEGIN
  IF NEW.codigo_numero IS NOT NULL THEN
    -- Já veio com código definido (ex: parcela irmã inserida explicitamente) — não sobrescreve.
    RETURN NEW;
  END IF;

  IF NEW.parcelamento_id IS NOT NULL THEN
    SELECT codigo_numero INTO existing_numero
    FROM finance_transactions
    WHERE parcelamento_id = NEW.parcelamento_id AND codigo_numero IS NOT NULL
    LIMIT 1;

    IF existing_numero IS NOT NULL THEN
      NEW.codigo_numero := existing_numero;
    ELSE
      NEW.codigo_numero := nextval('finance_transactions_codigo_seq');
    END IF;

    NEW.codigo := lpad(NEW.codigo_numero::TEXT, 2, '0') || '-' || finance_codigo_letra(COALESCE(NEW.numero_parcela, 1));
  ELSE
    NEW.codigo_numero := nextval('finance_transactions_codigo_seq');
    NEW.codigo := lpad(NEW.codigo_numero::TEXT, 2, '0');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_finance_transactions_set_codigo ON finance_transactions;
CREATE TRIGGER trg_finance_transactions_set_codigo
  BEFORE INSERT ON finance_transactions
  FOR EACH ROW
  EXECUTE FUNCTION finance_transactions_set_codigo();

-- Mantém o código consistente se numero_parcela for corrigido depois da criação.
CREATE OR REPLACE FUNCTION finance_transactions_update_codigo_suffix()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parcelamento_id IS NOT NULL AND NEW.codigo_numero IS NOT NULL
     AND NEW.numero_parcela IS DISTINCT FROM OLD.numero_parcela THEN
    NEW.codigo := lpad(NEW.codigo_numero::TEXT, 2, '0') || '-' || finance_codigo_letra(COALESCE(NEW.numero_parcela, 1));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_finance_transactions_update_codigo_suffix ON finance_transactions;
CREATE TRIGGER trg_finance_transactions_update_codigo_suffix
  BEFORE UPDATE ON finance_transactions
  FOR EACH ROW
  EXECUTE FUNCTION finance_transactions_update_codigo_suffix();

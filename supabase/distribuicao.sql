-- ============================================================
-- Distribuição — controle logístico de circulação de mercadoria
-- entre as lojas cadastradas (Fase 1: schema)
-- Execute no SQL Editor do Supabase
--
-- Escopo desta fase: apenas o fluxo de ENVIO (Registro -> Pedido
-- enviado). Não mexe em estoque real (product_company_stock.count)
-- — isso fica para uma fase futura, junto com o fluxo de confirmação
-- de recebimento pela loja destino (hoje não existe).
--
-- Numeração própria (manifest_number), independente da sequência de
-- review_notes — são documentos conceitualmente diferentes (nota de
-- compra de fornecedor externo vs. transferência interna entre lojas).
-- ============================================================

CREATE TABLE IF NOT EXISTS distribution_manifests (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_number        TEXT        NOT NULL,
  origin_company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  destination_company_id UUID        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  status                 TEXT        NOT NULL DEFAULT 'registro',
  shipping_date          DATE,
  created_by_id          UUID,
  created_by_name        TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by_id             UUID,
  sent_by_name           TEXT,
  sent_at                TIMESTAMPTZ,
  -- Lock de edição — mesmo mecanismo de review_notes.locked_by_* (add_review_notes_lock.sql),
  -- evita dois usuários editando a lista de produtos do mesmo manifesto ao mesmo tempo.
  locked_by_id           UUID        REFERENCES hr_employees(id) ON DELETE SET NULL,
  locked_by_name         TEXT,
  locked_at              TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT distribution_manifests_number_unique UNIQUE (manifest_number),
  CONSTRAINT distribution_manifests_status_check CHECK (status IN ('registro', 'pedido_enviado')),
  CONSTRAINT distribution_manifests_diff_companies CHECK (origin_company_id <> destination_company_id)
);

CREATE INDEX IF NOT EXISTS idx_distribution_manifests_origin ON distribution_manifests(origin_company_id);
CREATE INDEX IF NOT EXISTS idx_distribution_manifests_destination ON distribution_manifests(destination_company_id);
CREATE INDEX IF NOT EXISTS idx_distribution_manifests_status ON distribution_manifests(status);
-- Cards de Resultados e filtro do calendário usam shipping_date (dado de negócio editável
-- pelo usuário), não sent_at (timestamp técnico de quando o clique aconteceu) — ver Etapa 5.
CREATE INDEX IF NOT EXISTS idx_distribution_manifests_shipping_date ON distribution_manifests(shipping_date);
CREATE INDEX IF NOT EXISTS idx_distribution_manifests_locked_by_id ON distribution_manifests(locked_by_id);

-- Produto duplicado no mesmo manifesto: sem constraint de unicidade aqui de propósito —
-- a mesclagem (somar quantidade ao item já existente) e o aviso de confirmação ao usuário
-- (campo EAN em vermelho, ícone de alerta no card, pergunta de confirmação) são tratados
-- na aplicação (Etapa 6), não no banco.
CREATE TABLE IF NOT EXISTS distribution_manifest_items (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id        UUID        NOT NULL REFERENCES distribution_manifests(id) ON DELETE CASCADE,
  product_id         UUID        NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name       TEXT        NOT NULL,
  sku                TEXT,
  ean                TEXT,
  qty                NUMERIC(12,3) NOT NULL CHECK (qty > 0),
  cost_price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  sale_price_origin  NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_distribution_manifest_items_manifest_id ON distribution_manifest_items(manifest_id);
CREATE INDEX IF NOT EXISTS idx_distribution_manifest_items_product_id ON distribution_manifest_items(product_id);

-- ── RLS ──────────────────────────────────────────────────────
-- Diferente do padrão totalmente aberto (`USING (true)`) usado em
-- product_company_stock/companies — aqui exige usuário autenticado,
-- sem restrição por papel (qualquer authenticated pode criar/editar/
-- enviar manifesto). Mesmo padrão de leitura de manufacturers_select_authenticated.
ALTER TABLE distribution_manifests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "distribution_manifests_authenticated"
  ON distribution_manifests FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE distribution_manifest_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "distribution_manifest_items_authenticated"
  ON distribution_manifest_items FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ── RPC: próximo número de manifesto ────────────────────────
-- Sequência global simples (não por loja), formatada com zero-padding.
-- Mesmo mecanismo atômico de get_next_manufacturer_code (UPDATE ...
-- RETURNING numa linha de controle única).
CREATE TABLE IF NOT EXISTS distribution_manifest_seq (
  id       INTEGER PRIMARY KEY DEFAULT 1,
  next_seq INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT distribution_manifest_seq_single_row CHECK (id = 1)
);
INSERT INTO distribution_manifest_seq (id, next_seq) VALUES (1, 1)
  ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION get_next_distribution_manifest_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  UPDATE distribution_manifest_seq
  SET next_seq = next_seq + 1
  WHERE id = 1
  RETURNING next_seq - 1 INTO v_seq;

  RETURN 'DIST-' || lpad(v_seq::text, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION get_next_distribution_manifest_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_next_distribution_manifest_number() TO authenticated;

-- Cria a tabela supplier_units caso não exista
-- Execute no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS supplier_units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  unit_name   TEXT NOT NULL,
  multiplier  NUMERIC NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

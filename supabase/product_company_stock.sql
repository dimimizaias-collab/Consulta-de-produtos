-- ============================================================
-- Estoque & Preço por Empresa — Inventory
-- Execute este script no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS product_company_stock (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  company_id         UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  count              INTEGER     NOT NULL DEFAULT 0,
  price              NUMERIC(12,2) NOT NULL DEFAULT 0,
  price_received_date DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_product_company_stock_product_id ON product_company_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_product_company_stock_company_id ON product_company_stock(company_id);

ALTER TABLE product_company_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_company_stock_all"
  ON product_company_stock FOR ALL USING (true) WITH CHECK (true);

-- Marca a nota como já processada para estoque, evitando incremento duplicado
-- se a nota for salva/reaprovada de novo depois de já ter somado a quantidade.
ALTER TABLE review_notes
  ADD COLUMN IF NOT EXISTS stock_applied_at TIMESTAMPTZ;

-- ============================================================
-- Migração inicial: replica price/count atuais de cada produto
-- como a linha da PRIMEIRA empresa cadastrada (empresa mais antiga).
-- Rode isso DEPOIS de já ter pelo menos uma empresa em "companies".
-- ============================================================
INSERT INTO product_company_stock (product_id, company_id, count, price, price_received_date)
SELECT p.id, c.id, COALESCE(p.count, 0), COALESCE(p.price, 0), p.price_received_date
FROM products p
CROSS JOIN LATERAL (
  SELECT id FROM companies ORDER BY created_at ASC LIMIT 1
) c
ON CONFLICT (product_id, company_id) DO NOTHING;

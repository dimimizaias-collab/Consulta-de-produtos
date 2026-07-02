-- EANs adicionais por produto (além do EAN principal em products.ean),
-- cada um com uma descrição opcional (ex.: "código da embalagem").
CREATE TABLE IF NOT EXISTS product_ean_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ean         TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_ean_codes_ean_idx ON product_ean_codes(ean);
CREATE INDEX IF NOT EXISTS product_ean_codes_product_id_idx ON product_ean_codes(product_id);

-- Único por produto (não global): dados legados já têm EANs duplicados entre
-- produtos diferentes; um UNIQUE global quebraria o backfill.
CREATE UNIQUE INDEX IF NOT EXISTS product_ean_codes_product_ean_uniq ON product_ean_codes(product_id, ean);

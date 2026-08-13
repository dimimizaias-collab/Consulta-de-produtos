-- Produto Mãe (embalagem/caixa) — entidade leve, separada de "products",
-- vinculada a um produto filho. Não tem Empresa/Preço/Marca: é global e
-- não é vendida diretamente.
CREATE TABLE IF NOT EXISTS product_mother_packages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id      UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  sku              TEXT,
  name             TEXT NOT NULL,
  ean              TEXT,
  image            TEXT,
  location         TEXT,
  category         TEXT,
  subcategory      TEXT,
  units_per_child  INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_mother_packages_child_idx ON product_mother_packages(child_product_id);
CREATE INDEX IF NOT EXISTS product_mother_packages_ean_idx ON product_mother_packages(ean);
CREATE INDEX IF NOT EXISTS product_mother_packages_supplier_idx ON product_mother_packages(supplier_id);

-- EANs adicionais da embalagem-mãe (fabricante troca o código de barras da caixa).
CREATE TABLE IF NOT EXISTS product_mother_package_ean_codes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mother_package_id  UUID NOT NULL REFERENCES product_mother_packages(id) ON DELETE CASCADE,
  ean                TEXT NOT NULL,
  description        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_mother_package_ean_codes_ean_idx ON product_mother_package_ean_codes(ean);
CREATE UNIQUE INDEX IF NOT EXISTS product_mother_package_ean_codes_uniq ON product_mother_package_ean_codes(mother_package_id, ean);

-- Dicionário do Fornecedor: um mapeamento (código/descrição do fornecedor)
-- pode apontar para um Produto Mãe em vez de direto para o produto filho.
-- Regra de uso: preencher apenas um dos dois (internal_product_id OU mother_package_id).
ALTER TABLE supplier_mappings ADD COLUMN IF NOT EXISTS mother_package_id UUID REFERENCES product_mother_packages(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS supplier_mappings_mother_package_idx ON supplier_mappings(mother_package_id);

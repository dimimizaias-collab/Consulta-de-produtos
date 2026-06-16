-- Permite SKU em branco (NULL) e reaproveitamento do mesmo SKU em mais de um produto.
-- Remove a constraint UNIQUE além de garantir que a coluna aceite NULL.
ALTER TABLE products ALTER COLUMN sku DROP NOT NULL;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;

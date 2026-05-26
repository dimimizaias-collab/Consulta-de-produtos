-- Permite que a coluna SKU seja nula em produtos criados sem SKU.
-- O PostgreSQL trata múltiplos NULLs como distintos na constraint UNIQUE,
-- então a unicidade de SKUs preenchidos continua garantida.
ALTER TABLE products ALTER COLUMN sku DROP NOT NULL;

-- Fase 0-3 do plano de Análise de Produtos — rodar uma vez no SQL Editor do Supabase.
-- Idempotente: usa IF NOT EXISTS, então pode ser executado mais de uma vez sem erro.

-- Fase 0/1: Estoque Mínimo em products
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock integer;

-- Fase 3: registro de cada planilha de vendas importada
CREATE TABLE IF NOT EXISTS sales_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  sale_date text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  unmatched_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'applied',
  employee_id uuid REFERENCES hr_employees(id),
  employee_name text,
  created_at timestamp DEFAULT now()
);

-- Fase 3: linha a linha de cada planilha importada (inclusive as não identificadas)
CREATE TABLE IF NOT EXISTS sales_import_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES sales_imports(id),
  product_id uuid REFERENCES products(id),
  raw_sku text,
  raw_ean text,
  raw_description text,
  quantity_sold integer NOT NULL,
  matched boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now()
);

-- Fase 2: trilha de auditoria de todo ajuste de estoque (manual ou por importação de vendas)
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  previous_count integer NOT NULL,
  new_count integer NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  note text,
  source text NOT NULL DEFAULT 'manual',
  sales_import_id uuid REFERENCES sales_imports(id),
  employee_id uuid REFERENCES hr_employees(id),
  employee_name text,
  created_at timestamp DEFAULT now()
);

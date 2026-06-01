CREATE TABLE IF NOT EXISTS ean_problems (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ean         TEXT NOT NULL,
  descricao   TEXT NOT NULL CHECK (descricao IN ('Não lê', 'Sem código', 'Outro')),
  observacao  TEXT,
  source      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ean_problems_ean_idx ON ean_problems(ean);

-- Review Notes — Notas Digitalizadas (Entrada de Mercadoria)
-- Execute no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS review_notes (
  id            TEXT        PRIMARY KEY,
  timestamp_label TEXT      NOT NULL,
  file_name     TEXT        NOT NULL,
  item_count    INT         NOT NULL DEFAULT 0,
  verified_count INT        NOT NULL DEFAULT 0,
  items         JSONB       NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE review_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_notes_all"
  ON review_notes FOR ALL USING (true) WITH CHECK (true);

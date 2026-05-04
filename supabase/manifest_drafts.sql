-- Manifest Drafts — Rascunhos do Create Manifest
-- Execute no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS manifest_drafts (
  id          TEXT        PRIMARY KEY,
  label       TEXT        NOT NULL,
  saved_at    TEXT        NOT NULL,
  supplier_id TEXT,
  rows        JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE manifest_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manifest_drafts_all"
  ON manifest_drafts FOR ALL USING (true) WITH CHECK (true);

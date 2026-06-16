-- ============================================================
-- Recursos Humanos — Calendário de Planejamento
-- Execute este script no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS hr_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  data         DATE        NOT NULL,
  titulo       TEXT        NOT NULL,
  descricao    TEXT,
  categoria    TEXT        NOT NULL DEFAULT 'Outro' CHECK (categoria IN ('Reunião', 'Treinamento', 'Férias', 'Aniversário', 'Outro')),
  responsavel  TEXT,
  cor          TEXT        NOT NULL DEFAULT '#4F46E5',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_events_data ON hr_events(data);

ALTER TABLE hr_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_events_all"
  ON hr_events FOR ALL USING (true) WITH CHECK (true);

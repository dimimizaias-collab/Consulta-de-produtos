-- Tabela de notificações do sistema
CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL DEFAULT 'note_approved',
  title        TEXT NOT NULL,
  body         TEXT,
  note_id      UUID,
  note_file_name TEXT,
  read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_read
  ON notifications(read)
  WHERE read = FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON notifications(created_at DESC);

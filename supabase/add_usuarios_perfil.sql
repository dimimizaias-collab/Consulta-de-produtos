-- ============================================================
-- Perfil de usuário: nome de usuário (login alternativo) e avatar
-- Execute este script no SQL Editor do Supabase
-- ============================================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_username_key'
  ) THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_username_key UNIQUE (username);
  END IF;
END $$;

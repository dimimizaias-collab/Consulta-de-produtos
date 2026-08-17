-- ============================================================
-- Corrige tabelas 'usuarios' criadas antes da coluna 'email' existir
-- Execute este script no SQL Editor do Supabase
-- ============================================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE usuarios u
SET email = a.email
FROM auth.users a
WHERE u.auth_user_id = a.id AND u.email IS NULL;

ALTER TABLE usuarios ALTER COLUMN email SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_email_key'
  ) THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_email_key UNIQUE (email);
  END IF;
END $$;

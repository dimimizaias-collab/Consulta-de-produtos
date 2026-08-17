-- ============================================================
-- Usuários do sistema (login) — vínculo com auth.users e hr_employees
-- Execute este script no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id   UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id    UUID        NOT NULL UNIQUE REFERENCES hr_employees(id) ON DELETE RESTRICT,
  email          TEXT        NOT NULL UNIQUE, -- espelha auth.users.email, evita chamada à Admin API só pra listar
  role           TEXT        NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'gerente', 'estoque', 'caixa')),
  ativo          BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_employee_id ON usuarios(employee_id);

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- Fase 1: leitura liberada pra qualquer usuário autenticado (a tela de Segurança
-- lista/gerencia usuários; escrita fica restrita ao service role usado pela API
-- de administração, que será criada na Fase 3).
CREATE POLICY "usuarios_select_authenticated"
  ON usuarios FOR SELECT USING (auth.role() = 'authenticated');

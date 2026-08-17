-- ============================================================
-- RLS real: fecha o acesso anonimo em TODAS as tabelas de public
-- Execute este script no SQL Editor do Supabase
--
-- Ate aqui, praticamente toda tabela tinha policy "USING (true)
-- WITH CHECK (true)" (ou nem tinha RLS habilitado) — ou seja,
-- qualquer requisicao com a anon key acessava tudo, logada ou nao.
-- Este script troca isso por "precisa estar autenticado" em cada
-- tabela do schema public, automaticamente (nao depende de listar
-- tabela por tabela na mao).
--
-- A tabela 'usuarios' fica de fora de proposito: ela ja tem sua
-- policy propria (so SELECT para autenticado; INSERT/UPDATE/DELETE
-- so pela service role, usada pela API /api/usuarios). Aplicar a
-- policy generica nela destravaria escrita direta pelo client.
--
-- O service role (usado nas rotas server-side via supabaseAdmin)
-- ignora RLS por padrao no Supabase, entao nada muda pra ele.
-- ============================================================

DO $$
DECLARE
  tbl RECORD;
  pol RECORD;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'usuarios'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);

    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl.tablename
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, tbl.tablename);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY "%s_authenticated" ON public.%I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'');',
      tbl.tablename, tbl.tablename
    );
  END LOOP;
END $$;

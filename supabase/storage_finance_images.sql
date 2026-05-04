-- Storage bucket para imagens de contas bancárias
-- Execute no SQL Editor do Supabase

-- 1. Criar o bucket público (se ainda não existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'finance-images',
  'finance-images',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Políticas de acesso (remover antigas antes de recriar)
DROP POLICY IF EXISTS "finance_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "finance_images_select" ON storage.objects;
DROP POLICY IF EXISTS "finance_images_update" ON storage.objects;
DROP POLICY IF EXISTS "finance_images_delete" ON storage.objects;

CREATE POLICY "finance_images_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'finance-images');

CREATE POLICY "finance_images_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'finance-images');

CREATE POLICY "finance_images_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'finance-images');

CREATE POLICY "finance_images_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'finance-images');

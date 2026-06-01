-- Adiciona campo note_type para distinguir tipos de notas
ALTER TABLE review_notes
ADD COLUMN IF NOT EXISTS note_type TEXT DEFAULT 'supplier_import';
COMMENT ON COLUMN review_notes.note_type IS 'supplier_import | bulk_products';

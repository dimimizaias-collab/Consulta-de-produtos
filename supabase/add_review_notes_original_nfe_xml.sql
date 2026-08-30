-- ============================================================
-- XML original da NFe (autorizada pela SEFAZ) anexado à nota, usado
-- como template para gerar um XML corrigido (medida/qtd. traduzidas,
-- acréscimos/descontos já embutidos no custo, unidades distribuídas
-- descontadas) pronto para importar no PDV.
-- Execute este script no SQL Editor do Supabase
-- ============================================================

ALTER TABLE review_notes
  ADD COLUMN IF NOT EXISTS original_nfe_xml TEXT;

-- ============================================================
-- Dados fiscais da loja (Inscrição Estadual + endereço estruturado) —
-- necessários para preencher o bloco <emit>/<enderEmit> de um XML de
-- NFe (ex: XML de transferência gerado ao enviar Distribuição para
-- outra loja). O campo `address` (texto livre) continua existindo
-- para exibição, mas o XML fiscal exige logradouro/número/bairro/
-- município/UF/CEP separados, além do código IBGE do município.
-- Execute este script no SQL Editor do Supabase
-- ============================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS ie TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logradouro TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS complemento TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS municipio TEXT;
-- Código do município no IBGE (7 dígitos) — exigido na tag <cMun> da NFe.
-- Não há como derivar automaticamente sem uma tabela de municípios; o
-- usuário precisa preencher manualmente (consulta em https://www.ibge.gov.br/explica/codigos-dos-municipios.php).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS municipio_ibge TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS uf TEXT;

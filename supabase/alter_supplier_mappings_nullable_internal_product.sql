-- Um mapeamento do Dicionário do Fornecedor pode passar a apontar só para
-- mother_package_id (embalagem/Produto Mãe) em vez de internal_product_id
-- (produto normal) — regra: preencher apenas um dos dois. Isso exige que
-- internal_product_id deixe de ser obrigatório.
ALTER TABLE supplier_mappings ALTER COLUMN internal_product_id DROP NOT NULL;

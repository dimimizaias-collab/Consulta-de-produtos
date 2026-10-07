-- Migration: Distribuição com itens pendentes de vínculo
-- Execute no Supabase SQL Editor
--
-- Permite enviar a distribuição de uma nota com itens ainda "Não Encontrado" (sem produto do
-- cadastro). Esses itens entram no manifesto com product_id NULL ("pendentes de vínculo") e são
-- resolvidos dentro do manifesto (Vincular ao Dicionário / Criar Novo Produto). A aprovação do
-- recebimento (que lança estoque por produto) fica bloqueada enquanto houver item sem produto.
--
-- source_note_item_idx guarda de qual linha da nota (review_notes.items[idx]) o item veio —
-- usado para mostrar o EAN atual da nota, vincular a linha da nota junto e calcular o
-- "Ratear pela distribuição" pelo custo da própria linha.

ALTER TABLE distribution_manifest_items ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE distribution_manifest_items
  ADD COLUMN IF NOT EXISTS source_note_item_idx INT;

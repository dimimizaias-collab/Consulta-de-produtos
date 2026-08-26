# Distribuição — Pendências

Feature "Distribuição" (aba na página Entrada de Mercadoria — transferência de mercadoria entre lojas). Implementação das Fases 1-8 concluída e publicada. Este arquivo registra o que ficou **fora do escopo desta entrega**, decidido deliberadamente ao longo do planejamento, para retomar quando fizer sentido.

Contexto/decisões completas da feature: ver histórico de commits `feat(distribuicao): fase N - ...` a partir de `585d1e4`.

## 1. Confirmação de recebimento real pela loja destino

Hoje o fluxo para em "Pedido Enviado" (irreversível). Não existe uma etapa em que a loja destino confirma o que de fato chegou, nem tratamento de divergência (item quebrado, faltando, quantidade errada).

Decisão registrada durante o planejamento: qualquer erro no envio (produto errado, quantidade a mais/menos, item faltando) deve ser tratado **nesse fluxo de recebimento**, não por reabertura do manifesto original (que foi deliberadamente marcado como não-reversível). Ou seja, esta pendência não é opcional — o sistema hoje não tem onde registrar esse tipo de correção.

Precisa de: novo status (`recebido`? `recebido_com_divergencia`?), tela/aba de confirmação do lado da loja destino, e provavelmente é o gatilho natural para a Pendência 2 (efeito real em estoque).

## 2. Efeito em estoque real (`product_company_stock.count`)

Decisão da Etapa 1 (opção 2-A): por enquanto o manifesto **não movimenta estoque** — é só registro/relatório. Ficou definido que isso seria retomado quando a Pendência 1 (confirmação de recebimento) fosse implementada, já que faz mais sentido decrementar a origem e incrementar o destino no momento da confirmação real de recebimento, não no envio.

## 3. Suporte mobile

Toda a feature (aba + modal de Manifesto) é desktop-only por decisão explícita — a versão mobile só mostra "Disponível apenas no desktop". Nenhum mockup mobile foi desenhado.

## 4. Filtro por coluna na tabela de manifestos

O botão "Filtrar colunas" na aba Distribuição existe visualmente mas está `disabled` (tooltip "em breve") — a tabela de notas tem esse filtro funcional, a de manifestos não. Reaproveitar o mesmo mecanismo (`columnFilters`, `getColumnUniqueValues`) generalizado pra `DistributionManifest` seria o caminho.

## 5. Aba "Rascunhos" — remoção definitiva

O mockup aprovado da tab bar já não mostra mais "Rascunhos" (posicionamento final: Notas → Distribuição → Dicionário → Fornecedores → Fabricantes), mas o código manteve a aba funcionando normalmente, só reposicionada pro final — a remoção real do código (e da lógica de `bulkDrafts`) nunca foi decidida, só ficou marcada como pendência.

## 6. Vínculo usuário ↔ empresa

Não existe hoje nenhuma coluna `company_id` em `usuarios`/`hr_employees`. Por causa disso, o campo "Empresa Origem" do manifesto é 100% manual (sem pré-preenchimento pela loja do usuário logado) — decisão 1B-final da Etapa 1. Se um dia esse vínculo for criado (provavelmente pra mais telas do sistema, não só Distribuição), dá pra voltar e pré-popular a origem automaticamente.

## 7. Custo de produtos criados via "Criar e Vincular" dentro do manifesto

Produto novo criado direto na busca da aba Produtos nasce com `product_company_stock.cost_price = 0` (nunca teve nota aprovada) — o usuário precisa preencher o custo manualmente no card antes de confirmar. Não é bug, é a mesma limitação estrutural que motivou o backfill (`supabase/backfill_product_company_stock_cost_price.sql`): custo só existe onde uma nota já foi aprovada ou onde alguém editou manualmente via "Editar Produto".

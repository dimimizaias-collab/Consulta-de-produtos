// Estabelecimentos do Controle Financeiro. É só um texto gravado em
// finance_transactions.estabelecimento — independente da tabela `companies`
// (que gera tabela de preços/estoque), então "Pessoal" não cria loja nenhuma.

/** Lojas de verdade (com notas, fornecedores, estoque). */
export const STORE_ESTABLISHMENTS = ['Castelo Real', 'Universo do R$1,99'];

/** Conta pessoal — separa gastos/entradas pessoais das movimentações das lojas. */
export const PERSONAL_ESTABLISHMENT = 'Pessoal';

/** Todas as opções do campo "Estabelecimento" no financeiro. */
export const ESTABLISHMENTS = [...STORE_ESTABLISHMENTS, PERSONAL_ESTABLISHMENT];

// Estabelecimentos do Controle Financeiro. É só um texto gravado em
// finance_transactions.estabelecimento. A lista vem das empresas cadastradas em
// Configurações › Dados (tabela `companies`) + a conta "Pessoal", que não é empresa
// (não cria tabela de preços/estoque) — ver hooks/useFinanceEstablishments.ts.

/** Lojas que já existiam antes da lista vir do cadastro — usadas até as empresas carregarem. */
export const STORE_ESTABLISHMENTS = ['Castelo Real', 'Universo do R$1,99'];

/** Conta pessoal — separa gastos/entradas pessoais das movimentações das lojas. */
export const PERSONAL_ESTABLISHMENT = 'Pessoal';

/** Lista padrão (fallback enquanto as empresas não carregam). */
export const ESTABLISHMENTS = [...STORE_ESTABLISHMENTS, PERSONAL_ESTABLISHMENT];

// Empresas cadastradas cujo nome contém estas palavras usam o nome antigo do financeiro,
// para não "separar" as movimentações já gravadas (ex.: "Universo do 1,99" → "Universo do R$1,99").
const ALIASES: [string, string][] = [['universo', 'Universo do R$1,99'], ['castelo', 'Castelo Real']];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Nome do estabelecimento financeiro para uma empresa do cadastro. */
export function estabelecimentoDaEmpresa(nomeFantasia: string): string {
  const n = norm(nomeFantasia);
  return ALIASES.find(([chave]) => n.includes(chave))?.[1] ?? nomeFantasia.trim();
}

/** Lojas (empresas cadastradas, sem repetição) — sem a conta Pessoal. */
export function lojasDasEmpresas(nomesFantasia: string[]): string[] {
  const out: string[] = [];
  const vistos = new Set<string>();
  const add = (nome: string) => {
    const k = norm(nome);
    if (!k || k === norm(PERSONAL_ESTABLISHMENT) || vistos.has(k)) return;
    vistos.add(k);
    out.push(nome);
  };
  STORE_ESTABLISHMENTS.forEach(add);
  [...nomesFantasia].map(estabelecimentoDaEmpresa).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(add);
  return out;
}

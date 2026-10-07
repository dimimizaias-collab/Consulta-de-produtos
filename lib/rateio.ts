// Rateio de uma movimentação entre estabelecimentos.
//
// Cada parte vira uma movimentação própria em finance_transactions (com o estabelecimento
// e o valor dela), todas ligadas pelo mesmo rateio_id — assim a DRE, os filtros e o
// seletor de empresa continuam funcionando sem mudança. A tabela junta as partes numa
// linha só; pagar/excluir/editar valem para o grupo inteiro.

import type { Transaction } from '@/types/finance';

export type RateioModo = 'igual' | 'pct' | 'valor';

export interface RateioLinha {
  estab: string;
  pct: number;    // usado no modo 'pct'
  valor: number;  // usado no modo 'valor'
}

export interface RateioState {
  on: boolean;
  modo: RateioModo;
  linhas: RateioLinha[];
}

export interface RateioCalculado {
  linhas: { estab: string; pct: number; valor: number }[];
  soma: number;
  diferenca: number;   // total − soma (positivo = falta, negativo = passou)
  fechado: boolean;
  erro: string | null; // problema que impede salvar (além da diferença)
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const rateioVazio = (estabs: string[]): RateioState => ({
  on: false,
  modo: 'igual',
  linhas: estabs.slice(0, 2).map(estab => ({ estab, pct: 0, valor: 0 })),
});

/** Valor e % de cada estabelecimento para o total informado, conforme o modo. */
export function calcularRateio(state: RateioState, total: number): RateioCalculado {
  const n = state.linhas.length;
  let linhas: { estab: string; pct: number; valor: number }[];
  if (state.modo === 'igual') {
    const base = n ? Math.floor((total / n) * 100) / 100 : 0;
    linhas = state.linhas.map((l, i) => {
      const valor = i === n - 1 ? round2(total - base * (n - 1)) : base;
      return { estab: l.estab, valor, pct: total ? (valor / total) * 100 : 0 };
    });
  } else if (state.modo === 'pct') {
    const somaPct = state.linhas.reduce((a, l) => a + (l.pct || 0), 0);
    const fecha100 = Math.abs(somaPct - 100) < 0.001;
    let acc = 0;
    linhas = state.linhas.map((l, i) => {
      // Com 100% exatos, a última linha absorve os centavos do arredondamento
      const valor = fecha100 && i === n - 1 ? round2(total - acc) : round2((total * (l.pct || 0)) / 100);
      acc = round2(acc + valor);
      return { estab: l.estab, valor, pct: l.pct || 0 };
    });
  } else {
    linhas = state.linhas.map(l => ({ estab: l.estab, valor: round2(l.valor || 0), pct: total ? ((l.valor || 0) / total) * 100 : 0 }));
  }
  const soma = round2(linhas.reduce((a, l) => a + l.valor, 0));
  const diferenca = round2(total - soma);
  const estabs = linhas.map(l => l.estab);
  let erro: string | null = null;
  if (n < 2) erro = 'Escolha pelo menos 2 estabelecimentos.';
  else if (estabs.some(e => !e)) erro = 'Escolha o estabelecimento de cada linha.';
  else if (new Set(estabs).size !== n) erro = 'Cada estabelecimento só pode aparecer uma vez.';
  else if (linhas.some(l => l.valor <= 0)) erro = 'Cada estabelecimento precisa ter um valor maior que zero.';
  return { linhas, soma, diferenca, fechado: Math.abs(diferenca) < 0.005 && !erro, erro };
}

/** Divide `valor` proporcionalmente aos pesos; a última parte absorve os centavos. */
export function dividirValor(valor: number, pesos: number[]): number[] {
  const somaPesos = pesos.reduce((a, p) => a + p, 0);
  if (!somaPesos) return pesos.map(() => 0);
  let acc = 0;
  return pesos.map((p, i) => {
    const v = i === pesos.length - 1 ? round2(valor - acc) : round2((valor * p) / somaPesos);
    acc = round2(acc + v);
    return v;
  });
}

/** Rateio pode ser usado nesta movimentação? (cartão, salário do RH e importadas ficam de fora) */
export const rateioPermitido = (tipoPagamento: string, origem?: string | null, isFatura?: boolean) =>
  tipoPagamento !== 'Crédito' && (!origem || origem === 'manual') && !isFatura;

/** Agrupa as partes de cada rateio (ordenadas pela ordem do rateio). */
export function agruparRateios(transactions: Transaction[]): Map<string, Transaction[]> {
  const m = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.rateio_id) continue;
    const arr = m.get(t.rateio_id);
    if (arr) arr.push(t); else m.set(t.rateio_id, [t]);
  }
  for (const arr of m.values()) arr.sort((a, b) => (a.rateio_ordem ?? 0) - (b.rateio_ordem ?? 0));
  return m;
}

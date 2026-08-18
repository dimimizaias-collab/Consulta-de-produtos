// Regras de fechamento/vencimento de fatura de cartão de crédito.
// Função pura, sem dependência de React/Supabase — usada tanto pelo desktop
// (FinanceManager.tsx) quanto pelo mobile (MobileFinancePage.tsx).

export interface FaturaCardInfo {
  dia_fechamento: number; // 1-31
  dia_vencimento: number; // 1-31
}

export interface FaturaResult {
  /** Primeiro dia do mês/ano de referência da fatura (ex: "2026-08-01"). */
  periodo: string;
  /** Data de vencimento efetiva da fatura (ex: "2026-08-26"). */
  vencimento: string;
}

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** Garante que o dia caiba no mês (ex: dia 31 em fevereiro vira o último dia do mês). */
function clampDay(year: number, month0: number, day: number): number {
  return Math.min(day, daysInMonth(year, month0));
}

function toISODate(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Calcula a fatura (período de referência + data de vencimento) à qual uma
 * compra de cartão de crédito pertence.
 *
 * - `dataCompraISO`: data da compra no formato "YYYY-MM-DD".
 * - `card`: dia de fechamento e de vencimento configurados no cartão.
 * - `parcelaIndex`: 0 para a 1ª parcela (ou compra à vista), 1 para a 2ª, etc.
 *   Cada parcela subsequente cai na fatura do mês seguinte à parcela anterior.
 *
 * Regra de fechamento: compras feitas *depois* do dia de fechamento vão para a
 * fatura do mês seguinte (compras no próprio dia de fechamento ainda entram na
 * fatura corrente).
 *
 * Regra de vencimento: se o dia de vencimento configurado for menor que o dia
 * de fechamento, o vencimento cai no mês seguinte ao mês de referência da
 * fatura (ex: fecha dia 25, vence dia 5 do mês seguinte). Caso contrário,
 * vencimento e fechamento caem no mesmo mês de referência.
 */
export function calcularFatura(dataCompraISO: string, card: FaturaCardInfo, parcelaIndex = 0): FaturaResult {
  const [y, m, d] = dataCompraISO.split('-').map(Number);
  let year = y;
  let month0 = m - 1;

  // 1) mês-âncora da fatura, pela regra de fechamento
  if (d > card.dia_fechamento) {
    month0 += 1;
  }

  // 2) parcelas seguintes avançam um mês cada
  month0 += parcelaIndex;

  // normaliza overflow/underflow de mês
  year += Math.floor(month0 / 12);
  month0 = ((month0 % 12) + 12) % 12;

  const periodo = toISODate(year, month0, 1);

  // 3) mês do vencimento em relação ao mês de referência da fatura
  let dueYear = year;
  let dueMonth0 = month0;
  if (card.dia_vencimento < card.dia_fechamento) {
    dueMonth0 += 1;
    if (dueMonth0 > 11) { dueMonth0 = 0; dueYear += 1; }
  }
  const dueDay = clampDay(dueYear, dueMonth0, card.dia_vencimento);
  const vencimento = toISODate(dueYear, dueMonth0, dueDay);

  return { periodo, vencimento };
}

/**
 * Distribui um valor total em N parcelas, arredondadas em centavos, jogando
 * a diferença de arredondamento na última parcela (padrão contábil comum).
 */
export function dividirParcelas(valorTotal: number, totalParcelas: number): number[] {
  const centavosTotal = Math.round(valorTotal * 100);
  const base = Math.floor(centavosTotal / totalParcelas);
  const resto = centavosTotal - base * totalParcelas;
  return Array.from({ length: totalParcelas }, (_, i) => (i === totalParcelas - 1 ? base + resto : base) / 100);
}

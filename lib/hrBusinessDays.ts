// Cálculo de dia útil para a data de pagamento de salário (RH).
// Dia útil = segunda a sábado, exceto as datas cadastradas em hr_feriados.

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isBusinessDay(d: Date, feriados: Set<string>): boolean {
  if (d.getDay() === 0) return false; // domingo
  return !feriados.has(toIsoDate(d));
}

// Retorna a data do n-ésimo dia útil do mês (ano, mes 1-12), contando a partir do dia 1.
// Se o mês não tiver dias úteis suficientes, cai no último dia útil do mês.
export function nthBusinessDay(ano: number, mes: number, n: number, feriados: Set<string>): Date {
  const daysInMonth = new Date(ano, mes, 0).getDate();
  let count = 0;
  let lastBusinessDay: Date | null = null;

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(ano, mes - 1, day);
    if (isBusinessDay(d, feriados)) {
      count++;
      lastBusinessDay = d;
      if (count === n) return d;
    }
  }

  return lastBusinessDay ?? new Date(ano, mes - 1, daysInMonth);
}

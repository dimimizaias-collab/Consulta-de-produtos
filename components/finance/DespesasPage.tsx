'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Expense {
  id: string;
  favorecido: string;
  estabelecimento: string;
  valor_final: number;
  vencimento: string; // ISO date string
  tipo_pagamento: string;
  pago: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const DAYS_PT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoToLocal(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

// ── Calendar Component ────────────────────────────────────────────────────────

interface CalRange { start: Date | null; end: Date | null }

interface CalendarWidgetProps {
  range: CalRange;
  expenses: Expense[];
  onRangeChange: (r: CalRange) => void;
}

function CalendarWidget({ range, expenses, onRangeChange }: CalendarWidgetProps) {
  const [viewDate, setViewDate] = useState(() => {
    const d = today();
    d.setDate(1);
    return d;
  });
  const [hoveredDay, setHoveredDay] = useState<Date | null>(null);
  const [selecting, setSelecting] = useState(false);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  // Build calendar grid (6 rows × 7 cols = 42 cells)
  const cells: { date: Date; current: boolean }[] = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push({ date: new Date(year, month - 1, daysInPrev - firstDay + 1 + i), current: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), current: true });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), current: false });
  }

  // Expense date set for dot indicators
  const expenseDateMap = useMemo(() => {
    const t = today();
    const map: Record<string, 'overdue' | 'soon' | 'future'> = {};
    expenses.forEach(e => {
      const d = isoToLocal(e.vencimento);
      const key = d.toDateString();
      const diff = Math.ceil((d.getTime() - t.getTime()) / 86400000);
      if (diff < 0) map[key] = 'overdue';
      else if (diff <= 7) map[key] = map[key] === 'overdue' ? 'overdue' : 'soon';
      else map[key] = map[key] ?? 'future';
    });
    return map;
  }, [expenses]);

  const handleDayClick = (date: Date) => {
    if (!selecting || !range.start) {
      onRangeChange({ start: date, end: null });
      setSelecting(true);
    } else {
      const [s, e] = date < range.start
        ? [date, range.start]
        : [range.start, date];
      onRangeChange({ start: s, end: e });
      setSelecting(false);
    }
  };

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const isInRange = (d: Date) => {
    const end = range.end ?? hoveredDay;
    if (!range.start || !end) return false;
    const [s, e] = end < range.start ? [end, range.start] : [range.start, end];
    return d > s && d < e;
  };
  const isRangeStart = (d: Date) => range.start ? sameDay(d, range.start) : false;
  const isRangeEnd = (d: Date) => {
    const end = range.end ?? (selecting ? hoveredDay : null);
    return end ? sameDay(d, end) : false;
  };

  return (
    <div className="select-none border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
      {/* Month nav */}
      <div className="h-[30px] flex items-center border-b border-[#E0D8BF] dark:border-white/[0.10]">
        <button
          onClick={prevMonth}
          title="Mês anterior"
          className="w-[30px] h-full flex items-center justify-center border-r border-[#E0D8BF] dark:border-white/[0.10] text-on-surface/50 hover:text-on-surface hover:bg-on-surface/[0.05] transition-colors"
        >
          <ChevronLeft size={13} strokeWidth={2.5} />
        </button>
        <span className="flex-1 text-center text-[12px] font-black text-on-surface">
          {MONTHS_PT[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          title="Próximo mês"
          className="w-[30px] h-full flex items-center justify-center border-l border-[#E0D8BF] dark:border-white/[0.10] text-on-surface/50 hover:text-on-surface hover:bg-on-surface/[0.05] transition-colors"
        >
          <ChevronRight size={13} strokeWidth={2.5} />
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 bg-[#FFEC4D] shadow-[inset_0_-1.5px_0_#8F7E10]">
        {DAYS_PT.map((d, i) => (
          <div key={i} className="h-[22px] flex items-center justify-center text-[9px] font-black text-[rgba(26,26,10,0.55)]">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const isStart = isRangeStart(cell.date);
          const isEnd = isRangeEnd(cell.date);
          const inRange = isInRange(cell.date);
          const isToday = sameDay(cell.date, today());
          const dot = expenseDateMap[cell.date.toDateString()];

          return (
            <button
              key={i}
              onClick={() => handleDayClick(cell.date)}
              onMouseEnter={() => selecting && setHoveredDay(cell.date)}
              onMouseLeave={() => selecting && setHoveredDay(null)}
              className={cn(
                'relative aspect-square flex items-center justify-center font-mono text-[11.5px] transition-colors duration-[120ms]',
                !cell.current && 'opacity-30',
                isStart || isEnd
                  ? 'bg-[#D81E1E] text-white'
                  : inRange
                    ? 'bg-[#D81E1E]/10 text-on-surface'
                    : 'text-on-surface/70 hover:bg-[#FFF8D0] dark:hover:bg-white/[0.05] hover:text-on-surface',
                isToday && !isStart && !isEnd && 'font-semibold text-on-surface shadow-[inset_0_0_0_1.5px_rgba(26,26,10,0.40)] dark:shadow-[inset_0_0_0_1.5px_rgba(242,240,227,0.40)]',
              )}
            >
              {cell.date.getDate()}
              {dot && (
                <span className={cn(
                  'absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1',
                  isStart || isEnd
                    ? 'bg-white/75'
                    : dot === 'overdue' ? 'bg-[#D81E1E]' : dot === 'soon' ? 'bg-amber-500' : 'bg-on-surface/25',
                )} />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-3 px-2.5 py-2 border-t border-[#E0D8BF] dark:border-white/[0.10]">
        {[
          { color: 'bg-[#D81E1E]', label: 'Vencida' },
          { color: 'bg-amber-500', label: 'A vencer' },
          { color: 'bg-on-surface/25', label: 'Futura' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-[5px] text-[10px] font-extrabold uppercase tracking-[0.05em] text-on-surface/55">
            <span className={cn('w-2 h-2 shrink-0', color)} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Linhas da tabela ──────────────────────────────────────────────────────────

type Urgency = 'overdue' | 'soon' | 'future';

const URGENCY_GROUP: Record<Urgency, { label: string; dot: string; total: string }> = {
  overdue: { label: 'Vencidas',        dot: 'bg-[#D81E1E]',      total: 'text-[#D81E1E]' },
  soon:    { label: 'Próximos 7 dias', dot: 'bg-amber-500',      total: 'text-[#B45309] dark:text-[#FCD34D]' },
  future:  { label: 'Mais adiante',    dot: 'bg-on-surface/25',  total: 'text-on-surface' },
};

function dueLabel(vencimento: string) {
  const diff = Math.ceil((isoToLocal(vencimento).getTime() - today().getTime()) / 86400000);
  return diff < 0
    ? `${Math.abs(diff)} dia${Math.abs(diff) > 1 ? 's' : ''} atraso`
    : diff === 0 ? 'Hoje'
    : diff === 1 ? 'Em 1 dia'
    : `Em ${diff} dias`;
}

function ExpenseGroup({ urgency, expenses }: { urgency: Urgency; expenses: Expense[] }) {
  if (expenses.length === 0) return null;
  const g = URGENCY_GROUP[urgency];
  const subtotal = expenses.reduce((s, e) => s + e.valor_final, 0);
  return (
    <>
      <tr className="bg-[#F1EAD3] dark:bg-[#181814]">
        <td colSpan={4} className="!h-7 text-[9px] font-black uppercase tracking-[0.1em] text-on-surface/55">
          <span className={cn('inline-block w-2 h-2 mr-1.5', g.dot)} />
          {g.label} · {expenses.length}
        </td>
        <td className={cn('!h-7 text-right font-mono text-[11.5px] font-medium', g.total)}>{fmt(subtotal)}</td>
      </tr>
      {expenses.map((e, idx) => (
        <tr
          key={e.id}
          className={cn(
            'transition-colors hover:bg-[#FFF8D0] dark:hover:bg-white/[0.04]',
            idx % 2 === 0 ? 'bg-white dark:bg-[#252520]' : 'bg-[#FAF7EE] dark:bg-[#1E1E18]',
          )}
        >
          <td className="font-mono">{fmtDate(e.vencimento)}</td>
          <td className="font-extrabold text-on-surface max-w-[320px] truncate" title={e.favorecido || e.estabelecimento}>
            {e.favorecido || e.estabelecimento}
          </td>
          <td>
            <span className={cn(
              'inline-flex px-1.5 py-0.5 border text-[9px] font-black uppercase tracking-[0.06em]',
              urgency === 'overdue' && 'border-current text-[#D81E1E] bg-[#D81E1E]/[0.06]',
              urgency === 'soon' && 'border-current text-[#B45309] dark:text-[#FCD34D] bg-amber-500/[0.07]',
              urgency === 'future' && 'border-[#E0D8BF] dark:border-white/[0.12] text-on-surface/40',
            )}>
              {dueLabel(e.vencimento)}
            </span>
          </td>
          <td>
            <span className="inline-flex px-1.5 py-0.5 border border-[#E0D8BF] dark:border-white/[0.12] text-[10px] font-bold text-on-surface/70">
              {e.tipo_pagamento}
            </span>
          </td>
          <td className={cn(
            'text-right font-mono font-medium',
            urgency === 'overdue' ? 'text-[#D81E1E]' : urgency === 'soon' ? 'text-[#B45309] dark:text-[#FCD34D]' : 'text-on-surface',
          )}>
            {fmt(e.valor_final)}
          </td>
        </tr>
      ))}
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DespesasPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<CalRange>({ start: null, end: null });

  // Fetch unpaid expenses with a due date
  useEffect(() => {
    const fetchExpenses = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('finance_transactions')
        .select('id, favorecido, estabelecimento, valor_final, vencimento, tipo_pagamento, pago')
        .eq('tipo', 'Despesa')
        .eq('pago', false)
        .not('vencimento', 'is', null)
        .order('vencimento', { ascending: true });

      if (!error && data) {
        setExpenses(data as Expense[]);
      }
      setLoading(false);
    };
    fetchExpenses();
  }, []);

  // Filter by selected range
  const filteredExpenses = useMemo(() => {
    if (!range.start) return expenses;
    const end = range.end ?? range.start;
    return expenses.filter(e => {
      const d = isoToLocal(e.vencimento);
      return d >= range.start! && d <= addDays(end, 1);
    });
  }, [expenses, range]);

  // Group by urgency
  const { overdue, soon, future } = useMemo(() => {
    const t = today();
    const week = addDays(t, 7);
    return {
      overdue: filteredExpenses.filter(e => isoToLocal(e.vencimento) < t),
      soon:    filteredExpenses.filter(e => { const d = isoToLocal(e.vencimento); return d >= t && d <= week; }),
      future:  filteredExpenses.filter(e => isoToLocal(e.vencimento) > week),
    };
  }, [filteredExpenses]);

  // Summary totals
  const totalOverdue = useMemo(() => overdue.reduce((s, e) => s + e.valor_final, 0), [overdue]);
  const totalSoon    = useMemo(() => soon.reduce((s, e) => s + e.valor_final, 0), [soon]);
  const totalAll     = useMemo(() => filteredExpenses.reduce((s, e) => s + e.valor_final, 0), [filteredExpenses]);
  const monthExpenses = useMemo(() => {
    const t = today();
    return filteredExpenses.filter(e => { const d = isoToLocal(e.vencimento); return d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear(); });
  }, [filteredExpenses]);
  const totalMonth = useMemo(() => monthExpenses.reduce((s, e) => s + e.valor_final, 0), [monthExpenses]);

  const hasRange = range.start !== null;
  const rangeLabel = hasRange
    ? range.end
      ? `${range.start!.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} — ${range.end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`
      : range.start!.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Todo o período';

  const clearRange = useCallback(() => setRange({ start: null, end: null }), []);

  const plural = (n: number) => `${n} despesa${n === 1 ? '' : 's'}`;
  const thisMonthLabel = today().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const kpis = [
    { label: 'Total a pagar',   value: totalAll,     cls: 'text-on-surface',                     sub: plural(filteredExpenses.length) },
    { label: 'Vencidas',        value: totalOverdue, cls: 'text-[#D81E1E]',                       sub: plural(overdue.length) },
    { label: 'Próximos 7 dias', value: totalSoon,    cls: 'text-[#B45309] dark:text-[#FCD34D]',   sub: plural(soon.length) },
    { label: 'Este mês',        value: totalMonth,   cls: 'text-on-surface',                     sub: thisMonthLabel },
  ];

  return (
    <div className="space-y-2.5">
      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border-l border-t border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
        {kpis.map(k => (
          <div key={k.label} className="px-3 py-2.5 border-r border-b border-[#E0D8BF] dark:border-white/[0.10]">
            <div className="text-[9px] font-black uppercase tracking-[0.10em] text-on-surface/40">{k.label}</div>
            <div className={cn('mt-0.5 text-[16px] font-mono font-medium tabular-nums', k.cls)}>{loading ? '—' : fmt(k.value)}</div>
            <div className="text-[10.5px] font-bold text-on-surface/40">{loading ? '' : k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-2.5 items-start">
        {/* Despesas */}
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-on-surface/30">
            <Loader2 size={22} className="animate-spin" />
            <span className="text-[12px] font-bold uppercase tracking-[0.06em]">Carregando despesas…</span>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 text-center py-16 px-4 border border-dashed border-[#E0D8BF] dark:border-white/[0.12] bg-white dark:bg-[#1E1E18] text-on-surface/45">
            <Calendar size={22} className="opacity-55" />
            <p className="text-[12px] font-black uppercase tracking-[0.06em]">Nenhuma despesa encontrada</p>
            {hasRange && (
              <button onClick={clearRange} className="text-[11px] font-extrabold text-[#D81E1E] hover:underline underline-offset-2">
                Limpar período
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10] overflow-x-auto [&_td]:h-9 [&_td]:px-2.5 [&_td]:text-[12px] [&_td]:whitespace-nowrap [&_td]:border-r [&_td]:border-b [&_td]:border-[#A8A290] dark:[&_td]:border-white/20 [&_td:last-child]:border-r-0">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#FFEC4D]">
                  {[
                    { label: 'Vencimento', cls: 'w-[110px]' },
                    { label: 'Favorecido', cls: '' },
                    { label: 'Situação', cls: 'w-[130px]' },
                    { label: 'Pagamento', cls: 'w-[110px]' },
                    { label: 'Valor', cls: 'w-[130px] text-right' },
                  ].map(c => (
                    <th
                      key={c.label}
                      className={cn(
                        'h-8 px-2.5 text-left whitespace-nowrap text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] shadow-[inset_-1px_0_0_#B8A31F,inset_0_-1.5px_0_#8F7E10] last:shadow-[inset_0_-1.5px_0_#8F7E10]',
                        c.cls,
                      )}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <ExpenseGroup urgency="overdue" expenses={overdue} />
                <ExpenseGroup urgency="soon" expenses={soon} />
                <ExpenseGroup urgency="future" expenses={future} />
              </tbody>
            </table>
          </div>
        )}

        {/* Período */}
        <div className="bg-[#F1EAD3] dark:bg-[#181814] border border-[#E0D8BF] dark:border-white/[0.10] xl:sticky xl:top-[92px]">
          <div className="h-7 flex items-center gap-2 px-2.5 bg-[#FFEC4D] border-b-[1.5px] border-[#8F7E10]">
            <Calendar size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[rgba(26,26,10,0.55)]">Período</span>
          </div>
          <div className="p-2.5">
            <div className="flex items-center gap-2 px-2.5 py-2 mb-2 bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10]">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.1em] text-on-surface/40">Exibindo</p>
                <p className="font-mono text-[12.5px] font-medium text-on-surface truncate">{rangeLabel}</p>
              </div>
              {hasRange && (
                <button
                  onClick={clearRange}
                  className="ml-auto shrink-0 h-[26px] px-2 border border-[#D81E1E]/30 text-[10px] font-black uppercase tracking-[0.06em] text-[#D81E1E] hover:bg-[#D81E1E]/[0.08] active:scale-[0.96] transition-all"
                >
                  Limpar
                </button>
              )}
            </div>
            <CalendarWidget range={range} expenses={expenses} onRangeChange={setRange} />
            <p className="mt-1.5 text-[10.5px] font-semibold text-on-surface/40">
              Clique num dia para começar o período e em outro para terminar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

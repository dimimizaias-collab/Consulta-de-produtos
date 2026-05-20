'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, ChevronLeft, ChevronRight, X, ArrowLeft } from 'lucide-react';
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

interface DespesasPageProps {
  onBack: () => void;
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

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

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
    <div className="bg-surface border border-on-surface/[0.07] rounded-[22px] p-5 select-none">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-5">
        <span className="font-dm-mono text-[15px] font-semibold text-on-surface tracking-tight">
          {MONTHS_PT[month]} {year}
        </span>
        <div className="flex gap-1">
          <button
            onClick={prevMonth}
            className="w-8 h-8 rounded-[9px] bg-on-surface/[0.06] border border-on-surface/[0.07] flex items-center justify-center text-on-surface/50 hover:text-on-surface hover:bg-on-surface/10 transition-[background,color,transform] duration-150 active:scale-90"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={nextMonth}
            className="w-8 h-8 rounded-[9px] bg-on-surface/[0.06] border border-on-surface/[0.07] flex items-center justify-center text-on-surface/50 hover:text-on-surface hover:bg-on-surface/10 transition-[background,color,transform] duration-150 active:scale-90"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_PT.map((d, i) => (
          <div key={i} className="text-center text-[9px] font-bold uppercase tracking-widest text-on-surface/30 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((cell, i) => {
          const isToday = sameDay(cell.date, today());
          const isStart = isRangeStart(cell.date);
          const isEnd = isRangeEnd(cell.date);
          const inRange = isInRange(cell.date);
          const dot = expenseDateMap[cell.date.toDateString()];

          return (
            <button
              key={i}
              onClick={() => handleDayClick(cell.date)}
              onMouseEnter={() => selecting && setHoveredDay(cell.date)}
              onMouseLeave={() => selecting && setHoveredDay(null)}
              className={cn(
                'relative aspect-square rounded-[9px] flex items-center justify-center text-[12px] font-medium',
                'transition-[background,color,transform] duration-[120ms]',
                'active:scale-[0.85]',
                !cell.current && 'opacity-30',
                isToday && !isStart && !isEnd && 'bg-on-surface/[0.08] font-bold text-on-surface',
                !isStart && !isEnd && !inRange && !isToday && 'text-on-surface/60 hover:bg-on-surface/[0.06] hover:text-on-surface',
                inRange && !isStart && !isEnd && 'bg-primary/10 rounded-none text-on-surface',
                isStart && 'bg-primary text-white font-bold shadow-[0_2px_12px_rgba(216,30,30,0.4)]',
                isEnd && !isStart && 'bg-primary text-white font-bold shadow-[0_2px_12px_rgba(216,30,30,0.4)]',
              )}
            >
              {cell.date.getDate()}
              {dot && (
                <span className={cn(
                  'absolute bottom-[3px] w-[4px] h-[4px] rounded-full',
                  dot === 'overdue' && 'bg-primary shadow-[0_0_4px_rgba(216,30,30,0.8)]',
                  dot === 'soon' && 'bg-amber-400',
                  dot === 'future' && 'bg-on-surface/30',
                  (isStart || isEnd) && 'bg-white/70',
                )} />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 pt-4 border-t border-on-surface/[0.06]">
        {[
          { color: 'bg-primary shadow-[0_0_4px_rgba(216,30,30,0.7)]', label: 'Vencida' },
          { color: 'bg-amber-400', label: 'A vencer' },
          { color: 'bg-on-surface/30', label: 'Futura' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={cn('w-[6px] h-[6px] rounded-full flex-shrink-0', color)} />
            <span className="text-[10px] text-on-surface/40 font-medium">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Expense Card ──────────────────────────────────────────────────────────────

function ExpenseCard({ expense, urgency, index }: {
  expense: Expense;
  urgency: 'overdue' | 'soon' | 'future';
  index: number;
}) {
  const barColor = urgency === 'overdue' ? 'bg-primary' : urgency === 'soon' ? 'bg-amber-400' : 'bg-on-surface/20';
  const valueColor = urgency === 'overdue' ? 'text-primary' : urgency === 'soon' ? 'text-amber-400' : 'text-on-surface/50';
  const tagColor = urgency === 'overdue'
    ? 'bg-primary/15 text-red-400'
    : urgency === 'soon'
      ? 'bg-amber-400/15 text-amber-400'
      : 'bg-on-surface/[0.06] text-on-surface/40';

  const t = today();
  const d = isoToLocal(expense.vencimento);
  const diff = Math.ceil((d.getTime() - t.getTime()) / 86400000);
  const tagLabel = diff < 0
    ? `${Math.abs(diff)} dia${Math.abs(diff) > 1 ? 's' : ''} atraso`
    : diff === 0 ? 'Hoje'
    : diff === 1 ? 'Em 1 dia'
    : `Em ${diff} dias`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, ease: EASE_OUT, duration: 0.25 }}
      className="bg-surface border border-on-surface/[0.07] rounded-[18px] px-4 py-3.5 flex items-center gap-3.5 hover:bg-on-surface/[0.03] transition-[background,transform] duration-150 hover:-translate-y-px active:scale-[0.985] cursor-pointer"
    >
      {/* Urgency bar */}
      <div className={cn('w-[3px] h-11 rounded-full flex-shrink-0', barColor)} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-on-surface truncate leading-tight">
          {expense.favorecido || expense.estabelecimento}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] text-on-surface/40">Vence {fmtDate(expense.vencimento)}</span>
          <span className={cn('text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full', tagColor)}>
            {tagLabel}
          </span>
        </div>
      </div>

      {/* Amount */}
      <div className="text-right flex-shrink-0">
        <p className={cn('font-dm-mono text-[14px] font-semibold tracking-tight', valueColor)}>
          {fmt(expense.valor_final)}
        </p>
        <p className="text-[9px] text-on-surface/30 uppercase tracking-widest mt-0.5">
          {expense.tipo_pagamento}
        </p>
      </div>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DespesasPage({ onBack }: DespesasPageProps) {
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
  const totalMonth   = useMemo(() => {
    const t = today();
    return filteredExpenses
      .filter(e => { const d = isoToLocal(e.vencimento); return d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear(); })
      .reduce((s, e) => s + e.valor_final, 0);
  }, [filteredExpenses]);

  const hasRange = range.start !== null;
  const rangeLabel = hasRange
    ? range.end
      ? `${range.start!.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} — ${range.end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`
      : range.start!.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Todo o período';

  const clearRange = useCallback(() => setRange({ start: null, end: null }), []);

  return (
    <div className="flex gap-7 items-start min-h-0">

      {/* ── LEFT COLUMN ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-start gap-4">
          <button
            onClick={onBack}
            className="mt-1 w-9 h-9 rounded-full bg-on-surface/[0.06] border border-on-surface/[0.07] flex items-center justify-center text-on-surface/50 hover:text-on-surface hover:bg-on-surface/10 transition-[background,color,transform] duration-150 active:scale-90 flex-shrink-0"
            title="Voltar"
          >
            <ArrowLeft size={15} />
          </button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface/30 mb-1">
              Controle Financeiro
            </p>
            <h1 className="text-[26px] font-black text-on-surface tracking-tight leading-none font-manrope">
              Despesas <span className="text-primary">para Vencer</span>
            </h1>
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex gap-3 flex-wrap">
          {[
            { label: 'Total a pagar',    value: totalAll,     color: '' },
            { label: 'Vencidas',         value: totalOverdue, color: 'text-primary' },
            { label: 'Próximos 7 dias',  value: totalSoon,    color: 'text-amber-400' },
            { label: 'Este mês',         value: totalMonth,   color: '' },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="bg-surface border border-on-surface/[0.07] rounded-2xl px-4 py-3 min-w-[130px] hover:bg-on-surface/[0.03] transition-[background,transform] duration-150 hover:-translate-y-px"
            >
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-on-surface/30 mb-1">{label}</p>
              <p className={cn('font-dm-mono text-[17px] font-semibold tracking-tight', color || 'text-on-surface')}>
                {loading ? '—' : fmt(value)}
              </p>
            </div>
          ))}
        </div>

        {/* Expense groups */}
        {loading ? (
          <div className="flex flex-col items-center py-20 text-on-surface/20">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
            <p className="text-xs font-bold uppercase tracking-widest">Carregando despesas…</p>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-on-surface/20">
            <Calendar size={40} className="mb-3 opacity-20" />
            <p className="text-sm font-black uppercase tracking-widest">Nenhuma despesa encontrada</p>
            {hasRange && (
              <button onClick={clearRange} className="mt-3 text-xs font-bold text-primary hover:underline">
                Limpar período
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {overdue.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface/30">
                  <span className="w-[5px] h-[5px] rounded-full bg-primary shadow-[0_0_5px_rgba(216,30,30,0.8)]" />
                  Vencidas
                  <div className="flex-1 h-px bg-on-surface/[0.06]" />
                </div>
                {overdue.map((e, i) => (
                  <ExpenseCard key={e.id} expense={e} urgency="overdue" index={i} />
                ))}
              </div>
            )}

            {soon.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface/30">
                  <span className="w-[5px] h-[5px] rounded-full bg-amber-400" />
                  Próximos 7 dias
                  <div className="flex-1 h-px bg-on-surface/[0.06]" />
                </div>
                {soon.map((e, i) => (
                  <ExpenseCard key={e.id} expense={e} urgency="soon" index={i} />
                ))}
              </div>
            )}

            {future.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface/30">
                  <span className="w-[5px] h-[5px] rounded-full bg-on-surface/20" />
                  Mais adiante
                  <div className="flex-1 h-px bg-on-surface/[0.06]" />
                </div>
                {future.map((e, i) => (
                  <ExpenseCard key={e.id} expense={e} urgency="future" index={i} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── RIGHT COLUMN ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ease: EASE_OUT, duration: 0.3, delay: 0.08 }}
        className="w-[300px] flex-shrink-0 flex flex-col gap-3"
        style={{ paddingTop: '46px' }} /* Align button with page title */
      >
        {/* Selector button */}
        <button
          onClick={() => setRange({ start: null, end: null })}
          className="w-full bg-primary text-white border-none rounded-[14px] py-3.5 font-manrope text-[11px] font-bold uppercase tracking-[0.12em] flex items-center justify-center gap-2 transition-[background,transform] duration-150 hover:bg-[#b91919] active:scale-[0.97]"
        >
          <Calendar size={14} />
          Selecionar período
        </button>

        {/* Range display */}
        <div className="bg-surface border border-on-surface/[0.07] rounded-2xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-on-surface/30 mb-0.5">Exibindo</p>
            <p className="font-dm-mono text-[12.5px] font-medium text-on-surface">{rangeLabel}</p>
          </div>
          {hasRange && (
            <button
              onClick={clearRange}
              className="text-[10px] font-bold uppercase tracking-widest text-primary px-2.5 py-1.5 rounded-lg hover:bg-primary/10 transition-[background,transform] duration-150 active:scale-95 flex-shrink-0"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Calendar */}
        <CalendarWidget range={range} expenses={expenses} onRangeChange={setRange} />
      </motion.div>
    </div>
  );
}

'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronDown, Loader2, TrendingUp, TrendingDown, Wallet,
  X, Check, Search,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const ESTABLISHMENTS = ['Castelo Real', 'Universo do R$1,99'];

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDateLabel = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });

const yFmt = (v: number) => {
  if (v === 0) return 'R$0';
  if (Math.abs(v) >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `R$${(v / 1_000).toFixed(0)}k`;
  return `R$${v.toFixed(0)}`;
};

interface TxLight {
  data: string;
  tipo: 'Receita' | 'Despesa';
  favorecido: string;
  estabelecimento: string;
  valor_final: number;
}

interface ChartPoint {
  date: string;
  label: string;
  receitas: number;
  despesas: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: { dataKey: string; name: string; value: number; color: string }[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-container-low border border-on-surface/10 rounded-2xl p-3 shadow-xl min-w-[180px]">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface/40 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-xs text-on-surface/60">{p.name}</span>
          </div>
          <span className="text-xs font-bold text-on-surface">{fmtBRL(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

type Panel = 'estab' | 'data' | 'fav' | null;

export function FinanceDashboard() {
  const [txs, setTxs] = useState<TxLight[]>([]);
  const [loading, setLoading] = useState(true);

  const [selEstabs, setSelEstabs] = useState<string[]>([]);
  const [selFavs, setSelFavs] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [favSearch, setFavSearch] = useState('');
  const [openPanel, setOpenPanel] = useState<Panel>(null);

  const filterBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!filterBarRef.current?.contains(e.target as Node)) setOpenPanel(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('finance_transactions')
        .select('data, tipo, favorecido, estabelecimento, valor_final')
        .order('data', { ascending: true });
      if (data) setTxs(data as TxLight[]);
      setLoading(false);
    })();
  }, []);

  const allFavs = useMemo(
    () => [...new Set(txs.map(t => t.favorecido))].filter(Boolean).sort(),
    [txs],
  );

  const favList = useMemo(
    () => favSearch
      ? allFavs.filter(f => f.toLowerCase().includes(favSearch.toLowerCase()))
      : allFavs,
    [allFavs, favSearch],
  );

  const filtered = useMemo(() => txs.filter(t => {
    if (selEstabs.length > 0 && !selEstabs.includes(t.estabelecimento)) return false;
    if (selFavs.length > 0 && !selFavs.includes(t.favorecido)) return false;
    if (dateFrom && t.data < dateFrom) return false;
    if (dateTo && t.data > dateTo) return false;
    return true;
  }), [txs, selEstabs, selFavs, dateFrom, dateTo]);

  const chartData = useMemo((): ChartPoint[] => {
    const byDate: Record<string, { receitas: number; despesas: number }> = {};
    for (const t of filtered) {
      if (!byDate[t.data]) byDate[t.data] = { receitas: 0, despesas: 0 };
      if (t.tipo === 'Receita') byDate[t.data].receitas += t.valor_final;
      else byDate[t.data].despesas += t.valor_final;
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        label: fmtDateLabel(date),
        receitas: v.receitas,
        despesas: v.despesas,
      }));
  }, [filtered]);

  const totals = useMemo(() => {
    const r = filtered.filter(t => t.tipo === 'Receita').reduce((s, t) => s + t.valor_final, 0);
    const d = filtered.filter(t => t.tipo === 'Despesa').reduce((s, t) => s + t.valor_final, 0);
    return { receitas: r, despesas: d, saldo: r - d };
  }, [filtered]);

  const hasFilters = selEstabs.length > 0 || selFavs.length > 0 || !!dateFrom || !!dateTo;

  const toggleEstab = (e: string) =>
    setSelEstabs(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);

  const toggleFav = (f: string) =>
    setSelFavs(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);

  const clearFilters = () => {
    setSelEstabs([]);
    setSelFavs([]);
    setDateFrom('');
    setDateTo('');
    setFavSearch('');
  };

  const filterBtnCls = (active: boolean) => cn(
    'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-colors border',
    active
      ? 'bg-primary/10 border-primary/30 text-primary'
      : 'bg-surface-container border-on-surface/10 text-on-surface/70 hover:bg-on-surface/5',
  );

  const checkboxCls = (sel: boolean) => cn(
    'w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
    sel ? 'bg-primary border-primary' : 'border-on-surface/20',
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-manrope font-extrabold text-on-surface">Dashboard</h1>
        <p className="text-sm text-on-surface/50 mt-0.5">Visão geral das finanças</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {([
          { label: 'Receitas', value: totals.receitas, color: 'emerald', Icon: TrendingUp },
          { label: 'Despesas', value: totals.despesas, color: 'rose',    Icon: TrendingDown },
          {
            label: 'Saldo',
            value: totals.saldo,
            color: totals.saldo >= 0 ? 'emerald' : 'rose',
            Icon: Wallet,
          },
        ] as const).map(({ label, value, color, Icon }) => (
          <div key={label} className="bg-surface-container-low/80 rounded-2xl p-5 border border-on-surface/5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-xl bg-${color}-500/10 flex items-center justify-center`}>
                <Icon size={18} className={`text-${color}-500`} />
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface/40">{label}</p>
            </div>
            <p className={`text-2xl font-extrabold font-manrope text-${color}-500`}>{fmtBRL(value)}</p>
          </div>
        ))}
      </div>

      {/* Chart card */}
      <div className="bg-surface-container-low/80 rounded-2xl border border-on-surface/5 p-5">

        {/* Filter bar */}
        <div ref={filterBarRef} className="flex flex-wrap items-center gap-2 mb-6">

          {/* Estabelecimento */}
          <div className="relative">
            <button
              onClick={() => setOpenPanel(p => p === 'estab' ? null : 'estab')}
              className={filterBtnCls(selEstabs.length > 0)}
            >
              Estabelecimento
              {selEstabs.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-primary text-on-primary text-[9px] font-black flex items-center justify-center">
                  {selEstabs.length}
                </span>
              )}
              <ChevronDown size={12} className={cn('transition-transform duration-200', openPanel === 'estab' && 'rotate-180')} />
            </button>
            <AnimatePresence>
              {openPanel === 'estab' && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-2 bg-surface-container-low border border-on-surface/10 rounded-2xl shadow-xl z-30 min-w-[220px] overflow-hidden"
                >
                  {ESTABLISHMENTS.map(e => (
                    <button
                      key={e}
                      onClick={() => toggleEstab(e)}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-on-surface hover:bg-on-surface/5 transition-colors text-left"
                    >
                      <div className={checkboxCls(selEstabs.includes(e))}>
                        {selEstabs.includes(e) && <Check size={10} className="text-on-primary" />}
                      </div>
                      {e}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Data */}
          <div className="relative">
            <button
              onClick={() => setOpenPanel(p => p === 'data' ? null : 'data')}
              className={filterBtnCls(!!(dateFrom || dateTo))}
            >
              Data
              {(dateFrom || dateTo) && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
              <ChevronDown size={12} className={cn('transition-transform duration-200', openPanel === 'data' && 'rotate-180')} />
            </button>
            <AnimatePresence>
              {openPanel === 'data' && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-2 bg-surface-container-low border border-on-surface/10 rounded-2xl shadow-xl z-30 p-4 min-w-[240px]"
                >
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface/40 block mb-1.5">De</label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="w-full px-3 py-2 bg-surface-container rounded-xl text-sm text-on-surface border border-on-surface/5 focus:outline-none focus:border-primary/50"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface/40 block mb-1.5">Até</label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="w-full px-3 py-2 bg-surface-container rounded-xl text-sm text-on-surface border border-on-surface/5 focus:outline-none focus:border-primary/50"
                      />
                    </div>
                    {(dateFrom || dateTo) && (
                      <button
                        onClick={() => { setDateFrom(''); setDateTo(''); }}
                        className="text-xs font-bold text-primary hover:underline text-left"
                      >
                        Limpar datas
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Favorecido */}
          <div className="relative">
            <button
              onClick={() => setOpenPanel(p => p === 'fav' ? null : 'fav')}
              className={filterBtnCls(selFavs.length > 0)}
            >
              Favorecido
              {selFavs.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-primary text-on-primary text-[9px] font-black flex items-center justify-center">
                  {selFavs.length}
                </span>
              )}
              <ChevronDown size={12} className={cn('transition-transform duration-200', openPanel === 'fav' && 'rotate-180')} />
            </button>
            <AnimatePresence>
              {openPanel === 'fav' && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-2 bg-surface-container-low border border-on-surface/10 rounded-2xl shadow-xl z-30 w-72"
                >
                  <div className="p-3 border-b border-on-surface/5">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface/30" />
                      <input
                        placeholder="Buscar favorecido..."
                        value={favSearch}
                        onChange={e => setFavSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-surface-container rounded-xl text-sm text-on-surface border border-on-surface/5 focus:outline-none focus:border-primary/50 placeholder:text-on-surface/30"
                      />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {favList.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-on-surface/30 text-center">Nenhum resultado</p>
                    ) : (
                      favList.map(f => (
                        <button
                          key={f}
                          onClick={() => toggleFav(f)}
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-on-surface hover:bg-on-surface/5 transition-colors text-left"
                        >
                          <div className={checkboxCls(selFavs.includes(f))}>
                            {selFavs.includes(f) && <Check size={10} className="text-on-primary" />}
                          </div>
                          <span className="truncate">{f}</span>
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Clear all */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide bg-on-surface/5 text-on-surface/50 hover:bg-on-surface/10 hover:text-on-surface/70 transition-colors border border-on-surface/10"
            >
              <X size={11} />
              Limpar
            </button>
          )}
        </div>

        {/* Chart */}
        {loading ? (
          <div className="flex items-center justify-center h-80 gap-3 text-on-surface/30">
            <Loader2 size={24} className="animate-spin" />
            <span className="text-sm font-semibold">Carregando...</span>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-80 text-on-surface/20">
            <Wallet size={40} className="mb-3" />
            <p className="font-bold">Nenhum dado encontrado</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(28,28,15,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.4 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                className="text-on-surface"
              />
              <YAxis
                tickFormatter={yFmt}
                tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.4 }}
                tickLine={false}
                axisLine={false}
                width={60}
                className="text-on-surface"
              />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="receitas"
                name="Receitas"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: '#10b981' }}
              />
              <Line
                type="monotone"
                dataKey="despesas"
                name="Despesas"
                stroke="#f43f5e"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: '#f43f5e' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Legend */}
        {!loading && chartData.length > 0 && (
          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-0.5 bg-emerald-500 rounded-full block" />
              <span className="text-xs font-semibold text-on-surface/50">Receitas</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-0.5 bg-rose-500 rounded-full block" />
              <span className="text-xs font-semibold text-on-surface/50">Despesas</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

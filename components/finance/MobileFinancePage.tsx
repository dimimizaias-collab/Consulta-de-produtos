'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, X, TrendingUp, TrendingDown, Wallet,
  Search, Filter, CheckSquare,
  ClipboardList, Check, Loader2, Trash2,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useFinanceTags, FinanceTag } from '@/hooks/useFinanceTags';
import { TagSelector } from './TagSelector';

// ── Types ──────────────────────────────────────────────────────────────────

type PaymentType = 'Boleto' | 'Crédito' | 'Débito' | 'PIX' | 'Dinheiro' | 'Transferência' | 'Cheque' | 'Outro';
type TxType = 'Receita' | 'Despesa';
type Tab = 'mov' | 'dash';
type DashPeriod = '7d' | '30d' | '3m' | '6m' | '1y';

interface Transaction {
  id: string;
  data: string;
  tipo: TxType;
  tipo_pagamento: PaymentType;
  favorecido: string;
  estabelecimento: string;
  vencimento: string | null;
  valor_final: number;
  total_pago: number;
  pago: boolean;
  numero_cheque: string | null;
  account_id?: string | null;
  tag_ids: string[];
}

type TxForm = {
  tipo: TxType;
  tipo_pagamento: PaymentType;
  favorecido: string;
  estabelecimento: string;
  data: string;
  valor_final: string;
  pago: boolean;
  tag_ids: string[];
};

// ── Constants ──────────────────────────────────────────────────────────────

const PAYMENT_TYPES: PaymentType[] = ['PIX', 'Transferência', 'Boleto', 'Crédito', 'Débito', 'Dinheiro', 'Cheque', 'Outro'];
const ESTABLISHMENTS = ['Castelo Real', 'Universo do R$1,99'];
const PERIOD_OPTIONS: { key: DashPeriod; label: string; days: number }[] = [
  { key: '7d',  label: '7 dias',  days: 7   },
  { key: '30d', label: '30 dias', days: 30  },
  { key: '3m',  label: '3 meses', days: 90  },
  { key: '6m',  label: '6 meses', days: 180 },
  { key: '1y',  label: 'Ano',     days: 365 },
];

const emptyForm = (): TxForm => ({
  tipo: 'Despesa',
  tipo_pagamento: 'PIX',
  favorecido: '',
  estabelecimento: ESTABLISHMENTS[0],
  data: new Date().toISOString().split('T')[0],
  valor_final: '0',
  pago: false,
  tag_ids: [],
});

// ── Helpers ────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtShort = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `R$${(v / 1_000).toFixed(0)}k`;
  return `R$${v.toFixed(0)}`;
};
function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function periodCutoff(period: DashPeriod): string {
  const d = new Date();
  d.setDate(d.getDate() - PERIOD_OPTIONS.find(p => p.key === period)!.days);
  return d.toISOString().split('T')[0];
}

// ── Numeric keyboard ────────────────────────────────────────────────────────

const NUM_KEYS = [
  ['7','8','9'],
  ['4','5','6'],
  ['1','2','3'],
  [',','0','⌫'],
];

function NumericKeyboard({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  function press(key: string) {
    if (key === '⌫') {
      onChange(value.length > 1 ? value.slice(0, -1) : '0');
      return;
    }
    if (key === ',') {
      if (value.includes(',')) return;
      onChange(value === '0' ? '0,' : value + ',');
      return;
    }
    const next = value === '0' ? key : value + key;
    // max 2 decimal places
    const parts = next.split(',');
    if (parts[1] && parts[1].length > 2) return;
    onChange(next);
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
      className="bg-[#F5F2E8] dark:bg-[#2E2E28] border-t border-[#E0D8BF] dark:border-white/[0.08] px-3 pt-2 pb-4"
    >
      <div className="flex justify-end mb-2">
        <button
          onClick={onClose}
          className="text-[10px] font-black uppercase tracking-wider text-[#D81E1E] px-3 py-1"
        >
          OK
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {NUM_KEYS.flat().map((k, i) => (
          <button
            key={i}
            onPointerDown={e => { e.preventDefault(); press(k); }}
            className={cn(
              'h-12 rounded-xl font-["DM_Mono",monospace] text-lg font-bold flex items-center justify-center',
              'active:scale-95 transition-transform duration-75',
              k === '⌫'
                ? 'bg-[#E8D8C0] dark:bg-[#3D3D35] text-[#1A1A0E] dark:text-white/70'
                : 'bg-white dark:bg-[#3D3D35] text-[#1A1A0E] dark:text-[#F2F0E3]',
              'border border-[#E0D8BF] dark:border-white/[0.08]',
            )}
          >
            {k}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ── Add Transaction Sheet ──────────────────────────────────────────────────────

function TxSheet({
  form,
  setForm,
  onSave,
  onClose,
  saving,
  tags,
  onCreateTag,
}: {
  form: TxForm;
  setForm: (f: TxForm) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  tags: FinanceTag[];
  onCreateTag: (nome: string, cor: string) => Promise<FinanceTag>;
}) {
  const [showKbd, setShowKbd] = useState(true);
  const [favSearch, setFavSearch] = useState('');

  const fieldCls = 'w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]';
  const labelCls = 'text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block';

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className="fixed inset-x-0 bottom-0 z-[60] bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-t-[28px] shadow-2xl overflow-hidden flex flex-col"
      style={{ maxHeight: '90svh' }}
    >
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full bg-[rgba(26,26,10,0.15)] dark:bg-white/20" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 shrink-0">
        <span className="text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3]">Nova Movimentação</span>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-[rgba(26,26,10,0.07)] dark:bg-white/[0.07] flex items-center justify-center text-[rgba(26,26,10,0.45)] dark:text-white/35 active:scale-90 transition-transform"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-3">
        {/* Type toggle */}
        <div>
          <span className={labelCls}>Tipo</span>
          <div className="flex gap-2">
            {(['Receita', 'Despesa'] as TxType[]).map(t => (
              <button
                key={t}
                onClick={() => setForm({ ...form, tipo: t })}
                className={cn(
                  'flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider border-[1.5px] transition-colors',
                  form.tipo === t
                    ? t === 'Receita'
                      ? 'bg-[rgba(5,150,105,0.10)] border-[rgba(5,150,105,0.30)] text-[#059669]'
                      : 'bg-[rgba(216,30,30,0.10)] border-[rgba(216,30,30,0.30)] text-[#D81E1E]'
                    : 'bg-transparent border-[rgba(26,26,10,0.10)] dark:border-white/[0.08] text-[rgba(26,26,10,0.40)] dark:text-white/30'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Valor */}
        <div>
          <span className={labelCls}>Valor</span>
          <button
            onClick={() => setShowKbd(true)}
            className="w-full bg-[#FDFAF0] dark:bg-[#252520] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-left"
          >
            <span className={cn(
              "font-['DM_Mono',monospace] text-[20px] font-bold tracking-tight",
              form.tipo === 'Receita' ? 'text-[#059669]' : 'text-[#E11D48] dark:text-[#F43F5E]'
            )}>
              R$ {form.valor_final}
            </span>
          </button>
        </div>

        {/* Favorecido */}
        <div>
          <span className={labelCls}>Favorecido / Descrição</span>
          <input
            className={fieldCls}
            value={form.favorecido}
            onChange={e => setForm({ ...form, favorecido: e.target.value })}
            placeholder="Nome do favorecido..."
            onFocus={() => setShowKbd(false)}
          />
        </div>

        {/* Data */}
        <div>
          <span className={labelCls}>Data</span>
          <input
            type="date"
            className={fieldCls}
            value={form.data}
            onChange={e => setForm({ ...form, data: e.target.value })}
            onFocus={() => setShowKbd(false)}
          />
        </div>

        {/* Tipo Pagamento */}
        <div>
          <span className={labelCls}>Tipo de pagamento</span>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_TYPES.map(pt => (
              <button
                key={pt}
                onClick={() => setForm({ ...form, tipo_pagamento: pt })}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border-[1.5px] transition-colors',
                  form.tipo_pagamento === pt
                    ? 'bg-[rgba(26,26,10,0.09)] dark:bg-white/[0.10] border-[rgba(26,26,10,0.18)] dark:border-white/[0.18] text-[#1A1A0E] dark:text-[#F2F0E3]'
                    : 'bg-transparent border-[rgba(26,26,10,0.07)] dark:border-white/[0.07] text-[rgba(26,26,10,0.35)] dark:text-white/25'
                )}
              >
                {pt}
              </button>
            ))}
          </div>
        </div>

        {/* Estabelecimento */}
        <div>
          <span className={labelCls}>Estabelecimento</span>
          <div className="flex gap-2">
            {ESTABLISHMENTS.map(e => (
              <button
                key={e}
                onClick={() => setForm({ ...form, estabelecimento: e })}
                className={cn(
                  'flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border-[1.5px] transition-colors',
                  form.estabelecimento === e
                    ? 'bg-[#FFE500] border-[#D4C000] text-[rgba(26,26,10,0.75)]'
                    : 'bg-transparent border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] text-[rgba(26,26,10,0.38)] dark:text-white/28'
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Tags */}
        <TagSelector
          tags={tags}
          value={form.tag_ids}
          onChange={ids => setForm({ ...form, tag_ids: ids })}
          onCreateTag={onCreateTag}
        />

        {/* Pago toggle */}
        <div className="flex items-center gap-3 py-1">
          <button
            onClick={() => setForm({ ...form, pago: !form.pago })}
            className={cn(
              'w-6 h-6 rounded-[7px] border-[1.5px] flex items-center justify-center transition-colors',
              form.pago
                ? 'bg-[#059669] border-[#059669] text-white'
                : 'bg-transparent border-[rgba(26,26,10,0.20)] dark:border-white/20'
            )}
          >
            {form.pago && <Check size={12} strokeWidth={3} />}
          </button>
          <span className="text-sm font-bold text-[#1A1A0E] dark:text-[#F2F0E3]">Já foi pago</span>
        </div>

        {/* Salvar */}
        <button
          onClick={onSave}
          disabled={saving || !form.favorecido.trim() || form.valor_final === '0'}
          className={cn(
            'w-full py-3.5 rounded-2xl text-[13px] font-black uppercase tracking-wider text-white',
            'bg-[#D81E1E] active:scale-[0.97] transition-transform',
            'disabled:opacity-40',
            'shadow-[0_4px_14px_rgba(216,30,30,0.30)]'
          )}
        >
          {saving ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'Salvar Movimentação'}
        </button>
      </div>

      {/* Numeric keyboard */}
      <AnimatePresence>
        {showKbd && (
          <NumericKeyboard
            value={form.valor_final}
            onChange={v => setForm({ ...form, valor_final: v })}
            onClose={() => setShowKbd(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function MobileFinancePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('mov');
  const [search, setSearch] = useState('');
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [txForm, setTxForm] = useState<TxForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [dashPeriod, setDashPeriod] = useState<DashPeriod>('30d');
  const { tags, createTag } = useFinanceTags();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Data ────────────────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from('finance_transactions').select('*').order('data', { ascending: false });
    if (data) setTransactions(data as Transaction[]);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  // ── Computed — Movimentações ─────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return transactions.filter(t =>
      !q || t.favorecido.toLowerCase().includes(q) || t.estabelecimento.toLowerCase().includes(q)
    );
  }, [transactions, search]);

  const totals = useMemo(() => {
    const rec  = filtered.filter(t => t.tipo === 'Receita').reduce((s, t) => s + t.valor_final, 0);
    const desp = filtered.filter(t => t.tipo === 'Despesa').reduce((s, t) => s + t.valor_final, 0);
    return { rec, desp, saldo: rec - desp };
  }, [filtered]);

  const vencimentoStats = useMemo(() => {
    const despesasVencendo = transactions.filter(t => t.tipo === 'Despesa' && t.vencimento);
    return {
      count: despesasVencendo.length,
      valor: despesasVencendo.reduce((s, t) => s + t.valor_final, 0),
      totalPago: despesasVencendo.reduce((s, t) => s + t.total_pago, 0),
    };
  }, [transactions]);

  const grouped = useMemo(() => {
    const map: Record<string, Transaction[]> = {};
    filtered.forEach(t => {
      if (!map[t.data]) map[t.data] = [];
      map[t.data].push(t);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  // ── Computed — Dashboard ─────────────────────────────────────────────────

  const cutoff = useMemo(() => periodCutoff(dashPeriod), [dashPeriod]);

  const dashTxs = useMemo(() => transactions.filter(t => t.data >= cutoff), [transactions, cutoff]);

  const dashTotals = useMemo(() => {
    const rec  = dashTxs.filter(t => t.tipo === 'Receita').reduce((s, t) => s + t.valor_final, 0);
    const desp = dashTxs.filter(t => t.tipo === 'Despesa').reduce((s, t) => s + t.valor_final, 0);
    return { rec, desp, saldo: rec - desp };
  }, [dashTxs]);

  const chartData = useMemo(() => {
    const byDate: Record<string, { receitas: number; despesas: number }> = {};
    dashTxs.forEach(t => {
      if (!byDate[t.data]) byDate[t.data] = { receitas: 0, despesas: 0 };
      if (t.tipo === 'Receita') byDate[t.data].receitas += t.valor_final;
      else byDate[t.data].despesas += t.valor_final;
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        label: new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        receitas: v.receitas,
        despesas: v.despesas,
      }));
  }, [dashTxs]);

  const topFavorecidos = useMemo(() => {
    const map: Record<string, number> = {};
    dashTxs.filter(t => t.tipo === 'Despesa').forEach(t => {
      map[t.favorecido] = (map[t.favorecido] ?? 0) + t.valor_final;
    });
    return Object.entries(map).sort(([, a], [, b]) => b - a).slice(0, 3);
  }, [dashTxs]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!txForm.favorecido.trim() || txForm.valor_final === '0') return;
    setSaving(true);
    const valorNum = parseFloat(txForm.valor_final.replace(',', '.'));
    await supabase.from('finance_transactions').insert([{
      data: txForm.data,
      tipo: txForm.tipo,
      tipo_pagamento: txForm.tipo_pagamento,
      favorecido: txForm.favorecido.trim(),
      estabelecimento: txForm.estabelecimento,
      vencimento: null,
      valor_final: valorNum,
      total_pago: txForm.pago ? valorNum : 0,
      pago: txForm.pago,
      numero_cheque: null,
      tag_ids: txForm.tag_ids ?? [],
    }]);
    setSaving(false);
    setShowAddSheet(false);
    setTxForm(emptyForm());
    loadData();
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    await supabase.from('finance_transactions').delete().in('id', [...selectedIds]);
    setSelectedIds(new Set());
    setSelectionMode(false);
    loadData();
  }

  function openAdd() {
    setTxForm(emptyForm());
    setShowAddSheet(true);
  }

  function switchTab(t: Tab) {
    setActiveTab(t);
    if (selectionMode) { setSelectionMode(false); setSelectedIds(new Set()); }
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Date group label ─────────────────────────────────────────────────────

  function dateLabel(iso: string) {
    const d = new Date(iso + 'T00:00:00');
    const t = today();
    const yesterday = new Date(t); yesterday.setDate(t.getDate() - 1);
    if (sameDay(d, t)) return `Hoje · ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
    if (sameDay(d, yesterday)) return `Ontem · ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  // ── Shared class helpers ─────────────────────────────────────────────────

  const sectionLabel = 'text-[9px] font-black uppercase tracking-[0.20em] text-[rgba(26,26,10,0.28)] dark:text-white/22 px-4 pt-4 pb-2 flex items-center gap-2 after:content-[\'\'] after:flex-1 after:h-px after:bg-[rgba(26,26,10,0.07)] dark:after:bg-white/[0.06]';

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#FDFAF0] dark:bg-[#1E1E18] pb-[72px]">

      {/* Header */}
      <div className="shrink-0 bg-[#FFE500] dark:bg-[#252520] border-b border-[#D4C000] dark:border-white/[0.07] pt-14 px-4 pb-4 flex items-end justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[rgba(26,26,10,0.40)] mb-0.5">Finanças</p>
          <h1 className="text-[19px] font-black text-[#1A1A0E] tracking-tight leading-none">Controle Financeiro</h1>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setShowAddSheet(true)}
            className="w-[38px] h-[38px] bg-[#D81E1E] rounded-[14px] flex items-center justify-center shadow-[0_4px_14px_rgba(216,30,30,0.32)] active:scale-95 transition-transform"
          >
            <Plus size={18} color="white" strokeWidth={2.8} />
          </button>
        </div>
      </div>

      {/* Tab pills */}
      <div className="shrink-0 bg-[#FDFAF0] dark:bg-[#1E1E18] px-3 pt-2.5 pb-2 flex gap-2 border-b border-[rgba(26,26,10,0.06)] dark:border-white/[0.06]">
        {([
          { key: 'mov',  label: 'Movimentações', icon: <ClipboardList size={11} /> },
          { key: 'dash', label: 'Dashboard',      icon: <TrendingUp size={11} /> },
        ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(tab => (
          <button
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-[5px] py-[7px] px-1.5 rounded-xl',
              'text-[9px] font-black uppercase tracking-[0.08em]',
              'border-[1.5px] transition-all duration-150',
              activeTab === tab.key
                ? 'bg-[rgba(216,30,30,0.08)] border-[rgba(216,30,30,0.18)] text-[#D81E1E] dark:bg-[rgba(216,30,30,0.12)] dark:border-[rgba(216,30,30,0.22)]'
                : 'bg-transparent border-[rgba(26,26,10,0.08)] dark:border-white/[0.08] text-[rgba(26,26,10,0.38)] dark:text-white/28'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">

        <AnimatePresence mode="wait">
          {/* ═══ TAB: MOVIMENTAÇÕES ═══ */}
          {activeTab === 'mov' && (
            <motion.div
              key="mov"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="pb-6"
            >
              {/* Summary chips — swipe para o lado (estilo Stories) para ver Vencimento/Total Pago */}
              <div className="flex gap-2 px-3 pt-3 pb-2 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none]">
                {([
                  { label: 'Receitas', value: totals.rec,   cls: 'text-[#059669] dark:text-[#34D399]', dotCls: 'bg-[rgba(5,150,105,0.12)] text-[#059669] dark:bg-[rgba(52,211,153,0.14)] dark:text-[#34D399]', glyph: '↑' },
                  { label: 'Despesas', value: totals.desp,  cls: 'text-[#E11D48] dark:text-[#F43F5E]', dotCls: 'bg-[rgba(225,29,72,0.12)] text-[#E11D48] dark:bg-[rgba(244,63,94,0.14)] dark:text-[#F43F5E]', glyph: '↓' },
                  { label: 'Saldo',    value: totals.saldo, cls: totals.saldo >= 0 ? 'text-[#059669] dark:text-[#34D399]' : 'text-[#E11D48] dark:text-[#F43F5E]', dotCls: totals.saldo >= 0 ? 'bg-[rgba(5,150,105,0.12)] text-[#059669] dark:bg-[rgba(52,211,153,0.14)] dark:text-[#34D399]' : 'bg-[rgba(225,29,72,0.12)] text-[#E11D48]', glyph: '=' },
                  { label: 'Vencimento', value: vencimentoStats.valor,    cls: 'text-[#B45309] dark:text-[#FCD34D]', dotCls: 'bg-[rgba(245,158,11,0.12)] text-[#B45309] dark:bg-[rgba(251,191,36,0.14)] dark:text-[#FCD34D]', glyph: '⏱', sub: `${vencimentoStats.count} mov.` },
                  { label: 'Total Pago', value: vencimentoStats.totalPago, cls: 'text-[#059669] dark:text-[#34D399]', dotCls: 'bg-[rgba(5,150,105,0.12)] text-[#059669] dark:bg-[rgba(52,211,153,0.14)] dark:text-[#34D399]', glyph: '✓' },
                ] as { label: string; value: number; cls: string; dotCls: string; glyph: string; sub?: string }[]).map(chip => (
                  <div key={chip.label} className="shrink-0 snap-start bg-white dark:bg-[#252520] border-[1.5px] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] rounded-[20px] px-3.5 py-2.5 flex flex-col gap-1 min-w-[108px]">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('w-5 h-5 rounded-[7px] flex items-center justify-center text-[11px] font-black shrink-0', chip.dotCls)}>{chip.glyph}</span>
                      <span className="text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.40)] dark:text-white/30">{chip.label}</span>
                    </div>
                    <span className={cn("font-['DM_Mono',monospace] text-[13px] font-bold tracking-tight", chip.cls)}>
                      {fmtShort(chip.value)}
                    </span>
                    {chip.sub && (
                      <span className="text-[8px] font-bold text-[rgba(26,26,10,0.35)] dark:text-white/25">{chip.sub}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Action row */}
              <div className="flex gap-2 px-3 pb-2.5 items-center">
                <div className="flex-1 relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgba(26,26,10,0.30)] dark:text-white/25 pointer-events-none" />
                  <input
                    className="w-full bg-white dark:bg-[#252520] border-[1.5px] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] rounded-2xl pl-8 pr-3 py-2 text-[13px] text-[rgba(26,26,10,0.55)] dark:text-white/40 font-medium focus:outline-none placeholder:text-[rgba(26,26,10,0.28)] dark:placeholder:text-white/20"
                    placeholder="Buscar transações..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                {/* Filter icon */}
                <button
                  className="w-9 h-9 rounded-xl bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.07] border-[1.5px] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] flex items-center justify-center text-[rgba(26,26,10,0.45)] dark:text-white/40 active:scale-90 transition-transform"
                  title="Filtrar"
                >
                  <Filter size={14} />
                </button>
                {/* Select icon */}
                <button
                  onClick={() => setSelectionMode(v => !v)}
                  className={cn(
                    'w-9 h-9 rounded-xl border-[1.5px] flex items-center justify-center active:scale-90 transition-all',
                    selectionMode
                      ? 'bg-[rgba(216,30,30,0.10)] border-[rgba(216,30,30,0.20)] text-[#D81E1E]'
                      : 'bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.07] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] text-[rgba(26,26,10,0.45)] dark:text-white/40'
                  )}
                  title="Selecionar"
                >
                  <CheckSquare size={14} />
                </button>
              </div>

              {/* Selection delete bar */}
              <AnimatePresence>
                {selectionMode && selectedIds.size > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mx-3 mb-2 bg-[rgba(216,30,30,0.10)] border border-[rgba(216,30,30,0.20)] rounded-2xl px-4 py-2.5 flex items-center justify-between overflow-hidden"
                  >
                    <span className="text-[12px] font-bold text-[#D81E1E]">{selectedIds.size} selecionada{selectedIds.size > 1 ? 's' : ''}</span>
                    <button onClick={handleDeleteSelected} className="flex items-center gap-1.5 text-[#D81E1E] text-[12px] font-black">
                      <Trash2 size={14} /> Excluir
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Loading */}
              {loading && (
                <div className="flex justify-center py-10">
                  <Loader2 size={24} className="animate-spin text-[rgba(26,26,10,0.20)] dark:text-white/20" />
                </div>
              )}

              {/* Transaction groups */}
              {!loading && grouped.map(([date, txs]) => (
                <div key={date}>
                  <div className="flex items-center gap-2 px-4 py-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[rgba(26,26,10,0.30)] dark:text-white/22">{dateLabel(date)}</span>
                    <div className="flex-1 h-px bg-[rgba(26,26,10,0.07)] dark:bg-white/[0.06]" />
                  </div>
                  {txs.map(tx => (
                    <div
                      key={tx.id}
                      onClick={() => selectionMode && toggleSelect(tx.id)}
                      className={cn(
                        'mx-3 mb-2 bg-white dark:bg-[#252520] border-[1.5px] rounded-[18px] px-3.5 py-3 flex flex-col gap-2',
                        'active:scale-[0.99] transition-all',
                        selectionMode && selectedIds.has(tx.id)
                          ? 'border-[rgba(216,30,30,0.30)] bg-[rgba(216,30,30,0.04)] dark:bg-[rgba(216,30,30,0.08)]'
                          : 'border-[rgba(26,26,10,0.08)] dark:border-white/[0.08]'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          {/* Selection checkbox */}
                          {selectionMode && (
                            <div className={cn(
                              'w-5 h-5 rounded-[6px] border-[1.5px] flex items-center justify-center shrink-0 mt-0.5',
                              selectedIds.has(tx.id)
                                ? 'bg-[#D81E1E] border-[#D81E1E] text-white'
                                : 'border-[rgba(26,26,10,0.20)] dark:border-white/20'
                            )}>
                              {selectedIds.has(tx.id) && <Check size={11} strokeWidth={3} />}
                            </div>
                          )}
                          {/* Type badge */}
                          <div className={cn(
                            'w-[30px] h-[30px] rounded-[10px] flex items-center justify-center text-[13px] font-black shrink-0 mt-0.5',
                            tx.tipo === 'Receita'
                              ? 'bg-[rgba(5,150,105,0.11)] text-[#059669] dark:bg-[rgba(52,211,153,0.12)] dark:text-[#34D399]'
                              : 'bg-[rgba(225,29,72,0.11)] text-[#E11D48] dark:bg-[rgba(244,63,94,0.12)] dark:text-[#F43F5E]'
                          )}>
                            {tx.tipo === 'Receita' ? 'R' : 'D'}
                          </div>
                          <div>
                            <p className="text-[14px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-snug">{tx.favorecido || '—'}</p>
                            <p className="text-[10px] font-semibold text-[rgba(26,26,10,0.35)] dark:text-white/30">{tx.estabelecimento}</p>
                          </div>
                        </div>
                        <span className={cn(
                          "font-['DM_Mono',monospace] text-[15px] font-bold tracking-tight shrink-0 mt-0.5",
                          tx.tipo === 'Receita'
                            ? 'text-[#059669] dark:text-[#34D399]'
                            : 'text-[#E11D48] dark:text-[#F43F5E]'
                        )}>
                          {tx.tipo === 'Receita' ? '+' : '−'}{fmt(tx.valor_final)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1.5 border-t border-[rgba(26,26,10,0.06)] dark:border-white/[0.06]">
                        <span className="bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.07] rounded-[8px] px-2 py-[3px] text-[9px] font-black uppercase tracking-[0.08em] text-[rgba(26,26,10,0.45)] dark:text-white/35">
                          {tx.tipo_pagamento}
                        </span>
                        <span className={cn(
                          'text-[10px] font-black px-2.5 py-[3px] rounded-[8px]',
                          tx.pago
                            ? 'bg-[rgba(5,150,105,0.10)] text-[#059669] dark:bg-[rgba(52,211,153,0.12)] dark:text-[#34D399]'
                            : 'bg-[rgba(245,158,11,0.12)] text-[#B45309] dark:bg-[rgba(251,191,36,0.14)] dark:text-[#FCD34D]'
                        )}>
                          {tx.pago ? 'Pago' : 'Pendente'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {!loading && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-[rgba(26,26,10,0.20)] dark:text-white/20">
                  <Wallet size={40} className="mb-3 opacity-40" />
                  <p className="text-[11px] font-black uppercase tracking-widest">Nenhuma movimentação</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ═══ TAB: DASHBOARD ═══ */}
          {activeTab === 'dash' && (
            <motion.div
              key="dash"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="pb-6"
            >
              {/* Period selector */}
              <div className="flex gap-2 px-3 pt-3 pb-1 overflow-x-auto [scrollbar-width:none]">
                {PERIOD_OPTIONS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setDashPeriod(p.key)}
                    className={cn(
                      'shrink-0 px-3.5 py-1.5 rounded-[10px] text-[10px] font-black uppercase tracking-[0.07em]',
                      'border-[1.5px] transition-all active:scale-95',
                      dashPeriod === p.key
                        ? 'bg-[#FFE500] border-[#D4C000] text-[rgba(26,26,10,0.75)]'
                        : 'bg-transparent border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] text-[rgba(26,26,10,0.38)] dark:text-white/28'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Summary cards */}
              <p className={sectionLabel}>Resumo</p>
              <div className="grid grid-cols-3 gap-2 px-3">
                {[
                  { label: 'Receitas', val: dashTotals.rec,   cls: 'text-[#059669] dark:text-[#34D399]', icon: '↑', bg: 'bg-[rgba(5,150,105,0.12)] dark:bg-[rgba(52,211,153,0.14)]', c: 'text-[#059669] dark:text-[#34D399]' },
                  { label: 'Despesas', val: dashTotals.desp,  cls: 'text-[#E11D48] dark:text-[#F43F5E]', icon: '↓', bg: 'bg-[rgba(225,29,72,0.12)] dark:bg-[rgba(244,63,94,0.14)]',  c: 'text-[#E11D48] dark:text-[#F43F5E]' },
                  { label: 'Saldo',    val: dashTotals.saldo, cls: dashTotals.saldo >= 0 ? 'text-[#059669] dark:text-[#34D399]' : 'text-[#E11D48] dark:text-[#F43F5E]', icon: '≡', bg: 'bg-[rgba(5,150,105,0.12)] dark:bg-[rgba(52,211,153,0.14)]', c: 'text-[#059669] dark:text-[#34D399]' },
                ].map(card => (
                  <div key={card.label} className="bg-white dark:bg-[#252520] border-[1.5px] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] rounded-2xl p-2.5 flex flex-col gap-1.5">
                    <div className={cn('w-6 h-6 rounded-[8px] flex items-center justify-center text-[12px] font-black', card.bg, card.c)}>{card.icon}</div>
                    <span className="text-[8px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.40)] dark:text-white/30">{card.label}</span>
                    <span className={cn("font-['DM_Mono',monospace] text-[11px] font-bold tracking-tight", card.cls)}>{fmtShort(card.val)}</span>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="mx-3 mt-3 bg-white dark:bg-[#252520] border-[1.5px] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] rounded-[18px] p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.08em] text-[rgba(26,26,10,0.45)] dark:text-white/38">Receitas vs Despesas</span>
                  <div className="flex gap-2.5">
                    {[['#059669','#34D399','Rec.'],['#E11D48','#F43F5E','Desp.']].map(([lc, dc, name]) => (
                      <span key={name} className="flex items-center gap-1 text-[9px] font-bold text-[rgba(26,26,10,0.38)] dark:text-white/28">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: lc }} />
                        <span className="dark:hidden">{name}</span>
                        <span className="hidden dark:inline" style={{ color: dc }}>{name}</span>
                      </span>
                    ))}
                  </div>
                </div>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,26,10,0.06)" />
                      <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'rgba(26,26,10,0.28)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 8, fill: 'rgba(26,26,10,0.28)' }} tickLine={false} axisLine={false} tickFormatter={v => fmtShort(v)} />
                      <Tooltip
                        contentStyle={{ background: '#fff', border: '1px solid rgba(26,26,10,0.10)', borderRadius: 12, fontSize: 10 }}
                        formatter={(v) => typeof v === 'number' ? fmt(v) : String(v)}
                      />
                      <Line type="monotone" dataKey="receitas" stroke="#059669" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Receitas" />
                      <Line type="monotone" dataKey="despesas" stroke="#E11D48" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Despesas" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[120px] flex items-center justify-center text-[rgba(26,26,10,0.20)] dark:text-white/20 text-[11px] font-bold">Sem dados no período</div>
                )}
              </div>

              {/* Top favorecidos */}
              {topFavorecidos.length > 0 && (
                <>
                  <p className={sectionLabel}>Top Favorecidos</p>
                  <div className="mx-3 bg-white dark:bg-[#252520] border-[1.5px] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] rounded-2xl overflow-hidden">
                    {topFavorecidos.map(([name, val], i) => (
                      <div key={name} className={cn('flex items-center justify-between px-4 py-3', i < topFavorecidos.length - 1 && 'border-b border-[rgba(26,26,10,0.06)] dark:border-white/[0.06]')}>
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-[9px] bg-[rgba(225,29,72,0.10)] dark:bg-[rgba(244,63,94,0.12)] flex items-center justify-center text-[12px] font-black text-[#E11D48] dark:text-[#F43F5E]">{i + 1}</span>
                          <span className="text-[13px] font-bold text-[#1A1A0E] dark:text-[#F2F0E3] truncate max-w-[160px]">{name}</span>
                        </div>
                        <span className="font-['DM_Mono',monospace] text-[12px] font-bold text-[#E11D48] dark:text-[#F43F5E]">{fmtShort(val)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Add Transaction Sheet backdrop + sheet */}
      <AnimatePresence>
        {showAddSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowAddSheet(false)}
            />
            <TxSheet
              form={txForm}
              setForm={setTxForm}
              onSave={handleSave}
              onClose={() => setShowAddSheet(false)}
              saving={saving}
              tags={tags}
              onCreateTag={(nome, cor) => createTag(nome, cor, '')}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

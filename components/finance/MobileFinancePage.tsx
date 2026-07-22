'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, X, TrendingUp, TrendingDown, Wallet,
  Search, Filter, CheckSquare, Calendar, ChevronLeft, ChevronRight, Clock,
  ClipboardList, Check, Loader2, Trash2, Pencil, Lock, CreditCard, AlertTriangle, Info,
  Database, Building2, Users, ImageIcon,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useFinanceTags, FinanceTag, TAG_COLOR_MAP } from '@/hooks/useFinanceTags';
import { TagSelector } from './TagSelector';
import { LinkedNotesSection, LinkedNoteLite, linkNotesToTransactions, cleanupNoteLinksForDeletedTxs } from './LinkedNotesSection';

// ── Types ──────────────────────────────────────────────────────────────────

type PaymentType = 'Boleto' | 'Crédito' | 'Débito' | 'PIX' | 'Dinheiro' | 'Transferência' | 'Cheque' | 'Outro';
type TxType = 'Receita' | 'Despesa';
type Tab = 'mov' | 'dash' | 'dados';
type DashPeriod = '7d' | '30d' | '3m' | '6m' | '1y';
type SearchField = 'favorecido' | 'estabelecimento' | 'tipo' | 'tipo_pagamento' | 'tags' | 'vencimento';

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
  numero_parcela: number | null;
  total_parcelas: number | null;
  parcelamento_id: string | null;
  account_id?: string | null;
  tag_ids: string[];
  observacoes: string | null;
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
  observacoes: string;
};

type ParcelaRow = { seq: number; valor: string; validade: string };

interface BankAccount {
  id: string;
  nome: string;
  banco: string;
  agencia: string;
  numero_conta: string;
  imagem_url: string;
  saldo_inicial: number;
}

interface Favorecido {
  id: string;
  nome_fiscal: string;
  nome_banco: string;
}

interface AccountForm {
  nome: string;
  banco: string;
  agencia: string;
  numero_conta: string;
  saldo_inicial: string;
  imagemPreview: string;
  imagemFile: File | null;
}

const emptyAccountForm = (): AccountForm => ({
  nome: '', banco: '', agencia: '', numero_conta: '',
  saldo_inicial: '', imagemPreview: '', imagemFile: null,
});

// ── Constants ──────────────────────────────────────────────────────────────

const PAYMENT_TYPES: PaymentType[] = ['PIX', 'Transferência', 'Boleto', 'Crédito', 'Débito', 'Dinheiro', 'Cheque', 'Outro'];
const ESTABLISHMENTS = ['Castelo Real', 'Universo do R$1,99'];
const BUCKET = 'finance-images';
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
  observacoes: '',
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

// ── Seletor de data próprio (sem <input type="date"> nativo) ────────────────
// Safari/iOS renderiza o valor de <input type="date"> por extenso no idioma do
// aparelho (ex: "27 de jul. de 2026") e, em alguns aparelhos, o controle nativo
// nem respeita a largura em CSS — isso persistiu mesmo depois de esconder o
// texto nativo e sobrepor um formato compacto. A solução definitiva é não usar
// o input nativo: um botão com nosso próprio texto (dd/mm/aaaa) que abre uma
// grade de calendário 100% nossa, sem nenhuma renderização do navegador.

function shortDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function DateFieldButton({
  value,
  onOpen,
  className,
}: {
  value: string;
  onOpen: () => void;
  className: string;
}) {
  return (
    <button type="button" onClick={onOpen} className={cn(className, 'text-left')}>
      {value
        ? <span className="text-sm font-medium">{shortDate(value)}</span>
        : <span className="text-sm font-medium text-[rgba(26,26,10,0.28)] dark:text-white/25">dd/mm/aaaa</span>}
    </button>
  );
}

function MiniDatePicker({
  value,
  onSelect,
  onClose,
}: {
  value: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
}) {
  const [viewDate, setViewDate] = useState(() => (value ? new Date(value + 'T00:00:00') : new Date()));

  const toIsoDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const days = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const cells: { day: number; type: 'prev' | 'curr' | 'next' }[] = [];
    for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, type: 'prev' });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, type: 'curr' });
    for (let d = 1; cells.length < 42; d++) cells.push({ day: d, type: 'next' });
    return cells;
  }, [viewDate]);

  const monthLabel = viewDate.toLocaleDateString('pt-BR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())
    + ' ' + viewDate.getFullYear();
  const todayIso = toIsoDay(new Date());

  function handleDayClick(cell: { day: number; type: 'prev' | 'curr' | 'next' }) {
    if (cell.type !== 'curr') return;
    onSelect(toIsoDay(new Date(viewDate.getFullYear(), viewDate.getMonth(), cell.day)));
    onClose();
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className="fixed inset-x-0 bottom-0 z-[140] bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-t-[28px] shadow-2xl overflow-hidden flex flex-col"
      style={{ maxHeight: '70svh' }}
    >
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full bg-[rgba(26,26,10,0.15)] dark:bg-white/20" />
      </div>
      <div className="flex items-center justify-between px-4 pb-3 shrink-0">
        <span className="text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3]">Selecionar Data</span>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-[rgba(26,26,10,0.07)] dark:bg-white/[0.07] flex items-center justify-center text-[rgba(26,26,10,0.45)] dark:text-white/35 active:scale-90 transition-transform"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-none px-4 pb-4">
        <div className="bg-[#FFE500] rounded-2xl px-4 py-3 flex items-center justify-between gap-2.5">
          <span className="text-[15px] font-black text-[#1A1A0E] capitalize">{monthLabel}</span>
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="w-[34px] h-[34px] rounded-[10px] bg-[rgba(26,26,10,0.08)] flex items-center justify-center text-[rgba(26,26,10,0.55)]"
            >
              <ChevronLeft size={15} strokeWidth={2.5} />
            </button>
            <button
              onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              className="w-[34px] h-[34px] rounded-[10px] bg-[rgba(26,26,10,0.08)] flex items-center justify-center text-[rgba(26,26,10,0.55)]"
            >
              <ChevronRight size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 mt-4 mb-1.5">
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-black uppercase text-[rgba(26,26,10,0.28)] dark:text-white/22 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((cell, i) => {
            const cellIso = cell.type === 'curr' ? toIsoDay(new Date(viewDate.getFullYear(), viewDate.getMonth(), cell.day)) : null;
            const isSelected = cellIso !== null && cellIso === value;
            const isToday = cellIso !== null && cellIso === todayIso;
            return (
              <button
                key={i}
                disabled={cell.type !== 'curr'}
                onClick={() => handleDayClick(cell)}
                className={cn(
                  'aspect-square flex items-center justify-center text-[13px] font-bold rounded-xl transition-all',
                  cell.type !== 'curr' && 'text-[rgba(26,26,10,0.18)] dark:text-white/15',
                  cell.type === 'curr' && !isToday && !isSelected && 'text-[rgba(26,26,10,0.60)] dark:text-white/55',
                  isToday && !isSelected && 'bg-[rgba(216,30,30,0.10)] text-[#D81E1E] font-black',
                  isSelected && 'bg-[#D81E1E] text-white font-black shadow-[0_3px_8px_rgba(216,30,30,0.30)]',
                )}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
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
  parcelas,
  onOpenParcelas,
  pendingNotes,
  onPendingChange,
}: {
  form: TxForm;
  setForm: (f: TxForm) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  tags: FinanceTag[];
  onCreateTag: (nome: string, cor: string) => Promise<FinanceTag>;
  parcelas: ParcelaRow[];
  onOpenParcelas: () => void;
  pendingNotes: LinkedNoteLite[];
  onPendingChange: (notes: LinkedNoteLite[]) => void;
}) {
  const [showKbd, setShowKbd] = useState(true);
  const [favSearch, setFavSearch] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const fieldCls = 'w-full min-w-0 box-border bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]';
  const labelCls = 'text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block';

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className="fixed inset-x-0 bottom-0 z-[110] bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-t-[28px] shadow-2xl overflow-hidden flex flex-col"
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
      <div className="flex-1 overflow-y-auto overscroll-none px-4 space-y-3 pb-3">
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
        <div className="min-w-0">
          <span className={labelCls}>Data</span>
          <DateFieldButton
            className={fieldCls}
            value={form.data}
            onOpen={() => { setShowKbd(false); setShowDatePicker(true); }}
          />
        </div>

        {/* Observações */}
        <div>
          <span className={labelCls}>Observações</span>
          <textarea
            className={cn(fieldCls, 'resize-none')}
            value={form.observacoes}
            onChange={e => setForm({ ...form, observacoes: e.target.value })}
            placeholder="Comentários sobre esta movimentação... (opcional)"
            rows={3}
            onFocus={() => setShowKbd(false)}
          />
        </div>

        {/* Notas fiscais vinculadas */}
        <LinkedNotesSection
          variant="mobile"
          editable
          txId={null}
          pendingNotes={pendingNotes}
          onPendingChange={onPendingChange}
        />

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
          <button
            onClick={onOpenParcelas}
            className={cn(
              'w-full mt-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider border-[1.5px] transition-colors flex items-center justify-center gap-2',
              parcelas.length > 0
                ? 'bg-[rgba(216,30,30,0.10)] border-[rgba(216,30,30,0.24)] text-[#D81E1E]'
                : 'bg-transparent border-[rgba(26,26,10,0.10)] dark:border-white/[0.08] text-[rgba(26,26,10,0.45)] dark:text-white/35'
            )}
          >
            <CreditCard size={13} />
            {parcelas.length === 1 ? 'Vencimento configurado'
              : parcelas.length > 1 ? `${parcelas.length} parcelas configuradas`
              : 'Vencimento / Parcelas'}
          </button>
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
          disabled={saving || !form.favorecido.trim() || (parcelas.length === 0 && form.valor_final === '0')}
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

      {/* Seletor de data (Data) */}
      <AnimatePresence>
        {showDatePicker && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[135] bg-black/45 backdrop-blur-sm"
              onClick={() => setShowDatePicker(false)}
            />
            <MiniDatePicker
              value={form.data}
              onSelect={v => setForm({ ...form, data: v })}
              onClose={() => setShowDatePicker(false)}
            />
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Calendar Sheet ──────────────────────────────────────────────────────────

function CalendarSheet({
  monthLabel,
  days,
  today: todayDate,
  viewDate,
  onPrevMonth,
  onNextMonth,
  rangeMode,
  onToggleRangeMode,
  selectedDate,
  rangeStart,
  rangeEnd,
  onDayClick,
  onClear,
  onClose,
  toIsoDay,
}: {
  monthLabel: string;
  days: { day: number; type: 'prev' | 'curr' | 'next'; hasLancamento: boolean; hasVencimento: boolean; overdue: boolean; allPaid: boolean }[];
  today: Date;
  viewDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  rangeMode: boolean;
  onToggleRangeMode: () => void;
  selectedDate: Date | null;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  onDayClick: (cell: { day: number; type: 'prev' | 'curr' | 'next' }) => void;
  onClear: () => void;
  onClose: () => void;
  toIsoDay: (d: Date) => string;
}) {
  const hasPeriod = (rangeStart && rangeEnd) || selectedDate;
  const [legendOpen, setLegendOpen] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (legendRef.current && !legendRef.current.contains(e.target as Node))
        setLegendOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className="fixed inset-x-0 bottom-0 z-[110] bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-t-[28px] shadow-2xl overflow-hidden flex flex-col"
      style={{ maxHeight: '90svh' }}
    >
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full bg-[rgba(26,26,10,0.15)] dark:bg-white/20" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 shrink-0">
        <span className="text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3]">Calendário</span>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-[rgba(26,26,10,0.07)] dark:bg-white/[0.07] flex items-center justify-center text-[rgba(26,26,10,0.45)] dark:text-white/35 active:scale-90 transition-transform"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-none px-4 pb-4">
        {/* Month header */}
        <div className="bg-[#FFE500] rounded-2xl px-4 py-3 flex items-center justify-between gap-2.5">
          <span className="text-[15px] font-black text-[#1A1A0E] capitalize">{monthLabel}</span>
          <div className="flex gap-1.5 shrink-0">
            <div className="relative" ref={legendRef}>
              <button
                onClick={() => setLegendOpen(v => !v)}
                className={cn(
                  'w-[34px] h-[34px] rounded-[10px] flex items-center justify-center transition-colors',
                  legendOpen
                    ? 'bg-[#1A1A0E]/14 text-[#1A1A0E]'
                    : 'bg-[rgba(26,26,10,0.08)] text-[rgba(26,26,10,0.55)]',
                )}
              >
                <Info size={15} strokeWidth={2.5} />
              </button>
              <AnimatePresence>
                {legendOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
                    className="absolute left-0 top-[40px] z-20 w-[204px] bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl shadow-lg p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-[7px] h-[7px] rounded-full bg-blue-500 dark:bg-blue-400 shrink-0" />
                      <span className="text-[11px] font-bold text-[#1A1A0E]/70 dark:text-white/60">Lançamento</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-[7px] h-[7px] rounded-full bg-[#D81E1E] shrink-0" />
                      <span className="text-[11px] font-bold text-[#1A1A0E]/70 dark:text-white/60">Vencimento</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full ring-[1.5px] ring-amber-500 shrink-0 flex items-center justify-center">
                        <AlertTriangle size={8} strokeWidth={3} className="text-amber-500" />
                      </span>
                      <span className="text-[11px] font-bold text-[#1A1A0E]/70 dark:text-white/60">Vencido, não pago</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 shrink-0 flex items-center justify-center">
                        <Check size={8} strokeWidth={3.5} className="text-white" />
                      </span>
                      <span className="text-[11px] font-bold text-[#1A1A0E]/70 dark:text-white/60">Vencimento(s) pago(s)</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={onToggleRangeMode}
              className={cn(
                'w-[34px] h-[34px] rounded-[10px] flex items-center justify-center transition-colors',
                rangeMode
                  ? 'bg-[#D81E1E] text-white'
                  : 'bg-[rgba(26,26,10,0.08)] text-[rgba(26,26,10,0.55)]',
              )}
            >
              <Filter size={15} strokeWidth={2.5} />
            </button>
            <button
              onClick={onPrevMonth}
              className="w-[34px] h-[34px] rounded-[10px] bg-[rgba(26,26,10,0.08)] flex items-center justify-center text-[rgba(26,26,10,0.55)]"
            >
              <ChevronLeft size={15} strokeWidth={2.5} />
            </button>
            <button
              onClick={onNextMonth}
              className="w-[34px] h-[34px] rounded-[10px] bg-[rgba(26,26,10,0.08)] flex items-center justify-center text-[rgba(26,26,10,0.55)]"
            >
              <ChevronRight size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Weekday row */}
        <div className="grid grid-cols-7 mt-4 mb-1.5">
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-black uppercase text-[rgba(26,26,10,0.28)] dark:text-white/22 py-1">{d}</div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((cell, i) => {
            const isToday = cell.type === 'curr'
              && cell.day === todayDate.getDate()
              && viewDate.getMonth() === todayDate.getMonth()
              && viewDate.getFullYear() === todayDate.getFullYear();
            const isSelected = !rangeMode && selectedDate !== null
              && cell.type === 'curr'
              && cell.day === selectedDate.getDate()
              && viewDate.getMonth() === selectedDate.getMonth()
              && viewDate.getFullYear() === selectedDate.getFullYear();
            const cellIso = cell.type === 'curr' ? toIsoDay(new Date(viewDate.getFullYear(), viewDate.getMonth(), cell.day)) : null;
            const rangeStartIso = rangeStart ? toIsoDay(rangeStart) : null;
            const rangeEndIso = rangeEnd ? toIsoDay(rangeEnd) : null;
            const isRangeEndpoint = cellIso !== null && (cellIso === rangeStartIso || cellIso === rangeEndIso);
            const isInRange = cellIso !== null && rangeStartIso !== null && rangeEndIso !== null
              && cellIso > rangeStartIso && cellIso < rangeEndIso;
            return (
              <button
                key={i}
                disabled={cell.type !== 'curr'}
                onClick={() => onDayClick(cell)}
                className={cn(
                  'aspect-square flex items-center justify-center text-[13px] font-bold rounded-xl relative transition-all',
                  cell.type !== 'curr' && 'text-[rgba(26,26,10,0.18)] dark:text-white/15',
                  cell.type === 'curr' && !isToday && !isSelected && !isRangeEndpoint && !isInRange && 'text-[rgba(26,26,10,0.60)] dark:text-white/55',
                  isToday && !isSelected && !isRangeEndpoint && !isInRange && 'bg-[rgba(216,30,30,0.10)] text-[#D81E1E] font-black',
                  isSelected && 'bg-[#D81E1E] text-white font-black shadow-[0_3px_8px_rgba(216,30,30,0.30)]',
                  isRangeEndpoint && 'bg-[#D81E1E] text-white font-black shadow-[0_3px_8px_rgba(216,30,30,0.30)]',
                  isInRange && 'bg-[rgba(216,30,30,0.13)] text-[#D81E1E] font-bold',
                  cell.overdue && !isSelected && !isRangeEndpoint && 'ring-[1.5px] ring-amber-500',
                )}
              >
                {cell.day}
                {(cell.hasLancamento || cell.hasVencimento) && !isSelected && !isRangeEndpoint && (
                  <span className="absolute bottom-[4px] left-1/2 -translate-x-1/2 flex items-center gap-[3px]">
                    {cell.hasLancamento && (
                      <span className={cn('w-[5px] h-[5px] rounded-full', isToday ? 'bg-[#D81E1E]/70' : 'bg-blue-500 dark:bg-blue-400')} />
                    )}
                    {cell.hasVencimento && (
                      <span className={cn('w-[5px] h-[5px] rounded-full', isToday ? 'bg-[#D81E1E]/70' : 'bg-[#D81E1E]')} />
                    )}
                  </span>
                )}
                {(cell.overdue || cell.allPaid) && (
                  <span className={cn(
                    'absolute -top-[6px] -right-[6px] w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#FDFAF0] dark:border-[#1E1E18]',
                    cell.overdue ? 'bg-amber-500' : 'bg-emerald-600',
                  )}>
                    {cell.overdue
                      ? <AlertTriangle size={9} strokeWidth={3} className="text-white" />
                      : <Check size={9} strokeWidth={3.5} className="text-white" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Range selection hint */}
        {rangeMode && !(rangeStart && rangeEnd) && (
          <div className="mt-3 bg-[rgba(26,26,10,0.05)] dark:bg-white/[0.05] border border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] rounded-2xl px-3.5 py-2.5 text-center">
            <span className="text-[12px] font-bold text-[rgba(26,26,10,0.50)] dark:text-white/40">
              {!rangeStart ? 'Selecione o dia inicial do período' : 'Selecione o dia final do período'}
            </span>
          </div>
        )}

        {/* Active filter badge */}
        {hasPeriod && (
          <div className="mt-3 flex items-center justify-between gap-2 bg-[rgba(216,30,30,0.07)] dark:bg-[rgba(216,30,30,0.12)] border border-[rgba(216,30,30,0.20)] rounded-2xl px-3.5 py-2.5">
            <span className="text-[12px] font-bold text-[#D81E1E]">
              {rangeStart && rangeEnd
                ? `Período: ${rangeStart.toLocaleDateString('pt-BR')} – ${rangeEnd.toLocaleDateString('pt-BR')}`
                : `Data: ${selectedDate!.toLocaleDateString('pt-BR')}`}
            </span>
            <button onClick={onClear} className="text-[#D81E1E]/60 active:text-[#D81E1E] shrink-0">
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>

      <div className="px-4 pb-4 pt-1 shrink-0" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
        <button
          onClick={onClose}
          className="w-full bg-[#D81E1E] text-white rounded-2xl py-3.5 text-[13px] font-black uppercase tracking-wide shadow-lg shadow-[#D81E1E]/25 active:scale-[0.98] transition-transform"
        >
          Aplicar Filtro
        </button>
      </div>
    </motion.div>
  );
}

// ── Filter Field Sheet ───────────────────────────────────────────────────────

const FILTER_FIELD_OPTIONS: { key: SearchField | null; label: string; sub?: string }[] = [
  { key: null, label: 'Padrão', sub: 'Favorecido + Estabelec.' },
  { key: 'favorecido', label: 'Favorecido' },
  { key: 'estabelecimento', label: 'Estabelecimento' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'tipo_pagamento', label: 'Pagamento' },
  { key: 'tags', label: 'Tags' },
  { key: 'vencimento', label: 'Vencimento' },
];

function FilterFieldSheet({
  value,
  onChange,
  onClose,
}: {
  value: SearchField | null;
  onChange: (v: SearchField | null) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className="fixed inset-x-0 bottom-0 z-[110] bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-t-[28px] shadow-2xl overflow-hidden flex flex-col"
      style={{ maxHeight: '90svh' }}
    >
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full bg-[rgba(26,26,10,0.15)] dark:bg-white/20" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-1 shrink-0">
        <span className="text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3]">Filtrar Busca</span>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-[rgba(26,26,10,0.07)] dark:bg-white/[0.07] flex items-center justify-center text-[rgba(26,26,10,0.45)] dark:text-white/35 active:scale-90 transition-transform"
        >
          <X size={16} />
        </button>
      </div>
      <p className="px-4 pb-3 text-[11.5px] font-semibold text-[rgba(26,26,10,0.40)] dark:text-white/35">
        Escolha em qual coluna o texto digitado deve ser buscado
      </p>

      <div className="flex-1 overflow-y-auto overscroll-none px-4 pb-2">
        {FILTER_FIELD_OPTIONS.map(opt => {
          const isActive = value === opt.key;
          return (
            <button
              key={opt.label}
              onClick={() => onChange(opt.key)}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3.5 rounded-2xl mb-2 border-[1.5px] transition-colors text-left',
                isActive
                  ? 'bg-[rgba(216,30,30,0.06)] dark:bg-[rgba(216,30,30,0.12)] border-[rgba(216,30,30,0.22)] dark:border-[rgba(216,30,30,0.28)]'
                  : 'bg-white dark:bg-[#252520] border-[rgba(26,26,10,0.08)] dark:border-white/[0.07]',
              )}
            >
              <div>
                <div className={cn(
                  'text-[14px] font-extrabold',
                  isActive ? 'text-[#D81E1E] dark:text-[#F43F5E]' : 'text-[#1A1A0E] dark:text-[#F2F0E3]',
                )}>
                  {opt.label}
                </div>
                {opt.sub && (
                  <div className="text-[10.5px] font-semibold text-[rgba(26,26,10,0.35)] dark:text-white/30 mt-0.5">{opt.sub}</div>
                )}
              </div>
              <div className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
                isActive ? 'border-[#D81E1E] bg-[#D81E1E]' : 'border-[rgba(26,26,10,0.20)] dark:border-white/20',
              )}>
                {isActive && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>
          );
        })}
      </div>

      <div className="px-4 pb-4 pt-1 shrink-0" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
        <button
          onClick={onClose}
          className="w-full bg-[#D81E1E] text-white rounded-2xl py-3.5 text-[13px] font-black uppercase tracking-wide shadow-lg shadow-[#D81E1E]/25 active:scale-[0.98] transition-transform"
        >
          Aplicar Filtro
        </button>
      </div>
    </motion.div>
  );
}

// ── Transaction Detail Sheet (view + inline edit) ───────────────────────────

function TxDetailSheet({
  tx,
  mode,
  onToggleMode,
  form,
  setForm,
  onSave,
  onClose,
  saving,
  tags,
  onCreateTag,
  parcelas,
  onOpenParcelas,
  groupTotal,
  onEditAllParcelas,
  editingWholeGroup,
}: {
  tx: Transaction;
  mode: 'view' | 'edit';
  onToggleMode: () => void;
  form: TxForm;
  setForm: (f: TxForm) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  tags: FinanceTag[];
  onCreateTag: (nome: string, cor: string) => Promise<FinanceTag>;
  parcelas: ParcelaRow[];
  onOpenParcelas: () => void;
  groupTotal: number | null;
  onEditAllParcelas?: () => void;
  editingWholeGroup?: boolean;
}) {
  const [showKbd, setShowKbd] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const isEdit = mode === 'edit';

  const fieldCls = 'w-full min-w-0 box-border bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]';
  const viewBlockCls = 'w-full min-w-0 box-border bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-bold text-[#1A1A0E] dark:text-[#F2F0E3]';
  const labelCls = 'text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block';

  const selectedTags = tags.filter(t => tx.tag_ids?.includes(t.id));

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className="fixed inset-x-0 bottom-0 z-[110] bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-t-[28px] shadow-2xl overflow-hidden flex flex-col"
      style={{ height: '90svh' }}
    >
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full bg-[rgba(26,26,10,0.15)] dark:bg-white/20" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 shrink-0">
        <span className={cn('text-[15px] font-black', isEdit ? 'text-[#D81E1E]' : 'text-[#1A1A0E] dark:text-[#F2F0E3]')}>
          {isEdit ? 'Editar Movimentação' : 'Detalhes da Movimentação'}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleMode}
            className={cn(
              'w-8 h-8 rounded-full border-[1.5px] flex items-center justify-center active:scale-90 transition-all',
              isEdit
                ? 'bg-[rgba(216,30,30,0.12)] border-[rgba(216,30,30,0.28)] text-[#D81E1E]'
                : 'bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.06] border-[rgba(26,26,10,0.10)] dark:border-white/[0.10] text-[rgba(26,26,10,0.50)] dark:text-white/40'
            )}
            title="Editar"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[rgba(26,26,10,0.07)] dark:bg-white/[0.07] flex items-center justify-center text-[rgba(26,26,10,0.45)] dark:text-white/35 active:scale-90 transition-transform"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto overscroll-none px-4 space-y-3 pb-3">
        {/* Tipo */}
        <div>
          <span className={labelCls}>Tipo</span>
          {isEdit ? (
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
          ) : (
            <span className={cn(
              'inline-block px-3.5 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider',
              tx.tipo === 'Receita'
                ? 'bg-[rgba(5,150,105,0.10)] text-[#059669] dark:bg-[rgba(52,211,153,0.14)] dark:text-[#34D399]'
                : 'bg-[rgba(216,30,30,0.10)] text-[#D81E1E] dark:bg-[rgba(216,30,30,0.14)] dark:text-[#F43F5E]'
            )}>
              {tx.tipo}
            </span>
          )}
        </div>

        {/* Valor */}
        <div>
          <span className={labelCls}>Valor</span>
          {isEdit ? (
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
          ) : (
            <div className={cn(
              "font-['DM_Mono',monospace] text-[24px] font-black tracking-tight",
              tx.tipo === 'Receita' ? 'text-[#059669] dark:text-[#34D399]' : 'text-[#E11D48] dark:text-[#F43F5E]'
            )}>
              {fmt(tx.valor_final)}
            </div>
          )}
        </div>

        {/* Favorecido */}
        <div>
          <span className={labelCls}>Favorecido / Descrição</span>
          {isEdit ? (
            <input
              className={fieldCls}
              value={form.favorecido}
              onChange={e => setForm({ ...form, favorecido: e.target.value })}
              placeholder="Nome do favorecido..."
              onFocus={() => setShowKbd(false)}
            />
          ) : (
            <div className={viewBlockCls}>{tx.favorecido || '—'}</div>
          )}
        </div>

        {/* Data */}
        <div className="min-w-0">
          <span className={labelCls}>Data</span>
          {isEdit ? (
            <DateFieldButton
              className={fieldCls}
              value={form.data}
              onOpen={() => { setShowKbd(false); setShowDatePicker(true); }}
            />
          ) : (
            <div className={cn(viewBlockCls, 'font-semibold')}>
              {new Date(tx.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
          )}
        </div>

        {/* Observações */}
        <div>
          <span className={labelCls}>Observações</span>
          {isEdit ? (
            <textarea
              className={cn(fieldCls, 'resize-none')}
              value={form.observacoes}
              onChange={e => setForm({ ...form, observacoes: e.target.value })}
              placeholder="Comentários sobre esta movimentação... (opcional)"
              rows={3}
              onFocus={() => setShowKbd(false)}
            />
          ) : (
            <div className={cn(viewBlockCls, 'font-medium whitespace-pre-wrap')}>{tx.observacoes || '—'}</div>
          )}
        </div>

        {/* Notas fiscais vinculadas */}
        <LinkedNotesSection
          variant="mobile"
          editable={isEdit}
          txId={tx.id}
          txMeta={{ favorecido: tx.favorecido, valor_final: tx.valor_final }}
        />

        {/* Vencimento / Parcelamento (somente leitura — configurar via "Visualizar pagamento" abaixo) */}
        {!isEdit && (
          <div className="min-w-0">
            <span className={labelCls}>Vencimento / Parcelamento</span>
            {tx.vencimento ? (
              <div className="flex items-center gap-2 flex-wrap">
                <div className={cn(viewBlockCls, 'inline-block w-auto font-semibold')}>
                  {new Date(tx.vencimento + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </div>
                <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-[rgba(216,30,30,0.10)] dark:bg-[rgba(216,30,30,0.15)] text-[11px] font-black text-[#D81E1E] dark:text-[#F43F5E]">
                  {tx.numero_parcela ?? 1}/{tx.total_parcelas ?? 1}
                </span>
              </div>
            ) : (
              <span className="text-[12px] font-semibold text-[rgba(26,26,10,0.30)] dark:text-white/22">À vista, sem parcelamento</span>
            )}
          </div>
        )}

        {/* Valor Total do Parcelamento (somente leitura) */}
        {!isEdit && groupTotal !== null && (
          <div className="min-w-0">
            <span className={labelCls}>Valor Total do Parcelamento</span>
            <div className={cn(viewBlockCls, 'text-[#D81E1E] dark:text-[#F43F5E]')}>
              {fmt(groupTotal)}
            </div>
          </div>
        )}

        {/* Tipo Pagamento */}
        <div>
          <span className={labelCls}>Tipo de pagamento</span>
          {isEdit ? (
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
          ) : (
            <span className="inline-block bg-[rgba(26,26,10,0.08)] dark:bg-white/[0.08] border-[1.5px] border-[rgba(26,26,10,0.14)] dark:border-white/[0.14] rounded-lg px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider text-[#1A1A0E] dark:text-[#F2F0E3]">
              {tx.tipo_pagamento}
            </span>
          )}
          {isEdit && (
            <button
              onClick={onOpenParcelas}
              className={cn(
                'w-full mt-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider border-[1.5px] transition-colors flex items-center justify-center gap-2',
                parcelas.length > 0
                  ? 'bg-[rgba(216,30,30,0.10)] border-[rgba(216,30,30,0.24)] text-[#D81E1E]'
                  : 'bg-transparent border-[rgba(26,26,10,0.10)] dark:border-white/[0.08] text-[rgba(26,26,10,0.45)] dark:text-white/35'
              )}
            >
              <CreditCard size={13} />
              {parcelas.length === 1 ? 'Vencimento configurado'
                : parcelas.length > 1 ? `${parcelas.length} parcelas configuradas`
                : 'Vencimento / Parcelas'}
            </button>
          )}
          {isEdit && editingWholeGroup && (
            <div className="mt-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-[10px] font-bold text-amber-700 dark:text-amber-400">
              Editando o parcelamento inteiro — salvar substituirá todas as parcelas
            </div>
          )}
          {isEdit && !editingWholeGroup && groupTotal !== null && onEditAllParcelas && (
            <button
              onClick={onEditAllParcelas}
              className="w-full mt-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider bg-[#D81E1E] text-white shadow-[0_4px_14px_rgba(216,30,30,0.28)] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <CreditCard size={13} />
              Editar todas as parcelas
            </button>
          )}
        </div>

        {/* Estabelecimento */}
        <div>
          <span className={labelCls}>Estabelecimento</span>
          {isEdit ? (
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
          ) : (
            <span className="inline-block bg-[#FFE500] border-[1.5px] border-[#D4C000] rounded-xl px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wide text-[rgba(26,26,10,0.78)]">
              {tx.estabelecimento}
            </span>
          )}
        </div>

        {/* Tags */}
        {isEdit ? (
          <TagSelector
            tags={tags}
            value={form.tag_ids}
            onChange={ids => setForm({ ...form, tag_ids: ids })}
            onCreateTag={onCreateTag}
          />
        ) : (
          <div>
            <span className={labelCls}>Tags</span>
            {selectedTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedTags.map(tag => {
                  const c = TAG_COLOR_MAP[tag.cor] ?? TAG_COLOR_MAP.gray;
                  return (
                    <span
                      key={tag.id}
                      className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border', c.bg, c.text, c.border, c.bgDark, c.textDark, c.borderDark)}
                    >
                      {tag.nome}
                    </span>
                  );
                })}
              </div>
            ) : (
              <span className="text-[12px] font-semibold text-[rgba(26,26,10,0.30)] dark:text-white/22">Nenhuma</span>
            )}
          </div>
        )}

        {/* Pago toggle / status */}
        <div className="flex items-center gap-3 py-1">
          {isEdit ? (
            <>
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
            </>
          ) : (
            <>
              <div className={cn(
                'w-6 h-6 rounded-[7px] flex items-center justify-center',
                tx.pago ? 'bg-[#059669] text-white' : 'bg-[rgba(26,26,10,0.08)] dark:bg-white/[0.08]'
              )}>
                {tx.pago && <Check size={12} strokeWidth={3} />}
              </div>
              <span className="text-sm font-bold text-[#1A1A0E] dark:text-[#F2F0E3]">
                {tx.pago ? 'Já foi pago' : 'Ainda não foi pago'}
              </span>
            </>
          )}
        </div>

        {/* Footer action */}
        {isEdit ? (
          <button
            onClick={onSave}
            disabled={saving || !form.favorecido.trim() || (parcelas.length === 0 && form.valor_final === '0')}
            className={cn(
              'w-full py-3.5 rounded-2xl text-[13px] font-black uppercase tracking-wider text-white',
              'bg-[#D81E1E] active:scale-[0.97] transition-transform',
              'disabled:opacity-40',
              'shadow-[0_4px_14px_rgba(216,30,30,0.30)]'
            )}
          >
            {saving ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'Salvar Alterações'}
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-[rgba(26,26,10,0.30)] dark:text-white/22 px-0.5">
            <Lock size={12} />
            Toque no lápis acima para editar
          </div>
        )}
      </div>

      {/* Numeric keyboard (edit mode only) */}
      <AnimatePresence>
        {isEdit && showKbd && (
          <NumericKeyboard
            value={form.valor_final}
            onChange={v => setForm({ ...form, valor_final: v })}
            onClose={() => setShowKbd(false)}
          />
        )}
      </AnimatePresence>

      {/* Seletor de data (Data, edit mode only) */}
      <AnimatePresence>
        {isEdit && showDatePicker && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[135] bg-black/45 backdrop-blur-sm"
              onClick={() => setShowDatePicker(false)}
            />
            <MiniDatePicker
              value={form.data}
              onSelect={v => setForm({ ...form, data: v })}
              onClose={() => setShowDatePicker(false)}
            />
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Parcelas do Pagamento (parcelamento múltiplo) ───────────────────────────

function ParcelasModal({
  initialRows,
  onSave,
  onClose,
}: {
  initialRows: ParcelaRow[];
  onSave: (rows: ParcelaRow[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ParcelaRow[]>(
    initialRows.length > 0 ? initialRows : [{ seq: 1, valor: '', validade: '' }]
  );
  const [datePickerIdx, setDatePickerIdx] = useState<number | null>(null);

  const fieldCls = 'w-full min-w-0 box-border bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]';
  const labelCls = 'text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block';

  function updateRow(idx: number, patch: Partial<ParcelaRow>) {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows(prev => [...prev, { seq: prev.length + 1, valor: '', validade: '' }]);
  }
  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, seq: i + 1 })));
  }

  const total = rows.reduce((s, r) => s + (parseFloat(r.valor.replace(',', '.')) || 0), 0);

  function handleSave() {
    const valid = rows
      .filter(r => r.validade && parseFloat(r.valor.replace(',', '.')) > 0)
      .map((r, i) => ({ ...r, seq: i + 1 }));
    onSave(valid);
    onClose();
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className="fixed inset-x-0 bottom-0 z-[130] bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-t-[28px] shadow-2xl overflow-hidden flex flex-col"
      style={{ height: '82svh' }}
    >
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full bg-[rgba(26,26,10,0.15)] dark:bg-white/20" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 shrink-0">
        <span className="text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3]">Parcelas do Pagamento</span>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-[rgba(26,26,10,0.07)] dark:bg-white/[0.07] flex items-center justify-center text-[rgba(26,26,10,0.45)] dark:text-white/35 active:scale-90 transition-transform"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable rows */}
      <div className="flex-1 overflow-y-auto overscroll-none px-4 space-y-2.5 pb-3">
        {rows.map((row, idx) => (
          <div key={idx} className="border-[1.5px] border-[rgba(26,26,10,0.08)] dark:border-white/[0.08] rounded-2xl p-2.5 flex flex-col gap-2 bg-white dark:bg-[#252520]">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-[rgba(26,26,10,0.40)] dark:text-white/30">
                <span className="w-[18px] h-[18px] rounded-[6px] bg-[rgba(216,30,30,0.10)] dark:bg-[rgba(216,30,30,0.16)] text-[#D81E1E] dark:text-[#F43F5E] flex items-center justify-center text-[10px] font-black">
                  {row.seq}
                </span>
                Parcela {row.seq}
              </span>
              {rows.length > 1 && (
                <button
                  onClick={() => removeRow(idx)}
                  className="w-6 h-6 rounded-lg bg-[rgba(216,30,30,0.08)] dark:bg-[rgba(216,30,30,0.14)] text-[#D81E1E] dark:text-[#F43F5E] flex items-center justify-center active:scale-90 transition-transform"
                >
                  <X size={11} />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <span className={labelCls}>Valor</span>
                <input
                  className={fieldCls}
                  value={row.valor}
                  onChange={e => updateRow(idx, { valor: e.target.value })}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>
              <div className="flex-1 min-w-0">
                <span className={labelCls}>Validade</span>
                <DateFieldButton
                  className={fieldCls}
                  value={row.validade}
                  onOpen={() => setDatePickerIdx(idx)}
                />
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={addRow}
          className="w-full py-2.5 rounded-xl border-[1.5px] border-dashed border-[rgba(26,26,10,0.20)] dark:border-white/[0.18] text-[rgba(26,26,10,0.45)] dark:text-white/35 text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
        >
          <Plus size={13} />
          Adicionar parcela
        </button>

        {total > 0 && (
          <div className="flex items-center justify-between bg-[rgba(216,30,30,0.06)] dark:bg-[rgba(216,30,30,0.12)] border border-[rgba(216,30,30,0.16)] dark:border-[rgba(216,30,30,0.26)] rounded-xl px-3.5 py-2.5">
            <span className="text-[10.5px] font-extrabold text-[rgba(26,26,10,0.50)] dark:text-white/55">{rows.length} parcela{rows.length > 1 ? 's' : ''} · Total</span>
            <span className="font-['DM_Mono',monospace] text-[13px] font-extrabold text-[#D81E1E] dark:text-[#F43F5E]">{fmt(total)}</span>
          </div>
        )}

        <button
          onClick={handleSave}
          className={cn(
            'w-full py-3.5 rounded-2xl text-[13px] font-black uppercase tracking-wider text-white',
            'bg-[#D81E1E] active:scale-[0.97] transition-transform',
            'shadow-[0_4px_14px_rgba(216,30,30,0.30)]'
          )}
        >
          Salvar Parcelas
        </button>
      </div>

      {/* Seletor de data (Validade da parcela) */}
      <AnimatePresence>
        {datePickerIdx !== null && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[135] bg-black/45 backdrop-blur-sm"
              onClick={() => setDatePickerIdx(null)}
            />
            <MiniDatePicker
              value={rows[datePickerIdx].validade}
              onSelect={v => updateRow(datePickerIdx, { validade: v })}
              onClose={() => setDatePickerIdx(null)}
            />
          </>
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
  const [pendingNotes, setPendingNotes] = useState<LinkedNoteLite[]>([]);
  const [saving, setSaving] = useState(false);
  const [dashPeriod, setDashPeriod] = useState<DashPeriod>('30d');
  const { tags, createTag } = useFinanceTags();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // aba Dados — contas e favorecidos
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [favorecidos, setFavorecidos] = useState<Favorecido[]>([]);
  const [dadosFavSearch, setDadosFavSearch] = useState('');
  const [dadosLoaded, setDadosLoaded] = useState(false);
  const [showAccountSheet, setShowAccountSheet] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm>(emptyAccountForm());
  const [savingAccount, setSavingAccount] = useState(false);
  const [showAddFavorecido, setShowAddFavorecido] = useState(false);
  const [novoNomeBanco, setNovoNomeBanco] = useState('');
  const [novoFavorecido, setNovoFavorecido] = useState('');
  const [savingFavorecido, setSavingFavorecido] = useState(false);

  // calendário
  const [showCalSheet, setShowCalSheet] = useState(false);
  const [calViewDate, setCalViewDate] = useState(() => new Date());
  const [calSelectedDate, setCalSelectedDate] = useState<Date | null>(null);
  const [calRangeMode, setCalRangeMode] = useState(false);
  const [calRangeStart, setCalRangeStart] = useState<Date | null>(null);
  const [calRangeEnd, setCalRangeEnd] = useState<Date | null>(null);

  // filtro de busca por coluna
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [searchField, setSearchField] = useState<SearchField | null>(null);

  // detalhes / edição de movimentação
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [detailMode, setDetailMode] = useState<'view' | 'edit'>('view');
  const [detailForm, setDetailForm] = useState<TxForm>(emptyForm());
  const [savingDetail, setSavingDetail] = useState(false);

  // parcelas do pagamento (Nova Movimentação e Editar)
  const [txParcelas, setTxParcelas] = useState<ParcelaRow[]>([]);
  const [detailParcelas, setDetailParcelas] = useState<ParcelaRow[]>([]);
  const [parcelasModalOpen, setParcelasModalOpen] = useState<'new' | 'edit' | null>(null);
  // Quando preenchido, salvar a edição substitui todas essas linhas (parcelamento inteiro)
  const [editingGroupIds, setEditingGroupIds] = useState<string[] | null>(null);

  // ── Data ────────────────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from('finance_transactions').select('*').order('data', { ascending: false });
    if (data) setTransactions(data as Transaction[]);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function loadDadosData() {
    const [accRes, favRes] = await Promise.all([
      supabase.from('finance_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('finance_favorecidos').select('*').order('nome_fiscal', { ascending: true }),
    ]);
    if (accRes.data) setAccounts(accRes.data as BankAccount[]);
    if (favRes.data) setFavorecidos(favRes.data as Favorecido[]);
    setDadosLoaded(true);
  }

  // ── Contas ──────────────────────────────────────────────────────────────

  function openAddAccount() {
    setEditingAccountId(null);
    setAccountForm(emptyAccountForm());
    setShowAccountSheet(true);
  }

  function openEditAccount(acc: BankAccount) {
    setEditingAccountId(acc.id);
    setAccountForm({
      nome: acc.nome, banco: acc.banco, agencia: acc.agencia, numero_conta: acc.numero_conta,
      saldo_inicial: String(acc.saldo_inicial ?? 0),
      imagemPreview: acc.imagem_url ?? '', imagemFile: null,
    });
    setShowAccountSheet(true);
  }

  function handleAccountImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAccountForm(f => ({ ...f, imagemFile: file, imagemPreview: URL.createObjectURL(file) }));
  }

  async function uploadAccountImage(file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `accounts/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file);
    if (error) throw error;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function handleAccountSubmit() {
    if (!accountForm.nome.trim()) return;
    setSavingAccount(true);
    try {
      const saldo_inicial = parseFloat(accountForm.saldo_inicial.replace(',', '.')) || 0;
      if (editingAccountId) {
        const payload: Record<string, any> = {
          nome: accountForm.nome, banco: accountForm.banco,
          agencia: accountForm.agencia, numero_conta: accountForm.numero_conta,
          saldo_inicial,
        };
        if (accountForm.imagemFile) payload.imagem_url = await uploadAccountImage(accountForm.imagemFile);
        await supabase.from('finance_accounts').update(payload).eq('id', editingAccountId);
      } else {
        let imagem_url = '';
        if (accountForm.imagemFile) imagem_url = await uploadAccountImage(accountForm.imagemFile);
        await supabase.from('finance_accounts').insert({
          nome: accountForm.nome, banco: accountForm.banco,
          agencia: accountForm.agencia, numero_conta: accountForm.numero_conta,
          saldo_inicial, imagem_url,
        });
      }
      await loadDadosData();
      setShowAccountSheet(false);
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleDeleteAccount(id: string) {
    if (!confirm('Excluir esta conta? Movimentações já vinculadas a ela não serão apagadas.')) return;
    await supabase.from('finance_accounts').delete().eq('id', id);
    setAccounts(prev => prev.filter(a => a.id !== id));
  }

  // ── Favorecidos ─────────────────────────────────────────────────────────

  async function handleAddFavorecido() {
    if (!novoFavorecido.trim()) return;
    setSavingFavorecido(true);
    try {
      const { data } = await supabase.from('finance_favorecidos')
        .insert({ nome_fiscal: novoFavorecido.trim(), nome_banco: novoNomeBanco.trim() })
        .select().single();
      if (data) setFavorecidos(prev => [...prev, data as Favorecido].sort((a, b) => a.nome_fiscal.localeCompare(b.nome_fiscal)));
      setNovoNomeBanco('');
      setNovoFavorecido('');
      setShowAddFavorecido(false);
    } finally {
      setSavingFavorecido(false);
    }
  }

  async function handleDeleteFavorecido(id: string) {
    await supabase.from('finance_favorecidos').delete().eq('id', id);
    setFavorecidos(prev => prev.filter(f => f.id !== id));
  }

  // Trava o scroll do body enquanto um sheet está aberto. `overflow: hidden` sozinho
  // não é suficiente no Safari/iOS (ele ainda permite o rubber-band da página por
  // trás, que "balança" a janela fixa) — a técnica confiável é fixar a posição do
  // body no scroll atual e restaurar ao fechar.
  useEffect(() => {
    const anySheetOpen = showAddSheet || showCalSheet || showFilterSheet || detailTx !== null || parcelasModalOpen !== null || showAccountSheet;
    if (!anySheetOpen) return;
    const scrollY = window.scrollY;
    const prev = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.left = prev.left;
      document.body.style.right = prev.right;
      document.body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [showAddSheet, showCalSheet, showFilterSheet, detailTx, parcelasModalOpen]);

  // ── Computed — Calendário ────────────────────────────────────────────────

  const toIsoDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const hasDatePeriod = !!(calRangeStart && calRangeEnd) || !!calSelectedDate;

  const inSelectedPeriod = (dateStr: string | null) => {
    if (!dateStr) return false;
    if (calRangeStart && calRangeEnd) {
      return dateStr >= toIsoDay(calRangeStart) && dateStr <= toIsoDay(calRangeEnd);
    }
    if (calSelectedDate) {
      return dateStr === toIsoDay(calSelectedDate);
    }
    return true;
  };

  const calDays = useMemo(() => {
    const year = calViewDate.getFullYear();
    const month = calViewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const todayIso = toIsoDay(new Date());

    const lancamentoDays = new Set(
      transactions
        .filter(t => {
          const d = new Date(t.data + 'T00:00:00');
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .map(t => new Date(t.data + 'T00:00:00').getDate()),
    );

    const vencimentoByDay = new Map<number, { hasUnpaid: boolean; hasPaid: boolean }>();
    transactions.forEach(t => {
      if (!t.vencimento) return;
      const d = new Date(t.vencimento + 'T00:00:00');
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const day = d.getDate();
      const entry = vencimentoByDay.get(day) ?? { hasUnpaid: false, hasPaid: false };
      if (t.pago) entry.hasPaid = true; else entry.hasUnpaid = true;
      vencimentoByDay.set(day, entry);
    });

    type CalCell = {
      day: number; type: 'prev' | 'curr' | 'next';
      hasLancamento: boolean; hasVencimento: boolean; overdue: boolean; allPaid: boolean;
    };
    const cells: CalCell[] = [];
    for (let i = firstDay - 1; i >= 0; i--)
      cells.push({ day: prevMonthDays - i, type: 'prev', hasLancamento: false, hasVencimento: false, overdue: false, allPaid: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const venc = vencimentoByDay.get(d);
      const cellIso = toIsoDay(new Date(year, month, d));
      cells.push({
        day: d,
        type: 'curr',
        hasLancamento: lancamentoDays.has(d),
        hasVencimento: !!venc,
        overdue: !!venc && venc.hasUnpaid && cellIso < todayIso,
        allPaid: !!venc && venc.hasPaid && !venc.hasUnpaid,
      });
    }
    for (let d = 1; cells.length < 42; d++)
      cells.push({ day: d, type: 'next', hasLancamento: false, hasVencimento: false, overdue: false, allPaid: false });
    return cells;
  }, [calViewDate, transactions]);

  const calMonthLabel = calViewDate.toLocaleDateString('pt-BR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())
    + ' ' + calViewDate.getFullYear();

  function toggleCalRangeMode() {
    if (calRangeMode) {
      setCalRangeMode(false);
      setCalRangeStart(null);
      setCalRangeEnd(null);
    } else {
      setCalRangeMode(true);
      setCalSelectedDate(null);
    }
  }

  function clearCalFilter() {
    setCalSelectedDate(null);
    setCalRangeMode(false);
    setCalRangeStart(null);
    setCalRangeEnd(null);
  }

  function handleCalDayClick(cell: { day: number; type: 'prev' | 'curr' | 'next' }) {
    if (cell.type !== 'curr') return;
    const cellDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth(), cell.day);
    if (calRangeMode) {
      if (!calRangeStart || (calRangeStart && calRangeEnd)) {
        setCalRangeStart(cellDate);
        setCalRangeEnd(null);
      } else {
        const startIso = toIsoDay(calRangeStart);
        const clickIso = toIsoDay(cellDate);
        if (clickIso < startIso) {
          setCalRangeEnd(calRangeStart);
          setCalRangeStart(cellDate);
        } else {
          setCalRangeEnd(cellDate);
        }
      }
      return;
    }
    const isSelected = calSelectedDate !== null && toIsoDay(calSelectedDate) === toIsoDay(cellDate);
    setCalSelectedDate(isSelected ? null : cellDate);
  }

  // ── Computed — Movimentações ─────────────────────────────────────────────

  // Soma o valor de todas as parcelas irmãs para dar visão do valor total do parcelamento.
  // Usa parcelamento_id quando disponível; linhas antigas sem esse campo caem no agrupamento
  // heurístico por favorecido/tipo/pagamento/estabelecimento/total_parcelas.
  const parcelaGroupKey = (t: Pick<Transaction, 'parcelamento_id' | 'favorecido' | 'tipo' | 'tipo_pagamento' | 'estabelecimento' | 'total_parcelas'>): string =>
    t.parcelamento_id ?? `legacy|${t.favorecido}|${t.tipo}|${t.tipo_pagamento}|${t.estabelecimento}|${t.total_parcelas}`;

  const parcelaGroupTotal = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const t of transactions) {
      if (!t.total_parcelas || t.total_parcelas <= 1) continue;
      const key = parcelaGroupKey(t);
      totals[key] = (totals[key] ?? 0) + t.valor_final;
    }
    return totals;
  }, [transactions]);

  const getParcelaGroupTotal = (t: Transaction): number | null => {
    if (!t.total_parcelas || t.total_parcelas <= 1) return null;
    return parcelaGroupTotal[parcelaGroupKey(t)] ?? null;
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return transactions.filter(t => {
      if (q) {
        if (searchField === 'favorecido') {
          if (!t.favorecido.toLowerCase().includes(q)) return false;
        } else if (searchField === 'estabelecimento') {
          if (!t.estabelecimento.toLowerCase().includes(q)) return false;
        } else if (searchField === 'tipo') {
          if (!t.tipo.toLowerCase().includes(q)) return false;
        } else if (searchField === 'tipo_pagamento') {
          if (!t.tipo_pagamento.toLowerCase().includes(q)) return false;
        } else if (searchField === 'tags') {
          const nomes = (t.tag_ids ?? []).map(id => tags.find(tg => tg.id === id)?.nome.toLowerCase() ?? '');
          if (!nomes.some(n => n.includes(q))) return false;
        } else if (searchField === 'vencimento') {
          if (!t.vencimento || !new Date(t.vencimento + 'T00:00:00').toLocaleDateString('pt-BR').includes(q)) return false;
        } else if (!t.favorecido.toLowerCase().includes(q) && !t.estabelecimento.toLowerCase().includes(q)) {
          return false;
        }
      }
      return inSelectedPeriod(t.data) || inSelectedPeriod(t.vencimento);
    });
  }, [transactions, search, searchField, tags, calSelectedDate, calRangeStart, calRangeEnd]);

  const totals = useMemo(() => {
    const rec  = filtered.filter(t => t.tipo === 'Receita').reduce((s, t) => s + t.valor_final, 0);
    const desp = filtered.filter(t => t.tipo === 'Despesa').reduce((s, t) => s + t.valor_final, 0);
    return { rec, desp, saldo: rec - desp };
  }, [filtered]);

  const vencimentoStats = useMemo(() => {
    const despesasVencendo = transactions.filter(t => t.tipo === 'Despesa' && inSelectedPeriod(t.vencimento));
    return {
      count: despesasVencendo.length,
      valor: despesasVencendo.reduce((s, t) => s + t.valor_final, 0),
      totalPago: despesasVencendo.reduce((s, t) => s + t.total_pago, 0),
    };
  }, [transactions, calSelectedDate, calRangeStart, calRangeEnd]);

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
    if (!txForm.favorecido.trim()) return;
    if (txParcelas.length === 0 && txForm.valor_final === '0') return;
    setSaving(true);
    const base = {
      tipo: txForm.tipo,
      tipo_pagamento: txForm.tipo_pagamento,
      favorecido: txForm.favorecido.trim(),
      estabelecimento: txForm.estabelecimento,
      numero_cheque: null,
      tag_ids: txForm.tag_ids ?? [],
      observacoes: txForm.observacoes.trim() || null,
    };
    if (txParcelas.length > 1) {
      // Mesma convenção do desktop (FinanceManager.tsx): cada parcela vira sua própria
      // transação, com data/vencimento = a validade da parcela, e pago/total_pago zerados.
      const parcelamentoId = crypto.randomUUID();
      const { data: inserted } = await supabase.from('finance_transactions').insert(
        txParcelas.map(p => ({
          ...base,
          data: p.validade,
          vencimento: p.validade,
          valor_final: parseFloat(p.valor.replace(',', '.')) || 0,
          total_pago: 0,
          pago: false,
          numero_parcela: p.seq,
          total_parcelas: txParcelas.length,
          parcelamento_id: parcelamentoId,
        }))
      ).select('id, favorecido, valor_final');
      if (inserted && pendingNotes.length > 0)
        await linkNotesToTransactions(inserted, pendingNotes.map(n => n.id));
    } else {
      // 1 parcela = pagamento único com data de vencimento, sem parcelamento
      const single = txParcelas[0] ?? null;
      const valorNum = single
        ? (parseFloat(single.valor.replace(',', '.')) || parseFloat(txForm.valor_final.replace(',', '.')) || 0)
        : parseFloat(txForm.valor_final.replace(',', '.'));
      const { data: inserted } = await supabase.from('finance_transactions').insert([{
        ...base,
        data: txForm.data,
        vencimento: single ? single.validade : null,
        valor_final: valorNum,
        total_pago: txForm.pago ? valorNum : 0,
        pago: txForm.pago,
        numero_parcela: null,
        total_parcelas: null,
        parcelamento_id: null,
      }]).select('id, favorecido, valor_final');
      if (inserted && pendingNotes.length > 0)
        await linkNotesToTransactions(inserted, pendingNotes.map(n => n.id));
    }
    setSaving(false);
    setShowAddSheet(false);
    setTxForm(emptyForm());
    setPendingNotes([]);
    setTxParcelas([]);
    loadData();
  }

  function openDetail(tx: Transaction) {
    setDetailTx(tx);
    setDetailForm({
      tipo: tx.tipo,
      tipo_pagamento: tx.tipo_pagamento,
      favorecido: tx.favorecido,
      estabelecimento: tx.estabelecimento,
      data: tx.data,
      valor_final: tx.valor_final.toFixed(2).replace('.', ','),
      pago: tx.pago,
      tag_ids: tx.tag_ids ?? [],
      observacoes: tx.observacoes ?? '',
    });
    // Vencimento vive no editor de parcelas: pré-carrega a própria linha para o
    // salvar não apagar o vencimento existente.
    setDetailParcelas(tx.vencimento
      ? [{ seq: 1, valor: tx.valor_final.toFixed(2).replace('.', ','), validade: tx.vencimento }]
      : []);
    setEditingGroupIds(null);
    setDetailMode('view');
  }

  // Carrega todas as parcelas irmãs no editor para edição em lote
  function loadGroupIntoDetail(tx: Transaction) {
    const key = parcelaGroupKey(tx);
    const siblings = transactions
      .filter(s => s.total_parcelas && s.total_parcelas > 1 && parcelaGroupKey(s) === key)
      .sort((a, b) => (a.numero_parcela ?? 0) - (b.numero_parcela ?? 0));
    if (siblings.length === 0) return;
    setDetailParcelas(siblings.map((s, i) => ({
      seq: i + 1,
      valor: s.valor_final.toFixed(2).replace('.', ','),
      validade: s.vencimento ?? s.data,
    })));
    setEditingGroupIds(siblings.map(s => s.id));
    setParcelasModalOpen('edit');
  }

  function closeDetail() {
    setDetailTx(null);
    setDetailMode('view');
    setDetailParcelas([]);
    setEditingGroupIds(null);
  }

  async function handleSaveDetail() {
    if (!detailTx) return;
    if (!detailForm.favorecido.trim()) return;
    if (detailParcelas.length === 0 && detailForm.valor_final === '0') return;
    setSavingDetail(true);
    const base = {
      tipo: detailForm.tipo,
      tipo_pagamento: detailForm.tipo_pagamento,
      favorecido: detailForm.favorecido.trim(),
      estabelecimento: detailForm.estabelecimento,
      numero_cheque: null,
      tag_ids: detailForm.tag_ids ?? [],
      observacoes: detailForm.observacoes.trim() || null,
    };
    if (detailParcelas.length === 1 && !editingGroupIds) {
      // Pagamento único com vencimento: atualiza no lugar, preservando
      // pago/numero_parcela/parcelamento_id da linha.
      const p = detailParcelas[0];
      const valorNum = parseFloat(p.valor.replace(',', '.')) || 0;
      const updates = {
        ...base,
        data: detailForm.data,
        vencimento: p.validade,
        valor_final: valorNum,
        pago: detailForm.pago,
        total_pago: detailForm.pago ? valorNum : 0,
      };
      await supabase.from('finance_transactions').update(updates).eq('id', detailTx.id);
      setSavingDetail(false);
      setDetailTx({ ...detailTx, ...updates });
      setDetailMode('view');
      loadData();
      return;
    }
    if (detailParcelas.length > 1) {
      // Parcelamento: substitui a(s) linha(s) original(is) por N novas (uma por parcela).
      // Com editingGroupIds, substitui o parcelamento inteiro de uma só vez.
      // Preserva os vínculos de notas: o delete cascateia a junção, então re-vincula depois.
      const replaceIds = editingGroupIds ?? [detailTx.id];
      const { data: linkedRows } = await supabase.from('finance_transaction_notes')
        .select('note_id').in('transaction_id', replaceIds);
      await supabase.from('finance_transactions').delete().in('id', replaceIds);
      const parcelamentoId = crypto.randomUUID();
      const { data: inserted } = await supabase.from('finance_transactions').insert(
        detailParcelas.map(p => ({
          ...base,
          data: p.validade,
          vencimento: p.validade,
          valor_final: parseFloat(p.valor.replace(',', '.')) || 0,
          total_pago: 0,
          pago: false,
          numero_parcela: p.seq,
          total_parcelas: detailParcelas.length,
          parcelamento_id: parcelamentoId,
        }))
      ).select('id, favorecido, valor_final');
      const relinkIds = [...new Set((linkedRows ?? []).map(r => r.note_id as string))];
      if (inserted && relinkIds.length > 0)
        await linkNotesToTransactions(inserted, relinkIds);
      setSavingDetail(false);
      setDetailTx(null);
      setDetailMode('view');
      setDetailParcelas([]);
      setEditingGroupIds(null);
      loadData();
      return;
    }
    const valorNum = parseFloat(detailForm.valor_final.replace(',', '.'));
    const updates = {
      ...base,
      data: detailForm.data,
      vencimento: null,
      valor_final: valorNum,
      pago: detailForm.pago,
      total_pago: detailForm.pago ? valorNum : 0,
      numero_parcela: null,
      total_parcelas: null,
      parcelamento_id: null,
    };
    await supabase.from('finance_transactions').update(updates).eq('id', detailTx.id);
    setSavingDetail(false);
    setDetailTx({ ...detailTx, ...updates });
    setDetailMode('view');
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
    const ids = [...selectedIds];
    await supabase.from('finance_transactions').delete().in('id', ids);
    await cleanupNoteLinksForDeletedTxs(ids);
    setSelectedIds(new Set());
    setSelectionMode(false);
    loadData();
  }

  async function handleMarkPaidSelected() {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    await Promise.all(ids.map(id => {
      const t = transactions.find(tx => tx.id === id);
      if (!t) return null;
      return supabase.from('finance_transactions').update({ pago: true, total_pago: t.valor_final }).eq('id', id);
    }));
    setSelectedIds(new Set());
    setSelectionMode(false);
    loadData();
  }

  function openAdd() {
    setTxForm(emptyForm());
    setTxParcelas([]);
    setShowAddSheet(true);
  }

  function switchTab(t: Tab) {
    setActiveTab(t);
    if (t === 'dados' && !dadosLoaded) loadDadosData();
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
    <>
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
          { key: 'mov',   label: 'Movimentações', icon: <ClipboardList size={11} /> },
          { key: 'dash',  label: 'Dashboard',      icon: <TrendingUp size={11} /> },
          { key: 'dados', label: 'Dados',          icon: <Database size={11} /> },
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
              <div className="flex gap-2 px-3 pt-3 pb-2 overflow-x-auto snap-x snap-mandatory scroll-pl-3 [scrollbar-width:none]">
                {([
                  { label: 'Receitas', value: totals.rec,   cls: 'text-[#059669] dark:text-[#34D399]', dotCls: 'bg-[rgba(5,150,105,0.12)] text-[#059669] dark:bg-[rgba(52,211,153,0.14)] dark:text-[#34D399]', glyph: '↑' },
                  { label: 'Despesas', value: totals.desp,  cls: 'text-[#E11D48] dark:text-[#F43F5E]', dotCls: 'bg-[rgba(225,29,72,0.12)] text-[#E11D48] dark:bg-[rgba(244,63,94,0.14)] dark:text-[#F43F5E]', glyph: '↓' },
                  { label: 'Saldo',    value: totals.saldo, cls: totals.saldo >= 0 ? 'text-[#059669] dark:text-[#34D399]' : 'text-[#E11D48] dark:text-[#F43F5E]', dotCls: totals.saldo >= 0 ? 'bg-[rgba(5,150,105,0.12)] text-[#059669] dark:bg-[rgba(52,211,153,0.14)] dark:text-[#34D399]' : 'bg-[rgba(225,29,72,0.12)] text-[#E11D48]', glyph: '=' },
                  { label: 'Vencimento', value: vencimentoStats.valor,    cls: 'text-[#B45309] dark:text-[#FCD34D]', dotCls: 'bg-[rgba(245,158,11,0.12)] text-[#B45309] dark:bg-[rgba(251,191,36,0.14)] dark:text-[#FCD34D]', glyph: <Clock size={11} strokeWidth={2.5} />, sub: `${vencimentoStats.count} mov.` },
                  { label: 'Total Pago', value: vencimentoStats.totalPago, cls: 'text-[#059669] dark:text-[#34D399]', dotCls: 'bg-[rgba(5,150,105,0.12)] text-[#059669] dark:bg-[rgba(52,211,153,0.14)] dark:text-[#34D399]', glyph: '✓' },
                ] as { label: string; value: number; cls: string; dotCls: string; glyph: React.ReactNode; sub?: string }[]).map(chip => (
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
                {/* Calendar icon */}
                <button
                  onClick={() => setShowCalSheet(true)}
                  className={cn(
                    'w-9 h-9 rounded-xl border-[1.5px] flex items-center justify-center active:scale-90 transition-all shrink-0',
                    hasDatePeriod
                      ? 'bg-[rgba(216,30,30,0.10)] border-[rgba(216,30,30,0.20)] text-[#D81E1E]'
                      : 'bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.07] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] text-[rgba(26,26,10,0.45)] dark:text-white/40'
                  )}
                  title="Calendário"
                >
                  <Calendar size={14} />
                </button>
                {/* Filter icon */}
                <button
                  onClick={() => setShowFilterSheet(true)}
                  className={cn(
                    'w-9 h-9 rounded-xl border-[1.5px] flex items-center justify-center active:scale-90 transition-all shrink-0',
                    searchField !== null
                      ? 'bg-[rgba(216,30,30,0.10)] border-[rgba(216,30,30,0.20)] text-[#D81E1E]'
                      : 'bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.07] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] text-[rgba(26,26,10,0.45)] dark:text-white/40'
                  )}
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
                    <div className="flex items-center gap-3">
                      <button onClick={handleMarkPaidSelected} className="flex items-center gap-1.5 text-[#059669] dark:text-[#34D399] text-[12px] font-black">
                        <Check size={14} /> Marcar Pago
                      </button>
                      <button onClick={handleDeleteSelected} className="flex items-center gap-1.5 text-[#D81E1E] text-[12px] font-black">
                        <Trash2 size={14} /> Excluir
                      </button>
                    </div>
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
                      onClick={() => selectionMode ? toggleSelect(tx.id) : openDetail(tx)}
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
                        <span className="flex flex-col items-end shrink-0 mt-0.5">
                          <span className={cn(
                            "font-['DM_Mono',monospace] text-[15px] font-bold tracking-tight",
                            tx.tipo === 'Receita'
                              ? 'text-[#059669] dark:text-[#34D399]'
                              : 'text-[#E11D48] dark:text-[#F43F5E]'
                          )}>
                            {tx.tipo === 'Receita' ? '+' : '−'}{fmt(tx.valor_final)}
                          </span>
                          {getParcelaGroupTotal(tx) !== null && (
                            <span className="text-[9px] font-medium text-[rgba(26,26,10,0.35)] dark:text-white/30">
                              de {fmt(getParcelaGroupTotal(tx)!)}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1.5 border-t border-[rgba(26,26,10,0.06)] dark:border-white/[0.06]">
                        <div className="flex items-center">
                          <span className="bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.07] rounded-[8px] px-2 py-[3px] text-[9px] font-black uppercase tracking-[0.08em] text-[rgba(26,26,10,0.45)] dark:text-white/35">
                            {tx.tipo_pagamento}
                          </span>
                          {tx.vencimento && (
                            <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded-full bg-[rgba(216,30,30,0.10)] dark:bg-[rgba(216,30,30,0.15)] text-[9px] font-black text-[#D81E1E] dark:text-[#F43F5E]">
                              {tx.numero_parcela ?? 1}/{tx.total_parcelas ?? 1}
                            </span>
                          )}
                        </div>
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

          {/* ═══ TAB: DADOS ═══ */}
          {activeTab === 'dados' && (
            <motion.div
              key="dados"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="pb-6 px-3 pt-3 flex flex-col gap-3.5"
            >
              {/* Contas */}
              <div className="bg-[rgba(255,246,201,0.75)] dark:bg-[#23231D] border border-[rgba(26,18,8,0.07)] dark:border-white/[0.07] rounded-[18px] overflow-hidden">
                <div className="bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-3.5 py-2.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-black text-[#1A1A0E]">
                    <Building2 size={14} />
                    Contas
                    <span className="bg-[rgba(26,26,10,0.10)] text-[rgba(26,26,10,0.55)] rounded-full px-[7px] py-[2px] text-[8.5px] font-black">{accounts.length}</span>
                  </span>
                  <button
                    onClick={openAddAccount}
                    className="w-[27px] h-[27px] rounded-[9px] bg-[#D81E1E] flex items-center justify-center shadow-[0_3px_10px_rgba(216,30,30,0.28)] active:scale-90 transition-transform"
                  >
                    <Plus size={13} color="white" />
                  </button>
                </div>
                <div className="p-2.5 flex flex-col gap-1.75">
                  {!dadosLoaded ? (
                    <div className="flex items-center justify-center py-8 text-[rgba(26,26,10,0.25)] dark:text-white/20">
                      <Loader2 size={20} className="animate-spin" />
                    </div>
                  ) : accounts.length === 0 ? (
                    <div className="flex flex-col items-center py-7 text-[rgba(26,26,10,0.25)] dark:text-white/20">
                      <Building2 size={28} className="mb-1.5" />
                      <p className="text-[11px] font-bold">Nenhuma conta cadastrada</p>
                    </div>
                  ) : (
                    accounts.map(acc => (
                      <button
                        key={acc.id}
                        onClick={() => openEditAccount(acc)}
                        className="bg-white dark:bg-[#252520] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] rounded-[14px] px-3 py-2.5 flex items-center gap-2.5 text-left active:scale-[0.98] transition-transform"
                      >
                        {acc.imagem_url ? (
                          <img src={acc.imagem_url} alt={acc.nome} className="w-9 h-9 rounded-[10px] object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-[10px] bg-[rgba(216,30,30,0.09)] dark:bg-[rgba(216,30,30,0.14)] flex items-center justify-center text-[11px] font-black text-[#D81E1E] shrink-0">
                            {acc.nome.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3] truncate">{acc.nome}</p>
                          <p className="font-['DM_Mono',monospace] text-[9.5px] text-[rgba(26,26,10,0.42)] dark:text-white/35 truncate mt-0.5">
                            {acc.banco}{acc.agencia && ` · Ag ${acc.agencia}`}
                          </p>
                        </div>
                        <span className="font-['DM_Mono',monospace] text-[11px] font-medium text-[#059669] dark:text-[#34D399] whitespace-nowrap">{fmt(acc.saldo_inicial ?? 0)}</span>
                        <ChevronLeft size={14} className="rotate-180 text-[rgba(26,18,8,0.22)] dark:text-white/20 shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Favorecidos */}
              <div className="bg-[rgba(255,246,201,0.75)] dark:bg-[#23231D] border border-[rgba(26,18,8,0.07)] dark:border-white/[0.07] rounded-[18px] overflow-hidden">
                <div className="bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-3.5 py-2.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-black text-[#1A1A0E]">
                    <Users size={14} />
                    Favorecidos
                    <span className="bg-[rgba(26,26,10,0.10)] text-[rgba(26,26,10,0.55)] rounded-full px-[7px] py-[2px] text-[8.5px] font-black">{favorecidos.length}</span>
                  </span>
                  <button
                    onClick={() => setShowAddFavorecido(v => !v)}
                    className={cn(
                      'w-[27px] h-[27px] rounded-[9px] flex items-center justify-center shadow-[0_3px_10px_rgba(216,30,30,0.28)] active:scale-90 transition-transform',
                      showAddFavorecido ? 'bg-[rgba(26,26,10,0.55)]' : 'bg-[#D81E1E]'
                    )}
                  >
                    {showAddFavorecido ? <X size={13} color="white" /> : <Plus size={13} color="white" />}
                  </button>
                </div>
                <div className="p-2.5 flex flex-col gap-1.75">
                  {showAddFavorecido && (
                    <div className="bg-white dark:bg-[#252520] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] rounded-[14px] p-2.5 flex flex-col gap-2">
                      <input
                        type="text"
                        value={novoNomeBanco}
                        onChange={e => setNovoNomeBanco(e.target.value)}
                        placeholder="Nome no extrato bancário..."
                        className="w-full px-3 py-2 bg-[#FDFAF0] dark:bg-[#1E1E18] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] rounded-[10px] text-[12px] text-[#1A1A0E] dark:text-[#F2F0E3] outline-none focus:border-[#D81E1E]"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={novoFavorecido}
                          onChange={e => setNovoFavorecido(e.target.value)}
                          onKeyUp={e => e.key === 'Enter' && handleAddFavorecido()}
                          placeholder="Nome fiscal do favorecido..."
                          className="flex-1 px-3 py-2 bg-[#FDFAF0] dark:bg-[#1E1E18] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] rounded-[10px] text-[12px] text-[#1A1A0E] dark:text-[#F2F0E3] outline-none focus:border-[#D81E1E]"
                        />
                        <button
                          onClick={handleAddFavorecido}
                          disabled={savingFavorecido || !novoFavorecido.trim()}
                          className="shrink-0 w-9 h-9 rounded-[10px] bg-[#D81E1E] flex items-center justify-center shadow-[0_3px_10px_rgba(216,30,30,0.28)] disabled:opacity-40"
                        >
                          {savingFavorecido ? <Loader2 size={14} className="animate-spin text-white" /> : <Plus size={14} color="white" />}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 bg-[#FDFAF0] dark:bg-[#1E1E18] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.10] rounded-[10px] px-3 py-2">
                    <Search size={12} className="text-[rgba(26,18,8,0.28)] dark:text-white/25 shrink-0" />
                    <input
                      value={dadosFavSearch}
                      onChange={e => setDadosFavSearch(e.target.value)}
                      placeholder="Buscar favorecido..."
                      className="flex-1 bg-transparent outline-none text-[11.5px] text-[#1A1A0E] dark:text-[#F2F0E3] placeholder:text-[rgba(26,18,8,0.30)] dark:placeholder:text-white/25"
                    />
                  </div>
                  {!dadosLoaded ? (
                    <div className="flex items-center justify-center py-8 text-[rgba(26,26,10,0.25)] dark:text-white/20">
                      <Loader2 size={20} className="animate-spin" />
                    </div>
                  ) : favorecidos.length === 0 ? (
                    <div className="flex flex-col items-center py-7 text-[rgba(26,26,10,0.25)] dark:text-white/20">
                      <Users size={28} className="mb-1.5" />
                      <p className="text-[11px] font-bold">Nenhum favorecido cadastrado</p>
                    </div>
                  ) : (
                    favorecidos
                      .filter(f => !dadosFavSearch || f.nome_fiscal.toLowerCase().includes(dadosFavSearch.toLowerCase()))
                      .map(f => (
                        <div key={f.id} className="bg-white dark:bg-[#252520] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] rounded-[14px] px-3 py-2.25 flex items-center gap-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-[12.5px] font-bold text-[#1A1A0E] dark:text-[#F2F0E3] truncate">{f.nome_fiscal}</p>
                            {f.nome_banco ? (
                              <p className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[7.5px] font-black uppercase tracking-[0.10em] text-[rgba(26,18,8,0.28)] dark:text-white/22">Extrato</span>
                                <span className="font-['DM_Mono',monospace] text-[9.5px] text-[rgba(26,26,10,0.42)] dark:text-white/35 truncate">{f.nome_banco}</span>
                              </p>
                            ) : (
                              <p className="text-[9.5px] italic text-[rgba(26,18,8,0.28)] dark:text-white/22 mt-0.5">sem mapeamento de extrato</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteFavorecido(f.id)}
                            className="w-[27px] h-[27px] rounded-lg flex items-center justify-center text-[rgba(26,18,8,0.30)] dark:text-white/25 active:bg-rose-500/10 active:text-rose-500 transition-colors shrink-0"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>

    {/*
      Os sheets abaixo são renderizados FORA do container `z-40` acima de propósito:
      esse container fixed+z-index cria um novo contexto de empilhamento, o que prendia
      os sheets (mesmo com z-index alto) por baixo do BottomNav (z-50, irmão fora desse
      contexto). Ficando como irmãos no topo, o z-[100] deles vale globalmente.
    */}

    {/* Add Transaction Sheet backdrop + sheet */}
    <AnimatePresence>
      {showAddSheet && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
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
            parcelas={txParcelas}
            onOpenParcelas={() => setParcelasModalOpen('new')}
            pendingNotes={pendingNotes}
            onPendingChange={setPendingNotes}
          />
        </>
      )}
    </AnimatePresence>

    {/* Calendar Sheet backdrop + sheet */}
    <AnimatePresence>
      {showCalSheet && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
            onClick={() => setShowCalSheet(false)}
          />
          <CalendarSheet
            monthLabel={calMonthLabel}
            days={calDays}
            today={today()}
            viewDate={calViewDate}
            onPrevMonth={() => setCalViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            onNextMonth={() => setCalViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            rangeMode={calRangeMode}
            onToggleRangeMode={toggleCalRangeMode}
            selectedDate={calSelectedDate}
            rangeStart={calRangeStart}
            rangeEnd={calRangeEnd}
            onDayClick={handleCalDayClick}
            onClear={clearCalFilter}
            onClose={() => setShowCalSheet(false)}
            toIsoDay={toIsoDay}
          />
        </>
      )}
    </AnimatePresence>

    {/* Filter Field Sheet backdrop + sheet */}
    <AnimatePresence>
      {showFilterSheet && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
            onClick={() => setShowFilterSheet(false)}
          />
          <FilterFieldSheet
            value={searchField}
            onChange={setSearchField}
            onClose={() => setShowFilterSheet(false)}
          />
        </>
      )}
    </AnimatePresence>

    {/* Transaction Detail Sheet backdrop + sheet */}
    <AnimatePresence>
      {detailTx && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
            onClick={closeDetail}
          />
          <TxDetailSheet
            tx={detailTx}
            mode={detailMode}
            onToggleMode={() => setDetailMode(m => (m === 'view' ? 'edit' : 'view'))}
            form={detailForm}
            setForm={setDetailForm}
            onSave={handleSaveDetail}
            onClose={closeDetail}
            saving={savingDetail}
            tags={tags}
            onCreateTag={(nome, cor) => createTag(nome, cor, '')}
            parcelas={detailParcelas}
            onOpenParcelas={() => setParcelasModalOpen('edit')}
            groupTotal={getParcelaGroupTotal(detailTx)}
            onEditAllParcelas={() => loadGroupIntoDetail(detailTx)}
            editingWholeGroup={editingGroupIds !== null}
          />
        </>
      )}
    </AnimatePresence>

    {/* Parcelas do Pagamento — empilhado acima do sheet de Nova/Editar Movimentação */}
    <AnimatePresence>
      {parcelasModalOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[125] bg-black/45 backdrop-blur-sm"
            onClick={() => setParcelasModalOpen(null)}
          />
          <ParcelasModal
            initialRows={parcelasModalOpen === 'new' ? txParcelas : detailParcelas}
            onSave={rows => {
              if (parcelasModalOpen === 'new') setTxParcelas(rows);
              else setDetailParcelas(rows);
            }}
            onClose={() => setParcelasModalOpen(null)}
          />
        </>
      )}
    </AnimatePresence>

    {/* Account Sheet — criar/editar conta bancária */}
    <AnimatePresence>
      {showAccountSheet && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAccountSheet(false)}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="fixed inset-x-0 bottom-0 z-[110] bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-t-[28px] shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: '90svh' }}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-[rgba(26,26,10,0.15)] dark:bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-4 pb-3 shrink-0">
              <span className="text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3]">
                {editingAccountId ? 'Editar Conta' : 'Cadastrar Conta'}
              </span>
              <button
                onClick={() => setShowAccountSheet(false)}
                className="w-8 h-8 rounded-full bg-[rgba(26,26,10,0.07)] dark:bg-white/[0.07] flex items-center justify-center text-[rgba(26,26,10,0.45)] dark:text-white/35 active:scale-90 transition-transform"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-none px-4 space-y-3 pb-4">
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block">Imagem da Conta</span>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={handleAccountImageChange} />
                  <div className="w-14 h-14 rounded-[14px] bg-white dark:bg-[#252520] border-[1.5px] border-dashed border-[#E0D8BF] dark:border-white/[0.12] flex items-center justify-center overflow-hidden shrink-0">
                    {accountForm.imagemPreview ? (
                      <img src={accountForm.imagemPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={18} className="text-[rgba(26,26,10,0.25)] dark:text-white/20" />
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-[#D81E1E]">Escolher imagem</span>
                </label>
              </div>

              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block">Nome da Conta</span>
                <input
                  type="text" value={accountForm.nome}
                  onChange={e => setAccountForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Conta Corrente PJ"
                  className="w-full min-w-0 box-border bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]"
                />
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block">Banco</span>
                <input
                  type="text" value={accountForm.banco}
                  onChange={e => setAccountForm(f => ({ ...f, banco: e.target.value }))}
                  placeholder="Ex: Banco do Brasil"
                  className="w-full min-w-0 box-border bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block">Agência</span>
                  <input
                    type="text" value={accountForm.agencia}
                    onChange={e => setAccountForm(f => ({ ...f, agencia: e.target.value }))}
                    placeholder="0000-0"
                    className="w-full min-w-0 box-border bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]"
                  />
                </div>
                <div className="flex-1">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block">Conta</span>
                  <input
                    type="text" value={accountForm.numero_conta}
                    onChange={e => setAccountForm(f => ({ ...f, numero_conta: e.target.value }))}
                    placeholder="00000-0"
                    className="w-full min-w-0 box-border bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]"
                  />
                </div>
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block">Saldo Inicial</span>
                <input
                  type="text" inputMode="decimal" value={accountForm.saldo_inicial}
                  onChange={e => setAccountForm(f => ({ ...f, saldo_inicial: e.target.value }))}
                  placeholder="0,00"
                  className="w-full min-w-0 box-border bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]"
                />
              </div>

              {editingAccountId && (
                <button
                  onClick={() => { handleDeleteAccount(editingAccountId); setShowAccountSheet(false); }}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[12px] font-bold text-rose-500 bg-rose-500/10 active:scale-[0.98] transition-transform"
                >
                  <Trash2 size={14} />
                  Excluir Conta
                </button>
              )}
            </div>

            <div className="shrink-0 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 border-t border-[rgba(26,26,10,0.06)] dark:border-white/[0.06]">
              <button
                onClick={handleAccountSubmit}
                disabled={savingAccount || !accountForm.nome.trim()}
                className="w-full py-3 rounded-xl bg-[#D81E1E] text-white text-sm font-black uppercase tracking-wide shadow-[0_4px_14px_rgba(216,30,30,0.32)] disabled:opacity-40 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
              >
                {savingAccount && <Loader2 size={15} className="animate-spin" />}
                {editingAccountId ? 'Salvar Alterações' : 'Cadastrar Conta'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </>
  );
}

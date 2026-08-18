'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, X, TrendingDown, Wallet, Monitor,
  Search, Filter, CheckSquare, Calendar, ChevronLeft, ChevronRight, Clock,
  Check, Loader2, Trash2, Pencil, Lock, CreditCard, AlertTriangle, Info,
  Building2, Users, ImageIcon, Edit2, Eye, ArrowLeft,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useViewMode } from '@/lib/view-mode';
import { useFinanceTags, FinanceTag, TAG_COLOR_MAP } from '@/hooks/useFinanceTags';
import { TagSelector } from './TagSelector';
import { FavorecidoEditModal } from './FavorecidoEditModal';
import { LinkedNotesSection, LinkedNoteLite, linkNotesToTransactions, cleanupNoteLinksForDeletedTxs } from './LinkedNotesSection';
import type { PaymentType, TransactionType as TxType, Transaction, BankAccount, FinanceCard, Favorecido, Supplier } from '@/types/finance';
import { calcularFatura } from '@/lib/creditoFatura';

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = 'mov' | 'dash' | 'dados' | 'cartoes';
type DashPeriod = '7d' | '30d' | '3m' | '6m' | '1y';
type SearchField = 'favorecido' | 'estabelecimento' | 'tipo' | 'tipo_pagamento' | 'tags' | 'vencimento';

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
  account_id: string | null;
  numero_cheque: string | null;
  identificacao: string | null;
  data_pagamento: string | null;
  card_id: string | null;
};

// id presente = linha já existe no banco; ausente = parcela nova (ainda não salva)
// `periodo` só é usado no fluxo de Crédito (calculado a partir do cartão) — grava fatura_periodo.
type ParcelaRow = { seq: number; valor: string; validade: string; codigo_barras?: string; id?: string; periodo?: string };

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
  account_id: null,
  numero_cheque: null,
  identificacao: null,
  data_pagamento: null,
  card_id: null,
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

// Despesas com vencimento (inclusive origem=hr_salario) exigem o questionário de
// conta + data ao marcar como pagas — receitas e despesas à vista continuam instantâneas.
function needsPaymentQuestionnaire(t: Pick<Transaction, 'tipo' | 'vencimento'>): boolean {
  return t.tipo === 'Despesa' && !!t.vencimento;
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

// ── Add Transaction Sheet ──────────────────────────────────────────────────────

function TxSheet({
  form,
  setForm,
  onSave,
  onClose,
  saving,
  tags,
  onCreateTag,
  accounts,
  cards,
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
  accounts: BankAccount[];
  cards: FinanceCard[];
  parcelas: ParcelaRow[];
  onOpenParcelas: () => void;
  pendingNotes: LinkedNoteLite[];
  onPendingChange: (notes: LinkedNoteLite[]) => void;
}) {
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

        {/* Data */}
        <div className="min-w-0">
          <span className={labelCls}>Data</span>
          <DateFieldButton
            className={fieldCls}
            value={form.data}
            onOpen={() => setShowDatePicker(true)}
          />
        </div>

        {/* Favorecido */}
        <div>
          <span className={labelCls}>Favorecido / Descrição</span>
          <input
            className={fieldCls}
            value={form.favorecido}
            onChange={e => setForm({ ...form, favorecido: e.target.value })}
            placeholder="Nome do favorecido..."
          />
        </div>

        {/* Conta */}
        <div>
          <span className={labelCls}>Conta</span>
          <select
            className={fieldCls}
            value={form.account_id ?? ''}
            onChange={e => setForm({ ...form, account_id: e.target.value || null })}
          >
            <option value="">Selecione a conta...</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.nome} — {a.banco}</option>)}
          </select>
        </div>

        {/* Tipo Pagamento */}
        <div>
          <span className={labelCls}>Tipo de pagamento</span>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_TYPES.map(pt => {
              const accountCards = cards.filter(c => c.account_id === form.account_id);
              const disabled = pt === 'Crédito' && accountCards.length === 0;
              return (
                <button
                  key={pt}
                  disabled={disabled}
                  onClick={() => {
                    if (pt === 'Crédito') {
                      setForm({ ...form, tipo_pagamento: pt, card_id: accountCards[0]?.id ?? null });
                    } else {
                      setForm({ ...form, tipo_pagamento: pt, card_id: null });
                    }
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border-[1.5px] transition-colors',
                    disabled && 'opacity-35',
                    form.tipo_pagamento === pt
                      ? 'bg-[rgba(26,26,10,0.09)] dark:bg-white/[0.10] border-[rgba(26,26,10,0.18)] dark:border-white/[0.18] text-[#1A1A0E] dark:text-[#F2F0E3]'
                      : 'bg-transparent border-[rgba(26,26,10,0.07)] dark:border-white/[0.07] text-[rgba(26,26,10,0.35)] dark:text-white/25'
                  )}
                >
                  {pt}{disabled ? ' 🔒' : ''}
                </button>
              );
            })}
          </div>
          {form.tipo_pagamento === 'Crédito' && (
            <div className="mt-2">
              <span className={labelCls}>Cartão</span>
              <select
                className={fieldCls}
                value={form.card_id ?? ''}
                onChange={e => setForm({ ...form, card_id: e.target.value || null })}
              >
                <option value="">Selecione o cartão...</option>
                {cards.filter(c => c.account_id === form.account_id).map(c => (
                  <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>
                ))}
              </select>
            </div>
          )}
          {form.tipo_pagamento === 'Cheque' && (
            <input
              className={cn(fieldCls, 'mt-2')}
              value={form.numero_cheque ?? ''}
              onChange={e => setForm({ ...form, numero_cheque: e.target.value || null })}
              placeholder="Numeração do cheque (ex: 000123)"
            />
          )}
          <button
            onClick={onOpenParcelas}
            disabled={form.tipo_pagamento === 'Crédito' && !form.card_id}
            className={cn(
              'w-full mt-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider border-[1.5px] transition-colors flex items-center justify-center gap-2 disabled:opacity-40',
              parcelas.length > 0
                ? 'bg-[rgba(216,30,30,0.10)] border-[rgba(216,30,30,0.24)] text-[#D81E1E]'
                : 'bg-transparent border-[rgba(26,26,10,0.10)] dark:border-white/[0.08] text-[rgba(26,26,10,0.45)] dark:text-white/35'
            )}
          >
            <CreditCard size={13} />
            {form.tipo_pagamento === 'Crédito'
              ? (parcelas.length > 0 ? `${parcelas.length} parcela${parcelas.length > 1 ? 's' : ''} configurada${parcelas.length > 1 ? 's' : ''}` : 'Configurar parcelas')
              : parcelas.length === 1 ? 'Vencimento configurado'
              : parcelas.length > 1 ? `${parcelas.length} parcelas configuradas`
              : 'Vencimento / Parcelas'}
          </button>
        </div>

        {/* Identificação — genérico para os tipos que não têm campo próprio */}
        {form.tipo_pagamento !== 'Cheque' && form.tipo_pagamento !== 'Boleto' && (
          <div>
            <span className={labelCls}>Identificação</span>
            <input
              className={fieldCls}
              value={form.identificacao ?? ''}
              onChange={e => setForm({ ...form, identificacao: e.target.value || null })}
              placeholder="Ex: número, código ou referência"
            />
          </div>
        )}

        {/* Valor */}
        <div>
          <span className={labelCls}>Valor</span>
          <input
            type="text"
            inputMode="decimal"
            value={form.valor_final}
            onChange={e => setForm({ ...form, valor_final: e.target.value })}
            placeholder="0,00"
            className={cn(
              "w-full bg-[#FDFAF0] dark:bg-[#252520] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 font-['DM_Mono',monospace] text-[20px] font-bold tracking-tight focus:outline-none focus:border-[#D81E1E]",
              form.tipo === 'Receita' ? 'text-[#059669]' : 'text-[#E11D48] dark:text-[#F43F5E]'
            )}
          />
        </div>

        {/* Tags */}
        <TagSelector
          tags={tags.filter(t => !t.exclusivo)}
          value={form.tag_ids}
          onChange={ids => setForm({ ...form, tag_ids: ids })}
          onCreateTag={onCreateTag}
        />

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

        {/* Notas fiscais vinculadas */}
        <LinkedNotesSection
          variant="mobile"
          editable
          txId={null}
          pendingNotes={pendingNotes}
          onPendingChange={onPendingChange}
        />

        {/* Observações */}
        <div>
          <span className={labelCls}>Observações</span>
          <textarea
            className={cn(fieldCls, 'resize-none')}
            value={form.observacoes}
            onChange={e => setForm({ ...form, observacoes: e.target.value })}
            placeholder="Comentários sobre esta movimentação... (opcional)"
            rows={3}
          />
        </div>

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
  accounts,
  cards,
  parcelas,
  onOpenParcelas,
  groupTotal,
  onEditAllParcelas,
  editingWholeGroup,
  siblingTxs,
  onTogglePago,
  onRequestMarkPaid,
  onRequestUnmarkPaid,
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
  accounts: BankAccount[];
  cards: FinanceCard[];
  parcelas: ParcelaRow[];
  onOpenParcelas: () => void;
  groupTotal: number | null;
  onEditAllParcelas?: () => void;
  editingWholeGroup?: boolean;
  siblingTxs?: { id: string; favorecido: string; valor_final: number }[];
  onRequestMarkPaid?: () => void;
  onRequestUnmarkPaid?: () => void;
  onTogglePago?: (tx: Transaction) => void;
}) {
  const isHrSalario = tx.origem === 'hr_salario';
  const isFaturaRow = !!tx.is_fatura_consolidada;
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
          {isHrSalario && (
            <span
              title="Gerada pelo RH — apenas Conta, Tipo de pagamento, Identificação e Observações podem ser editados."
              className="flex items-center gap-1 px-2.5 h-8 rounded-full bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.06] text-[rgba(26,26,10,0.45)] dark:text-white/35 text-[9px] font-black uppercase tracking-wide"
            >
              <Lock size={11} /> RH
            </span>
          )}
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
          {isEdit && !isHrSalario ? (
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

        {/* Data */}
        <div className="min-w-0">
          <span className={labelCls}>Data</span>
          {isEdit && !isHrSalario ? (
            <DateFieldButton
              className={fieldCls}
              value={form.data}
              onOpen={() => setShowDatePicker(true)}
            />
          ) : (
            <div className={cn(viewBlockCls, 'font-semibold')}>
              {new Date(tx.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
          )}
        </div>

        {/* Favorecido */}
        <div>
          <span className={labelCls}>Favorecido / Descrição</span>
          {isEdit && !isHrSalario && !isFaturaRow ? (
            <input
              className={fieldCls}
              value={form.favorecido}
              onChange={e => setForm({ ...form, favorecido: e.target.value })}
              placeholder="Nome do favorecido..."
            />
          ) : (
            <div className={viewBlockCls}>{tx.favorecido || '—'}</div>
          )}
        </div>

        {/* Conta */}
        <div>
          <span className={labelCls}>Conta</span>
          {isFaturaRow ? (
            <div className={viewBlockCls}>{accounts.find(a => a.id === tx.account_id)?.nome ?? '—'}</div>
          ) : isEdit && tx.pago && needsPaymentQuestionnaire(tx) ? (
            // Movimentação já paga: conta trava contra edições acidentais — a troca só
            // acontece pelo mesmo mini-formulário usado ao marcar como paga.
            <div className="flex flex-col gap-1.5">
              <div className={cn(viewBlockCls, 'flex items-center justify-between gap-2')}>
                <span className="truncate">{accounts.find(a => a.id === form.account_id)?.nome ?? '—'}</span>
                <Lock size={13} className="text-[rgba(26,26,10,0.30)] dark:text-white/25 shrink-0" />
              </div>
              {form.data_pagamento && (
                <span className="text-[10px] font-semibold text-[rgba(26,26,10,0.40)] dark:text-white/30">
                  Pago em {new Date(form.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              )}
              <button
                type="button"
                onClick={() => onRequestMarkPaid?.()}
                className="self-start flex items-center gap-1 text-[11px] font-bold text-[#D81E1E]"
              >
                <Edit2 size={11} /> Alterar conta do pagamento
              </button>
            </div>
          ) : isEdit ? (
            <select
              className={fieldCls}
              value={form.account_id ?? ''}
              onChange={e => setForm({ ...form, account_id: e.target.value || null })}
            >
              <option value="">Selecione a conta...</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.nome} — {a.banco}</option>)}
            </select>
          ) : (
            <div className={viewBlockCls}>{accounts.find(a => a.id === tx.account_id)?.nome ?? '—'}</div>
          )}
        </div>

        {/* Tipo Pagamento */}
        <div>
          <span className={labelCls}>Tipo de pagamento</span>
          {isEdit && !isFaturaRow ? (
            <div className="flex flex-wrap gap-2">
              {PAYMENT_TYPES.map(pt => {
                const accountCards = cards.filter(c => c.account_id === form.account_id);
                const disabled = pt === 'Crédito' && accountCards.length === 0;
                return (
                  <button
                    key={pt}
                    disabled={disabled}
                    onClick={() => {
                      if (pt === 'Crédito') setForm({ ...form, tipo_pagamento: pt, card_id: accountCards[0]?.id ?? null });
                      else setForm({ ...form, tipo_pagamento: pt, card_id: null });
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border-[1.5px] transition-colors',
                      disabled && 'opacity-35',
                      form.tipo_pagamento === pt
                        ? 'bg-[rgba(26,26,10,0.09)] dark:bg-white/[0.10] border-[rgba(26,26,10,0.18)] dark:border-white/[0.18] text-[#1A1A0E] dark:text-[#F2F0E3]'
                        : 'bg-transparent border-[rgba(26,26,10,0.07)] dark:border-white/[0.07] text-[rgba(26,26,10,0.35)] dark:text-white/25'
                    )}
                  >
                    {pt}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="inline-block bg-[rgba(26,26,10,0.08)] dark:bg-white/[0.08] border-[1.5px] border-[rgba(26,26,10,0.14)] dark:border-white/[0.14] rounded-lg px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider text-[#1A1A0E] dark:text-[#F2F0E3]">
              {isFaturaRow ? 'Fatura' : tx.tipo_pagamento}
            </span>
          )}
          {isEdit && !isFaturaRow && form.tipo_pagamento === 'Crédito' && (
            <div className="mt-2">
              <span className={labelCls}>Cartão</span>
              <select
                className={fieldCls}
                value={form.card_id ?? ''}
                onChange={e => setForm({ ...form, card_id: e.target.value || null })}
              >
                <option value="">Selecione o cartão...</option>
                {cards.filter(c => c.account_id === form.account_id).map(c => (
                  <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>
                ))}
              </select>
            </div>
          )}
          {isEdit && form.tipo_pagamento === 'Cheque' && (
            <input
              className={cn(fieldCls, 'mt-2')}
              value={form.numero_cheque ?? ''}
              onChange={e => setForm({ ...form, numero_cheque: e.target.value || null })}
              placeholder="Numeração do cheque (ex: 000123)"
            />
          )}
          {isFaturaRow && (
            <div className="min-w-0 mt-2">
              <span className={labelCls}>Vencimento</span>
              <div className={cn(viewBlockCls, 'font-semibold')}>Fatura fechada · {tx.vencimento ? new Date(tx.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</div>
              <p className="text-[10px] text-[rgba(26,26,10,0.35)] dark:text-white/25 mt-1.5 leading-tight">
                Para ajustar o valor real da fatura ou ver os lançamentos, use o Controle Financeiro no computador.
              </p>
            </div>
          )}
          {isEdit && !isHrSalario && !isFaturaRow && (
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
              {parcelas.length === 1 && !parcelas[0].validade ? 'Configurar vencimento'
                : parcelas.length === 1 ? 'Vencimento configurado'
                : parcelas.length > 1 ? `${parcelas.length} parcelas configuradas`
                : 'Vencimento / Parcelas'}
            </button>
          )}
          {isEdit && !isHrSalario && editingWholeGroup && (
            <div className="mt-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-[10px] font-bold text-amber-700 dark:text-amber-400">
              Editando o parcelamento inteiro — parcelas removidas são excluídas ao salvar; as demais mantêm o status de pagamento
            </div>
          )}
          {isEdit && !isHrSalario && !editingWholeGroup && groupTotal !== null && onEditAllParcelas && (
            <button
              onClick={onEditAllParcelas}
              className="w-full mt-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider bg-[#D81E1E] text-white shadow-[0_4px_14px_rgba(216,30,30,0.28)] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <CreditCard size={13} />
              Editar todas as parcelas
            </button>
          )}
          {/* Vencimento / Parcelamento (somente leitura — configurar via "Visualizar pagamento" acima) */}
          {(!isEdit || isHrSalario) && !isFaturaRow && (
            <div className="min-w-0 mt-2">
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
          {(!isEdit || isHrSalario) && groupTotal !== null && (
            <div className="min-w-0 mt-2">
              <span className={labelCls}>Valor Total do Parcelamento</span>
              <div className={cn(viewBlockCls, 'text-[#D81E1E] dark:text-[#F43F5E]')}>
                {fmt(groupTotal)}
              </div>
            </div>
          )}
          {/* Código de barras do boleto (somente leitura — configurar via "Visualizar pagamento") */}
          {(!isEdit || isHrSalario) && tx.tipo_pagamento === 'Boleto' && tx.codigo_barras && (
            <div className="min-w-0 mt-2">
              <span className={labelCls}>Código de Barras</span>
              <div className={cn(viewBlockCls, 'font-mono text-[12px] break-all')}>
                {tx.codigo_barras}
              </div>
            </div>
          )}
          {!isEdit && tx.tipo_pagamento === 'Cheque' && tx.numero_cheque && (
            <div className="min-w-0 mt-2">
              <span className={labelCls}>Numeração do Cheque</span>
              <div className={viewBlockCls}>{tx.numero_cheque}</div>
            </div>
          )}
        </div>

        {/* Identificação — genérico para os tipos que não têm campo próprio (não se aplica a faturas) */}
        {tx.tipo_pagamento !== 'Cheque' && tx.tipo_pagamento !== 'Boleto' && !isFaturaRow && (
          <div>
            <span className={labelCls}>Identificação</span>
            {isEdit ? (
              <input
                className={fieldCls}
                value={form.identificacao ?? ''}
                onChange={e => setForm({ ...form, identificacao: e.target.value || null })}
                placeholder="Ex: número, código ou referência"
              />
            ) : (
              <div className={viewBlockCls}>{tx.identificacao || '—'}</div>
            )}
          </div>
        )}

        {/* Valor */}
        <div>
          <span className={labelCls}>Valor</span>
          {isEdit && !isHrSalario && !isFaturaRow ? (
            <input
              type="text"
              inputMode="decimal"
              value={form.valor_final}
              onChange={e => setForm({ ...form, valor_final: e.target.value })}
              placeholder="0,00"
              className={cn(
                "w-full bg-[#FDFAF0] dark:bg-[#252520] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 font-['DM_Mono',monospace] text-[20px] font-bold tracking-tight focus:outline-none focus:border-[#D81E1E]",
                form.tipo === 'Receita' ? 'text-[#059669]' : 'text-[#E11D48] dark:text-[#F43F5E]'
              )}
            />
          ) : (
            <div className={cn(
              "font-['DM_Mono',monospace] text-[24px] font-black tracking-tight",
              tx.tipo === 'Receita' ? 'text-[#059669] dark:text-[#34D399]' : 'text-[#E11D48] dark:text-[#F43F5E]'
            )}>
              {fmt(tx.valor_final)}
            </div>
          )}
        </div>

        {/* Tags */}
        {isEdit && !isHrSalario ? (
          <TagSelector
            tags={tags.filter(t => !t.exclusivo)}
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

        {/* Estabelecimento */}
        <div>
          <span className={labelCls}>Estabelecimento</span>
          {isEdit && !isHrSalario && !isFaturaRow ? (
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

        {/* Notas fiscais vinculadas — não se aplica a faturas de cartão consolidadas */}
        {!isFaturaRow && (
          <LinkedNotesSection
            variant="mobile"
            editable={isEdit && !isHrSalario}
            txId={tx.id}
            txMeta={{ favorecido: tx.favorecido, valor_final: tx.valor_final }}
            siblingTxs={siblingTxs}
          />
        )}

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
            />
          ) : (
            <div className={cn(viewBlockCls, 'font-medium whitespace-pre-wrap')}>{tx.observacoes || '—'}</div>
          )}
        </div>

        {/* Pago toggle / status */}
        <div className="flex items-center gap-3 py-1">
          {isHrSalario ? (
            <>
              <button
                onClick={() => onTogglePago?.(tx)}
                className={cn(
                  'w-6 h-6 rounded-[7px] border-[1.5px] flex items-center justify-center transition-colors',
                  tx.pago
                    ? 'bg-[#059669] border-[#059669] text-white'
                    : 'bg-transparent border-[rgba(26,26,10,0.20)] dark:border-white/20'
                )}
              >
                {tx.pago && <Check size={12} strokeWidth={3} />}
              </button>
              <span className="text-sm font-bold text-[#1A1A0E] dark:text-[#F2F0E3]">
                {tx.pago ? 'Já foi pago' : 'Ainda não foi pago'}
              </span>
            </>
          ) : isEdit ? (
            <>
              <button
                onClick={() => {
                  if (!form.pago) {
                    if (needsPaymentQuestionnaire(tx)) { onRequestMarkPaid?.(); return; }
                    setForm({ ...form, pago: true });
                    return;
                  }
                  // Desmarcar sempre pede confirmação, qualquer tipo de movimentação.
                  onRequestUnmarkPaid?.();
                }}
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

      {/* Seletor de data (Data, edit mode only) */}
      <AnimatePresence>
        {isEdit && !isHrSalario && showDatePicker && (
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
  canAddParcela = true,
  tipoPagamento,
  card,
  dataCompra,
}: {
  initialRows: ParcelaRow[];
  onSave: (rows: ParcelaRow[]) => void;
  onClose: () => void;
  canAddParcela?: boolean;
  tipoPagamento?: PaymentType;
  // Quando informado, ativa o "modo Crédito": sem input de validade — a data de cada
  // parcela é calculada automaticamente a partir do fechamento/vencimento do cartão.
  card?: FinanceCard | null;
  dataCompra?: string;
}) {
  const [rows, setRows] = useState<ParcelaRow[]>(
    initialRows.length > 0 ? initialRows : [{ seq: 1, valor: '', validade: '', codigo_barras: '' }]
  );
  const [datePickerIdx, setDatePickerIdx] = useState<number | null>(null);

  const fieldCls = 'w-full min-w-0 box-border bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]';
  const labelCls = 'text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block';

  function updateRow(idx: number, patch: Partial<ParcelaRow>) {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows(prev => [...prev, { seq: prev.length + 1, valor: '', validade: '', codigo_barras: '' }]);
  }
  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, seq: i + 1 })));
  }

  // Modo Crédito: recalcula validade/período de cada parcela sempre que o cartão, a
  // data da compra, ou a quantidade de parcelas mudam — nunca digitado manualmente.
  useEffect(() => {
    if (!card) return;
    setRows(prev => prev.map(r => {
      // seq preserva a posição real da parcela (relevante ao editar uma parcela isolada
      // fora do fluxo de "editar todas").
      const { periodo, vencimento } = calcularFatura(dataCompra || new Date().toISOString().split('T')[0], card, (r.seq || 1) - 1);
      return { ...r, validade: vencimento, periodo };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, dataCompra, rows.length]);

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
                <span className={labelCls}>{card ? 'Vencimento (calculado)' : 'Validade'}</span>
                {card ? (
                  <div className={cn(fieldCls, 'bg-[rgba(26,26,10,0.04)] dark:bg-white/[0.04] text-[rgba(26,26,10,0.55)] dark:text-white/45 select-none')}>
                    {row.validade ? shortDate(row.validade) : '—'}
                  </div>
                ) : (
                  <DateFieldButton
                    className={fieldCls}
                    value={row.validade}
                    onOpen={() => setDatePickerIdx(idx)}
                  />
                )}
              </div>
            </div>
            {tipoPagamento === 'Boleto' && !card && (
              <div>
                <span className={labelCls}>Código de barras</span>
                <input
                  className={fieldCls}
                  value={row.codigo_barras ?? ''}
                  onChange={e => updateRow(idx, { codigo_barras: e.target.value })}
                  placeholder="Código de barras do boleto"
                  inputMode="numeric"
                />
              </div>
            )}
          </div>
        ))}

        {canAddParcela && (
          <button
            onClick={addRow}
            className="w-full py-2.5 rounded-xl border-[1.5px] border-dashed border-[rgba(26,26,10,0.20)] dark:border-white/[0.18] text-[rgba(26,26,10,0.45)] dark:text-white/35 text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          >
            <Plus size={13} />
            Adicionar parcela
          </button>
        )}

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

interface MobileFinancePageProps {
  // Id de uma movimentação pra abrir automaticamente ao montar (usado pela aba
  // "Financeiro" da janela de Notas, ao levar o usuário até um lançamento vinculado).
  initialFocusTxId?: string | null;
  onInitialFocusHandled?: () => void;
}

export function MobileFinancePage({ initialFocusTxId, onInitialFocusHandled }: MobileFinancePageProps = {}) {
  const { toggleMode } = useViewMode();
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
  const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState(false);
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showFavorecidoEditModal, setShowFavorecidoEditModal] = useState(false);
  const [editingFavorecido, setEditingFavorecido] = useState<Favorecido | null>(null);

  // cartões de crédito (vinculados a uma conta)
  const [cards, setCards] = useState<FinanceCard[]>([]);
  const [cardFormOpen, setCardFormOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardForm, setCardForm] = useState({ nome: '', dia_fechamento: '', dia_vencimento: '', limite: '' });
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardSubmitting, setCardSubmitting] = useState(false);
  // aba "Cartões" — null mostra a lista de faturas, preenchido faz o drill-down na fatura
  const [cartoesDrill, setCartoesDrill] = useState<{ cardId: string; periodo: string } | null>(null);

  // calendário
  // Mostra só as movimentações do dia por padrão, evitando poluir a tela com o histórico inteiro.
  const [showCalSheet, setShowCalSheet] = useState(false);
  const [calViewDate, setCalViewDate] = useState(() => new Date());
  const [calSelectedDate, setCalSelectedDate] = useState<Date | null>(() => new Date());
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
  // Snapshot do form no momento em que a edição começou — usado para detectar
  // alterações não salvas ao tentar sair do modo de edição (botão de lápis).
  const [detailSnapshot, setDetailSnapshot] = useState<string | null>(null);
  const [showDiscardDetailConfirm, setShowDiscardDetailConfirm] = useState(false);

  // Marcar/desmarcar como paga — questionário de conta+data para despesas com vencimento.
  // mode 'immediate' grava direto no banco (quick-toggle hr_salario); 'form' só atualiza o
  // rascunho local do formulário de edição, persistido junto no "Salvar Alterações".
  const [markPaidState, setMarkPaidState] = useState<{ tx: Transaction; mode: 'immediate' | 'form' } | null>(null);
  const [markPaidAccountId, setMarkPaidAccountId] = useState('');
  const [markPaidDate, setMarkPaidDate] = useState('');
  const [markPaidSubmitting, setMarkPaidSubmitting] = useState(false);
  const [unmarkPaidState, setUnmarkPaidState] = useState<{ tx: Transaction; mode: 'immediate' | 'form' } | null>(null);
  const [unmarkPaidSubmitting, setUnmarkPaidSubmitting] = useState(false);
  const markPaidFieldCls = 'w-full min-w-0 box-border bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]';
  const markPaidLabelCls = 'text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block';

  // parcelas do pagamento (Nova Movimentação e Editar)
  const [txParcelas, setTxParcelas] = useState<ParcelaRow[]>([]);
  const [detailParcelas, setDetailParcelas] = useState<ParcelaRow[]>([]);
  const [parcelasModalOpen, setParcelasModalOpen] = useState<'new' | 'edit' | null>(null);
  // Quando preenchido, salvar a edição faz um diff (update/insert/delete) contra essas
  // linhas — edição do parcelamento inteiro, sem apagar e recriar tudo.
  const [editingGroupIds, setEditingGroupIds] = useState<string[] | null>(null);
  const [editingParcelamentoId, setEditingParcelamentoId] = useState<string | null>(null);

  // ── Data ────────────────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from('finance_transactions').select('*').order('data', { ascending: false });
    if (data) setTransactions(data as Transaction[]);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);
  // Contas e cartões precisam estar disponíveis para o formulário de movimentação
  // (seleção de Conta/Crédito) mesmo antes do usuário visitar a aba Dados/Cartões.
  useEffect(() => {
    supabase.from('finance_accounts').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setAccounts(data as BankAccount[]); });
    supabase.from('finance_cards').select('*').order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setCards(data as FinanceCard[]); });
  }, []);

  async function loadDadosData() {
    const [accRes, favRes, supRes, cardRes] = await Promise.all([
      supabase.from('finance_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('finance_favorecidos').select('*').order('nome_fiscal', { ascending: true }),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('finance_cards').select('*').order('created_at', { ascending: true }),
    ]);
    if (accRes.data) setAccounts(accRes.data as BankAccount[]);
    if (favRes.data) setFavorecidos(favRes.data as Favorecido[]);
    if (supRes.data) setSuppliers(supRes.data as Supplier[]);
    if (cardRes.data) setCards(cardRes.data as FinanceCard[]);
    setDadosLoaded(true);
  }

  // ── Contas ──────────────────────────────────────────────────────────────

  function openAddAccount() {
    setEditingAccountId(null);
    setAccountForm(emptyAccountForm());
    closeCardForm();
    setShowAccountSheet(true);
  }

  function openEditAccount(acc: BankAccount) {
    setEditingAccountId(acc.id);
    setAccountForm({
      nome: acc.nome, banco: acc.banco, agencia: acc.agencia, numero_conta: acc.numero_conta,
      saldo_inicial: String(acc.saldo_inicial ?? 0),
      imagemPreview: acc.imagem_url ?? '', imagemFile: null,
    });
    closeCardForm();
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

  // ── Cartões (dentro do sheet de Conta) ─────────────────────────────────────

  function accountCards(accountId: string | null) {
    return accountId ? cards.filter(c => c.account_id === accountId) : [];
  }

  function openNewCard() {
    setEditingCardId(null);
    setCardForm({ nome: '', dia_fechamento: '', dia_vencimento: '', limite: '' });
    setCardError(null);
    setCardFormOpen(true);
  }

  function openEditCard(card: FinanceCard) {
    setEditingCardId(card.id);
    setCardForm({
      nome: card.nome,
      dia_fechamento: String(card.dia_fechamento),
      dia_vencimento: String(card.dia_vencimento),
      limite: card.limite != null ? String(card.limite) : '',
    });
    setCardError(null);
    setCardFormOpen(true);
  }

  function closeCardForm() {
    setCardFormOpen(false);
    setEditingCardId(null);
    setCardError(null);
  }

  async function handleCardSubmit() {
    if (!editingAccountId) return;
    const nome = cardForm.nome.trim();
    const fechamento = parseInt(cardForm.dia_fechamento, 10);
    const vencimento = parseInt(cardForm.dia_vencimento, 10);
    if (!nome) { setCardError('Informe o nome do cartão.'); return; }
    if (!Number.isInteger(fechamento) || fechamento < 1 || fechamento > 31) { setCardError('Fechamento deve ser um dia entre 1 e 31.'); return; }
    if (!Number.isInteger(vencimento) || vencimento < 1 || vencimento > 31) { setCardError('Vencimento deve ser um dia entre 1 e 31.'); return; }
    const limite = cardForm.limite.trim() ? parseFloat(cardForm.limite.replace(',', '.')) : null;
    if (limite != null && (isNaN(limite) || limite < 0)) { setCardError('Limite inválido.'); return; }

    setCardSubmitting(true);
    setCardError(null);
    try {
      if (editingCardId) {
        const payload = { nome, dia_fechamento: fechamento, dia_vencimento: vencimento, limite };
        const { error } = await supabase.from('finance_cards').update(payload).eq('id', editingCardId);
        if (error) throw error;
        setCards(prev => prev.map(c => c.id === editingCardId ? { ...c, ...payload } : c));
      } else {
        const { data, error } = await supabase.from('finance_cards')
          .insert({ account_id: editingAccountId, nome, dia_fechamento: fechamento, dia_vencimento: vencimento, limite })
          .select().single();
        if (error) throw error;
        if (data) setCards(prev => [...prev, data as FinanceCard]);
      }
      closeCardForm();
    } catch (err: any) {
      setCardError(err?.message || 'Erro ao salvar cartão.');
    } finally {
      setCardSubmitting(false);
    }
  }

  async function handleDeleteCard(id: string) {
    const linkedCount = transactions.filter(t => t.card_id === id && !t.is_fatura_consolidada).length;
    const msg = linkedCount > 0
      ? `Excluir este cartão? ${linkedCount} movimentação(ões) já vinculada(s) a ele deixarão de aparecer na aba Cartões (não serão apagadas) e as faturas consolidadas dele serão removidas.`
      : 'Excluir este cartão?';
    if (!confirm(msg)) return;
    // As linhas-resumo de fatura ficariam órfãs (sem cartão pra recalcular/exibir) —
    // as compras individuais continuam existindo, só perdem o vínculo com o cartão.
    await supabase.from('finance_transactions').delete().eq('card_id', id).eq('is_fatura_consolidada', true);
    await supabase.from('finance_cards').delete().eq('id', id);
    setCards(prev => prev.filter(c => c.id !== id));
    setTransactions(prev => prev.filter(t => !(t.card_id === id && t.is_fatura_consolidada)));
    if (editingCardId === id) closeCardForm();
  }

  // ── Favorecidos ─────────────────────────────────────────────────────────

  function openNewFavorecido() {
    setEditingFavorecido(null);
    setShowFavorecidoEditModal(true);
  }

  function openEditFavorecido(f: Favorecido) {
    setEditingFavorecido(f);
    setShowFavorecidoEditModal(true);
  }

  function handleFavorecidoSaved() {
    loadDadosData();
    loadData();
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
        // Parcelas de salário compartilham a mesma "data" de lançamento (a do último
        // mês do período) — não entram no ponto de "lançamento" do calendário, só no
        // de vencimento (abaixo), senão marcariam um dia só com todo o contrato.
        .filter(t => {
          if (t.origem === 'hr_salario') return false;
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

  // Parcelas irmãs de uma movimentação — para vincular notas fiscais a todas de uma vez
  const getParcelaSiblings = (t: Transaction) => {
    if (!t.total_parcelas || t.total_parcelas <= 1) return undefined;
    const key = parcelaGroupKey(t);
    return transactions
      .filter(s => s.total_parcelas && s.total_parcelas > 1 && parcelaGroupKey(s) === key)
      .sort((a, b) => (a.numero_parcela ?? 0) - (b.numero_parcela ?? 0));
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return transactions.filter(t => {
      // Movimentações de crédito individuais (vinculadas a um cartão, mas não a
      // linha-resumo da fatura) não aparecem na lista comum — só na aba "Cartões".
      if (t.card_id && !t.is_fatura_consolidada) return false;
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
      // Parcelas de salário compartilham a mesma "data" de lançamento (a do último mês
      // do período) — filtrar por ela lotaria o dia com todas as parcelas do contrato.
      // Para essas, o filtro de calendário só deve considerar o vencimento de cada parcela.
      if (t.origem === 'hr_salario') return inSelectedPeriod(t.vencimento);
      return inSelectedPeriod(t.data) || inSelectedPeriod(t.vencimento);
    });
  }, [transactions, search, searchField, tags, calSelectedDate, calRangeStart, calRangeEnd]);

  const vencimentoStats = useMemo(() => {
    const despesasVencendo = transactions.filter(t => t.tipo === 'Despesa' && inSelectedPeriod(t.vencimento));
    const despesasVencendoPagas = despesasVencendo.filter(t => t.pago);
    // Saídas: despesas do período que não têm vencimento (pagamento à vista, sem controle de prazo)
    const saidasSemVencimento = transactions.filter(t => t.tipo === 'Despesa' && !t.vencimento && inSelectedPeriod(t.data));
    return {
      count: despesasVencendo.length,
      valor: despesasVencendo.reduce((s, t) => s + t.valor_final, 0),
      totalPago: despesasVencendo.reduce((s, t) => s + t.total_pago, 0),
      pagoCount: despesasVencendoPagas.length,
      saidasValor: saidasSemVencimento.reduce((s, t) => s + t.valor_final, 0),
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

  // Mantém em dia a linha-resumo mensal ("fatura consolidada") de um cartão — mesma
  // lógica do desktop (FinanceManager.tsx: syncFaturaConsolidada).
  async function syncFaturaConsolidada(cardId: string, periodos: string[]) {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    for (const periodo of [...new Set(periodos)]) {
      const { data: rows } = await supabase
        .from('finance_transactions')
        .select('valor_final, estabelecimento')
        .eq('card_id', cardId).eq('fatura_periodo', periodo).eq('is_fatura_consolidada', false);
      const total = (rows ?? []).reduce((s, r) => s + (r.valor_final || 0), 0);

      const { data: existing } = await supabase
        .from('finance_transactions')
        .select('id')
        .eq('card_id', cardId).eq('fatura_periodo', periodo).eq('is_fatura_consolidada', true)
        .maybeSingle();

      if (total <= 0) {
        if (existing) await supabase.from('finance_transactions').delete().eq('id', existing.id);
        continue;
      }

      const { vencimento } = calcularFatura(periodo, card, 0);
      const estabelecimento = rows?.[0]?.estabelecimento || ESTABLISHMENTS[0];

      if (existing) {
        await supabase.from('finance_transactions').update({ valor_final: total, vencimento, estabelecimento }).eq('id', existing.id);
      } else {
        await supabase.from('finance_transactions').insert({
          card_id: cardId, fatura_periodo: periodo, is_fatura_consolidada: true,
          data: periodo, vencimento, valor_final: total,
          tipo: 'Despesa', tipo_pagamento: 'Crédito',
          favorecido: card.nome, estabelecimento, pago: false, tag_ids: [],
        });
      }
    }
  }

  async function flushCreditSync(targets: Map<string, Set<string>>) {
    for (const [cardId, periodos] of targets) {
      await syncFaturaConsolidada(cardId, [...periodos]);
    }
  }

  async function handleSave() {
    if (!txForm.favorecido.trim()) return;
    if (txParcelas.length === 0 && txForm.valor_final === '0') return;
    setSaving(true);
    const isCredito = txForm.tipo_pagamento === 'Crédito' && !!txForm.card_id;
    const base = {
      tipo: txForm.tipo,
      tipo_pagamento: txForm.tipo_pagamento,
      favorecido: txForm.favorecido.trim(),
      estabelecimento: txForm.estabelecimento,
      account_id: txForm.account_id ?? null,
      numero_cheque: txForm.tipo_pagamento === 'Cheque' ? (txForm.numero_cheque || null) : null,
      identificacao: (txForm.tipo_pagamento !== 'Cheque' && txForm.tipo_pagamento !== 'Boleto') ? (txForm.identificacao?.trim() || null) : null,
      tag_ids: txForm.tag_ids ?? [],
      observacoes: txForm.observacoes.trim() || null,
      card_id: isCredito ? txForm.card_id : null,
    };
    const creditoPeriodos = isCredito ? [...new Set(txParcelas.map(p => p.periodo).filter((p): p is string => !!p))] : [];

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
          codigo_barras: txForm.tipo_pagamento === 'Boleto' ? (p.codigo_barras || null) : null,
          fatura_periodo: p.periodo ?? null,
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
        codigo_barras: txForm.tipo_pagamento === 'Boleto' ? ((single?.codigo_barras) || null) : null,
        fatura_periodo: single?.periodo ?? null,
      }]).select('id, favorecido, valor_final');
      if (inserted && pendingNotes.length > 0)
        await linkNotesToTransactions(inserted, pendingNotes.map(n => n.id));
    }

    if (creditoPeriodos.length > 0 && txForm.card_id) {
      await syncFaturaConsolidada(txForm.card_id, creditoPeriodos);
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
    const nextForm: TxForm = {
      tipo: tx.tipo,
      tipo_pagamento: tx.tipo_pagamento,
      favorecido: tx.favorecido,
      estabelecimento: tx.estabelecimento,
      data: tx.data,
      valor_final: tx.valor_final.toFixed(2).replace('.', ','),
      pago: tx.pago,
      tag_ids: tx.tag_ids ?? [],
      observacoes: tx.observacoes ?? '',
      account_id: tx.account_id ?? null,
      numero_cheque: tx.numero_cheque ?? null,
      identificacao: tx.identificacao ?? null,
      data_pagamento: tx.data_pagamento ?? null,
      card_id: tx.card_id ?? null,
    };
    setDetailForm(nextForm);
    // Vencimento vive no editor de parcelas: pré-carrega a própria linha para o
    // salvar não apagar o vencimento existente. seq preserva o número real da parcela
    // (relevante no fluxo de Crédito, onde o vencimento é recalculado a partir dela).
    // Movimentações antigas em "Crédito" (de antes desta feature) não têm vencimento —
    // mesmo assim precisam de 1 linha em detailParcelas, senão handleSaveDetail cai no
    // branch "sem vencimento", que zera card_id/fatura_periodo ao salvar.
    const nextParcelas: ParcelaRow[] = tx.vencimento
      ? [{ seq: tx.numero_parcela ?? 1, valor: tx.valor_final.toFixed(2).replace('.', ','), validade: tx.vencimento, codigo_barras: tx.codigo_barras ?? '', id: tx.id }]
      : tx.tipo_pagamento === 'Crédito'
        ? [{ seq: tx.numero_parcela ?? 1, valor: tx.valor_final.toFixed(2).replace('.', ','), validade: '', codigo_barras: '', id: tx.id }]
        : [];
    setDetailParcelas(nextParcelas);
    setEditingGroupIds(null);
    setEditingParcelamentoId(null);
    setDetailMode('view');
    setDetailSnapshot(JSON.stringify({ form: nextForm, parcelas: nextParcelas }));
  }

  // Chegando aqui vindo da aba "Financeiro" de uma nota (clique num card + confirmação):
  // assim que as movimentações carregam, abre direto o detalhe da movimentação indicada.
  useEffect(() => {
    if (!initialFocusTxId || loading) return;
    const t = transactions.find(x => x.id === initialFocusTxId);
    if (t) { setActiveTab('mov'); openDetail(t); }
    onInitialFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocusTxId, loading]);

  // Alterna a trava de edição do detalhe. Ao tentar travar de novo (sair do modo edição)
  // com alterações não salvas, pede confirmação antes de descartar e voltar ao modo leitura.
  function handleToggleDetailMode() {
    if (detailMode === 'view') { setDetailMode('edit'); return; }
    const dirty = detailSnapshot !== JSON.stringify({ form: detailForm, parcelas: detailParcelas });
    if (dirty) setShowDiscardDetailConfirm(true);
    else setDetailMode('view');
  }

  function confirmDiscardDetailEdit() {
    if (detailSnapshot) {
      const { form, parcelas } = JSON.parse(detailSnapshot) as { form: TxForm; parcelas: ParcelaRow[] };
      setDetailForm(form);
      setDetailParcelas(parcelas);
    }
    setDetailMode('view');
    setShowDiscardDetailConfirm(false);
  }

  // Carrega todas as parcelas irmãs no editor para edição em lote (diff no salvar,
  // sem apagar e recriar quem não mudou — preserva "pago" das parcelas intocadas)
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
      codigo_barras: s.codigo_barras ?? '',
      id: s.id,
    })));
    setEditingGroupIds(siblings.map(s => s.id));
    setEditingParcelamentoId(siblings[0].parcelamento_id ?? crypto.randomUUID());
    setParcelasModalOpen('edit');
  }

  function closeDetail() {
    setDetailTx(null);
    setDetailMode('view');
    setDetailParcelas([]);
    setEditingGroupIds(null);
    setEditingParcelamentoId(null);
  }

  async function handleSaveDetail() {
    if (!detailTx) return;
    if (!detailForm.favorecido.trim()) return;
    if (detailParcelas.length === 0 && detailForm.valor_final === '0') return;
    setSavingDetail(true);

    // Períodos de fatura que existiam ANTES desta edição — ressincronizados no final
    // junto dos períodos novos, caso a movimentação mude de cartão/mês ou deixe de ser
    // Crédito (mesma lógica do desktop, FinanceManager.tsx: handleTxSubmit).
    const creditSyncTargets = new Map<string, Set<string>>();
    const addSyncTarget = (cardId: string | null | undefined, periodo: string | null | undefined) => {
      if (!cardId || !periodo) return;
      if (!creditSyncTargets.has(cardId)) creditSyncTargets.set(cardId, new Set());
      creditSyncTargets.get(cardId)!.add(periodo);
    };
    const originalRows = editingGroupIds
      ? transactions.filter(t => editingGroupIds.includes(t.id))
      : [detailTx];
    for (const r of originalRows) addSyncTarget(r.card_id, r.fatura_periodo);

    const base = {
      tipo: detailForm.tipo,
      tipo_pagamento: detailForm.tipo_pagamento,
      favorecido: detailForm.favorecido.trim(),
      estabelecimento: detailForm.estabelecimento,
      account_id: detailForm.account_id ?? null,
      numero_cheque: detailForm.tipo_pagamento === 'Cheque' ? (detailForm.numero_cheque || null) : null,
      identificacao: (detailForm.tipo_pagamento !== 'Cheque' && detailForm.tipo_pagamento !== 'Boleto') ? (detailForm.identificacao?.trim() || null) : null,
      tag_ids: detailForm.tag_ids ?? [],
      observacoes: detailForm.observacoes.trim() || null,
      card_id: detailForm.tipo_pagamento === 'Crédito' ? (detailForm.card_id ?? null) : null,
    };
    if (detailParcelas.length === 1 && !editingGroupIds) {
      // Pagamento único com vencimento: atualiza no lugar, preservando
      // pago/numero_parcela/parcelamento_id da linha.
      const p = detailParcelas[0];
      const valorNum = parseFloat(p.valor.replace(',', '.')) || 0;
      // Parcelas de salário (origem=hr_salario) só liberam Conta/Tipo de pagamento/
      // Identificação/Observações no formulário — os demais campos (incluindo "pago",
      // que também pode ter sido alterado via o atalho rápido enquanto o sheet estava
      // aberto) sempre vêm da própria transação, nunca do form, para não sobrescrever
      // com um valor desatualizado.
      const isSalarioRow = detailTx.origem === 'hr_salario';
      // Crédito antigo (sem vencimento) que o usuário ainda não confirmou em "Configurar
      // parcelas" — p.validade fica vazio até isso acontecer. Preserva o vencimento/cartão
      // já salvos em vez de gravar uma data vazia, para não travar o salvar de outros campos.
      const pendingCreditoSemData = !isSalarioRow && detailForm.tipo_pagamento === 'Crédito' && !p.validade;
      const updates = {
        ...base,
        data: isSalarioRow ? detailTx.data : detailForm.data,
        vencimento: isSalarioRow ? detailTx.vencimento : (pendingCreditoSemData ? (detailTx.vencimento ?? null) : p.validade),
        valor_final: isSalarioRow ? detailTx.valor_final : valorNum,
        pago: isSalarioRow ? detailTx.pago : detailForm.pago,
        total_pago: isSalarioRow ? detailTx.total_pago : (detailForm.pago ? valorNum : 0),
        data_pagamento: isSalarioRow ? (detailTx.data_pagamento ?? null) : (detailForm.data_pagamento ?? null),
        codigo_barras: isSalarioRow ? detailTx.codigo_barras : (detailForm.tipo_pagamento === 'Boleto' ? (p.codigo_barras || null) : null),
        fatura_periodo: isSalarioRow ? (detailTx.fatura_periodo ?? null) : (pendingCreditoSemData ? (detailTx.fatura_periodo ?? null) : (p.periodo ?? null)),
        card_id: pendingCreditoSemData ? (detailTx.card_id ?? null) : base.card_id,
      };
      await supabase.from('finance_transactions').update(updates).eq('id', detailTx.id);
      addSyncTarget(updates.card_id, updates.fatura_periodo);
      await flushCreditSync(creditSyncTargets);
      setSavingDetail(false);
      setDetailTx({ ...detailTx, ...updates });
      setDetailMode('view');
      setDetailSnapshot(JSON.stringify({ form: detailForm, parcelas: detailParcelas }));
      loadData();
      return;
    }
    if (detailParcelas.length > 1 && editingGroupIds) {
      // Edição do grupo inteiro: diff contra as linhas carregadas — parcelas que
      // continuam no editor são atualizadas no lugar (preservando pago/total_pago),
      // as removidas são apagadas, e só as novas são inseridas. Não recria o grupo do zero.
      const parcelamentoId = editingParcelamentoId ?? crypto.randomUUID();
      const keptIds = new Set(detailParcelas.filter(p => p.id).map(p => p.id!));
      const deletedIds = editingGroupIds.filter(id => !keptIds.has(id));
      if (deletedIds.length > 0)
        await supabase.from('finance_transactions').delete().in('id', deletedIds);

      const rows = detailParcelas.map((p, i) => {
        const original = p.id ? transactions.find(t => t.id === p.id) : undefined;
        return {
          id: p.id ?? crypto.randomUUID(),
          ...base, data: p.validade, vencimento: p.validade,
          valor_final: parseFloat(p.valor.replace(',', '.')) || 0,
          numero_parcela: i + 1, total_parcelas: detailParcelas.length, parcelamento_id: parcelamentoId,
          codigo_barras: detailForm.tipo_pagamento === 'Boleto' ? (p.codigo_barras || null) : null,
          fatura_periodo: p.periodo ?? null,
          pago: original?.pago ?? false,
          total_pago: original?.total_pago ?? 0,
          // Parcela já paga preserva a conta/data do pagamento — a edição em lote do
          // grupo não deve sobrescrever com a conta genérica do formulário.
          account_id: original?.pago ? (original.account_id ?? null) : base.account_id,
          data_pagamento: original?.pago ? (original.data_pagamento ?? null) : null,
        };
      });
      const { data: upserted } = await supabase.from('finance_transactions')
        .upsert(rows).select('id, favorecido, valor_final');

      // Vincula as notas já ligadas ao grupo também às parcelas recém-criadas
      const newRowIds = new Set(rows.filter((_, i) => !detailParcelas[i].id).map(r => r.id));
      if (newRowIds.size > 0) {
        const { data: links } = await supabase.from('finance_transaction_notes')
          .select('note_id').in('transaction_id', editingGroupIds);
        const noteIds = [...new Set((links ?? []).map(l => l.note_id as string))];
        const newlyInserted = (upserted ?? []).filter(u => newRowIds.has(u.id));
        if (noteIds.length > 0 && newlyInserted.length > 0)
          await linkNotesToTransactions(newlyInserted, noteIds);
      }
      rows.forEach(r => addSyncTarget(r.card_id, r.fatura_periodo));
      await flushCreditSync(creditSyncTargets);
      setSavingDetail(false);
      setDetailTx(null);
      setDetailMode('view');
      setDetailParcelas([]);
      setEditingGroupIds(null);
      setEditingParcelamentoId(null);
      loadData();
      return;
    }
    if (detailParcelas.length > 1 && !editingGroupIds) {
      // Conversão de uma linha única (sem grupo) em parcelamento novo.
      const { data: linkedRows } = await supabase.from('finance_transaction_notes')
        .select('note_id').eq('transaction_id', detailTx.id);
      await supabase.from('finance_transactions').delete().eq('id', detailTx.id);
      const parcelamentoId = crypto.randomUUID();
      const newRows = detailParcelas.map(p => ({
        ...base,
        data: p.validade,
        vencimento: p.validade,
        valor_final: parseFloat(p.valor.replace(',', '.')) || 0,
        total_pago: 0,
        pago: false,
        numero_parcela: p.seq,
        total_parcelas: detailParcelas.length,
        parcelamento_id: parcelamentoId,
        codigo_barras: detailForm.tipo_pagamento === 'Boleto' ? (p.codigo_barras || null) : null,
        fatura_periodo: p.periodo ?? null,
      }));
      const { data: inserted } = await supabase.from('finance_transactions').insert(newRows).select('id, favorecido, valor_final');
      const relinkIds = [...new Set((linkedRows ?? []).map(r => r.note_id as string))];
      if (inserted && relinkIds.length > 0)
        await linkNotesToTransactions(inserted, relinkIds);
      newRows.forEach(r => addSyncTarget(r.card_id, r.fatura_periodo));
      await flushCreditSync(creditSyncTargets);
      setSavingDetail(false);
      setDetailTx(null);
      setDetailMode('view');
      setDetailParcelas([]);
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
      data_pagamento: null,
      numero_parcela: null,
      total_parcelas: null,
      parcelamento_id: null,
      card_id: null,
      fatura_periodo: null,
      is_fatura_consolidada: false,
    };
    await supabase.from('finance_transactions').update(updates).eq('id', detailTx.id);
    await flushCreditSync(creditSyncTargets);
    setSavingDetail(false);
    setDetailTx({ ...detailTx, ...updates });
    setDetailMode('view');
    setDetailSnapshot(JSON.stringify({ form: detailForm, parcelas: detailParcelas }));
    loadData();
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    setShowDeleteSelectedConfirm(true);
  }

  async function confirmDeleteSelected() {
    setShowDeleteSelectedConfirm(false);
    const ids = [...selectedIds].filter(id => transactions.find(t => t.id === id)?.origem !== 'hr_salario');
    if (ids.length === 0) { setSelectedIds(new Set()); setSelectionMode(false); return; }
    await supabase.from('finance_transactions').delete().in('id', ids);
    await cleanupNoteLinksForDeletedTxs(ids);
    setSelectedIds(new Set());
    setSelectionMode(false);
    loadData();
  }

  // Exclusão de uma compra de crédito individual (via drill-down da aba Cartões) —
  // precisa refazer o total da fatura daquele período.
  async function handleDeleteCreditoTx(t: Transaction) {
    if (!confirm('Excluir esta movimentação?')) return;
    await supabase.from('finance_transactions').delete().eq('id', t.id);
    await cleanupNoteLinksForDeletedTxs([t.id]);
    if (t.card_id && t.fatura_periodo) await syncFaturaConsolidada(t.card_id, [t.fatura_periodo]);
    loadData();
  }

  // Atalho de "marcar como paga" para movimentações origem=hr_salario, que ficam travadas
  // para qualquer outra edição — usado direto no modo de visualização, sem entrar em "edit".
  // Como hr_salario sempre tem vencimento, marcar como pago sempre passa pelo questionário;
  // desmarcar sempre pede confirmação — ambos gravam direto no banco (mode 'immediate').
  function handleTogglePagoQuick(tx: Transaction) {
    if (tx.pago) {
      setUnmarkPaidState({ tx, mode: 'immediate' });
      return;
    }
    openMarkPaid(tx, 'immediate');
  }

  function openMarkPaid(tx: Transaction, mode: 'immediate' | 'form') {
    setMarkPaidState({ tx, mode });
    setMarkPaidAccountId(tx.account_id ?? '');
    setMarkPaidDate(tx.data_pagamento || new Date().toISOString().split('T')[0]);
  }

  async function confirmMarkPaid() {
    if (!markPaidState) return;
    const { tx, mode } = markPaidState;
    setMarkPaidSubmitting(true);
    try {
      const patch: Partial<Transaction> = {
        account_id: markPaidAccountId || null,
        data_pagamento: markPaidDate || null,
      };
      if (!tx.pago) { patch.pago = true; patch.total_pago = tx.valor_final; }
      if (mode === 'immediate') {
        await supabase.from('finance_transactions').update(patch).eq('id', tx.id);
        setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, ...patch } : t));
        setDetailTx(prev => prev && prev.id === tx.id ? { ...prev, ...patch } : prev);
      }
      // Sincroniza o rascunho aberto (se o usuário estiver editando esta mesma
      // movimentação) para o "Salvar Alterações" não reverter para o valor antigo.
      if (detailTx && detailTx.id === tx.id) {
        setDetailForm(f => ({
          ...f,
          account_id: patch.account_id ?? null,
          data_pagamento: patch.data_pagamento ?? null,
          pago: patch.pago ?? f.pago,
        }));
      }
      setMarkPaidState(null);
    } finally {
      setMarkPaidSubmitting(false);
    }
  }

  async function confirmUnmarkPaid() {
    if (!unmarkPaidState) return;
    const { tx, mode } = unmarkPaidState;
    setUnmarkPaidSubmitting(true);
    try {
      const patch = { pago: false, total_pago: 0, data_pagamento: null as string | null };
      if (mode === 'immediate') {
        await supabase.from('finance_transactions').update(patch).eq('id', tx.id);
        setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, ...patch } : t));
        setDetailTx(prev => prev && prev.id === tx.id ? { ...prev, ...patch } : prev);
      }
      if (detailTx && detailTx.id === tx.id) {
        setDetailForm(f => ({ ...f, pago: false, data_pagamento: null }));
      }
      setUnmarkPaidState(null);
    } finally {
      setUnmarkPaidSubmitting(false);
    }
  }

  async function handleMarkPaidSelected() {
    if (selectedIds.size === 0) return;
    // Despesas com vencimento exigem conta+data — ficam de fora da ação em lote e
    // devem ser marcadas individualmente pelo questionário.
    const ids = [...selectedIds].filter(id => {
      const t = transactions.find(tx => tx.id === id);
      return t && !needsPaymentQuestionnaire(t);
    });
    if (ids.length === 0) { setSelectedIds(new Set()); setSelectionMode(false); return; }
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
    if (t === 'cartoes') setCartoesDrill(null);
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

      {/* Header — solto sem barra amarela, inspirado no Inventory */}
      <div className="shrink-0 bg-[#FDFAF0] dark:bg-[#1E1E18] pt-14 px-4 pb-1">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={toggleMode}
            title="Mudar para modo Desktop"
            className="w-[38px] h-[38px] rounded-full bg-[rgba(26,26,10,0.07)] dark:bg-white/[0.06] border border-[rgba(26,26,10,0.08)] dark:border-white/[0.08] flex items-center justify-center text-[#1A1A0E] dark:text-[#F2F0E3] active:scale-95 transition-transform"
          >
            <Monitor size={17} />
          </button>
          <button
            onClick={() => setShowAddSheet(true)}
            className="w-[38px] h-[38px] bg-[#D81E1E] rounded-full flex items-center justify-center shadow-[0_4px_14px_rgba(216,30,30,0.32)] active:scale-95 transition-transform"
          >
            <Plus size={18} color="white" strokeWidth={2.8} />
          </button>
        </div>
        <h1 className="text-[32px] font-black text-[#1A1208] dark:text-[#F2F0E3] tracking-tight leading-tight mt-4">Controle Financeiro</h1>
      </div>

      {/* Tab pills — sem ícone, formato pílula */}
      <div className="shrink-0 bg-[#FDFAF0] dark:bg-[#1E1E18] px-4 pt-3 pb-2.5 flex gap-2 overflow-x-auto">
        {([
          { key: 'mov',     label: 'Movimentações' },
          { key: 'dash',    label: 'Dashboard' },
          { key: 'dados',   label: 'Dados' },
          { key: 'cartoes', label: 'Cartões' },
        ] as { key: Tab; label: string }[]).map(tab => (
          <button
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            className={cn(
              'px-[14px] py-[9px] rounded-full shrink-0',
              'text-[10.5px] font-black uppercase tracking-[0.04em]',
              'border-[1.5px] transition-all duration-150 active:scale-[0.97]',
              activeTab === tab.key
                ? 'bg-[#1A1A0E] text-[#FFE500] border-transparent dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                : 'bg-[rgba(26,26,10,0.055)] dark:bg-white/[0.045] border-[rgba(26,26,10,0.08)] dark:border-white/[0.08] text-[rgba(26,26,10,0.55)] dark:text-white/45'
            )}
          >
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
              {/* Action row: busca com filtro embutido + grupo calendário/selecionar */}
              <div className="flex gap-2 px-3 pb-2.5 items-center">
                <div className="flex-1 h-11 flex items-center gap-2 bg-white dark:bg-[#252520] border-[1.5px] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] rounded-2xl pl-3.5 pr-1.5 min-w-0">
                  <Search size={15} className="text-[rgba(26,26,10,0.30)] dark:text-white/25 shrink-0" />
                  <input
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] text-[rgba(26,26,10,0.55)] dark:text-white/40 font-medium placeholder:text-[rgba(26,26,10,0.28)] dark:placeholder:text-white/20"
                    placeholder="Buscar transações..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  <button
                    onClick={() => setShowFilterSheet(true)}
                    className={cn(
                      'w-8 h-8 rounded-xl flex items-center justify-center active:scale-90 transition-all shrink-0',
                      searchField !== null
                        ? 'bg-[rgba(216,30,30,0.10)] text-[#D81E1E]'
                        : 'text-[rgba(26,26,10,0.40)] dark:text-white/35'
                    )}
                    title="Filtrar"
                  >
                    <Filter size={14} />
                  </button>
                </div>

                <div className="flex items-center h-11 bg-[rgba(26,26,10,0.055)] dark:bg-white/[0.045] border-[1.5px] border-[rgba(26,26,10,0.08)] dark:border-white/[0.08] rounded-2xl overflow-hidden shrink-0">
                  <button
                    onClick={() => setShowCalSheet(true)}
                    className={cn(
                      'w-9 h-full flex items-center justify-center active:scale-90 transition-all',
                      hasDatePeriod
                        ? 'bg-[rgba(216,30,30,0.10)] text-[#D81E1E]'
                        : 'text-[rgba(26,26,10,0.45)] dark:text-white/40'
                    )}
                    title="Calendário"
                  >
                    <Calendar size={14} />
                  </button>
                  <div className="w-px self-stretch bg-[rgba(26,26,10,0.08)] dark:bg-white/[0.08]" />
                  <button
                    onClick={() => setSelectionMode(v => !v)}
                    className={cn(
                      'w-9 h-full flex items-center justify-center active:scale-90 transition-all',
                      selectionMode
                        ? 'bg-[rgba(216,30,30,0.10)] text-[#D81E1E]'
                        : 'text-[rgba(26,26,10,0.45)] dark:text-white/40'
                    )}
                    title="Selecionar"
                  >
                    <CheckSquare size={14} />
                  </button>
                </div>
              </div>

              {/* Painel ADM — Vencimento / Total Pago / Saídas, lado a lado */}
              <div className="grid grid-cols-3 gap-2 px-3 pb-2">
                <div className="min-w-0 bg-white dark:bg-[#252520] border-[1.5px] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] rounded-2xl p-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-[22px] h-[22px] rounded-[8px] flex items-center justify-center shrink-0 bg-[rgba(216,30,30,0.10)] text-[#D81E1E] dark:bg-[rgba(216,30,30,0.14)] dark:text-[#F43F5E]">
                      <Clock size={12} strokeWidth={2.5} />
                    </span>
                    <span className="text-[8.5px] font-black text-[rgba(26,26,10,0.55)] dark:text-white/45 truncate">Vencimento</span>
                  </div>
                  <span className="font-['DM_Mono',monospace] text-[14px] font-black tracking-tight text-[#D81E1E] dark:text-[#F43F5E] truncate">{fmtShort(vencimentoStats.valor)}</span>
                  <span className="text-[8.5px] font-bold text-[rgba(26,26,10,0.35)] dark:text-white/30">{vencimentoStats.count} mov.</span>
                </div>
                <div className="min-w-0 bg-white dark:bg-[#252520] border-[1.5px] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] rounded-2xl p-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-[22px] h-[22px] rounded-[8px] flex items-center justify-center shrink-0 bg-[rgba(5,150,105,0.10)] text-[#059669] dark:bg-[rgba(52,211,153,0.12)] dark:text-[#34D399]">
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span className="text-[8.5px] font-black text-[rgba(26,26,10,0.55)] dark:text-white/45 truncate">Total Pago</span>
                  </div>
                  <span className="font-['DM_Mono',monospace] text-[14px] font-black tracking-tight text-[#059669] dark:text-[#34D399] truncate">{fmtShort(vencimentoStats.totalPago)}</span>
                  <span className="text-[8.5px] font-bold text-[rgba(26,26,10,0.35)] dark:text-white/30">{vencimentoStats.pagoCount} pagas</span>
                </div>
                <div className="min-w-0 bg-white dark:bg-[#252520] border-[1.5px] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] rounded-2xl p-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-[22px] h-[22px] rounded-[8px] flex items-center justify-center shrink-0 bg-[rgba(216,30,30,0.10)] text-[#D81E1E] dark:bg-[rgba(216,30,30,0.14)] dark:text-[#F43F5E]">
                      <TrendingDown size={12} strokeWidth={2.5} />
                    </span>
                    <span className="text-[8.5px] font-black text-[rgba(26,26,10,0.55)] dark:text-white/45 truncate">Saídas</span>
                  </div>
                  <span className="font-['DM_Mono',monospace] text-[14px] font-black tracking-tight text-[#D81E1E] dark:text-[#F43F5E] truncate">{fmtShort(vencimentoStats.saidasValor)}</span>
                </div>
              </div>

              {/* Selection delete bar */}
              <AnimatePresence>
                {selectionMode && selectedIds.size > 0 && (() => {
                  const skippedCount = [...selectedIds].filter(id => {
                    const t = transactions.find(tx => tx.id === id);
                    return t && needsPaymentQuestionnaire(t);
                  }).length;
                  return (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mx-3 mb-2 overflow-hidden"
                    >
                      <div className="bg-[rgba(216,30,30,0.10)] border border-[rgba(216,30,30,0.20)] rounded-2xl px-4 py-2.5 flex items-center justify-between">
                        <span className="text-[12px] font-bold text-[#D81E1E]">{selectedIds.size} selecionada{selectedIds.size > 1 ? 's' : ''}</span>
                        <div className="flex items-center gap-3">
                          <button onClick={handleMarkPaidSelected} className="flex items-center gap-1.5 text-[#059669] dark:text-[#34D399] text-[12px] font-black">
                            <Check size={14} /> Marcar Pago
                          </button>
                          <button onClick={handleDeleteSelected} className="flex items-center gap-1.5 text-[#D81E1E] text-[12px] font-black">
                            <Trash2 size={14} /> Excluir
                          </button>
                        </div>
                      </div>
                      {skippedCount > 0 && (
                        <div className="mt-1.5 flex items-start gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-[10.5px] font-semibold text-amber-700 dark:text-amber-400 leading-snug">
                          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                          <span>{skippedCount} despesa{skippedCount > 1 ? 's' : ''} com vencimento será{skippedCount > 1 ? 'ão' : ''} ignorada{skippedCount > 1 ? 's' : ''} — marque individualmente para informar conta e data.</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })()}
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
                      onClick={() => {
                        if (selectionMode) { toggleSelect(tx.id); return; }
                        if (tx.is_fatura_consolidada && tx.card_id && tx.fatura_periodo) {
                          setCartoesDrill({ cardId: tx.card_id, periodo: tx.fatura_periodo });
                          setActiveTab('cartoes');
                          return;
                        }
                        openDetail(tx);
                      }}
                      className={cn(
                        'mx-3 mb-2 bg-white dark:bg-[#252520] border-[1.5px] rounded-[18px] px-3.5 py-3 flex flex-col gap-2',
                        'active:scale-[0.99] transition-all',
                        selectionMode && selectedIds.has(tx.id)
                          ? 'border-[rgba(216,30,30,0.30)] bg-[rgba(216,30,30,0.04)] dark:bg-[rgba(216,30,30,0.08)]'
                          : tx.is_fatura_consolidada
                            ? 'border-[rgba(216,30,30,0.20)] bg-[rgba(216,30,30,0.03)] dark:bg-[rgba(216,30,30,0.06)]'
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
                            <p className="text-[14px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-snug flex items-center gap-1.5">
                              {tx.is_fatura_consolidada && <CreditCard size={12} className="text-[#D81E1E] shrink-0" />}
                              {tx.favorecido || '—'}
                              {tx.is_fatura_consolidada && <Eye size={12} className="text-[#D81E1E] shrink-0" />}
                            </p>
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
                          {tx.codigo && (
                            <span className="mr-1.5 bg-[rgba(216,30,30,0.08)] dark:bg-[rgba(216,30,30,0.14)] rounded-[8px] px-2 py-[3px] text-[9px] font-black tracking-wide text-[#D81E1E] dark:text-[#F43F5E]">
                              {tx.codigo}
                            </span>
                          )}
                          <span className={cn(
                            'rounded-[8px] px-2 py-[3px] text-[9px] font-black uppercase tracking-[0.08em]',
                            tx.is_fatura_consolidada
                              ? 'bg-[rgba(216,30,30,0.10)] dark:bg-[rgba(216,30,30,0.16)] text-[#D81E1E] dark:text-[#F43F5E]'
                              : 'bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.07] text-[rgba(26,26,10,0.45)] dark:text-white/35'
                          )}>
                            {tx.is_fatura_consolidada ? 'Fatura' : tx.tipo_pagamento}
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
                    onClick={openNewFavorecido}
                    title="Novo favorecido"
                    className="w-[27px] h-[27px] rounded-[9px] flex items-center justify-center shadow-[0_3px_10px_rgba(216,30,30,0.28)] active:scale-90 transition-transform bg-[#D81E1E]"
                  >
                    <Plus size={13} color="white" />
                  </button>
                </div>
                <div className="p-2.5 flex flex-col gap-1.75">
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
                            {f.supplier_id && (
                              <p className="flex items-center gap-1 mt-0.5">
                                <Building2 size={9} className="text-[#D81E1E]/70" />
                                <span className="text-[9.5px] font-semibold text-[#D81E1E]/80 truncate">
                                  {suppliers.find(s => s.id === f.supplier_id)?.name ?? 'Fornecedor vinculado'}
                                </span>
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => openEditFavorecido(f)}
                            className="w-[27px] h-[27px] rounded-lg flex items-center justify-center text-[rgba(26,18,8,0.30)] dark:text-white/25 active:bg-primary/10 active:text-primary transition-colors shrink-0"
                          >
                            <Edit2 size={13} />
                          </button>
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

          {activeTab === 'cartoes' && (() => {
            const faturas = transactions
              .filter(t => t.is_fatura_consolidada)
              .sort((a, b) => (b.fatura_periodo ?? '').localeCompare(a.fatura_periodo ?? ''));
            const drillCard = cartoesDrill ? cards.find(c => c.id === cartoesDrill.cardId) : null;
            const drillItems = cartoesDrill
              ? transactions
                  .filter(t => t.card_id === cartoesDrill.cardId && t.fatura_periodo === cartoesDrill.periodo && !t.is_fatura_consolidada)
                  .sort((a, b) => a.data.localeCompare(b.data))
              : [];
            const periodoLabel = (periodo: string | null | undefined) =>
              periodo ? new Date(periodo + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase()) : '—';

            return (
              <motion.div
                key="cartoes"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                className="pb-6 px-3 pt-3 flex flex-col gap-3.5"
              >
                {!cartoesDrill ? (
                  <div className="bg-[rgba(255,246,201,0.75)] dark:bg-[#23231D] border border-[rgba(26,18,8,0.07)] dark:border-white/[0.07] rounded-[18px] overflow-hidden">
                    <div className="bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-3.5 py-2.5 flex items-center gap-1.5">
                      <CreditCard size={14} className="text-[#1A1A0E]" />
                      <span className="text-[12px] font-black text-[#1A1A0E]">Faturas de Cartão</span>
                      <span className="bg-[rgba(26,26,10,0.10)] text-[rgba(26,26,10,0.55)] rounded-full px-[7px] py-[2px] text-[8.5px] font-black">{faturas.length}</span>
                    </div>
                    <div className="p-2.5 flex flex-col gap-1.75">
                      {!dadosLoaded ? (
                        <div className="flex items-center justify-center py-8 text-[rgba(26,26,10,0.25)] dark:text-white/20">
                          <Loader2 size={20} className="animate-spin" />
                        </div>
                      ) : faturas.length === 0 ? (
                        <div className="flex flex-col items-center py-7 text-[rgba(26,26,10,0.25)] dark:text-white/20">
                          <CreditCard size={28} className="mb-1.5" />
                          <p className="text-[11px] font-bold">Nenhuma fatura ainda</p>
                          <p className="text-[10px] mt-1 text-center px-4">Movimentações em Crédito geram a fatura do mês automaticamente</p>
                        </div>
                      ) : (
                        faturas.map(f => {
                          const card = cards.find(c => c.id === f.card_id);
                          return (
                            <button
                              key={f.id}
                              onClick={() => f.card_id && f.fatura_periodo && setCartoesDrill({ cardId: f.card_id, periodo: f.fatura_periodo })}
                              className="bg-white dark:bg-[#252520] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] rounded-[14px] px-3 py-2.5 flex items-center gap-2.5 text-left active:scale-[0.98] transition-transform"
                            >
                              <div className="w-9 h-9 rounded-[10px] bg-[rgba(216,30,30,0.09)] dark:bg-[rgba(216,30,30,0.14)] flex items-center justify-center text-[#D81E1E] shrink-0">
                                <CreditCard size={15} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12.5px] font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3] truncate">{card?.nome ?? f.favorecido}</p>
                                <p className="text-[9.5px] text-[rgba(26,26,10,0.42)] dark:text-white/35 truncate mt-0.5">
                                  {periodoLabel(f.fatura_periodo)} · Vence {f.vencimento ? new Date(f.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                                </p>
                              </div>
                              <span className={cn(
                                'text-[8.5px] font-black uppercase tracking-wide px-2 py-[3px] rounded-full shrink-0',
                                f.pago ? 'bg-[rgba(5,150,105,0.10)] text-[#059669] dark:bg-[rgba(52,211,153,0.12)] dark:text-[#34D399]' : 'bg-[rgba(245,158,11,0.12)] text-[#B45309] dark:bg-[rgba(251,191,36,0.14)] dark:text-[#FCD34D]'
                              )}>
                                {f.pago ? 'Paga' : 'Aberta'}
                              </span>
                              <span className="font-['DM_Mono',monospace] text-[11px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] whitespace-nowrap shrink-0">
                                {fmt(f.usar_valor_real ? (f.valor_real ?? f.valor_final) : f.valor_final)}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-[rgba(255,246,201,0.75)] dark:bg-[#23231D] border border-[rgba(26,18,8,0.07)] dark:border-white/[0.07] rounded-[18px] overflow-hidden">
                    <div className="bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-3.5 py-2.5 flex items-center gap-2">
                      <button
                        onClick={() => setCartoesDrill(null)}
                        className="w-[27px] h-[27px] rounded-[9px] bg-[rgba(26,26,10,0.10)] text-[#1A1A0E] flex items-center justify-center active:scale-90 transition-transform shrink-0"
                      >
                        <ArrowLeft size={14} />
                      </button>
                      <CreditCard size={13} className="text-[#1A1A0E] shrink-0" />
                      <span className="text-[11.5px] font-black text-[#1A1A0E] truncate">
                        {drillCard?.nome ?? '—'} · {periodoLabel(cartoesDrill.periodo)}
                      </span>
                    </div>
                    <div className="p-2.5 flex flex-col gap-1.75">
                      {drillItems.length === 0 ? (
                        <div className="flex flex-col items-center py-7 text-[rgba(26,26,10,0.25)] dark:text-white/20">
                          <CreditCard size={28} className="mb-1.5" />
                          <p className="text-[11px] font-bold">Nenhum lançamento nesta fatura</p>
                        </div>
                      ) : (
                        drillItems.map(t => (
                          <div
                            key={t.id}
                            onClick={() => { setActiveTab('mov'); openDetail(t); }}
                            className="bg-white dark:bg-[#252520] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] rounded-[14px] px-3 py-2.5 flex items-center gap-2.5 active:scale-[0.99] transition-transform"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-[12.5px] font-bold text-[#1A1A0E] dark:text-[#F2F0E3] truncate">{t.favorecido}</p>
                              <p className="text-[9.5px] text-[rgba(26,26,10,0.42)] dark:text-white/35 truncate mt-0.5">
                                {new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR')} · {t.estabelecimento}
                              </p>
                            </div>
                            <span className="inline-flex items-center justify-center min-w-[26px] h-[20px] px-1 rounded-full bg-[rgba(216,30,30,0.10)] dark:bg-[rgba(216,30,30,0.15)] text-[9px] font-black text-[#D81E1E] dark:text-[#F43F5E] shrink-0">
                              {t.numero_parcela ?? 1}/{t.total_parcelas ?? 1}
                            </span>
                            <span className="font-['DM_Mono',monospace] text-[11px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] whitespace-nowrap shrink-0">{fmt(t.valor_final)}</span>
                            <button
                              onClick={e => { e.stopPropagation(); handleDeleteCreditoTx(t); }}
                              className="w-6 h-6 rounded-lg flex items-center justify-center text-[rgba(26,18,8,0.30)] dark:text-white/25 active:bg-rose-500/10 active:text-rose-500 transition-colors shrink-0"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })()}

        </AnimatePresence>
      </div>
    </div>

    {/*
      Os sheets abaixo são renderizados FORA do container `z-40` acima de propósito:
      esse container fixed+z-index cria um novo contexto de empilhamento, o que prendia
      os sheets (mesmo com z-index alto) por baixo do BottomNav (z-50, irmão fora desse
      contexto). Ficando como irmãos no topo, o z-[100] deles vale globalmente.
    */}

    <FavorecidoEditModal
      open={showFavorecidoEditModal}
      favorecido={editingFavorecido}
      suppliers={suppliers}
      onClose={() => setShowFavorecidoEditModal(false)}
      onSaved={handleFavorecidoSaved}
      variant="sheet"
    />

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
            accounts={accounts}
            cards={cards}
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
            onToggleMode={handleToggleDetailMode}
            form={detailForm}
            setForm={setDetailForm}
            onSave={handleSaveDetail}
            onClose={closeDetail}
            saving={savingDetail}
            tags={tags}
            onCreateTag={(nome, cor) => createTag(nome, cor, '')}
            accounts={accounts}
            cards={cards}
            parcelas={detailParcelas}
            onOpenParcelas={() => setParcelasModalOpen('edit')}
            groupTotal={getParcelaGroupTotal(detailTx)}
            onEditAllParcelas={() => loadGroupIntoDetail(detailTx)}
            editingWholeGroup={editingGroupIds !== null}
            siblingTxs={getParcelaSiblings(detailTx)}
            onTogglePago={handleTogglePagoQuick}
            onRequestMarkPaid={() => openMarkPaid(detailTx, 'form')}
            onRequestUnmarkPaid={() => setUnmarkPaidState({ tx: detailTx, mode: 'form' })}
          />
        </>
      )}
    </AnimatePresence>

    {/* Confirmação de descarte ao sair da edição sem salvar */}
    <AnimatePresence>
      {showDiscardDetailConfirm && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm"
            onClick={() => setShowDiscardDetailConfirm(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-[151] flex items-center justify-center p-6 pointer-events-none"
          >
            <div className="pointer-events-auto bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-2xl p-5 w-full max-w-sm shadow-2xl">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                  <AlertTriangle size={17} />
                </div>
                <h3 className="text-base font-black text-[#1A1A0E] dark:text-[#F2F0E3]">Sair sem salvar?</h3>
              </div>
              <p className="text-sm text-[rgba(26,26,10,0.55)] dark:text-white/45 mb-5">
                Você tem alterações não salvas nesta movimentação. Se sair do modo de edição agora, elas serão descartadas.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDiscardDetailConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[rgba(26,26,10,0.10)] dark:border-white/[0.10] text-sm font-bold text-[rgba(26,26,10,0.55)] dark:text-white/45 active:scale-[0.97] transition-transform"
                >
                  Continuar editando
                </button>
                <button
                  onClick={confirmDiscardDetailEdit}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-bold active:scale-[0.97] transition-transform"
                >
                  Descartar
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

    {/* Marcar como paga / alterar conta do pagamento */}
    <AnimatePresence>
      {markPaidState && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm"
            onClick={() => setMarkPaidState(null)}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="fixed inset-x-0 bottom-0 z-[151] bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-t-[28px] shadow-2xl p-5 pb-[max(20px,env(safe-area-inset-bottom))]"
          >
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 rounded-full bg-[rgba(26,26,10,0.15)] dark:bg-white/20" />
            </div>
            <h3 className="text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] mb-1">
              {markPaidState.tx.pago ? 'Alterar conta do pagamento' : 'Marcar como paga'}
            </h3>
            <p className="text-[12px] text-[rgba(26,26,10,0.45)] dark:text-white/35 mb-4">
              {markPaidState.tx.favorecido} · {markPaidState.tx.tipo_pagamento} · {fmt(markPaidState.tx.valor_final)}
            </p>
            <div className="flex flex-col gap-3">
              <div>
                <span className={markPaidLabelCls}>Conta utilizada</span>
                <select value={markPaidAccountId} onChange={e => setMarkPaidAccountId(e.target.value)} className={markPaidFieldCls}>
                  <option value="">Selecione a conta...</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.nome} — {a.banco}</option>)}
                </select>
              </div>
              <div>
                <span className={markPaidLabelCls}>Data do pagamento</span>
                <input
                  type="date"
                  value={markPaidDate}
                  onChange={e => setMarkPaidDate(e.target.value)}
                  className={markPaidFieldCls}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setMarkPaidState(null)}
                className="flex-1 py-3 rounded-2xl border border-[rgba(26,26,10,0.10)] dark:border-white/[0.10] text-[13px] font-bold text-[rgba(26,26,10,0.55)] dark:text-white/45 active:scale-[0.97] transition-transform"
              >
                Cancelar
              </button>
              <button
                onClick={confirmMarkPaid}
                disabled={markPaidSubmitting}
                className="flex-1 py-3 rounded-2xl bg-[#059669] text-white text-[13px] font-black active:scale-[0.97] transition-transform disabled:opacity-60"
              >
                {markPaidSubmitting ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

    {/* Confirmação de desmarcar como paga */}
    <AnimatePresence>
      {unmarkPaidState && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm"
            onClick={() => setUnmarkPaidState(null)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-[151] flex items-center justify-center p-6 pointer-events-none"
          >
            <div className="pointer-events-auto bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-2xl p-5 w-full max-w-sm shadow-2xl">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                  <AlertTriangle size={17} />
                </div>
                <h3 className="text-base font-black text-[#1A1A0E] dark:text-[#F2F0E3]">Desmarcar como paga?</h3>
              </div>
              <p className="text-sm text-[rgba(26,26,10,0.55)] dark:text-white/45 mb-5">
                {unmarkPaidState.tx.data_pagamento
                  ? `A data de pagamento registrada (${new Date(unmarkPaidState.tx.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}) será apagada. A conta vinculada é mantida.`
                  : 'Esta movimentação voltará a aparecer como pendente.'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setUnmarkPaidState(null)}
                  className="flex-1 py-2.5 rounded-xl border border-[rgba(26,26,10,0.10)] dark:border-white/[0.10] text-sm font-bold text-[rgba(26,26,10,0.55)] dark:text-white/45 active:scale-[0.97] transition-transform"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmUnmarkPaid}
                  disabled={unmarkPaidSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-bold active:scale-[0.97] transition-transform disabled:opacity-60"
                >
                  {unmarkPaidSubmitting ? 'Salvando...' : 'Desmarcar'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

    {/* Confirmação de exclusão de movimentações selecionadas */}
    <AnimatePresence>
      {showDeleteSelectedConfirm && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm"
            onClick={() => setShowDeleteSelectedConfirm(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-[151] flex items-center justify-center p-6 pointer-events-none"
          >
            <div className="pointer-events-auto bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-2xl p-5 w-full max-w-sm shadow-2xl">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
                  <AlertTriangle size={17} />
                </div>
                <h3 className="text-base font-black text-[#1A1A0E] dark:text-[#F2F0E3]">
                  Excluir {selectedIds.size > 1 ? 'movimentações' : 'movimentação'}?
                </h3>
              </div>
              <p className="text-sm text-[rgba(26,26,10,0.55)] dark:text-white/45 mb-5">
                Esta ação não pode ser desfeita. {selectedIds.size > 1 ? 'As movimentações selecionadas serão excluídas' : 'A movimentação será excluída'} permanentemente.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteSelectedConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[rgba(26,26,10,0.10)] dark:border-white/[0.10] text-sm font-bold text-[rgba(26,26,10,0.55)] dark:text-white/45 active:scale-[0.97] transition-transform"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDeleteSelected}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-bold active:scale-[0.97] transition-transform"
                >
                  Excluir
                </button>
              </div>
            </div>
          </motion.div>
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
            tipoPagamento={parcelasModalOpen === 'new' ? txForm.tipo_pagamento : detailForm.tipo_pagamento}
            card={
              parcelasModalOpen === 'new'
                ? (txForm.tipo_pagamento === 'Crédito' ? cards.find(c => c.id === txForm.card_id) ?? null : null)
                : (detailForm.tipo_pagamento === 'Crédito' ? cards.find(c => c.id === detailForm.card_id) ?? null : null)
            }
            dataCompra={parcelasModalOpen === 'new' ? txForm.data : detailForm.data}
            // Só permite adicionar parcela na criação, numa linha avulsa (sem grupo), ou
            // depois de "Editar todas as parcelas" — nunca a partir de uma única parcela de
            // um grupo já existente, senão o "novo grupo" fica dessincronizado das irmãs.
            canAddParcela={
              parcelasModalOpen === 'new' ||
              !!editingGroupIds ||
              !detailTx ||
              (detailTx.total_parcelas ?? 1) <= 1
            }
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
                <div className="pt-1">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1.5 flex items-center gap-1.5">
                    <CreditCard size={11} /> Cartões desta conta
                    {accountCards(editingAccountId).length > 0 && (
                      <span className="bg-[rgba(26,26,10,0.10)] text-[rgba(26,26,10,0.55)] rounded-full px-[6px] py-[1px] text-[8px]">{accountCards(editingAccountId).length}</span>
                    )}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {accountCards(editingAccountId).map(card => (
                      <div key={card.id} className="bg-white dark:bg-[#252520] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] rounded-[14px] px-3 py-2.5 flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-[9px] bg-[rgba(216,30,30,0.09)] dark:bg-[rgba(216,30,30,0.14)] flex items-center justify-center text-[#D81E1E] shrink-0">
                          <CreditCard size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3] truncate">{card.nome}</p>
                          <p className="text-[9px] text-[rgba(26,26,10,0.42)] dark:text-white/35 truncate mt-0.5">
                            Fecha {card.dia_fechamento} · Vence {card.dia_vencimento}{card.limite != null ? ` · ${fmt(card.limite)}` : ''}
                          </p>
                        </div>
                        <span className="font-['DM_Mono',monospace] text-[9px] font-bold bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.08] text-[rgba(26,26,10,0.55)] dark:text-white/45 rounded-[6px] px-[6px] py-[3px] shrink-0">{card.codigo}</span>
                        <button onClick={() => openEditCard(card)} className="w-6 h-6 rounded-lg flex items-center justify-center text-[rgba(26,18,8,0.30)] dark:text-white/25 active:bg-primary/10 active:text-primary transition-colors shrink-0">
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => handleDeleteCard(card.id)} className="w-6 h-6 rounded-lg flex items-center justify-center text-[rgba(26,18,8,0.30)] dark:text-white/25 active:bg-rose-500/10 active:text-rose-500 transition-colors shrink-0">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {!cardFormOpen ? (
                    <button
                      onClick={openNewCard}
                      className="w-full mt-1.5 py-2.5 rounded-xl border-[1.5px] border-dashed border-[rgba(26,26,10,0.20)] dark:border-white/[0.18] text-[rgba(26,26,10,0.45)] dark:text-white/35 text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                    >
                      <Plus size={13} /> Novo Cartão
                    </button>
                  ) : (
                    <div className="mt-2 flex flex-col gap-2.5 border-t border-[rgba(26,26,10,0.08)] dark:border-white/[0.08] pt-3">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block">Nome do Cartão</span>
                        <input
                          type="text" value={cardForm.nome}
                          onChange={e => setCardForm(f => ({ ...f, nome: e.target.value }))}
                          placeholder="Ex: Nubank Roxinho"
                          className="w-full min-w-0 box-border bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]"
                        />
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block">Fechamento</span>
                          <input
                            type="text" inputMode="numeric" value={cardForm.dia_fechamento}
                            onChange={e => setCardForm(f => ({ ...f, dia_fechamento: e.target.value }))}
                            placeholder="Dia"
                            className="w-full min-w-0 box-border bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]"
                          />
                        </div>
                        <div className="flex-1">
                          <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block">Vencimento</span>
                          <input
                            type="text" inputMode="numeric" value={cardForm.dia_vencimento}
                            onChange={e => setCardForm(f => ({ ...f, dia_vencimento: e.target.value }))}
                            placeholder="Dia"
                            className="w-full min-w-0 box-border bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]"
                          />
                        </div>
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block">Limite (opcional)</span>
                        <input
                          type="text" inputMode="decimal" value={cardForm.limite}
                          onChange={e => setCardForm(f => ({ ...f, limite: e.target.value }))}
                          placeholder="0,00"
                          className="w-full min-w-0 box-border bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]"
                        />
                      </div>
                      {cardError && (
                        <div className="px-3 py-2 rounded-xl bg-rose-500/10 text-[11px] font-semibold text-rose-600">{cardError}</div>
                      )}
                      <div className="flex gap-2">
                        <button onClick={closeCardForm} className="flex-1 py-2.5 rounded-xl border-[1.5px] border-[rgba(26,26,10,0.12)] dark:border-white/[0.10] text-[11px] font-black uppercase text-[rgba(26,26,10,0.50)] dark:text-white/40">
                          Cancelar
                        </button>
                        <button
                          onClick={handleCardSubmit}
                          disabled={cardSubmitting}
                          className="flex-1 py-2.5 rounded-xl bg-[#D81E1E] text-white text-[11px] font-black uppercase tracking-wide shadow-[0_4px_14px_rgba(216,30,30,0.28)] active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {cardSubmitting && <Loader2 size={13} className="animate-spin" />}
                          {editingCardId ? 'Salvar' : 'Salvar Cartão'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

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

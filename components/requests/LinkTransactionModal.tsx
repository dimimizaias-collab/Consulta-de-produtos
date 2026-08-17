'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Search, Link2, Plus, Building2, Users,
  Loader2, Check, TrendingUp, TrendingDown, Upload, ImageIcon,
  ArrowLeft, Wallet, Calendar, Filter, CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { ReviewNote } from './LogisticsCenter';

const blockWheelChange = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

// ── Types ──────────────────────────────────────────────────────────────────

type PaymentType = 'Boleto' | 'Crédito' | 'Débito' | 'PIX' | 'Dinheiro' | 'Transferência' | 'Cheque' | 'Outro';
type TransactionType = 'Receita' | 'Despesa';
type CreateTab = 'transaction' | 'account' | 'favorecido';
type FilterColumnKey = 'data' | 'tipo' | 'favorecido' | 'tipo_pagamento';

interface Transaction {
  id: string;
  data: string;
  tipo: TransactionType;
  tipo_pagamento: PaymentType;
  favorecido: string;
  estabelecimento: string;
  vencimento: string | null;
  valor_final: number;
  total_pago: number;
  pago: boolean;
  account_id?: string | null;
  parcelamento_id?: string | null;
  numero_cheque?: string | null;
  identificacao?: string | null;
  codigo_barras?: string | null;
  numero_parcela?: number | null;
  total_parcelas?: number | null;
}

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

type TxForm = Omit<Transaction, 'id'> & { vencimento: string };

interface AccountForm {
  nome: string;
  banco: string;
  agencia: string;
  numero_conta: string;
  saldo_inicial: string;
  imagemPreview: string;
  imagemFile: File | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PAYMENT_TYPES: PaymentType[] = ['Boleto', 'Crédito', 'Débito', 'PIX', 'Dinheiro', 'Transferência', 'Cheque', 'Outro'];
const ESTABLISHMENTS = ['Castelo Real', 'Universo do R$1,99'];
const BUCKET = 'finance-images';

const FILTERABLE_COLUMNS: { key: FilterColumnKey; label: string }[] = [
  { key: 'data',            label: 'Data' },
  { key: 'tipo',            label: 'Tipo' },
  { key: 'favorecido',      label: 'Favorecido' },
  { key: 'tipo_pagamento',  label: 'Pagamento' },
];

const fmt     = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

const toIsoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const currentMonthBounds = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toIsoDay(start), end: toIsoDay(end) };
};

const emptyTxForm = (): TxForm => ({
  data:            new Date().toISOString().split('T')[0],
  tipo:            'Despesa',
  tipo_pagamento:  'PIX',
  favorecido:      '',
  estabelecimento: 'Castelo Real',
  vencimento:      '',
  valor_final:     0,
  total_pago:      0,
  pago:            false,
  account_id:      null,
  numero_cheque:   null,
  identificacao:   null,
  codigo_barras:   null,
});

const emptyAccountForm = (): AccountForm => ({
  nome: '', banco: '', agencia: '', numero_conta: '',
  saldo_inicial: '', imagemPreview: '', imagemFile: null,
});

const inputCls =
  'px-3 py-2.5 bg-surface-container rounded-xl text-sm text-on-surface border border-on-surface/5 focus:outline-none focus:border-primary/50 placeholder:text-on-surface/30 w-full';
const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-on-surface/40';

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  note: ReviewNote;
  isOpen: boolean;
  onClose: () => void;
  onLink: (transactionId: string | null) => void;
}

export function LinkTransactionModal({ note, isOpen, onClose, onLink }: Props) {
  // ── Data ─────────────────────────────────────────────────────────────────
  const [transactions,  setTransactions]  = useState<Transaction[]>([]);
  const [accounts,      setAccounts]      = useState<BankAccount[]>([]);
  const [favorecidos,   setFavorecidos]   = useState<Favorecido[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [linking,       setLinking]       = useState(false);
  const [linkError,     setLinkError]     = useState<string | null>(null);
  // Todas as movimentações já vinculadas a esta nota (junção N:N) — uma nota pode estar
  // vinculada a mais de uma movimentação diferente, então não dá pra confiar só no campo
  // legado finance_transaction_id (que guarda um único id, de cache).
  const [linkedTxIds,   setLinkedTxIds]   = useState<Set<string>>(new Set());

  // ── Search ────────────────────────────────────────────────────────────────
  const [search,              setSearch]              = useState('');
  const [showPlusDropdown,    setShowPlusDropdown]    = useState(false);

  // ── Período (padrão: mês atual) ──────────────────────────────────────────
  const [rangeStart,          setRangeStart]          = useState('');
  const [rangeEnd,             setRangeEnd]           = useState('');
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);

  // ── Filtro por coluna (mesmo padrão do Controle Financeiro) ──────────────
  const [columnFiltersEnabled,   setColumnFiltersEnabled]   = useState(false);
  const [columnFilters,          setColumnFilters]          = useState<Record<string, Set<string>>>({});
  const [filterOpenKey,          setFilterOpenKey]          = useState<FilterColumnKey | null>(null);
  const [filterPendingSelection, setFilterPendingSelection] = useState<Set<string> | null>(null);
  const [filterSearchQuery,      setFilterSearchQuery]      = useState('');

  // ── Mode ──────────────────────────────────────────────────────────────────
  const [mode,      setMode]      = useState<'search' | 'create'>('search');
  const [createTab, setCreateTab] = useState<CreateTab>('transaction');

  // ── Transaction form ──────────────────────────────────────────────────────
  const [txForm,            setTxForm]            = useState<TxForm>(emptyTxForm());
  const [txSubmitting,      setTxSubmitting]      = useState(false);
  const [parcelasEnabled,   setParcelasEnabled]   = useState(false);
  const [parcelas,          setParcelas]          = useState<{ seq: number; data: string; valor: string; codigo_barras: string }[]>([]);

  // ── Account form ──────────────────────────────────────────────────────────
  const [accountForm,      setAccountForm]      = useState<AccountForm>(emptyAccountForm());
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [accountError,     setAccountError]     = useState<string | null>(null);

  // ── Favorecido form ───────────────────────────────────────────────────────
  const [novoFavorecido,      setNovoFavorecido]      = useState('');
  const [novoNomeBanco,       setNovoNomeBanco]       = useState('');
  const [favSubmitting,       setFavSubmitting]       = useState(false);

  const calendarRef = useRef<HTMLDivElement>(null);
  const plusRef     = useRef<HTMLDivElement>(null);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) { setMode('search'); setSearch(''); setLinkError(null); return; }
    const { start, end } = currentMonthBounds();
    setRangeStart(start);
    setRangeEnd(end);
    setColumnFilters({});
    setColumnFiltersEnabled(false);
    setFilterOpenKey(null);
    fetchAll();
    fetchLinkedTxIds();
  }, [isOpen]);

  const fetchLinkedTxIds = async () => {
    const { data } = await supabase.from('finance_transaction_notes').select('transaction_id').eq('note_id', note.id);
    setLinkedTxIds(new Set((data ?? []).map((r: any) => r.transaction_id as string)));
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node))
        setShowCalendarPopover(false);
      if (plusRef.current && !plusRef.current.contains(e.target as Node))
        setShowPlusDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchAll = async () => {
    setLoading(true);
    const [txRes, accRes, favRes] = await Promise.all([
      supabase.from('finance_transactions').select('*').order('data', { ascending: false }),
      supabase.from('finance_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('finance_favorecidos').select('*').order('nome_fiscal'),
    ]);
    if (txRes.data)  setTransactions(txRes.data as Transaction[]);
    if (accRes.data) setAccounts(accRes.data as BankAccount[]);
    if (favRes.data) setFavorecidos(favRes.data as Favorecido[]);
    setLoading(false);
  };

  // ── Filtered transactions ─────────────────────────────────────────────────
  const getColumnValue = (t: Transaction, key: FilterColumnKey): string => {
    switch (key) {
      case 'data':           return fmtDate(t.data);
      case 'tipo':            return t.tipo;
      case 'favorecido':      return t.favorecido;
      case 'tipo_pagamento':  return t.tipo_pagamento;
    }
  };

  // Testa se a movimentação passa pelo período selecionado + busca + filtros de coluna,
  // opcionalmente ignorando o filtro de uma coluna específica — assim as opções do dropdown
  // de uma coluna refletem o que a tabela já está mostrando nas demais colunas.
  const passesBaseFilters = (t: Transaction, excludeKey?: FilterColumnKey): boolean => {
    if (rangeStart && t.data < rangeStart) return false;
    if (rangeEnd && t.data > rangeEnd) return false;
    for (const [key, selected] of Object.entries(columnFilters)) {
      if (key === excludeKey || selected.size === 0) continue;
      if (!selected.has(getColumnValue(t, key as FilterColumnKey))) return false;
    }
    if (search.trim() && !t.favorecido.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  };

  const getColumnUniqueValues = (key: FilterColumnKey): string[] => {
    const all = transactions.filter(t => passesBaseFilters(t, key)).map(t => getColumnValue(t, key));
    return Array.from(new Set(all)).sort();
  };

  const filtered = useMemo(
    () => transactions.filter(t => passesBaseFilters(t)),
    [transactions, search, rangeStart, rangeEnd, columnFilters],
  );

  // ── Link actions ──────────────────────────────────────────────────────────
  const handleLink = async (txId: string, txData?: { favorecido: string; valor_final: number }, allTxIds?: string[]) => {
    setLinking(true);
    setLinkError(null);
    // Use provided txData (auto-link path) or look up from loaded list
    const tx = txData ?? transactions.find(t => t.id === txId);
    // Se a movimentação faz parte de um parcelamento e o chamador não resolveu as parcelas
    // irmãs (caso da criação em lote, que já passa allTxIds), busca todas elas aqui — vincular
    // uma parcela pelo botão "Vincular" da tabela de notas deve vincular a nota a todas.
    let txIds = allTxIds && allTxIds.length > 0 ? allTxIds : [txId];
    if (!allTxIds || allTxIds.length === 0) {
      const fullTx = transactions.find(t => t.id === txId);
      if (fullTx?.parcelamento_id) {
        const siblingIds = transactions.filter(t => t.parcelamento_id === fullTx.parcelamento_id).map(t => t.id);
        if (siblingIds.length > 0) txIds = siblingIds;
      }
    }
    const { error } = await supabase.from('review_notes').update({
      finance_transaction_id: txId,
      finance_tx_favorecido:  tx?.favorecido  ?? null,
      finance_tx_valor:       tx?.valor_final ?? null,
    }).eq('id', note.id);
    if (!error) {
      // Junção N:N usada pelo Controle Financeiro (todas as parcelas, quando houver). Aditivo:
      // preserva vínculos com OUTRAS movimentações que a nota já tinha — uma nota pode estar
      // vinculada a mais de uma movimentação diferente ao mesmo tempo.
      await supabase.from('finance_transaction_notes').upsert(
        txIds.map(id => ({ transaction_id: id, note_id: note.id })),
        { onConflict: 'transaction_id,note_id' },
      );
      setLinkedTxIds(prev => new Set([...prev, ...txIds]));
    }
    setLinking(false);
    if (error) {
      setLinkError('Não foi possível vincular. Tente novamente.');
      return;
    }
    onLink(txId);
    onClose();
  };

  const handleUnlink = async () => {
    setLinking(true);
    setLinkError(null);
    const { error } = await supabase.from('review_notes').update({
      finance_transaction_id: null,
      finance_tx_favorecido:  null,
      finance_tx_valor:       null,
    }).eq('id', note.id);
    if (!error) {
      await supabase.from('finance_transaction_notes').delete().eq('note_id', note.id);
      setLinkedTxIds(new Set());
    }
    setLinking(false);
    if (error) {
      setLinkError('Não foi possível desvincular. Tente novamente.');
      return;
    }
    onLink(null);
    onClose();
  };

  // ── Create helpers ────────────────────────────────────────────────────────
  const openCreate = (tab: CreateTab) => {
    setCreateTab(tab);
    setMode('create');
    setShowPlusDropdown(false);
    if (tab === 'transaction') { setTxForm(emptyTxForm()); setParcelasEnabled(false); setParcelas([]); }
    if (tab === 'account')     { setAccountForm(emptyAccountForm()); setAccountError(null); }
    if (tab === 'favorecido')  { setNovoFavorecido(''); setNovoNomeBanco(''); }
  };

  const totalParcelas = parcelas.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);

  const handleTxSubmit = async () => {
    if (!txForm.favorecido.trim()) return;
    setTxSubmitting(true);
    try {
      const base = {
        tipo: txForm.tipo, tipo_pagamento: txForm.tipo_pagamento,
        favorecido: txForm.favorecido, estabelecimento: txForm.estabelecimento,
        numero_cheque: txForm.tipo_pagamento === 'Cheque' ? (txForm.numero_cheque || null) : null,
        identificacao: (txForm.tipo_pagamento !== 'Cheque' && txForm.tipo_pagamento !== 'Boleto') ? (txForm.identificacao?.trim() || null) : null,
        account_id: txForm.account_id ?? null,
      };
      if (parcelasEnabled) {
        const valid = parcelas.filter(p => p.data && parseFloat(p.valor) > 0);
        if (!valid.length) return;
        const rows = valid.length === 1
          // 1 parcela = pagamento único com data de vencimento, sem parcelamento
          ? [{
              ...base, data: txForm.data, vencimento: valid[0].data,
              valor_final: parseFloat(valid[0].valor) || 0,
              total_pago: 0, pago: false, import_id: null,
              numero_parcela: null as number | null, total_parcelas: null as number | null, parcelamento_id: null as string | null,
              codigo_barras: txForm.tipo_pagamento === 'Boleto' ? (valid[0].codigo_barras || null) : null,
            }]
          : (() => {
              const parcelamentoId = crypto.randomUUID();
              return valid.map(p => ({
                ...base, data: p.data, vencimento: p.data, valor_final: parseFloat(p.valor) || 0,
                total_pago: 0, pago: false, import_id: null,
                numero_parcela: p.seq, total_parcelas: valid.length, parcelamento_id: parcelamentoId,
                codigo_barras: txForm.tipo_pagamento === 'Boleto' ? (p.codigo_barras || null) : null,
              }));
            })();
        const { data } = await supabase.from('finance_transactions').insert(rows).select();
        if (data) {
          const inserted = data as Transaction[];
          setTransactions(prev => [...inserted, ...prev]);
          // Auto-link to first installment; pass txData to avoid stale state issue
          await handleLink(
            inserted[0].id,
            { favorecido: inserted[0].favorecido, valor_final: inserted[0].valor_final },
            inserted.map(t => t.id),
          );
          return; // handleLink closes modal on success
        }
      } else {
        if (txForm.valor_final <= 0) return;
        const payload = {
          ...base, data: txForm.data, vencimento: null,
          valor_final: txForm.valor_final, total_pago: 0, pago: false,
          numero_parcela: null, total_parcelas: null, parcelamento_id: null,
          codigo_barras: txForm.tipo_pagamento === 'Boleto' ? (txForm.codigo_barras || null) : null,
        };
        const { data } = await supabase.from('finance_transactions').insert(payload).select().single();
        if (data) {
          const tx = data as Transaction;
          setTransactions(prev => [tx, ...prev]);
          // Auto-link; pass txData to avoid stale state issue
          await handleLink(tx.id, { favorecido: tx.favorecido, valor_final: tx.valor_final });
          return; // handleLink closes modal on success
        }
      }
      setMode('search');
    } finally {
      setTxSubmitting(false);
    }
  };

  const uploadImage = async (file: File): Promise<string> => {
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `accounts/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file);
    if (error) throw error;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const handleAccountSubmit = async () => {
    if (!accountForm.nome.trim()) return;
    setAccountSubmitting(true);
    setAccountError(null);
    try {
      let imagem_url = '';
      if (accountForm.imagemFile) imagem_url = await uploadImage(accountForm.imagemFile);
      const saldo_inicial = parseFloat(accountForm.saldo_inicial.replace(',', '.')) || 0;
      const { data } = await supabase.from('finance_accounts').insert({
        nome: accountForm.nome, banco: accountForm.banco,
        agencia: accountForm.agencia, numero_conta: accountForm.numero_conta,
        imagem_url, saldo_inicial,
      }).select().single();
      if (data) setAccounts(prev => [data as BankAccount, ...prev]);
      setAccountForm(emptyAccountForm());
      setMode('search');
    } catch (err: any) {
      setAccountError(err?.message || 'Erro ao salvar conta. Verifique o bucket de storage no Supabase.');
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleAddFavorecido = async () => {
    if (!novoFavorecido.trim()) return;
    setFavSubmitting(true);
    const { data } = await supabase.from('finance_favorecidos')
      .insert([{ nome_fiscal: novoFavorecido.trim(), nome_banco: novoNomeBanco.trim() }])
      .select().single();
    if (data) setFavorecidos(prev => [...prev, data as Favorecido].sort((a, b) => a.nome_fiscal.localeCompare(b.nome_fiscal)));
    setNovoFavorecido('');
    setNovoNomeBanco('');
    setFavSubmitting(false);
    setMode('search');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-on-surface/60 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 20 }}
            transition={{ duration: 0.2 }}
            className="relative bg-surface-container-lowest rounded-[2rem] shadow-2xl ring-1 ring-on-surface/5 w-full max-w-5xl flex flex-col max-h-[92vh]"
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="px-6 py-5 border-b border-on-surface/[0.06] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Link2 size={20} />
                </div>
                <div>
                  <h2 className="text-base font-black text-on-surface leading-none">Vincular Nota</h2>
                  <p className="text-xs text-on-surface/40 font-medium mt-0.5">
                    {note.noteNumber ? `NF nº ${note.noteNumber}` : note.fileName}
                    {note.supplierName && ` · ${note.supplierName}`}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-on-surface/5 rounded-xl transition-colors">
                <X size={18} className="text-on-surface/40" />
              </button>
            </div>

            {/* ── Already linked banner ───────────────────────────────────── */}
            {linkedTxIds.size > 0 && mode === 'search' && (
              <div className="mx-6 mt-4 flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl shrink-0">
                <Link2 size={16} className="text-emerald-600 shrink-0" />
                <span className="text-xs font-bold text-emerald-700 flex-1">
                  {linkedTxIds.size === 1
                    ? 'Nota já vinculada a uma movimentação financeira.'
                    : `Nota já vinculada a ${linkedTxIds.size} movimentações financeiras.`}
                </span>
                <button
                  onClick={handleUnlink}
                  disabled={linking}
                  className="text-xs font-bold text-emerald-700 underline underline-offset-2 hover:text-emerald-900 transition-colors disabled:opacity-50 shrink-0"
                >
                  {linking ? <Loader2 size={12} className="animate-spin" /> : (linkedTxIds.size === 1 ? 'Desvincular' : 'Desvincular todas')}
                </button>
              </div>
            )}

            {/* ── SEARCH MODE ────────────────────────────────────────────── */}
            {mode === 'search' && (
              <>
                {/* Search + calendar + filter columns + plus */}
                <div className="px-6 pt-4 pb-3 flex items-center gap-2 shrink-0">
                  {/* Search */}
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/30 pointer-events-none" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar favorecido..."
                      className="w-full bg-surface-container border border-on-surface/[0.06] rounded-xl pl-9 pr-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-on-surface placeholder:text-on-surface/30"
                      autoFocus
                    />
                  </div>

                  {/* Calendar (período) */}
                  <div className="relative" ref={calendarRef}>
                    <button
                      onClick={() => setShowCalendarPopover(v => !v)}
                      title="Filtrar por período"
                      className={cn(
                        'relative w-[42px] h-[42px] rounded-xl flex items-center justify-center transition-colors shrink-0',
                        showCalendarPopover || (rangeStart && rangeEnd)
                          ? 'bg-primary text-white shadow-lg shadow-primary/20'
                          : 'bg-surface-container border border-on-surface/[0.06] text-on-surface/60 hover:bg-on-surface/5'
                      )}
                    >
                      <Calendar size={17} />
                      {rangeStart && rangeEnd && !showCalendarPopover && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-surface-container-lowest" />
                      )}
                    </button>
                    <AnimatePresence>
                      {showCalendarPopover && (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.97 }}
                          transition={{ duration: 0.12 }}
                          className="absolute left-0 top-full mt-1.5 w-64 bg-surface-container-lowest border border-on-surface/[0.06] rounded-2xl shadow-xl z-20 p-3.5"
                        >
                          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface/40 mb-2.5">Período</p>
                          <div className="flex gap-1.5 mb-3 flex-wrap">
                            <button
                              onClick={() => { const { start, end } = currentMonthBounds(); setRangeStart(start); setRangeEnd(end); }}
                              className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
                            >
                              Este mês
                            </button>
                            <button
                              onClick={() => {
                                const now = new Date();
                                const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                                const end = new Date(now.getFullYear(), now.getMonth(), 0);
                                setRangeStart(toIsoDay(start)); setRangeEnd(toIsoDay(end));
                              }}
                              className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-on-surface/5 text-on-surface/50 hover:bg-on-surface/10 transition-colors"
                            >
                              Mês anterior
                            </button>
                            <button
                              onClick={() => { setRangeStart(''); setRangeEnd(''); }}
                              className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-on-surface/5 text-on-surface/50 hover:bg-on-surface/10 transition-colors"
                            >
                              Tudo
                            </button>
                          </div>
                          <div className="flex flex-col gap-1.5 mb-2.5">
                            <label className={labelCls}>De</label>
                            <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className={inputCls} />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className={labelCls}>Até</label>
                            <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className={inputCls} />
                          </div>
                          <div className="flex items-center justify-between mt-3">
                            <button
                              onClick={() => { setRangeStart(''); setRangeEnd(''); }}
                              className="text-xs font-bold text-on-surface/40 hover:text-on-surface/70 transition-colors"
                            >
                              Limpar
                            </button>
                            <button
                              onClick={() => setShowCalendarPopover(false)}
                              className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
                            >
                              Aplicar
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Filtrar colunas */}
                  <button
                    onClick={() => {
                      const next = !columnFiltersEnabled;
                      setColumnFiltersEnabled(next);
                      if (!next) { setColumnFilters({}); setFilterOpenKey(null); setFilterPendingSelection(null); setFilterSearchQuery(''); }
                    }}
                    title={columnFiltersEnabled ? 'Desativar filtro por coluna' : 'Filtrar colunas'}
                    className={cn(
                      'relative w-[42px] h-[42px] rounded-xl flex items-center justify-center transition-colors shrink-0',
                      columnFiltersEnabled
                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                        : 'bg-surface-container border border-on-surface/[0.06] text-on-surface/60 hover:bg-on-surface/5',
                      Object.values(columnFilters).some(s => s.size > 0) && !columnFiltersEnabled && 'ring-2 ring-primary/40',
                    )}
                  >
                    <Filter size={16} />
                  </button>

                  {/* Plus button */}
                  <div className="relative" ref={plusRef}>
                    <button
                      onClick={() => setShowPlusDropdown(v => !v)}
                      className="w-[42px] h-[42px] rounded-xl bg-primary text-white flex items-center justify-center hover:bg-on-surface transition-colors shadow-lg shadow-primary/20 shrink-0"
                      title="Criar novo registro"
                    >
                      <Plus size={18} />
                    </button>
                    <AnimatePresence>
                      {showPlusDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.97 }}
                          transition={{ duration: 0.12 }}
                          className="absolute right-0 top-full mt-1.5 w-52 bg-surface-container-lowest border border-on-surface/[0.06] rounded-2xl shadow-xl z-20 overflow-hidden"
                        >
                          <button onClick={() => openCreate('transaction')}
                            className="flex items-center gap-3 w-full px-4 py-3 text-sm font-semibold text-on-surface hover:bg-on-surface/5 transition-colors text-left">
                            <TrendingDown size={15} className="text-primary shrink-0" />
                            Nova movimentação
                          </button>
                          <div className="h-px bg-on-surface/5 mx-3" />
                          <button onClick={() => openCreate('account')}
                            className="flex items-center gap-3 w-full px-4 py-3 text-sm font-semibold text-on-surface hover:bg-on-surface/5 transition-colors text-left">
                            <Building2 size={15} className="text-primary shrink-0" />
                            Adicionar Contas
                          </button>
                          <div className="h-px bg-on-surface/5 mx-3" />
                          <button onClick={() => openCreate('favorecido')}
                            className="flex items-center gap-3 w-full px-4 py-3 text-sm font-semibold text-on-surface hover:bg-on-surface/5 transition-colors text-left">
                            <Users size={15} className="text-primary shrink-0" />
                            Adicionar Favorecido
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Error banner */}
                {linkError && (
                  <div className="mx-6 mb-2 flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-2xl shrink-0">
                    <span className="text-xs font-bold text-red-700 flex-1">{linkError}</span>
                    <button onClick={() => setLinkError(null)} className="text-red-500/60 hover:text-red-700 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Transactions table */}
                <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
                  {loading ? (
                    <div className="flex items-center justify-center py-16 gap-3 text-on-surface/30">
                      <Loader2 size={24} className="animate-spin" />
                      <span className="text-sm font-semibold">Carregando movimentações...</span>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-on-surface/25">
                      <Wallet size={40} className="mb-3" />
                      <p className="font-black text-sm uppercase tracking-wide">
                        {search ? 'Nenhuma movimentação encontrada' : 'Sem movimentações cadastradas'}
                      </p>
                      <p className="text-xs font-medium mt-1 text-on-surface/20">
                        {search ? 'Tente outro filtro ou crie uma nova movimentação' : 'Clique em "+" para criar uma movimentação'}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-surface-container-low/60 rounded-2xl border border-on-surface/[0.04] overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-[#FFE500] dark:bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800]">
                              {(['data', 'tipo', 'favorecido', 'tipo_pagamento', 'valor', ''] as const).map(colKey => {
                                const col = FILTERABLE_COLUMNS.find(c => c.key === colKey);
                                const label = col?.label ?? (colKey === 'valor' ? 'Valor' : '');
                                if (!col) {
                                  return (
                                    <th key={colKey || 'actions'} className="px-4 py-3 text-left whitespace-nowrap">
                                      <span className="inline-flex items-center bg-[rgba(26,26,10,0.05)] rounded-full px-[13px] py-[5px] text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] dark:text-[rgba(26,26,10,0.58)] whitespace-nowrap border-[1.5px] border-[rgba(26,26,10,0.10)]">
                                        {label}
                                      </span>
                                    </th>
                                  );
                                }
                                const key = col.key;
                                const hasFilter = (columnFilters[key]?.size ?? 0) > 0;
                                const isOpen = columnFiltersEnabled && filterOpenKey === key;
                                const uniqueVals = isOpen ? getColumnUniqueValues(key) : [];
                                const selected = isOpen ? (filterPendingSelection ?? new Set<string>()) : (columnFilters[key] ?? new Set<string>());
                                const searchLower = filterSearchQuery.toLowerCase();
                                const displayed = searchLower ? uniqueVals.filter(v => v.toLowerCase().includes(searchLower)) : uniqueVals;
                                const openFilter = () => {
                                  const current = columnFilters[key];
                                  setFilterPendingSelection(new Set(current && current.size > 0 ? current : getColumnUniqueValues(key)));
                                  setFilterOpenKey(key);
                                  setFilterSearchQuery('');
                                };
                                const closeFilter = () => {
                                  setFilterOpenKey(null);
                                  setFilterPendingSelection(null);
                                  setFilterSearchQuery('');
                                };
                                const confirmFilter = () => {
                                  setColumnFilters(prev => {
                                    const nxt = { ...prev };
                                    const sel = filterPendingSelection ?? new Set<string>();
                                    if (sel.size === 0) delete nxt[key]; else nxt[key] = sel;
                                    return nxt;
                                  });
                                  closeFilter();
                                };
                                return (
                                  <th key={key} className="px-4 py-3 text-left whitespace-nowrap relative">
                                    <span
                                      onClick={columnFiltersEnabled ? () => { isOpen ? closeFilter() : openFilter(); } : undefined}
                                      title={columnFiltersEnabled ? (hasFilter ? 'Filtro ativo' : 'Filtrar') : undefined}
                                      className={cn(
                                        'inline-flex items-center bg-[rgba(26,26,10,0.05)] rounded-full px-[13px] py-[5px] text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] dark:text-[rgba(26,26,10,0.58)] whitespace-nowrap border-[1.5px] transition-colors',
                                        columnFiltersEnabled
                                          ? cn('border-[#D81E1E]/45 cursor-pointer', hasFilter && 'text-[#D81E1E] dark:text-[#D81E1E]')
                                          : 'border-[rgba(26,26,10,0.10)]',
                                      )}
                                    >
                                      {label}
                                    </span>
                                    {isOpen && (<>
                                      <div className="fixed inset-0 z-[90]" onClick={closeFilter} />
                                      <div className="absolute left-0 top-full mt-1 z-[100] rounded-xl shadow-2xl border border-on-surface/10 bg-surface-container overflow-hidden normal-case" style={{ minWidth: '200px', maxWidth: '280px' }}>
                                        <div className="p-2 border-b border-on-surface/10">
                                          <input
                                            autoFocus
                                            type="text"
                                            value={filterSearchQuery}
                                            onChange={e => setFilterSearchQuery(e.target.value)}
                                            placeholder="Buscar valor..."
                                            onClick={e => e.stopPropagation()}
                                            className="w-full px-3 py-1.5 text-xs rounded-lg outline-none bg-on-surface/[0.05] text-on-surface placeholder-on-surface/30 border border-on-surface/[0.08] focus:border-primary/50"
                                          />
                                        </div>
                                        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-on-surface/10">
                                          <button
                                            onClick={e => { e.stopPropagation(); setFilterPendingSelection(new Set(uniqueVals)); }}
                                            className="text-[10px] font-bold text-on-surface/40 hover:text-on-surface/70 transition-colors"
                                          >
                                            Selecionar tudo
                                          </button>
                                          <span className="text-on-surface/15">·</span>
                                          <button
                                            onClick={e => { e.stopPropagation(); setFilterPendingSelection(new Set()); }}
                                            className="text-[10px] font-bold text-on-surface/40 hover:text-red-400 transition-colors"
                                          >
                                            Limpar
                                          </button>
                                        </div>
                                        <div className="overflow-y-auto" style={{ maxHeight: '220px' }}>
                                          {displayed.length === 0 ? (
                                            <div className="px-3 py-3 text-[11px] text-on-surface/30 text-center">Nenhum resultado</div>
                                          ) : displayed.map(val => {
                                            const checked = selected.has(val);
                                            return (
                                              <label key={val} className="flex items-center gap-2 px-3 py-1.5 hover:bg-on-surface/[0.04] cursor-pointer" onClick={e => e.stopPropagation()}>
                                                <input
                                                  type="checkbox"
                                                  checked={checked}
                                                  className="w-3 h-3 accent-primary"
                                                  onChange={() => {
                                                    setFilterPendingSelection(prev => {
                                                      const cur = new Set<string>(prev ?? []);
                                                      if (checked) cur.delete(val); else cur.add(val);
                                                      return cur;
                                                    });
                                                  }}
                                                />
                                                <span className="text-[11px] font-medium normal-case text-on-surface/70 truncate" title={val}>{val}</span>
                                              </label>
                                            );
                                          })}
                                        </div>
                                        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-on-surface/10">
                                          <button
                                            onClick={e => { e.stopPropagation(); closeFilter(); }}
                                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-on-surface/50 hover:bg-on-surface/[0.06] hover:text-on-surface/80 transition-colors"
                                          >
                                            Cancelar
                                          </button>
                                          <button
                                            onClick={e => { e.stopPropagation(); confirmFilter(); }}
                                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-primary text-on-primary hover:opacity-90 transition-opacity"
                                          >
                                            OK
                                          </button>
                                        </div>
                                      </div>
                                    </>)}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map(t => {
                              const isLinked = linkedTxIds.has(t.id);
                              return (
                                <tr
                                  key={t.id}
                                  className={cn(
                                    'border-b border-on-surface/[0.04] transition-colors last:border-0',
                                    isLinked ? 'bg-emerald-500/5' : 'hover:bg-on-surface/[0.02]'
                                  )}
                                >
                                  <td className="px-4 py-3 whitespace-nowrap text-on-surface/60 text-xs">{fmtDate(t.data)}</td>
                                  <td className="px-4 py-3">
                                    <span className={cn(
                                      'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide',
                                      t.tipo === 'Receita'
                                        ? 'bg-emerald-500/10 text-emerald-600'
                                        : 'bg-rose-500/10 text-rose-600'
                                    )}>
                                      {t.tipo}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 font-semibold text-on-surface max-w-[160px] truncate">{t.favorecido}</td>
                                  <td className="px-4 py-3 text-on-surface/50 text-xs">{t.tipo_pagamento}</td>
                                  <td className="px-4 py-3 whitespace-nowrap font-black text-on-surface text-xs">{fmt(t.valor_final)}</td>
                                  <td className="px-4 py-3">
                                    {isLinked ? (
                                      <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase tracking-wide">
                                        <Check size={12} />
                                        Vinculado
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => handleLink(t.id)}
                                        disabled={linking}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-[11px] font-black uppercase tracking-wider hover:bg-primary hover:text-white transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
                                      >
                                        {linking ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
                                        Vincular
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── CREATE MODE ────────────────────────────────────────────── */}
            {mode === 'create' && (
              <>
                {/* Tab bar */}
                <div className="px-6 pt-4 pb-0 shrink-0">
                  <div className="flex items-center gap-1 mb-4">
                    <button
                      onClick={() => setMode('search')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-on-surface/40 hover:bg-on-surface/5 hover:text-on-surface transition-all mr-2"
                    >
                      <ArrowLeft size={13} />
                      Voltar
                    </button>
                    {([
                      { tab: 'transaction' as CreateTab, label: 'Nova Movimentação', icon: TrendingDown },
                      { tab: 'account'     as CreateTab, label: 'Adicionar Conta',   icon: Building2 },
                      { tab: 'favorecido'  as CreateTab, label: 'Add. Favorecido',   icon: Users },
                    ]).map(({ tab, label, icon: Icon }) => (
                      <button
                        key={tab}
                        onClick={() => { setCreateTab(tab); if (tab === 'transaction') { setTxForm(emptyTxForm()); setParcelasEnabled(false); setParcelas([]); } if (tab === 'account') { setAccountForm(emptyAccountForm()); setAccountError(null); } if (tab === 'favorecido') { setNovoFavorecido(''); setNovoNomeBanco(''); } }}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all',
                          createTab === tab
                            ? 'bg-primary/10 text-primary'
                            : 'text-on-surface/40 hover:bg-on-surface/5 hover:text-on-surface'
                        )}
                      >
                        <Icon size={12} />
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="h-px bg-on-surface/[0.06]" />
                </div>

                {/* Form content */}
                <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">

                  {/* ── Nova Movimentação ─────────────────────────────────── */}
                  {createTab === 'transaction' && (() => {
                    const showIdentificacao = txForm.tipo_pagamento !== 'Cheque' && txForm.tipo_pagamento !== 'Boleto';
                    const sectionCls = 'bg-surface-container-low/60 border border-on-surface/[0.06] rounded-2xl p-4 space-y-3.5';
                    const sectionHeadCls = 'flex items-center gap-2';
                    const sectionTitleCls = 'text-[11px] font-black uppercase tracking-wide text-on-surface/70';
                    return (
                    <div className="space-y-4">
                      {/* Tipo tabs */}
                      <div className="flex gap-2">
                        {(['Receita', 'Despesa'] as TransactionType[]).map(tab => (
                          <button
                            key={tab}
                            onClick={() => { setTxForm(f => ({ ...f, tipo: tab })); setParcelasEnabled(false); setParcelas([]); }}
                            className={cn(
                              'flex-1 py-2 rounded-xl text-sm font-bold transition-all',
                              txForm.tipo === tab
                                ? tab === 'Receita'
                                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                  : 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                                : 'bg-on-surface/5 text-on-surface/50 hover:bg-on-surface/10'
                            )}
                          >{tab}</button>
                        ))}
                      </div>

                      {/* ── Identificação ─────────────────────────────────── */}
                      <div className={sectionCls}>
                        <div className={sectionHeadCls}>
                          <Users size={14} className="text-primary shrink-0" />
                          <span className={sectionTitleCls}>Identificação</span>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Data</label>
                          <input type="date" value={txForm.data} onChange={e => setTxForm(f => ({ ...f, data: e.target.value }))} className={inputCls} />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Favorecido</label>
                          <input list="link-fav-list" value={txForm.favorecido} onChange={e => setTxForm(f => ({ ...f, favorecido: e.target.value }))} placeholder="Nome do favorecido" className={inputCls} />
                          <datalist id="link-fav-list">
                            {favorecidos.map(f => <option key={f.id} value={f.nome_fiscal} />)}
                          </datalist>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Estabelecimento</label>
                          <select value={txForm.estabelecimento} onChange={e => setTxForm(f => ({ ...f, estabelecimento: e.target.value }))} className={inputCls}>
                            {ESTABLISHMENTS.map(e => <option key={e} value={e}>{e}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* ── Pagamento ─────────────────────────────────────── */}
                      <div className={sectionCls}>
                        <div className={sectionHeadCls}>
                          <CreditCard size={14} className="text-primary shrink-0" />
                          <span className={sectionTitleCls}>Pagamento</span>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Conta</label>
                          <select value={txForm.account_id ?? ''} onChange={e => setTxForm(f => ({ ...f, account_id: e.target.value || null }))} className={inputCls}>
                            <option value="">Selecione a conta...</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.nome} — {a.banco}</option>)}
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Tipo de Pagamento</label>
                          <select
                            value={txForm.tipo_pagamento}
                            onChange={e => setTxForm(f => ({ ...f, tipo_pagamento: e.target.value as PaymentType }))}
                            className={inputCls}
                          >
                            {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>

                          {/* Numeração do Cheque */}
                          {txForm.tipo_pagamento === 'Cheque' && (
                            <div className="flex flex-col gap-1.5 mt-2">
                              <label className={labelCls}>Numeração do Cheque</label>
                              <input
                                type="text"
                                value={txForm.numero_cheque ?? ''}
                                onChange={e => setTxForm(f => ({ ...f, numero_cheque: e.target.value || null }))}
                                placeholder="Ex: 000123"
                                className={inputCls}
                              />
                            </div>
                          )}
                        </div>

                        {/* Vencimento / Parcelas — 1 parcela = pagamento único com vencimento */}
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className={labelCls}>Vencimento / Parcelas</span>
                            <button
                              onClick={() => {
                                const next = !parcelasEnabled;
                                setParcelasEnabled(next);
                                if (next && !parcelas.length) setParcelas([{ seq: 1, data: txForm.data, valor: '', codigo_barras: '' }]);
                                else if (!next) setParcelas([]);
                              }}
                              className={cn('px-3 py-1.5 rounded-lg text-[11px] font-extrabold transition-all', parcelasEnabled ? 'bg-primary text-on-primary' : 'bg-on-surface/10 text-on-surface/60 hover:bg-on-surface/15')}
                            >
                              {parcelasEnabled ? 'Ativado' : 'Ativar'}
                            </button>
                          </div>

                          {parcelasEnabled && (
                            <div className="flex flex-col gap-2 bg-on-surface/[0.03] rounded-xl p-3">
                              <div className="grid grid-cols-3 gap-2">
                                {['Nº', 'Vencimento', 'Valor'].map(h => <span key={h} className={cn(labelCls, 'text-center')}>{h}</span>)}
                              </div>
                              {parcelas.map((p, idx) => (
                                <div key={idx} className="flex flex-col gap-2">
                                  <div className="grid grid-cols-3 gap-2 items-center">
                                    <div className={cn(inputCls, 'text-center text-on-surface/40 pointer-events-none select-none')}>{p.seq}</div>
                                    <input type="date" value={p.data} onChange={e => setParcelas(prev => prev.map((x, i) => i === idx ? { ...x, data: e.target.value } : x))} className={inputCls} />
                                    <input type="number" step="0.01" min="0" value={p.valor} onChange={e => setParcelas(prev => prev.map((x, i) => i === idx ? { ...x, valor: e.target.value } : x))} onWheel={blockWheelChange} placeholder="0,00" className={inputCls} />
                                  </div>
                                  {txForm.tipo_pagamento === 'Boleto' && (
                                    <input
                                      type="text"
                                      value={p.codigo_barras}
                                      onChange={e => setParcelas(prev => prev.map((x, i) => i === idx ? { ...x, codigo_barras: e.target.value } : x))}
                                      placeholder="Código de barras do boleto"
                                      className={inputCls}
                                    />
                                  )}
                                </div>
                              ))}
                              <div className="flex items-center justify-between pt-1">
                                <button onClick={() => setParcelas(prev => [...prev, { seq: prev.length + 1, data: txForm.data, valor: '', codigo_barras: '' }])} className="flex items-center gap-1.5 text-xs font-bold text-primary hover:opacity-70 transition-opacity">
                                  <Plus size={13} />Adicionar parcela
                                </button>
                                {parcelas.length > 1 && totalParcelas > 0 && (
                                  <span className="text-[11px] font-extrabold text-on-surface/50">
                                    {parcelas.length} parcelas · Total <span className="text-primary">{fmt(totalParcelas)}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Identificação — genérico para os tipos que não têm campo próprio */}
                        {showIdentificacao && (
                          <div className="flex flex-col gap-1.5">
                            <label className={labelCls}>Identificação</label>
                            <input
                              type="text"
                              value={txForm.identificacao ?? ''}
                              onChange={e => setTxForm(f => ({ ...f, identificacao: e.target.value || null }))}
                              placeholder="Ex: número, código ou referência"
                              className={inputCls}
                            />
                          </div>
                        )}

                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Valor (R$)</label>
                          {parcelasEnabled ? (
                            <div className={cn(inputCls, 'bg-on-surface/5 text-on-surface/60 select-none')}>
                              {totalParcelas > 0 ? fmt(totalParcelas) : 'Soma das parcelas'}
                            </div>
                          ) : (
                            <input type="number" step="0.01" min="0" value={txForm.valor_final || ''} onChange={e => setTxForm(f => ({ ...f, valor_final: parseFloat(e.target.value) || 0 }))} onWheel={blockWheelChange} placeholder="0,00" className={inputCls} />
                          )}
                        </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button onClick={() => setMode('search')} className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors">Cancelar</button>
                        <button onClick={handleTxSubmit} disabled={txSubmitting} className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                          {txSubmitting && <Loader2 size={14} className="animate-spin" />}
                          Adicionar
                        </button>
                      </div>
                    </div>
                    );
                  })()}

                  {/* ── Adicionar Conta ───────────────────────────────────── */}
                  {createTab === 'account' && (
                    <div className="space-y-4">
                      {accounts.length > 0 && (
                        <div>
                          <p className={cn(labelCls, 'mb-2')}>Contas cadastradas</p>
                          <div className="flex flex-col gap-1.5 mb-4">
                            {accounts.map(acc => (
                              <div key={acc.id} className="flex items-center gap-3 bg-surface-container rounded-xl px-3 py-2.5 border border-on-surface/5">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-on-surface truncate">{acc.nome}</p>
                                  <p className="text-xs text-on-surface/40">{acc.banco}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="h-px bg-on-surface/5 mb-4" />
                          <p className={cn(labelCls, 'mb-2')}>Nova conta</p>
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Imagem da Conta</label>
                        <label className="cursor-pointer group">
                          <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setAccountForm(prev => ({ ...prev, imagemFile: f, imagemPreview: URL.createObjectURL(f) })); }} />
                          {accountForm.imagemPreview ? (
                            <div className="relative w-full h-28 rounded-2xl overflow-hidden border border-on-surface/10">
                              <img src={accountForm.imagemPreview} alt="Preview" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Upload size={18} className="text-white" />
                              </div>
                            </div>
                          ) : (
                            <div className="w-full h-28 rounded-2xl border-2 border-dashed border-on-surface/10 flex flex-col items-center justify-center gap-2 text-on-surface/30 hover:border-primary/40 hover:text-primary/50 transition-colors">
                              <ImageIcon size={24} />
                              <span className="text-xs font-semibold">Clique para adicionar imagem</span>
                            </div>
                          )}
                        </label>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Nome da Conta</label>
                        <input type="text" value={accountForm.nome} onChange={e => setAccountForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Conta Corrente PF" className={inputCls} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Banco</label>
                        <input type="text" value={accountForm.banco} onChange={e => setAccountForm(f => ({ ...f, banco: e.target.value }))} placeholder="Ex: Banco do Brasil" className={inputCls} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Agência</label>
                          <input type="text" value={accountForm.agencia} onChange={e => setAccountForm(f => ({ ...f, agencia: e.target.value }))} placeholder="0000-0" className={inputCls} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Número da Conta</label>
                          <input type="text" value={accountForm.numero_conta} onChange={e => setAccountForm(f => ({ ...f, numero_conta: e.target.value }))} placeholder="00000-0" className={inputCls} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Saldo Inicial (Jan/2026)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-on-surface/40">R$</span>
                          <input type="number" step="0.01" min="0" value={accountForm.saldo_inicial} onChange={e => setAccountForm(f => ({ ...f, saldo_inicial: e.target.value }))} onWheel={blockWheelChange} placeholder="0,00" className={cn(inputCls, 'pl-9')} />
                        </div>
                      </div>

                      {accountError && (
                        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">{accountError}</div>
                      )}

                      <div className="flex gap-3 pt-2">
                        <button onClick={() => setMode('search')} className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors">Cancelar</button>
                        <button onClick={handleAccountSubmit} disabled={accountSubmitting} className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                          {accountSubmitting && <Loader2 size={14} className="animate-spin" />}
                          Cadastrar Conta
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Adicionar Favorecido ──────────────────────────────── */}
                  {createTab === 'favorecido' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <input type="text" value={novoNomeBanco} onChange={e => setNovoNomeBanco(e.target.value)} placeholder="Nome no extrato bancário..." className={inputCls} />
                        <input type="text" value={novoFavorecido} onChange={e => setNovoFavorecido(e.target.value)} onKeyUp={e => e.key === 'Enter' && handleAddFavorecido()} placeholder="Nome fiscal do favorecido..." className={inputCls} />
                        <p className="text-[10px] text-on-surface/30 font-medium px-1">Nome no extrato → Nome fiscal</p>
                      </div>

                      {favorecidos.length > 0 && (
                        <div>
                          <p className={cn(labelCls, 'mb-2')}>Favorecidos cadastrados</p>
                          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                            {favorecidos.map(f => (
                              <div key={f.id} className="flex items-center px-3 py-2 rounded-xl hover:bg-on-surface/[0.03] transition-colors">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-on-surface truncate">{f.nome_fiscal}</p>
                                  {f.nome_banco && <p className="text-[10px] text-on-surface/40 truncate">{f.nome_banco}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-3 pt-2">
                        <button onClick={() => setMode('search')} className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors">Cancelar</button>
                        <button onClick={handleAddFavorecido} disabled={favSubmitting || !novoFavorecido.trim()} className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                          {favSubmitting && <Loader2 size={14} className="animate-spin" />}
                          Adicionar Favorecido
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

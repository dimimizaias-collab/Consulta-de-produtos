'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Search, Link2, Plus, Building2, Users,
  Loader2, Check, TrendingUp, TrendingDown, Upload, ImageIcon,
  ArrowLeft, Wallet, Calendar, Filter, CreditCard, CheckSquare, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { ReviewNote } from './LogisticsCenter';
import { useFinanceEstablishments } from '@/hooks/useFinanceEstablishments';
import { useFinanceTags } from '@/hooks/useFinanceTags';
import { TagSelector } from '@/components/finance/TagSelector';

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

type TxForm = Omit<Transaction, 'id'> & { vencimento: string; tag_ids: string[]; observacoes: string | null };

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
  tag_ids:         [],
  observacoes:     null,
});

const emptyAccountForm = (): AccountForm => ({
  nome: '', banco: '', agencia: '', numero_conta: '',
  saldo_inicial: '', imagemPreview: '', imagemFile: null,
});

// Padrão quadrado (mesmo do modal de movimentação do Controle Financeiro).
const inputCls = 'h-[34px] px-2.5 bg-white dark:bg-[#1E1E18] text-[13px] font-semibold text-on-surface border border-[#E0D8BF] dark:border-white/[0.10] outline-none caret-[#D81E1E] hover:border-[#CFC4A2] dark:hover:border-white/[0.20] focus:!border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] placeholder:text-on-surface/25 placeholder:font-medium w-full transition-[border-color,box-shadow]';
const labelCls = 'text-[9px] font-black uppercase tracking-[0.1em] text-[#1A1A0E]/[0.58] dark:text-[#F2F0E3]/55 pl-px';
const noSpinnerCls = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';
const parcInputCls = 'h-[30px] px-2 bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10] font-mono text-[12.5px] text-on-surface outline-none caret-[#D81E1E] focus:!border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] transition-[border-color,box-shadow]';
const sectionCls = 'bg-[#F1EAD3] dark:bg-[#181814] border border-[#E0D8BF] dark:border-white/[0.10]';
const sectionHeadCls = 'h-7 flex items-center gap-2 px-2.5 bg-[#FFEC4D] border-b-[1.5px] border-[#8F7E10]';
const sectionTitleCls = 'text-[9px] font-black uppercase tracking-[0.1em] text-[rgba(26,26,10,0.55)]';
const sectionCountCls = 'ml-auto text-[10px] font-extrabold text-[rgba(26,26,10,0.55)]';
const closeBtnCls = 'w-[30px] h-[30px] flex items-center justify-center shrink-0 border border-black/[0.14] dark:border-white/[0.10] text-black/50 dark:text-white/40 hover:bg-[#D81E1E]/[0.09] hover:text-[#D81E1E] hover:border-[#D81E1E]/25 active:scale-[0.93] transition-all duration-[130ms]';
const squareBtnCls = 'w-[34px] h-[34px] flex items-center justify-center shrink-0 border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-on-surface/55 hover:text-on-surface hover:border-[#CFC4A2] dark:hover:border-white/[0.20] active:scale-[0.94] transition-all duration-[130ms]';
const squareBtnOnCls = '!bg-[#D81E1E] !border-[#D81E1E] !text-white';
const dashedBtnCls = 'shrink-0 w-[34px] h-[34px] flex items-center justify-center bg-white dark:bg-[#1E1E18] border border-dashed border-[#E0D8BF] dark:border-white/[0.10] text-on-surface/60 hover:bg-[#D81E1E]/10 hover:text-[#D81E1E] hover:border-[#D81E1E]/30 active:scale-[0.93] transition-all';
const popoverCls = 'absolute top-full mt-1 z-20 bg-white dark:bg-[#2E2E28] border border-[#E0D8BF] dark:border-white/[0.10] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.3)] origin-top';
const chipBtnCls = 'h-6 px-2 border border-[#E0D8BF] dark:border-white/[0.10] text-[10px] font-extrabold text-on-surface/60 hover:text-[#D81E1E] hover:border-[#D81E1E]/35 transition-colors';
const footerCls = 'px-3.5 py-2.5 bg-[#EFE7CD] dark:bg-[#181814] border-t border-[#DDD2B0] dark:border-white/[0.08] flex items-center gap-2 shrink-0';
const btnCls = 'h-9 px-[18px] flex items-center justify-center gap-2 border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-[12px] font-extrabold uppercase tracking-[0.04em] text-on-surface hover:bg-on-surface/[0.05] active:scale-[0.97] transition-all disabled:opacity-45 disabled:cursor-not-allowed';
const btnPrimaryCls = 'h-9 px-[18px] flex items-center justify-center gap-2 bg-[#D81E1E] hover:bg-[#B91818] text-white text-[12px] font-extrabold uppercase tracking-[0.04em] active:scale-[0.97] transition-all disabled:opacity-45 disabled:cursor-not-allowed';

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  note: ReviewNote;
  isOpen: boolean;
  onClose: () => void;
  onLink: (transactionId: string | null) => void;
}

export function LinkTransactionModal({ note, isOpen, onClose, onLink }: Props) {
  const { lojas: estabelecimentos } = useFinanceEstablishments();
  const { tags, createTag } = useFinanceTags();
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
  // "+" da busca abre direto a Nova Movimentação.
  const openCreate = () => {
    setCreateTab('transaction');
    setMode('create');
    setTxForm(emptyTxForm());
    setParcelasEnabled(false);
    setParcelas([]);
  };

  // Cadastro de conta/favorecido pelos botões "+" tracejados do formulário — preserva o que
  // já foi preenchido na movimentação e volta pra ela ao cadastrar.
  const openSub = (tab: Exclude<CreateTab, 'transaction'>) => {
    setCreateTab(tab);
    if (tab === 'account')    { setAccountForm(emptyAccountForm()); setAccountError(null); }
    if (tab === 'favorecido') { setNovoFavorecido(''); setNovoNomeBanco(''); }
  };

  const nextParcelaDate = (prev: typeof parcelas) => {
    const last = prev[prev.length - 1]?.data;
    if (!last) return txForm.data;
    const d = new Date(last + 'T00:00:00');
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  };
  const removeParcela = (idx: number) => setParcelas(prev => prev.filter((_, i) => i !== idx).map((x, i) => ({ ...x, seq: i + 1 })));

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
        tag_ids: txForm.tag_ids,
        observacoes: txForm.observacoes?.trim() || null,
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
      if (data) {
        setAccounts(prev => [data as BankAccount, ...prev]);
        setTxForm(f => ({ ...f, account_id: (data as BankAccount).id }));
      }
      setAccountForm(emptyAccountForm());
      setCreateTab('transaction');
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
    if (data) {
      setFavorecidos(prev => [...prev, data as Favorecido].sort((a, b) => a.nome_fiscal.localeCompare(b.nome_fiscal)));
      setTxForm(f => ({ ...f, favorecido: (data as Favorecido).nome_fiscal }));
    }
    setNovoFavorecido('');
    setNovoNomeBanco('');
    setFavSubmitting(false);
    setCreateTab('transaction');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const nfLabel = [note.noteNumber ? `NF nº ${note.noteNumber}` : note.fileName, note.supplierName].filter(Boolean).join(' · ');
  const periodLabel = rangeStart && rangeEnd ? `${fmtDate(rangeStart)} – ${fmtDate(rangeEnd)}` : 'todo o período';
  const footerTotal = parcelasEnabled ? totalParcelas : (txForm.valor_final || 0);
  const showIdentificacao = txForm.tipo_pagamento !== 'Cheque' && txForm.tipo_pagamento !== 'Boleto';
  const backToTx = () => setCreateTab('transaction');

  const titleBar = (icon: React.ReactNode, title: string, subtitle: string) => (
    <div className="h-12 pl-3.5 pr-3 flex items-center gap-[11px] bg-[#FBF35E] dark:bg-[#252520] border-b border-[#D9CF45] dark:border-white/[0.08] shrink-0">
      <div className="w-[30px] h-[30px] flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="truncate text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">{title}</h2>
        <p className="truncate text-[10.5px] font-bold text-[#1A1A0E]/50 dark:text-[#F2F0E3]/40">{subtitle}</p>
      </div>
      <button onClick={onClose} title="Fechar" className={closeBtnCls}>
        <X size={15} strokeWidth={2.6} />
      </button>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/55"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="relative w-full max-w-[1000px] max-h-[92vh] flex flex-col bg-[#FDFAF0] dark:bg-[#1E1E18] border border-black/[0.12] dark:border-white/[0.08] shadow-2xl"
          >
            {/* ── SEARCH MODE ────────────────────────────────────────────── */}
            {mode === 'search' && (
              <>
                {titleBar(<Link2 size={15} strokeWidth={2.3} />, 'Vincular Nota', nfLabel)}

                <div className="px-3.5 pt-3 flex flex-col gap-2.5 shrink-0">
                  {/* Already linked banner */}
                  {linkedTxIds.size > 0 && (
                    <div className="flex items-center gap-2 px-2.5 py-2 border border-[#0A7A55]/30 dark:border-[#34D399]/30 bg-[#0A7A55]/[0.07] dark:bg-[#34D399]/[0.07] text-[#0A7A55] dark:text-[#34D399]">
                      <Link2 size={14} className="shrink-0" />
                      <span className="flex-1 text-[11.5px] font-extrabold">
                        {linkedTxIds.size === 1
                          ? 'Nota já vinculada a uma movimentação financeira.'
                          : `Nota já vinculada a ${linkedTxIds.size} movimentações financeiras.`}
                      </span>
                      <button
                        onClick={handleUnlink}
                        disabled={linking}
                        className="text-[11px] font-extrabold underline underline-offset-2 hover:opacity-75 transition-opacity disabled:opacity-50 shrink-0"
                      >
                        {linking ? <Loader2 size={12} className="animate-spin" /> : (linkedTxIds.size === 1 ? 'Desvincular' : 'Desvincular todas')}
                      </button>
                    </div>
                  )}

                  {/* Search + calendar + filter columns + plus */}
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface/40 pointer-events-none" />
                      <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar favorecido..."
                        className={cn(inputCls, 'pl-8')}
                        autoFocus
                      />
                    </div>

                    {/* Calendar (período) */}
                    <div className="relative" ref={calendarRef}>
                      <button
                        onClick={() => setShowCalendarPopover(v => !v)}
                        title="Filtrar por período"
                        className={cn(squareBtnCls, (showCalendarPopover || (rangeStart && rangeEnd)) && squareBtnOnCls)}
                      >
                        <Calendar size={16} />
                      </button>
                      <AnimatePresence>
                        {showCalendarPopover && (
                          <motion.div
                            initial={{ opacity: 0, y: -4, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.97 }}
                            transition={{ duration: 0.12 }}
                            className={cn(popoverCls, 'right-0 w-64 p-2.5')}
                          >
                            <p className={cn(labelCls, 'mb-2')}>Período</p>
                            <div className="flex gap-1 mb-2.5 flex-wrap">
                              <button
                                onClick={() => { const { start, end } = currentMonthBounds(); setRangeStart(start); setRangeEnd(end); }}
                                className={chipBtnCls}
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
                                className={chipBtnCls}
                              >
                                Mês anterior
                              </button>
                              <button onClick={() => { setRangeStart(''); setRangeEnd(''); }} className={chipBtnCls}>
                                Tudo
                              </button>
                            </div>
                            <div className="flex flex-col gap-1 mb-2">
                              <label className={labelCls}>De</label>
                              <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className={inputCls} />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className={labelCls}>Até</label>
                              <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className={inputCls} />
                            </div>
                            <div className="flex items-center justify-between mt-2.5">
                              <button
                                onClick={() => { setRangeStart(''); setRangeEnd(''); }}
                                className="text-[11px] font-extrabold text-on-surface/45 hover:text-on-surface transition-colors"
                              >
                                Limpar
                              </button>
                              <button onClick={() => setShowCalendarPopover(false)} className={cn(btnPrimaryCls, 'h-8 px-3.5')}>
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
                        squareBtnCls,
                        columnFiltersEnabled && squareBtnOnCls,
                        Object.values(columnFilters).some(s => s.size > 0) && !columnFiltersEnabled && 'border-[#D81E1E]/60 text-[#D81E1E]',
                      )}
                    >
                      <Filter size={15} />
                    </button>

                    {/* Nova movimentação */}
                    <button
                      onClick={openCreate}
                      title="Nova movimentação"
                      className={cn(squareBtnCls, squareBtnOnCls, 'hover:bg-[#B91818] hover:border-[#B91818]')}
                    >
                      <Plus size={16} strokeWidth={2.6} />
                    </button>
                  </div>

                  {/* Error banner */}
                  {linkError && (
                    <div className="flex items-center gap-2 px-2.5 py-2 border border-[#D81E1E]/35 bg-[#D81E1E]/[0.06]">
                      <span className="text-[11.5px] font-bold text-[#B91818] dark:text-red-400 flex-1">{linkError}</span>
                      <button onClick={() => setLinkError(null)} className="text-[#D81E1E]/60 hover:text-[#D81E1E] transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Transactions table */}
                <div className="flex-1 overflow-y-auto px-3.5 pt-2.5 pb-3 min-h-0">
                  {loading ? (
                    <div className="flex items-center justify-center py-16 gap-3 text-on-surface/30">
                      <Loader2 size={24} className="animate-spin" />
                      <span className="text-sm font-semibold">Carregando movimentações...</span>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center gap-1.5 text-center py-12 px-4 border border-dashed border-[#E0D8BF] dark:border-white/[0.12] text-on-surface/45">
                      <Wallet size={22} className="opacity-55" />
                      <p className="text-[12px] font-black uppercase tracking-[0.06em]">
                        {search ? 'Nenhuma movimentação encontrada' : 'Sem movimentações no período'}
                      </p>
                      <p className="text-[11px] font-semibold">
                        {search ? 'Tente outro filtro ou crie uma nova movimentação' : 'Clique em "+" para criar uma movimentação'}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10]">
                      <div className="overflow-x-auto [&_tbody_td]:h-9 [&_tbody_td]:px-2.5 [&_tbody_td]:text-[12px] [&_tbody_td]:whitespace-nowrap [&_tbody_td]:border-r [&_tbody_td]:border-b [&_tbody_td]:border-[#A8A290] dark:[&_tbody_td]:border-white/20 [&_tbody_td:last-child]:border-r-0">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-[#FFEC4D]">
                              {(['data', 'tipo', 'favorecido', 'tipo_pagamento', 'valor', ''] as const).map(colKey => {
                                const col = FILTERABLE_COLUMNS.find(c => c.key === colKey);
                                const label = col?.label ?? (colKey === 'valor' ? 'Valor' : '');
                                const thCls = cn(
                                  'h-8 px-2.5 text-left whitespace-nowrap relative shadow-[inset_-1px_0_0_#B8A31F,inset_0_-1.5px_0_#8F7E10] last:shadow-[inset_0_-1.5px_0_#8F7E10]',
                                  colKey === 'valor' && 'text-right',
                                  colKey === '' && 'w-[118px]',
                                );
                                const headTextCls = 'inline-flex items-center text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] dark:text-[rgba(26,26,10,0.58)] whitespace-nowrap';
                                if (!col) {
                                  return (
                                    <th key={colKey || 'actions'} className={thCls}>
                                      <span className={headTextCls}>{label}</span>
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
                                  <th key={key} className={thCls}>
                                    <span
                                      onClick={columnFiltersEnabled ? () => { isOpen ? closeFilter() : openFilter(); } : undefined}
                                      title={columnFiltersEnabled ? (hasFilter ? 'Filtro ativo' : 'Filtrar') : undefined}
                                      className={cn(
                                        headTextCls,
                                        'transition-colors',
                                        columnFiltersEnabled && cn('cursor-pointer px-1.5 py-0.5 -mx-1.5 border border-dashed border-[#D81E1E]/45', hasFilter && 'text-[#D81E1E] dark:text-[#D81E1E] border-solid'),
                                      )}
                                    >
                                      {label}
                                    </span>
                                    {isOpen && (<>
                                      <div className="fixed inset-0 z-[90]" onClick={closeFilter} />
                                      <div className="absolute left-0 top-full mt-1 z-[100] min-w-[200px] max-w-[280px] bg-white dark:bg-[#2E2E28] border border-[#E0D8BF] dark:border-white/[0.10] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.3)] normal-case tracking-normal font-normal">
                                        <div className="p-2 border-b border-[#E0D8BF] dark:border-white/[0.10]">
                                          <input
                                            autoFocus
                                            type="text"
                                            value={filterSearchQuery}
                                            onChange={e => setFilterSearchQuery(e.target.value)}
                                            placeholder="Buscar valor..."
                                            onClick={e => e.stopPropagation()}
                                            className={cn(inputCls, 'h-[30px] text-[12px]')}
                                          />
                                        </div>
                                        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[#E0D8BF] dark:border-white/[0.10]">
                                          <button
                                            onClick={e => { e.stopPropagation(); setFilterPendingSelection(new Set(uniqueVals)); }}
                                            className="text-[10px] font-bold text-on-surface/45 hover:text-on-surface transition-colors"
                                          >
                                            Selecionar tudo
                                          </button>
                                          <span className="text-on-surface/15">·</span>
                                          <button
                                            onClick={e => { e.stopPropagation(); setFilterPendingSelection(new Set()); }}
                                            className="text-[10px] font-bold text-on-surface/45 hover:text-[#D81E1E] transition-colors"
                                          >
                                            Limpar
                                          </button>
                                        </div>
                                        <div className="overflow-y-auto max-h-[220px]">
                                          {displayed.length === 0 ? (
                                            <div className="px-3 py-3 text-[11px] text-on-surface/35 text-center">Nenhum resultado</div>
                                          ) : displayed.map(val => {
                                            const checked = selected.has(val);
                                            return (
                                              <label key={val} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.08] cursor-pointer" onClick={e => e.stopPropagation()}>
                                                <input
                                                  type="checkbox"
                                                  checked={checked}
                                                  className="w-3 h-3 accent-[#D81E1E]"
                                                  onChange={() => {
                                                    setFilterPendingSelection(prev => {
                                                      const cur = new Set<string>(prev ?? []);
                                                      if (checked) cur.delete(val); else cur.add(val);
                                                      return cur;
                                                    });
                                                  }}
                                                />
                                                <span className="text-[11.5px] font-medium text-on-surface/75 truncate" title={val}>{val}</span>
                                              </label>
                                            );
                                          })}
                                        </div>
                                        <div className="flex items-center justify-end gap-1.5 px-2.5 py-2 border-t border-[#E0D8BF] dark:border-white/[0.10]">
                                          <button onClick={e => { e.stopPropagation(); closeFilter(); }} className={cn(btnCls, 'h-7 px-3 text-[10.5px]')}>
                                            Cancelar
                                          </button>
                                          <button onClick={e => { e.stopPropagation(); confirmFilter(); }} className={cn(btnPrimaryCls, 'h-7 px-3 text-[10.5px]')}>
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
                            {filtered.map((t, rowIdx) => {
                              const isLinked = linkedTxIds.has(t.id);
                              const parcLabel = t.total_parcelas && t.total_parcelas > 1
                                ? `${t.numero_parcela ?? 1}/${t.total_parcelas}`
                                : t.vencimento ? '1/1' : null;
                              return (
                                <tr
                                  key={t.id}
                                  className={cn(
                                    'transition-colors',
                                    isLinked
                                      ? 'bg-[#0A7A55]/[0.07] dark:bg-[#34D399]/[0.07]'
                                      : cn(rowIdx % 2 === 0 ? 'bg-white dark:bg-[#252520]' : 'bg-[#FAF7EE] dark:bg-[#1E1E18]', 'hover:bg-[#FFF8D0] dark:hover:bg-white/[0.04]'),
                                  )}
                                >
                                  <td className="font-mono text-on-surface/55">{fmtDate(t.data)}</td>
                                  <td>
                                    <span className={cn(
                                      'inline-flex items-center px-1.5 py-0.5 border text-[9px] font-black uppercase tracking-[0.06em]',
                                      t.tipo === 'Receita'
                                        ? 'text-[#0A7A55] dark:text-[#34D399] border-current bg-[#0A7A55]/[0.07] dark:bg-[#34D399]/[0.07]'
                                        : 'text-[#B91818] dark:text-red-400 border-current bg-[#D81E1E]/[0.06]',
                                    )}>
                                      {t.tipo}
                                    </span>
                                  </td>
                                  <td className="font-extrabold text-on-surface max-w-[260px] truncate" title={t.favorecido}>{t.favorecido}</td>
                                  <td>
                                    <span className="inline-flex items-center gap-1">
                                      <span className="inline-flex px-1.5 py-0.5 border border-[#E0D8BF] dark:border-white/[0.12] text-[10px] font-bold text-on-surface/70">
                                        {t.tipo_pagamento}
                                      </span>
                                      {parcLabel ? (
                                        <span title="Parcela" className="inline-flex px-1.5 py-0.5 border border-[#D81E1E]/35 bg-[#D81E1E]/[0.06] font-mono text-[10px] font-medium text-[#D81E1E]">
                                          {parcLabel}
                                        </span>
                                      ) : (
                                        <span className="inline-flex px-1.5 py-0.5 border border-[#E0D8BF] dark:border-white/[0.12] text-[10px] font-bold text-on-surface/40">
                                          À vista
                                        </span>
                                      )}
                                    </span>
                                  </td>
                                  <td className="text-right font-mono font-bold text-on-surface">{fmt(t.valor_final)}</td>
                                  <td>
                                    {isLinked ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.06em] text-[#0A7A55] dark:text-[#34D399]">
                                        <Check size={12} strokeWidth={3} />
                                        Vinculado
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => handleLink(t.id)}
                                        disabled={linking}
                                        className="h-[26px] inline-flex items-center gap-1.5 px-2.5 border border-[#D81E1E]/30 bg-[#D81E1E]/[0.06] text-[#D81E1E] text-[10px] font-black uppercase tracking-[0.06em] hover:bg-[#D81E1E] hover:text-white hover:border-[#D81E1E] transition-colors active:scale-[0.96] disabled:opacity-50"
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

                <div className={footerCls}>
                  <span className="text-[11px] font-bold text-on-surface/55">
                    {filtered.length} movimentaç{filtered.length === 1 ? 'ão' : 'ões'} · {periodLabel}
                  </span>
                  <button onClick={onClose} className={cn(btnCls, 'ml-auto')}>Fechar</button>
                </div>
              </>
            )}

            {/* ── NOVA MOVIMENTAÇÃO — mesmo molde do Controle Financeiro ───── */}
            {mode === 'create' && createTab === 'transaction' && (
              <>
                {titleBar(<Wallet size={15} strokeWidth={2.3} />, 'Nova Movimentação', `Será vinculada à ${nfLabel}`)}

                {/* Receita / Despesa */}
                <div className="px-3.5 py-2.5 flex items-center gap-3 shrink-0 bg-[#EFE7CD] dark:bg-[#181814] border-b border-[#DDD2B0] dark:border-white/[0.08]">
                  <div className="w-[320px] flex gap-0.5 p-0.5 bg-on-surface/[0.06] border border-[#E0D8BF] dark:border-white/[0.10]">
                    {(['Receita', 'Despesa'] as TransactionType[]).map(tab => (
                      <button
                        key={tab}
                        onClick={() => { setTxForm(f => ({ ...f, tipo: tab })); setParcelasEnabled(false); setParcelas([]); }}
                        className={cn(
                          'flex-1 h-[30px] flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-[0.08em] transition-colors',
                          txForm.tipo === tab
                            ? tab === 'Receita' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                            : 'text-on-surface/45 hover:text-on-surface'
                        )}
                      >
                        {tab === 'Receita' ? <TrendingUp size={12} strokeWidth={2.6} /> : <TrendingDown size={12} strokeWidth={2.6} />}
                        {tab}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10.5px] font-bold text-[#1A1A0E]/[0.58] dark:text-[#F2F0E3]/55">Escolha o tipo da movimentação</span>
                </div>

                <div className="flex-1 min-h-0 px-3.5 py-3 grid grid-cols-1 gap-2.5 overflow-y-auto content-start">
                  {/* Identificação */}
                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <Users size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                      <span className={sectionTitleCls}>Identificação</span>
                    </div>
                    <div className="p-2.5 grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-2.5">
                      <div className="flex flex-col gap-1">
                        <label className={labelCls}>Data</label>
                        <input type="date" value={txForm.data} onChange={e => setTxForm(f => ({ ...f, data: e.target.value }))} className={inputCls} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={labelCls}>Favorecido</label>
                        <div className="flex gap-2">
                          <input list="link-fav-list" value={txForm.favorecido} onChange={e => setTxForm(f => ({ ...f, favorecido: e.target.value }))} placeholder="Nome do favorecido" className={inputCls} />
                          <datalist id="link-fav-list">
                            {favorecidos.map(f => <option key={f.id} value={f.nome_fiscal} />)}
                          </datalist>
                          <button type="button" onClick={() => openSub('favorecido')} title="Cadastrar favorecido" className={dashedBtnCls}>
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pagamento */}
                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <CreditCard size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                      <span className={sectionTitleCls}>Pagamento</span>
                    </div>
                    <div className="p-2.5 grid grid-cols-1 md:grid-cols-4 gap-2.5">
                      <div className="flex flex-col gap-1 min-w-0">
                        <label className={labelCls}>Conta</label>
                        <div className="flex gap-2">
                          <select value={txForm.account_id ?? ''} onChange={e => setTxForm(f => ({ ...f, account_id: e.target.value || null }))} className={cn(inputCls, 'flex-1 min-w-0')}>
                            <option value="">Selecione a conta...</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.nome} — {a.banco}</option>)}
                          </select>
                          <button type="button" onClick={() => openSub('account')} title="Cadastrar conta" className={dashedBtnCls}>
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 min-w-0">
                        <label className={labelCls}>Tipo de Pagamento</label>
                        <select
                          value={txForm.tipo_pagamento}
                          onChange={e => setTxForm(f => ({ ...f, tipo_pagamento: e.target.value as PaymentType }))}
                          className={inputCls}
                        >
                          {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        {txForm.tipo_pagamento === 'Cheque' && (
                          <div className="flex flex-col gap-1 mt-1.5">
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

                      {showIdentificacao && (
                        <div className="flex flex-col gap-1 min-w-0">
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

                      <div className="flex flex-col gap-1 min-w-0">
                        <label className={labelCls}>Valor (R$)</label>
                        {parcelasEnabled ? (
                          <div className={cn(inputCls, 'flex items-center justify-end font-mono bg-black/[0.035] dark:bg-white/[0.03] text-on-surface/70 select-none')}>
                            {totalParcelas > 0 ? fmt(totalParcelas) : 'Soma das parcelas'}
                          </div>
                        ) : (
                          <input type="number" step="0.01" min="0" value={txForm.valor_final || ''} onChange={e => setTxForm(f => ({ ...f, valor_final: parseFloat(e.target.value) || 0 }))} onWheel={blockWheelChange} placeholder="0,00" className={cn(inputCls, noSpinnerCls)} />
                        )}
                      </div>

                      {/* Vencimento / Parcelas — 3 por linha, igual ao Controle Financeiro */}
                      <div className="col-span-full border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
                        <div className={cn('h-8 flex items-center gap-2 pl-2.5 pr-1.5', parcelasEnabled && 'border-b border-[#E0D8BF] dark:border-white/[0.10]')}>
                          <span className={labelCls}>Vencimento / Parcelas</span>
                          <span className="text-[11px] font-bold text-on-surface/45">
                            {!parcelasEnabled || parcelas.length === 0
                              ? 'Sem vencimento'
                              : parcelas.length === 1
                                ? <>Vencimento <b className="font-black text-on-surface">{fmtDate(parcelas[0].data || null)}</b></>
                                : <b className="font-black text-on-surface">{parcelas.length} parcelas</b>}
                          </span>
                          <button
                            onClick={() => {
                              const next = !parcelasEnabled;
                              setParcelasEnabled(next);
                              if (next && parcelas.length === 0)
                                setParcelas([{ seq: 1, data: txForm.data, valor: txForm.valor_final ? String(txForm.valor_final) : '', codigo_barras: txForm.codigo_barras ?? '' }]);
                              else if (!next) setParcelas([]);
                            }}
                            className={cn(
                              'ml-auto h-6 flex items-center gap-1.5 px-2.5 border text-[10px] font-black uppercase tracking-[0.08em] transition-colors',
                              parcelasEnabled
                                ? 'bg-[#D81E1E] border-[#D81E1E] text-white'
                                : 'bg-on-surface/[0.06] border-[#E0D8BF] dark:border-white/[0.10] text-on-surface hover:bg-on-surface/[0.1]'
                            )}
                          >
                            <span className={cn('relative w-[22px] h-3 rounded-full transition-colors', parcelasEnabled ? 'bg-white/35' : 'bg-on-surface/20')}>
                              <span className={cn('absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-white transition-transform', parcelasEnabled && 'translate-x-2.5')} />
                            </span>
                            {parcelasEnabled ? 'Ativado' : 'Ativar'}
                          </button>
                        </div>

                        {parcelasEnabled && (<>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[#A8A290] dark:bg-white/20 border-b border-[#A8A290] dark:border-white/20">
                            {parcelas.map((p, idx) => (
                              <div key={idx} className="group/parc flex items-center gap-1.5 px-1.5 py-[5px] bg-white dark:bg-[#1E1E18] min-w-0">
                                <span className="w-[22px] shrink-0 text-center text-[10px] font-black text-on-surface/40">{p.seq}</span>
                                <input
                                  type="date"
                                  value={p.data}
                                  onChange={e => setParcelas(prev => prev.map((x, i) => i === idx ? { ...x, data: e.target.value } : x))}
                                  className={cn(parcInputCls, 'w-[122px] shrink-0')}
                                />
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={p.valor}
                                  onChange={e => setParcelas(prev => prev.map((x, i) => i === idx ? { ...x, valor: e.target.value } : x))}
                                  onWheel={blockWheelChange}
                                  placeholder="0,00"
                                  className={cn(parcInputCls, noSpinnerCls, 'flex-1 min-w-0 text-right')}
                                />
                                {parcelas.length > 1 && (
                                  <button
                                    onClick={() => removeParcela(idx)}
                                    title="Remover parcela"
                                    className="w-6 h-6 shrink-0 invisible group-hover/parc:visible border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] flex items-center justify-center text-on-surface/40 hover:bg-[#D81E1E] hover:text-white hover:border-[#D81E1E] transition-colors"
                                  >
                                    <X size={11} strokeWidth={2.8} />
                                  </button>
                                )}
                              </div>
                            ))}
                            {Array.from({ length: (3 - (parcelas.length % 3)) % 3 }).map((_, i) => (
                              <span key={`fill-${i}`} className="hidden sm:block bg-white dark:bg-[#1E1E18]" />
                            ))}
                          </div>

                          {/* Boleto: código de barras de cada parcela */}
                          {txForm.tipo_pagamento === 'Boleto' && (
                            <div className="px-2.5 pt-2 flex flex-col gap-1.5">
                              <span className={labelCls}>Código de barras do boleto</span>
                              {parcelas.map((p, idx) => (
                                <div key={idx} className="flex items-center gap-1.5">
                                  <span className="w-[22px] shrink-0 text-center text-[10px] font-black text-on-surface/40">{p.seq}</span>
                                  <input
                                    type="text"
                                    value={p.codigo_barras}
                                    onChange={e => setParcelas(prev => prev.map((x, i) => i === idx ? { ...x, codigo_barras: e.target.value } : x))}
                                    placeholder="Código de barras do boleto"
                                    className={cn(parcInputCls, 'flex-1 min-w-0')}
                                  />
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="px-2.5 py-2">
                            <button
                              onClick={() => setParcelas(prev => [...prev, { seq: prev.length + 1, data: nextParcelaDate(prev), valor: '', codigo_barras: '' }])}
                              className="h-[26px] flex items-center gap-1.5 px-2.5 border border-dashed border-[#D81E1E]/45 text-[10px] font-black uppercase tracking-[0.06em] text-[#D81E1E] hover:bg-[#D81E1E]/[0.06] transition-colors"
                            >
                              <Plus size={12} strokeWidth={2.8} />Adicionar parcela
                            </button>
                          </div>
                        </>)}
                      </div>
                    </div>
                  </div>

                  {/* Classificação */}
                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <CheckSquare size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                      <span className={sectionTitleCls}>Classificação</span>
                    </div>
                    <div className="p-2.5 grid grid-cols-1 gap-2.5">
                      <TagSelector
                        tags={tags.filter(tg => !tg.exclusivo)}
                        value={txForm.tag_ids}
                        onChange={ids => setTxForm(f => ({ ...f, tag_ids: ids }))}
                        onCreateTag={(nome, cor) => createTag(nome, cor, '')}
                        parcelCount={parcelasEnabled ? parcelas.length : undefined}
                      />
                      <div className="flex flex-col gap-1">
                        <label className={labelCls}>Estabelecimento</label>
                        <select value={txForm.estabelecimento} onChange={e => setTxForm(f => ({ ...f, estabelecimento: e.target.value }))} className={inputCls}>
                          {estabelecimentos.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Nota fiscal vinculada */}
                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <Link2 size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                      <span className={sectionTitleCls}>Nota fiscal vinculada</span>
                    </div>
                    <div className="p-2.5">
                      <div className="flex items-center gap-2 px-2.5 py-2 border border-[#0A7A55]/30 dark:border-[#34D399]/30 bg-[#0A7A55]/[0.07] dark:bg-[#34D399]/[0.07] text-[#0A7A55] dark:text-[#34D399]">
                        <Link2 size={14} className="shrink-0" />
                        <span className="min-w-0 truncate text-[12px] font-extrabold">{nfLabel}</span>
                        <span className="ml-auto shrink-0 text-[10.5px] font-bold opacity-80">vinculada automaticamente ao adicionar</span>
                      </div>
                    </div>
                  </div>

                  {/* Observações */}
                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <Info size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                      <span className={sectionTitleCls}>Observações</span>
                    </div>
                    <div className="p-2.5">
                      <textarea
                        value={txForm.observacoes ?? ''}
                        onChange={e => setTxForm(f => ({ ...f, observacoes: e.target.value || null }))}
                        rows={3}
                        placeholder="Comentários sobre esta movimentação... (opcional)"
                        className={cn(inputCls, 'resize-none h-16 py-2 leading-[1.45]')}
                      />
                    </div>
                  </div>
                </div>

                <div className={footerCls}>
                  <span className="h-9 inline-flex items-center gap-2 px-3 border border-[#E3CF2A] dark:border-[#FFE500]/30 bg-[#FFF4A8] dark:bg-[#FFE500]/[0.08] text-[#1A1A0E] dark:text-[#FFE500]">
                    <span className="text-[9px] font-black uppercase tracking-[0.1em] opacity-65">Valor total</span>
                    <span className="font-mono text-[14px]">{fmt(footerTotal)}</span>
                  </span>
                  <button onClick={() => setMode('search')} className={cn(btnCls, 'ml-auto')}>
                    <ArrowLeft size={13} strokeWidth={2.6} />
                    Voltar
                  </button>
                  <button onClick={handleTxSubmit} disabled={txSubmitting || !txForm.favorecido.trim()} className={btnPrimaryCls}>
                    {txSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} strokeWidth={2.6} />}
                    Adicionar e vincular
                  </button>
                </div>
              </>
            )}

            {/* ── Cadastrar conta (botão + ao lado de Conta) ─────────────── */}
            {mode === 'create' && createTab === 'account' && (
              <>
                {titleBar(<Building2 size={15} strokeWidth={2.3} />, 'Nova Conta', 'Ao cadastrar, volta para a movimentação com a conta selecionada')}
                <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 flex flex-col gap-2.5">
                  {accounts.length > 0 && (
                    <div className={sectionCls}>
                      <div className={sectionHeadCls}>
                        <Building2 size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                        <span className={sectionTitleCls}>Contas cadastradas</span>
                        <span className={sectionCountCls}>{accounts.length}</span>
                      </div>
                      <div className="p-2.5 max-h-40 overflow-y-auto">
                        {accounts.map((acc, idx) => (
                          <div key={acc.id} className={cn('flex items-center gap-2.5 px-2.5 py-1.5 bg-white dark:bg-[#1E1E18] border border-[#B5AA86] dark:border-white/[0.10]', idx > 0 && 'border-t-0')}>
                            <p className="text-[12.5px] font-extrabold text-on-surface truncate flex-1 min-w-0">{acc.nome}</p>
                            <p className="text-[11px] font-semibold text-on-surface/45 truncate">{acc.banco}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <Plus size={12} strokeWidth={2.6} className="text-[#D81E1E] shrink-0" />
                      <span className={sectionTitleCls}>Nova conta</span>
                    </div>
                    <div className="p-2.5 grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-2.5">
                      <label className="cursor-pointer group md:row-span-3 flex flex-col gap-1">
                        <span className={labelCls}>Imagem da Conta</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setAccountForm(prev => ({ ...prev, imagemFile: f, imagemPreview: URL.createObjectURL(f) })); }} />
                        {accountForm.imagemPreview ? (
                          <div className="relative w-full h-[118px] overflow-hidden border border-[#E0D8BF] dark:border-white/[0.10]">
                            <img src={accountForm.imagemPreview} alt="Preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Upload size={18} className="text-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-[118px] border border-dashed border-[#CFC4A2] dark:border-white/[0.15] bg-white dark:bg-[#1E1E18] flex flex-col items-center justify-center gap-1.5 text-on-surface/35 hover:border-[#D81E1E]/45 hover:text-[#D81E1E] transition-colors">
                            <ImageIcon size={20} />
                            <span className="text-[11px] font-semibold">Clique para adicionar imagem</span>
                          </div>
                        )}
                      </label>
                      <div className="flex flex-col gap-1">
                        <label className={labelCls}>Nome da Conta</label>
                        <input type="text" value={accountForm.nome} onChange={e => setAccountForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Conta Corrente PF" className={inputCls} autoFocus />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={labelCls}>Banco</label>
                        <input type="text" value={accountForm.banco} onChange={e => setAccountForm(f => ({ ...f, banco: e.target.value }))} placeholder="Ex: Banco do Brasil" className={inputCls} />
                      </div>
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="flex flex-col gap-1 min-w-0">
                          <label className={labelCls}>Agência</label>
                          <input type="text" value={accountForm.agencia} onChange={e => setAccountForm(f => ({ ...f, agencia: e.target.value }))} placeholder="0000-0" className={inputCls} />
                        </div>
                        <div className="flex flex-col gap-1 min-w-0">
                          <label className={labelCls}>Nº da Conta</label>
                          <input type="text" value={accountForm.numero_conta} onChange={e => setAccountForm(f => ({ ...f, numero_conta: e.target.value }))} placeholder="00000-0" className={inputCls} />
                        </div>
                        <div className="flex flex-col gap-1 min-w-0">
                          <label className={labelCls}>Saldo inicial (Jan/2026)</label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-on-surface/45 pointer-events-none">R$</span>
                            <input type="number" step="0.01" min="0" value={accountForm.saldo_inicial} onChange={e => setAccountForm(f => ({ ...f, saldo_inicial: e.target.value }))} onWheel={blockWheelChange} placeholder="0,00" className={cn(inputCls, noSpinnerCls, 'pl-8')} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {accountError && (
                    <div className="px-2.5 py-2 border border-[#D81E1E]/35 bg-[#D81E1E]/[0.06] text-[11.5px] font-semibold text-[#B91818] dark:text-red-400">{accountError}</div>
                  )}
                </div>
                <div className={footerCls}>
                  <button onClick={backToTx} className={cn(btnCls, 'ml-auto')}>
                    <ArrowLeft size={13} strokeWidth={2.6} />
                    Voltar
                  </button>
                  <button onClick={handleAccountSubmit} disabled={accountSubmitting || !accountForm.nome.trim()} className={btnPrimaryCls}>
                    {accountSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} strokeWidth={2.8} />}
                    Cadastrar conta
                  </button>
                </div>
              </>
            )}

            {/* ── Cadastrar favorecido (botão + ao lado de Favorecido) ────── */}
            {mode === 'create' && createTab === 'favorecido' && (
              <>
                {titleBar(<Users size={15} strokeWidth={2.3} />, 'Novo Favorecido', 'Ao cadastrar, volta para a movimentação com o favorecido preenchido')}
                <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 flex flex-col gap-2.5">
                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <Plus size={12} strokeWidth={2.6} className="text-[#D81E1E] shrink-0" />
                      <span className={sectionTitleCls}>Novo favorecido</span>
                    </div>
                    <div className="p-2.5 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <div className="flex flex-col gap-1">
                        <label className={labelCls}>Nome no extrato bancário</label>
                        <input type="text" value={novoNomeBanco} onChange={e => setNovoNomeBanco(e.target.value)} placeholder="Como aparece no extrato..." className={inputCls} autoFocus />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={labelCls}>Nome fiscal <span className="text-[#D81E1E]">*</span></label>
                        <input type="text" value={novoFavorecido} onChange={e => setNovoFavorecido(e.target.value)} onKeyUp={e => e.key === 'Enter' && handleAddFavorecido()} placeholder="Nome fiscal do favorecido..." className={inputCls} />
                      </div>
                    </div>
                  </div>

                  {favorecidos.length > 0 && (
                    <div className={sectionCls}>
                      <div className={sectionHeadCls}>
                        <Users size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                        <span className={sectionTitleCls}>Favorecidos cadastrados</span>
                        <span className={sectionCountCls}>{favorecidos.length}</span>
                      </div>
                      <div className="p-2.5 max-h-52 overflow-y-auto">
                        {favorecidos.map((f, idx) => (
                          <div key={f.id} className={cn('flex items-center gap-2.5 px-2.5 py-1.5 bg-white dark:bg-[#1E1E18] border border-[#B5AA86] dark:border-white/[0.10]', idx > 0 && 'border-t-0')}>
                            <p className="text-[12.5px] font-extrabold text-on-surface truncate flex-1 min-w-0">{f.nome_fiscal}</p>
                            {f.nome_banco && <p className="text-[11px] font-semibold text-on-surface/45 truncate max-w-[45%]">{f.nome_banco}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className={footerCls}>
                  <button onClick={backToTx} className={cn(btnCls, 'ml-auto')}>
                    <ArrowLeft size={13} strokeWidth={2.6} />
                    Voltar
                  </button>
                  <button onClick={handleAddFavorecido} disabled={favSubmitting || !novoFavorecido.trim()} className={btnPrimaryCls}>
                    {favSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} strokeWidth={2.8} />}
                    Cadastrar favorecido
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

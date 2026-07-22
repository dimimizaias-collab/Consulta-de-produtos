'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, X, Check, Edit2, Trash2, TrendingUp, TrendingDown,
  Wallet, Search, ChevronLeft, ChevronRight, Building2, CreditCard, Upload,
  ImageIcon, Loader2, Users, FileUp, CheckSquare, BookOpen, Filter, Clock, CheckCircle2,
  AlertTriangle, Info, Database, ArrowLeft,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useFinanceTags, TAG_COLOR_MAP } from '@/hooks/useFinanceTags';
import { TagSelector } from './TagSelector';
import { TagGuide } from './TagGuide';
import { LinkedNotesSection, LinkedNoteLite, linkNotesToTransactions, cleanupNoteLinksForDeletedTxs } from './LinkedNotesSection';

// ── Types ──────────────────────────────────────────────────────────────────

type PaymentType = 'Boleto' | 'Crédito' | 'Débito' | 'PIX' | 'Dinheiro' | 'Transferência' | 'Cheque' | 'Outro';
type TransactionType = 'Receita' | 'Despesa';

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
  numero_cheque: string | null;
  numero_parcela: number | null;
  total_parcelas: number | null;
  parcelamento_id: string | null;
  import_id?: string | null;
  account_id?: string | null;
  tag_ids: string[];
  observacoes: string | null;
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

const TABLE_COLUMNS: { label: string; key: string }[] = [
  { label: 'Data', key: 'data' },
  { label: 'Tipo', key: 'tipo' },
  { label: 'Pagamento', key: 'pagamento' },
  { label: 'Favorecido', key: 'favorecido' },
  { label: 'Estabelec.', key: 'estabelecimento' },
  { label: 'TAGS', key: 'tags' },
  { label: 'Vencimento', key: 'vencimento' },
  { label: 'Valor final', key: 'valor_final' },
  { label: 'Total pago', key: 'total_pago' },
  { label: 'Restante', key: 'restante' },
  { label: 'Pago', key: 'pago' },
  { label: '', key: '' },
];

const emptyTxForm = (): TxForm => ({
  data: new Date().toISOString().split('T')[0],
  tipo: 'Despesa',
  tipo_pagamento: 'PIX',
  favorecido: '',
  estabelecimento: 'Castelo Real',
  vencimento: '',
  valor_final: 0,
  total_pago: 0,
  pago: false,
  numero_cheque: null,
  numero_parcela: null,
  total_parcelas: null,
  parcelamento_id: null,
  tag_ids: [],
  observacoes: null,
});

const emptyAccountForm = (): AccountForm => ({
  nome: '', banco: '', agencia: '', numero_conta: '',
  saldo_inicial: '',
  imagemPreview: '', imagemFile: null,
});

// ── Helpers ────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function hashFile(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const fmtDate = (iso: string | null) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

const inputCls =
  'px-3 py-2.5 bg-surface-container rounded-xl text-sm text-on-surface border border-on-surface/5 focus:outline-none focus:border-primary/50 placeholder:text-on-surface/30 w-full';
const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-on-surface/40';

// ── Import parsing utilities ───────────────────────────────────────────────

// Normalise: strip accents + lowercase — used for all string comparisons in the parser
function normalizeStr(s: string): string {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Lançamento strings that indicate a balance / info row — not real transactions.
// Uses n.includes(ig), so each pattern matches any lancamento that CONTAINS it.
const IGNORE_LANCAMENTOS = [
  'saldo total disponivel dia',
  'saldo bloqueado',
  'saldo em conta corrente',
  'saldo do dia',
  'saldo anterior',
  'saldo final',
];
function isLinhaIgnorada(lancamento: string): boolean {
  const n = normalizeStr(lancamento);
  return IGNORE_LANCAMENTOS.some(ig => n.includes(ig));
}

function parseDateExtrato(raw: any): string | null {
  if (raw instanceof Date) {
    const offset = raw.getTimezoneOffset() * 60000;
    return new Date(raw.getTime() - offset).toISOString().split('T')[0];
  }
  const s = String(raw ?? '').trim();
  if (s.includes('/')) {
    const [d, m, y] = s.split('/');
    if (d && m && y) {
      const fullYear = y.length === 2 ? '20' + y : y;
      return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return null;
}

function parseValorExtrato(raw: any): number | null {
  if (typeof raw === 'number') return raw;
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const cleaned = s.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const v = parseFloat(cleaned);
  return isNaN(v) ? null : v;
}

function mapLancamentoToTipoPagamento(lancamento: string): PaymentType {
  const l = normalizeStr(lancamento);
  if (l.includes('pix')) return 'PIX';
  if (l.includes('ted') || l.includes('doc')) return 'Transferência';
  if (l.includes('transf')) return 'Transferência';
  if (l.includes('deb') && l.includes('auto')) return 'Débito';
  if (l.includes('debito') || l.includes('deb ')) return 'Débito';
  if (l.includes('credito') || l.includes('cred ')) return 'Crédito';
  if (l.includes('boleto') || l.includes('cobr')) return 'Boleto';
  if (l.includes('cheque')) return 'Cheque';
  if (l.includes('saque') || l.includes('deposito') || l.includes('especie')) return 'Dinheiro';
  return 'Outro';
}

// ── Component ──────────────────────────────────────────────────────────────

export function FinanceManager() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // "Dados" view (contas + favorecidos)
  const [financeView, setFinanceView] = useState<'main' | 'dados'>('main');
  const [dadosFavSearch, setDadosFavSearch] = useState('');

  // transaction modal
  const [showTxModal, setShowTxModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingNotes, setPendingNotes] = useState<LinkedNoteLite[]>([]);
  const [txForm, setTxForm] = useState<TxForm>(emptyTxForm());
  const [parcelasEnabled, setParcelasEnabled] = useState(false);
  const [parcelas, setParcelas] = useState<Array<{ seq: number; data: string; valor: string }>>([]);
  // Quando preenchido, o salvar substitui todas essas linhas (edição do parcelamento inteiro)
  const [editingGroupIds, setEditingGroupIds] = useState<string[] | null>(null);

  // bank account modal
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm>(emptyAccountForm());
  const [accountError, setAccountError] = useState<string | null>(null);

  // favorecidos dictionary
  const [showFavorecidoModal, setShowFavorecidoModal] = useState(false);
  const [favorecidos, setFavorecidos] = useState<Favorecido[]>([]);
  const [novoFavorecido, setNovoFavorecido] = useState('');
  const [novoNomeBanco, setNovoNomeBanco] = useState('');
  const [savingFavorecido, setSavingFavorecido] = useState(false);
  const [loadingFavorecidos, setLoadingFavorecidos] = useState(false);

  // import extrato modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importBanco, setImportBanco] = useState('Itaú');
  const [importEstab, setImportEstab] = useState('Castelo Real');
  const [importAccountId, setImportAccountId] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importDuplicateLogId, setImportDuplicateLogId] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState('');

  // favorecido combobox
  const [favOpen, setFavOpen] = useState(false);
  const favRef = useRef<HTMLDivElement>(null);

  // filters
  const [search, setSearch] = useState('');
  const [columnFiltersEnabled, setColumnFiltersEnabled] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [filterOpenKey, setFilterOpenKey] = useState<string | null>(null);
  const [filterSearchQuery, setFilterSearchQuery] = useState('');

  // selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // tags
  const { tags, createTag, updateTag, deleteTag } = useFinanceTags();
  const [showTagGuide, setShowTagGuide] = useState(false);

  // mini calendar
  const [calViewDate, setCalViewDate] = useState(() => new Date());
  const [calSelectedDate, setCalSelectedDate] = useState<Date | null>(null);
  const [calRangeMode, setCalRangeMode] = useState(false);
  const [calRangeStart, setCalRangeStart] = useState<Date | null>(null);
  const [calRangeEnd, setCalRangeEnd] = useState<Date | null>(null);
  const [calLegendOpen, setCalLegendOpen] = useState(false);
  const calLegendRef = useRef<HTMLDivElement>(null);

  // resultados/contas panel
  const [financePanelTab, setFinancePanelTab] = useState<'resultados' | 'contas'>('resultados');

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchAll = async () => {
    setLoadingData(true);
    const [txRes, accRes] = await Promise.all([
      supabase.from('finance_transactions').select('*').order('data', { ascending: false }),
      supabase.from('finance_accounts').select('*').order('created_at', { ascending: false }),
    ]);
    if (txRes.data)  setTransactions(txRes.data as Transaction[]);
    if (accRes.data) setAccounts(accRes.data as BankAccount[]);
    setLoadingData(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const fetchFavorecidos = async () => {
    setLoadingFavorecidos(true);
    const { data } = await supabase
      .from('finance_favorecidos')
      .select('*')
      .order('nome_fiscal');
    if (data) setFavorecidos(data as Favorecido[]);
    setLoadingFavorecidos(false);
  };

  const handleAddFavorecido = async () => {
    if (!novoFavorecido.trim()) return;
    setSavingFavorecido(true);
    const { data } = await supabase
      .from('finance_favorecidos')
      .insert([{ nome_fiscal: novoFavorecido.trim(), nome_banco: novoNomeBanco.trim() }])
      .select()
      .single();
    if (data) {
      setFavorecidos(prev => [...prev, data as Favorecido].sort((a, b) => a.nome_fiscal.localeCompare(b.nome_fiscal)));
      // Re-translate existing transactions that used the raw bank name
      if (novoNomeBanco.trim()) {
        await supabase
          .from('finance_transactions')
          .update({ favorecido: novoFavorecido.trim() })
          .eq('favorecido', novoNomeBanco.trim());
        setTransactions(prev => prev.map(t =>
          t.favorecido === novoNomeBanco.trim() ? { ...t, favorecido: novoFavorecido.trim() } : t
        ));
      }
    }
    setNovoFavorecido('');
    setNovoNomeBanco('');
    setSavingFavorecido(false);
  };

  const handleDeleteFavorecido = async (id: string) => {
    await supabase.from('finance_favorecidos').delete().eq('id', id);
    setFavorecidos(prev => prev.filter(f => f.id !== id));
  };

  const openFavorecidoModal = () => {
    fetchFavorecidos();
    setShowFavorecidoModal(true);
  };

  const openImportModal = () => {
    fetchFavorecidos();
    setImportFile(null);
    setImportError('');
    setImportSuccess('');
    setImportAccountId('');
    setImportDuplicateLogId(null);
    setShowImportModal(true);
  };

  // close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (favRef.current && !favRef.current.contains(e.target as Node))
        setFavOpen(false);
      if (calLegendRef.current && !calLegendRef.current.contains(e.target as Node))
        setCalLegendOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Transactions CRUD ────────────────────────────────────────────────────

  const openAddTx = () => {
    setEditingId(null);
    setTxForm(emptyTxForm());
    setPendingNotes([]);
    setParcelasEnabled(false);
    setParcelas([]);
    setEditingGroupIds(null);
    setFavOpen(false);
    fetchFavorecidos();
    setShowTxModal(true);
  };

  const openEditTx = (t: Transaction) => {
    setEditingId(t.id);
    setPendingNotes([]);
    setTxForm({ ...t, vencimento: t.vencimento ?? '', tag_ids: t.tag_ids ?? [] });
    // Vencimento agora vive no editor de parcelas: 1 linha = pagamento único com vencimento
    setParcelasEnabled(!!t.vencimento);
    setParcelas(t.vencimento ? [{ seq: 1, data: t.vencimento, valor: String(t.valor_final) }] : []);
    setEditingGroupIds(null);
    fetchFavorecidos();
    setShowTxModal(true);
  };

  // Carrega todas as parcelas irmãs no editor para edição em lote
  const loadGroupIntoEditor = (t: Transaction) => {
    const key = parcelaGroupKey(t);
    const siblings = transactions
      .filter(s => s.total_parcelas && s.total_parcelas > 1 && parcelaGroupKey(s) === key)
      .sort((a, b) => (a.numero_parcela ?? 0) - (b.numero_parcela ?? 0));
    if (siblings.length === 0) return;
    setParcelasEnabled(true);
    setParcelas(siblings.map((s, i) => ({ seq: i + 1, data: s.vencimento ?? s.data, valor: String(s.valor_final) })));
    setEditingGroupIds(siblings.map(s => s.id));
  };

  const handleTxSubmit = async () => {
    if (!txForm.favorecido.trim()) return;
    setSubmitting(true);
    try {
      if (parcelasEnabled) {
        const valid = parcelas.filter(p => p.data && parseFloat(p.valor) > 0);
        if (valid.length === 0) return;
        const base = {
          tipo: txForm.tipo,
          tipo_pagamento: txForm.tipo_pagamento,
          favorecido: txForm.favorecido,
          estabelecimento: txForm.estabelecimento,
          numero_cheque: txForm.tipo_pagamento === 'Cheque' ? (txForm.numero_cheque || null) : null,
          account_id: txForm.account_id ?? null,
          tag_ids: txForm.tag_ids ?? [],
          observacoes: txForm.observacoes?.trim() || null,
        };

        if (editingId && !editingGroupIds && valid.length === 1) {
          // Edição simples de uma linha (vencimento único ou parcela individual):
          // atualiza no lugar, preservando pago/numero_parcela/parcelamento_id.
          await supabase.from('finance_transactions').update({
            ...base, data: txForm.data, vencimento: valid[0].data,
            valor_final: parseFloat(valid[0].valor) || 0,
          }).eq('id', editingId);
        } else {
          // Criação, edição do grupo inteiro, ou conversão de linha única em parcelamento.
          const replaceIds = editingGroupIds ?? (editingId ? [editingId] : []);
          let relinkNoteIds = pendingNotes.map(n => n.id);
          if (replaceIds.length > 0) {
            const { data: links } = await supabase.from('finance_transaction_notes')
              .select('note_id').in('transaction_id', replaceIds);
            relinkNoteIds = [...new Set((links ?? []).map(l => l.note_id as string))];
            await supabase.from('finance_transactions').delete().in('id', replaceIds);
          }
          const rows = valid.length === 1
            // 1 parcela = pagamento único com data de vencimento, sem parcelamento
            ? [{
                ...base, data: txForm.data, vencimento: valid[0].data,
                valor_final: parseFloat(valid[0].valor) || 0,
                total_pago: 0, pago: false, import_id: null,
                numero_parcela: null, total_parcelas: null, parcelamento_id: null,
              }]
            // data = data de lançamento; vencimento = data da parcela (usada pela DespesasPage)
            : (() => {
                const parcelamentoId = crypto.randomUUID();
                return valid.map(p => ({
                  ...base, data: p.data, vencimento: p.data, valor_final: parseFloat(p.valor) || 0,
                  total_pago: 0, pago: false, import_id: null,
                  numero_parcela: p.seq, total_parcelas: valid.length, parcelamento_id: parcelamentoId,
                }));
              })();
          const { data: inserted } = await supabase.from('finance_transactions')
            .insert(rows).select('id, favorecido, valor_final');
          if (inserted && relinkNoteIds.length > 0)
            await linkNotesToTransactions(inserted, relinkNoteIds);
        }
      } else {
        if (txForm.valor_final <= 0) return;
        const payload = {
          ...txForm,
          vencimento: null,
          numero_cheque: txForm.tipo_pagamento === 'Cheque' ? (txForm.numero_cheque || null) : null,
          numero_parcela: null,
          total_parcelas: null,
          parcelamento_id: null,
          observacoes: txForm.observacoes?.trim() || null,
        };
        if (editingId) {
          await supabase.from('finance_transactions').update(payload).eq('id', editingId);
        } else {
          const { data: inserted } = await supabase.from('finance_transactions')
            .insert(payload).select('id, favorecido, valor_final');
          if (inserted && pendingNotes.length > 0)
            await linkNotesToTransactions(inserted, pendingNotes.map(n => n.id));
        }
      }
      await fetchAll();
      setShowTxModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const cleanupOrphanedLogs = async (importIds: (string | null | undefined)[]) => {
    const validIds = [...new Set(importIds.filter((id): id is string => !!id))];
    if (validIds.length === 0) return;
    const { data: remaining } = await supabase
      .from('finance_transactions')
      .select('import_id')
      .in('import_id', validIds);
    const stillUsed = new Set((remaining ?? []).map(r => r.import_id));
    const orphaned = validIds.filter(id => !stillUsed.has(id));
    if (orphaned.length > 0)
      await supabase.from('finance_import_logs').delete().in('id', orphaned);
  };

  const handleDeleteTx = async (id: string) => {
    const tx = transactions.find(t => t.id === id);
    const { error } = await supabase.from('finance_transactions').delete().eq('id', id);
    if (error) return;
    setTransactions(prev => prev.filter(t => t.id !== id));
    await cleanupNoteLinksForDeletedTxs([id]);
    await cleanupOrphanedLogs([tx?.import_id]);
  };

  const toggleSelectionMode = () => {
    setSelectionMode(v => !v);
    setSelectedIds(new Set());
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filtered.map(t => t.id)));

  const handleDeleteSelected = async () => {
    const ids = [...selectedIds];
    const importIds = transactions
      .filter(t => selectedIds.has(t.id))
      .map(t => t.import_id);

    setDeletingSelected(true);
    setDeleteError('');
    try {
      // Delete in batches of 200 to avoid URL length limits on large selections
      const BATCH = 200;
      for (let i = 0; i < ids.length; i += BATCH) {
        const { error, count } = await supabase
          .from('finance_transactions')
          .delete({ count: 'exact' })
          .in('id', ids.slice(i, i + BATCH));
        if (error) throw new Error(error.message);
        // count === 0 with no error means RLS is blocking the delete silently
        if (count === 0 && ids.slice(i, i + BATCH).length > 0) {
          throw new Error('Nenhum registro foi excluído. Verifique as permissões (RLS) na tabela finance_transactions no Supabase.');
        }
      }
      setTransactions(prev => prev.filter(t => !selectedIds.has(t.id)));
      setSelectedIds(new Set());
      setSelectionMode(false);
      await cleanupNoteLinksForDeletedTxs(ids);
      await cleanupOrphanedLogs(importIds);
    } catch (err: any) {
      setDeleteError(err.message || 'Erro ao excluir movimentações.');
    } finally {
      setDeletingSelected(false);
    }
  };

  const togglePago = async (id: string) => {
    const t = transactions.find(t => t.id === id);
    if (!t) return;
    const next = !t.pago;
    const nextTotalPago = next ? t.valor_final : 0;
    await supabase.from('finance_transactions').update({ pago: next, total_pago: nextTotalPago }).eq('id', id);
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, pago: next, total_pago: nextTotalPago } : t));
  };

  // ── Bank Accounts ────────────────────────────────────────────────────────

  const openAddAccount = () => {
    setEditingAccountId(null);
    setAccountForm(emptyAccountForm());
    setAccountError(null);
    setShowAccountModal(true);
  };

  const openEditAccount = (account: BankAccount) => {
    setEditingAccountId(account.id);
    setAccountForm({
      nome: account.nome,
      banco: account.banco,
      agencia: account.agencia,
      numero_conta: account.numero_conta,
      saldo_inicial: String(account.saldo_inicial ?? 0),
      imagemPreview: account.imagem_url ?? '',
      imagemFile: null,
    });
    setAccountError(null);
    setShowAccountModal(true);
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Excluir esta conta? Movimentações já vinculadas a ela não serão apagadas.')) return;
    await supabase.from('finance_accounts').delete().eq('id', id);
    setAccounts(prev => prev.filter(a => a.id !== id));
  };

  const handleAccountImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAccountForm(f => ({ ...f, imagemFile: file, imagemPreview: URL.createObjectURL(file) }));
  };

  const uploadImage = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `accounts/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file);
    if (error) throw error;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const handleAccountSubmit = async () => {
    if (!accountForm.nome.trim()) return;
    setSubmitting(true);
    setAccountError(null);
    try {
      const saldo_inicial = parseFloat(accountForm.saldo_inicial.replace(',', '.')) || 0;
      if (editingAccountId) {
        const payload: Record<string, unknown> = {
          nome: accountForm.nome,
          banco: accountForm.banco,
          agencia: accountForm.agencia,
          numero_conta: accountForm.numero_conta,
          saldo_inicial,
        };
        if (accountForm.imagemFile) payload.imagem_url = await uploadImage(accountForm.imagemFile);
        await supabase.from('finance_accounts').update(payload).eq('id', editingAccountId);
      } else {
        let imagem_url = '';
        if (accountForm.imagemFile) imagem_url = await uploadImage(accountForm.imagemFile);
        await supabase.from('finance_accounts').insert({
          nome: accountForm.nome,
          banco: accountForm.banco,
          agencia: accountForm.agencia,
          numero_conta: accountForm.numero_conta,
          imagem_url,
          saldo_inicial,
        });
      }
      await fetchAll();
      setShowAccountModal(false);
      setEditingAccountId(null);
    } catch (err: any) {
      setAccountError(err?.message || 'Erro ao salvar conta. Verifique o bucket de storage no Supabase.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Import Extrato ───────────────────────────────────────────────────────

  const handleImportExtrato = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportError('');
    setImportSuccess('');
    try {
      const buffer = await importFile.arrayBuffer();

      // Check if this exact file was already imported
      const hash = await hashFile(buffer);
      const { data: existingLog } = await supabase
        .from('finance_import_logs')
        .select('id, imported_at')
        .eq('file_hash', hash)
        .maybeSingle();
      if (existingLog && existingLog.id !== importDuplicateLogId) {
        const when = new Date(existingLog.imported_at).toLocaleDateString('pt-BR');
        setImportError(`Este arquivo já foi importado em ${when}.`);
        setImportDuplicateLogId(existingLog.id);
        return;
      }
      // If forcing reimport, wipe all data from the old import first (transactions + snapshots + log)
      if (importDuplicateLogId) {
        await supabase.from('finance_transactions').delete().eq('import_id', importDuplicateLogId);
        await supabase.from('finance_account_daily_balances').delete().eq('import_id', importDuplicateLogId);
        await supabase.from('finance_import_logs').delete().eq('id', importDuplicateLogId);
        setImportDuplicateLogId(null);
      }

      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // Read entire sheet as array-of-arrays; detect header row dynamically
      const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // Locate the header row by finding a cell whose normalised text is exactly "data"
      let headerIdx = -1;
      let colData = 0, colLancamento = 1, colRazao = 2, colValor = 4, colSaldo = 5;

      for (let i = 0; i < Math.min(allRows.length, 25); i++) {
        const row = allRows[i];
        let foundData = false;
        for (let j = 0; j < row.length; j++) {
          const cell = normalizeStr(String(row[j] ?? ''));
          if (cell === 'data')                      { colData = j;       foundData = true; }
          else if (cell === 'lancamento')            { colLancamento = j; }
          else if (cell.startsWith('razao social')) { colRazao = j;      }
          else if (cell.startsWith('valor'))        { colValor = j;      }
          else if (cell.startsWith('saldo'))        { colSaldo = j;      }
        }
        if (foundData) { headerIdx = i; break; }
      }

      if (headerIdx === -1) {
        setImportError('Cabeçalho "Data" não encontrado nas primeiras 25 linhas. Verifique se o arquivo é um extrato Itaú.');
        return;
      }

      // First pass: collect daily balance snapshots (SALDO TOTAL DISPONÍVEL DIA + SALDO BLOQUEADO).
      // These rows are skipped as transactions but carry the authoritative account balance.
      const dailySnapshots: Record<string, { saldo_disponivel?: number; saldo_bloqueado?: number }> = {};
      {
        let lastDate: string | null = null;
        for (let i = headerIdx + 1; i < allRows.length; i++) {
          const row = allRows[i];
          if (!row || row.every((c: any) => c === undefined || c === null || String(c).trim() === '')) continue;
          const parsedDate = parseDateExtrato(row[colData]);
          if (parsedDate) lastDate = parsedDate;
          if (!lastDate) continue;
          const n = normalizeStr(String(row[colLancamento] ?? ''));
          if (n.includes('saldo total disponivel dia')) {
            const v = parseValorExtrato(row[colSaldo]);
            if (v !== null) {
              if (!dailySnapshots[lastDate]) dailySnapshots[lastDate] = {};
              dailySnapshots[lastDate].saldo_disponivel = Math.abs(v);
            }
          } else if (n.includes('saldo bloqueado')) {
            const v = parseValorExtrato(row[colSaldo]);
            if (v !== null) {
              if (!dailySnapshots[lastDate]) dailySnapshots[lastDate] = {};
              dailySnapshots[lastDate].saldo_bloqueado = Math.abs(v);
            }
          }
        }
      }

      // Translation dictionary: normalised nome_banco → nome_fiscal
      const dict: Record<string, string> = {};
      favorecidos.forEach(f => {
        if (f.nome_banco) dict[normalizeStr(f.nome_banco)] = f.nome_fiscal;
      });

      const toInsert: Omit<Transaction, 'id'>[] = [];
      let skippedSaldo = 0;

      for (let i = headerIdx + 1; i < allRows.length; i++) {
        const row = allRows[i];

        // Skip completely empty rows
        if (!row || row.every((c: any) => c === undefined || c === null || String(c).trim() === '')) continue;

        const rawDate      = row[colData];
        const lancamentoRaw = String(row[colLancamento] ?? '').trim();
        const razaoSocial  = String(row[colRazao] ?? '').trim();
        const valorRaw     = row[colValor];

        // Skip balance / informational lines
        if (isLinhaIgnorada(lancamentoRaw)) { skippedSaldo++; continue; }

        // Must parse to a valid date
        const dataStr = parseDateExtrato(rawDate);
        if (!dataStr) continue;

        // Must have a non-zero value
        const valor = parseValorExtrato(valorRaw);
        if (valor === null || valor === 0) continue;

        const tipo: TransactionType  = valor > 0 ? 'Receita' : 'Despesa';
        const valorAbs               = Math.abs(valor);
        const tipoPagamento          = mapLancamentoToTipoPagamento(lancamentoRaw);

        // Use Razão Social as favorecido; fall back to lançamento if empty
        const rawNome  = razaoSocial || lancamentoRaw || 'Desconhecido';
        const nomeFinal = dict[normalizeStr(rawNome)] ?? rawNome;

        // All bank statement rows are already settled
        toInsert.push({
          data: dataStr,
          tipo,
          tipo_pagamento: tipoPagamento,
          favorecido: nomeFinal,
          estabelecimento: importEstab,
          vencimento: null,
          valor_final: valorAbs,
          total_pago: valorAbs,
          account_id: importAccountId || null,
          pago: true,
          numero_cheque: null,
          numero_parcela: null,
          total_parcelas: null,
          parcelamento_id: null,
          tag_ids: [],
          observacoes: null,
        });
      }

      if (toInsert.length === 0) {
        const extra = skippedSaldo > 0 ? ` (${skippedSaldo} linha(s) de saldo ignoradas)` : '';
        setImportError('Nenhuma movimentação válida encontrada.' + extra);
        return;
      }

      // Create import log and link all transactions to it
      const { data: newLog, error: logError } = await supabase
        .from('finance_import_logs')
        .insert({ file_hash: hash, file_name: importFile.name })
        .select('id')
        .single();
      if (logError) throw new Error(logError.message);

      const withImportId = toInsert.map(t => ({ ...t, import_id: newLog.id }));
      const { error: dbError } = await supabase.from('finance_transactions').insert(withImportId);
      if (dbError) {
        // Roll back the log entry if transactions failed
        await supabase.from('finance_import_logs').delete().eq('id', newLog.id);
        throw new Error(dbError.message);
      }

      // Upsert daily balance snapshots when a bank account is linked
      let snapshotCount = 0;
      if (importAccountId) {
        const snapshotsToUpsert = Object.entries(dailySnapshots)
          .filter(([, v]) => v.saldo_disponivel !== undefined)
          .map(([date, v]) => ({
            account_id: importAccountId,
            import_id: newLog.id,
            data: date,
            saldo_disponivel: v.saldo_disponivel!,
            saldo_bloqueado: v.saldo_bloqueado ?? 0,
          }));
        if (snapshotsToUpsert.length > 0) {
          const { error: snapError } = await supabase
            .from('finance_account_daily_balances')
            .upsert(snapshotsToUpsert, { onConflict: 'account_id,data' });
          if (!snapError) snapshotCount = snapshotsToUpsert.length;
        }
      }

      await fetchAll();

      setShowImportModal(false);
      setImportFile(null);

      const parts: string[] = [];
      parts.push(`${toInsert.length} movimentações importadas`);
      if (snapshotCount > 0) parts.push(`${snapshotCount} saldo(s) diário(s) salvos`);
      if (skippedSaldo > 0) parts.push(`${skippedSaldo} linhas de saldo ignoradas`);
      setImportSuccess(parts.join(' · '));
    } catch (err: any) {
      setImportError(err.message || 'Erro ao processar o arquivo.');
    } finally {
      setImportLoading(false);
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────────

  const totalParcelas = parcelas.reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0);

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

  const getColumnValues = (t: Transaction, key: string): string[] => {
    switch (key) {
      case 'data': return [fmtDate(t.data)];
      case 'tipo': return [t.tipo];
      case 'pagamento': return [t.tipo_pagamento];
      case 'favorecido': return [t.favorecido];
      case 'estabelecimento': return [t.estabelecimento];
      case 'tags': {
        const names = (t.tag_ids ?? [])
          .map(id => tags.find(tg => tg.id === id)?.nome)
          .filter((n): n is string => !!n);
        return names.length > 0 ? names : ['Sem tag'];
      }
      case 'vencimento': return [t.vencimento ? fmtDate(t.vencimento) : '—'];
      case 'valor_final': return [fmt(t.valor_final)];
      case 'total_pago': return [fmt(t.total_pago)];
      case 'restante': return [fmt(t.valor_final - t.total_pago)];
      case 'pago': return [t.pago ? 'Sim' : 'Não'];
      default: return [];
    }
  };

  const getColumnUniqueValues = (key: string): string[] => {
    const all = transactions.flatMap(t => getColumnValues(t, key));
    return Array.from(new Set(all)).sort();
  };

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      for (const [key, selected] of Object.entries(columnFilters)) {
        if (selected.size === 0) continue;
        if (!getColumnValues(t, key).some(v => selected.has(v))) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!t.favorecido.toLowerCase().includes(q) && !t.estabelecimento.toLowerCase().includes(q)) return false;
      }
      if (!inSelectedPeriod(t.data) && !inSelectedPeriod(t.vencimento)) return false;
      return true;
    });
  }, [transactions, columnFilters, search, calSelectedDate, calRangeStart, calRangeEnd, tags]);

  // Soma o valor de todas as parcelas irmãs para dar ao usuário a visão do valor total do
  // parcelamento. Usa parcelamento_id quando disponível; linhas antigas sem esse campo caem
  // no agrupamento heurístico por favorecido/tipo/pagamento/estabelecimento/total_parcelas.
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

  // Movimentação em edição no modal (para exibir total do grupo e o botão "Editar todas")
  const editingTx = editingId ? transactions.find(t => t.id === editingId) ?? null : null;

  // Editor de Vencimento / Parcelas — caminho único para dar vencimento a uma movimentação.
  // 1 linha = pagamento único com vencimento; 2+ linhas = parcelamento.
  const renderParcelasSection = () => (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() => {
          const next = !parcelasEnabled;
          setParcelasEnabled(next);
          if (next && parcelas.length === 0)
            setParcelas([{ seq: 1, data: txForm.vencimento || txForm.data, valor: txForm.valor_final ? String(txForm.valor_final) : '' }]);
          else if (!next) {
            setParcelas([]);
            setEditingGroupIds(null);
          }
        }}
        className={cn(
          'self-start px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
          parcelasEnabled
            ? 'bg-primary text-on-primary'
            : 'bg-on-surface/10 text-on-surface/60 hover:bg-on-surface/15'
        )}
      >
        Vencimento / Parcelas
      </button>

      {parcelasEnabled && (
        <div className="mt-1 flex flex-col gap-2 bg-on-surface/3 rounded-xl p-3">
          {editingTx && getParcelaGroupTotal(editingTx) !== null && !editingGroupIds && (
            <div className="flex items-center justify-between gap-2 bg-primary/[0.06] border border-primary/15 rounded-lg px-3 py-2">
              <span className="text-[11px] font-bold text-on-surface/60">
                Parcela {editingTx.numero_parcela ?? 1} de {editingTx.total_parcelas ?? 1} · Total {fmt(getParcelaGroupTotal(editingTx)!)}
              </span>
              <button
                onClick={() => loadGroupIntoEditor(editingTx)}
                className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-primary text-on-primary hover:opacity-90 active:scale-[0.97] transition-all"
              >
                Editar todas as parcelas
              </button>
            </div>
          )}
          {editingGroupIds && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-[11px] font-bold text-amber-700 dark:text-amber-400">
              Editando o parcelamento inteiro — salvar substituirá todas as parcelas (status de pagamento será reiniciado)
            </div>
          )}
          <div className="grid grid-cols-[44px_1fr_1fr_28px] gap-2">
            <span className={cn(labelCls, 'text-center')}>Nº</span>
            <span className={cn(labelCls, 'text-center')}>Vencimento</span>
            <span className={cn(labelCls, 'text-center')}>Valor</span>
            <span />
          </div>
          {parcelas.map((p, idx) => (
            <div key={idx} className="grid grid-cols-[44px_1fr_1fr_28px] gap-2 items-center">
              <div className={cn(inputCls, 'text-center text-on-surface/40 pointer-events-none select-none px-0')}>
                {p.seq}
              </div>
              <input
                type="date"
                value={p.data}
                onChange={e => setParcelas(prev => prev.map((x, i) => i === idx ? { ...x, data: e.target.value } : x))}
                className={inputCls}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={p.valor}
                onChange={e => setParcelas(prev => prev.map((x, i) => i === idx ? { ...x, valor: e.target.value } : x))}
                placeholder="0,00"
                className={inputCls}
              />
              {parcelas.length > 1 ? (
                <button
                  onClick={() => setParcelas(prev => prev.filter((_, i) => i !== idx).map((x, i) => ({ ...x, seq: i + 1 })))}
                  title="Remover parcela"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface/30 hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                >
                  <X size={13} />
                </button>
              ) : <span />}
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setParcelas(prev => [...prev, { seq: prev.length + 1, data: txForm.data, valor: '' }])}
              className="flex items-center gap-1.5 text-xs font-bold text-primary hover:opacity-70 transition-opacity"
            >
              <Plus size={13} />Adicionar parcela
            </button>
            {parcelas.length > 1 && totalParcelas > 0 && (
              <span className="text-[11px] font-bold text-on-surface/50">
                {parcelas.length} parcelas · Total <span className="text-primary">{fmt(totalParcelas)}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const tagUseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of transactions) {
      for (const id of (t.tag_ids ?? [])) {
        counts[id] = (counts[id] ?? 0) + 1;
      }
    }
    return counts;
  }, [transactions]);

  const totals = useMemo(() => {
    if (hasDatePeriod) {
      const inPeriod = transactions.filter(t => inSelectedPeriod(t.data));
      const receitas = inPeriod.filter(t => t.tipo === 'Receita').reduce((s, t) => s + t.valor_final, 0);
      const despesas = inPeriod.filter(t => t.tipo === 'Despesa').reduce((s, t) => s + t.valor_final, 0);
      return { receitas, despesas, saldo: receitas - despesas };
    }
    const receitas = transactions.filter(t => t.tipo === 'Receita').reduce((s, t) => s + t.valor_final, 0);
    const despesas = transactions.filter(t => t.tipo === 'Despesa').reduce((s, t) => s + t.valor_final, 0);
    const saldoInicial = accounts.reduce((s, a) => s + (a.saldo_inicial ?? 0), 0);
    // Saldo: apenas transações quitadas (pago=true) — exclui despesas/receitas com vencimento futuro
    const receitasPagas = transactions.filter(t => t.tipo === 'Receita' && t.pago).reduce((s, t) => s + t.valor_final, 0);
    const despesasPagas = transactions.filter(t => t.tipo === 'Despesa' && t.pago).reduce((s, t) => s + t.valor_final, 0);
    return { receitas, despesas, saldo: saldoInicial + receitasPagas - despesasPagas };
  }, [transactions, accounts, calRangeStart, calRangeEnd, calSelectedDate]);

  const vencimentoStats = useMemo(() => {
    const despesasVencendo = transactions.filter(t => t.tipo === 'Despesa' && inSelectedPeriod(t.vencimento));
    return {
      count: despesasVencendo.length,
      valor: despesasVencendo.reduce((s, t) => s + t.valor_final, 0),
      totalPago: despesasVencendo.reduce((s, t) => s + t.total_pago, 0),
    };
  }, [transactions, calRangeStart, calRangeEnd, calSelectedDate]);

  const accountBalances = useMemo(() => {
    return accounts.map(a => {
      const txs = transactions.filter(t => t.account_id === a.id && t.pago);
      const r = txs.filter(t => t.tipo === 'Receita').reduce((s, t) => s + t.valor_final, 0);
      const d = txs.filter(t => t.tipo === 'Despesa').reduce((s, t) => s + t.valor_final, 0);
      return { ...a, saldo: (a.saldo_inicial ?? 0) + r - d };
    });
  }, [accounts, transactions]);

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

  const today = new Date();
  const calMonthLabel = calViewDate.toLocaleDateString('pt-BR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())
    + ' ' + calViewDate.getFullYear();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#FFE500] dark:bg-[#252520] border border-[#D4C000] dark:border-white/[0.07] rounded-[20px] px-6 py-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-[52px] h-[52px] rounded-[14px] bg-[rgba(26,26,10,0.09)] dark:bg-[rgba(216,30,30,0.13)] flex items-center justify-center text-[#1A1A0E] dark:text-primary shrink-0">
            <Wallet size={24} strokeWidth={2} />
          </div>
          <div>
            <div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[rgba(26,26,10,0.40)] dark:text-white/[0.28]">Gestão Financeira</div>
            <h1 className="text-[26px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] tracking-tight leading-tight">Controle Financeiro</h1>
          </div>
        </div>

        <button
          onClick={() => {
            setFinanceView(v => {
              if (v === 'main') fetchFavorecidos();
              return v === 'main' ? 'dados' : 'main';
            });
          }}
          className={cn(
            'flex items-center gap-2 px-[18px] py-2.5 rounded-xl text-sm font-bold uppercase tracking-wide transition-all active:scale-[0.97]',
            financeView === 'dados'
              ? 'bg-[rgba(26,26,10,0.10)] dark:bg-white/10 text-[#1A1A0E] dark:text-[#F2F0E3]'
              : 'bg-primary text-on-primary shadow-lg shadow-primary/20 hover:opacity-90'
          )}
          style={{ transition: 'opacity 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1), background-color 160ms' }}
        >
          {financeView === 'dados' ? <ArrowLeft size={16} /> : <Database size={16} />}
          {financeView === 'dados' ? 'Voltar' : 'Dados'}
        </button>
      </div>

      {financeView === 'dados' ? (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', alignItems: 'start' }}>
          {/* Contas */}
          <div className="bg-surface-container-low border border-on-surface/[0.07] rounded-[18px] overflow-hidden flex flex-col">
            <div className="bg-[#FFE500] dark:bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-4 py-2.5 flex items-center justify-between gap-2.5">
              <span className="flex items-center gap-2 text-[13px] font-black text-[#1A1A0E]">
                <Building2 size={15} />
                Contas
                <span className="bg-[rgba(26,26,10,0.10)] text-[rgba(26,26,10,0.55)] rounded-full px-2 py-0.5 text-[9px] font-black tracking-wide">{accounts.length}</span>
              </span>
              <button
                onClick={openAddAccount}
                className="w-[27px] h-[27px] rounded-[9px] bg-primary text-on-primary flex items-center justify-center shadow-[0_3px_10px_rgba(216,30,30,0.28)] active:scale-[0.93] transition-transform"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {accounts.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-on-surface/25">
                  <Building2 size={32} className="mb-2" />
                  <p className="text-sm font-bold">Nenhuma conta cadastrada</p>
                </div>
              ) : (
                accounts.map(acc => (
                  <div key={acc.id} className="bg-surface border-[1.5px] border-on-surface/[0.08] rounded-[14px] px-3.5 py-3 flex items-center gap-3 hover:bg-on-surface/[0.02] transition-colors">
                    {acc.imagem_url ? (
                      <img src={acc.imagem_url} alt={acc.nome} className="w-10 h-10 rounded-[11px] object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-[11px] bg-primary/[0.09] flex items-center justify-center text-[13px] font-black text-primary shrink-0">
                        {acc.nome.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-extrabold text-on-surface truncate">{acc.nome}</p>
                      <p className="font-['DM_Mono',monospace] text-[10px] text-on-surface/45 truncate mt-0.5">
                        {acc.banco}{acc.agencia && ` · Ag ${acc.agencia}`}{acc.numero_conta && ` · CC ${acc.numero_conta}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className="text-[8px] font-black uppercase tracking-widest text-on-surface/25">Saldo inicial</span>
                      <span className="font-['DM_Mono',monospace] text-[12.5px] text-emerald-600 dark:text-emerald-400">{fmt(acc.saldo_inicial ?? 0)}</span>
                    </div>
                    <div className="flex gap-0.5 shrink-0 ml-1">
                      <button onClick={() => openEditAccount(acc)} title="Editar" className="w-[27px] h-[27px] rounded-lg flex items-center justify-center text-on-surface/35 hover:bg-primary/10 hover:text-primary transition-colors">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => handleDeleteAccount(acc.id)} title="Excluir" className="w-[27px] h-[27px] rounded-lg flex items-center justify-center text-on-surface/35 hover:bg-rose-500/10 hover:text-rose-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Favorecidos */}
          <div className="bg-surface-container-low border border-on-surface/[0.07] rounded-[18px] overflow-hidden flex flex-col">
            <div className="bg-[#FFE500] dark:bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-4 py-2.5 flex items-center justify-between gap-2.5">
              <span className="flex items-center gap-2 text-[13px] font-black text-[#1A1A0E]">
                <Users size={15} />
                Favorecidos
                <span className="bg-[rgba(26,26,10,0.10)] text-[rgba(26,26,10,0.55)] rounded-full px-2 py-0.5 text-[9px] font-black tracking-wide">{favorecidos.length}</span>
              </span>
              <button
                onClick={openFavorecidoModal}
                className="w-[27px] h-[27px] rounded-[9px] bg-primary text-on-primary flex items-center justify-center shadow-[0_3px_10px_rgba(216,30,30,0.28)] active:scale-[0.93] transition-transform"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="p-3 flex flex-col gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
                <input
                  value={dadosFavSearch}
                  onChange={e => setDadosFavSearch(e.target.value)}
                  placeholder="Buscar favorecido..."
                  className="w-full pl-8 pr-3 py-2 bg-surface rounded-[11px] text-sm text-on-surface placeholder:text-on-surface/30 border-[1.5px] border-on-surface/[0.08] focus:outline-none focus:border-primary/50"
                />
              </div>
              {favorecidos.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-on-surface/25">
                  <Users size={32} className="mb-2" />
                  <p className="text-sm font-bold">Nenhum favorecido cadastrado</p>
                </div>
              ) : (
                favorecidos
                  .filter(f => !dadosFavSearch || f.nome_fiscal.toLowerCase().includes(dadosFavSearch.toLowerCase()))
                  .map(f => (
                    <div key={f.id} className="bg-surface border-[1.5px] border-on-surface/[0.08] rounded-[14px] px-3.5 py-2.5 flex items-center gap-3 hover:bg-on-surface/[0.02] transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-on-surface truncate">{f.nome_fiscal}</p>
                        {f.nome_banco ? (
                          <p className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[8px] font-black uppercase tracking-widest text-on-surface/25">Extrato</span>
                            <span className="font-['DM_Mono',monospace] text-[10px] text-on-surface/45 truncate">{f.nome_banco}</span>
                          </p>
                        ) : (
                          <p className="text-[10px] italic text-on-surface/25 mt-0.5">sem mapeamento de extrato</p>
                        )}
                      </div>
                      <button onClick={() => handleDeleteFavorecido(f.id)} title="Excluir" className="w-[27px] h-[27px] rounded-lg flex items-center justify-center text-on-surface/35 hover:bg-rose-500/10 hover:text-rose-500 transition-colors shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      ) : (<>

      {/* Calendar + Resultados/Contas */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', alignItems: 'start', flexShrink: 0 }}>

        {/* Mini Calendar */}
        <div className="bg-surface-container-low border border-on-surface/[0.07] rounded-[18px] overflow-hidden flex flex-col">
          <div className="bg-[#FFE500] dark:bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-4 py-2.5 flex items-center justify-between gap-2.5">
            <span className="text-[13px] font-black text-[#1A1A0E] capitalize whitespace-nowrap">{calMonthLabel}</span>

            <div className="flex gap-1 flex-shrink-0">
              <div className="relative" ref={calLegendRef}>
                <button
                  onClick={() => setCalLegendOpen(v => !v)}
                  className={cn(
                    'w-[26px] h-[26px] rounded-[8px] flex items-center justify-center transition-colors',
                    calLegendOpen
                      ? 'bg-[#1A1A0E]/14 text-[#1A1A0E]'
                      : 'bg-[rgba(26,26,10,0.08)] text-[rgba(26,26,10,0.55)] hover:bg-[rgba(26,26,10,0.14)]',
                  )}
                  title="Legenda"
                >
                  <Info size={12} strokeWidth={2.5} />
                </button>
                <AnimatePresence>
                  {calLegendOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
                      className="absolute left-0 top-[30px] z-20 w-[188px] bg-surface border border-on-surface/10 rounded-xl shadow-lg p-2.5 flex flex-col gap-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 shrink-0" />
                        <span className="text-[10.5px] font-bold text-on-surface/70">Lançamento</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        <span className="text-[10.5px] font-bold text-on-surface/70">Vencimento</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full ring-[1.5px] ring-amber-500 shrink-0 flex items-center justify-center">
                          <AlertTriangle size={7} strokeWidth={3} className="text-amber-500" />
                        </span>
                        <span className="text-[10.5px] font-bold text-on-surface/70">Vencido, não pago</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-emerald-600 shrink-0 flex items-center justify-center">
                          <Check size={7} strokeWidth={3.5} className="text-white" />
                        </span>
                        <span className="text-[10.5px] font-bold text-on-surface/70">Vencimento(s) pago(s)</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <button
                onClick={() => {
                  if (calRangeMode) {
                    setCalRangeMode(false);
                    setCalRangeStart(null);
                    setCalRangeEnd(null);
                  } else {
                    setCalRangeMode(true);
                    setCalSelectedDate(null);
                  }
                }}
                className={cn(
                  'w-[26px] h-[26px] rounded-[8px] flex items-center justify-center transition-colors',
                  calRangeMode
                    ? 'bg-[#D81E1E] text-white hover:opacity-90'
                    : 'bg-[rgba(26,26,10,0.08)] text-[rgba(26,26,10,0.55)] hover:bg-[rgba(26,26,10,0.14)]',
                )}
              >
                <Filter size={12} strokeWidth={2.5} />
              </button>
              <button
                onClick={() => setCalViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                className="w-[26px] h-[26px] rounded-[8px] bg-[rgba(26,26,10,0.08)] flex items-center justify-center text-[rgba(26,26,10,0.55)] hover:bg-[rgba(26,26,10,0.14)] transition-colors"
              >
                <ChevronLeft size={12} strokeWidth={2.5} />
              </button>
              <button
                onClick={() => setCalViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                className="w-[26px] h-[26px] rounded-[8px] bg-[rgba(26,26,10,0.08)] flex items-center justify-center text-[rgba(26,26,10,0.55)] hover:bg-[rgba(26,26,10,0.14)] transition-colors"
              >
                <ChevronRight size={12} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="p-3">
            <div className="grid grid-cols-7 mb-1">
              {['D','S','T','Q','Q','S','S'].map((d, i) => (
                <div key={i} className="text-center text-[8.5px] font-black uppercase tracking-wide text-on-surface/25 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {calDays.map((cell, i) => {
                const isToday = cell.type === 'curr'
                  && cell.day === today.getDate()
                  && calViewDate.getMonth() === today.getMonth()
                  && calViewDate.getFullYear() === today.getFullYear();
                const isSelected = !calRangeMode && calSelectedDate !== null
                  && cell.type === 'curr'
                  && cell.day === calSelectedDate.getDate()
                  && calViewDate.getMonth() === calSelectedDate.getMonth()
                  && calViewDate.getFullYear() === calSelectedDate.getFullYear();
                const cellIso = cell.type === 'curr' ? toIsoDay(new Date(calViewDate.getFullYear(), calViewDate.getMonth(), cell.day)) : null;
                const rangeStartIso = calRangeStart ? toIsoDay(calRangeStart) : null;
                const rangeEndIso = calRangeEnd ? toIsoDay(calRangeEnd) : null;
                const isRangeEndpoint = cellIso !== null && (cellIso === rangeStartIso || cellIso === rangeEndIso);
                const isInRange = cellIso !== null && rangeStartIso !== null && rangeEndIso !== null
                  && cellIso > rangeStartIso && cellIso < rangeEndIso;
                return (
                  <button
                    key={i}
                    disabled={cell.type !== 'curr'}
                    onClick={() => {
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
                      setCalSelectedDate(isSelected ? null : cellDate);
                    }}
                    className={cn(
                      'h-[26px] flex items-center justify-center text-[10.5px] font-bold rounded-[8px] relative transition-all duration-[120ms]',
                      cell.type !== 'curr' && 'text-on-surface/20 cursor-default',
                      cell.type === 'curr' && !isToday && !isSelected && !isRangeEndpoint && !isInRange && 'text-on-surface/55 hover:bg-on-surface/5 cursor-pointer',
                      isToday && !isSelected && !isRangeEndpoint && !isInRange && 'bg-primary/10 text-primary font-black',
                      isSelected && 'bg-primary text-white font-black shadow-[0_2px_6px_rgba(216,30,30,0.30)]',
                      isRangeEndpoint && 'bg-primary text-white font-black shadow-[0_2px_6px_rgba(216,30,30,0.30)]',
                      isInRange && 'bg-primary/15 text-primary font-bold',
                      cell.overdue && !isSelected && !isRangeEndpoint && 'ring-[1.5px] ring-amber-500',
                    )}
                  >
                    {cell.day}
                    {(cell.hasLancamento || cell.hasVencimento) && !isSelected && !isRangeEndpoint && (
                      <span className="absolute bottom-[2px] left-1/2 -translate-x-1/2 flex items-center gap-[2px]">
                        {cell.hasLancamento && (
                          <span className={cn('w-1 h-1 rounded-full', isToday ? 'bg-white/70' : 'bg-blue-500 dark:bg-blue-400')} />
                        )}
                        {cell.hasVencimento && (
                          <span className={cn('w-1 h-1 rounded-full', isToday ? 'bg-white/70' : 'bg-primary')} />
                        )}
                      </span>
                    )}
                    {(cell.overdue || cell.allPaid) && (
                      <span className={cn(
                        'absolute -top-[5px] -right-[5px] w-[13px] h-[13px] rounded-full flex items-center justify-center border-[1.5px] border-surface-container-low',
                        cell.overdue ? 'bg-amber-500' : 'bg-emerald-600',
                      )}>
                        {cell.overdue
                          ? <AlertTriangle size={8} strokeWidth={3} className="text-white" />
                          : <Check size={8} strokeWidth={3.5} className="text-white" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Range selection hint */}
            {calRangeMode && !(calRangeStart && calRangeEnd) && (
              <div className="mt-2.5 flex items-center gap-1 bg-on-surface/[0.05] border border-on-surface/10 rounded-[10px] px-2.5 py-1.5">
                <span className="text-[9.5px] font-bold text-on-surface/50 leading-none">
                  {!calRangeStart ? 'Selecione o dia inicial do período' : 'Selecione o dia final do período'}
                </span>
              </div>
            )}

            {/* Active filter badge */}
            {(calSelectedDate || (calRangeStart && calRangeEnd)) && (
              <div className="mt-2.5 flex items-center justify-between gap-1 bg-primary/[0.07] dark:bg-primary/[0.12] border border-primary/20 rounded-[10px] px-2.5 py-1.5">
                <span className="text-[9.5px] font-bold text-primary leading-none">
                  {calRangeStart && calRangeEnd
                    ? `Período: ${calRangeStart.toLocaleDateString('pt-BR')} – ${calRangeEnd.toLocaleDateString('pt-BR')}`
                    : `Data: ${calSelectedDate!.toLocaleDateString('pt-BR')}`}
                </span>
                <button
                  onClick={() => {
                    setCalSelectedDate(null);
                    setCalRangeMode(false);
                    setCalRangeStart(null);
                    setCalRangeEnd(null);
                  }}
                  className="text-primary/60 hover:text-primary transition-colors shrink-0"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Painel Resultados / Contas */}
        <div className="bg-surface-container-low border border-on-surface/[0.07] rounded-[18px] overflow-hidden flex flex-col">
          <div className="bg-[#FFE500] dark:bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-4 py-2.5 flex items-center">
            <div className="flex-1 flex gap-0.5 bg-[rgba(26,26,10,0.10)] rounded-full p-[2px]">
              {(['resultados', 'contas'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setFinancePanelTab(tab)}
                  className={cn(
                    'flex-1 px-2 py-[6px] rounded-full text-[9.5px] font-black uppercase tracking-[0.08em] transition-all duration-150 whitespace-nowrap',
                    financePanelTab === tab
                      ? 'bg-[#D81E1E] text-white shadow-sm'
                      : 'text-[rgba(26,26,10,0.45)] hover:text-[rgba(26,26,10,0.70)]',
                  )}
                >
                  {tab === 'resultados' ? 'Resultados' : 'Contas'}
                </button>
              ))}
            </div>
          </div>

          <div className="p-2.5">
            {financePanelTab === 'resultados' ? (
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'Receitas', value: totals.receitas, icon: TrendingUp,   iconCls: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', valCls: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Despesas', value: totals.despesas, icon: TrendingDown, iconCls: 'bg-rose-500/10 dark:bg-[rgba(216,30,30,0.13)]', iconColor: 'text-rose-600 dark:text-[#D81E1E]', valCls: 'text-rose-600 dark:text-[#D81E1E]' },
                  { label: 'Saldo',    value: totals.saldo,   icon: Wallet,        iconCls: totals.saldo >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10 dark:bg-[rgba(216,30,30,0.13)]', iconColor: totals.saldo >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-[#D81E1E]', valCls: totals.saldo >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-[#D81E1E]' },
                ].map(({ label, value, icon: Icon, iconCls, iconColor, valCls }) => (
                  <div key={label} className="bg-surface-container border border-on-surface/[0.07] rounded-[12px] px-2.5 py-2 flex items-center gap-2">
                    <div className={cn('w-6 h-6 rounded-[8px] flex items-center justify-center shrink-0', iconCls)}>
                      <Icon size={12} strokeWidth={2.3} className={iconColor} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[7.5px] font-black uppercase tracking-[0.11em] text-on-surface/40 whitespace-nowrap">{label}</div>
                      <div className={cn('text-[13px] font-black tracking-tight leading-tight truncate', valCls)}>{fmt(value)}</div>
                    </div>
                  </div>
                ))}

                <div className="bg-surface-container border border-on-surface/[0.07] rounded-[12px] px-2.5 py-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[8px] bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
                    <Clock size={12} strokeWidth={2.3} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[7.5px] font-black uppercase tracking-[0.11em] text-on-surface/40 whitespace-nowrap">Vencimento</div>
                    <div className="text-[13px] font-black tracking-tight leading-tight truncate text-rose-600 dark:text-[#D81E1E]">{fmt(vencimentoStats.valor)}</div>
                    <div className="text-[8px] font-bold text-on-surface/35 whitespace-nowrap">
                      {vencimentoStats.count} {vencimentoStats.count === 1 ? 'movimentação' : 'movimentações'}
                    </div>
                  </div>
                </div>

                <div className="col-span-2 bg-surface-container border border-on-surface/[0.07] rounded-[12px] px-2.5 py-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[8px] bg-emerald-500/10 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={12} strokeWidth={2.3} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[7.5px] font-black uppercase tracking-[0.11em] text-on-surface/40 whitespace-nowrap">Total Pago</div>
                    <div className="text-[13px] font-black tracking-tight leading-tight truncate text-emerald-600 dark:text-emerald-400">{fmt(vencimentoStats.totalPago)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 px-0.5 pb-0.5">
                  <div className="w-6 h-6 rounded-[7px] bg-on-surface/[0.06] dark:bg-white/[0.06] flex items-center justify-center text-on-surface/45 shrink-0">
                    <CreditCard size={12} strokeWidth={2.2} />
                  </div>
                  <span className="text-[9.5px] font-black uppercase tracking-[0.13em] text-on-surface/50">Contas</span>
                </div>

                {accountBalances.length === 0 ? (
                  <div className="bg-surface-container border border-on-surface/[0.07] rounded-[12px] flex items-center justify-center py-6">
                    <p className="text-[11px] font-bold text-on-surface/25 text-center px-4">Nenhuma conta cadastrada</p>
                  </div>
                ) : (
                  accountBalances.map(a => (
                    <div key={a.id} className="bg-surface-container border border-on-surface/[0.07] rounded-[12px] px-3 py-2.5 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-[9px] bg-primary/[0.08] dark:bg-primary/[0.12] flex items-center justify-center shrink-0 text-primary">
                        <CreditCard size={13} strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10.5px] font-extrabold text-on-surface truncate">{a.nome}</p>
                        <p className="text-[9px] font-semibold text-on-surface/40 truncate mt-0.5">{a.banco}</p>
                      </div>
                      <p className={cn('text-[12px] font-black shrink-0 tracking-tight', a.saldo >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                        {fmt(a.saldo)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar favorecido..."
            className="pl-8 pr-4 py-2 bg-surface-container-low rounded-xl text-sm text-on-surface placeholder:text-on-surface/30 border border-on-surface/5 focus:outline-none focus:border-primary/50 w-48"
          />
        </div>

        <button
          onClick={() => {
            const next = !columnFiltersEnabled;
            setColumnFiltersEnabled(next);
            if (!next) { setColumnFilters({}); setFilterOpenKey(null); setFilterSearchQuery(''); }
          }}
          title={columnFiltersEnabled ? 'Desativar filtros' : 'Filtrar por coluna'}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border transition-all',
            columnFiltersEnabled
              ? 'bg-primary text-white border-primary shadow-md'
              : 'bg-surface-container-low border-on-surface/5 text-on-surface/60 hover:bg-on-surface/5',
            Object.values(columnFilters).some(s => s.size > 0) && !columnFiltersEnabled && 'ring-2 ring-primary/40',
          )}
        >
          <Filter size={14} />
          Filtrar colunas
        </button>

        <button
          onClick={openAddTx}
          title="Nova Movimentação"
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary text-on-primary shadow-md shadow-primary/20 hover:opacity-90 active:scale-[0.97] transition-all"
        >
          <Plus size={16} />
        </button>

        <button
          onClick={toggleSelectionMode}
          title={selectionMode ? 'Cancelar seleção' : 'Selecionar'}
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center border transition-colors',
            selectionMode
              ? 'bg-on-surface/10 text-on-surface border-on-surface/20 hover:bg-on-surface/15'
              : 'bg-surface-container-low border-on-surface/5 text-on-surface/60 hover:bg-on-surface/5'
          )}
        >
          <CheckSquare size={16} />
        </button>

        {tags.length > 0 && (
          <button
            onClick={() => setShowTagGuide(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-bold border border-on-surface/10 bg-surface-container-low text-on-surface/50 hover:bg-on-surface/5 transition-colors"
          >
            <BookOpen size={13} />
            Guia de tags
          </button>
        )}
      </div>

      {/* Selection action bar */}
      <AnimatePresence>
        {deleteError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl px-4 py-3"
          >
            <span className="text-sm text-rose-600 flex-1">{deleteError}</span>
            <button onClick={() => setDeleteError('')} className="text-rose-400 hover:text-rose-600">
              <X size={14} />
            </button>
          </motion.div>
        )}
        {selectionMode && selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-2xl px-4 py-3"
          >
            <span className="text-sm font-bold text-primary flex-1">
              {selectedIds.size} {selectedIds.size === 1 ? 'movimentação selecionada' : 'movimentações selecionadas'}
            </span>
            <button
              onClick={selectAll}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide bg-surface-container border border-on-surface/10 text-on-surface hover:bg-on-surface/5 transition-colors"
            >
              <CheckSquare size={13} />
              Selecionar Tudo
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={deletingSelected}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide bg-rose-500 text-white hover:bg-rose-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {deletingSelected
                ? <Loader2 size={13} className="animate-spin" />
                : <Trash2 size={13} />}
              {deletingSelected ? 'Excluindo...' : `Excluir (${selectedIds.size})`}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="bg-surface-container-low/80 rounded-2xl border border-on-surface/5 overflow-hidden">
        {loadingData ? (
          <div className="flex items-center justify-center py-20 gap-3 text-on-surface/30">
            <Loader2 size={24} className="animate-spin" />
            <span className="text-sm font-semibold">Carregando...</span>
          </div>
        ) : (
          <div className="overflow-x-auto [&_tbody_td]:border-r [&_tbody_td]:border-on-surface/[0.04] dark:[&_tbody_td]:border-white/[0.03] [&_tbody_td:last-child]:border-r-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-on-surface/[0.07]">
                  {selectionMode && (
                    <th className="px-3 py-3 w-10" />
                  )}
                  {TABLE_COLUMNS.map(({ label, key }) => {
                    const hasFilter = (columnFilters[key]?.size ?? 0) > 0;
                    const isOpen = columnFiltersEnabled && filterOpenKey === key;
                    const uniqueVals = isOpen ? getColumnUniqueValues(key) : [];
                    const selected = columnFilters[key] ?? new Set<string>();
                    const searchLower = filterSearchQuery.toLowerCase();
                    const displayed = searchLower ? uniqueVals.filter(v => v.toLowerCase().includes(searchLower)) : uniqueVals;
                    return (
                      <th key={label || 'actions'} className="px-3 py-3 text-left whitespace-nowrap relative">
                        {label ? (
                          <div className="inline-flex items-center gap-1">
                            <span
                              onClick={columnFiltersEnabled && key ? () => { setFilterOpenKey(prev => prev === key ? null : key); setFilterSearchQuery(''); } : undefined}
                              title={columnFiltersEnabled && key ? (hasFilter ? 'Filtro ativo' : 'Filtrar') : undefined}
                              className={cn(
                                'inline-flex items-center bg-[rgba(26,26,10,0.05)] dark:bg-[rgba(242,240,227,0.05)] rounded-full px-[13px] py-[5px] text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.50)] dark:text-[rgba(242,240,227,0.40)] whitespace-nowrap border-[1.5px] transition-colors',
                                columnFiltersEnabled
                                  ? cn('border-[#D81E1E]/45', key && 'cursor-pointer', hasFilter && 'text-[#D81E1E] dark:text-[#D81E1E]')
                                  : 'border-[rgba(26,26,10,0.10)] dark:border-[rgba(242,240,227,0.10)]',
                              )}
                            >
                              {label}
                            </span>
                            {isOpen && key && (<>
                              <div className="fixed inset-0 z-[90]" onClick={() => { setFilterOpenKey(null); setFilterSearchQuery(''); }} />
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
                                    onClick={e => { e.stopPropagation(); setColumnFilters(prev => ({ ...prev, [key]: new Set(uniqueVals) })); }}
                                    className="text-[10px] font-bold text-on-surface/40 hover:text-on-surface/70 transition-colors"
                                  >
                                    Selecionar tudo
                                  </button>
                                  <span className="text-on-surface/15">·</span>
                                  <button
                                    onClick={e => { e.stopPropagation(); setColumnFilters(prev => { const n = { ...prev }; delete n[key]; return n; }); }}
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
                                            setColumnFilters(prev => {
                                              const cur = new Set<string>(prev[key] ?? []);
                                              if (checked) cur.delete(val); else cur.add(val);
                                              const nxt = { ...prev };
                                              if (cur.size === 0) delete nxt[key]; else nxt[key] = cur;
                                              return nxt;
                                            });
                                          }}
                                        />
                                        <span className="text-[11px] font-medium normal-case text-on-surface/70 truncate" title={val}>{val}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            </>)}
                          </div>
                        ) : null}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={selectionMode ? 13 : 12} className="px-4 py-16 text-center">
                      <Wallet size={40} className="mx-auto mb-3 text-on-surface/20" />
                      <p className="font-bold text-on-surface/30">Nenhuma movimentação encontrada</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(t => {
                    const restante = t.valor_final - t.total_pago;
                    const isSelected = selectedIds.has(t.id);
                    return (
                      <tr
                        key={t.id}
                        onClick={selectionMode ? () => toggleSelectRow(t.id) : undefined}
                        className={cn(
                          'border-b border-on-surface/5 transition-colors',
                          selectionMode ? 'cursor-pointer' : 'hover:bg-on-surface/[0.02]',
                          isSelected ? 'bg-primary/10 hover:bg-primary/15' : selectionMode ? 'hover:bg-on-surface/[0.03]' : '',
                          t.pago && !isSelected && 'opacity-60'
                        )}
                      >
                        {selectionMode && (
                          <td className="px-4 py-3 w-10">
                            <div className={cn(
                              'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all',
                              isSelected ? 'bg-primary border-primary' : 'border-on-surface/20'
                            )}>
                              {isSelected && <Check size={12} className="text-on-primary" />}
                            </div>
                          </td>
                        )}
                        <td className="px-4 py-3 whitespace-nowrap text-on-surface/70">{fmtDate(t.data)}</td>
                        <td className="px-4 py-3">
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide',
                            t.tipo === 'Receita'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          )}>
                            {t.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-on-surface/70">
                          {t.tipo_pagamento}
                          {t.tipo_pagamento === 'Cheque' && t.numero_cheque && (
                            <span className="ml-1.5 text-[10px] font-bold text-on-surface/40 bg-on-surface/[0.06] rounded px-1.5 py-0.5">
                              #{t.numero_cheque}
                            </span>
                          )}
                          {t.vencimento && (
                            <span className="ml-1.5 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 rounded-full bg-primary/10 dark:bg-primary/15 text-[9.5px] font-black text-primary align-middle">
                              {t.numero_parcela ?? 1}/{t.total_parcelas ?? 1}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-on-surface">{t.favorecido}</td>
                        <td className="px-4 py-3 text-on-surface/70">{t.estabelecimento}</td>
                        <td className="px-4 py-3">
                          {(t.tag_ids ?? []).length === 0 ? (
                            <span className="text-[10px] italic text-on-surface/25">sem tag</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {(t.tag_ids ?? []).map(tid => {
                                const tag = tags.find(tg => tg.id === tid);
                                if (!tag) return null;
                                const c = TAG_COLOR_MAP[tag.cor] ?? TAG_COLOR_MAP.gray;
                                return (
                                  <span key={tid} className={cn(
                                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border',
                                    c.bg, c.text, 'border', c.border, c.bgDark, c.textDark, c.borderDark
                                  )}>
                                    {tag.nome}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-on-surface/70">{fmtDate(t.vencimento)}</td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-on-surface">
                          {fmt(t.valor_final)}
                          {getParcelaGroupTotal(t) !== null && (
                            <span className="block text-[9.5px] font-medium text-on-surface/35 mt-0.5">
                              de {fmt(getParcelaGroupTotal(t)!)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-emerald-500">{fmt(t.total_pago)}</td>
                        <td className={cn('px-4 py-3 whitespace-nowrap font-semibold', restante > 0 ? 'text-rose-500' : 'text-emerald-500')}>
                          {fmt(restante)}
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => togglePago(t.id)}
                            className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all',
                              t.pago ? 'bg-primary border-primary' : 'border-on-surface/20 hover:border-primary/50'
                            )}
                          >
                            {t.pago && <Check size={12} className="text-on-primary" />}
                          </button>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditTx(t)} className="w-7 h-7 rounded-lg hover:bg-on-surface/5 flex items-center justify-center text-on-surface/40 hover:text-primary transition-colors">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleDeleteTx(t.id)} className="w-7 h-7 rounded-lg hover:bg-rose-500/10 flex items-center justify-center text-on-surface/40 hover:text-rose-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>)}

      {/* ── Transaction Modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showTxModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowTxModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-low rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-manrope font-extrabold text-on-surface">
                  {editingId ? 'Editar Movimentação' : 'Nova Movimentação'}
                </h2>
                <button onClick={() => setShowTxModal(false)} className="w-8 h-8 rounded-xl hover:bg-on-surface/5 flex items-center justify-center text-on-surface/40">
                  <X size={16} />
                </button>
              </div>

              {/* Tabs: Receita / Despesa */}
              <div className="flex gap-2 mb-5">
                {(['Receita', 'Despesa'] as TransactionType[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => {
                      setTxForm(f => ({ ...f, tipo: tab }));
                      setParcelasEnabled(false);
                      setParcelas([]);
                      setEditingGroupIds(null);
                    }}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-sm font-bold transition-all',
                      txForm.tipo === tab
                        ? tab === 'Receita'
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                          : 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                        : 'bg-on-surface/5 text-on-surface/50 hover:bg-on-surface/10'
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-4">

                {/* ── RECEITA ───────────────────────────────────────────── */}
                {txForm.tipo === 'Receita' && (<>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Data</label>
                    <input type="date" value={txForm.data} onChange={e => setTxForm(f => ({ ...f, data: e.target.value }))} className={inputCls} />
                  </div>

                  {/* Vencimento / Parcelas — 1 parcela = pagamento único com vencimento */}
                  {renderParcelasSection()}

                  {/* Favorecido — custom combobox */}
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Favorecido</label>
                    <div className="flex gap-2 items-stretch">
                      <div className="relative flex-1" ref={txForm.tipo === 'Receita' ? favRef : undefined}>
                        <input
                          value={txForm.favorecido}
                          onChange={e => { setTxForm(f => ({ ...f, favorecido: e.target.value })); setFavOpen(true); }}
                          onFocus={() => setFavOpen(true)}
                          placeholder="Digite para buscar..."
                          className={inputCls}
                          autoComplete="off"
                        />
                        <AnimatePresence>
                          {favOpen && txForm.tipo === 'Receita' && (
                            <motion.ul
                              initial={{ opacity: 0, y: -4, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -4, scale: 0.98 }}
                              transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
                              className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#2a2a24] border border-on-surface/10 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto"
                            >
                              {favorecidos
                                .filter(fv => !txForm.favorecido || fv.nome_fiscal.toLowerCase().includes(txForm.favorecido.toLowerCase()))
                                .map(fv => (
                                  <li
                                    key={fv.id}
                                    onMouseDown={() => { setTxForm(f => ({ ...f, favorecido: fv.nome_fiscal })); setFavOpen(false); }}
                                    className="px-3 py-2.5 text-sm text-on-surface/90 hover:bg-on-surface/10 cursor-pointer transition-colors"
                                  >
                                    <span className="font-semibold">{fv.nome_fiscal}</span>
                                    {fv.nome_banco && <span className="ml-2 text-xs text-on-surface/40">{fv.nome_banco}</span>}
                                  </li>
                                ))}
                              {favorecidos.filter(fv => !txForm.favorecido || fv.nome_fiscal.toLowerCase().includes(txForm.favorecido.toLowerCase())).length === 0 && (
                                <li className="px-3 py-2.5 text-sm text-on-surface/40 italic">Nenhum resultado</li>
                              )}
                            </motion.ul>
                          )}
                        </AnimatePresence>
                      </div>
                      <button
                        type="button"
                        onClick={openFavorecidoModal}
                        title="Cadastrar favorecido"
                        className="shrink-0 w-9 h-9 self-center flex items-center justify-center rounded-xl bg-on-surface/8 border border-on-surface/10 text-on-surface/60 hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-[0.93] transition-all"
                        style={{ transition: 'all 160ms cubic-bezier(0.23,1,0.32,1)' }}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                  {/* Conta */}
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Conta</label>
                    <div className="flex gap-2 items-stretch">
                      <select value={txForm.account_id ?? ''} onChange={e => setTxForm(f => ({ ...f, account_id: e.target.value || null }))} className={cn(inputCls, 'flex-1')}>
                        <option value="">Selecione a conta...</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.nome} — {a.banco}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={openAddAccount}
                        title="Cadastrar conta"
                        className="shrink-0 w-9 h-9 self-center flex items-center justify-center rounded-xl bg-on-surface/8 border border-on-surface/10 text-on-surface/60 hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-[0.93] transition-all"
                        style={{ transition: 'all 160ms cubic-bezier(0.23,1,0.32,1)' }}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Estabelecimento</label>
                    <select value={txForm.estabelecimento} onChange={e => setTxForm(f => ({ ...f, estabelecimento: e.target.value }))} className={inputCls}>
                      {ESTABLISHMENTS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Valor (R$)</label>
                    {parcelasEnabled ? (
                      <div className={cn(inputCls, 'bg-on-surface/5 text-on-surface/60 select-none')}>
                        {totalParcelas > 0 ? fmt(totalParcelas) : 'Soma das parcelas'}
                      </div>
                    ) : (
                      <input type="number" step="0.01" min="0" value={txForm.valor_final || ''} onChange={e => setTxForm(f => ({ ...f, valor_final: parseFloat(e.target.value) || 0 }))} placeholder="0,00" className={inputCls} />
                    )}
                  </div>
                </>)}

                {/* ── DESPESA ───────────────────────────────────────────── */}
                {txForm.tipo === 'Despesa' && (<>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Data</label>
                    <input type="date" value={txForm.data} onChange={e => setTxForm(f => ({ ...f, data: e.target.value }))} className={inputCls} />
                  </div>

                  {/* Tipo de Pagamento */}
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
                  {renderParcelasSection()}

                  {/* Favorecido — custom combobox */}
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Favorecido</label>
                    <div className="flex gap-2 items-stretch">
                      <div className="relative flex-1" ref={txForm.tipo === 'Despesa' ? favRef : undefined}>
                        <input
                          value={txForm.favorecido}
                          onChange={e => { setTxForm(f => ({ ...f, favorecido: e.target.value })); setFavOpen(true); }}
                          onFocus={() => setFavOpen(true)}
                          placeholder="Digite para buscar..."
                          className={inputCls}
                          autoComplete="off"
                        />
                        <AnimatePresence>
                          {favOpen && txForm.tipo === 'Despesa' && (
                            <motion.ul
                              initial={{ opacity: 0, y: -4, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -4, scale: 0.98 }}
                              transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
                              className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#2a2a24] border border-on-surface/10 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto"
                            >
                              {favorecidos
                                .filter(fv => !txForm.favorecido || fv.nome_fiscal.toLowerCase().includes(txForm.favorecido.toLowerCase()))
                                .map(fv => (
                                  <li
                                    key={fv.id}
                                    onMouseDown={() => { setTxForm(f => ({ ...f, favorecido: fv.nome_fiscal })); setFavOpen(false); }}
                                    className="px-3 py-2.5 text-sm text-on-surface/90 hover:bg-on-surface/10 cursor-pointer transition-colors"
                                  >
                                    <span className="font-semibold">{fv.nome_fiscal}</span>
                                    {fv.nome_banco && <span className="ml-2 text-xs text-on-surface/40">{fv.nome_banco}</span>}
                                  </li>
                                ))}
                              {favorecidos.filter(fv => !txForm.favorecido || fv.nome_fiscal.toLowerCase().includes(txForm.favorecido.toLowerCase())).length === 0 && (
                                <li className="px-3 py-2.5 text-sm text-on-surface/40 italic">Nenhum resultado</li>
                              )}
                            </motion.ul>
                          )}
                        </AnimatePresence>
                      </div>
                      <button
                        type="button"
                        onClick={openFavorecidoModal}
                        title="Cadastrar favorecido"
                        className="shrink-0 w-9 h-9 self-center flex items-center justify-center rounded-xl bg-on-surface/8 border border-on-surface/10 text-on-surface/60 hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-[0.93] transition-all"
                        style={{ transition: 'all 160ms cubic-bezier(0.23,1,0.32,1)' }}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                  {/* Conta */}
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Conta</label>
                    <div className="flex gap-2 items-stretch">
                      <select value={txForm.account_id ?? ''} onChange={e => setTxForm(f => ({ ...f, account_id: e.target.value || null }))} className={cn(inputCls, 'flex-1')}>
                        <option value="">Selecione a conta...</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.nome} — {a.banco}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={openAddAccount}
                        title="Cadastrar conta"
                        className="shrink-0 w-9 h-9 self-center flex items-center justify-center rounded-xl bg-on-surface/8 border border-on-surface/10 text-on-surface/60 hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-[0.93] transition-all"
                        style={{ transition: 'all 160ms cubic-bezier(0.23,1,0.32,1)' }}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Estabelecimento</label>
                    <select value={txForm.estabelecimento} onChange={e => setTxForm(f => ({ ...f, estabelecimento: e.target.value }))} className={inputCls}>
                      {ESTABLISHMENTS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Valor (R$)</label>
                    {parcelasEnabled ? (
                      <div className={cn(inputCls, 'bg-on-surface/5 text-on-surface/60 select-none')}>
                        {totalParcelas > 0 ? fmt(totalParcelas) : 'Soma das parcelas'}
                      </div>
                    ) : (
                      <input type="number" step="0.01" min="0" value={txForm.valor_final || ''} onChange={e => setTxForm(f => ({ ...f, valor_final: parseFloat(e.target.value) || 0 }))} placeholder="0,00" className={inputCls} />
                    )}
                  </div>
                </>)}
              </div>

              {/* Tags */}
              <div className="mt-4">
                <TagSelector
                  tags={tags}
                  value={txForm.tag_ids ?? []}
                  onChange={ids => setTxForm(f => ({ ...f, tag_ids: ids }))}
                  onCreateTag={(nome, cor) => createTag(nome, cor, '')}
                  parcelCount={parcelasEnabled ? parcelas.length : undefined}
                />
              </div>

              {/* Observações */}
              <div className="flex flex-col gap-1.5 mt-4">
                <label className={labelCls}>Observações</label>
                <textarea
                  value={txForm.observacoes ?? ''}
                  onChange={e => setTxForm(f => ({ ...f, observacoes: e.target.value || null }))}
                  rows={3}
                  placeholder="Comentários sobre esta movimentação... (opcional)"
                  className={cn(inputCls, 'resize-none')}
                />
              </div>

              {/* Notas fiscais vinculadas */}
              <div className="mt-4">
                <LinkedNotesSection
                  variant="desktop"
                  editable
                  txId={editingId}
                  txMeta={{ favorecido: txForm.favorecido, valor_final: txForm.valor_final }}
                  pendingNotes={pendingNotes}
                  onPendingChange={setPendingNotes}
                />
              </div>

              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowTxModal(false)} className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleTxSubmit} disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {editingId ? 'Salvar Alterações' : 'Adicionar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── TagGuide Modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showTagGuide && (
          <TagGuide
            tags={tags}
            useCounts={tagUseCounts}
            onCreate={createTag}
            onUpdate={updateTag}
            onDelete={deleteTag}
            onClose={() => setShowTagGuide(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Bank Account Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAccountModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAccountModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-low rounded-3xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Building2 size={18} className="text-primary" />
                  </div>
                  <h2 className="text-lg font-manrope font-extrabold text-on-surface">
                    {editingAccountId ? 'Editar Conta' : 'Cadastrar Conta'}
                  </h2>
                </div>
                <button onClick={() => setShowAccountModal(false)} className="w-8 h-8 rounded-xl hover:bg-on-surface/5 flex items-center justify-center text-on-surface/40">
                  <X size={16} />
                </button>
              </div>

              {/* Existing accounts list — shown only when adding a new account */}
              {!editingAccountId && accounts.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface/40 mb-2">Contas cadastradas</p>
                  <div className="flex flex-col gap-1.5">
                    {accounts.map(acc => (
                      <div key={acc.id} className="flex items-center justify-between bg-surface-container rounded-xl px-3 py-2.5 border border-on-surface/5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-on-surface truncate">{acc.nome}</p>
                          <p className="text-xs text-on-surface/40">{acc.banco} · Saldo inicial: <span className="font-bold text-emerald-600">{(acc.saldo_inicial ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></p>
                        </div>
                        <button
                          onClick={() => openEditAccount(acc)}
                          className="ml-3 shrink-0 w-7 h-7 rounded-lg hover:bg-on-surface/5 flex items-center justify-center text-on-surface/40 hover:text-primary transition-colors"
                        >
                          <Edit2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="h-px bg-on-surface/5 my-4" />
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface/40 mb-2">Nova conta</p>
                </div>
              )}

              <div className="flex flex-col gap-4">
                {/* Image upload */}
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Imagem da Conta</label>
                  <label className="cursor-pointer group">
                    <input type="file" accept="image/*" className="hidden" onChange={handleAccountImageChange} />
                    {accountForm.imagemPreview ? (
                      <div className="relative w-full h-32 rounded-2xl overflow-hidden border border-on-surface/10">
                        <img src={accountForm.imagemPreview} alt="Preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Upload size={20} className="text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-32 rounded-2xl border-2 border-dashed border-on-surface/10 flex flex-col items-center justify-center gap-2 text-on-surface/30 hover:border-primary/40 hover:text-primary/50 transition-colors">
                        <ImageIcon size={28} />
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
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={accountForm.saldo_inicial}
                      onChange={e => setAccountForm(f => ({ ...f, saldo_inicial: e.target.value }))}
                      placeholder="0,00"
                      className={cn(inputCls, 'pl-9')}
                    />
                  </div>
                  <p className="text-[10px] text-on-surface/30 leading-tight">Saldo disponível na conta em 01/01/2026. Usado como base para o cálculo do saldo real.</p>
                </div>
              </div>

              {accountError && (
                <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 leading-relaxed">
                  {accountError}
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button onClick={() => { setShowAccountModal(false); setAccountError(null); }} className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleAccountSubmit} disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {editingAccountId ? 'Salvar Alterações' : 'Cadastrar Conta'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Favorecidos Dictionary Modal ───────────────────────────────────── */}
      <AnimatePresence>
        {showFavorecidoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowFavorecidoModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-low rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Users size={18} className="text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-manrope font-extrabold text-on-surface leading-tight">Dicionário de Favorecidos</h2>
                    <p className="text-[11px] text-on-surface/40 font-medium">Mapeie nomes do extrato para nomes fiscais</p>
                  </div>
                </div>
                <button onClick={() => setShowFavorecidoModal(false)} className="w-8 h-8 rounded-xl hover:bg-on-surface/5 flex items-center justify-center text-on-surface/40">
                  <X size={16} />
                </button>
              </div>

              {/* Add new */}
              <div className="flex flex-col gap-2 mb-5 shrink-0">
                <input
                  type="text"
                  value={novoNomeBanco}
                  onChange={e => setNovoNomeBanco(e.target.value)}
                  placeholder="Nome no extrato bancário..."
                  className={inputCls}
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={novoFavorecido}
                    onChange={e => setNovoFavorecido(e.target.value)}
                    onKeyUp={e => e.key === 'Enter' && handleAddFavorecido()}
                    placeholder="Nome fiscal do favorecido..."
                    className={inputCls}
                  />
                  <button
                    onClick={handleAddFavorecido}
                    disabled={savingFavorecido || !novoFavorecido.trim()}
                    className="shrink-0 w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-40"
                  >
                    {savingFavorecido
                      ? <Loader2 size={16} className="animate-spin" />
                      : <Plus size={16} />
                    }
                  </button>
                </div>
                <div className="flex gap-4 px-1">
                  <p className="text-[10px] text-on-surface/30 font-medium">Nome no extrato → Nome fiscal</p>
                </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                {loadingFavorecidos ? (
                  <div className="flex items-center justify-center py-10 gap-2 text-on-surface/30">
                    <Loader2 size={20} className="animate-spin" />
                    <span className="text-sm font-semibold">Carregando...</span>
                  </div>
                ) : favorecidos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-on-surface/25">
                    <Users size={36} className="mb-2" />
                    <p className="text-sm font-bold">Nenhum favorecido cadastrado</p>
                  </div>
                ) : (
                  favorecidos.map(f => (
                    <div key={f.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-on-surface/[0.03] group transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-on-surface truncate">{f.nome_fiscal}</p>
                        {f.nome_banco && (
                          <p className="text-[10px] text-on-surface/40 font-medium truncate mt-0.5">{f.nome_banco}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteFavorecido(f.id)}
                        className="w-7 h-7 rounded-lg hover:bg-rose-500/10 flex items-center justify-center text-on-surface/20 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all shrink-0 ml-2"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <p className="text-[10px] text-on-surface/25 font-medium mt-4 shrink-0">
                {favorecidos.length} {favorecidos.length === 1 ? 'favorecido cadastrado' : 'favorecidos cadastrados'}
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Import Success Toast ──────────────────────────────────────────── */}
      <AnimatePresence>
        {importSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-xl text-sm font-bold flex items-center gap-3"
          >
            <Check size={16} />
            {importSuccess}
            <button onClick={() => setImportSuccess('')} className="ml-2 opacity-70 hover:opacity-100">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Import Extrato Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => { setShowImportModal(false); setImportFile(null); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-low rounded-3xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileUp size={18} className="text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-manrope font-extrabold text-on-surface leading-tight">Importar Extrato</h2>
                    <p className="text-[11px] text-on-surface/40 font-medium">Importar movimentações via Excel</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowImportModal(false); setImportFile(null); }}
                  className="w-8 h-8 rounded-xl hover:bg-on-surface/5 flex items-center justify-center text-on-surface/40"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Banco</label>
                  <select value={importBanco} onChange={e => setImportBanco(e.target.value)} className={inputCls}>
                    <option value="Itaú">Itaú</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Estabelecimento</label>
                  <select value={importEstab} onChange={e => setImportEstab(e.target.value)} className={inputCls}>
                    {ESTABLISHMENTS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Conta Bancária</label>
                  <select value={importAccountId} onChange={e => setImportAccountId(e.target.value)} className={inputCls}>
                    <option value="">Nenhuma (sem vínculo)</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.nome} — {a.banco}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-on-surface/30 leading-tight">Vincule o extrato a uma conta para calcular o saldo por conta.</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Arquivo Excel (.xlsx)</label>
                  <label className="cursor-pointer group">
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={e => { setImportFile(e.target.files?.[0] ?? null); setImportError(''); }}
                    />
                    {importFile ? (
                      <div className="w-full px-4 py-3 rounded-xl border border-primary/30 bg-primary/5 flex items-center gap-3">
                        <FileUp size={16} className="text-primary shrink-0" />
                        <span className="text-sm font-semibold text-on-surface truncate">{importFile.name}</span>
                      </div>
                    ) : (
                      <div className="w-full py-8 rounded-xl border-2 border-dashed border-on-surface/10 flex flex-col items-center gap-2 text-on-surface/30 hover:border-primary/40 hover:text-primary/50 transition-colors">
                        <FileUp size={28} />
                        <span className="text-xs font-semibold">Clique para selecionar o arquivo</span>
                      </div>
                    )}
                  </label>
                </div>

                <p className="text-[10px] text-on-surface/30 font-medium leading-relaxed">
                  Estrutura Itaú: cabeçalho na linha 10 — Data, Lançamento, Razão Social, CPF/CNPJ, Valor (R$), Saldo(R$)
                </p>

                {importError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 flex flex-col gap-2">
                    <p className="text-xs text-rose-600 font-semibold leading-relaxed">{importError}</p>
                    {importDuplicateLogId && (
                      <button
                        type="button"
                        onClick={handleImportExtrato}
                        className="self-start text-xs font-bold text-rose-600 underline underline-offset-2 hover:text-rose-700 transition-colors"
                      >
                        Reimportar mesmo assim
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setShowImportModal(false); setImportFile(null); }}
                  className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleImportExtrato}
                  disabled={importLoading || !importFile}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {importLoading && <Loader2 size={14} className="animate-spin" />}
                  Importar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

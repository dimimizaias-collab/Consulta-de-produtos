'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, X, Check, Edit2, Trash2, TrendingDown,
  Wallet, Search, ChevronLeft, ChevronRight, Building2, CreditCard, Upload,
  ImageIcon, Loader2, Users, FileUp, CheckSquare, BookOpen, Filter, Clock, CheckCircle2,
  AlertTriangle, Info, Lock, Unlock, Link2Off, Landmark,
  ArrowUp, ArrowDown, Eye,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useFinanceTags, TAG_COLOR_MAP } from '@/hooks/useFinanceTags';
import { TagSelector } from './TagSelector';
import { TagGuide } from './TagGuide';
import { LinkedNotesSection, LinkedNoteLite, linkNotesToTransactions, cleanupNoteLinksForDeletedTxs } from './LinkedNotesSection';
import { FavorecidoEditModal } from './FavorecidoEditModal';
import { FavorecidoDetailsModal } from './FavorecidoDetailsModal';
import type { PaymentType, TransactionType, Transaction, BankAccount, FinanceCard, Favorecido, Supplier } from '@/types/finance';
import { calcularFatura } from '@/lib/creditoFatura';

// ── Types ──────────────────────────────────────────────────────────────────

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

interface CardForm {
  nome: string;
  dia_fechamento: string;
  dia_vencimento: string;
  limite: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PAYMENT_TYPES: PaymentType[] = ['Boleto', 'Crédito', 'Débito', 'PIX', 'Dinheiro', 'Transferência', 'Cheque', 'Outro'];
const ESTABLISHMENTS = ['Castelo Real', 'Universo do R$1,99'];
const BUCKET = 'finance-images';

const TABLE_COLUMNS: { label: string; key: string }[] = [
  { label: 'Código', key: 'codigo' },
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

// Colunas da tabela "Cartões de Crédito" (aba principal) — mesma base da tabela comum,
// mas sem Tipo/Total pago (não fazem sentido por linha de compra de cartão) e com
// "Cartão" no lugar de Tipo, já que toda linha aqui é sempre uma Despesa em Crédito.
const CARD_TABLE_COLUMNS: { label: string; key: string }[] = [
  { label: 'Código', key: 'codigo' },
  { label: 'Data', key: 'data' },
  { label: 'Cartão', key: 'cartao' },
  { label: 'Pagamento', key: 'pagamento' },
  { label: 'Favorecido', key: 'favorecido' },
  { label: 'Estabelec.', key: 'estabelecimento' },
  { label: 'TAGS', key: 'tags' },
  { label: 'Vencimento', key: 'vencimento' },
  { label: 'Valor final', key: 'valor_final' },
  { label: 'Restante', key: 'restante' },
  { label: 'Pago', key: 'pago' },
  { label: '', key: '' },
];

// Altura mínima (em linhas) da tabela — evita que o dropdown de filtro de coluna seja
// cortado pelo wrapper com overflow-x-auto quando poucas movimentações estão visíveis.
const MIN_TABLE_ROWS_FOR_FILTER_MENU = 6;

// Colunas com opção de ordenação no dropdown de filtro — rótulos por direção (asc/desc).
const COLUMN_SORT_OPTIONS: Record<string, { asc: string; desc: string }> = {
  data: { asc: 'Mais antigos primeiro', desc: 'Mais recentes primeiro' },
  vencimento: { asc: 'Mais antigos primeiro', desc: 'Mais recentes primeiro' },
  valor_final: { asc: 'Menor para maior', desc: 'Maior para menor' },
  total_pago: { asc: 'Menor para maior', desc: 'Maior para menor' },
  restante: { asc: 'Menor para maior', desc: 'Maior para menor' },
  favorecido: { asc: 'A → Z', desc: 'Z → A' },
};

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
  identificacao: null,
  numero_parcela: null,
  total_parcelas: null,
  parcelamento_id: null,
  codigo_barras: null,
  tag_ids: [],
  observacoes: null,
});

const emptyAccountForm = (): AccountForm => ({
  nome: '', banco: '', agencia: '', numero_conta: '',
  saldo_inicial: '',
  imagemPreview: '', imagemFile: null,
});

const emptyCardForm = (): CardForm => ({
  nome: '', dia_fechamento: '', dia_vencimento: '', limite: '',
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
// Bloco somente-leitura usado no modal de Editar Movimentação quando os campos estão trancados
const viewBlockCls = 'px-3 py-2.5 bg-on-surface/5 rounded-xl text-sm text-on-surface/70 select-none min-h-[42px] flex items-center';

// Remove as setas do input numérico (Chrome/Safari/Firefox)
const noSpinnerCls = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0';
// Impede que o scroll do mouse sobre o campo focado altere o valor
const blockWheelChange = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

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

interface FinanceManagerProps {
  // Id de uma movimentação pra abrir automaticamente ao montar (usado pela aba
  // "Financeiro" da janela de Notas, ao levar o usuário até um lançamento vinculado).
  initialFocusTxId?: string | null;
  onInitialFocusHandled?: () => void;
}

export function FinanceManager({ initialFocusTxId, onInitialFocusHandled }: FinanceManagerProps = {}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [cards, setCards] = useState<FinanceCard[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Abas "Favorecidos" e "Contas" (antes agrupadas numa única aba "Dados")
  const [financeView, setFinanceView] = useState<'main' | 'favorecidos' | 'contas'>('main');
  // Tabela exibida na aba principal — "comum" (movimentações) ou "cartoes" (compras de
  // cartão de crédito individuais), alternadas pelo botão de cartão ao lado de "Guia de tags".
  const [mainTableView, setMainTableView] = useState<'comum' | 'cartoes'>('comum');
  const [dadosFavSearch, setDadosFavSearch] = useState('');
  const [dadosAccSearch, setDadosAccSearch] = useState('');

  // "Ver fatura detalhada" (linha-resumo na tabela comum) — leva à tabela de Cartões da aba
  // principal já filtrada para aquele cartão, no mesmo vencimento da fatura (todos os itens
  // de uma fatura compartilham o mesmo vencimento, calculado por calcularFatura).
  const goToFatura = (cardId: string, periodo: string) => {
    const card = cards.find(c => c.id === cardId);
    const consolidada = transactions.find(t => t.card_id === cardId && t.fatura_periodo === periodo && t.is_fatura_consolidada);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setMainTableView('cartoes');
    if (card) setColumnFilters(prev => ({ ...prev, cartao: new Set([card.nome]) }));
    if (consolidada?.vencimento) {
      const d = new Date(consolidada.vencimento + 'T00:00:00');
      setCalRangeMode(false);
      setCalRangeStart(null);
      setCalRangeEnd(null);
      setCalSelectedDate(d);
      setCalViewDate(d);
    }
    setFinanceView('main');
  };

  // transaction modal
  const [showTxModal, setShowTxModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingNotes, setPendingNotes] = useState<LinkedNoteLite[]>([]);
  const [txForm, setTxForm] = useState<TxForm>(emptyTxForm());
  const [parcelasEnabled, setParcelasEnabled] = useState(false);
  // id presente = linha já existe no banco; ausente = parcela nova (ainda não salva)
  // `periodo` só é usado no fluxo de Crédito (calculado a partir do cartão) — grava fatura_periodo.
  const [parcelas, setParcelas] = useState<Array<{ seq: number; data: string; valor: string; codigo_barras: string; id?: string; periodo?: string }>>([]);
  // Trava de edição do modal desktop — igual ao padrão do mobile: abre em modo leitura,
  // botão de lápis habilita a edição. Snapshot guarda o estado no momento em que abriu,
  // para detectar alterações não salvas ao tentar sair do modo de edição.
  const [txLocked, setTxLocked] = useState(false);
  const [txSnapshot, setTxSnapshot] = useState<{ form: string; parcelas: string; parcelasEnabled: boolean } | null>(null);
  const [showDiscardEditConfirm, setShowDiscardEditConfirm] = useState(false);
  const [deleteTxConfirmId, setDeleteTxConfirmId] = useState<string | null>(null);
  // Quando preenchido, o salvar faz um diff (update/insert/delete) contra essas linhas —
  // edição do parcelamento inteiro, sem apagar e recriar tudo.
  const [editingGroupIds, setEditingGroupIds] = useState<string[] | null>(null);
  const [editingParcelamentoId, setEditingParcelamentoId] = useState<string | null>(null);

  // bank account modal
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm>(emptyAccountForm());
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountModalTab, setAccountModalTab] = useState<'dados' | 'cartao'>('dados');

  // cartões (dentro do modal de conta)
  const [cardFormOpen, setCardFormOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardForm, setCardForm] = useState<CardForm>(emptyCardForm());
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardSubmitting, setCardSubmitting] = useState(false);

  // favorecidos dictionary
  const [favorecidos, setFavorecidos] = useState<Favorecido[]>([]);
  const [showFavorecidoEditModal, setShowFavorecidoEditModal] = useState(false);
  const [editingFavorecido, setEditingFavorecido] = useState<Favorecido | null>(null);
  const [loadingFavorecidos, setLoadingFavorecidos] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [detailsFavorecido, setDetailsFavorecido] = useState<Favorecido | null>(null);

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
  const [favFreeMode, setFavFreeMode] = useState(false);
  const favRef = useRef<HTMLDivElement>(null);

  // pendências de favorecido (aba Dados)
  const [showFavPendingModal, setShowFavPendingModal] = useState(false);
  const [favLinkPickerKey, setFavLinkPickerKey] = useState<string | null>(null);
  const [favLinkPickerSearch, setFavLinkPickerSearch] = useState('');
  const [favModalInitialNome, setFavModalInitialNome] = useState('');
  const [pendingFavLinkGroup, setPendingFavLinkGroup] = useState<{ label: string; ids: string[] } | null>(null);

  // filters
  const [search, setSearch] = useState('');
  const [columnFiltersEnabled, setColumnFiltersEnabled] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [filterOpenKey, setFilterOpenKey] = useState<string | null>(null);
  const [filterSearchQuery, setFilterSearchQuery] = useState('');
  // Seleção do dropdown de filtro de coluna aberto — só é aplicada em `columnFilters` ao
  // confirmar (OK), evitando que a tabela mude de tamanho (e corte o próprio menu) a cada clique.
  const [filterPendingSelection, setFilterPendingSelection] = useState<Set<string> | null>(null);
  const [columnSort, setColumnSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // tags
  const { tags, createTag, updateTag, deleteTag } = useFinanceTags();
  const [showTagGuide, setShowTagGuide] = useState(false);

  // mini calendar
  // Por padrão mostra o dia atual, mas sem deixá-lo selecionado no calendário.
  // Se o usuário desativar o filtro de data, não mostra todas as movimentações.
  const [calViewDate, setCalViewDate] = useState(() => new Date());
  const [calDefaultDate] = useState(() => new Date());
  const [calSelectedDate, setCalSelectedDate] = useState<Date | null>(null);
  const [calRangeMode, setCalRangeMode] = useState(false);
  const [calRangeStart, setCalRangeStart] = useState<Date | null>(null);
  const [calRangeEnd, setCalRangeEnd] = useState<Date | null>(null);
  const [calLegendOpen, setCalLegendOpen] = useState(false);
  const calLegendRef = useRef<HTMLDivElement>(null);

  // resultados/contas panel
  const [financePanelTab, setFinancePanelTab] = useState<'adm' | 'cartoes' | 'contas'>('adm');
  // Altura renderizada do card do calendário — aplicada como max-height no painel ao lado
  // (ADM/Cartões/Contas), para que uma lista longa (muitos cartões/contas) role por dentro
  // do painel em vez de esticar a linha inteira e destoar do calendário.
  const calendarBoxRef = useRef<HTMLDivElement>(null);
  const [calendarBoxHeight, setCalendarBoxHeight] = useState<number | null>(null);

  // Barra de rolagem horizontal flutuante da tabela — fica fixa na base da viewport
  // enquanto a tabela ainda continua abaixo da tela, evitando que o usuário precise
  // descer até o fim de todas as movimentações para rolar a tabela para os lados.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const floatScrollRef = useRef<HTMLDivElement>(null);
  const floatScrollInnerRef = useRef<HTMLDivElement>(null);

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchAll = async () => {
    setLoadingData(true);
    const [txRes, accRes, cardRes] = await Promise.all([
      supabase.from('finance_transactions').select('*').order('data', { ascending: false }),
      supabase.from('finance_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('finance_cards').select('*').order('created_at', { ascending: true }),
    ]);
    if (txRes.data)   setTransactions(txRes.data as Transaction[]);
    if (accRes.data)  setAccounts(accRes.data as BankAccount[]);
    if (cardRes.data) setCards(cardRes.data as FinanceCard[]);
    setLoadingData(false);
  };

  useEffect(() => { fetchAll(); fetchFavorecidos(); }, []);

  const fetchFavorecidos = async () => {
    setLoadingFavorecidos(true);
    const { data } = await supabase
      .from('finance_favorecidos')
      .select('*')
      .order('nome_fiscal');
    if (data) setFavorecidos(data as Favorecido[]);
    setLoadingFavorecidos(false);
  };

  const fetchSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('id, name').order('name');
    if (data) setSuppliers(data as Supplier[]);
  };

  const openNewFavorecido = () => {
    setEditingFavorecido(null);
    setFavModalInitialNome('');
    setPendingFavLinkGroup(null);
    if (suppliers.length === 0) fetchSuppliers();
    setShowFavorecidoEditModal(true);
  };

  const openEditFavorecido = (f: Favorecido) => {
    setEditingFavorecido(f);
    setFavModalInitialNome('');
    setPendingFavLinkGroup(null);
    if (suppliers.length === 0) fetchSuppliers();
    setShowFavorecidoEditModal(true);
  };

  // Promove uma pendência (texto sem favorecido cadastrado) para um novo cadastro
  const openNewFavorecidoFromPending = (group: { label: string; ids: string[] }) => {
    setEditingFavorecido(null);
    setFavModalInitialNome(group.label);
    setPendingFavLinkGroup(group);
    if (suppliers.length === 0) fetchSuppliers();
    setShowFavPendingModal(false);
    setShowFavorecidoEditModal(true);
  };

  const handleFavorecidoSaved = async () => {
    if (pendingFavLinkGroup) {
      await supabase.from('finance_transactions').update({ favorecido: pendingFavLinkGroup.label }).in('id', pendingFavLinkGroup.ids);
      setPendingFavLinkGroup(null);
    }
    fetchFavorecidos();
    fetchSuppliers();
    fetchAll();
  };

  const handleDeleteFavorecido = async (id: string) => {
    await supabase.from('finance_favorecidos').delete().eq('id', id);
    setFavorecidos(prev => prev.filter(f => f.id !== id));
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

  // Mede a altura renderizada do card do calendário para limitar o painel ao lado
  // (ADM/Cartões/Contas) à mesma altura — uma lista longa rola por dentro do painel
  // em vez de esticar a linha e deixar o calendário com espaço vazio embaixo.
  useEffect(() => {
    const box = calendarBoxRef.current;
    if (!box) return;
    const update = () => setCalendarBoxHeight(box.getBoundingClientRect().height);
    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(box);
    return () => resizeObserver.disconnect();
  }, [financeView]);

  // Sincroniza a barra de rolagem horizontal flutuante com a tabela real e controla
  // sua visibilidade: só aparece enquanto o rodapé real da tabela ainda está fora da tela.
  useEffect(() => {
    const tableScroll = tableScrollRef.current;
    const floatBar = floatScrollRef.current;
    const floatInner = floatScrollInnerRef.current;
    if (!tableScroll || !floatBar || !floatInner) return;

    let syncing = false;

    const layout = () => {
      const rect = tableScroll.getBoundingClientRect();
      floatBar.style.left = `${rect.left}px`;
      floatBar.style.width = `${rect.width}px`;
      floatInner.style.width = `${tableScroll.scrollWidth}px`;

      const needsHScroll = tableScroll.scrollWidth > tableScroll.clientWidth + 1;
      const tableBottomBelowViewport = rect.bottom > window.innerHeight;
      const tableIsOnScreen = rect.top < window.innerHeight && rect.bottom > 0;
      const shouldShow = needsHScroll && tableIsOnScreen && tableBottomBelowViewport;
      floatBar.style.opacity = shouldShow ? '1' : '0';
      floatBar.style.pointerEvents = shouldShow ? 'auto' : 'none';
    };

    const onTableScroll = () => {
      if (syncing) return;
      syncing = true;
      floatBar.scrollLeft = tableScroll.scrollLeft;
      syncing = false;
    };
    const onFloatScroll = () => {
      if (syncing) return;
      syncing = true;
      tableScroll.scrollLeft = floatBar.scrollLeft;
      syncing = false;
    };

    tableScroll.addEventListener('scroll', onTableScroll);
    floatBar.addEventListener('scroll', onFloatScroll);
    window.addEventListener('scroll', layout, { passive: true });
    window.addEventListener('resize', layout);
    const resizeObserver = new ResizeObserver(layout);
    resizeObserver.observe(tableScroll);

    layout();

    return () => {
      tableScroll.removeEventListener('scroll', onTableScroll);
      floatBar.removeEventListener('scroll', onFloatScroll);
      window.removeEventListener('scroll', layout);
      window.removeEventListener('resize', layout);
      resizeObserver.disconnect();
    };
  }, [financeView, loadingData, selectionMode, mainTableView]);

  // ── Transactions CRUD ────────────────────────────────────────────────────

  // Recalcula data/período de cada parcela de crédito sempre que a data da compra, o
  // cartão selecionado, ou a quantidade de parcelas mudam — vencimento nunca é digitado
  // manualmente no fluxo de Crédito, só o valor de cada parcela.
  useEffect(() => {
    if (txForm.tipo_pagamento !== 'Crédito' || !txForm.card_id) return;
    const card = cards.find(c => c.id === txForm.card_id);
    if (!card) return;
    setParcelas(prev => prev.map(p => {
      // seq preserva a posição real da parcela (relevante ao editar uma parcela isolada
      // de uma compra parcelada — ex: a 2ª de 3 — fora do fluxo de "editar todas").
      const { periodo, vencimento } = calcularFatura(txForm.data, card, (p.seq || 1) - 1);
      return { ...p, data: vencimento, periodo };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txForm.tipo_pagamento, txForm.card_id, txForm.data, parcelas.length, cards]);

  const openAddTx = () => {
    setEditingId(null);
    setTxForm(emptyTxForm());
    setPendingNotes([]);
    setParcelasEnabled(false);
    setParcelas([]);
    setEditingGroupIds(null);
    setEditingParcelamentoId(null);
    setFavOpen(false);
    setFavFreeMode(false);
    setTxLocked(false);
    setTxSnapshot(null);
    fetchFavorecidos();
    setShowTxModal(true);
  };

  const openEditTx = (t: Transaction) => {
    setEditingId(t.id);
    setPendingNotes([]);
    const nextForm: TxForm = { ...t, vencimento: t.vencimento ?? '', tag_ids: t.tag_ids ?? [] };
    // Vencimento agora vive no editor de parcelas: 1 linha = pagamento único com vencimento.
    // Movimentações antigas em "Crédito" (de antes desta feature) não têm vencimento —
    // mesmo assim precisam entrar no fluxo de parcelas (parcelasEnabled=true), senão o
    // salvar cai no branch "sem vencimento", que zera card_id/fatura_periodo e a
    // vinculação a um cartão feita na edição nunca é persistida.
    const nextParcelasEnabled = !!t.vencimento || t.tipo_pagamento === 'Crédito';
    // seq preserva o número real da parcela (ex: editar a 2ª de 3 isoladamente) — importante
    // no fluxo de Crédito, onde o vencimento é recalculado a partir de seq-1 meses após o
    // fechamento do cartão, não da posição do array.
    const nextParcelas = t.vencimento
      ? [{ seq: t.numero_parcela ?? 1, data: t.vencimento, valor: String(t.valor_final), codigo_barras: t.codigo_barras ?? '', id: t.id }]
      : t.tipo_pagamento === 'Crédito'
        ? [{ seq: t.numero_parcela ?? 1, data: '', valor: String(t.valor_final), codigo_barras: '', id: t.id }]
        : [];
    setTxForm(nextForm);
    setParcelasEnabled(nextParcelasEnabled);
    setParcelas(nextParcelas);
    setEditingGroupIds(null);
    setEditingParcelamentoId(null);
    setFavOpen(false);
    setFavFreeMode(false);
    setTxLocked(true);
    setTxSnapshot({ form: JSON.stringify(nextForm), parcelas: JSON.stringify(nextParcelas), parcelasEnabled: nextParcelasEnabled });
    fetchFavorecidos();
    setShowTxModal(true);
  };

  // Chegando aqui vindo da aba "Financeiro" de uma nota (clique num card + confirmação):
  // assim que as movimentações carregam, abre direto o modal da movimentação indicada.
  useEffect(() => {
    if (!initialFocusTxId || loadingData) return;
    const t = transactions.find(x => x.id === initialFocusTxId);
    if (t) openEditTx(t);
    onInitialFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocusTxId, loadingData]);

  // Alterna a trava de edição do modal. Ao tentar travar de novo (sair do modo edição) com
  // alterações não salvas, pede confirmação antes de descartar e voltar ao modo leitura.
  const handleToggleTxLock = () => {
    if (txLocked) { setTxLocked(false); return; }
    const dirty = !txSnapshot
      || JSON.stringify(txForm) !== txSnapshot.form
      || JSON.stringify(parcelas) !== txSnapshot.parcelas
      || parcelasEnabled !== txSnapshot.parcelasEnabled;
    if (dirty) setShowDiscardEditConfirm(true);
    else setTxLocked(true);
  };

  const confirmDiscardTxEdit = () => {
    if (txSnapshot) {
      setTxForm(JSON.parse(txSnapshot.form));
      setParcelas(JSON.parse(txSnapshot.parcelas));
      setParcelasEnabled(txSnapshot.parcelasEnabled);
    }
    setTxLocked(true);
    setShowDiscardEditConfirm(false);
  };

  // Carrega todas as parcelas irmãs no editor para edição em lote (diff no salvar,
  // sem apagar e recriar quem não mudou — preserva "pago" das parcelas intocadas)
  const loadGroupIntoEditor = (t: Transaction) => {
    const key = parcelaGroupKey(t);
    const siblings = transactions
      .filter(s => s.total_parcelas && s.total_parcelas > 1 && parcelaGroupKey(s) === key)
      .sort((a, b) => (a.numero_parcela ?? 0) - (b.numero_parcela ?? 0));
    if (siblings.length === 0) return;
    setParcelasEnabled(true);
    setParcelas(siblings.map((s, i) => ({ seq: i + 1, data: s.vencimento ?? s.data, valor: String(s.valor_final), codigo_barras: s.codigo_barras ?? '', id: s.id })));
    setEditingGroupIds(siblings.map(s => s.id));
    setEditingParcelamentoId(siblings[0].parcelamento_id ?? crypto.randomUUID());
  };

  const handleTxSubmit = async () => {
    if (!txForm.favorecido.trim()) return;
    setSubmitting(true);
    // Períodos de fatura que existiam ANTES desta edição (linha única ou grupo inteiro) —
    // usados no final para ressincronizar a fatura de origem caso a movimentação mude de
    // cartão, de período (a data mudou de mês), ou deixe de ser Crédito.
    const creditSyncTargets = new Map<string, Set<string>>();
    const addSyncTarget = (cardId: string | null | undefined, periodo: string | null | undefined) => {
      if (!cardId || !periodo) return;
      if (!creditSyncTargets.has(cardId)) creditSyncTargets.set(cardId, new Set());
      creditSyncTargets.get(cardId)!.add(periodo);
    };
    const originalRows = editingGroupIds
      ? transactions.filter(t => editingGroupIds.includes(t.id))
      : editingId
        ? transactions.filter(t => t.id === editingId)
        : [];
    for (const r of originalRows) addSyncTarget(r.card_id, r.fatura_periodo);
    try {
      if (parcelasEnabled) {
        const valid = parcelas.filter(p => p.data && parseFloat(p.valor) > 0);
        if (valid.length === 0) {
          // Editando uma movimentação de Crédito antiga (sem vencimento) e o usuário ainda
          // não escolheu um cartão: não há parcela computável, mas outras alterações (tags,
          // observações, favorecido...) ainda devem ser salvas em vez de abortar em silêncio.
          if (editingId && !editingGroupIds && txForm.tipo_pagamento === 'Crédito' && !txForm.card_id) {
            const original = originalRows[0];
            await supabase.from('finance_transactions').update({
              tipo: txForm.tipo,
              tipo_pagamento: txForm.tipo_pagamento,
              favorecido: txForm.favorecido,
              estabelecimento: txForm.estabelecimento,
              identificacao: txForm.identificacao?.trim() || null,
              account_id: txForm.account_id ?? null,
              tag_ids: txForm.tag_ids ?? [],
              observacoes: txForm.observacoes?.trim() || null,
              data: txForm.data,
              vencimento: original?.vencimento ?? null,
              valor_final: parseFloat(parcelas[0]?.valor) || original?.valor_final || 0,
              card_id: null,
              fatura_periodo: original?.fatura_periodo ?? null,
            }).eq('id', editingId);
            for (const [cardId, periodos] of creditSyncTargets) await syncFaturaConsolidada(cardId, [...periodos]);
            await fetchAll();
            setShowTxModal(false);
          }
          return;
        }
        const base = {
          tipo: txForm.tipo,
          tipo_pagamento: txForm.tipo_pagamento,
          favorecido: txForm.favorecido,
          estabelecimento: txForm.estabelecimento,
          numero_cheque: txForm.tipo_pagamento === 'Cheque' ? (txForm.numero_cheque || null) : null,
          identificacao: (txForm.tipo_pagamento !== 'Cheque' && txForm.tipo_pagamento !== 'Boleto') ? (txForm.identificacao?.trim() || null) : null,
          account_id: txForm.account_id ?? null,
          tag_ids: txForm.tag_ids ?? [],
          observacoes: txForm.observacoes?.trim() || null,
          card_id: txForm.tipo_pagamento === 'Crédito' ? (txForm.card_id ?? null) : null,
        };
        // Períodos de fatura afetados por esta submissão — sincronizados no final.
        const creditoPeriodos = txForm.tipo_pagamento === 'Crédito' && txForm.card_id
          ? [...new Set(valid.map(p => p.periodo).filter((p): p is string => !!p))]
          : [];

        if (editingId && !editingGroupIds && valid.length === 1) {
          // Edição simples de uma linha (vencimento único ou parcela individual):
          // atualiza no lugar, preservando pago/numero_parcela/parcelamento_id.
          await supabase.from('finance_transactions').update({
            ...base, data: txForm.data, vencimento: valid[0].data,
            valor_final: parseFloat(valid[0].valor) || 0,
            codigo_barras: txForm.tipo_pagamento === 'Boleto' ? (valid[0].codigo_barras || null) : null,
            fatura_periodo: valid[0].periodo ?? null,
          }).eq('id', editingId);
        } else if (editingGroupIds) {
          // Edição do grupo inteiro: diff contra as linhas carregadas — parcelas que
          // continuam no editor são atualizadas no lugar (preservando pago/total_pago),
          // as removidas são apagadas, e só as novas são inseridas. Não recria o grupo do zero.
          const parcelamentoId = editingParcelamentoId ?? crypto.randomUUID();
          const keptIds = new Set(valid.filter(p => p.id).map(p => p.id!));
          const deletedIds = editingGroupIds.filter(id => !keptIds.has(id));
          if (deletedIds.length > 0)
            await supabase.from('finance_transactions').delete().in('id', deletedIds);

          const rows = valid.map((p, i) => {
            const original = p.id ? transactions.find(t => t.id === p.id) : undefined;
            return {
              id: p.id ?? crypto.randomUUID(),
              ...base, data: p.data, vencimento: p.data, valor_final: parseFloat(p.valor) || 0,
              numero_parcela: i + 1, total_parcelas: valid.length, parcelamento_id: parcelamentoId,
              codigo_barras: txForm.tipo_pagamento === 'Boleto' ? (p.codigo_barras || null) : null,
              fatura_periodo: p.periodo ?? null,
              pago: original?.pago ?? false,
              total_pago: original?.total_pago ?? 0,
              import_id: original?.import_id ?? null,
              // Parcela já paga preserva a conta/data do pagamento — a edição em lote do
              // grupo não deve sobrescrever com a conta genérica do formulário.
              account_id: original?.pago ? (original.account_id ?? null) : base.account_id,
              data_pagamento: original?.pago ? (original.data_pagamento ?? null) : null,
            };
          });
          const { data: upserted } = await supabase.from('finance_transactions')
            .upsert(rows).select('id, favorecido, valor_final');

          // Vincula as notas já ligadas ao grupo também às parcelas recém-criadas
          const newRowIds = new Set(rows.filter((_, i) => !valid[i].id).map(r => r.id));
          if (newRowIds.size > 0) {
            const { data: links } = await supabase.from('finance_transaction_notes')
              .select('note_id').in('transaction_id', editingGroupIds);
            const noteIds = [...new Set((links ?? []).map(l => l.note_id as string))];
            const newlyInserted = (upserted ?? []).filter(u => newRowIds.has(u.id));
            if (noteIds.length > 0 && newlyInserted.length > 0)
              await linkNotesToTransactions(newlyInserted, noteIds);
          }
        } else {
          // Criação de movimentação nova, ou conversão de uma linha única (sem grupo)
          // em vencimento/parcelamento.
          const replaceIds = editingId ? [editingId] : [];
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
                numero_parcela: null as number | null, total_parcelas: null as number | null, parcelamento_id: null as string | null,
                codigo_barras: txForm.tipo_pagamento === 'Boleto' ? (valid[0].codigo_barras || null) : null,
                fatura_periodo: valid[0].periodo ?? null,
              }]
            // data = data de lançamento; vencimento = data da parcela (usada pela DespesasPage)
            : (() => {
                const parcelamentoId = crypto.randomUUID();
                return valid.map(p => ({
                  ...base, data: p.data, vencimento: p.data, valor_final: parseFloat(p.valor) || 0,
                  total_pago: 0, pago: false, import_id: null,
                  numero_parcela: p.seq, total_parcelas: valid.length, parcelamento_id: parcelamentoId,
                  codigo_barras: txForm.tipo_pagamento === 'Boleto' ? (p.codigo_barras || null) : null,
                  fatura_periodo: p.periodo ?? null,
                }));
              })();
          const { data: inserted } = await supabase.from('finance_transactions')
            .insert(rows).select('id, favorecido, valor_final');
          if (inserted && relinkNoteIds.length > 0)
            await linkNotesToTransactions(inserted, relinkNoteIds);
        }

        if (txForm.card_id) creditoPeriodos.forEach(p => addSyncTarget(txForm.card_id, p));
      } else {
        if (txForm.valor_final <= 0) return;
        const payload = {
          ...txForm,
          vencimento: null,
          numero_cheque: txForm.tipo_pagamento === 'Cheque' ? (txForm.numero_cheque || null) : null,
          identificacao: (txForm.tipo_pagamento !== 'Cheque' && txForm.tipo_pagamento !== 'Boleto') ? (txForm.identificacao?.trim() || null) : null,
          numero_parcela: null,
          total_parcelas: null,
          parcelamento_id: null,
          codigo_barras: txForm.tipo_pagamento === 'Boleto' ? (txForm.codigo_barras || null) : null,
          observacoes: txForm.observacoes?.trim() || null,
          // Crédito sempre passa pelo branch de parcelas (parcelasEnabled) — chegar aqui
          // significa que não é (ou deixou de ser) uma movimentação de cartão.
          card_id: null,
          fatura_periodo: null,
          is_fatura_consolidada: false,
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

      // Ressincroniza todas as faturas afetadas — tanto o período novo quanto qualquer
      // período/cartão antigo que essa movimentação tenha deixado (mudou de mês, de
      // cartão, ou deixou de ser Crédito).
      for (const [cardId, periodos] of creditSyncTargets) {
        await syncFaturaConsolidada(cardId, [...periodos]);
      }

      await fetchAll();
      setShowTxModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  // Mantém em dia a linha-resumo mensal ("fatura consolidada") de um cartão: soma o
  // valor_final de todas as movimentações de crédito daquele cartão/período (excluindo a
  // própria linha-resumo) e cria/atualiza/remove a linha consolidada de acordo.
  //
  // Conhecido: não trata ainda o caso de uma movimentação mudar de período ao editar a
  // data de uma parcela dentro de um grupo já existente (editingGroupIds) — isso ficará
  // para uma etapa posterior de QA de casos de borda.
  const syncFaturaConsolidada = async (cardId: string, periodos: string[]) => {
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

  // Parcelas de salário (origem=hr_salario) só liberam Conta/Tipo de Pagamento/
  // Identificação/Observações — update direto por id, sem passar pelo fluxo genérico
  // de handleTxSubmit (que faz delete+insert ao converter em "vencimento/parcelamento"
  // e apagaria hr_employee_id/hr_period_id/origem/numero_parcela desta linha).
  const handleSaveSalarioTx = async () => {
    if (!editingId) return;
    setSubmitting(true);
    try {
      await supabase.from('finance_transactions').update({
        account_id: txForm.account_id ?? null,
        tipo_pagamento: txForm.tipo_pagamento,
        numero_cheque: txForm.tipo_pagamento === 'Cheque' ? (txForm.numero_cheque || null) : null,
        identificacao: (txForm.tipo_pagamento !== 'Cheque' && txForm.tipo_pagamento !== 'Boleto') ? (txForm.identificacao?.trim() || null) : null,
        observacoes: txForm.observacoes?.trim() || null,
      }).eq('id', editingId);
      await fetchAll();
      setShowTxModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  // Edição da linha-resumo de uma fatura de cartão: só Tags/Observações/Valor Real/
  // interruptor são editáveis — vencimento, favorecido, conta e valor_final (o
  // consolidado) são derivados e mantidos por syncFaturaConsolidada.
  const handleSaveFaturaConsolidada = async () => {
    if (!editingId) return;
    setSubmitting(true);
    try {
      await supabase.from('finance_transactions').update({
        valor_real: txForm.valor_real ?? null,
        usar_valor_real: txForm.usar_valor_real ?? false,
        tag_ids: txForm.tag_ids ?? [],
        observacoes: txForm.observacoes?.trim() || null,
      }).eq('id', editingId);
      await fetchAll();
      setShowTxModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTx = (id: string) => {
    const tx = transactions.find(t => t.id === id);
    if (tx?.origem === 'hr_salario') return;
    setDeleteTxConfirmId(id);
  };

  const confirmDeleteTx = async () => {
    const id = deleteTxConfirmId;
    if (!id) return;
    const tx = transactions.find(t => t.id === id);
    setDeleteTxConfirmId(null);
    const { error } = await supabase.from('finance_transactions').delete().eq('id', id);
    if (error) return;
    setTransactions(prev => prev.filter(t => t.id !== id));
    await cleanupNoteLinksForDeletedTxs([id]);
    await cleanupOrphanedLogs([tx?.import_id]);
    // Excluir uma compra de crédito precisa refazer o total da fatura daquele período.
    if (tx?.card_id && !tx.is_fatura_consolidada && tx.fatura_periodo) {
      await syncFaturaConsolidada(tx.card_id, [tx.fatura_periodo]);
    }
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
    const ids = [...selectedIds].filter(id => transactions.find(t => t.id === id)?.origem !== 'hr_salario');
    const importIds = transactions
      .filter(t => ids.includes(t.id))
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
      setTransactions(prev => prev.filter(t => !ids.includes(t.id)));
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

  // Despesas com vencimento (inclusive origem=hr_salario) exigem o questionário de
  // conta + data ao marcar como pagas — receitas e despesas à vista continuam instantâneas.
  const needsPaymentQuestionnaire = (t: Transaction) => t.tipo === 'Despesa' && !!t.vencimento;

  const [markPaidTx, setMarkPaidTx] = useState<Transaction | null>(null);
  const [markPaidAccountId, setMarkPaidAccountId] = useState('');
  const [markPaidDate, setMarkPaidDate] = useState('');
  const [markPaidSubmitting, setMarkPaidSubmitting] = useState(false);
  const [unmarkPaidTx, setUnmarkPaidTx] = useState<Transaction | null>(null);
  const [unmarkPaidSubmitting, setUnmarkPaidSubmitting] = useState(false);

  const openMarkPaidModal = (t: Transaction) => {
    setMarkPaidTx(t);
    setMarkPaidAccountId(t.account_id ?? '');
    setMarkPaidDate(t.data_pagamento || new Date().toISOString().split('T')[0]);
  };

  const togglePago = async (id: string) => {
    const t = transactions.find(t => t.id === id);
    if (!t) return;
    if (t.pago) {
      setUnmarkPaidTx(t);
      return;
    }
    if (needsPaymentQuestionnaire(t)) {
      openMarkPaidModal(t);
      return;
    }
    await supabase.from('finance_transactions').update({ pago: true, total_pago: t.valor_final }).eq('id', id);
    setTransactions(prev => prev.map(x => x.id === id ? { ...x, pago: true, total_pago: t.valor_final } : x));
  };

  // Usada tanto para marcar como paga (primeira vez) quanto para o botão "Alterar conta
  // do pagamento" numa movimentação já paga — nesse caso só ajusta conta/data, sem
  // reprocessar pago/total_pago.
  const confirmMarkPaid = async () => {
    if (!markPaidTx) return;
    setMarkPaidSubmitting(true);
    try {
      const patch: Partial<Transaction> = {
        account_id: markPaidAccountId || null,
        data_pagamento: markPaidDate || null,
      };
      if (!markPaidTx.pago) {
        patch.pago = true;
        patch.total_pago = markPaidTx.valor_final;
      }
      await supabase.from('finance_transactions').update(patch).eq('id', markPaidTx.id);
      setTransactions(prev => prev.map(x => x.id === markPaidTx.id ? { ...x, ...patch } : x));

      // Fatura de cartão: pagar a fatura quita em cascata todas as compras daquele período.
      if (markPaidTx.is_fatura_consolidada && markPaidTx.card_id && markPaidTx.fatura_periodo && patch.pago) {
        const siblings = transactions.filter(x =>
          x.card_id === markPaidTx.card_id && x.fatura_periodo === markPaidTx.fatura_periodo && !x.is_fatura_consolidada);
        await Promise.all(siblings.map(s => supabase.from('finance_transactions').update({
          pago: true, total_pago: s.valor_final, account_id: patch.account_id, data_pagamento: patch.data_pagamento,
        }).eq('id', s.id)));
        setTransactions(prev => prev.map(x =>
          x.card_id === markPaidTx.card_id && x.fatura_periodo === markPaidTx.fatura_periodo && !x.is_fatura_consolidada
            ? { ...x, pago: true, total_pago: x.valor_final, account_id: patch.account_id ?? null, data_pagamento: patch.data_pagamento ?? null }
            : x
        ));
      }
      setMarkPaidTx(null);
    } finally {
      setMarkPaidSubmitting(false);
    }
  };

  const confirmUnmarkPaid = async () => {
    if (!unmarkPaidTx) return;
    setUnmarkPaidSubmitting(true);
    try {
      const patch = { pago: false, total_pago: 0, data_pagamento: null as string | null };
      await supabase.from('finance_transactions').update(patch).eq('id', unmarkPaidTx.id);
      setTransactions(prev => prev.map(x => x.id === unmarkPaidTx.id ? { ...x, ...patch } : x));

      if (unmarkPaidTx.is_fatura_consolidada && unmarkPaidTx.card_id && unmarkPaidTx.fatura_periodo) {
        await supabase.from('finance_transactions').update(patch)
          .eq('card_id', unmarkPaidTx.card_id).eq('fatura_periodo', unmarkPaidTx.fatura_periodo).eq('is_fatura_consolidada', false);
        setTransactions(prev => prev.map(x =>
          x.card_id === unmarkPaidTx.card_id && x.fatura_periodo === unmarkPaidTx.fatura_periodo && !x.is_fatura_consolidada
            ? { ...x, ...patch } : x
        ));
      }
      setUnmarkPaidTx(null);
    } finally {
      setUnmarkPaidSubmitting(false);
    }
  };

  // ── Bank Accounts ────────────────────────────────────────────────────────

  const openAddAccount = () => {
    setEditingAccountId(null);
    setAccountForm(emptyAccountForm());
    setAccountError(null);
    setAccountModalTab('dados');
    closeCardForm();
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
    setAccountModalTab('dados');
    closeCardForm();
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

  // ── Cartões de crédito (dentro do modal de Conta) ───────────────────────────

  const accountCards = (accountId: string | null) =>
    accountId ? cards.filter(c => c.account_id === accountId) : [];

  const openNewCard = () => {
    setEditingCardId(null);
    setCardForm(emptyCardForm());
    setCardError(null);
    setCardFormOpen(true);
  };

  const openEditCard = (card: FinanceCard) => {
    setEditingCardId(card.id);
    setCardForm({
      nome: card.nome,
      dia_fechamento: String(card.dia_fechamento),
      dia_vencimento: String(card.dia_vencimento),
      limite: card.limite != null ? String(card.limite) : '',
    });
    setCardError(null);
    setCardFormOpen(true);
  };

  const closeCardForm = () => {
    setCardFormOpen(false);
    setEditingCardId(null);
    setCardForm(emptyCardForm());
    setCardError(null);
  };

  const handleCardSubmit = async () => {
    if (!editingAccountId) return;
    const nome = cardForm.nome.trim();
    const fechamento = parseInt(cardForm.dia_fechamento, 10);
    const vencimento = parseInt(cardForm.dia_vencimento, 10);
    if (!nome) { setCardError('Informe o nome do cartão.'); return; }
    if (!Number.isInteger(fechamento) || fechamento < 1 || fechamento > 31) {
      setCardError('Data de fechamento deve ser um dia entre 1 e 31.'); return;
    }
    if (!Number.isInteger(vencimento) || vencimento < 1 || vencimento > 31) {
      setCardError('Data de vencimento deve ser um dia entre 1 e 31.'); return;
    }
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
        const { data, error } = await supabase
          .from('finance_cards')
          .insert({ account_id: editingAccountId, nome, dia_fechamento: fechamento, dia_vencimento: vencimento, limite })
          .select()
          .single();
        if (error) throw error;
        if (data) setCards(prev => [...prev, data as FinanceCard]);
      }
      closeCardForm();
    } catch (err: any) {
      setCardError(err?.message || 'Erro ao salvar cartão.');
    } finally {
      setCardSubmitting(false);
    }
  };

  const handleDeleteCard = async (id: string) => {
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
          identificacao: null,
          numero_parcela: null,
          total_parcelas: null,
          parcelamento_id: null,
          codigo_barras: null,
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

  const hasDatePeriod = !!(calRangeStart && calRangeEnd);

  // Vencimentos dentro dos próximos 7 dias (a partir de hoje) ganham um alerta na tabela.
  const isDueSoon = (venc: string | null) => {
    if (!venc) return false;
    const todayIso = toIsoDay(new Date());
    const weekAheadIso = toIsoDay(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    return venc >= todayIso && venc <= weekAheadIso;
  };

  const inSelectedPeriod = (dateStr: string | null) => {
    if (!dateStr) return false;
    if (calRangeStart && calRangeEnd) {
      return dateStr >= toIsoDay(calRangeStart) && dateStr <= toIsoDay(calRangeEnd);
    }
    if (calSelectedDate) {
      return dateStr === toIsoDay(calSelectedDate);
    }
    return dateStr === toIsoDay(calDefaultDate);
  };

  const getColumnValues = (t: Transaction, key: string): string[] => {
    switch (key) {
      case 'data': return [fmtDate(t.data)];
      case 'tipo': return [t.tipo];
      case 'cartao': return [cards.find(c => c.id === t.card_id)?.nome ?? '—'];
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

  // Testa se uma movimentação passa pelo período do calendário + busca + filtros de coluna,
  // opcionalmente ignorando o filtro de uma coluna específica — usado para que as opções do
  // dropdown de uma coluna reflitam o que a tabela já está mostrando (período + demais filtros),
  // sem esconder as próprias opções já selecionadas nessa coluna.
  const passesBaseFilters = (t: Transaction, excludeKey?: string): boolean => {
    // Movimentações de crédito individuais (vinculadas a um cartão, mas não a linha-resumo
    // da fatura) não aparecem na tabela comum — só na tabela "Cartões de Crédito".
    if (t.card_id && !t.is_fatura_consolidada) return false;
    for (const [key, selected] of Object.entries(columnFilters)) {
      // Um filtro deixado ativo numa coluna que só existe na outra tabela (ex: "Tipo",
      // que a tabela de Cartões não tem) não deve zerar os resultados aqui silenciosamente.
      if (!TABLE_COLUMNS.some(c => c.key === key)) continue;
      if (key === excludeKey) continue;
      if (selected.size === 0) continue;
      if (!getColumnValues(t, key).some(v => selected.has(v))) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!t.favorecido.toLowerCase().includes(q) && !t.estabelecimento.toLowerCase().includes(q)) return false;
    }
    // Parcelas de salário compartilham a mesma "data" de lançamento (a do último mês
    // do período) — filtrar por ela lotaria o dia com todas as parcelas do contrato.
    // Para essas, o filtro de calendário só deve considerar o vencimento de cada parcela.
    if (t.origem === 'hr_salario') {
      if (!inSelectedPeriod(t.vencimento)) return false;
    } else if (!inSelectedPeriod(t.data) && !inSelectedPeriod(t.vencimento)) {
      return false;
    }
    return true;
  };

  // Mesma ideia de passesBaseFilters, mas para a tabela "Cartões de Crédito" — mostra
  // exatamente o oposto: só as compras individuais vinculadas a um cartão (não a
  // linha-resumo da fatura), respeitando o mesmo período/busca/filtros de coluna.
  const passesCardBaseFilters = (t: Transaction, excludeKey?: string): boolean => {
    if (!t.card_id || t.is_fatura_consolidada) return false;
    for (const [key, selected] of Object.entries(columnFilters)) {
      // Mesmo raciocínio de passesBaseFilters: ignora filtro de coluna que só existe na
      // tabela comum (ex: "Total pago") — não deve afetar a tabela de Cartões.
      if (!CARD_TABLE_COLUMNS.some(c => c.key === key)) continue;
      if (key === excludeKey) continue;
      if (selected.size === 0) continue;
      if (!getColumnValues(t, key).some(v => selected.has(v))) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!t.favorecido.toLowerCase().includes(q) && !t.estabelecimento.toLowerCase().includes(q)) return false;
    }
    if (!inSelectedPeriod(t.data) && !inSelectedPeriod(t.vencimento)) return false;
    return true;
  };

  const getColumnUniqueValues = (key: string): string[] => {
    const baseFilter = mainTableView === 'cartoes' ? passesCardBaseFilters : passesBaseFilters;
    const all = transactions.filter(t => baseFilter(t, key)).flatMap(t => getColumnValues(t, key));
    return Array.from(new Set(all)).sort();
  };

  // Valor "cru" (não formatado) usado para ordenar por coluna — datas em ISO e valores
  // numéricos, para que a comparação seja cronológica/numérica e não alfabética.
  const getColumnSortValue = (t: Transaction, key: string): string | number | null => {
    switch (key) {
      case 'data': return t.data;
      case 'vencimento': return t.vencimento;
      case 'valor_final': return t.valor_final;
      case 'total_pago': return t.total_pago;
      case 'restante': return t.valor_final - t.total_pago;
      case 'favorecido': return t.favorecido.toLowerCase();
      default: return null;
    }
  };

  const filtered = useMemo(() => {
    const result = transactions.filter(t => passesBaseFilters(t));
    if (columnSort) {
      const { key, direction } = columnSort;
      result.sort((a, b) => {
        const av = getColumnSortValue(a, key);
        const bv = getColumnSortValue(b, key);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return direction === 'asc' ? cmp : -cmp;
      });
    } else if (hasDatePeriod) {
      // Com um período selecionado no calendário, prioriza vencimentos mais próximos do início do período.
      result.sort((a, b) => {
        if (!a.vencimento && !b.vencimento) return 0;
        if (!a.vencimento) return 1;
        if (!b.vencimento) return -1;
        return a.vencimento.localeCompare(b.vencimento);
      });
    }
    return result;
  }, [transactions, columnFilters, search, calSelectedDate, calRangeStart, calRangeEnd, calDefaultDate, tags, hasDatePeriod, columnSort]);

  // Mesma lógica de `filtered`, mas para a tabela "Cartões de Crédito" — compras
  // individuais de cartão, respeitando o mesmo calendário/busca/filtros de coluna.
  const filteredCartoes = useMemo(() => {
    const result = transactions.filter(t => passesCardBaseFilters(t));
    if (columnSort) {
      const { key, direction } = columnSort;
      result.sort((a, b) => {
        const av = getColumnSortValue(a, key);
        const bv = getColumnSortValue(b, key);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return direction === 'asc' ? cmp : -cmp;
      });
    } else if (hasDatePeriod) {
      result.sort((a, b) => {
        if (!a.vencimento && !b.vencimento) return 0;
        if (!a.vencimento) return 1;
        if (!b.vencimento) return -1;
        return a.vencimento.localeCompare(b.vencimento);
      });
    }
    return result;
  }, [transactions, columnFilters, search, calSelectedDate, calRangeStart, calRangeEnd, calDefaultDate, hasDatePeriod, columnSort]);

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

  // Mesmo agrupamento acima, mas somando o total_pago das parcelas irmãs — usado para que
  // "Total pago" e "Restante" reflitam o parcelamento inteiro, não só a parcela da linha.
  const parcelaGroupPago = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const t of transactions) {
      if (!t.total_parcelas || t.total_parcelas <= 1) continue;
      const key = parcelaGroupKey(t);
      totals[key] = (totals[key] ?? 0) + t.total_pago;
    }
    return totals;
  }, [transactions]);

  const getParcelaGroupPago = (t: Transaction): number | null => {
    if (!t.total_parcelas || t.total_parcelas <= 1) return null;
    return parcelaGroupPago[parcelaGroupKey(t)] ?? null;
  };

  // Movimentação em edição no modal (para exibir total do grupo e o botão "Editar todas")
  const editingTx = editingId ? transactions.find(t => t.id === editingId) ?? null : null;

  // Parcelas irmãs da movimentação em edição — para vincular notas fiscais a todas de uma vez
  const editingTxSiblings = editingTx && editingTx.total_parcelas && editingTx.total_parcelas > 1
    ? transactions
        .filter(t => t.total_parcelas && t.total_parcelas > 1 && parcelaGroupKey(t) === parcelaGroupKey(editingTx))
        .sort((a, b) => (a.numero_parcela ?? 0) - (b.numero_parcela ?? 0))
    : undefined;

  // Editor de Vencimento / Parcelas — caminho único para dar vencimento a uma movimentação.
  // 1 linha = pagamento único com vencimento; 2+ linhas = parcelamento.
  const renderParcelasSection = () => (
    <div className="flex flex-col gap-2 md:col-span-2">
      <div className="flex items-center justify-between">
        <span className={labelCls}>Vencimento / Parcelas</span>
        <button
          onClick={() => {
            const next = !parcelasEnabled;
            setParcelasEnabled(next);
            if (next && parcelas.length === 0)
              setParcelas([{ seq: 1, data: txForm.vencimento || txForm.data, valor: txForm.valor_final ? String(txForm.valor_final) : '', codigo_barras: txForm.codigo_barras ?? '' }]);
            else if (!next) {
              setParcelas([]);
              setEditingGroupIds(null);
              setEditingParcelamentoId(null);
            }
          }}
          className={cn(
            'px-3 py-1.5 rounded-lg text-[11px] font-extrabold transition-all',
            parcelasEnabled
              ? 'bg-primary text-on-primary'
              : 'bg-on-surface/10 text-on-surface/60 hover:bg-on-surface/15'
          )}
        >
          {parcelasEnabled ? 'Ativado' : 'Ativar'}
        </button>
      </div>

      {parcelasEnabled && (
        <div className="flex flex-col gap-3">
          {editingTx && getParcelaGroupTotal(editingTx) !== null && !editingGroupIds && (
            <div className="flex items-center justify-between gap-2 bg-primary/[0.06] border border-primary/15 rounded-xl px-3.5 py-2.5">
              <span className="text-[11px] font-bold text-on-surface/60">
                Parcela {editingTx.numero_parcela ?? 1} de {editingTx.total_parcelas ?? 1} · Total {fmt(getParcelaGroupTotal(editingTx)!)}
              </span>
              <button
                onClick={() => loadGroupIntoEditor(editingTx)}
                className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold bg-primary text-on-primary hover:opacity-90 active:scale-[0.97] transition-all"
              >
                Editar todas as parcelas
              </button>
            </div>
          )}
          {editingGroupIds && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3.5 py-2.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
              Editando o parcelamento inteiro — parcelas removidas aqui são excluídas ao salvar; as demais mantêm o status de pagamento
            </div>
          )}

          <div className="rounded-xl border border-black/[0.10] dark:border-white/[0.10] overflow-hidden">
            <div className="grid grid-cols-[52px_1fr_1fr_36px] bg-[#FFF7B0] dark:bg-[#FFE500] border-b border-[#DDD000] dark:border-[#C8B800]">
              <span className="py-2.5 text-center text-[10px] font-extrabold uppercase tracking-wide text-[#1A1A0E]/60">Nº</span>
              <span className="py-2.5 text-center text-[10px] font-extrabold uppercase tracking-wide text-[#1A1A0E]/60">Vencimento</span>
              <span className="py-2.5 text-center text-[10px] font-extrabold uppercase tracking-wide text-[#1A1A0E]/60">Valor</span>
              <span />
            </div>
            {parcelas.map((p, idx) => (
              <div
                key={idx}
                className={cn(
                  'border-t border-black/[0.06] dark:border-white/[0.06] first:border-t-0',
                  idx % 2 === 0 ? 'bg-white dark:bg-[#252520]' : 'bg-[#FAF7EE] dark:bg-[#1E1E18]'
                )}
              >
                <div className="grid grid-cols-[52px_1fr_1fr_36px] gap-2 items-center p-2">
                  <span className="text-center text-[13px] font-extrabold text-on-surface/35">{p.seq}</span>
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
                    onWheel={blockWheelChange}
                    placeholder="0,00"
                    className={cn(inputCls, noSpinnerCls)}
                  />
                  {parcelas.length > 1 ? (
                    <button
                      onClick={() => setParcelas(prev => prev.filter((_, i) => i !== idx).map((x, i) => ({ ...x, seq: i + 1 })))}
                      title="Remover parcela"
                      className="w-7 h-7 mx-auto rounded-lg flex items-center justify-center text-on-surface/30 hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  ) : <span />}
                </div>
                {txForm.tipo_pagamento === 'Boleto' && (
                  <div className="px-2 pb-2">
                    <input
                      type="text"
                      value={p.codigo_barras}
                      onChange={e => setParcelas(prev => prev.map((x, i) => i === idx ? { ...x, codigo_barras: e.target.value } : x))}
                      placeholder="Código de barras do boleto"
                      className={inputCls}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            {/* Só permite adicionar parcela na criação, numa linha avulsa (sem grupo), ou
                depois de "Editar todas as parcelas" — nunca a partir de uma única parcela de
                um grupo já existente, senão o "novo grupo" fica dessincronizado das irmãs. */}
            {(!editingTx || editingGroupIds || (editingTx.total_parcelas ?? 1) <= 1) && (
              <button
                onClick={() => setParcelas(prev => [...prev, { seq: prev.length + 1, data: txForm.data, valor: '', codigo_barras: '' }])}
                className="flex items-center gap-1.5 text-xs font-extrabold text-primary hover:opacity-70 transition-opacity"
              >
                <Plus size={13} />Adicionar parcela
              </button>
            )}
            {parcelas.length > 1 && totalParcelas > 0 && (
              <span className="text-[11px] font-extrabold text-on-surface/50">
                {parcelas.length} parcelas · Total <span className="text-primary">{fmt(totalParcelas)}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Versão simplificada de renderParcelasSection para Crédito: sem toggle (sempre ativo
  // enquanto Crédito estiver selecionado) e sem input de data — o usuário só digita o
  // valor de cada parcela, o vencimento é sempre calculado a partir do cartão selecionado.
  const renderCreditoParcelasSection = () => {
    const card = cards.find(c => c.id === txForm.card_id);
    return (
      <div className="flex flex-col gap-2 md:col-span-2">
        <span className={labelCls}>Parcelas{card ? ` — vencimento calculado pelo cartão ${card.nome}` : ''}</span>
        {!card ? (
          <div className={cn(inputCls, 'bg-on-surface/5 text-on-surface/40 select-none')}>
            Selecione um cartão para calcular o vencimento
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-black/[0.10] dark:border-white/[0.10] overflow-hidden">
              <div className="grid grid-cols-[52px_1fr_1fr_36px] bg-[#FFF7B0] dark:bg-[#FFE500] border-b border-[#DDD000] dark:border-[#C8B800]">
                <span className="py-2.5 text-center text-[10px] font-extrabold uppercase tracking-wide text-[#1A1A0E]/60">Nº</span>
                <span className="py-2.5 text-center text-[10px] font-extrabold uppercase tracking-wide text-[#1A1A0E]/60">Valor</span>
                <span className="py-2.5 text-center text-[10px] font-extrabold uppercase tracking-wide text-[#1A1A0E]/60">Vencimento</span>
                <span />
              </div>
              {parcelas.map((p, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'border-t border-black/[0.06] dark:border-white/[0.06] first:border-t-0 grid grid-cols-[52px_1fr_1fr_36px] gap-2 items-center p-2',
                    idx % 2 === 0 ? 'bg-white dark:bg-[#252520]' : 'bg-[#FAF7EE] dark:bg-[#1E1E18]'
                  )}
                >
                  <span className="text-center text-[13px] font-extrabold text-on-surface/35">{p.seq}/{Math.max(parcelas.length, p.seq)}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={p.valor}
                    onChange={e => setParcelas(prev => prev.map((x, i) => i === idx ? { ...x, valor: e.target.value } : x))}
                    onWheel={blockWheelChange}
                    placeholder="0,00"
                    className={cn(inputCls, noSpinnerCls)}
                  />
                  <div className={cn(inputCls, 'bg-on-surface/5 text-on-surface/60 select-none text-center')}>
                    {p.data ? fmtDate(p.data) : '—'}
                  </div>
                  {parcelas.length > 1 ? (
                    <button
                      onClick={() => setParcelas(prev => prev.filter((_, i) => i !== idx).map((x, i) => ({ ...x, seq: i + 1 })))}
                      title="Remover parcela"
                      className="w-7 h-7 mx-auto rounded-lg flex items-center justify-center text-on-surface/30 hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  ) : <span />}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setParcelas(prev => [...prev, { seq: prev.length + 1, data: '', valor: '', codigo_barras: '' }])}
                className="flex items-center gap-1.5 text-xs font-extrabold text-primary hover:opacity-70 transition-opacity"
              >
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
    );
  };

  const tagUseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of transactions) {
      for (const id of (t.tag_ids ?? [])) {
        counts[id] = (counts[id] ?? 0) + 1;
      }
    }
    return counts;
  }, [transactions]);

  const vencimentoStats = useMemo(() => {
    const despesasVencendo = filtered.filter(t => t.tipo === 'Despesa' && inSelectedPeriod(t.vencimento));
    const despesasVencendoPagas = despesasVencendo.filter(t => t.pago);
    // Saídas: despesas do período que não têm vencimento (pagamento à vista, sem controle de prazo)
    const saidasSemVencimento = filtered.filter(t => t.tipo === 'Despesa' && !t.vencimento && inSelectedPeriod(t.data));
    return {
      count: despesasVencendo.length,
      valor: despesasVencendo.reduce((s, t) => s + t.valor_final, 0),
      totalPago: despesasVencendo.reduce((s, t) => s + t.total_pago, 0),
      pagoCount: despesasVencendoPagas.length,
      saidasCount: saidasSemVencimento.length,
      saidasValor: saidasSemVencimento.reduce((s, t) => s + t.valor_final, 0),
    };
  }, [filtered]);

  const accountBalances = useMemo(() => {
    return accounts.map(a => {
      const txs = transactions.filter(t => t.account_id === a.id && t.pago);
      const r = txs.filter(t => t.tipo === 'Receita').reduce((s, t) => s + t.valor_final, 0);
      const d = txs.filter(t => t.tipo === 'Despesa').reduce((s, t) => s + t.valor_final, 0);
      return { ...a, saldo: (a.saldo_inicial ?? 0) + r - d };
    });
  }, [accounts, transactions]);

  // Painel "Cartões" — fatura do mês corrente de cada cartão cadastrado (mesmo sem
  // compras ainda: mostra vencimento/fechamento calculados e valor zerado).
  const cardFaturaStats = useMemo(() => {
    const now = new Date();
    const periodoAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const [y, m] = periodoAtual.split('-').map(Number);
    const diasNoMes = new Date(y, m, 0).getDate();
    return cards.map(card => {
      const fatura = transactions.find(t => t.card_id === card.id && t.fatura_periodo === periodoAtual && t.is_fatura_consolidada);
      const { vencimento } = calcularFatura(periodoAtual, card, 0);
      // Fechamento cai no próprio mês da fatura (mesma regra de calcularFatura: compras até
      // o dia de fechamento pertencem ao mês corrente da fatura).
      const fechamentoDia = Math.min(card.dia_fechamento, diasNoMes);
      const fechamento = `${y}-${String(m).padStart(2, '0')}-${String(fechamentoDia).padStart(2, '0')}`;
      const valor = fatura ? (fatura.usar_valor_real ? (fatura.valor_real ?? fatura.valor_final) : fatura.valor_final) : 0;
      return { card, valor, vencimento, fechamento, pago: fatura?.pago ?? false, temFatura: !!fatura };
    });
  }, [cards, transactions]);

  // Movimentações cujo texto de favorecido não bate (case/trim-insensitive) com nenhum cadastro
  const favUnlinkedGroups = useMemo(() => {
    const known = new Set(favorecidos.map(f => f.nome_fiscal.trim().toLowerCase()));
    const groups = new Map<string, { label: string; count: number; total: number; ids: string[] }>();
    for (const t of transactions) {
      // Parcelas de salário (origem=hr_salario) usam o nome do funcionário como
      // "favorecido" (ver lib/hrSalarioFinance.ts) — funcionário não é um cadastro de
      // favorecido/fornecedor, então essas movimentações nunca devem virar pendência aqui.
      if (t.origem === 'hr_salario') continue;
      const raw = (t.favorecido || '').trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (known.has(key)) continue;
      const g = groups.get(key);
      if (g) { g.count++; g.total += t.valor_final || 0; g.ids.push(t.id); }
      else groups.set(key, { label: raw, count: 1, total: t.valor_final || 0, ids: [t.id] });
    }
    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  }, [transactions, favorecidos]);

  const bulkRelinkFavorecido = async (ids: string[], newName: string) => {
    await supabase.from('finance_transactions').update({ favorecido: newName }).in('id', ids);
    setTransactions(prev => prev.map(t => ids.includes(t.id) ? { ...t, favorecido: newName } : t));
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

  const today = new Date();
  const calMonthLabel = calViewDate.toLocaleDateString('pt-BR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())
    + ' ' + calViewDate.getFullYear();

  // ── Render ────────────────────────────────────────────────────────────────

  // Header + abas de nível superior — usado tanto no render principal (main/dados) quanto
  // na aba "Cartões", que tem um retorno cedo próprio (ver abaixo) para não mexer no
  // ternário grande main/dados já existente.
  const renderFinanceHeader = () => (
    <div className="relative mb-14">
      <div className="bg-[#FFE500] dark:bg-[#252520] border border-[#D4C000] dark:border-white/[0.07] rounded-tl-[20px] rounded-tr-[20px] rounded-br-[20px] px-6 py-5 flex items-center gap-3.5">
        <div className="w-[52px] h-[52px] rounded-[14px] bg-[rgba(26,26,10,0.09)] dark:bg-[rgba(216,30,30,0.13)] flex items-center justify-center text-[#1A1A0E] dark:text-primary shrink-0">
          <Wallet size={24} strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-[26px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] tracking-tight leading-tight">Controle Financeiro</h1>
          <div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[rgba(26,26,10,0.40)] dark:text-white/[0.28]">Gestão Financeira</div>
        </div>
      </div>

      <div className="absolute left-0 top-full flex">
        {([
          { key: 'main', label: 'Controle Financeiro' },
          { key: 'favorecidos', label: 'Favorecidos' },
          { key: 'contas', label: 'Contas' },
        ] as const).map((tab, i, arr) => {
          const HEADER_TAB_LABEL_MAX = 12;
          const label = tab.label.length > HEADER_TAB_LABEL_MAX
            ? tab.label.slice(0, HEADER_TAB_LABEL_MAX - 1) + '…'
            : tab.label;
          const active = financeView === tab.key;
          return (
            <button
              key={tab.key}
              title={tab.label}
              onClick={() => {
                if (tab.key === 'favorecidos' && financeView !== 'favorecidos') {
                  fetchFavorecidos(); fetchSuppliers();
                }
                setFinanceView(tab.key);
              }}
              className={cn(
                'w-[136px] h-[34px] flex items-center justify-center shrink-0',
                'bg-[#FFE500] dark:bg-[#252520] border border-t-0 border-[#D4C000] dark:border-white/[0.07]',
                i === arr.length - 1 && 'rounded-br-[12px]',
                'text-[12px] font-extrabold uppercase tracking-wide truncate',
                'shadow-[inset_0_6px_8px_-5px_rgba(26,26,10,0.35)] dark:shadow-[inset_0_6px_8px_-5px_rgba(0,0,0,0.55)]',
                'transition-[opacity,transform] duration-150 active:scale-[0.97]',
                active
                  ? 'text-[#1A1A0E] dark:text-[#F2F0E3] opacity-100'
                  : 'text-[#1A1A0E] dark:text-white/75 opacity-55 hover:opacity-85'
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Modais compartilhados entre as 3 abas (main/favorecidos/contas) — extraidos pra
  // fora do JSX principal porque 'favorecidos' e 'contas' fazem return antecipado e
  // nao alcancavam esses modais, deixando os botoes Novo/Editar sem efeito visivel.
  const renderAccountModal = () => (
    <>
      <AnimatePresence>
        {showAccountModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAccountModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container border border-on-surface/[0.08] rounded-[24px] p-7 w-full max-w-[672px] max-h-[88vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex items-start gap-3 mb-6">
                <div className="w-10 h-10 rounded-[13px] bg-primary/10 dark:bg-primary/15 flex items-center justify-center text-primary shrink-0">
                  <Building2 size={19} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[16.5px] font-extrabold text-on-surface leading-tight">
                    {editingAccountId ? 'Editar Conta' : 'Cadastrar Conta'}
                  </h2>
                  <p className="text-[11px] font-semibold text-on-surface/40 mt-0.5">
                    {editingAccountId ? (accounts.find(a => a.id === editingAccountId)?.nome ?? 'Conta bancária') : 'Nova conta bancária'}
                  </p>
                </div>
                <button onClick={() => setShowAccountModal(false)} className="w-8 h-8 rounded-[11px] bg-on-surface/[0.06] flex items-center justify-center text-on-surface/45 hover:bg-primary/10 hover:text-primary transition-colors shrink-0">
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>

              <div className="flex gap-1.5 mb-5 bg-on-surface/[0.05] p-1 rounded-xl">
                <button
                  onClick={() => setAccountModalTab('dados')}
                  className={cn(
                    'flex-1 py-2 rounded-[9px] text-[11px] font-extrabold uppercase tracking-wide transition-colors',
                    accountModalTab === 'dados' ? 'bg-surface text-primary shadow-sm' : 'text-on-surface/45'
                  )}
                >
                  Dados
                </button>
                <button
                  onClick={() => editingAccountId && setAccountModalTab('cartao')}
                  disabled={!editingAccountId}
                  title={!editingAccountId ? 'Salve a conta primeiro para cadastrar cartões' : undefined}
                  className={cn(
                    'flex-1 py-2 rounded-[9px] text-[11px] font-extrabold uppercase tracking-wide transition-colors',
                    !editingAccountId ? 'text-on-surface/20 cursor-not-allowed'
                      : accountModalTab === 'cartao' ? 'bg-surface text-primary shadow-sm' : 'text-on-surface/45'
                  )}
                >
                  Cartão{accountCards(editingAccountId).length > 0 ? ` (${accountCards(editingAccountId).length})` : ''}
                </button>
              </div>

              {accountModalTab === 'cartao' ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2.5">
                    {accountCards(editingAccountId).length === 0 && !cardFormOpen && (
                      <div className="flex flex-col items-center gap-2 text-center py-8 px-4 border-[1.5px] border-dashed border-on-surface/[0.14] rounded-2xl text-on-surface/35">
                        <CreditCard size={20} className="opacity-50" />
                        <span className="text-[11.5px] font-bold max-w-[260px]">Nenhum cartão cadastrado para esta conta</span>
                      </div>
                    )}
                    {accountCards(editingAccountId).map(card => (
                      <div key={card.id} className="flex items-center gap-3 bg-surface border border-on-surface/[0.09] rounded-2xl p-3.5 shadow-[0_2px_10px_rgba(26,26,10,0.05)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
                        <div className="w-9 h-9 rounded-xl bg-primary/[0.08] dark:bg-primary/[0.15] flex items-center justify-center text-primary shrink-0">
                          <CreditCard size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13.5px] font-extrabold text-on-surface truncate">{card.nome}</p>
                          <p className="text-[11px] text-on-surface/45 truncate">
                            Fecha dia {card.dia_fechamento} · Vence dia {card.dia_vencimento}
                            {card.limite != null ? ` · Limite ${fmt(card.limite)}` : ' · Sem limite definido'}
                          </p>
                        </div>
                        <span className="font-mono text-[10.5px] font-bold bg-on-surface/[0.06] text-on-surface/55 rounded-lg px-2 py-1 shrink-0">{card.codigo}</span>
                        <button onClick={() => openEditCard(card)} title="Editar" className="w-7 h-7 rounded-lg hover:bg-on-surface/5 flex items-center justify-center text-on-surface/40 hover:text-primary transition-colors shrink-0">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => handleDeleteCard(card.id)} title="Excluir" className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-on-surface/40 hover:text-red-500 transition-colors shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {!cardFormOpen ? (
                    <button
                      onClick={openNewCard}
                      className="border-[1.5px] border-dashed border-on-surface/20 rounded-2xl py-3.5 flex items-center justify-center gap-2 text-on-surface/40 text-xs font-extrabold uppercase tracking-wide hover:border-primary hover:text-primary transition-colors"
                    >
                      <Plus size={15} /> Novo Cartão
                    </button>
                  ) : (
                    <div className="flex flex-col gap-4 pt-1 border-t border-on-surface/[0.08]">
                      <div className="flex flex-col gap-1.5 mt-4">
                        <label className={labelCls}>Nome do Cartão</label>
                        <input type="text" value={cardForm.nome} onChange={e => setCardForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Nubank Roxinho" className={inputCls} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Data de Fechamento</label>
                          <input type="number" min={1} max={31} value={cardForm.dia_fechamento} onChange={e => setCardForm(f => ({ ...f, dia_fechamento: e.target.value }))} onWheel={blockWheelChange} placeholder="Dia" className={cn(inputCls, noSpinnerCls)} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Data de Vencimento</label>
                          <input type="number" min={1} max={31} value={cardForm.dia_vencimento} onChange={e => setCardForm(f => ({ ...f, dia_vencimento: e.target.value }))} onWheel={blockWheelChange} placeholder="Dia" className={cn(inputCls, noSpinnerCls)} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Limite <span className="normal-case font-medium opacity-70">(opcional)</span></label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-on-surface/40">R$</span>
                            <input type="number" step="0.01" min="0" value={cardForm.limite} onChange={e => setCardForm(f => ({ ...f, limite: e.target.value }))} onWheel={blockWheelChange} placeholder="0,00" className={cn(inputCls, 'pl-9', noSpinnerCls)} />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className={labelCls}>Código</label>
                          <div className={viewBlockCls}>{editingCardId ? cards.find(c => c.id === editingCardId)?.codigo : 'Gerado ao salvar'}</div>
                        </div>
                      </div>

                      {cardError && (
                        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 leading-relaxed">
                          {cardError}
                        </div>
                      )}

                      <div className="flex gap-3">
                        <button onClick={closeCardForm} className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors">
                          Cancelar
                        </button>
                        <button onClick={handleCardSubmit} disabled={cardSubmitting} className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                          {cardSubmitting && <Loader2 size={14} className="animate-spin" />}
                          {editingCardId ? 'Salvar Alterações' : 'Salvar Cartão'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Existing accounts list — shown only when adding a new account */}
              {accountModalTab === 'dados' && !editingAccountId && accounts.length > 0 && (
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Building2 size={12} className="text-primary shrink-0" />
                    <span className="text-[10px] font-black uppercase tracking-[0.09em] text-on-surface/40 whitespace-nowrap">Contas Cadastradas</span>
                    <span className="flex-1 h-px bg-on-surface/10" />
                  </div>
                  <div className="flex flex-col gap-2">
                    {accounts.map(acc => (
                      <div key={acc.id} className="flex items-center gap-3 bg-surface border border-on-surface/[0.09] rounded-2xl px-3.5 py-2.5 shadow-[0_2px_10px_rgba(26,26,10,0.05)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
                        <div className="w-9 h-9 rounded-xl bg-on-surface/[0.06] dark:bg-white/[0.07] flex items-center justify-center text-[11px] font-black text-on-surface/50 shrink-0">
                          {acc.nome.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-extrabold text-on-surface truncate">{acc.nome}</p>
                          <p className="text-[10.5px] text-on-surface/40 font-semibold">{acc.banco} · <span className="text-emerald-600 dark:text-emerald-400 font-bold">{(acc.saldo_inicial ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></p>
                        </div>
                        <button
                          onClick={() => openEditAccount(acc)}
                          className="ml-1 shrink-0 w-8 h-8 rounded-[10px] hover:bg-primary/10 flex items-center justify-center text-on-surface/35 hover:text-primary transition-colors"
                        >
                          <Edit2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-4 mb-1">
                    <Plus size={12} className="text-primary shrink-0" />
                    <span className="text-[10px] font-black uppercase tracking-[0.09em] text-on-surface/40 whitespace-nowrap">Nova Conta</span>
                    <span className="flex-1 h-px bg-on-surface/10" />
                  </div>
                </div>
              )}

              {accountModalTab === 'dados' && (
                <>
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
                          onWheel={blockWheelChange}
                          placeholder="0,00"
                          className={cn(inputCls, 'pl-9', noSpinnerCls)}
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
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );

  const renderFavorecidoModals = () => (
    <>
      <FavorecidoEditModal
        open={showFavorecidoEditModal}
        favorecido={editingFavorecido}
        initialNomeFiscal={favModalInitialNome}
        suppliers={suppliers}
        onClose={() => { setShowFavorecidoEditModal(false); setPendingFavLinkGroup(null); }}
        onSaved={handleFavorecidoSaved}
        variant="modal"
      />

      <FavorecidoDetailsModal
        open={!!detailsFavorecido}
        favorecido={detailsFavorecido}
        onClose={() => setDetailsFavorecido(null)}
        variant="modal"
      />

      {/* ── Pendências de Favorecido (movimentações sem cadastro vinculado) ── */}
      <AnimatePresence>
        {showFavPendingModal && (
          <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => { setShowFavPendingModal(false); setFavLinkPickerKey(null); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className="relative bg-surface rounded-[20px] shadow-2xl w-full max-w-[672px] max-h-[82vh] flex flex-col overflow-hidden"
            >
              <div className="bg-[#FFE500] dark:bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-5 py-4 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(26,26,10,0.10)] flex items-center justify-center shrink-0">
                    <Link2Off size={18} className="text-[#1A1A0E]" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-black text-[#1A1A0E]">Movimentações sem favorecido vinculado</h3>
                    <p className="text-[11px] font-semibold text-[rgba(26,26,10,0.55)] mt-0.5">
                      {favUnlinkedGroups.length === 0 ? 'Nenhuma pendência' : `${favUnlinkedGroups.length} descriç${favUnlinkedGroups.length === 1 ? 'ão não bate' : 'ões não batem'} com nenhum cadastro`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowFavPendingModal(false); setFavLinkPickerKey(null); }}
                  className="w-[30px] h-[30px] rounded-lg bg-[rgba(26,26,10,0.08)] text-[rgba(26,26,10,0.45)] flex items-center justify-center hover:bg-[rgba(216,30,30,0.12)] hover:text-[#D81E1E] transition-colors shrink-0"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="p-5 flex flex-col gap-2.5 overflow-y-auto">
                {favUnlinkedGroups.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-on-surface/25">
                    <Link2Off size={30} className="mb-2" />
                    <p className="text-sm font-bold">Tudo certo — sem pendências</p>
                  </div>
                ) : (
                  favUnlinkedGroups.map(group => (
                    <div key={group.label.toLowerCase()} className="bg-surface-container border border-on-surface/[0.09] rounded-2xl p-4 flex flex-col gap-2.5 shadow-[0_2px_10px_rgba(26,26,10,0.05)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold text-on-surface truncate">{group.label}</p>
                          <span className="inline-block mt-1.5 text-[10px] font-extrabold text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-full px-2.5 py-0.5">
                            {group.count} movimenta{group.count === 1 ? 'ção' : 'ções'}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="block text-[8px] font-black uppercase tracking-widest text-on-surface/25">Total</span>
                          <span className="font-['DM_Mono',monospace] text-sm text-on-surface/60">{fmt(group.total)}</span>
                        </div>
                      </div>

                      {favLinkPickerKey === group.label.toLowerCase() ? (
                        <div className="bg-surface border border-on-surface/10 rounded-xl p-2.5 flex flex-col gap-2">
                          <div className="relative">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface/40" />
                            <input
                              autoFocus
                              value={favLinkPickerSearch}
                              onChange={e => setFavLinkPickerSearch(e.target.value)}
                              placeholder="Buscar favorecido cadastrado..."
                              className="w-full pl-8 pr-3 py-2 bg-surface-container-low rounded-lg text-xs text-on-surface placeholder:text-on-surface/30 border border-on-surface/10 focus:outline-none focus:border-primary/50"
                            />
                          </div>
                          <div className="max-h-32 overflow-y-auto flex flex-col gap-1">
                            {favorecidos
                              .filter(fv => !favLinkPickerSearch || fv.nome_fiscal.toLowerCase().includes(favLinkPickerSearch.toLowerCase()))
                              .map(fv => (
                                <button
                                  key={fv.id}
                                  onClick={async () => {
                                    await bulkRelinkFavorecido(group.ids, fv.nome_fiscal);
                                    setFavLinkPickerKey(null);
                                    setFavLinkPickerSearch('');
                                  }}
                                  className="text-left px-2.5 py-2 rounded-lg text-xs font-semibold text-on-surface hover:bg-primary/10 hover:text-primary transition-colors"
                                >
                                  {fv.nome_fiscal}
                                </button>
                              ))}
                            {favorecidos.filter(fv => !favLinkPickerSearch || fv.nome_fiscal.toLowerCase().includes(favLinkPickerSearch.toLowerCase())).length === 0 && (
                              <p className="px-2.5 py-2 text-xs italic text-on-surface/35">Nenhum resultado</p>
                            )}
                          </div>
                          <button
                            onClick={() => { setFavLinkPickerKey(null); setFavLinkPickerSearch(''); }}
                            className="text-[11px] font-bold text-on-surface/45 hover:text-on-surface/70 transition-colors self-start px-1"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setFavLinkPickerKey(group.label.toLowerCase()); setFavLinkPickerSearch(''); }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11.5px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/[0.18] transition-colors"
                          >
                            <Users size={13} />
                            Vincular a existente
                          </button>
                          <button
                            onClick={() => openNewFavorecidoFromPending(group)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11.5px] font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/[0.18] transition-colors"
                          >
                            <Plus size={13} />
                            Criar novo favorecido
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );

  if (financeView === 'favorecidos') {
    const favList = favorecidos.filter(f => !dadosFavSearch || f.nome_fiscal.toLowerCase().includes(dadosFavSearch.toLowerCase()));
    return (
      <div className="space-y-6">
        {renderFinanceHeader()}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users size={13} className="text-primary shrink-0" />
            <span className="text-[11px] font-black uppercase tracking-[0.10em] text-on-surface/42 whitespace-nowrap">Favorecidos Cadastrados</span>
            <span className="flex-1 h-px bg-on-surface/10" />
            <span className="bg-primary/10 text-primary text-[10px] font-black px-2 py-0.5 rounded-full">{favorecidos.length}</span>
          </div>

          <div className="flex items-center gap-2.5 mb-4">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface/40" />
              <input
                value={dadosFavSearch}
                onChange={e => setDadosFavSearch(e.target.value)}
                placeholder="Buscar favorecido..."
                className="w-full pl-10 pr-4 py-3 bg-surface rounded-[14px] text-sm text-on-surface placeholder:text-on-surface/30 border-[1.5px] border-on-surface/[0.10] focus:outline-none focus:border-primary/50"
              />
            </div>
            <button
              onClick={openNewFavorecido}
              title="Novo favorecido"
              className="w-[42px] h-[42px] rounded-[14px] bg-primary text-on-primary flex items-center justify-center shadow-[0_8px_18px_rgba(216,30,30,0.28)] active:scale-[0.93] transition-transform shrink-0"
            >
              <Plus size={18} />
            </button>
            <button
              onClick={() => setShowFavPendingModal(true)}
              title="Movimentações sem favorecido vinculado"
              className="relative w-[42px] h-[42px] rounded-[14px] bg-amber-500/10 border-[1.5px] border-amber-500/30 text-amber-700 dark:text-amber-400 flex items-center justify-center active:scale-[0.93] transition-transform shrink-0 hover:bg-amber-500/[0.18]"
            >
              <Link2Off size={18} />
              {favUnlinkedGroups.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-primary text-on-primary text-[9px] font-black flex items-center justify-center ring-2 ring-background">
                  {favUnlinkedGroups.length}
                </span>
              )}
            </button>
          </div>

          {favorecidos.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-on-surface/25">
              <Users size={32} className="mb-2" />
              <p className="text-sm font-bold">Nenhum favorecido cadastrado</p>
            </div>
          ) : favList.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-on-surface/25">
              <Search size={28} className="mb-2" />
              <p className="text-sm font-bold">Nenhum favorecido encontrado</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {favList.map(f => (
                <div
                  key={f.id}
                  className="bg-surface border border-on-surface/[0.09] rounded-2xl px-4 py-3.5 shadow-[0_2px_10px_rgba(26,26,10,0.05)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] flex items-center gap-3.5 transition-[box-shadow,border-color] hover:shadow-[0_4px_16px_rgba(26,26,10,0.09)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)] hover:border-primary/20"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/[0.08] dark:bg-primary/[0.15] text-primary flex items-center justify-center shrink-0">
                    <Landmark size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14.5px] font-extrabold text-on-surface truncate">{f.nome_fiscal}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {f.nome_banco ? (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2.5 py-[3px] rounded-full bg-on-surface/[0.045] dark:bg-white/[0.06] text-on-surface/50 font-['DM_Mono',monospace]">
                          Extrato: {f.nome_banco}
                        </span>
                      ) : (
                        <span className="text-[11px] italic font-semibold text-on-surface/28">sem mapeamento de extrato</span>
                      )}
                      {f.supplier_id && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-[3px] rounded-full bg-primary/10 dark:bg-primary/15 text-primary">
                          <Check size={10} strokeWidth={3} />
                          {suppliers.find(s => s.id === f.supplier_id)?.name ?? 'Fornecedor vinculado'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEditFavorecido(f)} title="Editar" className="w-8 h-8 rounded-[10px] flex items-center justify-center text-on-surface/35 hover:bg-primary/10 hover:text-primary transition-colors">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDeleteFavorecido(f.id)} title="Excluir" className="w-8 h-8 rounded-[10px] flex items-center justify-center text-on-surface/35 hover:bg-rose-500/10 hover:text-rose-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {renderFavorecidoModals()}
      </div>
    );
  }

  if (financeView === 'contas') {
    const accList = accounts.filter(acc => !dadosAccSearch || acc.nome.toLowerCase().includes(dadosAccSearch.toLowerCase()));
    return (
      <div className="space-y-6">
        {renderFinanceHeader()}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={13} className="text-primary shrink-0" />
            <span className="text-[11px] font-black uppercase tracking-[0.10em] text-on-surface/42 whitespace-nowrap">Contas Cadastradas</span>
            <span className="flex-1 h-px bg-on-surface/10" />
            <span className="bg-primary/10 text-primary text-[10px] font-black px-2 py-0.5 rounded-full">{accounts.length}</span>
          </div>

          <div className="flex items-center gap-2.5 mb-4">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface/40" />
              <input
                value={dadosAccSearch}
                onChange={e => setDadosAccSearch(e.target.value)}
                placeholder="Buscar conta..."
                className="w-full pl-10 pr-4 py-3 bg-surface rounded-[14px] text-sm text-on-surface placeholder:text-on-surface/30 border-[1.5px] border-on-surface/[0.10] focus:outline-none focus:border-primary/50"
              />
            </div>
            <button
              onClick={openAddAccount}
              title="Nova conta"
              className="w-[42px] h-[42px] rounded-[14px] bg-primary text-on-primary flex items-center justify-center shadow-[0_8px_18px_rgba(216,30,30,0.28)] active:scale-[0.93] transition-transform shrink-0"
            >
              <Plus size={18} />
            </button>
          </div>

          {accounts.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-on-surface/25">
              <Building2 size={32} className="mb-2" />
              <p className="text-sm font-bold">Nenhuma conta cadastrada</p>
            </div>
          ) : accList.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-on-surface/25">
              <Search size={28} className="mb-2" />
              <p className="text-sm font-bold">Nenhuma conta encontrada</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {accList.map(acc => (
                <div
                  key={acc.id}
                  className="bg-surface border border-on-surface/[0.09] rounded-2xl px-4 py-3.5 shadow-[0_2px_10px_rgba(26,26,10,0.05)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] flex items-center gap-3.5 transition-[box-shadow,border-color] hover:shadow-[0_4px_16px_rgba(26,26,10,0.09)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)] hover:border-primary/20"
                >
                  {acc.imagem_url ? (
                    <img src={acc.imagem_url} alt={acc.nome} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-on-surface/[0.06] dark:bg-white/[0.07] flex items-center justify-center text-[13px] font-black text-on-surface/50 shrink-0">
                      {acc.nome.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14.5px] font-extrabold text-on-surface truncate">{acc.nome}</p>
                    <span className="inline-flex items-center gap-1 mt-1.5 text-[10.5px] font-semibold px-2.5 py-[3px] rounded-full bg-on-surface/[0.045] dark:bg-white/[0.06] text-on-surface/50 font-['DM_Mono',monospace]">
                      {acc.banco}{acc.agencia && ` · Ag ${acc.agencia}`}{acc.numero_conta && ` · CC ${acc.numero_conta}`}
                    </span>
                  </div>
                  <div className="text-right shrink-0 mr-1">
                    <span className="block text-[8px] font-black uppercase tracking-widest text-on-surface/30">Saldo inicial</span>
                    <span className={cn('font-[\'DM_Mono\',monospace] text-[13px] font-extrabold', (acc.saldo_inicial ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')}>
                      {fmt(acc.saldo_inicial ?? 0)}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEditAccount(acc)} title="Editar" className="w-8 h-8 rounded-[10px] flex items-center justify-center text-on-surface/35 hover:bg-primary/10 hover:text-primary transition-colors">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDeleteAccount(acc.id)} title="Excluir" className="w-8 h-8 rounded-[10px] flex items-center justify-center text-on-surface/35 hover:bg-rose-500/10 hover:text-rose-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {renderAccountModal()}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {renderFinanceHeader()}

      {/* Calendar + ADM/Cartões/Contas */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', alignItems: 'stretch', flexShrink: 0 }}>

        {/* Mini Calendar */}
        <div ref={calendarBoxRef} className="bg-surface-container-low border border-on-surface/[0.07] rounded-[18px] overflow-hidden flex flex-col">
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

        {/* Painel ADM / Cartões / Contas — limitado à altura do calendário ao lado (medida
            via ResizeObserver) e rola por dentro quando o conteúdo não cabe. */}
        <div
          className="bg-surface-container-low border border-on-surface/[0.07] rounded-[18px] overflow-hidden flex flex-col"
          style={calendarBoxHeight ? { maxHeight: calendarBoxHeight } : undefined}
        >
          <div className="bg-[#FFE500] dark:bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-4 py-2.5 flex items-center shrink-0">
            <div className="flex-1 flex gap-0.5 bg-[rgba(26,26,10,0.10)] rounded-full p-[2px]">
              {(['adm', 'cartoes', 'contas'] as const).map(tab => (
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
                  {tab === 'adm' ? 'ADM' : tab === 'cartoes' ? 'Cartões' : 'Contas'}
                </button>
              ))}
            </div>
          </div>

          <div className="p-2.5 flex-1 overflow-y-auto min-h-0 flex flex-col gap-1.5">
            {financePanelTab === 'adm' ? (<>
                <div className="bg-surface-container border border-on-surface/[0.07] rounded-[12px] px-3 py-2.5 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-[9px] bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
                    <Clock size={13} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] font-extrabold text-on-surface truncate">Vencimento no período</p>
                    <p className="text-[9px] font-semibold text-on-surface/40 truncate mt-0.5">
                      {vencimentoStats.count} {vencimentoStats.count === 1 ? 'movimentação' : 'movimentações'}
                    </p>
                  </div>
                  <p className="text-[12px] font-black shrink-0 tracking-tight text-rose-600 dark:text-[#D81E1E]">{fmt(vencimentoStats.valor)}</p>
                </div>

                <div className="bg-surface-container border border-on-surface/[0.07] rounded-[12px] px-3 py-2.5 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-[9px] bg-emerald-500/10 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={13} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] font-extrabold text-on-surface truncate">Total pago</p>
                    <p className="text-[9px] font-semibold text-on-surface/40 truncate mt-0.5">
                      {vencimentoStats.pagoCount} {vencimentoStats.pagoCount === 1 ? 'movimentação quitada' : 'movimentações quitadas'}
                    </p>
                  </div>
                  <p className="text-[12px] font-black shrink-0 tracking-tight text-emerald-600 dark:text-emerald-400">{fmt(vencimentoStats.totalPago)}</p>
                </div>

                <div className="bg-surface-container border border-on-surface/[0.07] rounded-[12px] px-3 py-2.5 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-[9px] bg-rose-500/10 dark:bg-[rgba(216,30,30,0.13)] flex items-center justify-center shrink-0 text-rose-600 dark:text-[#D81E1E]">
                    <TrendingDown size={13} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] font-extrabold text-on-surface truncate">Saídas sem vencimento</p>
                    <p className="text-[9px] font-semibold text-on-surface/40 truncate mt-0.5">Pagamentos à vista</p>
                  </div>
                  <p className="text-[12px] font-black shrink-0 tracking-tight text-rose-600 dark:text-[#D81E1E]">{fmt(vencimentoStats.saidasValor)}</p>
                </div>
            </>) : financePanelTab === 'cartoes' ? (
              cardFaturaStats.length === 0 ? (
                <div className="bg-surface-container border border-on-surface/[0.07] rounded-[12px] flex items-center justify-center py-6">
                  <p className="text-[11px] font-bold text-on-surface/25 text-center px-4">Nenhum cartão cadastrado</p>
                </div>
              ) : (
                cardFaturaStats.map(({ card, valor, vencimento, fechamento, pago, temFatura }) => (
                  <div key={card.id} className="bg-surface-container border border-on-surface/[0.07] rounded-[12px] px-3 py-2.5 flex items-center gap-2.5">
                    <div className={cn(
                      'w-7 h-7 rounded-[9px] flex items-center justify-center shrink-0',
                      temFatura ? 'bg-primary/[0.08] dark:bg-primary/[0.12] text-primary' : 'bg-on-surface/[0.06] dark:bg-white/[0.06] text-on-surface/40'
                    )}>
                      <CreditCard size={13} strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10.5px] font-extrabold text-on-surface truncate">{card.nome}</p>
                      <p className="text-[9px] font-semibold text-on-surface/40 truncate mt-0.5">
                        Vence {fmtDate(vencimento)} · Fecha {fmtDate(fechamento)}
                      </p>
                    </div>
                    <p className={cn(
                      'text-[12px] font-black shrink-0 tracking-tight',
                      !temFatura ? 'text-on-surface/25' : pago ? 'text-emerald-500' : 'text-rose-500'
                    )}>
                      {fmt(valor)}
                    </p>
                  </div>
                ))
              )
            ) : (
              accountBalances.length === 0 ? (
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
              )
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
            if (!next) { setColumnFilters({}); setColumnSort(null); setFilterOpenKey(null); setFilterPendingSelection(null); setFilterSearchQuery(''); }
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

        {mainTableView === 'comum' && (
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
        )}

        {tags.length > 0 && (
          <button
            onClick={() => setShowTagGuide(true)}
            title="Guia de tags"
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-on-surface/5 bg-surface-container-low text-on-surface/60 hover:bg-on-surface/5 transition-colors"
          >
            <BookOpen size={16} />
          </button>
        )}

        <button
          onClick={() => {
            setSelectionMode(false);
            setSelectedIds(new Set());
            setMainTableView(v => {
              const next = v === 'comum' ? 'cartoes' : 'comum';
              const nextColumns = next === 'cartoes' ? CARD_TABLE_COLUMNS : TABLE_COLUMNS;
              const nextKeys = new Set(nextColumns.map(c => c.key));
              // Reseta filtro/ordenação de colunas que só existem na tabela de origem — evita
              // que um filtro "esquecido" numa coluna que a outra tabela nem mostra continue
              // escondendo linhas ali sem nenhum indicativo visual do porquê.
              setColumnFilters(prev => {
                const entries = Object.entries(prev).filter(([key]) => nextKeys.has(key));
                return entries.length === Object.keys(prev).length ? prev : Object.fromEntries(entries);
              });
              setColumnSort(s => (s && !nextKeys.has(s.key)) ? null : s);
              setFilterOpenKey(null);
              setFilterPendingSelection(null);
              setFilterSearchQuery('');
              return next;
            });
          }}
          title={mainTableView === 'comum' ? 'Ver tabela de Cartões de Crédito' : 'Ver tabela de Movimentações'}
          className={cn(
            'ml-auto w-9 h-9 rounded-xl flex items-center justify-center border transition-colors',
            mainTableView === 'cartoes'
              ? 'bg-primary text-on-primary border-primary shadow-md shadow-primary/20 hover:opacity-90'
              : 'bg-surface-container-low border-on-surface/5 text-on-surface/60 hover:bg-on-surface/5'
          )}
        >
          <CreditCard size={16} />
        </button>
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
      {(() => {
      const activeColumns = mainTableView === 'cartoes' ? CARD_TABLE_COLUMNS : TABLE_COLUMNS;
      const showSelectCol = selectionMode && mainTableView === 'comum';
      return (
      <div className="bg-surface-container-low/80 rounded-2xl border border-on-surface/5 overflow-hidden">
        {loadingData ? (
          <div className="flex items-center justify-center py-20 gap-3 text-on-surface/30">
            <Loader2 size={24} className="animate-spin" />
            <span className="text-sm font-semibold">Carregando...</span>
          </div>
        ) : (
          <div ref={tableScrollRef} className="overflow-x-auto [&_tbody_td]:border-r [&_tbody_td]:border-on-surface/[0.04] dark:[&_tbody_td]:border-white/[0.03] [&_tbody_td:last-child]:border-r-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#FFEC4D] dark:bg-[#FFEC4D] border-b border-[#E6CE33] dark:border-[#DCC63D]">
                  {showSelectCol && (
                    <th className="px-3 py-3 w-10" />
                  )}
                  {activeColumns.map(({ label, key }) => {
                    const hasFilter = (columnFilters[key]?.size ?? 0) > 0;
                    const isOpen = columnFiltersEnabled && filterOpenKey === key;
                    const uniqueVals = isOpen ? getColumnUniqueValues(key) : [];
                    const selected = isOpen ? (filterPendingSelection ?? new Set<string>()) : (columnFilters[key] ?? new Set<string>());
                    const searchLower = filterSearchQuery.toLowerCase();
                    const displayed = searchLower ? uniqueVals.filter(v => v.toLowerCase().includes(searchLower)) : uniqueVals;
                    // Abrir o dropdown pré-marca exatamente o que a tabela já está mostrando para a
                    // coluna: o filtro ativo (se houver) ou, sem filtro, todas as opções visíveis no
                    // momento — assim o usuário só precisa desmarcar o que quer excluir.
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
                      <th key={label || 'actions'} className="px-3 py-3 text-left whitespace-nowrap relative">
                        {label ? (
                          <div className="inline-flex items-center gap-1">
                            <span
                              onClick={columnFiltersEnabled && key ? () => { isOpen ? closeFilter() : openFilter(); } : undefined}
                              title={columnFiltersEnabled && key ? (hasFilter ? 'Filtro ativo' : 'Filtrar') : undefined}
                              className={cn(
                                // Cabeçalho da tabela é sempre amarelo (âncora de marca), em light e dark —
                                // por isso o chip usa tokens escuros nos dois modos, sem variante dark: clara.
                                'inline-flex items-center bg-[rgba(26,26,10,0.05)] rounded-full px-[13px] py-[5px] text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] dark:text-[rgba(26,26,10,0.58)] whitespace-nowrap border-[1.5px] transition-colors',
                                columnFiltersEnabled
                                  ? cn('border-[#D81E1E]/45', key && 'cursor-pointer', hasFilter && 'text-[#D81E1E] dark:text-[#D81E1E]')
                                  : 'border-[rgba(26,26,10,0.10)] dark:border-[rgba(26,26,10,0.12)]',
                              )}
                            >
                              {label}
                            </span>
                            {isOpen && key && (<>
                              <div className="fixed inset-0 z-[90]" onClick={closeFilter} />
                              <div className="absolute left-0 top-full mt-1 z-[100] rounded-xl shadow-2xl border border-on-surface/10 bg-surface-container overflow-hidden normal-case" style={{ minWidth: '200px', maxWidth: '280px' }}>
                                {COLUMN_SORT_OPTIONS[key] && (
                                  <div className="flex flex-col gap-0.5 p-1.5 border-b border-on-surface/10">
                                    {(['desc', 'asc'] as const).map(dir => {
                                      const active = columnSort?.key === key && columnSort.direction === dir;
                                      return (
                                        <button
                                          key={dir}
                                          onClick={e => { e.stopPropagation(); setColumnSort(active ? null : { key, direction: dir }); }}
                                          className={cn(
                                            'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold text-left transition-colors',
                                            active ? 'bg-primary/15 text-primary' : 'text-on-surface/60 hover:bg-on-surface/[0.05]'
                                          )}
                                        >
                                          {dir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                                          {COLUMN_SORT_OPTIONS[key][dir]}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
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
                          </div>
                        ) : null}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {mainTableView === 'cartoes' ? (<>
                {filteredCartoes.length === 0 ? (
                  <tr>
                    <td colSpan={activeColumns.length} className="px-4 py-16 text-center">
                      <CreditCard size={40} className="mx-auto mb-3 text-on-surface/20" />
                      <p className="font-bold text-on-surface/30">Nenhuma compra de cartão encontrada</p>
                    </td>
                  </tr>
                ) : (
                  filteredCartoes.map(t => {
                    const groupTotal = getParcelaGroupTotal(t);
                    const groupPago = getParcelaGroupPago(t);
                    const restante = groupTotal !== null && groupPago !== null ? groupTotal - groupPago : t.valor_final - t.total_pago;
                    return (
                      <tr
                        key={t.id}
                        className={cn(
                          'border-b border-on-surface/15 dark:border-on-surface/5 transition-colors hover:bg-on-surface/[0.05] dark:hover:bg-on-surface/[0.02] bg-on-surface/[0.035] dark:bg-transparent',
                          t.pago && 'opacity-60'
                        )}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          {t.codigo && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-black tracking-wide border border-primary/20 bg-primary/10 text-primary">
                              {t.codigo}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-on-surface/70">{fmtDate(t.data)}</td>
                        <td className="px-4 py-3 text-on-surface/70 max-w-[140px] truncate" title={cards.find(c => c.id === t.card_id)?.nome ?? '—'}>
                          {cards.find(c => c.id === t.card_id)?.nome ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 w-fit px-1.5 py-0.5 rounded-full text-[10px] font-semibold border border-on-surface/[0.14] text-on-surface/65">
                            <span className="font-black text-primary">{t.numero_parcela ?? 1}/{t.total_parcelas ?? 1}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[180px]">
                          {(() => {
                            const favMatch = favorecidos.find(f => f.nome_fiscal.trim().toLowerCase() === t.favorecido.trim().toLowerCase());
                            return (
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-on-surface truncate min-w-0" title={t.favorecido}>{t.favorecido}</span>
                                <button
                                  onClick={() => favMatch && setDetailsFavorecido(favMatch)}
                                  disabled={!favMatch}
                                  title={favMatch ? 'Ver detalhes do favorecido' : 'Favorecido sem cadastro'}
                                  className={cn(
                                    'w-[22px] h-[22px] rounded-[7px] flex items-center justify-center shrink-0 transition-[background-color,color,transform]',
                                    favMatch
                                      ? 'text-on-surface/35 hover:bg-primary/10 hover:text-primary active:scale-[0.9]'
                                      : 'text-on-surface/15 cursor-not-allowed'
                                  )}
                                >
                                  <Eye size={12} />
                                </button>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-on-surface/70">{t.estabelecimento}</td>
                        <td className="px-4 py-3 overflow-visible">
                          {(() => {
                            const ids = t.tag_ids ?? [];
                            const mainTag = ids.length > 0 ? tags.find(tg => tg.id === ids[0]) : undefined;
                            if (!mainTag) return <span className="text-[10px] italic text-on-surface/25">sem tag</span>;
                            const c = TAG_COLOR_MAP[mainTag.cor] ?? TAG_COLOR_MAP.gray;
                            const extra = ids.length - 1;
                            return (
                              <div className="relative inline-flex items-center w-fit -my-1.5 -mx-2 py-1.5 px-2">
                                {extra > 0 && (<>
                                  <span
                                    className={cn('absolute rounded-full border opacity-35', c.bg, c.border, c.bgDark, c.borderDark)}
                                    style={{ left: 2, top: 6, right: 8, bottom: 6, transform: 'translate(4px, 3px) rotate(5deg)' }}
                                  />
                                  <span
                                    className={cn('absolute rounded-full border opacity-60', c.bg, c.border, c.bgDark, c.borderDark)}
                                    style={{ left: 2, top: 6, right: 8, bottom: 6, transform: 'translate(2px, 1.5px) rotate(2.5deg)' }}
                                  />
                                </>)}
                                <span className={cn(
                                  'relative z-[2] inline-flex items-center px-2.5 py-[3px] rounded-full text-[10px] font-bold border whitespace-nowrap shadow-sm',
                                  c.bg, c.text, c.border, c.bgDark, c.textDark, c.borderDark
                                )}>
                                  {mainTag.nome}
                                </span>
                                {extra > 0 && (
                                  <span className="absolute -top-0.5 right-0 z-[3] min-w-[15px] h-[15px] px-[3px] rounded-full flex items-center justify-center text-[8.5px] font-black bg-primary text-white border-2 border-surface-container-low leading-none">
                                    +{extra}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-on-surface/70">
                          {fmtDate(t.vencimento)}
                          {isDueSoon(t.vencimento) && !t.pago && (
                            <span className="text-red-600 dark:text-red-400 font-black ml-0.5" title="Vence em até 7 dias">*</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-on-surface">
                          {fmt(t.valor_final)}
                          {groupTotal !== null && (
                            <span className="block text-[9.5px] font-medium text-on-surface/35 mt-0.5">
                              de {fmt(groupTotal)}
                            </span>
                          )}
                        </td>
                        <td className={cn('px-4 py-3 whitespace-nowrap font-semibold', restante > 0 ? 'text-rose-500' : 'text-emerald-500')}>
                          {fmt(restante)}
                          {groupTotal !== null && (
                            <span className="block text-[9.5px] font-medium text-on-surface/35 mt-0.5">
                              de {fmt(groupTotal)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div
                            title={t.pago ? 'Pago (definido pela fatura)' : 'Em aberto'}
                            className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center',
                              t.pago ? 'bg-primary/70 border-primary/70' : 'border-on-surface/20'
                            )}
                          >
                            {t.pago && <Check size={12} className="text-on-primary" />}
                          </div>
                        </td>
                        <td className="px-4 py-3">
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
                {filteredCartoes.length > 0 && filteredCartoes.length < MIN_TABLE_ROWS_FOR_FILTER_MENU &&
                  Array.from({ length: MIN_TABLE_ROWS_FOR_FILTER_MENU - filteredCartoes.length }).map((_, i) => (
                    <tr key={`filler-cartoes-${i}`} aria-hidden="true">
                      <td colSpan={activeColumns.length} className="px-4 h-[52px]" />
                    </tr>
                  ))}
                </>) : (<>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={showSelectCol ? activeColumns.length + 1 : activeColumns.length} className="px-4 py-16 text-center">
                      <Wallet size={40} className="mx-auto mb-3 text-on-surface/20" />
                      <p className="font-bold text-on-surface/30">Nenhuma movimentação encontrada</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(t => {
                    const groupTotal = getParcelaGroupTotal(t);
                    const groupPago = getParcelaGroupPago(t);
                    const totalPagoDisplay = groupPago ?? t.total_pago;
                    const restante = groupTotal !== null && groupPago !== null ? groupTotal - groupPago : t.valor_final - t.total_pago;
                    const isSelected = selectedIds.has(t.id);
                    return (
                      <tr
                        key={t.id}
                        onClick={selectionMode ? () => toggleSelectRow(t.id) : undefined}
                        className={cn(
                          'border-b border-on-surface/15 dark:border-on-surface/5 transition-colors',
                          selectionMode ? 'cursor-pointer' : 'hover:bg-on-surface/[0.05] dark:hover:bg-on-surface/[0.02]',
                          isSelected
                            ? 'bg-primary/10 hover:bg-primary/15'
                            : selectionMode
                              ? 'hover:bg-on-surface/[0.03]'
                              : 'bg-on-surface/[0.035] dark:bg-transparent',
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
                        <td className="px-4 py-3 whitespace-nowrap">
                          {t.codigo && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-black tracking-wide border border-primary/20 bg-primary/10 text-primary">
                              {t.codigo}
                            </span>
                          )}
                        </td>
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
                        <td className="px-4 py-3">
                          {t.is_fatura_consolidada ? (
                            <span className="inline-flex items-center gap-1 w-fit px-1.5 py-0.5 rounded-full text-[10px] font-semibold border border-primary/20 bg-primary/10 text-primary">
                              Fatura
                            </span>
                          ) : (() => {
                            const numero = t.tipo_pagamento === 'Cheque' ? t.numero_cheque
                              : t.tipo_pagamento === 'Boleto' ? (t.codigo_barras ? t.codigo_barras.slice(-8) : null)
                              : t.identificacao;
                            return (
                              <div className="flex flex-col gap-1 items-start">
                                <span className="inline-flex items-center gap-1 w-fit px-1.5 py-0.5 rounded-full text-[10px] font-semibold border border-on-surface/[0.14] text-on-surface/65">
                                  {t.tipo_pagamento}
                                  {t.vencimento && (
                                    <span className="font-black text-primary">{t.numero_parcela ?? 1}/{t.total_parcelas ?? 1}</span>
                                  )}
                                </span>
                                {numero && (
                                  <span
                                    className="inline-flex items-center gap-1 w-fit max-w-[130px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold border border-on-surface/10 bg-on-surface/[0.045] text-on-surface/45"
                                    title={t.tipo_pagamento === 'Boleto' ? (t.codigo_barras ?? undefined) : numero}
                                  >
                                    <span className="truncate min-w-0">#{numero}</span>
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 max-w-[180px]">
                          {t.is_fatura_consolidada ? (
                            <div className="flex items-center gap-1.5">
                              <CreditCard size={12} className="text-primary shrink-0" />
                              <span className="font-semibold text-on-surface truncate min-w-0" title={t.favorecido}>{t.favorecido}</span>
                              <button
                                onClick={() => t.card_id && t.fatura_periodo && goToFatura(t.card_id, t.fatura_periodo)}
                                title="Ver fatura detalhada"
                                className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center shrink-0 bg-primary/10 text-primary hover:bg-primary/20 active:scale-[0.9] transition-[background-color,transform]"
                              >
                                <Eye size={12} />
                              </button>
                            </div>
                          ) : (() => {
                            const favMatch = favorecidos.find(f => f.nome_fiscal.trim().toLowerCase() === t.favorecido.trim().toLowerCase());
                            return (
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-on-surface truncate min-w-0" title={t.favorecido}>{t.favorecido}</span>
                                <button
                                  onClick={() => favMatch && setDetailsFavorecido(favMatch)}
                                  disabled={!favMatch}
                                  title={favMatch ? 'Ver detalhes do favorecido' : 'Favorecido sem cadastro'}
                                  className={cn(
                                    'w-[22px] h-[22px] rounded-[7px] flex items-center justify-center shrink-0 transition-[background-color,color,transform]',
                                    favMatch
                                      ? 'text-on-surface/35 hover:bg-primary/10 hover:text-primary active:scale-[0.9]'
                                      : 'text-on-surface/15 cursor-not-allowed'
                                  )}
                                >
                                  <Eye size={12} />
                                </button>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-on-surface/70">{t.estabelecimento}</td>
                        <td className="px-4 py-3 overflow-visible">
                          {(() => {
                            const ids = t.tag_ids ?? [];
                            const mainTag = ids.length > 0 ? tags.find(tg => tg.id === ids[0]) : undefined;
                            if (!mainTag) return <span className="text-[10px] italic text-on-surface/25">sem tag</span>;
                            const c = TAG_COLOR_MAP[mainTag.cor] ?? TAG_COLOR_MAP.gray;
                            const extra = ids.length - 1;
                            return (
                              <div className="relative inline-flex items-center w-fit -my-1.5 -mx-2 py-1.5 px-2">
                                {extra > 0 && (<>
                                  <span
                                    className={cn('absolute rounded-full border opacity-35', c.bg, c.border, c.bgDark, c.borderDark)}
                                    style={{ left: 2, top: 6, right: 8, bottom: 6, transform: 'translate(4px, 3px) rotate(5deg)' }}
                                  />
                                  <span
                                    className={cn('absolute rounded-full border opacity-60', c.bg, c.border, c.bgDark, c.borderDark)}
                                    style={{ left: 2, top: 6, right: 8, bottom: 6, transform: 'translate(2px, 1.5px) rotate(2.5deg)' }}
                                  />
                                </>)}
                                <span className={cn(
                                  'relative z-[2] inline-flex items-center px-2.5 py-[3px] rounded-full text-[10px] font-bold border whitespace-nowrap shadow-sm',
                                  c.bg, c.text, c.border, c.bgDark, c.textDark, c.borderDark
                                )}>
                                  {mainTag.nome}
                                </span>
                                {extra > 0 && (
                                  <span className="absolute -top-0.5 right-0 z-[3] min-w-[15px] h-[15px] px-[3px] rounded-full flex items-center justify-center text-[8.5px] font-black bg-primary text-white border-2 border-surface-container-low leading-none">
                                    +{extra}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-on-surface/70">
                          {fmtDate(t.vencimento)}
                          {isDueSoon(t.vencimento) && !t.pago && (
                            <span className="text-red-600 dark:text-red-400 font-black ml-0.5" title="Vence em até 7 dias">*</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-on-surface">
                          {fmt(t.valor_final)}
                          {getParcelaGroupTotal(t) !== null && (
                            <span className="block text-[9.5px] font-medium text-on-surface/35 mt-0.5">
                              de {fmt(getParcelaGroupTotal(t)!)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-emerald-500">
                          {fmt(totalPagoDisplay)}
                          {groupTotal !== null && (
                            <span className="block text-[9.5px] font-medium text-on-surface/35 mt-0.5">
                              de {fmt(groupTotal)}
                            </span>
                          )}
                        </td>
                        <td className={cn('px-4 py-3 whitespace-nowrap font-semibold', restante > 0 ? 'text-rose-500' : 'text-emerald-500')}>
                          {fmt(restante)}
                          {groupTotal !== null && (
                            <span className="block text-[9.5px] font-medium text-on-surface/35 mt-0.5">
                              de {fmt(groupTotal)}
                            </span>
                          )}
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
                            {t.origem !== 'hr_salario' && (
                              <button onClick={() => handleDeleteTx(t.id)} className="w-7 h-7 rounded-lg hover:bg-rose-500/10 flex items-center justify-center text-on-surface/40 hover:text-rose-500 transition-colors">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
                {/* Linhas de preenchimento invisíveis — garantem altura mínima na tabela para que o
                    dropdown de filtro de coluna não seja cortado quando poucas linhas são exibidas
                    (o wrapper com overflow-x-auto corta overflow vertical de conteúdo mais alto que ele). */}
                {filtered.length > 0 && filtered.length < MIN_TABLE_ROWS_FOR_FILTER_MENU &&
                  Array.from({ length: MIN_TABLE_ROWS_FOR_FILTER_MENU - filtered.length }).map((_, i) => (
                    <tr key={`filler-${i}`} aria-hidden="true">
                      <td colSpan={showSelectCol ? activeColumns.length + 1 : activeColumns.length} className="px-4 h-[52px]" />
                    </tr>
                  ))}
                </>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
      );
      })()}

      {/* Barra de rolagem horizontal flutuante — fixa na base da viewport enquanto a
          tabela ainda continua abaixo da tela; sincronizada com o scroll real da tabela. */}
      <div
        ref={floatScrollRef}
        style={{ opacity: 0, pointerEvents: 'none' }}
        className="fixed bottom-0 left-0 w-0 h-3.5 z-[150] overflow-x-auto overflow-y-hidden bg-on-surface/[0.06] dark:bg-white/[0.06] border-t border-on-surface/10 transition-opacity duration-150 [&::-webkit-scrollbar]:h-3.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[rgba(216,30,30,0.55)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-clip-padding hover:[&::-webkit-scrollbar-thumb]:bg-[rgba(216,30,30,0.75)]"
      >
        <div ref={floatScrollInnerRef} className="h-px" />
      </div>

      {/* ── Transaction Modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showTxModal && (() => {
          const isLockedView = !!editingId && txLocked;
          const isHrSalario = !!editingId && editingTx?.origem === 'hr_salario';
          const isFaturaRow = !!editingTx?.is_fatura_consolidada;
          const faturaValorConsolidado = isFaturaRow
            ? transactions
                .filter(x => x.card_id === editingTx!.card_id && x.fatura_periodo === editingTx!.fatura_periodo && !x.is_fatura_consolidada)
                .reduce((s, x) => s + x.valor_final, 0)
            : 0;
          const selectedAccount = accounts.find(a => a.id === txForm.account_id);
          const selectedTagObjs = tags.filter(tg => (txForm.tag_ids ?? []).includes(tg.id));
          const showIdentificacao = txForm.tipo_pagamento !== 'Cheque' && txForm.tipo_pagamento !== 'Boleto';
          const parcelasSummary = !parcelasEnabled || parcelas.length === 0
            ? 'Sem vencimento'
            : parcelas.length === 1
              ? `Vencimento: ${fmtDate(parcelas[0].data)}`
              : `${parcelas.length} parcelas · Total ${fmt(totalParcelas)}`;
          const sectionCls = 'md:col-span-2 bg-white dark:bg-[#252520] border border-black/[0.07] dark:border-white/[0.08] shadow-sm rounded-2xl p-5 space-y-4';
          const sectionHeadCls = 'flex items-center gap-2';
          const sectionTitleCls = 'text-[11px] font-extrabold uppercase tracking-wide text-[#1A1A0E] dark:text-[#F2F0E3]';
          const fieldGridCls = 'grid grid-cols-1 md:grid-cols-2 gap-3.5';
          return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowTxModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-black/10 dark:border-white/[0.08] flex flex-col"
            >
              {/* Header */}
              <div className="px-7 py-5 flex items-center gap-3.5 bg-[#FFE500] dark:bg-[#252520] border-b border-[#D4C000] dark:border-white/[0.07] shrink-0">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                  <Wallet size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-manrope font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">
                    {editingId ? 'Editar Movimentação' : 'Nova Movimentação'}
                  </h2>
                  <p className="text-xs font-bold text-[#1A1A0E]/55 dark:text-white/35 mt-0.5">
                    {editingId ? 'Ajuste os dados abaixo' : 'Preencha os dados abaixo'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isHrSalario && (
                    <span
                      title="Gerada pelo RH — apenas Conta, Tipo de Pagamento, Identificação e Observações podem ser editados."
                      className="flex items-center gap-1.5 px-2.5 h-9 rounded-xl bg-black/[0.08] dark:bg-white/[0.06] text-[#1A1A0E]/50 dark:text-white/40 text-[10px] font-bold uppercase tracking-wide"
                    >
                      <Lock size={12} /> RH
                    </span>
                  )}
                  {editingId && (
                    <button
                      type="button"
                      onClick={handleToggleTxLock}
                      title={txLocked ? 'Habilitar edição' : 'Sair do modo de edição'}
                      className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
                        !txLocked ? 'bg-[#D81E1E]/10 text-[#D81E1E]' : 'bg-black/[0.08] dark:bg-white/[0.06] text-[#1A1A0E]/50 dark:text-white/35 hover:bg-black/[0.14] dark:hover:bg-white/[0.10]'
                      )}
                    >
                      <Edit2 size={15} />
                    </button>
                  )}
                  <button
                    onClick={() => setShowTxModal(false)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] dark:bg-white/[0.06] border border-black/10 dark:border-white/[0.08] text-black/50 dark:text-white/35 hover:bg-black/[0.14] dark:hover:bg-white/[0.10] transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Tabs: Receita / Despesa */}
              <div className="px-7 pt-5 flex gap-3 shrink-0">
                {(['Receita', 'Despesa'] as TransactionType[]).map(tab => (
                  <button
                    key={tab}
                    disabled={isLockedView || isHrSalario}
                    onClick={() => {
                      setTxForm(f => ({ ...f, tipo: tab }));
                      setParcelasEnabled(false);
                      setParcelas([]);
                      setEditingGroupIds(null);
                      setEditingParcelamentoId(null);
                    }}
                    className={cn(
                      'flex-1 py-2.5 rounded-xl text-sm font-bold transition-all',
                      (isLockedView || isHrSalario) && 'opacity-60 cursor-not-allowed',
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

              <div className="px-7 py-6 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">

              <div className={sectionCls}>
                <div className={sectionHeadCls}>
                  <Users size={15} className="text-primary shrink-0" />
                  <span className={sectionTitleCls}>Identificação</span>
                </div>
                <div className={fieldGridCls}>

                {/* Data */}
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Data</label>
                  {isLockedView || isHrSalario || isFaturaRow ? (
                    <div className={viewBlockCls}>{fmtDate(txForm.data)}</div>
                  ) : (
                    <input type="date" value={txForm.data} onChange={e => setTxForm(f => ({ ...f, data: e.target.value }))} className={inputCls} />
                  )}
                </div>

                {/* Favorecido — custom combobox */}
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Favorecido</label>
                  {isLockedView || isHrSalario || isFaturaRow ? (
                    <div className={viewBlockCls}>{txForm.favorecido || '—'}</div>
                  ) : (
                    <div className="flex gap-2 items-stretch">
                      <div className="relative flex-1" ref={favRef}>
                        <input
                          value={txForm.favorecido}
                          onChange={e => { setTxForm(f => ({ ...f, favorecido: e.target.value })); if (!favFreeMode) setFavOpen(true); }}
                          onFocus={() => { if (!favFreeMode) setFavOpen(true); }}
                          placeholder={favFreeMode ? 'Descrição livre — vincule depois em Dados › Favorecidos' : 'Digite para buscar...'}
                          className={cn(
                            inputCls,
                            favFreeMode && 'border-amber-500/40 bg-amber-500/[0.06] placeholder:text-amber-700 dark:placeholder:text-amber-300 placeholder:italic'
                          )}
                          autoComplete="off"
                        />
                        <AnimatePresence>
                          {favOpen && !favFreeMode && (
                            <motion.ul
                              initial={{ opacity: 0, y: -4, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -4, scale: 0.98 }}
                              transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
                              className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-[#2a2a24] border border-[rgba(26,26,10,0.10)] dark:border-white/10 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto"
                            >
                              {favorecidos
                                .filter(fv => !txForm.favorecido || fv.nome_fiscal.toLowerCase().includes(txForm.favorecido.toLowerCase()))
                                .map(fv => (
                                  <li
                                    key={fv.id}
                                    onMouseDown={() => { setTxForm(f => ({ ...f, favorecido: fv.nome_fiscal })); setFavOpen(false); }}
                                    className="px-3 py-2.5 text-sm text-[#1A1A0E] dark:text-[#F2F0E3] hover:bg-[rgba(26,26,10,0.05)] dark:hover:bg-white/[0.06] cursor-pointer transition-colors"
                                  >
                                    <span className="font-semibold">{fv.nome_fiscal}</span>
                                    {fv.nome_banco && <span className="ml-2 text-xs text-[rgba(26,26,10,0.40)] dark:text-white/28">{fv.nome_banco}</span>}
                                  </li>
                                ))}
                              {favorecidos.filter(fv => !txForm.favorecido || fv.nome_fiscal.toLowerCase().includes(txForm.favorecido.toLowerCase())).length === 0 && (
                                <li className="px-3 py-2.5 text-sm text-[rgba(26,26,10,0.35)] dark:text-white/25 italic">Nenhum resultado</li>
                              )}
                            </motion.ul>
                          )}
                        </AnimatePresence>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setFavFreeMode(v => !v); setFavOpen(false); }}
                        title={favFreeMode ? 'Voltar ao modo com sugestões' : 'Digitar descrição livre (sem vincular a um favorecido cadastrado)'}
                        className={cn(
                          'shrink-0 w-9 h-9 self-center flex items-center justify-center rounded-xl border active:scale-[0.93] transition-all',
                          favFreeMode
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                            : 'bg-on-surface/8 border-on-surface/10 text-on-surface/60 hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-400 hover:border-amber-500/30'
                        )}
                        style={{ transition: 'all 160ms cubic-bezier(0.23,1,0.32,1)' }}
                      >
                        <Unlock size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={openNewFavorecido}
                        title="Cadastrar favorecido"
                        className="shrink-0 w-9 h-9 self-center flex items-center justify-center rounded-xl bg-on-surface/8 border border-on-surface/10 text-on-surface/60 hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-[0.93] transition-all"
                        style={{ transition: 'all 160ms cubic-bezier(0.23,1,0.32,1)' }}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  )}
                  {favFreeMode && (
                    <div className="flex items-center gap-1.5 mt-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      <Unlock size={11} className="shrink-0" />
                      Modo livre: não será validado contra cadastros — vincule depois em Dados › Favorecidos
                    </div>
                  )}
                </div>
                </div>
              </div>

              <div className={sectionCls}>
                <div className={sectionHeadCls}>
                  <CreditCard size={15} className="text-primary shrink-0" />
                  <span className={sectionTitleCls}>Pagamento</span>
                </div>
                <div className={fieldGridCls}>

                {/* Conta */}
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Conta</label>
                  {isLockedView || isFaturaRow ? (
                    <div className={viewBlockCls}>{selectedAccount ? `${selectedAccount.nome} — ${selectedAccount.banco}` : '—'}</div>
                  ) : editingTx && needsPaymentQuestionnaire(editingTx) && editingTx.pago ? (
                    // Movimentação já paga: conta trava contra edições acidentais — a troca
                    // só acontece pelo mesmo mini-formulário usado ao marcar como paga.
                    <div className="flex flex-col gap-1">
                      <div className={cn(viewBlockCls, 'justify-between gap-2')}>
                        <span className="truncate">{selectedAccount ? `${selectedAccount.nome} — ${selectedAccount.banco}` : '—'}</span>
                        <Lock size={13} className="text-on-surface/30 shrink-0" />
                      </div>
                      {editingTx.data_pagamento && (
                        <span className="text-[10px] font-semibold text-on-surface/40">Pago em {fmtDate(editingTx.data_pagamento)}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => openMarkPaidModal(editingTx)}
                        className="self-start flex items-center gap-1 text-[11px] font-bold text-primary hover:opacity-70 transition-opacity"
                      >
                        <Edit2 size={11} /> Alterar conta do pagamento
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-stretch">
                      <select
                        value={txForm.account_id ?? ''}
                        onChange={e => {
                          const accountId = e.target.value || null;
                          // Trocar de conta pode invalidar o cartão selecionado (pertence à conta anterior).
                          const stillValid = cards.some(c => c.id === txForm.card_id && c.account_id === accountId);
                          setTxForm(f => ({ ...f, account_id: accountId, card_id: stillValid ? f.card_id : null }));
                          if (!stillValid && txForm.tipo_pagamento === 'Crédito') { setParcelasEnabled(false); setParcelas([]); }
                        }}
                        className={cn(inputCls, 'flex-1')}
                      >
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
                  )}
                </div>

                {/* Tipo de Pagamento (+ Numeração do Cheque + Vencimento/Parcelas) */}
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Tipo de Pagamento</label>
                  {isLockedView || isFaturaRow ? (
                    <div className={viewBlockCls}>{txForm.tipo_pagamento}</div>
                  ) : (() => {
                    const accountHasCards = cards.some(c => c.account_id === txForm.account_id);
                    return (
                      <select
                        value={txForm.tipo_pagamento}
                        onChange={e => {
                          const nextType = e.target.value as PaymentType;
                          if (nextType === 'Crédito') {
                            const defaultCard = cards.find(c => c.account_id === txForm.account_id);
                            setTxForm(f => ({ ...f, tipo_pagamento: nextType, card_id: defaultCard?.id ?? null }));
                            setParcelasEnabled(true);
                            setParcelas([{ seq: 1, data: '', valor: txForm.valor_final ? String(txForm.valor_final) : '', codigo_barras: '' }]);
                          } else {
                            setTxForm(f => ({ ...f, tipo_pagamento: nextType, card_id: null }));
                            if (txForm.tipo_pagamento === 'Crédito') { setParcelasEnabled(false); setParcelas([]); }
                          }
                        }}
                        className={inputCls}
                      >
                        {PAYMENT_TYPES.map(p => (
                          <option key={p} value={p} disabled={p === 'Crédito' && !accountHasCards}>
                            {p}{p === 'Crédito' && !accountHasCards ? ' (conta sem cartão)' : ''}
                          </option>
                        ))}
                      </select>
                    );
                  })()}

                  {/* Cartão — só aparece quando Tipo de Pagamento é Crédito */}
                  {txForm.tipo_pagamento === 'Crédito' && (
                    <div className="flex flex-col gap-1.5 mt-2">
                      <label className={labelCls}>Cartão</label>
                      {isLockedView || isFaturaRow ? (
                        <div className={viewBlockCls}>{cards.find(c => c.id === txForm.card_id)?.nome ?? '—'}</div>
                      ) : (
                        <select
                          value={txForm.card_id ?? ''}
                          onChange={e => setTxForm(f => ({ ...f, card_id: e.target.value || null }))}
                          className={inputCls}
                        >
                          <option value="">Selecione o cartão...</option>
                          {cards.filter(c => c.account_id === txForm.account_id).map(c => (
                            <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Numeração do Cheque */}
                  {txForm.tipo_pagamento === 'Cheque' && (
                    <div className="flex flex-col gap-1.5 mt-2">
                      <label className={labelCls}>Numeração do Cheque</label>
                      {isLockedView ? (
                        <div className={viewBlockCls}>{txForm.numero_cheque || '—'}</div>
                      ) : (
                        <input
                          type="text"
                          value={txForm.numero_cheque ?? ''}
                          onChange={e => setTxForm(f => ({ ...f, numero_cheque: e.target.value || null }))}
                          placeholder="Ex: 000123"
                          className={inputCls}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Vencimento / Parcelas — 1 parcela = pagamento único com vencimento */}
                {isFaturaRow ? (
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Vencimento / Parcelas</label>
                    <div className={viewBlockCls}>Fatura fechada · {fmtDate(editingTx!.vencimento)}</div>
                  </div>
                ) : isLockedView || isHrSalario ? (
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Vencimento / Parcelas</label>
                    <div className={viewBlockCls}>{parcelasSummary}</div>
                  </div>
                ) : txForm.tipo_pagamento === 'Crédito' ? renderCreditoParcelasSection() : renderParcelasSection()}

                {/* Identificação — genérico para os tipos que não têm campo próprio (não se aplica a faturas) */}
                {showIdentificacao && !isFaturaRow && (
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Identificação</label>
                    {isLockedView ? (
                      <div className={viewBlockCls}>{txForm.identificacao || '—'}</div>
                    ) : (
                      <input
                        type="text"
                        value={txForm.identificacao ?? ''}
                        onChange={e => setTxForm(f => ({ ...f, identificacao: e.target.value || null }))}
                        placeholder="Ex: número, código ou referência"
                        className={inputCls}
                      />
                    )}
                  </div>
                )}

                {/* Valor */}
                {isFaturaRow ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className={cn(labelCls, 'flex items-center gap-1.5')}>
                        Valor (R$)
                        {txForm.usar_valor_real && (
                          <span className="normal-case font-bold text-primary text-[9px] bg-primary/10 rounded-full px-1.5 py-0.5">usa valor real</span>
                        )}
                      </label>
                      <div className={cn(viewBlockCls, 'font-bold')}>
                        {fmt(txForm.usar_valor_real ? (txForm.valor_real ?? faturaValorConsolidado) : faturaValorConsolidado)}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <div className="flex items-center justify-between bg-on-surface/[0.03] border border-dashed border-on-surface/[0.14] rounded-xl px-3.5 py-2.5">
                        <span className="text-[11px] font-bold text-on-surface/55">
                          Valor Consolidado <span className="opacity-70 font-medium">(soma automática dos lançamentos)</span>
                        </span>
                        <span className="font-mono font-black text-[14px] text-on-surface">{fmt(faturaValorConsolidado)}</span>
                      </div>

                      <div className={cn(
                        'flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 border',
                        txForm.usar_valor_real ? 'border-primary/25 bg-primary/[0.04]' : 'border-dashed border-on-surface/[0.14]'
                      )}>
                        <div className="flex-1 min-w-0">
                          <span className={cn('text-[11px] font-bold block mb-1', txForm.usar_valor_real ? 'text-primary' : 'text-on-surface/55')}>
                            Valor Real <span className="opacity-70 font-medium normal-case">(digitado do app do banco)</span>
                          </span>
                          {isLockedView ? (
                            <span className="font-mono font-black text-[14px] text-on-surface">{txForm.valor_real != null ? fmt(txForm.valor_real) : '—'}</span>
                          ) : (
                            <input
                              type="number" step="0.01" min="0"
                              value={txForm.valor_real ?? ''}
                              onChange={e => setTxForm(f => ({ ...f, valor_real: e.target.value === '' ? null : parseFloat(e.target.value) || 0 }))}
                              onWheel={blockWheelChange}
                              placeholder="0,00"
                              className={cn('bg-transparent border-none outline-none w-full font-mono font-black text-[14px] text-on-surface p-0', noSpinnerCls)}
                            />
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={isLockedView}
                          onClick={() => setTxForm(f => ({ ...f, usar_valor_real: !f.usar_valor_real }))}
                          title="Usar valor real como Valor exibido"
                          className={cn(
                            'relative w-[38px] h-[22px] rounded-full shrink-0 transition-colors',
                            isLockedView && 'opacity-60 cursor-not-allowed',
                            txForm.usar_valor_real ? 'bg-primary' : 'bg-on-surface/15'
                          )}
                        >
                          <span className={cn(
                            'absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform',
                            txForm.usar_valor_real && 'translate-x-4'
                          )} />
                        </button>
                      </div>
                      <p className="text-[10px] text-on-surface/30 leading-tight">
                        Interruptor ligado: o campo "Valor" acima reflete o Valor Real. Desligado: volta a refletir o Valor Consolidado automaticamente.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Valor (R$)</label>
                    {isLockedView || isHrSalario ? (
                      <div className={viewBlockCls}>{fmt(parcelasEnabled ? totalParcelas : txForm.valor_final)}</div>
                    ) : parcelasEnabled ? (
                      <div className={cn(inputCls, 'bg-on-surface/5 text-on-surface/60 select-none')}>
                        {totalParcelas > 0 ? fmt(totalParcelas) : 'Soma das parcelas'}
                      </div>
                    ) : (
                      <input type="number" step="0.01" min="0" value={txForm.valor_final || ''} onChange={e => setTxForm(f => ({ ...f, valor_final: parseFloat(e.target.value) || 0 }))} onWheel={blockWheelChange} placeholder="0,00" className={cn(inputCls, noSpinnerCls)} />
                    )}
                  </div>
                )}
                </div>
              </div>

              <div className={sectionCls}>
                <div className={sectionHeadCls}>
                  <CheckSquare size={15} className="text-primary shrink-0" />
                  <span className={sectionTitleCls}>Classificação</span>
                </div>
                <div className={fieldGridCls}>

                {/* Tags */}
                {isLockedView || isHrSalario ? (
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className={labelCls}>Tags</label>
                    {selectedTagObjs.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTagObjs.map(tg => {
                          const c = TAG_COLOR_MAP[tg.cor] ?? TAG_COLOR_MAP.gray;
                          return (
                            <span key={tg.id} className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border', c.bg, c.text, c.border, c.bgDark, c.textDark, c.borderDark)}>
                              {tg.nome}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={viewBlockCls}>Nenhuma tag</div>
                    )}
                  </div>
                ) : (
                  <div className="md:col-span-2">
                    <TagSelector
                      tags={tags.filter(tg => !tg.exclusivo)}
                      value={txForm.tag_ids ?? []}
                      onChange={ids => setTxForm(f => ({ ...f, tag_ids: ids }))}
                      onCreateTag={(nome, cor) => createTag(nome, cor, '')}
                      parcelCount={parcelasEnabled ? parcelas.length : undefined}
                    />
                  </div>
                )}

                {/* Estabelecimento */}
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className={labelCls}>Estabelecimento</label>
                  {isLockedView || isHrSalario || isFaturaRow ? (
                    <div className={viewBlockCls}>{txForm.estabelecimento || '—'}</div>
                  ) : (
                    <select value={txForm.estabelecimento} onChange={e => setTxForm(f => ({ ...f, estabelecimento: e.target.value }))} className={inputCls}>
                      {ESTABLISHMENTS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  )}
                </div>
                </div>
              </div>

              {/* Notas Fiscais Vinculadas — não se aplica a faturas de cartão consolidadas */}
              {!isFaturaRow && (
              <div className={sectionCls}>
                <div className={sectionHeadCls}>
                  <FileUp size={15} className="text-primary shrink-0" />
                  <span className={sectionTitleCls}>Notas Fiscais Vinculadas</span>
                </div>
                <LinkedNotesSection
                  variant="desktop"
                  editable={!isLockedView && !isHrSalario}
                  txId={editingId}
                  txMeta={{ favorecido: txForm.favorecido, valor_final: txForm.valor_final }}
                  pendingNotes={pendingNotes}
                  onPendingChange={setPendingNotes}
                  siblingTxs={editingTxSiblings}
                />
              </div>
              )}

              <div className={sectionCls}>
                <div className={sectionHeadCls}>
                  <Info size={15} className="text-primary shrink-0" />
                  <span className={sectionTitleCls}>Observações</span>
                </div>
                {/* Observações */}
                <div className="flex flex-col gap-1.5">
                  {isLockedView ? (
                    <div className={cn(viewBlockCls, 'whitespace-pre-wrap items-start')}>{txForm.observacoes || '—'}</div>
                  ) : (
                    <textarea
                      value={txForm.observacoes ?? ''}
                      onChange={e => setTxForm(f => ({ ...f, observacoes: e.target.value || null }))}
                      rows={3}
                      placeholder="Comentários sobre esta movimentação... (opcional)"
                      className={cn(inputCls, 'resize-none')}
                    />
                  )}
                </div>
              </div>

              </div>

              <div className="px-7 py-5 border-t border-black/10 dark:border-white/[0.08] flex gap-3 shrink-0">
                {isLockedView ? (
                  <button onClick={() => setShowTxModal(false)} className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors">
                    Fechar
                  </button>
                ) : (<>
                  <button onClick={() => setShowTxModal(false)} className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={isFaturaRow ? handleSaveFaturaConsolidada : isHrSalario ? handleSaveSalarioTx : handleTxSubmit} disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    {editingId ? 'Salvar Alterações' : 'Adicionar'}
                  </button>
                </>)}
              </div>
            </motion.div>
          </div>
          );
        })()}
      </AnimatePresence>

      {/* ── Confirmação de descarte ao sair da edição sem salvar ────────────── */}
      <AnimatePresence>
        {showDiscardEditConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDiscardEditConfirm(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-low rounded-2xl p-5 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                  <AlertTriangle size={17} />
                </div>
                <h3 className="text-base font-manrope font-extrabold text-on-surface">Sair sem salvar?</h3>
              </div>
              <p className="text-sm text-on-surface/60 mb-5">
                Você tem alterações não salvas nesta movimentação. Se sair do modo de edição agora, elas serão descartadas.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowDiscardEditConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors">
                  Continuar editando
                </button>
                <button onClick={confirmDiscardTxEdit} className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-bold hover:opacity-90 transition-opacity">
                  Descartar alterações
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Confirmação de exclusão de movimentação ─────────────────────────── */}
      <AnimatePresence>
        {deleteTxConfirmId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTxConfirmId(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-low rounded-2xl p-5 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
                  <AlertTriangle size={17} />
                </div>
                <h3 className="text-base font-manrope font-extrabold text-on-surface">Excluir movimentação?</h3>
              </div>
              <p className="text-sm text-on-surface/60 mb-5">
                Esta ação não pode ser desfeita. A movimentação será excluída permanentemente.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteTxConfirmId(null)} className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors">
                  Cancelar
                </button>
                <button onClick={confirmDeleteTx} className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-bold hover:opacity-90 transition-opacity">
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Marcar como paga / alterar conta do pagamento ────────────────────── */}
      <AnimatePresence>
        {markPaidTx && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMarkPaidTx(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-low rounded-2xl p-5 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                  <CheckCircle2 size={17} />
                </div>
                <h3 className="text-base font-manrope font-extrabold text-on-surface">
                  {markPaidTx.pago ? 'Alterar conta do pagamento' : 'Marcar como paga'}
                </h3>
              </div>
              <p className="text-sm text-on-surface/60 mb-4">
                {markPaidTx.favorecido} · {markPaidTx.tipo_pagamento} · {fmt(markPaidTx.valor_final)}
              </p>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Conta utilizada</label>
                  <select value={markPaidAccountId} onChange={e => setMarkPaidAccountId(e.target.value)} className={inputCls}>
                    <option value="">Selecione a conta...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.nome} — {a.banco}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Data do pagamento</label>
                  <input type="date" value={markPaidDate} onChange={e => setMarkPaidDate(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setMarkPaidTx(null)} className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={confirmMarkPaid}
                  disabled={markPaidSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {markPaidSubmitting ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Confirmação de desmarcar como paga ───────────────────────────────── */}
      <AnimatePresence>
        {unmarkPaidTx && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setUnmarkPaidTx(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-low rounded-2xl p-5 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                  <AlertTriangle size={17} />
                </div>
                <h3 className="text-base font-manrope font-extrabold text-on-surface">Desmarcar como paga?</h3>
              </div>
              <p className="text-sm text-on-surface/60 mb-5">
                {unmarkPaidTx.data_pagamento
                  ? `A data de pagamento registrada (${fmtDate(unmarkPaidTx.data_pagamento)}) será apagada. A conta vinculada é mantida.`
                  : 'Esta movimentação voltará a aparecer como pendente.'}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setUnmarkPaidTx(null)} className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={confirmUnmarkPaid}
                  disabled={unmarkPaidSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {unmarkPaidSubmitting ? 'Salvando...' : 'Desmarcar'}
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

      {renderAccountModal()}

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

      {renderFavorecidoModals()}

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

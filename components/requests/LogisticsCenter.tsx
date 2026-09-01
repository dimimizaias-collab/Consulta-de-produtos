'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  FileUp,
  FileText,
  Users,
  Download,
  Plus,
  BookText,
  ClipboardList,
  Factory,
  Pencil,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Search,
  X,
  Building2,
  Link2,
  Filter,
  Info,
  Check,
  TrendingUp,
  Wallet,
  Edit3,
  Clock,
  Eye,
  Maximize2,
  Truck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { AddSupplierModal, type EditingSupplier } from '@/components/suppliers/AddSupplierModal';
import { SupplierDictionary } from '@/components/suppliers/SupplierDictionary';
import { AddManufacturerModal, type Manufacturer } from '@/components/manufacturers/AddManufacturerModal';
import { LinkTransactionModal } from './LinkTransactionModal';
import { fmtDateBR } from './ReceivedDateField';
import { DistributionManifestModal, type DistributionManifestDraft } from './DistributionManifestModal';

export type NoteStatus = 'registro' | 'aguardando_recebimento' | 'revisao' | 'aprovada';

export interface ReviewNote {
  id: string;
  timestamp: string;
  fileName: string;
  items: any[];
  itemCount: number;
  verifiedCount: number;
  approved?: boolean;
  status?: NoteStatus;
  noteNumber?: string;
  accessKey?: string;
  supplierName?: string;
  receivedDate?: string;
  createdAt?: string;
  orderDate?: string;
  companyId?: string | null;
  // Marca se a quantidade recebida já foi somada ao estoque da empresa — evita duplicar o
  // incremento se a nota for resalva/reaprovada depois de já estar "Aprovada".
  stockAppliedAt?: string | null;
  // Empresas extras (não-donas) que já tiveram preço/distribuição aplicados ao
  // product_company_stock delas na aprovação — evita duplicar a quantidade de Distribuição
  // se a nota for resalva/reaprovada depois de já aprovada.
  stockAppliedCompanies?: string[];
  lockedById?: string | null;
  lockedByName?: string | null;
  lockedAt?: string | null;
  supplierId?: string | null;
  finance_transaction_id?: string | null;
  finance_tx_favorecido?: string | null;
  finance_tx_valor?: number | null;
  // Situação da Distribuição — independente da Situação de Entrada, exclusiva do fluxo de
  // distribuição entre lojas (item.distribuicaoByCompany). Ver add_review_notes_distribution_status.sql.
  distributionStatus?: 'separacao' | 'distribuicao_enviada' | null;
  distributionSentAt?: string | null;
  distributionSentByName?: string | null;
  // XML original da NFe (autorizada pela SEFAZ) anexado à nota — usado como template
  // para gerar um XML corrigido pronto para importar no PDV. Ver botão "Baixar XML".
  originalNfeXml?: string | null;
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}%`;

type AdjType = 'pct' | 'fixed' | 'fixed_total';
type AdjColumnFull = { id: string; name: string; kind: 'desconto' | 'acrescimo'; mode: 'geral' | 'individual'; geralValue: number; geralType: AdjType; individualType: AdjType; items: string[] };

// mirrors calcAdjAmounts in app/page.tsx for notes with multiple adj columns
const calcAdjAmountsFull = (cost: number, qty: number, idx: number, cols: AdjColumnFull[]) => {
  let disc = 0, sur = 0;
  for (const col of cols) {
    let amt = 0;
    if (col.mode === 'geral') {
      amt = col.geralType === 'pct' ? cost * col.geralValue / 100 : col.geralValue;
    } else {
      const v = parseFloat(col.items[idx] ?? '');
      if (!isNaN(v) && v > 0) {
        amt = col.individualType === 'pct' ? cost * v / 100
          : col.individualType === 'fixed_total' ? v / (qty || 1) : v;
      }
    }
    if (col.kind === 'desconto') disc += amt; else sur += amt;
  }
  return { disc, sur };
};

// mirrors legacy per-item adj_discount_*/adj_surcharge_* fields saved before multi-column support
const calcAdjAmountsLegacy = (item: any, cost: number, qty: number) => {
  let disc = 0, sur = 0;
  if (item?.adj_discount_mode === 'geral' && item?.adj_discount_applied) {
    disc = item.adj_discount_applied.type === 'pct' ? cost * item.adj_discount_applied.value / 100 : item.adj_discount_applied.value;
  } else if (item?.adj_discount_mode === 'individual' && item?.adj_discount_value != null) {
    disc = item.adj_discount_individual_type === 'pct' ? cost * item.adj_discount_value / 100 : item.adj_discount_value;
  }
  if (item?.adj_surcharge_mode === 'geral' && item?.adj_surcharge_applied) {
    sur = item.adj_surcharge_applied.type === 'pct' ? cost * item.adj_surcharge_applied.value / 100 : item.adj_surcharge_applied.value;
  } else if (item?.adj_surcharge_mode === 'individual' && item?.adj_surcharge_value != null) {
    sur = item.adj_surcharge_individual_type === 'pct' ? cost * item.adj_surcharge_value / 100
      : item.adj_surcharge_individual_type === 'fixed_total' ? item.adj_surcharge_value / (qty || 1) : item.adj_surcharge_value;
  }
  return { disc, sur };
};

const noteTotal = (note: ReviewNote): number => {
  const items = note.items || [];
  const fullCols = Array.isArray(items[0]?.adj_columns_full) && items[0].adj_columns_full.length > 0
    ? (items[0].adj_columns_full as AdjColumnFull[])
    : null;
  return items.reduce((acc, it, idx) => {
    const qty = parseFloat(it?.qty) || 0;
    const cost = (parseFloat(it?.price) || 0) / (parseFloat(it?.multiplier) || 1);
    const { disc, sur } = fullCols ? calcAdjAmountsFull(cost, qty, idx, fullCols) : calcAdjAmountsLegacy(it, cost, qty);
    return acc + (cost - disc + sur) * qty;
  }, 0);
};

// Custo ajustado x preço de venda registrado no item (snapshot usado nas telas de revisão),
// usado para agregar o Markup Geral do conjunto de notas visível sem reabrir cada nota.
const noteCostSell = (note: ReviewNote): { cost: number; sell: number } => {
  const items = note.items || [];
  const fullCols = Array.isArray(items[0]?.adj_columns_full) && items[0].adj_columns_full.length > 0
    ? (items[0].adj_columns_full as AdjColumnFull[])
    : null;
  let cost = 0, sell = 0;
  items.forEach((it, idx) => {
    const qty = parseFloat(it?.qty) || 0;
    const unitCost = (parseFloat(it?.price) || 0) / (parseFloat(it?.multiplier) || 1);
    const { disc, sur } = fullCols ? calcAdjAmountsFull(unitCost, qty, idx, fullCols) : calcAdjAmountsLegacy(it, unitCost, qty);
    const adjCost = unitCost - disc + sur;
    const sellPrice = parseFloat(it?.product_price) || 0;
    if (adjCost > 0 && sellPrice > 0) {
      cost += adjCost * qty;
      sell += sellPrice * qty;
    }
  });
  return { cost, sell };
};

const toIsoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Data de recebimento — usada pros pontinhos do calendário e pela coluna "Data" (só conta o que foi de fato recebido).
const noteDateIso = (note: ReviewNote): string | null => note.receivedDate ? note.receivedDate.slice(0, 10) : null;
// Data usada pro filtro de período da tabela/painel: recebimento, ou (se ainda não recebida) a data de criação da nota —
// nunca deixa a nota "escapar" do filtro de mês/período por falta de data de recebimento.
const notePeriodIso = (note: ReviewNote): string | null => {
  if (note.receivedDate) return note.receivedDate.slice(0, 10);
  if (note.createdAt) return note.createdAt.slice(0, 10);
  return null;
};

type Section = 'notas' | 'distribuicao' | 'dicionario' | 'fornecedores' | 'fabricantes' | 'rascunhos';

export type DistributionManifestStatus = 'registro' | 'pedido_enviado' | 'aprovado';

export interface DistributionManifest {
  id: string;
  manifestNumber: string;
  originCompanyId: string;
  destinationCompanyId: string | null;
  status: DistributionManifestStatus;
  shippingDate: string | null;
  itemCount: number;
  totalQty: number;
  total: number;
}

const DIST_STATUS_META: Record<DistributionManifestStatus, { label: string; fg: string; bg: string; border: string }> = {
  registro:       { label: 'Registro',       fg: 'text-[#B45309] dark:text-[#FCD34D]', bg: 'bg-[#D97706]/10 dark:bg-[#FCD34D]/[0.13]', border: 'border-[#D97706]/30 dark:border-[#FCD34D]/30' },
  pedido_enviado: { label: 'Pedido Enviado', fg: 'text-[#0A7A55] dark:text-[#34D399]', bg: 'bg-emerald-500/10 dark:bg-emerald-500/[0.14]', border: 'border-emerald-500/25 dark:border-emerald-500/35' },
  aprovado:       { label: 'Aprovado',       fg: 'text-[#0A7A55] dark:text-[#34D399]', bg: 'bg-emerald-500/15 dark:bg-emerald-500/[0.20]', border: 'border-emerald-500/35 dark:border-emerald-500/45' },
};

const DIST_TABLE_COLUMNS: { key: string; label: string }[] = [
  { key: 'status', label: 'Situação' },
  { key: 'manifestNumber', label: 'Manifesto' },
  { key: 'origin', label: 'Empresa Origem' },
  { key: 'destination', label: 'Empresa Destino' },
  { key: 'itemCount', label: 'Itens' },
  { key: 'total', label: 'Valor Total' },
  { key: 'shippingDate', label: 'Data de Envio' },
];

const TABLE_COLUMNS_BASE: { key: string; label: string }[] = [
  { key: 'status', label: 'Situação' },
  { key: 'destino', label: 'Destino' },
  { key: 'noteNumber', label: 'Código' },
  { key: 'supplierName', label: 'Fornecedor' },
  { key: 'receivedDate', label: 'Data' },
  { key: 'itemCount', label: 'Itens' },
  { key: 'verifiedCount', label: 'Verificados' },
  { key: 'total', label: 'Total' },
  { key: 'finance', label: 'Financeiro' },
];

export const getNoteStatus = (note: ReviewNote): NoteStatus =>
  note.status ?? (note.approved ? 'aprovada' : 'revisao');

// Itens vinculados a um produto do cadastro (product_id preenchido) mas sem preço de venda —
// usado para travar a aprovação da nota (ver CLAUDE.md / regra de negócio de preço só ao aprovar).
export const noteHasUnpricedLinkedItems = (note: ReviewNote): boolean =>
  (note.items || []).some((item: any) => item?.product_id && !(parseFloat(item?.product_price) > 0));

export const STATUS_META: Record<NoteStatus, { label: string; fg: string; bg: string; border: string; desc: string }> = {
  registro:               { label: 'Registro',               fg: 'text-[#57534E] dark:text-[#D8D3C0]', bg: 'bg-[#1A1A0E]/[0.07] dark:bg-white/[0.08]',      border: 'border-[#1A1A0E]/15 dark:border-white/20',      desc: 'Itens ainda podem ser adicionados livremente.' },
  aguardando_recebimento: { label: 'Aguardando Recebimento', fg: 'text-[#B45309] dark:text-[#FCD34D]', bg: 'bg-[#D97706]/10 dark:bg-[#FCD34D]/[0.13]',      border: 'border-[#D97706]/30 dark:border-[#FCD34D]/30', desc: 'Trava adição/remoção de itens até a mercadoria chegar.' },
  revisao:                { label: 'Revisão',                fg: 'text-[#1D4ED8] dark:text-[#60A5FA]', bg: 'bg-[#2563EB]/10 dark:bg-[#60A5FA]/[0.13]',      border: 'border-[#2563EB]/25 dark:border-[#60A5FA]/30', desc: 'Exige data de recebimento. Verificação de itens em curso.' },
  aprovada:                { label: 'Aprovada',                fg: 'text-[#0A7A55] dark:text-[#34D399]', bg: 'bg-emerald-500/10 dark:bg-emerald-500/[0.14]', border: 'border-emerald-500/25 dark:border-emerald-500/35', desc: 'Move a nota para Aprovadas. Ação não pode ser desfeita.' },
};

// Rótulo curto pra caber no card de Situação da tabela principal (mesmo tamanho da pílula
// do cabeçalho da coluna) sem quebrar linha ou estourar largura.
const STATUS_SHORT_LABEL: Record<NoteStatus, string> = {
  registro:               'Regis.',
  aguardando_recebimento: 'Aguard.',
  revisao:                'Revis.',
  aprovada:                'Aprov.',
};

export function StatusIcon({ status, size = 13 }: { status: NoteStatus; size?: number }) {
  switch (status) {
    case 'registro':               return <Edit3 size={size} />;
    case 'aguardando_recebimento': return <Clock size={size} />;
    case 'revisao':                return <Eye size={size} />;
    case 'aprovada':                return <CheckCircle2 size={size} />;
  }
}

interface LogisticsCenterProps {
  importing: boolean;
  onImportClick: () => void;
  onManualNoteClick: () => void;
  reviewNotes: ReviewNote[];
  onViewReviewNote: (note: ReviewNote) => void;
  onApproveNote: (noteId: string) => void;
  onLinkNote?: (noteId: string, transactionId: string | null) => void;
  pendingOpenNoteId?: string | null;
  onPendingOpenNoteHandled?: () => void;
  bulkDrafts?: any[];
  onApproveBulkDraft?: (noteId: string, items: any[]) => void;
  onDeleteBulkDraft?: (noteId: string) => void;
  onViewMobile?: (note: ReviewNote) => void;
  setNotification: (notif: { type: 'success' | 'error', message: string } | null) => void;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
}

export function LogisticsCenter({
  importing,
  onImportClick,
  onManualNoteClick,
  reviewNotes,
  onViewReviewNote,
  onApproveNote,
  onLinkNote,
  pendingOpenNoteId,
  onPendingOpenNoteHandled,
  bulkDrafts,
  onApproveBulkDraft,
  onDeleteBulkDraft,
  onViewMobile,
  setNotification,
  colaboradorId,
  colaboradorNome,
}: LogisticsCenterProps) {
  const [showAddSupplier, setShowAddSupplier]       = useState(false);
  const [pickerSuppliers, setPickerSuppliers]       = useState<EditingSupplier[]>([]);
  const [supplierSearch, setSupplierSearch]         = useState('');
  const [loadingPicker, setLoadingPicker]           = useState(false);
  const [editingSupplier, setEditingSupplier]       = useState<EditingSupplier | null>(null);
  const [showAddManufacturer, setShowAddManufacturer] = useState(false);
  const [pickerManufacturers, setPickerManufacturers] = useState<Manufacturer[]>([]);
  const [manufacturerSearch, setManufacturerSearch]   = useState('');
  const [loadingManufacturersPicker, setLoadingManufacturersPicker] = useState(false);
  const [editingManufacturer, setEditingManufacturer] = useState<Manufacturer | null>(null);
  // Cadastrar/editar fabricante é restrito a admin/gerente (RLS já bloqueia no banco;
  // aqui é só pra esconder o botão de quem não tem permissão).
  const [canManageManufacturers, setCanManageManufacturers] = useState(false);
  const [activeSection, setActiveSection]            = useState<Section>('notas');

  // ── Distribuição (Fase 3 — casca + tabela real; painel de Resultados e modal
  // de Manifesto ainda não implementados, ver plano de implementação) ────────
  const [companiesList, setCompaniesList]             = useState<{ id: string; nome_fantasia: string }[]>([]);
  const [loadingCompanies, setLoadingCompanies]        = useState(false);
  const [distributionManifests, setDistributionManifests] = useState<DistributionManifest[]>([]);
  const [loadingDistManifests, setLoadingDistManifests]   = useState(false);
  const [distSearch, setDistSearch]                    = useState('');
  const [distManifestDraft, setDistManifestDraft]      = useState<DistributionManifestDraft | null>(null);

  const handleCreateDistributionManifest = async () => {
    const id = crypto.randomUUID();
    const { data: manifestNumber, error } = await supabase.rpc('get_next_distribution_manifest_number');
    if (error || !manifestNumber) {
      setNotification({ type: 'error', message: 'Não foi possível gerar o número do manifesto.' });
      return;
    }
    setDistManifestDraft({ id, isExisting: false, manifestNumber, originCompanyId: null, status: 'registro' });
  };

  const handleOpenDistributionManifest = (m: DistributionManifest) => {
    setDistManifestDraft({ id: m.id, isExisting: true, manifestNumber: m.manifestNumber, originCompanyId: m.originCompanyId, status: m.status });
  };

  const fetchCompaniesList = async () => {
    setLoadingCompanies(true);
    const { data } = await supabase.from('companies').select('id, nome_fantasia').order('nome_fantasia');
    setCompaniesList((data || []) as { id: string; nome_fantasia: string }[]);
    setLoadingCompanies(false);
  };

  const fetchDistributionManifests = async () => {
    setLoadingDistManifests(true);
    const { data } = await supabase
      .from('distribution_manifests')
      .select('id, manifest_number, origin_company_id, destination_company_id, status, shipping_date, distribution_manifest_items(qty, cost_price)')
      .order('created_at', { ascending: false });
    const mapped: DistributionManifest[] = (data || []).map((m: any) => {
      const items = m.distribution_manifest_items || [];
      return {
        id: m.id,
        manifestNumber: m.manifest_number,
        originCompanyId: m.origin_company_id,
        destinationCompanyId: m.destination_company_id,
        status: m.status,
        shippingDate: m.shipping_date,
        itemCount: items.length,
        totalQty: items.reduce((acc: number, it: any) => acc + (parseFloat(it.qty) || 0), 0),
        total: items.reduce((acc: number, it: any) => acc + (parseFloat(it.qty) || 0) * (parseFloat(it.cost_price) || 0), 0),
      };
    });
    setDistributionManifests(mapped);
    setLoadingDistManifests(false);
  };

  // Empresas são buscadas uma vez, independente da aba — a tabela de Notas também usa
  // companyName() pra exibir a coluna Destino.
  useEffect(() => {
    if (companiesList.length === 0 && !loadingCompanies) fetchCompaniesList();
  }, []);

  useEffect(() => {
    if (activeSection === 'distribuicao' && distributionManifests.length === 0 && !loadingDistManifests) fetchDistributionManifests();
  }, [activeSection]);

  const companyName = (id: string | null) => id ? (companiesList.find(c => c.id === id)?.nome_fantasia || '—') : '—';

  const getDistColumnValue = (m: DistributionManifest, key: string): string => {
    switch (key) {
      case 'status':         return DIST_STATUS_META[m.status].label;
      case 'manifestNumber': return m.manifestNumber;
      case 'origin':         return companyName(m.originCompanyId);
      case 'destination':    return companyName(m.destinationCompanyId);
      case 'itemCount':      return String(m.itemCount);
      case 'total':          return fmtBRL(m.total);
      case 'shippingDate':   return m.shippingDate ? fmtDateBR(m.shippingDate) : '—';
      default:               return '—';
    }
  };

  const visibleDistManifests = useMemo(() => {
    const q = distSearch.trim().toLowerCase();
    if (!q) return distributionManifests;
    return distributionManifests.filter(m =>
      m.manifestNumber.toLowerCase().includes(q) ||
      companyName(m.originCompanyId).toLowerCase().includes(q) ||
      companyName(m.destinationCompanyId).toLowerCase().includes(q)
    );
  }, [distributionManifests, distSearch, companiesList]);
  const [confirmDeleteDraftId, setConfirmDeleteDraftId] = useState<string | null>(null);
  const [confirmApproveId, setConfirmApproveId]      = useState<string | null>(null);
  const [linkingNote, setLinkingNote]                = useState<ReviewNote | null>(null);
  const [noteSearch, setNoteSearch]                  = useState('');

  // ── Calendário (mesmo padrão do Controle Financeiro) ──────────────────
  const today = useMemo(() => new Date(), []);
  const [calViewDate, setCalViewDate]     = useState(() => new Date());
  const [calSelectedDate, setCalSelectedDate] = useState<Date | null>(null);
  const [calRangeMode, setCalRangeMode]   = useState(false);
  const [calRangeStart, setCalRangeStart] = useState<Date | null>(null);
  const [calRangeEnd, setCalRangeEnd]     = useState<Date | null>(null);
  const [calLegendOpen, setCalLegendOpen] = useState(false);
  const calLegendRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (calLegendRef.current && !calLegendRef.current.contains(e.target as Node)) setCalLegendOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Barra de rolagem horizontal flutuante da tabela de notas — fica fixa na base da
  // viewport enquanto a tabela ainda continua abaixo da tela, evitando que o usuário
  // precise descer até o fim de todas as notas para rolar a tabela para os lados.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const floatScrollRef = useRef<HTMLDivElement>(null);
  const floatScrollInnerRef = useRef<HTMLDivElement>(null);

  // ── Painel de resultados ───────────────────────────────────────────────
  const [resultsPanelTab, setResultsPanelTab] = useState<'resultados' | 'fornecedores'>('resultados');
  const [fornecChartMode, setFornecChartMode] = useState<'markup' | 'valor'>('markup');
  const [showFornecFullscreen, setShowFornecFullscreen] = useState(false);

  // ── Filtro de colunas da tabela (mesmo padrão do Controle Financeiro) ─
  const [columnFiltersEnabled, setColumnFiltersEnabled] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [filterOpenKey, setFilterOpenKey] = useState<string | null>(null);
  const [filterPendingSelection, setFilterPendingSelection] = useState<Set<string> | null>(null);
  const [filterSearchQuery, setFilterSearchQuery] = useState('');


  // Abre nota aprovada vinda de "Ir para nota" nas notificações
  useEffect(() => {
    if (!pendingOpenNoteId) return;
    const note = reviewNotes.find(n => n.id === pendingOpenNoteId);
    if (note) {
      setActiveSection('notas');
      onViewReviewNote(note);
    }
    onPendingOpenNoteHandled?.();
  }, [pendingOpenNoteId]);

  const fetchPickerSuppliers = async () => {
    setLoadingPicker(true);
    const { data } = await supabase.from('suppliers').select('*').order('nome_fantasia,name');
    setPickerSuppliers((data || []) as EditingSupplier[]);
    setLoadingPicker(false);
  };

  useEffect(() => {
    if (activeSection === 'fornecedores' && pickerSuppliers.length === 0 && !loadingPicker) {
      fetchPickerSuppliers();
    }
  }, [activeSection]);

  const filteredSuppliers = pickerSuppliers.filter(s => {
    if (!supplierSearch.trim()) return true;
    const q = supplierSearch.toLowerCase();
    return (s.nome_fantasia || s.name).toLowerCase().includes(q) ||
      (s.razao_social || '').toLowerCase().includes(q);
  });

  const fetchPickerManufacturers = async () => {
    setLoadingManufacturersPicker(true);
    const { data } = await supabase.from('manufacturers').select('*').order('name');
    setPickerManufacturers((data || []) as Manufacturer[]);
    setLoadingManufacturersPicker(false);
  };

  useEffect(() => {
    if (activeSection === 'fabricantes' && pickerManufacturers.length === 0 && !loadingManufacturersPicker) {
      fetchPickerManufacturers();
    }
  }, [activeSection]);

  const filteredManufacturers = pickerManufacturers.filter(m => {
    if (!manufacturerSearch.trim()) return true;
    const q = manufacturerSearch.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.prefix.includes(q);
  });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('usuarios')
        .select('role')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      setCanManageManufacturers(data?.role === 'admin' || data?.role === 'gerente');
    })();
  }, []);

  // Notas "cruas" da seção ativa (Notas), antes de filtro de período/busca/coluna —
  // usadas para marcar os pontinhos do calendário do mês inteiro.
  const sectionNotesRaw = reviewNotes;

  const filterNotesBySearch = (notes: ReviewNote[]) => {
    const q = noteSearch.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(note =>
      (note.supplierName || '').toLowerCase().includes(q) ||
      (note.noteNumber || '').toLowerCase().includes(q) ||
      (note.fileName || '').toLowerCase().includes(q) ||
      (note.items || []).some((item: any) =>
        (item.supplier_code || '').toLowerCase().includes(q) ||
        (item.original_description || '').toLowerCase().includes(q) ||
        (item.name || '').toLowerCase().includes(q) ||
        (item.ean || '').toLowerCase().includes(q) ||
        (item.sku || '').toLowerCase().includes(q)
      )
    );
  };

  const filterNotesByPeriod = (notes: ReviewNote[]) => notes.filter(note => {
    const d = notePeriodIso(note);
    if (!d) return false; // sem data de recebimento nem de criação — não há como posicioná-la no período
    if (calRangeStart && calRangeEnd) return d >= toIsoDay(calRangeStart) && d <= toIsoDay(calRangeEnd);
    if (calSelectedDate) return d === toIsoDay(calSelectedDate);
    const monthPrefix = `${calViewDate.getFullYear()}-${String(calViewDate.getMonth() + 1).padStart(2, '0')}`;
    return d.startsWith(monthPrefix);
  });

  const getColumnValue = (note: ReviewNote, key: string): string => {
    switch (key) {
      case 'status':         return STATUS_META[getNoteStatus(note)].label;
      case 'destino':        return companyName(note.companyId ?? null);
      case 'noteNumber':     return note.noteNumber || '—';
      case 'supplierName':   return note.supplierName || '—';
      case 'receivedDate':   return note.receivedDate ? fmtDateBR(note.receivedDate) : note.timestamp;
      case 'itemCount':      return String(note.itemCount);
      case 'verifiedCount':  return `${note.verifiedCount}/${note.itemCount}`;
      case 'total':          return fmtBRL(noteTotal(note));
      case 'finance':        return note.finance_transaction_id ? 'Vinculada' : 'Não vinculada';
      default:               return '—';
    }
  };

  const periodSearchedNotes = filterNotesBySearch(filterNotesByPeriod(sectionNotesRaw));

  const getColumnUniqueValues = (key: string): string[] => {
    const vals = new Set<string>();
    periodSearchedNotes.forEach(n => vals.add(getColumnValue(n, key)));
    return Array.from(vals).sort();
  };

  const applyColumnFilters = (notes: ReviewNote[]) => {
    if (!columnFiltersEnabled) return notes;
    return notes.filter(n => Object.entries(columnFilters).every(([key, set]) => set.size === 0 || set.has(getColumnValue(n, key))));
  };

  const visibleNotes = activeSection === 'rascunhos' ? [] : applyColumnFilters(periodSearchedNotes);

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
  }, [activeSection, visibleNotes.length]);

  const confirmNote = confirmApproveId ? reviewNotes.find(n => n.id === confirmApproveId) : null;

  const tableColumns = TABLE_COLUMNS_BASE;

  const openFilter = (key: string) => {
    const current = columnFilters[key];
    setFilterPendingSelection(new Set(current && current.size > 0 ? current : getColumnUniqueValues(key)));
    setFilterOpenKey(key);
    setFilterSearchQuery('');
  };
  const closeFilter = () => { setFilterOpenKey(null); setFilterPendingSelection(null); setFilterSearchQuery(''); };
  const confirmFilter = (key: string) => {
    setColumnFilters(prev => {
      const nxt = { ...prev };
      const sel = filterPendingSelection ?? new Set<string>();
      if (sel.size === 0) delete nxt[key]; else nxt[key] = sel;
      return nxt;
    });
    closeFilter();
  };

  // ── Calendário: células do mês exibido + marcação de dias com nota recebida ─
  const calDays = useMemo(() => {
    const year = calViewDate.getFullYear(), month = calViewDate.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    // Pontinhos do calendário: nota recebida (aba Notas) ou manifesto enviado na data (aba
    // Distribuição) — a mesma grade de calendário é reutilizada pelas duas seções.
    const notesByDay = activeSection === 'distribuicao'
      ? new Set(distributionManifests.filter(m => m.status === 'pedido_enviado' && m.shippingDate).map(m => m.shippingDate!.slice(0, 10)))
      : new Set(sectionNotesRaw.map(noteDateIso).filter(Boolean) as string[]);
    const cells: { day: number; type: 'prev' | 'curr' | 'next'; hasNote: boolean }[] = [];
    for (let i = firstDow - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, type: 'prev', hasNote: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, type: 'curr', hasNote: notesByDay.has(iso) });
    }
    let n = 1;
    while (cells.length < 42) cells.push({ day: n++, type: 'next', hasNote: false });
    return cells;
  }, [calViewDate, sectionNotesRaw, activeSection, distributionManifests]);

  const calMonthLabel = calViewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // ── Stats do painel de Resultados — mesmo recorte de período/busca/coluna da tabela,
  // mas só considera notas com selo de Aprovado ────────────────────────────────────
  const approvedVisibleNotes = useMemo(() => visibleNotes.filter(n => getNoteStatus(n) === 'aprovada'), [visibleNotes]);
  const statTotalNotas = approvedVisibleNotes.length;
  const statValorTotal = approvedVisibleNotes.reduce((acc, n) => acc + noteTotal(n), 0);
  const statMarkup = useMemo(() => {
    let cost = 0, sell = 0;
    approvedVisibleNotes.forEach(n => { const cs = noteCostSell(n); cost += cs.cost; sell += cs.sell; });
    return cost > 0 ? ((sell - cost) / cost * 100) : null;
  }, [approvedVisibleNotes]);
  const statFornecedores = new Set(approvedVisibleNotes.map(n => n.supplierName).filter(Boolean)).size;

  // ── Sub-aba Fornecedores do painel de Resultados: mesmo recorte que a aba "Resultados"
  // (approvedVisibleNotes — período do calendário + busca + filtros de coluna + só aprovadas),
  // agrupado por fornecedor, com o valor de cada barra alternando entre markup % e valor R$ ─
  const fornecPerSupplier = useMemo(() => {
    const map = new Map<string, { cost: number; sell: number; total: number }>();
    approvedVisibleNotes.forEach(n => {
      const name = n.supplierName || 'Sem fornecedor';
      const cs = noteCostSell(n);
      const entry = map.get(name) || { cost: 0, sell: 0, total: 0 };
      entry.cost += cs.cost;
      entry.sell += cs.sell;
      entry.total += noteTotal(n);
      map.set(name, entry);
    });
    return Array.from(map.entries()).map(([name, { cost, sell, total }]) => ({
      name,
      total,
      markup: cost > 0 ? ((sell - cost) / cost * 100) : null,
    }));
  }, [approvedVisibleNotes]);

  const fornecChartData = useMemo(() => {
    if (fornecChartMode === 'valor') {
      return fornecPerSupplier.map(f => ({ name: f.name, value: f.total })).sort((a, b) => b.value - a.value);
    }
    return fornecPerSupplier.filter(f => f.markup !== null).map(f => ({ name: f.name, value: f.markup as number })).sort((a, b) => b.value - a.value);
  }, [fornecPerSupplier, fornecChartMode]);
  const fornecMaxValue = Math.max(1, ...fornecChartData.map(f => f.value));
  const fornecTotalCount = fornecPerSupplier.length;

  // ── Cards de loja do painel de Resultados da Distribuição — filtra por período do
  // calendário usando shipping_date (data de negócio, não o sent_at técnico — ver Etapa 5
  // do plano) e só considera manifestos já enviados (Registro não movimentou nada ainda).
  const sentManifestsInPeriod = useMemo(() => {
    return distributionManifests.filter(m => {
      if (m.status !== 'pedido_enviado' || !m.shippingDate) return false;
      const d = m.shippingDate.slice(0, 10);
      if (calRangeStart && calRangeEnd) return d >= toIsoDay(calRangeStart) && d <= toIsoDay(calRangeEnd);
      if (calSelectedDate) return d === toIsoDay(calSelectedDate);
      const monthPrefix = `${calViewDate.getFullYear()}-${String(calViewDate.getMonth() + 1).padStart(2, '0')}`;
      return d.startsWith(monthPrefix);
    });
  }, [distributionManifests, calRangeStart, calRangeEnd, calSelectedDate, calViewDate]);

  const distCompanyStats = useMemo(() => {
    const stats: Record<string, { out: number; outQty: number; in: number; inQty: number }> = {};
    companiesList.forEach(c => { stats[c.id] = { out: 0, outQty: 0, in: 0, inQty: 0 }; });
    sentManifestsInPeriod.forEach(m => {
      if (stats[m.originCompanyId]) {
        stats[m.originCompanyId].out += m.total;
        stats[m.originCompanyId].outQty += m.totalQty;
      }
      if (m.destinationCompanyId && stats[m.destinationCompanyId]) {
        stats[m.destinationCompanyId].in += m.total;
        stats[m.destinationCompanyId].inQty += m.totalQty;
      }
    });
    return stats;
  }, [sentManifestsInPeriod, companiesList]);

  const [showDistResultsExpanded, setShowDistResultsExpanded] = useState(false);

  const showCalendarResultsPanel = activeSection === 'notas' || activeSection === 'distribuicao';

  return (
    <div className="space-y-4 md:space-y-12">
      {/* Header */}
      <div className="relative mb-6 md:mb-14">
        <div className="bg-[#FFE500] dark:bg-[#252520] border border-[#D4C000] dark:border-white/[0.07] rounded-tl-[20px] rounded-tr-[20px] rounded-br-[20px] px-6 py-5 flex items-center gap-3.5">
          <div className="w-[52px] h-[52px] rounded-[14px] bg-[rgba(26,26,10,0.09)] dark:bg-[rgba(216,30,30,0.13)] flex items-center justify-center text-[#1A1A0E] dark:text-primary shrink-0">
            <ClipboardList size={24} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-[26px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] tracking-tight leading-tight">Entrada de Mercadoria</h1>
            <div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[rgba(26,26,10,0.40)] dark:text-white/[0.28]">Logistics Orchestration &amp; Inventory Feed</div>
          </div>
        </div>

        <div className="hidden md:flex absolute left-0 top-full">
          {([
            { key: 'notas', label: 'Notas', count: reviewNotes.length },
            { key: 'distribuicao', label: 'Distribuição', count: distributionManifests.filter(m => m.status === 'registro').length },
            { key: 'dicionario', label: 'Dicionário', count: 0 },
            { key: 'fornecedores', label: 'Fornecedores', count: 0 },
            { key: 'fabricantes', label: 'Fabricantes', count: 0 },
            { key: 'rascunhos', label: 'Rascunhos', count: bulkDrafts?.length ?? 0 },
          ] as const).map((tab, i, arr) => {
            const HEADER_TAB_LABEL_MAX = 12;
            const label = tab.label.length > HEADER_TAB_LABEL_MAX
              ? tab.label.slice(0, HEADER_TAB_LABEL_MAX - 1) + '…'
              : tab.label;
            const active = activeSection === tab.key;
            return (
              <button
                key={tab.key}
                title={tab.label}
                onClick={() => setActiveSection(tab.key)}
                className={cn(
                  'w-[122px] h-[34px] flex items-center justify-center gap-1.5 shrink-0',
                  'bg-[#FFE500] dark:bg-[#252520] border border-t-0 border-[#D4C000] dark:border-white/[0.07]',
                  i === arr.length - 1 && 'rounded-br-[12px]',
                  'text-[11.5px] font-extrabold uppercase tracking-wide',
                  'shadow-[inset_0_6px_8px_-5px_rgba(26,26,10,0.35)] dark:shadow-[inset_0_6px_8px_-5px_rgba(0,0,0,0.55)]',
                  'transition-[opacity,transform] duration-150 active:scale-[0.97]',
                  active
                    ? 'text-[#1A1A0E] dark:text-[#F2F0E3] opacity-100'
                    : 'text-[#1A1A0E] dark:text-white/75 opacity-55 hover:opacity-85'
                )}
              >
                <span className="truncate">{label}</span>
                {tab.count > 0 && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[rgba(26,26,10,0.12)] dark:bg-white/10 shrink-0">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── MOBILE LAYOUT ─────────────────────────────────────────────────── */}
      <div className="md:hidden space-y-4">

        {/* Mobile action buttons — 2 col grid */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onManualNoteClick}
            className="bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-[20px] overflow-hidden flex flex-col active:scale-[0.97] transition-transform"
          >
            <div className="w-full h-[6px] bg-[#1A1A0E] dark:bg-white/40 shrink-0" />
            <div className="p-3 flex flex-col gap-2.5">
              <div className="w-9 h-9 rounded-[10px] bg-[#1A1A0E]/[0.07] dark:bg-white/[0.07] flex items-center justify-center text-[#1A1A0E] dark:text-[#F2F0E3]">
                <FileText size={18} />
              </div>
              <span className="text-xs font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight tracking-tight text-left">Inserir<br/>Manualmente</span>
            </div>
          </button>

          <button
            onClick={onImportClick}
            disabled={importing}
            className="bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-[20px] overflow-hidden flex flex-col active:scale-[0.97] transition-transform disabled:opacity-50"
          >
            <div className="w-full h-[6px] bg-primary shrink-0" />
            <div className="p-3 flex flex-col gap-2.5">
              <div className="w-9 h-9 rounded-[10px] bg-primary/10 flex items-center justify-center text-primary">
                <Download size={18} />
              </div>
              <span className="text-xs font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight tracking-tight text-left">Executar<br/>Importação</span>
            </div>
          </button>
        </div>

        {/* Mobile tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
          {([
            { key: 'notas'  as const, label: 'Notas',  count: reviewNotes.length },
            { key: 'distribuicao' as const, label: 'Distribuição', count: distributionManifests.filter(m => m.status === 'registro').length },
            { key: 'dicionario' as const, label: 'Dicionário', count: 0 },
            { key: 'fornecedores' as const, label: 'Fornecedores', count: 0 },
            { key: 'fabricantes' as const, label: 'Fabricantes', count: 0 },
            { key: 'rascunhos' as const, label: 'Rascunhos', count: bulkDrafts?.length ?? 0 },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[11px] font-black tracking-[0.04em] transition-all',
                activeSection === tab.key
                  ? 'bg-[#FFE500] text-[#1A1A0E]'
                  : 'bg-[#1A1A0E]/[0.07] dark:bg-white/[0.07] text-[#1A1A0E]/45 dark:text-white/35'
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={cn(
                  'text-[9px] font-black px-1.5 py-0.5 rounded-full',
                  activeSection === tab.key
                    ? 'bg-[#1A1A0E]/15 text-[#1A1A0E]'
                    : 'bg-[#1A1A0E]/10 dark:bg-white/10 text-[#1A1A0E]/40 dark:text-white/35'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeSection === 'notas' && (<>
          {/* Mobile search */}
          <div className="relative flex items-center gap-2 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-[14px] px-3.5 py-2.5">
            <Search size={14} className="text-[#1A1A0E]/28 dark:text-white/25 shrink-0" />
            <input
              type="text"
              value={noteSearch}
              onChange={e => setNoteSearch(e.target.value)}
              placeholder="Buscar por fornecedor, EAN, código…"
              className="bg-transparent border-none outline-none text-[13px] font-medium text-[#1A1A0E] dark:text-[#F2F0E3] placeholder:text-[#1A1A0E]/28 dark:placeholder:text-white/25 w-full"
            />
            {noteSearch && (
              <button onClick={() => setNoteSearch('')} className="shrink-0 text-[#1A1A0E]/30 dark:text-white/30">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Mobile section label */}
          <p className="text-[10px] font-black text-[#1A1A0E]/35 dark:text-white/25 uppercase tracking-[0.14em] px-0.5">
            {visibleNotes.length} nota{visibleNotes.length !== 1 ? 's' : ''}
          </p>

          {/* Mobile notes list */}
          {visibleNotes.length === 0 ? (
            <div className="flex items-center gap-4 bg-[#FDFAF0] dark:bg-[#252520] border border-dashed border-[#E0D8BF] dark:border-white/[0.08] rounded-[18px] p-5">
              <div className="w-11 h-11 bg-[#1A1A0E]/[0.04] dark:bg-white/[0.04] rounded-[12px] flex items-center justify-center shrink-0">
                <ClipboardList size={22} className="text-[#1A1A0E]/20 dark:text-white/20" />
              </div>
              <div>
                <p className="text-xs font-black text-[#1A1A0E]/45 dark:text-white/35 uppercase tracking-[0.06em]">
                  Sem Notas
                </p>
                <p className="text-[11px] text-[#1A1A0E]/28 dark:text-white/22 mt-0.5 leading-relaxed">
                  Notas criadas ou importadas aparecerão aqui.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleNotes.map(note => {
                const status = getNoteStatus(note);
                const meta = STATUS_META[status];
                return (
                <div
                  key={note.id}
                  onClick={() => (onViewMobile ?? onViewReviewNote)(note)}
                  className="bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-[20px] p-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
                >
                  {/* Avatar */}
                  <div className={cn('w-12 h-12 rounded-full flex items-center justify-center shrink-0', meta.bg, meta.fg)}>
                    <StatusIcon status={status} size={22} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <p className="text-[12px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] uppercase tracking-[0.04em] truncate">
                      {note.supplierName
                        ? `${note.supplierName} — ${note.receivedDate ? fmtDateBR(note.receivedDate) : note.timestamp}`
                        : note.fileName}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#1A1A0E]/40 dark:text-white/35">
                      <span className="truncate">{note.supplierName || '—'}</span>
                      <span className="text-[#1A1A0E]/18 dark:text-white/18">·</span>
                      <span className="whitespace-nowrap shrink-0">{note.receivedDate ? fmtDateBR(note.receivedDate) : note.timestamp}</span>
                    </div>
                    <span className="self-start max-w-full truncate bg-[#1A1A0E]/[0.05] dark:bg-white/[0.08] rounded-[6px] px-2 py-0.5 text-[11px] font-mono font-bold text-[#1A1A0E]/50 dark:text-white/50 tracking-[0.04em]">
                      {note.noteNumber || note.fileName}
                    </span>
                  </div>

                  {/* Right — badge + botão aprovar */}
                  <div className="flex flex-col items-end justify-between gap-2 shrink-0 self-stretch py-0.5">
                    <span className={cn(
                      'text-[12px] font-black px-2.5 py-1 rounded-full',
                      note.verifiedCount === note.itemCount && note.itemCount > 0
                        ? 'bg-[rgba(52,211,153,0.15)] text-[#0A7A55] dark:text-[#34D399]'
                        : 'bg-[#D97706] text-white'
                    )}>
                      {String(note.verifiedCount).padStart(2, '0')}/{String(note.itemCount).padStart(2, '0')}
                    </span>
                    {status !== 'aprovada' && (
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmApproveId(note.id); }}
                        className="w-7 h-7 rounded-full bg-[rgba(52,211,153,0.15)] text-[#0A7A55] dark:text-[#34D399] flex items-center justify-center active:scale-90 transition-transform"
                      >
                        <CheckCircle2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );})}
            </div>
          )}
        </>)}

        {activeSection === 'distribuicao' && (
          <div className="flex flex-col items-center justify-center py-14 text-center px-4">
            <div className="w-14 h-14 bg-[#1A1A0E]/[0.05] dark:bg-white/[0.05] rounded-2xl flex items-center justify-center mb-3">
              <Truck size={26} className="text-[#1A1A0E]/25 dark:text-white/25" />
            </div>
            <p className="text-xs font-black text-[#1A1A0E]/45 dark:text-white/35 uppercase tracking-[0.08em]">Disponível apenas no desktop</p>
            <p className="text-[11px] text-[#1A1A0E]/28 dark:text-white/22 mt-1 leading-relaxed max-w-[240px]">
              A aba Distribuição ainda não tem uma versão mobile — acesse pelo computador.
            </p>
          </div>
        )}

        {activeSection === 'rascunhos' && (
          <div className="space-y-3">
            {(!bulkDrafts || bulkDrafts.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-10 text-[#1A1A0E]/20 dark:text-white/20">
                <ClipboardList size={36} className="mb-3 opacity-40" />
                <p className="text-xs font-black uppercase tracking-widest">Nenhum rascunho</p>
              </div>
            ) : bulkDrafts.map(draft => (
              <div key={draft.id} className="bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-[18px] p-4 space-y-3">
                <div>
                  <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em] mb-0.5">Rascunho · Lista</p>
                  <p className="text-sm font-black text-[#1A1A0E] dark:text-[#F2F0E3] truncate">{draft.file_name || 'Rascunho sem nome'}</p>
                  <p className="text-xs text-[#1A1A0E]/40 dark:text-white/35 mt-0.5">{draft.item_count || 0} produto(s)</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => onApproveBulkDraft?.(draft.id, draft.items || [])}
                    className="flex-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 py-2.5 rounded-[14px] font-black text-xs flex items-center justify-center gap-1.5 uppercase tracking-wider active:scale-95 transition-all">
                    <CheckCircle2 size={14} /> Aprovar
                  </button>
                  <button onClick={() => setConfirmDeleteDraftId(draft.id)}
                    className="px-4 py-2.5 rounded-[14px] font-black text-xs bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 active:scale-95 transition-all uppercase tracking-wider">
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeSection === 'dicionario' && (
          <SupplierDictionary embedded isOpen onClose={() => {}} setNotification={setNotification} />
        )}

        {activeSection === 'fornecedores' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/30 pointer-events-none" />
                <input
                  type="text"
                  value={supplierSearch}
                  onChange={e => setSupplierSearch(e.target.value)}
                  placeholder="Buscar fornecedor..."
                  className="w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl pl-9 pr-3 py-2.5 text-sm font-medium text-on-surface placeholder:text-on-surface/30 focus:outline-none"
                />
              </div>
              <button
                onClick={() => { setEditingSupplier(null); setShowAddSupplier(true); }}
                className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20"
              >
                <Plus size={18} />
              </button>
            </div>
            {loadingPicker ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 rounded-full border-2 border-amber-500 border-r-transparent animate-spin" />
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <p className="text-sm text-on-surface/30 text-center py-10">
                {supplierSearch ? 'Nenhum fornecedor encontrado.' : 'Nenhum fornecedor cadastrado.'}
              </p>
            ) : filteredSuppliers.map(s => {
              const displayName = s.nome_fantasia || s.name;
              const subtitle = s.razao_social && s.razao_social !== displayName ? s.razao_social : null;
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-on-surface/[0.06] bg-[#FDFAF0] dark:bg-[#252520]">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                    <Building2 size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-on-surface truncate">{displayName}</p>
                    {subtitle && <p className="text-[10px] text-on-surface/40 truncate">{subtitle}</p>}
                  </div>
                  <button
                    onClick={() => { setEditingSupplier(s); setShowAddSupplier(true); }}
                    className="w-8 h-8 rounded-lg text-on-surface/20 hover:text-amber-600 hover:bg-amber-500/10 flex items-center justify-center transition-all shrink-0"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {activeSection === 'fabricantes' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/30 pointer-events-none" />
                <input
                  type="text"
                  value={manufacturerSearch}
                  onChange={e => setManufacturerSearch(e.target.value)}
                  placeholder="Buscar fabricante..."
                  className="w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl pl-9 pr-3 py-2.5 text-sm font-medium text-on-surface placeholder:text-on-surface/30 focus:outline-none"
                />
              </div>
              {canManageManufacturers && (
                <button
                  onClick={() => { setEditingManufacturer(null); setShowAddManufacturer(true); }}
                  className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20"
                >
                  <Plus size={18} />
                </button>
              )}
            </div>
            {loadingManufacturersPicker ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 rounded-full border-2 border-amber-500 border-r-transparent animate-spin" />
              </div>
            ) : filteredManufacturers.length === 0 ? (
              <p className="text-sm text-on-surface/30 text-center py-10">
                {manufacturerSearch ? 'Nenhum fabricante encontrado.' : 'Nenhum fabricante cadastrado.'}
              </p>
            ) : filteredManufacturers.map(m => (
              <div key={m.id} className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-2xl border border-on-surface/[0.06] bg-[#FDFAF0] dark:bg-[#252520]",
                !m.active && 'opacity-50'
              )}>
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                  <Factory size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-on-surface truncate">{m.name}</p>
                  <p className="text-[10px] text-on-surface/40 font-mono">Prefixo {m.prefix}{!m.active && ' · Inativo'}</p>
                </div>
                {canManageManufacturers && (
                  <button
                    onClick={() => { setEditingManufacturer(m); setShowAddManufacturer(true); }}
                    className="w-8 h-8 rounded-lg text-on-surface/20 hover:text-amber-600 hover:bg-amber-500/10 flex items-center justify-center transition-all shrink-0"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── DESKTOP LAYOUT ───────────────────────────────────────────────── */}

      {/* Calendário + Painel de Resultados (Revisões / Aprovados) */}
      {showCalendarResultsPanel && (
        <div className={cn('hidden md:grid grid-cols-2 gap-3.5', activeSection === 'distribuicao' ? 'items-stretch' : 'items-start')}>
          {/* Calendário */}
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
                        className="absolute left-0 top-[30px] z-20 w-[196px] bg-surface border border-on-surface/10 rounded-xl shadow-lg p-2.5 flex flex-col gap-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                          <span className="text-[10.5px] font-bold text-on-surface/70">Nota recebida no dia</span>
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
                  title="Filtrar por período"
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

            <div className={cn('p-3', activeSection === 'distribuicao' && 'flex-1 flex flex-col justify-center')}>
              <div className="grid grid-cols-7 mb-1">
                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
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
                      )}
                    >
                      {cell.day}
                      {cell.hasNote && !isSelected && !isRangeEndpoint && (
                        <span className={cn('absolute bottom-[2px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full', isToday ? 'bg-primary/70' : 'bg-primary')} />
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

              {/* Badge de período — filtro ativo ou padrão (mês exibido) */}
              {(calSelectedDate || (calRangeStart && calRangeEnd)) ? (
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
              ) : (
                <div className="mt-2.5 flex items-center gap-1 bg-on-surface/[0.04] border border-on-surface/[0.08] rounded-[10px] px-2.5 py-1.5">
                  <span className="text-[9.5px] font-bold text-on-surface/45 leading-none capitalize">
                    Mostrando: {calMonthLabel} (mês atual)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Painel de Resultados */}
          {activeSection === 'distribuicao' ? (
            <div className="bg-surface-container-low border border-on-surface/[0.07] rounded-[18px] overflow-hidden flex flex-col">
              <div className="bg-[#FFE500] dark:bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-4 py-2.5 flex items-center justify-between gap-2">
                <span className="text-[9.5px] font-black uppercase tracking-[0.08em] text-[rgba(26,26,10,0.65)] px-2">Resultados</span>
                <button
                  onClick={() => setShowDistResultsExpanded(true)}
                  title="Expandir"
                  className="w-[26px] h-[26px] rounded-[8px] bg-[rgba(26,26,10,0.10)] flex items-center justify-center text-[rgba(26,26,10,0.60)] hover:bg-[rgba(26,26,10,0.16)] transition-colors shrink-0"
                >
                  <Maximize2 size={12} strokeWidth={2.5} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 p-2.5 flex-1 min-h-0 overflow-y-auto content-start">
                {loadingCompanies ? (
                  <div className="col-span-2 flex items-center justify-center py-8 text-on-surface/25">
                    <p className="text-xs font-bold">Carregando lojas…</p>
                  </div>
                ) : companiesList.length === 0 ? (
                  <div className="col-span-2 flex items-center justify-center py-8 text-on-surface/25">
                    <p className="text-xs font-bold">Nenhuma loja cadastrada</p>
                  </div>
                ) : companiesList.map(c => {
                  const s = distCompanyStats[c.id] || { out: 0, outQty: 0, in: 0, inQty: 0 };
                  return (
                    <div key={c.id} className="bg-surface-container border border-on-surface/[0.07] rounded-[12px] p-2.5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        <span className="text-[11px] font-black text-on-surface truncate">{c.nome_fantasia}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="bg-surface-container-low border border-on-surface/[0.06] rounded-[9px] px-2 py-1.5">
                          <div className="text-[6.5px] font-black uppercase tracking-[0.08em] text-on-surface/40">R$ Saiu</div>
                          <div className="text-[11.5px] font-black text-primary">{fmtBRL(s.out)}</div>
                          <div className="text-[8px] font-bold text-on-surface/35">{s.outQty} un.</div>
                        </div>
                        <div className="bg-surface-container-low border border-on-surface/[0.06] rounded-[9px] px-2 py-1.5">
                          <div className="text-[6.5px] font-black uppercase tracking-[0.08em] text-on-surface/40">R$ Entrou</div>
                          <div className="text-[11.5px] font-black text-emerald-600 dark:text-emerald-400">{fmtBRL(s.in)}</div>
                          <div className="text-[8px] font-bold text-on-surface/35">{s.inQty} un.</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
          <div className="bg-surface-container-low border border-on-surface/[0.07] rounded-[18px] overflow-hidden flex flex-col">
            <div className="bg-[#FFE500] dark:bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-4 py-2.5 flex items-center">
              <div className="flex-1 flex gap-0.5 bg-[rgba(26,26,10,0.10)] rounded-full p-[2px]">
                {(['resultados', 'fornecedores'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setResultsPanelTab(tab)}
                    className={cn(
                      'flex-1 px-2 py-[6px] rounded-full text-[9.5px] font-black uppercase tracking-[0.08em] transition-all duration-150 whitespace-nowrap',
                      resultsPanelTab === tab
                        ? 'bg-[#D81E1E] text-white shadow-sm'
                        : 'text-[rgba(26,26,10,0.45)] hover:text-[rgba(26,26,10,0.70)]',
                    )}
                  >
                    {tab === 'resultados' ? 'Resultados' : 'Fornecedores'}
                  </button>
                ))}
              </div>
            </div>

            {resultsPanelTab === 'resultados' ? (
              <div className="grid grid-cols-2 gap-1.5 p-2.5">
                <div className="bg-surface-container border border-on-surface/[0.07] rounded-[12px] px-2.5 py-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[8px] bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400">
                    <FileText size={12} strokeWidth={2.3} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[7.5px] font-black uppercase tracking-[0.11em] text-on-surface/40 whitespace-nowrap">Total de Notas</div>
                    <div className="text-[13px] font-black tracking-tight leading-tight truncate text-on-surface">{statTotalNotas}</div>
                  </div>
                </div>
                <div className="bg-surface-container border border-on-surface/[0.07] rounded-[12px] px-2.5 py-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[8px] bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
                    <TrendingUp size={12} strokeWidth={2.3} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[7.5px] font-black uppercase tracking-[0.11em] text-on-surface/40 whitespace-nowrap">Markup Geral</div>
                    <div className="text-[13px] font-black tracking-tight leading-tight truncate text-on-surface">{statMarkup !== null ? fmtPct(statMarkup) : '—'}</div>
                  </div>
                </div>
                <div className="bg-surface-container border border-on-surface/[0.07] rounded-[12px] px-2.5 py-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[8px] bg-emerald-500/10 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
                    <Wallet size={12} strokeWidth={2.3} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[7.5px] font-black uppercase tracking-[0.11em] text-on-surface/40 whitespace-nowrap">Valor Total</div>
                    <div className="text-[13px] font-black tracking-tight leading-tight truncate text-on-surface">{fmtBRL(statValorTotal)}</div>
                  </div>
                </div>
                <div className="bg-surface-container border border-on-surface/[0.07] rounded-[12px] px-2.5 py-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[8px] bg-violet-500/10 flex items-center justify-center shrink-0 text-violet-600 dark:text-violet-400">
                    <Building2 size={12} strokeWidth={2.3} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[7.5px] font-black uppercase tracking-[0.11em] text-on-surface/40 whitespace-nowrap">Fornecedores</div>
                    <div className="text-[13px] font-black tracking-tight leading-tight truncate text-on-surface">{statFornecedores}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 flex flex-col gap-2.5">
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 flex items-center gap-1.5 bg-surface-container border border-on-surface/[0.07] rounded-[10px] px-2.5 py-1.5 min-w-0">
                    <Building2 size={12} className="text-violet-600 dark:text-violet-400 shrink-0" />
                    <span className="text-[8px] font-black uppercase tracking-[0.09em] text-on-surface/40">Fornecedores</span>
                    <span className="text-[12px] font-black text-on-surface ml-auto">{fornecTotalCount}</span>
                  </div>
                  <button
                    onClick={() => setShowFornecFullscreen(true)}
                    title="Ver em tela cheia"
                    className="w-[30px] h-[30px] rounded-[10px] border border-on-surface/10 bg-surface-container text-on-surface/55 hover:bg-on-surface hover:text-[#FFE500] hover:border-on-surface flex items-center justify-center transition-all shrink-0"
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[8.5px] font-black uppercase tracking-wider text-on-surface/35">
                    {fornecChartMode === 'markup' ? 'Markup por fornecedor' : 'Valor por fornecedor'}
                  </span>
                  <button
                    onClick={() => setFornecChartMode(m => m === 'markup' ? 'valor' : 'markup')}
                    title={fornecChartMode === 'markup' ? 'Ver valor (R$)' : 'Ver markup'}
                    className={cn(
                      'w-[22px] h-[22px] rounded-[7px] border border-on-surface/10 bg-surface-container text-violet-600 dark:text-violet-400 flex items-center justify-center transition-all shrink-0 hover:bg-violet-600 hover:text-white hover:border-violet-600',
                      fornecChartMode === 'valor' && 'rotate-180'
                    )}
                  >
                    <ChevronDown size={12} strokeWidth={2.5} />
                  </button>
                </div>

                {fornecChartData.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-on-surface/25">
                    <p className="text-xs font-bold">Nenhuma nota aprovada no período</p>
                  </div>
                ) : (
                  <div className="flex items-end gap-1.5 h-[118px] px-0.5 pb-2 border-b-[1.5px] border-on-surface/10">
                    {fornecChartData.map(f => (
                      <div key={f.name} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-1 h-full" title={`${f.name}: ${fornecChartMode === 'markup' ? fmtPct(f.value) : fmtBRL(f.value)}`}>
                          <span className="text-[8px] font-black text-violet-600/85 dark:text-violet-400/85 whitespace-nowrap">{fornecChartMode === 'markup' ? fmtPct(f.value) : fmtBRL(f.value)}</span>
                          <div
                            className={cn(
                              'w-full max-w-[22px] rounded-t-[6px]',
                              fornecChartMode === 'markup'
                                ? 'bg-gradient-to-b from-violet-400 to-violet-600'
                                : 'bg-gradient-to-b from-red-300 to-primary'
                            )}
                            style={{ height: `${Math.max(6, (f.value / fornecMaxValue) * 96)}px` }}
                          />
                          <span className="text-[7px] font-bold text-on-surface/45 text-center leading-tight max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{f.name}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* Distribuição — expandir painel de Resultados (mesmo porte do "Editar Produto":
          max-w-2xl, não tela cheia — ver Etapa 3 do plano) */}
      <AnimatePresence>
        {showDistResultsExpanded && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDistResultsExpanded(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="relative w-full max-w-2xl bg-[#FDFAF0] dark:bg-[#1e1e18] rounded-3xl shadow-2xl overflow-hidden border border-black/10 dark:border-white/[0.08] max-h-[85vh] flex flex-col"
            >
              <div className="px-6 py-5 flex items-center gap-3.5 bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] shrink-0">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                  <Truck size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-manrope font-extrabold text-[#1A1A0E] leading-tight">Resultados — Distribuição</h2>
                  <p className="text-xs font-bold text-[#1A1A0E]/55 mt-0.5 truncate capitalize">{calMonthLabel}</p>
                </div>
                <button
                  onClick={() => setShowDistResultsExpanded(false)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] border border-black/10 text-black/50 hover:bg-black/[0.14] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 p-6 overflow-y-auto">
                {companiesList.length === 0 && (
                  <div className="col-span-2 flex items-center justify-center py-8 text-on-surface/25">
                    <p className="text-sm font-bold">Nenhuma loja cadastrada</p>
                  </div>
                )}
                {companiesList.map(c => {
                  const s = distCompanyStats[c.id] || { out: 0, outQty: 0, in: 0, inQty: 0 };
                  return (
                    <div key={c.id} className="bg-surface-container border border-on-surface/[0.07] rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2.5">
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        <span className="text-sm font-black text-on-surface truncate">{c.nome_fantasia}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-surface-container-low border border-on-surface/[0.06] rounded-xl px-3 py-2.5">
                          <div className="text-[8px] font-black uppercase tracking-[0.08em] text-on-surface/40">R$ Saiu</div>
                          <div className="text-base font-black text-primary">{fmtBRL(s.out)}</div>
                          <div className="text-[10px] font-bold text-on-surface/35">{s.outQty} un.</div>
                        </div>
                        <div className="bg-surface-container-low border border-on-surface/[0.06] rounded-xl px-3 py-2.5">
                          <div className="text-[8px] font-black uppercase tracking-[0.08em] text-on-surface/40">R$ Entrou</div>
                          <div className="text-base font-black text-emerald-600 dark:text-emerald-400">{fmtBRL(s.in)}</div>
                          <div className="text-[10px] font-bold text-on-surface/35">{s.inQty} un.</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Fornecedores em tela cheia - mesmo padrao da janela de edicao de notas */}
      <AnimatePresence>
        {showFornecFullscreen && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-[10px]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFornecFullscreen(false)}
              className="absolute inset-0 bg-black/75 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="relative w-full h-full bg-[#FDFAF0] dark:bg-[#1e1e18] rounded-[20px] shadow-2xl overflow-hidden flex flex-col border border-line/60 dark:border-white/[0.06]"
            >
              <div className="p-6 border-b border-line dark:border-white/[0.07] flex items-center justify-between bg-surface-container dark:bg-[#252520] shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                    <Building2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-on-surface">Markup por Fornecedor</h3>
                    <p className="text-xs font-semibold text-on-surface/40 mt-0.5 capitalize">{calMonthLabel}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFornecFullscreen(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full border-[1.5px] border-on-surface/15 hover:bg-on-surface/[0.07] transition-colors"
                >
                  <X size={22} className="text-on-surface/40" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-6 flex flex-col gap-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-surface-container-low border border-on-surface/[0.07] rounded-2xl px-4 py-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0 text-violet-600 dark:text-violet-400">
                      <Building2 size={16} strokeWidth={2.3} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-black uppercase tracking-[0.1em] text-on-surface/40">Fornecedores</div>
                      <div className="text-lg font-black tracking-tight leading-tight truncate text-on-surface">{statFornecedores}</div>
                    </div>
                  </div>
                  <div className="bg-surface-container-low border border-on-surface/[0.07] rounded-2xl px-4 py-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
                      <Wallet size={16} strokeWidth={2.3} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-black uppercase tracking-[0.1em] text-on-surface/40">Valor Total</div>
                      <div className="text-lg font-black tracking-tight leading-tight truncate text-on-surface">{fmtBRL(statValorTotal)}</div>
                    </div>
                  </div>
                  <div className="bg-surface-container-low border border-on-surface/[0.07] rounded-2xl px-4 py-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
                      <TrendingUp size={16} strokeWidth={2.3} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-black uppercase tracking-[0.1em] text-on-surface/40">Markup Geral</div>
                      <div className="text-lg font-black tracking-tight leading-tight truncate text-on-surface">{statMarkup !== null ? fmtPct(statMarkup) : '—'}</div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 bg-surface-container-low border border-on-surface/[0.07] rounded-2xl p-5 flex flex-col gap-3 min-h-[280px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-black uppercase tracking-wider text-on-surface/40">
                      {fornecChartMode === 'markup' ? 'Markup geral por fornecedor' : 'Valor por fornecedor'}
                    </span>
                    <button
                      onClick={() => setFornecChartMode(m => m === 'markup' ? 'valor' : 'markup')}
                      title={fornecChartMode === 'markup' ? 'Ver valor (R$)' : 'Ver markup'}
                      className={cn(
                        'w-7 h-7 rounded-[9px] border border-on-surface/10 bg-surface-container text-violet-600 dark:text-violet-400 flex items-center justify-center transition-all shrink-0 hover:bg-violet-600 hover:text-white hover:border-violet-600',
                        fornecChartMode === 'valor' && 'rotate-180'
                      )}
                    >
                      <ChevronDown size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                  {fornecChartData.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-on-surface/25">
                      <p className="text-sm font-bold">Nenhuma nota aprovada no periodo</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-x-auto overflow-y-hidden pb-2.5">
                      <div className="flex items-end gap-5 h-full min-w-full px-1 pb-2.5 border-b-[1.5px] border-on-surface/10">
                        {fornecChartData.map(f => (
                          <div key={f.name} className="w-16 shrink-0 flex flex-col items-center justify-end gap-1.5 h-full">
                            <span className="text-[11px] font-black text-violet-600 dark:text-violet-400 whitespace-nowrap">
                              {fornecChartMode === 'markup' ? fmtPct(f.value) : fmtBRL(f.value)}
                            </span>
                            <div
                              className={cn(
                                'w-full max-w-[56px] rounded-t-xl',
                                fornecChartMode === 'markup'
                                  ? 'bg-gradient-to-b from-violet-400 to-violet-700'
                                  : 'bg-gradient-to-b from-red-300 to-primary'
                              )}
                              style={{ height: `${Math.max(6, (f.value / fornecMaxValue) * 96)}%` }}
                            />
                            <span className="text-[10px] font-extrabold text-on-surface/55 text-center truncate max-w-full">{f.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {activeSection === 'notas' && (
        <div className="hidden md:block space-y-6">

          {/* Search + filtro + menu "+" */}
          <div className="flex flex-wrap items-center gap-3">
            {visibleNotes.length > 0 && (
              <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-primary/10 text-primary">
                {visibleNotes.length}
              </span>
            )}

            <div className="relative group">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/30 group-focus-within:text-primary transition-colors pointer-events-none" />
              <input
                type="text"
                value={noteSearch}
                onChange={e => setNoteSearch(e.target.value)}
                placeholder="Pesquisar nos itens..."
                className="bg-surface-container-lowest border border-on-surface/[0.06] rounded-xl pl-8 pr-8 py-2 text-xs font-medium placeholder:text-on-surface/25 focus:outline-none focus:ring-2 focus:ring-primary/20 w-56 transition-all"
              />
              {noteSearch && (
                <button
                  onClick={() => setNoteSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface/30 hover:text-on-surface transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <button
              onClick={() => {
                const next = !columnFiltersEnabled;
                setColumnFiltersEnabled(next);
                if (!next) { setColumnFilters({}); setFilterOpenKey(null); setFilterPendingSelection(null); setFilterSearchQuery(''); }
              }}
              title={columnFiltersEnabled ? 'Desativar filtros' : 'Filtrar por coluna'}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all',
                columnFiltersEnabled
                  ? 'bg-primary text-white border-primary shadow-md'
                  : 'bg-surface-container-lowest border-on-surface/[0.06] text-on-surface/60 hover:bg-on-surface/5',
                Object.values(columnFilters).some(s => s.size > 0) && !columnFiltersEnabled && 'ring-2 ring-primary/40',
              )}
            >
              <Filter size={14} />
              Filtrar colunas
            </button>

            {activeSection === 'notas' && (
              <button
                onClick={onManualNoteClick}
                title="Criar Manifesto"
                className="ml-auto w-9 h-9 rounded-xl flex items-center justify-center bg-primary text-on-primary shadow-md shadow-primary/20 hover:opacity-90 active:scale-[0.97] transition-all"
              >
                <Plus size={16} />
              </button>
            )}
          </div>

          {/* Notes table */}
          {visibleNotes.length === 0 ? (
            <div className="bg-surface-container-low/50 backdrop-blur-md rounded-[2.5rem] p-10 border border-on-surface/[0.03] flex items-center gap-8 shadow-sm">
              <div className="w-16 h-16 bg-on-surface/5 text-on-surface/20 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                <ClipboardList size={32} />
              </div>
              <div>
                <h4 className="text-lg font-black text-on-surface leading-tight uppercase tracking-[0.1em]">
                  Sem Notas
                </h4>
                <p className="text-sm text-on-surface/40 font-medium mt-1 leading-relaxed">
                  Notas criadas ou importadas aparecerão aqui, no período selecionado.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-surface-container-low/80 rounded-2xl border border-on-surface/5 overflow-hidden">
              <div ref={tableScrollRef} className="overflow-x-auto [&_tbody_td]:border-r [&_tbody_td]:border-on-surface/[0.04] dark:[&_tbody_td]:border-white/[0.03] [&_tbody_td:last-child]:border-r-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#FFEC4D] dark:bg-[#FFEC4D] border-b border-[#E6CE33] dark:border-[#DCC63D]">
                      {tableColumns.map(({ label, key }) => {
                        const hasFilter = (columnFilters[key]?.size ?? 0) > 0;
                        const isOpen = columnFiltersEnabled && filterOpenKey === key;
                        const uniqueVals = isOpen ? getColumnUniqueValues(key) : [];
                        const selected = isOpen ? (filterPendingSelection ?? new Set<string>()) : (columnFilters[key] ?? new Set<string>());
                        const searchLower = filterSearchQuery.toLowerCase();
                        const displayed = searchLower ? uniqueVals.filter(v => v.toLowerCase().includes(searchLower)) : uniqueVals;
                        return (
                          <th key={key} className="px-3 py-3 text-left whitespace-nowrap relative">
                            <div className="inline-flex items-center gap-1">
                              <span
                                onClick={columnFiltersEnabled ? () => { isOpen ? closeFilter() : openFilter(key); } : undefined}
                                title={columnFiltersEnabled ? (hasFilter ? 'Filtro ativo' : 'Filtrar') : undefined}
                                className={cn(
                                  'inline-flex items-center bg-[rgba(26,26,10,0.05)] rounded-full px-[13px] py-[5px] text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] dark:text-[rgba(26,26,10,0.58)] whitespace-nowrap border-[1.5px] transition-colors',
                                  columnFiltersEnabled
                                    ? cn('border-[#D81E1E]/45 cursor-pointer', hasFilter && 'text-[#D81E1E] dark:text-[#D81E1E]')
                                    : 'border-[rgba(26,26,10,0.10)] dark:border-[rgba(26,26,10,0.12)]',
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
                                      onClick={e => { e.stopPropagation(); confirmFilter(key); }}
                                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-primary text-on-primary hover:opacity-90 transition-opacity"
                                    >
                                      OK
                                    </button>
                                  </div>
                                </div>
                              </>)}
                            </div>
                          </th>
                        );
                      })}
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleNotes.map((note, idx) => {
                      const status = getNoteStatus(note);
                      const meta = STATUS_META[status];
                      return (
                      <tr
                        key={note.id}
                        className={cn(
                          'transition-colors',
                          idx % 2 === 0 ? 'bg-surface-container-lowest' : 'bg-surface-container-low/40',
                          'hover:bg-on-surface/[0.03]'
                        )}
                      >
                        {/* Situação */}
                        <td className="px-4 py-3.5">
                          <span
                            title={meta.label}
                            className={cn('inline-flex items-center gap-1 rounded-full px-[13px] py-[5px] text-[9px] font-black uppercase tracking-[0.10em] border-[1.5px] whitespace-nowrap', meta.bg, meta.fg, meta.border)}
                          >
                            <StatusIcon status={status} size={11} />
                            {STATUS_SHORT_LABEL[status]}
                          </span>
                        </td>

                        {/* Destino */}
                        <td className="px-4 py-3.5 max-w-[140px]">
                          <p className="text-xs text-on-surface/60 truncate">{companyName(note.companyId ?? null)}</p>
                        </td>

                        {/* Código */}
                        <td className="px-4 py-3.5">
                          {note.noteNumber ? (
                            <span className="font-mono text-xs font-bold text-on-surface bg-on-surface/5 px-2 py-1 rounded-lg">
                              {note.noteNumber}
                            </span>
                          ) : (
                            <span className="text-xs text-on-surface/25 font-medium">—</span>
                          )}
                        </td>

                        {/* Fornecedor */}
                        <td className="px-4 py-3.5 max-w-[180px]">
                          <p className="text-sm font-semibold text-on-surface truncate">{note.supplierName || '—'}</p>
                        </td>

                        {/* Data (recebimento) */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-on-surface/50">
                          {note.receivedDate ? fmtDateBR(note.receivedDate) : note.timestamp}
                        </td>

                        {/* Itens */}
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-black text-on-surface bg-on-surface/5 px-2 py-1 rounded-lg">
                            {note.itemCount}
                          </span>
                        </td>

                        {/* Verificados */}
                        <td className="px-4 py-3.5">
                          <span className={cn(
                            'text-[10px] font-black px-2 py-1 rounded-lg',
                            note.verifiedCount === note.itemCount && note.itemCount > 0
                              ? 'bg-emerald-500/10 text-emerald-700'
                              : 'bg-amber-500/10 text-amber-700'
                          )}>
                            {note.verifiedCount}/{note.itemCount}
                          </span>
                        </td>

                        {/* Total */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="text-xs font-bold text-on-surface/70">
                            {fmtBRL(noteTotal(note))}
                          </span>
                        </td>

                        {/* Financeiro */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            {note.finance_transaction_id ? (
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-emerald-700 truncate max-w-[120px]">
                                  {note.finance_tx_favorecido ?? 'Vinculada'}
                                </span>
                                {note.finance_tx_valor != null && (
                                  <span className="text-[10px] text-emerald-600">
                                    {fmtBRL(note.finance_tx_valor)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-on-surface/30 font-medium">—</span>
                            )}
                            <button
                              onClick={() => setLinkingNote(note)}
                              title={note.finance_transaction_id ? 'Movimentação vinculada — clique para alterar' : 'Vincular a uma movimentação financeira'}
                              className={cn(
                                'w-7 h-7 rounded-xl flex items-center justify-center transition-all shrink-0',
                                note.finance_transaction_id
                                  ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white'
                                  : 'bg-on-surface/5 text-on-surface/30 hover:bg-primary/10 hover:text-primary'
                              )}
                            >
                              <Link2 size={13} />
                            </button>
                          </div>
                        </td>

                        {/* Ações */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onViewReviewNote(note)}
                              title="Ver / editar nota"
                              className="w-8 h-8 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all flex items-center justify-center"
                            >
                              <Pencil size={14} />
                            </button>

                            {status !== 'aprovada' && (
                              <button
                                onClick={() => setConfirmApproveId(note.id)}
                                title="Aprovar nota"
                                className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Barra de rolagem horizontal flutuante — fixa na base da viewport enquanto a
              tabela ainda continua abaixo da tela; sincronizada com o scroll real da tabela. */}
          <div
            ref={floatScrollRef}
            style={{ opacity: 0, pointerEvents: 'none' }}
            className="fixed bottom-0 left-0 w-0 h-3.5 z-[150] overflow-x-auto overflow-y-hidden bg-on-surface/[0.06] dark:bg-white/[0.06] border-t border-on-surface/10 transition-opacity duration-150 [&::-webkit-scrollbar]:h-3.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[rgba(216,30,30,0.55)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-clip-padding hover:[&::-webkit-scrollbar-thumb]:bg-[rgba(216,30,30,0.75)]"
          >
            <div ref={floatScrollInnerRef} className="h-px" />
          </div>
        </div>
      )}

      {/* ── Distribuição (Fase 3 — tabela real; painel de Resultados e modal de
          Manifesto ainda não implementados) ──────────────────────────────── */}
      {activeSection === 'distribuicao' && (
        <div className="hidden md:block space-y-6">

          <div className="flex flex-wrap items-center gap-3">
            {visibleDistManifests.length > 0 && (
              <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-primary/10 text-primary">
                {visibleDistManifests.length}
              </span>
            )}

            <div className="relative group">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/30 group-focus-within:text-primary transition-colors pointer-events-none" />
              <input
                type="text"
                value={distSearch}
                onChange={e => setDistSearch(e.target.value)}
                placeholder="Pesquisar por loja, número..."
                className="bg-surface-container-lowest border border-on-surface/[0.06] rounded-xl pl-8 pr-8 py-2 text-xs font-medium placeholder:text-on-surface/25 focus:outline-none focus:ring-2 focus:ring-primary/20 w-56 transition-all"
              />
              {distSearch && (
                <button
                  onClick={() => setDistSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface/30 hover:text-on-surface transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <button
              disabled
              title="Filtro por coluna — em breve"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border bg-surface-container-lowest border-on-surface/[0.06] text-on-surface/30 cursor-not-allowed"
            >
              <Filter size={14} />
              Filtrar colunas
            </button>

            <button
              onClick={handleCreateDistributionManifest}
              title="Criar Manifesto"
              className="ml-auto w-9 h-9 rounded-xl flex items-center justify-center bg-primary text-on-primary shadow-md shadow-primary/20 hover:opacity-90 active:scale-[0.97] transition-all"
            >
              <Plus size={16} />
            </button>
          </div>

          {loadingDistManifests ? (
            <div className="bg-surface-container-low/50 backdrop-blur-md rounded-[2.5rem] p-10 border border-on-surface/[0.03] flex items-center justify-center shadow-sm">
              <p className="text-sm font-bold text-on-surface/40">Carregando manifestos…</p>
            </div>
          ) : visibleDistManifests.length === 0 ? (
            <div className="bg-surface-container-low/50 backdrop-blur-md rounded-[2.5rem] p-10 border border-on-surface/[0.03] flex items-center gap-8 shadow-sm">
              <div className="w-16 h-16 bg-on-surface/5 text-on-surface/20 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                <Truck size={32} />
              </div>
              <div>
                <h4 className="text-lg font-black text-on-surface leading-tight uppercase tracking-[0.1em]">
                  Sem Manifestos
                </h4>
                <p className="text-sm text-on-surface/40 font-medium mt-1 leading-relaxed">
                  Manifestos de distribuição entre lojas aparecerão aqui.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-surface-container-low/80 rounded-2xl border border-on-surface/5 overflow-hidden">
              <div className="overflow-x-auto [&_tbody_td]:border-r [&_tbody_td]:border-on-surface/[0.04] dark:[&_tbody_td]:border-white/[0.03] [&_tbody_td:last-child]:border-r-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#FFEC4D] dark:bg-[#FFEC4D] border-b border-[#E6CE33] dark:border-[#DCC63D]">
                      {DIST_TABLE_COLUMNS.map(({ label, key }) => (
                        <th key={key} className="px-3 py-3 text-left whitespace-nowrap">
                          <span className="inline-flex items-center bg-[rgba(26,26,10,0.05)] rounded-full px-[13px] py-[5px] text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] dark:text-[rgba(26,26,10,0.58)] whitespace-nowrap border-[1.5px] border-[rgba(26,26,10,0.10)] dark:border-[rgba(26,26,10,0.12)]">
                            {label}
                          </span>
                        </th>
                      ))}
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDistManifests.map((m, idx) => {
                      const meta = DIST_STATUS_META[m.status];
                      return (
                        <tr
                          key={m.id}
                          className={cn(
                            'transition-colors',
                            idx % 2 === 0 ? 'bg-surface-container-lowest' : 'bg-surface-container-low/40',
                            'hover:bg-on-surface/[0.03]'
                          )}
                        >
                          <td className="px-4 py-3.5">
                            <span
                              title={meta.label}
                              className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10.5px] font-black uppercase tracking-wide', meta.bg, meta.fg, meta.border)}
                            >
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-mono text-[12.5px] font-bold text-on-surface">{m.manifestNumber}</td>
                          <td className="px-4 py-3.5 font-semibold text-on-surface">{companyName(m.originCompanyId)}</td>
                          <td className="px-4 py-3.5 font-semibold text-on-surface">{m.destinationCompanyId ? companyName(m.destinationCompanyId) : <span className="text-on-surface/30">—</span>}</td>
                          <td className="px-4 py-3.5">
                            <span className="text-xs font-black text-on-surface bg-on-surface/5 px-2 py-1 rounded-lg">
                              {m.itemCount}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="text-xs font-bold text-on-surface/70">
                              {fmtBRL(m.total)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-on-surface">{m.shippingDate ? fmtDateBR(m.shippingDate) : <span className="text-on-surface/30">—</span>}</td>
                          <td className="px-4 py-3.5">
                            <button
                              onClick={() => handleOpenDistributionManifest(m)}
                              title="Ver / editar manifesto"
                              className="w-8 h-8 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all flex items-center justify-center"
                            >
                              <Pencil size={14} />
                            </button>
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
      )}

      {distManifestDraft && (
        <DistributionManifestModal
          manifest={distManifestDraft}
          companies={companiesList}
          colaboradorId={colaboradorId}
          colaboradorNome={colaboradorNome}
          setNotification={setNotification}
          onClose={() => setDistManifestDraft(null)}
          onSaved={() => fetchDistributionManifests()}
        />
      )}

      {/* ── Rascunhos ────────────────────────────────────────────────────── */}
      {activeSection === 'rascunhos' && (
        <div className="hidden md:block space-y-4">
          {(!bulkDrafts || bulkDrafts.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-16 text-on-surface/20">
              <ClipboardList size={48} className="mb-4 opacity-30" />
              <p className="text-sm font-black uppercase tracking-widest">Nenhum rascunho</p>
            </div>
          ) : bulkDrafts.map(draft => {
            const isConfirmingDelete = confirmDeleteDraftId === draft.id;
            return (
              <div key={draft.id} className="bg-surface-container-lowest border border-on-surface/[0.04] rounded-[2rem] p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em] mb-1">Rascunho · Lista de Produtos</p>
                    <p className="text-base font-black text-on-surface">{draft.file_name || 'Rascunho sem nome'}</p>
                    <p className="text-xs text-on-surface/40 mt-1">{draft.timestamp_label || ''} · {draft.item_count || 0} produto(s)</p>
                  </div>
                </div>
                {isConfirmingDelete ? (
                  <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-500/10 rounded-2xl">
                    <p className="text-sm font-bold text-red-600 dark:text-red-400 flex-1">Excluir este rascunho?</p>
                    <button onClick={() => { onDeleteBulkDraft?.(draft.id); setConfirmDeleteDraftId(null); }} className="px-3 py-1.5 bg-red-500 text-white text-xs font-black rounded-xl hover:bg-red-600 transition-colors">Sim</button>
                    <button onClick={() => setConfirmDeleteDraftId(null)} className="px-3 py-1.5 bg-on-surface/10 text-on-surface/60 text-xs font-black rounded-xl transition-colors">Não</button>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={() => onApproveBulkDraft?.(draft.id, draft.items || [])} className="flex-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-4 py-3 rounded-2xl font-black text-sm hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center gap-2 uppercase tracking-widest active:scale-95">
                      <CheckCircle2 size={16} />
                      Aprovar
                    </button>
                    <button onClick={() => setConfirmDeleteDraftId(draft.id)} className="px-4 py-3 rounded-2xl font-black text-sm bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all uppercase tracking-widest active:scale-95">
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dicionário (aba) ─────────────────────────────────────────────── */}
      {activeSection === 'dicionario' && (
        <div className="hidden md:block">
          <SupplierDictionary embedded isOpen onClose={() => {}} setNotification={setNotification} />
        </div>
      )}

      {/* ── Fornecedores (aba) ───────────────────────────────────────────── */}
      {activeSection === 'fornecedores' && (
        <div className="hidden md:block bg-surface-container-lowest rounded-3xl border border-on-surface/[0.04] shadow-md overflow-hidden">
          <div className="p-6 border-b border-on-surface/[0.06] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <Users size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-black text-on-surface leading-none">Fornecedores</h2>
              <p className="text-xs text-on-surface/40 font-medium mt-0.5">{pickerSuppliers.length} cadastrado{pickerSuppliers.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="relative w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/30 pointer-events-none" />
              <input
                type="text"
                value={supplierSearch}
                onChange={e => setSupplierSearch(e.target.value)}
                placeholder="Buscar fornecedor..."
                className="w-full bg-surface-container border border-on-surface/[0.06] rounded-xl pl-9 pr-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-on-surface placeholder:text-on-surface/30"
              />
            </div>
            <button
              onClick={() => { setEditingSupplier(null); setShowAddSupplier(true); }}
              className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600 transition-colors shrink-0 shadow-lg shadow-amber-500/20"
              title="Cadastrar novo fornecedor"
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {loadingPicker ? (
              <div className="col-span-full flex items-center justify-center py-10">
                <div className="w-5 h-5 rounded-full border-2 border-amber-500 border-r-transparent animate-spin" />
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <p className="col-span-full text-sm text-on-surface/30 text-center py-10">
                {supplierSearch ? 'Nenhum fornecedor encontrado.' : 'Nenhum fornecedor cadastrado.'}
              </p>
            ) : filteredSuppliers.map(s => {
              const displayName = s.nome_fantasia || s.name;
              const subtitle = s.razao_social && s.razao_social !== displayName ? s.razao_social : null;
              return (
                <div key={s.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-on-surface/[0.06] bg-surface-container/50 hover:border-amber-500/20 hover:bg-amber-500/5 transition-all group">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                    <Building2 size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-on-surface truncate group-hover:text-amber-700 transition-colors">{displayName}</p>
                    {subtitle && <p className="text-[10px] text-on-surface/40 truncate">{subtitle}</p>}
                    {s.documento && <p className="text-[10px] text-on-surface/30 font-mono">{s.documento}</p>}
                  </div>
                  <button
                    onClick={() => { setEditingSupplier(s); setShowAddSupplier(true); }}
                    className="w-8 h-8 rounded-lg text-on-surface/20 hover:text-amber-600 hover:bg-amber-500/10 flex items-center justify-center transition-all shrink-0"
                    title="Editar fornecedor"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Fabricantes (aba) ────────────────────────────────────────────── */}
      {activeSection === 'fabricantes' && (
        <div className="hidden md:block bg-surface-container-lowest rounded-3xl border border-on-surface/[0.04] shadow-md overflow-hidden">
          <div className="p-6 border-b border-on-surface/[0.06] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <Factory size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-black text-on-surface leading-none">Fabricantes</h2>
              <p className="text-xs text-on-surface/40 font-medium mt-0.5">{pickerManufacturers.length} cadastrado{pickerManufacturers.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="relative w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/30 pointer-events-none" />
              <input
                type="text"
                value={manufacturerSearch}
                onChange={e => setManufacturerSearch(e.target.value)}
                placeholder="Buscar fabricante..."
                className="w-full bg-surface-container border border-on-surface/[0.06] rounded-xl pl-9 pr-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-on-surface placeholder:text-on-surface/30"
              />
            </div>
            {canManageManufacturers && (
              <button
                onClick={() => { setEditingManufacturer(null); setShowAddManufacturer(true); }}
                className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600 transition-colors shrink-0 shadow-lg shadow-amber-500/20"
                title="Cadastrar novo fabricante"
              >
                <Plus size={18} />
              </button>
            )}
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {loadingManufacturersPicker ? (
              <div className="col-span-full flex items-center justify-center py-10">
                <div className="w-5 h-5 rounded-full border-2 border-amber-500 border-r-transparent animate-spin" />
              </div>
            ) : filteredManufacturers.length === 0 ? (
              <p className="col-span-full text-sm text-on-surface/30 text-center py-10">
                {manufacturerSearch ? 'Nenhum fabricante encontrado.' : 'Nenhum fabricante cadastrado.'}
              </p>
            ) : filteredManufacturers.map(m => (
              <div key={m.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-2xl border border-on-surface/[0.06] bg-surface-container/50 hover:border-amber-500/20 hover:bg-amber-500/5 transition-all group",
                  !m.active && 'opacity-50'
                )}>
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                  <Factory size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-on-surface truncate group-hover:text-amber-700 transition-colors">{m.name}</p>
                  <p className="text-[10px] text-on-surface/40 font-mono">Prefixo {m.prefix}{!m.active && ' · Inativo'}</p>
                  {m.cnpj && <p className="text-[10px] text-on-surface/30 font-mono">{m.cnpj}</p>}
                </div>
                {canManageManufacturers && (
                  <button
                    onClick={() => { setEditingManufacturer(m); setShowAddManufacturer(true); }}
                    className="w-8 h-8 rounded-lg text-on-surface/20 hover:text-amber-600 hover:bg-amber-500/10 flex items-center justify-center transition-all shrink-0"
                    title="Editar fabricante"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Confirm Approve Dialog ─────────────────────────────────────────── */}
      <AnimatePresence>
        {confirmNote && (() => {
          const blockedByMissingPrice = noteHasUnpricedLinkedItems(confirmNote);
          return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/60 backdrop-blur-md"
              onClick={() => setConfirmApproveId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 20 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="relative bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl"
            >
              {/* Ícone */}
              <div className="flex justify-center mb-5">
                <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center', blockedByMissingPrice ? 'bg-red-50' : 'bg-emerald-50')}>
                  <AlertTriangle size={28} className={blockedByMissingPrice ? 'text-red-500' : 'text-emerald-500'} />
                </div>
              </div>

              {blockedByMissingPrice ? (
                <>
                  {/* Texto — bloqueado */}
                  <div className="text-center mb-7 px-2">
                    <h3 className="text-lg font-black text-slate-900 mb-2">Faltam preços de venda</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      <span className="font-bold text-slate-800">{confirmNote.fileName}</span>{' '}
                      tem produtos vinculados sem preço de venda preenchido. Preencha o preço de todos os itens vinculados antes de aprovar.
                    </p>
                  </div>
                  <button
                    onClick={() => setConfirmApproveId(null)}
                    className="w-full py-4 rounded-2xl bg-slate-100 text-slate-600 font-black text-sm uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Entendi
                  </button>
                </>
              ) : (
              <>
              {/* Texto */}
              <div className="text-center mb-7 px-2">
                <h3 className="text-lg font-black text-slate-900 mb-2">Aprovar esta nota?</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  <span className="font-bold text-slate-800">{confirmNote.fileName}</span>{' '}
                  será movida para a seção{' '}
                  <span className="font-bold text-emerald-500">Aprovados</span>.{' '}
                  Essa ação não pode ser desfeita.
                </p>
              </div>

              {/* Botão confirmar */}
              <button
                onClick={() => {
                  onApproveNote(confirmNote.id);
                  setConfirmApproveId(null);
                }}
                className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black text-sm uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 active:scale-95 mb-2"
              >
                <CheckCircle2 size={16} />
                Confirmar Aprovação
              </button>

              {/* Cancelar */}
              <button
                onClick={() => setConfirmApproveId(null)}
                className="w-full py-3 text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                Cancelar
              </button>
              </>
              )}
            </motion.div>
          </div>
          );
        })()}
      </AnimatePresence>

      <AddSupplierModal
        isOpen={showAddSupplier}
        onClose={() => { setShowAddSupplier(false); setEditingSupplier(null); }}
        editingSupplier={editingSupplier}
        onSuccess={() => { fetchPickerSuppliers(); }}
      />

      <AddManufacturerModal
        isOpen={showAddManufacturer}
        onClose={() => { setShowAddManufacturer(false); setEditingManufacturer(null); }}
        editingManufacturer={editingManufacturer}
        onSuccess={() => { fetchPickerManufacturers(); }}
      />

      {/* ── Link Transaction Modal ─────────────────────────────────────────── */}
      {linkingNote && (
        <LinkTransactionModal
          note={linkingNote}
          isOpen={!!linkingNote}
          onClose={() => setLinkingNote(null)}
          onLink={(transactionId) => {
            onLinkNote?.(linkingNote.id, transactionId);
            setLinkingNote(null);
          }}
        />
      )}
    </div>
  );
}

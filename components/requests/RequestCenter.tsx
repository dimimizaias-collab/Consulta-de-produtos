'use client';

import {
  Plus,
  X,
  Check,
  Trash2,
  ArrowLeftRight,
  CheckCircle2,
  ImageOff,
  Search,
  CheckSquare,
  ChevronRight,
  Info,
  BarChart3,
  Printer,
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn, getDirectImageUrl } from '@/lib/utils';
import Image from 'next/image';
import { Fragment, useState, useMemo } from 'react';

// ── Análise de Produtos: cruzamento com o histórico de notas ───────────────

interface SupplierStat {
  supplierKey: string;
  supplierName: string;
  qtyTotal: number;
  noteCount: number;
  avgLeadTime: number | null;
  leadTimeSampleSize: number;
  lastPrice: number | null;
}

// Cruza um produto com o histórico de notas aprovadas: quem já forneceu, com que
// frequência, a que preço (custo unitário = valor da linha / multiplicador da embalagem)
// e em quantos dias entre "Data do pedido" e "Data de recebimento" (quando ambas existem).
// Compartilhada entre a visão "Por Produto" e "Por Fornecedor".
function computeSupplierBreakdown(productId: string, reviewNotes: any[]): SupplierStat[] {
  const bySupplier = new Map<string, {
    supplierName: string; qtyTotal: number; noteCount: number;
    leadTimes: number[]; lastPrice: number | null; lastDate: string | null;
  }>();

  for (const note of reviewNotes) {
    if (!Array.isArray(note.items)) continue;
    for (const item of note.items) {
      if (item.product_id !== productId) continue;
      const qty = Number(item.qty) || 0;
      if (qty <= 0) continue;

      const key = note.supplierId || note.supplierName || 'desconhecido';
      let acc = bySupplier.get(key);
      if (!acc) {
        acc = { supplierName: note.supplierName || 'Fornecedor não identificado', qtyTotal: 0, noteCount: 0, leadTimes: [], lastPrice: null, lastDate: null };
        bySupplier.set(key, acc);
      }
      acc.qtyTotal += qty;
      acc.noteCount += 1;

      if (note.orderDate && note.receivedDate) {
        const days = Math.round((new Date(note.receivedDate).getTime() - new Date(note.orderDate).getTime()) / 86400000);
        if (days >= 0) acc.leadTimes.push(days);
      }

      const noteDate = note.receivedDate || note.orderDate || note.createdAt || null;
      if (noteDate && (!acc.lastDate || noteDate > acc.lastDate)) {
        acc.lastDate = noteDate;
        const unitCost = (Number(item.price) || 0) / (Number(item.multiplier) || 1);
        if (unitCost > 0) acc.lastPrice = unitCost;
      }
    }
  }

  return Array.from(bySupplier.entries())
    .map(([supplierKey, s]) => ({
      supplierKey,
      supplierName: s.supplierName,
      qtyTotal: s.qtyTotal,
      noteCount: s.noteCount,
      lastPrice: s.lastPrice,
      avgLeadTime: s.leadTimes.length > 0 ? Math.round(s.leadTimes.reduce((a, b) => a + b, 0) / s.leadTimes.length) : null,
      leadTimeSampleSize: s.leadTimes.length,
    }))
    .sort((a, b) => b.qtyTotal - a.qtyTotal);
}

// Fornecedores empatados no menor preço / menor prazo de um produto (viram selos).
function bestKeys(breakdown: SupplierStat[]) {
  const priced = breakdown.filter(s => s.lastPrice != null);
  const timed = breakdown.filter(s => s.avgLeadTime != null);
  const minPrice = priced.length ? Math.min(...priced.map(s => s.lastPrice as number)) : null;
  const minLead = timed.length ? Math.min(...timed.map(s => s.avgLeadTime as number)) : null;
  return {
    minPrice,
    price: new Set(priced.filter(s => s.lastPrice === minPrice).map(s => s.supplierKey)),
    lead: new Set(timed.filter(s => s.avgLeadTime === minLead).map(s => s.supplierKey)),
  };
}

// Faixa de "atenção" antes do crítico: 20% acima do mínimo, arredondado pra cima,
// com margem mínima de 1 unidade — evita que mínimos pequenos (1-4 un) fiquem sem faixa.
function attentionThreshold(minStock: number): number {
  return minStock + Math.max(Math.ceil(minStock * 0.2), minStock > 0 ? 1 : 0);
}

const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Tokens visuais do padrão quadrado ───────────────────────────────────────

const PILL = 'inline-flex items-center gap-1.5 h-5 px-2 border text-[9.5px] font-black uppercase tracking-[0.05em] whitespace-nowrap shrink-0';
const TONE = {
  red: 'text-[#D81E1E] border-[rgba(216,30,30,0.3)] bg-[rgba(216,30,30,0.06)] dark:border-[rgba(216,30,30,0.4)] dark:bg-[rgba(216,30,30,0.10)]',
  amber: 'text-[#92400E] dark:text-[#FCD34D] border-amber-400/55 dark:border-amber-400/40 bg-amber-50 dark:bg-amber-400/[0.07]',
  green: 'text-[#0A7A55] dark:text-[#34D399] border-[rgba(10,122,85,0.3)] dark:border-[rgba(52,211,153,0.3)] bg-[rgba(10,122,85,0.08)] dark:bg-[rgba(52,211,153,0.08)]',
  blue: 'text-[#2563EB] dark:text-[#60A5FA] border-[rgba(37,99,235,0.3)] dark:border-[rgba(96,165,250,0.3)] bg-[rgba(37,99,235,0.06)] dark:bg-[rgba(96,165,250,0.08)]',
  purple: 'text-[#7C3AED] dark:text-[#A78BFA] border-[rgba(124,58,237,0.3)] dark:border-[rgba(167,139,250,0.3)] bg-[rgba(124,58,237,0.06)] dark:bg-[rgba(167,139,250,0.08)]',
  neutral: 'text-on-surface border-[#CFC4A2] dark:border-white/20 bg-black/[0.035] dark:bg-white/[0.03]',
} as const;
type Tone = keyof typeof TONE;

// Faixa de 3px no topo do card, na cor do tipo/prioridade.
const ACCENT: Record<Tone, string> = {
  red: 'shadow-[inset_0_3px_0_#D81E1E]',
  amber: 'shadow-[inset_0_3px_0_#F59E0B]',
  green: 'shadow-[inset_0_3px_0_#0A7A55] dark:shadow-[inset_0_3px_0_#34D399]',
  blue: 'shadow-[inset_0_3px_0_#2563EB] dark:shadow-[inset_0_3px_0_#60A5FA]',
  purple: 'shadow-[inset_0_3px_0_#7C3AED] dark:shadow-[inset_0_3px_0_#A78BFA]',
  neutral: 'shadow-[inset_0_3px_0_#1A1A0E] dark:shadow-[inset_0_3px_0_#F2F0E3]',
};

const BORDER = 'border-[#E0D8BF] dark:border-white/[0.10]';
const SURFACE = 'bg-white dark:bg-[#1E1E18]';
const SUB = 'bg-[#FDFBF4] dark:bg-[#1B1B16]';
const AB = 'h-[30px] inline-flex items-center justify-center gap-1 px-2 border text-[9.5px] font-black uppercase tracking-[0.05em] whitespace-nowrap transition-[color,background-color,border-color,opacity,transform] duration-150 active:scale-[0.95]';
const AB_GHOST = cn(AB, 'flex-1', BORDER, SURFACE, 'text-on-surface/45 hover:text-on-surface hover:border-[#CFC4A2] dark:hover:border-white/20');
const AB_OK = cn(AB, 'flex-1 bg-primary border-primary text-white hover:bg-[#B91818]');
const AB_DEL = cn(AB, 'w-[30px] px-0 shrink-0', BORDER, SURFACE, 'text-on-surface/45 opacity-60 group-hover:opacity-100 hover:!text-[#D81E1E] hover:border-[rgba(216,30,30,0.3)] hover:bg-[rgba(216,30,30,0.06)]');
const TH = 'h-8 px-2.5 text-left whitespace-nowrap text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] bg-[#FFEC4D]';
const TH_LINE = 'shadow-[inset_-1px_0_0_#B8A31F,inset_0_-1.5px_0_#8F7E10]';
const TH_LAST = 'shadow-[inset_0_-1.5px_0_#8F7E10]';
const TABLE = 'w-full table-fixed text-[12.5px] border-collapse [&_td]:px-2.5 [&_td]:whitespace-nowrap [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td]:border-r [&_td]:border-b [&_td]:border-[#A8A290] dark:[&_td]:border-white/20 [&_td:last-child]:border-r-0';
const ROW = (idx: number) => cn(
  'transition-colors',
  idx % 2 === 0 ? 'bg-white dark:bg-[#1E1E18]' : 'bg-[#FAF7EE] dark:bg-[#1A1A15]',
  'hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.06]',
);
const CHILD = cn('[&_td]:h-[30px] text-[12px] text-on-surface/45', SUB);

type RequestKind = 'impressao' | 'tarefa' | 'alteracao' | 'rascunho' | 'produto';

function requestKind(rc: any): RequestKind {
  if (rc.is_print_queue) return 'impressao';
  if (rc.is_task) return 'tarefa';
  if (rc.is_product_alteration) return 'alteracao';
  if (rc.is_bulk_products) return 'rascunho';
  return 'produto';
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome', sku: 'SKU', price: 'Preço', count: 'Estoque',
  location: 'Localização', ean: 'EAN', category: 'Categoria',
  subcategory: 'Subcategoria', brand: 'Marca', status: 'Status',
};

interface RequestCenterProps {
  requests: any[];
  onAddRequest: () => void;
  onEditRequest: (request: any) => void;
  onApproveRequest: (requestId: string) => void;
  onDeleteRequest: (requestId: string) => void;
  onToggleCheck?: (requestId: string, checkedIndices: number[]) => void;
  onApproveMultiple?: (requestIds: string[]) => void;
  onDeleteMultiple?: (requestIds: string[]) => void;
  // Análise de Produtos — dados já carregados no app, só lidos aqui (edição continua
  // acontecendo em Estoque/Editar Produto e em Entrada de Mercadoria).
  products?: any[];
  reviewNotes?: any[];
}

function ProductImage({ src, alt }: { src: string, alt: string }) {
  const [error, setError] = useState(false);
  const directSrc = useMemo(() => getDirectImageUrl(src), [src]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {directSrc && !error ? (
        <Image
          key={directSrc}
          className="object-cover"
          alt={alt}
          src={directSrc}
          fill
          referrerPolicy="no-referrer"
          unoptimized={directSrc.includes('googleusercontent.com')}
          onError={() => setError(true)}
        />
      ) : (
        <ImageOff size={18} className="text-on-surface/15" />
      )}
    </div>
  );
}

// Barra de nível do estoque com a marca do mínimo.
function StockLevel({ count, min, tone }: { count: number; min: number; tone: 'red' | 'amber' }) {
  const scale = Math.max(attentionThreshold(min) * 1.5, count, 1);
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('relative w-[70px] h-1.5 border', BORDER, 'bg-black/[0.035] dark:bg-white/[0.03]')}>
        <span className={cn('block h-full', tone === 'red' ? 'bg-[#D81E1E]' : 'bg-[#F59E0B]')} style={{ width: `${Math.min(100, (count / scale) * 100)}%` }} />
        <span className="absolute -top-[3px] -bottom-[3px] w-[1.5px] bg-on-surface/50" style={{ left: `${(min / scale) * 100}%` }} />
      </span>
      <span className="font-mono text-[11.5px] text-on-surface">{count} / {min}</span>
    </span>
  );
}

function SupplierTags({ isBestPrice, isBestLead }: { isBestPrice: boolean; isBestLead: boolean }) {
  return (
    <>
      {isBestPrice && <span className="ml-1.5 text-[8.5px] font-black uppercase tracking-[0.05em] px-[5px] leading-[15px] border border-current text-[#0A7A55] dark:text-[#34D399]">Melhor preço</span>}
      {isBestLead && <span className="ml-1.5 text-[8.5px] font-black uppercase tracking-[0.05em] px-[5px] leading-[15px] border border-current text-[#2563EB] dark:text-[#60A5FA]">Menor prazo</span>}
    </>
  );
}

export function RequestCenter({
  requests,
  onAddRequest,
  onEditRequest,
  onApproveRequest,
  onDeleteRequest,
  onToggleCheck,
  onApproveMultiple,
  onDeleteMultiple,
  products = [],
  reviewNotes = [],
}: RequestCenterProps) {
  const pendingRequests = useMemo(() => requests.filter(r => r.status === 'pending'), [requests]);

  // ── Análise de Produtos ──────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<'requisicoes' | 'analise'>('requisicoes');
  const [analysisGrouping, setAnalysisGrouping] = useState<'produto' | 'fornecedor'>('produto');
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [expandedSupplierKey, setExpandedSupplierKey] = useState<string | null>(null);

  // Crítico = já no limite ou abaixo. Atenção = acima do mínimo mas dentro da margem
  // (ver attentionThreshold) — avisa antes de precisar comprar às pressas.
  const stockStatusProducts = useMemo(() => {
    const critical: any[] = [];
    const attention: any[] = [];
    for (const p of products) {
      if (p.min_stock == null) continue;
      const count = p.count || 0;
      if (count <= p.min_stock) critical.push(p);
      else if (count <= attentionThreshold(p.min_stock)) attention.push(p);
    }
    critical.sort((a, b) => (b.min_stock - (b.count || 0)) - (a.min_stock - (a.count || 0)));
    attention.sort((a, b) => (a.count || 0) - a.min_stock - ((b.count || 0) - b.min_stock));
    return { critical, attention };
  }, [products]);

  const lowStockProducts = useMemo(
    () => [...stockStatusProducts.critical, ...stockStatusProducts.attention],
    [stockStatusProducts]
  );

  const noMinStockCount = useMemo(
    () => products.filter(p => p.min_stock == null).length,
    [products]
  );

  // Fornecedores de cada produto em falta/atenção — alimenta a coluna "Melhor preço",
  // as linhas expandidas e a visão "Por Fornecedor". Só calcula com a aba Análise aberta
  // (cruza todos esses produtos com o histórico de notas de uma vez).
  const breakdownByProduct = useMemo(() => {
    const map = new Map<string, SupplierStat[]>();
    if (activeView !== 'analise') return map;
    for (const p of lowStockProducts) map.set(p.id, computeSupplierBreakdown(p.id, reviewNotes));
    return map;
  }, [activeView, lowStockProducts, reviewNotes]);

  const supplierGroups = useMemo(() => {
    const bySupplier = new Map<string, { supplierName: string; products: { product: any; stat: SupplierStat }[] }>();
    const uncovered: any[] = [];

    for (const product of lowStockProducts) {
      const breakdown = breakdownByProduct.get(product.id) ?? [];
      if (breakdown.length === 0) {
        uncovered.push(product);
        continue;
      }
      for (const stat of breakdown) {
        let acc = bySupplier.get(stat.supplierKey);
        if (!acc) {
          acc = { supplierName: stat.supplierName, products: [] };
          bySupplier.set(stat.supplierKey, acc);
        }
        acc.products.push({ product, stat });
      }
    }

    const groups = Array.from(bySupplier.entries())
      .map(([supplierKey, g]) => ({ supplierKey, ...g }))
      .sort((a, b) => b.products.length - a.products.length);

    return { groups, uncovered };
  }, [lowStockProducts, breakdownByProduct]);

  // Inicializa checkedItems a partir dos dados salvos no banco
  const [checkedItems, setCheckedItems] = useState<Record<string, Set<number>>>(() => {
    const initial: Record<string, Set<number>> = {};
    for (const r of requests) {
      try {
        const rc = JSON.parse(r.requested_changes || '{}');
        if (Array.isArray(rc.checked_indices) && rc.checked_indices.length > 0) {
          initial[r.id] = new Set(rc.checked_indices);
        }
      } catch { /* ignora */ }
    }
    return initial;
  });

  const [filterQuery, setFilterQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'todas' | RequestKind>('todas');

  // Requisições já com o JSON aberto e o tipo resolvido, pra filtrar/contar sem re-parsear.
  const parsedRequests = useMemo(() => pendingRequests.map(request => {
    let rc: any = {};
    try { rc = JSON.parse(request.requested_changes || '{}'); } catch { /* ignora */ }
    const kind = requestKind(rc);
    const productData = kind === 'produto' && !rc.is_new_product ? request.products : rc;
    const haystack = [
      rc.title, rc.observacao, rc.product_name, rc.product_sku,
      productData?.name, productData?.sku, productData?.brand,
      ...(Array.isArray(rc.items) ? rc.items.map((it: any) => `${it.name || ''} ${it.ean || ''} ${it.sku || ''}`) : []),
    ].filter(Boolean).join(' ').toLowerCase();
    return { request, rc, kind, productData, haystack };
  }), [pendingRequests]);

  const kindCounts = useMemo(() => {
    const c: Record<'todas' | RequestKind, number> = { todas: parsedRequests.length, rascunho: 0, tarefa: 0, alteracao: 0, impressao: 0, produto: 0 };
    for (const p of parsedRequests) c[p.kind] += 1;
    return c;
  }, [parsedRequests]);

  const visibleRequests = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return parsedRequests.filter(p =>
      (kindFilter === 'todas' || p.kind === kindFilter) && (!q || p.haystack.includes(q))
    );
  }, [parsedRequests, kindFilter, filterQuery]);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelectionMode() {
    setSelectionMode(prev => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }

  function toggleSelect(requestId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(requestId) ? next.delete(requestId) : next.add(requestId);
      return next;
    });
  }

  const allVisibleSelected = visibleRequests.length > 0 && visibleRequests.every(p => selectedIds.has(p.request.id));

  function toggleSelectAll() {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleRequests.map(p => p.request.id)));
  }

  function handleBulkApprove() {
    if (selectedIds.size === 0) return;
    onApproveMultiple?.(Array.from(selectedIds));
    setSelectedIds(new Set());
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    onDeleteMultiple?.(Array.from(selectedIds));
    setSelectedIds(new Set());
  }

  function toggleCheck(requestId: string, idx: number) {
    setCheckedItems(prev => {
      const set = new Set(prev[requestId] ?? []);
      set.has(idx) ? set.delete(idx) : set.add(idx);
      const next = { ...prev, [requestId]: set };
      onToggleCheck?.(requestId, Array.from(set));
      return next;
    });
  }

  const TABS = [
    { id: 'requisicoes' as const, label: 'Requisições', count: pendingRequests.length, alert: false },
    { id: 'analise' as const, label: 'Análise', count: stockStatusProducts.critical.length, alert: true },
  ];

  // ── Card de requisição ───────────────────────────────────────────────────
  function renderCard({ request, rc, kind, productData }: (typeof parsedRequests)[number]) {
    const selected = selectedIds.has(request.id);
    const items: any[] = Array.isArray(rc.items) ? rc.items : [];
    const openedAt = request.created_at
      ? new Date(request.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      : null;
    const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

    let tone: Tone = 'neutral';
    let pills: { label: string; tone: Tone }[] = [];
    let editLabel = 'Ver';
    let approve = { label: 'Aprovar', icon: <CheckCircle2 size={12} />, cls: AB_OK };
    let body: React.ReactNode = null;

    const itemList = (rows: React.ReactNode[], total: number, shown: number) => (
      <div className={cn('border max-h-[124px] overflow-y-auto', BORDER, SUB)}>
        {rows}
        {total > shown && (
          <div className={cn('h-7 flex items-center px-2.5 border-t text-[11px] italic text-on-surface/30', BORDER)}>
            +{total - shown} {kind === 'tarefa' ? 'itens' : 'produtos'}
          </div>
        )}
      </div>
    );
    const itemRow = (key: number, first: boolean, children: React.ReactNode) => (
      <div key={key} className={cn('h-7 flex items-center gap-2 px-2.5 text-[11.5px] font-semibold text-on-surface', !first && cn('border-t', BORDER))}>
        {children}
      </div>
    );

    if (kind === 'impressao') {
      const count = rc.count ?? items.reduce((acc, it) => acc + (it.qty || 0), 0);
      tone = 'neutral';
      pills = [{ label: 'Impressão', tone: 'neutral' }];
      approve = { label: 'Imprimir', icon: <Printer size={12} />, cls: AB_OK };
      body = (
        <>
          <Title text="Fila de Impressão" sub={`${items.length} produto${items.length !== 1 ? 's' : ''} · ${count} etiqueta${count !== 1 ? 's' : ''} · ${rc.template === 'produto' ? 'Produto' : 'Gôndola'}`} />
          {items.length > 0 && itemList(items.slice(0, 5).map((item, idx) => itemRow(idx, idx === 0, (
            <>
              <span className="flex-1 min-w-0 truncate">{item.name || item.ean || item.sku || <span className="text-on-surface/30 italic">Sem descrição</span>}</span>
              <span className={cn('text-[9px] font-black uppercase tracking-[0.04em] px-[5px] leading-4 border shrink-0',
                item.size === 'half' || item.size === 'triple' ? 'border-[rgba(216,30,30,0.3)] text-[#D81E1E]' : cn(BORDER, 'text-on-surface/45'))}>
                {item.size === 'half' ? 'Metade' : item.size === 'triple' ? 'Código' : 'Inteira'} ×{item.qty}
              </span>
            </>
          ))), items.length, 5)}
        </>
      );
    } else if (kind === 'tarefa') {
      const clevel = rc.classificacao as 'Alta' | 'Média' | 'Baixa' | null;
      tone = clevel === 'Alta' ? 'red' : clevel === 'Média' ? 'amber' : clevel === 'Baixa' ? 'green' : 'blue';
      pills = [{ label: 'Tarefa', tone: 'blue' }];
      if (clevel) pills.push({ label: clevel, tone });
      const typeLabel = rc.task_type === 'revisao' ? 'Revisão de mercadoria' : 'Tarefa';
      const obs: string = rc.observacao || '';
      body = (
        <>
          <Title
            text={obs ? obs.slice(0, 80) + (obs.length > 80 ? '…' : '') : 'Nova tarefa'}
            sub={items.length > 0 ? `${typeLabel} · ${items.length} ite${items.length !== 1 ? 'ns' : 'm'}` : typeLabel}
          />
          {items.length > 0 && itemList(items.slice(0, 4).map((item, idx) => itemRow(idx, idx === 0, (
            <>
              <span className="flex-1 min-w-0 truncate">{item.name || item.ean || 'Item'}</span>
              {item.newPriceEnabled && item.newPrice && <span className="font-mono text-[11px] text-[#D81E1E] shrink-0">→ R$ {item.newPrice}</span>}
            </>
          ))), items.length, 4)}
        </>
      );
    } else if (kind === 'alteracao') {
      const changedFields: string[] = rc.changed_fields || [];
      tone = 'purple';
      pills = [{ label: 'Alteração', tone: 'purple' }];
      approve = { label: 'Sincronizado', icon: <CheckCircle2 size={12} />, cls: cn(AB, 'flex-1 bg-[#7C3AED] border-[#7C3AED] dark:bg-[#8B5CF6] dark:border-[#8B5CF6] text-white hover:brightness-90') };
      body = (
        <>
          <Title text={rc.product_name || 'Produto'} sub={rc.product_sku ? `SKU ${rc.product_sku}` : undefined} mono />
          {changedFields.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {changedFields.map(field => (
                <span key={field} className="text-[9px] font-black uppercase tracking-[0.05em] px-[5px] leading-4 border border-[rgba(124,58,237,0.3)] dark:border-[rgba(167,139,250,0.3)] text-[#7C3AED] dark:text-[#A78BFA]">
                  {FIELD_LABELS[field] ?? field}
                </span>
              ))}
            </div>
          )}
        </>
      );
    } else if (kind === 'rascunho') {
      const checked = checkedItems[request.id];
      const done = checked ? Array.from(checked).filter(i => i < items.length).length : 0;
      tone = 'red';
      pills = [{ label: 'Rascunho', tone: 'red' }];
      editLabel = 'Revisar';
      body = (
        <>
          <Title text={rc.title || 'Rascunho em lote'} sub={`${items.length} produto${items.length !== 1 ? 's' : ''}`} />
          {items.length > 0 && (
            <div className="flex items-center gap-2">
              <span className={cn('w-[90px] h-1.5 border', BORDER, 'bg-black/[0.035] dark:bg-white/[0.03]')}>
                <span className="block h-full bg-[#0A7A55] dark:bg-[#34D399] transition-[width] duration-200" style={{ width: `${(done / items.length) * 100}%` }} />
              </span>
              <span className="text-[11px] font-bold text-on-surface/45">{done}/{items.length} conferidos</span>
            </div>
          )}
          {items.length > 0 && itemList(items.slice(0, 5).map((item, idx) => {
            const on = checked?.has(idx);
            return itemRow(idx, idx === 0, (
              <>
                <span className="flex-1 min-w-0 truncate">{item.name || item.ean || item.sku || <span className="text-on-surface/30 italic">Sem descrição</span>}</span>
                {item.price && <span className="font-mono text-[11px] text-on-surface/45 shrink-0">R$ {item.price}</span>}
                <button
                  onClick={stop(() => toggleCheck(request.id, idx))}
                  title={on ? 'Desmarcar' : 'Marcar como conferido'}
                  className={cn('w-4 h-4 border-[1.5px] flex items-center justify-center shrink-0 transition-colors',
                    on ? 'bg-[#0A7A55] border-[#0A7A55] dark:bg-[#34D399] dark:border-[#34D399] text-white dark:text-[#1A1A0E]' : 'border-on-surface/20 text-transparent hover:border-[#0A7A55] dark:hover:border-[#34D399]')}
                >
                  <Check size={10} strokeWidth={3.5} />
                </button>
              </>
            ));
          }), items.length, 5)}
        </>
      );
    } else {
      const isNew = !!rc.is_new_product;
      tone = 'green';
      pills = [{ label: isNew ? 'Produto novo' : 'Atualização', tone: isNew ? 'green' : 'amber' }];
      if (!isNew) tone = 'amber';
      editLabel = 'Ajustar';
      const entries = Object.entries(rc).filter(([key, value]) => !key.startsWith('is_') && key !== 'image' && value !== '' && value != null);
      body = (
        <>
          <div className="flex gap-2.5 items-center">
            <div className={cn('relative w-[52px] h-[52px] shrink-0 border overflow-hidden', BORDER, 'bg-black/[0.035] dark:bg-white/[0.03]')}>
              <ProductImage src={productData?.image} alt={productData?.name} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[14px] font-black leading-tight tracking-[-0.01em] text-on-surface line-clamp-2">{productData?.name || 'Produto'}</h3>
              <p className="mt-0.5 text-[11px] font-bold text-on-surface/45 truncate">{[productData?.brand, productData?.sku && `SKU ${productData.sku}`].filter(Boolean).join(' · ') || '—'}</p>
            </div>
          </div>
          {entries.length > 0 && (
            <div className={cn('border max-h-[124px] overflow-y-auto', BORDER)}>
              {entries.map(([key, value], i) => (
                <div key={key} className={cn('h-7 flex items-center justify-between gap-3 px-2.5', i > 0 && cn('border-t', BORDER))}>
                  <span className="text-[9px] font-black uppercase tracking-[0.1em] text-on-surface/45 shrink-0">{FIELD_LABELS[key] ?? key}</span>
                  <span className={cn('text-[11.5px] font-semibold truncate', isNew ? 'text-[#0A7A55] dark:text-[#34D399]' : 'text-[#92400E] dark:text-[#FCD34D]')}>{String(value)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      );
    }

    return (
      <motion.div
        layout
        key={request.id}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        onClick={() => selectionMode && toggleSelect(request.id)}
        className={cn(
          'group relative flex flex-col border transition-colors', SURFACE, ACCENT[tone],
          selected ? 'border-primary outline outline-1 outline-primary' : cn(BORDER, 'hover:border-[#CFC4A2] dark:hover:border-white/20'),
          selectionMode && 'cursor-pointer',
        )}
      >
        <div className="flex items-center gap-1.5 px-3 pt-[11px]">
          {pills.map(p => (
            <span key={p.label} className={cn(PILL, TONE[p.tone])}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />{p.label}
            </span>
          ))}
          {openedAt && <span className="ml-auto font-mono text-[11px] text-on-surface/30">{openedAt}</span>}
          {selectionMode && (
            <span className={cn('w-4 h-4 border-[1.5px] flex items-center justify-center shrink-0 transition-colors', !openedAt && 'ml-auto',
              selected ? 'bg-primary border-primary text-white' : 'border-on-surface/20 text-transparent')}>
              <Check size={10} strokeWidth={3.5} />
            </span>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-2 px-3 pt-2 pb-3">{body}</div>

        <div className={cn('flex gap-1 px-2.5 py-2 border-t', BORDER, SUB)}>
          <button onClick={stop(() => onEditRequest(request))} className={AB_GHOST}>{editLabel}</button>
          <button
            onClick={stop(() => kind === 'impressao' ? onEditRequest(request) : onApproveRequest(request.id))}
            className={approve.cls}
          >
            {approve.icon}{approve.label}
          </button>
          <button onClick={stop(() => onDeleteRequest(request.id))} title="Excluir" className={AB_DEL}>
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Abas — Desktop: penduradas direto no cabeçalho do site (o título já fica nele).
          -ml-7/-mt-5 desfazem o padding do conteúdo pra colar na barra e no menu lateral. */}
      <div className="hidden md:block sticky top-11 z-20 -ml-7 -mt-5 w-max max-w-[calc(100%+1.75rem)]">
        <div className="flex overflow-x-auto [scrollbar-width:none]">
          {TABS.map((tab, i) => {
            const active = activeView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className={cn(
                  'min-w-[112px] h-8 px-3.5 flex items-center justify-center gap-1.5 shrink-0',
                  'bg-[#FBF35E] dark:bg-[#252520] border border-t-0 border-[#D9CF45] dark:border-white/[0.08]',
                  i === 0 ? 'border-l-0' : '-ml-px',
                  'text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#1A1A0E] dark:text-[#F2F0E3]',
                  active
                    ? 'shadow-[inset_0_6px_8px_-5px_rgba(26,26,10,0.35),inset_0_-3px_0_#D81E1E] dark:shadow-[inset_0_6px_8px_-5px_rgba(0,0,0,0.55),inset_0_-3px_0_#D81E1E]'
                    : 'shadow-[inset_0_6px_8px_-5px_rgba(26,26,10,0.35)] dark:shadow-[inset_0_6px_8px_-5px_rgba(0,0,0,0.55)]',
                  'transition-transform duration-150 active:scale-[0.97]',
                )}
              >
                <span className={cn('truncate transition-opacity', active ? 'opacity-100' : 'opacity-55 hover:opacity-85')}>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={cn('text-[9px] font-black px-1.5 py-px rounded-full shrink-0',
                    tab.alert ? 'bg-[rgba(216,30,30,0.18)] text-[#D81E1E]' : 'bg-[rgba(26,26,10,0.12)] dark:bg-white/10')}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Header — Mobile: título solto + pills, mesmo padrão da página Inventory */}
      <div className="md:hidden mb-4">
        <h1 className="text-[32px] font-black text-on-surface tracking-tight leading-tight">Requisições</h1>
        <div className="flex items-center gap-2 mt-3">
          {TABS.map(tab => {
            const active = activeView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className={cn(
                  'px-[18px] py-[9px] rounded-full text-[11px] font-extrabold uppercase tracking-wide border transition-colors active:scale-[0.97]',
                  active
                    ? 'bg-[#1A1A0E] text-[#FFE500] border-transparent dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                    : 'bg-on-surface/[0.055] text-on-surface/55 border-on-surface/[0.08] hover:text-on-surface'
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeView === 'analise' ? (
        <div className="space-y-2.5">
          {/* Barra de ferramentas */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('h-7 flex items-center gap-1.5 px-2.5 border text-[11px] font-bold text-on-surface/45 whitespace-nowrap', BORDER)}>
              <b className="font-black text-on-surface">{lowStockProducts.length}</b> {lowStockProducts.length === 1 ? 'produto em alerta' : 'produtos em alerta'}
            </span>
            <div className={cn('flex border', BORDER, SURFACE)}>
              {([['produto', 'Por produto'], ['fornecedor', 'Por fornecedor']] as const).map(([k, l], i) => (
                <button
                  key={k}
                  onClick={() => setAnalysisGrouping(k)}
                  className={cn(
                    'h-[26px] px-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.05em] whitespace-nowrap transition-colors',
                    i > 0 && cn('border-l', BORDER),
                    analysisGrouping === k ? 'bg-primary text-white' : 'text-on-surface/45 hover:text-on-surface',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            <span className="ml-auto text-[10.5px] font-semibold text-on-surface/30">Base: últimas 300 notas de entrada aprovadas</span>
          </div>

          {noMinStockCount > 0 && (
            <div className={cn('flex items-center gap-2 px-3 py-2 border text-xs font-semibold text-on-surface/45', BORDER, SURFACE)}>
              <Info size={14} className="shrink-0 text-on-surface/30" />
              <span>
                <b className="text-on-surface">{noMinStockCount} produto{noMinStockCount !== 1 ? 's' : ''}</b> sem Estoque Mínimo definido {noMinStockCount !== 1 ? 'não entram' : 'não entra'} nos alertas — defina em Editar Produto.
              </span>
            </div>
          )}

          {lowStockProducts.length === 0 ? (
            <EmptyState icon={<BarChart3 size={30} />} title="Estoque dentro do esperado" text="Nenhum produto com Estoque Mínimo definido está abaixo do limite ou perto dele." />
          ) : (
            <>
              {/* Resumo */}
              <div className={cn('grid grid-cols-2 sm:grid-cols-4 gap-px border bg-[#E0D8BF] dark:bg-white/[0.10]', BORDER)}>
                {([
                  ['Crítico', stockStatusProducts.critical.length, 'bg-[#D81E1E]', 'text-[#D81E1E]'],
                  ['Atenção', stockStatusProducts.attention.length, 'bg-[#F59E0B]', 'text-[#92400E] dark:text-[#FCD34D]'],
                  ['Fornecedores', supplierGroups.groups.length, '', 'text-on-surface'],
                  ['Sem fornecedor', supplierGroups.uncovered.length, '', 'text-on-surface/45'],
                ] as const).map(([l, v, dot, color]) => (
                  <div key={l} className={cn('px-3 py-2', SURFACE)}>
                    <div className="flex items-center gap-1.5 text-[8.5px] font-black uppercase tracking-[0.1em] text-on-surface/45">
                      {dot && <span className={cn('w-[7px] h-[7px]', dot)} />}{l}
                    </div>
                    <div className={cn('text-[20px] font-black tracking-[-0.02em] mt-0.5', color)}>{v}</div>
                  </div>
                ))}
              </div>

              {analysisGrouping === 'produto' ? (
                ([
                  { tier: 'critical' as const, list: stockStatusProducts.critical, title: 'Crítico — comprar agora' },
                  { tier: 'attention' as const, list: stockStatusProducts.attention, title: 'Atenção — perto do mínimo' },
                ]).map(section => section.list.length === 0 ? null : (
                  <div key={section.tier}>
                    <div className={cn('h-[30px] flex items-center gap-2 px-2.5 border border-b-0 text-[10px] font-black uppercase tracking-[0.1em]', BORDER, SURFACE,
                      section.tier === 'critical' ? 'text-[#D81E1E]' : 'text-[#92400E] dark:text-[#FCD34D]')}>
                      <span className={cn('w-2 h-2', section.tier === 'critical' ? 'bg-[#D81E1E]' : 'bg-[#F59E0B]')} />
                      {section.title}
                      <span className="text-on-surface/45">({section.list.length})</span>
                    </div>
                    <div className={cn('border overflow-x-auto', BORDER, SURFACE)}>
                      <table className={cn(TABLE, 'min-w-[900px] [&_td]:h-[38px]')}>
                        <colgroup><col /><col style={{ width: 110 }} /><col style={{ width: 200 }} /><col style={{ width: 150 }} /><col style={{ width: 150 }} /></colgroup>
                        <thead>
                          <tr>
                            {([['Produto', ''], ['SKU', ''], ['Estoque / Mínimo', ''], ['Melhor preço', 'text-right'], ['Situação', '']] as const).map(([l, c], i, arr) => (
                              <th key={l} className={cn(TH, c, i === arr.length - 1 ? TH_LAST : TH_LINE)}>{l}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section.list.map((p, idx) => {
                            const count = p.count || 0;
                            const deficit = (p.min_stock || 0) - count;
                            const isExpanded = expandedProductId === p.id;
                            const breakdown = breakdownByProduct.get(p.id) ?? [];
                            const best = bestKeys(breakdown);
                            return (
                              <Fragment key={p.id}>
                                <tr onClick={() => setExpandedProductId(isExpanded ? null : p.id)} className={cn(ROW(idx), 'cursor-pointer')}>
                                  <td>
                                    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                                      <ChevronRight size={12} strokeWidth={2.5} className={cn('shrink-0 text-on-surface/45 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]', isExpanded && 'rotate-90')} />
                                      <span className="font-extrabold text-on-surface truncate">{p.name}</span>
                                    </span>
                                  </td>
                                  <td className="font-mono text-[11.5px] text-on-surface/70">{p.sku || '—'}</td>
                                  <td><StockLevel count={count} min={p.min_stock} tone={section.tier === 'critical' ? 'red' : 'amber'} /></td>
                                  <td className="text-right font-mono text-on-surface">{best.minPrice != null ? fmtBRL(best.minPrice) : <span className="text-on-surface/20">—</span>}</td>
                                  <td>
                                    <span className={cn(PILL, section.tier === 'critical' ? TONE.red : TONE.amber)}>
                                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                      {section.tier === 'critical' ? (deficit > 0 ? `Faltam ${deficit}` : 'No limite') : 'Perto do mínimo'}
                                    </span>
                                  </td>
                                </tr>
                                {isExpanded && (breakdown.length === 0 ? (
                                  <tr className={CHILD}>
                                    <td colSpan={5} className="!pl-[34px]">Nenhuma nota de entrada aprovada encontrada com este produto ainda.</td>
                                  </tr>
                                ) : breakdown.map(s => (
                                  <tr key={s.supplierKey} className={CHILD}>
                                    <td className="!pl-[34px] font-semibold text-on-surface">
                                      {s.supplierName}
                                      <SupplierTags isBestPrice={best.price.has(s.supplierKey)} isBestLead={best.lead.has(s.supplierKey)} />
                                    </td>
                                    <td>{s.noteCount} nota{s.noteCount !== 1 ? 's' : ''}</td>
                                    <td>{s.qtyTotal} un compradas</td>
                                    <td className="text-right font-mono text-on-surface">{s.lastPrice ? fmtBRL(s.lastPrice) : '—'}</td>
                                    <td>{s.avgLeadTime != null ? `~${s.avgLeadTime}d de prazo (${s.leadTimeSampleSize} nota${s.leadTimeSampleSize !== 1 ? 's' : ''})` : 'sem prazo registrado'}</td>
                                  </tr>
                                )))}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              ) : (
                <div className={cn('border overflow-x-auto', BORDER, SURFACE)}>
                  <table className={cn(TABLE, 'min-w-[900px] [&_td]:h-[38px]')}>
                    <colgroup><col /><col style={{ width: 190 }} /><col style={{ width: 160 }} /><col style={{ width: 150 }} /></colgroup>
                    <thead>
                      <tr>
                        {([['Fornecedor', ''], ['Prazo médio', ''], ['Estoque / Mínimo', ''], ['Último preço', 'text-right']] as const).map(([l, c], i, arr) => (
                          <th key={l} className={cn(TH, c, i === arr.length - 1 ? TH_LAST : TH_LINE)}>{l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...supplierGroups.groups.map(g => ({ key: g.supplierKey, name: g.supplierName, rows: g.products.map(({ product, stat }) => ({ product, stat: stat as SupplierStat | null })) })),
                        ...(supplierGroups.uncovered.length > 0
                          ? [{ key: '__sem_fornecedor__', name: 'Sem fornecedor conhecido', rows: supplierGroups.uncovered.map(product => ({ product, stat: null as SupplierStat | null })) }]
                          : []),
                      ].map((g, idx) => {
                        const isExpanded = expandedSupplierKey === g.key;
                        const unknown = g.key === '__sem_fornecedor__';
                        return (
                          <Fragment key={g.key}>
                            <tr onClick={() => setExpandedSupplierKey(isExpanded ? null : g.key)} className={cn(ROW(idx), 'cursor-pointer')}>
                              <td>
                                <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                                  <ChevronRight size={12} strokeWidth={2.5} className={cn('shrink-0 text-on-surface/45 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]', isExpanded && 'rotate-90')} />
                                  <span className={cn('font-extrabold truncate', unknown ? 'text-on-surface/45' : 'text-on-surface')}>{g.name}</span>
                                </span>
                              </td>
                              <td colSpan={3}>
                                <b className="text-on-surface">{g.rows.length}</b>
                                <span className="text-on-surface/45"> produto{g.rows.length !== 1 ? 's' : ''} em falta/atenção</span>
                              </td>
                            </tr>
                            {isExpanded && g.rows.map(({ product, stat }) => (
                              <tr key={product.id} className={CHILD}>
                                <td className="!pl-[34px] font-semibold text-on-surface">{product.name}</td>
                                <td>{stat ? (stat.avgLeadTime != null ? `~${stat.avgLeadTime}d de prazo` : 'sem prazo registrado') : '—'}</td>
                                <td className="font-mono">{product.count || 0} / {product.min_stock}</td>
                                <td className="text-right font-mono text-on-surface">{stat?.lastPrice ? fmtBRL(stat.lastPrice) : '—'}</td>
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className={cn('px-2.5 py-1.5 border-t text-[10.5px] font-semibold text-on-surface/30', BORDER)}>
                    Fornecedores cadastrados em duplicidade podem aparecer separados.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {/* Barra de ferramentas — mesmo padrão das abas Notas/Distribuição */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('h-7 flex items-center gap-1.5 px-2.5 border text-[11px] font-bold text-on-surface/45 whitespace-nowrap', BORDER)}>
              <b className="font-black text-on-surface">{visibleRequests.length}</b> {visibleRequests.length === 1 ? 'pendente' : 'pendentes'}
            </span>

            <div className="relative group">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface/30 group-focus-within:text-primary transition-colors pointer-events-none" />
              <input
                type="text"
                value={filterQuery}
                onChange={e => setFilterQuery(e.target.value)}
                placeholder="Buscar por título, produto ou SKU..."
                className={cn('h-7 w-64 border pl-8 pr-7 text-xs font-semibold text-on-surface placeholder:text-on-surface/25 placeholder:font-medium caret-[#D81E1E] outline-none hover:border-[#CFC4A2] dark:hover:border-white/[0.20] focus:!border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] transition-[border-color,box-shadow]', BORDER, SURFACE)}
              />
              {filterQuery && (
                <button onClick={() => setFilterQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface/30 hover:text-on-surface transition-colors">
                  <X size={13} />
                </button>
              )}
            </div>

            <div className={cn('flex border overflow-x-auto [scrollbar-width:none] max-w-full', BORDER, SURFACE)}>
              {([
                ['todas', 'Todas'], ['rascunho', 'Rascunhos'], ['tarefa', 'Tarefas'], ['alteracao', 'Alterações'], ['impressao', 'Impressão'], ['produto', 'Produtos'],
              ] as const).filter(([k]) => k === 'todas' || kindCounts[k] > 0 || kindFilter === k).map(([k, l], i) => {
                const on = kindFilter === k;
                return (
                  <button
                    key={k}
                    onClick={() => setKindFilter(k)}
                    className={cn(
                      'h-[26px] flex items-center gap-1.5 px-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.05em] whitespace-nowrap transition-colors shrink-0',
                      i > 0 && cn('border-l', BORDER),
                      on ? 'bg-primary text-white' : 'text-on-surface/45 hover:text-on-surface',
                    )}
                  >
                    {l}
                    <span className={cn('text-[9px] font-black px-[5px] leading-[15px] rounded-full tracking-normal',
                      on ? 'bg-white/25' : 'bg-black/[0.10] dark:bg-white/10')}>
                      {kindCounts[k]}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={toggleSelectionMode}
                className={cn(
                  'h-7 flex items-center gap-1.5 px-2.5 border text-[10.5px] font-extrabold uppercase tracking-[0.05em] transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.97]',
                  selectionMode
                    ? 'bg-on-surface text-surface border-on-surface'
                    : cn(BORDER, SURFACE, 'text-on-surface/45 hover:text-on-surface hover:border-[#CFC4A2] dark:hover:border-white/20'),
                )}
              >
                {selectionMode ? <X size={13} /> : <CheckSquare size={13} />}
                {selectionMode ? 'Cancelar' : 'Selecionar'}
              </button>
              <button
                onClick={onAddRequest}
                className="h-7 flex items-center gap-1.5 px-3 bg-primary text-white text-[10.5px] font-extrabold uppercase tracking-[0.05em] hover:bg-[#B91818] active:scale-[0.97] transition-[background-color,transform] duration-150"
              >
                <Plus size={13} strokeWidth={3} />
                Nova requisição
              </button>
            </div>
          </div>

          {selectionMode && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className="flex items-center flex-wrap gap-2.5 min-h-[38px] py-1 pl-2.5 pr-1.5 border border-[rgba(216,30,30,0.3)] bg-[rgba(216,30,30,0.06)] dark:border-[rgba(216,30,30,0.4)] dark:bg-[rgba(216,30,30,0.10)]"
            >
              <button onClick={toggleSelectAll} className="flex items-center gap-2 group">
                <span className={cn(
                  'w-4 h-4 border-[1.5px] flex items-center justify-center transition-colors shrink-0',
                  allVisibleSelected ? 'bg-primary border-primary text-white' : 'border-on-surface/25 text-transparent group-hover:border-primary/60'
                )}>
                  <Check size={10} strokeWidth={3.5} />
                </span>
                <span className="text-[11.5px] font-extrabold text-on-surface">
                  Selecionar tudo · <span className="text-primary">{selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}</span>
                </span>
              </button>

              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={handleBulkApprove}
                  disabled={selectedIds.size === 0}
                  className="h-7 flex items-center gap-1.5 px-3 bg-primary text-white text-[10.5px] font-extrabold uppercase tracking-[0.05em] hover:bg-[#B91818] active:scale-[0.97] transition-[background-color,transform] duration-150 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <CheckCircle2 size={13} />
                  Aprovar / Sincronizar
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={selectedIds.size === 0}
                  className={cn('h-7 flex items-center gap-1.5 px-3 border border-[rgba(216,30,30,0.3)] text-[#D81E1E] text-[10.5px] font-extrabold uppercase tracking-[0.05em] hover:bg-[#D81E1E] hover:text-white active:scale-[0.97] transition-[background-color,color,transform] duration-150 disabled:opacity-30 disabled:pointer-events-none', SURFACE)}
                >
                  <Trash2 size={13} />
                  Excluir
                </button>
              </div>
            </motion.div>
          )}

          {visibleRequests.length === 0 ? (
            pendingRequests.length === 0
              ? <EmptyState icon={<ArrowLeftRight size={30} />} title="Nada pendente" text="Nenhuma requisição aguardando aprovação." />
              : <EmptyState icon={<Search size={28} />} title="Nenhuma requisição encontrada" text="Ajuste a busca ou o filtro de tipo." />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2.5">
              {visibleRequests.map(renderCard)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Title({ text, sub, mono }: { text: string; sub?: string; mono?: boolean }) {
  return (
    <div>
      <h3 className="text-[14px] font-black leading-tight tracking-[-0.01em] text-on-surface line-clamp-2">{text}</h3>
      {sub && <p className={cn('mt-0.5 text-[11px] font-bold text-on-surface/45', mono && 'font-mono font-medium')}>{sub}</p>}
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="bg-white dark:bg-[#1E1E18] p-10 border border-[#E0D8BF] dark:border-white/[0.10] flex items-center gap-8">
      <div className="w-16 h-16 bg-on-surface/5 text-on-surface/20 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <h4 className="text-lg font-black text-on-surface leading-tight uppercase tracking-[0.1em]">{title}</h4>
        <p className="text-sm text-on-surface/40 font-medium mt-1 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

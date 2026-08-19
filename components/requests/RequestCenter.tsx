'use client';

import {
  Plus,
  X,
  Edit2,
  Check,
  Trash2,
  ArrowLeftRight,
  Package,
  Clock,
  CheckCircle2,
  ImageOff,
  Search,
  ClipboardList,
  FilePenLine,
  CheckSquare,
  AlertTriangle,
  ChevronDown,
  Info,
  BarChart3,
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn, getDirectImageUrl } from '@/lib/utils';
import Image from 'next/image';
import { useState, useMemo } from 'react';

// ── Thermometer SVG icon ────────────────────────────────────────────────────

function ThermometerIcon({ level, className }: { level: 'Alta' | 'Média' | 'Baixa' | null; className?: string }) {
  const fillPct = level === 'Alta' ? 85 : level === 'Média' ? 45 : level === 'Baixa' ? 15 : 20;
  const color = level === 'Alta' ? '#EF4444' : level === 'Média' ? '#F97316' : level === 'Baixa' ? '#22C55E' : 'currentColor';
  const tubeH = 20; // total tube height in svg units
  const filled = (fillPct / 100) * tubeH;
  return (
    <svg viewBox="0 0 24 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Tube outline */}
      <rect x="9" y="2" width="6" height="22" rx="3" stroke={color} strokeWidth="1.5" fill="none" opacity="0.3" />
      {/* Fill */}
      <rect x="10.5" y={2 + tubeH - filled} width="3" height={filled} rx="1.5" fill={color} />
      {/* Bulb */}
      <circle cx="12" cy="31" r="6" fill={color} />
      <circle cx="12" cy="31" r="3.5" fill="white" opacity="0.35" />
      {/* Tick marks */}
      <line x1="15" y1="8"  x2="17" y2="8"  stroke={color} strokeWidth="1" opacity="0.5" />
      <line x1="15" y1="13" x2="17" y2="13" stroke={color} strokeWidth="1" opacity="0.5" />
      <line x1="15" y1="18" x2="17" y2="18" stroke={color} strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

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
// Compartilhada entre a visão "Por Produto" (1 produto) e "Por Fornecedor" (todos de uma vez).
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

// Faixa de "atenção" antes do crítico: 20% acima do mínimo, arredondado pra cima,
// com margem mínima de 1 unidade — evita que mínimos pequenos (1-4 un) fiquem sem faixa.
function attentionThreshold(minStock: number): number {
  return minStock + Math.max(Math.ceil(minStock * 0.2), minStock > 0 ? 1 : 0);
}

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
        <ImageOff size={20} className="text-on-surface/10" />
      )}
    </div>
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

  const supplierBreakdown = useMemo(() => {
    if (!expandedProductId) return [];
    return computeSupplierBreakdown(expandedProductId, reviewNotes);
  }, [expandedProductId, reviewNotes]);

  const bestPriceKeys = useMemo(() => {
    const priced = supplierBreakdown.filter(s => s.lastPrice != null);
    if (priced.length === 0) return new Set<string>();
    const min = Math.min(...priced.map(s => s.lastPrice as number));
    return new Set(priced.filter(s => s.lastPrice === min).map(s => s.supplierKey));
  }, [supplierBreakdown]);

  const bestLeadTimeKeys = useMemo(() => {
    const timed = supplierBreakdown.filter(s => s.avgLeadTime != null);
    if (timed.length === 0) return new Set<string>();
    const min = Math.min(...timed.map(s => s.avgLeadTime as number));
    return new Set(timed.filter(s => s.avgLeadTime === min).map(s => s.supplierKey));
  }, [supplierBreakdown]);

  // Visão "Por Fornecedor" — só calculada quando essa sub-view está ativa (é mais
  // pesada: cruza TODOS os produtos em falta/atenção com o histórico de notas de uma vez).
  const supplierGroups = useMemo(() => {
    if (analysisGrouping !== 'fornecedor' || lowStockProducts.length === 0) return { groups: [], uncovered: [] as any[] };

    const bySupplier = new Map<string, { supplierName: string; products: { product: any; stat: SupplierStat }[] }>();
    const uncovered: any[] = [];

    for (const product of lowStockProducts) {
      const breakdown = computeSupplierBreakdown(product.id, reviewNotes);
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
  }, [analysisGrouping, lowStockProducts, reviewNotes]);

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

  function toggleSelectAll() {
    setSelectedIds(prev =>
      prev.size === pendingRequests.length ? new Set() : new Set(pendingRequests.map(r => r.id))
    );
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

  return (
    <div className="space-y-6">
      {/* Header — Desktop: mesmo padrão "folder tabs" da página Inventory */}
      <div className="relative mb-14 hidden lg:block">
        <div className="bg-[#FFE500] dark:bg-[#252520] border border-[#D4C000] dark:border-white/[0.07] rounded-tl-[20px] rounded-tr-[20px] rounded-br-[20px] px-6 py-5 flex items-center gap-3.5">
          <div className="w-[52px] h-[52px] rounded-[14px] bg-[rgba(26,26,10,0.09)] dark:bg-[rgba(216,30,30,0.13)] flex items-center justify-center text-[#1A1A0E] dark:text-primary shrink-0">
            <ArrowLeftRight size={24} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-[26px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] tracking-tight leading-tight">Requisições</h1>
            <div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[rgba(26,26,10,0.40)] dark:text-white/[0.28]">Protocol Management &amp; Product Revisions</div>
          </div>
        </div>

        <div className="absolute left-0 top-full flex">
          {([
            { id: 'requisicoes' as const, label: 'Requisições' },
            { id: 'analise' as const, label: 'Análise de Produtos' },
          ]).map((tab, i, arr) => {
            const active = activeView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className={cn(
                  'h-[34px] px-6 flex items-center justify-center shrink-0',
                  'bg-[#FFE500] dark:bg-[#252520] border border-t-0 border-[#D4C000] dark:border-white/[0.07]',
                  i === arr.length - 1 && 'rounded-br-[12px]',
                  'text-[12px] font-extrabold uppercase tracking-wide',
                  'shadow-[inset_0_6px_8px_-5px_rgba(26,26,10,0.35)] dark:shadow-[inset_0_6px_8px_-5px_rgba(0,0,0,0.55)]',
                  'transition-[opacity,transform] duration-150 active:scale-[0.97]',
                  active
                    ? 'text-[#1A1A0E] dark:text-[#F2F0E3] opacity-100'
                    : 'text-[#1A1A0E] dark:text-white/75 opacity-55 hover:opacity-85'
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Header — Mobile: título solto + pills, mesmo padrão da página Inventory */}
      <div className="lg:hidden mb-6">
        <h1 className="text-[32px] font-black text-on-surface tracking-tight leading-tight">Requisições</h1>
        <div className="flex items-center gap-2 mt-3">
          {([
            { id: 'requisicoes' as const, label: 'Requisições' },
            { id: 'analise' as const, label: 'Análise de Produtos' },
          ]).map(tab => {
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
        <div className="space-y-4">
          {noMinStockCount > 0 && (
            <div className="flex items-center gap-2.5 text-xs font-bold text-on-surface/50 bg-surface-container-low/30 border border-on-surface/[0.05] rounded-2xl px-4 py-3">
              <Info size={15} className="shrink-0 text-on-surface/30" />
              {noMinStockCount} produto{noMinStockCount !== 1 ? 's' : ''} sem Estoque Mínimo definido — {noMinStockCount !== 1 ? 'não entram' : 'não entra'} nos alertas abaixo. Defina em Editar Produto.
            </div>
          )}

          {lowStockProducts.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-32 text-on-surface/10 bg-surface-container-low/20 rounded-[3rem] border-2 border-dashed border-on-surface/[0.03]"
            >
              <BarChart3 size={56} className="mb-5 opacity-20" />
              <p className="text-base font-black uppercase tracking-[0.25em] text-on-surface/20">Estoque dentro do esperado</p>
              <p className="text-sm font-medium opacity-50 mt-2">Nenhum produto com Estoque Mínimo definido está abaixo do limite ou perto dele.</p>
            </motion.div>
          ) : (
            <>
              {/* Alternância Por Produto x Por Fornecedor */}
              <div className="flex items-center gap-2">
                {([
                  { id: 'produto' as const, label: 'Por Produto' },
                  { id: 'fornecedor' as const, label: 'Por Fornecedor' },
                ]).map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setAnalysisGrouping(opt.id)}
                    className={cn(
                      'px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border',
                      analysisGrouping === opt.id
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface-container-low/30 text-on-surface/50 border-on-surface/[0.06] hover:border-primary/30 hover:text-primary'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {analysisGrouping === 'produto' ? (
                <div className="space-y-5">
                  {([
                    { tier: 'critical' as const, list: stockStatusProducts.critical, title: 'Crítico — comprar agora', accent: 'red' as const },
                    { tier: 'attention' as const, list: stockStatusProducts.attention, title: 'Atenção — se aproximando do mínimo', accent: 'amber' as const },
                  ]).map(section => section.list.length === 0 ? null : (
                    <div key={section.tier} className="space-y-2.5">
                      <p className={cn(
                        'text-[10px] font-black uppercase tracking-widest',
                        section.accent === 'red' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                      )}>
                        {section.title} ({section.list.length})
                      </p>
                      <div className="space-y-3">
                        {section.list.map(p => {
                          const deficit = (p.min_stock || 0) - (p.count || 0);
                          const isExpanded = expandedProductId === p.id;
                          return (
                            <div key={p.id} className="bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-[20px] overflow-hidden">
                              <button
                                onClick={() => setExpandedProductId(isExpanded ? null : p.id)}
                                className="w-full flex items-center gap-4 p-4 text-left"
                              >
                                <div className={cn(
                                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                                  section.accent === 'red' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                )}>
                                  <AlertTriangle size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-black text-on-surface truncate">{p.name}</p>
                                  <p className="text-[10px] font-bold text-on-surface/40 uppercase tracking-widest">
                                    SKU {p.sku || '—'} · Estoque {p.count || 0} un · Mínimo {p.min_stock} un
                                  </p>
                                </div>
                                <span className={cn(
                                  'text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest shrink-0',
                                  section.accent === 'red' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                )}>
                                  {section.tier === 'critical' ? (deficit > 0 ? `Faltam ${deficit}` : 'No limite') : 'Perto do mínimo'}
                                </span>
                                <ChevronDown size={16} className={cn('transition-transform shrink-0 text-on-surface/30', isExpanded && 'rotate-180')} />
                              </button>
                              {isExpanded && (
                                <div className="px-4 pb-4 pt-1 border-t border-[#E0D8BF] dark:border-white/[0.08]">
                                  <p className="text-[10px] font-black text-on-surface/30 uppercase tracking-widest mb-2 mt-2">Fornecedores deste produto</p>
                                  {supplierBreakdown.length === 0 ? (
                                    <p className="text-xs text-on-surface/40">Nenhuma nota de entrada aprovada encontrada com este produto ainda.</p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {supplierBreakdown.map((s) => (
                                        <div key={s.supplierKey} className="flex items-center justify-between gap-3 bg-surface-container-lowest rounded-xl px-3.5 py-2.5 text-xs">
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <p className="font-black text-on-surface truncate">{s.supplierName}</p>
                                              {bestPriceKeys.has(s.supplierKey) && (
                                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 uppercase tracking-widest shrink-0">Melhor preço</span>
                                              )}
                                              {bestLeadTimeKeys.has(s.supplierKey) && (
                                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-400 uppercase tracking-widest shrink-0">Menor prazo</span>
                                              )}
                                            </div>
                                            <p className="text-[10px] text-on-surface/40">{s.noteCount} nota{s.noteCount !== 1 ? 's' : ''} · {s.qtyTotal} un compradas</p>
                                          </div>
                                          <div className="text-right shrink-0">
                                            <p className="font-black text-on-surface">{s.lastPrice ? `R$ ${s.lastPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</p>
                                            <p className="text-[10px] text-on-surface/40">
                                              {s.avgLeadTime != null ? `~${s.avgLeadTime}d de prazo (${s.leadTimeSampleSize} nota${s.leadTimeSampleSize !== 1 ? 's' : ''})` : 'sem prazo registrado'}
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-on-surface/30">Baseado nas últimas 300 notas de entrada aprovadas. Fornecedores cadastrados em duplicidade podem aparecer separados.</p>
                  {supplierGroups.groups.map(group => {
                    const isExpanded = expandedSupplierKey === group.supplierKey;
                    return (
                      <div key={group.supplierKey} className="bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-[20px] overflow-hidden">
                        <button
                          onClick={() => setExpandedSupplierKey(isExpanded ? null : group.supplierKey)}
                          className="w-full flex items-center gap-4 p-4 text-left"
                        >
                          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <BarChart3 size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-on-surface truncate">{group.supplierName}</p>
                            <p className="text-[10px] font-bold text-on-surface/40 uppercase tracking-widest">
                              Cobre {group.products.length} produto{group.products.length !== 1 ? 's' : ''} em falta/atenção
                            </p>
                          </div>
                          <ChevronDown size={16} className={cn('transition-transform shrink-0 text-on-surface/30', isExpanded && 'rotate-180')} />
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-[#E0D8BF] dark:border-white/[0.08] space-y-1.5">
                            {group.products.map(({ product, stat }) => (
                              <div key={product.id} className="flex items-center justify-between gap-3 bg-surface-container-lowest rounded-xl px-3.5 py-2.5 text-xs">
                                <div className="min-w-0">
                                  <p className="font-black text-on-surface truncate">{product.name}</p>
                                  <p className="text-[10px] text-on-surface/40">Estoque {product.count || 0} un · Mínimo {product.min_stock} un</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-black text-on-surface">{stat.lastPrice ? `R$ ${stat.lastPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</p>
                                  <p className="text-[10px] text-on-surface/40">{stat.avgLeadTime != null ? `~${stat.avgLeadTime}d de prazo` : 'sem prazo registrado'}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {supplierGroups.uncovered.length > 0 && (
                    <div className="bg-surface-container-low/30 border border-on-surface/[0.05] rounded-[20px] p-4 space-y-2">
                      <p className="text-[10px] font-black text-on-surface/40 uppercase tracking-widest">
                        Sem fornecedor conhecido ({supplierGroups.uncovered.length})
                      </p>
                      <div className="space-y-1.5">
                        {supplierGroups.uncovered.map(p => (
                          <div key={p.id} className="flex items-center justify-between gap-3 bg-surface-container-lowest rounded-xl px-3.5 py-2.5 text-xs">
                            <p className="font-black text-on-surface truncate">{p.name}</p>
                            <p className="text-[10px] text-on-surface/40 shrink-0">Estoque {p.count || 0} un · Mínimo {p.min_stock} un</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
      <>
      {/* Campo de filtro */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface/30 pointer-events-none" />
          <input
            type="text"
            value={filterQuery}
            onChange={e => setFilterQuery(e.target.value)}
            placeholder="Filtrar requisições..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-on-surface/[0.06] bg-[#FFF6C9] dark:bg-surface-container-low/30 text-sm text-on-surface/70 focus:outline-none focus:border-primary/30 transition-colors placeholder:text-on-surface/30"
          />
        </div>
        <button
          onClick={onAddRequest}
          className="shrink-0 h-full px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 bg-primary text-white shadow-md shadow-primary/20 hover:opacity-90 active:scale-95"
        >
          <Plus size={14} />
          Add Request
        </button>
        <button
          onClick={toggleSelectionMode}
          className={cn(
            'shrink-0 h-full px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 border',
            selectionMode
              ? 'bg-on-surface text-surface-container border-on-surface'
              : 'bg-surface-container-low/30 text-on-surface/60 border-on-surface/[0.06] hover:border-primary/30 hover:text-primary'
          )}
        >
          {selectionMode ? <X size={14} /> : <CheckSquare size={14} />}
          {selectionMode ? 'Cancelar' : 'Selecionar'}
        </button>
      </div>

      {selectionMode && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="flex items-center justify-between flex-wrap gap-3 bg-surface-container-low/40 border border-on-surface/[0.06] rounded-2xl px-5 py-3"
        >
          <button onClick={toggleSelectAll} className="flex items-center gap-2.5 group">
            <div className={cn(
              'w-5 h-5 rounded-md border-[1.5px] flex items-center justify-center transition-all shrink-0',
              pendingRequests.length > 0 && selectedIds.size === pendingRequests.length
                ? 'bg-primary border-primary text-white'
                : 'border-on-surface/25 text-transparent group-hover:border-primary/50'
            )}>
              <Check size={12} />
            </div>
            <span className="text-xs font-black text-on-surface/60 uppercase tracking-widest">
              Selecionar tudo
              {selectedIds.size > 0 && (
                <span className="text-primary ml-1">({selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''})</span>
              )}
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkApprove}
              disabled={selectedIds.size === 0}
              className="h-10 px-4 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-on-surface transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20 disabled:opacity-30 disabled:pointer-events-none"
            >
              <CheckCircle2 size={14} />
              Aprovar / Sincronizar
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={selectedIds.size === 0}
              className="h-10 px-4 bg-red-50 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all border border-red-100/50 flex items-center justify-center gap-2 disabled:opacity-30 disabled:pointer-events-none"
            >
              <Trash2 size={14} />
              Excluir
            </button>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {pendingRequests.map((request) => {
          const requestedChanges = JSON.parse(request.requested_changes);
          const isBulkProducts = requestedChanges.is_bulk_products;
          const isTask = requestedChanges.is_task;
          const isProductAlteration = requestedChanges.is_product_alteration;
          const isNewProduct = requestedChanges.is_new_product && !isBulkProducts && !isTask && !isProductAlteration;
          const productData = isNewProduct ? requestedChanges : request.products;

          // ── Task card ──
          if (isTask) {
            const clevel = requestedChanges.classificacao as 'Alta' | 'Média' | 'Baixa' | null;
            const borderCls = clevel === 'Alta' ? 'border-red-400/40 hover:border-red-400/70'
              : clevel === 'Média' ? 'border-orange-400/40 hover:border-orange-400/70'
              : clevel === 'Baixa' ? 'border-green-400/40 hover:border-green-400/70'
              : 'border-on-surface/[0.04] hover:border-primary/20';
            const iconBg = clevel === 'Alta' ? 'bg-red-500/10 border-red-400/20'
              : clevel === 'Média' ? 'bg-orange-500/10 border-orange-400/20'
              : clevel === 'Baixa' ? 'bg-green-500/10 border-green-400/20'
              : 'bg-primary/10 border-primary/20';
            const taskItems = requestedChanges.items || [];
            const taskTypeLabel = requestedChanges.task_type === 'revisao' ? 'Revisão de mercadoria' : 'Tarefa';
            return (
              <motion.div layout key={request.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                onClick={() => selectionMode && toggleSelect(request.id)}
                className={cn('relative bg-surface-container-lowest rounded-[1.5rem] border shadow-md shadow-on-surface/[0.03] overflow-hidden flex flex-col group transition-all', borderCls,
                  selectionMode && 'cursor-pointer', selectedIds.has(request.id) && 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest')}>
                {selectionMode && (
                  <div className={cn('absolute top-3 right-3 z-10 w-6 h-6 rounded-lg border-[1.5px] flex items-center justify-center shadow-sm transition-all',
                    selectedIds.has(request.id) ? 'bg-primary border-primary text-white' : 'bg-surface-container-lowest border-on-surface/20 text-transparent')}>
                    <Check size={14} />
                  </div>
                )}
                <div className="p-5 flex-1 space-y-3">
                  <div className="flex gap-3 items-start">
                    <div className={cn('w-12 h-12 rounded-xl border shrink-0 flex items-center justify-center p-2', iconBg)}>
                      <ThermometerIcon level={clevel} className="w-full h-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className={cn('text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest',
                          clevel === 'Alta' ? 'bg-red-500/15 text-red-600' :
                          clevel === 'Média' ? 'bg-orange-500/15 text-orange-600' :
                          clevel === 'Baixa' ? 'bg-green-500/15 text-green-700' : 'bg-primary/10 text-primary')}>
                          {clevel || 'Tarefa'}
                        </span>
                        <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest bg-on-surface/5 text-on-surface/40">
                          {taskTypeLabel}
                        </span>
                      </div>
                      <h3 className="text-sm font-black text-on-surface leading-tight">
                        {requestedChanges.observacao?.slice(0, 60) || 'Nova tarefa'}
                        {requestedChanges.observacao?.length > 60 && '...'}
                      </h3>
                      {taskItems.length > 0 && (
                        <p className="text-[9px] font-bold text-on-surface/30 uppercase tracking-widest mt-0.5">
                          {taskItems.length} item{taskItems.length !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  {taskItems.length > 0 && (
                    <div className="bg-surface-container-low/30 px-3 py-2 rounded-xl border border-on-surface/[0.03] max-h-28 overflow-y-auto space-y-1">
                      {taskItems.slice(0, 4).map((item: any, idx: number) => (
                        <p key={idx} className="text-[10px] text-on-surface/60 truncate">
                          {item.name || item.ean || 'Item'}
                          {item.newPriceEnabled && item.newPrice && <span className="text-primary ml-1">→ R${item.newPrice}</span>}
                        </p>
                      ))}
                      {taskItems.length > 4 && <p className="text-[9px] text-on-surface/35 italic">+{taskItems.length - 4} mais...</p>}
                    </div>
                  )}
                </div>
                <div className="px-4 py-3 bg-surface-container-low/20 border-t border-on-surface/[0.03] flex gap-2">
                  <button onClick={() => onEditRequest(request)}
                    className="flex-1 h-9 bg-surface-container-lowest border border-on-surface/10 text-on-surface/70 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-on-surface hover:text-surface-container transition-all flex items-center justify-center gap-1.5 shadow-sm">
                    <Edit2 size={12} /> Ver
                  </button>
                  <button onClick={() => onApproveRequest(request.id)}
                    className="flex-1 h-9 bg-primary text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-on-surface transition-all flex items-center justify-center gap-1.5 shadow-md shadow-primary/20">
                    <CheckCircle2 size={13} /> Aprovar
                  </button>
                  <button onClick={() => onDeleteRequest(request.id)}
                    className="w-9 h-9 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all border border-red-100/50">
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            );
          }

          // ── Product Alteration card ──
          if (isProductAlteration) {
            const changedFields: string[] = requestedChanges.changed_fields || [];
            const FIELD_LABELS: Record<string, string> = {
              name: 'Nome', sku: 'SKU', price: 'Preço', count: 'Estoque',
              location: 'Localização', ean: 'EAN', category: 'Categoria',
              subcategory: 'Subcategoria', brand: 'Marca', status: 'Status',
            };
            return (
              <motion.div layout key={request.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                onClick={() => selectionMode && toggleSelect(request.id)}
                className={cn('relative bg-surface-container-lowest rounded-[1.5rem] border border-purple-400/30 hover:border-purple-400/60 shadow-md shadow-on-surface/[0.03] overflow-hidden flex flex-col group transition-all',
                  selectionMode && 'cursor-pointer', selectedIds.has(request.id) && 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest')}>
                {selectionMode && (
                  <div className={cn('absolute top-3 right-3 z-10 w-6 h-6 rounded-lg border-[1.5px] flex items-center justify-center shadow-sm transition-all',
                    selectedIds.has(request.id) ? 'bg-primary border-primary text-white' : 'bg-surface-container-lowest border-on-surface/20 text-transparent')}>
                    <Check size={14} />
                  </div>
                )}
                <div className="p-5 flex-1 space-y-3">
                  <div className="flex gap-3 items-start">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 shrink-0 flex items-center justify-center">
                      <FilePenLine size={22} className="text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest bg-purple-500/15 text-purple-700 dark:text-purple-300 inline-block mb-1">
                        Produtos alterados
                      </span>
                      <h3 className="text-sm font-black text-on-surface leading-tight truncate">
                        {requestedChanges.product_name || 'Produto'}
                      </h3>
                      {requestedChanges.product_sku && (
                        <p className="text-[9px] font-bold text-on-surface/30 uppercase tracking-widest mt-0.5">
                          {requestedChanges.product_sku}
                        </p>
                      )}
                    </div>
                  </div>
                  {changedFields.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {changedFields.map((field) => (
                        <span key={field}
                          className="text-[8px] font-black px-2 py-0.5 rounded-full border border-purple-400/40 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 uppercase tracking-widest">
                          {FIELD_LABELS[field] ?? field}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="px-4 py-3 bg-surface-container-low/20 border-t border-on-surface/[0.03] flex gap-2">
                  <button onClick={() => onEditRequest(request)}
                    className="flex-1 h-9 bg-surface-container-lowest border border-on-surface/10 text-on-surface/70 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-on-surface hover:text-surface-container transition-all flex items-center justify-center gap-1.5 shadow-sm">
                    <Edit2 size={12} /> Ver
                  </button>
                  <button onClick={() => onApproveRequest(request.id)}
                    className="flex-1 h-9 bg-purple-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-on-surface transition-all flex items-center justify-center gap-1.5 shadow-md shadow-purple-600/20">
                    <CheckCircle2 size={13} /> Sincronizado
                  </button>
                  <button onClick={() => onDeleteRequest(request.id)}
                    className="w-9 h-9 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all border border-red-100/50">
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            );
          }

          if (isBulkProducts) {
            const items = requestedChanges.items || [];
            return (
              <motion.div
                layout
                key={request.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => selectionMode && toggleSelect(request.id)}
                className={cn('relative bg-surface-container-lowest rounded-[1.5rem] border border-on-surface/[0.04] shadow-md shadow-on-surface/[0.03] overflow-hidden flex flex-col group hover:border-primary/20 transition-all',
                  selectionMode && 'cursor-pointer', selectedIds.has(request.id) && 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest')}
              >
                {selectionMode && (
                  <div className={cn('absolute top-3 right-3 z-10 w-6 h-6 rounded-lg border-[1.5px] flex items-center justify-center shadow-sm transition-all',
                    selectedIds.has(request.id) ? 'bg-primary border-primary text-white' : 'bg-surface-container-lowest border-on-surface/20 text-transparent')}>
                    <Check size={14} />
                  </div>
                )}
                <div className="p-5 flex-1 space-y-3">
                  <div className="flex gap-3 items-center">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 shrink-0 group-hover:scale-105 transition-transform duration-300 flex items-center justify-center">
                      <Package size={24} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest bg-primary text-white inline-block mb-1">
                        Bulk Draft
                      </span>
                      <h3 className="text-sm font-black text-on-surface truncate leading-tight group-hover:text-primary transition-colors">
                        {requestedChanges.title || 'Rascunho em Bulk'}
                      </h3>
                      <p className="text-[9px] font-bold text-on-surface/30 uppercase tracking-widest">
                        {items.length} produto{items.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-[8px] font-black text-primary/40 uppercase tracking-widest bg-primary/5 px-2 py-1 rounded-full shrink-0">
                      <Clock size={10} />
                      Pending
                    </div>
                  </div>

                  <div className="space-y-1 bg-surface-container-low/30 px-3 py-2 rounded-xl border border-on-surface/[0.03] max-h-36 overflow-y-auto">
                    {items.slice(0, 5).map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 text-[11px] py-0.5">
                        <div className="flex-1 min-w-0 truncate">
                          <span className="font-bold text-on-surface/80">
                            {item.name || item.ean || item.sku || <span className="text-on-surface/30 italic">Sem descrição</span>}
                          </span>
                          {item.price && <span className="text-emerald-600 dark:text-emerald-400 ml-1">R${item.price}</span>}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleCheck(request.id, idx); }}
                          className={cn(
                            'w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all',
                            checkedItems[request.id]?.has(idx)
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-on-surface/25 text-transparent hover:border-emerald-400'
                          )}
                        >
                          <Check size={8} />
                        </button>
                      </div>
                    ))}
                    {items.length > 5 && (
                      <p className="text-[9px] text-on-surface/35 italic pt-1 border-t border-on-surface/[0.04]">
                        +{items.length - 5} mais...
                      </p>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3 bg-surface-container-low/20 border-t border-on-surface/[0.03] flex gap-2">
                  <button
                    onClick={() => onEditRequest(request)}
                    className="flex-1 h-9 bg-surface-container-lowest border border-on-surface/10 text-on-surface/70 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-on-surface hover:text-surface-container transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Edit2 size={12} />
                    Review
                  </button>
                  <button
                    onClick={() => onApproveRequest(request.id)}
                    className="flex-1 h-9 bg-primary text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-on-surface transition-all flex items-center justify-center gap-1.5 shadow-md shadow-primary/20"
                  >
                    <CheckCircle2 size={13} />
                    Approve
                  </button>
                  <button
                    onClick={() => onDeleteRequest(request.id)}
                    className="w-9 h-9 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all border border-red-100/50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            );
          }

          return (
            <motion.div
              layout
              key={request.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => selectionMode && toggleSelect(request.id)}
              className={cn('relative bg-surface-container-lowest rounded-[2.5rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] overflow-hidden flex flex-col group hover:border-primary/20 transition-all',
                selectionMode && 'cursor-pointer', selectedIds.has(request.id) && 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest')}
            >
              {selectionMode && (
                <div className={cn('absolute top-4 right-4 z-10 w-7 h-7 rounded-lg border-[1.5px] flex items-center justify-center shadow-sm transition-all',
                  selectedIds.has(request.id) ? 'bg-primary border-primary text-white' : 'bg-surface-container-lowest border-on-surface/20 text-transparent')}>
                  <Check size={16} />
                </div>
              )}
              <div className="p-8 flex-1 space-y-6">
                <div className="flex gap-6">
                  <div className="w-24 h-24 rounded-3xl bg-surface-container-low/50 border border-on-surface/[0.02] overflow-hidden shrink-0 group-hover:scale-105 transition-transform duration-500">
                    <ProductImage src={productData?.image} alt={productData?.name} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn(
                        "text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest",
                        isNewProduct ? "bg-primary text-white" : "bg-on-surface/5 text-on-surface/40"
                      )}>
                        {isNewProduct ? "Genesis" : (productData?.sku || 'Update')}
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-on-surface truncate leading-tight mb-1 group-hover:text-primary transition-colors">
                      {productData?.name}
                    </h3>
                    <p className="text-[10px] font-black text-on-surface/20 uppercase tracking-[0.2em]">
                      {productData?.brand || 'Global Entity'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t border-on-surface/[0.03]">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-on-surface/30 uppercase tracking-widest">
                      {isNewProduct ? "Attribute Set:" : "Delta Sequence:"}
                    </p>
                    <div className="flex items-center gap-2 text-[9px] font-black text-primary/40 uppercase tracking-widest bg-primary/5 px-3 py-1 rounded-full">
                       <Clock size={12} />
                       Pending Sync
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 bg-surface-container-low/30 p-4 rounded-2xl border border-on-surface/[0.02]">
                    {Object.entries(requestedChanges)
                      .filter(([key]) => key !== 'is_new_product')
                      .map(([key, value]: [string, any]) => (
                      <div key={key} className="flex items-center justify-between text-xs group/item">
                        <span className="text-on-surface/40 font-bold uppercase tracking-widest text-[9px]">{key}:</span>
                        <span className={cn(
                          "font-black tracking-tight",
                          isNewProduct ? "text-primary" : "text-amber-600"
                        )}>{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-8 py-6 bg-surface-container-low/20 border-t border-on-surface/[0.03] flex gap-3">
                <button 
                  onClick={() => onEditRequest(request)}
                  className="flex-1 h-12 bg-surface-container-lowest border border-on-surface/10 text-on-surface/70 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-on-surface hover:text-surface-container transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <Edit2 size={14} />
                  Refine
                </button>
                <button 
                  onClick={() => onApproveRequest(request.id)}
                  className="flex-1 h-12 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-on-surface transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                >
                  <CheckCircle2 size={16} />
                  Authorize
                </button>
                <button 
                  onClick={() => onDeleteRequest(request.id)}
                  className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all border border-red-100/50 shadow-sm"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {pendingRequests.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-40 text-on-surface/10 bg-surface-container-low/20 rounded-[3rem] border-2 border-dashed border-on-surface/[0.03]"
        >
          <ArrowLeftRight size={64} className="mb-6 opacity-20" />
          <p className="text-lg font-black uppercase tracking-[0.3em] text-on-surface/20">Protocol Clearance</p>
          <p className="text-sm font-medium opacity-50 mt-2">No pending revision requests in the system.</p>
        </motion.div>
      )}
      </>
      )}
    </div>
  );
}

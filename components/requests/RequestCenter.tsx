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

interface RequestCenterProps {
  requests: any[];
  onAddRequest: () => void;
  onEditRequest: (request: any) => void;
  onApproveRequest: (requestId: string) => void;
  onDeleteRequest: (requestId: string) => void;
  onToggleCheck?: (requestId: string, checkedIndices: number[]) => void;
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
}: RequestCenterProps) {
  const pendingRequests = useMemo(() => requests.filter(r => r.status === 'pending'), [requests]);

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-[1.5rem] bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/20">
            <ArrowLeftRight size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-on-surface tracking-tight">Requisições</h1>
            <p className="text-sm text-on-surface/40 font-medium uppercase tracking-[0.1em]">Protocol Management & Product Revisions</p>
          </div>
        </div>
        <button
          onClick={onAddRequest}
          className="bg-primary text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-on-surface transition-all flex items-center gap-3 shadow-xl shadow-primary/20 uppercase tracking-[0.2em] group active:scale-95"
        >
          <Plus size={20} className="group-hover:rotate-90 transition-transform" />
          Add Request
        </button>
      </div>

      {/* Campo de filtro */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface/30 pointer-events-none" />
        <input
          type="text"
          value={filterQuery}
          onChange={e => setFilterQuery(e.target.value)}
          placeholder="Filtrar requisições..."
          className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-on-surface/[0.06] bg-surface-container-low/30 text-sm text-on-surface/70 focus:outline-none focus:border-primary/30 transition-colors placeholder:text-on-surface/30"
        />
      </div>

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
                className={cn('bg-surface-container-lowest rounded-[1.5rem] border shadow-md shadow-on-surface/[0.03] overflow-hidden flex flex-col group transition-all', borderCls)}>
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
                className="bg-surface-container-lowest rounded-[1.5rem] border border-purple-400/30 hover:border-purple-400/60 shadow-md shadow-on-surface/[0.03] overflow-hidden flex flex-col group transition-all">
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
                className="bg-surface-container-lowest rounded-[1.5rem] border border-on-surface/[0.04] shadow-md shadow-on-surface/[0.03] overflow-hidden flex flex-col group hover:border-primary/20 transition-all"
              >
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
              className="bg-surface-container-lowest rounded-[2.5rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] overflow-hidden flex flex-col group hover:border-primary/20 transition-all"
            >
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
    </div>
  );
}

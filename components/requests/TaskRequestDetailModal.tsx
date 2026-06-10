'use client';

import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, ClipboardList, Thermometer } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskItemDraft } from '@/components/tasks/MobileTaskPage';

interface TaskChanges {
  is_task: true;
  task_type: 'revisao' | 'tarefa_livre';
  responsavel?: string | null;
  classificacao?: 'Alta' | 'Média' | 'Baixa' | '';
  observacao?: string | null;
  items?: TaskItemDraft[];
}

interface Request {
  id: string;
  created_at?: string;
  [key: string]: any;
}

interface Props {
  open: boolean;
  request: Request;
  taskData: TaskChanges;
  onClose: () => void;
  onApprove: (id: string) => void;
  onDelete: (id: string) => void;
}

const PRIORITY_CONFIG = {
  Alta:  { bg: 'bg-red-500/10 dark:bg-red-500/10',  border: 'border-red-500/25 dark:border-red-500/20',  text: 'text-red-600 dark:text-red-400' },
  Média: { bg: 'bg-amber-400/12 dark:bg-amber-400/10', border: 'border-amber-400/30 dark:border-amber-400/20', text: 'text-amber-700 dark:text-[#FCD34D]' },
  Baixa: { bg: 'bg-emerald-600/8 dark:bg-emerald-500/8',  border: 'border-emerald-600/20 dark:border-emerald-500/18', text: 'text-emerald-700 dark:text-emerald-400' },
} as const;

const labelCls = 'text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface/40';

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function TaskRequestDetailModal({ open, request, taskData, onClose, onApprove, onDelete }: Props) {
  const items = taskData.items ?? [];
  const classificacao = taskData.classificacao || '';
  const priority = PRIORITY_CONFIG[classificacao as keyof typeof PRIORITY_CONFIG];
  const typeLabel = taskData.task_type === 'revisao' ? 'Revisão de Mercadoria' : 'Tarefa Livre';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/55 backdrop-blur-[3px] z-[198]"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="fixed inset-0 flex items-center justify-center z-[199] p-5 pointer-events-none"
          >
            <div className="w-full max-w-[460px] rounded-3xl overflow-hidden shadow-2xl pointer-events-auto border border-on-surface/[0.04] dark:border-on-surface/[0.06]">

              {/* ─── HEADER ─── */}
              <div className="bg-[#FFE500] dark:bg-[#252520] border-b border-[#D4C000] dark:border-white/[0.07] px-5 py-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-black/[0.09] dark:bg-[rgba(216,30,30,0.13)] flex items-center justify-center flex-shrink-0">
                  <ClipboardList size={17} className="text-[#1A1A0E] dark:text-[#D81E1E]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center bg-black/[0.09] dark:bg-white/[0.08] rounded-md px-2 py-0.5 mb-1">
                    <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.60)] dark:text-[rgba(242,240,227,0.45)]">
                      {typeLabel}
                    </span>
                  </div>
                  <div className="font-manrope text-base font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">
                    Detalhes da Tarefa
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-black/[0.08] dark:bg-white/[0.06] border border-black/[0.10] dark:border-white/[0.08] flex items-center justify-center flex-shrink-0 text-[rgba(26,26,10,0.45)] dark:text-[rgba(242,240,227,0.35)] hover:bg-red-500/10 hover:text-[#D81E1E] transition-all"
                >
                  <X size={13} strokeWidth={2.5} />
                </button>
              </div>

              {/* ─── BODY ─── */}
              <div className="bg-[#FDFAF0] dark:bg-[#1E1E18] px-5 py-5 flex flex-col gap-4 max-h-[62vh] overflow-y-auto">

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <span className={labelCls}>Responsável</span>
                    <span className="text-[13px] font-semibold text-on-surface">
                      {taskData.responsavel || '—'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={labelCls}>Prioridade</span>
                    {priority ? (
                      <span className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-[11px] font-bold w-fit border',
                        priority.bg, priority.border, priority.text
                      )}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {classificacao}
                      </span>
                    ) : (
                      <span className="text-[13px] text-on-surface/40">—</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={labelCls}>Data</span>
                    <span className="text-[12px] text-on-surface/50">{formatDate(request.created_at)}</span>
                  </div>
                  {taskData.task_type === 'revisao' && (
                    <div className="flex flex-col gap-1">
                      <span className={labelCls}>Itens</span>
                      <span className="text-[13px] font-semibold text-on-surface">
                        {items.length} {items.length === 1 ? 'produto' : 'produtos'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="h-px bg-[#E9DFC2] dark:bg-white/[0.07]" />

                {/* Observação */}
                {taskData.observacao && (
                  <>
                    <div>
                      <div className={cn(labelCls, 'mb-1.5')}>Observação</div>
                      <div className="bg-[#FAF6E6] dark:bg-[#252519] border border-[#E9DFC2] dark:border-white/[0.07] rounded-2xl px-3.5 py-3 text-[13px] text-on-surface/80 leading-relaxed">
                        {taskData.observacao}
                      </div>
                    </div>
                    <div className="h-px bg-[#E9DFC2] dark:bg-white/[0.07]" />
                  </>
                )}

                {/* Lista de itens (somente revisao) */}
                {taskData.task_type === 'revisao' && items.length > 0 && (
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-on-surface/35 mb-2 font-manrope">
                      Produtos ({items.length})
                    </div>
                    <div className="flex flex-col gap-2">
                      {items.map((item, i) => (
                        <div
                          key={i}
                          className="bg-white dark:bg-[#252519] border border-[#E9DFC2] dark:border-white/[0.07] rounded-2xl px-3.5 py-3 flex flex-col gap-1.5"
                        >
                          <div className="font-manrope text-[13px] font-bold text-on-surface leading-snug">
                            {item.name || '—'}
                          </div>
                          <div className="text-[10px] font-medium text-on-surface/38 tracking-wide">
                            {[item.sku && `SKU ${item.sku}`, item.ean && `EAN ${item.ean}`].filter(Boolean).join(' · ')}
                          </div>

                          {/* Preço */}
                          <div className="flex items-center gap-2 mt-0.5">
                            {item.newPriceEnabled && item.newPrice ? (
                              <>
                                <span className="text-[12px] text-on-surface/40 line-through">
                                  {item.price ? `R$ ${item.price}` : '—'}
                                </span>
                                <span className="text-[11px] text-on-surface/25">→</span>
                                <span className="font-manrope text-[13px] font-extrabold text-[#D81E1E]">
                                  R$ {item.newPrice}
                                </span>
                              </>
                            ) : (
                              <span className="text-[13px] font-semibold text-on-surface">
                                {item.price ? `R$ ${item.price}` : '—'}
                                <span className="text-[10px] text-on-surface/35 font-normal ml-1.5">(sem alteração)</span>
                              </span>
                            )}
                          </div>

                          {/* Categoria / marca */}
                          {(item.category || item.brand) && (
                            <div className="text-[10px] text-on-surface/35">
                              {[item.category, item.subcategory, item.brand].filter(Boolean).join(' · ')}
                            </div>
                          )}

                          {/* Observação do item */}
                          {item.observacao && (
                            <div className="bg-on-surface/[0.03] rounded-lg px-2.5 py-1.5 text-[11px] text-on-surface/50 italic">
                              {item.observacao}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* ─── FOOTER ─── */}
              <div className="bg-[#FFF7B0] dark:bg-[#252520] border-t border-[#DDD000] dark:border-white/[0.06] px-5 py-3.5 flex gap-2.5 items-center">
                <button
                  onClick={onClose}
                  className="flex-1 h-10 bg-black/[0.08] dark:bg-white/[0.07] border border-black/[0.14] dark:border-white/[0.10] rounded-2xl text-[11px] font-bold uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] dark:text-[rgba(242,240,227,0.50)] hover:bg-black/[0.12] dark:hover:bg-white/[0.11] transition-all active:scale-95"
                >
                  Fechar
                </button>
                <button
                  onClick={() => onApprove(request.id)}
                  className="flex-[1.5] h-10 bg-[#D81E1E] text-white rounded-2xl text-[11px] font-bold uppercase tracking-[0.10em] flex items-center justify-center gap-1.5 shadow-md shadow-[#D81E1E]/30 hover:bg-[#A30E0E] transition-all active:scale-95"
                >
                  <CheckCircle2 size={14} />
                  Aprovar
                </button>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

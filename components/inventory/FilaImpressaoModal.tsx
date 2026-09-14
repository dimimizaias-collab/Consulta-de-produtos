'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Printer, Plus, Minus, ChevronDown, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ELGIN_LABEL_W, ELGIN_LABEL_H,
  PRODUTO_LABEL_SIZE, PRODUTO_HALF_H,
  LabelPreview, ProdutoPreviewFull, ProdutoPreviewHalf,
  IconWholeSquare, IconHalfHorizontal,
  TEMPLATE_LABELS,
  SAMPLE_FULL, SAMPLE_HALF_A, SAMPLE_HALF_B,
  blockWheelChange,
  type LabelTemplate, type LabelSize, type QueueEntry,
} from './LabelPrintModal';

// Fila de Impressão — mesma tela de Seleção/Visualização da Etiquetas, mas em
// vez de imprimir na hora, empacota a fila e manda como uma requisição
// pendente (aparece na Central de Requisições pra quem estiver no computador
// com a impressora abrir e imprimir de fato). Não tem "Informações
// adicionais" da Etiqueta de Produto — esses campos são preenchidos na hora
// da impressão, não no pedido remoto.

export interface PrintQueueItem {
  product_id: string;
  name: string;
  sku: string | null;
  ean: string | null;
  price: number | null;
  qty: number;
  size: LabelSize;
}

export interface PrintQueueSubmission {
  template: LabelTemplate;
  items: PrintQueueItem[];
}

interface Draft {
  qty: number;
  size: LabelSize;
}

type Tab = 'selecao' | 'visualizacao';

interface FilaImpressaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: any[];
  onSubmit: (payload: PrintQueueSubmission) => Promise<void> | void;
}

const emptyDraft = (): Draft => ({ qty: 1, size: 'full' });

export function FilaImpressaoModal({ isOpen, onClose, products, onSubmit }: FilaImpressaoModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('selecao');
  const [template, setTemplate] = useState<LabelTemplate>('gondola');
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [queue, setQueue] = useState<Record<string, QueueEntry>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [submitting, setSubmitting] = useState(false);

  const queueList = useMemo(() => Object.entries(queue), [queue]);
  const totalLabels = useMemo(() => queueList.reduce((acc, [, e]) => acc + e.qty, 0), [queueList]);

  const previewFull = useMemo(() => queueList.find(([, e]) => e.size === 'full')?.[1]?.product ?? SAMPLE_FULL, [queueList]);
  const previewHalfItems = useMemo(() => queueList.filter(([, e]) => e.size === 'half').map(([, e]) => e.product), [queueList]);
  const previewHalfA = previewHalfItems[0] ?? SAMPLE_HALF_A;
  const previewHalfB = previewHalfItems[1] ?? SAMPLE_HALF_B;

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products.filter(p =>
      !queue[p.id] &&
      (p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.ean?.toLowerCase().includes(q))
    );
  }, [products, search, queue]);

  const getDraft = useCallback((id: string) => drafts[id] ?? emptyDraft(), [drafts]);

  // Sem clamp automático aqui — o campo precisa poder ficar vazio (qty 0,
  // tratado como "vazio" na exibição) enquanto o usuário digita um número
  // novo, senão nunca dá pra apagar o "1" sem antes digitar o dígito na
  // frente dele. O mínimo de 1 é garantido no blur e ao confirmar o item.
  const setDraftQty = useCallback((id: string, qty: number) => {
    setDrafts(prev => ({ ...prev, [id]: { ...getDraft(id), qty } }));
  }, [getDraft]);

  const setDraftSize = useCallback((id: string, size: LabelSize) => {
    setDrafts(prev => ({ ...prev, [id]: { ...getDraft(id), size } }));
  }, [getDraft]);

  const confirmAdd = useCallback((product: any) => {
    const draft = getDraft(product.id);
    setQueue(prev => ({ ...prev, [product.id]: { product, qty: Math.max(1, draft.qty), size: draft.size } }));
    setDrafts(prev => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
  }, [getDraft]);

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Edição inline na Visualização — quantidade e modelo de cada item já
  // adicionado à fila, sem precisar voltar pra Seleção. Mesmo raciocínio do
  // setDraftQty: sem clamp automático pra não travar o campo ao apagar.
  const updateQueueQty = useCallback((id: string, qty: number) => {
    setQueue(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], qty } } : prev));
  }, []);

  const updateQueueSize = useCallback((id: string, size: LabelSize) => {
    setQueue(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], size } } : prev));
  }, []);

  const handleClose = () => {
    setActiveTab('selecao');
    setTemplate('gondola');
    setTemplateMenuOpen(false);
    setSearch('');
    setQueue({});
    setDrafts({});
    setSubmitting(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (totalLabels === 0 || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        template,
        items: queueList.map(([, entry]) => ({
          product_id: entry.product.id,
          name: entry.product.name || '—',
          sku: entry.product.sku || null,
          ean: entry.product.ean || null,
          price: entry.product.price ?? null,
          qty: entry.qty,
          size: entry.size,
        })),
      });
      handleClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="relative bg-[#F0E7CC] dark:bg-[#1E1E18] rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-black/10 dark:border-white/[0.08] flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-5 flex items-center gap-3.5 bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] flex-shrink-0">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                <Printer size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-manrope font-extrabold text-[#1A1A0E] leading-tight">Fila de Impressão</h2>
                <p className="text-xs font-bold text-[#1A1A0E]/55 mt-0.5">Pedido remoto — enviado pra quem imprime no computador</p>
              </div>
              <button
                onClick={handleClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] border border-black/10 text-black/50 hover:bg-black/[0.14] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="px-6 pt-3 flex items-center gap-5 bg-[#F0E7CC] dark:bg-[#1E1E18] border-b border-black/10 dark:border-white/[0.08] flex-shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('selecao')}
                className={cn(
                  'px-1 py-2.5 -mb-px text-[11px] font-extrabold uppercase tracking-wide transition-colors border-b-2',
                  activeTab === 'selecao' ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-on-surface'
                )}
              >
                Seleção
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('visualizacao')}
                className={cn(
                  'px-1 py-2.5 -mb-px text-[11px] font-extrabold uppercase tracking-wide transition-colors border-b-2 flex items-center gap-1.5',
                  activeTab === 'visualizacao' ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-on-surface'
                )}
              >
                Visualização
                {totalLabels > 0 && (
                  <span className={cn(
                    'px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none',
                    activeTab === 'visualizacao' ? 'bg-primary/10 text-primary' : 'bg-black/[0.06] dark:bg-white/[0.08] text-secondary/70'
                  )}>
                    {totalLabels}
                  </span>
                )}
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
              {activeTab === 'selecao' && (
                <>
                  {/* Modelo de etiqueta */}
                  <div>
                    <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Modelo de etiqueta</span>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setTemplateMenuOpen(v => !v)}
                        className="w-full h-[46px] px-4 rounded-2xl border-[1.5px] border-black/[0.14] dark:border-white/[0.14] bg-white dark:bg-[#252520] flex items-center justify-between text-[13.5px] font-extrabold text-on-surface transition-colors"
                      >
                        {TEMPLATE_LABELS[template]}
                        <ChevronDown size={16} className={cn('text-secondary/50 transition-transform duration-150', templateMenuOpen && 'rotate-180')} />
                      </button>
                      <AnimatePresence>
                        {templateMenuOpen && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.97, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.97, y: -4 }}
                            transition={{ duration: 0.13 }}
                            className="absolute z-10 mt-1.5 w-full rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#2E2E28] shadow-xl overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => { setTemplate('gondola'); setTemplateMenuOpen(false); }}
                              className="w-full text-left px-4 py-3 text-[13px] font-bold text-on-surface hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                            >
                              {TEMPLATE_LABELS.gondola}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setTemplate('produto'); setTemplateMenuOpen(false); }}
                              className="w-full text-left px-4 py-3 text-[13px] font-bold text-on-surface hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors flex items-center justify-between"
                            >
                              {TEMPLATE_LABELS.produto}
                              <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary">Adesiva 40×40mm</span>
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Busca */}
                  <div>
                    <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Buscar produto</span>
                    <div className="relative">
                      <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary/40 pointer-events-none" />
                      <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por nome, SKU ou EAN…"
                        className="w-full h-[42px] pl-10 pr-4 bg-black/[0.035] dark:bg-white/[0.05] border border-black/[0.10] dark:border-white/[0.10] rounded-2xl text-[13px] font-semibold text-on-surface placeholder:text-secondary/40 outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Resultados */}
                  {search.trim() === '' ? (
                    <p className="text-center text-[12px] font-semibold text-secondary/40 py-2">
                      Busque um produto pra adicionar ao pedido de impressão.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {searchResults.map(product => {
                        const draft = getDraft(product.id);
                        return (
                          <div key={product.id} className="flex items-center gap-3 p-3 rounded-2xl border border-black/[0.10] dark:border-white/[0.08] bg-white dark:bg-[#252520]">
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-bold text-on-surface truncate">{product.name}</p>
                              <p className="text-[10.5px] font-mono text-secondary/45 mt-0.5">
                                {product.ean && `EAN ${product.ean}`}
                                {product.ean && product.sku && ' · '}
                                {product.sku && `SKU ${product.sku}`}
                                {!product.ean && !product.sku && 'Sem código'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="flex bg-black/[0.06] dark:bg-white/[0.07] rounded-lg p-0.5 gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => setDraftSize(product.id, 'full')}
                                  className={cn(
                                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wide transition-all',
                                    draft.size === 'full'
                                      ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                                      : 'text-secondary/50 hover:text-on-surface'
                                  )}
                                >
                                  {template === 'produto' && <IconWholeSquare size={12} />}
                                  Inteira
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDraftSize(product.id, 'half')}
                                  title={template === 'produto' ? 'Meia etiqueta — corte horizontal (40×20mm)' : undefined}
                                  className={cn(
                                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wide transition-all',
                                    draft.size === 'half'
                                      ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                                      : 'text-secondary/50 hover:text-on-surface'
                                  )}
                                >
                                  {template === 'produto' && <IconHalfHorizontal size={12} />}
                                  Metade
                                </button>
                              </div>
                              <input
                                type="number"
                                min={1}
                                value={draft.qty === 0 ? '' : draft.qty}
                                onWheel={blockWheelChange}
                                onChange={e => {
                                  const raw = e.target.value;
                                  if (raw === '') { setDraftQty(product.id, 0); return; }
                                  const val = parseInt(raw);
                                  if (!Number.isNaN(val)) setDraftQty(product.id, val);
                                }}
                                onBlur={() => { if (getDraft(product.id).qty < 1) setDraftQty(product.id, 1); }}
                                className="w-11 h-[34px] border border-black/[0.14] dark:border-white/[0.14] rounded-lg text-center text-[13px] font-extrabold text-on-surface bg-transparent outline-none focus:border-primary/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                type="button"
                                onClick={() => confirmAdd(product)}
                                className="w-[34px] h-[34px] rounded-lg bg-[#1A1A0E] dark:bg-[#FFE500] text-[#FFE500] dark:text-[#1A1A0E] flex items-center justify-center flex-shrink-0 hover:opacity-80 transition-opacity active:scale-95"
                                title="Adicionar ao pedido"
                              >
                                <Plus size={15} strokeWidth={2.5} />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {searchResults.length === 0 && (
                        <p className="text-center text-[12px] font-semibold text-secondary/35 py-4">
                          Nenhum produto encontrado.
                        </p>
                      )}

                      {queueList.length > 0 && (
                        <p className="text-center text-[10.5px] font-semibold text-secondary/35 pt-1">
                          Produtos já adicionados somem daqui — veja e ajuste em &quot;Visualização&quot;
                        </p>
                      )}
                    </div>
                  )}

                  {template === 'produto' && (
                    <p className="text-center text-[10px] font-semibold text-secondary/40 flex items-center justify-center gap-1.5 -mt-2">
                      <IconHalfHorizontal size={11} />
                      Metade corta a etiqueta ao meio na horizontal (duas de 40×20mm)
                    </p>
                  )}

                  {/* Resumo da fila */}
                  {queueList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('visualizacao')}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-[#FFE500]/30 dark:bg-[#FFE500]/10 border border-[#D4C000] dark:border-[#FFE500]/30 transition-colors hover:bg-[#FFE500]/40 dark:hover:bg-[#FFE500]/[0.15]"
                    >
                      <span className="text-[12px] font-extrabold text-on-surface">
                        <b>{queueList.length}</b> produto{queueList.length !== 1 ? 's' : ''} · <b>{totalLabels}</b> etiqueta{totalLabels !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[11px] font-extrabold text-on-surface underline underline-offset-2">Ver na Visualização</span>
                    </button>
                  )}
                </>
              )}

              {activeTab === 'visualizacao' && (
                <>
                  {template === 'gondola' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Prévia — Inteira</span>
                        <LabelPreview variant="full" items={[previewFull]} />
                        <p className="text-center font-mono text-[10.5px] font-bold text-secondary/40 mt-2">{ELGIN_LABEL_W} × {ELGIN_LABEL_H}mm</p>
                      </div>
                      <div>
                        <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Prévia — Metade</span>
                        <LabelPreview variant="half" items={[previewHalfA, previewHalfB]} />
                        <p className="text-center font-mono text-[10.5px] font-bold text-secondary/40 mt-2">2 × {(ELGIN_LABEL_W / 2).toFixed(1)} × {ELGIN_LABEL_H}mm</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Prévia — Inteira</span>
                        <ProdutoPreviewFull product={previewFull} extraFields={[]} />
                        <p className="text-center font-mono text-[10.5px] font-bold text-secondary/40 mt-2">{PRODUTO_LABEL_SIZE} × {PRODUTO_LABEL_SIZE}mm</p>
                      </div>
                      <div>
                        <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Prévia — Metade</span>
                        <ProdutoPreviewHalf items={[previewHalfA, previewHalfB]} />
                        <p className="text-center font-mono text-[10.5px] font-bold text-secondary/40 mt-2">2 × {PRODUTO_LABEL_SIZE} × {PRODUTO_HALF_H}mm</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Produtos no pedido — edite quantidade e modelo</span>
                    {queueList.length === 0 ? (
                      <p className="text-center text-[12px] font-semibold text-secondary/35 py-6">
                        Nenhum produto no pedido ainda — adicione pela aba Seleção.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {queueList.map(([id, entry]) => (
                          <div key={id} className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252520]">
                            <span className="flex-1 min-w-0 text-[12.5px] font-bold text-on-surface truncate">{entry.product.name}</span>

                            <div className="flex bg-black/[0.06] dark:bg-white/[0.07] rounded-lg p-0.5 gap-0.5 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => updateQueueSize(id, 'full')}
                                className={cn(
                                  'px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wide transition-all',
                                  entry.size === 'full'
                                    ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                                    : 'text-secondary/50 hover:text-on-surface'
                                )}
                              >
                                Inteira
                              </button>
                              <button
                                type="button"
                                onClick={() => updateQueueSize(id, 'half')}
                                className={cn(
                                  'px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wide transition-all',
                                  entry.size === 'half'
                                    ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                                    : 'text-secondary/50 hover:text-on-surface'
                                )}
                              >
                                Metade
                              </button>
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => updateQueueQty(id, Math.max(1, entry.qty - 1))}
                                className="w-6 h-6 rounded-md bg-black/[0.06] dark:bg-white/[0.07] text-secondary/60 flex items-center justify-center hover:text-on-surface transition-colors"
                              >
                                <Minus size={11} strokeWidth={2.5} />
                              </button>
                              <input
                                type="number"
                                min={1}
                                value={entry.qty === 0 ? '' : entry.qty}
                                onWheel={blockWheelChange}
                                onChange={e => {
                                  const raw = e.target.value;
                                  if (raw === '') { updateQueueQty(id, 0); return; }
                                  const val = parseInt(raw);
                                  if (!Number.isNaN(val)) updateQueueQty(id, val);
                                }}
                                onBlur={() => { if (entry.qty < 1) updateQueueQty(id, 1); }}
                                className="w-8 h-6 text-center text-[11px] font-extrabold text-on-surface bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                type="button"
                                onClick={() => updateQueueQty(id, entry.qty + 1)}
                                className="w-6 h-6 rounded-md bg-black/[0.06] dark:bg-white/[0.07] text-secondary/60 flex items-center justify-center hover:text-on-surface transition-colors"
                              >
                                <Plus size={11} strokeWidth={2.5} />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeFromQueue(id)}
                              className="w-[26px] h-[26px] rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 hover:bg-primary/20 transition-colors"
                            >
                              <X size={12} strokeWidth={2.5} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-1 flex-shrink-0">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 bg-black/[0.06] dark:bg-white/[0.07] text-secondary font-bold py-3 rounded-2xl hover:bg-black/[0.10] dark:hover:bg-white/[0.11] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={totalLabels === 0 || submitting}
                  className="flex-1 bg-primary text-white font-bold py-3 rounded-2xl hover:opacity-90 transition-colors shadow-lg shadow-primary/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Send size={15} />
                  {submitting ? 'Enviando…' : `Enviar pedido · ${totalLabels} etiqueta${totalLabels !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

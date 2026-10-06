'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Printer, Plus, Minus, ChevronDown, Send, Pencil, Eye, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ELGIN_LABEL_W, ELGIN_LABEL_H,
  PRODUTO_LABEL_SIZE, PRODUTO_HALF_H, PRODUTO_CODIGO_COUNT,
  LabelPreview, ProdutoPreviewFull, ProdutoPreviewHalf, ProdutoPreviewTriple,
  IconWholeSquare, IconHalfHorizontal, IconTriple,
  TEMPLATE_LABELS,
  SAMPLE_FULL, SAMPLE_HALF_A, SAMPLE_HALF_B, SAMPLE_TRIPLE_C, SAMPLE_TRIPLE_D,
  blockWheelChange, effectiveLabelProduct,
  type LabelTemplate, type LabelSize, type QueueEntry, type LabelOverrides,
  type PrintQueueItem, type PrintQueueSubmission,
} from './LabelPrintModal';
import { LabelEditModal } from './LabelEditModal';
import { squareTabCls, squareTabsBarCls } from '@/components/shared/squareTabs';
import {
  modalBackdropCls, modalCls, barCls, barChipCls, barTitleCls, barSubtitleCls, closeBtnCls,
  sectionCls, sectionHeadCls, sectionTitleCls, sectionCountCls, labelCls, inputCls, noSpinCls,
  rowCls, segCls, segBtnCls, iconBtnCls, deleteBtnCls, footerCls, btnCls, btnPrimaryCls,
  highlightCls, highlightBoxCls,
} from './labelUi';

// Fila de Impressão — mesma tela de Seleção/Visualização da Etiquetas, mas em
// vez de imprimir na hora, empacota a fila e manda como uma requisição
// pendente (aparece na Central de Requisições pra quem estiver no computador
// com a impressora abrir e imprimir de fato). Não tem "Informações
// adicionais" da Etiqueta de Produto — esses campos são preenchidos na hora
// da impressão, não no pedido remoto.

export type { PrintQueueItem, PrintQueueSubmission };

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

  const previewFull = useMemo(() => {
    const entry = queueList.find(([, e]) => e.size === 'full')?.[1];
    return entry ? effectiveLabelProduct(entry) : SAMPLE_FULL;
  }, [queueList]);
  const previewHalfItems = useMemo(() => queueList.filter(([, e]) => e.size === 'half').map(([, e]) => effectiveLabelProduct(e)), [queueList]);
  const previewHalfA = previewHalfItems[0] ?? SAMPLE_HALF_A;
  const previewHalfB = previewHalfItems[1] ?? SAMPLE_HALF_B;
  const previewTripleItems = useMemo(() => queueList.filter(([, e]) => e.size === 'triple').map(([, e]) => effectiveLabelProduct(e)), [queueList]);
  const previewTripleA = previewTripleItems[0] ?? SAMPLE_HALF_A;
  const previewTripleB = previewTripleItems[1] ?? SAMPLE_HALF_B;
  const previewTripleC = previewTripleItems[2] ?? SAMPLE_TRIPLE_C;
  const previewTripleD = previewTripleItems[3] ?? SAMPLE_TRIPLE_D;

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

  // Item com o "Editar etiqueta" (lápis) aberto — sobrescreve descrição/REF/
  // EAN/preço só pra esta impressão, sem tocar no produto cadastrado.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingEntry = editingId ? queue[editingId] : null;

  const setEntryOverrides = useCallback((id: string, overrides: LabelOverrides) => {
    setQueue(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], overrides: Object.keys(overrides).length > 0 ? overrides : undefined } } : prev));
  }, []);

  const handleClose = () => {
    setActiveTab('selecao');
    setTemplate('gondola');
    setTemplateMenuOpen(false);
    setSearch('');
    setQueue({});
    setDrafts({});
    setSubmitting(false);
    setEditingId(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (totalLabels === 0 || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        template,
        items: queueList.map(([, entry]) => {
          const effective = effectiveLabelProduct(entry);
          return {
            product_id: entry.product.id,
            name: effective.name || '—',
            sku: effective.sku || null,
            ean: effective.ean || null,
            price: effective.price ?? null,
            qty: entry.qty,
            size: entry.size,
          };
        }),
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
            className={modalBackdropCls}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className={cn(modalCls, 'max-w-[640px]')}
          >
            {/* Barra de título */}
            <div className={barCls}>
              <div className={barChipCls}>
                <Printer size={15} strokeWidth={2.3} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className={barTitleCls}>Fila de Impressão</h4>
                <p className={barSubtitleCls}>Pedido remoto — enviado pra quem imprime no computador</p>
              </div>
              <button onClick={handleClose} title="Fechar" className={closeBtnCls}>
                <X size={15} strokeWidth={2.6} />
              </button>
            </div>

            {/* Abas penduradas */}
            <div className={squareTabsBarCls}>
              <button type="button" onClick={() => setActiveTab('selecao')} className={squareTabCls(activeTab === 'selecao', true)}>
                <span className={cn('transition-opacity', activeTab === 'selecao' ? 'opacity-100' : 'opacity-55 hover:opacity-85')}>Seleção</span>
              </button>
              <button type="button" onClick={() => setActiveTab('visualizacao')} className={squareTabCls(activeTab === 'visualizacao', false)}>
                <span className={cn('transition-opacity', activeTab === 'visualizacao' ? 'opacity-100' : 'opacity-55 hover:opacity-85')}>Visualização</span>
                {totalLabels > 0 && (
                  <span className="text-[9px] font-black px-1.5 py-px rounded-full bg-[#D81E1E] text-white">{totalLabels}</span>
                )}
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-[420px] max-h-[62vh] overflow-y-auto px-3.5 py-3 flex flex-col gap-2.5">
              {activeTab === 'selecao' && (
                <>
                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <Search size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                      <span className={sectionTitleCls}>Adicionar à fila</span>
                    </div>
                    <div className="p-2.5 flex flex-col gap-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.6fr] gap-2.5">
                        {/* Modelo de etiqueta — dropdown mostrando só o nome */}
                        <div className="min-w-0">
                          <span className={labelCls}>Modelo de etiqueta</span>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setTemplateMenuOpen(v => !v)}
                              className={cn(inputCls, 'flex items-center justify-between text-left', templateMenuOpen && '!border-[#D81E1E]')}
                            >
                              <span className="truncate">{TEMPLATE_LABELS[template]}</span>
                              <ChevronDown size={14} className={cn('shrink-0 text-on-surface/45 transition-transform duration-150', templateMenuOpen && 'rotate-180')} />
                            </button>
                            <AnimatePresence>
                              {templateMenuOpen && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.97, y: -4 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.97, y: -4 }}
                                  transition={{ duration: 0.13 }}
                                  className="absolute z-10 mt-1 w-full origin-top border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#2E2E28] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.3)]"
                                >
                                  <button
                                    type="button"
                                    onClick={() => { setTemplate('gondola'); setTemplateMenuOpen(false); }}
                                    className={cn('w-full text-left px-2.5 py-2 text-[12.5px] font-bold text-on-surface hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.08] transition-colors', template === 'gondola' && 'shadow-[inset_3px_0_0_#D81E1E]')}
                                  >
                                    {TEMPLATE_LABELS.gondola}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setTemplate('produto'); setTemplateMenuOpen(false); }}
                                    className={cn('w-full text-left px-2.5 py-2 text-[12.5px] font-bold text-on-surface hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.08] transition-colors flex items-center justify-between gap-2 border-t border-[#E0D8BF] dark:border-white/[0.08]', template === 'produto' && 'shadow-[inset_3px_0_0_#D81E1E]')}
                                  >
                                    {TEMPLATE_LABELS.produto}
                                    <span className="text-[8.5px] font-black uppercase tracking-[0.06em] px-1.5 py-0.5 bg-[#D81E1E]/10 text-[#D81E1E]">Adesiva 40×40mm</span>
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>

                        {/* Busca */}
                        <div className="min-w-0">
                          <span className={labelCls}>Buscar produto</span>
                          <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface/40 pointer-events-none" />
                            <input
                              type="text"
                              value={search}
                              onChange={e => setSearch(e.target.value)}
                              placeholder="Buscar por nome, SKU ou EAN…"
                              className={cn(inputCls, 'pl-8')}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Resultados */}
                      {search.trim() === '' ? (
                        <p className="text-center text-[11.5px] font-semibold text-on-surface/40 py-2">
                          Busque um produto pra adicionar ao pedido de impressão.
                        </p>
                      ) : (
                        <div className="flex flex-col">
                          {searchResults.map((product, idx) => {
                            const draft = getDraft(product.id);
                            return (
                              <div key={product.id} className={cn('flex items-center gap-2.5 px-2.5 py-2', rowCls(idx === 0))}>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12.5px] font-extrabold text-on-surface truncate">{product.name}</p>
                                  <p className="text-[10.5px] font-mono text-on-surface/40 mt-px truncate">
                                    {product.ean && `EAN ${product.ean}`}
                                    {product.ean && product.sku && ' · '}
                                    {product.sku && `SKU ${product.sku}`}
                                    {!product.ean && !product.sku && 'Sem código'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <div className={segCls}>
                                    <button type="button" onClick={() => setDraftSize(product.id, 'full')} className={segBtnCls(draft.size === 'full')}>
                                      {template === 'produto' && <IconWholeSquare size={12} />}
                                      Inteira
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDraftSize(product.id, 'half')}
                                      title={template === 'produto' ? 'Meia etiqueta — corte horizontal (40×20mm)' : undefined}
                                      className={segBtnCls(draft.size === 'half')}
                                    >
                                      {template === 'produto' && <IconHalfHorizontal size={12} />}
                                      Metade
                                    </button>
                                    {template === 'produto' && (
                                      <button
                                        type="button"
                                        onClick={() => setDraftSize(product.id, 'triple')}
                                        title="4 códigos de barras — só o código de barras, 4 por etiqueta"
                                        className={segBtnCls(draft.size === 'triple')}
                                      >
                                        <IconTriple size={12} />
                                        Código
                                      </button>
                                    )}
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
                                    className={cn(inputCls, noSpinCls, 'w-11 h-[30px] px-1 text-center font-extrabold')}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => confirmAdd(product)}
                                    className="w-[30px] h-[30px] bg-[#D81E1E] hover:bg-[#B91818] text-white flex items-center justify-center flex-shrink-0 active:scale-[0.94] transition-all duration-[130ms]"
                                    title="Adicionar ao pedido"
                                  >
                                    <Plus size={15} strokeWidth={2.8} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {searchResults.length === 0 && (
                            <p className="text-center text-[11.5px] font-semibold text-on-surface/35 py-4">
                              Nenhum produto encontrado.
                            </p>
                          )}

                          {queueList.length > 0 && (
                            <p className="text-center text-[10.5px] font-semibold text-on-surface/35 pt-2">
                              Produtos já adicionados somem daqui — veja e ajuste em &quot;Visualização&quot;
                            </p>
                          )}
                        </div>
                      )}

                      {template === 'produto' && (
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[10px] font-semibold text-on-surface/40 flex items-center gap-1.5">
                            <IconHalfHorizontal size={11} />
                            Metade corta a etiqueta ao meio na horizontal (duas de 40×20mm)
                          </p>
                          <p className="text-[10px] font-semibold text-on-surface/40 flex items-center gap-1.5">
                            <IconTriple size={11} />
                            Código imprime 4 códigos de barras por etiqueta, sem descrição
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Resumo da fila */}
                  {queueList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('visualizacao')}
                      className={cn('w-full flex items-center justify-between px-2.5 py-2.5 transition-colors hover:bg-[#FFE500]/25 dark:hover:bg-[#FFE500]/[0.10]', highlightBoxCls)}
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
                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <Eye size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                      <span className={sectionTitleCls}>Prévia</span>
                      <span className={sectionCountCls}>{TEMPLATE_LABELS[template]}</span>
                    </div>
                    <div className="p-2.5">
                      {template === 'gondola' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <span className={labelCls}>Inteira</span>
                            <LabelPreview variant="full" items={[previewFull]} />
                            <p className="text-center font-mono text-[10px] font-medium text-on-surface/40 mt-1.5">{ELGIN_LABEL_W} × {ELGIN_LABEL_H}mm</p>
                          </div>
                          <div>
                            <span className={labelCls}>Metade</span>
                            <LabelPreview variant="half" items={[previewHalfA, previewHalfB]} />
                            <p className="text-center font-mono text-[10px] font-medium text-on-surface/40 mt-1.5">2 × {(ELGIN_LABEL_W / 2).toFixed(1)} × {ELGIN_LABEL_H}mm</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <span className={labelCls}>Inteira</span>
                            <ProdutoPreviewFull product={previewFull} extraFields={[]} />
                            <p className="text-center font-mono text-[10px] font-medium text-on-surface/40 mt-1.5">{PRODUTO_LABEL_SIZE} × {PRODUTO_LABEL_SIZE}mm</p>
                          </div>
                          <div>
                            <span className={labelCls}>Metade</span>
                            <ProdutoPreviewHalf items={[previewHalfA, previewHalfB]} extraFields={[]} />
                            <p className="text-center font-mono text-[10px] font-medium text-on-surface/40 mt-1.5">2 × {PRODUTO_LABEL_SIZE} × {PRODUTO_HALF_H}mm</p>
                          </div>
                          <div>
                            <span className={labelCls}>Código</span>
                            <ProdutoPreviewTriple items={[previewTripleA, previewTripleB, previewTripleC, previewTripleD]} />
                            <p className="text-center font-mono text-[10px] font-medium text-on-surface/40 mt-1.5">{PRODUTO_CODIGO_COUNT} códigos · {PRODUTO_LABEL_SIZE} × {PRODUTO_LABEL_SIZE}mm</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <List size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                      <span className={sectionTitleCls}>Produtos no pedido — edite quantidade e modelo</span>
                      {queueList.length > 0 && (
                        <span className={sectionCountCls}>{queueList.length} · {totalLabels} etiqueta{totalLabels !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    <div className="p-2.5">
                    {queueList.length === 0 ? (
                      <div className="flex flex-col items-center gap-1.5 text-center py-[18px] px-4 border border-dashed border-[#E0D8BF] dark:border-white/[0.12] text-[11.5px] font-bold text-on-surface/45">
                        Nenhum produto no pedido ainda — adicione pela aba Seleção.
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {queueList.map(([id, entry], idx) => {
                          const edited = !!entry.overrides;
                          const effective = effectiveLabelProduct(entry);
                          return (
                            <div key={id} className={cn(rowCls(idx === 0), edited && highlightCls)}>
                            <div className="flex items-center gap-2 px-2.5 py-2">
                              <span className="flex-1 min-w-0 flex items-center gap-1.5">
                                <span className="min-w-0 text-[12.5px] font-extrabold text-on-surface truncate">{effective.name}</span>
                                {edited && (
                                  <span className="shrink-0 text-[8px] font-black uppercase tracking-[0.06em] px-1.5 py-0.5 bg-[#D4C000]/25 dark:bg-[#FFE500]/20 text-[#7A6A00] dark:text-[#FFE500]">Editado</span>
                                )}
                              </span>
                              <div className={segCls}>
                                <button type="button" onClick={() => updateQueueSize(id, 'full')} className={segBtnCls(entry.size === 'full')}>
                                  Inteira
                                </button>
                                <button type="button" onClick={() => updateQueueSize(id, 'half')} className={segBtnCls(entry.size === 'half')}>
                                  Metade
                                </button>
                                {template === 'produto' && (
                                  <button type="button" onClick={() => updateQueueSize(id, 'triple')} className={segBtnCls(entry.size === 'triple')}>
                                    Código
                                  </button>
                                )}
                              </div>

                              <div className="flex items-stretch h-[26px] flex-shrink-0 border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
                                <button
                                  type="button"
                                  onClick={() => updateQueueQty(id, Math.max(1, entry.qty - 1))}
                                  className="w-6 flex items-center justify-center text-on-surface/55 hover:text-on-surface hover:bg-on-surface/[0.05] transition-colors"
                                >
                                  <Minus size={11} strokeWidth={2.6} />
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
                                  className={cn('w-8 text-center text-[11.5px] font-extrabold text-on-surface bg-transparent outline-none caret-[#D81E1E] border-x border-[#E0D8BF] dark:border-white/[0.10]', noSpinCls)}
                                />
                                <button
                                  type="button"
                                  onClick={() => updateQueueQty(id, entry.qty + 1)}
                                  className="w-6 flex items-center justify-center text-on-surface/55 hover:text-on-surface hover:bg-on-surface/[0.05] transition-colors"
                                >
                                  <Plus size={11} strokeWidth={2.6} />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => setEditingId(id)}
                                title={edited ? 'Editar etiqueta (personalizada)' : 'Editar etiqueta'}
                                className={cn('relative', iconBtnCls, edited && 'text-on-surface')}
                              >
                                <Pencil size={13} />
                                {edited && <span className="absolute -top-[3px] -right-[3px] w-[7px] h-[7px] rounded-full bg-[#D81E1E]" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeFromQueue(id)}
                                title="Remover da fila"
                                className={deleteBtnCls}
                              >
                                <X size={12} strokeWidth={2.6} />
                              </button>
                            </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Rodapé */}
            <div className={footerCls}>
              <button type="button" onClick={handleClose} className={cn(btnCls, 'ml-auto')}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={totalLabels === 0 || submitting}
                className={btnPrimaryCls}
              >
                <Send size={14} strokeWidth={2.6} />
                {submitting ? 'Enviando…' : `Enviar pedido · ${totalLabels} etiqueta${totalLabels !== 1 ? 's' : ''}`}
              </button>
            </div>
          </motion.div>

          <LabelEditModal
            isOpen={!!editingEntry}
            product={editingEntry?.product}
            overrides={editingEntry?.overrides}
            onSave={overrides => { if (editingId) setEntryOverrides(editingId, overrides); }}
            onRestore={() => { if (editingId) setEntryOverrides(editingId, {}); }}
            onClose={() => setEditingId(null)}
          />
        </div>
      )}
    </AnimatePresence>
  );
}

'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Tag, Printer, Plus, ChevronDown, Lock, LayoutList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateBarcodeDataUrl, formatPrice } from './labelPrintUtils';

const blockWheelChange = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

// Elgin L42 Pro — etiqueta térmica em bobina contínua (uma etiqueta por vez,
// sem grid de blocos de folha). Este módulo é dedicado exclusivamente a essa impressora.
const ELGIN_LABEL_W = 105; // mm
const ELGIN_LABEL_H = 28;  // mm — etiqueta de gôndola real medida (não 30mm)

type LabelTemplate = 'gondola' | 'produto';
type LabelSize = 'full' | 'half';
type Tab = 'selecao' | 'visualizacao';

interface QueueEntry {
  product: any;
  qty: number;
  size: LabelSize;
}

interface Draft {
  qty: number;
  size: LabelSize;
}

interface LabelPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: any[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TEMPLATE_LABELS: Record<LabelTemplate, string> = {
  gondola: 'Etiqueta de Gôndola',
  produto: 'Etiqueta de Produto',
};

const emptyDraft = (): Draft => ({ qty: 1, size: 'full' });

export function LabelPrintModal({ isOpen, onClose, products }: LabelPrintModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('selecao');
  const [template, setTemplate] = useState<LabelTemplate>('gondola');
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [queue, setQueue] = useState<Record<string, QueueEntry>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const queueList = useMemo(() => Object.entries(queue), [queue]);
  const totalLabels = useMemo(() => queueList.reduce((acc, [, e]) => acc + e.qty, 0), [queueList]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products.filter(p =>
      !queue[p.id] &&
      (p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.ean?.toLowerCase().includes(q))
    );
  }, [products, search, queue]);

  const getDraft = useCallback((id: string) => drafts[id] ?? emptyDraft(), [drafts]);

  const setDraftQty = useCallback((id: string, qty: number) => {
    setDrafts(prev => ({ ...prev, [id]: { ...getDraft(id), qty: Math.max(1, qty) } }));
  }, [getDraft]);

  const setDraftSize = useCallback((id: string, size: LabelSize) => {
    setDrafts(prev => ({ ...prev, [id]: { ...getDraft(id), size } }));
  }, [getDraft]);

  const confirmAdd = useCallback((product: any) => {
    const draft = getDraft(product.id);
    setQueue(prev => ({ ...prev, [product.id]: { product, qty: draft.qty, size: draft.size } }));
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

  const handleClose = () => {
    setActiveTab('selecao');
    setTemplate('gondola');
    setTemplateMenuOpen(false);
    setSearch('');
    setQueue({});
    setDrafts({});
    onClose();
  };

  // Imprime na Elgin L42 Pro (etiqueta térmica em bobina contínua) via driver do
  // Windows: abre uma janela com uma etiqueta HTML por página, no tamanho exato
  // configurado no driver (@page), e chama window.print(). Cada etiqueta traz
  // nome, preço, código de barras e EAN/SKU — os dois sempre, sem escolha.
  // A opção "Metade" ainda não tem layout próprio (chega em uma próxima etapa);
  // por ora imprime no mesmo layout da etiqueta inteira.
  const buildElginLabelHtml = (entry: QueueEntry): string => {
    const { product } = entry;
    const code = product.ean || product.sku || '';
    let bcDataUrl = '';
    if (code) {
      try { bcDataUrl = generateBarcodeDataUrl(code); } catch { /* skip barcode on error */ }
    }
    const codeLines: string[] = [];
    if (product.ean) codeLines.push(`EAN ${product.ean}`);
    if (product.sku) codeLines.push(`SKU ${product.sku}`);

    return `
      <div class="elgin-label">
        <div class="name">${escapeHtml(product.name || '—')}</div>
        <div class="price">${escapeHtml(formatPrice(product.price ?? 0))}</div>
        ${bcDataUrl ? `<img class="barcode" src="${bcDataUrl}" />` : ''}
        ${codeLines.length > 0 ? `<div class="codes">${codeLines.map(l => `<span>${escapeHtml(l)}</span>`).join('')}</div>` : ''}
      </div>
    `;
  };

  const printElgin = () => {
    if (template !== 'gondola' || totalLabels === 0) return;
    const flatQueue: QueueEntry[] = [];
    queueList.forEach(([, entry]) => {
      for (let i = 0; i < entry.qty; i++) flatQueue.push(entry);
    });
    const labelsHtml = flatQueue.map(buildElginLabelHtml).join('');
    const win = window.open('', '_blank', 'width=500,height=400');
    if (!win) return;
    win.document.write(`
      <html><head><title>Etiquetas Elgin L42 Pro</title>
      <style>
        @page { size: ${ELGIN_LABEL_W}mm ${ELGIN_LABEL_H}mm; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; }
        .elgin-label {
          width: ${ELGIN_LABEL_W}mm; height: ${ELGIN_LABEL_H}mm; padding: 2mm 3mm;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          page-break-after: always; overflow: hidden;
        }
        .elgin-label:last-child { page-break-after: auto; }
        .name { font-size: 11pt; font-weight: 700; text-align: center; color: #141414; max-width: 100%; }
        .price { font-size: 16pt; font-weight: 900; color: #141414; margin-top: 1mm; }
        .codes { display: flex; gap: 6mm; margin-top: 1mm; }
        .codes span { font-family: 'Courier New', monospace; font-size: 7pt; color: #3c3c3c; }
        .barcode { width: 70mm; height: 9mm; margin-top: 1mm; }
      </style></head>
      <body>${labelsHtml}</body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  };

  const extraFieldNames = ['Marca', 'Fabricante', 'CNPJ', 'Composição', 'Validade'];

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
            {/* Header — mesmo padrão do modal "Editar Produto" */}
            <div className="px-6 py-5 flex items-center gap-3.5 bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] flex-shrink-0">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                <Tag size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-manrope font-extrabold text-[#1A1A0E] leading-tight">Etiquetas</h2>
                <p className="text-xs font-bold text-[#1A1A0E]/55 mt-0.5">Elgin L42 Pro Full — impressão térmica</p>
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
                  {/* Modelo de etiqueta — dropdown mostrando só o nome */}
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
                              <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] text-secondary/60">Em breve</span>
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {template === 'gondola' ? (
                    <>
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
                          Busque um produto pra adicionar à fila de impressão.
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
                                        'px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wide transition-all',
                                        draft.size === 'full'
                                          ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                                          : 'text-secondary/50 hover:text-on-surface'
                                      )}
                                    >
                                      Inteira
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDraftSize(product.id, 'half')}
                                      className={cn(
                                        'px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wide transition-all',
                                        draft.size === 'half'
                                          ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                                          : 'text-secondary/50 hover:text-on-surface'
                                      )}
                                    >
                                      Metade
                                    </button>
                                  </div>
                                  <input
                                    type="number"
                                    min={1}
                                    value={draft.qty}
                                    onWheel={blockWheelChange}
                                    onChange={e => {
                                      const val = parseInt(e.target.value);
                                      setDraftQty(product.id, val > 0 ? val : 1);
                                    }}
                                    className="w-11 h-[34px] border border-black/[0.14] dark:border-white/[0.14] rounded-lg text-center text-[13px] font-extrabold text-on-surface bg-transparent outline-none focus:border-primary/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => confirmAdd(product)}
                                    className="w-[34px] h-[34px] rounded-lg bg-[#1A1A0E] dark:bg-[#FFE500] text-[#FFE500] dark:text-[#1A1A0E] flex items-center justify-center flex-shrink-0 hover:opacity-80 transition-opacity active:scale-95"
                                    title="Adicionar à fila"
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
                              Produtos já adicionados à fila somem daqui — veja e ajuste em "Visualização"
                            </p>
                          )}
                        </div>
                      )}

                      {/* Resumo da fila */}
                      {queueList.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('visualizacao')}
                          className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-[#FFE500]/30 dark:bg-[#FFE500]/10 border border-[#D4C000] dark:border-[#FFE500]/30 transition-colors hover:bg-[#FFE500]/40 dark:hover:bg-[#FFE500]/[0.15]"
                        >
                          <span className="text-[12px] font-extrabold text-on-surface">
                            <b>{queueList.length}</b> produto{queueList.length !== 1 ? 's' : ''} na fila · <b>{totalLabels}</b> etiqueta{totalLabels !== 1 ? 's' : ''}
                          </span>
                          <span className="text-[11px] font-extrabold text-on-surface underline underline-offset-2">Ver na Visualização</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Placeholder — modelo Etiqueta de Produto ainda não configurado */}
                      <div className="border-2 border-dashed border-black/[0.14] dark:border-white/[0.12] rounded-[20px] p-8 flex flex-col items-center gap-2.5 text-center bg-white/40 dark:bg-white/[0.02]">
                        <div className="w-[52px] h-[52px] rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                          <LayoutList size={24} />
                        </div>
                        <p className="text-sm font-extrabold text-on-surface">Modelo em configuração</p>
                        <p className="text-[12px] font-semibold text-secondary/55 max-w-[340px] leading-relaxed">
                          A etiqueta de produto (pra colar direto no item) ainda será configurada — tamanho, campos e layout chegam em uma próxima etapa.
                        </p>
                      </div>

                      {/* Informações adicionais — exclusivas deste modelo */}
                      <div>
                        <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">
                          Informações adicionais <span className="normal-case font-bold tracking-normal">(exclusivo deste modelo)</span>
                        </span>
                        <div className="flex flex-col gap-2.5 p-3.5 rounded-2xl border border-black/[0.10] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] opacity-50">
                          <div className="flex flex-wrap gap-x-4 gap-y-2">
                            {extraFieldNames.map(name => (
                              <div key={name} className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-md border-2 border-black/20 dark:border-white/20" />
                                <span className="text-[11px] font-semibold text-secondary/60">{name}</span>
                              </div>
                            ))}
                          </div>
                          <p className="text-[10.5px] font-semibold text-secondary/45 flex items-center gap-1.5">
                            <Lock size={12} />
                            Liberado apenas quando o modelo "Etiqueta de Produto" estiver configurado
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {activeTab === 'visualizacao' && (
                <>
                  <div>
                    <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">
                      Prévia — {TEMPLATE_LABELS[template]}
                    </span>
                    <div
                      className="w-full max-w-[420px] mx-auto rounded-2xl border-2 border-dashed border-black/[0.16] dark:border-white/[0.14] bg-white dark:bg-[#252520] flex flex-col items-center justify-center gap-1 py-6"
                      style={{ aspectRatio: `${ELGIN_LABEL_W} / ${ELGIN_LABEL_H}` }}
                    >
                      <p className="text-[12px] font-extrabold text-secondary/45">Layout ainda não configurado</p>
                      <p className="text-[10px] font-semibold text-secondary/32">o design da etiqueta chega em uma próxima etapa</p>
                    </div>
                    <p className="text-center font-mono text-[11px] font-bold text-secondary/45 mt-2">{ELGIN_LABEL_W} × {ELGIN_LABEL_H}mm</p>
                  </div>

                  <div>
                    <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Produtos selecionados para impressão</span>
                    {queueList.length === 0 ? (
                      <p className="text-center text-[12px] font-semibold text-secondary/35 py-6">
                        Nenhum produto na fila ainda — adicione pela aba Seleção.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {queueList.map(([id, entry]) => (
                          <div key={id} className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252520]">
                            <span className="flex-1 min-w-0 text-[12.5px] font-bold text-on-surface truncate">{entry.product.name}</span>
                            <span className={cn(
                              'text-[9.5px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0',
                              entry.size === 'half' ? 'text-primary bg-primary/10' : 'text-secondary/60 bg-black/[0.06] dark:bg-white/[0.08]'
                            )}>
                              {entry.size === 'half' ? '1/2' : 'Inteira'}
                            </span>
                            <span className="font-mono text-[11px] font-extrabold text-secondary/60 bg-black/[0.06] dark:bg-white/[0.08] px-2 py-0.5 rounded-full flex-shrink-0">×{entry.qty}</span>
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
                  onClick={printElgin}
                  disabled={template !== 'gondola' || totalLabels === 0}
                  className="flex-1 bg-primary text-white font-bold py-3 rounded-2xl hover:opacity-90 transition-colors shadow-lg shadow-primary/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Printer size={15} />
                  {template !== 'gondola'
                    ? 'Em breve'
                    : `Imprimir ${totalLabels} etiqueta${totalLabels !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

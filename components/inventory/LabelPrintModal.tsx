'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Tag, Printer, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

// A4351 sheet constants (mm)
const LABEL_W    = 38.2;
const LABEL_H    = 21.2;
const MARGIN_L   = 4.0;
const MARGIN_T   = 4.0;
const COL_GAP    = 2.6;
const ROW_GAP    = 1.1;
const PAD        = 1.5;
const COLS       = 5;
const ROWS       = 13;
const TOTAL      = COLS * ROWS; // 65

type LabelType = 'estoque' | 'prateleira';

interface Selection {
  qty: number;
  type: LabelType;
}

interface LabelPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: any[];
}

function generateBarcodeDataUrl(code: string): string {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, code, { format: 'CODE128', displayValue: false, width: 1.5, height: 50, margin: 0 });
  return canvas.toDataURL('image/png');
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function LabelPrintModal({ isOpen, onClose, products }: LabelPrintModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [search, setSearch] = useState('');
  // map productId → { qty, type }
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  // set of block indices (0-based) that are already used on the sheet
  const [usedBlocks, setUsedBlocks] = useState<Set<number>>(new Set());

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p =>
      !q ||
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.ean?.toLowerCase().includes(q)
    );
  }, [products, search]);

  const selectedIds = useMemo(() => Object.keys(selections), [selections]);

  const totalLabels = useMemo(
    () => selectedIds.reduce((acc, id) => acc + (selections[id]?.qty ?? 1), 0),
    [selectedIds, selections]
  );

  // Flat label list: [{productId, type}] repeated qty times
  const labelQueue = useMemo(() => {
    const queue: { product: any; type: LabelType }[] = [];
    selectedIds.forEach(id => {
      const p = products.find(x => x.id === id);
      if (!p) return;
      const { qty, type } = selections[id];
      for (let i = 0; i < qty; i++) queue.push({ product: p, type });
    });
    return queue;
  }, [selectedIds, selections, products]);

  // Which blocks will be used for printing (indices 0-based)
  const printBlocks = useMemo(() => {
    const result: number[] = [];
    let labelIdx = 0;
    for (let b = 0; b < TOTAL && labelIdx < labelQueue.length; b++) {
      if (!usedBlocks.has(b)) {
        result.push(b);
        labelIdx++;
      }
    }
    return result;
  }, [usedBlocks, labelQueue.length]);

  const firstPrintBlock = printBlocks[0] ?? -1;

  const toggleProduct = useCallback((id: string) => {
    setSelections(prev => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { qty: 1, type: 'estoque' } };
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setSelections(prev => ({ ...prev, [id]: { ...prev[id], qty: Math.max(1, qty) } }));
  }, []);

  const setType = useCallback((id: string, type: LabelType) => {
    setSelections(prev => ({ ...prev, [id]: { ...prev[id], type } }));
  }, []);

  const selectAll = useCallback(() => {
    const next: Record<string, Selection> = {};
    products.forEach(p => { next[p.id] = selections[p.id] ?? { qty: 1, type: 'estoque' }; });
    setSelections(next);
  }, [products, selections]);

  const clearAll = useCallback(() => setSelections({}), []);

  const toggleBlock = useCallback((idx: number) => {
    // only allow toggling non-print blocks (used/free)
    if (printBlocks.includes(idx)) return;
    setUsedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, [printBlocks]);

  const handleClose = () => {
    setStep(1);
    setSearch('');
    setSelections({});
    setUsedBlocks(new Set());
    onClose();
  };

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let printIdx = 0;
    let pageBlocks = new Set(usedBlocks);

    for (let qIdx = 0; qIdx < labelQueue.length; qIdx++) {
      // find next free block on current page
      while (printIdx < TOTAL && pageBlocks.has(printIdx)) printIdx++;

      if (printIdx >= TOTAL) {
        // new page — reset everything
        doc.addPage();
        pageBlocks = new Set<number>();
        printIdx = 0;
      }

      const col = printIdx % COLS;
      const row = Math.floor(printIdx / COLS);
      const x = MARGIN_L + col * (LABEL_W + COL_GAP);
      const y = MARGIN_T + row * (LABEL_H + ROW_GAP);

      drawLabel(doc, x, y, labelQueue[qIdx]);
      printIdx++;
    }

    doc.save('etiquetas.pdf');
  };

  const drawLabel = (doc: jsPDF, x: number, y: number, entry: { product: any; type: LabelType }) => {
    const { product, type } = entry;
    const code = product.ean || product.sku || '';

    // border
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, LABEL_W, LABEL_H, 1.5, 1.5, 'S');

    const cx = x + PAD;
    const cw = LABEL_W - PAD * 2;
    let cy = y + PAD;

    if (type === 'estoque') {
      // Name (up to 2 lines, 5.5pt)
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 20, 20);
      const nameLines = doc.splitTextToSize(product.name || '—', cw);
      const nameToPrint = nameLines.slice(0, 2);
      doc.text(nameToPrint, x + LABEL_W / 2, cy + 2, { align: 'center' });
      cy += nameToPrint.length * 2.2 + 1;

      // Barcode
      if (code) {
        try {
          const bcH = LABEL_H - PAD - (cy - y) - 3.5; // remaining height minus code number space
          const bcDataUrl = generateBarcodeDataUrl(code);
          doc.addImage(bcDataUrl, 'PNG', cx, cy, cw, Math.max(4, bcH));
          cy += bcH + 0.5;
        } catch { /* skip barcode on error */ }
      }

      // Code number
      doc.setFontSize(4);
      doc.setFont('courier', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(code, x + LABEL_W / 2, y + LABEL_H - PAD, { align: 'center' });

    } else {
      // Prateleira: name (1 line, 5pt)
      doc.setFontSize(5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 20, 20);
      const nameLines = doc.splitTextToSize(product.name || '—', cw);
      doc.text(nameLines.slice(0, 1), x + LABEL_W / 2, cy + 2, { align: 'center' });
      cy += 3;

      // Price (9pt bold, centered)
      const price = formatPrice(product.price ?? 0);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(price, x + LABEL_W / 2, cy + 4, { align: 'center' });
      cy += 6;

      // Barcode
      if (code) {
        try {
          const bcH = LABEL_H - PAD - (cy - y) - 3.5;
          const bcDataUrl = generateBarcodeDataUrl(code);
          doc.addImage(bcDataUrl, 'PNG', cx, cy, cw, Math.max(3, bcH));
        } catch { /* skip */ }
      }

      // Code number
      doc.setFontSize(4);
      doc.setFont('courier', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(code, x + LABEL_W / 2, y + LABEL_H - PAD, { align: 'center' });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[600] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-lg bg-surface-container rounded-[2rem] overflow-hidden flex flex-col shadow-2xl shadow-black/40"
            style={{ maxHeight: 'min(780px, 90vh)' }}
          >
            {/* ── HEADER ── */}
            <div className="flex items-center justify-between px-7 pt-6 pb-5 border-b border-on-surface/[0.06] flex-shrink-0">
              <div className="flex flex-col gap-1">
                {/* step dots */}
                <div className="flex gap-1.5 mb-1">
                  {[1, 2].map(s => (
                    <div
                      key={s}
                      className={cn(
                        'h-1 rounded-full transition-all duration-300',
                        s === step ? 'w-5 bg-on-surface' : 'w-2.5 bg-on-surface/20'
                      )}
                    />
                  ))}
                </div>
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface/35">
                  Etapa {step} de 2
                </span>
                <span className="text-lg font-black text-on-surface leading-tight">
                  {step === 1 ? 'Imprimir Etiquetas' : 'Posição na Folha'}
                </span>
              </div>
              <button
                onClick={handleClose}
                className="w-9 h-9 rounded-full bg-on-surface/[0.06] hover:bg-on-surface/10 flex items-center justify-center text-on-surface/50 hover:text-on-surface transition-all active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── STEP 1: PRODUCT SELECTION ── */}
            {step === 1 && (
              <>
                <div className="flex-1 overflow-y-auto px-7 py-5 flex flex-col gap-4 min-h-0">
                  {/* Search */}
                  <div className="relative">
                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface/30 pointer-events-none" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar por nome, SKU ou EAN…"
                      className="w-full h-11 pl-10 pr-4 bg-on-surface/[0.04] border border-on-surface/[0.06] rounded-2xl text-sm font-medium text-on-surface placeholder:text-on-surface/30 outline-none focus:border-on-surface/20 transition-colors"
                    />
                  </div>

                  {/* List header */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-on-surface/35">Produtos</span>
                    <button
                      onClick={selectedIds.length === products.length ? clearAll : selectAll}
                      className="text-[11px] font-semibold text-on-surface/50 hover:text-on-surface transition-colors underline underline-offset-2"
                    >
                      {selectedIds.length === products.length ? 'Limpar seleção' : 'Selecionar todos'}
                    </button>
                  </div>

                  {/* Product rows */}
                  <div className="flex flex-col gap-2">
                    {filteredProducts.map(product => {
                      const sel = selections[product.id];
                      const isSelected = !!sel;
                      return (
                        <div
                          key={product.id}
                          className={cn(
                            'flex items-center gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer',
                            isSelected
                              ? 'border-on-surface/10 bg-on-surface/[0.03]'
                              : 'border-on-surface/[0.05] bg-transparent hover:border-on-surface/10'
                          )}
                          onClick={() => toggleProduct(product.id)}
                        >
                          {/* Checkbox */}
                          <div
                            className={cn(
                              'w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all',
                              isSelected ? 'bg-on-surface border-on-surface' : 'border-on-surface/20 bg-transparent'
                            )}
                          >
                            {isSelected && <Check size={11} strokeWidth={3} className="text-surface-container" />}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-on-surface truncate">{product.name}</p>
                            <p className="text-[11px] text-on-surface/40 mt-0.5">
                              {product.sku && `SKU: ${product.sku}`}
                              {product.sku && product.ean && ' · '}
                              {product.ean && `EAN: ${product.ean}`}
                              {!product.sku && !product.ean && 'Sem código'}
                            </p>
                          </div>

                          {/* Controls — only when selected */}
                          {isSelected && (
                            <div
                              className="flex items-center gap-2 flex-shrink-0"
                              onClick={e => e.stopPropagation()}
                            >
                              {/* Type toggle */}
                              <div className="flex bg-on-surface/[0.06] rounded-lg p-0.5 gap-0.5">
                                <button
                                  onClick={() => setType(product.id, 'estoque')}
                                  className={cn(
                                    'px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all',
                                    sel.type === 'estoque'
                                      ? 'bg-[#1a3a6b] text-white shadow-sm'
                                      : 'text-on-surface/40 hover:text-on-surface/70'
                                  )}
                                >
                                  Estoque
                                </button>
                                <button
                                  onClick={() => setType(product.id, 'prateleira')}
                                  className={cn(
                                    'px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all',
                                    sel.type === 'prateleira'
                                      ? 'bg-[#1a6b3c] text-white shadow-sm'
                                      : 'text-on-surface/40 hover:text-on-surface/70'
                                  )}
                                >
                                  Prat.
                                </button>
                              </div>

                              {/* Quantity */}
                              <input
                                type="number"
                                min={1}
                                value={sel.qty}
                                onChange={e => setQty(product.id, parseInt(e.target.value) || 1)}
                                className="w-12 h-8 border border-on-surface/[0.10] rounded-lg text-center text-sm font-bold text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors"
                              />
                              <span className="text-[10px] text-on-surface/35 font-medium">un.</span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {filteredProducts.length === 0 && (
                      <div className="py-12 text-center text-on-surface/30 text-sm font-medium">
                        Nenhum produto encontrado
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer step 1 */}
                <div className="flex items-center justify-between px-7 py-5 border-t border-on-surface/[0.06] flex-shrink-0">
                  <span className="text-sm text-on-surface/40 font-medium">
                    {selectedIds.length > 0
                      ? `${selectedIds.length} produto${selectedIds.length > 1 ? 's' : ''} · ${totalLabels} etiqueta${totalLabels > 1 ? 's' : ''}`
                      : 'Nenhum produto selecionado'}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={handleClose}
                      className="h-10 px-5 rounded-2xl border border-on-surface/[0.08] text-[11px] font-black uppercase tracking-widest text-on-surface/50 hover:text-on-surface transition-colors active:scale-95"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => setStep(2)}
                      disabled={selectedIds.length === 0}
                      className="h-10 px-6 rounded-2xl bg-on-surface text-surface-container text-[11px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-30 hover:opacity-80 transition-all active:scale-95"
                    >
                      Próximo
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── STEP 2: BLOCK GRID ── */}
            {step === 2 && (
              <>
                <div className="flex-1 overflow-y-auto px-7 py-5 flex flex-col gap-4 min-h-0">

                  {/* Counter + clear */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-on-surface/60 font-medium">
                      <span className="font-black text-on-surface">{totalLabels}</span> etiqueta{totalLabels !== 1 ? 's' : ''}
                      {firstPrintBlock >= 0 && (
                        <> · iniciando no bloco <span className="font-black text-on-surface">{firstPrintBlock + 1}</span></>
                      )}
                    </p>
                    <button
                      onClick={() => setUsedBlocks(new Set())}
                      className="text-[11px] font-semibold text-on-surface/50 hover:text-on-surface transition-colors underline underline-offset-2"
                    >
                      Limpar seleção
                    </button>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {[
                      { color: 'bg-on-surface/[0.06] border border-on-surface/10', label: 'Livre' },
                      { color: 'bg-on-surface/20', label: 'Já usado (clique para liberar)' },
                      { color: 'bg-[#1a3a6b]', label: 'Estoque (será impresso)' },
                      { color: 'bg-[#1a6b3c]', label: 'Prateleira (será impresso)' },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-1.5">
                        <div className={cn('w-3 h-3 rounded-sm flex-shrink-0', item.color)} />
                        <span className="text-[10px] text-on-surface/50 font-medium">{item.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* The grid */}
                  <div className="flex justify-center">
                    <div
                      className="grid gap-[3px] bg-on-surface/[0.04] border border-on-surface/[0.06] rounded-2xl p-3"
                      style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, width: 300 }}
                    >
                      {Array.from({ length: TOTAL }, (_, i) => {
                        const printIdx = printBlocks.indexOf(i);
                        const isPrint = printIdx !== -1;
                        const isUsed = usedBlocks.has(i);
                        const printEntry = isPrint ? labelQueue[printIdx] : null;

                        return (
                          <button
                            key={i}
                            onClick={() => toggleBlock(i)}
                            title={`Bloco ${i + 1}`}
                            className={cn(
                              'h-[33px] rounded-md text-[6px] font-bold transition-all flex items-center justify-center',
                              isPrint && printEntry?.type === 'estoque' && 'bg-[#1a3a6b] text-white/60 cursor-default',
                              isPrint && printEntry?.type === 'prateleira' && 'bg-[#1a6b3c] text-white/60 cursor-default',
                              isUsed && !isPrint && 'bg-on-surface/20 cursor-pointer hover:bg-on-surface/15',
                              !isPrint && !isUsed && 'bg-on-surface/[0.04] border border-on-surface/10 hover:border-on-surface/20 cursor-pointer'
                            )}
                          >
                            {i + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <p className="text-center text-[10px] text-on-surface/30 font-medium">
                    Folha A4 · Spiral A4351 · 5 × 13 = 65 blocos
                  </p>
                </div>

                {/* Footer step 2 */}
                <div className="flex items-center justify-between px-7 py-5 border-t border-on-surface/[0.06] flex-shrink-0">
                  <button
                    onClick={() => setStep(1)}
                    className="h-10 px-5 rounded-2xl border border-on-surface/[0.08] text-[11px] font-black uppercase tracking-widest text-on-surface/50 hover:text-on-surface transition-colors flex items-center gap-2 active:scale-95"
                  >
                    <ChevronLeft size={14} />
                    Voltar
                  </button>
                  <button
                    onClick={generatePDF}
                    disabled={totalLabels === 0}
                    className="h-10 px-6 rounded-2xl bg-on-surface text-surface-container text-[11px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-30 hover:opacity-80 transition-all active:scale-95"
                  >
                    <Printer size={14} />
                    Gerar PDF
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

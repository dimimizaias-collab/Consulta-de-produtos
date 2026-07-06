'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Printer, Check, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import { generateBarcodeDataUrl, defaultCodeField, type CodeField } from './labelPrintUtils';

function loadImageAsDataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no canvas context')); return; }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = src;
  });
}

// Placa sheet constants (mm) — plain A4 sulfite paper, 10cm x 5cm per placa
const PLACA_W  = 100;
const PLACA_H  = 50;
const MARGIN_L = 5;
const MARGIN_T = 15;
const COL_GAP  = 0;
const ROW_GAP  = 0;
const PAD      = 4;
const COLS     = 2;
const ROWS     = 5;
const TOTAL_PER_PAGE = COLS * ROWS; // 10

const COLOR_RED_DARK = [138, 36, 28] as const;   // #8A241C — "R$" prefix
const COLOR_RED      = [238, 43, 43] as const;   // #EE2B2B — price / promo text
const COLOR_YELLOW   = [255, 229, 0] as const;   // #FFE500 — oferta badge
const COLOR_YELLOW_TEXT = [122, 74, 0] as const; // dark brown text on yellow

interface PlacaSelection {
  qty: number;
  codeField: CodeField;
  priceOverride?: string;
  nameOverride?: string;
  customText?: string;
}

interface CustomPlaca {
  id: string;
  name: string;
  price: string;
  qty: number;
  customText?: string;
}

interface QueueEntry {
  name: string;
  price: number;
  code: string;
  customText?: string;
}

interface PlacaPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: any[];
}

let customPlacaIdCounter = 0;
function nextCustomPlacaId(): string {
  customPlacaIdCounter += 1;
  return `custom-${Date.now()}-${customPlacaIdCounter}`;
}

export function PlacaPrintModal({ isOpen, onClose, products }: PlacaPrintModalProps) {
  const [search, setSearch] = useState('');
  const [selections, setSelections] = useState<Record<string, PlacaSelection>>({});
  const [customPlacas, setCustomPlacas] = useState<CustomPlaca[]>([]);
  const [batchText, setBatchText] = useState('');
  const [showBarcode, setShowBarcode] = useState(true);
  const [showOferta, setShowOferta] = useState(false);
  const lastCustomPlacaRef = useRef<HTMLDivElement | null>(null);
  const prevCustomPlacaCountRef = useRef(0);

  useEffect(() => {
    if (customPlacas.length > prevCustomPlacaCountRef.current) {
      lastCustomPlacaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    prevCustomPlacaCountRef.current = customPlacas.length;
  }, [customPlacas.length]);

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

  const totalPlacas = useMemo(() => {
    const fromProducts = selectedIds.reduce((acc, id) => acc + (selections[id]?.qty ?? 1), 0);
    const fromCustom = customPlacas.reduce((acc, cp) => acc + (cp.qty ?? 1), 0);
    return fromProducts + fromCustom;
  }, [selectedIds, selections, customPlacas]);

  const totalPages = totalPlacas > 0 ? Math.ceil(totalPlacas / TOTAL_PER_PAGE) : 0;

  // Flat placa list — uniform shape, works for both product-linked and custom (unlinked) placas
  const placaQueue = useMemo(() => {
    const queue: QueueEntry[] = [];
    selectedIds.forEach(id => {
      const p = products.find(x => x.id === id);
      if (!p) return;
      const { qty, codeField, priceOverride, nameOverride, customText } = selections[id];
      const code = codeField === 'sku' ? (p.sku || p.ean || '') : (p.ean || p.sku || '');
      const price = priceOverride !== undefined ? (parseFloat(priceOverride.replace(',', '.')) || 0) : (p.price ?? 0);
      for (let i = 0; i < qty; i++) {
        queue.push({ name: nameOverride || p.name, price, code, customText });
      }
    });
    customPlacas.forEach(cp => {
      const price = parseFloat(cp.price.replace(',', '.')) || 0;
      for (let i = 0; i < (cp.qty || 1); i++) {
        queue.push({ name: cp.name, price, code: '', customText: cp.customText });
      }
    });
    return queue;
  }, [selectedIds, selections, products, customPlacas]);

  const toggleProduct = useCallback((id: string) => {
    setSelections(prev => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      const p = products.find(x => x.id === id);
      return { ...prev, [id]: { qty: 1, codeField: defaultCodeField(p) } };
    });
  }, [products]);

  const setQty = useCallback((id: string, qty: number) => {
    setSelections(prev => ({ ...prev, [id]: { ...prev[id], qty: Math.max(1, qty) } }));
  }, []);

  const setCodeFieldFor = useCallback((id: string, codeField: CodeField) => {
    setSelections(prev => ({ ...prev, [id]: { ...prev[id], codeField } }));
  }, []);

  const setPriceOverrideFor = useCallback((id: string, priceOverride: string) => {
    setSelections(prev => ({ ...prev, [id]: { ...prev[id], priceOverride } }));
  }, []);

  const setNameOverrideFor = useCallback((id: string, nameOverride: string) => {
    setSelections(prev => ({ ...prev, [id]: { ...prev[id], nameOverride: nameOverride || undefined } }));
  }, []);

  const setCustomTextFor = useCallback((id: string, customText: string) => {
    setSelections(prev => ({ ...prev, [id]: { ...prev[id], customText: customText || undefined } }));
  }, []);

  const addCustomPlaca = useCallback(() => {
    setCustomPlacas(prev => [...prev, { id: nextCustomPlacaId(), name: '', price: '', qty: 1 }]);
  }, []);

  const removeCustomPlaca = useCallback((id: string) => {
    setCustomPlacas(prev => prev.filter(cp => cp.id !== id));
  }, []);

  const updateCustomPlaca = useCallback((id: string, patch: Partial<CustomPlaca>) => {
    setCustomPlacas(prev => prev.map(cp => cp.id === id ? { ...cp, ...patch } : cp));
  }, []);

  const selectAll = useCallback(() => {
    const next: Record<string, PlacaSelection> = {};
    products.forEach(p => {
      next[p.id] = selections[p.id] ?? { qty: 1, codeField: defaultCodeField(p) };
    });
    setSelections(next);
  }, [products, selections]);

  const clearAll = useCallback(() => setSelections({}), []);

  const handleClose = () => {
    setSearch('');
    setSelections({});
    setCustomPlacas([]);
    setBatchText('');
    setShowBarcode(true);
    setShowOferta(false);
    onClose();
  };

  const drawPlaca = (
    doc: jsPDF,
    x: number,
    y: number,
    entry: QueueEntry,
    logoDataUrl: string | null
  ) => {
    const { name, price: priceValue, code, customText } = entry;

    const centerX = x + PLACA_W / 2;
    const cw = PLACA_W - PAD * 2;
    const price = priceValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const text = customText || batchText;

    // cut guides (dashed rect) — plain paper, user cuts by hand
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.15);
    doc.setLineDashPattern([1, 1], 0);
    doc.rect(x, y, PLACA_W, PLACA_H);
    doc.setLineDashPattern([], 0);

    const hasBarcode = showBarcode && !!code;
    // Bigger price when there's no barcode taking up space at the bottom
    const priceMainSize = hasBarcode ? 24 : 32;
    const pricePrefixSize = hasBarcode ? 14 : 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    const nameLines = doc.splitTextToSize(name || '—', cw).slice(0, 2);

    // Block heights (mm), used to vertically center the whole stack in the placa.
    // When there's no barcode there's a lot of spare room, so give name/price
    // more breathing room instead of packing them tight at their old spacing.
    const nameGapAfter = hasBarcode ? 4 : 12;
    const nameBlockH = nameLines.length * 6 + nameGapAfter;
    const priceBlockH = hasBarcode ? 10 : 16;
    const promoBlockH = text ? 8 : 0;
    const barcodeBlockH = hasBarcode ? 9 + 3 + 6 : 0;
    const totalBlockH = nameBlockH + priceBlockH + promoBlockH + barcodeBlockH;
    const startY = y + PAD + Math.max(0, (PLACA_H - PAD * 2 - totalBlockH) / 2);

    let cy = startY + 6;

    // Product name (1-2 lines, centered)
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(28, 28, 26);
    doc.text(nameLines, centerX, cy, { align: 'center' });
    cy += nameBlockH;

    // Price — "R$" prefix + big number, both centered as one line.
    // Measure and draw each part at the SAME font size, or the reserved
    // width won't match what's actually painted (leaves a visible gap).
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(pricePrefixSize);
    const prefixW = doc.getTextWidth('R$ ');
    doc.setFontSize(priceMainSize);
    const priceW = doc.getTextWidth(price);
    const totalW = prefixW + priceW;

    doc.setFontSize(pricePrefixSize);
    doc.setTextColor(...COLOR_RED_DARK);
    doc.text('R$ ', centerX - totalW / 2, cy, { align: 'left' });
    doc.setFontSize(priceMainSize);
    doc.setTextColor(...COLOR_RED);
    doc.text(price, centerX - totalW / 2 + prefixW, cy, { align: 'left' });
    cy += priceBlockH;

    // Promo text, if any
    if (text) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLOR_RED);
      doc.text(text, centerX, cy, { align: 'center' });
      cy += promoBlockH;
    }

    // Barcode + code
    if (hasBarcode) {
      try {
        const bcW = Math.min(45, cw);
        const bcH = 9;
        const bcDataUrl = generateBarcodeDataUrl(code);
        doc.addImage(bcDataUrl, 'PNG', centerX - bcW / 2, cy, bcW, bcH);
        cy += bcH + 3;
        doc.setFontSize(6);
        doc.setFont('courier', 'normal');
        doc.setTextColor(95, 94, 90);
        doc.text(code, centerX, cy, { align: 'center' });
      } catch { /* skip barcode on error */ }
    }

    // Oferta badge — top-right corner
    if (showOferta) {
      const badgeW = 24, badgeH = 8;
      doc.setFillColor(...COLOR_YELLOW);
      doc.rect(x + PLACA_W - badgeW, y, badgeW, badgeH, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLOR_YELLOW_TEXT);
      doc.text('OFERTA', x + PLACA_W - badgeW / 2, y + badgeH / 2 + 1.5, { align: 'center' });
    }

    // Brand logo — bottom-right corner (real asset, not redrawn)
    if (logoDataUrl) {
      try {
        const logoW = 18;
        const logoH = logoW * (79 / 140); // aspect ratio of public/brand/logo.png
        doc.addImage(logoDataUrl, 'PNG', x + PLACA_W - logoW - 3, y + PLACA_H - logoH - 3, logoW, logoH);
      } catch { /* skip logo on error */ }
    }
  };

  const generatePlacaPDF = async () => {
    let logoDataUrl: string | null = null;
    try {
      logoDataUrl = await loadImageAsDataUrl('/brand/logo.png');
    } catch { /* proceed without logo if it fails to load */ }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let printIdx = 0;

    for (let qIdx = 0; qIdx < placaQueue.length; qIdx++) {
      if (printIdx >= TOTAL_PER_PAGE) {
        doc.addPage();
        printIdx = 0;
      }

      const col = printIdx % COLS;
      const row = Math.floor(printIdx / COLS);
      const x = MARGIN_L + col * (PLACA_W + COL_GAP);
      const y = MARGIN_T + row * (PLACA_H + ROW_GAP);

      drawPlaca(doc, x, y, placaQueue[qIdx], logoDataUrl);
      printIdx++;
    }

    doc.save('placas.pdf');
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
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface/35">
                  Placas de preço
                </span>
                <span className="text-lg font-black text-on-surface leading-tight">
                  Imprimir Placas
                </span>
              </div>
              <button
                onClick={handleClose}
                className="w-9 h-9 rounded-full bg-on-surface/[0.06] hover:bg-on-surface/10 flex items-center justify-center text-on-surface/50 hover:text-on-surface transition-all active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

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

              {/* Batch options */}
              <div className="flex flex-col gap-3 p-3.5 rounded-2xl border border-on-surface/[0.06] bg-on-surface/[0.02]">
                <input
                  type="text"
                  value={batchText}
                  onChange={e => setBatchText(e.target.value)}
                  placeholder="Texto adicional para todas as placas desta impressão (opcional)"
                  className="w-full h-10 px-3.5 bg-transparent border border-on-surface/[0.10] rounded-xl text-sm font-medium text-on-surface placeholder:text-on-surface/30 outline-none focus:border-on-surface/30 transition-colors"
                />
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setShowBarcode(v => !v)}
                    className="flex items-center gap-2"
                  >
                    <div className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all', showBarcode ? 'bg-on-surface border-on-surface' : 'border-on-surface/20 bg-transparent')}>
                      {showBarcode && <Check size={11} strokeWidth={3} className="text-surface-container" />}
                    </div>
                    <span className="text-[11px] font-semibold text-on-surface/60">Código de barras</span>
                  </button>
                  <button
                    onClick={() => setShowOferta(v => !v)}
                    className="flex items-center gap-2"
                  >
                    <div className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all', showOferta ? 'bg-on-surface border-on-surface' : 'border-on-surface/20 bg-transparent')}>
                      {showOferta && <Check size={11} strokeWidth={3} className="text-surface-container" />}
                    </div>
                    <span className="text-[11px] font-semibold text-on-surface/60">Selo "OFERTA"</span>
                  </button>
                </div>
              </div>

              {/* List header */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-on-surface/35">Produtos</span>
                <div className="flex items-center gap-4">
                  <button
                    onClick={addCustomPlaca}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-on-surface/50 hover:text-on-surface transition-colors"
                  >
                    <Plus size={12} />
                    Adicionar placa
                  </button>
                  <button
                    onClick={selectedIds.length === products.length ? clearAll : selectAll}
                    className="text-[11px] font-semibold text-on-surface/50 hover:text-on-surface transition-colors underline underline-offset-2"
                  >
                    {selectedIds.length === products.length ? 'Limpar seleção' : 'Selecionar todos'}
                  </button>
                </div>
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
                        'flex flex-col gap-2.5 p-3.5 rounded-2xl border transition-all cursor-pointer',
                        isSelected
                          ? 'border-on-surface/10 bg-on-surface/[0.03]'
                          : 'border-on-surface/[0.05] bg-transparent hover:border-on-surface/10'
                      )}
                      onClick={() => toggleProduct(product.id)}
                    >
                      <div className="flex items-center gap-3">
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
                            {/* Code field toggle */}
                            <div className="flex bg-on-surface/[0.06] rounded-lg p-0.5 gap-0.5">
                              <button
                                onClick={() => setCodeFieldFor(product.id, 'ean')}
                                disabled={!product.ean}
                                className={cn(
                                  'px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed',
                                  sel.codeField === 'ean'
                                    ? 'bg-on-surface text-surface-container shadow-sm'
                                    : 'text-on-surface/40 hover:text-on-surface/70'
                                )}
                              >
                                EAN
                              </button>
                              <button
                                onClick={() => setCodeFieldFor(product.id, 'sku')}
                                disabled={!product.sku}
                                className={cn(
                                  'px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed',
                                  sel.codeField === 'sku'
                                    ? 'bg-on-surface text-surface-container shadow-sm'
                                    : 'text-on-surface/40 hover:text-on-surface/70'
                                )}
                              >
                                SKU
                              </button>
                            </div>

                            {/* Quantity */}
                            <input
                              type="number"
                              min={1}
                              value={sel.qty === 1 ? '' : sel.qty}
                              placeholder="0"
                              onChange={e => {
                                const val = parseInt(e.target.value);
                                setQty(product.id, val > 0 ? val : 1);
                              }}
                              className="w-12 h-8 border border-on-surface/[0.10] rounded-lg text-center text-sm font-bold text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-[10px] text-on-surface/35 font-medium">un.</span>
                          </div>
                        )}
                      </div>

                      {isSelected && (
                        <div
                          className="flex flex-col gap-2 pl-8"
                          onClick={e => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={sel.nameOverride ?? product.name ?? ''}
                            onChange={e => setNameOverrideFor(product.id, e.target.value)}
                            placeholder="Nome exibido na placa"
                            className="w-full h-8 px-2.5 border border-on-surface/[0.10] rounded-lg text-xs font-semibold text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors"
                          />
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={sel.priceOverride !== undefined ? sel.priceOverride : String(product.price ?? 0)}
                              onChange={e => setPriceOverrideFor(product.id, e.target.value)}
                              placeholder="Preço"
                              className="w-24 h-8 px-2.5 border border-on-surface/[0.10] rounded-lg text-xs font-bold text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors"
                            />
                            <input
                              type="text"
                              value={sel.customText ?? ''}
                              onChange={e => setCustomTextFor(product.id, e.target.value)}
                              placeholder="Personalizar texto desta placa (opcional)"
                              className="flex-1 h-8 px-2.5 border border-on-surface/[0.10] rounded-lg text-xs font-medium text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors placeholder:text-on-surface/30"
                            />
                          </div>
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

              {/* Placas sem produto vinculado */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-on-surface/35">Placas sem produto</span>
                </div>

                {customPlacas.map((cp, i) => (
                  <div
                    key={cp.id}
                    ref={i === customPlacas.length - 1 ? lastCustomPlacaRef : undefined}
                    className="flex flex-col gap-2 p-3.5 rounded-2xl border border-on-surface/10 bg-on-surface/[0.03]"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={cp.name}
                        onChange={e => updateCustomPlaca(cp.id, { name: e.target.value })}
                        placeholder="Nome exibido na placa"
                        className="flex-1 h-8 px-2.5 border border-on-surface/[0.10] rounded-lg text-xs font-semibold text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors"
                      />
                      <input
                        type="number"
                        min={1}
                        value={cp.qty === 1 ? '' : cp.qty}
                        placeholder="1"
                        onChange={e => {
                          const val = parseInt(e.target.value);
                          updateCustomPlaca(cp.id, { qty: val > 0 ? val : 1 });
                        }}
                        className="w-12 h-8 border border-on-surface/[0.10] rounded-lg text-center text-sm font-bold text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => removeCustomPlaca(cp.id)}
                        className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-on-surface/30 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={cp.price}
                        onChange={e => updateCustomPlaca(cp.id, { price: e.target.value })}
                        placeholder="Preço"
                        className="w-24 h-8 px-2.5 border border-on-surface/[0.10] rounded-lg text-xs font-bold text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors"
                      />
                      <input
                        type="text"
                        value={cp.customText ?? ''}
                        onChange={e => updateCustomPlaca(cp.id, { customText: e.target.value || undefined })}
                        placeholder="Personalizar texto desta placa (opcional)"
                        className="flex-1 h-8 px-2.5 border border-on-surface/[0.10] rounded-lg text-xs font-medium text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors placeholder:text-on-surface/30"
                      />
                    </div>
                  </div>
                ))}

                {customPlacas.length === 0 && (
                  <p className="text-[11px] text-on-surface/30 font-medium px-1">
                    Placas com nome e preço digitados na hora, sem vincular a um produto do estoque.
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-7 py-5 border-t border-on-surface/[0.06] flex-shrink-0">
              <span className="text-sm text-on-surface/40 font-medium">
                {totalPlacas > 0
                  ? `${totalPlacas} placa${totalPlacas > 1 ? 's' : ''} · ${totalPages} folha${totalPages !== 1 ? 's' : ''} A4`
                  : 'Nenhuma placa selecionada'}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleClose}
                  className="h-10 px-5 rounded-2xl border border-on-surface/[0.08] text-[11px] font-black uppercase tracking-widest text-on-surface/50 hover:text-on-surface transition-colors active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  onClick={generatePlacaPDF}
                  disabled={totalPlacas === 0}
                  className="h-10 px-6 rounded-2xl bg-on-surface text-surface-container text-[11px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-30 hover:opacity-80 transition-all active:scale-95"
                >
                  <Printer size={14} />
                  Gerar PDF
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

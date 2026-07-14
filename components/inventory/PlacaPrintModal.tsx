'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Printer, Check, Plus, Trash2, ChevronDown, ChevronLeft, ChevronRight, FileText, Info } from 'lucide-react';
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

// Placa sheet models (mm) — plain A4 sulfite paper. Padrão and Compacta share
// the exact same font sizes; only spacing/geometry is tuned per model. lineH
// and priceBlockH are tied to the font's actual rendered height (not free
// design knobs) — shrinking them below what the font needs makes lines
// overlap.
type PlacaModelId = 'padrao' | 'compacta' | 'diminuta' | 'ampla';

interface PlacaStackModelConfig {
  layout: 'stack';
  label: string;
  width: number;
  height: number;
  marginL: number;
  marginT: number;
  colGap: number;
  rowGap: number;
  pad: number;
  cols: number;
  rows: number;
  logoW: number;
  fonts: {
    name: number;
    pricePrefix: { barcode: number; noBarcode: number };
    priceMain: { barcode: number; noBarcode: number };
    promo: number;
    barcodeCode: number;
  };
  lineH: number; // mm per name text line — must fit fonts.name, not a free spacing knob
  nameGapAfter: { barcode: number; noBarcode: number };
  priceBlockH: { barcode: number; noBarcode: number }; // must fit fonts.priceMain
  promoBlockH: number;
  barcode: { h: number; gap: number; codeGap: number };
}

// "Zonas" layout (Diminuta / Ampla): 4 fixed, non-overlapping regions —
// description (top), custom text (below it, both bottom-left aligned),
// barcode (bottom-left row) and price (bottom-right row) — approved via
// mockup. Ampla is the exact same design at 2x the physical size, so every
// absolute measurement (mm paddings, pt fonts) is `ZONE_BASE value * scale`
// instead of a second hand-tuned config; only the proportional splits
// (percentages) are shared as-is between every zone model.
interface PlacaZoneModelConfig {
  layout: 'zonas';
  label: string;
  width: number;
  height: number;
  marginL: number;
  marginT: number;
  colGap: number;
  rowGap: number;
  cols: number;
  rows: number;
  scale: number; // multiplier over the 50×25mm base geometry below
}

type PlacaAnyModelConfig = PlacaStackModelConfig | PlacaZoneModelConfig;

// Base geometry for the zone layout, tuned at the 50×25mm ("Diminuta") size
// and scaled by `model.scale` for every other zone model. Percentages are
// scale-invariant; mm/pt values are multiplied by scale.
const ZONE_BASE = {
  infoHeightPct: 0.44,      // description + custom text band (top)
  // 50/50 instead of 60/40 — a price that reads at ~0.8cm digit height for
  // a typical short value ("R$ 2,00") needs more width than a 40%-wide
  // zone can give it on a 50mm-wide card; this was widened specifically to
  // fit that, trading some barcode width for it.
  barcodeWidthPct: 0.50,
  padX: 1.06,               // mm — left/right inset for every zone
  padBottomInfo: 0.53,      // mm — gap from custom text (or lone description) to the barcode row
  padBottomInfoSolo: 2.5,   // mm — extra lift so a lone description (no custom text) isn't glued to the barcode row
  gapInfo: 0.4,             // mm — gap between description and custom text lines
  barcodePad: { top: 0.53, right: 0.53, bottom: 0.53, left: 1.06, gap: 0.4 }, // mm
  barcodeFillW: 0.96,       // fraction of the barcode zone's padded content box
  barcodeFillH: 0.78,
  pricePadX: 0.8,           // mm — left/right inset for the price zone
  fonts: {
    desc: 8.25, custom: 6.75, // pt
    // Price is NOT a fixed size — priceMaxPt is a generous ceiling and the
    // real per-string size is found by fitZonePriceFont, which measures the
    // actual text and grows the font as large as the zone allows (down to
    // priceMinPt only for pathologically long values). At this ceiling/
    // ratio, a short price like "R$ 2,00" lands at a ~0.8cm digit height.
    priceMaxPt: 40, priceMinPt: 6, pricePrefixRatio: 0.12,
    barcodeCode: 3.38,        // pt
  },
} as const;

const ptToMm = (pt: number) => pt * 0.352778;

// Manual ellipsis truncation — jsPDF has no CSS text-overflow equivalent.
function truncateToWidth(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.getTextWidth(text.slice(0, mid) + '…') <= maxWidth) lo = mid; else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo) + '…' : '…';
}

// Finds the largest price font (mainPt, with prefixPt = mainPt*prefixRatio)
// that fits prefixText+mainText within maxWidth, measured with the SAME
// jsPDF instance that will actually render it — no hand-derived font-metric
// approximation, so it's exact for whatever the PDF prints. Only shrinks
// below maxPt when the specific string genuinely needs it.
function fitZonePriceFont(
  measureDoc: jsPDF,
  prefixText: string,
  mainText: string,
  maxWidth: number,
  maxPt: number,
  minPt: number,
  prefixRatio: number
): { mainPt: number; prefixPt: number } {
  measureDoc.setFont('helvetica', 'bold');
  const widthAt = (pt: number) => {
    const prefixPt = pt * prefixRatio;
    measureDoc.setFontSize(prefixPt);
    const w1 = prefixText ? measureDoc.getTextWidth(prefixText) : 0;
    measureDoc.setFontSize(pt);
    const w2 = measureDoc.getTextWidth(mainText);
    return w1 + w2;
  };
  if (widthAt(maxPt) <= maxWidth) return { mainPt: maxPt, prefixPt: maxPt * prefixRatio };
  let lo = minPt, hi = maxPt;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (widthAt(mid) <= maxWidth) lo = mid; else hi = mid;
  }
  return { mainPt: lo, prefixPt: lo * prefixRatio };
}

// Shared singleton purely for text-width measurement in the live preview —
// lets the React card use the exact same font-metric source as the PDF
// instead of a separate approximation, so preview and print agree.
let zoneMeasureDoc: jsPDF | null = null;
function getZoneMeasureDoc(): jsPDF {
  if (!zoneMeasureDoc) zoneMeasureDoc = new jsPDF({ unit: 'mm' });
  return zoneMeasureDoc;
}

const PLACA_MODELS: Record<PlacaModelId, PlacaAnyModelConfig> = {
  padrao: {
    layout: 'stack',
    label: 'Padrão · 10×5cm',
    width: 100, height: 50,
    marginL: 5, marginT: 15, colGap: 0, rowGap: 0, pad: 4,
    cols: 2, rows: 5,
    logoW: 18,
    fonts: {
      name: 15,
      pricePrefix: { barcode: 14, noBarcode: 18 },
      priceMain: { barcode: 24, noBarcode: 32 },
      promo: 9,
      barcodeCode: 6,
    },
    lineH: 6,
    nameGapAfter: { barcode: 4, noBarcode: 12 },
    priceBlockH: { barcode: 10, noBarcode: 16 },
    promoBlockH: 8,
    // codeGap is a bottom-clearance buffer for centering math (the code
    // text's own descender), not a real inter-element gap — keep it close
    // to that real need so the whole stack centers accurately instead of
    // reserving far more room than the code number actually uses.
    barcode: { h: 9, gap: 3, codeGap: 1.5 },
  },
  compacta: {
    layout: 'stack',
    label: 'Compacta · 8×4cm',
    width: 80, height: 40,
    marginL: 25, marginT: 15, colGap: 0, rowGap: 0, pad: 2.5,
    cols: 2, rows: 6,
    logoW: 12,
    // Same type scale as padrão — only spacing shrinks, and only down to
    // what a 15pt/32pt/24pt font actually needs to avoid overlapping.
    fonts: {
      name: 15,
      pricePrefix: { barcode: 14, noBarcode: 18 },
      priceMain: { barcode: 24, noBarcode: 32 },
      promo: 9,
      barcodeCode: 6,
    },
    lineH: 6,
    // Gaps sized so every transition (name→price, price→promo, barcode
    // image→code) keeps at least ~2mm of clear whitespace, not just enough
    // to avoid literal glyph overlap. priceBlockH.barcode is sized for the
    // stricter of its two possible "next" elements (promo text), not
    // padded far beyond that, so the barcode+price+name stack actually
    // fits the 40mm card instead of relying on the centering math to mask
    // an overflow.
    nameGapAfter: { barcode: 4, noBarcode: 6 },
    priceBlockH: { barcode: 7, noBarcode: 14 },
    promoBlockH: 4,
    barcode: { h: 6, gap: 4, codeGap: 1.5 },
  },
  // "Zonas" layout — 4 fixed regions instead of a centered stack. Ampla is
  // the same design as Diminuta at exactly 2x the physical size (see
  // ZONE_BASE), not a separately tuned config.
  diminuta: {
    layout: 'zonas',
    label: 'Diminuta · 5×2,5cm',
    width: 50, height: 25,
    marginL: 5, marginT: 11, colGap: 0, rowGap: 0,
    cols: 4, rows: 11,
    scale: 1,
  },
  ampla: {
    layout: 'zonas',
    label: 'Ampla · 10×5cm',
    width: 100, height: 50,
    marginL: 5, marginT: 15, colGap: 0, rowGap: 0,
    cols: 2, rows: 5,
    scale: 2,
  },
};

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

interface CustomPlacaComum {
  kind: 'comum';
  id: string;
  name: string;
  price: string;
  qty: number;
  customText?: string;
}

interface CustomPlacaInformativa {
  kind: 'informativa';
  id: string;
  principal: string;
  secundaria: string;
  terciaria: string;
  qty: number;
}

type CustomPlaca = CustomPlacaComum | CustomPlacaInformativa;

type QueueEntry =
  | { kind: 'comum'; name: string; price: number; code: string; customText?: string }
  | { kind: 'informativa'; principal: string; secundaria: string; terciaria: string };

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

interface PlacaCardPreviewProps {
  entry: QueueEntry;
  showBarcode: boolean;
  showOferta: boolean;
  batchText: string;
  model: PlacaModelId;
}

// Zone-layout preview (Diminuta / Ampla). Every measurement below is
// expressed as a fraction of the card's WIDTH (cqw) — since both zone
// models share the same 2:1 aspect ratio and are literally the same design
// at different physical scales, a width-relative fraction is scale- and
// model-invariant, so this single component serves every zone model with
// no per-model props needed. Values mirror ZONE_BASE (mm/pt) converted to
// "% of the 50mm base width" — see ZONE_BASE for the source numbers.
function PlacaZoneCardPreview({ entry, showBarcode, batchText }: { entry: QueueEntry; showBarcode: boolean; batchText: string }) {
  const descText = entry.kind === 'comum' ? (entry.name || '—') : (entry.principal || '—');
  const customText = entry.kind === 'comum' ? (entry.customText || batchText || '') : (entry.terciaria || '');
  const hasCustom = !!customText;
  const hasBarcode = entry.kind === 'comum' && showBarcode && !!entry.code;
  const barcodeCode = entry.kind === 'comum' ? entry.code : '';
  const barcodeDataUrl = hasBarcode ? generateBarcodeDataUrl(barcodeCode) : null;

  const priceStr = entry.kind === 'comum'
    ? entry.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : (entry.secundaria || '');
  const priceIsMoney = entry.kind === 'comum';

  // Same fitZonePriceFont the PDF uses, measured with a real jsPDF instance
  // (see getZoneMeasureDoc) so the preview's price size matches the print
  // exactly instead of guessing from string length.
  const { mainCqw, prefixCqw } = useMemo(() => {
    if (!priceStr) return { mainCqw: 0, prefixCqw: 0 };
    const prefixText = priceIsMoney ? 'R$ ' : '';
    const priceZoneWmm = 50 * (1 - ZONE_BASE.barcodeWidthPct);
    const maxWmm = priceZoneWmm - ZONE_BASE.pricePadX * 2;
    const { mainPt, prefixPt } = fitZonePriceFont(
      getZoneMeasureDoc(), prefixText, priceStr, maxWmm,
      ZONE_BASE.fonts.priceMaxPt, ZONE_BASE.fonts.priceMinPt, ZONE_BASE.fonts.pricePrefixRatio
    );
    return { mainCqw: (ptToMm(mainPt) / 50) * 100, prefixCqw: (ptToMm(prefixPt) / 50) * 100 };
  }, [priceStr, priceIsMoney]);

  return (
    <div className="relative aspect-[2/1] rounded-lg border border-dashed border-on-surface/25 bg-white overflow-hidden [container-type:inline-size]">
      {/* Description + custom text — bottom-packed, left-aligned */}
      <div
        className="absolute left-0 right-0 top-0 flex flex-col items-start justify-end text-left"
        style={{
          height: '22cqw',
          paddingLeft: '2.12cqw', paddingRight: '2.12cqw',
          paddingBottom: hasCustom ? '1.06cqw' : '5cqw',
          gap: '0.8cqw',
        }}
      >
        <p className="font-black text-[#1C1C1A] leading-[1.05] line-clamp-2" style={{ fontSize: '5.82cqw' }}>
          {descText}
        </p>
        {hasCustom && (
          <p
            className="font-bold leading-none whitespace-nowrap overflow-hidden text-ellipsis max-w-full"
            style={{ fontSize: '4.76cqw', color: '#EE2B2B' }}
          >
            {customText}
          </p>
        )}
      </div>

      {/* Barcode — bottom-left row, left-aligned */}
      <div
        className="absolute left-0 flex flex-col items-start justify-center"
        style={{
          top: '22cqw', height: '28cqw', width: '50%',
          paddingTop: '1.06cqw', paddingRight: '1.06cqw', paddingBottom: '1.06cqw', paddingLeft: '2.12cqw',
          gap: '0.8cqw',
        }}
      >
        {hasBarcode && barcodeDataUrl && (
          <>
            <img src={barcodeDataUrl} alt="" style={{ width: '96%', height: '78%' }} />
            <span className="font-mono text-on-surface/50" style={{ fontSize: '2.38cqw' }}>{barcodeCode}</span>
          </>
        )}
      </div>

      {/* Price — bottom-right row, centered */}
      <div
        className="absolute right-0 flex items-center justify-center text-center"
        style={{ top: '22cqw', height: '28cqw', width: '50%', paddingLeft: '1.6cqw', paddingRight: '1.6cqw' }}
      >
        {priceStr && (
          <p className="font-black leading-none whitespace-nowrap" style={{ color: '#EE2B2B' }}>
            {priceIsMoney && (
              <span style={{ color: '#8A241C', fontSize: prefixCqw + 'cqw' }}>R$ </span>
            )}
            <span style={{ fontSize: mainCqw + 'cqw' }}>{priceStr}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function PlacaCardPreview({ entry, showBarcode, showOferta, batchText, model }: PlacaCardPreviewProps) {
  if (PLACA_MODELS[model].layout === 'zonas') {
    return <PlacaZoneCardPreview entry={entry} showBarcode={showBarcode} batchText={batchText} />;
  }

  let mainText: string;
  let priceNode: React.ReactNode;
  let promoText: string | undefined;
  let hasBarcode = false;
  let barcodeCode = '';

  if (entry.kind === 'comum') {
    hasBarcode = showBarcode && !!entry.code;
    barcodeCode = entry.code;
    mainText = entry.name || '—';
    promoText = entry.customText || batchText || undefined;
    priceNode = (
      <>
        <span style={{ color: '#8A241C' }} className="text-[6cqw] align-top">R$ </span>
        {entry.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </>
    );
  } else {
    mainText = entry.principal || '—';
    promoText = entry.terciaria || undefined;
    priceNode = entry.secundaria || '';
  }

  const barcodeDataUrl = hasBarcode ? generateBarcodeDataUrl(barcodeCode) : null;

  return (
    <div className="relative aspect-[2/1] rounded-lg border border-dashed border-on-surface/25 bg-white overflow-hidden [container-type:inline-size]">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[1cqw] px-[4cqw] text-center">
        <p className="text-[7cqw] font-black leading-tight text-[#1C1C1A] line-clamp-2">{mainText}</p>
        <p className="text-[12cqw] font-black leading-none" style={{ color: '#EE2B2B' }}>{priceNode}</p>
        {promoText && (
          <p className="text-[4cqw] font-black" style={{ color: '#EE2B2B' }}>{promoText}</p>
        )}
        {hasBarcode && barcodeDataUrl && (
          <div className="flex flex-col items-center gap-[0.5cqw] mt-[1cqw]">
            <img src={barcodeDataUrl} alt="" className="h-[9cqw] w-auto" />
            <span className="text-[3cqw] font-mono text-on-surface/50">{barcodeCode}</span>
          </div>
        )}
      </div>

      {showOferta && (
        <div className="absolute top-0 right-0 bg-[#FFE500] text-[#7A4A00] text-[4cqw] font-black px-[3cqw] py-[1cqw]">
          OFERTA
        </div>
      )}

      <img
        src="/brand/logo.png"
        alt=""
        className={cn(
          'absolute bottom-[2cqw] right-[2cqw] opacity-90',
          model === 'compacta' ? 'w-[7cqw]' : 'w-[10cqw]'
        )}
      />
    </div>
  );
}

export function PlacaPrintModal({ isOpen, onClose, products }: PlacaPrintModalProps) {
  const [search, setSearch] = useState('');
  const [selections, setSelections] = useState<Record<string, PlacaSelection>>({});
  const [customPlacas, setCustomPlacas] = useState<CustomPlaca[]>([]);
  const [batchText, setBatchText] = useState('');
  const [showBarcode, setShowBarcode] = useState(true);
  const [showOferta, setShowOferta] = useState(false);
  const [placaModel, setPlacaModel] = useState<PlacaModelId>('padrao');
  const [activeTab, setActiveTab] = useState<'busca' | 'cards' | 'visualizacao'>('busca');
  const [showAddPlacaMenu, setShowAddPlacaMenu] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const lastCustomPlacaRef = useRef<HTMLDivElement | null>(null);
  const prevCustomPlacaCountRef = useRef(0);
  const addPlacaMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (customPlacas.length > prevCustomPlacaCountRef.current) {
      lastCustomPlacaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    prevCustomPlacaCountRef.current = customPlacas.length;
  }, [customPlacas.length]);

  useEffect(() => {
    if (!showAddPlacaMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (addPlacaMenuRef.current && !addPlacaMenuRef.current.contains(e.target as Node)) {
        setShowAddPlacaMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAddPlacaMenu]);

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

  const totalPerPage = PLACA_MODELS[placaModel].cols * PLACA_MODELS[placaModel].rows;
  const totalPages = totalPlacas > 0 ? Math.ceil(totalPlacas / totalPerPage) : 0;

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
        queue.push({ kind: 'comum', name: nameOverride || p.name, price, code, customText });
      }
    });
    customPlacas.forEach(cp => {
      if (cp.kind === 'comum') {
        const price = parseFloat(cp.price.replace(',', '.')) || 0;
        for (let i = 0; i < (cp.qty || 1); i++) {
          queue.push({ kind: 'comum', name: cp.name, price, code: '', customText: cp.customText });
        }
      } else {
        for (let i = 0; i < (cp.qty || 1); i++) {
          queue.push({ kind: 'informativa', principal: cp.principal, secundaria: cp.secundaria, terciaria: cp.terciaria });
        }
      }
    });
    return queue;
  }, [selectedIds, selections, products, customPlacas]);

  const clampedPreviewPage = totalPages > 0 ? Math.min(previewPage, totalPages - 1) : 0;
  const previewEntries = placaQueue.slice(clampedPreviewPage * totalPerPage, clampedPreviewPage * totalPerPage + totalPerPage);

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

  const addCustomPlaca = useCallback((kind: 'comum' | 'informativa') => {
    setCustomPlacas(prev => [
      ...prev,
      kind === 'comum'
        ? { kind: 'comum' as const, id: nextCustomPlacaId(), name: '', price: '', qty: 1 }
        : { kind: 'informativa' as const, id: nextCustomPlacaId(), principal: '', secundaria: '', terciaria: '', qty: 1 }
    ]);
    setShowAddPlacaMenu(false);
  }, []);

  const removeCustomPlaca = useCallback((id: string) => {
    setCustomPlacas(prev => prev.filter(cp => cp.id !== id));
  }, []);

  const updateCustomPlaca = useCallback((id: string, patch: Partial<CustomPlaca>) => {
    setCustomPlacas(prev => prev.map(cp => cp.id === id ? { ...cp, ...patch } as CustomPlaca : cp));
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
    setPlacaModel('padrao');
    setActiveTab('busca');
    setShowAddPlacaMenu(false);
    setPreviewPage(0);
    onClose();
  };

  const drawPlacaStack = (
    doc: jsPDF,
    x: number,
    y: number,
    entry: QueueEntry,
    logoDataUrl: string | null,
    model: PlacaStackModelConfig
  ) => {
    const { width: placaW, height: placaH, pad, lineH, fonts } = model;
    const centerX = x + placaW / 2;
    const cw = placaW - pad * 2;

    // cut guides (dashed rect) — plain paper, user cuts by hand
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.15);
    doc.setLineDashPattern([1, 1], 0);
    doc.rect(x, y, placaW, placaH);
    doc.setLineDashPattern([], 0);

    if (entry.kind === 'comum') {
      const { name, price: priceValue, code, customText } = entry;
      const price = priceValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const text = customText || batchText;

      const hasBarcode = showBarcode && !!code;
      // Bigger price when there's no barcode taking up space at the bottom
      const priceMainSize = hasBarcode ? fonts.priceMain.barcode : fonts.priceMain.noBarcode;
      const pricePrefixSize = hasBarcode ? fonts.pricePrefix.barcode : fonts.pricePrefix.noBarcode;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fonts.name);
      const nameLines = doc.splitTextToSize(name || '—', cw).slice(0, 2);

      // Block heights (mm), used to vertically center the whole stack in the placa.
      // When there's no barcode there's a lot of spare room, so give name/price
      // more breathing room instead of packing them tight at their old spacing.
      const nameGapAfter = hasBarcode ? model.nameGapAfter.barcode : model.nameGapAfter.noBarcode;
      const nameBlockH = nameLines.length * lineH + nameGapAfter;
      const priceBlockH = hasBarcode ? model.priceBlockH.barcode : model.priceBlockH.noBarcode;
      const promoBlockH = text ? model.promoBlockH : 0;
      const barcodeBlockH = hasBarcode ? model.barcode.h + model.barcode.gap + model.barcode.codeGap : 0;
      // lineH is included here because cy starts at startY + lineH (the first
      // name line's own baseline offset) — leaving it out of the centering sum
      // understated the stack's true height, so the whole thing rendered
      // shifted down and could run past the bottom padding.
      const totalBlockH = lineH + nameBlockH + priceBlockH + promoBlockH + barcodeBlockH;
      const startY = y + pad + Math.max(0, (placaH - pad * 2 - totalBlockH) / 2);

      let cy = startY + lineH;

      // Product name (1-2 lines, centered)
      doc.setFontSize(fonts.name);
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
        doc.setFontSize(fonts.promo);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLOR_RED);
        doc.text(text, centerX, cy, { align: 'center' });
        cy += promoBlockH;
      }

      // Barcode + code
      if (hasBarcode) {
        try {
          const bcW = Math.min(45, cw);
          const bcH = model.barcode.h;
          const bcDataUrl = generateBarcodeDataUrl(code);
          doc.addImage(bcDataUrl, 'PNG', centerX - bcW / 2, cy, bcW, bcH);
          cy += bcH + model.barcode.gap;
          doc.setFontSize(fonts.barcodeCode);
          doc.setFont('courier', 'normal');
          doc.setTextColor(95, 94, 90);
          doc.text(code, centerX, cy, { align: 'center' });
        } catch { /* skip barcode on error */ }
      }
    } else {
      // Informativa — no linked product, so no barcode. The three fields reuse
      // the same font/position as name → price → promo, just with free text.
      const { principal, secundaria, terciaria } = entry;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fonts.name);
      const principalLines = doc.splitTextToSize(principal || '—', cw).slice(0, 2);

      const nameBlockH = principalLines.length * lineH + model.nameGapAfter.noBarcode;
      const priceBlockH = model.priceBlockH.noBarcode;
      const promoBlockH = terciaria ? model.promoBlockH : 0;
      const totalBlockH = lineH + nameBlockH + priceBlockH + promoBlockH;
      const startY = y + pad + Math.max(0, (placaH - pad * 2 - totalBlockH) / 2);

      let cy = startY + lineH;

      doc.setFontSize(fonts.name);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(28, 28, 26);
      doc.text(principalLines, centerX, cy, { align: 'center' });
      cy += nameBlockH;

      if (secundaria) {
        doc.setFontSize(fonts.priceMain.noBarcode);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLOR_RED);
        const secLine = doc.splitTextToSize(secundaria, cw)[0] || '';
        doc.text(secLine, centerX, cy, { align: 'center' });
      }
      cy += priceBlockH;

      if (terciaria) {
        doc.setFontSize(fonts.promo);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLOR_RED);
        doc.text(terciaria, centerX, cy, { align: 'center' });
        cy += promoBlockH;
      }
    }

    // Oferta badge — top-right corner (applies to any placa kind)
    if (showOferta) {
      const badgeW = 24, badgeH = 8;
      doc.setFillColor(...COLOR_YELLOW);
      doc.rect(x + placaW - badgeW, y, badgeW, badgeH, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLOR_YELLOW_TEXT);
      doc.text('OFERTA', x + placaW - badgeW / 2, y + badgeH / 2 + 1.5, { align: 'center' });
    }

    // Brand logo — bottom-right corner (real asset, not redrawn)
    if (logoDataUrl) {
      try {
        const logoW = model.logoW;
        const logoH = logoW * (79 / 140); // aspect ratio of public/brand/logo.png
        doc.addImage(logoDataUrl, 'PNG', x + placaW - logoW - 3, y + placaH - logoH - 3, logoW, logoH);
      } catch { /* skip logo on error */ }
    }
  };

  // Zone layout (Diminuta / Ampla) — 4 fixed, non-overlapping regions instead
  // of a centered stack. No oferta badge / logo: the approved design fills
  // the card edge-to-edge and has no space reserved for either.
  const drawPlacaZoned = (
    doc: jsPDF,
    x: number,
    y: number,
    entry: QueueEntry,
    model: PlacaZoneModelConfig
  ) => {
    const { width: W, height: H, scale } = model;
    const B = ZONE_BASE;

    // cut guides (dashed rect) — plain paper, user cuts by hand
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.15);
    doc.setLineDashPattern([1, 1], 0);
    doc.rect(x, y, W, H);
    doc.setLineDashPattern([], 0);

    const padX = B.padX * scale;
    const padBottomInfo = B.padBottomInfo * scale;
    const padBottomInfoSolo = B.padBottomInfoSolo * scale;
    const gapInfo = B.gapInfo * scale;

    const infoH = H * B.infoHeightPct;
    const rowTop = y + infoH;
    const rowH = H - infoH;
    const barcodeW = W * B.barcodeWidthPct;
    const priceW = W - barcodeW;

    let descText: string, customText: string;
    let hasBarcode = false, barcodeCode = '';
    let priceMainText = '', priceIsMoney = true;

    if (entry.kind === 'comum') {
      descText = entry.name || '—';
      customText = entry.customText || batchText || '';
      hasBarcode = showBarcode && !!entry.code;
      barcodeCode = entry.code;
      priceMainText = entry.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
      descText = entry.principal || '—';
      customText = entry.terciaria || '';
      priceMainText = entry.secundaria || '';
      priceIsMoney = false;
    }
    const hasCustom = !!customText;
    const textMaxW = W - padX * 2;

    // ── Description + custom text: bottom-packed, left-aligned ──
    const descFontPt = B.fonts.desc * scale;
    const customFontPt = B.fonts.custom * scale;
    const descLineH = ptToMm(descFontPt) * 1.15;
    const customLineH = ptToMm(customFontPt) * 1.15;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(descFontPt);
    const descLines = doc.splitTextToSize(descText, textMaxW).slice(0, 2);
    const descBlockH = descLines.length * descLineH;
    const infoBottomPad = hasCustom ? padBottomInfo : padBottomInfoSolo;
    const totalBlockH = descBlockH + (hasCustom ? gapInfo + customLineH : 0);
    const startY = Math.max(y, y + infoH - infoBottomPad - totalBlockH);

    doc.setTextColor(28, 28, 26);
    doc.text(descLines, x + padX, startY + descLineH, { align: 'left' });

    if (hasCustom) {
      const customTrunc = truncateToWidth(doc, customText, textMaxW);
      doc.setFontSize(customFontPt);
      doc.setTextColor(...COLOR_RED);
      doc.text(customTrunc, x + padX, startY + descBlockH + gapInfo + customLineH, { align: 'left' });
    }

    // ── Barcode: bottom-left row, left-aligned ──
    if (hasBarcode) {
      const bp = B.barcodePad;
      const contentX = x + bp.left * scale;
      const contentY = rowTop + bp.top * scale;
      const contentW = barcodeW - (bp.left + bp.right) * scale;
      const contentH = rowH - (bp.top + bp.bottom) * scale;
      try {
        const bcDataUrl = generateBarcodeDataUrl(barcodeCode);
        const bcW = contentW * B.barcodeFillW;
        const bcH = contentH * B.barcodeFillH;
        doc.addImage(bcDataUrl, 'PNG', contentX, contentY, bcW, bcH);
        const codeFontPt = B.fonts.barcodeCode * scale;
        doc.setFont('courier', 'normal');
        doc.setFontSize(codeFontPt);
        doc.setTextColor(95, 94, 90);
        doc.text(barcodeCode, contentX, contentY + bcH + bp.gap * scale + ptToMm(codeFontPt), { align: 'left' });
      } catch { /* skip barcode on error */ }
    }

    // ── Price: bottom-right row, centered. Font is NOT a fixed size — it's
    // the largest size that fits this specific string (see fitZonePriceFont),
    // so a short price ("R$ 2,00") reads at ~0.8cm digit height instead of
    // being capped to whatever a worst-case long price would need. ──
    if (priceMainText) {
      const zoneX = x + barcodeW;
      const pricePadX = B.pricePadX * scale;
      const maxW = priceW - pricePadX * 2;
      const prefixText = priceIsMoney ? 'R$ ' : '';

      const { mainPt, prefixPt } = fitZonePriceFont(
        doc, prefixText, priceMainText, maxW,
        B.fonts.priceMaxPt * scale, B.fonts.priceMinPt * scale, B.fonts.pricePrefixRatio
      );

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(prefixPt);
      const prefixW = prefixText ? doc.getTextWidth(prefixText) : 0;
      doc.setFontSize(mainPt);
      const mainW = doc.getTextWidth(priceMainText);
      const totalW = prefixW + mainW;
      const centerX = zoneX + priceW / 2;
      // Optical baseline offset: a bold font's baseline sits ~30-35% of its
      // size below the true vertical center of its line box.
      const centerY = rowTop + rowH / 2 + ptToMm(mainPt) * 0.35;
      let cx = centerX - totalW / 2;

      if (prefixText) {
        doc.setFontSize(prefixPt);
        doc.setTextColor(...COLOR_RED_DARK);
        doc.text(prefixText, cx, centerY, { align: 'left' });
        cx += prefixW;
      }
      doc.setFontSize(mainPt);
      doc.setTextColor(...COLOR_RED);
      doc.text(priceMainText, cx, centerY, { align: 'left' });
    }
  };

  const drawPlaca = (
    doc: jsPDF,
    x: number,
    y: number,
    entry: QueueEntry,
    logoDataUrl: string | null,
    model: PlacaAnyModelConfig
  ) => {
    if (model.layout === 'stack') {
      drawPlacaStack(doc, x, y, entry, logoDataUrl, model);
    } else {
      drawPlacaZoned(doc, x, y, entry, model);
    }
  };

  const generatePlacaPDF = async () => {
    let logoDataUrl: string | null = null;
    try {
      logoDataUrl = await loadImageAsDataUrl('/brand/logo.png');
    } catch { /* proceed without logo if it fails to load */ }

    const model = PLACA_MODELS[placaModel];
    const perPage = model.cols * model.rows;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let printIdx = 0;

    for (let qIdx = 0; qIdx < placaQueue.length; qIdx++) {
      if (printIdx >= perPage) {
        doc.addPage();
        printIdx = 0;
      }

      const col = printIdx % model.cols;
      const row = Math.floor(printIdx / model.cols);
      const x = model.marginL + col * (model.width + model.colGap);
      const y = model.marginT + row * (model.height + model.rowGap);

      drawPlaca(doc, x, y, placaQueue[qIdx], logoDataUrl, model);
      printIdx++;
    }

    doc.save('placas.pdf');
  };

  const TABS = [
    { id: 'busca' as const, label: 'Busca' },
    { id: 'cards' as const, label: 'Cards' },
    { id: 'visualizacao' as const, label: 'Visualização' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[600] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
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

            {/* ── TABS ── */}
            <div className="flex items-center gap-2 px-7 pt-4 pb-3 border-b border-on-surface/[0.06] flex-shrink-0">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all',
                    activeTab === tab.id
                      ? 'bg-on-surface text-surface-container shadow-lg shadow-black/10'
                      : 'text-on-surface/40 hover:bg-on-surface/5'
                  )}
                >
                  {tab.label}
                  {tab.id === 'cards' && (selectedIds.length + customPlacas.length) > 0 && (
                    <span className={cn(
                      'px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none',
                      activeTab === tab.id ? 'bg-surface-container/25 text-surface-container' : 'bg-on-surface/10 text-on-surface/60'
                    )}>
                      {selectedIds.length + customPlacas.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-7 py-5 flex flex-col gap-4 min-h-0">
              {/* ══════════ BUSCA ══════════ */}
              {activeTab === 'busca' && (
                <>
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

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-on-surface/35">Produtos</span>
                    <button
                      onClick={selectedIds.length === products.length ? clearAll : selectAll}
                      className="text-[11px] font-semibold text-on-surface/50 hover:text-on-surface transition-colors underline underline-offset-2"
                    >
                      {selectedIds.length === products.length ? 'Limpar seleção' : 'Selecionar todos'}
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    {filteredProducts.map(product => {
                      const isSelected = !!selections[product.id];
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
                          <div
                            className={cn(
                              'w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all',
                              isSelected ? 'bg-on-surface border-on-surface' : 'border-on-surface/20 bg-transparent'
                            )}
                          >
                            {isSelected && <Check size={11} strokeWidth={3} className="text-surface-container" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-on-surface truncate">{product.name}</p>
                            <p className="text-[11px] text-on-surface/40 mt-0.5">
                              {product.sku && `SKU: ${product.sku}`}
                              {product.sku && product.ean && ' · '}
                              {product.ean && `EAN: ${product.ean}`}
                              {!product.sku && !product.ean && 'Sem código'}
                            </p>
                          </div>
                        </div>
                      );
                    })}

                    {filteredProducts.length === 0 && (
                      <div className="py-12 text-center text-on-surface/30 text-sm font-medium">
                        Nenhum produto encontrado
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ══════════ CARDS ══════════ */}
              {activeTab === 'cards' && (
                <>
                  {/* Global print options */}
                  <div className="flex flex-col gap-3 p-3.5 rounded-2xl border border-on-surface/[0.06] bg-on-surface/[0.02]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold text-on-surface/60">Modelo de impressão</span>
                      <div className="flex bg-on-surface/[0.06] rounded-lg p-0.5 gap-0.5">
                        {(Object.keys(PLACA_MODELS) as PlacaModelId[]).map(id => (
                          <button
                            key={id}
                            onClick={() => setPlacaModel(id)}
                            className={cn(
                              'px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all',
                              placaModel === id
                                ? 'bg-on-surface text-surface-container shadow-sm'
                                : 'text-on-surface/40 hover:text-on-surface/70'
                            )}
                          >
                            {PLACA_MODELS[id].label}
                          </button>
                        ))}
                      </div>
                    </div>
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

                  {/* Header + add menu */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-on-surface/35">Cards</span>
                    <div ref={addPlacaMenuRef} className="relative">
                      <button
                        onClick={() => setShowAddPlacaMenu(v => !v)}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-on-surface/50 hover:text-on-surface transition-colors"
                      >
                        <Plus size={12} />
                        Adicionar placa
                        <ChevronDown size={12} className={cn('transition-transform', showAddPlacaMenu && 'rotate-180')} />
                      </button>
                      <AnimatePresence>
                        {showAddPlacaMenu && (
                          <motion.div
                            initial={{ opacity: 0, y: -6, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -6, scale: 0.96 }}
                            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                            className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[190px] rounded-xl border border-on-surface/[0.06] bg-surface-container shadow-xl shadow-black/20 overflow-hidden"
                          >
                            <button
                              onClick={() => addCustomPlaca('comum')}
                              className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-on-surface/70 hover:text-on-surface hover:bg-on-surface/[0.04] transition-colors"
                            >
                              <FileText size={14} className="text-primary" />
                              Placa comum
                            </button>
                            <div className="mx-3 h-px bg-on-surface/[0.05]" />
                            <button
                              onClick={() => addCustomPlaca('informativa')}
                              className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-on-surface/70 hover:text-on-surface hover:bg-on-surface/[0.04] transition-colors"
                            >
                              <Info size={14} className="text-primary" />
                              Placa informativa
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {selectedIds.map(id => {
                      const product = products.find(p => p.id === id);
                      const sel = selections[id];
                      if (!product || !sel) return null;
                      return (
                        <div
                          key={id}
                          className="flex flex-col gap-2.5 p-3.5 rounded-2xl border border-on-surface/10 bg-on-surface/[0.03]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-on-surface truncate">{product.name}</p>
                              <p className="text-[11px] text-on-surface/40 mt-0.5">
                                {product.sku && `SKU: ${product.sku}`}
                                {product.sku && product.ean && ' · '}
                                {product.ean && `EAN: ${product.ean}`}
                                {!product.sku && !product.ean && 'Sem código'}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="flex bg-on-surface/[0.06] rounded-lg p-0.5 gap-0.5">
                                <button
                                  onClick={() => setCodeFieldFor(id, 'ean')}
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
                                  onClick={() => setCodeFieldFor(id, 'sku')}
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

                              <input
                                type="number"
                                min={1}
                                value={sel.qty === 1 ? '' : sel.qty}
                                placeholder="0"
                                onChange={e => {
                                  const val = parseInt(e.target.value);
                                  setQty(id, val > 0 ? val : 1);
                                }}
                                className="w-12 h-8 border border-on-surface/[0.10] rounded-lg text-center text-sm font-bold text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <span className="text-[10px] text-on-surface/35 font-medium">un.</span>

                              <button
                                onClick={() => toggleProduct(id)}
                                className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-on-surface/30 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2">
                            <input
                              type="text"
                              value={sel.nameOverride ?? product.name ?? ''}
                              onChange={e => setNameOverrideFor(id, e.target.value)}
                              placeholder="Nome exibido na placa"
                              className="w-full h-8 px-2.5 border border-on-surface/[0.10] rounded-lg text-xs font-semibold text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={sel.priceOverride !== undefined ? sel.priceOverride : String(product.price ?? 0)}
                                onChange={e => setPriceOverrideFor(id, e.target.value)}
                                placeholder="Preço"
                                className="w-24 h-8 px-2.5 border border-on-surface/[0.10] rounded-lg text-xs font-bold text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors"
                              />
                              <input
                                type="text"
                                value={sel.customText ?? ''}
                                onChange={e => setCustomTextFor(id, e.target.value)}
                                placeholder="Personalizar texto desta placa (opcional)"
                                className="flex-1 h-8 px-2.5 border border-on-surface/[0.10] rounded-lg text-xs font-medium text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors placeholder:text-on-surface/30"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {customPlacas.map((cp, i) => (
                      <div
                        key={cp.id}
                        ref={i === customPlacas.length - 1 ? lastCustomPlacaRef : undefined}
                        className="flex flex-col gap-2 p-3.5 rounded-2xl border border-on-surface/10 bg-on-surface/[0.03]"
                      >
                        {cp.kind === 'comum' ? (
                          <>
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
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="flex-1 text-[10px] font-black uppercase tracking-widest text-on-surface/30">Placa informativa</span>
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
                            <input
                              type="text"
                              value={cp.principal}
                              onChange={e => updateCustomPlaca(cp.id, { principal: e.target.value })}
                              placeholder="Informação principal"
                              className="w-full h-8 px-2.5 border border-on-surface/[0.10] rounded-lg text-xs font-semibold text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors"
                            />
                            <input
                              type="text"
                              value={cp.secundaria}
                              onChange={e => updateCustomPlaca(cp.id, { secundaria: e.target.value })}
                              placeholder="Informação secundária"
                              className="w-full h-8 px-2.5 border border-on-surface/[0.10] rounded-lg text-xs font-bold text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors"
                            />
                            <input
                              type="text"
                              value={cp.terciaria}
                              onChange={e => updateCustomPlaca(cp.id, { terciaria: e.target.value })}
                              placeholder="Informação terciária"
                              className="w-full h-8 px-2.5 border border-on-surface/[0.10] rounded-lg text-xs font-medium text-on-surface bg-transparent outline-none focus:border-on-surface/30 transition-colors placeholder:text-on-surface/30"
                            />
                          </>
                        )}
                      </div>
                    ))}

                    {selectedIds.length === 0 && customPlacas.length === 0 && (
                      <div className="py-12 text-center text-on-surface/30 text-sm font-medium">
                        Nenhum card ainda — selecione produtos na aba Busca ou use "Adicionar placa".
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ══════════ VISUALIZAÇÃO ══════════ */}
              {activeTab === 'visualizacao' && (
                placaQueue.length === 0 ? (
                  <div className="py-12 text-center text-on-surface/30 text-sm font-medium">
                    Nenhuma placa selecionada para visualizar.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {previewEntries.map((entry, i) => (
                        <PlacaCardPreview
                          key={i}
                          entry={entry}
                          showBarcode={showBarcode}
                          showOferta={showOferta}
                          batchText={batchText}
                          model={placaModel}
                        />
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-4 pt-2">
                        <button
                          onClick={() => setPreviewPage(p => Math.max(0, p - 1))}
                          disabled={clampedPreviewPage === 0}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface/40 hover:text-on-surface disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span className="text-[11px] font-semibold text-on-surface/50">
                          Página {clampedPreviewPage + 1} de {totalPages}
                        </span>
                        <button
                          onClick={() => setPreviewPage(p => Math.min(totalPages - 1, p + 1))}
                          disabled={clampedPreviewPage === totalPages - 1}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface/40 hover:text-on-surface disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    )}
                  </>
                )
              )}
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

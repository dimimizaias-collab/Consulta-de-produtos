'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle, ArrowLeft, ArrowRight, Camera, CheckCircle2,
  ChevronRight, FileText, Layers, Link as LinkIcon,
  List, Minus, Plus, Save, Search, Trash2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewNote } from '@/components/requests/LogisticsCenter';
import { EanProblemButton, type EanProblem } from '@/components/shared/EanProblemButton';

// ─── types ───────────────────────────────────────────────────────────────────

interface MobileNoteViewProps {
  note: ReviewNote;
  products: any[];

  eans: string[];              setEans: React.Dispatch<React.SetStateAction<string[]>>;
  skus: string[];              setSkus: React.Dispatch<React.SetStateAction<string[]>>;
  qtys: number[];              setQtys: React.Dispatch<React.SetStateAction<number[]>>;
  itemPrices: number[];        setItemPrices: React.Dispatch<React.SetStateAction<number[]>>;
  sellPrices: number[];        setSellPrices: React.Dispatch<React.SetStateAction<number[]>>;
  verified: boolean[];         setVerified: React.Dispatch<React.SetStateAction<boolean[]>>;
  units: string[];
  multipliers: number[];
  distribuicao: string[];

  setNote: (note: ReviewNote) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  savingNote: boolean;
  onDelete: () => Promise<void>;
  onVarios: (idx: number) => void;
  eanProblems?: EanProblem[];
  onReportEanProblem?: (ean: string, desc: string, obs: string) => Promise<void>;
}

type Tab = 'itens' | 'detalhe' | 'resumo';

// ─── detect iOS ──────────────────────────────────────────────────────────────
function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

// ─── image resize helper ─────────────────────────────────────────────────────
function resizeImageBlob(file: File | Blob, maxWidth = 1500): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('canvas.toBlob failed'))),
        'image/jpeg', 0.92,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

// ─── barcode scanner ─────────────────────────────────────────────────────────

function BarcodeScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  return isIOS()
    ? <IOSBarcodeCapture onScan={onScan} onClose={onClose} />
    : <RealtimeBarcodeScanner onScan={onScan} onClose={onClose} />;
}

function IOSBarcodeCapture({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [decoding, setDecoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.click(), 80);
    return () => clearTimeout(t);
  }, []);

  async function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDecoding(true); setError(null);
    try {
      const resized = await resizeImageBlob(file, 1500);
      const { readBarcodes } = await import('zxing-wasm/reader');
      const results = await readBarcodes(resized, {
        tryHarder: true,
        formats: ['EAN13','EAN8','Code128','Code39','UPCA','UPCE','QRCode','DataMatrix','PDF417','Aztec'],
      });
      if (!results.length || !results[0].text) throw new Error('not found');
      onScan(results[0].text);
    } catch {
      setError('Código não encontrado. Tente novamente com melhor iluminação e enquadramento.');
    } finally {
      setDecoding(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="fixed inset-0 z-[300] bg-[#0a0a08] flex flex-col">
      <div className="flex items-center justify-between px-4 pt-12 pb-4 bg-[#0a0a08]">
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20">
          <X size={20} />
        </button>
        <span className="text-white font-black text-sm">Ler código de barras</span>
        <div className="w-10" />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
        {decoding ? (
          <>
            <div className="w-16 h-16 rounded-full border-2 border-[#D81E1E]/30 border-t-[#D81E1E] animate-spin" />
            <p className="text-white/60 text-sm font-medium text-center">Decodificando...</p>
          </>
        ) : error ? (
          <>
            <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertCircle size={36} className="text-red-400" />
            </div>
            <p className="text-white/80 text-sm font-bold text-center">{error}</p>
            <button onClick={() => inputRef.current?.click()}
              className="w-full max-w-xs py-4 bg-[#D81E1E] rounded-2xl text-white font-black flex items-center justify-center gap-2 active:scale-[0.97] transition-transform shadow-lg shadow-[#D81E1E]/25">
              <Camera size={18} /> Tentar novamente
            </button>
          </>
        ) : (
          <>
            <div className="w-28 h-28 rounded-[2rem] bg-[#D81E1E]/10 border border-[#D81E1E]/20 flex items-center justify-center">
              <Camera size={52} className="text-[#D81E1E]" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-white font-black text-base">Câmera nativa do iPhone</p>
              <p className="text-white/40 text-xs font-medium leading-relaxed">
                Posicione o código de barras no centro e tire uma foto.
              </p>
            </div>
            <button onClick={() => inputRef.current?.click()}
              className="w-full max-w-xs py-4 bg-[#D81E1E] rounded-2xl text-white font-black flex items-center justify-center gap-2 active:scale-[0.97] transition-transform shadow-lg shadow-[#D81E1E]/25">
              <Camera size={18} /> Abrir câmera
            </button>
          </>
        )}
      </div>
      <div className="pb-10 text-center px-8">
        <p className="text-white/20 text-[10px] font-medium">Decoder ZXing C++ (WASM) — 1D + 2D, alta precisão</p>
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} />
    </div>
  );
}

function RealtimeBarcodeScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        const scanner = new Html5Qrcode('mobile-barcode-reader', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
          ],
          verbose: false,
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 20, qrbox: { width: 300, height: 120 }, aspectRatio: 1.777 },
          (text: string) => { if (!stopped) onScan(text); },
          () => {},
        );
        if (!stopped) setStarted(true);
      } catch (e: any) {
        setError(e?.message || 'Sem acesso à câmera');
      }
    })();
    return () => { stopped = true; scannerRef.current?.stop().catch(() => {}); };
  }, []);

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/90">
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20">
          <X size={20} />
        </button>
        <span className="text-white font-black text-sm">Ler código de barras</span>
        <div className="w-10" />
      </div>
      <div className="flex-1 relative">
        <div id="mobile-barcode-reader" className="w-full h-full" />
        {started && !error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[300px] h-[120px] relative">
              {(['top-0 left-0 border-t-4 border-l-4','top-0 right-0 border-t-4 border-r-4','bottom-0 left-0 border-b-4 border-l-4','bottom-0 right-0 border-b-4 border-r-4'] as const).map((cls, i) => (
                <div key={i} className={cn('absolute w-6 h-6 border-[#D81E1E] rounded-sm', cls)} />
              ))}
              <motion.div
                animate={{ top: ['20%','75%','20%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute left-0 right-0 h-0.5 bg-[#D81E1E]/80 shadow-[0_0_8px_#D81E1E]"
              />
            </div>
          </div>
        )}
        {!started && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-8">
            <AlertCircle size={40} className="text-red-400" />
            <p className="text-white text-sm font-bold text-center">{error}</p>
            <button onClick={onClose} className="mt-2 px-6 py-3 bg-white/10 rounded-xl text-white font-bold text-sm">Fechar</button>
          </div>
        )}
      </div>
      <div className="px-4 py-4 bg-black/90 text-center">
        <p className="text-white/40 text-xs font-medium">Aponte para o código de barras e aguarde</p>
      </div>
    </div>
  );
}

// ─── linking panel ────────────────────────────────────────────────────────────

function LinkingPanel({ idx, item, products, onLink, onClose }: {
  idx: number; item: any; products: any[];
  onLink: (product: any) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const results = q.trim().length < 2 ? [] : products.filter(p => {
    const s = q.toLowerCase();
    return (p.name?.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s) || p.ean?.toLowerCase().includes(s));
  }).slice(0, 10);

  return (
    <motion.div
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
      className="absolute inset-0 z-20 bg-[#141410] flex flex-col"
    >
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[0.07]">
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] text-white/60">
          <X size={18} />
        </button>
        <div>
          <p className="text-xs font-black text-white/90">Vincular produto</p>
          <p className="text-[10px] text-white/35 font-medium truncate max-w-[220px]">{item.original_description || item.description || 'Item ' + (idx + 1)}</p>
        </div>
      </div>
      <div className="px-4 py-3 border-b border-white/[0.07]">
        <div className="flex items-center gap-2 bg-white/[0.06] rounded-xl px-3 py-2.5 border border-white/[0.07]">
          <Search size={14} className="text-white/30 shrink-0" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Nome, SKU ou EAN..."
            className="flex-1 bg-transparent text-sm text-[#f2f0e3] placeholder:text-white/25 outline-none font-medium" />
          {q && <button onClick={() => setQ('')}><X size={13} className="text-white/30" /></button>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {q.trim().length < 2 ? (
          <div className="flex flex-col items-center justify-center h-full pb-8 text-white/20">
            <Search size={32} className="mb-3 opacity-40" />
            <p className="text-xs font-bold">Digite pelo menos 2 letras</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full pb-8 text-white/20">
            <p className="text-xs font-bold">Nenhum produto encontrado</p>
          </div>
        ) : (
          <div className="py-2">
            {results.map(p => (
              <button key={p.id} onClick={() => onLink(p)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] active:bg-white/[0.07] transition-colors text-left border-b border-white/[0.04]">
                <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.06] flex items-center justify-center shrink-0 text-white/20 text-xs font-black overflow-hidden">
                  {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <span>{p.name?.[0]?.toUpperCase() || '?'}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#f2f0e3] truncate">{p.name}</p>
                  <p className="text-[10px] text-white/35 font-medium">{[p.sku, p.ean].filter(Boolean).join(' · ') || 'sem código'}</p>
                </div>
                <ChevronRight size={14} className="text-white/20 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function MobileNoteView({
  note, products,
  eans, setEans, skus, setSkus, qtys, setQtys,
  itemPrices, setItemPrices, sellPrices, setSellPrices,
  verified, setVerified, units, multipliers, distribuicao,
  setNote, onClose, onSave, savingNote, onDelete, onVarios,
  eanProblems = [],
  onReportEanProblem,
}: MobileNoteViewProps) {
  const [tab, setTab] = useState<Tab>('itens');
  const [activeIdx, setActiveIdx] = useState(0);
  const [query, setQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [linkingPanel, setLinkingPanel] = useState(false);
  const detailScrollRef = useRef<HTMLDivElement>(null);

  const items = note.items as any[];
  const totalItems = items.length;
  const verifiedCount = verified.filter(Boolean).length;

  // value helpers
  const ean      = (i: number) => eans[i]       ?? items[i]?.ean           ?? '';
  const sku      = (i: number) => skus[i]       ?? items[i]?.sku           ?? '';
  const qty      = (i: number) => qtys[i]       ?? items[i]?.qty           ?? 0;
  const cost     = (i: number) => { const raw = itemPrices[i] ?? items[i]?.price ?? 0; const mult = multipliers[i] ?? items[i]?.multiplier ?? 1; return raw / (mult || 1); };
  const sell     = (i: number) => sellPrices[i] ?? items[i]?.product_price ?? 0;
  const isVerif  = (i: number) => verified[i]   ?? items[i]?.verified      ?? false;
  const unit     = (i: number) => units[i]      ?? items[i]?.unit          ?? 'UN';
  const markup   = (i: number) => { const c = cost(i); const s = sell(i); return c > 0 && s > 0 ? ((s - c) / c * 100).toFixed(1) : null; };

  // totals for Resumo tab
  const totalCost  = items.reduce((s, _, i) => s + cost(i) * qty(i), 0);
  const totalRevenue = items.reduce((s, _, i) => s + sell(i) * qty(i), 0);
  const totalMarkup = totalRevenue > 0 && totalCost > 0
    ? ((totalRevenue - totalCost) / totalCost * 100).toFixed(1) : null;

  const filteredItems = items.map((item, i) => ({ item, i })).filter(({ item, i }) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (item.original_description || item.description || '').toLowerCase().includes(q)
      || (item.supplier_code || '').toLowerCase().includes(q)
      || ean(i).toLowerCase().includes(q)
      || sku(i).toLowerCase().includes(q)
      || (item.name || '').toLowerCase().includes(q);
  });

  function openDetail(i: number) {
    setActiveIdx(i);
    setLinkingPanel(false);
    setTab('detalhe');
    setTimeout(() => detailScrollRef.current?.scrollTo({ top: 0 }), 50);
  }

  function handleScan(code: string) {
    setEans(prev => { const u = [...prev]; u[activeIdx] = code; return u; });
    setScannerOpen(false);
  }

  function handleLinkProduct(product: any) {
    const updatedItems = [...items];
    updatedItems[activeIdx] = {
      ...updatedItems[activeIdx],
      product_id: product.id,
      name: product.name,
      sku: product.sku || updatedItems[activeIdx].sku,
      ean: product.ean || updatedItems[activeIdx].ean,
      product_price: product.price || 0,
      verified: true,
    };
    setNote({ ...note, items: updatedItems });
    setSkus(prev => { const u = [...prev]; u[activeIdx] = product.sku || items[activeIdx]?.sku || ''; return u; });
    setEans(prev => { const u = [...prev]; u[activeIdx] = product.ean || items[activeIdx]?.ean || ''; return u; });
    setSellPrices(prev => { const u = [...prev]; u[activeIdx] = product.price || 0; return u; });
    setVerified(prev => { const u = [...prev]; u[activeIdx] = true; return u; });
    setLinkingPanel(false);
  }

  const activeItem = items[activeIdx];

  // ─── avatar / badge helpers ───────────────────────────────────────────────
  function avatarClass(i: number) {
    return isVerif(i)
      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
      : 'bg-white/[0.06] border-white/[0.08] text-white/40';
  }

  // ─── bottom tab bar items ─────────────────────────────────────────────────
  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'itens',   label: 'Itens',   icon: <List size={20} /> },
    { id: 'detalhe', label: 'Detalhe', icon: <FileText size={20} /> },
    { id: 'resumo',  label: 'Resumo',  icon: <CheckCircle2 size={20} /> },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="fixed inset-0 z-[200] bg-[#0e0e0a] flex flex-col overflow-hidden"
    >
      {/* ── SCANNER ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {scannerOpen && <BarcodeScanner onScan={handleScan} onClose={() => setScannerOpen(false)} />}
      </AnimatePresence>

      {/* ── TOP BAR ─────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#1a1a14] border-b border-white/[0.07] px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] text-white/60 active:bg-white/10 transition-colors shrink-0"
            >
              <X size={18} />
            </button>
            <div className="min-w-0">
              <p className="text-[15px] font-black text-[#f2f0e3] leading-tight truncate">
                {note.fileName || 'Nota sem nome'}
              </p>
              <p className="text-[10px] text-white/35 font-medium">
                {note.noteNumber && `${note.noteNumber} · `}{totalItems} itens
              </p>
            </div>
          </div>
          {/* progress chip */}
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <span className="text-emerald-400 font-black text-sm">{verifiedCount}</span>
            <span className="text-white/25 text-xs font-bold">/ {totalItems}</span>
          </div>
        </div>
        {/* progress bar */}
        <div className="mt-2.5 h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-emerald-500 rounded-full"
            animate={{ width: totalItems > 0 ? `${(verifiedCount / totalItems) * 100}%` : '0%' }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          />
        </div>
      </div>

      {/* ── TAB CONTENT ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">

        {/* ════ ITENS TAB ════════════════════════════════════════════ */}
        {tab === 'itens' && (
          <div className="flex flex-col h-full">
            {/* search */}
            <div className="shrink-0 px-4 py-2.5 bg-[#141410] border-b border-white/[0.05]">
              <div className="flex items-center gap-2 bg-white/[0.06] rounded-xl px-3 py-2 border border-white/[0.06]">
                <Search size={13} className="text-white/25 shrink-0" />
                <input
                  value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar produto ou código..."
                  className="flex-1 bg-transparent text-sm text-[#f2f0e3] placeholder:text-white/20 outline-none font-medium"
                />
                {query && <button onClick={() => setQuery('')}><X size={13} className="text-white/30" /></button>}
              </div>
            </div>
            {/* list */}
            <div className="flex-1 overflow-y-auto">
              {filteredItems.map(({ item, i }) => (
                <button
                  key={i} onClick={() => openDetail(i)}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] text-left relative transition-colors active:bg-white/[0.05] bg-transparent"
                >
                  {i === activeIdx && (
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#D81E1E] rounded-r" />
                  )}
                  <div className={cn('w-11 h-11 rounded-full flex items-center justify-center font-black text-sm shrink-0 border', avatarClass(i))}>
                    {item.seq ?? i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-black text-[#f2f0e3] truncate leading-tight">
                        {item.original_description || item.description || item.name || `Item ${i + 1}`}
                      </p>
                      <span className="text-xs font-black text-white/50 shrink-0 font-mono">
                        {sell(i) > 0 ? `R$ ${sell(i).toFixed(2)}` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-[10px] text-white/30 font-medium truncate">
                        {[item.supplier_code && `Cód. ${item.supplier_code}`, ean(i) && `EAN ${ean(i)}`, `${unit(i)} × ${qty(i)}`].filter(Boolean).join(' · ')}
                      </p>
                      <span className={cn(
                        'text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0',
                        isVerif(i) ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[#D81E1E]/10 text-[#f87171]'
                      )}>
                        {isVerif(i) ? 'OK' : 'Pendente'}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-white/15 shrink-0" />
                </button>
              ))}
              {filteredItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-white/15">
                  <Search size={36} className="mb-3 opacity-30" />
                  <p className="text-xs font-bold">Nenhum item encontrado</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════ DETALHE TAB ══════════════════════════════════════════ */}
        {tab === 'detalhe' && activeItem && (
          <div className="flex flex-col h-full relative">
            {/* item navigator */}
            <div className="shrink-0 bg-[#141410] border-b border-white/[0.05] px-4 py-2 flex items-center gap-2">
              <button
                disabled={activeIdx === 0}
                onClick={() => openDetail(activeIdx - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.06] text-white/50 disabled:opacity-25 active:bg-white/10 transition-colors"
              >
                <ArrowLeft size={15} />
              </button>
              <div className="flex-1 text-center">
                <p className="text-[10px] font-black text-white/40">
                  Item <span className="text-[#f2f0e3]">{activeIdx + 1}</span> de {totalItems}
                </p>
              </div>
              <button
                disabled={activeIdx === totalItems - 1}
                onClick={() => openDetail(activeIdx + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.06] text-white/50 disabled:opacity-25 active:bg-white/10 transition-colors"
              >
                <ArrowRight size={15} />
              </button>
            </div>

            {/* scrollable content */}
            <div ref={detailScrollRef} className="flex-1 overflow-y-auto pb-4">

              {/* product header card */}
              <div className="m-4 bg-[#1c1c16] rounded-2xl border border-white/[0.07] p-4 flex items-center gap-3">
                <div className={cn(
                  'w-12 h-12 rounded-full border flex items-center justify-center font-black text-base shrink-0',
                  isVerif(activeIdx)
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-[#D81E1E]/10 border-[#D81E1E]/25 text-[#f87171]'
                )}>
                  {activeItem.seq ?? activeIdx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-[#f2f0e3] leading-tight">
                    {activeItem.original_description || activeItem.description || activeItem.name || `Item ${activeIdx + 1}`}
                  </p>
                  <p className="text-[10px] text-white/30 font-medium mt-0.5">
                    Cód. fornecedor: {activeItem.supplier_code || '—'}
                  </p>
                </div>
                {/* verify toggle */}
                <button
                  onClick={() => setVerified(prev => { const u = [...prev]; u[activeIdx] = !isVerif(activeIdx); return u; })}
                  className={cn(
                    'w-10 h-10 rounded-full border flex items-center justify-center transition-all active:scale-90 shrink-0',
                    isVerif(activeIdx)
                      ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400'
                      : 'bg-white/[0.04] border-white/[0.08] text-white/20'
                  )}
                >
                  <CheckCircle2 size={18} />
                </button>
              </div>

              {/* Identificação */}
              <SectionLabel>Identificação</SectionLabel>
              <div className="mx-4 mb-3 bg-[#1c1c16] rounded-2xl border border-white/[0.07] overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05]">
                  <span className="text-[10px] font-black text-white/40 w-10 shrink-0">EAN</span>
                  <input
                    value={ean(activeIdx)}
                    onChange={e => setEans(prev => { const u = [...prev]; u[activeIdx] = e.target.value; return u; })}
                    placeholder="—"
                    className="flex-1 bg-transparent text-sm font-bold text-[#f2f0e3] outline-none placeholder:text-white/15"
                  />
                  <button
                    onClick={() => setScannerOpen(true)}
                    className="w-10 h-10 rounded-xl bg-[#D81E1E] flex items-center justify-center text-white shrink-0 shadow-lg shadow-[#D81E1E]/30 active:scale-95 transition-transform"
                  >
                    <Camera size={18} />
                  </button>
                  {ean(activeIdx).trim() && onReportEanProblem && (
                    <EanProblemButton
                      ean={ean(activeIdx)}
                      problems={eanProblems}
                      onReport={(e, desc, obs) => onReportEanProblem(e, desc, obs)}
                      size="sm"
                    />
                  )}
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-[10px] font-black text-white/40 w-10 shrink-0">SKU</span>
                  <input
                    value={sku(activeIdx)}
                    onChange={e => setSkus(prev => { const u = [...prev]; u[activeIdx] = e.target.value; return u; })}
                    placeholder="—"
                    className="flex-1 bg-transparent text-sm font-bold text-[#f2f0e3] outline-none placeholder:text-white/15"
                  />
                </div>
              </div>

              {/* Identificação Interna */}
              <SectionLabel>Identificação Interna</SectionLabel>
              <div className="mx-4 mb-3 bg-[#1c1c16] rounded-2xl border border-white/[0.07] p-4">
                {isVerif(activeIdx) && activeItem.name ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                      <p className="text-sm font-bold text-emerald-400 truncate">{activeItem.name}</p>
                    </div>
                    <button
                      onClick={() => setLinkingPanel(true)}
                      className="text-[10px] font-black text-white/35 border border-white/[0.07] px-2.5 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors shrink-0"
                    >
                      Alterar
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-white/30 font-medium mb-3">Não vinculado</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setLinkingPanel(true)}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#D81E1E]/10 border border-[#D81E1E]/20 rounded-xl text-[#f87171] text-xs font-black active:scale-[0.97] transition-transform"
                      >
                        <LinkIcon size={13} /> Vincular
                      </button>
                      <button
                        onClick={() => onVarios(activeIdx)}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/[0.04] border border-white/[0.07] rounded-xl text-white/40 text-xs font-black active:scale-[0.97] transition-transform"
                      >
                        <Layers size={13} /> Vários
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Preços & Quantidade */}
              <SectionLabel>Preços &amp; Quantidade</SectionLabel>
              <div className="mx-4 mb-4 bg-[#1c1c16] rounded-2xl border border-white/[0.07] overflow-hidden">
                {/* qty */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05]">
                  <span className="text-[10px] font-black text-white/40 w-10 shrink-0">Qtd.</span>
                  <div className="flex items-center gap-3 flex-1">
                    <button
                      onClick={() => setQtys(prev => { const u = [...prev]; u[activeIdx] = Math.max(0, (u[activeIdx] ?? qty(activeIdx)) - 1); return u; })}
                      className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.07] flex items-center justify-center text-white/60 active:bg-white/10 transition-colors"
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      value={qty(activeIdx)}
                      onChange={e => setQtys(prev => { const u = [...prev]; u[activeIdx] = parseFloat(e.target.value) || 0; return u; })}
                      className="w-16 text-center bg-transparent text-base font-black text-[#f2f0e3] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden"
                    />
                    <button
                      onClick={() => setQtys(prev => { const u = [...prev]; u[activeIdx] = (u[activeIdx] ?? qty(activeIdx)) + 1; return u; })}
                      className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.07] flex items-center justify-center text-white/60 active:bg-white/10 transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                    <span className="text-xs font-bold text-white/30">{unit(activeIdx)}</span>
                  </div>
                </div>
                {/* custo (readonly) */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05]">
                  <span className="text-[10px] font-black text-white/40 w-10 shrink-0">Custo</span>
                  <span className="text-[10px] font-bold text-white/30">R$</span>
                  <span className="text-base font-black text-[#f2f0e3] font-mono">{cost(activeIdx).toFixed(4)}</span>
                </div>
                {/* venda */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] bg-white/[0.02]">
                  <span className="text-[10px] font-black text-white/40 w-10 shrink-0">Venda</span>
                  <span className="text-[10px] font-bold text-white/30">R$</span>
                  <input
                    type="number"
                    value={sell(activeIdx) || ''}
                    onChange={e => setSellPrices(prev => { const u = [...prev]; u[activeIdx] = parseFloat(e.target.value) || 0; return u; })}
                    placeholder="0,00" step="0.01"
                    className="flex-1 bg-transparent text-base font-black text-[#f2f0e3] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden"
                  />
                  {markup(activeIdx) !== null && (
                    <span className={cn(
                      'text-[10px] font-black px-2 py-1 rounded-lg shrink-0',
                      Number(markup(activeIdx)) >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                    )}>
                      {Number(markup(activeIdx)) >= 0 ? '+' : ''}{markup(activeIdx)}%
                    </span>
                  )}
                </div>
                {/* total */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-[10px] font-black text-white/40 w-10 shrink-0">Total</span>
                  <span className="text-sm font-black text-white/50 font-mono">
                    R$ {(cost(activeIdx) * qty(activeIdx)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── linking panel ─────────────────────────────── */}
            <AnimatePresence>
              {linkingPanel && (
                <LinkingPanel
                  idx={activeIdx} item={activeItem} products={products}
                  onLink={handleLinkProduct} onClose={() => setLinkingPanel(false)}
                />
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ════ RESUMO TAB ═══════════════════════════════════════════ */}
        {tab === 'resumo' && (
          <div className="flex flex-col h-full overflow-y-auto pb-4">

            {/* nota info */}
            <div className="m-4 bg-[#1c1c16] rounded-2xl border border-white/[0.07] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                <span className="text-[10px] font-black text-white/40">Nota</span>
                <span className="text-xs font-bold text-[#f2f0e3]">{note.noteNumber || '—'}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                <span className="text-[10px] font-black text-white/40">Arquivo</span>
                <span className="text-xs font-bold text-[#f2f0e3] max-w-[60%] truncate text-right">{note.fileName || '—'}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[10px] font-black text-white/40">Itens verificados</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-black text-emerald-400">{verifiedCount}</span>
                  <span className="text-xs text-white/30 font-bold">/ {totalItems}</span>
                </div>
              </div>
            </div>

            {/* financeiro */}
            <SectionLabel>Financeiro</SectionLabel>
            <div className="mx-4 mb-4 bg-[#1c1c16] rounded-2xl border border-white/[0.07] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                <span className="text-[10px] font-black text-white/40">Custo total</span>
                <span className="text-sm font-black text-[#f2f0e3] font-mono">
                  R$ {totalCost.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                <span className="text-[10px] font-black text-white/40">Receita total</span>
                <span className="text-sm font-black text-[#f2f0e3] font-mono">
                  {totalRevenue > 0 ? `R$ ${totalRevenue.toFixed(2)}` : '—'}
                </span>
              </div>
              {totalMarkup !== null && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-[10px] font-black text-white/40">Markup total</span>
                  <span className={cn(
                    'text-sm font-black',
                    Number(totalMarkup) >= 100 ? 'text-emerald-400' : Number(totalMarkup) < 65 ? 'text-red-400' : 'text-[#f2f0e3]'
                  )}>
                    {Number(totalMarkup) >= 0 ? '+' : ''}{totalMarkup}%
                  </span>
                </div>
              )}
            </div>

            {/* ações */}
            <SectionLabel>Ações</SectionLabel>
            <div className="mx-4 space-y-2">
              <button
                disabled={savingNote}
                onClick={onSave}
                className="w-full flex items-center justify-center gap-2 py-4 bg-[#D81E1E] text-white font-black rounded-2xl shadow-lg shadow-[#D81E1E]/20 active:scale-[0.97] transition-transform disabled:opacity-50"
              >
                {savingNote
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Salvando...</>
                  : <><Save size={16} />Salvar nota</>
                }
              </button>

              {deleteConfirm ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                  <p className="text-sm font-black text-red-400 mb-3 text-center">Excluir esta nota permanentemente?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setDeleteConfirm(false)}
                      className="flex-1 py-3 bg-white/[0.05] border border-white/[0.07] rounded-xl text-white/60 text-sm font-bold">
                      Cancelar
                    </button>
                    <button onClick={async () => { await onDelete(); }}
                      className="flex-1 py-3 bg-red-500 rounded-xl text-white text-sm font-black">
                      Excluir
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-red-500/[0.08] border border-red-500/15 text-red-400 font-black rounded-2xl active:scale-[0.97] transition-transform text-sm"
                >
                  <Trash2 size={15} /> Excluir nota
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── BOTTOM TAB BAR ──────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#1a1a14] border-t border-white/[0.07] flex safe-area-inset-bottom">
        {TABS.map(t => {
          const active = tab === t.id;
          // badge for Itens tab: pending count
          const pendingCount = t.id === 'itens'
            ? items.filter((_, i) => !isVerif(i)).length
            : 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 py-2.5 relative transition-colors',
                active ? 'text-[#D81E1E]' : 'text-white/30'
              )}
              style={{ transition: 'color 150ms cubic-bezier(0.23,1,0.32,1)' }}
            >
              {/* active indicator bar */}
              {active && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute top-0 left-4 right-4 h-0.5 bg-[#D81E1E] rounded-full"
                  transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                />
              )}
              <div className="relative">
                {t.icon}
                {pendingCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] bg-[#D81E1E] rounded-full text-[9px] font-black text-white flex items-center justify-center px-0.5">
                    {pendingCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-bold">{t.label}</span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── helper sub-components ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-black text-white/25 uppercase tracking-[0.12em] px-4 mb-2 mt-1">
      {children}
    </p>
  );
}

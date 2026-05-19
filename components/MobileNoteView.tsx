'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, Camera, CheckCircle2, ChevronRight, Layers,
  Link as LinkIcon, Minus, MoreVertical, Plus, Save,
  Search, Trash2, X, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewNote } from '@/components/requests/LogisticsCenter';

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
}

// ─── barcode scanner ─────────────────────────────────────────────────────────

function BarcodeScanner({
  onScan, onClose,
}: { onScan: (code: string) => void; onClose: () => void }) {
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const scanner = new Html5Qrcode('mobile-barcode-reader');
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 280, height: 110 } },
          (text: string) => {
            if (stopped) return;
            onScan(text);
          },
          () => {},
        );
        if (!stopped) setStarted(true);
      } catch (e: any) {
        setError(e?.message || 'Sem acesso à câmera');
      }
    })();
    return () => {
      stopped = true;
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col">
      {/* top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/90 safe-area-top">
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white">
          <X size={20} />
        </button>
        <span className="text-white font-black text-sm">Ler código de barras</span>
        <div className="w-10" />
      </div>

      {/* camera area */}
      <div className="flex-1 relative">
        <div id="mobile-barcode-reader" className="w-full h-full" />

        {/* aim overlay */}
        {started && !error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 h-32 relative">
              {/* corners */}
              {[['top-0 left-0','border-t-4 border-l-4'],['top-0 right-0','border-t-4 border-r-4'],
                ['bottom-0 left-0','border-b-4 border-l-4'],['bottom-0 right-0','border-b-4 border-r-4']].map(([pos, brd], i) => (
                <div key={i} className={cn('absolute w-6 h-6 border-[#D81E1E] rounded-sm', pos, brd)} />
              ))}
              {/* scan line */}
              <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-[#D81E1E]/70" />
            </div>
          </div>
        )}

        {/* error */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
            <AlertCircle size={40} className="text-red-400" />
            <p className="text-white text-sm font-bold text-center px-8">{error}</p>
            <button onClick={onClose}
              className="mt-2 px-6 py-3 bg-white/10 rounded-xl text-white font-bold text-sm">
              Fechar
            </button>
          </div>
        )}
      </div>

      <div className="px-4 py-4 bg-black/90 text-center">
        <p className="text-white/40 text-xs font-medium">Aponte para o código de barras</p>
      </div>
    </div>
  );
}

// ─── linking panel ────────────────────────────────────────────────────────────

function LinkingPanel({
  idx, item, products, onLink, onClose,
}: {
  idx: number;
  item: any;
  products: any[];
  onLink: (product: any) => void;
  onClose: () => void;
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
          <input
            autoFocus
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Nome, SKU ou EAN..."
            className="flex-1 bg-transparent text-sm text-[#f2f0e3] placeholder:text-white/25 outline-none font-medium"
          />
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
                  {p.image
                    ? <img src={p.image} className="w-full h-full object-cover" />
                    : <span>{p.name?.[0]?.toUpperCase() || '?'}</span>}
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
}: MobileNoteViewProps) {
  const [screen, setScreen] = useState<'list' | 'detail'>('list');
  const [activeIdx, setActiveIdx] = useState(0);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [linkingPanel, setLinkingPanel] = useState(false);
  const detailScrollRef = useRef<HTMLDivElement>(null);

  const items = note.items as any[];
  const totalItems = items.length;
  const verifiedCount = verified.filter(Boolean).length;

  // effective value helpers
  const ean = (i: number) => eans[i] ?? items[i]?.ean ?? '';
  const sku = (i: number) => skus[i] ?? items[i]?.sku ?? '';
  const qty = (i: number) => qtys[i] ?? items[i]?.qty ?? 0;
  const cost = (i: number) => {
    const raw = itemPrices[i] ?? items[i]?.price ?? 0;
    const mult = multipliers[i] ?? items[i]?.multiplier ?? 1;
    return raw / (mult || 1);
  };
  const sell = (i: number) => sellPrices[i] ?? items[i]?.product_price ?? 0;
  const isVerified = (i: number) => verified[i] ?? items[i]?.verified ?? false;
  const unit = (i: number) => units[i] ?? items[i]?.unit ?? 'UN';

  // filtered list
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
    setScreen('detail');
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
    // sync sku/ean/sell price state
    setSkus(prev => { const u = [...prev]; u[activeIdx] = product.sku || items[activeIdx]?.sku || ''; return u; });
    setEans(prev => { const u = [...prev]; u[activeIdx] = product.ean || items[activeIdx]?.ean || ''; return u; });
    setSellPrices(prev => { const u = [...prev]; u[activeIdx] = product.price || 0; return u; });
    setVerified(prev => { const u = [...prev]; u[activeIdx] = true; return u; });
    setLinkingPanel(false);
  }

  const activeItem = items[activeIdx];

  // ── status colors ───────────────────────────────────────────────────────
  function avatarClass(i: number) {
    if (isVerified(i)) return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400';
    return 'bg-white/[0.06] border-white/[0.08] text-white/40';
  }

  function statusBadge(i: number) {
    if (isVerified(i)) return { label: 'Verificado', cls: 'bg-emerald-500/10 text-emerald-400' };
    return { label: 'Pendente', cls: 'bg-[#D81E1E]/10 text-[#f87171]' };
  }

  // ── markup ──────────────────────────────────────────────────────────────
  function markup(i: number) {
    const c = cost(i); const s = sell(i);
    if (c > 0 && s > 0) return ((s - c) / c * 100).toFixed(1);
    return null;
  }

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
        {scannerOpen && (
          <BarcodeScanner onScan={handleScan} onClose={() => setScannerOpen(false)} />
        )}
      </AnimatePresence>

      {/* ── LIST SCREEN ─────────────────────────────────────────────── */}
      {screen === 'list' && (
        <div className="flex flex-col h-full">
          {/* app bar */}
          <div className="shrink-0 bg-[#1a1a14] border-b border-white/[0.07] px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <button onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] text-white/60 active:bg-white/10 transition-colors">
                  <X size={18} />
                </button>
                <div>
                  <p className="text-[15px] font-black text-[#f2f0e3] leading-tight">
                    {note.fileName || 'Nota sem nome'}
                  </p>
                  <p className="text-[10px] text-white/35 font-medium">
                    {note.noteNumber && `${note.noteNumber} · `}{totalItems} itens
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setMenuOpen(true)}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/[0.06] text-white/50 active:bg-white/10 transition-colors">
                  <MoreVertical size={18} />
                </button>
              </div>
            </div>

            {/* progress */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: totalItems > 0 ? `${(verifiedCount / totalItems) * 100}%` : '0%' }}
                />
              </div>
              <span className="text-[10px] font-bold shrink-0">
                <span className="text-emerald-400">{verifiedCount}</span>
                <span className="text-white/30"> / {totalItems} ok</span>
              </span>
            </div>
          </div>

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
            {filteredItems.map(({ item, i }) => {
              const badge = statusBadge(i);
              const isActive = i === activeIdx;
              return (
                <button
                  key={i} onClick={() => openDetail(i)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] text-left relative transition-colors active:bg-white/[0.05]',
                    isActive ? 'bg-[#D81E1E]/[0.06]' : 'bg-transparent'
                  )}
                >
                  {isActive && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#D81E1E] rounded-r" />}
                  {/* avatar */}
                  <div className={cn(
                    'w-11 h-11 rounded-full flex items-center justify-center font-black text-sm shrink-0 border',
                    avatarClass(i)
                  )}>
                    {item.seq ?? i + 1}
                  </div>
                  {/* content */}
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
                      <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0', badge.cls)}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-white/15 shrink-0" />
                </button>
              );
            })}
            {filteredItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-white/15">
                <Search size={36} className="mb-3 opacity-30" />
                <p className="text-xs font-bold">Nenhum item encontrado</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DETAIL SCREEN ───────────────────────────────────────────── */}
      {screen === 'detail' && activeItem && (
        <div className="flex flex-col h-full relative">
          {/* nav bar */}
          <div className="shrink-0 bg-[#1a1a14] border-b border-white/[0.07] px-4 py-3 flex items-center gap-3">
            <button onClick={() => { setLinkingPanel(false); setScreen('list'); }}
              className="flex items-center gap-1 text-[#D81E1E] font-bold text-sm active:opacity-60 transition-opacity">
              <ArrowLeft size={16} />
              Lista
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black text-[#f2f0e3] truncate">{note.fileName || 'Nota'}</p>
              <p className="text-[9px] text-white/30 font-medium">
                Item {activeIdx + 1} de {totalItems} · Cód. {activeItem.supplier_code || '—'}
              </p>
            </div>
            <button onClick={() => setMenuOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/[0.06] text-white/40">
              <MoreVertical size={16} />
            </button>
          </div>

          {/* scrollable content */}
          <div ref={detailScrollRef} className="flex-1 overflow-y-auto pb-24">
            {/* product card */}
            <div className="m-4 bg-[#1c1c16] rounded-2xl border border-white/[0.07] p-4 flex items-center gap-3">
              <div className={cn(
                'w-12 h-12 rounded-full border flex items-center justify-center font-black text-base shrink-0',
                isVerified(activeIdx)
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
                <span className={cn(
                  'inline-block text-[9px] font-black px-2 py-0.5 rounded-md mt-1',
                  isVerified(activeIdx) ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[#D81E1E]/10 text-[#f87171]'
                )}>
                  {isVerified(activeIdx) ? 'Verificado' : 'Pendente'}
                </span>
              </div>
              <button
                onClick={() => {
                  const next = !isVerified(activeIdx);
                  setVerified(prev => { const u = [...prev]; u[activeIdx] = next; return u; });
                }}
                className={cn(
                  'w-10 h-10 rounded-full border flex items-center justify-center transition-all active:scale-90 shrink-0',
                  isVerified(activeIdx)
                    ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400'
                    : 'bg-white/[0.04] border-white/[0.08] text-white/20'
                )}
              >
                <CheckCircle2 size={18} />
              </button>
            </div>

            {/* ── Identificação ────────────────────────────── */}
            <SectionLabel>Identificação</SectionLabel>
            <div className="mx-4 mb-3 bg-[#1c1c16] rounded-2xl border border-white/[0.07] overflow-hidden">
              {/* EAN */}
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
              </div>
              {/* SKU */}
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

            {/* ── Identificação Interna ─────────────────────── */}
            <SectionLabel>Identificação Interna</SectionLabel>
            <div className="mx-4 mb-3 bg-[#1c1c16] rounded-2xl border border-white/[0.07] p-4">
              {isVerified(activeIdx) && activeItem.name ? (
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

            {/* ── Preços & Quantidade ───────────────────────── */}
            <SectionLabel>Preços &amp; Quantidade</SectionLabel>
            <div className="mx-4 mb-3 bg-[#1c1c16] rounded-2xl border border-white/[0.07] overflow-hidden">
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

              {/* custo */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05]">
                <span className="text-[10px] font-black text-white/40 w-10 shrink-0">Custo</span>
                <span className="text-[10px] font-bold text-white/30">R$</span>
                <span className="text-base font-black text-[#f2f0e3] font-mono">
                  {cost(activeIdx).toFixed(4)}
                </span>
              </div>

              {/* venda */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] bg-white/[0.02]">
                <span className="text-[10px] font-black text-white/40 w-10 shrink-0">Venda</span>
                <span className="text-[10px] font-bold text-white/30">R$</span>
                <input
                  type="number"
                  value={sell(activeIdx) || ''}
                  onChange={e => setSellPrices(prev => { const u = [...prev]; u[activeIdx] = parseFloat(e.target.value) || 0; return u; })}
                  placeholder="0,00"
                  step="0.01"
                  className="flex-1 bg-transparent text-base font-black text-[#f2f0e3] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden"
                />
                {markup(activeIdx) !== null && (
                  <span className={cn(
                    'text-[10px] font-black px-2 py-1 rounded-lg shrink-0',
                    Number(markup(activeIdx)) >= 0
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-red-500/10 text-red-400'
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

            {/* ── Extras ────────────────────────────────────── */}
            <SectionLabel>Extras</SectionLabel>
            <div className="mx-4 mb-4 bg-[#1c1c16] rounded-2xl border border-white/[0.07] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                <span className="text-xs font-black text-white/40">Desconto</span>
                <span className="text-xs text-white/20 font-medium">—</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-black text-white/40">Acréscimo</span>
                <span className="text-xs text-white/20 font-medium">—</span>
              </div>
            </div>
          </div>

          {/* footer */}
          <div className="absolute bottom-0 left-0 right-0 bg-[#1a1a14] border-t border-white/[0.07] px-4 py-3 flex gap-3">
            <button
              disabled={savingNote}
              onClick={onSave}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-[#D81E1E] text-white font-black rounded-2xl shadow-lg shadow-[#D81E1E]/20 active:scale-[0.97] transition-transform disabled:opacity-50"
            >
              {savingNote
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Salvando...</>
                : <><Save size={16} />Salvar</>
              }
            </button>
            <button
              onClick={() => {
                const next = activeIdx < totalItems - 1 ? activeIdx + 1 : 0;
                openDetail(next);
              }}
              className="flex items-center gap-1.5 px-5 py-3.5 bg-white/[0.06] border border-white/[0.07] text-[#f2f0e3] font-black rounded-2xl active:scale-[0.97] transition-transform text-sm"
            >
              Próximo <ChevronRight size={15} />
            </button>
          </div>

          {/* ── linking panel ─────────────────────────────── */}
          <AnimatePresence>
            {linkingPanel && (
              <LinkingPanel
                idx={activeIdx}
                item={activeItem}
                products={products}
                onLink={handleLinkProduct}
                onClose={() => setLinkingPanel(false)}
              />
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── OPTIONS MENU (bottom sheet) ──────────────────────────────── */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[210] bg-black/60"
              onClick={() => { setMenuOpen(false); setDeleteConfirm(false); }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="fixed bottom-0 left-0 right-0 z-[220] bg-[#1c1c16] rounded-t-3xl border-t border-white/[0.08] pb-8"
            >
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-5" />
              <div className="px-4 space-y-2">
                <MenuButton
                  icon={<Save size={17} />}
                  label={savingNote ? 'Salvando...' : 'Salvar nota'}
                  disabled={savingNote}
                  onClick={async () => { setMenuOpen(false); await onSave(); }}
                />
                <MenuButton
                  icon={<X size={17} />}
                  label="Fechar"
                  onClick={() => { setMenuOpen(false); onClose(); }}
                />
                {deleteConfirm ? (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                    <p className="text-sm font-black text-red-400 mb-3 text-center">Excluir esta nota?</p>
                    <div className="flex gap-2">
                      <button onClick={() => setDeleteConfirm(false)}
                        className="flex-1 py-2.5 bg-white/[0.05] border border-white/[0.07] rounded-xl text-white/60 text-sm font-bold">
                        Cancelar
                      </button>
                      <button onClick={async () => { setMenuOpen(false); await onDelete(); }}
                        className="flex-1 py-2.5 bg-red-500 rounded-xl text-white text-sm font-black">
                        Excluir
                      </button>
                    </div>
                  </div>
                ) : (
                  <MenuButton
                    icon={<Trash2 size={17} />}
                    label="Excluir nota"
                    danger
                    onClick={() => setDeleteConfirm(true)}
                  />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
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

function MenuButton({
  icon, label, onClick, danger, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-40',
        danger
          ? 'bg-red-500/[0.08] text-red-400 border border-red-500/15 hover:bg-red-500/12'
          : 'bg-white/[0.05] text-[#f2f0e3] border border-white/[0.07] hover:bg-white/[0.08]'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

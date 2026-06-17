'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ScanLine, Plus, Edit2, Trash2, Printer, Package, Search, LayoutGrid,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { AddEditShelfModal, type Shelf } from './AddEditShelfModal';
import { AddEditBoxModal, type StorageBox } from './AddEditBoxModal';
import { BoxDetailModal } from './BoxDetailModal';
import { BoxLabelModal } from './BoxLabelModal';

type EstoqueView = 'mapa' | 'buscar';

interface EstoqueManagerProps {
  products: any[];
}

export function EstoqueManager({ products }: EstoqueManagerProps) {
  const [view, setView] = useState<EstoqueView>('mapa');

  // Data
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [boxes, setBoxes] = useState<StorageBox[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Scan field
  const [scanInput, setScanInput] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  // Modals
  const [showAddShelf, setShowAddShelf] = useState(false);
  const [editingShelf, setEditingShelf] = useState<Shelf | null>(null);
  const [showAddBox, setShowAddBox] = useState(false);
  const [defaultBoxShelfId, setDefaultBoxShelfId] = useState<string | null>(null);
  const [editingBox, setEditingBox] = useState<StorageBox | null>(null);
  const [detailBox, setDetailBox] = useState<StorageBox | null>(null);
  const [labelBox, setLabelBox] = useState<StorageBox | null>(null);

  // Search (buscar view)
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: shelvesData }, { data: boxesData }, { data: countsData }] = await Promise.all([
      supabase.from('shelves').select('*').order('name', { ascending: true }),
      supabase.from('storage_boxes').select('*').order('code', { ascending: true }),
      supabase.from('box_contents').select('box_id, quantity'),
    ]);
    setShelves((shelvesData ?? []).map((s: any) => ({ id: s.id, name: s.name, description: s.description })));

    // aggregate product counts per box
    const counts: Record<string, number> = {};
    for (const row of countsData ?? []) {
      counts[row.box_id] = (counts[row.box_id] ?? 0) + 1;
    }
    setProductCounts(counts);

    const shelfMap: Record<string, string> = {};
    for (const s of shelvesData ?? []) shelfMap[s.id] = s.name;

    setBoxes((boxesData ?? []).map((b: any) => ({
      id: b.id, code: b.code, shelfId: b.shelf_id, description: b.description,
      productCount: counts[b.id] ?? 0,
      shelfName: b.shelf_id ? shelfMap[b.shelf_id] : undefined,
    })));
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const code = scanInput.trim().toUpperCase();
    if (!code) return;
    const found = boxes.find(b => b.code === code);
    if (found) { setDetailBox(found); setScanInput(''); }
  };

  const deleteShelf = async (shelf: Shelf) => {
    if (!window.confirm(`Excluir a prateleira "${shelf.name}"? As caixas dela ficam sem prateleira.`)) return;
    await supabase.from('shelves').delete().eq('id', shelf.id);
    fetchAll();
  };

  const deleteBox = async (box: StorageBox) => {
    if (!window.confirm(`Excluir a caixa "${box.code}"? O conteúdo será perdido.`)) return;
    await supabase.from('storage_boxes').delete().eq('id', box.id);
    fetchAll();
  };

  // Search results: product → list of boxes
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return products.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.ean?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q)
    ).map(p => ({
      product: p,
      locations: boxes.filter(b => {
        // We check productCounts, but we need actual boxContents per product.
        // This is handled by a separate state below.
        return false; // placeholder — we use productBoxMap
      }),
    }));
  }, [searchQuery, products]);

  // For the buscar view we need a map: productId → boxes[]
  const [productBoxMap, setProductBoxMap] = useState<Record<string, StorageBox[]>>({});

  useEffect(() => {
    const fetchBoxMap = async () => {
      const { data } = await supabase.from('box_contents').select('box_id, product_id');
      const map: Record<string, StorageBox[]> = {};
      for (const row of data ?? []) {
        const box = boxes.find(b => b.id === row.box_id);
        if (!box) continue;
        if (!map[row.product_id]) map[row.product_id] = [];
        map[row.product_id].push(box);
      }
      setProductBoxMap(map);
    };
    if (boxes.length > 0) fetchBoxMap();
  }, [boxes]);

  const buscarResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return products
      .filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.ean?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
      )
      .slice(0, 20)
      .map(p => ({ product: p, locations: productBoxMap[p.id] ?? [] }));
  }, [searchQuery, products, productBoxMap]);

  // Group boxes by shelf
  const boxesByShelf = useMemo(() => {
    const map: Record<string, StorageBox[]> = {};
    for (const box of boxes) {
      const key = box.shelfId ?? '__none__';
      if (!map[key]) map[key] = [];
      map[key].push(box);
    }
    return map;
  }, [boxes]);

  const unshelfedBoxes = boxesByShelf['__none__'] ?? [];

  return (
    <div className="space-y-5">
      {/* Scan bar + action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <form onSubmit={handleScan} className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2.5 bg-white dark:bg-[#252520] border border-on-surface/[0.12] focus-within:border-[#D4C000] rounded-2xl px-4 py-3 transition-colors">
            <ScanLine size={16} strokeWidth={2} className="text-on-surface/35 shrink-0" />
            <input
              ref={scanRef}
              value={scanInput}
              onChange={e => setScanInput(e.target.value.toUpperCase())}
              placeholder="Digite ou escaneie o código da caixa…"
              className="flex-1 bg-transparent text-sm font-mono font-semibold text-on-surface outline-none placeholder:font-sans placeholder:font-medium placeholder:text-on-surface/30"
            />
            {scanInput && (
              <button type="submit" className="text-[10px] font-black text-on-surface/40 hover:text-on-surface/70 uppercase tracking-wide transition-colors">
                Buscar
              </button>
            )}
          </div>
        </form>

        <button
          onClick={() => { setEditingShelf(null); setShowAddShelf(true); }}
          className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-on-surface/[0.12] bg-white dark:bg-[#252520] text-on-surface/65 hover:text-on-surface hover:border-on-surface/[0.20] text-[12.5px] font-bold transition-colors whitespace-nowrap"
        >
          <Plus size={14} strokeWidth={2.5} />
          Nova Prateleira
        </button>
        <button
          onClick={() => { setEditingBox(null); setDefaultBoxShelfId(null); setShowAddBox(true); }}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#FFE500] border border-[#D4C000] text-[#1A1A0E] text-[12.5px] font-black hover:bg-[#F5DB00] transition-colors whitespace-nowrap"
        >
          <Plus size={14} strokeWidth={2.5} />
          Nova Caixa
        </button>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 bg-on-surface/[0.05] rounded-xl p-1 w-fit">
        {(['mapa', 'buscar'] as EstoqueView[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-[10px] text-[12px] font-extrabold uppercase tracking-wide transition-colors',
              view === v
                ? 'bg-white dark:bg-[#2E2E28] text-on-surface shadow-sm'
                : 'text-on-surface/40 hover:text-on-surface/70'
            )}
          >
            {v === 'mapa' ? <LayoutGrid size={13} strokeWidth={2.5} /> : <Search size={13} strokeWidth={2.5} />}
            {v === 'mapa' ? 'Mapa' : 'Buscar Produto'}
          </button>
        ))}
      </div>

      {/* ─── MAPA VIEW ─── */}
      {view === 'mapa' && (
        <div className="space-y-8">
          {loading && (
            <p className="text-sm text-on-surface/40 text-center py-10">Carregando estoque…</p>
          )}

          {!loading && shelves.length === 0 && boxes.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-on-surface/35">
              <Package size={40} strokeWidth={1.2} />
              <p className="text-sm font-semibold">Nenhuma prateleira ou caixa ainda.</p>
              <p className="text-xs">Crie uma prateleira e adicione caixas para começar.</p>
            </div>
          )}

          {shelves.map(shelf => {
            const shelfBoxes = boxesByShelf[shelf.id] ?? [];
            return (
              <div key={shelf.id}>
                {/* Shelf header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm font-black text-on-surface">{shelf.name}</span>
                  <span className="text-[10px] font-bold text-on-surface/40 bg-on-surface/[0.06] rounded-md px-2 py-0.5">
                    {shelfBoxes.length} {shelfBoxes.length === 1 ? 'caixa' : 'caixas'}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={() => { setEditingShelf(shelf); setShowAddShelf(true); }}
                      className="w-7 h-7 rounded-lg bg-on-surface/[0.06] hover:bg-on-surface/[0.12] flex items-center justify-center text-on-surface/40 hover:text-on-surface transition-colors"
                    >
                      <Edit2 size={12} strokeWidth={2.2} />
                    </button>
                    <button
                      onClick={() => deleteShelf(shelf)}
                      className="w-7 h-7 rounded-lg bg-on-surface/[0.06] hover:bg-red-500/10 flex items-center justify-center text-on-surface/30 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={12} strokeWidth={2.2} />
                    </button>
                  </div>
                </div>

                {/* Box cards grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                  {shelfBoxes.map(box => (
                    <BoxCard
                      key={box.id}
                      box={box}
                      onClick={() => setDetailBox(box)}
                      onEdit={() => { setEditingBox(box); setShowAddBox(true); }}
                      onDelete={() => deleteBox(box)}
                      onLabel={() => setLabelBox(box)}
                    />
                  ))}
                  {/* Add caixa to this shelf */}
                  <button
                    onClick={() => { setEditingBox(null); setDefaultBoxShelfId(shelf.id); setShowAddBox(true); }}
                    className="min-h-[110px] rounded-2xl border-[1.5px] border-dashed border-on-surface/[0.14] hover:border-[#D4C000] hover:bg-[#FFE500]/[0.04] transition-all flex flex-col items-center justify-center gap-2 text-on-surface/30 hover:text-on-surface/55 group"
                  >
                    <Plus size={20} strokeWidth={2} />
                    <span className="text-[11px] font-bold">Nova caixa</span>
                  </button>
                </div>
              </div>
            );
          })}

          {/* Unshelfed boxes */}
          {unshelfedBoxes.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-black text-on-surface/50">Sem prateleira</span>
                <span className="text-[10px] font-bold text-on-surface/30 bg-on-surface/[0.05] rounded-md px-2 py-0.5">
                  {unshelfedBoxes.length} {unshelfedBoxes.length === 1 ? 'caixa' : 'caixas'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {unshelfedBoxes.map(box => (
                  <BoxCard
                    key={box.id}
                    box={box}
                    onClick={() => setDetailBox(box)}
                    onEdit={() => { setEditingBox(box); setShowAddBox(true); }}
                    onDelete={() => deleteBox(box)}
                    onLabel={() => setLabelBox(box)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── BUSCAR VIEW ─── */}
      {view === 'buscar' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 bg-white dark:bg-[#252520] border border-on-surface/[0.12] focus-within:border-[#D4C000] rounded-2xl px-4 py-3 transition-colors max-w-xl">
            <Search size={16} strokeWidth={2} className="text-on-surface/35 shrink-0" />
            <input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar produto por nome, EAN ou SKU…"
              className="flex-1 bg-transparent text-sm font-medium text-on-surface outline-none placeholder:text-on-surface/30"
            />
          </div>

          {!searchQuery.trim() && (
            <p className="text-sm text-on-surface/35 py-6 text-center">
              Digite para encontrar em quais caixas um produto está armazenado.
            </p>
          )}

          {searchQuery.trim() && buscarResults.length === 0 && (
            <p className="text-sm text-on-surface/35 py-6 text-center">Nenhum produto encontrado.</p>
          )}

          <div className="flex flex-col gap-2 max-w-2xl">
            {buscarResults.map(({ product, locations }) => (
              <div key={product.id} className="flex items-center gap-3 bg-white dark:bg-[#252520] border border-on-surface/[0.07] rounded-2xl px-4 py-3 flex-wrap">
                <div className="w-10 h-10 rounded-xl bg-on-surface/[0.06] flex items-center justify-center shrink-0 overflow-hidden">
                  {product.image
                    ? <img src={product.image} alt="" className="w-full h-full object-cover" />
                    : <span className="text-lg">📦</span>}
                </div>
                <div className="flex-1 min-w-[140px]">
                  <p className="text-sm font-bold text-on-surface">{product.name}</p>
                  <p className="text-[10px] text-on-surface/40 font-mono">{product.ean || product.sku || '—'}</p>
                </div>
                <div className="flex flex-wrap gap-2 ml-auto">
                  {locations.length === 0 ? (
                    <span className="text-[11px] font-bold text-on-surface/35 bg-on-surface/[0.05] border border-on-surface/[0.08] rounded-lg px-3 py-1">
                      Não alocado
                    </span>
                  ) : (
                    locations.map(box => (
                      <button
                        key={box.id}
                        onClick={() => setDetailBox(box)}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-[#1A1A0E] bg-[#FFE500] border border-[#D4C000] rounded-lg px-3 py-1 hover:bg-[#F5DB00] transition-colors"
                      >
                        <Package size={10} strokeWidth={2.5} />
                        {box.code}
                        {box.shelfName && <span className="opacity-60">· {box.shelfName}</span>}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── MODALS ─── */}
      <AddEditShelfModal
        isOpen={showAddShelf}
        onClose={() => setShowAddShelf(false)}
        onSaved={fetchAll}
        editing={editingShelf}
      />
      <AddEditBoxModal
        isOpen={showAddBox}
        onClose={() => setShowAddBox(false)}
        onSaved={fetchAll}
        editing={editingBox}
        shelves={shelves}
        defaultShelfId={defaultBoxShelfId}
      />
      <BoxDetailModal
        isOpen={!!detailBox}
        onClose={() => setDetailBox(null)}
        box={detailBox}
        allProducts={products}
        onContentsChanged={fetchAll}
      />
      <BoxLabelModal
        isOpen={!!labelBox}
        onClose={() => setLabelBox(null)}
        boxCode={labelBox?.code ?? ''}
        shelfName={labelBox?.shelfName}
      />
    </div>
  );
}

// ─── Box Card component ────────────────────────────────────────────────────────
interface BoxCardProps {
  box: StorageBox;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onLabel: () => void;
}

function BoxCard({ box, onClick, onEdit, onDelete, onLabel }: BoxCardProps) {
  return (
    <div
      onClick={onClick}
      className="group relative bg-white dark:bg-[#252520] border-[1.5px] border-on-surface/[0.08] hover:border-[#D4C000] hover:shadow-[0_4px_20px_rgba(0,0,0,0.10),0_0_0_1px_#FFE500] dark:hover:shadow-[0_4px_20px_rgba(0,0,0,0.35),0_0_0_1px_#FFE500] rounded-2xl p-4 cursor-pointer transition-all hover:-translate-y-0.5 shadow-sm flex flex-col gap-2 min-h-[110px]"
    >
      {/* Actions — appear on hover */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <button
          onClick={onEdit}
          className="w-6 h-6 rounded-lg bg-on-surface/[0.07] hover:bg-on-surface/[0.14] flex items-center justify-center text-on-surface/40 hover:text-on-surface transition-colors"
        >
          <Edit2 size={10} strokeWidth={2.2} />
        </button>
        <button
          onClick={onDelete}
          className="w-6 h-6 rounded-lg bg-on-surface/[0.07] hover:bg-red-500/15 flex items-center justify-center text-on-surface/30 hover:text-red-500 transition-colors"
        >
          <Trash2 size={10} strokeWidth={2.2} />
        </button>
      </div>

      <p className="font-mono text-xl font-black text-on-surface leading-none pr-14">{box.code}</p>
      {box.shelfName && (
        <p className="text-[10px] font-semibold text-on-surface/35">{box.shelfName}</p>
      )}

      <div className="flex items-center justify-between mt-auto">
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-on-surface/45 bg-on-surface/[0.06] rounded-full px-2.5 py-1">
          <Package size={9} strokeWidth={2.5} />
          {box.productCount ?? 0} produto{(box.productCount ?? 0) !== 1 ? 's' : ''}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onLabel(); }}
          className="w-7 h-7 rounded-lg bg-on-surface/[0.05] hover:bg-[#FFE500] flex items-center justify-center text-on-surface/35 hover:text-[#1A1A0E] transition-colors"
          title="Imprimir etiqueta"
        >
          <Printer size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

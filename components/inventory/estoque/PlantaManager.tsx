'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Pencil, Check, Search, Package, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { type Shelf } from './AddEditShelfModal';
import { type StorageBox } from './AddEditBoxModal';

type BlockType = 'shelf' | 'wall' | 'object';

interface FloorBlockRow {
  id: string;
  type: BlockType;
  shelf_id: string | null;
  name: string | null;
  icon: string | null;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
}

interface Block {
  id: string;
  type: BlockType;
  shelfId: string | null;
  name: string;
  icon: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  boxes: StorageBox[];
  unplaced?: boolean; // shelf sem floor_block ainda — posição calculada no cliente
}

interface PlantaManagerProps {
  shelves: Shelf[];
  boxes: StorageBox[];
  products: any[];
  productBoxMap: Record<string, StorageBox[]>;
  onSelectBox: (box: StorageBox) => void;
}

const CANVAS_HEIGHT = 720;
const GAP = 20;
const PER_ROW = 5;

function defaultShelfSize(boxCount: number) {
  return Math.max(130, Math.min(220, 130 + boxCount * 15));
}

export function PlantaManager({ shelves, boxes, products, productBoxMap, onSelectBox }: PlantaManagerProps) {
  const [rawBlocks, setRawBlocks] = useState<FloorBlockRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState('');
  const [panelBlock, setPanelBlock] = useState<Block | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const fetchBlocks = async () => {
    setLoading(true);
    const { data } = await supabase.from('floor_blocks').select('*');
    setRawBlocks(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchBlocks(); }, []);

  const blocks = useMemo<Block[]>(() => {
    if (rawBlocks === null) return [];
    const result: Block[] = [];
    const placedShelfIds = new Set<string>();

    for (const row of rawBlocks) {
      if (row.type === 'shelf') {
        const shelf = shelves.find(s => s.id === row.shelf_id);
        if (!shelf) continue; // prateleira excluída — a linha some via cascade, mas por garantia
        placedShelfIds.add(shelf.id);
        result.push({
          id: row.id,
          type: 'shelf',
          shelfId: shelf.id,
          name: shelf.name,
          icon: null,
          x: row.pos_x, y: row.pos_y, w: row.width, h: row.height,
          boxes: boxes.filter(b => b.shelfId === shelf.id),
        });
      } else {
        result.push({
          id: row.id,
          type: row.type,
          shelfId: null,
          name: row.name ?? (row.type === 'wall' ? 'Parede' : 'Objeto'),
          icon: row.icon,
          x: row.pos_x, y: row.pos_y, w: row.width, h: row.height,
          boxes: [],
        });
      }
    }

    // Prateleiras sem floor_block ainda: calcula posição padrão só pra exibir;
    // ganham uma linha em floor_blocks na primeira vez que forem arrastadas/redimensionadas.
    const unplaced = shelves.filter(s => !placedShelfIds.has(s.id));
    unplaced.forEach((shelf, i) => {
      const shelfBoxes = boxes.filter(b => b.shelfId === shelf.id);
      const size = defaultShelfSize(shelfBoxes.length);
      const col = i % PER_ROW;
      const row = Math.floor(i / PER_ROW);
      result.push({
        id: `unplaced-${shelf.id}`,
        type: 'shelf',
        shelfId: shelf.id,
        name: shelf.name,
        icon: null,
        x: 40 + col * (220 + GAP),
        y: 40 + row * (220 + GAP),
        w: size, h: size,
        boxes: shelfBoxes,
        unplaced: true,
      });
    });

    return result;
  }, [rawBlocks, shelves, boxes]);

  const matchedShelfIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const ids = new Set<string>();
    products
      .filter(p => p.name?.toLowerCase().includes(q) || p.ean?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
      .forEach(p => (productBoxMap[p.id] ?? []).forEach(b => { if (b.shelfId) ids.add(b.shelfId); }));
    return ids;
  }, [search, products, productBoxMap]);

  const persistGeometry = useCallback(async (block: Block, x: number, y: number, w: number, h: number) => {
    if (block.unplaced) {
      const { data } = await supabase.from('floor_blocks').insert([{
        type: 'shelf', shelf_id: block.shelfId, pos_x: x, pos_y: y, width: w, height: h,
      }]).select().single();
      if (data) setRawBlocks(prev => [...(prev ?? []), data]);
    } else {
      await supabase.from('floor_blocks').update({ pos_x: x, pos_y: y, width: w, height: h, updated_at: new Date().toISOString() }).eq('id', block.id);
      setRawBlocks(prev => (prev ?? []).map(r => r.id === block.id ? { ...r, pos_x: x, pos_y: y, width: w, height: h } : r));
    }
  }, []);

  const addBlock = async (type: 'wall' | 'object') => {
    const extraCount = blocks.filter(b => b.type !== 'shelf').length;
    const x = 40 + ((extraCount * 170) % 900);
    const y = CANVAS_HEIGHT - 140;
    const payload = type === 'wall'
      ? { type, name: 'Parede', icon: null, pos_x: x, pos_y: y, width: 160, height: 14 }
      : { type, name: 'Objeto', icon: '📦', pos_x: x, pos_y: y, width: 110, height: 70 };
    const { data } = await supabase.from('floor_blocks').insert([payload]).select().single();
    if (data) setRawBlocks(prev => [...(prev ?? []), data]);
  };

  const deleteBlock = async (block: Block) => {
    await supabase.from('floor_blocks').delete().eq('id', block.id);
    setRawBlocks(prev => (prev ?? []).filter(r => r.id !== block.id));
  };

  const renameBlock = async (block: Block) => {
    const name = window.prompt('Nome do bloco:', block.name);
    if (!name || !name.trim()) return;
    await supabase.from('floor_blocks').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', block.id);
    setRawBlocks(prev => (prev ?? []).map(r => r.id === block.id ? { ...r, name: name.trim() } : r));
  };

  const handleDragStart = (e: React.MouseEvent, block: Block) => {
    const target = e.target as HTMLElement;
    if (target.closest('.resize-handle') || target.closest('.block-del')) return;
    const el = blockRefs.current.get(block.id);
    if (!el || !canvasRef.current) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const onMove = (ev: MouseEvent) => {
      const cRect = canvasRef.current!.getBoundingClientRect();
      let nx = ev.clientX - cRect.left - offsetX;
      let ny = ev.clientY - cRect.top - offsetY;
      nx = Math.max(0, Math.min(nx, canvasRef.current!.clientWidth - el.offsetWidth));
      ny = Math.max(0, Math.min(ny, canvasRef.current!.clientHeight - el.offsetHeight));
      el.style.left = nx + 'px';
      el.style.top = ny + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      persistGeometry(block, parseFloat(el.style.left), parseFloat(el.style.top), block.w, block.h);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  type Corner = 'nw' | 'ne' | 'sw' | 'se';

  const handleResizeStart = (e: React.MouseEvent, block: Block, corner: Corner) => {
    e.stopPropagation();
    e.preventDefault();
    const el = blockRefs.current.get(block.id);
    if (!el) return;
    const startX = e.clientX, startY = e.clientY;
    const startW = el.offsetWidth, startH = el.offsetHeight;
    const startLeft = parseFloat(el.style.left) || block.x;
    const startTop = parseFloat(el.style.top) || block.y;
    const fromLeft = corner === 'nw' || corner === 'sw';
    const fromTop = corner === 'nw' || corner === 'ne';

    const onMove = (ev: MouseEvent) => {
      let dw = ev.clientX - startX;
      let dh = ev.clientY - startY;
      if (fromLeft) dw = -dw;
      if (fromTop) dh = -dh;

      let newW: number, newH: number;
      if (block.type === 'shelf') {
        const d = Math.max(dw, dh);
        newW = newH = Math.max(90, startW + d);
      } else {
        const minW = block.type === 'wall' ? 12 : 50;
        const minH = block.type === 'wall' ? 12 : 40;
        newW = Math.max(minW, startW + dw);
        newH = Math.max(minH, startH + dh);
      }

      el.style.width = newW + 'px';
      el.style.height = newH + 'px';
      if (fromLeft) el.style.left = (startLeft + (startW - newW)) + 'px';
      if (fromTop) el.style.top = (startTop + (startH - newH)) + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      persistGeometry(block, parseFloat(el.style.left), parseFloat(el.style.top), el.offsetWidth, el.offsetHeight);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => setEditMode(v => !v)}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-2xl border-[1.5px] text-[12px] font-extrabold transition-colors',
            editMode
              ? 'bg-on-surface text-[#FFE500] border-on-surface'
              : 'bg-white dark:bg-[#252520] border-on-surface/[0.12] text-on-surface/60 hover:text-on-surface hover:border-on-surface/[0.20]'
          )}
        >
          {editMode ? <Check size={14} strokeWidth={2.5} /> : <Pencil size={14} strokeWidth={2.5} />}
          {editMode ? 'Concluir edição' : 'Editar Planta'}
        </button>
        <div className="flex items-center gap-2.5 bg-white dark:bg-[#252520] border border-on-surface/[0.12] focus-within:border-[#D4C000] rounded-2xl px-4 py-2.5 flex-1 min-w-[240px] max-w-sm transition-colors">
          <Search size={14} strokeWidth={2} className="text-on-surface/35 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar produto no mapa…"
            className="flex-1 bg-transparent text-[12.5px] font-medium text-on-surface outline-none placeholder:text-on-surface/30"
          />
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className={cn(
          'relative rounded-none border-[1.5px] overflow-hidden bg-white dark:bg-[#1c1c16] transition-colors',
          editMode ? 'border-dashed border-[#D81E1E]' : 'border-on-surface/[0.10]'
        )}
        style={{
          height: CANVAS_HEIGHT,
          backgroundImage:
            'linear-gradient(rgba(120,110,70,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(120,110,70,0.07) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      >
        {editMode && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-[#D81E1E] pl-4 pr-2 py-1.5 rounded-full shadow-lg shadow-[#D81E1E]/30">
            <span className="text-[9.5px] font-black uppercase tracking-wide text-white whitespace-nowrap">Adicionar:</span>
            <button onClick={() => addBlock('wall')} className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 border border-white/30 text-white text-[10.5px] font-extrabold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap">
              🧱 Parede
            </button>
            <button onClick={() => addBlock('object')} className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 border border-white/30 text-white text-[10.5px] font-extrabold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap">
              📦 Objeto
            </button>
          </div>
        )}

        {loading && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-on-surface/40">Carregando planta…</p>
        )}

        {!loading && blocks.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-on-surface/35">
            <Package size={32} strokeWidth={1.3} />
            <p className="text-sm font-semibold">Nenhuma prateleira cadastrada ainda.</p>
            <p className="text-xs">Crie uma prateleira na aba Estoque para ela aparecer aqui.</p>
          </div>
        )}

        {!loading && blocks.map(block => {
          const isMatch = block.type === 'shelf' && matchedShelfIds?.has(block.shelfId!);
          const isDim = block.type === 'shelf' && matchedShelfIds !== null && !isMatch;
          return (
            <div
              key={block.id}
              ref={(el) => { if (el) blockRefs.current.set(block.id, el); else blockRefs.current.delete(block.id); }}
              className={cn(
                'absolute rounded-none overflow-hidden flex flex-col transition-[box-shadow,opacity] select-none',
                editMode ? 'cursor-grab active:cursor-grabbing' : block.type === 'shelf' ? 'cursor-pointer' : 'cursor-default',
                block.type === 'shelf' && 'bg-[#FFE500] border-[1.5px] border-[#D4C000] shadow-sm hover:shadow-md',
                block.type === 'shelf' && block.unplaced && 'border-dashed',
                isMatch && 'floor-block-match',
                isDim && 'opacity-30',
              )}
              style={{ left: block.x, top: block.y, width: block.w, height: block.h }}
              onMouseDown={(e) => editMode && handleDragStart(e, block)}
              onClick={() => { if (!editMode && block.type === 'shelf') setPanelBlock(block); }}
              onDoubleClick={() => { if (editMode && block.type !== 'shelf') renameBlock(block); }}
            >
              {block.type === 'shelf' && (
                <>
                  <div className="w-full h-full flex items-center justify-center px-2 text-center">
                    <span className="text-[11px] font-black text-[#1A1A0E] leading-tight">{block.name}</span>
                  </div>
                  {block.unplaced && editMode && (
                    <span className="absolute bottom-1 left-1 text-[8px] font-black uppercase tracking-wide text-[#1A1A0E]/50">Posicionar →</span>
                  )}
                </>
              )}

              {block.type === 'wall' && (
                <div
                  className="w-full h-full flex items-center justify-center border-[1.5px] border-on-surface/25"
                  style={{
                    backgroundColor: 'rgba(120,110,70,0.10)',
                    backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.14) 0, rgba(0,0,0,0.14) 3px, transparent 3px, transparent 9px)',
                  }}
                >
                  {block.w > 50 && block.h > 24 && (
                    <span className="text-[8.5px] font-black uppercase tracking-wide bg-white dark:bg-[#252520] px-1.5 py-0.5 rounded-md text-on-surface/50">
                      {block.name}
                    </span>
                  )}
                </div>
              )}

              {block.type === 'object' && (
                <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 bg-[#EDF3FF] dark:bg-[#16202e] border-[1.5px] border-dashed border-[#C7DBFF] dark:border-blue-900/50">
                  <span className="text-lg leading-none">{block.icon || '📦'}</span>
                  <span className="text-[9.5px] font-black text-[#2451A6] dark:text-[#9DC0FF] text-center px-1 leading-tight">{block.name}</span>
                </div>
              )}

              {editMode && (
                <>
                  {block.type !== 'shelf' && (
                    <button
                      onMouseDown={e => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); deleteBlock(block); }}
                      className="block-del absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-md bg-[#D81E1E] text-white text-[10px] font-black flex items-center justify-center hover:bg-[#A30E0E] transition-colors z-10"
                    >
                      ✕
                    </button>
                  )}
                  <span
                    onMouseDown={(e) => handleResizeStart(e, block, 'nw')}
                    className="resize-handle absolute top-0 left-0 w-4 h-4 cursor-nwse-resize"
                  >
                    <span className="absolute left-0.5 top-0.5 w-2 h-2 border-l-2 border-t-2 border-on-surface/40" />
                  </span>
                  <span
                    onMouseDown={(e) => handleResizeStart(e, block, 'ne')}
                    className="resize-handle absolute top-0 right-0 w-4 h-4 cursor-nesw-resize"
                  >
                    <span className="absolute right-0.5 top-0.5 w-2 h-2 border-r-2 border-t-2 border-on-surface/40" />
                  </span>
                  <span
                    onMouseDown={(e) => handleResizeStart(e, block, 'sw')}
                    className="resize-handle absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize"
                  >
                    <span className="absolute left-0.5 bottom-0.5 w-2 h-2 border-l-2 border-b-2 border-on-surface/40" />
                  </span>
                  <span
                    onMouseDown={(e) => handleResizeStart(e, block, 'se')}
                    className="resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
                  >
                    <span className="absolute right-0.5 bottom-0.5 w-2 h-2 border-r-2 border-b-2 border-on-surface/40" />
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10.5px] font-semibold text-on-surface/35">
        💡 Busque um produto para ver em qual prateleira ele está. No modo edição, arraste os blocos, use a alça do canto pra redimensionar, e adicione paredes/objetos pra representar o layout real da loja.
      </p>

      {/* Painel lateral — caixas da prateleira selecionada */}
      <AnimatePresence>
        {panelBlock && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-black/35 dark:bg-black/55"
              onClick={() => setPanelBlock(null)}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="fixed top-0 right-0 h-full w-full max-w-[360px] z-40 bg-[#FDFAF0] dark:bg-[#1E1E18] border-l border-on-surface/[0.06] shadow-2xl flex flex-col"
            >
              <div className="bg-[#FFE500] border-b border-[#D4C000] px-5 py-4 flex items-center justify-between gap-3 shrink-0">
                <p className="text-base font-black text-[#1A1A0E]">{panelBlock.name}</p>
                <button onClick={() => setPanelBlock(null)} className="w-7 h-7 rounded-[9px] bg-black/[0.08] border border-black/[0.10] flex items-center justify-center text-[#1A1A0E]/40 hover:bg-red-500/10 hover:text-red-600 transition-colors shrink-0">
                  <X size={13} strokeWidth={2.5} />
                </button>
              </div>
              <div className="p-4 flex flex-col gap-2 overflow-y-auto">
                <p className="text-[9.5px] font-black uppercase tracking-[0.1em] text-on-surface/30 mb-1">Caixas nesta prateleira</p>
                {panelBlock.boxes.length === 0 && (
                  <p className="text-sm text-on-surface/35 py-6 text-center">Nenhuma caixa cadastrada ainda.</p>
                )}
                {panelBlock.boxes.map(box => (
                  <button
                    key={box.id}
                    onClick={() => { onSelectBox(box); setPanelBlock(null); }}
                    className="flex items-center justify-between gap-3 bg-white dark:bg-[#252520] border border-on-surface/[0.08] rounded-2xl px-4 py-3 hover:border-[#D4C000] transition-colors text-left"
                  >
                    <span className="font-mono font-black text-on-surface text-[14px]">{box.code}</span>
                    <span className="text-[10.5px] font-bold text-on-surface/40 bg-on-surface/[0.06] rounded-lg px-2.5 py-1">
                      {box.productCount ?? 0} produto{(box.productCount ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  X, Plus, Trash2, ChevronLeft, ChevronRight,
  Keyboard, Delete, CheckCircle2, Send, AlertTriangle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

export type TaskItemDraft = {
  ean: string;
  name: string;
  sku: string;
  price: string;
  newPrice: string;
  newPriceEnabled: boolean;
  category: string;
  subcategory: string;
  brand: string;
  observacao: string;
  foundInInventory: boolean;
};

export type TaskDraft = {
  task_type: 'revisao' | 'tarefa_livre';
  responsavel: string;
  classificacao: 'Alta' | 'Média' | 'Baixa' | '';
  observacao: string;
  items: TaskItemDraft[];
};

interface MobileTaskPageProps {
  isOpen: boolean;
  onClose: () => void;
  products: any[];
  categories?: string[];
  subcategories?: string[];
  brands?: string[];
  locations?: string[];
  onSendTask: (task: TaskDraft) => Promise<void>;
}

type Classificacao = 'Alta' | 'Média' | 'Baixa' | '';

// ── Keyboard layout ────────────────────────────────────────────────────────

const NAME_KBD: Record<string, string[][]> = {
  abc: [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['SHIFT','z','x','c','v','b','n','m','⌫'],
    ['123','SPACE','↵'],
  ],
  '123': [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['-','/',':', ';','(',')', '$','&','@','"'],
    ['#+=','.',',','?','!','\'','⌫'],
    ['ABC','SPACE','↵'],
  ],
  '#+=': [
    ['[',']','{','}','#','%','^','*','+','='],
    ['_','\\','|','~','<','>','€','£','¥','•'],
    ['123','.',',','?','!','\'','⌫'],
    ['ABC','SPACE','↵'],
  ],
};

function emptyItem(): TaskItemDraft {
  return {
    ean: '', name: '', sku: '', price: '', newPrice: '',
    newPriceEnabled: true, category: '', subcategory: '',
    brand: '', observacao: '', foundInInventory: false,
  };
}

// ── ComboInput ─────────────────────────────────────────────────────────────

function ComboInput({
  value, onChange, options, placeholder, label,
}: {
  value: string; onChange: (v: string) => void;
  options: string[]; placeholder?: string; label: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = value.trim()
    ? options.filter(o => o.toLowerCase().includes(value.toLowerCase()))
    : options;
  return (
    <div className="relative">
      <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-1">{label}</label>
      <input
        type="text" value={value} placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E]"
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-xl bg-white dark:bg-[#2e2e28] border border-[#E0D8BF] dark:border-white/[0.08] shadow-xl">
          {filtered.slice(0, 8).map(opt => (
            <button key={opt} type="button" onMouseDown={() => { onChange(opt); setOpen(false); }}
              className="block w-full text-left px-3 py-2 text-xs font-medium text-on-surface/80 hover:bg-[#FFF8D0] dark:hover:bg-white/[0.04] transition-colors">
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Numeric keyboard ────────────────────────────────────────────────────────

function NumericKeyboard({
  onKey, onDelete, onClear,
}: {
  onKey: (k: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
      className="absolute left-0 top-full mt-2 z-50 bg-white dark:bg-[#2e2e28] border border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl shadow-2xl p-3 w-full"
    >
      <div className="grid grid-cols-3 gap-2">
        {['7','8','9','4','5','6','1','2','3',',','0','.'].map(key => (
          <motion.button key={key} type="button"
            onMouseDown={e => { e.preventDefault(); onKey(key); }}
            whileTap={{ scale: 0.82 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            className="h-12 rounded-xl bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] text-base font-black text-on-surface hover:bg-[#FFE500] hover:border-[#D4C000] dark:hover:bg-[#3a3a30] transition-colors">
            {key}
          </motion.button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <motion.button type="button" onMouseDown={e => { e.preventDefault(); onDelete(); }}
          whileTap={{ scale: 0.88 }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          className="h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 font-black flex items-center justify-center gap-2 hover:bg-amber-500/20 transition-colors">
          <Delete size={16} /> ⌫
        </motion.button>
        <motion.button type="button" onMouseDown={e => { e.preventDefault(); onClear(); }}
          whileTap={{ scale: 0.88 }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          className="h-12 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 font-black hover:bg-red-500/20 transition-colors">
          Limpar
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── QWERTY keyboard panel ───────────────────────────────────────────────────

function QwertyKeyboard({
  mode, shift, onKey,
}: {
  mode: 'abc' | '123' | '#+=';
  shift: boolean;
  onKey: (k: string) => void;
}) {
  return (
    <motion.div
      key="qwerty"
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      className="shrink-0 bg-[#CDD0D6] dark:bg-[#1C1C1E] pt-2 pb-1 px-0.5 space-y-1 select-none"
    >
      {NAME_KBD[mode].map((row, ri) => (
        <div key={ri} className={cn('flex gap-1 justify-center', ri === 1 ? 'px-3' : 'px-0.5')}>
          {row.map(key => {
            const isSpecial = ['SHIFT','⌫','123','ABC','#+=','↵','SPACE'].includes(key);
            const isShiftActive = key === 'SHIFT' && shift;
            const displayKey = mode === 'abc' && !isSpecial ? (shift ? key.toUpperCase() : key) : key;
            return (
              <motion.button key={key + ri} type="button"
                onMouseDown={e => { e.preventDefault(); onKey(key); }}
                whileTap={{ scale: isSpecial ? 0.88 : 0.82 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                className={cn(
                  'h-[42px] rounded-[8px] flex items-center justify-center',
                  'shadow-[0_1px_0_rgba(0,0,0,0.28)] dark:shadow-[0_1px_0_rgba(0,0,0,0.55)]',
                  key === 'SPACE' ? 'flex-1 text-sm font-medium' :
                  ['123','ABC','#+=','↵'].includes(key) ? 'w-[42px] text-[11px] font-bold' :
                  (key === 'SHIFT' || key === '⌫') ? 'w-[42px]' : 'flex-1 text-[17px] font-normal',
                  isShiftActive ? 'bg-white dark:bg-[#4A9EFF] text-[#4A9EFF] dark:text-white' :
                  isSpecial ? 'bg-[#AEB3BB] dark:bg-[#2E2E2E] text-[#1A1A0E] dark:text-[#F2F0E3]' :
                  'bg-white dark:bg-[#3D3D3D] text-[#1A1A0E] dark:text-[#F2F0E3]',
                )}>
                {key === 'SHIFT' ? <span className={cn('text-lg leading-none', shift ? 'font-black' : 'font-light')}>⇧</span>
                  : key === '⌫' ? <Delete size={15} />
                  : key === 'SPACE' ? 'espaço'
                  : displayKey}
              </motion.button>
            );
          })}
        </div>
      ))}
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function MobileTaskPage({
  isOpen, onClose, products = [],
  categories = [], subcategories = [], brands = [], locations = [],
  onSendTask,
}: MobileTaskPageProps) {
  // ── State ──
  const [taskType, setTaskType] = useState<'revisao' | 'tarefa_livre' | null>(null);
  const [responsavel, setResponsavel] = useState('');
  const [colaboradores, setColaboradores] = useState<{ id: string; nome: string }[]>([]);
  const [classificacao, setClassificacao] = useState<Classificacao>('');
  const [observacaoGeral, setObservacaoGeral] = useState('');
  const [items, setItems] = useState<TaskItemDraft[]>([]);
  const [editingItemIdx, setEditingItemIdx] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Keyboards (main screen)
  const [showObsKeyboard, setShowObsKeyboard] = useState(false);
  const [obsKbdMode, setObsKbdMode] = useState<'abc'|'123'|'#+='>('abc');
  const [obsKbdShift, setObsKbdShift] = useState(true);

  // Keyboards (item detail)
  const [showEanKeyboard, setShowEanKeyboard] = useState(false);
  const [eanKbdMode, setEanKbdMode] = useState<'abc'|'123'|'#+='>('abc');
  const [eanKbdShift, setEanKbdShift] = useState(true);
  const [showPriceKeyboard, setShowPriceKeyboard] = useState(false);
  const [showNewPriceKeyboard, setShowNewPriceKeyboard] = useState(false);
  const [showItemNameKeyboard, setShowItemNameKeyboard] = useState(false);
  const [showItemObsKeyboard, setShowItemObsKeyboard] = useState(false);
  const [itemNameKbdMode, setItemNameKbdMode] = useState<'abc'|'123'|'#+='>('abc');
  const [itemNameKbdShift, setItemNameKbdShift] = useState(true);
  const [itemObsKbdMode, setItemObsKbdMode] = useState<'abc'|'123'|'#+='>('abc');
  const [itemObsKbdShift, setItemObsKbdShift] = useState(true);

  const eanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    supabase
      .from('hr_employees')
      .select('id, nome')
      .order('nome', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error('Erro ao buscar colaboradores:', error);
        setColaboradores(data || []);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const curItem = editingItemIdx !== null ? items[editingItemIdx] : null;

  // ── Item helpers ──

  function addItem() {
    const newItems = [...items, emptyItem()];
    setItems(newItems);
    setEditingItemIdx(newItems.length - 1);
    setShowPriceKeyboard(false);
    setShowItemNameKeyboard(false);
    setShowItemObsKeyboard(false);
    setTimeout(() => eanInputRef.current?.focus(), 60);
  }

  function updateItemField(idx: number, key: keyof TaskItemDraft, value: any) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: value } : it));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setEditingItemIdx(null);
  }

  // EAN auto-fill from inventory
  function handleEanBlur(eanValue: string, idx: number) {
    if (!eanValue.trim()) return;
    const found = products.find((p: any) => p.ean?.trim() === eanValue.trim());
    if (found) {
      setItems(prev => prev.map((it, i) => i === idx ? {
        ...it,
        name: found.name || it.name,
        sku: found.sku || it.sku,
        price: found.price != null ? String(found.price) : it.price,
        category: found.category || it.category,
        subcategory: found.subcategory || it.subcategory,
        brand: found.brand || it.brand,
        foundInInventory: true,
      } : it));
    }
  }

  // ── Text keyboard handlers ──

  function handleObsKey(key: string) {
    if (key === '⌫') { setObservacaoGeral(v => v.slice(0, -1)); return; }
    if (key === 'SHIFT') { setObsKbdShift(v => !v); return; }
    if (key === 'SPACE') { setObservacaoGeral(v => v + ' '); return; }
    if (key === '↵') { setShowObsKeyboard(false); return; }
    if (key === '123') { setObsKbdMode('123'); return; }
    if (key === 'ABC') { setObsKbdMode('abc'); return; }
    if (key === '#+=') { setObsKbdMode('#+='); return; }
    const char = obsKbdMode === 'abc' ? (obsKbdShift ? key.toUpperCase() : key) : key;
    setObservacaoGeral(v => v + char);
    if (obsKbdMode === 'abc' && obsKbdShift) setObsKbdShift(false);
  }

  function handleEanKey(key: string) {
    if (editingItemIdx === null) return;
    if (key === '⌫') { updateItemField(editingItemIdx, 'ean', (curItem?.ean ?? '').slice(0, -1)); return; }
    if (key === 'SHIFT') { setEanKbdShift(v => !v); return; }
    if (key === 'SPACE') { updateItemField(editingItemIdx, 'ean', (curItem?.ean ?? '') + ' '); return; }
    if (key === '↵') { setShowEanKeyboard(false); return; }
    if (key === '123') { setEanKbdMode('123'); return; }
    if (key === 'ABC') { setEanKbdMode('abc'); return; }
    if (key === '#+=') { setEanKbdMode('#+='); return; }
    const char = eanKbdMode === 'abc' ? (eanKbdShift ? key.toUpperCase() : key) : key;
    updateItemField(editingItemIdx, 'ean', (curItem?.ean ?? '') + char);
    if (eanKbdMode === 'abc' && eanKbdShift) setEanKbdShift(false);
  }

  function handleItemNameKey(key: string) {
    if (editingItemIdx === null) return;
    if (key === '⌫') { updateItemField(editingItemIdx, 'name', (curItem?.name ?? '').slice(0, -1)); return; }
    if (key === 'SHIFT') { setItemNameKbdShift(v => !v); return; }
    if (key === 'SPACE') { updateItemField(editingItemIdx, 'name', (curItem?.name ?? '') + ' '); return; }
    if (key === '↵') { setShowItemNameKeyboard(false); return; }
    if (key === '123') { setItemNameKbdMode('123'); return; }
    if (key === 'ABC') { setItemNameKbdMode('abc'); return; }
    if (key === '#+=') { setItemNameKbdMode('#+='); return; }
    const char = itemNameKbdMode === 'abc' ? (itemNameKbdShift ? key.toUpperCase() : key) : key;
    updateItemField(editingItemIdx, 'name', (curItem?.name ?? '') + char);
    if (itemNameKbdMode === 'abc' && itemNameKbdShift) setItemNameKbdShift(false);
  }

  function handleItemObsKey(key: string) {
    if (editingItemIdx === null) return;
    if (key === '⌫') { updateItemField(editingItemIdx, 'observacao', (curItem?.observacao ?? '').slice(0, -1)); return; }
    if (key === 'SHIFT') { setItemObsKbdShift(v => !v); return; }
    if (key === 'SPACE') { updateItemField(editingItemIdx, 'observacao', (curItem?.observacao ?? '') + ' '); return; }
    if (key === '↵') { setShowItemObsKeyboard(false); return; }
    if (key === '123') { setItemObsKbdMode('123'); return; }
    if (key === 'ABC') { setItemObsKbdMode('abc'); return; }
    if (key === '#+=') { setItemObsKbdMode('#+='); return; }
    const char = itemObsKbdMode === 'abc' ? (itemObsKbdShift ? key.toUpperCase() : key) : key;
    updateItemField(editingItemIdx, 'observacao', (curItem?.observacao ?? '') + char);
    if (itemObsKbdMode === 'abc' && itemObsKbdShift) setItemObsKbdShift(false);
  }

  // ── Send ──

  async function handleSend() {
    if (!classificacao || !taskType) return;
    setSending(true);
    try {
      await onSendTask({
        task_type: taskType,
        responsavel,
        classificacao,
        observacao: observacaoGeral,
        items: taskType === 'revisao' ? items : [],
      });
      onClose();
    } finally {
      setSending(false);
    }
  }

  // ── Active keyboard for item detail ──
  const activeItemKbd = showEanKeyboard ? 'ean' : showItemNameKeyboard ? 'name' : showItemObsKeyboard ? 'obs' : null;

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER — ITEM DETAIL VIEW
  // ══════════════════════════════════════════════════════════════════════════

  if (editingItemIdx !== null && curItem) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className="fixed inset-0 z-[201] flex flex-col bg-[#FDFAF0] dark:bg-[#1E1E18] overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 bg-[#FFE500] dark:bg-[#252520] border-b border-[#D4C000] dark:border-white/[0.07] px-4 py-3 flex items-center justify-between">
          <button onClick={() => setEditingItemIdx(null)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-black/[0.09] dark:bg-white/[0.08] text-[#1A1A0E] dark:text-white/70 active:bg-black/20 transition-colors">
            <X size={18} />
          </button>
          <div className="flex items-center gap-2">
            <button disabled={editingItemIdx === 0}
              onClick={() => { setEditingItemIdx(i => Math.max(0, (i ?? 1) - 1)); setShowPriceKeyboard(false); setShowItemNameKeyboard(false); setShowItemObsKeyboard(false); setShowEanKeyboard(false); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-on-surface/[0.05] text-on-surface/50 disabled:opacity-25 active:bg-on-surface/10 transition-colors">
              <ChevronLeft size={15} />
            </button>
            <p className="text-[10px] font-black text-on-surface/50">
              Item <span className="text-on-surface">{editingItemIdx + 1}</span> de {items.length}
            </p>
            <button disabled={editingItemIdx === items.length - 1}
              onClick={() => { setEditingItemIdx(i => Math.min(items.length - 1, (i ?? 0) + 1)); setShowPriceKeyboard(false); setShowItemNameKeyboard(false); setShowItemObsKeyboard(false); setShowEanKeyboard(false); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-on-surface/[0.05] text-on-surface/50 disabled:opacity-25 active:bg-on-surface/10 transition-colors">
              <ChevronRight size={15} />
            </button>
          </div>
          <button onClick={addItem} title="Adicionar item"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[#D81E1E] text-white active:bg-red-600 transition-colors active:scale-90">
            <Plus size={18} />
          </button>
        </div>

        {/* Scroll content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* EAN */}
          <div>
            <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-1">EAN</label>
            <div className="flex items-center gap-2">
              <input
                ref={eanInputRef}
                type="text"
                inputMode={showEanKeyboard ? 'none' : undefined}
                value={curItem.ean}
                onChange={e => updateItemField(editingItemIdx, 'ean', e.target.value)}
                onBlur={e => handleEanBlur(e.target.value, editingItemIdx)}
                placeholder="Código de barras"
                className="flex-1 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E]"
              />
              {curItem.ean.trim() && (
                <button type="button" title="Limpar EAN"
                  onClick={() => { updateItemField(editingItemIdx, 'ean', ''); updateItemField(editingItemIdx, 'foundInInventory', false); setTimeout(() => eanInputRef.current?.focus(), 20); }}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#E0D8BF] dark:border-white/[0.08] text-on-surface/40 hover:text-red-500 hover:border-red-400/50 hover:bg-red-500/[0.06] active:scale-90 transition-all shrink-0">
                  <Trash2 size={15} />
                </button>
              )}
              <button type="button" onClick={() => { setShowEanKeyboard(v => !v); setShowItemNameKeyboard(false); setShowItemObsKeyboard(false); setEanKbdMode('abc'); }}
                className={cn('w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-all active:scale-95',
                  showEanKeyboard ? 'bg-[#D81E1E] text-white border-[#D81E1E]' : 'bg-[#FDFAF0] dark:bg-[#252520] border-[#E0D8BF] dark:border-white/[0.08] text-on-surface/50 hover:text-[#D81E1E] hover:border-[#D81E1E]/40')}>
                <Keyboard size={18} />
              </button>
            </div>
            {curItem.foundInInventory && (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-bold flex items-center gap-1">
                <CheckCircle2 size={11} /> Produto encontrado no inventário
              </p>
            )}
          </div>

          {/* Preço R$ */}
          <div>
            <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-1">Preço R$</label>
            <div className="relative">
              <div className="flex gap-2">
                <input type="text" inputMode="none" value={curItem.price}
                  onChange={e => updateItemField(editingItemIdx, 'price', e.target.value)}
                  placeholder="0,00"
                  className="flex-1 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E]" />
                <button type="button" onClick={() => { setShowPriceKeyboard(v => !v); setShowNewPriceKeyboard(false); }}
                  className={cn('w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-all active:scale-95',
                    showPriceKeyboard ? 'bg-[#D81E1E] text-white border-[#D81E1E]' : 'bg-[#FDFAF0] dark:bg-[#252520] border-[#E0D8BF] dark:border-white/[0.08] text-on-surface/50 hover:text-[#D81E1E] hover:border-[#D81E1E]/40')}>
                  <Keyboard size={18} />
                </button>
              </div>
              <AnimatePresence>
                {showPriceKeyboard && (
                  <NumericKeyboard
                    onKey={k => updateItemField(editingItemIdx, 'price', curItem.price + k)}
                    onDelete={() => updateItemField(editingItemIdx, 'price', curItem.price.slice(0, -1))}
                    onClear={() => updateItemField(editingItemIdx, 'price', '')}
                  />
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Preço novo (only if found in inventory) */}
          {curItem.foundInInventory && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider">
                  Preço novo
                </label>
                <button type="button"
                  onClick={() => updateItemField(editingItemIdx, 'newPriceEnabled', !curItem.newPriceEnabled)}
                  className={cn('relative w-10 h-5 rounded-full transition-colors',
                    curItem.newPriceEnabled ? 'bg-[#D81E1E]' : 'bg-on-surface/20')}>
                  <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all',
                    curItem.newPriceEnabled ? 'left-5' : 'left-0.5')} />
                </button>
              </div>
              <div className={cn('relative', !curItem.newPriceEnabled && 'opacity-40 pointer-events-none')}>
                <div className="flex gap-2">
                  <input type="text" inputMode="none" value={curItem.newPrice}
                    onChange={e => updateItemField(editingItemIdx, 'newPrice', e.target.value)}
                    placeholder="0,00"
                    className="flex-1 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E]" />
                  <button type="button" onClick={() => { setShowNewPriceKeyboard(v => !v); setShowPriceKeyboard(false); }}
                    className={cn('w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-all active:scale-95',
                      showNewPriceKeyboard ? 'bg-[#D81E1E] text-white border-[#D81E1E]' : 'bg-[#FDFAF0] dark:bg-[#252520] border-[#E0D8BF] dark:border-white/[0.08] text-on-surface/50 hover:text-[#D81E1E] hover:border-[#D81E1E]/40')}>
                    <Keyboard size={18} />
                  </button>
                </div>
                <AnimatePresence>
                  {showNewPriceKeyboard && (
                    <NumericKeyboard
                      onKey={k => updateItemField(editingItemIdx, 'newPrice', curItem.newPrice + k)}
                      onDelete={() => updateItemField(editingItemIdx, 'newPrice', curItem.newPrice.slice(0, -1))}
                      onClear={() => updateItemField(editingItemIdx, 'newPrice', '')}
                    />
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-1">Nome</label>
            <div className="flex gap-2">
              <input type="text" inputMode={showItemNameKeyboard ? 'none' : undefined}
                value={curItem.name} onChange={e => updateItemField(editingItemIdx, 'name', e.target.value)}
                placeholder="Nome do produto"
                className="flex-1 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E]" />
              <button type="button" onClick={() => { setShowItemNameKeyboard(v => !v); setShowItemObsKeyboard(false); setItemNameKbdMode('abc'); }}
                className={cn('w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-all active:scale-95',
                  showItemNameKeyboard ? 'bg-[#D81E1E] text-white border-[#D81E1E]' : 'bg-[#FDFAF0] dark:bg-[#252520] border-[#E0D8BF] dark:border-white/[0.08] text-on-surface/50 hover:text-[#D81E1E] hover:border-[#D81E1E]/40')}>
                <Keyboard size={18} />
              </button>
            </div>
          </div>

          {/* SKU */}
          <div>
            <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-1">SKU</label>
            <input type="text" value={curItem.sku} onChange={e => updateItemField(editingItemIdx, 'sku', e.target.value)}
              placeholder="Código interno"
              className="w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E]" />
          </div>

          {/* Categoria, Subcategoria, Marca */}
          <ComboInput label="Categoria" value={curItem.category} onChange={v => updateItemField(editingItemIdx, 'category', v)} options={categories} placeholder="Selecione ou digite..." />
          <ComboInput label="Subcategoria" value={curItem.subcategory} onChange={v => updateItemField(editingItemIdx, 'subcategory', v)} options={subcategories} placeholder="Selecione ou digite..." />
          <ComboInput label="Marca" value={curItem.brand} onChange={v => updateItemField(editingItemIdx, 'brand', v)} options={brands} placeholder="Selecione ou digite..." />

          {/* Observação do item */}
          <div>
            <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-1">Observação</label>
            <div className="flex gap-2">
              <textarea value={curItem.observacao} onChange={e => updateItemField(editingItemIdx, 'observacao', e.target.value)}
                inputMode={showItemObsKeyboard ? 'none' : undefined}
                placeholder="Observação sobre este item..."
                rows={2}
                className="flex-1 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E] resize-none" />
              <button type="button" onClick={() => { setShowItemObsKeyboard(v => !v); setShowItemNameKeyboard(false); setItemObsKbdMode('abc'); }}
                className={cn('w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-all active:scale-95',
                  showItemObsKeyboard ? 'bg-[#D81E1E] text-white border-[#D81E1E]' : 'bg-[#FDFAF0] dark:bg-[#252520] border-[#E0D8BF] dark:border-white/[0.08] text-on-surface/50 hover:text-[#D81E1E] hover:border-[#D81E1E]/40')}>
                <Keyboard size={18} />
              </button>
            </div>
          </div>

          {/* Remove item */}
          <div className="pt-2">
            <button onClick={() => removeItem(editingItemIdx)}
              className="flex items-center gap-2 text-red-500 text-sm font-bold py-2 px-3 rounded-xl hover:bg-red-500/10 transition-colors active:scale-95">
              <Trash2 size={15} /> Remover este item
            </button>
          </div>

          <div className="h-8" />
        </div>

        {/* QWERTY keyboard panel */}
        <AnimatePresence>
          {activeItemKbd === 'ean' && (
            <QwertyKeyboard mode={eanKbdMode} shift={eanKbdShift} onKey={handleEanKey} />
          )}
          {activeItemKbd === 'name' && (
            <QwertyKeyboard mode={itemNameKbdMode} shift={itemNameKbdShift} onKey={handleItemNameKey} />
          )}
          {activeItemKbd === 'obs' && (
            <QwertyKeyboard mode={itemObsKbdMode} shift={itemObsKbdShift} onKey={handleItemObsKey} />
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER — MAIN TASK SCREEN
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="fixed inset-0 z-[200] flex flex-col bg-[#FDFAF0] dark:bg-[#1E1E18] overflow-hidden"
    >
      {/* Header */}
      <div className="shrink-0 bg-[#FFE500] dark:bg-[#252520] border-b border-[#D4C000] dark:border-white/[0.07] px-4 py-3 flex items-center gap-3">
        <button onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/[0.09] dark:bg-white/[0.08] text-[#1A1A0E] dark:text-white/70 active:bg-black/20 transition-colors">
          <X size={18} />
        </button>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] leading-none mb-0.5 text-[#1A1A0E]/40 dark:text-white/30">
            Tarefas
          </p>
          <p className="text-base font-black leading-none text-[#1A1A0E] dark:text-[#F2F0E3]">
            Nova Tarefa
          </p>
        </div>
      </div>

      {/* Scroll content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Responsável */}
        <div>
          <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-1">Responsável</label>
          <select value={responsavel} onChange={e => setResponsavel(e.target.value)}
            className="w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E]">
            <option value="">Selecionar responsável...</option>
            {colaboradores.map(c => (
              <option key={c.id} value={c.nome}>{c.nome}</option>
            ))}
          </select>
        </div>

        {/* Tipo */}
        <div>
          <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-1">Tipo</label>
          <select value={taskType ?? ''} onChange={e => setTaskType((e.target.value || null) as any)}
            className="w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E]">
            <option value="">Selecione o tipo...</option>
            <option value="revisao">Revisão de mercadoria</option>
            <option value="tarefa_livre">Escrever tarefa</option>
          </select>
        </div>

        {/* Items list (only for revisao) */}
        {taskType === 'revisao' && (
          <div>
            <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-2">
              Itens para revisão
            </label>

            {items.length > 0 && (
              <div className="space-y-1 mb-3">
                {items.map((item, idx) => (
                  <button key={idx} onClick={() => { setEditingItemIdx(idx); setShowPriceKeyboard(false); setShowItemNameKeyboard(false); setShowItemObsKeyboard(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl text-left active:bg-on-surface/[0.04] transition-colors">
                    <div className={cn('w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shrink-0',
                      item.ean || item.name ? 'bg-[#D81E1E]/10 text-[#D81E1E]' : 'bg-on-surface/[0.05] text-on-surface/30')}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">
                        {item.name || item.ean || 'Item vazio'}
                      </p>
                      {item.ean && item.name && (
                        <p className="text-[10px] text-on-surface/35">EAN {item.ean}</p>
                      )}
                    </div>
                    {item.foundInInventory && (
                      <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    )}
                    <ChevronRight size={14} className="text-on-surface/20 shrink-0" />
                  </button>
                ))}
              </div>
            )}

            <button onClick={addItem}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-[#D81E1E]/25 text-[#D81E1E] text-sm font-bold hover:bg-[#D81E1E]/[0.04] active:scale-95 transition-all">
              <Plus size={16} /> Adicionar item
            </button>
          </div>
        )}

        {/* Observação geral */}
        <div>
          <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-1">Observação</label>
          <div className="flex gap-2">
            <textarea value={observacaoGeral} onChange={e => setObservacaoGeral(e.target.value)}
              inputMode={showObsKeyboard ? 'none' : undefined}
              placeholder="Observações gerais sobre a tarefa..."
              rows={3}
              className="flex-1 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E] resize-none" />
            <button type="button" onClick={() => { setShowObsKeyboard(v => !v); setObsKbdMode('abc'); }}
              className={cn('w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-all active:scale-95',
                showObsKeyboard ? 'bg-[#D81E1E] text-white border-[#D81E1E]' : 'bg-[#FDFAF0] dark:bg-[#252520] border-[#E0D8BF] dark:border-white/[0.08] text-on-surface/50 hover:text-[#D81E1E] hover:border-[#D81E1E]/40')}>
              <Keyboard size={18} />
            </button>
          </div>
        </div>

        {/* Classificação */}
        <div>
          <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-2">Classificação</label>
          <div className="flex gap-2">
            {(['Alta', 'Média', 'Baixa'] as const).map(nivel => (
              <button key={nivel} type="button" onClick={() => setClassificacao(nivel)}
                className={cn('flex-1 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 border',
                  classificacao === nivel
                    ? nivel === 'Alta' ? 'bg-red-500 text-white border-red-500 shadow-md shadow-red-500/20'
                    : nivel === 'Média' ? 'bg-amber-400 text-[#1A1A0E] border-amber-400 shadow-md shadow-amber-400/20'
                    : 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20'
                    : 'bg-on-surface/[0.04] text-on-surface/50 border-on-surface/[0.06]')}>
                {nivel}
              </button>
            ))}
          </div>
          {!classificacao && (
            <p className="text-[10px] text-on-surface/30 mt-1">Selecione uma classificação para enviar</p>
          )}
        </div>

        {/* Enviar + Excluir */}
        <div className="space-y-2 pt-2">
          <button onClick={handleSend} disabled={sending || !classificacao || !taskType}
            className="w-full bg-[#D81E1E] text-white font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#D81E1E]/20 active:scale-[0.97] transition-transform disabled:opacity-50">
            {sending
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Enviando...</>
              : <><Send size={16} />Enviar</>}
          </button>

          {deleteConfirm ? (
            <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-500/10 rounded-2xl">
              <p className="text-sm font-bold text-red-600 dark:text-red-400 flex-1">Excluir esta tarefa?</p>
              <button onClick={() => { setDeleteConfirm(false); onClose(); }}
                className="px-3 py-1.5 bg-red-500 text-white text-xs font-black rounded-xl">Sim</button>
              <button onClick={() => setDeleteConfirm(false)}
                className="px-3 py-1.5 bg-on-surface/10 text-on-surface/60 text-xs font-black rounded-xl">Cancelar</button>
            </div>
          ) : (
            <button onClick={() => setDeleteConfirm(true)}
              className="w-full bg-on-surface/[0.06] text-on-surface/60 font-black py-3 rounded-2xl active:scale-[0.97] transition-transform text-sm">
              Excluir
            </button>
          )}
        </div>

        <div className="h-8" />
      </div>

      {/* QWERTY keyboard panel (observação geral) */}
      <AnimatePresence>
        {showObsKeyboard && (
          <QwertyKeyboard mode={obsKbdMode} shift={obsKbdShift} onKey={handleObsKey} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

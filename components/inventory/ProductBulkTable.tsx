'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, X, Trash2, LayoutGrid, Save, AlertCircle, CheckCircle2,
  ChevronDown, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { EanProblemButton, type EanProblem } from '@/components/shared/EanProblemButton';

// ── Types ──────────────────────────────────────────────────────────────────

type BulkRow = {
  id: string;
  name: string;
  sku: string;
  ean: string;
  category: string;
  subcategory: string;
  brand: string;
  location: string;
  count: string;
  price: string;
  status: string;
};

type SaveResult = { saved: number; errors: number };

interface ProductBulkTableProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rows: Omit<BulkRow, 'id'>[]) => Promise<SaveResult>;
  existingEans?: string[];
  categories?: string[];
  subcategories?: string[];
  brands?: string[];
  locations?: string[];
  eanProblems?: EanProblem[];
  onReportEanProblem?: (ean: string, desc: string, obs: string) => Promise<void>;
  // Review mode
  initialRows?: Array<Partial<Omit<BulkRow, 'id'>>>;
  title?: string;
  subtitle?: string;
  saveButtonLabel?: string;
  skipNameValidation?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['Em Estoque', 'Estoque em Alta', 'Estoque Baixo', 'Fora de Estoque'];

const emptyRow = (): BulkRow => ({
  id: crypto.randomUUID(),
  name: '', sku: '', ean: '',
  category: '', subcategory: '', brand: '',
  location: '', count: '', price: '',
  status: 'Em Estoque',
});

// Column definitions
type ColDef = {
  key: keyof Omit<BulkRow, 'id'>;
  label: string;
  placeholder: string;
  w: string;
  type?: 'text' | 'number' | 'select' | 'combobox';
  optionsKey?: 'categories' | 'subcategories' | 'brands' | 'locations';
  required?: boolean;
  align?: 'left' | 'right';
};

const COLS: ColDef[] = [
  { key: 'name',        label: 'Nome',        placeholder: '',     w: 'auto',   required: true },
  { key: 'sku',         label: 'SKU',         placeholder: '',     w: '96px'  },
  { key: 'ean',         label: 'EAN',         placeholder: '',     w: '134px' },
  { key: 'category',    label: 'Categoria',   placeholder: '',     w: '114px', type: 'combobox', optionsKey: 'categories'    },
  { key: 'subcategory', label: 'Sub.',        placeholder: '',     w: '100px', type: 'combobox', optionsKey: 'subcategories' },
  { key: 'brand',       label: 'Marca',       placeholder: '',     w: '100px', type: 'combobox', optionsKey: 'brands'        },
  { key: 'location',    label: 'Localização', placeholder: '',     w: '118px', type: 'combobox', optionsKey: 'locations'     },
  { key: 'count',       label: 'Qtde',        placeholder: '0',    w: '70px',  type: 'number', align: 'right' },
  { key: 'price',       label: 'Preço R$',    placeholder: '0,00', w: '88px',  type: 'number', align: 'right' },
  { key: 'status',      label: 'Status',      placeholder: '',     w: '130px', type: 'select' },
];

// Focus ring helpers — direct DOM, no re-render
const applyFocus = (el: HTMLElement) => {
  el.style.borderColor = '#D81E1E';
  el.style.boxShadow  = '0 0 0 3px rgba(216,30,30,0.15)';
};
const removeFocus = (el: HTMLElement, invalid?: boolean) => {
  el.style.borderColor = invalid ? 'rgba(216,30,30,0.55)' : '';
  el.style.boxShadow  = '';
};
const applyWarn = (el: HTMLElement) => {
  el.style.borderColor = 'rgba(245,158,11,0.7)';
  el.style.boxShadow  = '0 0 0 3px rgba(245,158,11,0.15)';
};

// ── Component ──────────────────────────────────────────────────────────────

export function ProductBulkTable({
  isOpen, onClose, onSave,
  existingEans = [],
  categories = [],
  subcategories = [],
  brands = [],
  locations = [],
  eanProblems = [],
  onReportEanProblem,
  initialRows,
  title = 'Lista de Produtos',
  subtitle,
  saveButtonLabel = 'Salvar',
  skipNameValidation = false,
}: ProductBulkTableProps) {
  const [rows, setRows]                       = useState<BulkRow[]>([emptyRow()]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [invalidIds, setInvalidIds]           = useState<Set<string>>(new Set());
  const [saving, setSaving]                   = useState(false);
  const [saveResult, setSaveResult]           = useState<SaveResult | null>(null);
  const [openStatusId, setOpenStatusId]       = useState<string | null>(null);

  // Combobox: `${rowId}:${colKey}` of the currently open dropdown
  const [openComboKey, setOpenComboKey] = useState<string | null>(null);
  const comboRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // EAN duplicate detection
  const duplicateEanRowIds = useMemo(() => {
    const set = new Set<string>();
    const eanSet = new Set(existingEans.map(e => e.trim()).filter(Boolean));
    rows.forEach(r => {
      if (r.ean.trim() && eanSet.has(r.ean.trim())) set.add(r.id);
    });
    return set;
  }, [rows, existingEans]);

  // Options map
  const optionsMap: Record<string, string[]> = {
    categories,
    subcategories,
    brands,
    locations,
  };

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      if (initialRows && initialRows.length > 0) {
        setRows(initialRows.map(r => ({
          id: crypto.randomUUID(),
          name: r.name ?? '',
          sku: r.sku ?? '',
          ean: r.ean ?? '',
          category: r.category ?? '',
          subcategory: r.subcategory ?? '',
          brand: r.brand ?? '',
          location: r.location ?? '',
          count: r.count != null ? String(r.count) : '',
          price: r.price != null ? String(r.price) : '',
          status: r.status ?? 'Em Estoque',
        })));
      } else {
        setRows([emptyRow()]);
      }
      setInvalidIds(new Set());
      setSaveResult(null);
      setDeleteConfirmId(null);
      setOpenComboKey(null);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (openComboKey) { setOpenComboKey(null); return; }
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, openComboKey]);

  // Click-outside for combobox
  useEffect(() => {
    if (!openComboKey) return;
    const handler = (e: MouseEvent) => {
      const ref = comboRefs.current.get(openComboKey);
      if (ref && !ref.contains(e.target as Node)) setOpenComboKey(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openComboKey]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const addRow = useCallback(() => {
    setRows(prev => [...prev, emptyRow()]);
  }, []);

  const updateRow = useCallback((id: string, key: keyof Omit<BulkRow, 'id'>, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r));
    setInvalidIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
    setInvalidIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    setDeleteConfirmId(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!skipNameValidation) {
      const invalids = new Set<string>();
      rows.forEach(r => { if (!r.name.trim()) invalids.add(r.id); });
      if (invalids.size > 0) { setInvalidIds(invalids); return; }
    }

    setSaving(true);
    setSaveResult(null);
    try {
      const result = await onSave(rows.map(({ id, ...rest }) => rest));
      setSaveResult(result);
      if (result.errors === 0) setTimeout(() => onClose(), 1200);
    } finally {
      setSaving(false);
    }
  }, [rows, onSave, onClose]);

  // ↑/↓ row navigation
  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLButtonElement>,
    rowIdx: number,
    colIdx: number,
  ) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const targetRow = e.key === 'ArrowDown' ? rowIdx + 1 : rowIdx - 1;
      if (targetRow < 0 || targetRow >= rows.length) return;
      e.preventDefault();
      const cell = document.querySelector<HTMLInputElement>(
        `[data-bulk-row="${targetRow}"][data-bulk-col="${colIdx}"]`,
      );
      if (cell) { cell.focus(); cell.select(); }
    }
    if (e.key === 'Enter' && colIdx === COLS.length - 1 && rowIdx === rows.length - 1) {
      e.preventDefault();
      addRow();
      setTimeout(() => {
        const cell = document.querySelector<HTMLInputElement>(
          `[data-bulk-row="${rowIdx + 1}"][data-bulk-col="0"]`,
        );
        cell?.focus();
      }, 50);
    }
  };

  // Multi-line paste → distribute to rows below
  const handleCellPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number,
    colKey: keyof Omit<BulkRow, 'id'>,
  ) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length <= 1) return;
    e.preventDefault();
    setRows(prev => {
      const next = [...prev];
      lines.forEach((line, i) => {
        const targetIdx = rowIdx + i;
        if (targetIdx < next.length) {
          next[targetIdx] = { ...next[targetIdx], [colKey]: line.trim() };
        } else {
          next.push({ ...emptyRow(), [colKey]: line.trim() });
        }
      });
      return next;
    });
  };

  const filledCount = rows.filter(r => r.name.trim()).length;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="bulk-table-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[500] flex flex-col bg-[#FDFAF0] dark:bg-[#1E1E18]"
          style={{ minHeight: '100dvh' }}
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-6 md:px-8 py-4 border-b shrink-0 bg-[#FFE500] dark:bg-[#252520] border-[#D4C000] dark:border-white/[0.07]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.13] text-[#1A1A0E] dark:text-[#D81E1E]">
                <LayoutGrid size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] leading-none mb-1 text-[#1A1A0E]/40 dark:text-white/[0.28]">
                  {subtitle ?? 'Cadastro em Lote'}
                </p>
                <p className="text-lg font-black leading-none text-[#1A1A0E] dark:text-[#F2F0E3]">
                  {title}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <AnimatePresence>
                {saveResult && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, x: 8 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold',
                      saveResult.errors === 0
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                    )}
                  >
                    <CheckCircle2 size={14} />
                    {saveResult.saved} salvo{saveResult.saved !== 1 ? 's' : ''}
                    {saveResult.errors > 0 && ` · ${saveResult.errors} erro(s)`}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                onClick={onClose}
                className="h-9 px-4 rounded-xl text-sm font-bold bg-black/[0.08] dark:bg-white/[0.07] text-[#1A1A0E]/55 dark:text-white/50 border border-black/[0.14] dark:border-white/[0.10]"
                style={{ transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.75'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
              >
                Cancelar
              </button>

              <button
                onClick={handleSave}
                disabled={saving || filledCount === 0}
                className="h-9 px-5 rounded-xl text-sm font-black text-white flex items-center gap-2 disabled:opacity-50"
                style={{
                  backgroundColor: '#D81E1E',
                  boxShadow:       '0 4px 14px rgba(216,30,30,0.25)',
                  transition:      'all 150ms cubic-bezier(0.23,1,0.32,1)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#c01818'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#D81E1E'; }}
                onMouseDown ={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'; }}
                onMouseUp   ={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
              >
                {saving
                  ? <><Loader2 size={14} className="animate-spin" />Salvando...</>
                  : <><Save size={14} />{saveButtonLabel} {filledCount > 0 && !skipNameValidation ? `(${filledCount})` : ''}</>
                }
              </button>

              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all bg-black/[0.08] dark:bg-white/[0.06] border border-black/[0.10] dark:border-white/[0.08] text-[#1A1A0E]/45 dark:text-white/35 hover:bg-red-500/10 hover:border-red-500/25 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-400"
                style={{ transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)' }}
                onMouseDown ={e => (e.currentTarget as HTMLElement).style.transform = 'scale(0.93)'}
                onMouseUp   ={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* ── Table ──────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-auto px-6 md:px-8 pt-3 pb-2 bg-[#FDFAF0] dark:bg-[#1E1E18]">
            <table
              className="w-full"
              style={{
                minWidth:       '1060px',
                borderCollapse: 'separate',
                borderSpacing:  '5px 3px',
              }}
            >
              {/* column widths */}
              <colgroup>
                <col style={{ width: '28px' }} />
                {COLS.map(col => (
                  <col key={col.key} style={{ width: col.w }} />
                ))}
                <col style={{ width: '34px' }} />
              </colgroup>

              {/* ── Sticky header ── */}
              <thead className="sticky top-0 z-10">
                <tr>
                  <th style={{ padding: 0 }} />
                  {COLS.map(col => (
                    <th key={col.key} style={{ padding: 0, verticalAlign: 'bottom' }}>
                      <div className="block rounded-[9px] bg-[#FFE500] dark:bg-[#FFE500] border-[1.5px] border-[#D4C000] dark:border-[#C8B800] px-[11px] py-2 text-[10px] font-bold tracking-[0.11em] uppercase text-[#1A1A0E]/55 whitespace-nowrap select-none">
                        {col.label}
                        {col.required && (
                          <span style={{ color: '#D81E1E', marginLeft: '2px' }}>*</span>
                        )}
                      </div>
                    </th>
                  ))}
                  <th style={{ padding: 0 }} />
                </tr>
              </thead>

              {/* ── Body ── */}
              <tbody>
                {rows.map((row, rowIdx) => {
                  const isInvalid    = invalidIds.has(row.id);
                  const isEanDup     = duplicateEanRowIds.has(row.id);
                  const isEven       = rowIdx % 2 === 0;

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'group transition-colors',
                        isInvalid
                          ? 'bg-[rgba(200,26,26,0.04)] dark:bg-[rgba(216,30,30,0.08)]'
                          : isEven
                            ? 'bg-white dark:bg-[#252520] hover:bg-[#FFF8D0] dark:hover:bg-white/[0.025]'
                            : 'bg-[#FAF7EE] dark:bg-[#1E1E18] hover:bg-[#FFF8D0] dark:hover:bg-white/[0.025]',
                      )}
                    >
                      {/* Row number */}
                      <td style={{ padding: '0 5px 0 0', textAlign: 'right', verticalAlign: 'middle' }}>
                        <span className="text-[10px] font-mono font-light tracking-[0.03em] text-[#1A1A0E]/28 dark:text-white/[0.22]">
                          {rowIdx + 1}
                        </span>
                      </td>

                      {/* Data cells */}
                      {COLS.map((col, colIdx) => {
                        const isCellInvalid = isInvalid && !!col.required;
                        const isEanCell     = col.key === 'ean';
                        const isEanWarn     = isEanCell && isEanDup;

                        /* ── cell wrapper className ── */
                        const cellCls = cn(
                          'rounded-[9px] border-[1.5px] h-9 flex items-center',
                          'transition-[border-color,box-shadow] duration-[130ms]',
                          col.type === 'combobox' ? 'overflow-visible relative' : 'overflow-hidden',
                          isCellInvalid
                            ? 'border-[rgba(216,30,30,0.55)] bg-[rgba(200,26,26,0.04)] dark:bg-[rgba(216,30,30,0.08)]'
                            : isEanWarn
                              ? 'border-[rgba(245,158,11,0.65)] bg-[rgba(245,158,11,0.06)]'
                              : 'border-[#E0D8BF] dark:border-white/[0.08] bg-white dark:bg-[#252520]',
                        );

                        /* ── input className ── */
                        const inputCls = cn(
                          'bg-transparent border-none outline-none w-full h-full px-[11px]',
                          '[font-family:"DM_Mono",monospace] text-[12px] tracking-[0.02em] caret-[#D81E1E]',
                          col.align === 'right' ? 'text-right' : 'text-left',
                          isCellInvalid
                            ? 'text-[#D81E1E]'
                            : isEanWarn
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-[#1A1A0E] dark:text-[#F2F0E3]',
                          'placeholder:text-[#1A1A0E]/22 dark:placeholder:text-white/25',
                        );

                        return (
                          <td key={col.key} style={{ padding: 0, verticalAlign: 'middle', position: col.type === 'combobox' ? 'relative' : undefined }}>

                            {/* ── STATUS cell ── */}
                            {col.type === 'select' ? (
                              <div
                                className={cellCls}
                                onFocus={e => applyFocus(e.currentTarget)}
                                onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) removeFocus(e.currentTarget); }}
                              >
                                <button
                                  data-bulk-row={rowIdx}
                                  data-bulk-col={colIdx}
                                  onKeyDown={e => handleCellKeyDown(e, rowIdx, colIdx)}
                                  onClick={() => setOpenStatusId(openStatusId === row.id ? null : row.id)}
                                  className="w-full flex items-center justify-between text-left"
                                  style={{ padding: '0 10px', height: '100%', background: 'transparent', border: 'none', cursor: 'pointer' }}
                                >
                                  <span className={cn(
                                    'px-2 py-0.5 rounded-full text-[10px] font-black',
                                    row.status === 'Em Estoque'      && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                                    row.status === 'Estoque em Alta' && 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
                                    row.status === 'Estoque Baixo'   && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                                    row.status === 'Fora de Estoque' && 'bg-red-500/15 text-red-600 dark:text-red-400',
                                  )}>
                                    {row.status}
                                  </span>
                                  <ChevronDown size={11} className={cn('transition-transform duration-150 shrink-0 text-[#1A1A0E]/22 dark:text-white/25', openStatusId === row.id && 'rotate-180')} />
                                </button>
                                <AnimatePresence>
                                  {openStatusId === row.id && (
                                    <motion.div
                                      initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                      animate={{ opacity: 1, y: 0, scale: 1 }}
                                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                      transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
                                      className="absolute left-0 top-full z-50 w-44 rounded-xl shadow-xl overflow-hidden bg-white dark:bg-[#2E2E28] border border-[#E0D8BF] dark:border-white/[0.08]"
                                    >
                                      {STATUS_OPTIONS.map(opt => (
                                        <button
                                          key={opt}
                                          onMouseDown={() => { updateRow(row.id, 'status', opt); setOpenStatusId(null); }}
                                          className="w-full text-left px-3 py-2.5 text-xs font-semibold transition-colors text-[#1A1A0E]/70 dark:text-white/70 hover:bg-[#FFF8D0] dark:hover:bg-white/[0.04]"
                                        >
                                          {opt}
                                        </button>
                                      ))}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>

                            ) : col.type === 'combobox' ? (() => {
                              /* ── COMBOBOX cell ── */
                              const comboKey  = `${row.id}:${col.key}`;
                              const isOpen    = openComboKey === comboKey;
                              const allOpts   = col.optionsKey ? (optionsMap[col.optionsKey] ?? []) : [];
                              const typed     = (row[col.key] as string) ?? '';
                              const filtered  = typed.trim()
                                ? allOpts.filter(o => o.toLowerCase().includes(typed.toLowerCase()))
                                : allOpts;
                              const showDrop  = isOpen && (filtered.length > 0 || allOpts.length === 0);

                              return (
                                <div
                                  ref={el => {
                                    if (el) comboRefs.current.set(comboKey, el);
                                    else comboRefs.current.delete(comboKey);
                                  }}
                                  style={{ position: 'relative' }}
                                >
                                  <div
                                    className={cellCls}
                                    style={{ paddingRight: '30px' }}
                                    onFocus={e => {
                                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                        applyFocus(e.currentTarget);
                                        setOpenComboKey(comboKey);
                                      }
                                    }}
                                    onBlur={e => {
                                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                        removeFocus(e.currentTarget);
                                      }
                                    }}
                                  >
                                    <input
                                      data-bulk-row={rowIdx}
                                      data-bulk-col={colIdx}
                                      type="text"
                                      value={typed}
                                      placeholder={col.placeholder}
                                      onChange={e => {
                                        updateRow(row.id, col.key, e.target.value);
                                        setOpenComboKey(comboKey);
                                      }}
                                      onFocus={() => setOpenComboKey(comboKey)}
                                      onKeyDown={e => {
                                        if (e.key === 'Escape') { setOpenComboKey(null); e.stopPropagation(); return; }
                                        handleCellKeyDown(e as any, rowIdx, colIdx);
                                      }}
                                      onPaste={e => handleCellPaste(e as any, rowIdx, colIdx, col.key)}
                                      className={cn(inputCls, 'pr-[2px]')}
                                    />
                                    {/* "+" button */}
                                    <button
                                      tabIndex={-1}
                                      title="Digitar novo valor"
                                      onMouseDown={e => {
                                        e.preventDefault();
                                        setOpenComboKey(null);
                                        // focus input so user can type freely
                                        const inp = (e.currentTarget as HTMLElement).previousSibling as HTMLInputElement | null;
                                        if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
                                      }}
                                      className="absolute right-[6px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-[5px] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] bg-black/[0.05] dark:bg-white/[0.06] text-[#1A1A0E]/22 dark:text-white/25 flex items-center justify-center cursor-pointer shrink-0 transition-all duration-[120ms] p-0 leading-none hover:text-[#D81E1E] hover:border-[rgba(216,30,30,0.35)] hover:bg-[rgba(216,30,30,0.07)]"
                                    >
                                      <Plus size={10} strokeWidth={2.5} />
                                    </button>
                                  </div>

                                  {/* Dropdown */}
                                  <AnimatePresence>
                                    {showDrop && (
                                      <motion.div
                                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                        transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
                                        className="absolute left-0 top-[calc(100%+3px)] min-w-full max-w-[220px] z-[100] rounded-[10px] overflow-hidden bg-white dark:bg-[#2E2E28] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.13)]"
                                      >
                                        <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                                          {filtered.slice(0, 8).map(opt => (
                                            <button
                                              key={opt}
                                              onMouseDown={e => {
                                                e.preventDefault();
                                                updateRow(row.id, col.key, opt);
                                                setOpenComboKey(null);
                                              }}
                                              className="block w-full text-left px-[11px] py-[7px] text-[11px] font-medium text-[#1A1A0E]/70 dark:text-white/70 bg-transparent border-none cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis hover:bg-[#FFF8D0] dark:hover:bg-white/[0.04] [font-family:'DM_Mono',monospace]"
                                            >
                                              {opt}
                                            </button>
                                          ))}
                                          {filtered.length === 0 && allOpts.length > 0 && (
                                            <p className="px-[11px] py-[7px] text-[11px] italic text-[#1A1A0E]/22 dark:text-white/25">
                                              Nenhum resultado — clique "+" para criar
                                            </p>
                                          )}
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              );
                            })() : (
                              /* ── TEXT / NUMBER cell ── */
                              <div
                                className={cellCls}
                                onFocus={e => {
                                  if (isEanWarn) applyWarn(e.currentTarget);
                                  else if (!isCellInvalid) applyFocus(e.currentTarget);
                                }}
                                onBlur={e => {
                                  if (isEanWarn) {
                                    e.currentTarget.style.borderColor = 'rgba(245,158,11,0.65)';
                                    e.currentTarget.style.boxShadow = '';
                                  } else if (!isCellInvalid) {
                                    removeFocus(e.currentTarget);
                                  }
                                }}
                              >
                                <input
                                  data-bulk-row={rowIdx}
                                  data-bulk-col={colIdx}
                                  type={col.type ?? 'text'}
                                  value={row[col.key]}
                                  placeholder={col.placeholder}
                                  onChange={e => updateRow(row.id, col.key, e.target.value)}
                                  onKeyDown={e => handleCellKeyDown(e as any, rowIdx, colIdx)}
                                  onPaste={e => handleCellPaste(e as any, rowIdx, colIdx, col.key)}
                                  className={cn(
                                    inputCls,
                                    col.type === 'number' && '[appearance:textfield] [&::-webkit-inner-spin-button]:hidden',
                                    isEanWarn && 'pr-7',
                                  )}
                                />
                                {/* EAN duplicate warning icon */}
                                {isEanWarn && (
                                  <div
                                    title="EAN já cadastrado no inventário"
                                    style={{
                                      position:       'absolute',
                                      right:          row.ean.trim() && onReportEanProblem ? '26px' : '7px',
                                      top:            '50%',
                                      transform:      'translateY(-50%)',
                                      color:          '#d97706',
                                      display:        'flex',
                                      alignItems:     'center',
                                      pointerEvents:  'none',
                                      flexShrink:     0,
                                    }}
                                  >
                                    <AlertCircle size={13} />
                                  </div>
                                )}
                                {/* EAN problem button */}
                                {row.ean.trim() && onReportEanProblem && (
                                  <div
                                    style={{
                                      position:  'absolute',
                                      right:     '7px',
                                      top:       '50%',
                                      transform: 'translateY(-50%)',
                                      display:   'flex',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <EanProblemButton
                                      ean={row.ean}
                                      problems={eanProblems}
                                      onReport={(ean, desc, obs) => onReportEanProblem(ean, desc, obs)}
                                      size="xs"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* Delete */}
                      <td style={{ padding: 0, textAlign: 'center', verticalAlign: 'middle' }}>
                        <AnimatePresence mode="wait">
                          {deleteConfirmId === row.id ? (
                            <motion.div
                              key="confirm"
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              transition={{ duration: 0.12 }}
                              className="flex items-center gap-1"
                            >
                              <button onClick={() => removeRow(row.id)} className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-black rounded-md hover:bg-red-600 transition-colors">Sim</button>
                              <button onClick={() => setDeleteConfirmId(null)} className="px-1.5 py-0.5 text-[10px] font-black rounded-md transition-colors bg-black/[0.08] dark:bg-white/[0.07] text-[#1A1A0E]/55 dark:text-white/50">Não</button>
                            </motion.div>
                          ) : (
                            <motion.button
                              key="trash"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              onClick={() => rows.length === 1 ? updateRow(row.id, 'name', '') : setDeleteConfirmId(row.id)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-[#1A1A0E]/22 dark:text-white/[0.15] hover:text-[#D81E1E] hover:bg-[rgba(216,30,30,0.10)]"
                              onMouseDown={e => (e.currentTarget as HTMLElement).style.transform = 'scale(0.90)'}
                              onMouseUp  ={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
                              title={rows.length === 1 ? 'Limpar linha' : 'Remover linha'}
                            >
                              <Trash2 size={13} />
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Add row */}
            <button
              onClick={addRow}
              title="Adicionar linha"
              className="w-8 h-8 mt-1 flex items-center justify-center rounded-[7px] border border-dashed border-[#1A1A0E]/22 dark:border-white/[0.18] text-[#1A1A0E]/30 dark:text-white/25 bg-transparent shrink-0 cursor-pointer hover:text-[#D81E1E] hover:border-[rgba(216,30,30,0.45)] hover:bg-[rgba(216,30,30,0.04)] active:scale-95"
              style={{ transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)' }}
              onMouseDown={e => (e.currentTarget as HTMLElement).style.transform = 'scale(0.96)'}
              onMouseUp  ={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
            >
              <Plus size={13} />
            </button>
          </div>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-6 md:px-8 py-3 border-t shrink-0 bg-[#FFF7B0] dark:bg-[#252520] border-[#DDD000] dark:border-white/[0.06]">
            <span className="text-[10px] font-light tracking-[0.04em] text-[#1A1A0E]/40 dark:text-white/[0.28]" style={{ fontFamily: '"DM Mono", monospace' }}>
              ↑ ↓ navegar · Tab próxima · ⌘V colar coluna
            </span>

            <div className="flex items-center gap-4 text-xs font-semibold text-[#1A1A0E]/40 dark:text-white/[0.28]">
              {duplicateEanRowIds.size > 0 && (
                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <AlertCircle size={13} />
                  {duplicateEanRowIds.size} EAN{duplicateEanRowIds.size !== 1 ? 's' : ''} já cadastrado{duplicateEanRowIds.size !== 1 ? 's' : ''}
                </span>
              )}
              {invalidIds.size > 0 && (
                <span className="flex items-center gap-1.5 text-red-500">
                  <AlertCircle size={13} />
                  {invalidIds.size} linha{invalidIds.size !== 1 ? 's' : ''} com Nome em branco
                </span>
              )}
              <span>
                {rows.length} linha{rows.length !== 1 ? 's' : ''} · {filledCount} preenchida{filledCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

        </motion.div>
      )}
    </AnimatePresence>
  );
}

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus, X, Trash2, LayoutGrid, Save, AlertCircle, CheckCircle2,
  ChevronDown, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

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

// Column definitions — w is the explicit CSS col width ('auto' for flex)
type ColDef = {
  key: keyof Omit<BulkRow, 'id'>;
  label: string;
  placeholder: string;
  w: string;
  type?: 'text' | 'number' | 'select';
  required?: boolean;
  align?: 'left' | 'right';
};

const COLS: ColDef[] = [
  { key: 'name',        label: 'Nome',        placeholder: 'Ex: Chocolate Lacta 80g',  w: 'auto',   required: true },
  { key: 'sku',         label: 'SKU',         placeholder: 'SKU-001',                  w: '96px'  },
  { key: 'ean',         label: 'EAN',         placeholder: '7891234567890',             w: '134px' },
  { key: 'category',    label: 'Categoria',   placeholder: 'Doméstico',                w: '114px' },
  { key: 'subcategory', label: 'Sub.',        placeholder: 'Cozinha',                  w: '100px' },
  { key: 'brand',       label: 'Marca',       placeholder: 'Lacta',                    w: '100px' },
  { key: 'location',    label: 'Localização', placeholder: 'Prateleira A1',            w: '118px' },
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

// ── Component ──────────────────────────────────────────────────────────────

export function ProductBulkTable({ isOpen, onClose, onSave }: ProductBulkTableProps) {
  const [rows, setRows]                     = useState<BulkRow[]>([emptyRow()]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [invalidIds, setInvalidIds]         = useState<Set<string>>(new Set());
  const [saving, setSaving]                 = useState(false);
  const [saveResult, setSaveResult]         = useState<SaveResult | null>(null);
  const [openStatusId, setOpenStatusId]     = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setRows([emptyRow()]);
      setInvalidIds(new Set());
      setSaveResult(null);
      setDeleteConfirmId(null);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

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
    const invalids = new Set<string>();
    rows.forEach(r => { if (!r.name.trim()) invalids.add(r.id); });
    if (invalids.size > 0) { setInvalidIds(invalids); return; }

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
          className="fixed inset-0 z-[500] flex flex-col bg-[#FFFCEC] dark:bg-[#0f0f0c]"
          style={{ minHeight: '100dvh' }}
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div
            className="flex items-center justify-between px-6 md:px-8 py-4 border-b shrink-0"
            style={{
              backgroundColor: 'var(--bt-header-bg)',
              borderColor:     'var(--bt-header-border)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--bt-icon-bg)' }}
              >
                <LayoutGrid size={18} style={{ color: 'var(--bt-icon)' }} />
              </div>
              <div>
                <p
                  className="text-[10px] font-black uppercase tracking-[0.18em] leading-none mb-1"
                  style={{ color: 'var(--bt-subtitle)' }}
                >
                  Cadastro em Lote
                </p>
                <p className="text-lg font-black leading-none" style={{ color: 'var(--bt-title)' }}>
                  Lista de Produtos
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
                className="h-9 px-4 rounded-xl text-sm font-bold"
                style={{
                  backgroundColor: 'var(--bt-btn-cancel-bg)',
                  color:           'var(--bt-btn-cancel-text)',
                  border:          '1.5px solid var(--bt-btn-cancel-border)',
                  transition:      'all 150ms cubic-bezier(0.23,1,0.32,1)',
                }}
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
                  : <><Save size={14} />Salvar {filledCount > 0 ? `(${filledCount})` : ''}</>
                }
              </button>

              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  color:      'var(--bt-close)',
                  transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.6'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                onMouseDown ={e => (e.currentTarget as HTMLElement).style.transform = 'scale(0.93)'}
                onMouseUp   ={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* ── Table ──────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-auto px-6 md:px-8 pt-3 pb-2 bg-[#FFFCEC] dark:bg-[#0f0f0c]">
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
                  {/* row-num col: empty */}
                  <th style={{ padding: 0 }} />

                  {COLS.map(col => (
                    <th key={col.key} style={{ padding: 0, verticalAlign: 'bottom' }}>
                      <div
                        style={{
                          display:        'block',
                          borderRadius:   '9px',
                          background:     'var(--bt-col-header-bg)',
                          border:         '1.5px solid var(--bt-col-header-border)',
                          padding:        '8px 11px',
                          fontSize:       '10px',
                          fontWeight:     700,
                          letterSpacing:  '0.11em',
                          textTransform:  'uppercase',
                          color:          'var(--bt-col-header-text)',
                          whiteSpace:     'nowrap',
                          userSelect:     'none',
                        }}
                      >
                        {col.label}
                        {col.required && (
                          <span style={{ color: '#D81E1E', marginLeft: '2px' }}>*</span>
                        )}
                      </div>
                    </th>
                  ))}

                  {/* delete col: empty */}
                  <th style={{ padding: 0 }} />
                </tr>
              </thead>

              {/* ── Body ── */}
              <tbody>
                {rows.map((row, rowIdx) => {
                  const isInvalid = invalidIds.has(row.id);
                  const isEven    = rowIdx % 2 === 0;

                  return (
                    <tr
                      key={row.id}
                      className="group"
                      style={{
                        background: isInvalid
                          ? 'var(--bt-row-invalid)'
                          : isEven
                            ? 'var(--bt-row-even)'
                            : 'var(--bt-row-odd)',
                      }}
                      onMouseEnter={e => {
                        if (!isInvalid)
                          (e.currentTarget as HTMLElement).style.background = 'var(--bt-row-hover)';
                      }}
                      onMouseLeave={e => {
                        if (!isInvalid)
                          (e.currentTarget as HTMLElement).style.background =
                            isEven ? 'var(--bt-row-even)' : 'var(--bt-row-odd)';
                      }}
                    >
                      {/* Row number */}
                      <td style={{ padding: '0 5px 0 0', textAlign: 'right', verticalAlign: 'middle' }}>
                        <span
                          style={{
                            fontSize:    '10px',
                            fontFamily:  'monospace',
                            fontWeight:  300,
                            letterSpacing: '0.03em',
                            color:       'var(--bt-row-num)',
                          }}
                        >
                          {rowIdx + 1}
                        </span>
                      </td>

                      {/* Data cells */}
                      {COLS.map((col, colIdx) => {
                        const isCellInvalid = isInvalid && !!col.required;

                        /* ── cell wrapper style ── */
                        const cellBase: React.CSSProperties = {
                          borderRadius: '9px',
                          border:       `1.5px solid ${
                            isCellInvalid
                              ? 'rgba(216,30,30,0.55)'
                              : 'var(--bt-cell-border)'
                          }`,
                          background:   isCellInvalid
                            ? 'var(--bt-cell-invalid-bg)'
                            : 'var(--bt-cell-bg)',
                          height:       '36px',
                          display:      'flex',
                          alignItems:   'center',
                          overflow:     'hidden',
                          transition:   'border-color 130ms cubic-bezier(0.23,1,0.32,1), box-shadow 130ms cubic-bezier(0.23,1,0.32,1)',
                        };

                        /* ── input style ── */
                        const inputStyle: React.CSSProperties = {
                          background:    'transparent',
                          border:        'none',
                          outline:       'none',
                          width:         '100%',
                          height:        '100%',
                          padding:       '0 11px',
                          fontFamily:    '"DM Mono", monospace',
                          fontSize:      '12px',
                          fontWeight:    400,
                          letterSpacing: '0.02em',
                          color:         isCellInvalid ? '#D81E1E' : 'var(--bt-cell-text)',
                          textAlign:     col.align ?? 'left',
                          caretColor:    '#D81E1E',
                        };

                        return (
                          <td key={col.key} style={{ padding: 0, verticalAlign: 'middle' }}>
                            {col.type === 'select' ? (
                              /* ── Status cell ── */
                              <div
                                style={cellBase}
                                onFocus={e => applyFocus(e.currentTarget)}
                                onBlur ={e => {
                                  if (!e.currentTarget.contains(e.relatedTarget as Node))
                                    removeFocus(e.currentTarget);
                                }}
                              >
                                <button
                                  data-bulk-row={rowIdx}
                                  data-bulk-col={colIdx}
                                  onKeyDown={e => handleCellKeyDown(e, rowIdx, colIdx)}
                                  onClick={() =>
                                    setOpenStatusId(openStatusId === row.id ? null : row.id)
                                  }
                                  className="w-full flex items-center justify-between text-left"
                                  style={{ padding: '0 10px', height: '100%', background: 'transparent', border: 'none', cursor: 'pointer' }}
                                >
                                  <span
                                    className={cn(
                                      'px-2 py-0.5 rounded-full text-[10px] font-black',
                                      row.status === 'Em Estoque'     && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                                      row.status === 'Estoque em Alta'&& 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
                                      row.status === 'Estoque Baixo'  && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                                      row.status === 'Fora de Estoque'&& 'bg-red-500/15 text-red-600 dark:text-red-400',
                                    )}
                                  >
                                    {row.status}
                                  </span>
                                  <ChevronDown
                                    size={11}
                                    style={{ color: 'var(--bt-cell-muted)', flexShrink: 0 }}
                                    className={cn('transition-transform duration-150', openStatusId === row.id && 'rotate-180')}
                                  />
                                </button>

                                <AnimatePresence>
                                  {openStatusId === row.id && (
                                    <motion.div
                                      initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                      animate={{ opacity: 1, y: 0, scale: 1 }}
                                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                      transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
                                      className="absolute left-0 top-full z-50 w-44 rounded-xl shadow-xl overflow-hidden"
                                      style={{
                                        backgroundColor: 'var(--bt-dropdown-bg)',
                                        border:          '1px solid var(--bt-cell-border)',
                                      }}
                                    >
                                      {STATUS_OPTIONS.map(opt => (
                                        <button
                                          key={opt}
                                          onMouseDown={() => {
                                            updateRow(row.id, 'status', opt);
                                            setOpenStatusId(null);
                                          }}
                                          className="w-full text-left px-3 py-2.5 text-xs font-semibold transition-colors"
                                          style={{ color: 'var(--bt-cell-text)' }}
                                          onMouseEnter={e =>
                                            (e.currentTarget as HTMLElement).style.backgroundColor =
                                              'var(--bt-row-hover)'
                                          }
                                          onMouseLeave={e =>
                                            (e.currentTarget as HTMLElement).style.backgroundColor =
                                              'transparent'
                                          }
                                        >
                                          {opt}
                                        </button>
                                      ))}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            ) : (
                              /* ── Text / number cell ── */
                              <div
                                style={cellBase}
                                onFocus={e => !isCellInvalid && applyFocus(e.currentTarget)}
                                onBlur ={e => !isCellInvalid && removeFocus(e.currentTarget)}
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
                                    col.type === 'number' && '[appearance:textfield] [&::-webkit-inner-spin-button]:hidden',
                                  )}
                                  style={inputStyle}
                                />
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
                              <button
                                onClick={() => removeRow(row.id)}
                                className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-black rounded-md hover:bg-red-600 transition-colors"
                              >
                                Sim
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-1.5 py-0.5 text-[10px] font-black rounded-md transition-colors"
                                style={{
                                  backgroundColor: 'var(--bt-btn-cancel-bg)',
                                  color:           'var(--bt-btn-cancel-text)',
                                }}
                              >
                                Não
                              </button>
                            </motion.div>
                          ) : (
                            <motion.button
                              key="trash"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              onClick={() =>
                                rows.length === 1
                                  ? updateRow(row.id, 'name', '')
                                  : setDeleteConfirmId(row.id)
                              }
                              className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                              style={{ color: 'var(--bt-cell-muted)' }}
                              onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.color = '#D81E1E';
                                (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(216,30,30,0.1)';
                              }}
                              onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.color = '';
                                (e.currentTarget as HTMLElement).style.backgroundColor = '';
                              }}
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
              className="mt-1 w-full flex items-center justify-center gap-2 font-bold uppercase tracking-[0.1em]"
              style={{
                height:       '36px',
                borderRadius: '9px',
                fontSize:     '10px',
                border:       '1.5px dashed var(--bt-add-border)',
                color:        'var(--bt-add-text)',
                background:   'transparent',
                transition:   'all 150ms cubic-bezier(0.23,1,0.32,1)',
                cursor:       'pointer',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.color       = '#D81E1E';
                el.style.borderColor = 'rgba(216,30,30,0.45)';
                el.style.background  = 'rgba(216,30,30,0.04)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.color       = '';
                el.style.borderColor = '';
                el.style.background  = '';
              }}
              onMouseDown={e => (e.currentTarget as HTMLElement).style.transform = 'scale(0.98)'}
              onMouseUp  ={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
            >
              <Plus size={12} />
              Adicionar linha
            </button>
          </div>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <div
            className="flex items-center justify-between px-6 md:px-8 py-3 border-t shrink-0"
            style={{
              backgroundColor: 'var(--bt-footer-bg)',
              borderColor:     'var(--bt-footer-border)',
            }}
          >
            <span
              className="text-[10px] font-light tracking-[0.04em]"
              style={{ color: 'var(--bt-subtitle)', fontFamily: '"DM Mono", monospace' }}
            >
              ↑ ↓ navegar · Tab próxima · ⌘V colar coluna
            </span>

            <div className="flex items-center gap-4 text-xs font-semibold" style={{ color: 'var(--bt-subtitle)' }}>
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

          {/* ── CSS Tokens ─────────────────────────────────────────────── */}
          <style jsx>{`
            /* ── LIGHT — cream + brand yellow ── */
            div {
              --bt-bg:                #FFFCEC;
              --bt-header-bg:         #FFE500;
              --bt-header-border:     #D4C900;
              --bt-icon-bg:           rgba(216,30,30,0.10);
              --bt-icon:              #D81E1E;
              --bt-title:             #1a1a14;
              --bt-subtitle:          rgba(26,26,20,0.48);
              --bt-close:             rgba(26,26,20,0.45);
              --bt-btn-cancel-bg:     rgba(26,26,20,0.07);
              --bt-btn-cancel-text:   rgba(26,26,20,0.60);
              --bt-btn-cancel-border: #DDD5BC;

              --bt-col-header-bg:     #FFE500;
              --bt-col-header-border: #D4C900;
              --bt-col-header-text:   rgba(26,26,20,0.72);

              --bt-row-even:          #FFFFFF;
              --bt-row-odd:           #FAF7EE;
              --bt-row-hover:         #FFF8D0;
              --bt-row-invalid:       rgba(216,30,30,0.05);
              --bt-row-num:           rgba(26,26,20,0.28);

              --bt-cell-bg:           #FFFFFF;
              --bt-cell-border:       #E2D9C5;
              --bt-cell-invalid-bg:   rgba(216,30,30,0.04);
              --bt-cell-text:         #1a1a14;
              --bt-cell-muted:        rgba(26,26,20,0.32);
              --bt-dropdown-bg:       #FFFFFF;

              --bt-add-border:        #D2C9B5;
              --bt-add-text:          rgba(26,26,20,0.38);

              --bt-footer-bg:         #F5F2E8;
              --bt-footer-border:     #E9DFC2;
            }

            /* ── DARK — industrial charcoal ── */
            @media (prefers-color-scheme: dark) {
              div {
                --bt-bg:                #0f0f0c;
                --bt-header-bg:         #1c1c16;
                --bt-header-border:     rgba(216,30,30,0.22);
                --bt-icon-bg:           rgba(216,30,30,0.13);
                --bt-icon:              #D81E1E;
                --bt-title:             #f2f0e3;
                --bt-subtitle:          rgba(242,240,227,0.36);
                --bt-close:             rgba(242,240,227,0.32);
                --bt-btn-cancel-bg:     rgba(242,240,227,0.06);
                --bt-btn-cancel-text:   rgba(242,240,227,0.48);
                --bt-btn-cancel-border: rgba(242,240,227,0.08);

                --bt-col-header-bg:     #2e2e28;
                --bt-col-header-border: rgba(242,240,227,0.07);
                --bt-col-header-text:   rgba(242,240,227,0.50);

                --bt-row-even:          #141410;
                --bt-row-odd:           #161612;
                --bt-row-hover:         rgba(242,240,227,0.025);
                --bt-row-invalid:       rgba(216,30,30,0.08);
                --bt-row-num:           rgba(242,240,227,0.20);

                --bt-cell-bg:           #1e1e18;
                --bt-cell-border:       rgba(242,240,227,0.08);
                --bt-cell-invalid-bg:   rgba(216,30,30,0.08);
                --bt-cell-text:         #f2f0e3;
                --bt-cell-muted:        rgba(242,240,227,0.28);
                --bt-dropdown-bg:       #2a2a24;

                --bt-add-border:        rgba(242,240,227,0.13);
                --bt-add-text:          rgba(242,240,227,0.32);

                --bt-footer-bg:         #1c1c16;
                --bt-footer-border:     rgba(242,240,227,0.06);
              }
            }

            /* placeholder color via CSS (can't be done inline) */
            input::placeholder {
              color: var(--bt-cell-muted);
              opacity: 1;
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

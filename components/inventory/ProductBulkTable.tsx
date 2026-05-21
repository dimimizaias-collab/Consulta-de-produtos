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

// Column definitions
type ColDef = {
  key: keyof Omit<BulkRow, 'id'>;
  label: string;
  placeholder: string;
  width: string;        // CSS width for the th/td
  type?: 'text' | 'number' | 'select';
  required?: boolean;
};

const COLS: ColDef[] = [
  { key: 'name',        label: 'Nome',        placeholder: 'Ex: Chocolate Lacta 80g',  width: 'w-[220px]', required: true },
  { key: 'sku',         label: 'SKU',         placeholder: 'SKU-001',                  width: 'w-[110px]' },
  { key: 'ean',         label: 'EAN',         placeholder: '7891234567890',             width: 'w-[140px]' },
  { key: 'category',    label: 'Categoria',   placeholder: 'Doméstico',                width: 'w-[120px]' },
  { key: 'subcategory', label: 'Sub.',        placeholder: 'Cozinha',                  width: 'w-[110px]' },
  { key: 'brand',       label: 'Marca',       placeholder: 'Lacta',                    width: 'w-[110px]' },
  { key: 'location',    label: 'Localização', placeholder: 'Prateleira A1',            width: 'w-[120px]' },
  { key: 'count',       label: 'Qtde',        placeholder: '0',                        width: 'w-[72px]', type: 'number' },
  { key: 'price',       label: 'Preço',       placeholder: '0,00',                     width: 'w-[90px]', type: 'number' },
  { key: 'status',      label: 'Status',      placeholder: '',                         width: 'w-[130px]', type: 'select' },
];

// ── Component ──────────────────────────────────────────────────────────────

export function ProductBulkTable({ isOpen, onClose, onSave }: ProductBulkTableProps) {
  const [rows, setRows] = useState<BulkRow[]>([emptyRow()]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [invalidIds, setInvalidIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [openStatusId, setOpenStatusId] = useState<string | null>(null);

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
    setDeleteConfirmId(null);
  }, []);

  const handleSave = useCallback(async () => {
    // Validate required fields
    const invalids = new Set<string>();
    rows.forEach(r => { if (!r.name.trim()) invalids.add(r.id); });
    if (invalids.size > 0) { setInvalidIds(invalids); return; }

    setSaving(true);
    setSaveResult(null);
    try {
      const result = await onSave(rows.map(({ id, ...rest }) => rest));
      setSaveResult(result);
      if (result.errors === 0) {
        // auto-close after brief success flash
        setTimeout(() => onClose(), 1200);
      }
    } finally {
      setSaving(false);
    }
  }, [rows, onSave, onClose]);

  // Keyboard: ↑/↓ navigate between rows in same column
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
    // Enter on last col → add row
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

  // Paste handler: distribute multi-line clipboard to rows below
  const handleCellPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number,
    colKey: keyof Omit<BulkRow, 'id'>,
  ) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length <= 1) return; // let browser handle single-line paste
    e.preventDefault();
    setRows(prev => {
      const next = [...prev];
      lines.forEach((line, i) => {
        const targetIdx = rowIdx + i;
        if (targetIdx < next.length) {
          next[targetIdx] = { ...next[targetIdx], [colKey]: line.trim() };
        } else {
          const newRow = emptyRow();
          next.push({ ...newRow, [colKey]: line.trim() });
        }
      });
      return next;
    });
  };

  // Filled row count (at least name)
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
          className="fixed inset-0 z-50 flex flex-col"
          style={{ backgroundColor: 'var(--color-background, #FFFCEC)' }}
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div
            className="flex items-center justify-between px-6 md:px-10 py-4 border-b shrink-0"
            style={{
              backgroundColor: 'var(--color-header-bg)',
              borderColor: 'var(--color-header-border)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--color-icon-bg)' }}
              >
                <LayoutGrid size={18} style={{ color: 'var(--color-icon)' }} />
              </div>
              <div>
                <p
                  className="text-[10px] font-black uppercase tracking-[0.18em] leading-none mb-1"
                  style={{ color: 'var(--color-subtitle)' }}
                >
                  Cadastro em Lote
                </p>
                <p
                  className="text-lg font-black leading-none"
                  style={{ color: 'var(--color-title)' }}
                >
                  Lista de Produtos
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Save result badge */}
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
                className="h-9 px-4 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                style={{
                  backgroundColor: 'var(--color-btn-cancel-bg)',
                  color: 'var(--color-btn-cancel-text)',
                  transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)',
                }}
              >
                Cancelar
              </button>

              <button
                onClick={handleSave}
                disabled={saving || filledCount === 0}
                className="h-9 px-5 rounded-xl text-sm font-black text-white flex items-center gap-2 disabled:opacity-50 active:scale-[0.97]"
                style={{
                  backgroundColor: '#D81E1E',
                  boxShadow: '0 4px 14px rgba(216,30,30,0.25)',
                  transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)',
                }}
              >
                {saving
                  ? <><Loader2 size={14} className="animate-spin" />Salvando...</>
                  : <><Save size={14} />Salvar {filledCount > 0 ? `(${filledCount})` : ''}</>
                }
              </button>

              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-[0.97]"
                style={{
                  color: 'var(--color-close)',
                  transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)',
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* ── Table ──────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse" style={{ minWidth: '1100px' }}>
              {/* Sticky header */}
              <thead
                className="sticky top-0 z-10"
                style={{ backgroundColor: 'var(--color-thead-bg)' }}
              >
                <tr>
                  {/* Row number column */}
                  <th
                    className="w-10 py-3 text-center text-[9px] font-black uppercase tracking-widest select-none"
                    style={{
                      color: 'var(--color-thead-text)',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                  >
                    #
                  </th>

                  {COLS.map(col => (
                    <th
                      key={col.key}
                      className={cn('py-3 px-3 text-left text-[9px] font-black uppercase tracking-widest', col.width)}
                      style={{
                        color: 'var(--color-thead-text)',
                        borderBottom: '1px solid var(--color-border)',
                        minWidth: col.width.replace('w-[', '').replace(']', ''),
                      }}
                    >
                      {col.label}
                      {col.required && (
                        <span className="ml-0.5 text-[#D81E1E]">*</span>
                      )}
                    </th>
                  ))}

                  {/* Delete column */}
                  <th
                    className="w-10 py-3"
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  />
                </tr>
              </thead>

              <tbody>
                {rows.map((row, rowIdx) => {
                  const isInvalid = invalidIds.has(row.id);
                  const isEven = rowIdx % 2 === 0;

                  return (
                    <tr
                      key={row.id}
                      className="group transition-colors"
                      style={{
                        backgroundColor: isInvalid
                          ? 'var(--color-row-invalid)'
                          : isEven
                            ? 'var(--color-row-even)'
                            : 'var(--color-row-odd)',
                      }}
                      onMouseEnter={e => {
                        if (!isInvalid) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-row-hover)';
                      }}
                      onMouseLeave={e => {
                        if (!isInvalid) (e.currentTarget as HTMLElement).style.backgroundColor = isEven ? 'var(--color-row-even)' : 'var(--color-row-odd)';
                      }}
                    >
                      {/* Row number */}
                      <td
                        className="w-10 py-2 text-center font-mono text-[10px] select-none"
                        style={{ color: 'var(--color-row-num)', borderBottom: '1px solid var(--color-row-border)' }}
                      >
                        {rowIdx + 1}
                      </td>

                      {/* Data cells */}
                      {COLS.map((col, colIdx) => (
                        <td
                          key={col.key}
                          className={cn('py-0 px-3', col.width)}
                          style={{ borderBottom: '1px solid var(--color-row-border)' }}
                        >
                          {col.type === 'select' ? (
                            /* Status dropdown */
                            <div className="relative">
                              <button
                                data-bulk-row={rowIdx}
                                data-bulk-col={colIdx}
                                onKeyDown={e => handleCellKeyDown(e, rowIdx, colIdx)}
                                onClick={() => setOpenStatusId(openStatusId === row.id ? null : row.id)}
                                className="w-full flex items-center justify-between py-2 text-xs font-semibold transition-colors text-left"
                                style={{ color: 'var(--color-cell-text)' }}
                              >
                                <span className={cn(
                                  'px-2 py-0.5 rounded-full text-[10px] font-black',
                                  row.status === 'Em Estoque' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                                  row.status === 'Estoque em Alta' && 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
                                  row.status === 'Estoque Baixo' && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                                  row.status === 'Fora de Estoque' && 'bg-red-500/15 text-red-600 dark:text-red-400',
                                )}>
                                  {row.status}
                                </span>
                                <ChevronDown size={11} style={{ color: 'var(--color-cell-muted)', flexShrink: 0 }} className={cn('transition-transform', openStatusId === row.id && 'rotate-180')} />
                              </button>

                              <AnimatePresence>
                                {openStatusId === row.id && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                    transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
                                    className="absolute left-0 top-full z-50 w-44 rounded-xl shadow-xl overflow-hidden"
                                    style={{ backgroundColor: 'var(--color-dropdown-bg)', border: '1px solid var(--color-border)' }}
                                  >
                                    {STATUS_OPTIONS.map(opt => (
                                      <button
                                        key={opt}
                                        onMouseDown={() => { updateRow(row.id, 'status', opt); setOpenStatusId(null); }}
                                        className="w-full text-left px-3 py-2.5 text-xs font-semibold transition-colors"
                                        style={{ color: 'var(--color-cell-text)' }}
                                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-row-hover)'}
                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                                      >
                                        {opt}
                                      </button>
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          ) : (
                            /* Text / number input */
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
                                'w-full py-2 text-sm transition-colors bg-transparent outline-none',
                                col.type === 'number' && '[appearance:textfield] [&::-webkit-inner-spin-button]:hidden',
                              )}
                              style={{
                                color: 'var(--color-cell-text)',
                                borderBottom: isInvalid && col.required
                                  ? '1.5px solid #D81E1E'
                                  : '1.5px solid transparent',
                                caretColor: '#D81E1E',
                              }}
                              onFocus={e => {
                                if (!(isInvalid && col.required)) {
                                  (e.target as HTMLElement).style.borderBottom = '1.5px solid rgba(216,30,30,0.5)';
                                }
                              }}
                              onBlur={e => {
                                if (!(isInvalid && col.required)) {
                                  (e.target as HTMLElement).style.borderBottom = '1.5px solid transparent';
                                }
                              }}
                            />
                          )}
                        </td>
                      ))}

                      {/* Delete button / confirm */}
                      <td
                        className="w-10 py-2 text-center"
                        style={{ borderBottom: '1px solid var(--color-row-border)' }}
                      >
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
                                style={{ backgroundColor: 'var(--color-btn-cancel-bg)', color: 'var(--color-btn-cancel-text)' }}
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
                              onClick={() => rows.length === 1 ? updateRow(row.id, 'name', '') : setDeleteConfirmId(row.id)}
                              className="w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ color: 'var(--color-cell-muted)' }}
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
          </div>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <div
            className="flex items-center justify-between px-6 md:px-10 py-3 border-t shrink-0"
            style={{
              backgroundColor: 'var(--color-footer-bg)',
              borderColor: 'var(--color-border)',
            }}
          >
            <button
              onClick={addRow}
              className="flex items-center gap-2 text-sm font-bold transition-all active:scale-[0.97] py-1.5 px-2 rounded-lg"
              style={{
                color: '#D81E1E',
                transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.75'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
            >
              <Plus size={15} />
              Adicionar Linha
            </button>

            <div className="flex items-center gap-4 text-xs font-semibold" style={{ color: 'var(--color-subtitle)' }}>
              {invalidIds.size > 0 && (
                <span className="flex items-center gap-1.5 text-red-500">
                  <AlertCircle size={13} />
                  {invalidIds.size} linha{invalidIds.size !== 1 ? 's' : ''} com Nome em branco
                </span>
              )}
              <span>{rows.length} linha{rows.length !== 1 ? 's' : ''} · {filledCount} preenchida{filledCount !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* ── CSS Variables — dark / light theme tokens ──────────────── */}
          <style jsx>{`
            /* ── LIGHT MODE (default) — Caderno de Estoque ── */
            div {
              --color-background:    #FFFCEC;
              --color-header-bg:     #FFE500;
              --color-header-border: rgba(0,0,0,0.08);
              --color-icon-bg:       rgba(216,30,30,0.12);
              --color-icon:          #D81E1E;
              --color-title:         #1a1a14;
              --color-subtitle:      rgba(26,26,20,0.50);
              --color-close:         rgba(26,26,20,0.45);
              --color-btn-cancel-bg: rgba(26,26,20,0.08);
              --color-btn-cancel-text: rgba(26,26,20,0.65);

              --color-thead-bg:      #f0ede0;
              --color-thead-text:    rgba(26,26,20,0.50);
              --color-border:        #D9D0BA;
              --color-row-border:    rgba(217,208,186,0.55);

              --color-row-even:      #ffffff;
              --color-row-odd:       #faf9f2;
              --color-row-hover:     #fff8e0;
              --color-row-invalid:   rgba(216,30,30,0.06);
              --color-row-num:       rgba(216,30,30,0.45);

              --color-cell-text:     #1a1a14;
              --color-cell-muted:    rgba(26,26,20,0.35);
              --color-dropdown-bg:   #ffffff;

              --color-footer-bg:     #f5f2e8;
            }

            /* ── DARK MODE — Manifesto Industrial ── */
            @media (prefers-color-scheme: dark) {
              div {
                --color-background:    #0f0f0c;
                --color-header-bg:     #1c1c16;
                --color-header-border: rgba(216,30,30,0.30);
                --color-icon-bg:       rgba(216,30,30,0.12);
                --color-icon:          #D81E1E;
                --color-title:         #f2f0e3;
                --color-subtitle:      rgba(242,240,227,0.38);
                --color-close:         rgba(242,240,227,0.30);
                --color-btn-cancel-bg: rgba(242,240,227,0.07);
                --color-btn-cancel-text: rgba(242,240,227,0.50);

                --color-thead-bg:      #2e2e28;
                --color-thead-text:    rgba(242,240,227,0.40);
                --color-border:        rgba(242,240,227,0.08);
                --color-row-border:    rgba(242,240,227,0.04);

                --color-row-even:      #141410;
                --color-row-odd:       #161612;
                --color-row-hover:     rgba(242,240,227,0.025);
                --color-row-invalid:   rgba(216,30,30,0.08);
                --color-row-num:       rgba(216,30,30,0.50);

                --color-cell-text:     #f2f0e3;
                --color-cell-muted:    rgba(242,240,227,0.28);
                --color-dropdown-bg:   #2a2a24;

                --color-footer-bg:     #1c1c16;
              }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

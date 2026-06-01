'use client';

import { useState } from 'react';
import {
  X, Plus, Trash2, FileText, List, CheckCircle2,
  AlertTriangle, ChevronLeft, ChevronRight, ClipboardList,
  Keyboard, Delete,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { EanProblemButton, type EanProblem } from '@/components/shared/EanProblemButton';

// ── Types ──────────────────────────────────────────────────────────────────

export type BulkRow = {
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

interface MobileBulkTableProps {
  isOpen: boolean;
  onClose: () => void;
  existingEans?: string[];
  eanProblems?: EanProblem[];
  categories?: string[];
  subcategories?: string[];
  brands?: string[];
  locations?: string[];
  onSaveDraft: (rows: BulkRow[]) => Promise<void>;
  onReportEanProblem?: (ean: string, desc: string, obs: string) => Promise<void>;
}

type Tab = 'itens' | 'detalhe' | 'resumo';

const STATUS_OPTIONS = ['Em Estoque', 'Estoque em Alta', 'Estoque Baixo', 'Fora de Estoque'];

const emptyRow = (): BulkRow => ({
  id: crypto.randomUUID(),
  name: '', sku: '', ean: '', category: '', subcategory: '',
  brand: '', location: '', count: '', price: '', status: 'Em Estoque',
});

// ── Combobox helper ────────────────────────────────────────────────────────

function ComboInput({
  value,
  onChange,
  options,
  placeholder,
  label,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  label: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const filtered = value.trim()
    ? options.filter(o => o.toLowerCase().includes(value.toLowerCase()))
    : options;

  return (
    <div className="relative">
      <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-1">
        {label}{required && <span className="text-[#D81E1E] ml-0.5">*</span>}
      </label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className={cn(
          'w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08]',
          'rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E]',
          required && !value.trim() && 'border-[#D81E1E]/50 bg-[#D81E1E]/[0.03]',
        )}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-xl bg-white dark:bg-[#2e2e28] border border-[#E0D8BF] dark:border-white/[0.08] shadow-xl">
          {filtered.slice(0, 8).map(opt => (
            <button
              key={opt}
              type="button"
              onMouseDown={() => { onChange(opt); setOpen(false); }}
              className="block w-full text-left px-3 py-2 text-xs font-medium text-on-surface/80 hover:bg-[#FFF8D0] dark:hover:bg-white/[0.04] transition-colors"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function MobileBulkTable({
  isOpen,
  onClose,
  existingEans = [],
  eanProblems = [],
  categories = [],
  subcategories = [],
  brands = [],
  locations = [],
  onSaveDraft,
  onReportEanProblem,
}: MobileBulkTableProps) {
  const [rows, setRows] = useState<BulkRow[]>([emptyRow()]);
  const [tab, setTab] = useState<Tab>('itens');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [eanProblemIdx, setEanProblemIdx] = useState<number | null>(null);
  const [problemDesc, setProblemDesc] = useState<'Não lê' | 'Sem código' | 'Outro'>('Não lê');
  const [problemObs, setProblemObs] = useState('');
  const [savingProblem, setSavingProblem] = useState(false);
  const [showPriceKeyboard, setShowPriceKeyboard] = useState(false);

  if (!isOpen) return null;

  const eanSet = new Set(existingEans.map(e => e.trim()).filter(Boolean));

  function openDetail(idx: number) {
    setSelectedIdx(idx);
    setTab('detalhe');
    setShowPriceKeyboard(false);
  }

  function addRow() {
    const newRow = emptyRow();
    setRows(prev => [...prev, newRow]);
    setSelectedIdx(rows.length);
    setTab('detalhe');
  }

  function updateField(idx: number, key: keyof Omit<BulkRow, 'id'>, value: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r));
  }

  function removeRow(idx: number) {
    if (rows.length === 1) {
      setRows([emptyRow()]);
      setSelectedIdx(0);
    } else {
      setRows(prev => prev.filter((_, i) => i !== idx));
      setSelectedIdx(Math.max(0, idx - 1));
    }
    setTab('itens');
  }

  async function handleSaveDraft() {
    setSaving(true);
    try {
      await onSaveDraft(rows);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProblem(idx: number) {
    if (!onReportEanProblem) return;
    const ean = rows[idx]?.ean ?? '';
    if (!ean.trim()) return;
    setSavingProblem(true);
    try {
      await onReportEanProblem(ean, problemDesc, problemObs);
      setEanProblemIdx(null);
      setProblemObs('');
      setProblemDesc('Não lê');
    } finally {
      setSavingProblem(false);
    }
  }

  // Linha válida = tem pelo menos nome OU ean (não precisa de nome obrigatório)
  const filledRows = rows.filter(r => r.name.trim() || r.ean.trim());
  const emptyCount = rows.length - filledRows.length;
  const namedRows = filledRows; // alias para compatibilidade com o restante do componente
  const unnamedCount = emptyCount;
  const dupEanCount = rows.filter(r => r.ean.trim() && eanSet.has(r.ean.trim())).length;

  const selectedRow = rows[selectedIdx] ?? rows[0];
  const isDupEan = selectedRow?.ean.trim() && eanSet.has(selectedRow.ean.trim());
  const hasEanProblem = selectedRow?.ean.trim() && eanProblems.some(p => p.ean === selectedRow.ean.trim());

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
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-[#FDFAF0] dark:bg-[#1E1E18]"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#FFE500] dark:bg-[#252520] border-b border-[#D4C000] dark:border-white/[0.07] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-black/[0.09] dark:bg-white/[0.08] text-[#1A1A0E] dark:text-white/70 active:bg-black/20 transition-colors"
          >
            <X size={18} />
          </button>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] leading-none mb-0.5 text-[#1A1A0E]/40 dark:text-white/30">
              Cadastro Mobile
            </p>
            <p className="text-base font-black leading-none text-[#1A1A0E] dark:text-[#F2F0E3]">
              Lista de Produtos
            </p>
          </div>
        </div>
        <span className="text-sm font-black text-[#1A1A0E]/40 dark:text-white/30">
          {rows.length} {rows.length === 1 ? 'item' : 'itens'}
        </span>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">

        {/* ════ ITENS TAB ══════════════════════════════════════ */}
        {tab === 'itens' && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
              {rows.map((row, idx) => {
                const isDup = row.ean.trim() && eanSet.has(row.ean.trim());
                const hasProblem = row.ean.trim() && eanProblems.some(p => p.ean === row.ean.trim());
                return (
                  <button
                    key={row.id}
                    onClick={() => openDetail(idx)}
                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-on-surface/[0.05] text-left transition-colors active:bg-on-surface/[0.04] bg-transparent"
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 border',
                      row.name.trim()
                        ? 'bg-[#D81E1E]/10 border-[#D81E1E]/25 text-[#D81E1E]'
                        : 'bg-on-surface/[0.05] border-on-surface/[0.06] text-on-surface/30',
                    )}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-sm font-black truncate',
                        (row.name.trim() || row.ean.trim()) ? 'text-on-surface' : 'text-on-surface/30 italic',
                      )}>
                        {row.name.trim() || (row.ean.trim() ? row.ean : 'Item vazio')}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {(row.sku || (row.ean && row.name.trim())) && (
                          <p className="text-[10px] text-on-surface/35 font-medium truncate">
                            {[row.sku && `SKU ${row.sku}`, (row.ean && row.name.trim()) && `EAN ${row.ean}`].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {row.price.trim() && (
                          <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 shrink-0">
                            R$ {row.price}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isDup && (
                        <span title="EAN já cadastrado" className="text-amber-500">
                          <AlertTriangle size={14} />
                        </span>
                      )}
                      {hasProblem && (
                        <span title="Problema registrado" className="text-red-500">
                          <AlertTriangle size={14} />
                        </span>
                      )}
                      <ChevronRight size={14} className="text-on-surface/15" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* FAB + */}
            <button
              onClick={addRow}
              className="absolute bottom-20 right-4 w-14 h-14 rounded-full bg-[#D81E1E] text-white shadow-2xl shadow-[#D81E1E]/30 flex items-center justify-center active:scale-90 transition-transform"
            >
              <Plus size={24} />
            </button>
          </div>
        )}

        {/* ════ DETALHE TAB ════════════════════════════════════ */}
        {tab === 'detalhe' && (
          <div className="flex flex-col h-full">
            {/* navigator */}
            <div className="shrink-0 bg-[#FDFAF0] dark:bg-[#1E1E18] border-b border-on-surface/[0.05] px-4 py-2 flex items-center gap-2">
              <button
                disabled={selectedIdx === 0}
                onClick={() => { setSelectedIdx(i => Math.max(0, i - 1)); setShowPriceKeyboard(false); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-on-surface/[0.05] text-on-surface/50 disabled:opacity-25 active:bg-on-surface/10 transition-colors"
              >
                <ChevronLeft size={15} />
              </button>
              <div className="flex-1 text-center">
                <p className="text-[10px] font-black text-on-surface/40">
                  Item <span className="text-on-surface">{selectedIdx + 1}</span> de {rows.length}
                </p>
              </div>
              <button
                disabled={selectedIdx === rows.length - 1}
                onClick={() => { setSelectedIdx(i => Math.min(rows.length - 1, i + 1)); setShowPriceKeyboard(false); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-on-surface/[0.05] text-on-surface/50 disabled:opacity-25 active:bg-on-surface/10 transition-colors"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            {/* form */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* Nome */}
              <div>
                <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-1">
                  Nome <span className="text-[#D81E1E]">*</span>
                </label>
                <input
                  type="text"
                  value={selectedRow?.name ?? ''}
                  onChange={e => updateField(selectedIdx, 'name', e.target.value)}
                  placeholder="Nome do produto"
                  className={cn(
                    'w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E]',
                    !(selectedRow?.name?.trim()) && 'border-[#D81E1E]/50 bg-[#D81E1E]/[0.03]',
                  )}
                />
              </div>

              {/* SKU */}
              <div>
                <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-1">SKU</label>
                <input
                  type="text"
                  value={selectedRow?.sku ?? ''}
                  onChange={e => updateField(selectedIdx, 'sku', e.target.value)}
                  placeholder="Código interno"
                  className="w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E]"
                />
              </div>

              {/* EAN + problem button */}
              <div>
                <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-1">EAN</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={selectedRow?.ean ?? ''}
                    onChange={e => updateField(selectedIdx, 'ean', e.target.value)}
                    placeholder="Código de barras"
                    className={cn(
                      'flex-1 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E]',
                      isDupEan && 'border-amber-400/60 text-amber-700 dark:text-amber-400',
                      hasEanProblem && 'border-red-400/60',
                    )}
                  />
                  {selectedRow?.ean.trim() && onReportEanProblem && (
                    <EanProblemButton
                      ean={selectedRow.ean}
                      problems={eanProblems}
                      onReport={(ean, desc, obs) => onReportEanProblem(ean, desc, obs)}
                      size="sm"
                    />
                  )}
                </div>
                {isDupEan && (
                  <p className="text-[10px] text-amber-600 mt-1 font-medium">EAN já cadastrado no inventário</p>
                )}

                {/* inline EAN problem panel */}
                {eanProblemIdx === selectedIdx && (
                  <div className="mt-2 p-3 bg-on-surface/[0.03] dark:bg-white/[0.03] rounded-2xl border border-on-surface/[0.06] space-y-2">
                    <p className="text-[10px] font-black text-on-surface/50 uppercase tracking-wider">Reportar problema</p>
                    <div className="space-y-1">
                      {(['Não lê', 'Sem código', 'Outro'] as const).map(opt => (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            value={opt}
                            checked={problemDesc === opt}
                            onChange={() => setProblemDesc(opt)}
                            className="accent-[#D81E1E]"
                          />
                          <span className="text-sm text-on-surface font-medium">{opt}</span>
                        </label>
                      ))}
                    </div>
                    <textarea
                      value={problemObs}
                      onChange={e => setProblemObs(e.target.value)}
                      placeholder="Observação..."
                      className="w-full bg-[#FDFAF0] dark:bg-[#1e1e18] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl p-2 text-xs resize-none h-14 focus:outline-none focus:border-[#D81E1E]"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveProblem(selectedIdx)}
                        disabled={savingProblem}
                        className="flex-1 bg-[#D81E1E] text-white text-xs font-black py-2 rounded-xl hover:bg-[#c01818] transition-colors disabled:opacity-50"
                      >
                        {savingProblem ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button
                        onClick={() => setEanProblemIdx(null)}
                        className="px-3 py-2 text-xs font-bold text-on-surface/50 hover:bg-on-surface/5 rounded-xl"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Categoria */}
              <ComboInput
                label="Categoria"
                value={selectedRow?.category ?? ''}
                onChange={v => updateField(selectedIdx, 'category', v)}
                options={categories}
                placeholder="Selecione ou digite..."
              />

              {/* Subcategoria */}
              <ComboInput
                label="Subcategoria"
                value={selectedRow?.subcategory ?? ''}
                onChange={v => updateField(selectedIdx, 'subcategory', v)}
                options={subcategories}
                placeholder="Selecione ou digite..."
              />

              {/* Marca */}
              <ComboInput
                label="Marca"
                value={selectedRow?.brand ?? ''}
                onChange={v => updateField(selectedIdx, 'brand', v)}
                options={brands}
                placeholder="Selecione ou digite..."
              />

              {/* Localização */}
              <ComboInput
                label="Localização"
                value={selectedRow?.location ?? ''}
                onChange={v => updateField(selectedIdx, 'location', v)}
                options={locations}
                placeholder="Corredor A..."
              />

              {/* Quantidade */}
              <div>
                <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-1">Quantidade</label>
                <input
                  type="number"
                  value={selectedRow?.count ?? ''}
                  onChange={e => updateField(selectedIdx, 'count', e.target.value)}
                  placeholder="0"
                  className="w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E] [appearance:textfield] [&::-webkit-inner-spin-button]:hidden"
                />
              </div>

              {/* Preço */}
              <div>
                <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-1">Preço R$</label>
                <div className="relative">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="none"
                      value={selectedRow?.price ?? ''}
                      onChange={e => updateField(selectedIdx, 'price', e.target.value)}
                      placeholder="0,00"
                      className="flex-1 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-[#D81E1E]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPriceKeyboard(v => !v)}
                      title="Teclado numérico"
                      className={cn(
                        'w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-all active:scale-95',
                        showPriceKeyboard
                          ? 'bg-[#D81E1E] text-white border-[#D81E1E]'
                          : 'bg-[#FDFAF0] dark:bg-[#252520] border-[#E0D8BF] dark:border-white/[0.08] text-on-surface/50 hover:text-[#D81E1E] hover:border-[#D81E1E]/40'
                      )}
                    >
                      <Keyboard size={18} />
                    </button>
                  </div>

                  {/* Teclado numérico suspenso */}
                  <AnimatePresence>
                    {showPriceKeyboard && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.97 }}
                        transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                        className="absolute left-0 top-full mt-2 z-50 bg-white dark:bg-[#2e2e28] border border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl shadow-2xl p-3 w-full"
                      >
                        <div className="grid grid-cols-3 gap-2">
                          {['7','8','9','4','5','6','1','2','3',',','0','.'].map(key => (
                            <button
                              key={key}
                              type="button"
                              onMouseDown={e => {
                                e.preventDefault();
                                updateField(selectedIdx, 'price', (selectedRow?.price ?? '') + key);
                              }}
                              className="h-12 rounded-xl bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] text-base font-black text-on-surface hover:bg-[#FFE500] hover:border-[#D4C000] dark:hover:bg-[#3a3a30] transition-all active:scale-95"
                            >
                              {key}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <button
                            type="button"
                            onMouseDown={e => {
                              e.preventDefault();
                              const cur = selectedRow?.price ?? '';
                              updateField(selectedIdx, 'price', cur.slice(0, -1));
                            }}
                            className="h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 font-black flex items-center justify-center gap-2 hover:bg-amber-500/20 transition-all active:scale-95"
                          >
                            <Delete size={16} />
                            ⌫
                          </button>
                          <button
                            type="button"
                            onMouseDown={e => {
                              e.preventDefault();
                              updateField(selectedIdx, 'price', '');
                            }}
                            className="h-12 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 font-black hover:bg-red-500/20 transition-all active:scale-95"
                          >
                            Limpar
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-[10px] font-black text-on-surface/40 uppercase tracking-wider mb-2">Status</label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => updateField(selectedIdx, 'status', opt)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-black transition-all active:scale-95',
                        selectedRow?.status === opt
                          ? opt === 'Em Estoque'      ? 'bg-emerald-500 text-white'
                          : opt === 'Estoque em Alta' ? 'bg-blue-500 text-white'
                          : opt === 'Estoque Baixo'   ? 'bg-amber-500 text-white'
                          : 'bg-red-500 text-white'
                          : 'bg-on-surface/[0.06] text-on-surface/50',
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Remove item */}
              <div className="pt-2">
                <button
                  onClick={() => removeRow(selectedIdx)}
                  className="flex items-center gap-2 text-red-500 text-sm font-bold py-2 px-3 rounded-xl hover:bg-red-500/10 transition-colors active:scale-95"
                >
                  <Trash2 size={15} />
                  Remover este item
                </button>
              </div>

              {/* spacer for tab bar */}
              <div className="h-8" />
            </div>
          </div>
        )}

        {/* ════ RESUMO TAB ═════════════════════════════════════ */}
        {tab === 'resumo' && (
          <div className="flex flex-col h-full overflow-y-auto pb-32">
            {/* stats cards */}
            <div className="p-4 grid grid-cols-3 gap-3">
              <div className="bg-[#FDFAF0] dark:bg-[#252520] border border-on-surface/[0.05] rounded-2xl p-3 text-center">
                <p className="text-2xl font-black text-on-surface">{namedRows.length}</p>
                <p className="text-[10px] font-black text-on-surface/40 uppercase tracking-widest mt-0.5">Produtos</p>
              </div>
              {unnamedCount > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 text-center">
                  <p className="text-2xl font-black text-amber-600">{unnamedCount}</p>
                  <p className="text-[10px] font-black text-amber-600/70 uppercase tracking-widest mt-0.5">Sem nome</p>
                </div>
              )}
              {dupEanCount > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 text-center">
                  <p className="text-2xl font-black text-amber-600">{dupEanCount}</p>
                  <p className="text-[10px] font-black text-amber-600/70 uppercase tracking-widest mt-0.5">EANs dup.</p>
                </div>
              )}
            </div>

            {/* product list */}
            {namedRows.length > 0 ? (
              <div className="px-4 space-y-2 mb-4">
                <p className="text-[10px] font-black text-on-surface/35 uppercase tracking-widest mb-2">Produtos preenchidos</p>
                {namedRows.map((row, i) => (
                  <div key={row.id} className="flex items-center gap-3 py-2 border-b border-on-surface/[0.04]">
                    <span className="text-[10px] font-mono text-on-surface/30 w-5 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">{row.name}</p>
                      {row.ean && <p className="text-[10px] text-on-surface/35">{row.ean}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-on-surface/20 px-8 text-center">
                <ClipboardList size={36} className="mb-3 opacity-30" />
                <p className="text-xs font-bold">Nenhum produto com nome preenchido</p>
              </div>
            )}

            {/* actions */}
            <div className="fixed bottom-[72px] left-0 right-0 px-4 pb-2 space-y-2 bg-[#FDFAF0] dark:bg-[#1E1E18] border-t border-on-surface/[0.05] pt-3">
              <button
                onClick={handleSaveDraft}
                disabled={saving || namedRows.length === 0}
                className="w-full bg-[#D81E1E] text-white font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#D81E1E]/20 active:scale-[0.97] transition-transform disabled:opacity-50"
              >
                {saving
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Salvando...</>
                  : <><CheckCircle2 size={16} />Salvar Rascunho</>
                }
              </button>

              {confirmDiscard ? (
                <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-500/10 rounded-2xl">
                  <p className="text-sm font-bold text-red-600 dark:text-red-400 flex-1">Descartar todas as alterações?</p>
                  <button
                    onClick={() => { setConfirmDiscard(false); onClose(); }}
                    className="px-3 py-1.5 bg-red-500 text-white text-xs font-black rounded-xl"
                  >
                    Sim, descartar
                  </button>
                  <button
                    onClick={() => setConfirmDiscard(false)}
                    className="px-3 py-1.5 bg-on-surface/10 text-on-surface/60 text-xs font-black rounded-xl"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDiscard(true)}
                  className="w-full bg-on-surface/[0.06] text-on-surface/60 font-black py-3 rounded-2xl active:scale-[0.97] transition-transform text-sm"
                >
                  Descartar
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Tab Bar ────────────────────────────────────── */}
      <div className="shrink-0 bg-[#FFE500] dark:bg-[#252520] border-t border-[#D4C000] dark:border-white/[0.07] flex">
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 py-2.5 relative transition-colors',
                active ? 'text-[#D81E1E]' : 'text-[#1A1A0E]/40 dark:text-white/30',
              )}
            >
              {active && (
                <motion.div
                  layoutId="mobile-bulk-tab-indicator"
                  className="absolute top-0 left-4 right-4 h-0.5 bg-[#D81E1E] rounded-full"
                  transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                />
              )}
              {t.icon}
              <span className="text-[10px] font-bold">{t.label}</span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

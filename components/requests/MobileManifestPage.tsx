'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X, Plus, ChevronLeft, ChevronRight, List, FileText,
  CheckCircle2, Trash2, Search, Keyboard, Delete, Wand2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { ReviewNote } from './LogisticsCenter';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManifestRow {
  id: string;
  supplierCode: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  linkedProduct: LinkedProduct | null;
  autoFilledCode?: boolean;
  autoFilledDesc?: boolean;
}

interface LinkedProduct {
  id: string;
  name: string;
  sku: string;
  ean: string;
}

interface ManifestDraft {
  id: string;
  label: string;
  savedAt: string;
  supplierId: string;
  rows: ManifestRow[];
}

interface Supplier {
  id: string;
  name: string;
}

export interface MobileManifestPageProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  setNotification: (n: { type: 'success' | 'error'; message: string } | null) => void;
  onManifestSaved: (note: ReviewNote) => void;
}

type Tab = 'itens' | 'detalhe' | 'revisao';

const UNIT_OPTIONS = ['UN', 'CX', 'KG', 'CX12', 'PCT', 'FD', 'DZ', 'SC', 'LT', 'G', 'ML'];

// ─── Draft persistence ────────────────────────────────────────────────────────

async function fetchDrafts(): Promise<ManifestDraft[]> {
  const { data, error } = await supabase
    .from('review_notes')
    .select('id, file_name, timestamp_label, supplier_id, raw_rows')
    .eq('is_draft', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((d: any) => ({
    id: d.id,
    label: d.file_name,
    savedAt: d.timestamp_label,
    supplierId: d.supplier_id ?? '',
    rows: d.raw_rows || [],
  }));
}

async function upsertDraft(draft: ManifestDraft) {
  const { error } = await supabase.from('review_notes').upsert({
    id: draft.id,
    file_name: draft.label,
    timestamp_label: draft.savedAt,
    supplier_id: draft.supplierId || null,
    supplier_name: null,
    raw_rows: draft.rows,
    is_draft: true,
    item_count: draft.rows.length,
    verified_count: 0,
    items: [],
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(): ManifestRow {
  return {
    id: Math.random().toString(36).slice(2, 10),
    supplierCode: '', description: '', unit: 'UN',
    quantity: '', unitPrice: '', linkedProduct: null,
  };
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MobileManifestPage({
  isOpen, onClose, suppliers, setNotification, onManifestSaved,
}: MobileManifestPageProps) {
  const [tab, setTab] = useState<Tab>('itens');
  const [rows, setRows] = useState<ManifestRow[]>([makeRow()]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [currentDraftId, setCurrentDraftId] = useState<string>(Date.now().toString());
  const [supplierId, setSupplierId] = useState('');
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Keyboards
  const [showQtyKeyboard, setShowQtyKeyboard] = useState(false);
  const [showPriceKeyboard, setShowPriceKeyboard] = useState(false);
  const [showDescKeyboard, setShowDescKeyboard] = useState(false);

  // Link panel
  const [linkingRowId, setLinkingRowId] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState<LinkedProduct[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newEan, setNewEan] = useState('');
  const [creating, setCreating] = useState(false);
  const [searching, setSearching] = useState(false);

  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supplierRef = useRef<HTMLDivElement>(null);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const selectedRow = rows[selectedIdx] ?? rows[0];
  const validRows = rows.filter(r => r.description.trim() || r.supplierCode.trim());
  const linkedCount = rows.filter(r => r.linkedProduct).length;
  const totalValue = rows.reduce((acc, r) =>
    acc + (parseFloat(r.quantity) || 0) * (parseFloat(r.unitPrice.replace(',', '.')) || 0), 0);
  const filteredSuppliers = supplierSearch.trim()
    ? suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
    : suppliers;

  // ── Effects ──────────────────────────────────────────────────────────────────

  // Load draft on open
  useEffect(() => {
    if (!isOpen) return;
    setTab('itens');
    setConfirmDiscard(false);
    const id = Date.now().toString();
    setCurrentDraftId(id);
    fetchDrafts().then(drafts => {
      if (drafts.length > 0) {
        const latest = drafts[0];
        setCurrentDraftId(latest.id);
        setSupplierId(latest.supplierId);
        const loaded = latest.rows.length > 0 ? latest.rows : [makeRow()];
        setRows(loaded);
        setSelectedIdx(0);
      } else {
        setRows([makeRow()]);
        setSelectedIdx(0);
        setSupplierId('');
      }
    }).catch(() => {
      setRows([makeRow()]);
      setSelectedIdx(0);
    });
  }, [isOpen]);

  // Auto-save
  useEffect(() => {
    if (!isOpen || !currentDraftId) return;
    const hasContent = rows.some(r => r.description.trim() || r.supplierCode.trim());
    if (!hasContent) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(async () => {
      const supplierName = suppliers.find(s => s.id === supplierId)?.name ?? '';
      const timestamp = new Date().toLocaleString('pt-BR');
      const draft: ManifestDraft = {
        id: currentDraftId,
        label: supplierName ? `${supplierName} — ${timestamp}` : `Manifesto — ${timestamp}`,
        savedAt: timestamp,
        supplierId,
        rows,
      };
      try { await upsertDraft(draft); } catch { /* silent */ }
    }, 1500);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [rows, supplierId, isOpen, currentDraftId]);

  // Close supplier dropdown on outside click
  useEffect(() => {
    if (!supplierDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setSupplierDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [supplierDropdownOpen]);

  if (!isOpen) return null;

  // ── Row helpers ──────────────────────────────────────────────────────────────

  const updateRow = (id: string, patch: Partial<ManifestRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const addRow = () => {
    const newRow = makeRow();
    setRows(prev => [...prev, newRow]);
    setSelectedIdx(rows.length);
    setTab('detalhe');
    setShowQtyKeyboard(false);
    setShowPriceKeyboard(false);
  };

  const removeRow = (idx: number) => {
    if (rows.length === 1) {
      setRows([makeRow()]);
      setSelectedIdx(0);
    } else {
      setRows(prev => prev.filter((_, i) => i !== idx));
      setSelectedIdx(Math.max(0, idx - 1));
    }
    setTab('itens');
  };

  // ── Lookup mapping ────────────────────────────────────────────────────────────

  const lookupMapping = async (rowId: string, code: string, description: string) => {
    if (!supplierId || (!code.trim() && !description.trim())) return;
    let q = supabase.from('supplier_mappings')
      .select('internal_product_id, supplier_sku, supplier_description, products(id, name, sku, ean)')
      .eq('supplier_id', supplierId);
    if (code.trim()) q = q.eq('supplier_sku', code.trim());
    else q = q.ilike('supplier_description', `%${description.trim()}%`);
    const { data } = await q.limit(1).maybeSingle();
    if (data) {
      const p = (data as any).products;
      setRows(prev => prev.map(r => {
        if (r.id !== rowId) return r;
        const shouldFillDesc = code.trim() && !r.description.trim() && (data as any).supplier_description;
        const shouldFillCode = description.trim() && !r.supplierCode.trim() && (data as any).supplier_sku;
        return {
          ...r,
          description: shouldFillDesc ? (data as any).supplier_description : r.description,
          supplierCode: shouldFillCode ? (data as any).supplier_sku : r.supplierCode,
          autoFilledDesc: shouldFillDesc ? true : r.autoFilledDesc,
          autoFilledCode: shouldFillCode ? true : r.autoFilledCode,
          linkedProduct: p ? { id: p.id, name: p.name, sku: p.sku, ean: p.ean ?? '' } : r.linkedProduct,
        };
      }));
    }
  };

  // ── Link helpers ──────────────────────────────────────────────────────────────

  const openLink = (rowId: string) => {
    setLinkingRowId(rowId);
    setLinkSearch('');
    setLinkResults([]);
    setShowCreate(false);
    setNewName(''); setNewSku(''); setNewEan('');
  };
  const closeLink = () => {
    setLinkingRowId(null);
    setLinkSearch('');
    setLinkResults([]);
    setShowCreate(false);
  };

  const handleLinkSearch = async () => {
    if (!linkSearch.trim()) return;
    setSearching(true);
    const { data } = await supabase.from('products').select('id, name, sku, ean')
      .or(`name.ilike.%${linkSearch}%,sku.ilike.%${linkSearch}%,ean.ilike.%${linkSearch}%`)
      .limit(8);
    setLinkResults((data || []) as LinkedProduct[]);
    setSearching(false);
  };

  const saveMapping = async (rowId: string, product: LinkedProduct) => {
    if (!supplierId) return;
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    try {
      await supabase.from('supplier_mappings').insert({
        supplier_id: supplierId,
        supplier_sku: row.supplierCode.trim() || null,
        supplier_description: row.description.trim() || '',
        internal_product_id: product.id,
      });
    } catch { /* silent */ }
  };

  const handleSelectProduct = async (product: LinkedProduct) => {
    if (!linkingRowId) return;
    await saveMapping(linkingRowId, product);
    updateRow(linkingRowId, { linkedProduct: product });
    setNotification({ type: 'success', message: 'Produto vinculado ao dicionário!' });
    closeLink();
  };

  const handleCreateAndLink = async () => {
    if (!newName.trim()) {
      setNotification({ type: 'error', message: 'Nome do produto é obrigatório.' });
      return;
    }
    setCreating(true);
    try {
      const sku = newSku.trim() || `MAN-${Date.now()}`;
      const { data: created, error } = await supabase.from('products')
        .insert({ name: newName.trim(), sku, ean: newEan.trim() || null, count: 0, is_low: true, status: 'Fora de Estoque' })
        .select('id, name, sku, ean').single();
      if (error) throw error;
      if (created) {
        const p = created as LinkedProduct;
        await saveMapping(linkingRowId!, p);
        updateRow(linkingRowId!, { linkedProduct: p });
        setNotification({ type: 'success', message: 'Produto criado e vinculado!' });
        closeLink();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao criar produto.' });
    } finally {
      setCreating(false);
    }
  };

  // ── Save / Submit ─────────────────────────────────────────────────────────────

  const handleSaveDraft = async () => {
    const valid = rows.filter(r => r.description.trim() || r.supplierCode.trim());
    if (valid.length === 0) {
      setNotification({ type: 'error', message: 'Adicione ao menos um item antes de salvar.' });
      return;
    }
    setSaving(true);
    try {
      const supplierName = suppliers.find(s => s.id === supplierId)?.name ?? '';
      const timestamp = new Date().toLocaleString('pt-BR');
      const draft: ManifestDraft = {
        id: currentDraftId,
        label: supplierName ? `${supplierName} — ${timestamp}` : `Manifesto — ${timestamp}`,
        savedAt: timestamp,
        supplierId,
        rows,
      };
      await upsertDraft(draft);
      setNotification({ type: 'success', message: 'Rascunho salvo!' });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao salvar rascunho.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    const valid = rows.filter(r => r.description.trim() || r.supplierCode.trim());
    if (valid.length === 0) {
      setNotification({ type: 'error', message: 'Adicione ao menos um item ao manifesto.' });
      return;
    }
    if (autoSaveRef.current) { clearTimeout(autoSaveRef.current); autoSaveRef.current = null; }
    setSubmitting(true);
    try {
      const items = valid.map((r, i) => {
        const sku = r.linkedProduct?.sku?.startsWith('MAN-') ? '' : (r.linkedProduct?.sku ?? '');
        return {
          seq: i + 1,
          ean: r.linkedProduct?.ean ?? '',
          sku,
          description: r.description,
          unit: r.unit,
          qty: parseFloat(r.quantity) || 0,
          price: parseFloat(r.unitPrice.replace(',', '.')) || 0,
          verified: !!r.linkedProduct,
          internal_product_id: r.linkedProduct?.id ?? null,
          supplier_code: r.supplierCode,
          product_name: r.linkedProduct?.name ?? r.description,
          unit_multiplier: null,
          original_description: r.description,
          name: r.linkedProduct?.name ?? r.description,
        };
      });
      const supplierName = suppliers.find(s => s.id === supplierId)?.name ?? '';
      const noteId = currentDraftId;
      const timestamp = new Date().toLocaleString('pt-BR');
      const note: ReviewNote = {
        id: noteId, timestamp,
        fileName: `Manifesto Manual — ${timestamp}`,
        items, itemCount: items.length,
        verifiedCount: items.filter(i => i.verified).length,
        supplierName: supplierName || undefined,
      };
      const { error } = await supabase.from('review_notes').upsert({
        id: note.id,
        timestamp_label: note.timestamp,
        file_name: note.fileName,
        item_count: note.itemCount,
        verified_count: note.verifiedCount,
        items: note.items,
        supplier_name: supplierName || null,
        is_draft: false,
        raw_rows: null,
        supplier_id: null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      onManifestSaved(note);
      setNotification({ type: 'success', message: `Manifesto enviado com ${items.length} item(s).` });
      onClose();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao enviar manifesto.' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Numeric key handler ───────────────────────────────────────────────────────

  const handleNumKey = (field: 'quantity' | 'unitPrice', key: string) => {
    const cur = field === 'quantity' ? (selectedRow?.quantity ?? '') : (selectedRow?.unitPrice ?? '');
    if (key === '⌫') {
      updateRow(selectedRow.id, { [field]: cur.slice(0, -1) });
    } else if (key === 'limpar') {
      updateRow(selectedRow.id, { [field]: '' });
    } else {
      updateRow(selectedRow.id, { [field]: cur + key });
    }
  };

  const handleDescKey = (key: string) => {
    const cur = selectedRow?.description ?? '';
    if (key === '⌫') {
      updateRow(selectedRow.id, { description: cur.slice(0, -1) });
    } else if (key === 'limpar') {
      updateRow(selectedRow.id, { description: '' });
    } else {
      updateRow(selectedRow.id, { description: cur + key });
    }
  };

  // ── Tab definitions ───────────────────────────────────────────────────────────

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'itens',   label: 'Itens',   icon: <List size={20} /> },
    { id: 'detalhe', label: 'Detalhe', icon: <FileText size={20} /> },
    { id: 'revisao', label: 'Revisão', icon: <CheckCircle2 size={20} /> },
  ];

  const supplierName = suppliers.find(s => s.id === supplierId)?.name ?? '';

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-[#FDFAF0] dark:bg-[#1E1E18]"
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#FFE500] dark:bg-[#252520] border-b border-[#D4C000] dark:border-white/[0.07] px-4 pt-3 pb-3">
        {/* Row 1: close + title + count + add */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-black/[0.09] dark:bg-white/[0.08] text-[#1A1A0E] dark:text-white/70 active:bg-black/20 transition-colors"
            >
              <X size={18} />
            </button>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] leading-none mb-0.5 text-[#1A1A0E]/40 dark:text-white/30">
                Entrada de Mercadorias
              </p>
              <p className="text-base font-black leading-none text-[#1A1A0E] dark:text-[#F2F0E3]">
                Criar Manifesto
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-[#1A1A0E]/40 dark:text-white/30">
              {rows.length} {rows.length === 1 ? 'item' : 'itens'}
            </span>
            <button
              onClick={addRow}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-black/[0.09] dark:bg-white/[0.08] text-[#1A1A0E] dark:text-white/70 active:bg-black/20 transition-colors"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {/* Row 2: supplier selector */}
        <div className="relative" ref={supplierRef}>
          <button
            onClick={() => { setSupplierDropdownOpen(v => !v); setSupplierSearch(''); }}
            className="w-full flex items-center gap-2 bg-black/[0.06] dark:bg-white/[0.06] border border-black/[0.10] dark:border-white/[0.10] rounded-[14px] px-3 py-2 text-left"
          >
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#1A1A0E]/38 dark:text-white/30 shrink-0">
              Fornecedor
            </span>
            <span className={cn(
              'flex-1 text-[13px] font-black truncate',
              supplierName ? 'text-[#1A1A0E] dark:text-[#F2F0E3]' : 'text-[#1A1A0E]/35 dark:text-white/25',
            )}>
              {supplierName || 'Selecionar fornecedor...'}
            </span>
            <ChevronRight size={14} className={cn(
              'shrink-0 transition-transform text-[#1A1A0E]/30 dark:text-white/25',
              supplierDropdownOpen && 'rotate-90',
            )} />
          </button>

          <AnimatePresence>
            {supplierDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
                className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-[#2e2e28] border border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
              >
                <div className="p-2 border-b border-[#E0D8BF] dark:border-white/[0.06]">
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={e => setSupplierSearch(e.target.value)}
                    placeholder="Buscar fornecedor..."
                    className="w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2 text-sm text-[#1A1A0E] dark:text-[#F2F0E3] outline-none"
                    autoFocus
                  />
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {filteredSuppliers.length === 0 ? (
                    <p className="text-xs text-center py-4 text-[#1A1A0E]/40 dark:text-white/30">Nenhum fornecedor encontrado</p>
                  ) : filteredSuppliers.map(s => (
                    <button
                      key={s.id}
                      onMouseDown={() => { setSupplierId(s.id); setSupplierDropdownOpen(false); }}
                      className={cn(
                        'w-full text-left px-3 py-2.5 text-sm font-medium transition-colors',
                        s.id === supplierId
                          ? 'bg-[#FFE500]/50 text-[#1A1A0E] font-black'
                          : 'text-[#1A1A0E]/70 dark:text-white/60 hover:bg-[#FFF8D0] dark:hover:bg-white/[0.04]',
                      )}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">

        {/* ════ ITENS TAB ═════════════════════════════════════════════════════ */}
        {tab === 'itens' && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
              {rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#1A1A0E]/20 dark:text-white/15 px-8 text-center">
                  <FileText size={40} className="mb-3 opacity-40" />
                  <p className="text-xs font-bold">Nenhum item adicionado</p>
                </div>
              ) : rows.map((row, idx) => {
                const total = (parseFloat(row.quantity) || 0) * (parseFloat(row.unitPrice.replace(',', '.')) || 0);
                return (
                  <button
                    key={row.id}
                    onClick={() => { setSelectedIdx(idx); setTab('detalhe'); setShowQtyKeyboard(false); setShowPriceKeyboard(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-[#1A1A0E]/[0.05] dark:border-white/[0.04] text-left transition-colors active:bg-[#1A1A0E]/[0.03] dark:active:bg-white/[0.02]"
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 border-[1.5px]',
                      (row.description.trim() || row.supplierCode.trim())
                        ? 'bg-[#D81E1E]/[0.08] dark:bg-[#D81E1E]/[0.12] border-[#D81E1E]/25 text-[#D81E1E] dark:text-[#f87171]'
                        : 'bg-[#1A1A0E]/[0.04] dark:bg-white/[0.04] border-[#1A1A0E]/[0.06] dark:border-white/[0.06] text-[#1A1A0E]/25 dark:text-white/22',
                    )}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-[13px] font-black truncate mb-0.5',
                        (row.description.trim() || row.supplierCode.trim())
                          ? 'text-[#1A1A0E] dark:text-[#F2F0E3]'
                          : 'text-[#1A1A0E]/30 dark:text-white/22 italic',
                      )}>
                        {row.description.trim() || (row.supplierCode.trim() ? `Cód: ${row.supplierCode}` : 'Item vazio')}
                      </p>
                      <p className="text-[10px] text-[#1A1A0E]/35 dark:text-white/30 font-medium">
                        {[
                          row.supplierCode && row.supplierCode,
                          row.unit && row.unit,
                          (row.quantity || row.unitPrice) && `${row.quantity || '—'} × R$ ${row.unitPrice || '—'}`,
                          total > 0 && `= ${fmtBRL(total)}`,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {row.linkedProduct ? (
                        <span className="text-[9px] font-black uppercase tracking-[0.06em] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                          Vinculado
                        </span>
                      ) : (
                        <span className="text-[9px] font-black uppercase tracking-[0.06em] px-2 py-0.5 rounded-full bg-[#1A1A0E]/[0.05] dark:bg-white/[0.05] text-[#1A1A0E]/35 dark:text-white/28 border border-[#1A1A0E]/[0.08] dark:border-white/[0.08]">
                          Pendente
                        </span>
                      )}
                      <ChevronRight size={14} className="text-[#1A1A0E]/15 dark:text-white/12" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* FAB */}
            <button
              onClick={addRow}
              className="absolute bottom-20 right-4 w-14 h-14 rounded-full bg-[#D81E1E] text-white shadow-2xl shadow-[#D81E1E]/30 dark:shadow-[#D81E1E]/20 flex items-center justify-center active:scale-90 transition-transform z-10"
            >
              <Plus size={24} />
            </button>
          </div>
        )}

        {/* ════ DETALHE TAB ═══════════════════════════════════════════════════ */}
        {tab === 'detalhe' && (
          <div className="flex flex-col h-full">
            {/* Item navigator */}
            <div className="shrink-0 bg-[#FDFAF0] dark:bg-[#1E1E18] border-b border-[#1A1A0E]/[0.05] dark:border-white/[0.04] px-4 py-2 flex items-center gap-2">
              <button
                disabled={selectedIdx === 0}
                onClick={() => { setSelectedIdx(i => Math.max(0, i - 1)); setShowQtyKeyboard(false); setShowPriceKeyboard(false); setShowDescKeyboard(false); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1A1A0E]/[0.05] dark:bg-white/[0.06] text-[#1A1A0E]/50 dark:text-white/40 disabled:opacity-25 active:bg-[#1A1A0E]/10 transition-colors"
              >
                <ChevronLeft size={15} />
              </button>
              <div className="flex-1 text-center">
                <p className="text-[10px] font-black text-[#1A1A0E]/40 dark:text-white/35">
                  Item <span className="text-[#1A1A0E] dark:text-[#F2F0E3]">{selectedIdx + 1}</span> de {rows.length}
                </p>
              </div>
              <button
                disabled={selectedIdx === rows.length - 1}
                onClick={() => { setSelectedIdx(i => Math.min(rows.length - 1, i + 1)); setShowQtyKeyboard(false); setShowPriceKeyboard(false); setShowDescKeyboard(false); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1A1A0E]/[0.05] dark:bg-white/[0.06] text-[#1A1A0E]/50 dark:text-white/40 disabled:opacity-25 active:bg-[#1A1A0E]/10 transition-colors"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* Código */}
              <div>
                <label className="block text-[10px] font-black text-[#1A1A0E]/40 dark:text-white/35 uppercase tracking-wider mb-1.5">
                  Código {selectedRow?.autoFilledCode && <Wand2 size={10} className="inline ml-1 text-amber-500" />}
                </label>
                <input
                  type="text"
                  value={selectedRow?.supplierCode ?? ''}
                  onChange={e => updateRow(selectedRow.id, { supplierCode: e.target.value })}
                  onBlur={e => lookupMapping(selectedRow.id, e.target.value, selectedRow.description)}
                  placeholder="Código do fornecedor"
                  className="w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E] placeholder:text-[#1A1A0E]/25 dark:placeholder:text-white/22"
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-[10px] font-black text-[#1A1A0E]/40 dark:text-white/35 uppercase tracking-wider mb-1.5">
                  Descrição {selectedRow?.autoFilledDesc && <Wand2 size={10} className="inline ml-1 text-amber-500" />}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode={showDescKeyboard ? 'none' : 'text'}
                    value={selectedRow?.description ?? ''}
                    onChange={e => updateRow(selectedRow.id, { description: e.target.value })}
                    onBlur={e => lookupMapping(selectedRow.id, selectedRow.supplierCode, e.target.value)}
                    placeholder="Descrição do produto"
                    className="flex-1 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-3 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E] placeholder:text-[#1A1A0E]/25 dark:placeholder:text-white/22"
                  />
                  <button
                    type="button"
                    onClick={() => { setShowDescKeyboard(v => !v); setShowQtyKeyboard(false); setShowPriceKeyboard(false); }}
                    className={cn(
                      'w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-all active:scale-95',
                      showDescKeyboard
                        ? 'bg-[#D81E1E] text-white border-[#D81E1E]'
                        : 'bg-[#FDFAF0] dark:bg-[#252520] border-[#E0D8BF] dark:border-white/[0.08] text-[#1A1A0E]/45 dark:text-white/35 hover:text-[#D81E1E] hover:border-[#D81E1E]/40',
                    )}
                  >
                    <Keyboard size={17} />
                  </button>
                </div>

                <AnimatePresence>
                  {showDescKeyboard && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                      className="mt-2 bg-white dark:bg-[#2e2e28] border border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl shadow-2xl p-3 space-y-1.5"
                    >
                      {/* Row 1: Q–P */}
                      <div className="grid grid-cols-10 gap-1">
                        {['Q','W','E','R','T','Y','U','I','O','P'].map(key => (
                          <motion.button
                            key={key}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); handleDescKey(key); }}
                            whileTap={{ scale: 0.82 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                            className="h-10 rounded-lg bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] text-xs font-black text-[#1A1A0E] dark:text-[#F2F0E3] hover:bg-[#FFE500] hover:border-[#D4C000] dark:hover:bg-[#3a3a30] transition-colors"
                          >
                            {key}
                          </motion.button>
                        ))}
                      </div>
                      {/* Row 2: A–Ç */}
                      <div className="grid grid-cols-10 gap-1">
                        {['A','S','D','F','G','H','J','K','L','Ç'].map(key => (
                          <motion.button
                            key={key}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); handleDescKey(key); }}
                            whileTap={{ scale: 0.82 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                            className="h-10 rounded-lg bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] text-xs font-black text-[#1A1A0E] dark:text-[#F2F0E3] hover:bg-[#FFE500] hover:border-[#D4C000] dark:hover:bg-[#3a3a30] transition-colors"
                          >
                            {key}
                          </motion.button>
                        ))}
                      </div>
                      {/* Row 3: Z–M + ⌫ */}
                      <div className="grid grid-cols-8 gap-1">
                        {['Z','X','C','V','B','N','M'].map(key => (
                          <motion.button
                            key={key}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); handleDescKey(key); }}
                            whileTap={{ scale: 0.82 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                            className="h-10 rounded-lg bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] text-xs font-black text-[#1A1A0E] dark:text-[#F2F0E3] hover:bg-[#FFE500] hover:border-[#D4C000] dark:hover:bg-[#3a3a30] transition-colors"
                          >
                            {key}
                          </motion.button>
                        ))}
                        <motion.button
                          type="button"
                          onMouseDown={e => { e.preventDefault(); handleDescKey('⌫'); }}
                          whileTap={{ scale: 0.88 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                          className="h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 font-black flex items-center justify-center hover:bg-amber-500/20 transition-colors"
                        >
                          <Delete size={14} />
                        </motion.button>
                      </div>
                      {/* Row 4: Espaço + Limpar */}
                      <div className="grid grid-cols-2 gap-1">
                        <motion.button
                          type="button"
                          onMouseDown={e => { e.preventDefault(); handleDescKey(' '); }}
                          whileTap={{ scale: 0.88 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                          className="h-10 rounded-lg bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] text-xs font-black text-[#1A1A0E]/50 dark:text-white/40 hover:bg-[#FFE500] hover:border-[#D4C000] dark:hover:bg-[#3a3a30] transition-colors"
                        >
                          ESPAÇO
                        </motion.button>
                        <motion.button
                          type="button"
                          onMouseDown={e => { e.preventDefault(); handleDescKey('limpar'); }}
                          whileTap={{ scale: 0.88 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                          className="h-10 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 font-black hover:bg-red-500/20 transition-colors"
                        >
                          Limpar
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Unidade */}
              <div>
                <label className="block text-[10px] font-black text-[#1A1A0E]/40 dark:text-white/35 uppercase tracking-wider mb-1.5">
                  Unidade
                </label>
                <select
                  value={selectedRow?.unit ?? 'UN'}
                  onChange={e => updateRow(selectedRow.id, { unit: e.target.value })}
                  className="w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-bold text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E] appearance-none"
                >
                  {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>

              {/* Quantidade */}
              <div>
                <label className="block text-[10px] font-black text-[#1A1A0E]/40 dark:text-white/35 uppercase tracking-wider mb-1.5">
                  Quantidade
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode={showQtyKeyboard ? 'none' : 'decimal'}
                    value={selectedRow?.quantity ?? ''}
                    onChange={e => updateRow(selectedRow.id, { quantity: e.target.value })}
                    onFocus={() => { if (showQtyKeyboard) return; }}
                    placeholder="0"
                    className="flex-1 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E] placeholder:text-[#1A1A0E]/25 dark:placeholder:text-white/22"
                  />
                  <button
                    type="button"
                    onClick={() => { setShowQtyKeyboard(v => !v); setShowPriceKeyboard(false); setShowDescKeyboard(false); }}
                    className={cn(
                      'w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-all active:scale-95',
                      showQtyKeyboard
                        ? 'bg-[#D81E1E] text-white border-[#D81E1E]'
                        : 'bg-[#FDFAF0] dark:bg-[#252520] border-[#E0D8BF] dark:border-white/[0.08] text-[#1A1A0E]/45 dark:text-white/35 hover:text-[#D81E1E] hover:border-[#D81E1E]/40',
                    )}
                  >
                    <Keyboard size={17} />
                  </button>
                </div>

                <AnimatePresence>
                  {showQtyKeyboard && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                      className="mt-2 bg-white dark:bg-[#2e2e28] border border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl shadow-2xl p-3"
                    >
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        {['7','8','9','4','5','6','1','2','3',',','0','.'].map(key => (
                          <motion.button
                            key={key}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); handleNumKey('quantity', key); }}
                            whileTap={{ scale: 0.82 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                            className="h-12 rounded-xl bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] text-base font-black text-[#1A1A0E] dark:text-[#F2F0E3] hover:bg-[#FFE500] hover:border-[#D4C000] dark:hover:bg-[#3a3a30] transition-colors"
                          >
                            {key}
                          </motion.button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <motion.button
                          type="button"
                          onMouseDown={e => { e.preventDefault(); handleNumKey('quantity', '⌫'); }}
                          whileTap={{ scale: 0.88 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                          className="h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 font-black flex items-center justify-center gap-2 hover:bg-amber-500/20 transition-colors"
                        >
                          <Delete size={15} /> ⌫
                        </motion.button>
                        <motion.button
                          type="button"
                          onMouseDown={e => { e.preventDefault(); handleNumKey('quantity', 'limpar'); }}
                          whileTap={{ scale: 0.88 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                          className="h-12 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 font-black hover:bg-red-500/20 transition-colors"
                        >
                          Limpar
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Preço Unit. */}
              <div>
                <label className="block text-[10px] font-black text-[#1A1A0E]/40 dark:text-white/35 uppercase tracking-wider mb-1.5">
                  Preço Unit.
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode={showPriceKeyboard ? 'none' : 'decimal'}
                    value={selectedRow?.unitPrice ?? ''}
                    onChange={e => updateRow(selectedRow.id, { unitPrice: e.target.value })}
                    placeholder="0,00"
                    className="flex-1 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E] placeholder:text-[#1A1A0E]/25 dark:placeholder:text-white/22"
                  />
                  <button
                    type="button"
                    onClick={() => { setShowPriceKeyboard(v => !v); setShowQtyKeyboard(false); setShowDescKeyboard(false); }}
                    className={cn(
                      'w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-all active:scale-95',
                      showPriceKeyboard
                        ? 'bg-[#D81E1E] text-white border-[#D81E1E]'
                        : 'bg-[#FDFAF0] dark:bg-[#252520] border-[#E0D8BF] dark:border-white/[0.08] text-[#1A1A0E]/45 dark:text-white/35 hover:text-[#D81E1E] hover:border-[#D81E1E]/40',
                    )}
                  >
                    <Keyboard size={17} />
                  </button>
                </div>

                <AnimatePresence>
                  {showPriceKeyboard && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                      className="mt-2 bg-white dark:bg-[#2e2e28] border border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl shadow-2xl p-3"
                    >
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        {['7','8','9','4','5','6','1','2','3',',','0','.'].map(key => (
                          <motion.button
                            key={key}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); handleNumKey('unitPrice', key); }}
                            whileTap={{ scale: 0.82 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                            className="h-12 rounded-xl bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] text-base font-black text-[#1A1A0E] dark:text-[#F2F0E3] hover:bg-[#FFE500] hover:border-[#D4C000] dark:hover:bg-[#3a3a30] transition-colors"
                          >
                            {key}
                          </motion.button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <motion.button
                          type="button"
                          onMouseDown={e => { e.preventDefault(); handleNumKey('unitPrice', '⌫'); }}
                          whileTap={{ scale: 0.88 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                          className="h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 font-black flex items-center justify-center gap-2 hover:bg-amber-500/20 transition-colors"
                        >
                          <Delete size={15} /> ⌫
                        </motion.button>
                        <motion.button
                          type="button"
                          onMouseDown={e => { e.preventDefault(); handleNumKey('unitPrice', 'limpar'); }}
                          whileTap={{ scale: 0.88 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                          className="h-12 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 font-black hover:bg-red-500/20 transition-colors"
                        >
                          Limpar
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Valor total */}
              {(() => {
                const qty = parseFloat(selectedRow?.quantity ?? '');
                const price = parseFloat((selectedRow?.unitPrice ?? '').replace(',', '.'));
                const total = (isNaN(qty) ? 0 : qty) * (isNaN(price) ? 0 : price);
                return (
                  <div className="flex items-center justify-between bg-[#1A1A0E]/[0.04] dark:bg-white/[0.03] border border-[#1A1A0E]/[0.07] dark:border-white/[0.06] rounded-xl px-3 py-2.5">
                    <span className="text-xs font-bold text-[#1A1A0E]/40 dark:text-white/35">Valor Total</span>
                    <span className="text-base font-black text-[#1A1A0E] dark:text-[#F2F0E3]">{fmtBRL(total)}</span>
                  </div>
                );
              })()}

              {/* Produto vinculado */}
              <div>
                <label className="block text-[10px] font-black text-[#1A1A0E]/40 dark:text-white/35 uppercase tracking-wider mb-1.5">
                  Produto Vinculado
                </label>

                {selectedRow?.linkedProduct ? (
                  <div className="bg-emerald-50 dark:bg-emerald-500/[0.07] border border-emerald-200 dark:border-emerald-500/[0.18] rounded-[14px] p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/[0.12] flex items-center justify-center shrink-0">
                      <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-emerald-700 dark:text-emerald-400 truncate">
                        {selectedRow.linkedProduct.name}
                      </p>
                      <p className="text-[10px] text-emerald-600/60 dark:text-emerald-400/50 mt-0.5">
                        SKU {selectedRow.linkedProduct.sku}
                        {selectedRow.linkedProduct.ean && ` · EAN ${selectedRow.linkedProduct.ean}`}
                      </p>
                    </div>
                    <button
                      onClick={() => { updateRow(selectedRow.id, { linkedProduct: null }); openLink(selectedRow.id); }}
                      className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/25 rounded-lg px-2.5 py-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-500/10 transition-colors"
                    >
                      Alterar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => openLink(selectedRow.id)}
                    className="w-full border-2 border-dashed border-[#1A1A0E]/[0.14] dark:border-white/[0.12] rounded-[14px] p-3.5 flex items-center justify-center gap-2 text-[12px] font-black text-[#1A1A0E]/35 dark:text-white/28 tracking-[0.04em] hover:border-[#D81E1E]/40 hover:text-[#D81E1E]/60 transition-colors"
                  >
                    <Search size={14} />
                    Vincular ao Dicionário
                  </button>
                )}

                {/* Inline link panel */}
                <AnimatePresence>
                  {linkingRowId === selectedRow?.id && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="mt-3 bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl overflow-hidden"
                    >
                      <div className="p-3 border-b border-[#E0D8BF] dark:border-white/[0.06]">
                        <p className="text-[10px] font-black uppercase tracking-wider text-[#1A1A0E]/40 dark:text-white/30 mb-2">
                          Buscar produto interno
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={linkSearch}
                            onChange={e => setLinkSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleLinkSearch()}
                            placeholder="Nome, SKU ou EAN..."
                            className="flex-1 bg-[#FDFAF0] dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2 text-sm text-[#1A1A0E] dark:text-[#F2F0E3] outline-none"
                          />
                          <button
                            onClick={handleLinkSearch}
                            disabled={searching}
                            className="px-3 py-2 bg-[#1A1A0E] dark:bg-[#FFE500] text-white dark:text-[#1A1A0E] rounded-xl text-xs font-black active:scale-95 transition-transform disabled:opacity-50"
                          >
                            {searching ? '...' : 'Buscar'}
                          </button>
                        </div>
                      </div>

                      {linkResults.length > 0 && (
                        <div className="max-h-40 overflow-y-auto">
                          {linkResults.map(p => (
                            <button
                              key={p.id}
                              onClick={() => handleSelectProduct(p)}
                              className="w-full text-left px-3 py-2.5 border-b border-[#E0D8BF]/50 dark:border-white/[0.04] hover:bg-[#FFF8D0] dark:hover:bg-white/[0.03] transition-colors"
                            >
                              <p className="text-xs font-bold text-[#1A1A0E] dark:text-[#F2F0E3]">{p.name}</p>
                              <p className="text-[10px] text-[#1A1A0E]/40 dark:text-white/30">{p.sku}{p.ean && ` · ${p.ean}`}</p>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Create product section */}
                      <div className="p-3">
                        <button
                          onClick={() => setShowCreate(v => !v)}
                          className="w-full text-[11px] font-black text-[#1A1A0E]/40 dark:text-white/30 flex items-center gap-1.5"
                        >
                          <Plus size={12} />
                          {showCreate ? 'Cancelar criação' : 'Criar novo produto'}
                        </button>
                        <AnimatePresence>
                          {showCreate && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="pt-3 space-y-2">
                                <input
                                  type="text"
                                  value={newName}
                                  onChange={e => setNewName(e.target.value)}
                                  placeholder="Nome *"
                                  className="w-full bg-[#FDFAF0] dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2 text-sm text-[#1A1A0E] dark:text-[#F2F0E3] outline-none"
                                />
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={newSku}
                                    onChange={e => setNewSku(e.target.value)}
                                    placeholder="SKU"
                                    className="flex-1 bg-[#FDFAF0] dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2 text-sm text-[#1A1A0E] dark:text-[#F2F0E3] outline-none"
                                  />
                                  <input
                                    type="text"
                                    value={newEan}
                                    onChange={e => setNewEan(e.target.value)}
                                    placeholder="EAN"
                                    className="flex-1 bg-[#FDFAF0] dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2 text-sm text-[#1A1A0E] dark:text-[#F2F0E3] outline-none"
                                  />
                                </div>
                                <button
                                  onClick={handleCreateAndLink}
                                  disabled={creating || !newName.trim()}
                                  className="w-full py-2.5 bg-[#1A1A0E] dark:bg-[#FFE500] text-white dark:text-[#1A1A0E] rounded-xl text-xs font-black disabled:opacity-40 active:scale-[0.97] transition-transform"
                                >
                                  {creating ? 'Criando...' : 'Criar e Vincular'}
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <button
                          onClick={closeLink}
                          className="w-full mt-2 text-[11px] font-black text-[#1A1A0E]/30 dark:text-white/25"
                        >
                          Cancelar
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Remove button */}
              <button
                onClick={() => removeRow(selectedIdx)}
                className="w-full py-3 bg-[#D81E1E]/[0.06] dark:bg-[#D81E1E]/[0.08] rounded-[14px] text-[13px] font-black text-[#D81E1E] dark:text-[#f87171] flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
              >
                <Trash2 size={14} />
                Remover este item
              </button>

              <div className="h-8" />
            </div>
          </div>
        )}

        {/* ════ REVISÃO TAB ═══════════════════════════════════════════════════ */}
        {tab === 'revisao' && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-4 pb-[220px]">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mb-5">
                <div className="bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.07] rounded-2xl p-3 text-center">
                  <p className="text-[22px] font-black text-[#1A1A0E] dark:text-[#F2F0E3]">{validRows.length}</p>
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#1A1A0E]/40 dark:text-white/35 mt-0.5">Itens</p>
                </div>
                <div className="bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.07] rounded-2xl p-3 text-center">
                  <p className="text-[22px] font-black text-emerald-600 dark:text-emerald-400">{linkedCount}</p>
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#1A1A0E]/40 dark:text-white/35 mt-0.5">Vinculados</p>
                </div>
                <div className="bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.07] rounded-2xl p-3 text-center">
                  <p className="text-[14px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight mt-0.5">{fmtBRL(totalValue)}</p>
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#1A1A0E]/40 dark:text-white/35 mt-0.5">Total</p>
                </div>
              </div>

              {/* Supplier */}
              {supplierName && (
                <div className="mb-4 flex items-center gap-2 px-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#1A1A0E]/35 dark:text-white/28">Fornecedor:</span>
                  <span className="text-xs font-bold text-[#1A1A0E] dark:text-[#F2F0E3]">{supplierName}</span>
                </div>
              )}

              {/* Item list */}
              <p className="text-[10px] font-black uppercase tracking-wider text-[#1A1A0E]/35 dark:text-white/28 mb-2">
                Itens do manifesto
              </p>
              {validRows.length === 0 ? (
                <p className="text-xs text-[#1A1A0E]/30 dark:text-white/25 text-center py-6">
                  Nenhum item preenchido ainda
                </p>
              ) : validRows.map((row, i) => {
                const total = (parseFloat(row.quantity) || 0) * (parseFloat(row.unitPrice.replace(',', '.')) || 0);
                return (
                  <div key={row.id} className="flex items-center gap-2.5 py-2.5 border-b border-[#1A1A0E]/[0.04] dark:border-white/[0.04]">
                    <span className="text-[10px] font-mono text-[#1A1A0E]/28 dark:text-white/22 w-5 text-right shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[#1A1A0E] dark:text-[#F2F0E3] truncate">{row.description || row.supplierCode}</p>
                      <p className="text-[10px] text-[#1A1A0E]/35 dark:text-white/28 mt-0.5">
                        {row.quantity} {row.unit} × R$ {row.unitPrice}
                        {total > 0 && <> = {fmtBRL(total)}</>}
                      </p>
                    </div>
                    {row.linkedProduct ? (
                      <span className="text-[9px] font-black uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 shrink-0">
                        ✓
                      </span>
                    ) : (
                      <span className="text-[9px] font-black uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full bg-[#1A1A0E]/[0.05] dark:bg-white/[0.05] text-[#1A1A0E]/30 dark:text-white/25 border border-[#1A1A0E]/[0.07] dark:border-white/[0.07] shrink-0">
                        —
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="absolute bottom-[64px] left-0 right-0 bg-[#FDFAF0] dark:bg-[#1E1E18] border-t border-[#1A1A0E]/[0.05] dark:border-white/[0.05] px-4 pt-3 pb-3 space-y-2">
              <button
                onClick={handleSubmit}
                disabled={submitting || validRows.length === 0}
                className="w-full bg-[#1A1A0E] dark:bg-[#FFE500] text-[#FFE500] dark:text-[#1A1A0E] font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#1A1A0E]/10 dark:shadow-[#FFE500]/10 active:scale-[0.97] transition-transform disabled:opacity-50"
              >
                {submitting ? (
                  <><span className="w-4 h-4 border-2 border-[#FFE500]/30 dark:border-[#1A1A0E]/30 border-t-[#FFE500] dark:border-t-[#1A1A0E] rounded-full animate-spin" />Enviando...</>
                ) : (
                  <><CheckCircle2 size={16} />Enviar para Revisão</>
                )}
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="w-full py-3 border-2 border-[#1A1A0E]/[0.14] dark:border-white/[0.12] bg-transparent text-[#1A1A0E]/60 dark:text-white/50 font-black rounded-2xl active:scale-[0.97] transition-transform text-sm disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar Rascunho'}
              </button>

              {confirmDiscard ? (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-500/10 rounded-2xl">
                  <p className="text-xs font-bold text-red-600 dark:text-red-400 flex-1">Descartar todas as alterações?</p>
                  <button
                    onClick={() => { setConfirmDiscard(false); onClose(); }}
                    className="px-3 py-1.5 bg-red-500 text-white text-xs font-black rounded-xl"
                  >
                    Sim
                  </button>
                  <button
                    onClick={() => setConfirmDiscard(false)}
                    className="px-3 py-1.5 bg-[#1A1A0E]/10 dark:bg-white/10 text-[#1A1A0E]/60 dark:text-white/50 text-xs font-black rounded-xl"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDiscard(true)}
                  className="w-full text-sm font-black text-[#D81E1E] dark:text-[#f87171] py-1"
                >
                  Descartar
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Tab Bar ────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#FFE500] dark:bg-[#252520] border-t border-[#D4C000] dark:border-white/[0.07] flex">
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setShowQtyKeyboard(false); setShowPriceKeyboard(false); }}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 py-2.5 relative transition-colors',
                active ? 'text-[#D81E1E]' : 'text-[#1A1A0E]/40 dark:text-white/28',
              )}
            >
              {active && (
                <motion.div
                  layoutId="mobile-manifest-tab-indicator"
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

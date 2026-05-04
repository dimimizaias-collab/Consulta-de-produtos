'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X, Plus, Trash2, Search, CheckCircle2, Package,
  ArrowRight, FileSpreadsheet, Save, ChevronLeft,
  FileText, Clock, Ruler, Zap, Pencil,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
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
  unitTranslated?: boolean;
  unitMultiplier?: number;
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

interface UnitConversion {
  id: string;
  unit_name: string;
  multiplier: number;
  products?: { name: string };
}

interface Supplier {
  id: string;
  name: string;
}

export interface ManualManifestModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  setNotification: (n: { type: 'success' | 'error'; message: string } | null) => void;
  onManifestSaved: (note: ReviewNote) => void;
}

// ─── Draft persistence ────────────────────────────────────────────────────────

const DRAFTS_KEY = 'manual_manifest_drafts';
function readDrafts(): ManifestDraft[] {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]'); } catch { return []; }
}
function writeDraft(draft: ManifestDraft) {
  const all = readDrafts();
  const idx = all.findIndex(d => d.id === draft.id);
  if (idx >= 0) all[idx] = draft; else all.unshift(draft);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(all));
}
function eraseDraft(id: string) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(readDrafts().filter(d => d.id !== id)));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(): ManifestRow {
  return {
    id: Math.random().toString(36).slice(2, 10),
    supplierCode: '', description: '', unit: '',
    quantity: '', unitPrice: '', linkedProduct: null,
  };
}
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ManualManifestModal({
  isOpen, onClose, suppliers, setNotification, onManifestSaved,
}: ManualManifestModalProps) {

  const [view, setView] = useState<'list' | 'editor'>('list');
  const [drafts, setDrafts] = useState<ManifestDraft[]>([]);

  // Editor state
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [rows, setRows] = useState<ManifestRow[]>([makeRow(), makeRow(), makeRow()]);
  const [submitting, setSubmitting] = useState(false);

  // Link-product sub-modal
  const [linkingRowId, setLinkingRowId] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState<LinkedProduct[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newEan, setNewEan] = useState('');
  const [creating, setCreating] = useState(false);

  // Unit menu (small dropdown per row)
  const [unitMenuRowId, setUnitMenuRowId] = useState<string | null>(null);
  const unitMenuRef = useRef<HTMLDivElement>(null);

  // Add Measure sub-modal
  const [measureRowId, setMeasureRowId] = useState<string | null>(null);
  const [measureSupplierUnit, setMeasureSupplierUnit] = useState('');
  const [measureInternalUnit, setMeasureInternalUnit] = useState('UN');
  const [measureMultiplier, setMeasureMultiplier] = useState('');
  const [savingMeasure, setSavingMeasure] = useState(false);

  // Translation picker (when multiple conversions exist)
  const [translationPickerRowId, setTranslationPickerRowId] = useState<string | null>(null);
  const [translationOptions, setTranslationOptions] = useState<UnitConversion[]>([]);
  const [loadingTranslation, setLoadingTranslation] = useState<string | null>(null);

  // Close unit menu on outside click
  useEffect(() => {
    if (!unitMenuRowId) return;
    const handler = (e: MouseEvent) => {
      if (unitMenuRef.current && !unitMenuRef.current.contains(e.target as Node))
        setUnitMenuRowId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [unitMenuRowId]);

  // On open: load drafts
  useEffect(() => {
    if (!isOpen) return;
    const saved = readDrafts();
    setDrafts(saved);
    if (saved.length === 0) openNewEditor();
    else setView('list');
  }, [isOpen]);

  // ── Navigation ───────────────────────────────────────────────────────────────

  const openNewEditor = () => {
    setCurrentDraftId(null); setSupplierId('');
    setRows([makeRow(), makeRow(), makeRow()]);
    setLinkingRowId(null); setView('editor');
  };
  const openDraft = (draft: ManifestDraft) => {
    setCurrentDraftId(draft.id); setSupplierId(draft.supplierId);
    setRows(draft.rows); setLinkingRowId(null); setView('editor');
  };
  const goToList = () => { setDrafts(readDrafts()); setView('list'); };

  // ── Draft operations ─────────────────────────────────────────────────────────

  const handleSaveDraft = () => {
    const valid = rows.filter(r => r.description.trim() || r.supplierCode.trim());
    if (valid.length === 0) {
      setNotification({ type: 'error', message: 'Adicione ao menos um item antes de salvar.' });
      return;
    }
    const supplierName = suppliers.find(s => s.id === supplierId)?.name ?? '';
    const timestamp = new Date().toLocaleString('pt-BR');
    const id = currentDraftId ?? Date.now().toString();
    writeDraft({
      id,
      label: supplierName ? `${supplierName} — ${timestamp}` : `Manifesto — ${timestamp}`,
      savedAt: timestamp,
      supplierId,
      rows,
    });
    setCurrentDraftId(id);
    setDrafts(readDrafts());
    setNotification({ type: 'success', message: 'Rascunho salvo! Continue editando ou envie para revisão.' });
  };

  const handleDeleteDraft = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    eraseDraft(id);
    const remaining = readDrafts();
    setDrafts(remaining);
    if (remaining.length === 0) openNewEditor();
  };

  // ── Row helpers ──────────────────────────────────────────────────────────────

  const updateRow = (id: string, patch: Partial<ManifestRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const addRow = () => setRows(prev => [...prev, makeRow()]);

  const removeRow = (id: string) =>
    setRows(prev => prev.length === 1 ? [makeRow()] : prev.filter(r => r.id !== id));

  const lookupMapping = async (rowId: string, code: string, description: string) => {
    if (!supplierId || (!code.trim() && !description.trim())) return;
    let q = supabase.from('supplier_mappings')
      .select('internal_product_id, products(id, name, sku, ean)')
      .eq('supplier_id', supplierId);
    if (code.trim()) q = q.eq('supplier_sku', code.trim());
    else q = q.ilike('supplier_description', `%${description.trim()}%`);
    const { data } = await q.limit(1).maybeSingle();
    if (data?.products) {
      const p = data.products as any;
      setRows(prev => prev.map(r =>
        r.id === rowId ? { ...r, linkedProduct: { id: p.id, name: p.name, sku: p.sku, ean: p.ean ?? '' } } : r
      ));
    }
  };

  // ── Unit menu ────────────────────────────────────────────────────────────────

  const openAddMeasure = (row: ManifestRow) => {
    setMeasureRowId(row.id);
    setMeasureSupplierUnit(row.unit || '');
    setMeasureInternalUnit('UN');
    setMeasureMultiplier('');
  };

  const closeAddMeasure = () => {
    setMeasureRowId(null);
    setMeasureSupplierUnit('');
    setMeasureInternalUnit('UN');
    setMeasureMultiplier('');
  };

  const handleSaveMeasure = async () => {
    if (!measureRowId) return;
    const row = rows.find(r => r.id === measureRowId);
    if (!row) return;
    const mult = parseFloat(measureMultiplier);
    if (isNaN(mult) || mult <= 0) {
      setNotification({ type: 'error', message: 'Informe um multiplicador válido (maior que 0).' });
      return;
    }
    setSavingMeasure(true);
    try {
      // Save to supplier_units if product is linked
      if (row.linkedProduct) {
        await supabase.from('supplier_units').insert({
          product_id: row.linkedProduct.id,
          supplier_id: supplierId || null,
          unit_name: measureSupplierUnit.trim() || row.unit,
          multiplier: mult,
        });
      }
      // Apply to row: qty × mult, price ÷ mult, unit = internal unit
      const newQty = row.quantity ? String(Math.round(parseFloat(row.quantity) * mult * 1000) / 1000) : '';
      const newPrice = row.unitPrice ? String(Math.round(parseFloat(row.unitPrice) / mult * 100) / 100) : '';
      updateRow(measureRowId, {
        unit: measureInternalUnit.trim() || row.unit,
        quantity: newQty,
        unitPrice: newPrice,
        unitTranslated: true,
        unitMultiplier: mult,
      });
      setNotification({ type: 'success', message: `Medida cadastrada! 1 ${measureSupplierUnit || row.unit} = ${mult} ${measureInternalUnit}.` });
      closeAddMeasure();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao salvar medida.' });
    } finally {
      setSavingMeasure(false);
    }
  };

  const applyConversion = (rowId: string, conv: UnitConversion) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    const mult = conv.multiplier;
    const newQty = row.quantity ? String(Math.round(parseFloat(row.quantity) * mult * 1000) / 1000) : '';
    const newPrice = row.unitPrice ? String(Math.round(parseFloat(row.unitPrice) / mult * 100) / 100) : '';
    updateRow(rowId, {
      unit: conv.unit_name,
      quantity: newQty,
      unitPrice: newPrice,
      unitTranslated: true,
      unitMultiplier: mult,
    });
    setNotification({ type: 'success', message: `Tradução aplicada: ×${mult}` });
    setTranslationPickerRowId(null);
    setTranslationOptions([]);
  };

  const handleUseTranslation = async (row: ManifestRow) => {
    if (!row.linkedProduct) {
      setNotification({ type: 'error', message: 'Vincule o produto ao dicionário primeiro.' });
      return;
    }
    setLoadingTranslation(row.id);
    try {
      const { data } = await supabase
        .from('supplier_units')
        .select('id, unit_name, multiplier')
        .eq('product_id', row.linkedProduct.id)
        .limit(10);

      if (!data || data.length === 0) {
        setNotification({ type: 'error', message: 'Nenhuma tradução cadastrada para este produto. Use "Adicionar medida".' });
        return;
      }
      if (data.length === 1) {
        applyConversion(row.id, data[0] as UnitConversion);
      } else {
        setTranslationPickerRowId(row.id);
        setTranslationOptions(data as UnitConversion[]);
      }
    } catch {
      setNotification({ type: 'error', message: 'Erro ao buscar traduções.' });
    } finally {
      setLoadingTranslation(null);
    }
  };

  // ── Link-product sub-modal helpers ───────────────────────────────────────────

  const openLink = (rowId: string) => {
    setLinkingRowId(rowId); setLinkSearch(''); setLinkResults([]);
    setShowCreate(false); setNewName(''); setNewSku(''); setNewEan('');
  };
  const closeLink = () => { setLinkingRowId(null); setLinkSearch(''); setLinkResults([]); setShowCreate(false); };

  const handleLinkSearch = async () => {
    if (!linkSearch.trim()) return;
    const { data } = await supabase.from('products').select('id, name, sku, ean')
      .or(`name.ilike.%${linkSearch}%,sku.ilike.%${linkSearch}%,ean.ilike.%${linkSearch}%`)
      .limit(8);
    setLinkResults((data || []) as LinkedProduct[]);
  };

  const saveMapping = async (rowId: string, product: LinkedProduct) => {
    if (!supplierId) return;
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    await supabase.from('supplier_mappings').insert({
      supplier_id: supplierId,
      supplier_sku: row.supplierCode.trim() || null,
      supplier_description: row.description.trim() || '',
      internal_product_id: product.id,
    });
  };

  const handleSelectProduct = async (product: LinkedProduct) => {
    if (!linkingRowId) return;
    await saveMapping(linkingRowId, product);
    updateRow(linkingRowId, { linkedProduct: product });
    setNotification({ type: 'success', message: 'Produto vinculado ao dicionário!' });
    closeLink();
  };

  const handleCreateAndLink = async () => {
    if (!newName.trim()) { setNotification({ type: 'error', message: 'Nome do produto é obrigatório.' }); return; }
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
        setNotification({ type: 'success', message: 'Produto criado e vinculado com sucesso!' });
        closeLink();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao criar produto.' });
    } finally { setCreating(false); }
  };

  // ── Send to review ────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const validRows = rows.filter(r => r.description.trim() || r.supplierCode.trim());
    if (validRows.length === 0) { setNotification({ type: 'error', message: 'Adicione ao menos um item ao manifesto.' }); return; }
    setSubmitting(true);
    try {
      const items = validRows.map((r, i) => ({
        seq: i + 1, ean: r.linkedProduct?.ean ?? '', sku: r.linkedProduct?.sku ?? '',
        description: r.description, unit: r.unit,
        qty: parseFloat(r.quantity) || 0, price: parseFloat(r.unitPrice) || 0,
        verified: !!r.linkedProduct, internal_product_id: r.linkedProduct?.id ?? null,
        supplier_code: r.supplierCode, product_name: r.linkedProduct?.name ?? r.description,
        unit_multiplier: r.unitMultiplier ?? null,
        original_description: r.description,
        name: r.supplierCode || r.linkedProduct?.name || r.description,
      }));
      const supplierName = suppliers.find(s => s.id === supplierId)?.name ?? '';
      const noteId = Date.now().toString();
      const timestamp = new Date().toLocaleString('pt-BR');
      const note: ReviewNote = {
        id: noteId, timestamp, fileName: `Manifesto Manual — ${timestamp}`,
        items, itemCount: items.length, verifiedCount: items.filter(i => i.verified).length,
        supplierName: supplierName || undefined,
      };
      await supabase.from('review_notes').insert({
        id: note.id, timestamp_label: note.timestamp, file_name: note.fileName,
        item_count: note.itemCount, verified_count: note.verifiedCount,
        items: note.items, supplier_name: supplierName || null,
      });
      if (currentDraftId) eraseDraft(currentDraftId);
      onManifestSaved(note);
      setNotification({ type: 'success', message: `Manifesto enviado para revisão com ${items.length} item(s).` });
      onClose();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao enviar manifesto.' });
    } finally { setSubmitting(false); }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const validCount = rows.filter(r => r.description.trim() || r.supplierCode.trim()).length;
  const linkedCount = rows.filter(r => r.linkedProduct).length;
  const totalValue = rows.reduce((acc, r) => acc + (parseFloat(r.quantity) || 0) * (parseFloat(r.unitPrice) || 0), 0);
  const linkingRow = rows.find(r => r.id === linkingRowId) ?? null;
  const measureRow = rows.find(r => r.id === measureRowId) ?? null;
  const translationPickerRow = rows.find(r => r.id === translationPickerRowId) ?? null;

  if (!isOpen) return null;

  // ══════════════════════════════════════════════════════════════════════════════
  // LIST VIEW
  // ══════════════════════════════════════════════════════════════════════════════
  if (view === 'list') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }} transition={{ duration: 0.2 }}
          className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[85vh]">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shrink-0">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 leading-none">Manual Manifest</h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Rascunhos salvos</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
              <X size={18} className="text-slate-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <button onClick={openNewEditor}
              className="w-full flex items-center gap-3 px-5 py-4 bg-slate-900 hover:bg-primary text-white rounded-2xl transition-all shadow-lg shadow-slate-900/10 font-black text-sm uppercase tracking-widest">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                <Plus size={18} />
              </div>
              Nova entrada
            </button>
            {drafts.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">
                  Rascunhos não enviados ({drafts.length})
                </p>
                {drafts.map(d => {
                  const itemCount = d.rows.filter(r => r.description.trim() || r.supplierCode.trim()).length;
                  const linkedCnt = d.rows.filter(r => r.linkedProduct).length;
                  const supplierName = suppliers.find(s => s.id === d.supplierId)?.name;
                  return (
                    <motion.div key={d.id} layout initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      onClick={() => openDraft(d)}
                      className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:border-primary/20 hover:bg-primary/5 cursor-pointer transition-all group">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
                        <FileText size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate group-hover:text-primary transition-colors">{d.label}</p>
                        <div className="flex items-center gap-3 mt-1">
                          {supplierName && <span className="text-[10px] font-bold text-slate-400 truncate max-w-[120px]">{supplierName}</span>}
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                          {linkedCnt > 0 && <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">{linkedCnt} vinculado{linkedCnt !== 1 ? 's' : ''}</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
                          <Clock size={9} />{d.savedAt}
                        </div>
                      </div>
                      <button onClick={e => handleDeleteDraft(d.id, e)}
                        className="w-8 h-8 rounded-lg text-slate-200 hover:text-red-400 hover:bg-red-50 flex items-center justify-center transition-all shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // EDITOR VIEW
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 overflow-hidden">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <motion.div initial={{ opacity: 0, scale: 0.97, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 20 }} transition={{ duration: 0.2 }}
          className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[96vw] xl:max-w-[1400px] max-h-[94vh] flex flex-col overflow-hidden">

          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-4 bg-white shrink-0">
            {drafts.length > 0 && (
              <button onClick={goToList}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-primary transition-colors shrink-0">
                <ChevronLeft size={16} />Rascunhos
              </button>
            )}
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shrink-0">
              <FileSpreadsheet size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-black text-slate-900 leading-none">
                {currentDraftId ? 'Editar Rascunho' : 'Nova Entrada Manual'}
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">Preencha os itens e vincule ao dicionário do fornecedor</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Fornecedor</label>
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[200px]">
                  <option value="">Selecione o fornecedor...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors mt-4">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
          </div>

          {/* Spreadsheet */}
          <div className="flex-1 overflow-auto" onClick={() => setUnitMenuRowId(null)}>
            <table className="w-full border-collapse min-w-[900px]">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="border-b-2 border-slate-200">
                  <th className="w-12 px-3 py-2.5 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider border-r border-slate-200">#</th>
                  <th className="w-32 px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider border-r border-slate-200">Código</th>
                  <th className="min-w-[220px] px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider border-r border-slate-200">Descrição</th>
                  <th className="w-24 px-3 py-2.5 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider border-r border-slate-200">Unid.</th>
                  <th className="w-28 px-3 py-2.5 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider border-r border-slate-200">Quantidade</th>
                  <th className="w-36 px-3 py-2.5 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider border-r border-slate-200">Preço Unit.</th>
                  <th className="w-36 px-3 py-2.5 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider border-r border-slate-200">Valor Total</th>
                  <th className="min-w-[200px] px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider border-r border-slate-200">Dicionário</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => {
                  const qty = parseFloat(row.quantity) || 0;
                  const price = parseFloat(row.unitPrice) || 0;
                  const total = qty * price;
                  const isLoadingTranslation = loadingTranslation === row.id;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition-colors group">
                      {/* # */}
                      <td className="px-3 py-1.5 text-center border-r border-slate-100 align-middle">
                        <span className="text-xs font-black text-slate-300">{idx + 1}</span>
                      </td>
                      {/* Código */}
                      <td className="px-2 py-1.5 border-r border-slate-100 align-middle">
                        <input type="text" value={row.supplierCode}
                          onChange={e => updateRow(row.id, { supplierCode: e.target.value })}
                          onBlur={() => lookupMapping(row.id, row.supplierCode, row.description)}
                          className="w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary/50 outline-none py-1 px-1 text-xs font-mono text-slate-600 transition-colors"
                          placeholder="—" />
                      </td>
                      {/* Descrição */}
                      <td className="px-2 py-1.5 border-r border-slate-100 align-middle">
                        <input type="text" value={row.description}
                          onChange={e => updateRow(row.id, { description: e.target.value })}
                          onBlur={() => lookupMapping(row.id, row.supplierCode, row.description)}
                          className="w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary/50 outline-none py-1 px-1 text-xs font-medium text-slate-700 transition-colors"
                          placeholder="Descrição do produto..." />
                      </td>

                      {/* Unid. — input + "+" menu */}
                      <td className="px-2 py-1.5 border-r border-slate-100 align-middle">
                        <div
                          ref={unitMenuRowId === row.id ? unitMenuRef : undefined}
                          className="relative flex items-center gap-0.5"
                          onClick={e => e.stopPropagation()}
                        >
                          <input type="text" value={row.unit}
                            onChange={e => updateRow(row.id, { unit: e.target.value })}
                            className="w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary/50 outline-none py-1 px-1 text-xs font-medium text-slate-600 text-center transition-colors"
                            placeholder="UN" />
                          {/* translated badge */}
                          {row.unitTranslated && (
                            <span className="text-[8px] font-black text-primary/60 leading-none shrink-0" title={`×${row.unitMultiplier}`}>×{row.unitMultiplier}</span>
                          )}
                          {/* "+" trigger */}
                          <button
                            onClick={() => setUnitMenuRowId(unitMenuRowId === row.id ? null : row.id)}
                            className={cn(
                              'w-4 h-4 rounded flex items-center justify-center transition-all shrink-0',
                              unitMenuRowId === row.id
                                ? 'bg-primary text-white'
                                : 'text-slate-300 hover:text-primary hover:bg-primary/10'
                            )}
                          >
                            <Plus size={10} />
                          </button>

                          {/* Dropdown menu */}
                          <AnimatePresence>
                            {unitMenuRowId === row.id && (
                              <motion.div
                                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                transition={{ duration: 0.12 }}
                                className="absolute left-0 top-full mt-1 z-30 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden w-44"
                              >
                                <button
                                  onClick={() => { openAddMeasure(row); setUnitMenuRowId(null); }}
                                  className="w-full text-left px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-primary/5 hover:text-primary transition-colors flex items-center gap-2"
                                >
                                  <Ruler size={12} className="shrink-0" />
                                  Adicionar medida
                                </button>
                                <button
                                  onClick={() => { handleUseTranslation(row); setUnitMenuRowId(null); }}
                                  disabled={isLoadingTranslation}
                                  className="w-full text-left px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-primary/5 hover:text-primary transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                  {isLoadingTranslation
                                    ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-r-transparent shrink-0" />
                                    : <Zap size={12} className="shrink-0" />
                                  }
                                  Usar tradução
                                </button>
                                <button
                                  onClick={() => { updateRow(row.id, { unitTranslated: false, unitMultiplier: undefined }); setUnitMenuRowId(null); }}
                                  className="w-full text-left px-3 py-2.5 text-xs font-bold text-slate-400 hover:bg-slate-50 transition-colors flex items-center gap-2 border-t border-slate-100"
                                >
                                  <Pencil size={12} className="shrink-0" />
                                  Manual
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </td>

                      {/* Quantidade */}
                      <td className="px-2 py-1.5 border-r border-slate-100 align-middle">
                        <input type="number" value={row.quantity}
                          onChange={e => updateRow(row.id, { quantity: e.target.value })}
                          className="no-spinner w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary/50 outline-none py-1 px-1 text-xs font-medium text-slate-700 text-right transition-colors"
                          placeholder="0" min="0" />
                      </td>
                      {/* Preço Unitário */}
                      <td className="px-2 py-1.5 border-r border-slate-100 align-middle">
                        <input type="number" value={row.unitPrice}
                          onChange={e => updateRow(row.id, { unitPrice: e.target.value })}
                          className="no-spinner w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary/50 outline-none py-1 px-1 text-xs font-medium text-slate-700 text-right transition-colors"
                          placeholder="0,00" step="0.01" min="0" />
                      </td>
                      {/* Valor Total */}
                      <td className="px-3 py-1.5 border-r border-slate-100 text-right align-middle">
                        <span className={cn('text-xs font-bold tabular-nums', total > 0 ? 'text-slate-800' : 'text-slate-200')}>
                          {total > 0 ? fmtBRL(total) : '—'}
                        </span>
                      </td>
                      {/* Dicionário */}
                      <td className="px-2 py-1.5 border-r border-slate-100 align-middle">
                        {row.linkedProduct ? (
                          <button onClick={() => openLink(row.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-all max-w-full"
                            title={`${row.linkedProduct.name} — clique para alterar`}>
                            <CheckCircle2 size={11} className="shrink-0" />
                            <span className="text-[11px] font-bold truncate max-w-[150px]">{row.linkedProduct.name}</span>
                          </button>
                        ) : (
                          <button onClick={() => openLink(row.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 text-slate-400 border border-dashed border-slate-300 rounded-lg hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-all">
                            <Plus size={11} />
                            <span className="text-[11px] font-bold">Vincular</span>
                          </button>
                        )}
                      </td>
                      {/* Delete */}
                      <td className="px-2 py-1.5 align-middle">
                        <button onClick={() => removeRow(row.id)}
                          className="w-7 h-7 rounded-lg text-slate-200 group-hover:text-slate-300 hover:!text-red-400 hover:bg-red-50 flex items-center justify-center transition-all">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-slate-100">
              <button onClick={addRow}
                className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-primary transition-colors py-2 px-3 rounded-xl hover:bg-primary/5">
                <Plus size={14} />Adicionar linha
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-8">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Itens</p>
                <p className="text-xl font-black text-slate-900 leading-tight tabular-nums">{validCount}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Vinculados</p>
                <p className="text-xl font-black text-emerald-600 leading-tight tabular-nums">{linkedCount}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Total Geral</p>
                <p className="text-xl font-black text-slate-900 leading-tight tabular-nums">{fmtBRL(totalValue)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleSaveDraft} disabled={validCount === 0}
                className="flex items-center gap-2 border-2 border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 px-5 py-3 rounded-2xl font-black text-sm transition-all disabled:opacity-40 uppercase tracking-widest">
                <Save size={16} />Salvar
              </button>
              <button onClick={handleSubmit} disabled={submitting || validCount === 0}
                className="flex items-center gap-2 bg-slate-900 text-white px-7 py-3 rounded-2xl font-black text-sm hover:bg-primary transition-all shadow-lg shadow-slate-900/10 disabled:opacity-40 uppercase tracking-widest">
                {submitting
                  ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                  : <><ArrowRight size={16} />Enviar para Revisão</>
                }
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Add Measure Sub-Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {measureRowId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.55 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black" onClick={closeAddMeasure} />
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }} transition={{ duration: 0.18 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white shrink-0">
                    <Ruler size={16} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Adicionar Medida</h3>
                    {measureRow?.linkedProduct && (
                      <p className="text-xs text-slate-400 font-medium mt-0.5 truncate max-w-[260px]">
                        {measureRow.linkedProduct.name}
                      </p>
                    )}
                  </div>
                </div>
                <button onClick={closeAddMeasure} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X size={16} className="text-slate-400" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {!measureRow?.linkedProduct && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-700">
                    <span>⚠</span> Vincule o produto no Dicionário para salvar a conversão permanentemente.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Unid. do Fornecedor
                    </label>
                    <input type="text" value={measureSupplierUnit}
                      onChange={e => setMeasureSupplierUnit(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-bold text-center"
                      placeholder="ex: CX" autoFocus />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Unid. Interna
                    </label>
                    <input type="text" value={measureInternalUnit}
                      onChange={e => setMeasureInternalUnit(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-bold text-center"
                      placeholder="ex: UN" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Multiplicador — quantas unidades internas por 1 unidade do fornecedor
                  </label>
                  <input type="number" value={measureMultiplier}
                    onChange={e => setMeasureMultiplier(e.target.value)}
                    className="no-spinner w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-bold text-center"
                    placeholder="ex: 12" min="0.001" step="any" />
                </div>

                {/* Preview */}
                {measureMultiplier && parseFloat(measureMultiplier) > 0 && (
                  <div className="bg-primary/5 border border-primary/10 rounded-xl px-4 py-3 space-y-1.5">
                    <p className="text-xs font-black text-primary text-center">
                      1 {measureSupplierUnit || '?'} = {measureMultiplier} {measureInternalUnit || '?'}
                    </p>
                    {measureRow && (measureRow.quantity || measureRow.unitPrice) && (
                      <div className="text-[10px] text-slate-500 text-center space-y-0.5">
                        {measureRow.quantity && (
                          <p>Qtd: {measureRow.quantity} → <strong>{Math.round(parseFloat(measureRow.quantity) * parseFloat(measureMultiplier) * 1000) / 1000}</strong></p>
                        )}
                        {measureRow.unitPrice && (
                          <p>Preço unit.: {fmtBRL(parseFloat(measureRow.unitPrice))} → <strong>{fmtBRL(Math.round(parseFloat(measureRow.unitPrice) / parseFloat(measureMultiplier) * 100) / 100)}</strong></p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <button onClick={handleSaveMeasure} disabled={savingMeasure || !measureMultiplier}
                  className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-sm hover:bg-primary transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                  {savingMeasure
                    ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                    : <><Ruler size={14} />Cadastrar e Aplicar</>
                  }
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Translation Picker (multiple results) ───────────────────────────── */}
      <AnimatePresence>
        {translationPickerRowId && translationOptions.length > 0 && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.55 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black" onClick={() => { setTranslationPickerRowId(null); setTranslationOptions([]); }} />
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }} transition={{ duration: 0.18 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">Usar Tradução</h3>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    {translationPickerRow?.linkedProduct?.name}
                  </p>
                </div>
                <button onClick={() => { setTranslationPickerRowId(null); setTranslationOptions([]); }}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X size={16} className="text-slate-400" />
                </button>
              </div>
              <div className="p-4 space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase px-1">Escolha a conversão</p>
                {translationOptions.map(conv => (
                  <button key={conv.id} onClick={() => applyConversion(translationPickerRowId!, conv)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-100 hover:border-primary/30 hover:bg-primary/5 transition-all group text-left">
                    <div>
                      <p className="text-sm font-bold text-slate-800 group-hover:text-primary">{conv.unit_name}</p>
                      <p className="text-[10px] text-slate-400">×{conv.multiplier}</p>
                    </div>
                    <CheckCircle2 size={16} className="text-slate-200 group-hover:text-primary transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Link Product Sub-Modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {linkingRowId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.55 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black" onClick={closeLink} />
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }} transition={{ duration: 0.18 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-black text-slate-900">Vincular ao Dicionário</h3>
                  {linkingRow && (
                    <p className="text-xs text-slate-400 font-medium mt-0.5 truncate">
                      {linkingRow.description || linkingRow.supplierCode || 'Item sem descrição'}
                    </p>
                  )}
                </div>
                <button onClick={closeLink} className="ml-3 p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X size={16} className="text-slate-400" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {!showCreate ? (
                  <>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input type="text" value={linkSearch}
                          onChange={e => setLinkSearch(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleLinkSearch()}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="Buscar por nome, SKU ou EAN..." autoFocus />
                      </div>
                      <button onClick={handleLinkSearch}
                        className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary transition-colors">
                        Buscar
                      </button>
                    </div>
                    {linkResults.length > 0 && (
                      <div className="space-y-1.5">
                        {linkResults.map(p => (
                          <button key={p.id} onClick={() => handleSelectProduct(p)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-primary/30 hover:bg-primary/5 transition-all text-left group">
                            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
                              <Package size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 truncate group-hover:text-primary">{p.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{p.sku}</span>
                                {p.ean && <span className="text-[10px] text-slate-400">{p.ean}</span>}
                              </div>
                            </div>
                            <CheckCircle2 size={16} className="text-slate-200 group-hover:text-primary transition-colors shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                    {linkResults.length === 0 && linkSearch && (
                      <p className="text-sm text-slate-400 text-center py-4">Nenhum produto encontrado.</p>
                    )}
                    <button onClick={() => setShowCreate(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 text-slate-400 rounded-xl hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all text-sm font-bold">
                      <Plus size={14} />Criar novo produto
                    </button>
                  </>
                ) : (
                  <div className="space-y-4">
                    <button onClick={() => setShowCreate(false)}
                      className="text-xs font-bold text-slate-400 hover:text-primary transition-colors flex items-center gap-1">
                      ← Voltar para busca
                    </button>
                    <h4 className="text-sm font-black text-slate-900">Criar Novo Produto</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Nome *</label>
                        <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="Nome do produto" autoFocus />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">SKU</label>
                          <input type="text" value={newSku} onChange={e => setNewSku(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="Auto-gerado" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">EAN / Barcode</label>
                          <input type="text" value={newEan} onChange={e => setNewEan(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="Código de barras" />
                        </div>
                      </div>
                    </div>
                    <button onClick={handleCreateAndLink} disabled={creating || !newName.trim()}
                      className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-sm hover:bg-primary transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                      {creating
                        ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                        : <><Plus size={14} />Criar e Vincular</>
                      }
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

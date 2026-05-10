'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X, Plus, Trash2, Search, CheckCircle2, Package,
  ArrowRight, FileSpreadsheet, Save, ChevronLeft,
  FileText, Clock, Ruler, Zap, Pencil, Layers, Upload, Wand2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { ReviewNote } from './LogisticsCenter';
import { InvoiceImportModal, type ImportedRow } from './InvoiceImportModal';

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
  multiLinked?: boolean;
  confidence?: number; // 0-1, presente em linhas importadas via IA
  autoFilledCode?: boolean;  // true se supplierCode foi auto-preenchido pelo vínculo
  autoFilledDesc?: boolean;  // true se description foi auto-preenchido pelo vínculo
}

interface MultiLinkEntry {
  product: LinkedProduct;
  qty: string;
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

// ─── Draft persistence (review_notes with is_draft = true) ───────────────────

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

async function deleteDraft(id: string) {
  const { error } = await supabase.from('review_notes').delete().eq('id', id).eq('is_draft', true);
  if (error) throw error;
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
  const [loadingDrafts, setLoadingDrafts] = useState(false);

  // Editor state
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [rows, setRows] = useState<ManifestRow[]>([makeRow(), makeRow(), makeRow()]);
  const [pastedRange, setPastedRange] = useState<{ start: number; end: number; field: string } | null>(null);
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
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Import invoice modal
  const [showImport, setShowImport] = useState(false);

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

  // Multi-link sub-modal
  const [multiLinkRowId, setMultiLinkRowId] = useState<string | null>(null);
  const [multiLinkEntries, setMultiLinkEntries] = useState<MultiLinkEntry[]>([]);
  const [multiLinkSearch, setMultiLinkSearch] = useState('');
  const [multiLinkQty, setMultiLinkQty] = useState('');
  const [multiLinkResults, setMultiLinkResults] = useState<LinkedProduct[]>([]);
  const [multiLinkShowCreate, setMultiLinkShowCreate] = useState(false);
  const [multiLinkNewName, setMultiLinkNewName] = useState('');
  const [multiLinkNewSku, setMultiLinkNewSku] = useState('');
  const [multiLinkNewEan, setMultiLinkNewEan] = useState('');
  const [multiLinkCreating, setMultiLinkCreating] = useState(false);

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

  // Auto-save draft whenever rows / supplier change (debounced 1.5 s)
  useEffect(() => {
    if (view !== 'editor' || !currentDraftId) return;
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
      try {
        await upsertDraft(draft);
        setDrafts(prev => {
          const idx = prev.findIndex(d => d.id === currentDraftId);
          if (idx >= 0) { const next = [...prev]; next[idx] = draft; return next; }
          return [draft, ...prev];
        });
      } catch { /* silent — manual Salvar will surface errors */ }
    }, 1500);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [rows, supplierId, view, currentDraftId]);

  // On open: load drafts from Supabase
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingDrafts(true);
    fetchDrafts().then(saved => {
      if (cancelled) return;
      setDrafts(saved);
      setLoadingDrafts(false);
      if (saved.length === 0) openNewEditor();
      else setView('list');
    }).catch((err: any) => {
      if (!cancelled) {
        setLoadingDrafts(false);
        setNotification({ type: 'error', message: `Erro ao carregar rascunhos: ${err?.message || 'tabela não encontrada'}` });
        openNewEditor();
      }
    });
    return () => { cancelled = true; };
  }, [isOpen]);

  // ── Navigation ───────────────────────────────────────────────────────────────

  const openNewEditor = () => {
    setCurrentDraftId(Date.now().toString()); setSupplierId('');
    setRows([makeRow(), makeRow(), makeRow()]);
    setLinkingRowId(null); setView('editor');
  };
  const openDraft = (draft: ManifestDraft) => {
    setCurrentDraftId(draft.id); setSupplierId(draft.supplierId);
    setRows(draft.rows); setLinkingRowId(null); setView('editor');
  };
  const goToList = async () => {
    setLoadingDrafts(true);
    const saved = await fetchDrafts().catch(() => drafts);
    setDrafts(saved);
    setLoadingDrafts(false);
    setView('list');
  };

  // ── Draft operations ─────────────────────────────────────────────────────────

  const handleSaveDraft = async () => {
    const valid = rows.filter(r => r.description.trim() || r.supplierCode.trim());
    if (valid.length === 0) {
      setNotification({ type: 'error', message: 'Adicione ao menos um item antes de salvar.' });
      return;
    }
    const supplierName = suppliers.find(s => s.id === supplierId)?.name ?? '';
    const timestamp = new Date().toLocaleString('pt-BR');
    const id = currentDraftId ?? Date.now().toString();
    const draft: ManifestDraft = {
      id,
      label: supplierName ? `${supplierName} — ${timestamp}` : `Manifesto — ${timestamp}`,
      savedAt: timestamp,
      supplierId,
      rows,
    };
    try {
      await upsertDraft(draft);
      setCurrentDraftId(id);
      setDrafts(prev => {
        const idx = prev.findIndex(d => d.id === id);
        if (idx >= 0) { const next = [...prev]; next[idx] = draft; return next; }
        return [draft, ...prev];
      });
      setNotification({ type: 'success', message: 'Rascunho salvo! Continue editando ou envie para revisão.' });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao salvar rascunho.' });
    }
  };

  const handleDeleteDraft = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteDraft(id).catch(() => {});
    const remaining = drafts.filter(d => d.id !== id);
    setDrafts(remaining);
    if (remaining.length === 0) openNewEditor();
  };

  // ── Row helpers ──────────────────────────────────────────────────────────────

  const updateRow = (id: string, patch: Partial<ManifestRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const addRow = () => setRows(prev => [...prev, makeRow()]);

  const removeRow = (id: string) =>
    setRows(prev => prev.length === 1 ? [makeRow()] : prev.filter(r => r.id !== id));

  // ── Paste coluna (distribui multi-linhas para baixo) ─────────────────────────

  type PasteField = keyof Pick<ManifestRow, 'supplierCode' | 'description' | 'unit' | 'quantity' | 'unitPrice'>;

  /**
   * Normaliza um valor colado para campos numéricos.
   * Lida com formato brasileiro (vírgula = decimal, ponto = milhar)
   * e com texto extra vindo de PDFs (ex: "48 UN", "1.248,00").
   * Retorna string vazia se o valor não for reconhecível como número.
   */
  const normalizeNumericPaste = (raw: string): string => {
    // Extrai apenas dígitos, ponto e vírgula
    const cleaned = raw.replace(/[^\d.,]/g, '').trim();
    if (!cleaned) return '';

    // Formato brasileiro: tem vírgula como separador decimal
    // ex: "1.248,90" → "1248.90"  |  "15,90" → "15.90"
    if (cleaned.includes(',')) {
      const normalized = cleaned.replace(/\./g, '').replace(',', '.');
      return isNaN(parseFloat(normalized)) ? '' : normalized;
    }

    // Sem vírgula: pode ser "1248" ou "1.248" (milhar br) ou "15.90" (decimal int.)
    // Heurística: se tem ponto e exatamente 3 dígitos depois → milhar
    const dotIdx = cleaned.lastIndexOf('.');
    if (dotIdx !== -1 && cleaned.length - dotIdx - 1 === 3) {
      // Ex: "1.248" → milhar → "1248"
      const normalized = cleaned.replace(/\./g, '');
      return isNaN(parseFloat(normalized)) ? '' : normalized;
    }

    // Caso geral: "15.90", "48", "0.5"
    return isNaN(parseFloat(cleaned)) ? '' : cleaned;
  };

  const handleColumnPaste = (
    e: React.ClipboardEvent,
    rowIndex: number,
    field: PasteField,
  ) => {
    const text = e.clipboardData.getData('text');
    const isNumeric = field === 'quantity' || field === 'unitPrice';

    const lines = text
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length <= 1) return; // comportamento padrão do browser

    e.preventDefault();

    // Para campos numéricos, normaliza cada linha; descarta as inválidas
    const values = isNumeric
      ? lines.map(normalizeNumericPaste).filter(v => v.length > 0)
      : lines;

    if (values.length === 0) return;

    setRows(prev => {
      const updated = [...prev];
      values.forEach((value, i) => {
        const targetIdx = rowIndex + i;
        if (targetIdx < updated.length) {
          updated[targetIdx] = { ...updated[targetIdx], [field]: value };
        } else {
          updated.push({ ...makeRow(), [field]: value });
        }
      });
      return updated;
    });

    // Flash visual nas células preenchidas
    setPastedRange({ start: rowIndex, end: rowIndex + values.length - 1, field });
    setTimeout(() => setPastedRange(null), 800);

    // Dispara lookup automático nas linhas afetadas
    if (field === 'supplierCode' || field === 'description') {
      setTimeout(() => {
        setRows(prev => {
          values.forEach((_, i) => {
            const row = prev[rowIndex + i];
            if (row) lookupMapping(row.id, row.supplierCode, row.description);
          });
          return prev;
        });
      }, 50);
    }
  };

  const lookupMapping = async (rowId: string, code: string, description: string) => {
    if (!supplierId || (!code.trim() && !description.trim())) return;
    let q = supabase.from('supplier_mappings')
      .select('internal_product_id, supplier_sku, supplier_description, products(id, name, sku, ean)')
      .eq('supplier_id', supplierId);
    if (code.trim()) q = q.eq('supplier_sku', code.trim());
    else q = q.ilike('supplier_description', `%${description.trim()}%`);
    const { data } = await q.limit(1).maybeSingle();
    if (data) {
      const p = data.products as any;
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
      // Apply to row: qty × mult, price ÷ (mult × qty), unit = internal unit
      const origQty = parseFloat(row.quantity) || 0;
      const newQty = row.quantity ? String(Math.round(origQty * mult * 1000) / 1000) : '';
      const newPrice = row.unitPrice
        ? origQty > 0
          ? String(Math.round(parseFloat(row.unitPrice) / (mult * origQty) * 100) / 100)
          : String(Math.round(parseFloat(row.unitPrice) / mult * 100) / 100)
        : '';
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
    const origQty = parseFloat(row.quantity) || 0;
    const newQty = row.quantity ? String(Math.round(origQty * mult * 1000) / 1000) : '';
    const newPrice = row.unitPrice
      ? origQty > 0
        ? String(Math.round(parseFloat(row.unitPrice) / (mult * origQty) * 100) / 100)
        : String(Math.round(parseFloat(row.unitPrice) / mult * 100) / 100)
      : '';
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

  // ── Import invoice ────────────────────────────────────────────────────────────

  const handleImportRows = (imported: ImportedRow[]) => {
    const newRows: ManifestRow[] = imported.map(item => ({
      id: Math.random().toString(36).slice(2, 10),
      supplierCode: item.supplierCode,
      description: item.description,
      unit: item.unit || 'UN',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      linkedProduct: null,
    }));
    newRows.push(makeRow());
    setRows(newRows);
    setNotification({
      type: 'success',
      message: `${imported.length} ${imported.length === 1 ? 'item adicionado' : 'itens adicionados'} ao manifesto.`,
    });
  };

  // ── Send to review ────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const validRows = rows.filter(r => r.description.trim() || r.supplierCode.trim());
    if (validRows.length === 0) { setNotification({ type: 'error', message: 'Adicione ao menos um item ao manifesto.' }); return; }
    if (autoSaveRef.current) { clearTimeout(autoSaveRef.current); autoSaveRef.current = null; }
    setSubmitting(true);
    try {
      const items = validRows.map((r, i) => {
        const sku = r.linkedProduct?.sku?.startsWith('MAN-') ? '' : (r.linkedProduct?.sku ?? '');
        return {
          seq: i + 1,
          ean: r.linkedProduct?.ean ?? '',
          sku,
          description: r.description,
          unit: r.unit,
          qty: parseFloat(r.quantity) || 0,
          price: parseFloat(r.unitPrice) || 0,
          verified: !!r.linkedProduct,
          internal_product_id: r.linkedProduct?.id ?? null,
          supplier_code: r.supplierCode,
          product_name: r.linkedProduct?.name ?? r.description,
          unit_multiplier: r.unitMultiplier ?? null,
          original_description: r.description,
          name: r.linkedProduct?.name ?? r.description,
        };
      });
      const supplierName = suppliers.find(s => s.id === supplierId)?.name ?? '';
      const noteId = currentDraftId ?? Date.now().toString();
      const timestamp = new Date().toLocaleString('pt-BR');
      const note: ReviewNote = {
        id: noteId, timestamp, fileName: `Manifesto Manual — ${timestamp}`,
        items, itemCount: items.length, verifiedCount: items.filter(i => i.verified).length,
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
      setNotification({ type: 'success', message: `Manifesto enviado para revisão com ${items.length} item(s).` });
      onClose();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao enviar manifesto.' });
    } finally { setSubmitting(false); }
  };

  // ── Multi-link helpers ───────────────────────────────────────────────────────

  const openMultiLink = (rowId: string) => {
    setMultiLinkRowId(rowId);
    setMultiLinkEntries([]);
    setMultiLinkSearch(''); setMultiLinkQty('');
    setMultiLinkResults([]);
    setMultiLinkShowCreate(false);
    setMultiLinkNewName(''); setMultiLinkNewSku(''); setMultiLinkNewEan('');
  };

  const closeMultiLink = () => {
    setMultiLinkRowId(null);
    setMultiLinkEntries([]);
    setMultiLinkSearch(''); setMultiLinkQty('');
    setMultiLinkResults([]);
    setMultiLinkShowCreate(false);
  };

  const handleMultiLinkSearch = async () => {
    if (!multiLinkSearch.trim()) return;
    const { data } = await supabase.from('products').select('id, name, sku, ean')
      .or(`name.ilike.%${multiLinkSearch}%,sku.ilike.%${multiLinkSearch}%,ean.ilike.%${multiLinkSearch}%`)
      .limit(8);
    setMultiLinkResults((data || []) as LinkedProduct[]);
  };

  const handleAddToMultiLink = async (product: LinkedProduct) => {
    const qty = multiLinkQty.trim();
    if (!qty || parseFloat(qty) <= 0) {
      setNotification({ type: 'error', message: 'Informe a quantidade antes de adicionar.' });
      return;
    }
    if (supplierId) {
      const sourceRow = rows.find(r => r.id === multiLinkRowId);
      if (sourceRow) {
        await supabase.from('supplier_mappings').upsert({
          supplier_id: supplierId,
          supplier_sku: sourceRow.supplierCode.trim() || null,
          supplier_description: sourceRow.description.trim() || '',
          internal_product_id: product.id,
        });
      }
    }
    setMultiLinkEntries(prev => [...prev, { product, qty }]);
    setMultiLinkSearch('');
    setMultiLinkQty('');
    setMultiLinkResults([]);
  };

  const handleSaveMultiLink = () => {
    const sourceRow = rows.find(r => r.id === multiLinkRowId);
    if (!sourceRow || multiLinkEntries.length === 0) return;
    const newRows: ManifestRow[] = multiLinkEntries.map(entry => ({
      id: Math.random().toString(36).slice(2, 10),
      supplierCode: sourceRow.supplierCode,
      description: sourceRow.description,
      unit: sourceRow.unit,
      quantity: entry.qty,
      unitPrice: sourceRow.unitPrice,
      linkedProduct: entry.product,
      unitTranslated: sourceRow.unitTranslated,
      unitMultiplier: sourceRow.unitMultiplier,
      multiLinked: true,
    }));
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === multiLinkRowId);
      if (idx < 0) return [...prev, ...newRows];
      const next = [...prev];
      next.splice(idx, 1, ...newRows);
      return next;
    });
    setNotification({ type: 'success', message: `${newRows.length} linha${newRows.length !== 1 ? 's' : ''} criada${newRows.length !== 1 ? 's' : ''} para "${sourceRow.description || sourceRow.supplierCode}".` });
    closeMultiLink();
  };

  const handleMultiLinkCreateProduct = async () => {
    if (!multiLinkNewName.trim()) {
      setNotification({ type: 'error', message: 'Nome do produto é obrigatório.' });
      return;
    }
    if (!multiLinkQty.trim() || parseFloat(multiLinkQty) <= 0) {
      setNotification({ type: 'error', message: 'Informe a quantidade.' });
      return;
    }
    setMultiLinkCreating(true);
    try {
      const sku = multiLinkNewSku.trim() || `MAN-${Date.now()}`;
      const { data: created, error } = await supabase.from('products')
        .insert({ name: multiLinkNewName.trim(), sku, ean: multiLinkNewEan.trim() || null, count: 0, is_low: true, status: 'Fora de Estoque' })
        .select('id, name, sku, ean').single();
      if (error) throw error;
      if (created) {
        await handleAddToMultiLink(created as LinkedProduct);
        setMultiLinkNewName(''); setMultiLinkNewSku(''); setMultiLinkNewEan('');
        setMultiLinkShowCreate(false);
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao criar produto.' });
    } finally {
      setMultiLinkCreating(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const validCount = rows.filter(r => r.description.trim() || r.supplierCode.trim()).length;
  const linkedCount = rows.filter(r => r.linkedProduct).length;
  const totalValue = rows.reduce((acc, r) => acc + (parseFloat(r.quantity) || 0) * (parseFloat(r.unitPrice) || 0), 0);
  const linkingRow = rows.find(r => r.id === linkingRowId) ?? null;
  const measureRow = rows.find(r => r.id === measureRowId) ?? null;
  const translationPickerRow = rows.find(r => r.id === translationPickerRowId) ?? null;
  const multiLinkRow = rows.find(r => r.id === multiLinkRowId) ?? null;

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
            {loadingDrafts && (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-r-transparent" />
              </div>
            )}
            {!loadingDrafts && drafts.length > 0 && (
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

              {/* Import invoice button */}
              <div className="mt-4">
                <button
                  onClick={() => setShowImport(true)}
                  title="Importar nota fiscal ou romaneio (PDF, JPG, PNG)"
                  className="flex items-center gap-2 border-2 border-blue-200 text-blue-700 hover:border-blue-300 hover:bg-blue-50 px-4 py-2 rounded-xl font-bold text-xs transition-all uppercase tracking-widest"
                >
                  <Upload size={14} />
                  Importar Nota
                </button>
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
                        <div className="relative flex items-center">
                          <input type="text" value={row.supplierCode}
                            onChange={e => updateRow(row.id, { supplierCode: e.target.value, autoFilledCode: false })}
                            onBlur={() => lookupMapping(row.id, row.supplierCode, row.description)}
                            onPaste={e => handleColumnPaste(e, idx, 'supplierCode')}
                            className={cn(
                              "w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary/50 outline-none py-1 text-xs font-mono text-slate-600 transition-colors",
                              row.autoFilledCode ? "pl-1 pr-5" : "px-1",
                              pastedRange && pastedRange.field === 'supplierCode' && idx >= pastedRange.start && idx <= pastedRange.end && "ring-1 ring-emerald-400 rounded bg-emerald-50/40"
                            )}
                            placeholder="—" />
                          {row.autoFilledCode && (
                            <Wand2 size={10} className="absolute right-1 text-amber-400 pointer-events-none shrink-0" aria-label="Preenchido automaticamente" />
                          )}
                        </div>
                      </td>
                      {/* Descrição */}
                      <td className="px-2 py-1.5 border-r border-slate-100 align-middle">
                        <div className="relative flex items-center gap-1">
                          {row.confidence !== undefined && (
                            <span
                              title={`Confiança da IA: ${Math.round(row.confidence * 100)}%`}
                              className={cn(
                                'inline-block w-2 h-2 rounded-full shrink-0',
                                row.confidence >= 0.85 ? 'bg-emerald-500' :
                                row.confidence >= 0.60 ? 'bg-amber-400' : 'bg-red-400',
                              )}
                            />
                          )}
                          <input type="text" value={row.description}
                            onChange={e => updateRow(row.id, { description: e.target.value, autoFilledDesc: false })}
                            onBlur={() => lookupMapping(row.id, row.supplierCode, row.description)}
                            onPaste={e => handleColumnPaste(e, idx, 'description')}
                            className={cn(
                              "w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary/50 outline-none py-1 text-xs font-medium text-slate-700 transition-colors",
                              row.autoFilledDesc ? "pl-1 pr-5" : "px-1",
                              pastedRange && pastedRange.field === 'description' && idx >= pastedRange.start && idx <= pastedRange.end && "ring-1 ring-emerald-400 rounded bg-emerald-50/40"
                            )}
                            placeholder="Descrição do produto..." />
                          {row.autoFilledDesc && (
                            <Wand2 size={10} className="absolute right-1 text-amber-400 pointer-events-none shrink-0" aria-label="Preenchido automaticamente" />
                          )}
                        </div>
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
                            onPaste={e => handleColumnPaste(e, idx, 'unit')}
                            className={cn(
                              "w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary/50 outline-none py-1 px-1 text-xs font-medium text-slate-600 text-center transition-colors",
                              pastedRange && pastedRange.field === 'unit' && idx >= pastedRange.start && idx <= pastedRange.end && "ring-1 ring-emerald-400 rounded bg-emerald-50/40"
                            )}
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
                          onPaste={e => handleColumnPaste(e, idx, 'quantity')}
                          className={cn(
                            "no-spinner w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary/50 outline-none py-1 px-1 text-xs font-medium text-slate-700 text-right transition-colors",
                            pastedRange && pastedRange.field === 'quantity' && idx >= pastedRange.start && idx <= pastedRange.end && "ring-1 ring-emerald-400 rounded bg-emerald-50/40"
                          )}
                          placeholder="0" min="0" />
                      </td>
                      {/* Preço Unitário */}
                      <td className="px-2 py-1.5 border-r border-slate-100 align-middle">
                        <input type="number" value={row.unitPrice}
                          onChange={e => updateRow(row.id, { unitPrice: e.target.value, unitTranslated: false })}
                          onPaste={e => handleColumnPaste(e, idx, 'unitPrice')}
                          className={cn(
                            'no-spinner w-full border-b border-transparent hover:border-slate-200 focus:border-primary/50 outline-none py-1 px-1 text-xs font-medium text-right transition-colors',
                            pastedRange && pastedRange.field === 'unitPrice' && idx >= pastedRange.start && idx <= pastedRange.end
                              ? 'ring-1 ring-emerald-400 rounded bg-emerald-50/40 text-slate-700'
                              : row.unitTranslated
                                ? 'text-emerald-600 bg-emerald-50/40'
                                : 'text-slate-700 bg-transparent'
                          )}
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
                        <div className="flex items-center gap-1 flex-wrap">
                          {row.linkedProduct ? (
                            <button onClick={() => openLink(row.id)}
                              className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-all max-w-full"
                              title={`${row.linkedProduct.name} — clique para alterar`}>
                              <CheckCircle2 size={11} className="shrink-0" />
                              <span className="text-[11px] font-bold truncate max-w-[100px]">{row.linkedProduct.name}</span>
                            </button>
                          ) : (
                            <button onClick={() => openLink(row.id)}
                              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 text-slate-400 border border-dashed border-slate-300 rounded-lg hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-all">
                              <Plus size={11} />
                              <span className="text-[11px] font-bold">Vincular</span>
                            </button>
                          )}
                          {/* Vincular vários */}
                          <button
                            onClick={() => openMultiLink(row.id)}
                            title="Vincular vários produtos a este item"
                            className={cn(
                              'flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold transition-all',
                              row.multiLinked
                                ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                                : 'bg-slate-50 text-slate-400 border-dashed border-slate-300 hover:bg-primary/5 hover:border-primary/40 hover:text-primary'
                            )}
                          >
                            <Layers size={11} className="shrink-0" />
                            <span>Vários</span>
                          </button>
                        </div>
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

      {/* ── Multi-Link Sub-Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {multiLinkRowId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.55 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black" onClick={closeMultiLink} />
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }} transition={{ duration: 0.18 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">

              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                      <Layers size={14} />
                    </div>
                    <h3 className="text-base font-black text-slate-900">Vincular Vários</h3>
                  </div>
                  {multiLinkRow && (
                    <p className="text-xs text-slate-400 font-medium mt-1 truncate pl-9">
                      {multiLinkRow.description || multiLinkRow.supplierCode || 'Item sem descrição'}
                    </p>
                  )}
                </div>
                <button onClick={closeMultiLink} className="ml-3 p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X size={16} className="text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {!multiLinkShowCreate ? (
                  <>
                    {/* Search + Qty row */}
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          value={multiLinkSearch}
                          onChange={e => setMultiLinkSearch(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleMultiLinkSearch()}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="Buscar por nome, SKU ou EAN..."
                          autoFocus
                        />
                      </div>
                      <input
                        type="number"
                        value={multiLinkQty}
                        onChange={e => setMultiLinkQty(e.target.value)}
                        className="w-20 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-center"
                        placeholder="Qtd"
                        min="0"
                        step="any"
                      />
                      <button
                        onClick={handleMultiLinkSearch}
                        className="px-3 py-2 bg-slate-900 text-white rounded-xl hover:bg-primary transition-colors"
                        title="Buscar"
                      >
                        <Search size={14} />
                      </button>
                      <button
                        onClick={() => setMultiLinkShowCreate(true)}
                        className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"
                        title="Criar novo produto"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {/* Search results */}
                    {multiLinkResults.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">Resultados</p>
                        {multiLinkResults.map(p => (
                          <button
                            key={p.id}
                            onClick={() => handleAddToMultiLink(p)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
                          >
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
                            <Plus size={14} className="text-slate-300 group-hover:text-primary shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Added entries */}
                    {multiLinkEntries.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">
                          A criar ({multiLinkEntries.length})
                        </p>
                        {multiLinkEntries.map((entry, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-emerald-800 truncate">{entry.product.name}</p>
                              <p className="text-[10px] text-emerald-600 font-medium">Qtd: {entry.qty}</p>
                            </div>
                            <button
                              onClick={() => setMultiLinkEntries(prev => prev.filter((_, i) => i !== idx))}
                              className="w-6 h-6 rounded-lg text-emerald-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-all shrink-0"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  /* Create new product */
                  <div className="space-y-4">
                    <button onClick={() => setMultiLinkShowCreate(false)}
                      className="text-xs font-bold text-slate-400 hover:text-primary transition-colors flex items-center gap-1">
                      ← Voltar para busca
                    </button>
                    <h4 className="text-sm font-black text-slate-900">Criar Novo Produto</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Quantidade *</label>
                        <input type="number" value={multiLinkQty} onChange={e => setMultiLinkQty(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="Quantidade" min="0" step="any" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Nome *</label>
                        <input type="text" value={multiLinkNewName} onChange={e => setMultiLinkNewName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="Nome do produto" autoFocus />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">SKU</label>
                          <input type="text" value={multiLinkNewSku} onChange={e => setMultiLinkNewSku(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="Auto-gerado" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">EAN / Barcode</label>
                          <input type="text" value={multiLinkNewEan} onChange={e => setMultiLinkNewEan(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="Código de barras" />
                        </div>
                      </div>
                    </div>
                    <button onClick={handleMultiLinkCreateProduct}
                      disabled={multiLinkCreating || !multiLinkNewName.trim() || !multiLinkQty.trim()}
                      className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-sm hover:bg-primary transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                      {multiLinkCreating
                        ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                        : <><Plus size={14} />Criar e Adicionar</>
                      }
                    </button>
                  </div>
                )}
              </div>

              {/* Footer save */}
              {multiLinkEntries.length > 0 && !multiLinkShowCreate && (
                <div className="px-5 py-4 border-t border-slate-100 shrink-0">
                  <button
                    onClick={handleSaveMultiLink}
                    className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-sm hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <Layers size={14} />
                    Criar {multiLinkEntries.length} linha{multiLinkEntries.length !== 1 ? 's' : ''}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Invoice Import Modal ──────────────────────────────────────────────── */}
      <InvoiceImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImportRows}
      />
    </>
  );
}

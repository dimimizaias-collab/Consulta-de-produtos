'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X,
  BookText,
  Plus,
  Search,
  ChevronDown,
  CheckCircle2,
  ArrowRight,
  Trash2,
  Users,
  ImageOff,
  FileUp,
  Pencil,
  Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getDirectImageUrl } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';
import * as XLSX from 'xlsx';
import { AddSupplierModal, type NewSupplier } from './AddSupplierModal';

interface Product {
  id: string;
  name: string;
  sku: string;
  ean: string;
  image: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface Mapping {
  id: string;
  supplier_id: string;
  supplier_sku?: string;
  supplier_description: string;
  internal_product_id: string;
  products?: {
    name: string;
    sku: string;
    ean: string;
  };
}

interface UnitConversion {
  id: string;
  product_id: string;
  supplier_id?: string;
  unit_name: string;
  multiplier: number;
  products?: {
    name: string;
    sku: string;
    ean: string;
    image: string;
  };
  suppliers?: {
    name: string;
  };
}

interface SupplierDictionaryProps {
  isOpen: boolean;
  onClose: () => void;
  setNotification: (notif: { type: 'success' | 'error', message: string } | null) => void;
}

function ProductImage({ src, alt, className }: { src: string, alt: string, className?: string }) {
  const [error, setError] = useState(false);
  const directSrc = useMemo(() => getDirectImageUrl(src), [src]);

  return (
    <div className={cn("relative w-full h-full flex items-center justify-center", className)}>
      {directSrc && !error ? (
        <Image 
          key={directSrc}
          className="object-cover" 
          alt={alt} 
          src={directSrc}
          fill
          referrerPolicy="no-referrer"
          unoptimized={directSrc.includes('googleusercontent.com')}
          onError={() => setError(true)}
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-slate-300">
           <ImageOff size={16} className="opacity-20" />
        </div>
      )}
    </div>
  );
}

export function SupplierDictionary({ isOpen, onClose, setNotification }: SupplierDictionaryProps) {
  const [supplierNames, setSupplierNames] = useState<Supplier[]>([]);
  const [supplierMappings, setSupplierMappings] = useState<Mapping[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [supplierMappingDescription, setSupplierMappingDescription] = useState('');
  const [supplierMappingCode, setSupplierMappingCode] = useState('');
  const [selectedSupplierMappingProduct, setSelectedSupplierMappingProduct] = useState<Product | null>(null);
  const [supplierMappingSearchQuery, setSupplierMappingSearchQuery] = useState('');
  const [supplierMappingSearchResults, setSupplierMappingSearchResults] = useState<Product[]>([]);
  const [isAddingMapping, setIsAddingMapping] = useState(false);
  
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);

  // Unit Conversion State
  const [activeTab, setActiveTab] = useState<'mappings' | 'units'>('mappings');
  const [unitConversions, setUnitConversions] = useState<UnitConversion[]>([]);
  const [selectedUnitProduct, setSelectedUnitProduct] = useState<Product | null>(null);
  const [selectedUnitSupplierId, setSelectedUnitSupplierId] = useState<string>('');
  const [unitName, setUnitName] = useState('');
  const [unitMultiplier, setUnitMultiplier] = useState('1');
  const [isAddingUnit, setIsAddingUnit] = useState(false);
  const [unitSearchQuery, setUnitSearchQuery] = useState('');
  const [unitSearchType, setUnitSearchType] = useState<'name' | 'ean' | 'sku' | 'brand'>('name');
  const [unitSearchResults, setUnitSearchResults] = useState<Product[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [mappingListSearch, setMappingListSearch] = useState('');
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [editSku, setEditSku] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editProductSearch, setEditProductSearch] = useState('');
  const [editProductResults, setEditProductResults] = useState<Product[]>([]);
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const dictionaryFileInputRef = useRef<HTMLInputElement>(null);

  // Combobox state for supplier selector
  const [supplierComboQuery, setSupplierComboQuery] = useState('');
  const [supplierComboOpen, setSupplierComboOpen] = useState(false);
  const supplierComboRef = useRef<HTMLDivElement>(null);

  const selectedSupplier = supplierNames.find(s => s.id === selectedSupplierId) ?? null;
  const filteredSuppliers = supplierComboQuery.trim()
    ? supplierNames.filter(s => s.name.toLowerCase().includes(supplierComboQuery.toLowerCase()))
    : supplierNames;

  // Duplicate detection
  const isDupCode = supplierMappingCode.trim().length > 0 &&
    supplierMappings.some(m => (m.supplier_sku ?? '').toLowerCase() === supplierMappingCode.trim().toLowerCase());
  const isDupDescription = supplierMappingDescription.trim().length > 0 &&
    supplierMappings.some(m => (m.supplier_description ?? '').toLowerCase() === supplierMappingDescription.trim().toLowerCase());

  // Fetch initial data
  useEffect(() => {
    if (isOpen) {
      fetchSuppliers();
      fetchUnitConversions();
    }
  }, [isOpen]);

  // Close combobox on click outside
  useEffect(() => {
    if (!supplierComboOpen) return;
    const handler = (e: MouseEvent) => {
      if (supplierComboRef.current && !supplierComboRef.current.contains(e.target as Node)) {
        setSupplierComboOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [supplierComboOpen]);

  const fetchSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name');
      if (error) throw error;
      setSupplierNames(data || []);
    } catch (err) {
      console.error('Erro ao buscar fornecedores:', err);
    }
  };

  const fetchSupplierMappings = async (supplierId: string) => {
    if (!supplierId) {
      setSupplierMappings([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('supplier_mappings')
        .select('*, products(name, sku, ean)')
        .eq('supplier_id', supplierId);
      if (error) throw error;
      setSupplierMappings(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar mapeamentos:', err);
    }
  };

  const handleSupplierAdded = (supplier: NewSupplier) => {
    setSupplierNames(prev => [...prev, { id: supplier.id, name: supplier.name }].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedSupplierId(supplier.id);
    fetchSupplierMappings(supplier.id);
    setNotification({ type: 'success', message: 'Fornecedor cadastrado com sucesso!' });
  };

  const handleSupplierMappingSearch = async () => {
    if (!supplierMappingSearchQuery) {
      setSupplierMappingSearchResults([]);
      return;
    }
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, ean, image')
      .or(`name.ilike.%${supplierMappingSearchQuery}%,sku.ilike.%${supplierMappingSearchQuery}%,ean.ilike.%${supplierMappingSearchQuery}%`)
      .limit(10);
    
    if (error) {
      console.error('Erro na busca de produtos para mapeamento:', error);
      return;
    }
    setSupplierMappingSearchResults(data || []);
  };

  const handleAddMapping = async () => {
    if (!selectedSupplierId || !supplierMappingDescription || !selectedSupplierMappingProduct) {
      setNotification({ type: 'error', message: 'Preencha todos os campos do mapeamento.' });
      return;
    }
    setIsAddingMapping(true);
    try {
      const { data, error } = await supabase
        .from('supplier_mappings')
        .insert([{
          supplier_id: selectedSupplierId,
          supplier_sku: supplierMappingCode.trim() || null,
          supplier_description: supplierMappingDescription.trim(),
          internal_product_id: selectedSupplierMappingProduct.id
        }]);

      if (error) throw error;

      setNotification({ type: 'success', message: 'Mapeamento adicionado com sucesso!' });
      setSupplierMappingDescription('');
      setSupplierMappingCode('');
      setSelectedSupplierMappingProduct(null);
      fetchSupplierMappings(selectedSupplierId);
    } catch (err) {
      setNotification({ type: 'error', message: 'Erro ao adicionar mapeamento.' });
    } finally {
      setIsAddingMapping(false);
    }
  };

  const handleImportDictionary = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSupplierId) return;
    
    setIsImporting(true);
    setNotification({ type: 'success', message: 'Processando planilha de dicionário...' });

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const range = XLSX.utils.decode_range(sheet['!ref'] || "A1");
        let headerRow = -1;
        
        // Scan first 20 rows for headers
        for (let R = range.s.r; R <= Math.min(range.e.r, 20); ++R) {
          const rowValues: string[] = [];
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cell = sheet[XLSX.utils.encode_cell({c: C, r: R})];
            if (cell && cell.v) rowValues.push(String(cell.v).toLowerCase());
          }
          const rowStr = rowValues.join(" ");
          if (rowStr.includes("desc") || rowStr.includes("ean sistema")) {
            headerRow = R;
            break;
          }
        }

        if (headerRow === -1) throw new Error('Não foi possível encontrar o cabeçalho da planilha.');

        const rawData = XLSX.utils.sheet_to_json(sheet, { range: headerRow });
        if (rawData.length === 0) throw new Error('A planilha está vazia.');

        const normalize = (s: string) => s ? String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").trim() : "";
        
        // Get all products to map EAN sistema to internal ID
        const { data: allProducts } = await supabase.from('products').select('id, ean, sku');
        
        let importedCount = 0;
        let skipCount = 0;

        for (const row of (rawData as any[])) {
          const keys = Object.keys(row);
          if (keys.length === 0) continue;

          // Supplier Code
          const supplierCodeKey = keys.find(k => {
            const nk = normalize(k);
            return nk === 'codigo' || nk === 'sku' || nk === 'ref' || nk === 'referencia';
          });
          const supplierCode = supplierCodeKey ? String(row[supplierCodeKey]).trim() : "";

          // Supplier Description
          const supplierDescKey = keys.find(k => {
            const nk = normalize(k);
            return nk.includes('desc') || nk.includes('prod') || nk.includes('nome');
          });
          const supplierDescription = supplierDescKey ? String(row[supplierDescKey]).trim() : "";

          // EAN Sistema: MUST BE THE LAST COLUMN (fallback) or by name
          const eanSistemaKey = keys.find(k => normalize(k) === 'eansistema') || keys[keys.length - 1]; 
          const eanSistema = eanSistemaKey ? String(row[eanSistemaKey]).trim() : "";

          if ((!supplierDescription && !supplierCode) || !eanSistema) {
            skipCount++;
            continue;
          }

          // Find internal product
          const product = allProducts?.find(p => {
             if (!p.ean && !p.sku) return false;
             const eans = p.ean ? p.ean.split(',').map((e: string) => e.trim()) : [];
             return eans.includes(eanSistema) || p.sku === eanSistema;
          });

          if (product) {
            // Check if mapping exists to update or insert
            let existingQuery = supabase.from('supplier_mappings').select('id').eq('supplier_id', selectedSupplierId);
            
            if (supplierCode) {
              existingQuery = existingQuery.eq('supplier_sku', supplierCode);
            } else {
              existingQuery = existingQuery.eq('supplier_description', supplierDescription);
            }

            const { data: existing } = await existingQuery.maybeSingle();

            if (existing) {
              const { error: updateError } = await supabase
                .from('supplier_mappings')
                .update({ 
                  internal_product_id: product.id,
                  supplier_description: supplierDescription || undefined,
                  supplier_sku: supplierCode || undefined
                })
                .eq('id', existing.id);
              if (!updateError) importedCount++;
              else skipCount++;
            } else {
              const { error: insertError } = await supabase
                .from('supplier_mappings')
                .insert([{
                  supplier_id: selectedSupplierId,
                  supplier_sku: supplierCode || null,
                  supplier_description: supplierDescription || "",
                  internal_product_id: product.id
                }]);
              if (!insertError) importedCount++;
              else skipCount++;
            }
          } else {
            skipCount++;
          }
        }

        setNotification({ 
          type: 'success', 
          message: `Importação concluída: ${importedCount} mapeamentos processados. ${skipCount > 0 ? `(${skipCount} ignorados/não encontrados)` : ''}` 
        });
        fetchSupplierMappings(selectedSupplierId);
      } catch (err: any) {
        console.error('Erro na importação do dicionário:', err);
        setNotification({ type: 'error', message: `Erro ao importar: ${err.message}` });
      } finally {
        setIsImporting(false);
        if (dictionaryFileInputRef.current) dictionaryFileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDeleteMapping = async (id: string) => {
    try {
      const { error } = await supabase.from('supplier_mappings').delete().eq('id', id);
      if (error) throw error;
      setSupplierMappings(prev => prev.filter(m => m.id !== id));
      setNotification({ type: 'success', message: 'Mapeamento removido.' });
    } catch (err) {
      setNotification({ type: 'error', message: 'Erro ao remover mapeamento.' });
    }
  };

  const handleUnitSearch = async (query: string, type: 'name' | 'ean' | 'sku' | 'brand') => {
    if (!query.trim()) {
      setUnitSearchResults([]);
      return;
    }
    const columnMap = { name: 'name', ean: 'ean', sku: 'sku', brand: 'brand' } as const;
    const col = columnMap[type];
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, ean, image')
      .ilike(col, `%${query}%`)
      .limit(10);
    if (!error) setUnitSearchResults(data || []);
  };

  const fetchUnitConversions = async () => {
    try {
      const { data, error } = await supabase
        .from('supplier_units')
        .select('*, products(name, sku, ean, image), suppliers(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUnitConversions(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar conversões:', err);
    }
  };

  const handleAddUnitConversion = async () => {
    if (!selectedUnitProduct || !unitName.trim() || !unitMultiplier) {
      setNotification({ type: 'error', message: 'Preencha todos os campos da unidade.' });
      return;
    }
    setIsAddingUnit(true);
    try {
      const { error } = await supabase
        .from('supplier_units')
        .insert([{
          product_id: selectedUnitProduct.id,
          supplier_id: selectedUnitSupplierId || null,
          unit_name: unitName.trim().toUpperCase(),
          multiplier: parseFloat(unitMultiplier)
        }]);
      if (error) throw error;

      setNotification({ type: 'success', message: 'Conversão de unidade salva!' });
      setUnitName('');
      setUnitMultiplier('1');
      setSelectedUnitProduct(null);
      setSelectedUnitSupplierId('');
      fetchUnitConversions();
    } catch (err: any) {
      setNotification({ type: 'error', message: `Erro ao salvar unidade: ${err.message}` });
    } finally {
      setIsAddingUnit(false);
    }
  };

  const handleStartEdit = (mapping: Mapping) => {
    setEditingMappingId(mapping.id);
    setEditSku(mapping.supplier_sku ?? '');
    setEditDescription(mapping.supplier_description);
    setEditProduct(mapping.products ? {
      id: mapping.internal_product_id,
      name: mapping.products.name,
      sku: mapping.products.sku,
      ean: mapping.products.ean,
      image: '',
    } : null);
    setEditProductSearch('');
    setEditProductResults([]);
  };

  const handleCancelEdit = () => {
    setEditingMappingId(null);
    setEditProductResults([]);
    setEditProductSearch('');
  };

  const handleEditProductSearch = async (q: string) => {
    setEditProductSearch(q);
    if (!q.trim()) { setEditProductResults([]); return; }
    const { data } = await supabase
      .from('products')
      .select('id, name, sku, ean, image')
      .or(`name.ilike.%${q}%,sku.ilike.%${q}%,ean.ilike.%${q}%`)
      .limit(8);
    setEditProductResults(data || []);
  };

  const handleSaveMapping = async (mappingId: string) => {
    if (!editDescription.trim() || !editProduct) {
      setNotification({ type: 'error', message: 'Descrição e produto interno são obrigatórios.' });
      return;
    }
    setIsSavingMapping(true);
    const { error } = await supabase
      .from('supplier_mappings')
      .update({
        supplier_sku: editSku.trim() || null,
        supplier_description: editDescription.trim(),
        internal_product_id: editProduct.id,
      })
      .eq('id', mappingId);
    setIsSavingMapping(false);
    if (error) {
      setNotification({ type: 'error', message: 'Erro ao salvar mapeamento.' });
      return;
    }
    setSupplierMappings(prev => prev.map(m =>
      m.id === mappingId
        ? { ...m, supplier_sku: editSku.trim() || undefined, supplier_description: editDescription.trim(), internal_product_id: editProduct.id, products: { name: editProduct.name, sku: editProduct.sku, ean: editProduct.ean } }
        : m
    ));
    setNotification({ type: 'success', message: 'Mapeamento atualizado!' });
    handleCancelEdit();
  };

  const handleDeleteUnit = async (id: string) => {
    try {
      const { error } = await supabase.from('supplier_units').delete().eq('id', id);
      if (error) throw error;
      setUnitConversions(prev => prev.filter(u => u.id !== id));
      setNotification({ type: 'success', message: 'Unidade removida.' });
    } catch (err) {
      setNotification({ type: 'error', message: 'Erro ao remover unidade.' });
    }
  };

  const resetAddForm = () => {
    setShowAddForm(false);
    setSupplierMappingDescription('');
    setSupplierMappingCode('');
    setSelectedSupplierMappingProduct(null);
    setSupplierMappingSearchResults([]);
    setSupplierMappingSearchQuery('');
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/45 md:bg-on-surface/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className={cn(
                "relative flex flex-col overflow-hidden shadow-2xl",
                "w-full h-[92dvh] rounded-t-[28px] bg-[#FDFAF0] dark:bg-[#1E1E18]",
                "md:w-[95vw] md:max-w-[1400px] md:h-auto md:max-h-[92vh] md:rounded-[2.5rem] md:bg-surface-container-lowest md:ring-1 md:ring-on-surface/5"
              )}
            >
              {/* ── Handle (mobile only) ── */}
              <div className="md:hidden w-9 h-1 bg-[#1A1A0E]/15 dark:bg-white/12 rounded-full mx-auto mt-3 shrink-0" />

              {/* ── Mobile header ── */}
              <div className="md:hidden px-5 pt-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#D81E1E] rounded-xl flex items-center justify-center shadow-lg shadow-[#D81E1E]/25 shrink-0">
                    <BookText size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[17px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] tracking-tight leading-tight">Dicionário de Fornecedores</h3>
                    <p className="text-[11px] font-bold text-[#1A1A0E]/40 dark:text-white/28 uppercase tracking-[0.08em]">Mapeamentos & Unidades</p>
                  </div>
                  <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#1A1A0E]/[0.07] dark:bg-white/[0.06] border border-[#1A1A0E]/[0.09] dark:border-white/[0.08] flex items-center justify-center shrink-0 transition-all active:scale-90">
                    <X size={18} className="text-[#1A1A0E]/45 dark:text-white/35" />
                  </button>
                </div>
                <div className="flex gap-1 mt-3">
                  <button onClick={() => setActiveTab('mappings')} className={cn("flex-1 py-[9px] rounded-full text-[10px] font-black uppercase tracking-[0.12em] transition-all border-none cursor-pointer", activeTab === 'mappings' ? "bg-[#D81E1E] text-white shadow-lg shadow-[#D81E1E]/25" : "text-[#1A1A0E]/35 dark:text-white/25 bg-transparent")}>Mapeamentos</button>
                  <button onClick={() => setActiveTab('units')} className={cn("flex-1 py-[9px] rounded-full text-[10px] font-black uppercase tracking-[0.12em] transition-all border-none cursor-pointer", activeTab === 'units' ? "bg-[#D81E1E] text-white shadow-lg shadow-[#D81E1E]/25" : "text-[#1A1A0E]/35 dark:text-white/25 bg-transparent")}>Unidades</button>
                </div>
              </div>

              {/* ── Desktop header ── */}
              <div className="hidden md:flex p-8 border-b border-on-surface/[0.03] items-center justify-between shrink-0 bg-surface-container-low/30">
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500 flex items-center justify-center text-white shadow-xl shadow-amber-500/20">
                    <BookText size={28} />
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-2xl font-black text-on-surface tracking-tight">Dicionário de Fornecedores</h3>
                    <div className="flex items-center gap-4 mt-2">
                      <button onClick={() => setActiveTab('mappings')} className={cn("text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all", activeTab === 'mappings' ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-on-surface/40 hover:bg-on-surface/5")}>Mapeamentos</button>
                      <button onClick={() => setActiveTab('units')} className={cn("text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all", activeTab === 'units' ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-on-surface/40 hover:bg-on-surface/5")}>Unidades de Medida</button>
                    </div>
                  </div>
                </div>
                <button onClick={onClose} className="p-3 hover:bg-on-surface/5 rounded-full transition-colors text-on-surface/20 hover:text-on-surface"><X size={24} /></button>
              </div>

              {/* ── Mobile divider ── */}
              <div className="md:hidden h-px bg-[#1A1A0E]/[0.06] dark:bg-white/[0.06] mt-3 shrink-0" />

              {/* ══════════════════════════════════════
                  MOBILE BODY (single column bottom sheet)
                  ══════════════════════════════════════ */}
              <div className="md:hidden flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
                {activeTab === 'mappings' ? (
                  <>
                    {/* Supplier selector */}
                    <div className="px-5 pt-4 shrink-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9.5px] font-black text-[#1A1A0E]/30 dark:text-white/25 uppercase tracking-[0.18em]">
                          {selectedSupplierId ? 'Fornecedor Selecionado' : 'Selecionar Fornecedor'}
                        </span>
                        <button onClick={() => setShowAddSupplierModal(true)} className="text-[9px] font-black text-[#D81E1E] uppercase tracking-[0.1em] flex items-center gap-1 bg-[#D81E1E]/[0.07] dark:bg-[#D81E1E]/10 px-2.5 py-1 rounded-full border-none cursor-pointer">
                          <Plus size={10} />Novo Fornecedor
                        </button>
                      </div>

                      <div className="relative" ref={supplierComboRef}>
                        {selectedSupplier ? (
                          <div className="w-full h-[52px] bg-[#D81E1E]/[0.06] dark:bg-[#D81E1E]/10 border border-[#D81E1E]/20 dark:border-[#D81E1E]/25 rounded-2xl flex items-center px-4 gap-2.5">
                            <CheckCircle2 size={18} className="text-[#D81E1E] shrink-0" />
                            <span className="flex-1 text-sm font-bold text-[#D81E1E] truncate">{selectedSupplier.name}</span>
                            <button onClick={() => { setSelectedSupplierId(''); setSupplierMappings([]); setMappingListSearch(''); setSupplierComboQuery(''); setShowAddForm(false); }} className="text-[#D81E1E]/40 hover:text-[#D81E1E] shrink-0 transition-colors"><X size={16} /></button>
                          </div>
                        ) : (
                          <div className="relative">
                            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1A1A0E]/20 dark:text-white/20 pointer-events-none" />
                            <input type="text" value={supplierComboQuery} onChange={(e) => { setSupplierComboQuery(e.target.value); setSupplierComboOpen(true); }} onFocus={() => setSupplierComboOpen(true)} placeholder="Buscar fornecedor..." className="w-full h-[52px] bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl pl-11 pr-10 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] placeholder:text-[#1A1A0E]/30 dark:placeholder:text-white/22 outline-none transition-all focus:border-[#D81E1E] focus:shadow-[0_0_0_3px_rgba(216,30,30,0.10)]" />
                            <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#1A1A0E]/20 dark:text-white/20 pointer-events-none" />
                          </div>
                        )}
                        {supplierComboOpen && !selectedSupplier && (
                          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-[#2E2E28] border border-[#E0D8BF] dark:border-white/[0.07] rounded-2xl shadow-xl overflow-hidden">
                            <div className="max-h-52 overflow-y-auto py-1">
                              {filteredSuppliers.length === 0
                                ? <p className="px-4 py-3 text-xs text-[#1A1A0E]/30 dark:text-white/25 font-medium">Nenhum fornecedor encontrado</p>
                                : filteredSuppliers.map(s => (
                                  <button key={s.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { setSelectedSupplierId(s.id); fetchSupplierMappings(s.id); setMappingListSearch(''); setSupplierComboOpen(false); setSupplierComboQuery(''); }} className="w-full text-left px-4 py-3 text-sm font-bold text-[#1A1A0E] dark:text-[#F2F0E3] hover:bg-[#D81E1E]/[0.05] hover:text-[#D81E1E] transition-colors">{s.name}</button>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {selectedSupplierId && (
                        <>
                          <input type="file" ref={dictionaryFileInputRef} onChange={handleImportDictionary} accept=".xlsx,.xls" className="hidden" />
                          <button onClick={() => dictionaryFileInputRef.current?.click()} disabled={isImporting} className="mt-2 w-full h-11 bg-[#1A1A0E]/[0.04] dark:bg-white/[0.03] border border-dashed border-[#1A1A0E]/15 dark:border-white/12 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#1A1A0E]/35 dark:text-white/25 transition-all hover:border-[#D81E1E] hover:text-[#D81E1E] dark:hover:text-[#D81E1E] disabled:opacity-50">
                            {isImporting ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-[#D81E1E] border-r-transparent" /> : <><FileUp size={14} />Importar Planilha</>}
                          </button>
                        </>
                      )}
                    </div>

                    {/* Dict list */}
                    <div className="px-5 pt-4 flex flex-col pb-28">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[9.5px] font-black text-[#1A1A0E]/30 dark:text-white/25 uppercase tracking-[0.18em]">Dicionário Ativo</span>
                        {selectedSupplierId && supplierMappings.length > 0 && (
                          <span className="bg-[#D81E1E] text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm shadow-[#D81E1E]/25">{supplierMappings.length}</span>
                        )}
                      </div>
                      {selectedSupplierId && supplierMappings.length > 0 && (
                        <div className="relative mb-3">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1A1A0E]/20 dark:text-white/18" />
                          <input type="text" value={mappingListSearch} onChange={(e) => setMappingListSearch(e.target.value)} placeholder="Pesquisar mapeamentos..." className="w-full h-10 bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl pl-9 pr-3 text-xs font-medium text-[#1A1A0E] dark:text-[#F2F0E3] placeholder:text-[#1A1A0E]/25 dark:placeholder:text-white/20 outline-none" />
                        </div>
                      )}

                      {!selectedSupplierId ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-14">
                          <Users size={52} className="text-[#1A1A0E]/10 dark:text-white/10" />
                          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#1A1A0E]/20 dark:text-white/18 text-center">Selecione um fornecedor<br/>para ver o dicionário</p>
                        </div>
                      ) : supplierMappings.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-14">
                          <BookText size={52} className="text-[#1A1A0E]/10 dark:text-white/10" />
                          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#1A1A0E]/20 dark:text-white/18 text-center">Dicionário vazio</p>
                        </div>
                      ) : (() => {
                        const filteredMappings = mappingListSearch.trim()
                          ? supplierMappings.filter(m =>
                              (m.supplier_description ?? '').toLowerCase().includes(mappingListSearch.toLowerCase()) ||
                              (m.supplier_sku ?? '').toLowerCase().includes(mappingListSearch.toLowerCase()) ||
                              (m.products?.name ?? '').toLowerCase().includes(mappingListSearch.toLowerCase()))
                          : supplierMappings;

                        return filteredMappings.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-10 gap-2">
                            <Search size={36} className="text-[#1A1A0E]/10 dark:text-white/10" />
                            <p className="text-xs font-black uppercase tracking-widest text-[#1A1A0E]/20 dark:text-white/18">Nenhum resultado</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {filteredMappings.map(mapping => {
                              const isEditing = editingMappingId === mapping.id;
                              return (
                                <div key={mapping.id} className={cn("rounded-2xl border p-3.5 transition-all", isEditing ? "border-[#D81E1E]/40 ring-2 ring-[#D81E1E]/10 bg-white dark:bg-[#252520]" : "border-[#E0D8BF] dark:border-white/[0.08] bg-white dark:bg-[#252520]")}>
                                  {isEditing ? (
                                    <div className="space-y-3">
                                      <p className="text-[10px] font-black text-[#D81E1E] uppercase tracking-[0.2em]">Editando mapeamento</p>
                                      <div className="flex gap-2">
                                        <input type="text" value={editSku} onChange={(e) => setEditSku(e.target.value)} placeholder="Código (opcional)" className="w-24 bg-[#FAF7EE] dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.05] rounded-xl px-3 py-2 text-xs font-bold text-[#1A1A0E] dark:text-[#F2F0E3] outline-none placeholder:text-[#1A1A0E]/20 dark:placeholder:text-white/20 focus:border-[#D81E1E]" />
                                        <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Descrição" className="flex-1 bg-[#FAF7EE] dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.05] rounded-xl px-3 py-2 text-xs font-bold text-[#1A1A0E] dark:text-[#F2F0E3] outline-none placeholder:text-[#1A1A0E]/20 dark:placeholder:text-white/20 focus:border-[#D81E1E]" />
                                      </div>
                                      {editProduct ? (
                                        <div className="flex items-center gap-2 p-2.5 bg-[#D81E1E]/[0.05] border border-[#D81E1E]/20 rounded-xl">
                                          <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black text-[#D81E1E]/50 uppercase tracking-widest mb-0.5">Produto interno</p>
                                            <p className="text-xs font-black text-[#D81E1E] truncate">{editProduct.name}</p>
                                          </div>
                                          <button onClick={() => { setEditProduct(null); setEditProductSearch(''); setEditProductResults([]); }} className="text-[#D81E1E]/30 hover:text-[#D81E1E] transition-colors"><X size={14} /></button>
                                        </div>
                                      ) : (
                                        <div className="space-y-1.5">
                                          <div className="relative">
                                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#1A1A0E]/20 dark:text-white/20" />
                                            <input type="text" value={editProductSearch} onChange={(e) => handleEditProductSearch(e.target.value)} placeholder="Buscar produto interno..." className="w-full bg-[#FAF7EE] dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.05] rounded-xl pl-7 pr-3 py-2 text-xs font-medium text-[#1A1A0E] dark:text-[#F2F0E3] outline-none placeholder:text-[#1A1A0E]/20 dark:placeholder:text-white/20 focus:border-[#D81E1E]" />
                                          </div>
                                          {editProductResults.length > 0 && (
                                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                              {editProductResults.map(p => (
                                                <button key={p.id} onClick={() => { setEditProduct(p); setEditProductSearch(''); setEditProductResults([]); }} className="w-full flex items-center gap-2.5 p-2 rounded-xl border border-[#E0D8BF] dark:border-white/[0.05] hover:border-[#D81E1E]/30 hover:bg-[#D81E1E]/[0.05] transition-all text-left bg-white dark:bg-[#252520]">
                                                  <div className="w-7 h-7 bg-[#FAF7EE] dark:bg-[#1E1E18] rounded-lg overflow-hidden shrink-0"><ProductImage src={p.image} alt={p.name} /></div>
                                                  <p className="text-xs font-black text-[#1A1A0E] dark:text-[#F2F0E3] truncate">{p.name}</p>
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      <div className="flex gap-2 pt-1">
                                        <button onClick={() => handleSaveMapping(mapping.id)} disabled={isSavingMapping} className="flex-1 bg-[#D81E1E] text-white font-black text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-[#D81E1E]/20">
                                          {isSavingMapping ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" /> : <><Save size={13} />Salvar</>}
                                        </button>
                                        <button onClick={handleCancelEdit} className="px-3 py-2.5 rounded-xl text-xs font-black text-[#1A1A0E]/40 dark:text-white/35 hover:bg-[#1A1A0E]/[0.05] dark:hover:bg-white/[0.05] transition-all">Cancelar</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex items-start gap-2 mb-2.5">
                                        {mapping.supplier_sku && <span className="text-[10px] font-black bg-[#1A1A0E]/[0.06] dark:bg-white/[0.07] text-[#1A1A0E]/50 dark:text-white/40 px-2 py-0.5 rounded-md uppercase shrink-0">{mapping.supplier_sku}</span>}
                                        <p className="text-[13px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">{mapping.supplier_description}</p>
                                      </div>
                                      <div className="h-px bg-[#1A1A0E]/[0.06] dark:bg-white/[0.06] mb-2.5" />
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 bg-[#D81E1E]/[0.07] dark:bg-[#D81E1E]/12 rounded-lg flex items-center justify-center shrink-0">
                                          <ArrowRight size={14} className="text-[#D81E1E]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[9px] font-black text-[#D81E1E]/60 uppercase tracking-[0.15em] mb-0.5">Produto Interno</p>
                                          <p className="text-[12px] font-bold text-[#1A1A0E]/65 dark:text-white/55 truncate">{mapping.products?.name || '—'}</p>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                          <button onClick={() => handleStartEdit(mapping)} className="w-7 h-7 rounded-lg bg-[#D81E1E]/[0.08] dark:bg-[#D81E1E]/12 text-[#D81E1E] flex items-center justify-center hover:bg-[#D81E1E] hover:text-white transition-all"><Pencil size={13} /></button>
                                          <button onClick={() => handleDeleteMapping(mapping.id)} className="w-7 h-7 rounded-lg bg-[#1A1A0E]/[0.05] dark:bg-white/[0.05] text-[#1A1A0E]/35 dark:text-white/25 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"><Trash2 size={13} /></button>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </>
                ) : (
                  /* ── Mobile Units Tab ── */
                  <div className="px-5 pt-4 flex flex-col gap-5 pb-10">
                    <div className="space-y-2">
                      <label className="text-[9.5px] font-black text-[#1A1A0E]/30 dark:text-white/25 uppercase tracking-[0.18em]">1. Produto</label>
                      {!selectedUnitProduct ? (
                        <div className="space-y-2">
                          <div className="flex gap-1 bg-[#FAF7EE] dark:bg-[#252520] rounded-2xl p-1.5">
                            {([{ key: 'name', label: 'Desc.' }, { key: 'ean', label: 'EAN' }, { key: 'sku', label: 'SKU' }, { key: 'brand', label: 'Marca' }] as const).map(opt => (
                              <button key={opt.key} onClick={() => { setUnitSearchType(opt.key); if (unitSearchQuery.trim()) handleUnitSearch(unitSearchQuery, opt.key); }} className={cn("flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border-none cursor-pointer", unitSearchType === opt.key ? "bg-white dark:bg-[#1E1E18] text-[#D81E1E] shadow-sm" : "text-[#1A1A0E]/30 dark:text-white/25 bg-transparent")}>{opt.label}</button>
                            ))}
                          </div>
                          <div className="relative">
                            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1A1A0E]/20 dark:text-white/20" />
                            <input type="text" value={unitSearchQuery} onChange={(e) => { setUnitSearchQuery(e.target.value); handleUnitSearch(e.target.value, unitSearchType); }} placeholder="Buscar produto..." className="w-full h-[52px] bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl pl-11 pr-4 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] placeholder:text-[#1A1A0E]/25 dark:placeholder:text-white/22 outline-none transition-all focus:border-[#D81E1E]" />
                          </div>
                          <div className="space-y-2 max-h-44 overflow-y-auto">
                            {unitSearchResults.map(p => (
                              <button key={p.id} onClick={() => { setSelectedUnitProduct(p); setUnitSearchResults([]); setUnitSearchQuery(''); }} className="w-full flex items-center gap-3 p-3 rounded-2xl border border-[#E0D8BF] dark:border-white/[0.08] hover:border-[#D81E1E]/30 hover:bg-[#D81E1E]/[0.03] transition-all text-left bg-white dark:bg-[#252520]">
                                <div className="w-10 h-10 bg-[#FAF7EE] dark:bg-[#1E1E18] rounded-xl overflow-hidden shrink-0"><ProductImage src={p.image} alt={p.name} /></div>
                                <p className="text-sm font-black text-[#1A1A0E] dark:text-[#F2F0E3] truncate">{p.name}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 p-3.5 bg-[#D81E1E]/[0.05] dark:bg-[#D81E1E]/08 border border-[#D81E1E]/20 rounded-2xl">
                          <div className="w-11 h-11 bg-white dark:bg-[#1E1E18] rounded-xl overflow-hidden border border-[#D81E1E]/10 shrink-0"><ProductImage src={selectedUnitProduct.image} alt={selectedUnitProduct.name} /></div>
                          <p className="text-sm font-black text-[#D81E1E] flex-1 truncate">{selectedUnitProduct.name}</p>
                          <button onClick={() => { setSelectedUnitProduct(null); setUnitSearchQuery(''); setUnitSearchResults([]); }} className="text-[#D81E1E]/40 hover:text-[#D81E1E] shrink-0 transition-colors"><X size={16} /></button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9.5px] font-black text-[#1A1A0E]/30 dark:text-white/25 uppercase tracking-[0.18em]">2. Fornecedor</label>
                      <div className="relative">
                        <select value={selectedUnitSupplierId} onChange={(e) => setSelectedUnitSupplierId(e.target.value)} className="w-full h-[52px] bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl px-4 text-sm font-bold text-[#1A1A0E] dark:text-[#F2F0E3] outline-none appearance-none transition-all focus:border-[#D81E1E]">
                          <option value="">Todos os fornecedores</option>
                          {supplierNames.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#1A1A0E]/20 dark:text-white/20 pointer-events-none" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-[9.5px] font-black text-[#1A1A0E]/30 dark:text-white/25 uppercase tracking-[0.18em]">3. Unidade (ex: CX)</label>
                        <input type="text" value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="CX, PT, FD..." className="w-full h-[52px] bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl px-4 text-sm font-black text-[#1A1A0E] dark:text-[#F2F0E3] outline-none focus:border-[#D81E1E]" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9.5px] font-black text-[#1A1A0E]/30 dark:text-white/25 uppercase tracking-[0.18em]">4. Qtd Real</label>
                        <input type="number" value={unitMultiplier} onChange={(e) => setUnitMultiplier(e.target.value)} placeholder="12" className="w-full h-[52px] bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl px-4 text-sm font-black text-[#D81E1E] outline-none focus:border-[#D81E1E]" />
                      </div>
                    </div>

                    <button disabled={!selectedUnitProduct || !unitName.trim() || isAddingUnit} onClick={handleAddUnitConversion} className="w-full h-[54px] bg-[#D81E1E] text-white font-black rounded-2xl flex items-center justify-center gap-2.5 text-[13px] uppercase tracking-[0.18em] shadow-xl shadow-[#D81E1E]/25 disabled:opacity-30 transition-all active:scale-[0.97]">
                      {isAddingUnit ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" /> : <><Plus size={18} />Salvar Conversão</>}
                    </button>

                    {/* Unit conversions list */}
                    {unitConversions.length > 0 && (
                      <div className="pt-2">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[9.5px] font-black text-[#1A1A0E]/30 dark:text-white/25 uppercase tracking-[0.18em]">Conversões Cadastradas</span>
                          <span className="bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{unitConversions.length}</span>
                        </div>
                        <div className="space-y-2">
                          {unitConversions.map(u => (
                            <div key={u.id} className="flex items-center gap-3 p-3 bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl">
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-bold text-[#1A1A0E] dark:text-[#F2F0E3] truncate">{u.products?.name ?? '—'}</p>
                                <p className="text-[10px] text-[#1A1A0E]/40 dark:text-white/30 truncate">{u.suppliers?.name ?? <span className="italic">Todos</span>}</p>
                              </div>
                              <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-lg text-[11px] font-black shrink-0">{u.unit_name}</span>
                              <span className="font-black text-[#D81E1E] text-sm shrink-0">{u.multiplier}</span>
                              <button onClick={() => handleDeleteUnit(u.id)} className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shrink-0"><Trash2 size={13} /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Mobile FAB — add mapping */}
                {selectedSupplierId && activeTab === 'mappings' && !showAddForm && (
                  <button onClick={() => setShowAddForm(true)} className="fixed bottom-7 right-5 z-20 w-14 h-14 bg-[#D81E1E] rounded-[18px] shadow-2xl shadow-[#D81E1E]/35 flex items-center justify-center transition-all active:scale-90 md:hidden">
                    <Plus size={24} className="text-white" />
                  </button>
                )}

                {/* Mobile Add Mapping Overlay */}
                <AnimatePresence>
                  {showAddForm && (
                    <motion.div
                      initial={{ y: '100%' }}
                      animate={{ y: 0 }}
                      exit={{ y: '100%' }}
                      transition={{ type: 'spring', damping: 30, stiffness: 350 }}
                      className="fixed bottom-0 left-0 right-0 bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-t-[24px] flex flex-col border-t border-[#1A1A0E]/[0.06] dark:border-white/[0.06] shadow-[0_-12px_40px_rgba(0,0,0,0.12)] z-30 max-h-[88dvh] md:hidden"
                    >
                      <div className="w-9 h-1 bg-[#1A1A0E]/15 dark:bg-white/12 rounded-full mx-auto mt-3 shrink-0" />
                      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#1A1A0E]/[0.06] dark:border-white/[0.06] shrink-0">
                        <button onClick={resetAddForm} className="w-9 h-9 bg-[#1A1A0E]/[0.06] dark:bg-white/[0.06] rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-90">
                          <X size={18} className="text-[#1A1A0E]/50 dark:text-white/40" />
                        </button>
                        <div className="flex-1">
                          <p className="text-base font-black text-[#1A1A0E] dark:text-[#F2F0E3]">Novo Mapeamento</p>
                          <p className="text-[10px] font-bold text-[#1A1A0E]/35 dark:text-white/28 uppercase tracking-[0.1em]">{selectedSupplier?.name}</p>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
                        <div className="grid grid-cols-[1fr_1.8fr] gap-2.5">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9.5px] font-black text-[#1A1A0E]/30 dark:text-white/25 uppercase tracking-[0.18em]">Código</span>
                              {isDupCode && <span className="text-[8px] font-black bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded-full uppercase ml-auto">Existe</span>}
                            </div>
                            <input type="text" value={supplierMappingCode} onChange={(e) => setSupplierMappingCode(e.target.value)} placeholder="Ref/SKU" className={cn("h-[52px] bg-white dark:bg-[#252520] border rounded-2xl px-4 text-sm font-semibold text-[#1A1A0E] dark:text-[#F2F0E3] placeholder:text-[#1A1A0E]/22 dark:placeholder:text-white/22 outline-none focus:border-[#D81E1E] focus:shadow-[0_0_0_3px_rgba(216,30,30,0.10)] transition-all", isDupCode ? "border-amber-500/30" : "border-[#E0D8BF] dark:border-white/[0.08]")} />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9.5px] font-black text-[#1A1A0E]/30 dark:text-white/25 uppercase tracking-[0.18em]">Descrição <span className="text-[#D81E1E]">*</span></span>
                              {isDupDescription && <span className="text-[8px] font-black bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded-full uppercase ml-auto">Existe</span>}
                            </div>
                            <input type="text" value={supplierMappingDescription} onChange={(e) => setSupplierMappingDescription(e.target.value)} placeholder="CHOCOLATE LACTA..." className={cn("h-[52px] bg-white dark:bg-[#252520] border rounded-2xl px-4 text-sm font-semibold text-[#1A1A0E] dark:text-[#F2F0E3] placeholder:text-[#1A1A0E]/22 dark:placeholder:text-white/22 outline-none focus:border-[#D81E1E] focus:shadow-[0_0_0_3px_rgba(216,30,30,0.10)] transition-all", isDupDescription ? "border-amber-500/30" : "border-[#E0D8BF] dark:border-white/[0.08]")} />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <span className="text-[9.5px] font-black text-[#1A1A0E]/30 dark:text-white/25 uppercase tracking-[0.18em]">Produto Interno</span>
                          {!selectedSupplierMappingProduct ? (
                            <div className="space-y-2">
                              <div className="relative">
                                <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1A1A0E]/20 dark:text-white/20" />
                                <input type="text" value={supplierMappingSearchQuery} onChange={(e) => setSupplierMappingSearchQuery(e.target.value)} onKeyUp={(e) => e.key === 'Enter' && handleSupplierMappingSearch()} placeholder="Nome, EAN ou SKU..." className="w-full h-[52px] bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl pl-12 pr-14 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] placeholder:text-[#1A1A0E]/25 dark:placeholder:text-white/22 outline-none focus:border-[#D81E1E] transition-all" />
                                <button onClick={handleSupplierMappingSearch} className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 bg-[#1A1A0E]/[0.05] dark:bg-white/[0.06] rounded-xl flex items-center justify-center transition-all hover:bg-[#1A1A0E]/10"><Search size={16} className="text-[#1A1A0E]/40 dark:text-white/30" /></button>
                              </div>
                              <div className="space-y-2 max-h-44 overflow-y-auto">
                                {supplierMappingSearchResults.map(p => (
                                  <button key={p.id} onClick={() => { setSelectedSupplierMappingProduct(p); setSupplierMappingSearchResults([]); setSupplierMappingSearchQuery(''); }} className="w-full flex items-center gap-3 p-3 rounded-2xl border border-[#E0D8BF] dark:border-white/[0.08] hover:border-[#D81E1E]/30 hover:bg-[#D81E1E]/[0.03] transition-all text-left bg-white dark:bg-[#252520]">
                                    <div className="w-11 h-11 bg-[#FAF7EE] dark:bg-[#1E1E18] rounded-xl overflow-hidden shrink-0"><ProductImage src={p.image} alt={p.name} /></div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[13px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] truncate">{p.name}</p>
                                      <p className="text-[10px] font-bold text-[#1A1A0E]/30 dark:text-white/25 uppercase">EAN: {p.ean}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 p-4 bg-[#D81E1E]/[0.05] dark:bg-[#D81E1E]/08 border border-[#D81E1E]/20 rounded-2xl">
                              <div className="w-12 h-12 bg-white dark:bg-[#1E1E18] rounded-xl overflow-hidden border border-[#D81E1E]/10 shrink-0"><ProductImage src={selectedSupplierMappingProduct.image} alt={selectedSupplierMappingProduct.name} /></div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-black text-[#D81E1E] leading-tight truncate">{selectedSupplierMappingProduct.name}</p>
                                <p className="text-[10px] font-black text-[#D81E1E]/40 uppercase tracking-[0.15em] mt-0.5">EAN: {selectedSupplierMappingProduct.ean || selectedSupplierMappingProduct.sku}</p>
                              </div>
                              <button onClick={() => setSelectedSupplierMappingProduct(null)} className="text-[#D81E1E]/40 hover:text-[#D81E1E] shrink-0 transition-colors"><X size={16} /></button>
                            </div>
                          )}
                        </div>

                        <button disabled={!selectedSupplierMappingProduct || !supplierMappingDescription || isAddingMapping} onClick={async () => { await handleAddMapping(); setShowAddForm(false); }} className="w-full h-[54px] bg-[#D81E1E] text-white font-black rounded-2xl flex items-center justify-center gap-2.5 text-[13px] uppercase tracking-[0.18em] shadow-xl shadow-[#D81E1E]/25 disabled:opacity-30 transition-all active:scale-[0.97]">
                          {isAddingMapping ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" /> : <><CheckCircle2 size={18} />Salvar Mapeamento</>}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ══════════════════════════════════════
                  DESKTOP BODY (two panels)
                  ══════════════════════════════════════ */}
              <div className="hidden md:flex flex-1 overflow-hidden flex-row divide-x divide-on-surface/[0.03]">
                {/* Form Panel */}
                <div className="w-1/2 p-10 flex flex-col space-y-6 overflow-y-auto">
                  {activeTab === 'mappings' ? (
                    <>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.2em]">Selecionar Fornecedor</label>
                          <button
                            onClick={() => setShowAddSupplierModal(true)}
                            className="text-[10px] font-black text-primary flex items-center gap-2 hover:bg-primary/5 px-3 py-1.5 rounded-full transition-all"
                          >
                            <Plus size={14} />
                            + Novo Fornecedor
                          </button>
                        </div>

                        {/* Combobox pesquisável */}
                        <div className="relative" ref={supplierComboRef}>
                          {selectedSupplier ? (
                            /* Selected state — pill with X */
                            <div className="flex items-center gap-3 w-full bg-primary/10 border border-primary/20 rounded-2xl px-5 py-4 text-sm font-bold text-primary">
                              <CheckCircle2 size={16} className="shrink-0 text-primary" />
                              <span className="flex-1 truncate">{selectedSupplier.name}</span>
                              <button
                                onClick={() => {
                                  setSelectedSupplierId('');
                                  setSupplierMappings([]);
                                  setMappingListSearch('');
                                  setSupplierComboQuery('');
                                }}
                                className="shrink-0 text-primary/50 hover:text-primary transition-colors"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            /* Search input */
                            <div className="relative">
                              <input
                                type="text"
                                value={supplierComboQuery}
                                onChange={(e) => {
                                  setSupplierComboQuery(e.target.value);
                                  setSupplierComboOpen(true);
                                }}
                                onFocus={() => setSupplierComboOpen(true)}
                                placeholder="Buscar fornecedor..."
                                className="w-full bg-surface-container-low border border-on-surface/[0.03] rounded-2xl px-5 py-4 pr-12 text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 font-medium placeholder:text-on-surface/20 transition-all shadow-sm"
                              />
                              <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface/20 pointer-events-none" />
                            </div>
                          )}

                          {/* Dropdown */}
                          {supplierComboOpen && !selectedSupplier && (
                            <div className="absolute z-50 w-full mt-1 bg-surface-container-lowest border border-on-surface/[0.07] rounded-2xl shadow-xl overflow-hidden">
                              <div className="max-h-52 overflow-y-auto custom-scrollbar py-1">
                                {filteredSuppliers.length === 0 ? (
                                  <p className="px-5 py-3 text-xs text-on-surface/30 font-medium">Nenhum fornecedor encontrado</p>
                                ) : filteredSuppliers.map(s => (
                                  <button
                                    key={s.id}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      setSelectedSupplierId(s.id);
                                      fetchSupplierMappings(s.id);
                                      setMappingListSearch('');
                                      setSupplierComboOpen(false);
                                      setSupplierComboQuery('');
                                    }}
                                    className="w-full text-left px-5 py-3 text-sm font-bold text-on-surface hover:bg-primary/5 hover:text-primary transition-colors"
                                  >
                                    {s.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {selectedSupplierId && (
                          <div className="flex gap-4">
                            <input
                              type="file"
                              ref={dictionaryFileInputRef}
                              onChange={handleImportDictionary}
                              accept=".xlsx,.xls"
                              className="hidden"
                            />
                            <button
                              onClick={() => dictionaryFileInputRef.current?.click()}
                              disabled={isImporting}
                              className="flex-1 bg-surface-container-low border border-on-surface/[0.03] px-6 py-4 rounded-2xl font-black text-[11px] text-on-surface/60 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-3 shadow-sm uppercase tracking-widest active:scale-95 disabled:opacity-50"
                            >
                              {isImporting ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-primary border-r-transparent" />
                              ) : (
                                <>
                                  <FileUp size={16} />
                                  Importar Planilha
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      {selectedSupplierId && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-8 pt-8 border-t border-on-surface/[0.03]"
                        >
                          {/* Single "FORNECEDOR" header above both fields */}
                          <div className="space-y-3">
                            <label className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.2em]">Fornecedor</label>
                            <div className="flex gap-4 items-start">
                              {/* Código */}
                              <div className="flex-1 space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.15em]">Código</span>
                                  <span className="text-[10px] text-on-surface/20 font-medium">(opcional)</span>
                                  {isDupCode && (
                                    <span className="ml-auto text-[9px] font-black bg-amber-500/15 text-amber-500 px-2 py-0.5 rounded-full uppercase tracking-wide">Já cadastrado</span>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  value={supplierMappingCode}
                                  onChange={(e) => setSupplierMappingCode(e.target.value)}
                                  placeholder="Ref/SKU"
                                  className={cn(
                                    "w-full bg-surface-container-low border rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 font-medium placeholder:text-on-surface/20 transition-all shadow-sm",
                                    isDupCode ? "border-amber-500/30" : "border-on-surface/[0.03]"
                                  )}
                                />
                              </div>
                              {/* Descrição */}
                              <div className="flex-[2] space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.15em]">Descrição</span>
                                  <span className="text-primary/60 text-[11px] font-black">*</span>
                                  {isDupDescription && (
                                    <span className="ml-auto text-[9px] font-black bg-amber-500/15 text-amber-500 px-2 py-0.5 rounded-full uppercase tracking-wide">Já cadastrado</span>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  value={supplierMappingDescription}
                                  onChange={(e) => setSupplierMappingDescription(e.target.value)}
                                  placeholder="Ex: CHOCOLATE LACTA 1KG..."
                                  className={cn(
                                    "w-full bg-surface-container-low border rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 font-medium placeholder:text-on-surface/20 transition-all shadow-sm",
                                    isDupDescription ? "border-amber-500/30" : "border-on-surface/[0.03]"
                                  )}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <label className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.2em]">Produto Interno</label>
                            {!selectedSupplierMappingProduct ? (
                              <div className="space-y-4">
                                <div className="relative group">
                                  <input 
                                    type="text" 
                                    value={supplierMappingSearchQuery}
                                    onChange={(e) => setSupplierMappingSearchQuery(e.target.value)}
                                    onKeyUp={(e) => e.key === 'Enter' && handleSupplierMappingSearch()}
                                    placeholder="Nome, EAN ou SKU..."
                                    className="w-full bg-surface-container-low border border-on-surface/[0.03] rounded-2xl pl-14 pr-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 font-medium transition-all shadow-sm"
                                  />
                                  <Search size={22} className="absolute left-5 top-1/2 -translate-y-1/2 text-on-surface/20 group-focus-within:text-primary transition-colors" />
                                  <button 
                                    onClick={handleSupplierMappingSearch}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-on-surface/5 hover:bg-on-surface/10 p-2.5 rounded-xl transition-all"
                                  >
                                    <Search size={18} className="text-on-surface/60" />
                                  </button>
                                </div>

                                <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                  {supplierMappingSearchResults.map(p => (
                                    <button 
                                      key={p.id}
                                      onClick={() => {
                                        setSelectedSupplierMappingProduct(p);
                                        setSupplierMappingSearchResults([]);
                                        setSupplierMappingSearchQuery('');
                                      }}
                                      className="w-full flex items-center gap-4 p-4 rounded-2xl border border-on-surface/[0.03] hover:border-primary/20 hover:bg-primary/5 transition-all text-left group bg-surface-container-lowest shadow-sm"
                                    >
                                      <div className="w-12 h-12 bg-surface-container-low rounded-xl overflow-hidden border border-on-surface/[0.02]">
                                        <ProductImage src={p.image} alt={p.name} />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-on-surface truncate group-hover:text-primary transition-colors">{p.name}</p>
                                        <p className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest">EAN: {p.ean}</p>
                                      </div>
                                      <Plus size={16} className="text-on-surface/10 group-hover:text-primary transition-colors" />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-6 p-6 bg-primary/5 border border-primary/20 rounded-[2rem] relative group shadow-lg shadow-primary/5">
                                <div className="w-16 h-16 bg-background rounded-2xl overflow-hidden border border-primary/10 shadow-inner">
                                  <ProductImage src={selectedSupplierMappingProduct.image} alt={selectedSupplierMappingProduct.name} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-lg font-black text-primary leading-tight mb-1">{selectedSupplierMappingProduct.name}</p>
                                  <p className="text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">EAN/SKU: {selectedSupplierMappingProduct.ean || selectedSupplierMappingProduct.sku}</p>
                                </div>
                                <button 
                                  onClick={() => setSelectedSupplierMappingProduct(null)}
                                  className="absolute -top-3 -right-3 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-xl hover:scale-110 active:scale-90"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            )}
                          </div>

                          <button 
                            disabled={!selectedSupplierMappingProduct || !supplierMappingDescription || isAddingMapping}
                            onClick={handleAddMapping}
                            className="w-full bg-primary text-white font-black py-5 rounded-[1.5rem] hover:bg-on-surface transition-all flex items-center justify-center gap-3 shadow-xl shadow-primary/20 disabled:opacity-30 disabled:grayscale uppercase tracking-[0.2em] text-sm"
                          >
                            {isAddingMapping ? (
                              <div className="h-6 w-6 animate-spin rounded-full border-4 border-solid border-white border-r-transparent" />
                            ) : (
                              <>
                                <CheckCircle2 size={24} />
                                Salvar Mapeamento
                              </>
                            )}
                          </button>
                        </motion.div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-8">
                       <div className="space-y-3">
                          <label className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.2em]">1. Produto</label>
                          {!selectedUnitProduct ? (
                             <div className="space-y-3">
                                {/* Search type selector */}
                                <div className="flex gap-1.5 bg-surface-container-low rounded-2xl p-1.5">
                                  {([
                                    { key: 'name',  label: 'Descrição' },
                                    { key: 'ean',   label: 'EAN' },
                                    { key: 'sku',   label: 'SKU' },
                                    { key: 'brand', label: 'Marca' },
                                  ] as const).map(opt => (
                                    <button
                                      key={opt.key}
                                      onClick={() => {
                                        setUnitSearchType(opt.key);
                                        if (unitSearchQuery.trim()) handleUnitSearch(unitSearchQuery, opt.key);
                                      }}
                                      className={cn(
                                        "flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                                        unitSearchType === opt.key
                                          ? "bg-surface-container-lowest text-primary shadow-sm"
                                          : "text-on-surface/30 hover:text-on-surface/60"
                                      )}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                                {/* Search input */}
                                <div className="relative group">
                                  <input
                                    type="text"
                                    value={unitSearchQuery}
                                    onChange={(e) => {
                                      setUnitSearchQuery(e.target.value);
                                      handleUnitSearch(e.target.value, unitSearchType);
                                    }}
                                    placeholder={
                                      unitSearchType === 'name'  ? 'Nome do produto...' :
                                      unitSearchType === 'ean'   ? 'Código EAN...' :
                                      unitSearchType === 'sku'   ? 'Código SKU...' :
                                                                   'Marca do produto...'
                                    }
                                    className="w-full bg-surface-container-low border border-on-surface/[0.03] rounded-2xl pl-14 pr-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 font-medium transition-all shadow-sm"
                                  />
                                  <Search size={22} className="absolute left-5 top-1/2 -translate-y-1/2 text-on-surface/20 group-focus-within:text-primary transition-colors" />
                                </div>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                  {unitSearchResults.map(p => (
                                    <button
                                      key={p.id}
                                      onClick={() => {
                                        setSelectedUnitProduct(p);
                                        setUnitSearchResults([]);
                                        setUnitSearchQuery('');
                                      }}
                                      className="w-full flex items-center gap-4 p-4 rounded-2xl border border-on-surface/[0.03] hover:border-primary/20 hover:bg-primary/5 transition-all text-left bg-surface-container-lowest shadow-sm"
                                    >
                                      <div className="w-10 h-10 bg-surface-container-low rounded-xl overflow-hidden shrink-0">
                                        <ProductImage src={p.image} alt={p.name} />
                                      </div>
                                      <p className="text-sm font-black text-on-surface truncate">{p.name}</p>
                                    </button>
                                  ))}
                                </div>
                             </div>
                          ) : (
                            <div className="flex items-center gap-4 p-4 bg-primary/5 border border-primary/20 rounded-2xl relative group">
                                <div className="w-12 h-12 bg-background rounded-xl overflow-hidden border border-primary/10 shrink-0">
                                  <ProductImage src={selectedUnitProduct.image} alt={selectedUnitProduct.name} />
                                </div>
                                <p className="text-sm font-black text-primary flex-1 truncate">{selectedUnitProduct.name}</p>
                                <button onClick={() => { setSelectedUnitProduct(null); setUnitSearchQuery(''); setUnitSearchResults([]); }} className="text-primary/40 hover:text-primary shrink-0"><X size={16} /></button>
                            </div>
                          )}
                       </div>

                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.2em]">2. Fornecedor</label>
                          <div className="relative group">
                            <select
                              value={selectedUnitSupplierId}
                              onChange={(e) => setSelectedUnitSupplierId(e.target.value)}
                              className="w-full bg-surface-container-low border border-on-surface/[0.03] rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 appearance-none font-bold text-on-surface transition-all shadow-sm"
                            >
                              <option value="">Todos os fornecedores</option>
                              {supplierNames.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                            <ChevronDown size={20} className="absolute right-5 top-1/2 -translate-y-1/2 text-on-surface/20 pointer-events-none group-focus-within:text-primary transition-colors" />
                          </div>
                       </div>

                       <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.2em]">3. Unidade (Ex: CX)</label>
                             <input
                               type="text"
                               value={unitName}
                               onChange={(e) => setUnitName(e.target.value)}
                               placeholder="CX, PT, FD..."
                               className="w-full bg-surface-container-low border border-on-surface/[0.03] rounded-2xl px-5 py-4 text-sm font-black"
                             />
                          </div>
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.2em]">4. Qtd Real</label>
                             <input
                               type="number"
                               value={unitMultiplier}
                               onChange={(e) => setUnitMultiplier(e.target.value)}
                               placeholder="Ex: 12"
                               className="w-full bg-surface-container-low border border-on-surface/[0.03] rounded-2xl px-5 py-4 text-sm font-black text-primary"
                             />
                          </div>
                       </div>

                       <button
                        disabled={!selectedUnitProduct || !unitName.trim() || isAddingUnit}
                        onClick={handleAddUnitConversion}
                        className="w-full bg-primary text-white font-black py-5 rounded-[1.5rem] hover:bg-on-surface transition-all flex items-center justify-center gap-3 shadow-xl shadow-primary/20 disabled:opacity-30 uppercase tracking-[0.2em] text-sm"
                      >
                        {isAddingUnit ? (
                          <div className="h-6 w-6 animate-spin rounded-full border-4 border-solid border-white border-r-transparent" />
                        ) : (
                          <>
                            <Plus size={24} />
                            Salvar Conversão
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* List Panel */}
                <div className="w-1/2 bg-surface-container-low/30 flex flex-col overflow-hidden">
                  <div className="p-10 border-b border-on-surface/[0.03] bg-surface-container-lowest shrink-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.3em] flex items-center gap-4">
                         {activeTab === 'mappings' ? 'Dicionário Ativo' : 'Tabela de Conversão'}
                         {activeTab === 'mappings' ? (
                           selectedSupplierId && supplierMappings.length > 0 && (
                            <span className="bg-primary text-white px-3 py-1 rounded-full text-[10px] font-black shadow-md shadow-primary/20">{supplierMappings.length}</span>
                           )
                         ) : (
                           unitConversions.length > 0 && (
                            <span className="bg-amber-500 text-white px-3 py-1 rounded-full text-[10px] font-black shadow-md shadow-amber-500/20">{unitConversions.length}</span>
                           )
                         )}
                      </h4>
                    </div>
                    {activeTab === 'mappings' && selectedSupplierId && supplierMappings.length > 0 && (
                      <div className="relative mt-4">
                        <input
                          type="text"
                          value={mappingListSearch}
                          onChange={(e) => setMappingListSearch(e.target.value)}
                          placeholder="Pesquisar mapeamentos..."
                          className="w-full bg-surface-container-low border border-on-surface/[0.03] rounded-2xl pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/10 font-medium placeholder:text-on-surface/20 transition-all"
                        />
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface/20" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar">
                    {activeTab === 'mappings' ? (
                      !selectedSupplierId ? (
                        <div className="h-full flex flex-col items-center justify-center text-on-surface/10">
                          <Users size={64} className="mb-6 opacity-20" />
                          <p className="text-sm font-black uppercase tracking-widest text-on-surface/20">Selecione um fornecedor para ver o dicionário</p>
                        </div>
                      ) : supplierMappings.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-on-surface/10">
                          <BookText size={64} className="mb-6 opacity-20" />
                          <p className="text-sm font-black uppercase tracking-widest text-on-surface/20">Dicionário vazio</p>
                        </div>
                      ) : (() => {
                        const filteredMappings = mappingListSearch.trim()
                          ? supplierMappings.filter(m =>
                              (m.supplier_description ?? '').toLowerCase().includes(mappingListSearch.toLowerCase()) ||
                              (m.supplier_sku ?? '').toLowerCase().includes(mappingListSearch.toLowerCase()) ||
                              (m.products?.name ?? '').toLowerCase().includes(mappingListSearch.toLowerCase())
                            )
                          : supplierMappings;
                        return filteredMappings.length === 0 ? (
                          <div className="flex flex-col items-center justify-center pt-16 text-on-surface/10">
                            <Search size={40} className="mb-4 opacity-20" />
                            <p className="text-xs font-black uppercase tracking-widest text-on-surface/20">Nenhum resultado</p>
                          </div>
                        ) : filteredMappings.map(mapping => {
                          const isEditing = editingMappingId === mapping.id;
                          return (
                            <div key={mapping.id} className={cn(
                              "bg-surface-container-lowest p-6 rounded-[2rem] border shadow-sm space-y-4 group transition-all relative",
                              isEditing ? "border-primary/40 ring-2 ring-primary/10" : "border-on-surface/[0.03] hover:border-primary/30"
                            )}>
                              {/* Edit / Delete buttons top-right */}
                              {!isEditing && (
                                <div className="absolute top-4 right-4 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                                  <button
                                    onClick={() => handleStartEdit(mapping)}
                                    className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all shadow-sm"
                                    title="Editar"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteMapping(mapping.id)}
                                    className="w-8 h-8 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                    title="Excluir"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}

                              {isEditing ? (
                                /* ── EDIT MODE ── */
                                <div className="space-y-4">
                                  <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Editando mapeamento</p>
                                  <div className="flex gap-3">
                                    <input
                                      type="text"
                                      value={editSku}
                                      onChange={(e) => setEditSku(e.target.value)}
                                      placeholder="Código (opcional)"
                                      className="w-28 bg-surface-container-low border border-on-surface/[0.05] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface/20"
                                    />
                                    <input
                                      type="text"
                                      value={editDescription}
                                      onChange={(e) => setEditDescription(e.target.value)}
                                      placeholder="Descrição do fornecedor"
                                      className="flex-1 bg-surface-container-low border border-on-surface/[0.05] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface/20"
                                    />
                                  </div>

                                  {/* Product picker */}
                                  {editProduct ? (
                                    <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-2xl relative group/ep">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black text-primary/50 uppercase tracking-widest mb-0.5">Produto interno</p>
                                        <p className="text-sm font-black text-primary truncate">{editProduct.name}</p>
                                      </div>
                                      <button onClick={() => { setEditProduct(null); setEditProductSearch(''); setEditProductResults([]); }} className="text-primary/30 hover:text-primary shrink-0"><X size={14} /></button>
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <div className="relative">
                                        <input
                                          type="text"
                                          value={editProductSearch}
                                          onChange={(e) => handleEditProductSearch(e.target.value)}
                                          placeholder="Buscar produto interno..."
                                          className="w-full bg-surface-container-low border border-on-surface/[0.05] rounded-xl pl-8 pr-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface/20"
                                        />
                                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface/20" />
                                      </div>
                                      {editProductResults.length > 0 && (
                                        <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                                          {editProductResults.map(p => (
                                            <button
                                              key={p.id}
                                              onClick={() => { setEditProduct(p); setEditProductSearch(''); setEditProductResults([]); }}
                                              className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-on-surface/[0.03] hover:border-primary/20 hover:bg-primary/5 transition-all text-left bg-surface-container-lowest"
                                            >
                                              <div className="w-8 h-8 bg-surface-container-low rounded-lg overflow-hidden shrink-0">
                                                <ProductImage src={p.image} alt={p.name} />
                                              </div>
                                              <p className="text-xs font-black text-on-surface truncate">{p.name}</p>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Save / Cancel */}
                                  <div className="flex gap-2 pt-2">
                                    <button
                                      onClick={() => handleSaveMapping(mapping.id)}
                                      disabled={isSavingMapping}
                                      className="flex-1 bg-primary text-white font-black text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-on-surface transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
                                    >
                                      {isSavingMapping ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" /> : <><Save size={14} /> Salvar</>}
                                    </button>
                                    <button
                                      onClick={handleCancelEdit}
                                      className="px-4 py-2.5 rounded-xl text-xs font-black text-on-surface/40 hover:bg-on-surface/5 transition-all"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                /* ── VIEW MODE ── */
                                <>
                                  <div>
                                    <p className="text-[10px] font-black text-on-surface/20 uppercase tracking-[0.2em] mb-2">Do Fornecedor:</p>
                                    <div className="flex items-center gap-2 pr-20">
                                      {mapping.supplier_sku && (
                                        <span className="text-[11px] font-black bg-on-surface/5 text-on-surface/50 px-2.5 py-1 rounded-lg shrink-0 uppercase tracking-tight">
                                          {mapping.supplier_sku}
                                        </span>
                                      )}
                                      <p className="text-base font-black text-on-surface leading-tight">{mapping.supplier_description}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 pt-4 border-t border-on-surface/[0.03]">
                                    <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                      <ArrowRight size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">Produto Interno:</p>
                                      <p className="text-sm font-black text-on-surface/70 truncate">{mapping.products?.name || 'Produto não encontrado'}</p>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        });
                      })()
                    ) : (
                      unitConversions.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-on-surface/10">
                          <Plus size={64} className="mb-6 opacity-20" />
                          <p className="text-sm font-black uppercase tracking-widest text-on-surface/20">Nenhuma Conversão</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto -mx-10 px-10">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="border-b border-on-surface/[0.06]">
                                <th className="text-left text-[10px] font-black text-on-surface/30 uppercase tracking-[0.15em] pb-3 pr-3">Produto</th>
                                <th className="text-left text-[10px] font-black text-on-surface/30 uppercase tracking-[0.15em] pb-3 pr-3">Fornecedor</th>
                                <th className="text-center text-[10px] font-black text-on-surface/30 uppercase tracking-[0.15em] pb-3 pr-3">Unidade</th>
                                <th className="text-center text-[10px] font-black text-on-surface/30 uppercase tracking-[0.15em] pb-3 pr-3">Qtd Real</th>
                                <th className="pb-3 w-8" />
                              </tr>
                            </thead>
                            <tbody>
                              {unitConversions.map((conversion, i) => (
                                <tr
                                  key={conversion.id}
                                  className={cn(
                                    "group border-b border-on-surface/[0.03] hover:bg-amber-50/40 transition-colors",
                                    i % 2 === 0 ? "bg-surface-container-lowest" : "bg-surface-container-low/20"
                                  )}
                                >
                                  <td className="py-2.5 pr-3">
                                    <span className="font-bold text-on-surface truncate block max-w-[140px]" title={conversion.products?.name}>
                                      {conversion.products?.name ?? '—'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 pr-3">
                                    <span className="text-on-surface/50 font-medium truncate block max-w-[110px]" title={conversion.suppliers?.name}>
                                      {conversion.suppliers?.name ?? <span className="italic text-on-surface/20">Todos</span>}
                                    </span>
                                  </td>
                                  <td className="py-2.5 pr-3 text-center">
                                    <span className="bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-lg text-[11px] font-black inline-block">
                                      {conversion.unit_name}
                                    </span>
                                  </td>
                                  <td className="py-2.5 pr-3 text-center">
                                    <span className="font-black text-primary">{conversion.multiplier}</span>
                                  </td>
                                  <td className="py-2.5 text-right">
                                    <button
                                      onClick={() => handleDeleteUnit(conversion.id)}
                                      className="w-7 h-7 rounded-lg bg-red-50 text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white ml-auto"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AddSupplierModal
        isOpen={showAddSupplierModal}
        onClose={() => setShowAddSupplierModal(false)}
        onSuccess={handleSupplierAdded}
      />
    </>
  );
}

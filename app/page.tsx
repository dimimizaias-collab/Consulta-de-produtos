'use client';

import { Sidebar } from '@/components/Sidebar';
import { BottomNav } from '@/components/BottomNav';
import { TopNav } from '@/components/TopNav';
import { FeaturedProduct } from '@/components/FeaturedProduct';
import { ProductCard } from '@/components/ProductCard';
import { SupplierDictionary } from '@/components/suppliers/SupplierDictionary';
import { InventoryManager } from '@/components/inventory/InventoryManager';
import { RequestCenter } from '@/components/requests/RequestCenter';
import { LogisticsCenter, ReviewNote } from '@/components/requests/LogisticsCenter';
import { PurchaseOrderManager } from '@/components/orders/PurchaseOrderManager';
import { Filter, Plus, X, Edit2, CheckCircle2, Download, FileUp, Search, Image as ImageIcon, RefreshCw, ChevronDown, Check, Trash2, ArrowLeftRight, BarChart3, Link as LinkIcon, ArrowRight, Package, LogIn, FileText, ShoppingCart, Truck, BookText, Users, Pencil, ClipboardList, SendHorizonal, Ban, Save } from 'lucide-react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { cn, getDirectImageUrl } from '@/lib/utils';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { XMLParser } from 'fast-xml-parser';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const staticProducts: any[] = [];

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
          <ImageIcon size={24} className="mb-1 opacity-20" />
          <span className="text-[10px] font-bold uppercase">Sem Foto</span>
        </div>
      )}
    </div>
  );
}

function SearchableSelect({ 
  value, 
  onChange, 
  options, 
  placeholder, 
  isAddingNew, 
  onToggleAddingNew,
  addNewPlaceholder,
  defaultValue = "Geral"
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder: string;
  isAddingNew: boolean;
  onToggleAddingNew: () => void;
  addNewPlaceholder: string;
  defaultValue?: string;
}) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    const filtered = options.filter(opt => 
      (opt || "").toLowerCase().includes(search.toLowerCase())
    );
    
    // Add default value if it's not in the list and matches search
    if (defaultValue && !filtered.includes(defaultValue) && defaultValue.toLowerCase().includes(search.toLowerCase())) {
      filtered.unshift(defaultValue);
    }
    
    return filtered;
  }, [options, search, defaultValue]);

  if (isAddingNew) {
    return (
      <div className="flex gap-2 flex-1">
        <input 
          type="text" 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          placeholder={addNewPlaceholder}
          autoFocus
        />
        <button 
          type="button"
          onClick={onToggleAddingNew}
          className="w-10 h-10 rounded-lg flex items-center justify-center transition-all shrink-0 border bg-slate-100 border-slate-200 text-slate-500"
        >
          <X size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2 flex-1" ref={containerRef}>
      <div className="relative flex-1">
        <div className="relative">
          <input
            type="text"
            value={isOpen ? search : (value || "")}
            onFocus={() => {
              setIsOpen(true);
              setSearch("");
            }}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-10"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <ChevronDown size={16} />
          </div>
        </div>
        
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute z-[60] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto"
            >
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors",
                      value === opt ? "text-primary font-bold bg-primary/5" : "text-slate-700"
                    )}
                  >
                    {opt}
                  </button>
                ))
              ) : (
                <div className="px-4 py-2 text-sm text-slate-500 italic">Nenhum resultado encontrado</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <button 
        type="button"
        onClick={onToggleAddingNew}
        className="w-10 h-10 rounded-lg flex items-center justify-center transition-all shrink-0 border bg-red-500 border-red-600 text-white hover:bg-red-600"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}

export default function Page() {
  const [activeTab, setActiveTab] = useState('Inventory');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [showAddRequestModal, setShowAddRequestModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showLinkViewModal, setShowLinkViewModal] = useState(false);
  const [linkViewData, setLinkViewData] = useState<{ mother: any, child: any } | null>(null);
  const [linkTarget, setLinkTarget] = useState<'editing' | 'new'>('editing');
  const [linkSearchQuery, setLinkSearchQuery] = useState({ ean: '', sku: '', name: '' });
  const [linkSearchResults, setLinkSearchResults] = useState<any[]>([]);
  const [isLinking, setIsLinking] = useState(false);
  const [isRequestingNewProduct, setIsRequestingNewProduct] = useState(false);
  const [requestSearchQuery, setRequestSearchQuery] = useState({ sku: '', ean: '' });
  const [foundProductForRequest, setFoundProductForRequest] = useState<any>(null);
  const [requestDraftChanges, setRequestDraftChanges] = useState<any>({});
  const [newProductRequest, setNewProductRequest] = useState({
    sku: '',
    name: '',
    ean: '',
    eans: [''],
    category: '',
    subcategory: '',
    brand: '',
    count: 0,
    price: 0,
    location: '',
    image: '',
    observation: '',
    is_mother: false,
    units_per_mother: 1
  });
  const [showStockUpdateChoiceModal, setShowStockUpdateChoiceModal] = useState(false);
  const [showManualStockModal, setShowManualStockModal] = useState(false);
  const [manualStockSearchQuery, setManualStockSearchQuery] = useState({ ean: '', sku: '', name: '' });
  const [manualStockSearchResults, setManualStockSearchResults] = useState<any[]>([]);
  const [selectedManualProduct, setSelectedManualProduct] = useState<any>(null);
  const [manualStockChange, setManualStockChange] = useState(0);
  const [isUpdatingManualStock, setIsUpdatingManualStock] = useState(false);
  
  // Entrada de Mercadoria states
  const [showManualNoteModal, setShowManualNoteModal] = useState(false);
  const [noteItems, setNoteItems] = useState<any[]>([]);
  const [noteSearchQuery, setNoteSearchQuery] = useState('');
  const [noteSearchResults, setNoteSearchResults] = useState<any[]>([]);
  const [isProcessingNote, setIsProcessingNote] = useState(false);
  const noteFileInputRef = useRef<HTMLInputElement>(null);

  // Supplier Dictionary states
  const [showSuppliersModal, setShowSuppliersModal] = useState(false);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  const [supplierNames, setSupplierNames] = useState<any[]>([]);
  
  const [showImportSupplierModal, setShowImportSupplierModal] = useState(false);
  const [selectedImportSupplierId, setSelectedImportSupplierId] = useState('');
  const [translatedNoteItems, setTranslatedNoteItems] = useState<any[]>([]);
  const [showTranslationResultModal, setShowTranslationResultModal] = useState(false);
  const [manualNoteSupplierId, setManualNoteSupplierId] = useState('');

  // NF Digitalizada review flow
  const [pendingNfItems, setPendingNfItems] = useState<any[]>([]);
  const [showNfDigitalizadaModal, setShowNfDigitalizadaModal] = useState(false);
  const [showApproveNfConfirm, setShowApproveNfConfirm] = useState(false);
  const [showCancelNfConfirm, setShowCancelNfConfirm] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<ReviewNote[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('nf_review_notes');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [currentNfTimestamp, setCurrentNfTimestamp] = useState('');
  const [currentNfFileName, setCurrentNfFileName] = useState('');
  const [viewingReviewNote, setViewingReviewNote] = useState<ReviewNote | null>(null);
  const [viewingNoteSellPrices, setViewingNoteSellPrices] = useState<number[]>([]);
  const [viewingNoteVerified, setViewingNoteVerified] = useState<boolean[]>([]);
  const [viewingNoteReviewTimestamps, setViewingNoteReviewTimestamps] = useState<(string | null)[]>([]);
  const [isApprovingNf, setIsApprovingNf] = useState(false);
  const [nfItemPrices, setNfItemPrices] = useState<number[]>([]);
  const [nfItemSellPrices, setNfItemSellPrices] = useState<number[]>([]);
  const [nfItemVerified, setNfItemVerified] = useState<boolean[]>([]);

  const [editingField, setEditingField] = useState<string | null>(null);
  const [showRequestConfirmModal, setShowRequestConfirmModal] = useState<{ show: boolean, requestId: string | null }>({ show: false, requestId: null });
  const [isNewRequest, setIsNewRequest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [addStatus, setAddStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [editStatus, setEditStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [addError, setAddError] = useState('');
  const [editError, setEditError] = useState('');
  const [isConfigured, setIsConfigured] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [newProduct, setNewProduct] = useState({
    sku: '',
    name: '',
    image: '',
    status: 'Estoque',
    count: 0,
    price: 0,
    location: '',
    ean: '',
    eans: [''],
    category: '',
    subcategory: '',
    brand: '',
    is_mother: false,
    units_per_mother: 1,
    linked_product_id: null as string | null
  });
  const [editingProduct, setEditingProduct] = useState<any>(null);

  // Unique values for dropdowns
  const uniqueLocations = useMemo(() => Array.from(new Set(products.map(p => p.location).filter(Boolean))).sort(), [products]);
  const uniqueCategories = useMemo(() => Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort(), [products]);
  const uniqueSubcategories = useMemo(() => {
    const currentCategory = showEditModal ? editingProduct?.category : newProduct.category;
    
    if (!currentCategory || currentCategory === 'Geral') {
      return Array.from(new Set(products.map(p => p.subcategory).filter(Boolean))).sort();
    }

    const filtered = products
      .filter(p => p.category === currentCategory)
      .map(p => p.subcategory)
      .filter(Boolean);
      
    return Array.from(new Set(filtered)).sort();
  }, [products, showEditModal, editingProduct?.category, newProduct.category]);
  const uniqueBrands = useMemo(() => Array.from(new Set(products.map(p => p.brand).filter(Boolean))).sort(), [products]);

  // State to track if user is typing a new value manually
  const [isAddingNew, setIsAddingNew] = useState({
    location: false,
    category: false,
    subcategory: false,
    brand: false
  });

  const toggleAddingNew = (field: keyof typeof isAddingNew) => {
    setIsAddingNew(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validação de tipo de arquivo
    if (!file.type.startsWith('image/')) {
      setNotification({ type: 'error', message: 'Por favor, selecione apenas arquivos de imagem (JPG, PNG, etc).' });
      if (e.target) e.target.value = '';
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.details ? `${errorData.error}: ${errorData.details}` : (errorData.error || 'Falha no upload');
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Upload bem-sucedido:', data.url);
      
      if (isEdit) {
        setEditingProduct((prev: any) => ({ ...prev, image: data.url }));
      } else {
        setNewProduct((prev: any) => ({ ...prev, image: data.url }));
      }
      setNotification({ type: 'success', message: 'Imagem carregada com sucesso!' });
    } catch (err: any) {
      console.error('Erro no upload:', err);
      setNotification({ type: 'error', message: `Erro ao carregar imagem: ${err.message}` });
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const stockFileInputRef = useRef<HTMLInputElement>(null);

  const handleStockUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isConfigured) {
      setNotification({ type: 'error', message: 'O banco de dados não está configurado. Por favor, adicione as chaves no menu Settings.' });
      if (stockFileInputRef.current) stockFileInputRef.current.value = '';
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    const fileName = file.name.toLowerCase();
    setImporting(true);
    setNotification({ type: 'success', message: 'Processando atualização de estoque...' });

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let rawData: any[] = [];
        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        } else if (fileName.endsWith('.csv')) {
          const text = event.target?.result as string;
          const result = Papa.parse(text, { header: true, skipEmptyLines: true });
          rawData = result.data;
        } else if (fileName.endsWith('.xml')) {
          const text = event.target?.result as string;
          const parser = new XMLParser({ ignoreAttributes: false });
          const result = parser.parse(text);
          // XML structure varies, but usually it's under a root tag
          const rootKey = Object.keys(result)[0];
          const itemsKey = Object.keys(result[rootKey]).find(k => Array.isArray(result[rootKey][k]));
          rawData = itemsKey ? result[rootKey][itemsKey] : [];
        }

        if (rawData.length === 0) throw new Error('O arquivo está vazio ou em formato inválido.');

        const normalize = (s: string) => {
          if (!s) return "";
          return String(s)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]/g, "")
            .trim();
        };

        const getVal = (p: any, keys: string[], defaultVal: string = "") => {
          const normalizedTargets = keys.map(normalize);
          const foundKey = Object.keys(p).find(k => normalizedTargets.includes(normalize(k)));
          const val = foundKey ? p[foundKey] : undefined;
          if (val === undefined || val === null || val === "") return defaultVal;
          return String(val).trim();
        };

        // Get all current products to check against
        const { data: currentProducts, error: fetchError } = await supabase.from('products').select('*');
        if (fetchError) throw fetchError;

        let updatedCount = 0;
        let errors = 0;

        for (const row of rawData) {
          const sku = getVal(row, ['código interno', 'codigo interno', 'sku', 'code', 'internal_code', 'referencia', 'cod interno']);
          const ean = getVal(row, ['código ean', 'codigo ean', 'ean', 'barcode', 'gtin', 'ean13', 'cod ean', 'cod barras']);
          const qtyStr = getVal(row, ['estoque', 'quantidade', 'count', 'quantity', 'stock', 'qtd'], '0');
          const qtyToSubtract = parseInt(qtyStr);

          if (isNaN(qtyToSubtract) || qtyToSubtract === 0) continue;

          // Find product by SKU or EAN
          const product = currentProducts.find(p => 
            (sku && p.sku === sku) || (ean && p.ean === ean)
          );

          if (product) {
            const newCount = Math.max(0, product.count - qtyToSubtract);
            const { error: updateError } = await supabase
              .from('products')
              .update({ 
                count: newCount,
                is_low: newCount < 5,
                status: newCount > 0 ? 'Em Estoque' : 'Fora de Estoque'
              })
              .eq('id', product.id);
            
            if (!updateError) {
              updatedCount++;
              
              // Handle Mother/Child relationship for file import
              if (product.is_mother && product.linked_product_id) {
                const childUnitsToSubtract = qtyToSubtract * (product.units_per_mother || 1);
                const childProduct = currentProducts.find(p => p.id === product.linked_product_id);
                if (childProduct) {
                  const newChildCount = Math.max(0, (childProduct.count || 0) - childUnitsToSubtract);
                  await supabase
                    .from('products')
                    .update({ 
                      count: newChildCount,
                      is_low: newChildCount < 5,
                      status: newChildCount > 0 ? 'Em Estoque' : 'Fora de Estoque'
                    })
                    .eq('id', childProduct.id);
                }
              }
            } else {
              errors++;
            }
          }
        }

        setNotification({ 
          type: 'success', 
          message: `Estoque atualizado: ${updatedCount} produtos processados. ${errors > 0 ? `(${errors} erros)` : ''}` 
        });
        fetchProducts();
      } catch (err: any) {
        console.error('Erro ao atualizar estoque:', err);
        setNotification({ type: 'error', message: `Erro na atualização: ${err.message}` });
      } finally {
        setImporting(false);
        if (stockFileInputRef.current) stockFileInputRef.current.value = '';
        setTimeout(() => setNotification(null), 5000);
      }
    };

    try {
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        reader.readAsArrayBuffer(file);
      } else if (fileName.endsWith('.csv') || fileName.endsWith('.xml')) {
        reader.readAsText(file);
      } else {
        throw new Error('Formato de arquivo não suportado. Use .xlsx, .xls, .csv ou .xml');
      }
    } catch (err: any) {
      console.error('Error starting file read:', err);
      setImporting(false);
      setNotification({ type: 'error', message: `Erro ao ler o arquivo: ${err.message}` });
      if (stockFileInputRef.current) stockFileInputRef.current.value = '';
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      console.log('Buscando produtos do Supabase...');
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.log('Erro na busca do Supabase:', error);
        throw error;
      }

      if (data && data.length > 0) {
        console.log('Colunas disponíveis no primeiro produto:', Object.keys(data[0]));
      }
      
      console.log(`Produtos recebidos: ${data?.length || 0}`);
      
      // Sempre mapeia, mesmo que vazio, para limpar dados estáticos se necessário
      const mappedData = (data || []).map((p: any) => ({
        ...p,
        ean: p.ean || '',
        category: p.category || 'Geral',
        subcategory: p.subcategory || 'Geral',
        brand: p.brand || 'Geral',
        isFeatured: p.is_featured,
        isSide: p.is_side,
        isLow: p.is_low,
        internalCode: p.internal_code,
        createdAt: p.created_at,
        updatedAt: p.updated_at
      }));
      
      setProducts(mappedData);
    } catch (err) {
      console.log('Erro ao buscar produtos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem('nf_review_notes', JSON.stringify(reviewNotes));
    } catch {}
  }, [reviewNotes]);

  useEffect(() => {
    // Check if Supabase is configured
    const isPlaceholder = 
      process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || 
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'placeholder' ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (isPlaceholder) {
      console.log('Supabase não configurado. Usando dados estáticos.');
      setIsConfigured(false);
      setLoading(false);
    } else {
      fetchProducts();
      fetchRequests();
    }
  }, []);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('requests')
        .select('*, products(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error('Erro ao buscar requisições:', err);
    }
  };

  const [savingRequest, setSavingRequest] = useState(false);

  const handleSearchProductForRequest = async (type: 'sku' | 'ean', value: string) => {
    setRequestSearchQuery(prev => ({ ...prev, [type]: value }));
    
    if (value.length < 3) {
      setFoundProductForRequest(null);
      return;
    }

    const product = products.find(p => 
      (type === 'sku' && p.sku === value) || 
      (type === 'ean' && p.ean === value)
    );

    if (product) {
      setFoundProductForRequest(product);
      setRequestDraftChanges({});
      setEditingField(null);
    } else {
      setFoundProductForRequest(null);
    }
  };

  const handleSaveRequest = async () => {
    if (isRequestingNewProduct) {
      if (!newProductRequest.sku && !newProductRequest.ean) {
        setNotification({ type: 'error', message: 'Preencha o SKU ou o EAN para continuar.' });
        return;
      }
      if (!newProductRequest.name) {
        setNotification({ type: 'error', message: 'O nome do produto é obrigatório.' });
        return;
      }
    } else {
      if (!foundProductForRequest || Object.keys(requestDraftChanges).length === 0) return;
    }

    if (!isConfigured) {
      setNotification({ type: 'error', message: 'Supabase não configurado. Adicione as chaves no menu Settings.' });
      return;
    }

    setSavingRequest(true);
    try {
      const payload = isRequestingNewProduct ? {
        product_id: null,
        requested_changes: JSON.stringify({
          ...newProductRequest,
          ean: newProductRequest.eans ? newProductRequest.eans.filter((e: string) => e.trim()).join(', ') : (newProductRequest.ean || ''),
          is_new_product: true,
          is_mother: newProductRequest.is_mother,
          units_per_mother: newProductRequest.units_per_mother
        }),
        status: 'pending'
      } : {
        product_id: foundProductForRequest.id,
        requested_changes: JSON.stringify(requestDraftChanges),
        status: 'pending'
      };

      const { error } = await supabase
        .from('requests')
        .insert([payload]);

      if (error) throw error;
      
      setNotification({ type: 'success', message: 'Requisição salva com sucesso!' });
      setShowAddRequestModal(false);
      setIsRequestingNewProduct(false);
      setNewProductRequest({
        sku: '', name: '', ean: '', eans: [''], category: '', subcategory: '', brand: '',
        count: 0, price: 0, location: '', image: '', observation: '',
        is_mother: false, units_per_mother: 1
      });
      fetchRequests();
    } catch (err: any) {
      console.error('Erro ao salvar requisição:', err);
      setNotification({ type: 'error', message: err.message || 'Erro ao salvar requisição.' });
    } finally {
      setSavingRequest(false);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    const request = requests.find(r => r.id === requestId);
    if (!request) return;

    if (!isConfigured) {
      setNotification({ type: 'error', message: 'Supabase não configurado.' });
      return;
    }

    try {
      const changes = JSON.parse(request.requested_changes);
      const isNewProduct = changes.is_new_product;
      
      if (isNewProduct) {
        // Create new product
        const { is_new_product, observation, ...productData } = changes;
        const { error: insertError } = await supabase
          .from('products')
          .insert([{
            ...productData,
            status: 'Ativo' // Default status
          }]);
        if (insertError) throw insertError;
      } else {
        // Update the product in Inventory
        const { error: updateError } = await supabase
          .from('products')
          .update(changes)
          .eq('id', request.product_id);
        if (updateError) throw updateError;
      }

      // Update request status
      const { error: requestError } = await supabase
        .from('requests')
        .update({ status: 'approved' })
        .eq('id', requestId);

      if (requestError) throw requestError;

      setNotification({ type: 'success', message: isNewProduct ? 'Novo produto cadastrado com sucesso!' : 'Alteração aplicada com sucesso!' });
      setShowRequestConfirmModal({ show: false, requestId: null });
      fetchRequests();
      fetchProducts();
    } catch (err: any) {
      console.error('Erro ao aprovar requisição:', err);
      setNotification({ type: 'error', message: err.message || 'Erro ao aprovar requisição.' });
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!isConfigured) {
      setNotification({ type: 'error', message: 'Supabase não configurado.' });
      return;
    }

    try {
      const { error } = await supabase
        .from('requests')
        .delete()
        .eq('id', requestId);

      if (error) throw error;
      fetchRequests();
    } catch (err: any) {
      console.error('Erro ao excluir requisição:', err);
      setNotification({ type: 'error', message: err.message || 'Erro ao excluir requisição.' });
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConfigured) {
      setAddStatus('error');
      setAddError('O banco de dados não está configurado. Por favor, adicione as chaves no menu Settings.');
      return;
    }

    setAddStatus('loading');
    setAddError('');
    
    console.log('Iniciando adição de produto:', newProduct);

    if (!newProduct.sku || !newProduct.name) {
      setAddStatus('error');
      setAddError('SKU e Nome são obrigatórios.');
      return;
    }

    try {
      setAdding(true);
      
      const productToInsert = {
        sku: newProduct.sku,
        name: newProduct.name,
        image: newProduct.image || '',
        status: newProduct.status,
        count: isNaN(newProduct.count) ? 0 : newProduct.count,
        price: isNaN(newProduct.price) ? 0 : newProduct.price,
        location: newProduct.location || 'Não atribuído',
        ean: newProduct.eans ? newProduct.eans.filter((e: string) => e.trim()).join(', ') : (newProduct.ean || ''),
        category: newProduct.category || 'Geral',
        subcategory: newProduct.subcategory || 'Geral',
        brand: newProduct.brand || 'Geral',
        internal_code: newProduct.sku,
        is_featured: false,
        is_side: false,
        is_low: (isNaN(newProduct.count) ? 0 : newProduct.count) < 5,
        is_mother: newProduct.is_mother,
        units_per_mother: newProduct.units_per_mother,
        linked_product_id: newProduct.linked_product_id
      };

      console.log('Enviando para o Supabase...');

      const { data, error } = await supabase
        .from('products')
        .insert([productToInsert])
        .select();

      if (error) {
        console.log('Erro Supabase:', error);
        throw error;
      }

      // Logic for Mother/Child stock update on creation
      if (newProduct.is_mother && newProduct.linked_product_id && newProduct.count > 0) {
        const unitsToAdd = newProduct.count * (newProduct.units_per_mother || 1);
        
        // Get child product to get its current count
        const { data: childData } = await supabase
          .from('products')
          .select('count')
          .eq('id', newProduct.linked_product_id)
          .single();
          
        if (childData) {
          const newChildCount = (childData.count || 0) + unitsToAdd;
          await supabase
            .from('products')
            .update({ 
              count: newChildCount,
              is_low: newChildCount < 5,
              status: newChildCount > 0 ? 'Em Estoque' : 'Fora de Estoque'
            })
            .eq('id', newProduct.linked_product_id);
        }
      }

      console.log('Sucesso:', data);
      setNotification({ type: 'success', message: 'Produto adicionado com sucesso!' });
      
      // Limpa o formulário
      setNewProduct({
        sku: '',
        name: '',
        image: '',
        status: 'Estoque',
        count: 0,
        price: 0,
        location: '',
        ean: '',
        eans: [''],
        category: '',
        subcategory: '',
        brand: '',
        is_mother: false,
        units_per_mother: 1,
        linked_product_id: null
      });

      // Fecha o modal após um pequeno delay
      setTimeout(() => {
        setShowAddModal(false);
        setAddStatus('idle');
        fetchProducts();
        setNotification(null);
      }, 1500);

    } catch (err: any) {
      console.log('Erro capturado:', err);
      setNotification({ type: 'error', message: err.message || 'Erro ao salvar produto.' });
      setAddStatus('error');
      setAddError(err.message || 'Erro ao salvar no banco de dados.');
    } finally {
      setAdding(false);
    }
  };

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConfigured) {
      setEditStatus('error');
      setEditError('O banco de dados não está configurado.');
      return;
    }

    if (!editingProduct) return;

    setEditStatus('loading');
    setEditError('');
    
    try {
      const productToUpdate = {
        sku: editingProduct.sku,
        name: editingProduct.name,
        image: editingProduct.image,
        status: editingProduct.status,
        count: isNaN(editingProduct.count) ? 0 : editingProduct.count,
        price: isNaN(editingProduct.price) ? 0 : editingProduct.price,
        location: editingProduct.location,
        ean: editingProduct.eans ? editingProduct.eans.filter((e: string) => e.trim()).join(', ') : (editingProduct.ean || ''),
        category: editingProduct.category || '',
        subcategory: editingProduct.subcategory || '',
        brand: editingProduct.brand || '',
        internal_code: editingProduct.sku,
        is_low: (isNaN(editingProduct.count) ? 0 : editingProduct.count) < 5,
        updated_at: new Date().toISOString(),
        is_mother: editingProduct.is_mother,
        units_per_mother: editingProduct.units_per_mother,
        linked_product_id: editingProduct.linked_product_id
      };

      const { error } = await supabase
        .from('products')
        .update(productToUpdate)
        .eq('id', editingProduct.id);

      if (error) throw error;

      // Logic for Mother/Child stock update
      if (editingProduct.is_mother && editingProduct.linked_product_id) {
        const newCount = isNaN(editingProduct.count) ? 0 : editingProduct.count;
        const diff = newCount - (editingProduct.originalCount || 0);
        
        if (diff > 0) {
          const unitsToAdd = diff * (editingProduct.units_per_mother || 1);
          
          // Get child product to get its current count
          const { data: childData } = await supabase
            .from('products')
            .select('count')
            .eq('id', editingProduct.linked_product_id)
            .single();
            
          if (childData) {
            const newChildCount = (childData.count || 0) + unitsToAdd;
            await supabase
              .from('products')
              .update({ 
                count: newChildCount,
                is_low: newChildCount < 5,
                status: newChildCount > 0 ? 'Em Estoque' : 'Fora de Estoque'
              })
              .eq('id', editingProduct.linked_product_id);
          }
        }
      }

      setNotification({ type: 'success', message: 'Produto atualizado com sucesso!' });
      setEditStatus('success');
      
      setTimeout(() => {
        setShowEditModal(false);
        setEditStatus('idle');
        fetchProducts();
        setNotification(null);
      }, 1500);

    } catch (err: any) {
      console.log('Erro ao editar:', err);
      setNotification({ type: 'error', message: err.message || 'Erro ao atualizar produto.' });
      setEditStatus('error');
      setEditError(err.message || 'Erro ao atualizar produto.');
    }
  };

  const handleManualStockSearch = async () => {
    if (!manualStockSearchQuery.name) {
      setManualStockSearchResults([]);
      return;
    }

    let query = supabase.from('products').select('*');
    
    // Search by name, SKU or EAN using OR
    query = query.or(`name.ilike.%${manualStockSearchQuery.name}%,sku.ilike.%${manualStockSearchQuery.name}%,ean.ilike.%${manualStockSearchQuery.name}%`);
    
    const { data, error } = await query.limit(10);
    if (error) {
      console.error('Erro na busca manual de estoque:', error);
      return;
    }
    setManualStockSearchResults(data || []);
  };

  // Entrada de Mercadoria Functions
  const handleNoteSearch = async () => {
    if (!noteSearchQuery) {
      setNoteSearchResults([]);
      return;
    }

    let searchIds: string[] = [];

    // If a supplier is selected, try to find in dictionary first
    if (manualNoteSupplierId) {
      const { data: mappings } = await supabase
        .from('supplier_mappings')
        .select('internal_product_id')
        .eq('supplier_id', manualNoteSupplierId)
        .ilike('supplier_description', `%${noteSearchQuery}%`);
      
      if (mappings && mappings.length > 0) {
        searchIds = mappings.map(m => m.internal_product_id);
      }
    }

    let query = supabase.from('products').select('*');
    
    if (searchIds.length > 0) {
      // If found in dictionary, prioritize these IDs but also search globally
      query = query.or(`id.in.(${searchIds.join(',')}),name.ilike.%${noteSearchQuery}%,sku.ilike.%${noteSearchQuery}%,ean.ilike.%${noteSearchQuery}%`);
    } else {
      query = query.or(`name.ilike.%${noteSearchQuery}%,sku.ilike.%${noteSearchQuery}%,ean.ilike.%${noteSearchQuery}%`);
    }

    const { data, error } = await query.limit(10);
    
    if (error) {
      console.error('Erro na busca de produtos para nota:', error);
      return;
    }
    setNoteSearchResults(data || []);
  };

  const handleAddProductToNote = (product: any) => {
    // Check if already in note
    if (noteItems.some(item => item.id === product.id)) {
      setNotification({ type: 'error', message: 'Produto já está na nota.' });
      return;
    }
    setNoteItems([...noteItems, { ...product, noteQuantity: 1 }]);
    setNoteSearchQuery('');
    setNoteSearchResults([]);
  };

  const handleRemoveProductFromNote = (id: string) => {
    setNoteItems(noteItems.filter(item => item.id !== id));
  };

  const handleUpdateNoteQuantity = (id: string, qty: number) => {
    setNoteItems(noteItems.map(item => item.id === id ? { ...item, noteQuantity: Math.max(0, qty) } : item));
  };

  const handleProcessManualNote = async () => {
    if (noteItems.length === 0) return;
    setIsProcessingNote(true);
    try {
      for (const item of noteItems) {
        if (item.noteQuantity <= 0) continue;
        
        const newCount = (item.count || 0) + item.noteQuantity;
        
        // Update product stock
        const { error: updateError } = await supabase
          .from('products')
          .update({ 
            count: newCount,
            is_low: newCount < 5,
            status: newCount > 0 ? 'Em Estoque' : 'Fora de Estoque'
          })
          .eq('id', item.id);
          
        if (updateError) throw updateError;
        
        // Mother/Child Logic
        if (item.is_mother && item.linked_product_id) {
          const unitsToAdd = item.noteQuantity * (item.units_per_mother || 1);
          const { data: childData } = await supabase
            .from('products')
            .select('count')
            .eq('id', item.linked_product_id)
            .single();
            
          if (childData) {
            const newChildCount = (childData.count || 0) + unitsToAdd;
            await supabase
              .from('products')
              .update({ 
                count: newChildCount,
                is_low: newChildCount < 5,
                status: newChildCount > 0 ? 'Em Estoque' : 'Fora de Estoque'
              })
              .eq('id', item.linked_product_id);
          }
        }
      }
      
      setNotification({ type: 'success', message: 'Entrada de mercadoria processada com sucesso!' });
      setNoteItems([]);
      setShowManualNoteModal(false);
      fetchProducts();
    } catch (err: any) {
      console.error('Erro ao processar nota manual:', err);
      setNotification({ type: 'error', message: 'Erro ao processar entrada de mercadoria.' });
    } finally {
      setIsProcessingNote(false);
    }
  };

  const exportTranslatedToExcel = (items: any[]) => {
    const ws = XLSX.utils.json_to_sheet(items.map(item => {
      const isTranslated = item.verified;
      const displayQty = isTranslated ? item.qty : (item.original_qty || 1);
      const displayPriceUn = isTranslated ? (item.price / (item.multiplier || 1)) : item.price;
      const displayPriceTotal = item.price * (item.original_qty || 1);

      return {
        'Código (SKU)': item.sku || '-',
        'EAN': item.ean || '-',
        'Produto Interno': item.name || 'NÃO MAPEADO',
        'Descrição Fornecedor': item.original_description || '-',
        'Quantidade': displayQty,
        'Preço Un.': displayPriceUn,
        'Preço Total': displayPriceTotal
      };
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Traduzidos");
    XLSX.writeFile(wb, "nota_traduzida.xlsx");
  };

  const exportTranslatedToPDF = (items: any[]) => {
    const doc = new jsPDF();
    const formatCurrency = (val: number) => 
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    doc.setFont("helvetica", "bold");
    doc.text("Relatório de Tradução de Nota", 14, 15);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22);
    
    const tableData = items.map(item => {
      const isTranslated = item.verified;
      const displayQty = isTranslated ? item.qty : (item.original_qty || 1);
      const displayPriceUn = isTranslated ? (item.price / (item.multiplier || 1)) : item.price;
      const displayPriceTotal = item.price * (item.original_qty || 1);

      return [
        item.sku || '-',
        item.ean || '-',
        item.name || 'NÃO MAPEADO',
        item.original_description || '-',
        displayQty.toString(),
        formatCurrency(displayPriceUn),
        formatCurrency(displayPriceTotal)
      ];
    });

    autoTable(doc, {
      startY: 30,
      head: [['SKU', 'EAN', 'Produto Interno', 'Descrição Fornecedor', 'Qtde', 'Preço Un.', 'Total']],
      body: tableData,
      headStyles: { fillColor: [0, 84, 204] },
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 20 }, // SKU
        1: { cellWidth: 25 }, // EAN
        2: { cellWidth: 35 }, // Produto Interno
        3: { cellWidth: 45 }, // Descrição Fornecedor
        4: { halign: 'center' }, // Qtde
        5: { halign: 'right' }, // Preço Un.
        6: { halign: 'right' }  // Total
      }
    });

    doc.save("nota_traduzida.pdf");
  };

  const downloadNoteTemplate = () => {
    const templateData = [
      {
        'Item': 1,
        'Código': '7891234567890',
        'Descrição': 'EXEMPLO PRODUTO A',
        'Unidade': 'UN',
        'Quantidade': 10,
        'Preço Unitário': 15.50,
        'Valor Total': 155.00
      },
      {
        'Item': 2,
        'Código': 'SKU-999',
        'Descrição': 'EXEMPLO PRODUTO B (CAIXA)',
        'Unidade': 'CX',
        'Quantidade': 2,
        'Preço Unitário': 100.00,
        'Valor Total': 200.00
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo de Entrada");
    XLSX.writeFile(wb, "modelo_entrada_mercadoria.xlsx");
  };

  const handleApproveNf = async () => {
    setIsApprovingNf(true);
    try {
      const { data: currentProducts } = await supabase.from('products').select('*');
      let updatedCount = 0;

      for (const item of pendingNfItems) {
        if (!item.verified || !item.product_id) continue;

        const product = currentProducts?.find((p: any) => p.id === item.product_id);
        if (!product) continue;

        const newCount = (product.count || 0) + item.qty;
        await supabase.from('products').update({
          count: newCount,
          is_low: newCount < 5,
          status: newCount > 0 ? 'Em Estoque' : 'Fora de Estoque'
        }).eq('id', product.id);

        if (product.is_mother && product.linked_product_id) {
          const childUnits = item.original_qty * (product.units_per_mother || 1);
          const childProduct = currentProducts?.find((p: any) => p.id === product.linked_product_id);
          if (childProduct) {
            const newChildCount = (childProduct.count || 0) + childUnits;
            await supabase.from('products').update({
              count: newChildCount,
              is_low: newChildCount < 5,
              status: newChildCount > 0 ? 'Em Estoque' : 'Fora de Estoque'
            }).eq('id', childProduct.id);
          }
        }
        updatedCount++;
      }

      const itemsWithFinalPrices = pendingNfItems.map((item: any, idx: number) => ({
        ...item,
        price: nfItemPrices[idx] ?? item.price,
        product_price: nfItemSellPrices[idx] ?? item.product_price,
        verified: nfItemVerified[idx] ?? item.verified
      }));
      const newNote: ReviewNote = {
        id: Date.now().toString(),
        timestamp: currentNfTimestamp,
        fileName: currentNfFileName,
        items: itemsWithFinalPrices,
        itemCount: pendingNfItems.length,
        verifiedCount: pendingNfItems.filter((i: any) => i.verified).length
      };
      setReviewNotes(prev => [newNote, ...prev]);
      setShowApproveNfConfirm(false);
      setShowNfDigitalizadaModal(false);
      setPendingNfItems([]);
      setNfItemPrices([]);
      setNfItemSellPrices([]);
      setNfItemVerified([]);
      setNotification({ type: 'success', message: `Nota aprovada: ${updatedCount} itens atualizados no estoque.` });
      fetchProducts();
    } catch (err: any) {
      console.error('Erro ao aprovar nota:', err);
      setNotification({ type: 'error', message: 'Erro ao processar aprovação.' });
    } finally {
      setIsApprovingNf(false);
    }
  };

  const handleNoteImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setCurrentNfFileName(file.name);
    setCurrentNfTimestamp(new Date().toLocaleString('pt-BR'));
    setNotification({ type: 'success', message: 'Processando arquivo de nota...' });

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Robust Header Discovery (Scan first 20 rows for typical headers)
        const range = XLSX.utils.decode_range(sheet['!ref'] || "A1");
        let headerRow = 0;
        for (let R = range.s.r; R <= Math.min(range.e.r, 20); ++R) {
          const rowValues: string[] = [];
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cell = sheet[XLSX.utils.encode_cell({c: C, r: R})];
            if (cell && cell.v) rowValues.push(String(cell.v).toLowerCase());
          }
          const rowStr = rowValues.join(" ");
          if (rowStr.includes("desc") || rowStr.includes("prod") || rowStr.includes("sku") || rowStr.includes("codigo") || rowStr.includes("ean")) {
            headerRow = R;
            break;
          }
        }

        const rawData = XLSX.utils.sheet_to_json(sheet, { range: headerRow });
        if (rawData.length === 0) throw new Error('O arquivo está vazio ou não possui dados processáveis.');

        const normalize = (s: string) => s ? String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").trim() : "";
        const getVal = (p: any, keys: string[], defaultVal: string = "") => {
          const foundKey = Object.keys(p).find(k => keys.some(target => normalize(k) === normalize(target)));
          const val = foundKey ? p[foundKey] : undefined;
          return val !== undefined && val !== null && val !== "" ? String(val).trim() : defaultVal;
        };

        const { data: currentProducts } = await supabase.from('products').select('*');
        const { data: unitConversions } = await supabase.from('supplier_units').select('*');
        
        // Filter mappings by supplier if selected
        let mappingQuery = supabase.from('supplier_mappings').select('*');
        if (selectedImportSupplierId) {
          mappingQuery = mappingQuery.eq('supplier_id', selectedImportSupplierId);
        }
        const { data: filterMappings } = await mappingQuery;
        
        const processedItems: any[] = [];

        for (const row of (rawData as any[])) {
          const sku = getVal(row, ['sku', 'codigo', 'cod', 'referencia', 'ref', 'código interno', 'codigo interno', 'id']);
          const ean = getVal(row, ['ean', 'barras', 'barcode', 'codigo barras', 'gtin']);
          const description = getVal(row, ['desc', 'descricao', 'nome', 'produto', 'servico', 'descricao produto', 'descrição']);
          const unit = getVal(row, ['unidade', 'un', 'unid', 'emb', 'medida']);
          const qty = parseInt(getVal(row, ['qty', 'qtd', 'quantidade', 'entry', 'quant', 'movimento', 'entrada', 'unidades', 'qtde'], '0'));
          const price = parseFloat(getVal(row, ['preco', 'valor', 'unit', 'preco unitario', 'unitario', 'punit'], '0'));

          if (isNaN(qty) || qty <= 0) continue;

          // Try to find product by SKU, EAN or mapping
          let product = currentProducts?.find(p => (sku && p.sku === sku) || (ean && p.ean === ean));
          let statusTranslation = 'Identificado (SKU/EAN)';
          let verified = !!product;
          
          if (!product) {
            // 1. Try to find a mapping by supplier SKU first
            let mapping = filterMappings?.find(m => sku && m.supplier_sku === sku);

            // 2. Fallback to description matching
            if (!mapping && description) {
              const normDesc = normalize(description);
              mapping = filterMappings?.find(m => normalize(m.supplier_description || "") === normDesc);
              
              if (!mapping) {
                mapping = filterMappings?.find(m => {
                  const normMap = normalize(m.supplier_description || "");
                  return normMap.length > 5 && normDesc.includes(normMap);
                });
              }
            }

            if (mapping) {
              product = currentProducts?.find(p => p.id === mapping.internal_product_id);
              if (product) {
                statusTranslation = 'Traduzido';
                verified = true;
              }
            }
          }

          if (!verified) {
             statusTranslation = 'Não Encontrado';
          }

          // Apply Unit Conversion
          let multiplier = 1;
          if (product && unit) {
            const conversion = unitConversions?.find(c => 
              c.product_id === product?.id && normalize(c.unit_name) === normalize(unit)
            );
            if (conversion) {
              multiplier = Number(conversion.multiplier);
            }
          }

          const finalQty = qty * multiplier;

          processedItems.push({
            sku: product?.sku || sku || '',
            ean: ean || product?.ean || '',
            name: verified ? (product?.name || 'Não Identificado') : (description || 'Sem Descrição'),
            original_description: description,
            unit: unit || 'UN',
            multiplier,
            qty: finalQty,
            original_qty: qty,
            price: isNaN(price) ? 0 : price,
            product_price: product?.price || 0,
            status_translation: statusTranslation,
            product_id: product?.id,
            verified: verified
          });

        }

        setPendingNfItems(processedItems);
        setNfItemPrices(processedItems.map((i: any) => i.price || 0));
        setNfItemSellPrices(processedItems.map((i: any) => i.product_price || 0));
        setNfItemVerified(processedItems.map((i: any) => !!i.verified));
        setShowNfDigitalizadaModal(true);
        setNotification({ type: 'success', message: `Nota digitalizada: ${processedItems.length} itens processados.` });
      } catch (err: any) {
        console.error('Erro na importação de nota:', err);
        setNotification({ type: 'error', message: 'Erro ao importar nota.' });
      } finally {
        setImporting(false);
        if (noteFileInputRef.current) noteFileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Supplier Management Functions
  const fetchSuppliers = async () => {
    setIsLoadingSuppliers(true);
    try {
      const { data, error } = await supabase.from('suppliers').select('*').order('name');
      if (error) throw error;
      setSupplierNames(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar fornecedores:', err);
      if (err.message) console.error('Mensagem de erro:', err.message);
      if (err.details) console.error('Detalhes:', err.details);
    } finally {
      setIsLoadingSuppliers(false);
    }
  };


  const handleManualStockUpdate = async () => {
    if (!selectedManualProduct || manualStockChange === 0) return;
    
    setIsUpdatingManualStock(true);
    try {
      const newCount = Math.max(0, (selectedManualProduct.count || 0) + manualStockChange);
      
      // Update the selected product
      const { error: updateError } = await supabase
        .from('products')
        .update({ 
          count: newCount,
          is_low: newCount < 5,
          status: newCount > 0 ? 'Em Estoque' : 'Fora de Estoque'
        })
        .eq('id', selectedManualProduct.id);
        
      if (updateError) throw updateError;
      
      // If it's a mother product, update the child product
      if (selectedManualProduct.is_mother && selectedManualProduct.linked_product_id) {
        const unitsToAdd = manualStockChange * (selectedManualProduct.units_per_mother || 1);
        
        // Fetch child product current count
        const { data: childData } = await supabase
          .from('products')
          .select('count')
          .eq('id', selectedManualProduct.linked_product_id)
          .single();
          
        if (childData) {
          const newChildCount = Math.max(0, (childData.count || 0) + unitsToAdd);
          await supabase
            .from('products')
            .update({ 
              count: newChildCount,
              is_low: newChildCount < 5,
              status: newChildCount > 0 ? 'Em Estoque' : 'Fora de Estoque'
            })
            .eq('id', selectedManualProduct.linked_product_id);
        }
      }
      
      setNotification({ type: 'success', message: 'Estoque atualizado com sucesso!' });
      setShowManualStockModal(false);
      setSelectedManualProduct(null);
      setManualStockChange(0);
      setManualStockSearchQuery({ ean: '', sku: '', name: '' });
      setManualStockSearchResults([]);
      fetchProducts();
    } catch (err: any) {
      console.error('Erro ao atualizar estoque manualmente:', err);
      setNotification({ type: 'error', message: err.message || 'Erro ao atualizar estoque.' });
    } finally {
      setIsUpdatingManualStock(false);
    }
  };

  const handleLinkSearch = async () => {
    if (!linkSearchQuery.ean && !linkSearchQuery.sku && !linkSearchQuery.name) {
      setLinkSearchResults([]);
      return;
    }

    let query = supabase.from('products').select('*');
    
    if (linkSearchQuery.ean) query = query.ilike('ean', `%${linkSearchQuery.ean}%`);
    if (linkSearchQuery.sku) query = query.ilike('sku', `%${linkSearchQuery.sku}%`);
    if (linkSearchQuery.name) query = query.ilike('name', `%${linkSearchQuery.name}%`);
    
    // Exclude the current product
    if (editingProduct) {
      query = query.neq('id', editingProduct.id);
    }

    const { data, error } = await query.limit(10);
    if (error) {
      console.error('Erro na busca de vínculo:', error);
      return;
    }
    setLinkSearchResults(data || []);
  };

  const handleViewLink = async (product: any) => {
    let mother = null;
    let child = null;

    if (product.is_mother) {
      mother = product;
      if (product.linked_product_id) {
        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('id', product.linked_product_id)
          .single();
        child = data;
      }
    } else {
      child = product;
      // Find mother product that links to this child
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('linked_product_id', product.id)
        .single();
      mother = data;
    }

    setLinkViewData({ mother, child });
    setShowLinkViewModal(true);
  };

  const handleLinkProduct = async (targetProductId: string) => {
    if (linkTarget === 'editing') {
      if (!editingProduct) return;
      
      setIsLinking(true);
      try {
        console.log(`Tentando vincular produto ${editingProduct.id} com ${targetProductId}`);
        
        // Tenta com o cliente normal primeiro
        let { error } = await supabase
          .from('products')
          .update({ linked_product_id: targetProductId })
          .eq('id', editingProduct.id);

        // Se falhar e tivermos o admin client, tenta com ele (pode ignorar RLS)
        if (error && supabaseAdmin && supabaseAdmin !== supabase) {
          console.warn('Erro com cliente normal, tentando com supabaseAdmin:', error);
          const adminResult = await supabaseAdmin
            .from('products')
            .update({ linked_product_id: targetProductId })
            .eq('id', editingProduct.id);
          error = adminResult.error;
        }

        if (error) {
          console.error('Erro retornado pelo Supabase:', error);
          throw error;
        }

        setNotification({ type: 'success', message: 'Produtos vinculados com sucesso!' });
        setShowLinkModal(false);
        
        // Atualiza o estado local
        if (editingProduct) {
          setEditingProduct({ ...editingProduct, linked_product_id: targetProductId });
        }
        
        fetchProducts();
      } catch (err: any) {
        console.error('Erro capturado ao vincular:', err);
        
        // Extração de mensagem de erro mais robusta
        let errorMessage = 'Erro desconhecido ao vincular.';
        if (err && typeof err === 'object') {
          errorMessage = err.message || err.details || err.hint || JSON.stringify(err);
          if (errorMessage === '{}') {
            // Se ainda for {}, tenta pegar propriedades específicas que podem não ser enumeráveis
            errorMessage = `Erro: ${err.code || 'sem código'} - ${err.message || 'sem mensagem'}`;
          }
        } else {
          errorMessage = String(err);
        }
        
        setNotification({ type: 'error', message: `Erro ao vincular: ${errorMessage}` });
      } finally {
        setIsLinking(false);
      }
    } else {
      // For new product, just update the state
      setNewProduct({ ...newProduct, linked_product_id: targetProductId });
      setShowLinkModal(false);
      setNotification({ type: 'success', message: 'Produto selecionado para vínculo!' });
    }
  };

  const openEditModal = (product: any) => {
    setEditingProduct({ 
      ...product,
      eans: product.ean ? product.ean.split(',').map((e: string) => e.trim()) : [''],
      originalCount: product.count || 0,
      is_mother: product.is_mother || false,
      units_per_mother: product.units_per_mother || 1
    });
    setIsAddingNew({
      location: false,
      category: false,
      subcategory: false,
      brand: false
    });
    setShowEditModal(true);
    setShowDeleteConfirm(false);
  };

  const handleDeleteProduct = async () => {
    if (!editingProduct) return;

    setEditStatus('loading');
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', editingProduct.id);

      if (error) throw error;

      setEditStatus('success');
      
      setTimeout(() => {
        setShowEditModal(false);
        setShowDeleteConfirm(false);
        setEditStatus('idle');
        fetchProducts();
      }, 1500);
    } catch (err: any) {
      console.log('Erro ao excluir:', err);
      setEditStatus('error');
      setEditError(err.message || 'Erro ao excluir produto.');
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        'nome': 'Exemplo de Produto',
        'código EAN': '7891234567890',
        'código interno': 'SKU-001',
        'estoque': 10,
        'preço': 49.90,
        'localização': 'Corredor A, Prateleira 1',
        'categoria': 'Utilidades',
        'subcategoria': 'Cozinha',
        'marca': 'Mizumoto'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "modelo_importacao_estoque.xlsx");
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isConfigured) {
      setNotification({ type: 'error', message: 'O banco de dados não está configurado. Por favor, adicione as chaves no menu Settings.' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    if (file.size === 0) {
      setNotification({ type: 'error', message: 'O arquivo selecionado está vazio.' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    // Validação de tipo de arquivo para evitar upload de imagens no botão de importar planilha
    if (file.type.startsWith('image/')) {
      setNotification({ type: 'error', message: 'Este botão é para importar planilhas (.csv, .xlsx, .xml). Para carregar uma imagem de produto, use o botão de imagem dentro do cadastro do produto.' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    setImporting(true);
    const reader = new FileReader();
    const fileName = file.name.toLowerCase();
    
    reader.onerror = () => {
      console.error('FileReader error:', reader.error);
      setNotification({ type: 'error', message: 'Erro ao ler o arquivo do seu computador.' });
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setNotification(null), 5000);
    };

    reader.onload = async (e) => {
      try {
        let rawData: any[] = [];

        if (fileName.endsWith('.xml')) {
          const xmlContent = e.target?.result as string;
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_"
          });
          const jsonObj = parser.parse(xmlContent);
          
          if (jsonObj.products && jsonObj.products.product) {
            rawData = Array.isArray(jsonObj.products.product) ? jsonObj.products.product : [jsonObj.products.product];
          } else if (jsonObj.root && jsonObj.root.product) {
            rawData = Array.isArray(jsonObj.root.product) ? jsonObj.root.product : [jsonObj.root.product];
          } else if (Array.isArray(jsonObj.product)) {
            rawData = jsonObj.product;
          } else if (jsonObj.product) {
            rawData = [jsonObj.product];
          }
        } else if (fileName.endsWith('.csv')) {
          const csvContent = e.target?.result as string;
          const results = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
          rawData = results.data;
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          rawData = XLSX.utils.sheet_to_json(worksheet);
        }

        if (rawData.length === 0) {
          throw new Error('Nenhum dado encontrado no arquivo. Verifique o formato e as colunas.');
        }

        const mappedProducts = rawData.map((p: any, index: number) => {
          // Normalização ultra-robusta: remove acentos, caracteres especiais e espaços
          const normalize = (str: any) => {
            if (str === null || str === undefined) return "";
            return String(str)
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "") // Remove acentos
              .replace(/[^a-z0-9]/g, "") // Remove tudo que não for letra ou número (espaços, traços, etc)
              .trim();
          };

          const getVal = (keys: string[], defaultVal: string = "") => {
            const normalizedTargets = keys.map(normalize);
            // Procura uma chave que, quando normalizada, esteja na nossa lista de alvos
            const foundKey = Object.keys(p).find(k => 
              normalizedTargets.includes(normalize(k))
            );
            
            const val = foundKey ? p[foundKey] : undefined;
            if (val === undefined || val === null || val === "") return defaultVal;
            return String(val).trim();
          };

          const sku = getVal(['código interno', 'codigo interno', 'sku', 'code', 'internal_code', 'referencia', 'cod interno'], `SKU-${Math.random().toString(36).substr(2, 9)}`);
          const countStr = getVal(['estoque', 'quantidade', 'count', 'quantity', 'stock', 'qtd'], '0');
          const count = parseInt(countStr);
          
          const mapped = {
            sku: sku,
            name: getVal(['nome', 'name', 'title', 'description', 'produto', 'item'], 'Produto Sem Nome'),
            image: getVal(['imagem', 'image', 'img', 'url', 'foto'], ''),
            status: getVal(['status'], (count > 0 ? 'Em Estoque' : 'Fora de Estoque')),
            count: isNaN(count) ? 0 : count,
            price: (() => {
              const pStr = getVal(['preço', 'preco', 'price', 'valor', 'venda'], '0').replace(',', '.');
              const pVal = parseFloat(pStr);
              return isNaN(pVal) ? 0 : pVal;
            })(),
            location: getVal(['localização', 'localizacao', 'location', 'warehouse', 'posicao', 'endereco'], 'Não atribuído'),
            ean: getVal(['código ean', 'codigo ean', 'ean', 'barcode', 'gtin', 'ean13', 'cod ean', 'cod barras'], ''),
            internal_code: sku,
            category: getVal(['categoria', 'category', 'grupo', 'departamento', 'secao'], 'Geral'),
            subcategory: getVal(['subcategoria', 'subcategory', 'subgrupo', 'sessao', 'subsecao'], 'Geral'),
            brand: getVal(['marca', 'brand', 'fabricante', 'brand_name'], 'Geral'),
            is_featured: false,
            is_side: false,
            is_low: count < 5
          };

          if (index === 0) {
            console.log('--- DEBUG IMPORTAÇÃO (LINHA 1) ---');
            console.log('Colunas detectadas no arquivo:', Object.keys(p));
            console.log('Dados mapeados:', mapped);
          }
          return mapped;
        });

        console.log(`Importando ${mappedProducts.length} produtos...`, mappedProducts);

        const { error } = await supabase
          .from('products')
          .upsert(mappedProducts, { onConflict: 'sku' });

        if (error) throw error;

        setNotification({ 
          type: 'success', 
          message: `SUCESSO: ${mappedProducts.length} produtos importados ou atualizados com sucesso!` 
        });
        fetchProducts();
      } catch (err: any) {
        console.error('Erro ao importar arquivo:', err);
        setNotification({ 
          type: 'error', 
          message: `ERRO NA IMPORTAÇÃO: ${err.message || 'Verifique o formato e as colunas da planilha.'}` 
        });
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(() => setNotification(null), 5000);
      }
    };

    try {
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        reader.readAsArrayBuffer(file);
      } else if (fileName.endsWith('.csv') || fileName.endsWith('.xml')) {
        reader.readAsText(file);
      } else {
        throw new Error('Formato de arquivo não suportado. Use .xlsx, .xls, .csv ou .xml');
      }
    } catch (err: any) {
      console.error('Error starting file read:', err);
      setImporting(false);
      setNotification({ type: 'error', message: `Erro ao ler o arquivo: ${err.message}` });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Global search
      const query = searchQuery.toLowerCase();
      const matchesGlobal = !query || 
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        p.location.toLowerCase().includes(query) ||
        (p.ean && p.ean.includes(query)) ||
        (p.internalCode && p.internalCode.toLowerCase().includes(query)) ||
        (p.category && p.category.toLowerCase().includes(query)) ||
        (p.subcategory && p.subcategory.toLowerCase().includes(query)) ||
        (p.brand && p.brand.toLowerCase().includes(query));

      return matchesGlobal;
    });
  }, [searchQuery, products]);

  return (
    <div className="min-h-screen brand-texture">
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -100 }}
            animate={{ opacity: 1, y: 24 }}
            exit={{ opacity: 0, y: -100 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md"
          >
            <div className={cn(
              "mx-4 p-4 rounded-xl shadow-2xl border flex items-center gap-3",
              notification.type === 'success' 
                ? "bg-white border-green-100 text-green-800" 
                : "bg-white border-red-100 text-red-800"
            )}>
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                notification.type === 'success' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
              )}>
                {notification.type === 'success' ? <CheckCircle2 size={20} /> : <X size={20} />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">{notification.type === 'success' ? 'Sucesso!' : 'Erro'}</p>
                <p className="text-xs opacity-80">{notification.message}</p>
              </div>
              <button onClick={() => setNotification(null)} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <X size={16} className="text-slate-400" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
        <main className={cn(
          "flex-1 transition-all duration-300",
          "ml-0 md:transition-all",
          isSidebarCollapsed ? "md:ml-20" : "md:ml-64"
        )}>
          <TopNav searchQuery={searchQuery} onSearchChange={setSearchQuery} />
          <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-4 md:space-y-8 pb-24 md:pb-8">
            {activeTab === 'Inventory' ? (
                <InventoryManager 
                  products={products}
                  loading={loading}
                  isConfigured={isConfigured}
                  importing={importing}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  onAdd={() => setShowAddModal(true)}
                  onEdit={openEditModal}
                  onViewLink={handleViewLink}
                  onStockUpdate={handleStockUpdate}
                  onFileImport={handleFileImport}
                  onDownloadTemplate={downloadTemplate}
                  stockFileInputRef={stockFileInputRef}
                  fileInputRef={fileInputRef}
                  setShowStockUpdateChoiceModal={setShowStockUpdateChoiceModal}
                />
            ) : activeTab === 'Requisições' ? (
                <RequestCenter 
                  requests={requests}
                  onAddRequest={() => {
                    setShowAddRequestModal(true);
                    setFoundProductForRequest(null);
                    setRequestSearchQuery({ sku: '', ean: '' });
                    setRequestDraftChanges({});
                    setEditingField(null);
                  }}
                  onEditRequest={(request) => {
                    const changes = JSON.parse(request.requested_changes);
                    if (changes.is_new_product) {
                      setIsRequestingNewProduct(true);
                      setNewProductRequest(changes);
                    } else {
                      setIsRequestingNewProduct(false);
                      setFoundProductForRequest(request.products);
                      setRequestDraftChanges(changes);
                    }
                    setShowAddRequestModal(true);
                  }}
                  onApproveRequest={(id) => setShowRequestConfirmModal({ show: true, requestId: id })}
                  onDeleteRequest={handleDeleteRequest}
                />
            ) : activeTab === 'Entrada de Mercadoria' ? (
                <LogisticsCenter
                  importing={importing}
                  onImportClick={() => {
                    setShowImportSupplierModal(true);
                    fetchSuppliers();
                  }}
                  onManualNoteClick={() => {
                    setShowManualNoteModal(true);
                    setNoteItems([]);
                    setNoteSearchQuery('');
                    fetchSuppliers();
                  }}
                  onSuppliersClick={() => {
                    setShowSuppliersModal(true);
                    fetchSuppliers();
                  }}
                  reviewNotes={reviewNotes}
                  onViewReviewNote={(note) => {
                    setViewingReviewNote(note);
                    setViewingNoteSellPrices(note.items.map((item: any) => item.product_price || 0));
                    setViewingNoteVerified(note.items.map((item: any) => item.verified || false));
                    setViewingNoteReviewTimestamps(note.items.map((item: any) => item.review_timestamp || null));
                  }}
                />
            ) : activeTab === 'Pedidos de Compra' ? (
                <PurchaseOrderManager />
            ) : (
              <div className="flex flex-col items-center justify-center py-40 text-slate-400">
                <BarChart3 size={64} className="mb-4 opacity-20" />
                <p className="text-xl font-bold">Em breve...</p>
                <p className="text-sm">A aba {activeTab} está sendo preparada.</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Bottom navigation — mobile only */}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Edit Product Modal */}
      <AnimatePresence>
        {showEditModal && editingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowEditModal(false);
                setIsAddingNew({ location: false, category: false, subcategory: false, brand: false });
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-manrope font-extrabold text-on-surface">Editar Produto</h2>
                <button 
                  onClick={() => {
                    setShowEditModal(false);
                    setIsAddingNew({ location: false, category: false, subcategory: false, brand: false });
                  }}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-secondary" />
                </button>
              </div>
              
              <form onSubmit={handleEditProduct} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                {editStatus === 'success' && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm font-bold flex items-center gap-2"
                  >
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                    Produto atualizado com sucesso!
                  </motion.div>
                )}

                {editStatus === 'error' && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium"
                  >
                    {editError}
                  </motion.div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">SKU (Código Interno)</label>
                    <input 
                      type="text" 
                      value={editingProduct.sku}
                      onChange={(e) => setEditingProduct({...editingProduct, sku: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Nome do Produto</label>
                    <input 
                      required
                      type="text" 
                      value={editingProduct.name}
                      onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Código EAN</label>
                    <div className="space-y-2">
                      {(editingProduct.eans || [editingProduct.ean || '']).map((ean: string, index: number) => (
                        <div key={index} className="flex gap-2">
                          <input 
                            type="text" 
                            value={ean}
                            onChange={(e) => {
                              const newEans = [...(editingProduct.eans || [editingProduct.ean || ''])];
                              newEans[index] = e.target.value;
                              setEditingProduct({...editingProduct, eans: newEans});
                            }}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                            placeholder="Código de barras..."
                          />
                          {index === 0 ? (
                            <button 
                              type="button"
                              onClick={() => setEditingProduct({...editingProduct, eans: [...(editingProduct.eans || [editingProduct.ean || '']), '']})}
                              className="w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center hover:bg-primary/20 transition-all"
                            >
                              <Plus size={18} />
                            </button>
                          ) : (
                            <button 
                              type="button"
                              onClick={() => {
                                const newEans = (editingProduct.eans || [editingProduct.ean || '']).filter((_: any, i: number) => i !== index);
                                setEditingProduct({...editingProduct, eans: newEans});
                              }}
                              className="w-10 bg-red-50 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-100 transition-all"
                            >
                              <X size={18} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Quantidade em Estoque</label>
                    <input 
                      type="number" 
                      value={isNaN(editingProduct.count) ? 0 : editingProduct.count}
                      onChange={(e) => setEditingProduct({...editingProduct, count: parseInt(e.target.value || '0') || 0})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Preço (R$)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={isNaN(editingProduct.price) ? 0 : (editingProduct.price || 0)}
                      onChange={(e) => setEditingProduct({...editingProduct, price: parseFloat(e.target.value || '0') || 0})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Localização</label>
                    <SearchableSelect 
                      value={editingProduct.location}
                      onChange={(val) => setEditingProduct({...editingProduct, location: val})}
                      options={uniqueLocations}
                      placeholder="Pesquisar localização..."
                      isAddingNew={isAddingNew.location}
                      onToggleAddingNew={() => toggleAddingNew('location')}
                      addNewPlaceholder="Nova localização..."
                      defaultValue="Não atribuído"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Status</label>
                    <select 
                      value={editingProduct.status}
                      onChange={(e) => setEditingProduct({...editingProduct, status: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    >
                      <option value="Em Estoque">Em Estoque</option>
                      <option value="Estoque em Alta">Estoque em Alta</option>
                      <option value="Estoque Baixo">Estoque Baixo</option>
                      <option value="Fora de Estoque">Fora de Estoque</option>
                    </select>
                  </div>
                  
                  <div className="md:col-span-2 p-4 bg-purple-50 rounded-2xl border border-purple-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-purple-700">
                        <LinkIcon size={18} />
                        <span className="text-sm font-bold">Relacionamento Mãe/Filho</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={editingProduct.is_mother}
                          onChange={(e) => setEditingProduct({...editingProduct, is_mother: e.target.checked})}
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                        <span className="ml-3 text-xs font-bold text-purple-700 uppercase">Produto Mãe</span>
                      </label>
                    </div>

                    {editingProduct.is_mother && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-4 pt-2 border-t border-purple-100"
                      >
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-purple-700 uppercase">Unidades por Mãe (Ex: 50un na caixa)</label>
                          <input 
                            type="number" 
                            value={editingProduct.units_per_mother}
                            onChange={(e) => setEditingProduct({...editingProduct, units_per_mother: parseInt(e.target.value || '1') || 1})}
                            className="w-full bg-white border border-purple-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                            placeholder="Ex: 50"
                          />
                        </div>
                        <p className="text-[10px] text-purple-600 italic">
                          * Ao aumentar o estoque deste produto, o estoque do produto vinculado aumentará proporcionalmente.
                        </p>
                      </motion.div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Categoria</label>
                    <SearchableSelect 
                      value={editingProduct.category}
                      onChange={(val) => setEditingProduct({...editingProduct, category: val})}
                      options={uniqueCategories}
                      placeholder="Pesquisar categoria..."
                      isAddingNew={isAddingNew.category}
                      onToggleAddingNew={() => toggleAddingNew('category')}
                      addNewPlaceholder="Nova categoria..."
                      defaultValue="Geral"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Subcategoria</label>
                    <SearchableSelect 
                      value={editingProduct.subcategory}
                      onChange={(val) => setEditingProduct({...editingProduct, subcategory: val})}
                      options={uniqueSubcategories}
                      placeholder="Pesquisar subcategoria..."
                      isAddingNew={isAddingNew.subcategory}
                      onToggleAddingNew={() => toggleAddingNew('subcategory')}
                      addNewPlaceholder="Nova subcategoria..."
                      defaultValue="Geral"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Marca</label>
                    <SearchableSelect 
                      value={editingProduct.brand}
                      onChange={(val) => setEditingProduct({...editingProduct, brand: val})}
                      options={uniqueBrands}
                      placeholder="Pesquisar marca..."
                      isAddingNew={isAddingNew.brand}
                      onToggleAddingNew={() => toggleAddingNew('brand')}
                      addNewPlaceholder="Nova marca..."
                      defaultValue="Geral"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">URL da Imagem</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={editingProduct.image}
                        onChange={(e) => setEditingProduct({...editingProduct, image: e.target.value})}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        placeholder="https://..."
                      />
                      <input 
                        type="file" 
                        ref={editImageInputRef}
                        onChange={(e) => handleImageUpload(e, true)}
                        className="hidden" 
                        accept="image/*"
                      />
                      <button 
                        type="button"
                        onClick={() => editImageInputRef.current?.click()}
                        disabled={uploading}
                        className="px-4 bg-slate-100 border border-slate-200 rounded-lg text-secondary hover:bg-slate-200 transition-all flex items-center justify-center shrink-0"
                        title="Upload do computador"
                      >
                        {uploading ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <ImageIcon size={18} />}
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 flex flex-col gap-3">
                  <div className="flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setShowEditModal(false)}
                      className="flex-1 bg-slate-100 text-secondary font-bold py-3 rounded-xl hover:bg-slate-200 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        setLinkTarget('editing');
                        setShowLinkModal(true);
                      }}
                      className="flex-1 bg-red-50 text-red-500 font-bold py-3 rounded-xl hover:bg-red-100 transition-colors border border-red-100 flex items-center justify-center gap-2"
                    >
                      <LinkIcon size={18} />
                      {editingProduct.linked_product_id ? 'Alterar vínculo' : 'Vincular produto'}
                    </button>
                    <button 
                      type="submit"
                      disabled={editStatus === 'loading' || editStatus === 'success'}
                      className="flex-1 bg-primary text-white font-bold py-3 rounded-xl hover:opacity-90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
                    >
                      {editStatus === 'loading' ? 'Salvando...' : editStatus === 'success' ? 'Sucesso!' : 'Salvar Alterações'}
                    </button>
                  </div>
                  
                  {!showDeleteConfirm ? (
                    <button 
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full text-red-500 text-[10px] font-bold uppercase tracking-wider hover:underline py-2"
                    >
                      Excluir Produto
                    </button>
                  ) : (
                    <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex flex-col gap-3">
                      <p className="text-xs text-red-700 font-bold text-center uppercase">Confirmar Exclusão?</p>
                      <div className="flex gap-2">
                        <button 
                          type="button"
                          onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 bg-white border border-slate-200 text-secondary text-[10px] font-bold py-2 rounded uppercase"
                        >
                          Não, Manter
                        </button>
                        <button 
                          type="button"
                          onClick={handleDeleteProduct}
                          className="flex-1 bg-red-500 text-white text-[10px] font-bold py-2 rounded uppercase"
                        >
                          Sim, Excluir
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Request Modal */}
      <AnimatePresence>
        {showAddRequestModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddRequestModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h2 className="text-xl font-black text-slate-900">Nova Requisição</h2>
                  <p className="text-xs text-slate-500 font-medium">
                    {isRequestingNewProduct ? "Cadastre um novo produto para requisição" : "Busque um produto para solicitar alterações"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsRequestingNewProduct(!isRequestingNewProduct)}
                    className={cn(
                      "p-2 rounded-full transition-all flex items-center gap-2 px-3",
                      isRequestingNewProduct ? "bg-primary text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    )}
                    title={isRequestingNewProduct ? "Voltar para busca" : "Adicionar produto não cadastrado"}
                  >
                    <Plus size={20} />
                    {isRequestingNewProduct && <span className="text-xs font-bold">Novo Produto</span>}
                  </button>
                  <button onClick={() => setShowAddRequestModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                    <X size={20} className="text-slate-400" />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                {!isRequestingNewProduct ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-secondary uppercase">SKU</label>
                        <div className="relative">
                          <input 
                            type="text" 
                            value={requestSearchQuery.sku}
                            onChange={(e) => handleSearchProductForRequest('sku', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="Digite o SKU..."
                          />
                          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-secondary uppercase">Código EAN</label>
                        <div className="relative">
                          <input 
                            type="text" 
                            value={requestSearchQuery.ean}
                            onChange={(e) => handleSearchProductForRequest('ean', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="Digite o EAN..."
                          />
                          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                      </div>
                    </div>

                    {foundProductForRequest && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6 pt-6 border-t border-slate-100"
                      >
                        <div className="flex gap-6">
                          <div className="w-32 h-32 rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0">
                            <ProductImage src={foundProductForRequest.image} alt={foundProductForRequest.name} />
                          </div>
                          <div className="flex-1 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                              {[
                                { label: 'Nome', key: 'name' },
                                { label: 'Preço (R$)', key: 'price' },
                                { label: 'Localização', key: 'location' },
                                { label: 'Categoria', key: 'category' },
                                { label: 'Subcategoria', key: 'subcategory' },
                                { label: 'Marca', key: 'brand' },
                                { label: 'Estoque', key: 'count' }
                              ].map((field) => (
                                <div key={field.key} className="space-y-1">
                                  <label className="text-[10px] font-bold text-secondary uppercase">{field.label}</label>
                                  <div className="flex items-center gap-2 group">
                                    {editingField === field.key ? (
                                      <div className="flex items-center gap-2 flex-1">
                                        <input 
                                          autoFocus
                                          type={field.key === 'price' || field.key === 'count' ? 'number' : 'text'}
                                          value={isNaN(requestDraftChanges[field.key] ?? foundProductForRequest[field.key]) ? "" : (requestDraftChanges[field.key] ?? foundProductForRequest[field.key])}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setRequestDraftChanges({
                                              ...requestDraftChanges,
                                              [field.key]: field.key === 'price' || field.key === 'count' ? (parseFloat(val) || 0) : val
                                            });
                                          }}
                                          className="flex-1 bg-white border border-primary rounded px-2 py-1 text-sm focus:outline-none"
                                        />
                                        <button 
                                          onClick={() => setEditingField(null)}
                                          className="p-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                                        >
                                          <Check size={14} />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 flex-1">
                                        <span className={cn(
                                          "text-sm font-medium",
                                          requestDraftChanges[field.key] !== undefined ? "text-red-500 font-bold" : "text-slate-700"
                                        )}>
                                          {requestDraftChanges[field.key] ?? foundProductForRequest[field.key]}
                                        </span>
                                        <button 
                                          onClick={() => setEditingField(field.key)}
                                          className="p-1 text-slate-400 hover:text-primary opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                          <Edit2 size={14} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-secondary uppercase">SKU (Obrigatório se EAN vazio)</label>
                      <input 
                        type="text" 
                        value={newProductRequest.sku}
                        onChange={(e) => setNewProductRequest({...newProductRequest, sku: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="ex: BM-500-A4"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-secondary uppercase">Código EAN (Obrigatório se SKU vazio)</label>
                      <div className="space-y-2">
                        {(newProductRequest.eans || [newProductRequest.ean || '']).map((ean: string, index: number) => (
                          <div key={index} className="flex gap-2">
                            <input 
                              type="text" 
                              value={ean}
                              onChange={(e) => {
                                const newEans = [...(newProductRequest.eans || [newProductRequest.ean || ''])];
                                newEans[index] = e.target.value;
                                setNewProductRequest({...newProductRequest, eans: newEans});
                              }}
                              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                              placeholder="789..."
                            />
                            {index === 0 ? (
                              <button 
                                type="button"
                                onClick={() => setNewProductRequest({...newProductRequest, eans: [...(newProductRequest.eans || [newProductRequest.ean || '']), '']})}
                                className="w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center hover:bg-primary/20 transition-all"
                              >
                                <Plus size={18} />
                              </button>
                            ) : (
                              <button 
                                type="button"
                                onClick={() => {
                                  const newEans = (newProductRequest.eans || [newProductRequest.ean || '']).filter((_: any, i: number) => i !== index);
                                  setNewProductRequest({...newProductRequest, eans: newEans});
                                }}
                                className="w-10 bg-red-50 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-100 transition-all"
                              >
                                <X size={18} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-[10px] font-bold text-secondary uppercase">Nome do Produto (Obrigatório)</label>
                      <input 
                        type="text" 
                        value={newProductRequest.name}
                        onChange={(e) => setNewProductRequest({...newProductRequest, name: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="ex: Batedeira Prática Master"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-secondary uppercase">Quantidade</label>
                      <input 
                        type="number" 
                        value={newProductRequest.count}
                        onChange={(e) => setNewProductRequest({...newProductRequest, count: parseInt(e.target.value || '0') || 0})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-secondary uppercase">Preço (R$)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={newProductRequest.price}
                        onChange={(e) => setNewProductRequest({...newProductRequest, price: parseFloat(e.target.value || '0') || 0})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <div className="md:col-span-2 p-4 bg-purple-50 rounded-2xl border border-purple-100 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-purple-700">
                          <LinkIcon size={18} />
                          <span className="text-sm font-bold">Relacionamento Mãe/Filho</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={newProductRequest.is_mother}
                            onChange={(e) => setNewProductRequest({...newProductRequest, is_mother: e.target.checked})}
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                          <span className="ml-3 text-xs font-bold text-purple-700 uppercase">Produto Mãe</span>
                        </label>
                      </div>

                      {newProductRequest.is_mother && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-4 pt-2 border-t border-purple-100"
                        >
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-purple-700 uppercase">Unidades por Mãe (Ex: 50un na caixa)</label>
                            <input 
                              type="number" 
                              value={newProductRequest.units_per_mother}
                              onChange={(e) => setNewProductRequest({...newProductRequest, units_per_mother: parseInt(e.target.value || '1') || 1})}
                              className="w-full bg-white border border-purple-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                              placeholder="Ex: 50"
                            />
                          </div>
                        </motion.div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-secondary uppercase">Categoria</label>
                      <SearchableSelect 
                        value={newProductRequest.category}
                        onChange={(val) => setNewProductRequest({...newProductRequest, category: val})}
                        options={uniqueCategories}
                        placeholder="Categoria..."
                        isAddingNew={isAddingNew.category}
                        onToggleAddingNew={() => toggleAddingNew('category')}
                        addNewPlaceholder="Nova categoria..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-secondary uppercase">Subcategoria</label>
                      <SearchableSelect 
                        value={newProductRequest.subcategory}
                        onChange={(val) => setNewProductRequest({...newProductRequest, subcategory: val})}
                        options={uniqueSubcategories}
                        placeholder="Subcategoria..."
                        isAddingNew={isAddingNew.subcategory}
                        onToggleAddingNew={() => toggleAddingNew('subcategory')}
                        addNewPlaceholder="Nova subcategoria..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-secondary uppercase">Marca</label>
                      <SearchableSelect 
                        value={newProductRequest.brand}
                        onChange={(val) => setNewProductRequest({...newProductRequest, brand: val})}
                        options={uniqueBrands}
                        placeholder="Marca..."
                        isAddingNew={isAddingNew.brand}
                        onToggleAddingNew={() => toggleAddingNew('brand')}
                        addNewPlaceholder="Nova marca..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-secondary uppercase">Localização</label>
                      <SearchableSelect 
                        value={newProductRequest.location}
                        onChange={(val) => setNewProductRequest({...newProductRequest, location: val})}
                        options={uniqueLocations}
                        placeholder="Localização..."
                        isAddingNew={isAddingNew.location}
                        onToggleAddingNew={() => toggleAddingNew('location')}
                        addNewPlaceholder="Nova localização..."
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-[10px] font-bold text-secondary uppercase">Observação</label>
                      <textarea 
                        value={newProductRequest.observation}
                        onChange={(e) => setNewProductRequest({...newProductRequest, observation: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[100px]"
                        placeholder="Escreva qualquer informação adicional aqui..."
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => {
                    setShowAddRequestModal(false);
                    setIsRequestingNewProduct(false);
                  }}
                  className="flex-1 bg-white border border-slate-200 text-secondary font-bold py-3 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    setFoundProductForRequest(null);
                    setRequestSearchQuery({ sku: '', ean: '' });
                    setRequestDraftChanges({});
                    setEditingField(null);
                  }}
                  className="flex-1 bg-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-300 transition-colors"
                >
                  Nova
                </button>
                <button 
                  disabled={savingRequest || (!isRequestingNewProduct && (!foundProductForRequest || Object.keys(requestDraftChanges).length === 0))}
                  onClick={handleSaveRequest}
                  className="flex-1 bg-primary text-white font-bold py-3 rounded-xl hover:opacity-90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingRequest ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
                  ) : (
                    'Confirmar'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Request Confirmation Modal */}
      <AnimatePresence>
        {showRequestConfirmModal.show && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center"
            >
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <RefreshCw size={32} />
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-2">Confirmar Alteração</h3>
              <p className="text-sm text-slate-500 mb-6 font-medium">Certeza que deseja prosseguir com a alteração no produto?</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowRequestConfirmModal({ show: false, requestId: null })}
                  className="flex-1 bg-slate-100 text-secondary font-bold py-3 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Não
                </button>
                <button 
                  onClick={() => showRequestConfirmModal.requestId && handleApproveRequest(showRequestConfirmModal.requestId)}
                  className="flex-1 bg-primary text-white font-bold py-3 rounded-xl hover:opacity-90 transition-colors shadow-lg shadow-primary/20"
                >
                  Sim
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowAddModal(false);
                setIsAddingNew({ location: false, category: false, subcategory: false, brand: false });
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-manrope font-extrabold text-on-surface">Adicionar Novo Produto</h2>
                <button 
                  onClick={() => {
                    setShowAddModal(false);
                    setIsAddingNew({ location: false, category: false, subcategory: false, brand: false });
                  }}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-secondary" />
                </button>
              </div>
              
              <form onSubmit={handleAddProduct} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                {addStatus === 'success' && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm font-bold flex items-center gap-2"
                  >
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                    Produto adicionado com sucesso! Fechando...
                  </motion.div>
                )}

                {addStatus === 'error' && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium"
                  >
                    {addError}
                  </motion.div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">SKU (Obrigatório)</label>
                    <input 
                      required
                      type="text" 
                      value={newProduct.sku}
                      onChange={(e) => setNewProduct({...newProduct, sku: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="ex: BM-500-A4"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Nome do Produto (Obrigatório)</label>
                    <input 
                      required
                      type="text" 
                      value={newProduct.name}
                      onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="ex: Batedeira Prática Master"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Código EAN</label>
                    <div className="space-y-2">
                      {(newProduct.eans || [newProduct.ean || '']).map((ean: string, index: number) => (
                        <div key={index} className="flex gap-2">
                          <input 
                            type="text" 
                            value={ean}
                            onChange={(e) => {
                              const newEans = [...(newProduct.eans || [newProduct.ean || ''])];
                              newEans[index] = e.target.value;
                              setNewProduct({...newProduct, eans: newEans});
                            }}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                            placeholder="789..."
                          />
                          {index === 0 ? (
                            <button 
                              type="button"
                              onClick={() => setNewProduct({...newProduct, eans: [...(newProduct.eans || [newProduct.ean || '']), '']})}
                              className="w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center hover:bg-primary/20 transition-all"
                            >
                              <Plus size={18} />
                            </button>
                          ) : (
                            <button 
                              type="button"
                              onClick={() => {
                                const newEans = (newProduct.eans || [newProduct.ean || '']).filter((_: any, i: number) => i !== index);
                                setNewProduct({...newProduct, eans: newEans});
                              }}
                              className="w-10 bg-red-50 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-100 transition-all"
                            >
                              <X size={18} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Quantidade Inicial</label>
                    <input 
                      type="number" 
                      value={isNaN(newProduct.count) ? 0 : newProduct.count}
                      onChange={(e) => setNewProduct({...newProduct, count: parseInt(e.target.value || '0') || 0})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Preço (R$)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={isNaN(newProduct.price) ? 0 : newProduct.price}
                      onChange={(e) => setNewProduct({...newProduct, price: parseFloat(e.target.value || '0') || 0})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Localização</label>
                    <SearchableSelect 
                      value={newProduct.location}
                      onChange={(val) => setNewProduct({...newProduct, location: val})}
                      options={uniqueLocations}
                      placeholder="Pesquisar localização..."
                      isAddingNew={isAddingNew.location}
                      onToggleAddingNew={() => toggleAddingNew('location')}
                      addNewPlaceholder="Nova localização..."
                      defaultValue="Não atribuído"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Status</label>
                    <select 
                      value={newProduct.status}
                      onChange={(e) => setNewProduct({...newProduct, status: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    >
                      <option value="Em Estoque">Em Estoque</option>
                      <option value="Estoque em Alta">Estoque em Alta</option>
                      <option value="Estoque Baixo">Estoque Baixo</option>
                      <option value="Fora de Estoque">Fora de Estoque</option>
                    </select>
                  </div>

                  <div className="md:col-span-2 p-4 bg-purple-50 rounded-2xl border border-purple-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-purple-700">
                        <LinkIcon size={18} />
                        <span className="text-sm font-bold">Relacionamento Mãe/Filho</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={newProduct.is_mother}
                          onChange={(e) => setNewProduct({...newProduct, is_mother: e.target.checked})}
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                        <span className="ml-3 text-xs font-bold text-purple-700 uppercase">Produto Mãe</span>
                      </label>
                    </div>

                    {newProduct.is_mother && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-4 pt-2 border-t border-purple-100"
                      >
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-purple-700 uppercase">Unidades por Mãe (Ex: 50un na caixa)</label>
                          <input 
                            type="number" 
                            value={newProduct.units_per_mother}
                            onChange={(e) => setNewProduct({...newProduct, units_per_mother: parseInt(e.target.value || '1') || 1})}
                            className="w-full bg-white border border-purple-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                            placeholder="Ex: 50"
                          />
                        </div>
                        
                        <div className="pt-2">
                          <button 
                            type="button"
                            onClick={() => {
                              setLinkTarget('new');
                              setShowLinkModal(true);
                            }}
                            className="flex items-center gap-2 text-purple-700 hover:text-purple-900 font-bold text-sm transition-colors"
                          >
                            <LinkIcon size={18} />
                            {newProduct.linked_product_id ? 'Alterar produto vinculado' : 'Vincular produto (Filho)'}
                          </button>
                          {newProduct.linked_product_id && (
                            <p className="text-[10px] text-purple-600 mt-1">
                              ID Vinculado: {newProduct.linked_product_id}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Categoria</label>
                    <SearchableSelect 
                      value={newProduct.category}
                      onChange={(val) => setNewProduct({...newProduct, category: val})}
                      options={uniqueCategories}
                      placeholder="Pesquisar categoria..."
                      isAddingNew={isAddingNew.category}
                      onToggleAddingNew={() => toggleAddingNew('category')}
                      addNewPlaceholder="Nova categoria..."
                      defaultValue="Geral"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Subcategoria</label>
                    <SearchableSelect 
                      value={newProduct.subcategory}
                      onChange={(val) => setNewProduct({...newProduct, subcategory: val})}
                      options={uniqueSubcategories}
                      placeholder="Pesquisar subcategoria..."
                      isAddingNew={isAddingNew.subcategory}
                      onToggleAddingNew={() => toggleAddingNew('subcategory')}
                      addNewPlaceholder="Nova subcategoria..."
                      defaultValue="Geral"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Marca</label>
                    <SearchableSelect 
                      value={newProduct.brand}
                      onChange={(val) => setNewProduct({...newProduct, brand: val})}
                      options={uniqueBrands}
                      placeholder="Pesquisar marca..."
                      isAddingNew={isAddingNew.brand}
                      onToggleAddingNew={() => toggleAddingNew('brand')}
                      addNewPlaceholder="Nova marca..."
                      defaultValue="Geral"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">URL da Imagem</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={newProduct.image}
                        onChange={(e) => setNewProduct({...newProduct, image: e.target.value})}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        placeholder="https://..."
                      />
                      <input 
                        type="file" 
                        ref={imageInputRef}
                        onChange={(e) => handleImageUpload(e, false)}
                        className="hidden" 
                        accept="image/*"
                      />
                      <button 
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={uploading}
                        className="px-4 bg-slate-100 border border-slate-200 rounded-lg text-secondary hover:bg-slate-200 transition-all flex items-center justify-center shrink-0"
                        title="Upload do computador"
                      >
                        {uploading ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <ImageIcon size={18} />}
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 bg-slate-100 text-secondary font-bold py-3 rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={adding || addStatus === 'success'}
                    className="flex-1 bg-primary text-white font-bold py-3 rounded-xl hover:opacity-90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
                  >
                    {adding ? 'Adicionando...' : addStatus === 'success' ? 'Sucesso!' : 'Adicionar Produto'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Link View Modal */}
      <AnimatePresence>
        {showLinkViewModal && linkViewData && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLinkViewModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-600/20">
                    <LinkIcon size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Vínculo de Produtos</h3>
                    <p className="text-xs text-slate-500 font-medium">Relacionamento entre Produto Mãe e Produto Filho</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowLinkViewModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-secondary" />
                </button>
              </div>

              <div className="p-8">
                <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                  {/* Mother Product */}
                  <div className="flex-1 w-full">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-purple-600 uppercase tracking-widest px-2 py-1 bg-purple-50 rounded-md">Produto Mãe</span>
                      {linkViewData.mother && (
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Fator: {linkViewData.mother.units_per_mother}un</span>
                      )}
                    </div>
                    {linkViewData.mother ? (
                      <div className="p-4 rounded-2xl border-2 border-purple-100 bg-purple-50/30 space-y-3">
                        <div className="w-20 h-20 bg-white rounded-xl overflow-hidden border border-purple-100 mx-auto">
                          <ProductImage src={linkViewData.mother.image} alt={linkViewData.mother.name} />
                        </div>
                        <div className="text-center">
                          <h4 className="font-bold text-slate-900 text-sm line-clamp-2 mb-1">{linkViewData.mother.name}</h4>
                          <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">SKU: {linkViewData.mother.sku}</p>
                          <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-white rounded-lg border border-purple-100">
                            <Package size={12} className="text-purple-500" />
                            <span className="text-xs font-black text-purple-700">{linkViewData.mother.count} un.</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
                        <Package size={32} className="mb-2 opacity-20" />
                        <p className="text-xs font-bold uppercase">Não vinculado</p>
                      </div>
                    )}
                  </div>

                  {/* Arrow */}
                  <div className="shrink-0 flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 border border-slate-100">
                      <ArrowRight size={24} className="md:rotate-0 rotate-90" />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Converte em</span>
                  </div>

                  {/* Child Product */}
                  <div className="flex-1 w-full">
                    <div className="mb-3">
                      <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest px-2 py-1 bg-red-50 rounded-md">Produto Filho</span>
                    </div>
                    {linkViewData.child ? (
                      <div className="p-4 rounded-2xl border-2 border-red-100 bg-red-50/30 space-y-3">
                        <div className="w-20 h-20 bg-white rounded-xl overflow-hidden border border-red-100 mx-auto">
                          <ProductImage src={linkViewData.child.image} alt={linkViewData.child.name} />
                        </div>
                        <div className="text-center">
                          <h4 className="font-bold text-slate-900 text-sm line-clamp-2 mb-1">{linkViewData.child.name}</h4>
                          <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">SKU: {linkViewData.child.sku}</p>
                          <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-white rounded-lg border border-red-100">
                            <Package size={12} className="text-red-500" />
                            <span className="text-xs font-black text-red-700">{linkViewData.child.count} un.</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
                        <Package size={32} className="mb-2 opacity-20" />
                        <p className="text-xs font-bold uppercase">Não vinculado</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-8 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-xs text-slate-500 leading-relaxed text-center">
                    Toda vez que você adicionar estoque ao <span className="font-bold text-purple-600">Produto Mãe</span>, 
                    o sistema adicionará automaticamente <span className="font-bold text-slate-900">{linkViewData.mother?.units_per_mother || 1} unidades</span> ao 
                    estoque do <span className="font-bold text-red-500">Produto Filho</span>.
                  </p>
                </div>
              </div>

              <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setShowLinkViewModal(false)}
                  className="px-8 py-3 bg-white border border-slate-200 text-secondary font-bold rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stock Update Choice Modal */}
      <AnimatePresence>
        {showStockUpdateChoiceModal && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowStockUpdateChoiceModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
                    <RefreshCw size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Atualizar Estoque</h3>
                    <p className="text-xs text-slate-500 font-medium">Escolha como deseja atualizar</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowStockUpdateChoiceModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-secondary" />
                </button>
              </div>

              <div className="p-6 grid grid-cols-1 gap-4">
                <button
                  onClick={() => {
                    setShowStockUpdateChoiceModal(false);
                    stockFileInputRef.current?.click();
                  }}
                  className="flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-100 hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500 group-hover:bg-blue-100 transition-colors">
                    <FileUp size={24} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 group-hover:text-primary">Importar Arquivo</p>
                    <p className="text-xs text-slate-500">XML, CSV ou Excel</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setShowStockUpdateChoiceModal(false);
                    setShowManualStockModal(true);
                  }}
                  className="flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-100 hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center text-green-500 group-hover:bg-green-100 transition-colors">
                    <Edit2 size={24} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 group-hover:text-primary">Atualizar Manualmente</p>
                    <p className="text-xs text-slate-500">Pesquise e altere o estoque</p>
                  </div>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manual Stock Update Modal */}
      <AnimatePresence>
        {showManualStockModal && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowManualStockModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center text-white shadow-lg shadow-green-600/20">
                    <Edit2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Atualização Manual</h3>
                    <p className="text-xs text-slate-500 font-medium">Pesquise o produto e informe a alteração</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowManualStockModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-secondary" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {!selectedManualProduct ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-secondary uppercase">Pesquisar Produto</label>
                        <div className="relative">
                          <input 
                            type="text" 
                            value={manualStockSearchQuery.name}
                            onChange={(e) => setManualStockSearchQuery({...manualStockSearchQuery, name: e.target.value})}
                            onKeyUp={(e) => e.key === 'Enter' && handleManualStockSearch()}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="Nome, SKU ou EAN..."
                          />
                          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={handleManualStockSearch}
                      className="w-full bg-primary text-white font-bold py-3 rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                    >
                      <Search size={18} />
                      Pesquisar
                    </button>

                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                      {manualStockSearchResults.length > 0 ? (
                        manualStockSearchResults.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedManualProduct(p)}
                            className="w-full flex items-center gap-4 p-3 rounded-xl border border-slate-100 hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
                          >
                            <div className="w-12 h-12 bg-slate-50 rounded-lg overflow-hidden shrink-0 border border-slate-100">
                              <ProductImage src={p.image} alt={p.name} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate group-hover:text-primary">{p.name}</p>
                              <p className="text-[10px] text-slate-500 font-medium">SKU: {p.sku} | Estoque: {p.count}</p>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all">
                              <ChevronDown size={16} className="-rotate-90" />
                            </div>
                          </button>
                        ))
                      ) : manualStockSearchQuery.name ? (
                        <div className="py-8 text-center text-slate-400">
                          <Search size={32} className="mx-auto mb-2 opacity-20" />
                          <p className="text-xs font-bold">Nenhum produto encontrado</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="w-16 h-16 bg-white rounded-xl overflow-hidden border border-slate-200 shrink-0">
                        <ProductImage src={selectedManualProduct.image} alt={selectedManualProduct.name} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-900 text-sm truncate">{selectedManualProduct.name}</h4>
                        <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">SKU: {selectedManualProduct.sku}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-500">Estoque Atual:</span>
                          <span className="text-xs font-black text-slate-900">{selectedManualProduct.count} un.</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => setSelectedManualProduct(null)}
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-secondary uppercase">Quantidade a Alterar</label>
                        <div className="flex items-center gap-4">
                          <button 
                            onClick={() => setManualStockChange(prev => prev - 1)}
                            className="w-12 h-12 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors border border-red-100"
                          >
                            -
                          </button>
                          <input 
                            type="number" 
                            value={manualStockChange}
                            onChange={(e) => setManualStockChange(parseInt(e.target.value) || 0)}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-center text-lg font-black focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <button 
                            onClick={() => setManualStockChange(prev => prev + 1)}
                            className="w-12 h-12 rounded-xl bg-green-50 text-green-500 flex items-center justify-center hover:bg-green-100 transition-colors border border-green-100"
                          >
                            +
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 text-center mt-2">
                          Use valores positivos para entrada e negativos para saída
                        </p>
                      </div>

                      {selectedManualProduct.is_mother && (
                        <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
                          <div className="flex items-center gap-2 mb-2">
                            <LinkIcon size={14} className="text-purple-500" />
                            <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">Produto Mãe Detectado</span>
                          </div>
                          <p className="text-xs text-purple-600 leading-relaxed">
                            Esta alteração afetará o produto filho vinculado. 
                            Cada unidade alterada aqui resultará em <span className="font-bold">{selectedManualProduct.units_per_mother} unidades</span> no produto filho.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button 
                        onClick={() => setSelectedManualProduct(null)}
                        className="flex-1 py-3 bg-white border border-slate-200 text-secondary font-bold rounded-xl hover:bg-slate-50 transition-colors"
                      >
                        Voltar
                      </button>
                      <button 
                        onClick={handleManualStockUpdate}
                        disabled={isUpdatingManualStock || manualStockChange === 0}
                        className="flex-[2] bg-primary text-white font-bold py-3 rounded-xl hover:opacity-90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                      >
                        {isUpdatingManualStock ? 'Atualizando...' : 'Confirmar Alteração'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Link Product Modal */}
      <AnimatePresence>
        {showLinkModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLinkModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center text-white shadow-lg shadow-red-500/20">
                    <LinkIcon size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Vincular Produto</h3>
                    <p className="text-xs text-slate-500 font-medium">Pesquise o produto que deseja vincular</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowLinkModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-secondary" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Código EAN</label>
                    <input 
                      type="text" 
                      value={linkSearchQuery.ean}
                      onChange={(e) => setLinkSearchQuery({...linkSearchQuery, ean: e.target.value})}
                      onKeyUp={(e) => e.key === 'Enter' && handleLinkSearch()}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="789..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Código SKU</label>
                    <input 
                      type="text" 
                      value={linkSearchQuery.sku}
                      onChange={(e) => setLinkSearchQuery({...linkSearchQuery, sku: e.target.value})}
                      onKeyUp={(e) => e.key === 'Enter' && handleLinkSearch()}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="ex: BM-500-A4"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Nome do Produto</label>
                    <input 
                      type="text" 
                      value={linkSearchQuery.name}
                      onChange={(e) => setLinkSearchQuery({...linkSearchQuery, name: e.target.value})}
                      onKeyUp={(e) => e.key === 'Enter' && handleLinkSearch()}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Nome do produto..."
                    />
                  </div>
                </div>

                <button 
                  onClick={handleLinkSearch}
                  className="w-full bg-primary text-white font-bold py-3 rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                >
                  <Search size={18} />
                  Pesquisar
                </button>

                <div className="space-y-2 mt-4 max-h-60 overflow-y-auto pr-2">
                  {linkSearchResults.length > 0 ? (
                    linkSearchResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleLinkProduct(p.id)}
                        disabled={isLinking}
                        className="w-full flex items-center gap-4 p-3 rounded-xl border border-slate-100 hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
                      >
                        <div className="w-12 h-12 bg-slate-50 rounded-lg overflow-hidden shrink-0 border border-slate-100">
                          <ProductImage src={p.image} alt={p.name} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate group-hover:text-primary">{p.name}</p>
                          <p className="text-[10px] text-slate-500 font-medium">SKU: {p.sku} | EAN: {p.ean}</p>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all">
                          <Check size={16} />
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="py-8 text-center text-slate-400">
                      <Search size={32} className="mx-auto mb-2 opacity-20" />
                      <p className="text-xs font-bold">Nenhum produto encontrado</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manual Note Modal */}
      <AnimatePresence>
        {showManualNoteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowManualNoteModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                    <LogIn size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Nota de Entrada Manual</h3>
                    <p className="text-xs text-slate-500 font-medium">Adicione itens e quantidades para processar a entrada</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-1 justify-end mr-4">
                  <div className="w-full max-w-xs space-y-1">
                    <label className="text-[10px] font-bold text-secondary uppercase">Fornecedor da Nota</label>
                    <select 
                      value={manualNoteSupplierId}
                      onChange={(e) => setManualNoteSupplierId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-bold"
                    >
                      <option value="">Selecione um fornecedor...</option>
                      {supplierNames.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button 
                  onClick={() => setShowManualNoteModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-secondary" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100">
                {/* Search Panel */}
                <div className="w-full md:w-1/2 p-6 overflow-y-auto">
                  <div className="space-y-4 mb-6 sticky top-0 bg-white pb-4 z-10 border-b border-slate-50">
                    <label className="text-[10px] font-bold text-secondary uppercase">Pesquisar Produto</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={noteSearchQuery}
                        onChange={(e) => setNoteSearchQuery(e.target.value)}
                        onKeyUp={(e) => e.key === 'Enter' && handleNoteSearch()}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Nome, SKU ou EAN..."
                      />
                      <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <button 
                        onClick={handleNoteSearch}
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-200 hover:bg-slate-300 p-2 rounded-lg transition-colors"
                      >
                        <Search size={16} className="text-slate-600" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {noteSearchResults.length > 0 ? (
                      noteSearchResults.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleAddProductToNote(p)}
                          className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
                        >
                          <div className="w-14 h-14 bg-slate-50 rounded-xl overflow-hidden shrink-0 border border-slate-100">
                            <ProductImage src={p.image} alt={p.name} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate group-hover:text-primary">{p.name}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{p.sku}</span>
                              <span className="text-xs font-medium text-slate-500">Estoque: {p.count}</span>
                            </div>
                          </div>
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all shrink-0">
                            <Plus size={16} />
                          </div>
                        </button>
                      ))
                    ) : noteSearchQuery ? (
                      <div className="py-12 text-center text-slate-400">
                        <ShoppingCart size={40} className="mx-auto mb-3 opacity-10" />
                        <p className="text-sm font-bold">Nenhum produto encontrado</p>
                      </div>
                    ) : (
                      <div className="py-12 text-center text-slate-400">
                        <Search size={40} className="mx-auto mb-3 opacity-10" />
                        <p className="text-sm font-bold">Pesquise para começar</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Note List Panel */}
                <div className="w-full md:w-1/2 p-6 flex flex-col bg-slate-50/50">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Itens da Nota ({noteItems.length})</h4>
                    {noteItems.length > 0 && (
                      <button 
                        onClick={() => setNoteItems([])}
                        className="text-[10px] font-bold text-red-500 uppercase hover:underline"
                      >
                        Limpar Tudo
                      </button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px]">
                    {noteItems.length > 0 ? (
                      noteItems.map((item) => (
                        <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 group">
                          <div className="w-12 h-12 bg-slate-50 rounded-lg overflow-hidden shrink-0">
                            <ProductImage src={item.image} alt={item.name} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">{item.name}</p>
                            <p className="text-[10px] font-medium text-slate-500">SKU: {item.sku}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              value={item.noteQuantity}
                              onChange={(e) => handleUpdateNoteQuantity(item.id, parseInt(e.target.value) || 0)}
                              className="w-16 h-10 bg-slate-100 border-none rounded-lg text-center font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                            <button 
                              onClick={() => handleRemoveProductFromNote(item.id)}
                              className="w-10 h-10 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <FileText size={48} className="mb-4 opacity-10" />
                        <p className="text-sm font-bold">Nenhum item adicionado</p>
                        <p className="text-xs">Busque produtos ao lado para incluir na nota</p>
                      </div>
                    )}
                  </div>

                  <div className="pt-6 mt-6 border-t border-slate-200 space-y-4 shrink-0">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500 font-bold">Total de Itens</span>
                      <span className="text-slate-900 font-black">{noteItems.reduce((acc, curr) => acc + curr.noteQuantity, 0)} unidades</span>
                    </div>
                    <button 
                      disabled={noteItems.length === 0 || isProcessingNote}
                      onClick={handleProcessManualNote}
                      className="w-full bg-primary text-white font-bold py-4 rounded-2xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-xl shadow-primary/30 disabled:opacity-50 disabled:shadow-none"
                    >
                      {isProcessingNote ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
                      ) : (
                        <>
                          <CheckCircle2 size={20} />
                          Confirmar Entrada de Mercadoria
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Import Supplier Selection Modal */}
      <AnimatePresence>
        {showImportSupplierModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowImportSupplierModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white">
                    <Truck size={20} />
                  </div>
                  <h3 className="text-lg font-black text-slate-900">Selecionar Fornecedor</h3>
                </div>
                <button onClick={() => setShowImportSupplierModal(false)} className="p-2 hover:bg-slate-200 rounded-full">
                  <X size={20} className="text-slate-400" />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <p className="text-sm text-slate-500 font-medium">Selecione o fornecedor da nota para tradução automática de descrições. O fornecedor é <span className="font-bold text-slate-700">opcional</span> — sem ele, o sistema identificará produtos via SKU ou EAN.</p>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">Fornecedor</label>
                  <select 
                    value={selectedImportSupplierId}
                    onChange={(e) => setSelectedImportSupplierId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-bold"
                  >
                    <option value="">Nenhum (Usar apenas SKU/EAN)</option>
                    {supplierNames.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={downloadNoteTemplate}
                    className="w-full bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                  >
                    <Download size={20} />
                    Baixar Modelo
                  </button>
                  <button 
                    onClick={() => {
                      setShowImportSupplierModal(false);
                      noteFileInputRef.current?.click();
                    }}
                    className="w-full bg-primary text-white font-bold py-4 rounded-2xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-xl shadow-primary/20"
                  >
                    <FileUp size={20} />
                    Prosseguir
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Translation Result Modal */}
      <AnimatePresence>
        {showTranslationResultModal && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTranslationResultModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-green-500 flex items-center justify-center text-white shadow-lg shadow-green-500/20">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Resultado da Tradução</h3>
                    <p className="text-xs text-slate-500 font-medium">Confira como os produtos da nota foram identificados no seu sistema</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => exportTranslatedToExcel(translatedNoteItems)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors border border-emerald-100"
                  >
                    <Download size={16} />
                    Excel
                  </button>
                  <button 
                    onClick={() => exportTranslatedToPDF(translatedNoteItems)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100 transition-colors border border-red-100"
                  >
                    <Download size={16} />
                    PDF
                  </button>
                  <div className="w-px h-8 bg-slate-100 mx-2" />
                  <button onClick={() => setShowTranslationResultModal(false)} className="p-2 hover:bg-slate-100 rounded-full">
                    <X size={24} className="text-slate-400" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left border-b border-slate-100">
                      <th className="pb-4 text-[10px] font-bold text-secondary uppercase tracking-widest pl-4">Produto na Nota (Fornecedor)</th>
                      <th className="pb-4 text-[10px] font-bold text-secondary uppercase tracking-widest pl-4">Identificação Interna (Traduzido)</th>
                      <th className="pb-4 text-[10px] font-bold text-secondary uppercase tracking-widest pl-4">SKU/EAN</th>
                      <th className="pb-4 text-[10px] font-bold text-secondary uppercase tracking-widest pl-4 text-center">Quant.</th>
                      <th className="pb-4 text-[10px] font-bold text-secondary uppercase tracking-widest pl-4">Status</th>
                      <th className="pb-4 text-[10px] font-bold text-secondary uppercase tracking-widest pl-4 text-center">Verificação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {translatedNoteItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 pl-4">
                          <p className="text-sm font-bold text-slate-700">{item.original_description}</p>
                        </td>
                        <td className="py-4 pl-4">
                          <div className="flex items-center gap-3">
                            {item.verified ? (
                              <>
                                <div className="w-8 h-8 rounded bg-primary/5 flex items-center justify-center text-primary">
                                  <ArrowRight size={14} />
                                </div>
                                <p className="text-sm font-black text-primary">{item.name}</p>
                              </>
                            ) : (
                              <p className="text-sm font-medium text-red-400 italic">Preceder cadastro manual</p>
                            )}
                          </div>
                        </td>
                        <td className="py-4 pl-4">
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-bold text-slate-400">SKU: {item.sku || '-'}</p>
                            <p className="text-[10px] font-bold text-slate-400">EAN: {item.ean || '-'}</p>
                          </div>
                        </td>
                        <td className="py-4 pl-4 text-center">
                          <span className="inline-block px-3 py-1 bg-slate-100 rounded-full text-xs font-black text-slate-700">{item.qty}</span>
                        </td>
                        <td className="py-4 pl-4">
                          <span className={cn(
                            "px-2 py-1 rounded-lg text-[10px] font-black uppercase",
                            item.verified && item.status_translation === 'Traduzido' ? "bg-amber-100 text-amber-700" :
                            item.verified ? "bg-blue-100 text-blue-700" :
                            "bg-red-100 text-red-700"
                          )}>
                            {item.status_translation}
                          </span>
                        </td>
                        <td className="py-4 pl-4 text-center">
                          {item.verified ? (
                            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-green-500/20">
                              <CheckCircle2 size={16} />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 mx-auto">
                              <X size={16} />
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                <div className="text-sm text-slate-500">
                   Total Processado: <span className="font-bold text-slate-900">{translatedNoteItems.length} itens</span>
                </div>
                <button 
                  onClick={() => setShowTranslationResultModal(false)}
                  className="px-8 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg"
                >
                  Concluir e Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* NF Digitalizada Modal */}
      <AnimatePresence>
        {showNfDigitalizadaModal && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-7xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                    <FileUp size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Nota Digitalizada</h3>
                    <p className="text-xs text-slate-500 font-medium truncate max-w-xs">{currentNfFileName} · {currentNfTimestamp}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => exportTranslatedToExcel(pendingNfItems.map((item, idx) => ({ ...item, price: nfItemPrices[idx] ?? item.price })))}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors border border-emerald-100"
                  >
                    <Download size={16} />
                    Excel
                  </button>
                  <button
                    onClick={() => exportTranslatedToPDF(pendingNfItems.map((item, idx) => ({ ...item, price: nfItemPrices[idx] ?? item.price })))}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100 transition-colors border border-red-100"
                  >
                    <Download size={16} />
                    PDF
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-900 text-left">
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest">Produto na Nota</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest">Identificação Interna</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest">SKU / EAN</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-center">Qtd.</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-right">Preço Custo</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-right">Preço Venda</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-right">Markup</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest">Status</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-center">Ok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingNfItems.map((item, idx) => {
                      const cost = nfItemPrices[idx] ?? item.price;
                      const sell = nfItemSellPrices[idx] ?? item.product_price ?? 0;
                      const markup = cost > 0 && sell > 0 ? ((sell - cost) / cost * 100) : null;
                      const isVerified = nfItemVerified[idx] ?? item.verified;
                      const isEven = idx % 2 === 0;
                      return (
                        <tr key={idx} className={cn("border-b border-slate-100 hover:bg-blue-50/40 transition-colors", isEven ? "bg-white" : "bg-slate-50/60")}>
                          <td className="py-3 px-4">
                            <p className="text-sm font-semibold text-slate-800">{item.original_description || '-'}</p>
                          </td>
                          <td className="py-3 px-4">
                            {item.verified ? (
                              <div className="flex items-center gap-2">
                                <ArrowRight size={13} className="text-primary shrink-0" />
                                <p className="text-sm font-black text-primary">{item.name}</p>
                              </div>
                            ) : (
                              <p className="text-xs font-medium text-red-400 italic">Cadastro pendente</p>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-[11px] font-bold text-slate-400 leading-tight">SKU: {item.sku || '-'}</p>
                            <p className="text-[11px] font-bold text-slate-400 leading-tight">EAN: {item.ean || '-'}</p>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-block px-3 py-1 bg-slate-100 rounded-full text-xs font-black text-slate-700">{item.qty}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-xs text-slate-400 font-semibold">R$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={nfItemPrices[idx] ?? item.price}
                                onChange={e => {
                                  const updated = [...nfItemPrices];
                                  updated[idx] = parseFloat(e.target.value) || 0;
                                  setNfItemPrices(updated);
                                }}
                                className="w-24 text-right text-sm font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                              />
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-xs text-slate-400 font-semibold">R$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={nfItemSellPrices[idx] ?? item.product_price ?? 0}
                                onChange={e => {
                                  const updated = [...nfItemSellPrices];
                                  updated[idx] = parseFloat(e.target.value) || 0;
                                  setNfItemSellPrices(updated);
                                }}
                                className="w-24 text-right text-sm font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                              />
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {markup !== null ? (
                              <span className={cn(
                                "inline-block px-2 py-1 rounded-lg text-xs font-black",
                                markup >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                              )}>
                                {markup >= 0 ? '+' : ''}{markup.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300 font-bold">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className={cn(
                              "px-2 py-1 rounded-lg text-[10px] font-black uppercase",
                              item.verified && item.status_translation === 'Traduzido' ? "bg-amber-100 text-amber-700" :
                              item.verified ? "bg-blue-100 text-blue-700" :
                              "bg-red-100 text-red-700"
                            )}>
                              {item.status_translation}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => {
                                const updated = [...nfItemVerified];
                                updated[idx] = !isVerified;
                                setNfItemVerified(updated);
                              }}
                              title={isVerified ? 'Clique para desmarcar' : 'Clique para verificar'}
                              className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center mx-auto transition-all active:scale-90",
                                isVerified
                                  ? "bg-green-500 text-white shadow shadow-green-500/30 hover:bg-green-600"
                                  : "bg-slate-100 text-slate-400 hover:bg-primary/10 hover:text-primary cursor-pointer"
                              )}
                            >
                              {isVerified ? <CheckCircle2 size={14} /> : <X size={14} />}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0 gap-4">
                <div className="text-sm text-slate-500 shrink-0">
                  Total: <span className="font-bold text-slate-900">{pendingNfItems.length} itens</span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="font-bold text-green-700">{pendingNfItems.filter(i => i.verified).length} verificados</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowCancelNfConfirm(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-red-50 hover:text-red-600 transition-all text-sm"
                  >
                    <Ban size={16} />
                    Cancelar
                  </button>
                  <button
                    onClick={() => setShowApproveNfConfirm(true)}
                    className="flex items-center gap-2 px-8 py-3 bg-primary text-white font-bold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-primary/20 text-sm"
                  >
                    <SendHorizonal size={16} />
                    Enviar para Aprovação
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmação: Enviar para Aprovação */}
      <AnimatePresence>
        {showApproveNfConfirm && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowApproveNfConfirm(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 flex flex-col gap-6"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <SendHorizonal size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Enviar para Aprovação?</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {pendingNfItems.filter(i => i.verified).length} item(s) verificado(s) serão lançados no estoque e a nota será salva em Revisões.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowApproveNfConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-all"
                >
                  Voltar
                </button>
                <button
                  onClick={handleApproveNf}
                  disabled={isApprovingNf}
                  className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isApprovingNf ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
                  ) : (
                    'Confirmar'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmação: Cancelar NF */}
      <AnimatePresence>
        {showCancelNfConfirm && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCancelNfConfirm(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 flex flex-col gap-6"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                  <Ban size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Cancelar Importação?</h3>
                  <p className="text-sm text-slate-500 mt-1">A nota digitalizada será descartada e nenhuma alteração será salva.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelNfConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-all"
                >
                  Voltar
                </button>
                <button
                  onClick={() => {
                    setShowCancelNfConfirm(false);
                    setShowNfDigitalizadaModal(false);
                    setPendingNfItems([]);
                    setNfItemPrices([]);
                    setNfItemSellPrices([]);
                    setNfItemVerified([]);
                  }}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Confirmar Cancelamento
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Ver Nota de Revisão (leitura) */}
      <AnimatePresence>
        {viewingReviewNote && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingReviewNote(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-7xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shadow-inner">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Nota Digitalizada</h3>
                    <p className="text-xs text-slate-500 font-medium">{viewingReviewNote.fileName} · {viewingReviewNote.timestamp}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => exportTranslatedToExcel(viewingReviewNote.items)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors border border-emerald-100"
                  >
                    <Download size={16} />
                    Excel
                  </button>
                  <button
                    onClick={() => exportTranslatedToPDF(viewingReviewNote.items)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100 transition-colors border border-red-100"
                  >
                    <Download size={16} />
                    PDF
                  </button>
                  <div className="w-px h-8 bg-slate-100 mx-2" />
                  <button onClick={() => setViewingReviewNote(null)} className="p-2 hover:bg-slate-100 rounded-full">
                    <X size={24} className="text-slate-400" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full min-w-[960px] border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-900 text-left">
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest">Produto na Nota</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest">Identificação Interna</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest">SKU / EAN</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-center">Qtd.</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-right">Preço Custo</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-right">Preço Venda</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-right">Markup</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest">Status</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-center">Ok</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-center">Revisão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingReviewNote.items.map((item: any, idx: number) => {
                      const cost = item.price || 0;
                      const sellPrice = viewingNoteSellPrices[idx] ?? item.product_price ?? 0;
                      const markup = cost > 0 && sellPrice > 0
                        ? ((sellPrice - cost) / cost * 100)
                        : null;
                      const isEven = idx % 2 === 0;
                      return (
                        <tr key={idx} className={cn("border-b border-slate-100 hover:bg-blue-50/40 transition-colors", isEven ? "bg-white" : "bg-slate-50/60")}>
                          <td className="py-3 px-4">
                            <p className="text-sm font-semibold text-slate-800">{item.original_description || '-'}</p>
                          </td>
                          <td className="py-3 px-4">
                            {item.verified ? (
                              <div className="flex items-center gap-2">
                                <ArrowRight size={13} className="text-primary shrink-0" />
                                <p className="text-sm font-black text-primary">{item.name}</p>
                              </div>
                            ) : (
                              <p className="text-xs font-medium text-red-400 italic">Cadastro pendente</p>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-[11px] font-bold text-slate-400 leading-tight">SKU: {item.sku || '-'}</p>
                            <p className="text-[11px] font-bold text-slate-400 leading-tight">EAN: {item.ean || '-'}</p>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-block px-3 py-1 bg-slate-100 rounded-full text-xs font-black text-slate-700">{item.qty}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-sm font-bold text-slate-800">
                              {cost > 0 ? `R$ ${cost.toFixed(2)}` : <span className="text-slate-300">—</span>}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={viewingNoteSellPrices[idx] || ''}
                              onChange={(e) => {
                                const updated = [...viewingNoteSellPrices];
                                updated[idx] = parseFloat(e.target.value) || 0;
                                setViewingNoteSellPrices(updated);
                              }}
                              placeholder="0,00"
                              className="w-24 text-right text-sm font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                            />
                          </td>
                          <td className="py-3 px-4 text-right">
                            {markup !== null ? (
                              <span className={cn(
                                "inline-block px-2 py-1 rounded-lg text-xs font-black",
                                markup >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                              )}>
                                {markup >= 0 ? '+' : ''}{markup.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300 font-bold">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className={cn(
                              "px-2 py-1 rounded-lg text-[10px] font-black uppercase",
                              item.verified && item.status_translation === 'Traduzido' ? "bg-amber-100 text-amber-700" :
                              item.verified ? "bg-blue-100 text-blue-700" :
                              "bg-red-100 text-red-700"
                            )}>
                              {item.status_translation}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {viewingNoteVerified[idx] ? (
                              <button
                                onClick={() => {
                                  const updated = [...viewingNoteVerified];
                                  updated[idx] = false;
                                  setViewingNoteVerified(updated);
                                }}
                                className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-white mx-auto shadow shadow-green-500/30 hover:bg-green-600 active:scale-90 transition-all"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  const updatedVerified = [...viewingNoteVerified];
                                  updatedVerified[idx] = true;
                                  setViewingNoteVerified(updatedVerified);
                                  const updatedTs = [...viewingNoteReviewTimestamps];
                                  updatedTs[idx] = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                                  setViewingNoteReviewTimestamps(updatedTs);
                                }}
                                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto hover:bg-primary/10 hover:text-primary active:scale-90 transition-all cursor-pointer"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {viewingNoteReviewTimestamps[idx] ? (
                              <span className="inline-block px-2 py-1 bg-green-50 text-green-700 rounded-lg text-[10px] font-bold leading-tight whitespace-nowrap">
                                {viewingNoteReviewTimestamps[idx]}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs font-bold">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                <div className="text-sm text-slate-500">
                  Total: <span className="font-bold text-slate-900">{viewingReviewNote.itemCount} itens</span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="font-bold text-green-700">{viewingNoteVerified.filter(Boolean).length} verificados</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setReviewNotes(prev => prev.map(n => {
                        if (n.id !== viewingReviewNote.id) return n;
                        return {
                          ...n,
                          verifiedCount: viewingNoteVerified.filter(Boolean).length,
                          items: n.items.map((item: any, idx: number) => ({
                            ...item,
                            product_price: viewingNoteSellPrices[idx] ?? item.product_price,
                            verified: viewingNoteVerified[idx] ?? item.verified,
                            review_timestamp: viewingNoteReviewTimestamps[idx] ?? item.review_timestamp ?? null,
                          }))
                        };
                      }));
                    }}
                    className="px-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg flex items-center gap-2"
                  >
                    <Save size={16} />
                    Salvar
                  </button>
                  <button
                    onClick={() => setViewingReviewNote(null)}
                    className="px-8 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Suppliers Dictionary Modal */}
      <SupplierDictionary
        isOpen={showSuppliersModal}
        onClose={() => setShowSuppliersModal(false)}
        setNotification={setNotification}
      />

      {/* Hidden File Inputs */}
      <input 
        type="file" 
        ref={noteFileInputRef} 
        onChange={handleNoteImportExcel} 
        accept=".xml,.csv,.xlsx,.xls" 
        className="hidden" 
      />
    </div>
  );
}

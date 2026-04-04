'use client';

import { Sidebar } from '@/components/Sidebar';
import { TopNav } from '@/components/TopNav';
import { FeaturedProduct } from '@/components/FeaturedProduct';
import { ProductCard } from '@/components/ProductCard';
import { Filter, Plus, X, Edit2, CheckCircle2, Download, FileUp, Search, Image as ImageIcon, RefreshCw, ChevronDown, Check, Trash2, ArrowLeftRight, BarChart3 } from 'lucide-react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { cn, getDirectImageUrl } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { XMLParser } from 'fast-xml-parser';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

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
  const [isRequestingNewProduct, setIsRequestingNewProduct] = useState(false);
  const [requestSearchQuery, setRequestSearchQuery] = useState({ sku: '', ean: '' });
  const [foundProductForRequest, setFoundProductForRequest] = useState<any>(null);
  const [requestDraftChanges, setRequestDraftChanges] = useState<any>({});
  const [newProductRequest, setNewProductRequest] = useState({
    sku: '',
    name: '',
    ean: '',
    category: '',
    subcategory: '',
    brand: '',
    count: 0,
    price: 0,
    location: '',
    image: '',
    observation: ''
  });
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
    category: '',
    subcategory: '',
    brand: ''
  });
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [filters, setFilters] = useState({
    ean: '',
    internalCode: '',
    category: '',
    subcategory: '',
    brand: '',
    name: '',
    location: ''
  });

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
            
            if (!updateError) updatedCount++;
            else errors++;
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
          is_new_product: true
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
        sku: '', name: '', ean: '', category: '', subcategory: '', brand: '',
        count: 0, price: 0, location: '', image: '', observation: ''
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
        ean: newProduct.ean || '',
        category: newProduct.category || 'Geral',
        subcategory: newProduct.subcategory || 'Geral',
        brand: newProduct.brand || 'Geral',
        internal_code: newProduct.sku,
        is_featured: false,
        is_side: false,
        is_low: (isNaN(newProduct.count) ? 0 : newProduct.count) < 5
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
        category: '',
        subcategory: '',
        brand: ''
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
        ean: editingProduct.ean || '',
        category: editingProduct.category || '',
        subcategory: editingProduct.subcategory || '',
        brand: editingProduct.brand || '',
        internal_code: editingProduct.sku,
        is_low: (isNaN(editingProduct.count) ? 0 : editingProduct.count) < 5,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('products')
        .update(productToUpdate)
        .eq('id', editingProduct.id);

      if (error) throw error;

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

  const openEditModal = (product: any) => {
    setEditingProduct({ ...product });
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

      // Specific filters
      const matchesEan = !filters.ean || (p.ean && p.ean.includes(filters.ean));
      const matchesInternal = !filters.internalCode || (p.internalCode && p.internalCode.toLowerCase().includes(filters.internalCode.toLowerCase()));
      const matchesCategory = !filters.category || (p.category && p.category.toLowerCase().includes(filters.category.toLowerCase()));
      const matchesSubcategory = !filters.subcategory || (p.subcategory && p.subcategory.toLowerCase().includes(filters.subcategory.toLowerCase()));
      const matchesBrand = !filters.brand || (p.brand && p.brand.toLowerCase().includes(filters.brand.toLowerCase()));
      const matchesName = !filters.name || p.name.toLowerCase().includes(filters.name.toLowerCase());
      const matchesLocation = !filters.location || p.location.toLowerCase().includes(filters.location.toLowerCase());

      return matchesGlobal && matchesEan && matchesInternal && matchesCategory && matchesSubcategory && matchesBrand && matchesName && matchesLocation;
    });
  }, [searchQuery, filters, products]);

  const featuredProduct = filteredProducts.find(p => p.isFeatured);
  const sideProduct = filteredProducts.find(p => p.isSide);
  const gridProducts = filteredProducts.filter(p => !p.isFeatured && !p.isSide);

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
          isSidebarCollapsed ? "ml-20" : "ml-64"
        )}>
          <TopNav searchQuery={searchQuery} onSearchChange={setSearchQuery} />
          <div className="p-8 max-w-7xl mx-auto space-y-8">
            {activeTab === 'Inventory' ? (
              <>
                {!isConfigured && (
                  <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-4 text-amber-800"
                  >
                    <div className="p-2 bg-amber-100 rounded-full">
                      <Plus className="rotate-45 text-amber-600" size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-sm">Supabase não configurado</p>
                      <p className="text-xs opacity-80">Por favor, adicione as chaves `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no menu **Settings** para ativar o banco de dados.</p>
                    </div>
                  </motion.div>
                )}
                
                {/* Page Header & Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 bg-white/50 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/20 shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Total de Itens</span>
                      <span className="text-2xl font-black text-slate-900 leading-none">{products.length}</span>
                    </div>
                    <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>
                    <input 
                      type="file" 
                      ref={stockFileInputRef} 
                      onChange={handleStockUpdate} 
                      accept=".xml,.csv,.xlsx,.xls" 
                      className="hidden" 
                    />
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileImport} 
                      accept=".xml,.csv,.xlsx,.xls" 
                      className="hidden" 
                    />
                    <button 
                      onClick={() => stockFileInputRef.current?.click()}
                      disabled={importing}
                      className="bg-amber-50 text-amber-600 px-4 py-2 rounded-xl font-bold text-xs hover:bg-amber-100 transition-all flex items-center gap-2 border border-amber-100 disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={importing ? "animate-spin" : ""} />
                      Atualizar Estoque
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={downloadTemplate}
                      className="bg-white border border-slate-200 px-4 py-2.5 rounded-lg font-bold text-xs hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"
                    >
                      <Download size={14} className="text-slate-500" />
                      Modelo
                    </button>
                    <button 
                      onClick={() => setShowFilters(!showFilters)}
                      className={cn(
                        "px-4 py-2.5 rounded-lg font-bold text-xs transition-all flex items-center gap-2 shadow-sm border",
                        showFilters 
                          ? "bg-primary/5 border-primary text-primary" 
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <Filter size={14} className={showFilters ? "text-primary" : "text-slate-500"} />
                      Filtrar
                    </button>
                    <button 
                      onClick={() => setShowAddModal(true)}
                      className="bg-white border border-slate-200 px-4 py-2.5 rounded-lg font-bold text-xs text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"
                    >
                      <Plus size={14} className="text-slate-500" />
                      Adicionar
                    </button>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={importing}
                      className="bg-primary text-white px-6 py-2.5 rounded-lg font-bold text-xs hover:opacity-90 transition-all flex items-center gap-2 shadow-md shadow-primary/20 disabled:opacity-50"
                    >
                      {importing ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent mx-auto" />
                      ) : (
                        <>
                          <FileUp size={14} />
                          Importar Planilha
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Advanced Filters Panel */}
                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-secondary uppercase">EAN Code</label>
                          <input 
                            type="text" 
                            value={filters.ean}
                            onChange={(e) => setFilters({...filters, ean: e.target.value})}
                            className="w-full h-10 px-3 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-primary/20 outline-none"
                            placeholder="789..."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-secondary uppercase">Internal Code</label>
                          <input 
                            type="text" 
                            value={filters.internalCode}
                            onChange={(e) => setFilters({...filters, internalCode: e.target.value})}
                            className="w-full h-10 px-3 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-primary/20 outline-none"
                            placeholder="BM-500..."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-secondary uppercase">Category</label>
                          <input 
                            type="text" 
                            value={filters.category}
                            onChange={(e) => setFilters({...filters, category: e.target.value})}
                            className="w-full h-10 px-3 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-primary/20 outline-none"
                            placeholder="Domestic..."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-secondary uppercase">Subcategory</label>
                          <input 
                            type="text" 
                            value={filters.subcategory}
                            onChange={(e) => setFilters({...filters, subcategory: e.target.value})}
                            className="w-full h-10 px-3 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-primary/20 outline-none"
                            placeholder="Kitchen..."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-secondary uppercase">Marca</label>
                          <input 
                            type="text" 
                            value={filters.brand}
                            onChange={(e) => setFilters({...filters, brand: e.target.value})}
                            className="w-full h-10 px-3 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-primary/20 outline-none"
                            placeholder="Mizumoto..."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-secondary uppercase">Name</label>
                          <input 
                            type="text" 
                            value={filters.name}
                            onChange={(e) => setFilters({...filters, name: e.target.value})}
                            className="w-full h-10 px-3 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-primary/20 outline-none"
                            placeholder="Batedeira..."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-secondary uppercase">Location</label>
                          <input 
                            type="text" 
                            value={filters.location}
                            onChange={(e) => setFilters({...filters, location: e.target.value})}
                            className="w-full h-10 px-3 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-primary/20 outline-none"
                            placeholder="Aisle A..."
                          />
                        </div>
                        <div className="col-span-full flex justify-end">
                          <button 
                            onClick={() => {
                              setFilters({ ean: '', internalCode: '', category: '', subcategory: '', brand: '', name: '', location: '' });
                              setSearchQuery('');
                            }}
                            className="text-[10px] font-bold text-primary uppercase hover:underline"
                          >
                            Limpar tudo
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bento Grid Layout */}
                <div className="grid grid-cols-12 gap-6">
                  <AnimatePresence mode="popLayout">
                    {featuredProduct && (
                      <FeaturedProduct key="featured" product={featuredProduct} onEdit={openEditModal} />
                    )}

                    {sideProduct && (
                      <motion.div 
                        key="side"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="col-span-12 lg:col-span-4 bg-white rounded-xl p-6 flex flex-col shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 group relative"
                      >
                        <button 
                          onClick={() => openEditModal(sideProduct)}
                          className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-sm border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-primary hover:text-white text-secondary"
                        >
                          <Edit2 size={14} />
                        </button>
                        <div className="h-32 w-full bg-slate-50 rounded-lg mb-4 overflow-hidden relative flex items-center justify-center">
                          <ProductImage key={sideProduct.image} src={sideProduct.image} alt={sideProduct.name} />
                        </div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-bold text-white bg-primary px-2 py-0.5 rounded">{sideProduct.status}</span>
                          <span className="text-lg font-manrope font-extrabold text-primary">
                            R$ {(sideProduct.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <h3 className="font-manrope font-extrabold text-on-surface mb-4">{sideProduct.name}</h3>
                        <div className="space-y-3 mb-6">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-secondary font-medium">Estoque</span>
                            <span className="font-bold text-on-surface">{sideProduct.count} Unidades</span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-secondary font-medium">Localização</span>
                            <span className="font-bold text-on-surface">{sideProduct.location}</span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-secondary font-medium">EAN</span>
                            <span className="font-medium text-on-surface">{sideProduct.ean}</span>
                          </div>
                        </div>
                        <button 
                          onClick={() => openEditModal(sideProduct)}
                          className="mt-auto w-full bg-slate-50 border border-primary/20 text-primary text-[11px] font-bold py-2 rounded uppercase tracking-wider hover:bg-primary/5 transition-colors"
                        >
                          Gerenciar Estoque
                        </button>
                      </motion.div>
                    )}

                    {/* List View */}
                    <div key="grid-row" className="col-span-12 flex flex-col gap-4">
                      {gridProducts.map((product, index) => (
                        <ProductCard 
                          key={product.id || product.sku || `product-${index}`} 
                          {...product} 
                          onEdit={openEditModal}
                        />
                      ))}
                    </div>

                    {loading && (
                      <div key="loading-spinner" className="col-span-12 py-20 text-center">
                        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" role="status">
                          <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">Loading...</span>
                        </div>
                      </div>
                    )}

                    {!loading && filteredProducts.length === 0 && (
                      <motion.div 
                        key="empty-state"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="col-span-12 py-20 text-center"
                      >
                        <p className="text-secondary font-medium">Nenhum produto encontrado correspondente a &quot;{searchQuery}&quot;</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : activeTab === 'Requisições' ? (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <h1 className="text-3xl font-black text-slate-900">Requisições</h1>
                    <p className="text-sm text-slate-500 font-medium">Gerencie solicitações de alteração de produtos</p>
                  </div>
                  <button 
                    onClick={() => {
                      setShowAddRequestModal(true);
                      setFoundProductForRequest(null);
                      setRequestSearchQuery({ sku: '', ean: '' });
                      setRequestDraftChanges({});
                      setEditingField(null);
                    }}
                    className="bg-primary text-white px-6 py-3 rounded-xl font-bold text-sm hover:opacity-90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
                  >
                    <Plus size={18} />
                    Adicionar Requisição
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {requests.filter(r => r.status === 'pending').map((request) => {
                    const requestedChanges = JSON.parse(request.requested_changes);
                    const isNewProduct = requestedChanges.is_new_product;
                    const productData = isNewProduct ? requestedChanges : request.products;

                    return (
                      <div key={request.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group">
                        <div className="p-5 flex-1 space-y-4">
                          <div className="flex gap-4">
                            <div className="w-20 h-20 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0">
                              <ProductImage src={productData?.image} alt={productData?.name} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={cn(
                                  "text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider",
                                  isNewProduct ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600"
                                )}>
                                  {isNewProduct ? "Novo Produto" : productData?.sku}
                                </span>
                                {isNewProduct && productData?.sku && (
                                  <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded uppercase tracking-wider">
                                    {productData.sku}
                                  </span>
                                )}
                              </div>
                              <h3 className="text-sm font-bold text-slate-900 truncate leading-tight mb-1">
                                {productData?.name}
                              </h3>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                {productData?.brand}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              {isNewProduct ? "Dados do Novo Produto:" : "Alterações Solicitadas:"}
                            </p>
                            <div className="space-y-1">
                              {Object.entries(requestedChanges)
                                .filter(([key]) => key !== 'is_new_product')
                                .map(([key, value]: [string, any]) => (
                                <div key={key} className="flex items-center justify-between text-xs">
                                  <span className="text-slate-500 font-medium capitalize">{key}:</span>
                                  <span className={cn(
                                    "font-bold",
                                    isNewProduct ? "text-primary" : "text-red-500"
                                  )}>{String(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                      <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                        <button 
                          onClick={() => {
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
                          className="flex-1 bg-white border border-slate-200 text-slate-600 py-2 rounded-lg text-xs font-bold hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
                        >
                          <Edit2 size={14} />
                          Editar
                        </button>
                        <button 
                          onClick={() => setShowRequestConfirmModal({ show: true, requestId: request.id })}
                          className="flex-1 bg-green-500 text-white py-2 rounded-lg text-xs font-bold hover:bg-green-600 transition-colors flex items-center justify-center gap-2 shadow-sm"
                        >
                          <Check size={14} />
                          Aprovar
                        </button>
                        <button 
                          onClick={() => handleDeleteRequest(request.id)}
                          className="w-10 bg-red-50 text-red-500 py-2 rounded-lg flex items-center justify-center hover:bg-red-100 transition-colors border border-red-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                </div>

                {requests.filter(r => r.status === 'pending').length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <ArrowLeftRight size={48} className="mb-4 opacity-20" />
                    <p className="text-sm font-bold">Nenhuma requisição pendente</p>
                  </div>
                )}
              </div>
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
                    <input 
                      type="text" 
                      value={editingProduct.ean || ''}
                      onChange={(e) => setEditingProduct({...editingProduct, ean: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
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
                      <input 
                        type="text" 
                        value={newProductRequest.ean}
                        onChange={(e) => setNewProductRequest({...newProductRequest, ean: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="789..."
                      />
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
                    <input 
                      type="text" 
                      value={newProduct.ean}
                      onChange={(e) => setNewProduct({...newProduct, ean: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="789..."
                    />
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
    </div>
  );
}

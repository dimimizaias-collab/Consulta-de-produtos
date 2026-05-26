'use client';

import { Sidebar } from '@/components/Sidebar';
import { BottomNav } from '@/components/BottomNav';
import { TopNav } from '@/components/TopNav';
import { NotificationsPage, type AppNotification } from '@/components/NotificationsPage';
import { FeaturedProduct } from '@/components/FeaturedProduct';
import { ProductCard } from '@/components/ProductCard';
import { SupplierDictionary } from '@/components/suppliers/SupplierDictionary';
import { InventoryManager } from '@/components/inventory/InventoryManager';
import { ProductBulkTable } from '@/components/inventory/ProductBulkTable';
import { RequestCenter } from '@/components/requests/RequestCenter';
import { LogisticsCenter, ReviewNote } from '@/components/requests/LogisticsCenter';
import { ManualManifestModal } from '@/components/requests/ManualManifestModal';
import { PurchaseOrderManager } from '@/components/orders/PurchaseOrderManager';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { FinanceManager } from '@/components/finance/FinanceManager';
import { FinanceDashboard } from '@/components/finance/FinanceDashboard';
import { DespesasPage } from '@/components/finance/DespesasPage';
import { MobileNoteView } from '@/components/MobileNoteView';
import { Filter, Plus, X, Edit2, CheckCircle2, Download, FileUp, Search, Image as ImageIcon, RefreshCw, ChevronDown, Check, Trash2, ArrowLeftRight, BarChart3, Link as LinkIcon, ArrowRight, Package, LogIn, FileText, ShoppingCart, Truck, BookText, Users, Pencil, ClipboardList, SendHorizonal, Ban, Save, Ruler, Zap, Layers, AlertTriangle } from 'lucide-react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { cn, getDirectImageUrl } from '@/lib/utils';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { tableCellKeyDown } from '@/lib/tableKeyNav';
import { XMLParser } from 'fast-xml-parser';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

const staticProducts: any[] = [];

function ProductImage({ src, alt, className }: { src: string, alt: string, className?: string }) {
  const [error, setError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const directSrc = useMemo(() => getDirectImageUrl(src), [src]);
  const canZoom = !!directSrc && !error;

  return (
    <>
      <div
        className={cn("relative w-full h-full flex items-center justify-center", canZoom && "cursor-zoom-in", className)}
        onClick={canZoom ? (e) => { e.stopPropagation(); setLightboxOpen(true); } : undefined}
      >
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
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/85 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
            onClick={() => setLightboxOpen(false)}
          >
            <X size={20} />
          </button>
          <img
            src={directSrc!}
            alt={alt}
            className="max-w-[88vw] max-h-[88vh] object-contain rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
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
              className="absolute z-[60] left-0 right-0 mt-1 bg-surface-container-lowest border border-on-surface/10 rounded-lg shadow-xl max-h-60 overflow-y-auto"
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
                      "w-full text-left px-4 py-2 text-sm hover:bg-on-surface/5 transition-colors",
                      value === opt ? "text-primary font-bold bg-primary/5" : "text-on-surface"
                    )}
                  >
                    {opt}
                  </button>
                ))
              ) : (
                <div className="px-4 py-2 text-sm text-on-surface/50 italic">Nenhum resultado encontrado</div>
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
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>([]);
  const [pendingOpenNoteId, setPendingOpenNoteId] = useState<string | null>(null);
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
  const [showProductBulkTable, setShowProductBulkTable] = useState(false);
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
  const [reviewNotes, setReviewNotes] = useState<ReviewNote[]>([]);
  const [currentNfTimestamp, setCurrentNfTimestamp] = useState('');
  const [currentNfFileName, setCurrentNfFileName] = useState('');
  const [viewingReviewNote, setViewingReviewNote] = useState<ReviewNote | null>(null);
  const [viewingNoteSellPrices, setViewingNoteSellPrices] = useState<number[]>([]);
  const [viewingNoteVerified, setViewingNoteVerified] = useState<boolean[]>([]);
  const [viewingNoteReviewTimestamps, setViewingNoteReviewTimestamps] = useState<(string | null)[]>([]);

  // estoque print layout picker
  type EstoquePreset = 'financeiro' | 'estoque' | 'personalizado';
  const [showEstoqueLayoutPicker, setShowEstoqueLayoutPicker] = useState(false);
  const [estoquePickerArgs, setEstoquePickerArgs] = useState<{ items: any[]; adj?: any; meta?: any } | null>(null);
  const [estoquePreset, setEstoquePreset] = useState<EstoquePreset>('financeiro');
  const [estoqueCustomCols, setEstoqueCustomCols] = useState<string[]>([]);

  // discrepancy modal
  type DiscrepancyData = { type: 'falta' | 'sobra'; qty: number; missingAll: boolean; obs: string } | null;
  const [viewingNoteDiscrepancies, setViewingNoteDiscrepancies] = useState<DiscrepancyData[]>([]);
  const [discrepancyModalIdx, setDiscrepancyModalIdx] = useState<number | null>(null);
  const [discrepancyTab, setDiscrepancyTab] = useState<'falta' | 'sobra'>('falta');
  const [discrepancyQty, setDiscrepancyQty] = useState('');
  const [discrepancyMissingAll, setDiscrepancyMissingAll] = useState(false);
  const [discrepancyObs, setDiscrepancyObs] = useState('');

  const [isApprovingNf, setIsApprovingNf] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [confirmDeleteNote, setConfirmDeleteNote] = useState(false);
  const [showMobileNoteView, setShowMobileNoteView] = useState(false);
  const [linkingItemIdx, setLinkingItemIdx] = useState<number | null>(null);
  const [noteItemLinkQuery, setNoteItemLinkQuery] = useState('');
  const [noteItemShowCreate, setNoteItemShowCreate] = useState(false);
  const [noteItemNewName, setNoteItemNewName] = useState('');
  const [noteItemNewSku, setNoteItemNewSku] = useState('');
  const [noteItemNewEan, setNoteItemNewEan] = useState('');
  const [noteItemNewSellPrice, setNoteItemNewSellPrice] = useState('');
  const [noteItemCreating, setNoteItemCreating] = useState(false);
  const [noteItemNewImage, setNoteItemNewImage] = useState('');
  const [noteItemNewImageUploading, setNoteItemNewImageUploading] = useState(false);
  const [noteItemSelectedProduct, setNoteItemSelectedProduct] = useState<any>(null);
  const [noteItemSellPriceInput, setNoteItemSellPriceInput] = useState('');
  const [multiLinkItemIdx, setMultiLinkItemIdx] = useState<number | null>(null);
  const [multiLinkItemSearch, setMultiLinkItemSearch] = useState('');
  const [multiLinkItemQty, setMultiLinkItemQty] = useState('');
  const [multiLinkItemResults, setMultiLinkItemResults] = useState<any[]>([]);
  const [multiLinkItemEntries, setMultiLinkItemEntries] = useState<{ product: any; qty: string }[]>([]);
  const [multiLinkItemShowCreate, setMultiLinkItemShowCreate] = useState(false);
  const [multiLinkItemNewName, setMultiLinkItemNewName] = useState('');
  const [multiLinkItemNewSku, setMultiLinkItemNewSku] = useState('');
  const [multiLinkItemNewEan, setMultiLinkItemNewEan] = useState('');
  const [multiLinkItemCreating, setMultiLinkItemCreating] = useState(false);
  // Discount/surcharge column states
  type AdjType = 'pct' | 'fixed' | 'fixed_total';
  type AdjMode = 'none' | 'geral' | 'individual';
  const [discountDropdown, setDiscountDropdown] = useState(false);
  const [discountDialog, setDiscountDialog] = useState<'geral' | 'individual' | null>(null);
  const [discountMode, setDiscountMode] = useState<AdjMode>('none');
  const [discountGeralValue, setDiscountGeralValue] = useState('');
  const [discountGeralType, setDiscountGeralType] = useState<AdjType>('pct');
  const [discountApplied, setDiscountApplied] = useState<{ value: number; type: AdjType } | null>(null);
  const [discountIndividualType, setDiscountIndividualType] = useState<AdjType>('pct');
  const [itemDiscounts, setItemDiscounts] = useState<string[]>([]);
  const [surchargeDropdown, setSurchargeDropdown] = useState(false);
  const [surchargeDialog, setSurchargeDialog] = useState<'geral' | 'individual' | null>(null);
  const [surchargeMode, setSurchargeMode] = useState<AdjMode>('none');
  const [surchargeGeralValue, setSurchargeGeralValue] = useState('');
  const [surchargeGeralType, setSurchargeGeralType] = useState<AdjType>('pct');
  const [surchargeApplied, setSurchargeApplied] = useState<{ value: number; type: AdjType } | null>(null);
  const [surchargeIndividualType, setSurchargeIndividualType] = useState<AdjType>('pct');
  const [itemSurcharges, setItemSurcharges] = useState<string[]>([]);
  const [nfItemPrices, setNfItemPrices] = useState<number[]>([]);
  const [nfItemSellPrices, setNfItemSellPrices] = useState<number[]>([]);
  const [nfItemVerified, setNfItemVerified] = useState<boolean[]>([]);
  const [nfItemEans, setNfItemEans] = useState<string[]>([]);
  const [nfItemSkus, setNfItemSkus] = useState<string[]>([]);
  const [nfItemQtys, setNfItemQtys] = useState<number[]>([]);
  const [nfEditableCols, setNfEditableCols] = useState<Set<string>>(new Set());

  const [nfNoteNumber, setNfNoteNumber] = useState('');
  const [nfAccessKey, setNfAccessKey] = useState('');
  const [nfItemDistribuicao, setNfItemDistribuicao] = useState<string[]>([]);

  const [viewingNoteEans, setViewingNoteEans] = useState<string[]>([]);
  const [viewingNoteSkus, setViewingNoteSkus] = useState<string[]>([]);
  const [viewingNoteQtys, setViewingNoteQtys] = useState<number[]>([]);
  const [viewingNoteItemPrices, setViewingNoteItemPrices] = useState<number[]>([]);
  const [viewingNoteDistribuicao, setViewingNoteDistribuicao] = useState<string[]>([]);
  const [viewingNoteUnits, setViewingNoteUnits] = useState<string[]>([]);
  const [viewingNoteMultipliers, setViewingNoteMultipliers] = useState<number[]>([]);
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);
  const [reviewUnitMenuIdx, setReviewUnitMenuIdx] = useState<number | null>(null);
  const [reviewLoadingUnitIdx, setReviewLoadingUnitIdx] = useState<number | null>(null);
  const [reviewMeasureIdx, setReviewMeasureIdx] = useState<number | null>(null);
  const [reviewMeasureUnit, setReviewMeasureUnit] = useState('');
  const [reviewMeasureMultiplier, setReviewMeasureMultiplier] = useState('');
  const [reviewSavingMeasure, setReviewSavingMeasure] = useState(false);
  const [reviewEditableCols, setReviewEditableCols] = useState<Set<string>>(new Set());
  const [editingNoteHeader, setEditingNoteHeader] = useState(false);
  // ── Column filters (Excel-like) ──
  const [reviewFilterActive, setReviewFilterActive] = useState(false);
  const [reviewColumnFilters, setReviewColumnFilters] = useState<Record<string, Set<string>>>({});
  const [reviewFilterOpen, setReviewFilterOpen] = useState<string | null>(null);
  const [reviewFilterSearch, setReviewFilterSearch] = useState('');

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
  const noteItemImageInputRef = useRef<HTMLInputElement>(null);
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

  // Memoized derived values
  const unreadNotificationCount = useMemo(
    () => appNotifications.filter(n => !n.read).length,
    [appNotifications]
  );

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
      fetchReviewNotes();
      fetchNotifications();
    }
  }, []);

  // ── Scroll lock: prevent background scroll whenever any modal is open ──────
  useEffect(() => {
    const anyModalOpen = !!(
      viewingReviewNote ||
      showEstoqueLayoutPicker ||
      showSuppliersModal ||
      linkingItemIdx !== null
    );
    document.body.style.overflow = anyModalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [viewingReviewNote, showEstoqueLayoutPicker, showSuppliersModal, linkingItemIdx]);

  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.warn('[Notificações] Tabela indisponível:', error.message);
      return;
    }
    if (data) setAppNotifications(data as AppNotification[]);
  };

  const fetchReviewNotes = async () => {
    const { data } = await supabase
      .from('review_notes')
      .select('*')
      .eq('is_draft', false)
      .order('created_at', { ascending: false })
      .limit(300);
    if (data) {
      setReviewNotes(data.map((n: any) => ({
        id: n.id,
        timestamp: n.timestamp_label,
        fileName: n.file_name,
        items: n.items,
        itemCount: n.item_count,
        verifiedCount: n.verified_count,
        approved: n.approved ?? false,
        noteNumber: n.note_number ?? undefined,
        accessKey: n.access_key ?? undefined,
        supplierName: n.supplier_name ?? undefined,
        finance_transaction_id: n.finance_transaction_id ?? null,
      })));
    }
  };

  const handleApproveNote = async (noteId: string) => {
    await supabase.from('review_notes').update({ approved: true }).eq('id', noteId);
    setReviewNotes(prev => prev.map(n => n.id === noteId ? { ...n, approved: true } : n));

    // Gera notificação de aprovação
    const note = reviewNotes.find(n => n.id === noteId);
    const insertPayload = {
      type: 'note_approved',
      title: 'Nota aprovada',
      body: note?.supplierName ?? null,
      note_id: noteId,
      note_file_name: note?.fileName ?? null,
      read: false,
    };

    const { data: notifData, error: notifError } = await supabase
      .from('notifications')
      .insert([insertPayload])
      .select()
      .single();

    if (notifError) {
      console.error('[Notificação] Erro ao inserir no banco:', notifError.message);
      // Fallback: adiciona localmente mesmo sem persistência no banco
      const localNotif: AppNotification = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...insertPayload,
      };
      setAppNotifications(prev => [localNotif, ...prev]);
    } else if (notifData) {
      setAppNotifications(prev => [notifData as AppNotification, ...prev]);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    await supabase.from('notifications').update({ read: true }).eq('read', false);
    setAppNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleGoToNote = (noteId: string) => {
    setActiveTab('Entrada de Mercadoria');
    setPendingOpenNoteId(noteId);
    // Marca notificações daquela nota como lidas
    supabase.from('notifications').update({ read: true }).eq('note_id', noteId).eq('read', false);
    setAppNotifications(prev => prev.map(n => n.note_id === noteId ? { ...n, read: true } : n));
  };

  const handleLinkNote = (noteId: string, transactionId: string | null) => {
    setReviewNotes(prev => prev.map(n => n.id === noteId ? { ...n, finance_transaction_id: transactionId } : n));
  };

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('requests')
        .select('*, products(*)')
        .order('created_at', { ascending: false })
        .limit(500);

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

  const exportTranslatedToExcel = (items: any[], adj?: {
    discountMode: string; discountApplied: { value: number; type: string } | null;
    discountIndividualType: string; itemDiscounts: string[];
    surchargeMode: string; surchargeApplied: { value: number; type: string } | null;
    surchargeIndividualType: string; itemSurcharges: string[];
  }) => {
    type AdjCfg = {
      discountMode: string; discountApplied: { value: number; type: string } | null;
      discountIndividualType: string; itemDiscounts: string[];
      surchargeMode: string; surchargeApplied: { value: number; type: string } | null;
      surchargeIndividualType: string; itemSurcharges: string[];
    };
    const calcAdjCost = (cost: number, idx: number, adj?: AdjCfg) => {
      if (!adj) return cost;
      let disc = 0;
      if (adj.discountMode === 'geral' && adj.discountApplied) {
        disc = adj.discountApplied.type === 'pct' ? cost * adj.discountApplied.value / 100 : adj.discountApplied.value;
      } else if (adj.discountMode === 'individual') {
        const v = parseFloat(adj.itemDiscounts[idx] ?? '');
        if (!isNaN(v) && v > 0) disc = adj.discountIndividualType === 'pct' ? cost * v / 100 : v;
      }
      let sur = 0;
      if (adj.surchargeMode === 'geral' && adj.surchargeApplied) {
        sur = adj.surchargeApplied.type === 'pct' ? cost * adj.surchargeApplied.value / 100 : adj.surchargeApplied.value;
      } else if (adj.surchargeMode === 'individual') {
        const v = parseFloat(adj.itemSurcharges[idx] ?? '');
        if (!isNaN(v) && v > 0) {
          const qty = items[idx]?.qty || 1;
          sur = adj.surchargeIndividualType === 'pct' ? cost * v / 100 : adj.surchargeIndividualType === 'fixed_total' ? v / qty : v;
        }
      }
      return cost - disc + sur;
    };

    const ws = XLSX.utils.json_to_sheet(items.map((item, idx) => {
      const isTranslated = item.verified;
      const displayQty = isTranslated ? item.qty : (item.original_qty || 1);
      const rawCost = isTranslated ? (item.price / (item.multiplier || 1)) : item.price;
      const adjCost = calcAdjCost(rawCost, idx, adj);
      const displayPriceTotal = adjCost * displayQty;

      const sell = item.product_price ?? 0;
      const markup = adjCost > 0 && sell > 0 ? ((sell - adjCost) / adjCost * 100) : null;

      return {
        'Código (SKU)': item.sku || '-',
        'EAN': item.ean || '-',
        'Produto Interno': item.name || 'NÃO MAPEADO',
        'Descrição Fornecedor': item.original_description || '-',
        'Quantidade': displayQty,
        'Preço Un.': parseFloat(adjCost.toFixed(2)),
        'Preço Total': parseFloat(displayPriceTotal.toFixed(2)),
        'Preço de Venda': sell,
        'Markup (%)': markup !== null ? parseFloat(markup.toFixed(2)) : '-',
      };
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Traduzidos");
    XLSX.writeFile(wb, "nota_traduzida.xlsx");
  };

  const generateBarcodeDataUrl = (code: string): string => {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, code, { format: 'CODE128', displayValue: false, width: 1.5, height: 50, margin: 0 });
    return canvas.toDataURL('image/png');
  };

  const exportTranslatedToPDF = (items: any[], adj?: {
    discountMode: string; discountApplied: { value: number; type: string } | null;
    discountIndividualType: string; itemDiscounts: string[];
    surchargeMode: string; surchargeApplied: { value: number; type: string } | null;
    surchargeIndividualType: string; itemSurcharges: string[];
  }, meta?: { supplierName?: string; noteNumber?: string; accessKey?: string }) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const formatCurrency = (val: number) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const calcCost = (cost: number, idx: number) => {
      if (!adj) return cost;
      let disc = 0;
      if (adj.discountMode === 'geral' && adj.discountApplied) {
        disc = adj.discountApplied.type === 'pct' ? cost * adj.discountApplied.value / 100 : adj.discountApplied.value;
      } else if (adj.discountMode === 'individual') {
        const v = parseFloat(adj.itemDiscounts[idx] ?? '');
        if (!isNaN(v) && v > 0) disc = adj.discountIndividualType === 'pct' ? cost * v / 100 : v;
      }
      let sur = 0;
      if (adj.surchargeMode === 'geral' && adj.surchargeApplied) {
        sur = adj.surchargeApplied.type === 'pct' ? cost * adj.surchargeApplied.value / 100 : adj.surchargeApplied.value;
      } else if (adj.surchargeMode === 'individual') {
        const v = parseFloat(adj.itemSurcharges[idx] ?? '');
        if (!isNaN(v) && v > 0) {
          const qty = items[idx]?.qty || 1;
          sur = adj.surchargeIndividualType === 'pct' ? cost * v / 100 : adj.surchargeIndividualType === 'fixed_total' ? v / qty : v;
        }
      }
      return cost - disc + sur;
    };

    const titleParts = [];
    if (meta?.supplierName) titleParts.push(meta.supplierName);
    if (meta?.noteNumber) titleParts.push(`NF ${meta.noteNumber}`);
    const titleText = titleParts.length > 0 ? titleParts.join(' — ') : 'Relatório de Tradução de Nota';

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(titleText, 14, 15);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22);

    let tableStartY = 28;
    if (meta?.accessKey) {
      try {
        const barcodeUrl = generateBarcodeDataUrl(meta.accessKey);
        doc.addImage(barcodeUrl, 'PNG', 14, 26, 160, 12);
        doc.setFontSize(6);
        doc.text(meta.accessKey, 94, 40, { align: 'center' });
        tableStartY = 44;
      } catch { /* ignore barcode errors */ }
    }

    const tableData = items.map((item, idx) => {
      const isTranslated = item.verified;
      const displayQty = isTranslated ? item.qty : (item.original_qty || 1);
      const rawCost = isTranslated ? (item.price / (item.multiplier || 1)) : item.price;
      const adjCost = calcCost(rawCost, idx);
      const displayPriceTotal = adjCost * displayQty;

      const sell = item.product_price ?? 0;
      const markup = adjCost > 0 && sell > 0 ? ((sell - adjCost) / adjCost * 100) : null;
      const markupStr = markup !== null ? `${markup >= 0 ? '+' : ''}${markup.toFixed(1)}%` : '-';

      const distrib = item.distribuicao !== null && item.distribuicao !== undefined ? String(item.distribuicao) : '—';
      return [
        item.sku || '-',
        item.ean || '-',
        item.name || 'NÃO MAPEADO',
        item.original_description || '-',
        displayQty.toString(),
        distrib,
        formatCurrency(adjCost),
        formatCurrency(displayPriceTotal),
        formatCurrency(sell),
        markupStr,
      ];
    });

    autoTable(doc, {
      startY: tableStartY,
      head: [['SKU', 'EAN', 'Produto Interno', 'Descrição Fornecedor', 'Qtde', 'Distrib.', 'Preço Un.', 'Total', 'Preço Venda', 'Markup']],
      body: tableData,
      headStyles: { fillColor: [0, 84, 204] },
      styles: { fontSize: 7, cellPadding: 2, overflow: 'ellipsize', minCellHeight: 0 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 26 },
        2: { cellWidth: 40 },
        3: { cellWidth: 50 },
        4: { halign: 'center', cellWidth: 12 },
        5: { halign: 'center', cellWidth: 15 },
        6: { halign: 'right', cellWidth: 25 },
        7: { halign: 'right', cellWidth: 25 },
        8: { halign: 'right', cellWidth: 25 },
        9: { halign: 'right', cellWidth: 18 },
      },
    });

    doc.save("nota_traduzida.pdf");
  };

  const exportEstoqueToA4PDF = (items: any[], adj?: {
    discountMode: string; discountApplied: { value: number; type: string } | null;
    discountIndividualType: string; itemDiscounts: string[];
    surchargeMode: string; surchargeApplied: { value: number; type: string } | null;
    surchargeIndividualType: string; itemSurcharges: string[];
  }, meta?: { supplierName?: string; noteNumber?: string; accessKey?: string },
  layout?: { preset: 'financeiro' | 'estoque' | 'personalizado'; customCols?: string[] }
  ) => {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
    const fmtCur = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    const fmtNum = (v: number) => new Intl.NumberFormat('pt-BR').format(Math.round(v));

    const calcAdj = (cost: number, idx: number) => {
      let disc = 0, sur = 0;
      if (!adj) return { disc, sur };
      if (adj.discountMode === 'geral' && adj.discountApplied) {
        disc = adj.discountApplied.type === 'pct' ? cost * adj.discountApplied.value / 100 : adj.discountApplied.value;
      } else if (adj.discountMode === 'individual') {
        const v = parseFloat(adj.itemDiscounts[idx] ?? '');
        if (!isNaN(v) && v > 0) disc = adj.discountIndividualType === 'pct' ? cost * v / 100 : v;
      }
      if (adj.surchargeMode === 'geral' && adj.surchargeApplied) {
        sur = adj.surchargeApplied.type === 'pct' ? cost * adj.surchargeApplied.value / 100 : adj.surchargeApplied.value;
      } else if (adj.surchargeMode === 'individual') {
        const v = parseFloat(adj.itemSurcharges[idx] ?? '');
        if (!isNaN(v) && v > 0) {
          const qty = items[idx]?.qty || 1;
          sur = adj.surchargeIndividualType === 'pct' ? cost * v / 100 : adj.surchargeIndividualType === 'fixed_total' ? v / qty : v;
        }
      }
      return { disc, sur };
    };

    const preset   = layout?.preset ?? 'financeiro';
    const marginX  = 14;
    const pageW    = 297; // landscape A4
    const usableW  = pageW - 2 * marginX; // 269mm
    const fontSize = 9;
    const cellPad  = 2.5;

    // ── Landscape header ─────────────────────────────────────────────────
    const hY        = 12;
    const supBoxW   = 68;
    const supBoxH   = 7.5;
    const noteBoxH  = 6;
    const boxGap    = 1.5;
    const tableY    = hY + supBoxH + boxGap + noteBoxH + 4;

    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.4);
    doc.rect(marginX, hY, supBoxW, supBoxH);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 14);
    const supplierTxt = (meta?.supplierName ?? 'Fornecedor').toUpperCase().slice(0, 40);
    doc.text(supplierTxt, marginX + 2.5, hY + 5);

    const noteY = hY + supBoxH + boxGap;
    doc.rect(marginX, noteY, supBoxW, noteBoxH);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(70, 70, 70);
    doc.text(`Nota: ${meta?.noteNumber ?? '—'}  ·  ${new Date().toLocaleDateString('pt-BR')}`, marginX + 2.5, noteY + 4);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(216, 30, 30);
    doc.text('Universo do R$1,99', pageW - marginX, hY + 5.5, { align: 'right' });

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(140, 140, 140);
    const reportLabel = preset === 'financeiro' ? 'Relatório Financeiro · Entrada de Mercadoria'
      : preset === 'estoque' ? 'Relatório de Estoque · Entrada de Mercadoria'
      : 'Relatório Personalizado · Entrada de Mercadoria';
    doc.text(reportLabel, pageW - marginX, noteY + 4, { align: 'right' });
    doc.setTextColor(20, 20, 14);

    // ── Per-item computed data ────────────────────────────────────────────
    interface RowData {
      codigo: string; produto: string; interno: string; ean: string; sku: string;
      qtd: number; adjCost: number; disc: number; sur: number; vlrtotal: number;
      pvenda: number; markup: number | null; distribuicao: number | null;
    }
    const rows: RowData[] = items.map((item, idx) => {
      const isT    = item.verified;
      const qty    = isT ? (item.qty || 0) : (item.original_qty || 1);
      const raw    = isT ? ((item.price || 0) / (item.multiplier || 1)) : (item.price || 0);
      const { disc, sur } = calcAdj(raw, idx);
      const adj2   = raw - disc + sur;
      const pvenda = item.product_price ?? 0;
      const distrib = item.distribuicao !== null && item.distribuicao !== undefined ? Number(item.distribuicao) : null;
      return {
        codigo:      item.supplier_code || item.ean || '-',
        produto:     item.original_description || item.name || 'NÃO MAPEADO',
        interno:     item.name || '-',
        ean:         item.ean || '-',
        sku:         item.sku || '-',
        qtd:         qty,
        adjCost:     adj2,
        disc,
        sur,
        vlrtotal:    adj2 * qty,
        pvenda,
        markup:      pvenda > 0 && adj2 > 0 ? ((pvenda - adj2) / adj2 * 100) : null,
        distribuicao: distrib,
      };
    });

    const hasDisc = rows.some(r => r.disc > 0);
    const hasSur  = rows.some(r => r.sur  > 0);

    // ── Column specs ─────────────────────────────────────────────────────
    type ColSpec = { header: string; key: string; width: number; halign?: 'left'|'center'|'right'; redHeader?: boolean };
    let cols: ColSpec[];

    if (preset === 'financeiro') {
      const prodW = hasDisc && hasSur ? 60 : hasDisc || hasSur ? 66 : 76;
      const baseCols: ColSpec[] = [
        { header: 'Código',        key: 'codigo',    width: 25 },
        { header: 'Produto na Nota', key: 'produto', width: prodW },
        { header: 'Qtd',           key: 'qtd',       width: 10, halign: 'right' },
        { header: 'P. Custo',      key: 'adjcost',   width: 20, halign: 'right' },
        { header: 'Vlr Total',     key: 'vlrtotal',  width: 22, halign: 'right' },
        ...(hasDisc ? [{ header: 'Desconto',  key: 'disc', width: 18, halign: 'right' as const }] : []),
        ...(hasSur  ? [{ header: 'Acréscimo', key: 'sur',  width: 18, halign: 'right' as const }] : []),
        { header: 'P. Venda',      key: 'pvenda',    width: 20, halign: 'right' },
        { header: 'Markup',        key: 'markup',    width: 18, halign: 'right' },
        { header: 'Distribuição',  key: 'distribuicao', width: 0, halign: 'right' },
      ];
      const fixedW = baseCols.slice(0, -1).reduce((s, c) => s + c.width, 0);
      baseCols[baseCols.length - 1].width = usableW - fixedW;
      cols = baseCols;
    } else if (preset === 'estoque') {
      const fixedW = 25 + 68 + 35 + 18 + 24 + 29; // = 199
      cols = [
        { header: 'Código',        key: 'codigo',    width: 25 },
        { header: 'Produto na Nota', key: 'produto', width: 68 },
        { header: 'EAN',           key: 'ean',        width: 35 },
        { header: 'Quantidade',    key: 'qtd',        width: 18, halign: 'right' },
        { header: 'Preço Venda',   key: 'pvenda',     width: 24, halign: 'right', redHeader: true },
        { header: 'Distribuição',  key: 'distribuicao', width: usableW - fixedW, halign: 'right', redHeader: true },
        { header: 'Check',         key: 'check',      width: 29, halign: 'center' },
      ];
    } else {
      // Personalizado
      const COL_META: Record<string, Omit<ColSpec,'key'>> = {
        codigo:       { header: 'Código',                width: 25 },
        produto:      { header: 'Produto na Nota',       width: 70 },
        interno:      { header: 'Identificação Interna', width: 50 },
        ean:          { header: 'EAN',                   width: 35 },
        sku:          { header: 'SKU',                   width: 30 },
        qtd:          { header: 'Quantidade',            width: 18, halign: 'right' },
        adjcost:      { header: 'P. Custo',              width: 20, halign: 'right' },
        vlrtotal:     { header: 'Vlr Total',             width: 22, halign: 'right' },
        disc:         { header: 'Desconto',              width: 18, halign: 'right' },
        sur:          { header: 'Acréscimo',             width: 18, halign: 'right' },
        pvenda:       { header: 'P. Venda',              width: 20, halign: 'right' },
        markup:       { header: 'Markup',                width: 18, halign: 'right' },
        distribuicao: { header: 'Distribuição',          width: 40, halign: 'right' },
        check:        { header: 'Check',                 width: 20, halign: 'center' },
      };
      const keys = (layout?.customCols ?? ['codigo','produto','qtd','pvenda','distribuicao']);
      const rawCols: ColSpec[] = keys.map(k => ({ key: k, ...(COL_META[k] ?? { header: k, width: 20 }) }));
      const totalW = rawCols.reduce((s, c) => s + c.width, 0);
      cols = totalW > 0 ? rawCols.map(c => ({ ...c, width: Math.round(c.width / totalW * usableW) })) : rawCols;
    }

    // ── Cell value accessor ───────────────────────────────────────────────
    const getVal = (row: RowData, key: string): string => {
      switch (key) {
        case 'codigo':       return row.codigo;
        case 'produto':      return row.produto;
        case 'interno':      return row.interno;
        case 'ean':          return row.ean;
        case 'sku':          return row.sku;
        case 'qtd':          return fmtNum(row.qtd);
        case 'adjcost':      return row.adjCost > 0 ? fmtCur(row.adjCost) : '—';
        case 'vlrtotal':     return fmtCur(row.vlrtotal);
        case 'disc':         return row.disc > 0 ? `−${fmtCur(row.disc)}` : '—';
        case 'sur':          return row.sur  > 0 ? `+${fmtCur(row.sur)}`  : '—';
        case 'pvenda':       return row.pvenda > 0 ? fmtCur(row.pvenda) : '—';
        case 'markup':       return row.markup !== null ? `${row.markup >= 0 ? '+' : ''}${row.markup.toFixed(1)}%` : '—';
        case 'distribuicao': return row.distribuicao !== null ? fmtNum(row.distribuicao) : '—';
        case 'check':        return '';
        default:             return '—';
      }
    };

    const tableBody = rows.map(row => cols.map(c => getVal(row, c.key)));

    // ── Foot row ──────────────────────────────────────────────────────────
    const footRow = cols.map((c, i) => {
      if (i === 0)              return `${items.length} itens`;
      if (c.key === 'qtd')      return fmtNum(rows.reduce((s, r) => s + r.qtd, 0));
      if (c.key === 'vlrtotal') return fmtCur(rows.reduce((s, r) => s + r.vlrtotal, 0));
      if (c.key === 'disc')     return `−${fmtCur(rows.reduce((s, r) => s + r.disc, 0))}`;
      if (c.key === 'sur')      return `+${fmtCur(rows.reduce((s, r) => s + r.sur, 0))}`;
      if (c.key === 'markup') {
        const valid = rows.filter(r => r.markup !== null && r.adjCost > 0 && r.pvenda > 0);
        if (valid.length === 0) return '';
        const rev  = valid.reduce((s, r) => s + r.pvenda * r.qtd, 0);
        const cost = valid.reduce((s, r) => s + r.adjCost * r.qtd, 0);
        const avg  = cost > 0 ? ((rev - cost) / cost * 100) : 0;
        return `${avg >= 0 ? '+' : ''}${avg.toFixed(1)}%`;
      }
      if (c.key === 'distribuicao') return fmtNum(rows.reduce((s, r) => s + (r.distribuicao ?? 0), 0));
      return '';
    });

    // ── autoTable ─────────────────────────────────────────────────────────
    const columnStyles: Record<number, object> = {};
    cols.forEach((c, i) => {
      columnStyles[i] = { cellWidth: c.width, ...(c.halign ? { halign: c.halign } : {}) };
    });

    autoTable(doc, {
      startY: tableY,
      head: [cols.map(c => c.header)],
      body: tableBody,
      foot: [footRow],
      margin: { left: marginX, right: marginX },
      headStyles: {
        fillColor: [200, 200, 190] as [number, number, number],
        textColor: [20, 20, 14]   as [number, number, number],
        fontSize,
        fontStyle: 'bold',
        lineColor: [170, 168, 160] as [number, number, number],
        lineWidth: 0.5,
      },
      footStyles: {
        fillColor: [232, 232, 224] as [number, number, number],
        textColor: [20, 20, 14]   as [number, number, number],
        fontStyle: 'bold',
        fontSize,
        lineColor: [192, 192, 184] as [number, number, number],
        lineWidth: 0.4,
      },
      styles: {
        fontSize,
        cellPadding: cellPad,
        overflow: 'ellipsize',
        minCellHeight: 0,
        lineColor: [212, 212, 200] as [number, number, number],
        lineWidth: 0.4,
      },
      alternateRowStyles: { fillColor: [245, 245, 240] as [number, number, number] },
      columnStyles,
      didParseCell: (data: any) => {
        const col = cols[data.column.index];
        // Red header for Estoque preset columns
        if (col?.redHeader && data.section === 'head') {
          data.cell.styles.textColor = [185, 28, 28];
        }
        // Markup: color cells only (<65% red, >100% green), head/foot normal
        if (col?.key === 'markup' && data.section === 'body') {
          const row = rows[data.row.index];
          if (row?.markup !== null) {
            if ((row.markup as number) < 65)  data.cell.styles.textColor = [185, 28, 28];
            if ((row.markup as number) > 100) data.cell.styles.textColor = [21, 128, 61];
          }
        }
      },
    });

    const filename = preset === 'financeiro' ? 'estoque_financeiro.pdf'
      : preset === 'estoque' ? 'estoque_conferencia.pdf'
      : 'estoque_personalizado.pdf';
    doc.save(filename);
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

      const nfSupplierName = supplierNames.find((s: any) => s.id === selectedImportSupplierId)?.name || '';
      const itemsWithFinalPrices = pendingNfItems.map((item: any, idx: number) => ({
        ...item,
        ean: nfItemEans[idx] ?? item.ean,
        sku: nfItemSkus[idx] ?? item.sku,
        qty: nfItemQtys[idx] ?? item.qty,
        price: nfItemPrices[idx] ?? item.price,
        product_price: nfItemSellPrices[idx] ?? item.product_price,
        verified: nfItemVerified[idx] ?? item.verified,
        distribuicao: nfItemDistribuicao[idx] ? parseInt(nfItemDistribuicao[idx]) || null : null,
      }));
      const newNote: ReviewNote = {
        id: Date.now().toString(),
        timestamp: currentNfTimestamp,
        fileName: currentNfFileName,
        items: itemsWithFinalPrices,
        itemCount: pendingNfItems.length,
        verifiedCount: pendingNfItems.filter((i: any) => i.verified).length,
        noteNumber: nfNoteNumber || undefined,
        accessKey: nfAccessKey || undefined,
        supplierName: nfSupplierName || undefined,
      };
      await supabase.from('review_notes').insert({
        id: newNote.id,
        timestamp_label: newNote.timestamp,
        file_name: newNote.fileName,
        item_count: newNote.itemCount,
        verified_count: newNote.verifiedCount,
        items: newNote.items,
        note_number: nfNoteNumber || null,
        access_key: nfAccessKey || null,
        supplier_name: nfSupplierName || null,
      });
      setReviewNotes(prev => [newNote, ...prev]);
      setShowApproveNfConfirm(false);
      setShowNfDigitalizadaModal(false);
      setPendingNfItems([]);
      setNfItemPrices([]);
      setNfItemSellPrices([]);
      setNfItemVerified([]);
      setNfNoteNumber('');
      setNfAccessKey('');
      setNfItemDistribuicao([]);
      setNotification({ type: 'success', message: `Nota aprovada: ${updatedCount} itens atualizados no estoque.` });
      fetchProducts();
    } catch (err: any) {
      console.error('Erro ao aprovar nota:', err);
      setNotification({ type: 'error', message: 'Erro ao processar aprovação.' });
    } finally {
      setIsApprovingNf(false);
    }
  };

  const handleReviewUseTranslation = async (idx: number) => {
    if (!viewingReviewNote) return;
    const item = viewingReviewNote.items[idx];
    if (!item.product_id) {
      setNotification({ type: 'error', message: 'Vincule o produto ao dicionário primeiro.' });
      return;
    }
    setReviewLoadingUnitIdx(idx);
    try {
      const { data } = await supabase
        .from('supplier_units')
        .select('id, unit_name, multiplier')
        .eq('product_id', item.product_id)
        .limit(10);
      if (!data || data.length === 0) {
        setNotification({ type: 'error', message: 'Nenhuma tradução cadastrada para este produto. Use "Adicionar medida".' });
        return;
      }
      const conv = data[0];
      const mult = Number(conv.multiplier);
      const originalQty = item.original_qty ?? Math.round(item.qty / (item.multiplier || 1));
      const newQty = originalQty * mult;
      const u = [...viewingNoteUnits]; u[idx] = conv.unit_name; setViewingNoteUnits(u);
      const m = [...viewingNoteMultipliers]; m[idx] = mult; setViewingNoteMultipliers(m);
      const q = [...viewingNoteQtys]; q[idx] = newQty; setViewingNoteQtys(q);
      setNotification({ type: 'success', message: `Tradução aplicada: ×${mult}` });
    } catch {
      setNotification({ type: 'error', message: 'Erro ao buscar traduções.' });
    } finally {
      setReviewLoadingUnitIdx(null);
    }
  };

  const handleReviewSaveMeasure = async () => {
    if (reviewMeasureIdx === null || !viewingReviewNote) return;
    const mult = parseFloat(reviewMeasureMultiplier);
    if (isNaN(mult) || mult <= 0) {
      setNotification({ type: 'error', message: 'Informe um multiplicador válido (maior que 0).' });
      return;
    }
    setReviewSavingMeasure(true);
    try {
      const item = viewingReviewNote.items[reviewMeasureIdx];
      if (item.product_id) {
        await supabase.from('supplier_units').insert({
          product_id: item.product_id,
          unit_name: reviewMeasureUnit.trim() || item.unit,
          multiplier: mult,
        });
      }
      const originalQty = item.original_qty ?? Math.round(item.qty / (item.multiplier || 1));
      const newQty = originalQty * mult;
      const u = [...viewingNoteUnits]; u[reviewMeasureIdx] = reviewMeasureUnit.trim() || item.unit || 'UN'; setViewingNoteUnits(u);
      // Divide unit price by multiplier and reset multiplier to 1 to avoid double-division in cost = price/multiplier
      const currentPrice = viewingNoteItemPrices[reviewMeasureIdx] ?? item.price ?? 0;
      const unitPrice = parseFloat((currentPrice / mult).toFixed(6));
      const p = [...viewingNoteItemPrices]; p[reviewMeasureIdx] = unitPrice; setViewingNoteItemPrices(p);
      const m = [...viewingNoteMultipliers]; m[reviewMeasureIdx] = 1; setViewingNoteMultipliers(m);
      const q = [...viewingNoteQtys]; q[reviewMeasureIdx] = newQty; setViewingNoteQtys(q);
      setNotification({ type: 'success', message: `Medida cadastrada! 1 ${reviewMeasureUnit || item.unit} = ${mult} UN.` });
      setReviewMeasureIdx(null);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao salvar medida.' });
    } finally {
      setReviewSavingMeasure(false);
    }
  };

  const handleNoteItemCreateAndLink = async () => {
    if (!noteItemNewName.trim() || linkingItemIdx === null || !viewingReviewNote) return;
    setNoteItemCreating(true);
    try {
      const sku = noteItemNewSku.trim() || `SKU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      const { data: created, error } = await supabase.from('products')
        .insert({ name: noteItemNewName.trim(), sku, ean: noteItemNewEan.trim() || null, count: 0, is_low: true, status: 'Fora de Estoque', image: noteItemNewImage || null, price: parseFloat(noteItemNewSellPrice.replace(',', '.')) || 0 })
        .select('id, name, sku, ean, price').single();
      if (error) throw error;
      if (created) {
        const updatedItems = [...viewingReviewNote.items];
        updatedItems[linkingItemIdx] = {
          ...updatedItems[linkingItemIdx],
          name: created.name,
          sku: created.sku || updatedItems[linkingItemIdx].sku,
          ean: created.ean || updatedItems[linkingItemIdx].ean,
          product_id: created.id,
          product_price: 0,
          verified: true,
          status_translation: 'Identificado (SKU/EAN)',
        };
        setViewingReviewNote({ ...viewingReviewNote, items: updatedItems });
        const uV = [...viewingNoteVerified]; uV[linkingItemIdx] = true; setViewingNoteVerified(uV);
        const uS = [...viewingNoteSkus]; uS[linkingItemIdx] = created.sku || ''; setViewingNoteSkus(uS);
        const uE = [...viewingNoteEans]; uE[linkingItemIdx] = created.ean || ''; setViewingNoteEans(uE);
        const sellPrice = parseFloat(noteItemNewSellPrice.replace(',', '.')) || 0;
        const uP = [...viewingNoteSellPrices]; uP[linkingItemIdx] = sellPrice; setViewingNoteSellPrices(uP);
        setLinkingItemIdx(null);
        setNoteItemShowCreate(false);
        setNoteItemNewName(''); setNoteItemNewSku(''); setNoteItemNewEan(''); setNoteItemNewSellPrice(''); setNoteItemNewImage(''); setNoteItemNewImageUploading(false);
        setNotification({ type: 'success', message: 'Produto criado e vinculado com sucesso!' });
      }
    } catch (err: any) {
      const msg = err.message || '';
      const friendly = msg.includes('products_sku_key')
        ? 'Este SKU já está em uso. Escolha um SKU diferente ou deixe em branco para gerar automaticamente.'
        : msg.includes('products_ean') || msg.includes('ean')
        ? 'Este EAN já está cadastrado em outro produto.'
        : msg || 'Erro ao criar produto.';
      setNotification({ type: 'error', message: friendly });
    } finally {
      setNoteItemCreating(false);
    }
  };

  const handleSaveNote = useCallback(async () => {
    if (!viewingReviewNote) return;
    setSavingNote(true);
    try {
      const updatedItems = viewingReviewNote.items.map((item: any, idx: number) => ({
        ...item,
        ean: viewingNoteEans[idx] ?? item.ean,
        sku: viewingNoteSkus[idx] ?? item.sku,
        qty: viewingNoteQtys[idx] ?? item.qty,
        price: viewingNoteItemPrices[idx] ?? item.price,
        unit: viewingNoteUnits[idx] ?? item.unit,
        multiplier: viewingNoteMultipliers[idx] ?? item.multiplier,
        product_price: viewingNoteSellPrices[idx] ?? item.product_price,
        verified: viewingNoteVerified[idx] ?? item.verified,
        review_timestamp: viewingNoteReviewTimestamps[idx] ?? item.review_timestamp ?? null,
        distribuicao: viewingNoteDistribuicao[idx] !== undefined && viewingNoteDistribuicao[idx] !== ''
          ? parseInt(viewingNoteDistribuicao[idx]) || null
          : (item.distribuicao ?? null),
        adj_discount_mode: discountMode,
        adj_discount_applied: discountMode === 'geral' ? discountApplied : null,
        adj_discount_individual_type: discountIndividualType,
        adj_discount_value: discountMode === 'individual' ? (parseFloat(itemDiscounts[idx] ?? '') || null) : null,
        adj_surcharge_mode: surchargeMode,
        adj_surcharge_applied: surchargeMode === 'geral' ? surchargeApplied : null,
        adj_surcharge_individual_type: surchargeIndividualType,
        adj_surcharge_value: surchargeMode === 'individual' ? (parseFloat(itemSurcharges[idx] ?? '') || null) : null,
        discrepancy: viewingNoteDiscrepancies[idx] ?? item.discrepancy ?? null,
      }));
      const updatedVerifiedCount = viewingNoteVerified.filter(Boolean).length;
      const { error: saveError } = await supabase.from('review_notes').update({
        verified_count: updatedVerifiedCount,
        items: updatedItems,
        file_name: viewingReviewNote.fileName,
        note_number: viewingReviewNote.noteNumber || null,
        updated_at: new Date().toISOString(),
      }).eq('id', viewingReviewNote.id);
      if (saveError) throw saveError;
      const priceUpdates = updatedItems
        .filter((item: any) => item.product_id && item.product_price > 0)
        .map((item: any) => supabase.from('products').update({ price: item.product_price }).eq('id', item.product_id));
      if (priceUpdates.length > 0) await Promise.all(priceUpdates);
      setReviewNotes(prev => prev.map(n => {
        if (n.id !== viewingReviewNote.id) return n;
        return { ...n, verifiedCount: updatedVerifiedCount, items: updatedItems, fileName: viewingReviewNote.fileName, noteNumber: viewingReviewNote.noteNumber };
      }));
      setViewingReviewNote(prev => prev ? { ...prev, items: updatedItems, verifiedCount: updatedVerifiedCount, fileName: viewingReviewNote.fileName, noteNumber: viewingReviewNote.noteNumber } : null);
      setNotification({ type: 'success', message: 'Nota salva com sucesso!' });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao salvar nota.' });
    } finally {
      setSavingNote(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingReviewNote, viewingNoteEans, viewingNoteSkus, viewingNoteQtys, viewingNoteItemPrices, viewingNoteUnits, viewingNoteMultipliers, viewingNoteSellPrices, viewingNoteVerified, viewingNoteReviewTimestamps, viewingNoteDistribuicao, discountMode, discountApplied, discountIndividualType, itemDiscounts, surchargeMode, surchargeApplied, surchargeIndividualType, itemSurcharges, viewingNoteDiscrepancies]);

  const handleDeleteNote = useCallback(async () => {
    if (!viewingReviewNote) return;
    await supabase.from('review_notes').delete().eq('id', viewingReviewNote.id);
    setReviewNotes(prev => prev.filter(n => n.id !== viewingReviewNote.id));
    setViewingReviewNote(null);
    setShowMobileNoteView(false);
    setConfirmDeleteNote(false);
  }, [viewingReviewNote]);

  const handleNoteEanPaste = (e: React.ClipboardEvent, rowIndex: number) => {
    const text = e.clipboardData.getData('text');
    const lines = text
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
    if (lines.length <= 1) return; // comportamento padrão do browser para linha única
    e.preventDefault();
    setViewingNoteEans(prev => {
      const updated = [...prev];
      lines.forEach((value, i) => { updated[rowIndex + i] = value; });
      return updated;
    });
  };

  const handleMultiLinkItemSearch = async () => {
    if (!multiLinkItemSearch.trim()) return;
    const { data } = await supabase.from('products').select('id, name, sku, ean, price')
      .or(`name.ilike.%${multiLinkItemSearch}%,sku.ilike.%${multiLinkItemSearch}%,ean.ilike.%${multiLinkItemSearch}%`)
      .limit(8);
    setMultiLinkItemResults(data || []);
  };

  const handleMultiLinkItemAdd = (product: any) => {
    if (!multiLinkItemQty.trim() || parseFloat(multiLinkItemQty) <= 0) {
      setNotification({ type: 'error', message: 'Informe a quantidade antes de adicionar.' });
      return;
    }
    setMultiLinkItemEntries(prev => [...prev, { product, qty: multiLinkItemQty }]);
    setMultiLinkItemSearch(''); setMultiLinkItemQty(''); setMultiLinkItemResults([]);
  };

  const handleMultiLinkItemCreateProduct = async () => {
    if (!multiLinkItemNewName.trim()) { setNotification({ type: 'error', message: 'Nome é obrigatório.' }); return; }
    if (!multiLinkItemQty.trim() || parseFloat(multiLinkItemQty) <= 0) { setNotification({ type: 'error', message: 'Informe a quantidade.' }); return; }
    setMultiLinkItemCreating(true);
    try {
      const sku = multiLinkItemNewSku.trim() || null;
      const { data: created, error } = await supabase.from('products')
        .insert({ name: multiLinkItemNewName.trim(), sku, ean: multiLinkItemNewEan.trim() || null, count: 0, is_low: true, status: 'Fora de Estoque' })
        .select('id, name, sku, ean, price').single();
      if (error) throw error;
      if (created) {
        handleMultiLinkItemAdd(created);
        setMultiLinkItemNewName(''); setMultiLinkItemNewSku(''); setMultiLinkItemNewEan('');
        setMultiLinkItemShowCreate(false);
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao criar produto.' });
    } finally {
      setMultiLinkItemCreating(false);
    }
  };

  const handleSaveMultiLinkItem = () => {
    if (multiLinkItemIdx === null || !viewingReviewNote || multiLinkItemEntries.length === 0) return;
    const n = viewingReviewNote.items.length;
    const srcIdx = multiLinkItemIdx;
    const sourceItem = viewingReviewNote.items[srcIdx];

    const pad = <T,>(arr: T[], def: (i: number) => T): T[] => {
      if (arr.length >= n) return arr;
      return [...arr, ...Array.from({ length: n - arr.length }, (_, i) => def(arr.length + i))];
    };

    const pV = pad(viewingNoteVerified, (i) => viewingReviewNote.items[i]?.verified || false);
    const pP = pad(viewingNoteSellPrices, (i) => viewingReviewNote.items[i]?.product_price || 0);
    const pE = pad(viewingNoteEans, (i) => viewingReviewNote.items[i]?.ean || '');
    const pS = pad(viewingNoteSkus, (i) => viewingReviewNote.items[i]?.sku || '');
    const pQ = pad(viewingNoteQtys, (i) => viewingReviewNote.items[i]?.qty || 0);
    const pD = pad(viewingNoteDistribuicao, (i) => { const d = viewingReviewNote.items[i]?.distribuicao; return d != null ? String(d) : ''; });
    const pU = pad(viewingNoteUnits, (i) => viewingReviewNote.items[i]?.unit || 'UN');
    const pM = pad(viewingNoteMultipliers, (i) => viewingReviewNote.items[i]?.multiplier || 1);
    const pT = pad(viewingNoteReviewTimestamps, () => null as string | null);
    const pDisc = pad(itemDiscounts, () => '');
    const pSur = pad(itemSurcharges, () => '');
    const pDiscr = pad(viewingNoteDiscrepancies, () => null as DiscrepancyData | null);

    const sp = <T,>(arr: T[], reps: T[]): T[] => { const r = [...arr]; r.splice(srcIdx, 1, ...reps); return r; };

    const newItems = multiLinkItemEntries.map(e => ({
      ...sourceItem,
      name: e.product.name,
      sku: e.product.sku || sourceItem.sku,
      ean: e.product.ean || sourceItem.ean,
      product_id: e.product.id,
      product_price: e.product.price || 0,
      qty: parseFloat(e.qty) || 0,
      verified: true,
      status_translation: 'Identificado (SKU/EAN)',
      multiLinked: true,
    }));

    setViewingReviewNote({ ...viewingReviewNote, items: sp(viewingReviewNote.items, newItems) });
    setViewingNoteVerified(sp(pV, newItems.map(() => true)));
    setViewingNoteSellPrices(sp(pP, multiLinkItemEntries.map(e => e.product.price || 0)));
    setViewingNoteEans(sp(pE, multiLinkItemEntries.map(e => e.product.ean || '')));
    setViewingNoteSkus(sp(pS, multiLinkItemEntries.map(e => e.product.sku || '')));
    setViewingNoteQtys(sp(pQ, multiLinkItemEntries.map(e => parseFloat(e.qty) || 0)));
    setViewingNoteDistribuicao(sp(pD, newItems.map(() => pD[srcIdx])));
    setViewingNoteUnits(sp(pU, newItems.map(() => pU[srcIdx])));
    setViewingNoteMultipliers(sp(pM, newItems.map(() => pM[srcIdx])));
    setViewingNoteReviewTimestamps(sp(pT, newItems.map(() => null)));
    setItemDiscounts(sp(pDisc, newItems.map(() => pDisc[srcIdx])));
    setItemSurcharges(sp(pSur, newItems.map(() => pSur[srcIdx])));
    setViewingNoteDiscrepancies(sp(pDiscr, newItems.map(() => null)));

    setNotification({ type: 'success', message: `${newItems.length} linha${newItems.length !== 1 ? 's' : ''} criada${newItems.length !== 1 ? 's' : ''}.` });
    setMultiLinkItemIdx(null); setMultiLinkItemEntries([]);
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
          const ean = getVal(row, ['ean', 'codigo ean', 'cod ean', 'ean13', 'gtin', 'barras', 'barcode', 'codigo barras', 'cod barras', 'codigo de barras']);
          const rawSku = getVal(row, ['sku', 'codigo interno', 'cod interno', 'referencia', 'ref', 'internal code', 'codigo sku', 'cod sku', 'codigo', 'cod', 'id']);
          // If nothing mapped to EAN but rawSku looks like a barcode (8, 12 or 13 digits), treat it as EAN
          const looksLikeBarcode = /^\d{8}$|^\d{12}$|^\d{13}$/.test(rawSku.replace(/\s/g, ''));
          const sku = (!ean && looksLikeBarcode) ? '' : rawSku;
          const finalEan = (!ean && looksLikeBarcode) ? rawSku : ean;
          const description = getVal(row, ['desc', 'descricao', 'nome', 'produto', 'servico', 'descricao produto', 'descrição']);
          const unit = getVal(row, ['unidade', 'un', 'unid', 'emb', 'medida']);
          const qty = parseInt(getVal(row, ['qty', 'qtd', 'quantidade', 'entry', 'quant', 'movimento', 'entrada', 'unidades', 'qtde'], '0'));
          const price = parseFloat(getVal(row, ['preco', 'valor', 'unit', 'preco unitario', 'unitario', 'punit'], '0'));

          if (isNaN(qty) || qty <= 0) continue;

          // Try to find product by SKU, EAN or mapping
          let product = currentProducts?.find(p => (sku && p.sku === sku) || (finalEan && p.ean === finalEan));
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
            ean: finalEan || product?.ean || '',
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
        setNfItemEans([]);
        setNfItemSkus([]);
        setNfItemQtys([]);
        setNfEditableCols(new Set());
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
      const { data, error } = await supabase.from('suppliers').select('*').order('nome_fantasia,name');
      if (error) throw error;
      setSupplierNames((data || []).map((s: any) => ({
        ...s,
        name: s.nome_fantasia?.trim() || s.name,
      })));
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
        p.name?.toLowerCase().includes(query) ||
        p.sku?.toLowerCase().includes(query) ||
        p.location?.toLowerCase().includes(query) ||
        (p.ean && p.ean.includes(query)) ||
        (p.internalCode && p.internalCode.toLowerCase().includes(query)) ||
        (p.category && p.category.toLowerCase().includes(query)) ||
        (p.subcategory && p.subcategory.toLowerCase().includes(query)) ||
        (p.brand && p.brand.toLowerCase().includes(query));

      return matchesGlobal;
    });
  }, [searchQuery, products]);

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -100 }}
            animate={{ opacity: 1, y: 24 }}
            exit={{ opacity: 0, y: -100 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[999999] w-full max-w-md"
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
          unreadNotifications={unreadNotificationCount}
        />
        <main className="flex-1 ml-0 md:ml-[80px]">
          <TopNav
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeTab={activeTab}
            notifications={appNotifications}
            onMarkAllRead={handleMarkAllNotificationsRead}
            onGoToNote={handleGoToNote}
            onGoToNotificationsPage={() => setActiveTab('Notificações')}
          />
          <div className={cn(
            "px-5 md:px-7 pb-8 max-w-[1400px] space-y-4 md:space-y-8",
            activeTab === 'Inventory' ? "pt-[74px]" : "pt-5"
          )}>
            {activeTab === 'Inventory' ? (
                <InventoryManager 
                  products={products}
                  loading={loading}
                  isConfigured={isConfigured}
                  importing={importing}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  onAdd={() => setShowAddModal(true)}
                  onOpenProductList={() => setShowProductBulkTable(true)}
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
                    setViewingNoteEans([]);
                    setViewingNoteSkus([]);
                    setViewingNoteQtys([]);
                    setViewingNoteItemPrices(note.items.map((item: any) => item.price || 0));
                    setViewingNoteDistribuicao(note.items.map((item: any) => item.distribuicao !== null && item.distribuicao !== undefined ? String(item.distribuicao) : ''));
                    setViewingNoteUnits(note.items.map((item: any) => item.unit || 'UN'));
                    setViewingNoteMultipliers(note.items.map((item: any) => item.multiplier || 1));
                    setReviewUnitMenuIdx(null);
                    setReviewMeasureIdx(null);
                    setReviewEditableCols(new Set());
                    setEditingNoteHeader(false);
                    setReviewFilterActive(false);
                    setReviewColumnFilters({});
                    setReviewFilterOpen(null);
                    setReviewFilterSearch('');
                    setViewingNoteReviewTimestamps(note.items.map((item: any) => item.review_timestamp || null));
                    setViewingNoteDiscrepancies(note.items.map((item: any) => item.discrepancy ?? null));
                    const fi = note.items[0] as any;
                    const savedDiscountMode: AdjMode = fi?.adj_discount_mode ?? 'none';
                    setDiscountMode(savedDiscountMode);
                    if (savedDiscountMode === 'geral' && fi?.adj_discount_applied) {
                      setDiscountApplied(fi.adj_discount_applied);
                      setDiscountGeralValue(String(fi.adj_discount_applied.value));
                      setDiscountGeralType(fi.adj_discount_applied.type);
                    } else {
                      setDiscountApplied(null);
                    }
                    if (savedDiscountMode === 'individual') {
                      setDiscountIndividualType(fi?.adj_discount_individual_type ?? 'pct');
                      setItemDiscounts(note.items.map((it: any) => it.adj_discount_value != null ? String(it.adj_discount_value) : ''));
                    } else {
                      setItemDiscounts([]);
                    }
                    setDiscountDropdown(false); setDiscountDialog(null);
                    const savedSurchargeMode: AdjMode = fi?.adj_surcharge_mode ?? 'none';
                    setSurchargeMode(savedSurchargeMode);
                    if (savedSurchargeMode === 'geral' && fi?.adj_surcharge_applied) {
                      setSurchargeApplied(fi.adj_surcharge_applied);
                      setSurchargeGeralValue(String(fi.adj_surcharge_applied.value));
                      setSurchargeGeralType(fi.adj_surcharge_applied.type);
                    } else {
                      setSurchargeApplied(null);
                    }
                    if (savedSurchargeMode === 'individual') {
                      setSurchargeIndividualType(fi?.adj_surcharge_individual_type ?? 'pct');
                      setItemSurcharges(note.items.map((it: any) => it.adj_surcharge_value != null ? String(it.adj_surcharge_value) : ''));
                    } else {
                      setItemSurcharges([]);
                    }
                    setSurchargeDropdown(false); setSurchargeDialog(null);
                  }}
                  onApproveNote={handleApproveNote}
                  onLinkNote={handleLinkNote}
                  pendingOpenNoteId={pendingOpenNoteId}
                  onPendingOpenNoteHandled={() => setPendingOpenNoteId(null)}
                />
            ) : activeTab === 'Pedidos de Compra' ? (
                <PurchaseOrderManager />
            ) : activeTab === 'Controle Financeiro' ? (
                <FinanceManager />
            ) : activeTab === 'Notificações' ? (
                <NotificationsPage
                  notifications={appNotifications}
                  onGoToNote={handleGoToNote}
                  onMarkAllRead={handleMarkAllNotificationsRead}
                  onGoToFinancas={() => setActiveTab('Despesas')}
                />
            ) : activeTab === 'Despesas' ? (
                <DespesasPage onBack={() => setActiveTab('Notificações')} />
            ) : activeTab === 'Configurações' ? (
                <SettingsPage />
            ) : activeTab === 'Dashboard' ? (
                <FinanceDashboard />
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
              className="relative bg-white dark:bg-[#2D2D2D] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-[#3A3A3A] flex items-center justify-between">
                <h2 className="text-xl font-manrope font-extrabold text-on-surface">Editar Produto</h2>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setIsAddingNew({ location: false, category: false, subcategory: false, brand: false });
                  }}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-[#3A3A3A] rounded-full transition-colors"
                >
                  <X size={20} className="text-secondary" />
                </button>
              </div>
              
              <form onSubmit={handleEditProduct} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                {editStatus === 'success' && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg text-sm font-bold flex items-center gap-2"
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
                      className="w-full bg-slate-50 dark:!bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg px-4 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Nome do Produto</label>
                    <input 
                      required
                      type="text" 
                      value={editingProduct.name}
                      onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})}
                      className="w-full bg-slate-50 dark:!bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg px-4 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
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
                            className="flex-1 bg-slate-50 dark:!bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg px-4 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                            placeholder="Código de barras..."
                          />
                          {index === 0 ? (
                            <button 
                              type="button"
                              onClick={() => setEditingProduct({...editingProduct, eans: [...(editingProduct.eans || [editingProduct.ean || '']), '']})}
                              className="w-10 bg-primary/10 dark:bg-primary text-primary dark:text-white rounded-lg flex items-center justify-center hover:bg-primary/20 dark:hover:bg-primary/80 transition-all"
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
                      className="w-full bg-slate-50 dark:!bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg px-4 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Preço (R$)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={isNaN(editingProduct.price) ? 0 : (editingProduct.price || 0)}
                      onChange={(e) => setEditingProduct({...editingProduct, price: parseFloat(e.target.value || '0') || 0})}
                      className="w-full bg-slate-50 dark:!bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg px-4 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
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
                      className="w-full bg-slate-50 dark:!bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg px-4 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    >
                      <option value="Em Estoque">Em Estoque</option>
                      <option value="Estoque em Alta">Estoque em Alta</option>
                      <option value="Estoque Baixo">Estoque Baixo</option>
                      <option value="Fora de Estoque">Fora de Estoque</option>
                    </select>
                  </div>
                  
                  <div className="md:col-span-2 p-4 bg-purple-50 dark:bg-[#232323] rounded-2xl border border-purple-100 dark:border-[#3A3A3A] space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
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
                        <div className="w-11 h-6 bg-slate-200 dark:bg-[#3A3A3A] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                        <span className="ml-3 text-xs font-bold text-purple-700 dark:text-purple-400 uppercase">Produto Mãe</span>
                      </label>
                    </div>

                    {editingProduct.is_mother && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-4 pt-2 border-t border-purple-100 dark:border-[#3A3A3A]"
                      >
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase">Unidades por Mãe (Ex: 50un na caixa)</label>
                          <input
                            type="number"
                            value={editingProduct.units_per_mother}
                            onChange={(e) => setEditingProduct({...editingProduct, units_per_mother: parseInt(e.target.value || '1') || 1})}
                            className="w-full bg-white dark:!bg-[#3A3A3A] border border-purple-200 dark:border-transparent rounded-lg px-4 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                            placeholder="Ex: 50"
                          />
                        </div>
                        <p className="text-[10px] text-purple-600 dark:text-purple-400/70 italic">
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
                        className="flex-1 bg-slate-50 dark:!bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg px-4 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
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
                        className="px-4 bg-slate-100 dark:bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg text-secondary hover:bg-slate-200 dark:hover:bg-[#444] transition-all flex items-center justify-center shrink-0"
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
                      className="flex-1 bg-slate-100 dark:bg-[#3A3A3A] text-secondary dark:text-[#aaa] font-bold py-3 rounded-xl hover:bg-slate-200 dark:hover:bg-[#444] transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLinkTarget('editing');
                        setShowLinkModal(true);
                      }}
                      className="flex-1 bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 font-bold py-3 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors border border-red-100 dark:border-red-900 flex items-center justify-center gap-2"
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
                      className="w-full text-red-500 dark:text-red-400 text-[10px] font-bold uppercase tracking-wider hover:underline py-2"
                    >
                      Excluir Produto
                    </button>
                  ) : (
                    <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-xl border border-red-100 dark:border-red-900 flex flex-col gap-3">
                      <p className="text-xs text-red-700 dark:text-red-400 font-bold text-center uppercase">Confirmar Exclusão?</p>
                      <div className="flex gap-2">
                        <button 
                          type="button"
                          onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 bg-white dark:bg-[#3A3A3A] border border-slate-200 dark:border-transparent text-secondary dark:text-[#aaa] text-[10px] font-bold py-2 rounded uppercase"
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
                                className="w-10 bg-primary/10 dark:bg-primary text-primary dark:text-white rounded-lg flex items-center justify-center hover:bg-primary/20 dark:hover:bg-primary/80 transition-all"
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
                    className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg text-sm font-bold flex items-center gap-2"
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
                      className="w-full bg-slate-50 dark:!bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg px-4 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
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
                      className="w-full bg-slate-50 dark:!bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg px-4 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
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
                            className="flex-1 bg-slate-50 dark:!bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg px-4 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                            placeholder="789..."
                          />
                          {index === 0 ? (
                            <button 
                              type="button"
                              onClick={() => setNewProduct({...newProduct, eans: [...(newProduct.eans || [newProduct.ean || '']), '']})}
                              className="w-10 bg-primary/10 dark:bg-primary text-primary dark:text-white rounded-lg flex items-center justify-center hover:bg-primary/20 dark:hover:bg-primary/80 transition-all"
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
                      className="w-full bg-slate-50 dark:!bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg px-4 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase">Preço (R$)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={isNaN(newProduct.price) ? 0 : newProduct.price}
                      onChange={(e) => setNewProduct({...newProduct, price: parseFloat(e.target.value || '0') || 0})}
                      className="w-full bg-slate-50 dark:!bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg px-4 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
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
                      className="w-full bg-slate-50 dark:!bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg px-4 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
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
                        className="flex-1 bg-slate-50 dark:!bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg px-4 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
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
                        className="px-4 bg-slate-100 dark:bg-[#3A3A3A] border border-slate-200 dark:border-transparent rounded-lg text-secondary hover:bg-slate-200 dark:hover:bg-[#444] transition-all flex items-center justify-center shrink-0"
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

      {/* Product Bulk Table */}
      <ProductBulkTable
        isOpen={showProductBulkTable}
        onClose={() => setShowProductBulkTable(false)}
        onSave={async (rows) => {
          let savedCount = 0;
          let errorCount = 0;
          try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );
            const inserts = rows
              .filter(r => r.name.trim())
              .map(r => ({
                name: r.name.trim(),
                sku: r.sku.trim() || null,
                ean: r.ean.trim() || null,
                category: r.category.trim() || null,
                subcategory: r.subcategory.trim() || null,
                brand: r.brand.trim() || null,
                location: r.location.trim() || null,
                stock: r.count !== '' ? parseFloat(r.count) || 0 : 0,
                price: r.price !== '' ? parseFloat(r.price.replace(',', '.')) || null : null,
                status: r.status || 'Em Estoque',
              }));
            if (inserts.length === 0) return { saved: 0, errors: 1 };
            const { error } = await supabase.from('products').insert(inserts);
            if (error) { errorCount = inserts.length; }
            else { savedCount = inserts.length; await fetchProducts(); }
          } catch {
            errorCount = rows.length;
          }
          return { saved: savedCount, errors: errorCount };
        }}
      />

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

      {/* Manual Manifest Modal */}
      <ManualManifestModal
        isOpen={showManualNoteModal}
        onClose={() => setShowManualNoteModal(false)}
        suppliers={supplierNames}
        setNotification={setNotification}
        onManifestSaved={(note) => setReviewNotes(prev => [note, ...prev])}
      />

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
                  <button
                    onClick={() => { setEstoquePickerArgs({ items: translatedNoteItems }); setShowEstoqueLayoutPicker(true); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-100"
                  >
                    <Download size={16} />
                    Estoque
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
                      <th className="pb-4 text-[10px] font-bold text-secondary uppercase tracking-widest pl-4">EAN</th>
                      <th className="pb-4 text-[10px] font-bold text-secondary uppercase tracking-widest pl-4">SKU</th>
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
                          <p className="text-[10px] font-bold text-slate-400">{item.ean || '-'}</p>
                        </td>
                        <td className="py-4 pl-4">
                          <p className="text-[10px] font-bold text-slate-400">{item.sku || '-'}</p>
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
                  <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20 shrink-0">
                    <FileUp size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-xl font-black text-slate-900">Nota Digitalizada</h3>
                      <div className="flex items-center gap-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Nº Nota</label>
                        <input
                          type="text"
                          value={nfNoteNumber}
                          onChange={e => setNfNoteNumber(e.target.value)}
                          placeholder="0000"
                          className="w-20 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Chave de Acesso</label>
                        <input
                          type="text"
                          value={nfAccessKey}
                          onChange={e => setNfAccessKey(e.target.value)}
                          placeholder="Opcional"
                          className="w-52 text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 font-medium truncate max-w-xs mt-0.5">{currentNfFileName} · {currentNfTimestamp}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => exportTranslatedToExcel(pendingNfItems.map((item, idx) => ({ ...item, price: nfItemPrices[idx] ?? item.price })), { discountMode, discountApplied, discountIndividualType, itemDiscounts, surchargeMode, surchargeApplied, surchargeIndividualType, itemSurcharges })}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors border border-emerald-100"
                  >
                    <Download size={16} />
                    Excel
                  </button>
                  <button
                    onClick={() => exportTranslatedToPDF(pendingNfItems.map((item, idx) => ({ ...item, price: nfItemPrices[idx] ?? item.price, distribuicao: nfItemDistribuicao[idx] ? parseInt(nfItemDistribuicao[idx]) || null : null })), { discountMode, discountApplied, discountIndividualType, itemDiscounts, surchargeMode, surchargeApplied, surchargeIndividualType, itemSurcharges }, { supplierName: supplierNames.find((s: any) => s.id === selectedImportSupplierId)?.name || '', noteNumber: nfNoteNumber, accessKey: nfAccessKey })}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100 transition-colors border border-red-100"
                  >
                    <Download size={16} />
                    PDF
                  </button>
                  <button
                    onClick={() => { setEstoquePickerArgs({ items: pendingNfItems.map((item, idx) => ({ ...item, price: nfItemPrices[idx] ?? item.price, distribuicao: nfItemDistribuicao[idx] ? parseInt(nfItemDistribuicao[idx]) || null : null })), adj: { discountMode, discountApplied, discountIndividualType, itemDiscounts, surchargeMode, surchargeApplied, surchargeIndividualType, itemSurcharges }, meta: { supplierName: supplierNames.find((s: any) => s.id === selectedImportSupplierId)?.name || '', noteNumber: nfNoteNumber, accessKey: nfAccessKey } }); setShowEstoqueLayoutPicker(true); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-100"
                  >
                    <Download size={16} />
                    Estoque
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-900 text-left">
                      {(['Produto na Nota', 'Identificação Interna', 'EAN', 'SKU', 'Qtd.'] as const).map(col => {
                        const editable = nfEditableCols.has(col);
                        const canEdit = col !== 'Identificação Interna';
                        return (
                          <th key={col} className="py-3 px-4 text-[10px] font-bold uppercase tracking-widest">
                            <div className="flex items-center gap-1.5">
                              <span className={editable ? 'text-emerald-400' : 'text-white'}>{col}</span>
                              {canEdit && (
                                <button
                                  onClick={() => setNfEditableCols(prev => { const s = new Set(prev); s.has(col) ? s.delete(col) : s.add(col); return s; })}
                                  title={editable ? 'Bloquear coluna' : 'Editar coluna'}
                                  className={cn('w-4 h-4 rounded flex items-center justify-center transition-colors', editable ? 'text-emerald-400 hover:text-emerald-200' : 'text-white/30 hover:text-white/70')}
                                >
                                  <Pencil size={9} />
                                </button>
                              )}
                            </div>
                          </th>
                        );
                      })}
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-right">Preço Custo</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-right">Preço Venda</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-right">Markup</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest">Status</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-center">Ok</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-white uppercase tracking-widest text-center">Distribuição</th>
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
                            {nfEditableCols.has('Produto na Nota') ? (
                              <input type="text" value={item.original_description || ''}
                                onChange={e => { const u = [...pendingNfItems]; u[idx] = { ...u[idx], original_description: e.target.value }; setPendingNfItems(u); }}
                                className="w-full text-sm font-semibold text-slate-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                            ) : (
                              <p className="text-sm font-semibold text-slate-800">{item.original_description || '-'}</p>
                            )}
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
                            {nfEditableCols.has('EAN') ? (
                              <input type="text" value={nfItemEans[idx] ?? item.ean ?? ''}
                                onChange={e => { const u = [...nfItemEans]; u[idx] = e.target.value; setNfItemEans(u); }}
                                className="w-full text-[11px] font-bold text-slate-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                            ) : (
                              <p className="text-[11px] font-bold text-slate-400 leading-tight">{(nfItemEans[idx] ?? item.ean) || '-'}</p>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {nfEditableCols.has('SKU') ? (
                              <input type="text" value={nfItemSkus[idx] ?? item.sku ?? ''}
                                onChange={e => { const u = [...nfItemSkus]; u[idx] = e.target.value; setNfItemSkus(u); }}
                                className="w-full text-[11px] font-bold text-slate-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                            ) : (
                              <p className="text-[11px] font-bold text-slate-400 leading-tight">{(nfItemSkus[idx] ?? item.sku) || '-'}</p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {nfEditableCols.has('Qtd.') ? (
                              <input type="number" min="0" value={nfItemQtys[idx] ?? item.qty}
                                onChange={e => { const u = [...nfItemQtys]; u[idx] = parseInt(e.target.value) || 0; setNfItemQtys(u); }}
                                className="w-16 text-center text-xs font-black text-slate-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                            ) : (
                              <span className="inline-block px-3 py-1 bg-slate-100 rounded-full text-xs font-black text-slate-700">{nfItemQtys[idx] ?? item.qty}</span>
                            )}
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
                          <td className="py-3 px-4 text-center">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={nfItemDistribuicao[idx] ?? ''}
                              onChange={e => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                const u = [...nfItemDistribuicao];
                                u[idx] = val;
                                setNfItemDistribuicao(u);
                              }}
                              placeholder="—"
                              className="w-14 text-center text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                            />
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
                    setNfNoteNumber('');
                    setNfAccessKey('');
                    setNfItemDistribuicao([]);
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
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-[10px]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingReviewNote(null)}
              className="absolute inset-0 bg-black/75 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="relative w-full h-full bg-white dark:bg-[#1e1e18] rounded-[20px] shadow-2xl overflow-hidden flex flex-col border border-line/60 dark:border-white/[0.06]"
            >
              <div className="p-6 border-b border-line dark:border-white/[0.07] flex items-center justify-between bg-surface-container dark:bg-[#252520] shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                    <FileText size={24} />
                  </div>
                  <div>
                    {editingNoteHeader ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={viewingReviewNote.fileName}
                            onChange={e => setViewingReviewNote({ ...viewingReviewNote, fileName: e.target.value })}
                            placeholder="Nome da nota"
                            className="text-xl font-black text-on-surface border-b-2 border-primary outline-none bg-transparent w-64 placeholder:text-on-surface/20"
                          />
                          <button onClick={() => setEditingNoteHeader(false)} className="p-1 hover:bg-on-surface/[0.07] rounded-lg transition-colors" title="Confirmar">
                            <CheckCircle2 size={16} className="text-primary" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={viewingReviewNote.noteNumber || ''}
                            onChange={e => setViewingReviewNote({ ...viewingReviewNote, noteNumber: e.target.value || undefined })}
                            placeholder="Número da nota"
                            className="text-sm font-bold text-on-surface/60 border-b border-on-surface/20 outline-none bg-transparent w-48 placeholder:text-on-surface/20"
                          />
                        </div>
                        {viewingReviewNote.supplierName && (
                          <span className="text-xs font-bold text-on-surface/40">{viewingReviewNote.supplierName}</span>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xl font-black text-on-surface">
                            {viewingReviewNote.fileName || <span className="text-on-surface/30 font-medium">Nota sem nome</span>}
                          </h3>
                          {viewingReviewNote.supplierName && (
                            <span className="text-sm font-bold text-on-surface/45">{viewingReviewNote.supplierName}</span>
                          )}
                          <button
                            onClick={() => setEditingNoteHeader(true)}
                            className="p-1 hover:bg-on-surface/[0.07] rounded-lg transition-colors text-on-surface/30 hover:text-on-surface/60"
                            title="Editar nome e número"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {viewingReviewNote.noteNumber ? (
                            <span className="px-2 py-0.5 bg-on-surface/[0.07] rounded-lg text-xs font-black text-on-surface/50">{viewingReviewNote.noteNumber}</span>
                          ) : (
                            <button
                              onClick={() => setEditingNoteHeader(true)}
                              className="text-xs text-on-surface/20 hover:text-on-surface/50 transition-colors"
                            >
                              + Número da nota
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {viewingReviewNote.accessKey && (
                      <p className="text-[10px] font-mono text-on-surface/30 mt-0.5 truncate max-w-sm">{viewingReviewNote.accessKey}</p>
                    )}
                    <p className="text-xs text-on-surface/35 font-medium mt-0.5">{viewingReviewNote.timestamp}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => exportTranslatedToExcel(viewingReviewNote.items, { discountMode, discountApplied, discountIndividualType, itemDiscounts, surchargeMode, surchargeApplied, surchargeIndividualType, itemSurcharges })}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-bold hover:bg-emerald-500/18 transition-colors border border-emerald-500/15"
                    >
                      <Download size={16} />
                      Excel
                    </button>
                    <div className="w-px h-5 bg-on-surface/10" />
                    <button
                      onClick={() => {
                        const next = !reviewFilterActive;
                        setReviewFilterActive(next);
                        if (!next) { setReviewColumnFilters({}); setReviewFilterOpen(null); setReviewFilterSearch(''); }
                      }}
                      title={reviewFilterActive ? 'Desativar filtros' : 'Filtrar por coluna'}
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                        reviewFilterActive
                          ? 'bg-primary text-white shadow-md'
                          : 'bg-on-surface/[0.06] text-on-surface/40 hover:bg-on-surface/[0.1] hover:text-on-surface/60',
                        Object.values(reviewColumnFilters).some(s => s.size > 0) && !reviewFilterActive && 'ring-2 ring-primary/40',
                      )}
                    >
                      <Filter size={13} />
                    </button>
                  </div>
                  <button
                    onClick={() => exportTranslatedToPDF(viewingReviewNote.items, { discountMode, discountApplied, discountIndividualType, itemDiscounts, surchargeMode, surchargeApplied, surchargeIndividualType, itemSurcharges }, { supplierName: viewingReviewNote.supplierName, noteNumber: viewingReviewNote.noteNumber, accessKey: viewingReviewNote.accessKey })}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/18 transition-colors border border-red-500/15"
                  >
                    <Download size={16} />
                    PDF
                  </button>
                  <button
                    onClick={() => {
                      setEstoquePickerArgs({
                        items: viewingReviewNote.items.map((item: any, idx: number) => ({ ...item, distribuicao: viewingNoteDistribuicao[idx] !== undefined && viewingNoteDistribuicao[idx] !== '' ? parseInt(viewingNoteDistribuicao[idx]) || null : (item.distribuicao ?? null) })),
                        adj: { discountMode, discountApplied, discountIndividualType, itemDiscounts, surchargeMode, surchargeApplied, surchargeIndividualType, itemSurcharges },
                        meta: { supplierName: viewingReviewNote.supplierName, noteNumber: viewingReviewNote.noteNumber, accessKey: viewingReviewNote.accessKey },
                      });
                      setShowEstoqueLayoutPicker(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 text-blue-400 text-xs font-bold hover:bg-blue-500/18 transition-colors border border-blue-500/15"
                  >
                    <Download size={16} />
                    Estoque
                  </button>
                  <div className="w-px h-8 bg-line dark:bg-white/[0.08] mx-2" />
                  <button onClick={() => setViewingReviewNote(null)} className="p-2 hover:bg-on-surface/[0.07] rounded-full transition-colors">
                    <X size={24} className="text-on-surface/35" />
                  </button>
                </div>
              </div>

              <div
                className="flex-1 overflow-auto [--rn-th-bg:#FFE500] [--rn-th-color:rgba(26,26,20,0.55)] [--rn-th-pill:rgba(0,0,0,0.1)] [--rn-cell-bg:#FFFFFF] [--rn-cell-bg-alt:#FFFCEC] [--rn-cell-border:rgba(180,165,120,0.35)] [--rn-cell-inner:rgba(0,0,0,0.06)] [--rn-seq-bg:rgba(0,0,0,0.07)] [--rn-text:rgba(26,26,20,0.85)] [--rn-text-muted:rgba(26,26,20,0.5)] [--rn-text-subtle:rgba(26,26,20,0.28)] dark:[--rn-th-bg:#2e2e28] dark:[--rn-th-color:rgba(242,240,227,0.45)] dark:[--rn-th-pill:rgba(255,255,255,0.06)] dark:[--rn-cell-bg:#252520] dark:[--rn-cell-bg-alt:#1e1e18] dark:[--rn-cell-border:rgba(242,240,227,0.06)] dark:[--rn-cell-inner:#3a3a34] dark:[--rn-seq-bg:#111110] dark:[--rn-text:rgba(242,240,227,0.85)] dark:[--rn-text-muted:rgba(242,240,227,0.5)] dark:[--rn-text-subtle:rgba(242,240,227,0.28)]"
                style={{ padding: '12px 14px 0' }}
              >
                <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: '0 4px', minWidth: '1400px' }}>
                  <thead className="sticky top-0 z-10">
                    <tr className="text-left">
                      {/* Single connected header bar — all th share bg, radius only on corners */}
                      {(() => {
                        const thBar: React.CSSProperties = { background: 'var(--rn-th-bg)', padding: '5px 4px', verticalAlign: 'middle', height: '40px' };
                        const thFirst: React.CSSProperties = { ...thBar, borderRadius: '9px 0 0 9px', paddingLeft: '6px' };
                        const thLast: React.CSSProperties = { ...thBar, borderRadius: '0 9px 9px 0', paddingRight: '6px', width: '36px' };
                        const lbl = (extra?: React.CSSProperties): React.CSSProperties => ({
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          background: 'var(--rn-th-pill)', borderRadius: '5px',
                          padding: '3px 7px', fontSize: '9px', fontWeight: 800,
                          letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                          color: 'var(--rn-th-color)', whiteSpace: 'nowrap' as const, ...extra,
                        });
                        // ── Filter helpers (used when reviewFilterActive) ──
                        const colFilterKey: Record<string, string> = {
                          'Produto na Nota': 'produto',
                          'Identificação Interna': 'interno',
                          'EAN': 'ean',
                          'SKU': 'sku',
                        };
                        const getColUniqueValues = (key: string): string[] =>
                          Array.from(new Set(
                            viewingReviewNote!.items.map((it: any, i: number) => {
                              if (key === 'produto') return it.original_description || '-';
                              if (key === 'interno') return it.name || '-';
                              if (key === 'ean') return viewingNoteEans[i] || it.ean || '-';
                              if (key === 'sku') return viewingNoteSkus[i] || it.sku || '-';
                              if (key === 'status') return it.status_translation || '-';
                              return '-';
                            })
                          )).sort();
                        const renderFilterDropdown = (key: string) => {
                          if (!reviewFilterActive || reviewFilterOpen !== key) return null;
                          const uniqueVals = getColUniqueValues(key);
                          const selected = reviewColumnFilters[key] ?? new Set<string>();
                          const searchLower = reviewFilterSearch.toLowerCase();
                          const displayed = searchLower ? uniqueVals.filter(v => v.toLowerCase().includes(searchLower)) : uniqueVals;
                          return (<>
                            <div className="fixed inset-0 z-[290]" onClick={() => { setReviewFilterOpen(null); setReviewFilterSearch(''); }} />
                            <div className="absolute left-0 top-full mt-1 z-[300] rounded-xl shadow-2xl border overflow-hidden bg-surface-container border-line dark:bg-[#2e2e28] dark:border-white/[0.08]" style={{ minWidth: '200px', maxWidth: '300px' }}>
                              <div className="p-2 border-b border-line dark:border-white/[0.05]">
                                <input autoFocus type="text" value={reviewFilterSearch}
                                  onChange={e => setReviewFilterSearch(e.target.value)}
                                  placeholder="Buscar valor..."
                                  onClick={e => e.stopPropagation()}
                                  className="w-full px-3 py-1.5 text-xs rounded-lg outline-none bg-on-surface/[0.05] text-on-surface placeholder-on-surface/30 border border-on-surface/[0.08] focus:border-primary/50 dark:bg-white/[0.05] dark:text-white/75 dark:placeholder-white/25 dark:border-white/[0.05] dark:focus:border-primary/50"
                                />
                              </div>
                              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-line dark:border-white/[0.05]">
                                <button onClick={e => { e.stopPropagation(); setReviewColumnFilters(prev => ({ ...prev, [key]: new Set(uniqueVals) })); }}
                                  className="text-[10px] font-bold text-on-surface/40 hover:text-on-surface/70 dark:text-white/40 dark:hover:text-white/70 transition-colors">
                                  Selecionar tudo
                                </button>
                                <span className="text-on-surface/15 dark:text-white/15">·</span>
                                <button onClick={e => { e.stopPropagation(); setReviewColumnFilters(prev => { const n = { ...prev }; delete n[key]; return n; }); }}
                                  className="text-[10px] font-bold text-on-surface/40 hover:text-red-400 dark:text-white/40 transition-colors">
                                  Limpar
                                </button>
                              </div>
                              <div className="overflow-y-auto" style={{ maxHeight: '220px' }}>
                                {displayed.length === 0 ? (
                                  <div className="px-3 py-3 text-[11px] text-on-surface/30 dark:text-white/30 text-center">Nenhum resultado</div>
                                ) : displayed.map(val => {
                                  const checked = selected.has(val);
                                  return (
                                    <label key={val} className="flex items-center gap-2 px-3 py-1.5 hover:bg-on-surface/[0.04] dark:hover:bg-white/[0.04] cursor-pointer" onClick={e => e.stopPropagation()}>
                                      <input type="checkbox" checked={checked} className="w-3 h-3 accent-primary"
                                        onChange={() => {
                                          setReviewColumnFilters(prev => {
                                            const cur = new Set<string>(prev[key] ?? []);
                                            if (checked) cur.delete(val); else cur.add(val);
                                            const nxt = { ...prev };
                                            if (cur.size === 0) delete nxt[key]; else nxt[key] = cur;
                                            return nxt;
                                          });
                                        }}
                                      />
                                      <span className="text-[11px] text-on-surface/70 dark:text-white/65 truncate" title={val}>{val}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </>);
                        };
                        const filterBtn = (key: string) => {
                          if (!reviewFilterActive) return null;
                          const hasFilter = (reviewColumnFilters[key]?.size ?? 0) > 0;
                          return (
                            <button
                              onClick={e => { e.stopPropagation(); setReviewFilterOpen(prev => prev === key ? null : key); setReviewFilterSearch(''); }}
                              title={hasFilter ? 'Filtro ativo' : 'Filtrar'}
                              style={{ color: hasFilter ? '#D81E1E' : 'inherit', opacity: hasFilter ? 1 : 0.5 }}
                              className="w-4 h-4 rounded flex items-center justify-center transition-all hover:opacity-100"
                            >
                              <Filter size={9} />
                            </button>
                          );
                        };
                        return (<>
                          <th style={thFirst}><div style={lbl({ justifyContent: 'center' })}>#</div></th>
                          <th style={thBar}><div style={lbl()}>Código</div></th>
                          {(['Produto na Nota', 'Identificação Interna', 'EAN', 'SKU', 'Qtd.'] as const).map(col => {
                            const editable = reviewEditableCols.has(col);
                            const canEdit = col !== 'Identificação Interna';
                            const filterKey = colFilterKey[col];
                            return (
                              <th key={col} style={{ ...thBar, position: 'relative' }}>
                                <div style={lbl()}>
                                  <span style={{ color: editable ? 'rgb(52 211 153)' : 'inherit' }}>{col}</span>
                                  {canEdit && (
                                    <button
                                      onClick={() => setReviewEditableCols(prev => { const s = new Set(prev); s.has(col) ? s.delete(col) : s.add(col); return s; })}
                                      title={editable ? 'Bloquear coluna' : 'Editar coluna'}
                                      style={{ color: editable ? 'rgb(52 211 153)' : 'inherit', opacity: editable ? 1 : 0.5 }}
                                      className="w-4 h-4 rounded flex items-center justify-center transition-colors hover:opacity-100"
                                    >
                                      <Pencil size={9} />
                                    </button>
                                  )}
                                  {filterKey && filterBtn(filterKey)}
                                </div>
                                {filterKey && renderFilterDropdown(filterKey)}
                              </th>
                            );
                          })}
                          <th style={thBar}><div style={lbl({ justifyContent: 'flex-end' })}>Preço Custo</div></th>
                          <th style={thBar}><div style={lbl({ justifyContent: 'flex-end' })}>Valor Total</div></th>
                          {/* Desconto header */}
                          <th style={{ ...thBar, position: 'relative' }}>
                            <div style={lbl()}>
                              <button
                                onClick={() => { setDiscountDropdown(v => !v); setSurchargeDropdown(false); }}
                                className="flex items-center gap-1.5 ml-auto hover:text-red-400 transition-colors"
                                style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'inherit' }}
                              >
                                Desconto
                                <ChevronDown size={10} className={cn("transition-transform", discountDropdown && "rotate-180")} />
                                {discountMode !== 'none' && <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />}
                              </button>
                            </div>
                            {discountDropdown && (
                              <div className="absolute right-0 top-full mt-1 z-[200] bg-[#2e2e28] rounded-xl shadow-2xl border border-white/[0.08] overflow-hidden min-w-[150px]">
                                <button onClick={() => { setDiscountDropdown(false); setDiscountGeralValue(''); setDiscountDialog('geral'); }} className="w-full px-4 py-3 text-left text-sm font-bold text-white/75 hover:bg-white/[0.06] transition-colors">Geral</button>
                                <button onClick={() => { setDiscountDropdown(false); setDiscountDialog('individual'); }} className="w-full px-4 py-3 text-left text-sm font-bold text-white/75 hover:bg-white/[0.06] transition-colors border-t border-white/[0.05]">Individual</button>
                                {discountMode !== 'none' && <button onClick={() => { setDiscountDropdown(false); setDiscountMode('none'); setDiscountApplied(null); setItemDiscounts([]); }} className="w-full px-4 py-3 text-left text-sm font-bold text-red-400 hover:bg-red-500/10 transition-colors border-t border-white/[0.05]">Limpar</button>}
                              </div>
                            )}
                          </th>
                          {/* Acréscimo header */}
                          <th style={{ ...thBar, position: 'relative' }}>
                            <div style={lbl()}>
                              <button
                                onClick={() => { setSurchargeDropdown(v => !v); setDiscountDropdown(false); }}
                                className="flex items-center gap-1.5 ml-auto hover:text-green-500 transition-colors"
                                style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'inherit' }}
                              >
                                Acréscimo
                                <ChevronDown size={10} className={cn("transition-transform", surchargeDropdown && "rotate-180")} />
                                {surchargeMode !== 'none' && <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />}
                              </button>
                            </div>
                            {surchargeDropdown && (
                              <div className="absolute right-0 top-full mt-1 z-[200] bg-[#2e2e28] rounded-xl shadow-2xl border border-white/[0.08] overflow-hidden min-w-[150px]">
                                <button onClick={() => { setSurchargeDropdown(false); setSurchargeGeralValue(''); setSurchargeDialog('geral'); }} className="w-full px-4 py-3 text-left text-sm font-bold text-white/75 hover:bg-white/[0.06] transition-colors">Geral</button>
                                <button onClick={() => { setSurchargeDropdown(false); setSurchargeDialog('individual'); }} className="w-full px-4 py-3 text-left text-sm font-bold text-white/75 hover:bg-white/[0.06] transition-colors border-t border-white/[0.05]">Individual</button>
                                {surchargeMode !== 'none' && <button onClick={() => { setSurchargeDropdown(false); setSurchargeMode('none'); setSurchargeApplied(null); setItemSurcharges([]); }} className="w-full px-4 py-3 text-left text-sm font-bold text-red-400 hover:bg-red-500/10 transition-colors border-t border-white/[0.05]">Limpar</button>}
                              </div>
                            )}
                          </th>
                          <th style={thBar}><div style={lbl({ justifyContent: 'flex-end' })}>Preço Venda</div></th>
                          <th style={thBar}><div style={lbl({ justifyContent: 'flex-end' })}>Markup</div></th>
                          {/* Status — with filter */}
                          <th style={{ ...thBar, position: 'relative' }}>
                            <div style={lbl()}>
                              <span>Status</span>
                              {filterBtn('status')}
                            </div>
                            {renderFilterDropdown('status')}
                          </th>
                          <th style={thBar}><div style={lbl({ justifyContent: 'center' })}>Ok</div></th>
                          <th style={thBar}><div style={lbl({ justifyContent: 'center' })}>Revisão</div></th>
                          <th style={thBar}><div style={lbl({ justifyContent: 'center' })}>Distribuição</div></th>
                          <th style={thLast}><div style={lbl({ justifyContent: 'center', minWidth: 0 })}></div></th>
                        </>);
                      })()}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // ── Build filtered items list, preserving original indices ──
                      const _allItems: any[] = viewingReviewNote!.items;
                      const _getVal = (key: string, it: any, i: number): string => {
                        if (key === 'produto') return it.original_description || '-';
                        if (key === 'interno') return it.name || '-';
                        if (key === 'ean') return viewingNoteEans[i] || it.ean || '-';
                        if (key === 'sku') return viewingNoteSkus[i] || it.sku || '-';
                        if (key === 'status') return it.status_translation || '-';
                        return '-';
                      };
                      const _hasActiveFilters = reviewFilterActive && Object.values(reviewColumnFilters).some(s => s.size > 0);
                      const _filtered = _allItems
                        .map((item: any, origIdx: number) => ({ item, origIdx }))
                        .filter(({ item, origIdx }) =>
                          !_hasActiveFilters || Object.entries(reviewColumnFilters).every(([key, sel]) =>
                            sel.size === 0 || sel.has(_getVal(key, item, origIdx))
                          )
                        );
                      return _filtered.map(({ item, origIdx: idx }) => {
                      const cost = (viewingNoteItemPrices[idx] ?? item.price ?? 0) / ((viewingNoteMultipliers[idx] ?? item.multiplier) || 1);
                      const displayQty = viewingNoteQtys[idx] ?? item.qty ?? 0;

                      /* ── Rounded-cell style tokens (per-row) ── */
                      const cellBg = idx % 2 === 0 ? 'var(--rn-cell-bg)' : 'var(--rn-cell-bg-alt)';
                      const tdP: React.CSSProperties = { padding: '0 2px' };
                      const cell = (extra?: React.CSSProperties): React.CSSProperties => ({
                        borderRadius: '9px',
                        background: cellBg,
                        border: '1.5px solid var(--rn-cell-border)',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        overflow: 'hidden',
                        transition: 'border-color 120ms cubic-bezier(0.23,1,0.32,1), box-shadow 120ms cubic-bezier(0.23,1,0.32,1)',
                        ...extra,
                      });
                      const focusCell = (el: HTMLElement | null) => { if (el) { el.style.borderColor = 'rgba(216,30,30,0.55)'; el.style.boxShadow = '0 0 0 3px rgba(216,30,30,0.12)'; } };
                      const blurCell  = (el: HTMLElement | null) => { if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; } };

                      let discountAmt = 0;
                      if (discountMode === 'geral' && discountApplied) {
                        discountAmt = discountApplied.type === 'pct' ? cost * discountApplied.value / 100 : discountApplied.value;
                      } else if (discountMode === 'individual') {
                        const v = parseFloat(itemDiscounts[idx] ?? '');
                        if (!isNaN(v) && v > 0) discountAmt = discountIndividualType === 'pct' ? cost * v / 100 : v;
                      }
                      let surchargeAmt = 0;
                      if (surchargeMode === 'geral' && surchargeApplied) {
                        surchargeAmt = surchargeApplied.type === 'pct' ? cost * surchargeApplied.value / 100 : surchargeApplied.value;
                      } else if (surchargeMode === 'individual') {
                        const v = parseFloat(itemSurcharges[idx] ?? '');
                        if (!isNaN(v) && v > 0) {
                          surchargeAmt = surchargeIndividualType === 'pct' ? cost * v / 100
                            : surchargeIndividualType === 'fixed_total' ? v / (displayQty || 1)
                            : v;
                        }
                      }
                      const hasDiscount = discountAmt > 0;
                      const hasSurcharge = surchargeAmt > 0;
                      const adjCost = cost - discountAmt + surchargeAmt;
                      const totalValue = adjCost * displayQty;
                      const adjColor = hasDiscount && hasSurcharge ? 'text-amber-400' : hasDiscount ? 'text-emerald-400' : hasSurcharge ? 'text-red-400' : 'text-white/50';

                      const sellPrice = viewingNoteSellPrices[idx] ?? item.product_price ?? 0;
                      const markup = adjCost > 0 && sellPrice > 0
                        ? ((sellPrice - adjCost) / adjCost * 100)
                        : null;
                      return (
                        <tr key={idx}>
                          {/* # */}
                          <td style={tdP}>
                            <div style={cell({ justifyContent: 'center' })}>
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black" style={{ background: 'var(--rn-seq-bg)', color: 'var(--rn-text-subtle)' }}>
                                {item.seq ?? idx + 1}
                              </span>
                            </div>
                          </td>
                          {/* Código fornecedor */}
                          <td style={tdP}>
                            <div style={cell({ padding: '0 10px' })}>
                              {item.supplier_code ? (
                                <span className="font-mono text-xs font-bold" style={{ color: 'var(--rn-text-muted)' }}>{item.supplier_code}</span>
                              ) : (
                                <span className="text-xs font-medium" style={{ color: 'var(--rn-text-subtle)' }}>—</span>
                              )}
                            </div>
                          </td>
                          <td style={{ ...tdP, maxWidth: '220px' }}
                            onFocus={e => focusCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                            onBlur={e => blurCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                          >
                            <div data-cell style={cell({ padding: '0 10px', overflow: reviewEditableCols.has('Produto na Nota') ? 'visible' : 'hidden' })}>
                              {reviewEditableCols.has('Produto na Nota') ? (
                                <input type="text" value={item.original_description || ''}
                                  data-nav-table="review-note" data-nav-row={idx} data-nav-col={0}
                                  onChange={e => { const u = [...viewingReviewNote!.items]; u[idx] = { ...u[idx], original_description: e.target.value }; setViewingReviewNote({ ...viewingReviewNote!, items: u }); }}
                                  onKeyDown={tableCellKeyDown('review-note', idx, 0)}
                                  className="w-full text-[11px] font-semibold bg-transparent outline-none" style={{ color: 'var(--rn-text)' }} />
                              ) : (
                                <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--rn-text)' }} title={item.original_description || '-'}>{item.original_description || '-'}</p>
                              )}
                            </div>
                          </td>
                          <td style={{ ...tdP, maxWidth: '200px', position: 'relative' }}>
                            <div style={cell({ padding: '0 8px', overflow: 'visible', gap: '6px' })}>
                              {item.verified ? (
                                /* Produto vinculado: nome truncado + botão icon para trocar */
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-[11px] font-bold text-emerald-400 truncate max-w-[120px]" title={item.name}>{item.name}</span>
                                  <div className="relative group shrink-0">
                                    <button
                                      onClick={() => { setLinkingItemIdx(idx); setNoteItemLinkQuery(viewingNoteEans[idx] ?? item.ean ?? ''); setNoteItemShowCreate(false); setNoteItemNewName(''); setNoteItemNewSku(''); setNoteItemNewEan(viewingNoteEans[idx] ?? item.ean ?? ''); }}
                                      className="w-[26px] h-[26px] flex items-center justify-center rounded-[7px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/18 transition-all active:scale-90"
                                    >
                                      <CheckCircle2 size={12} />
                                    </button>
                                    <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 scale-95 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-100 bg-[#3a3a32] text-[#f2f0e3] text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap shadow-lg z-[300] after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-[#3a3a32]">
                                      Alterar vínculo
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                /* Não vinculado: ícone link */
                                <div className="relative group shrink-0">
                                  <button
                                    onClick={() => { setLinkingItemIdx(idx); setNoteItemLinkQuery(viewingNoteEans[idx] ?? item.ean ?? ''); setNoteItemShowCreate(false); setNoteItemNewName(''); setNoteItemNewSku(''); setNoteItemNewEan(viewingNoteEans[idx] ?? item.ean ?? ''); }}
                                    className="w-[26px] h-[26px] flex items-center justify-center rounded-[7px] bg-white/[0.04] border border-dashed border-white/15 text-white/35 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-all active:scale-90"
                                  >
                                    <Plus size={12} />
                                  </button>
                                  <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 scale-95 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-100 bg-[#3a3a32] text-[#f2f0e3] text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap shadow-lg z-[300] after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-[#3a3a32]">
                                    Vincular
                                  </span>
                                </div>
                              )}
                              {/* Botão Vários — sempre ícone */}
                              <div className="relative group shrink-0">
                                <button
                                  onClick={() => { setMultiLinkItemIdx(idx); setMultiLinkItemSearch(''); setMultiLinkItemQty(''); setMultiLinkItemResults([]); setMultiLinkItemEntries([]); setMultiLinkItemShowCreate(false); }}
                                  className={cn(
                                    'w-[26px] h-[26px] flex items-center justify-center rounded-[7px] border transition-all active:scale-90',
                                    (item as any).multiLinked
                                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/18'
                                      : 'bg-white/[0.04] border-dashed border-white/15 text-white/35 hover:bg-primary/10 hover:border-primary/40 hover:text-primary'
                                  )}
                                >
                                  <Layers size={12} />
                                </button>
                                <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 scale-95 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-100 bg-[#3a3a32] text-[#f2f0e3] text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap shadow-lg z-[300] after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-[#3a3a32]">
                                  Vários
                                </span>
                              </div>
                            </div>
                          </td>
                          <td style={tdP}
                            onFocus={e => focusCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                            onBlur={e => blurCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                          >
                            <div data-cell style={cell({ padding: '0 10px' })}>
                              {reviewEditableCols.has('EAN') ? (
                                <input type="text" value={viewingNoteEans[idx] ?? item.ean ?? ''}
                                  data-nav-table="review-note" data-nav-row={idx} data-nav-col={1}
                                  onChange={e => { const u = [...viewingNoteEans]; u[idx] = e.target.value; setViewingNoteEans(u); }}
                                  onPaste={e => handleNoteEanPaste(e, idx)}
                                  onKeyDown={tableCellKeyDown('review-note', idx, 1)}
                                  className="w-full text-[11px] font-bold bg-transparent outline-none font-mono" style={{ color: 'var(--rn-text)' }} />
                              ) : (
                                <p className="text-[11px] font-bold font-mono" style={{ color: 'var(--rn-text-muted)' }}>{(viewingNoteEans[idx] ?? item.ean) || '—'}</p>
                              )}
                            </div>
                          </td>
                          <td style={tdP}
                            onFocus={e => focusCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                            onBlur={e => blurCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                          >
                            <div data-cell style={cell({ padding: '0 10px' })}>
                              {reviewEditableCols.has('SKU') ? (
                                <input type="text" value={viewingNoteSkus[idx] ?? item.sku ?? ''}
                                  data-nav-table="review-note" data-nav-row={idx} data-nav-col={2}
                                  onChange={e => { const u = [...viewingNoteSkus]; u[idx] = e.target.value; setViewingNoteSkus(u); }}
                                  onKeyDown={tableCellKeyDown('review-note', idx, 2)}
                                  className="w-full text-[11px] font-bold bg-transparent outline-none font-mono" style={{ color: 'var(--rn-text)' }} />
                              ) : (
                                <p className="text-[11px] font-bold font-mono" style={{ color: 'var(--rn-text-muted)' }}>{(viewingNoteSkus[idx] ?? item.sku) || '—'}</p>
                              )}
                            </div>
                          </td>
                          <td style={{ ...tdP, position: 'relative' }}>
                            <div style={cell({ justifyContent: 'center', overflow: 'visible', gap: '6px' })}>
                            {/* Discrepancy trigger — always rendered, flanks the qty block */}
                            <div className="flex items-center gap-1.5">
                            {reviewEditableCols.has('Qtd.') ? (
                              /* ── EDIT MODE: unit selector + qty input ── */
                              <div className="flex flex-col items-center gap-1">
                                <div className="relative flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    value={viewingNoteUnits[idx] ?? item.unit ?? 'UN'}
                                    onChange={e => { const u = [...viewingNoteUnits]; u[idx] = e.target.value; setViewingNoteUnits(u); }}
                                    className="w-12 bg-transparent border-b border-transparent hover:border-white/20 focus:border-primary/50 outline-none py-0.5 px-1 text-xs font-medium text-white/40 text-center transition-colors"
                                    placeholder="UN"
                                  />
                                  {(viewingNoteMultipliers[idx] ?? item.multiplier ?? 1) > 1 && (
                                    <span className="text-[8px] font-black text-primary/60 leading-none shrink-0" title={`×${viewingNoteMultipliers[idx] ?? item.multiplier}`}>
                                      ×{viewingNoteMultipliers[idx] ?? item.multiplier}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => setReviewUnitMenuIdx(reviewUnitMenuIdx === idx ? null : idx)}
                                    className={cn(
                                      'w-4 h-4 rounded flex items-center justify-center transition-all shrink-0',
                                      reviewUnitMenuIdx === idx ? 'bg-primary text-white' : 'text-white/30 hover:text-primary hover:bg-primary/10'
                                    )}
                                  >
                                    <Plus size={10} />
                                  </button>
                                  <AnimatePresence>
                                    {reviewUnitMenuIdx === idx && (
                                      <motion.div
                                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                        transition={{ duration: 0.12 }}
                                        className="absolute left-0 top-full mt-1 z-50 bg-[#2e2e28] rounded-xl shadow-2xl border border-white/[0.08] overflow-hidden w-44"
                                      >
                                        <button
                                          onClick={() => { setReviewMeasureIdx(idx); setReviewMeasureUnit(viewingNoteUnits[idx] ?? item.unit ?? ''); setReviewMeasureMultiplier(''); setReviewUnitMenuIdx(null); }}
                                          className="w-full text-left px-3 py-2.5 text-xs font-bold text-white/75 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
                                        >
                                          <Ruler size={12} className="shrink-0" />
                                          Adicionar medida
                                        </button>
                                        <button
                                          onClick={() => { handleReviewUseTranslation(idx); setReviewUnitMenuIdx(null); }}
                                          disabled={reviewLoadingUnitIdx === idx}
                                          className="w-full text-left px-3 py-2.5 text-xs font-bold text-white/75 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2 disabled:opacity-50"
                                        >
                                          {reviewLoadingUnitIdx === idx
                                            ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-r-transparent shrink-0" />
                                            : <Zap size={12} className="shrink-0" />
                                          }
                                          Usar tradução
                                        </button>
                                        <button
                                          onClick={() => { const m = [...viewingNoteMultipliers]; m[idx] = 1; setViewingNoteMultipliers(m); setReviewUnitMenuIdx(null); }}
                                          className="w-full text-left px-3 py-2.5 text-xs font-bold text-white/40 hover:bg-white/[0.06] transition-colors flex items-center gap-2 border-t border-white/[0.05]"
                                        >
                                          <Pencil size={12} className="shrink-0" />
                                          Manual
                                        </button>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                                <input type="number" min="0" value={viewingNoteQtys[idx] ?? item.qty}
                                  data-nav-table="review-note" data-nav-row={idx} data-nav-col={3}
                                  onChange={e => { const u = [...viewingNoteQtys]; u[idx] = parseInt(e.target.value) || 0; setViewingNoteQtys(u); }}
                                  onKeyDown={tableCellKeyDown('review-note', idx, 3)}
                                  className="w-16 text-center text-sm font-black bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400" style={{ color: 'var(--rn-text)' }} />
                              </div>
                            ) : (
                              /* ── VIEW MODE: single gray box [UN  qty] ── */
                              <button
                                onClick={() => setReviewUnitMenuIdx(reviewUnitMenuIdx === idx ? null : idx)}
                                className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-[9px] transition-colors" style={{ background: 'var(--rn-cell-inner)' }}
                              >
                                <span className="text-sm font-black" style={{ color: 'var(--rn-text-muted)' }}>{viewingNoteUnits[idx] ?? item.unit ?? 'UN'}</span>
                                <span className="text-sm font-black inline-flex items-baseline gap-0.5" style={{ color: 'var(--rn-text)' }}>
                                  {viewingNoteQtys[idx] ?? item.qty}
                                  {(() => {
                                    const d = viewingNoteDiscrepancies[idx] ?? (item.discrepancy as DiscrepancyData) ?? null;
                                    if (!d) return null;
                                    return <span className={cn("text-[8px] font-black leading-none", d.type === 'falta' ? 'text-red-400' : 'text-emerald-400')}>{d.type === 'falta' ? '●' : '+'}</span>;
                                  })()}
                                </span>
                                <AnimatePresence>
                                  {reviewUnitMenuIdx === idx && (
                                    <motion.div
                                      initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                      animate={{ opacity: 1, y: 0, scale: 1 }}
                                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                      transition={{ duration: 0.12 }}
                                      className="absolute left-0 top-full mt-1 z-50 bg-[#2e2e28] rounded-xl shadow-2xl border border-white/[0.08] overflow-hidden w-44"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <button
                                        onClick={() => { setReviewMeasureIdx(idx); setReviewMeasureUnit(viewingNoteUnits[idx] ?? item.unit ?? ''); setReviewMeasureMultiplier(''); setReviewUnitMenuIdx(null); }}
                                        className="w-full text-left px-3 py-2.5 text-xs font-bold text-white/75 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
                                      >
                                        <Ruler size={12} className="shrink-0" />
                                        Adicionar medida
                                      </button>
                                      <button
                                        onClick={() => { handleReviewUseTranslation(idx); setReviewUnitMenuIdx(null); }}
                                        disabled={reviewLoadingUnitIdx === idx}
                                        className="w-full text-left px-3 py-2.5 text-xs font-bold text-white/75 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2 disabled:opacity-50"
                                      >
                                        {reviewLoadingUnitIdx === idx
                                          ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-r-transparent shrink-0" />
                                          : <Zap size={12} className="shrink-0" />
                                        }
                                        Usar tradução
                                      </button>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </button>
                            )}
                            {/* Discrepancy trigger button */}
                            {(() => {
                              const d = viewingNoteDiscrepancies[idx] ?? (item.discrepancy as DiscrepancyData) ?? null;
                              return (
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    const existing = viewingNoteDiscrepancies[idx] ?? (item.discrepancy as DiscrepancyData) ?? null;
                                    setDiscrepancyTab(existing?.type ?? 'falta');
                                    setDiscrepancyQty(existing && !existing.missingAll ? String(existing.qty || '') : '');
                                    setDiscrepancyMissingAll(existing?.missingAll ?? false);
                                    setDiscrepancyObs(existing?.obs ?? '');
                                    setDiscrepancyModalIdx(idx);
                                  }}
                                  title="Registrar divergência"
                                  className={cn(
                                    "relative flex items-center justify-center w-5 h-5 rounded-full transition-all shrink-0",
                                    d?.type === 'falta' ? "text-red-400/90 hover:text-red-300"
                                    : d?.type === 'sobra' ? "text-emerald-400/90 hover:text-emerald-300"
                                    : "text-white/20 hover:text-white/50"
                                  )}
                                  style={{ transition: 'color 140ms cubic-bezier(0.23,1,0.32,1)' }}
                                >
                                  <AlertTriangle size={11} />
                                  {d && (
                                    <span className={cn(
                                      "absolute -top-px -right-px w-[5px] h-[5px] rounded-full",
                                      d.type === 'falta' ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'
                                    )} />
                                  )}
                                </button>
                              );
                            })()}
                            </div>
                            </div>
                          </td>
                          {/* Preço Custo — shows adjCost when discount/surcharge active */}
                          <td style={tdP}>
                            {(() => {
                              const hasAdj = (hasDiscount || hasSurcharge) && Math.abs(adjCost - cost) > 0.001;
                              // Persistent border: green = discount (cheaper), red = surcharge (pricier), amber = both
                              const adjBorder = hasDiscount && hasSurcharge ? 'rgba(245,158,11,0.65)'
                                : hasDiscount ? 'rgba(34,197,94,0.60)'
                                : hasSurcharge ? 'rgba(239,68,68,0.60)'
                                : '';
                              const adjGlow = hasDiscount && hasSurcharge ? '0 0 0 2px rgba(245,158,11,0.10), inset 0 0 0 1px rgba(245,158,11,0.06)'
                                : hasDiscount ? '0 0 0 2px rgba(34,197,94,0.10), inset 0 0 0 1px rgba(34,197,94,0.06)'
                                : hasSurcharge ? '0 0 0 2px rgba(239,68,68,0.10), inset 0 0 0 1px rgba(239,68,68,0.06)'
                                : '';
                              const adjValueColor = hasDiscount && hasSurcharge ? '#f59e0b'
                                : hasDiscount ? '#34d399'
                                : hasSurcharge ? '#f87171'
                                : '';
                              return (
                                <div
                                  style={{
                                    ...cell({ justifyContent: 'flex-end', padding: '0 8px' }),
                                    ...(adjBorder ? { borderColor: adjBorder, boxShadow: adjGlow } : {}),
                                    transition: 'border-color 180ms cubic-bezier(0.23,1,0.32,1), box-shadow 180ms cubic-bezier(0.23,1,0.32,1)',
                                  }}
                                  onFocus={e => {
                                    e.currentTarget.style.borderColor = 'rgba(216,30,30,0.55)';
                                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(216,30,30,0.12)';
                                  }}
                                  onBlur={e => {
                                    e.currentTarget.style.borderColor = adjBorder;
                                    e.currentTarget.style.boxShadow = adjGlow;
                                  }}
                                >
                                  <div className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1" style={{ background: 'var(--rn-cell-inner)' }}>
                                    <span className="text-[10px] font-black shrink-0" style={{ color: hasAdj ? adjValueColor : 'var(--rn-text-muted)' }}>R$</span>
                                    {hasAdj ? (
                                      /* Adjusted cost replaces raw cost — click cell to edit raw price */
                                      <span
                                        className="w-14 text-xs font-black text-right"
                                        style={{ color: adjValueColor, fontVariantNumeric: 'tabular-nums' }}
                                        title={`Custo base: R$ ${cost.toFixed(2)}`}
                                      >
                                        {adjCost.toFixed(2)}
                                      </span>
                                    ) : (
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        data-nav-table="review-note" data-nav-row={idx} data-nav-col={4}
                                        value={viewingNoteItemPrices[idx] ?? item.price ?? ''}
                                        onChange={e => { const u = [...viewingNoteItemPrices]; u[idx] = parseFloat(e.target.value) || 0; setViewingNoteItemPrices(u); }}
                                        onKeyDown={tableCellKeyDown('review-note', idx, 4)}
                                        className="w-14 text-xs font-black bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden" style={{ color: 'var(--rn-text)' }}
                                      />
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          {/* Valor Total */}
                          <td style={tdP}>
                            <div style={cell({ justifyContent: 'flex-end', padding: '0 10px' })}>
                              <span className="text-xs font-bold" style={{ color: totalValue > 0 ? 'var(--rn-text-muted)' : 'var(--rn-text-subtle)' }}>
                                {totalValue > 0 ? `R$ ${totalValue.toFixed(2)}` : '—'}
                              </span>
                            </div>
                          </td>
                          {/* Desconto cell */}
                          <td style={tdP}
                            onFocus={e => focusCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                            onBlur={e => blurCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                          >
                            <div data-cell style={cell({ justifyContent: 'flex-end', padding: '0 10px' })}>
                              {discountMode === 'geral' && discountApplied ? (
                                <span className="text-red-400 font-bold text-xs">
                                  - R$ {(discountApplied.type === 'pct' ? cost * discountApplied.value / 100 : discountApplied.value).toFixed(2)}
                                </span>
                              ) : discountMode === 'individual' ? (
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-[10px] font-bold" style={{ color: 'var(--rn-text-subtle)' }}>{discountIndividualType === 'pct' ? '%' : 'R$'}</span>
                                  <input
                                    type="number" min="0" step="0.01"
                                    data-nav-table="review-note" data-nav-row={idx} data-nav-col={5}
                                    value={itemDiscounts[idx] ?? ''}
                                    onChange={e => { const u = [...itemDiscounts]; u[idx] = e.target.value; setItemDiscounts(u); }}
                                    onKeyDown={tableCellKeyDown('review-note', idx, 5)}
                                    placeholder="0"
                                    className="w-12 text-right text-xs font-bold text-red-400 bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                                  />
                                </div>
                              ) : <span className="text-xs" style={{ color: 'var(--rn-text-subtle)' }}>—</span>}
                            </div>
                          </td>
                          {/* Acréscimo cell */}
                          <td style={tdP}
                            onFocus={e => focusCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                            onBlur={e => blurCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                          >
                            <div data-cell style={cell({ justifyContent: 'flex-end', padding: '0 10px' })}>
                              {surchargeMode === 'geral' && surchargeApplied ? (
                                <span className="text-emerald-400 font-bold text-xs">
                                  + R$ {(surchargeApplied.type === 'pct' ? cost * surchargeApplied.value / 100 : surchargeApplied.value).toFixed(2)}
                                </span>
                              ) : surchargeMode === 'individual' ? (
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-[10px] font-bold" style={{ color: 'var(--rn-text-subtle)' }}>
                                    {surchargeIndividualType === 'pct' ? '%' : surchargeIndividualType === 'fixed_total' ? 'R$∑' : 'R$'}
                                  </span>
                                  <input
                                    type="number" min="0" step="0.01"
                                    data-nav-table="review-note" data-nav-row={idx} data-nav-col={6}
                                    value={itemSurcharges[idx] ?? ''}
                                    onChange={e => { const u = [...itemSurcharges]; u[idx] = e.target.value; setItemSurcharges(u); }}
                                    onKeyDown={tableCellKeyDown('review-note', idx, 6)}
                                    placeholder="0"
                                    className="w-12 text-right text-xs font-bold text-emerald-400 bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                                  />
                                </div>
                              ) : <span className="text-xs" style={{ color: 'var(--rn-text-subtle)' }}>—</span>}
                            </div>
                          </td>
                          {/* Preço Venda */}
                          <td style={tdP}
                            onFocus={e => focusCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                            onBlur={e => blurCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                          >
                            <div data-cell style={cell({ justifyContent: 'flex-end', padding: '0 10px' })}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                data-nav-table="review-note" data-nav-row={idx} data-nav-col={7}
                                value={viewingNoteSellPrices[idx] || ''}
                                onChange={(e) => {
                                  const updated = [...viewingNoteSellPrices];
                                  updated[idx] = parseFloat(e.target.value) || 0;
                                  setViewingNoteSellPrices(updated);
                                }}
                                onKeyDown={tableCellKeyDown('review-note', idx, 7)}
                                placeholder="0,00"
                                className="w-full text-right text-xs font-bold bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden" style={{ color: 'var(--rn-text)' }}
                              />
                            </div>
                          </td>
                          {/* Markup */}
                          <td style={tdP}>
                            <div style={cell({ justifyContent: 'flex-end', padding: '0 10px' })}>
                              {markup !== null ? (
                                <span className={cn(
                                  "inline-block px-2 py-0.5 rounded-lg text-[11px] font-black",
                                  markup >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                                )}>
                                  {markup >= 0 ? '+' : ''}{markup.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold" style={{ color: 'var(--rn-text-subtle)' }}>—</span>
                              )}
                            </div>
                          </td>
                          {/* Status */}
                          <td style={tdP}>
                            <div style={cell({ padding: '0 10px' })}>
                              <span className={cn(
                                "px-2 py-0.5 rounded-lg text-[10px] font-black uppercase",
                                item.verified && item.status_translation === 'Traduzido' ? "bg-amber-500/10 text-amber-400" :
                                item.verified ? "bg-blue-500/10 text-blue-400" :
                                "bg-red-500/10 text-red-400"
                              )}>
                                {item.status_translation}
                              </span>
                            </div>
                          </td>
                          {/* Ok */}
                          <td style={tdP}>
                            <div style={cell({ justifyContent: 'center' })}>
                              {viewingNoteVerified[idx] ? (
                                <button
                                  onClick={() => {
                                    const updated = [...viewingNoteVerified];
                                    updated[idx] = false;
                                    setViewingNoteVerified(updated);
                                  }}
                                  className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white shadow shadow-green-500/30 hover:bg-green-600 active:scale-90 transition-all"
                                >
                                  <CheckCircle2 size={12} />
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
                                  className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-primary/10 hover:text-primary active:scale-90 transition-all cursor-pointer" style={{ background: 'var(--rn-cell-inner)', color: 'var(--rn-text-subtle)' }}
                                >
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                          {/* Revisão (timestamp) */}
                          <td style={tdP}>
                            <div style={cell({ justifyContent: 'center', padding: '0 8px' })}>
                              {viewingNoteReviewTimestamps[idx] ? (
                                <span className="inline-block px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-[10px] font-bold leading-tight whitespace-nowrap">
                                  {viewingNoteReviewTimestamps[idx]}
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold" style={{ color: 'var(--rn-text-subtle)' }}>—</span>
                              )}
                            </div>
                          </td>
                          {/* Distribuição */}
                          <td style={tdP}
                            onFocus={e => focusCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                            onBlur={e => blurCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                          >
                            <div data-cell style={cell({ justifyContent: 'center', padding: '0 8px' })}>
                              <input
                                type="text"
                                inputMode="numeric"
                                data-nav-table="review-note" data-nav-row={idx} data-nav-col={8}
                                value={viewingNoteDistribuicao[idx] ?? ''}
                                onChange={e => {
                                  const val = e.target.value.replace(/[^0-9]/g, '');
                                  const u = [...viewingNoteDistribuicao];
                                  u[idx] = val;
                                  setViewingNoteDistribuicao(u);
                                }}
                                onKeyDown={tableCellKeyDown('review-note', idx, 8)}
                                placeholder="—"
                                className="w-10 text-center text-xs font-bold bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden" style={{ color: 'var(--rn-text)' }}
                              />
                            </div>
                          </td>
                          {/* Botão excluir item */}
                          <td style={tdP}>
                            <div style={cell({ justifyContent: 'center', overflow: 'visible' })}>
                            {deleteConfirmIdx === idx ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    const remove = (arr: any[]) => arr.filter((_, i) => i !== idx);
                                    setViewingReviewNote(prev => prev ? { ...prev, items: remove(prev.items) } : null);
                                    setViewingNoteVerified(remove(viewingNoteVerified));
                                    setViewingNoteQtys(remove(viewingNoteQtys));
                                    setViewingNoteItemPrices(remove(viewingNoteItemPrices));
                                    setViewingNoteSellPrices(remove(viewingNoteSellPrices));
                                    setViewingNoteEans(remove(viewingNoteEans));
                                    setViewingNoteSkus(remove(viewingNoteSkus));
                                    setViewingNoteUnits(remove(viewingNoteUnits));
                                    setViewingNoteMultipliers(remove(viewingNoteMultipliers));
                                    setViewingNoteReviewTimestamps(remove(viewingNoteReviewTimestamps));
                                    setViewingNoteDistribuicao(remove(viewingNoteDistribuicao));
                                    setItemDiscounts(remove(itemDiscounts));
                                    setItemSurcharges(remove(itemSurcharges));
                                    setViewingNoteDiscrepancies(remove(viewingNoteDiscrepancies));
                                    setDeleteConfirmIdx(null);
                                  }}
                                  className="px-2 py-1 bg-red-500 text-white text-[10px] font-black rounded-lg hover:bg-red-600 transition-all whitespace-nowrap"
                                >
                                  Sim
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmIdx(null)}
                                  className="px-2 py-1 text-[10px] font-black rounded-lg transition-all" style={{ background: 'var(--rn-cell-inner)', color: 'var(--rn-text-muted)' }}
                                >
                                  Não
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmIdx(idx)}
                                className="w-7 h-7 rounded-lg bg-transparent flex items-center justify-center hover:bg-red-500/10 hover:text-red-400 transition-all" style={{ color: 'var(--rn-text-subtle)' }}
                                title="Excluir produto da nota"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                            </div>
                          </td>
                        </tr>
                      );
                      }); // end _filtered.map
                    })(/* tbody IIFE */)}
                  </tbody>
                </table>
              </div>

              {/* ── Vincular ao Dicionário — Modal separado ────────────────── */}
              {linkingItemIdx !== null && (() => {
                const linkItem = viewingReviewNote.items[linkingItemIdx];
                return (
                  <div className="fixed inset-0 z-[190] flex items-center justify-center p-4">
                    <div
                      className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                      onClick={() => { setLinkingItemIdx(null); setNoteItemShowCreate(false); setNoteItemLinkQuery(''); setNoteItemSelectedProduct(null); setNoteItemSellPriceInput(''); }}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 16 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 16 }}
                      transition={{ duration: 0.18 }}
                      className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[80vh]"
                    >
                      {/* Header */}
                      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Package size={17} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {noteItemShowCreate ? 'Criar Novo Produto' : 'Vincular ao Dicionário'}
                          </p>
                          <p className="text-sm font-bold text-slate-800 truncate">
                            {linkItem?.original_description || 'Item sem descrição'}
                          </p>
                        </div>
                        <button
                          onClick={() => { setLinkingItemIdx(null); setNoteItemShowCreate(false); setNoteItemLinkQuery(''); setNoteItemSelectedProduct(null); setNoteItemSellPriceInput(''); }}
                          className="p-2 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
                        >
                          <X size={16} className="text-slate-400" />
                        </button>
                      </div>

                      {/* Body */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                        {!noteItemShowCreate ? (
                          <>
                            {/* ── Painel de confirmação com preço de venda ── */}
                            {noteItemSelectedProduct ? (
                              <div className="space-y-3">
                                <button
                                  onClick={() => { setNoteItemSelectedProduct(null); setNoteItemSellPriceInput(''); }}
                                  className="text-xs font-bold text-slate-400 hover:text-primary transition-colors flex items-center gap-1"
                                >
                                  ← Voltar para busca
                                </button>

                                {/* Produto selecionado */}
                                <div className="flex items-center gap-3 px-3 py-3 bg-primary/5 border border-primary/15 rounded-xl">
                                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                    <Package size={15} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate">{noteItemSelectedProduct.name}</p>
                                    <p className="text-[10px] text-slate-400">{noteItemSelectedProduct.sku || '—'} · {noteItemSelectedProduct.ean || '—'}</p>
                                  </div>
                                </div>

                                {/* Preço de venda */}
                                <div>
                                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                                    Preço de Venda (R$)
                                  </label>
                                  <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">R$</span>
                                    <input
                                      autoFocus
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={noteItemSellPriceInput}
                                      onChange={e => setNoteItemSellPriceInput(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          const i = linkingItemIdx!;
                                          const p = noteItemSelectedProduct;
                                          const updatedItems = [...viewingReviewNote!.items];
                                          updatedItems[i] = { ...updatedItems[i], name: p.name, sku: p.sku || updatedItems[i].sku, ean: p.ean || updatedItems[i].ean, product_id: p.id, product_price: parseFloat(noteItemSellPriceInput) || p.price || 0, verified: true, status_translation: 'Identificado (SKU/EAN)' };
                                          setViewingReviewNote({ ...viewingReviewNote!, items: updatedItems });
                                          const uV = [...viewingNoteVerified]; uV[i] = true; setViewingNoteVerified(uV);
                                          const uS = [...viewingNoteSkus]; uS[i] = p.sku || ''; setViewingNoteSkus(uS);
                                          const uE = [...viewingNoteEans]; uE[i] = p.ean || ''; setViewingNoteEans(uE);
                                          const uP = [...viewingNoteSellPrices]; uP[i] = parseFloat(noteItemSellPriceInput) || p.price || 0; setViewingNoteSellPrices(uP);
                                          setLinkingItemIdx(null); setNoteItemLinkQuery(''); setNoteItemSelectedProduct(null); setNoteItemSellPriceInput('');
                                        }
                                      }}
                                      placeholder="0,00"
                                      className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-bold focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                  </div>
                                  {noteItemSelectedProduct.price > 0 && (
                                    <p className="text-[10px] text-slate-400 mt-1">
                                      Preço cadastrado no dicionário: <span className="font-bold">R$ {noteItemSelectedProduct.price.toFixed(2).replace('.', ',')}</span>
                                    </p>
                                  )}
                                </div>

                                <button
                                  onClick={() => {
                                    const i = linkingItemIdx!;
                                    const p = noteItemSelectedProduct;
                                    const sellPrice = parseFloat(noteItemSellPriceInput.replace(',', '.')) || 0;
                                    const updatedItems = [...viewingReviewNote!.items];
                                    updatedItems[i] = { ...updatedItems[i], name: p.name, sku: p.sku || updatedItems[i].sku, ean: p.ean || updatedItems[i].ean, product_id: p.id, product_price: sellPrice, verified: true, status_translation: 'Identificado (SKU/EAN)' };
                                    setViewingReviewNote({ ...viewingReviewNote!, items: updatedItems });
                                    const uV = [...viewingNoteVerified]; uV[i] = true; setViewingNoteVerified(uV);
                                    const uS = [...viewingNoteSkus]; uS[i] = p.sku || ''; setViewingNoteSkus(uS);
                                    const uE = [...viewingNoteEans]; uE[i] = p.ean || ''; setViewingNoteEans(uE);
                                    const uP = [...viewingNoteSellPrices]; uP[i] = sellPrice; setViewingNoteSellPrices(uP);
                                    setLinkingItemIdx(null); setNoteItemLinkQuery(''); setNoteItemSelectedProduct(null); setNoteItemSellPriceInput('');
                                  }}
                                  className="w-full bg-primary text-white py-3 rounded-xl font-black text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                                >
                                  <Check size={15} />Vincular com este preço
                                </button>
                              </div>
                            ) : (
                              <>
                                {/* ── Lista de busca ── */}
                                <input
                                  autoFocus
                                  type="text"
                                  value={noteItemLinkQuery}
                                  onChange={e => setNoteItemLinkQuery(e.target.value)}
                                  placeholder="Nome, SKU ou EAN..."
                                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                                <div className="max-h-64 overflow-y-auto space-y-1">
                                  {(() => {
                                    const q = noteItemLinkQuery.toLowerCase().trim();
                                    if (q.length === 0) return (
                                      <p className="text-xs text-slate-400 text-center py-8">Digite para buscar...</p>
                                    );
                                    const filtered = products.filter((p: any) =>
                                      p.name?.toLowerCase().includes(q) ||
                                      p.sku?.toLowerCase().includes(q) ||
                                      (p.ean && p.ean.toLowerCase().includes(q))
                                    ).slice(0, 12);
                                    if (filtered.length === 0) return (
                                      <p className="text-xs text-slate-400 text-center py-8">
                                        {/^\d{8,14}$/.test(q)
                                          ? `Nenhum produto com EAN "${q}" encontrado no sistema. Pesquise pelo nome ou crie um novo.`
                                          : 'Nenhum produto encontrado'}
                                      </p>
                                    );
                                    return filtered.map((p: any) => (
                                      <button
                                        key={p.id}
                                        onClick={() => {
                                          // Pré-preenche com o preço existente do item ou o preço do dicionário
                                          const i = linkingItemIdx!;
                                          const existing = viewingNoteSellPrices[i] ?? viewingReviewNote!.items[i]?.product_price;
                                          setNoteItemSelectedProduct(p);
                                          setNoteItemSellPriceInput(existing && existing > 0 ? String(existing) : (p.price ? String(p.price) : ''));
                                        }}
                                        className="w-full text-left px-3 py-3 rounded-xl hover:bg-primary/5 transition-colors flex items-center gap-3 group border border-transparent hover:border-primary/10"
                                      >
                                        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary shrink-0 transition-colors">
                                          <Package size={15} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-bold text-slate-800 truncate group-hover:text-primary">{p.name}</p>
                                          <p className="text-[10px] text-slate-400">{p.sku || '—'} · {p.ean || '—'}</p>
                                        </div>
                                        {p.price > 0 && (
                                          <span className="text-[10px] font-black text-slate-500 shrink-0">
                                            R$ {p.price.toFixed(2).replace('.', ',')}
                                          </span>
                                        )}
                                      </button>
                                    ));
                                  })()}
                                </div>
                                <button
                                  onClick={() => {
                                    setNoteItemShowCreate(true);
                                    // Pré-preenche o preço de venda com o valor já digitado na linha
                                    const rowPrice = linkingItemIdx !== null ? viewingNoteSellPrices[linkingItemIdx] : undefined;
                                    if (rowPrice && rowPrice > 0) setNoteItemNewSellPrice(String(rowPrice));
                                    // Pré-preenche o Nome com a descrição do item em minúsculas
                                    if (linkingItemIdx !== null && viewingReviewNote) {
                                      const desc = viewingReviewNote.items[linkingItemIdx]?.original_description
                                        || viewingReviewNote.items[linkingItemIdx]?.description
                                        || '';
                                      setNoteItemNewName(desc.toLowerCase());
                                    }
                                  }}
                                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 text-slate-400 rounded-xl hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all text-xs font-bold"
                                >
                                  <Plus size={13} />Criar novo produto
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          <div className="space-y-3">
                            <button
                              onClick={() => { setNoteItemShowCreate(false); setNoteItemNewImage(''); setNoteItemNewImageUploading(false); }}
                              className="text-xs font-bold text-slate-400 hover:text-primary transition-colors flex items-center gap-1"
                            >
                              ← Voltar para busca
                            </button>
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Nome *</label>
                              <input autoFocus type="text" value={noteItemNewName} onChange={e => setNoteItemNewName(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="Nome do produto" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">SKU</label>
                                <input type="text" value={noteItemNewSku} onChange={e => setNoteItemNewSku(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  placeholder="Auto-gerado" />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">EAN</label>
                                <input type="text" value={noteItemNewEan} onChange={e => setNoteItemNewEan(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  placeholder="Cód. barras" />
                              </div>
                            </div>
                            {/* ── Preço de venda + Foto do produto ── */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Preço de Venda (R$)</label>
                                <div className="relative">
                                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">R$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={noteItemNewSellPrice}
                                    onChange={e => setNoteItemNewSellPrice(e.target.value)}
                                    placeholder="0,00"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Foto do Produto</label>
                                <input
                                  ref={noteItemImageInputRef}
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    setNoteItemNewImageUploading(true);
                                    const formData = new FormData();
                                    formData.append('file', file);
                                    try {
                                      const res = await fetch('/api/upload', { method: 'POST', body: formData });
                                      if (res.ok) {
                                        const d = await res.json();
                                        setNoteItemNewImage(d.url);
                                      }
                                    } catch {}
                                    setNoteItemNewImageUploading(false);
                                    if (e.target) e.target.value = '';
                                  }}
                                />
                                {noteItemNewImage ? (
                                  <div className="relative inline-flex">
                                    <img src={noteItemNewImage} alt="foto" className="w-[46px] h-[46px] rounded-xl object-cover border border-slate-200" />
                                    <button
                                      onClick={() => setNoteItemNewImage('')}
                                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-slate-700 rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                                    >
                                      <X size={9} className="text-white" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => noteItemImageInputRef.current?.click()}
                                    disabled={noteItemNewImageUploading}
                                    className="w-full h-[46px] bg-slate-50 border border-slate-200 border-dashed rounded-xl flex items-center justify-center gap-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50"
                                  >
                                    {noteItemNewImageUploading
                                      ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-r-transparent" />
                                      : <><ImageIcon size={13} /><span className="text-[11px] font-bold">Foto</span></>
                                    }
                                  </button>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={handleNoteItemCreateAndLink}
                              disabled={noteItemCreating || !noteItemNewName.trim()}
                              className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-sm hover:bg-primary transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                              {noteItemCreating
                                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                                : <><Plus size={13} />Criar e Vincular</>
                              }
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </div>
                );
              })()}

              <div className="p-6 border-t border-line dark:border-white/[0.07] bg-surface-container dark:bg-[#252520] flex items-center justify-between shrink-0">
                <div className="text-sm text-on-surface/40 flex items-center gap-2 flex-wrap">
                  Total: <span className="font-bold text-on-surface">{viewingReviewNote.itemCount} itens</span>
                  {reviewFilterActive && Object.values(reviewColumnFilters).some(s => s.size > 0) && (() => {
                    const totalCount = viewingReviewNote.items.length;
                    const _getFilterVal = (key: string, it: any, i: number): string => {
                      if (key === 'produto') return it.original_description || '-';
                      if (key === 'interno') return it.name || '-';
                      if (key === 'ean') return viewingNoteEans[i] || it.ean || '-';
                      if (key === 'sku') return viewingNoteSkus[i] || it.sku || '-';
                      if (key === 'status') return it.status_translation || '-';
                      return '-';
                    };
                    const shownCount = viewingReviewNote.items.filter((it: any, i: number) =>
                      Object.entries(reviewColumnFilters).every(([key, sel]) => sel.size === 0 || sel.has(_getFilterVal(key, it, i)))
                    ).length;
                    return (
                      <>
                        <span className="text-on-surface/15">·</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-black">
                          <Filter size={10} />
                          {shownCount} de {totalCount}
                        </span>
                        <button
                          onClick={() => { setReviewColumnFilters({}); setReviewFilterOpen(null); setReviewFilterSearch(''); }}
                          className="text-xs font-bold text-primary/60 hover:text-primary transition-colors"
                        >
                          Limpar filtros
                        </button>
                      </>
                    );
                  })()}
                  <span className="text-on-surface/15">·</span>
                  <span className="font-bold text-emerald-500 dark:text-emerald-400">{viewingNoteVerified.filter(Boolean).length} verificados</span>
                  <span className="text-on-surface/15">·</span>
                  {/* Single reduce: totalCost (nota) + markup ponderado */}
                  {(() => {
                    const { noteTotalCost, markupCost, markupRevenue } =
                      viewingReviewNote.items.reduce(
                        (acc: { noteTotalCost: number; markupCost: number; markupRevenue: number }, item: any, idx: number) => {
                          const cost = (viewingNoteItemPrices[idx] ?? item.price ?? 0) / ((viewingNoteMultipliers[idx] ?? item.multiplier) || 1);
                          const qty  = viewingNoteQtys[idx] ?? item.qty ?? 0;
                          let discAmt = 0;
                          if (discountMode === 'geral' && discountApplied) {
                            discAmt = discountApplied.type === 'pct' ? cost * discountApplied.value / 100 : discountApplied.value;
                          } else if (discountMode === 'individual') {
                            const v = parseFloat(itemDiscounts[idx] ?? '');
                            if (!isNaN(v) && v > 0) discAmt = discountIndividualType === 'pct' ? cost * v / 100 : v;
                          }
                          let surAmt = 0;
                          if (surchargeMode === 'geral' && surchargeApplied) {
                            surAmt = surchargeApplied.type === 'pct' ? cost * surchargeApplied.value / 100 : surchargeApplied.value;
                          } else if (surchargeMode === 'individual') {
                            const v = parseFloat(itemSurcharges[idx] ?? '');
                            if (!isNaN(v) && v > 0) {
                              const qty = viewingNoteQtys[idx] ?? item.qty ?? 1;
                              surAmt = surchargeIndividualType === 'pct' ? cost * v / 100
                                : surchargeIndividualType === 'fixed_total' ? v / (qty || 1)
                                : v;
                            }
                          }
                          const adjCost   = cost - discAmt + surAmt;
                          const sellPrice = viewingNoteSellPrices[idx] ?? (item as any).product_price ?? 0;
                          const hasMarkup = adjCost > 0 && sellPrice > 0;
                          return {
                            noteTotalCost:  acc.noteTotalCost  + (adjCost > 0 ? adjCost * qty : 0),
                            markupCost:     acc.markupCost     + (hasMarkup ? adjCost    * qty : 0),
                            markupRevenue:  acc.markupRevenue  + (hasMarkup ? sellPrice  * qty : 0),
                          };
                        },
                        { noteTotalCost: 0, markupCost: 0, markupRevenue: 0 },
                      );
                    const noteMarkup = markupCost > 0
                      ? (markupRevenue - markupCost) / markupCost * 100
                      : null;
                    return (
                      <>
                        <span className="text-on-surface/40">Valor total da nota:</span>
                        <span className="font-black text-on-surface">R$ {noteTotalCost.toFixed(2)}</span>
                        {noteMarkup !== null && (
                          <>
                            <span className="text-on-surface/15">·</span>
                            <span className="text-on-surface/40">Markup total:</span>
                            <span className={cn('font-black', noteMarkup >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                              {noteMarkup >= 0 ? '+' : ''}{noteMarkup.toFixed(1)}%
                            </span>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    disabled={savingNote}
                    onClick={handleSaveNote}
                    className="px-6 py-3 bg-primary text-white font-black rounded-xl hover:bg-primary/90 transition-all shadow-lg flex items-center gap-2 disabled:opacity-60"
                  >
                    {savingNote
                      ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Salvando...</>
                      : <><Save size={16} />Salvar</>
                    }
                  </button>

                  {confirmDeleteNote ? (
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
                      <span className="text-sm font-bold text-red-400 whitespace-nowrap">Excluir nota?</span>
                      <button
                        onClick={handleDeleteNote}
                        className="px-3 py-1 bg-red-600 text-white text-sm font-black rounded-lg hover:bg-red-700 transition-colors"
                      >
                        Sim
                      </button>
                      <button
                        onClick={() => setConfirmDeleteNote(false)}
                        className="px-3 py-1 bg-on-surface/[0.07] border border-on-surface/[0.1] text-on-surface/60 text-sm font-bold rounded-lg hover:bg-on-surface/[0.12] transition-colors"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteNote(true)}
                      className="px-6 py-3 bg-red-500/10 text-red-400 border border-red-500/20 font-bold rounded-xl hover:bg-red-500/18 transition-all flex items-center gap-2"
                    >
                      <Trash2 size={16} />
                      Excluir
                    </button>
                  )}

                  <button
                    onClick={() => setShowMobileNoteView(true)}
                    className="px-6 py-3 bg-on-surface/[0.06] text-on-surface font-black rounded-xl hover:bg-on-surface/[0.1] transition-all border border-on-surface/[0.06] flex items-center gap-2"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                    Mobile
                  </button>

                  <button
                    onClick={() => { setViewingReviewNote(null); setConfirmDeleteNote(false); setShowMobileNoteView(false); }}
                    className="px-8 py-3 bg-on-surface/[0.08] text-on-surface font-black rounded-xl hover:bg-on-surface/[0.14] transition-all border border-on-surface/[0.08] dark:bg-[#111110] dark:border-white/[0.06] dark:hover:bg-black"
                  >
                    Fechar
                  </button>
                </div>
              </div>

              {/* ── Discrepancy Modal ─────────────────────────────────────── */}
              <AnimatePresence>
                {discrepancyModalIdx !== null && (() => {
                  const item = viewingReviewNote.items[discrepancyModalIdx];
                  const isFalta = discrepancyTab === 'falta';
                  const accentCls = isFalta ? 'text-red-400' : 'text-emerald-400';
                  const accentBg  = isFalta ? 'bg-red-500'   : 'bg-emerald-500';
                  const accentBorder = isFalta ? 'border-red-500/40' : 'border-emerald-500/40';
                  const accentRing   = isFalta ? 'focus:ring-red-400/40' : 'focus:ring-emerald-400/40';

                  const handleSaveDiscrepancy = () => {
                    const qty = discrepancyMissingAll ? 0 : (parseFloat(discrepancyQty) || 0);
                    const updated = [...viewingNoteDiscrepancies];
                    // Ensure array is long enough
                    while (updated.length <= discrepancyModalIdx) updated.push(null);
                    updated[discrepancyModalIdx] = {
                      type: discrepancyTab,
                      qty,
                      missingAll: isFalta && discrepancyMissingAll,
                      obs: discrepancyObs.trim(),
                    };
                    setViewingNoteDiscrepancies(updated);
                    setDiscrepancyModalIdx(null);
                  };

                  const handleClearDiscrepancy = () => {
                    const updated = [...viewingNoteDiscrepancies];
                    while (updated.length <= discrepancyModalIdx) updated.push(null);
                    updated[discrepancyModalIdx] = null;
                    setViewingNoteDiscrepancies(updated);
                    setDiscrepancyModalIdx(null);
                  };

                  return (
                    <motion.div
                      key="discrepancy-overlay"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0 z-[200] flex items-center justify-center"
                      style={{ backdropFilter: 'blur(6px)', backgroundColor: 'rgba(10,10,8,0.72)' }}
                      onClick={() => setDiscrepancyModalIdx(null)}
                    >
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                        className="bg-[#1e1e18] border border-white/[0.09] rounded-2xl shadow-2xl w-full max-w-xs mx-4 overflow-hidden"
                        onClick={e => e.stopPropagation()}
                      >
                        {/* Header */}
                        <div className="bg-[#252520] px-5 py-4 flex items-center justify-between border-b border-white/[0.06]">
                          <div className="flex items-center gap-2.5">
                            <AlertTriangle size={15} className={accentCls} />
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-wider text-white/40">Divergência</p>
                              <p className="text-sm font-black text-[#f2f0e3] leading-tight max-w-[180px] truncate">{item?.name || item?.original_description || `Item ${discrepancyModalIdx + 1}`}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setDiscrepancyModalIdx(null)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition-all"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        {/* Tab switcher */}
                        <div className="px-5 pt-4 pb-0 flex gap-2">
                          <button
                            onClick={() => setDiscrepancyTab('falta')}
                            className={cn(
                              "flex-1 py-2 rounded-xl text-sm font-black transition-all",
                              discrepancyTab === 'falta'
                                ? "bg-red-500/15 text-red-400 border border-red-500/30"
                                : "bg-white/[0.04] text-white/35 border border-white/[0.06] hover:bg-white/[0.08] hover:text-white/55"
                            )}
                            style={{ transition: 'all 160ms cubic-bezier(0.23,1,0.32,1)' }}
                          >
                            Falta
                          </button>
                          <button
                            onClick={() => setDiscrepancyTab('sobra')}
                            className={cn(
                              "flex-1 py-2 rounded-xl text-sm font-black transition-all",
                              discrepancyTab === 'sobra'
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : "bg-white/[0.04] text-white/35 border border-white/[0.06] hover:bg-white/[0.08] hover:text-white/55"
                            )}
                            style={{ transition: 'all 160ms cubic-bezier(0.23,1,0.32,1)' }}
                          >
                            Sobra
                          </button>
                        </div>

                        {/* Body */}
                        <div className="px-5 py-4 space-y-3">
                          <AnimatePresence mode="wait">
                            {isFalta ? (
                              <motion.div
                                key="falta"
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 6 }}
                                transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
                                className="space-y-3"
                              >
                                {/* Toggle: não veio */}
                                <button
                                  type="button"
                                  onClick={() => setDiscrepancyMissingAll(v => !v)}
                                  className="w-full flex items-center gap-3 py-2.5 px-3 bg-white/[0.03] border border-white/[0.07] rounded-xl hover:bg-white/[0.06] transition-all text-left"
                                >
                                  <div className={cn(
                                    "w-9 h-5 rounded-full relative shrink-0 transition-colors",
                                    discrepancyMissingAll ? "bg-red-500" : "bg-white/[0.12]"
                                  )} style={{ transition: 'background 180ms cubic-bezier(0.23,1,0.32,1)' }}>
                                    <span className={cn(
                                      "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                                      discrepancyMissingAll ? "left-4" : "left-0.5"
                                    )} style={{ transition: 'left 180ms cubic-bezier(0.23,1,0.32,1)' }} />
                                  </div>
                                  <span className="text-sm font-semibold text-white/70">Produto não veio</span>
                                </button>

                                {/* Qty input */}
                                <AnimatePresence>
                                  {!discrepancyMissingAll && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      transition={{ duration: 0.15 }}
                                      className="overflow-hidden"
                                    >
                                      <label className="block text-[11px] font-bold uppercase tracking-wider text-white/35 mb-1.5">
                                        Qtd. faltando
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={discrepancyQty}
                                        onChange={e => setDiscrepancyQty(e.target.value)}
                                        autoFocus
                                        placeholder="0"
                                        className={cn(
                                          "w-full bg-white/[0.05] border rounded-xl px-4 py-2.5 text-sm font-bold text-[#f2f0e3] focus:outline-none focus:ring-2 transition-all",
                                          "border-white/[0.08]", accentRing
                                        )}
                                        style={{ transition: 'box-shadow 150ms ease' }}
                                      />
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </motion.div>
                            ) : (
                              <motion.div
                                key="sobra"
                                initial={{ opacity: 0, x: 6 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -6 }}
                                transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
                              >
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-white/35 mb-1.5">
                                  Qtd. sobrando
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={discrepancyQty}
                                  onChange={e => setDiscrepancyQty(e.target.value)}
                                  autoFocus
                                  placeholder="0"
                                  className={cn(
                                    "w-full bg-white/[0.05] border rounded-xl px-4 py-2.5 text-sm font-bold text-[#f2f0e3] focus:outline-none focus:ring-2 transition-all",
                                    "border-white/[0.08]", accentRing
                                  )}
                                  style={{ transition: 'box-shadow 150ms ease' }}
                                />
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Observations */}
                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-white/35 mb-1.5">
                              Observações
                            </label>
                            <textarea
                              value={discrepancyObs}
                              onChange={e => setDiscrepancyObs(e.target.value)}
                              placeholder="Detalhes adicionais sobre a divergência..."
                              rows={3}
                              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-[#f2f0e3] placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none transition-all"
                            />
                          </div>
                        </div>

                        {/* Footer actions */}
                        <div className="px-5 pb-5 flex gap-2">
                          <button
                            onClick={handleClearDiscrepancy}
                            className="flex-1 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-sm font-bold text-white/45 hover:bg-white/[0.08] hover:text-white/65 transition-all active:scale-[0.97]"
                            style={{ transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)' }}
                          >
                            Limpar
                          </button>
                          <button
                            onClick={handleSaveDiscrepancy}
                            className={cn(
                              "flex-1 py-2.5 rounded-xl text-sm font-black text-white shadow-lg transition-all active:scale-[0.97]",
                              isFalta
                                ? "bg-red-500 hover:bg-red-600 shadow-red-500/25"
                                : "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25"
                            )}
                            style={{ transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)' }}
                          >
                            Salvar
                          </button>
                        </div>
                      </motion.div>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>

              {/* Desconto Geral dialog */}
              {discountDialog === 'geral' && (
                <div className="absolute inset-0 z-[150] bg-slate-900/50 flex items-center justify-center rounded-3xl">
                  <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl">
                    <h4 className="text-base font-black text-slate-900 mb-1">Desconto Geral</h4>
                    <p className="text-xs text-slate-400 mb-4">Aplicado a todos os itens da nota</p>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input type="number" min="0" step="0.01" value={discountGeralValue} onChange={e => setDiscountGeralValue(e.target.value)} placeholder="0" autoFocus
                          className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden" />
                        <div className="flex border border-slate-200 rounded-xl overflow-hidden">
                          <button onClick={() => setDiscountGeralType('pct')} className={cn("px-4 text-sm font-black transition-colors", discountGeralType === 'pct' ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50")}>%</button>
                          <button onClick={() => setDiscountGeralType('fixed')} className={cn("px-4 text-sm font-black transition-colors border-l border-slate-200", discountGeralType === 'fixed' ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50")}>R$</button>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setDiscountDialog(null)} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
                        <button onClick={() => { const v = parseFloat(discountGeralValue); if (!isNaN(v) && v > 0) { setDiscountApplied({ value: v, type: discountGeralType }); setDiscountMode('geral'); } setDiscountDialog(null); }}
                          className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-black hover:bg-primary/90 transition-colors">Aplicar</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Desconto Individual dialog */}
              {discountDialog === 'individual' && (
                <div className="absolute inset-0 z-[150] bg-slate-900/50 flex items-center justify-center rounded-3xl">
                  <div className="bg-white rounded-2xl p-6 w-72 shadow-2xl">
                    <h4 className="text-base font-black text-slate-900 mb-1">Desconto Individual</h4>
                    <p className="text-xs text-slate-400 mb-5">Escolha o tipo de valor para cada item</p>
                    <div className="flex gap-3 mb-5">
                      <button onClick={() => setDiscountIndividualType('pct')} className={cn("flex-1 py-5 rounded-xl border-2 font-black transition-all flex flex-col items-center gap-1", discountIndividualType === 'pct' ? "border-primary text-primary bg-primary/5" : "border-slate-200 text-slate-400 hover:border-slate-300")}>
                        <span className="text-2xl">%</span><span className="text-xs font-medium">Percentual</span>
                      </button>
                      <button onClick={() => setDiscountIndividualType('fixed')} className={cn("flex-1 py-5 rounded-xl border-2 font-black transition-all flex flex-col items-center gap-1", discountIndividualType === 'fixed' ? "border-primary text-primary bg-primary/5" : "border-slate-200 text-slate-400 hover:border-slate-300")}>
                        <span className="text-2xl">R$</span><span className="text-xs font-medium">Valor fixo</span>
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setDiscountDialog(null)} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
                      <button onClick={() => { setDiscountMode('individual'); if (viewingReviewNote) setItemDiscounts(new Array(viewingReviewNote.items.length).fill('')); setDiscountDialog(null); }}
                        className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-black hover:bg-primary/90 transition-colors">Confirmar</button>
                    </div>
                  </div>
                </div>
              )}
              {/* Acréscimo Geral dialog */}
              {surchargeDialog === 'geral' && (
                <div className="absolute inset-0 z-[150] bg-slate-900/50 flex items-center justify-center rounded-3xl">
                  <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl">
                    <h4 className="text-base font-black text-slate-900 mb-1">Acréscimo Geral</h4>
                    <p className="text-xs text-slate-400 mb-4">Aplicado a todos os itens da nota</p>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input type="number" min="0" step="0.01" value={surchargeGeralValue} onChange={e => setSurchargeGeralValue(e.target.value)} placeholder="0" autoFocus
                          className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden" />
                        <div className="flex border border-slate-200 rounded-xl overflow-hidden">
                          <button onClick={() => setSurchargeGeralType('pct')} className={cn("px-4 text-sm font-black transition-colors", surchargeGeralType === 'pct' ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50")}>%</button>
                          <button onClick={() => setSurchargeGeralType('fixed')} className={cn("px-4 text-sm font-black transition-colors border-l border-slate-200", surchargeGeralType === 'fixed' ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50")}>R$</button>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setSurchargeDialog(null)} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
                        <button onClick={() => { const v = parseFloat(surchargeGeralValue); if (!isNaN(v) && v > 0) { setSurchargeApplied({ value: v, type: surchargeGeralType }); setSurchargeMode('geral'); } setSurchargeDialog(null); }}
                          className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-black hover:bg-primary/90 transition-colors">Aplicar</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Overlay para fechar menu de unidade */}
              {reviewUnitMenuIdx !== null && (
                <div className="absolute inset-0 z-40" onClick={() => setReviewUnitMenuIdx(null)} />
              )}

              {/* Adicionar medida dialog */}
              {reviewMeasureIdx !== null && (
                <div className="absolute inset-0 z-[150] bg-slate-900/50 flex items-center justify-center rounded-3xl">
                  <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl">
                    <h4 className="text-base font-black text-slate-900 mb-1">Adicionar medida</h4>
                    <p className="text-xs text-slate-400 mb-4">
                      Defina quantas unidades internas equivalem a 1 unidade do fornecedor
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Unidade do fornecedor</label>
                        <input
                          type="text"
                          value={reviewMeasureUnit}
                          onChange={e => setReviewMeasureUnit(e.target.value)}
                          placeholder="Ex: CX, PCT, FD..."
                          autoFocus
                          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Multiplicador (qtd. por unidade)</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={reviewMeasureMultiplier}
                          onChange={e => setReviewMeasureMultiplier(e.target.value)}
                          placeholder="Ex: 12"
                          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setReviewMeasureIdx(null)} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                          Cancelar
                        </button>
                        <button
                          onClick={handleReviewSaveMeasure}
                          disabled={reviewSavingMeasure}
                          className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-black hover:bg-primary/90 transition-colors disabled:opacity-60"
                        >
                          {reviewSavingMeasure ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Vincular Vários modal */}
              {multiLinkItemIdx !== null && (
                <div className="fixed inset-0 z-[170] flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setMultiLinkItemIdx(null); setMultiLinkItemEntries([]); }} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: 16 }}
                    transition={{ duration: 0.18 }}
                    className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
                  >
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                          <Layers size={14} />
                        </div>
                        <h3 className="text-base font-black text-slate-900">Vincular Vários</h3>
                      </div>
                      <button onClick={() => { setMultiLinkItemIdx(null); setMultiLinkItemEntries([]); }} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X size={16} className="text-slate-400" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                      {!multiLinkItemShowCreate ? (
                        <>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              <input type="text" value={multiLinkItemSearch}
                                onChange={e => setMultiLinkItemSearch(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleMultiLinkItemSearch()}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="Buscar por nome, SKU ou EAN..." autoFocus />
                            </div>
                            <input type="number" value={multiLinkItemQty}
                              onChange={e => setMultiLinkItemQty(e.target.value)}
                              className="w-20 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-center"
                              placeholder="Qtd" min="0" step="any" />
                            <button onClick={handleMultiLinkItemSearch}
                              className="px-3 py-2 bg-slate-900 text-white rounded-xl hover:bg-primary transition-colors" title="Buscar">
                              <Search size={14} />
                            </button>
                            <button onClick={() => setMultiLinkItemShowCreate(true)}
                              className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors" title="Criar novo produto">
                              <Plus size={14} />
                            </button>
                          </div>
                          {multiLinkItemResults.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">Resultados</p>
                              {multiLinkItemResults.map((p: any) => (
                                <button key={p.id} onClick={() => handleMultiLinkItemAdd(p)}
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
                                  <Plus size={14} className="text-slate-300 group-hover:text-primary shrink-0" />
                                </button>
                              ))}
                            </div>
                          )}
                          {multiLinkItemEntries.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">A criar ({multiLinkItemEntries.length})</p>
                              {multiLinkItemEntries.map((entry, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-emerald-800 truncate">{entry.product.name}</p>
                                    <p className="text-[10px] text-emerald-600 font-medium">Qtd: {entry.qty}</p>
                                  </div>
                                  <button onClick={() => setMultiLinkItemEntries(prev => prev.filter((_, j) => j !== i))}
                                    className="w-6 h-6 rounded-lg text-emerald-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-all shrink-0">
                                    <X size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-4">
                          <button onClick={() => setMultiLinkItemShowCreate(false)} className="text-xs font-bold text-slate-400 hover:text-primary transition-colors flex items-center gap-1">
                            ← Voltar para busca
                          </button>
                          <h4 className="text-sm font-black text-slate-900">Criar Novo Produto</h4>
                          <div className="space-y-3">
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Quantidade *</label>
                              <input type="number" value={multiLinkItemQty} onChange={e => setMultiLinkItemQty(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="Quantidade" min="0" step="any" />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Nome *</label>
                              <input autoFocus type="text" value={multiLinkItemNewName} onChange={e => setMultiLinkItemNewName(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="Nome do produto" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">SKU</label>
                                <input type="text" value={multiLinkItemNewSku} onChange={e => setMultiLinkItemNewSku(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  placeholder="Auto-gerado" />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">EAN / Barcode</label>
                                <input type="text" value={multiLinkItemNewEan} onChange={e => setMultiLinkItemNewEan(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  placeholder="Código de barras" />
                              </div>
                            </div>
                          </div>
                          <button onClick={handleMultiLinkItemCreateProduct}
                            disabled={multiLinkItemCreating || !multiLinkItemNewName.trim() || !multiLinkItemQty.trim()}
                            className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-sm hover:bg-primary transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                            {multiLinkItemCreating
                              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                              : <><Plus size={14} />Criar e Adicionar</>
                            }
                          </button>
                        </div>
                      )}
                    </div>
                    {multiLinkItemEntries.length > 0 && !multiLinkItemShowCreate && (
                      <div className="px-5 py-4 border-t border-slate-100 shrink-0">
                        <button onClick={handleSaveMultiLinkItem}
                          className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-sm hover:bg-amber-600 transition-colors flex items-center justify-center gap-2">
                          <Layers size={14} />
                          Criar {multiLinkItemEntries.length} linha{multiLinkItemEntries.length !== 1 ? 's' : ''}
                        </button>
                      </div>
                    )}
                  </motion.div>
                </div>
              )}

              {/* Acréscimo Individual dialog */}
              {surchargeDialog === 'individual' && (
                <div className="absolute inset-0 z-[150] bg-slate-900/50 flex items-center justify-center rounded-3xl">
                  <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl">
                    <h4 className="text-base font-black text-slate-900 mb-1">Acréscimo Individual</h4>
                    <p className="text-xs text-slate-400 mb-4">Escolha o tipo e a base de cálculo para cada item</p>

                    {/* Tipo: % ou R$ */}
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Tipo</p>
                    <div className="flex gap-3 mb-4">
                      <button onClick={() => setSurchargeIndividualType('pct')} className={cn("flex-1 py-4 rounded-xl border-2 font-black transition-all flex flex-col items-center gap-1", surchargeIndividualType === 'pct' ? "border-primary text-primary bg-primary/5" : "border-slate-200 text-slate-400 hover:border-slate-300")}>
                        <span className="text-2xl">%</span><span className="text-xs font-medium">Percentual</span>
                      </button>
                      <button onClick={() => { if (surchargeIndividualType === 'pct') setSurchargeIndividualType('fixed'); }} className={cn("flex-1 py-4 rounded-xl border-2 font-black transition-all flex flex-col items-center gap-1", surchargeIndividualType !== 'pct' ? "border-primary text-primary bg-primary/5" : "border-slate-200 text-slate-400 hover:border-slate-300")}>
                        <span className="text-2xl">R$</span><span className="text-xs font-medium">Valor fixo</span>
                      </button>
                    </div>

                    {/* Base: apenas quando R$ selecionado */}
                    {surchargeIndividualType !== 'pct' && (
                      <>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Aplicar sobre</p>
                        <div className="flex gap-3 mb-4">
                          <button
                            onClick={() => setSurchargeIndividualType('fixed')}
                            className={cn("flex-1 py-3 rounded-xl border-2 font-black transition-all flex flex-col items-center gap-1 text-center", surchargeIndividualType === 'fixed' ? "border-primary text-primary bg-primary/5" : "border-slate-200 text-slate-400 hover:border-slate-300")}
                          >
                            <span className="text-sm">R$/un</span>
                            <span className="text-[10px] font-medium leading-tight">Preço Custo<br/>(por unidade)</span>
                          </button>
                          <button
                            onClick={() => setSurchargeIndividualType('fixed_total')}
                            className={cn("flex-1 py-3 rounded-xl border-2 font-black transition-all flex flex-col items-center gap-1 text-center", surchargeIndividualType === 'fixed_total' ? "border-primary text-primary bg-primary/5" : "border-slate-200 text-slate-400 hover:border-slate-300")}
                          >
                            <span className="text-sm">R$∑</span>
                            <span className="text-[10px] font-medium leading-tight">Valor Total<br/>(rateado por qtd.)</span>
                          </button>
                        </div>
                      </>
                    )}

                    <div className="flex gap-2">
                      <button onClick={() => setSurchargeDialog(null)} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
                      <button onClick={() => { setSurchargeMode('individual'); if (viewingReviewNote) setItemSurcharges(new Array(viewingReviewNote.items.length).fill('')); setSurchargeDialog(null); }}
                        className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-black hover:bg-primary/90 transition-colors">Confirmar</button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Note View */}
      <AnimatePresence>
        {showMobileNoteView && viewingReviewNote && (
          <MobileNoteView
            note={viewingReviewNote}
            products={products}
            eans={viewingNoteEans}              setEans={setViewingNoteEans}
            skus={viewingNoteSkus}              setSkus={setViewingNoteSkus}
            qtys={viewingNoteQtys}              setQtys={setViewingNoteQtys}
            itemPrices={viewingNoteItemPrices}  setItemPrices={setViewingNoteItemPrices}
            sellPrices={viewingNoteSellPrices}  setSellPrices={setViewingNoteSellPrices}
            verified={viewingNoteVerified}       setVerified={setViewingNoteVerified}
            units={viewingNoteUnits}
            multipliers={viewingNoteMultipliers}
            distribuicao={viewingNoteDistribuicao}
            setNote={(n) => setViewingReviewNote(n as any)}
            onClose={() => setShowMobileNoteView(false)}
            onSave={handleSaveNote}
            savingNote={savingNote}
            onDelete={handleDeleteNote}
            onVarios={(idx) => { setShowMobileNoteView(false); setMultiLinkItemIdx(idx); setMultiLinkItemSearch(''); setMultiLinkItemQty(''); setMultiLinkItemResults([]); setMultiLinkItemEntries([]); setMultiLinkItemShowCreate(false); }}
          />
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

      {/* ── Estoque Print Layout Picker ──────────────────────────────────────── */}
      <AnimatePresence>
        {showEstoqueLayoutPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(8,8,6,0.78)' }}
            onClick={() => setShowEstoqueLayoutPicker(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="bg-[#1e1e18] border border-white/[0.09] rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-[#252520] px-5 py-4 flex items-center justify-between border-b border-white/[0.06]">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-white/35">Exportar</p>
                  <p className="text-base font-black text-[#f2f0e3]">Exportar PDF — Estoque</p>
                </div>
                <button
                  onClick={() => setShowEstoqueLayoutPicker(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Preset cards — 3 columns */}
                {(() => {
                  type PresetDef = {
                    id: 'financeiro' | 'estoque' | 'personalizado';
                    label: string;
                    desc: string;
                    cols: { label: string; flex: number; red?: boolean }[];
                  };
                  const presets: PresetDef[] = [
                    {
                      id: 'financeiro',
                      label: 'Financeiro',
                      desc: 'Custo, markup e venda',
                      cols: [
                        { label: 'Cód', flex: 20 },
                        { label: 'Produto', flex: 60 },
                        { label: 'Qtd', flex: 12 },
                        { label: 'P.Custo', flex: 22 },
                        { label: 'Vlr Total', flex: 22 },
                        { label: 'P.Venda', flex: 20 },
                        { label: 'Markup', flex: 18 },
                        { label: 'Dist.', flex: 26 },
                      ],
                    },
                    {
                      id: 'estoque',
                      label: 'Estoque',
                      desc: 'Conferência com EAN',
                      cols: [
                        { label: 'Cód', flex: 18 },
                        { label: 'Produto', flex: 55 },
                        { label: 'EAN', flex: 30 },
                        { label: 'Qtd', flex: 14 },
                        { label: 'P.Venda', flex: 20, red: true },
                        { label: 'Dist.', flex: 24, red: true },
                        { label: '□', flex: 20 },
                      ],
                    },
                    {
                      id: 'personalizado',
                      label: 'Personalizado',
                      desc: 'Escolha as colunas',
                      cols: estoqueCustomCols.length > 0
                        ? estoqueCustomCols.slice(0, 5).map(c => ({ label: c.slice(0, 5), flex: 30 }))
                        : [
                            { label: '?', flex: 30 },
                            { label: '?', flex: 60 },
                            { label: '?', flex: 30 },
                          ],
                    },
                  ];

                  return (
                    <div className="grid grid-cols-3 gap-2.5">
                      {presets.map(p => {
                        const active = estoquePreset === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => setEstoquePreset(p.id)}
                            className={cn(
                              "text-left p-3 rounded-xl border transition-all",
                              active
                                ? "bg-primary/10 border-primary/40"
                                : "bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06] hover:border-white/[0.12]"
                            )}
                            style={{ transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)' }}
                          >
                            <p className={cn("text-sm font-black mb-0.5", active ? "text-primary" : "text-[#f2f0e3]")}>{p.label}</p>
                            <p className="text-[10px] text-white/40 mb-2">{p.desc}</p>
                            {/* Mini table preview */}
                            <div className="rounded overflow-hidden border border-white/[0.08]">
                              <div className="flex h-3.5" style={{ backgroundColor: 'rgb(80,80,74)' }}>
                                {p.cols.map((c, i) => (
                                  <div
                                    key={i}
                                    style={{ flex: c.flex }}
                                    className={cn(
                                      "border-r border-black/25 last:border-0 flex items-center justify-center",
                                      c.red ? "text-red-400" : "text-white/70"
                                    )}
                                  >
                                    <span style={{ fontSize: '4px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden' }}>{c.label}</span>
                                  </div>
                                ))}
                              </div>
                              {[0, 1, 2].map(row => (
                                <div key={row} className="flex" style={{ height: '7px', backgroundColor: row % 2 === 1 ? 'rgb(245,245,240)' : 'rgb(255,255,255)' }}>
                                  {p.cols.map((_, i) => (
                                    <div key={i} style={{ flex: p.cols[i].flex }} className="border-r border-slate-200 last:border-0" />
                                  ))}
                                </div>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Personalizado builder */}
                {estoquePreset === 'personalizado' && (() => {
                  const allCols = [
                    { key: 'codigo',      label: 'Código' },
                    { key: 'produto',     label: 'Produto' },
                    { key: 'ean',         label: 'EAN' },
                    { key: 'sku',         label: 'SKU' },
                    { key: 'qtd',         label: 'Quantidade' },
                    { key: 'pcusto',      label: 'P.Custo' },
                    { key: 'vlrtotal',    label: 'Vlr Total' },
                    { key: 'desconto',    label: 'Desconto' },
                    { key: 'acrescimo',   label: 'Acréscimo' },
                    { key: 'pvenda',      label: 'P.Venda' },
                    { key: 'markup',      label: 'Markup' },
                    { key: 'distribuicao',label: 'Distribuição' },
                    { key: 'check',       label: 'Check □' },
                  ];
                  const addedKeys = estoqueCustomCols;
                  return (
                    <div className="space-y-3 pt-1">
                      {/* Chip pool */}
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-white/35 mb-2">Colunas disponíveis</p>
                        <div className="flex flex-wrap gap-1.5">
                          {allCols.filter(c => !addedKeys.includes(c.key)).map(c => (
                            <button
                              key={c.key}
                              onClick={() => setEstoqueCustomCols(prev => [...prev, c.key])}
                              className="px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.10] text-[11px] font-semibold text-white/60 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-all active:scale-95"
                              style={{ transition: 'all 120ms cubic-bezier(0.23,1,0.32,1)' }}
                            >
                              + {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Added slots */}
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-white/35 mb-2">Ordem das colunas</p>
                        {addedKeys.length === 0 ? (
                          <p className="text-xs text-white/25 italic">Nenhuma coluna adicionada</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {addedKeys.map((key, i) => {
                              const col = allCols.find(c => c.key === key);
                              return (
                                <div key={key} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/30">
                                  <span className="text-[10px] text-white/40 font-bold">{i + 1}</span>
                                  <span className="text-[11px] font-semibold text-primary">{col?.label ?? key}</span>
                                  <button
                                    onClick={() => setEstoqueCustomCols(prev => prev.filter((_, idx) => idx !== i))}
                                    className="text-white/30 hover:text-red-400 transition-colors ml-0.5"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Footer actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowEstoqueLayoutPicker(false)}
                    className="flex-1 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-sm font-bold text-white/45 hover:bg-white/[0.08] hover:text-white/65 transition-all active:scale-[0.97]"
                    style={{ transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (!estoquePickerArgs) return;
                      exportEstoqueToA4PDF(
                        estoquePickerArgs.items,
                        estoquePickerArgs.adj,
                        estoquePickerArgs.meta,
                        { preset: estoquePreset, customCols: estoqueCustomCols }
                      );
                      setShowEstoqueLayoutPicker(false);
                    }}
                    disabled={estoquePreset === 'personalizado' && estoqueCustomCols.length === 0}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-black shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)' }}
                  >
                    <Download size={14} />
                    Gerar PDF
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

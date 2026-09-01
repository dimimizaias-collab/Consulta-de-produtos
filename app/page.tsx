'use client';

import { Sidebar } from '@/components/Sidebar';
import { BottomNav } from '@/components/BottomNav';
import { TopNav } from '@/components/TopNav';
import { NotificationsPage, type AppNotification } from '@/components/NotificationsPage';
import { FeaturedProduct } from '@/components/FeaturedProduct';
import { ProductCard } from '@/components/ProductCard';
import { InventoryManager } from '@/components/inventory/InventoryManager';
import { ProductBulkTable } from '@/components/inventory/ProductBulkTable';
import { RequestCenter } from '@/components/requests/RequestCenter';
import { TaskRequestDetailModal } from '@/components/requests/TaskRequestDetailModal';
import { ProductAlterationModal } from '@/components/requests/ProductAlterationModal';
import { LogisticsCenter, ReviewNote, getNoteStatus, STATUS_META, StatusIcon, noteHasUnpricedLinkedItems, type NoteStatus } from '@/components/requests/LogisticsCenter';
import { ReceivedDateField } from '@/components/requests/ReceivedDateField';
// Pedidos de Compra — DESATIVADO da navegação (ver components/Sidebar.tsx). Import e componente mantidos para reativação futura.
import { PurchaseOrderManager } from '@/components/orders/PurchaseOrderManager';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { FinanceManager } from '@/components/finance/FinanceManager';
import { MobileFinancePage } from '@/components/finance/MobileFinancePage';
import { LinkTransactionModal } from '@/components/requests/LinkTransactionModal';
import { FinanceDashboard } from '@/components/finance/FinanceDashboard';
import { HRManager } from '@/components/hr/HRManager';
import { MobileHRPage } from '@/components/hr/MobileHRPage';
import { MobileNoteView, type EanVariant } from '@/components/MobileNoteView';
import { MobileBulkTable } from '@/components/inventory/MobileBulkTable';
import { MobileTypeModal } from '@/components/tasks/MobileTypeModal';
import { MobileTaskPage, type TaskDraft } from '@/components/tasks/MobileTaskPage';
import { EanProblemButton, type EanProblem } from '@/components/shared/EanProblemButton';
import { EanCodesEditor, type EanCodeEntry } from '@/components/shared/EanCodesEditor';
import { MotherProductsTab } from '@/components/inventory/MotherProductsTab';
import { MotherProductModal, saveMotherPackage, type MotherPackageDraft } from '@/components/inventory/MotherProductModal';
import { AddManufacturerModal } from '@/components/manufacturers/AddManufacturerModal';
import { Filter, Plus, Minus, X, Edit2, CheckCircle2, Download, FileUp, Search, Image as ImageIcon, RefreshCw, ChevronDown, ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight, Check, Trash2, ArrowLeftRight, BarChart3, Link as LinkIcon, ArrowRight, ArrowDown, ArrowUp, Package, LogIn, FileText, ShoppingCart, Truck, BookText, Users, Pencil, ClipboardList, SendHorizonal, Ban, Save, Ruler, Zap, Layers, AlertTriangle, Undo2, Redo2, Bookmark, ShieldCheck, Copy, EyeOff, Calendar, Building2, Wallet, TrendingUp, TrendingDown, Hash, MapPin, Tag, Barcode, LayoutGrid, Factory, IdCard, AlignLeft, Columns3, Boxes, Info, ScrollText, FileCode2, Upload } from 'lucide-react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn, getDirectImageUrl } from '@/lib/utils';
import { useViewMode } from '@/lib/view-mode';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { tableCellKeyDown } from '@/lib/tableKeyNav';
import { XMLParser } from 'fast-xml-parser';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

const staticProducts: any[] = [];

// Mensagem usada tanto pela validação em persistNote quanto pelos catch blocks de
// handleSaveNote/changeNoteStatus, que trocam a aba pra Recebimento quando ela aparece.
const EMPRESA_REQUIRED_MSG = 'Selecione a Empresa antes de salvar a nota.';

// Lock de edição por colaborador — evita dois usuários editando a mesma nota ao mesmo
// tempo. TTL alto o bastante pra tolerar uma renovação de heartbeat perdida por rede.
const NOTE_LOCK_TTL_MS = 2 * 60 * 1000;
const NOTE_LOCK_HEARTBEAT_MS = 45 * 1000;

// Evita que o scroll do mouse altere valores de campos numéricos por acidente
// (comportamento nativo do input[type=number] ao rolar com o cursor sobre o campo).
const blockWheelChange = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

// Motivos de ajuste de estoque — todo ajuste manual precisa de um, para manter a
// trilha de auditoria (stock_adjustments) legível no futuro módulo de Análise de Produtos.
const STOCK_ADJUSTMENT_REASONS: { value: string; label: string }[] = [
  { value: 'contagem_fisica', label: 'Contagem física' },
  { value: 'avaria', label: 'Avaria' },
  { value: 'perda', label: 'Perda / furto' },
  { value: 'correcao_importacao', label: 'Correção de importação' },
  { value: 'outro', label: 'Outro' },
];

// Queda considerada "grande" o suficiente para exigir confirmação extra antes de aplicar
// — evita zerar estoque por engano em lote (dedo no número errado, sinal trocado, etc).
const isLargeStockDrop = (previousCount: number, delta: number) => {
  if (delta >= 0) return false;
  const drop = Math.abs(delta);
  return drop >= 20 || (previousCount > 0 && drop / previousCount >= 0.5);
};

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

// Select de Fabricante/Marca — como manufacturers precisa guardar o ID (não texto livre,
// diferente de categoria/localização/etc.), não reaproveita o SearchableSelect genérico.
// "+ Novo Fabricante" só aparece pra quem pode cadastrar (canCreate) e abre o modal de
// verdade (AddManufacturerModal), já que fabricante exige prefixo — não dá pra criar só
// digitando um texto livre como as outras opções "+ Nova categoria" etc.
function ManufacturerSelect({
  value,
  onChange,
  manufacturers,
  canCreate,
  onRequestCreate,
  placeholder = 'Pesquisar fabricante...',
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  manufacturers: { id: string; name: string; prefix: string; active: boolean }[];
  canCreate: boolean;
  onRequestCreate: () => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fabricante inativo continua aparecendo se já for o selecionado — senão o produto
  // fica mostrando um select vazio sem explicação nenhuma.
  const selectable = useMemo(() => manufacturers.filter(m => m.active || m.id === value), [manufacturers, value]);
  const selected = selectable.find(m => m.id === value) || null;
  const filtered = useMemo(
    () => selectable.filter(m => m.name.toLowerCase().includes(search.toLowerCase())),
    [selectable, search]
  );

  return (
    <div className="flex gap-2 flex-1" ref={containerRef}>
      <div className="relative flex-1">
        <div className="relative">
          <input
            type="text"
            value={isOpen ? search : (selected?.name || '')}
            onFocus={() => { setIsOpen(true); setSearch(''); }}
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
              <button
                type="button"
                onClick={() => { onChange(null); setIsOpen(false); setSearch(''); }}
                className={cn(
                  "w-full text-left px-4 py-2 text-sm italic hover:bg-on-surface/5 transition-colors",
                  !value ? "text-primary font-bold bg-primary/5" : "text-on-surface/50"
                )}
              >
                Sem fabricante
              </button>
              {filtered.length > 0 ? (
                filtered.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { onChange(m.id); setIsOpen(false); setSearch(''); }}
                    className={cn(
                      "w-full text-left px-4 py-2 text-sm hover:bg-on-surface/5 transition-colors flex items-center justify-between gap-2",
                      value === m.id ? "text-primary font-bold bg-primary/5" : "text-on-surface"
                    )}
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="text-[10px] font-mono text-on-surface/30 shrink-0">{m.prefix}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-2 text-sm text-on-surface/50 italic">
                  {canCreate ? 'Nenhum fabricante encontrado' : 'Nenhum fabricante encontrado — peça a um admin/gerente pra cadastrar'}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {canCreate && (
        <button
          type="button"
          onClick={onRequestCreate}
          title="Cadastrar novo fabricante"
          className="w-10 h-10 rounded-lg flex items-center justify-center transition-all shrink-0 border bg-red-500 border-red-600 text-white hover:bg-red-600"
        >
          <Plus size={18} />
        </button>
      )}
    </div>
  );
}

// Constrói um mapa EAN -> product_id considerando tanto o EAN principal
// (products.ean) quanto os EANs adicionais (product_ean_codes). Aceita tanto
// produtos já vindos de fetchProducts() (com `extraEans` anexado) quanto uma
// lista de produtos "crua" (select('*') direto) acompanhada de `extraEanRows`
// buscados separadamente — usado pelos fluxos que fazem fetch próprio.
function buildEanToProductId(products: any[], extraEanRows?: { ean: string; product_id: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  products.forEach((p: any) => {
    if (p.ean?.trim()) map.set(p.ean.trim(), p.id);
  });
  products.forEach((p: any) => {
    (p.extraEans || []).forEach((e: { ean: string }) => {
      if (e.ean?.trim() && !map.has(e.ean.trim())) map.set(e.ean.trim(), p.id);
    });
    (p.motherEans || []).forEach((e: { ean: string }) => {
      if (e.ean?.trim() && !map.has(e.ean.trim())) map.set(e.ean.trim(), p.id);
    });
  });
  (extraEanRows || []).forEach(r => {
    if (r.ean?.trim() && !map.has(r.ean.trim())) map.set(r.ean.trim(), r.product_id);
  });
  return map;
}

// Verifica se um código bate com o EAN de uma embalagem-mãe (caixa/fardo) do produto
// (product.motherEans, anexado por fetchProducts). Usado ao vincular manualmente um item
// de nota pelo EAN da caixa, para aplicar o mesmo fator de conversão (units_per_child)
// que a importação automática já aplica (ver handleNoteImportExcel).
function findMotherPackageByCode(product: any, code: string | null | undefined) {
  const c = (code || '').trim();
  if (!c || !product) return null;
  return (product.motherEans || []).find((m: any) => m.ean === c) || null;
}

// Código usado para buscar/vincular um item de nota a um produto: prioriza o EAN (coluna
// "EAN"), mas cai para o Código do fornecedor (coluna "Códigos"/supplier_code) quando o EAN
// está vazio — na prática o usuário às vezes digita o EAN da caixa/mãe ali em vez de na
// coluna EAN, e sem esse fallback nenhuma busca/vínculo automático o enxerga.
function getNoteItemMatchCode(ean: string | null | undefined, supplierCode: string | null | undefined): string {
  const e = (ean || '').trim();
  return e || (supplierCode || '').trim();
}

export default function Page() {
  const { isMobileView } = useViewMode();
  const [activeTab, setActiveTab] = useState('Inventory');
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>([]);
  const [pendingOpenNoteId, setPendingOpenNoteId] = useState<string | null>(null);
  const [pendingFinanceTxId, setPendingFinanceTxId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [motherChildProductIds, setMotherChildProductIds] = useState<Set<string>>(new Set());
  const [requests, setRequests] = useState<any[]>([]);
  const [showAddRequestModal, setShowAddRequestModal] = useState(false);
  const [isRequestingNewProduct, setIsRequestingNewProduct] = useState(false);
  const [isReviewingExistingRequest, setIsReviewingExistingRequest] = useState(false);
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
    observation: '',
  });
  const [newProductRequestExtraEans, setNewProductRequestExtraEans] = useState<EanCodeEntry[]>([]);
  const [showStockUpdateChoiceModal, setShowStockUpdateChoiceModal] = useState(false);
  const [showProductBulkTable, setShowProductBulkTable] = useState(false);
  const [showMobileTypeModal, setShowMobileTypeModal] = useState(false);
  const [showMobileBulkTable, setShowMobileBulkTable] = useState(false);
  const [showMobileTaskPage, setShowMobileTaskPage] = useState(false);
  const [bulkDrafts, setBulkDrafts] = useState<any[]>([]);
  const [showBulkDraftReviewModal, setShowBulkDraftReviewModal] = useState(false);
  const [bulkDraftUnderReview, setBulkDraftUnderReview] = useState<any>(null);
  const [bulkDraftEditedItems, setBulkDraftEditedItems] = useState<any[]>([]);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [taskDetailRequest, setTaskDetailRequest] = useState<any>(null);
  const [taskDetailData, setTaskDetailData] = useState<any>(null);
  const [showAlterationDetailModal, setShowAlterationDetailModal] = useState(false);
  const [alterationDetailData, setAlterationDetailData] = useState<any>(null);
  const [originalProductSnapshot, setOriginalProductSnapshot] = useState<any>(null);
  const [eanProblems, setEanProblems] = useState<EanProblem[]>([]);
  const [showManualStockModal, setShowManualStockModal] = useState(false);
  const [manualStockSearchQuery, setManualStockSearchQuery] = useState({ ean: '', sku: '', name: '' });
  const [manualStockSearchResults, setManualStockSearchResults] = useState<any[]>([]);
  const [selectedManualProduct, setSelectedManualProduct] = useState<any>(null);
  const [manualStockChange, setManualStockChange] = useState(0);
  const [isUpdatingManualStock, setIsUpdatingManualStock] = useState(false);
  const [manualStockReason, setManualStockReason] = useState('');
  const [manualStockNote, setManualStockNote] = useState('');
  const [manualStockConfirmDrop, setManualStockConfirmDrop] = useState(false);
  const [manualStockHistory, setManualStockHistory] = useState<any[]>([]);
  const [showManualStockHistory, setShowManualStockHistory] = useState(false);

  // Entrada de Mercadoria states
  const [noteItems, setNoteItems] = useState<any[]>([]);
  const [noteSearchQuery, setNoteSearchQuery] = useState('');
  const [noteSearchResults, setNoteSearchResults] = useState<any[]>([]);
  const [isProcessingNote, setIsProcessingNote] = useState(false);
  const noteFileInputRef = useRef<HTMLInputElement>(null);

  // Supplier Dictionary states
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  const [supplierNames, setSupplierNames] = useState<any[]>([]);

  // Fabricantes/Marcas — usado no campo "Fabricante" do produto e no botão "Sugerir código"
  const [manufacturers, setManufacturers] = useState<{ id: string; name: string; prefix: string; active: boolean; next_seq: number }[]>([]);
  const [canManageManufacturers, setCanManageManufacturers] = useState(false);
  const [showQuickAddManufacturer, setShowQuickAddManufacturer] = useState(false);

  // Empresas cadastradas em Configurações > Dados — usadas no campo Empresa da aba Recebimento
  const [companies, setCompanies] = useState<any[]>([]);

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
  const [reviewFocusedRowIdx, setReviewFocusedRowIdx] = useState<number | null>(null);

  // Preço de venda por empresa — permite lançar Preço Venda/Markup/Revisão/Ok de uma nota
  // para uma empresa diferente da dona, sem misturar com os dados da empresa dona.
  // null = contexto padrão (empresa dona da nota).
  const [viewingPriceCompanyId, setViewingPriceCompanyId] = useState<string | null>(null);
  const [priceCompanyDropdownOpen, setPriceCompanyDropdownOpen] = useState(false);
  const [viewingNoteExtraPricing, setViewingNoteExtraPricing] = useState<Record<string, {
    sellPrices: (number | undefined)[];
    verified: boolean[];
    reviewTimestamps: (string | null)[];
  }>>({});
  const [switchingPriceCompany, setSwitchingPriceCompany] = useState(false);

  // Lock de edição por colaborador — "quem sou eu" agora vem do usuário logado
  // (tabela usuarios → hr_employees), carregado uma vez no mount.
  const [colaboradorId, setColaboradorId] = useState<string | null>(null);
  const [colaboradorNome, setColaboradorNome] = useState<string | null>(null);
  const colaboradorReadyRef = useRef<Promise<void> | null>(null);
  // Preenchido quando a nota aberta está travada por outra pessoa — dispara o overlay
  // de bloqueio por cima do conteúdo (em vez de desabilitar cada campo individualmente).
  const [noteLockBlockedBy, setNoteLockBlockedBy] = useState<{ name: string; at: string | null } | null>(null);
  const [checkingNoteLock, setCheckingNoteLock] = useState(false);

  // estoque print layout picker
  type EstoquePreset = 'financeiro' | 'estoque' | 'personalizado';
  const [showEstoqueLayoutPicker, setShowEstoqueLayoutPicker] = useState(false);
  const [estoquePickerArgs, setEstoquePickerArgs] = useState<{ items: any[]; adj?: any; meta?: any } | null>(null);
  const [estoquePreset, setEstoquePreset] = useState<EstoquePreset>('financeiro');
  const [estoqueCustomCols, setEstoqueCustomCols] = useState<string[]>([]);

  // discrepancy modal
  type DiscrepancyData = { type: 'falta' | 'sobra'; qty: number; missingAll: boolean; obs: string; disregarded?: boolean } | null;
  const [viewingNoteDiscrepancies, setViewingNoteDiscrepancies] = useState<DiscrepancyData[]>([]);
  const [discrepancyModalIdx, setDiscrepancyModalIdx] = useState<number | null>(null);
  const [discrepancyTab, setDiscrepancyTab] = useState<'falta' | 'sobra'>('falta');
  const [discrepancyQty, setDiscrepancyQty] = useState('');
  const [discrepancyMissingAll, setDiscrepancyMissingAll] = useState(false);
  const [discrepancyObs, setDiscrepancyObs] = useState('');
  const [discrepancyDisregarded, setDiscrepancyDisregarded] = useState(false);

  const [isApprovingNf, setIsApprovingNf] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [confirmDeleteNote, setConfirmDeleteNote] = useState(false);
  const [showMobileNoteView, setShowMobileNoteView] = useState(false);
  const [noteViewMode, setNoteViewMode] = useState<'admin' | 'estoque'>('estoque');
  const [noteModeChoiceOpen, setNoteModeChoiceOpen] = useState(false);
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('note-view-mode') : null;
    if (saved === 'admin' || saved === 'estoque') setNoteViewMode(saved);
  }, []);
  const changeNoteViewMode = (m: 'admin' | 'estoque') => {
    setNoteViewMode(m);
    if (typeof window !== 'undefined') localStorage.setItem('note-view-mode', m);
  };
  const [linkingItemIdx, setLinkingItemIdx] = useState<number | null>(null);
  const [noteItemLinkQuery, setNoteItemLinkQuery] = useState('');
  const [noteItemShowCreate, setNoteItemShowCreate] = useState(false);
  const [noteItemNewName, setNoteItemNewName] = useState('');
  const [noteItemNewSku, setNoteItemNewSku] = useState('');
  const [noteItemNewEan, setNoteItemNewEan] = useState('');
  const [noteItemExtraEans, setNoteItemExtraEans] = useState<EanCodeEntry[]>([]);
  const [noteItemNewSellPrice, setNoteItemNewSellPrice] = useState('');
  const [noteItemCreating, setNoteItemCreating] = useState(false);
  const [noteItemSelectedProduct, setNoteItemSelectedProduct] = useState<any>(null);
  const [noteItemSellPriceInput, setNoteItemSellPriceInput] = useState('');
  const [noteItemSaveTranslation, setNoteItemSaveTranslation] = useState(false);
  // Aba ativa na tela "Criar Novo Produto" do modal "Vincular ao Dicionário": deixa o usuário
  // escolher se está definindo o Produto (filho) ou o Produto Mãe (caixa/fardo) — nessa ordem
  // ou na inversa, já que o Produto Mãe pode ser salvo (pendente) antes do produto existir.
  const [noteItemCreateTab, setNoteItemCreateTab] = useState<'produto' | 'mae'>('produto');
  const [noteItemMotherModalOpen, setNoteItemMotherModalOpen] = useState(false);
  // Produto Mãe salvo pela aba "Produto Mãe" ANTES do produto normal existir fica gravado
  // diretamente em item.mother_draft (dentro de viewingReviewNote.items, JSONB da tabela
  // review_notes) — sobrevive a fechar/reabrir a nota, ao contrário de estado local. A tabela
  // product_mother_packages exige child_product_id NOT NULL, então nada é gravado no banco
  // ainda; o rascunho só vira uma linha real quando o produto filho for criado (dentro de
  // handleNoteItemCreateAndLink), que também limpa item.mother_draft nesse momento. Enquanto
  // pendente, bloqueia a aprovação da nota (ver blockedByPendingMotherDraft).
  // "Preços por Loja" no formulário de criação — a loja principal (dona da nota) usa
  // noteItemNewSellPrice normalmente; as demais são lançadas em viewingNoteExtraPricing
  // (mesmo mecanismo de "distribuição" já usado na tabela de revisão) via setExtraSellPrice.
  const [noteItemExtraStoreIds, setNoteItemExtraStoreIds] = useState<string[]>([]);
  const [noteItemExtraStorePrices, setNoteItemExtraStorePrices] = useState<Record<string, string>>({});
  const [noteItemAddStoreOpen, setNoteItemAddStoreOpen] = useState(false);
  const [noteItemEanCopied, setNoteItemEanCopied] = useState(false);
  const [multiLinkSaveTranslation, setMultiLinkSaveTranslation] = useState(false);
  // Atalho "Criar e Vincular" na coluna Identificação Interna: item pendente de confirmação
  // (produto não encontrado no dicionário) e estado de submissão do modal de confirmação.
  const [quickCreateConfirmIdx, setQuickCreateConfirmIdx] = useState<number | null>(null);
  const [quickCreateSubmitting, setQuickCreateSubmitting] = useState(false);
  const [multiLinkItemIdx, setMultiLinkItemIdx] = useState<number | null>(null);
  const [multiLinkItemSearch, setMultiLinkItemSearch] = useState('');
  const [multiLinkItemQty, setMultiLinkItemQty] = useState('');
  const [multiLinkItemResults, setMultiLinkItemResults] = useState<any[]>([]);
  const [multiLinkItemEntries, setMultiLinkItemEntries] = useState<{ product: any; qty: string; multiplier: string; supplierCode: string }[]>([]);
  const [multiLinkItemShowCreate, setMultiLinkItemShowCreate] = useState(false);
  const [multiLinkItemNewName, setMultiLinkItemNewName] = useState('');
  const [multiLinkItemNewSku, setMultiLinkItemNewSku] = useState('');
  const [multiLinkItemNewEan, setMultiLinkItemNewEan] = useState('');
  const [multiLinkItemCreating, setMultiLinkItemCreating] = useState(false);
  // Adj column states (multiple discount/surcharge columns)
  type AdjType = 'pct' | 'fixed' | 'fixed_total';
  type AdjMode = 'none' | 'geral' | 'individual';
  type AdjColumn = { id: string; name: string; kind: 'desconto' | 'acrescimo'; mode: 'geral' | 'individual'; geralValue: number; geralType: AdjType; individualType: AdjType; items: string[] };
  type AdjColDialog = { kind: 'desconto' | 'acrescimo'; name: string; method: 'geral' | 'individual' | null; geralValue: string; geralType: AdjType; individualType: AdjType };
  const [adjColumns, setAdjColumns] = useState<AdjColumn[]>([]);
  const [adjColDialog, setAdjColDialog] = useState<AdjColDialog | null>(null);
  // helpers to compute total disc/sur amounts from adjColumns for a single row
  const calcAdjAmounts = (cost: number, qty: number, idx: number, cols: AdjColumn[]) => {
    let disc = 0, sur = 0;
    for (const col of cols) {
      let amt = 0;
      if (col.mode === 'geral') {
        amt = col.geralType === 'pct' ? cost * col.geralValue / 100 : col.geralValue;
      } else {
        const v = parseFloat(col.items[idx] ?? '');
        if (!isNaN(v) && v > 0) {
          amt = col.individualType === 'pct' ? cost * v / 100
            : col.individualType === 'fixed_total' ? v / (qty || 1) : v;
        }
      }
      if (col.kind === 'desconto') disc += amt; else sur += amt;
    }
    return { disc, sur };
  };
  // Quantidade efetiva de um item pra fins de total/markup da nota. Marcar "Falta"/"Sobra"
  // sozinho é só registro/aviso — não altera o cálculo. Só quando o usuário ativa
  // "Desconsiderar produto" a quantidade indicada passa a ser abatida: zera tudo se
  // "Produto não veio" (falta total), ou abate só a qtd. informada (falta/sobra parcial).
  const getEffectiveQty = (qty: number, discrepancy: DiscrepancyData | null | undefined): number => {
    if (!discrepancy || !discrepancy.disregarded) return qty;
    if (discrepancy.type === 'falta' && discrepancy.missingAll) return 0;
    return Math.max(0, qty - (discrepancy.qty || 0));
  };
  // Quantidade exibida na coluna Qtd. — sempre reflete a Falta/Sobra registrada assim que o
  // usuário salva o registro, independente do toggle "Confirmar divergência" (que agora só
  // ajusta o Valor Total/Markup, ver getEffectiveQty acima). Mesmo padrão visual da coluna
  // Qtd. Env. da Distribuição (DistributionManifestModal.tsx, getEffectiveReceivedQty).
  const getDisplayQty = (qty: number, discrepancy: DiscrepancyData | null | undefined): number => {
    if (!discrepancy) return qty;
    if (discrepancy.type === 'falta') return discrepancy.missingAll ? 0 : Math.max(0, qty - (discrepancy.qty || 0));
    return qty + (discrepancy.qty || 0);
  };
  // Divergência "vigente" de um item: usa o estado de edição em tela (viewingNoteDiscrepancies)
  // sempre que ele já cobre esse índice — mesmo quando o valor lá é `null` (== usuário limpou
  // a divergência agora, ainda não salvou). Só cai para item.discrepancy (o que veio do banco)
  // quando o array de edição ainda nem chegou nesse índice. Usar `??` aqui é o bug clássico:
  // `null ?? item.discrepancy` resolve pro item.discrepancy porque null é nullish — fazendo o
  // "Limpar" do modal de Divergência parecer não fazer nada (a linha volta a mostrar a
  // divergência antiga porque a leitura ignora o `null` explícito).
  const getItemDiscrepancy = (idx: number, item: any): DiscrepancyData =>
    idx < viewingNoteDiscrepancies.length ? viewingNoteDiscrepancies[idx] : ((item?.discrepancy as DiscrepancyData) ?? null);
  // Progresso das 3 etapas do controle logístico "OK"/"Revisão" de um item: 1) cadastrado
  // (vinculado a produto interno), 2) precificado (preço de venda definido), 3) atualizado
  // (confirmação manual do usuário, é o que os campos verified/review_timestamp guardam hoje).
  // Etapas 1 e 2 são deriváveis de campos já existentes — não precisam de estado próprio.
  const getItemStageProgress = (opts: { productId: string | null | undefined; sellPrice: number | null | undefined; verified: boolean }) => {
    const stage1 = !!opts.productId;
    const stage2 = Number(opts.sellPrice) > 0;
    const stage3 = !!opts.verified;
    return { stage1, stage2, stage3, completed: (stage1 ? 1 : 0) + (stage2 ? 1 : 0) + (stage3 ? 1 : 0) };
  };
  // valor de UMA coluna de ajuste específica para uma linha — usado pelo PDF "Personalizado"
  // pra deixar o usuário escolher, coluna por coluna, quais Descontos/Acréscimos entram no export.
  const calcAdjColAmount = (col: AdjColumn, cost: number, qty: number, idx: number): number => {
    if (col.mode === 'geral') {
      return col.geralType === 'pct' ? cost * col.geralValue / 100 : col.geralValue;
    }
    const v = parseFloat(col.items[idx] ?? '');
    if (isNaN(v) || v <= 0) return 0;
    return col.individualType === 'pct' ? cost * v / 100
      : col.individualType === 'fixed_total' ? v / (qty || 1) : v;
  };
  // legacy compat: derive single-column adj object from adjColumns (for export functions)
  const adjLegacy = () => {
    const dCol = adjColumns.find(c => c.kind === 'desconto');
    const sCol = adjColumns.find(c => c.kind === 'acrescimo');
    return {
      discountMode: dCol ? dCol.mode : 'none' as AdjMode,
      discountApplied: dCol && dCol.mode === 'geral' ? { value: dCol.geralValue, type: dCol.geralType } : null,
      discountIndividualType: dCol ? dCol.individualType : 'pct' as AdjType,
      itemDiscounts: dCol ? dCol.items : [],
      surchargeMode: sCol ? sCol.mode : 'none' as AdjMode,
      surchargeApplied: sCol && sCol.mode === 'geral' ? { value: sCol.geralValue, type: sCol.geralType } : null,
      surchargeIndividualType: sCol ? sCol.individualType : 'pct' as AdjType,
      itemSurcharges: sCol ? sCol.items : [],
    };
  };
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
  const [nfDistribDropdownIdx, setNfDistribDropdownIdx] = useState<number | null>(null);
  const [nfDistribMode, setNfDistribMode] = useState<string[]>([]);

  const getPendingNfExportItems = () => pendingNfItems.map((item: any, idx: number) => ({
    ...item,
    ean: nfItemEans[idx] ?? item.ean,
    sku: nfItemSkus[idx] ?? item.sku,
    qty: nfItemQtys[idx] ?? item.qty,
    price: nfItemPrices[idx] ?? item.price,
    product_price: nfItemSellPrices[idx] ?? item.product_price,
    verified: nfItemVerified[idx] ?? item.verified,
    distribuicao: nfItemDistribuicao[idx] ? parseInt(nfItemDistribuicao[idx]) || null : null,
  }));

  const [viewingNoteEans, setViewingNoteEans] = useState<string[]>([]);
  const [copiedEanIdx, setCopiedEanIdx] = useState<number | null>(null);
  const handleCopyEan = (idx: number, value: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopiedEanIdx(idx);
    setTimeout(() => setCopiedEanIdx(prev => (prev === idx ? null : prev)), 1200);
  };
  const [viewingNoteSkus, setViewingNoteSkus] = useState<string[]>([]);
  const [viewingNoteQtys, setViewingNoteQtys] = useState<(number | null)[]>([]);
  const [viewingNoteEanVariants, setViewingNoteEanVariants] = useState<EanVariant[][]>([]);
  const [viewingNoteExtraEans, setViewingNoteExtraEans] = useState<EanCodeEntry[][]>([]);
  const [viewingNoteItemPrices, setViewingNoteItemPrices] = useState<(number | null)[]>([]);
  const [viewingNoteDistribuicao, setViewingNoteDistribuicao] = useState<string[]>([]);
  const [viewingDistribDropdownIdx, setViewingDistribDropdownIdx] = useState<number | null>(null);
  const [viewingDistribMode, setViewingDistribMode] = useState<string[]>([]);
  // Distribuição por loja — um item pode ir para várias empresas ao mesmo tempo (Record
  // company_id -> quantidade), substituindo o número único antigo (item.distribuicao).
  const [viewingNoteDistribByCompany, setViewingNoteDistribByCompany] = useState<Record<string, number>[]>([]);
  const [distribModalIdx, setDistribModalIdx] = useState<number | null>(null);
  const [distribModalDraft, setDistribModalDraft] = useState<Record<string, string>>({});
  const [viewingNoteUnits, setViewingNoteUnits] = useState<string[]>([]);
  const [viewingNoteMultipliers, setViewingNoteMultipliers] = useState<number[]>([]);
  // Marca itens cuja Medida foi definida via "Usar tradução" ou "Adicionar medida" (badge de conversão na célula)
  const [viewingNoteMeasureConverted, setViewingNoteMeasureConverted] = useState<boolean[]>([]);
  // product_ids com tradução de medida (supplier_units) já cadastrada — evita abrir o menu Medida
  // com a opção "Usar tradução" quando não há nada pra usar (pula direto pra "Adicionar Medida")
  const [productsWithMeasureTranslation, setProductsWithMeasureTranslation] = useState<Set<string>>(new Set());

  // Total distribuído pra outras lojas nesse item — soma de viewingNoteDistribByCompany[idx],
  // com fallback pro campo legado (item.distribuicao) em notas salvas antes dessa mudança.
  const getDistribTotal = (idx: number, item: any): number => {
    const byCompany = viewingNoteDistribByCompany[idx];
    if (byCompany && Object.keys(byCompany).length > 0) {
      return Object.values(byCompany).reduce((acc: number, v: any) => acc + (parseFloat(v) || 0), 0);
    }
    return item?.distribuicao || 0;
  };
  // Undo/Redo history
  const noteHistoryRef = useRef<any[]>([]);
  const noteHistoryIdxRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [noteSupplierMappings, setNoteSupplierMappings] = useState<any[]>([]);
  const [showSupplierProductsModal, setShowSupplierProductsModal] = useState(false);
  const [supplierProductsSearch, setSupplierProductsSearch] = useState('');
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);
  const [reviewUnitMenuIdx, setReviewUnitMenuIdx] = useState<number | null>(null);
  const [reviewUnitMenuPos, setReviewUnitMenuPos] = useState<{ top: number; left: number } | null>(null);
  const reviewUnitTriggerRef = useRef<HTMLElement | null>(null);
  const [reviewLoadingUnitIdx, setReviewLoadingUnitIdx] = useState<number | null>(null);
  const [reviewMeasureIdx, setReviewMeasureIdx] = useState<number | null>(null);
  const [reviewMeasureUnit, setReviewMeasureUnit] = useState('');
  const [reviewMeasureMultiplier, setReviewMeasureMultiplier] = useState('');
  const [reviewSavingMeasure, setReviewSavingMeasure] = useState(false);
  const [reviewEditableCols, setReviewEditableCols] = useState<Set<string>>(new Set());
  const [editingNoteHeader, setEditingNoteHeader] = useState(false);
  // ── Aba Produtos/Recebimento + Situação de Entrada ──
  // Movimentações financeiras vinculadas à nota em revisão (aba Financeiro)
  type NoteFinanceTx = {
    id: string; data: string; tipo: 'Receita' | 'Despesa'; tipo_pagamento: string;
    favorecido: string; vencimento: string | null; valor_final: number; pago: boolean;
    numero_parcela: number | null; total_parcelas: number | null; parcelamento_id: string | null;
  };
  const [noteEditorTab, setNoteEditorTab] = useState<'produtos' | 'nota_original' | 'recebimento' | 'financeiro'>('produtos');
  const [noteFinanceTxs, setNoteFinanceTxs] = useState<NoteFinanceTx[]>([]);
  const [noteFinanceLoading, setNoteFinanceLoading] = useState(false);
  const [noteFinanceGoToTx, setNoteFinanceGoToTx] = useState<NoteFinanceTx | null>(null);
  const [showNoteLinkTxModal, setShowNoteLinkTxModal] = useState(false);
  const [noteFinanceRefreshKey, setNoteFinanceRefreshKey] = useState(0);
  const [noteFinanceExpandedGroups, setNoteFinanceExpandedGroups] = useState<Set<string>>(new Set());
  // Busca as movimentações financeiras vinculadas à nota (junção finance_transaction_notes,
  // mesma fonte de verdade usada em Controle Financeiro) sempre que a nota em revisão muda,
  // ou quando noteFinanceRefreshKey é incrementado (após vincular/criar uma movimentação).
  useEffect(() => {
    const noteId = viewingReviewNote?.id;
    if (!noteId) { setNoteFinanceTxs([]); return; }
    let cancelled = false;
    setNoteFinanceLoading(true);
    supabase.from('finance_transaction_notes')
      .select('transaction_id, finance_transactions(id, data, tipo, tipo_pagamento, favorecido, vencimento, valor_final, pago, numero_parcela, total_parcelas, parcelamento_id)')
      .eq('note_id', noteId)
      .then(({ data }) => {
        if (cancelled) return;
        setNoteFinanceTxs(
          (data ?? [])
            .map((r: any) => r.finance_transactions as NoteFinanceTx | null)
            .filter((t): t is NoteFinanceTx => !!t)
        );
        setNoteFinanceExpandedGroups(new Set());
        setNoteFinanceLoading(false);
      });
    return () => { cancelled = true; };
  }, [viewingReviewNote?.id, noteFinanceRefreshKey]);
  const [statusConfirmTarget, setStatusConfirmTarget] = useState<NoteStatus | null>(null);
  const [savingNoteStatus, setSavingNoteStatus] = useState(false);
  const [distribSendConfirmOpen, setDistribSendConfirmOpen] = useState(false);
  const [sendingDistribution, setSendingDistribution] = useState(false);
  // Combobox de Fornecedor no cabeçalho da nota (mesmo padrão do campo Favorecido em Nova Movimentação)
  const [noteSupplierQuery, setNoteSupplierQuery] = useState('');
  const [noteSupplierOpen, setNoteSupplierOpen] = useState(false);
  const noteSupplierRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (noteSupplierRef.current && !noteSupplierRef.current.contains(e.target as Node)) setNoteSupplierOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  // ── Column filters (Excel-like) ──
  const [reviewFilterActive, setReviewFilterActive] = useState(false);
  const [reviewColumnFilters, setReviewColumnFilters] = useState<Record<string, Set<string>>>({});
  const [reviewFilterOpen, setReviewFilterOpen] = useState<string | null>(null);
  const [reviewFilterSearch, setReviewFilterSearch] = useState('');
  // ── Ocultar colunas ── "Marca" vem oculta por padrão — usuário precisa abrir o menu de
  // colunas ocultas e reexibi-la manualmente.
  const [reviewHiddenCols, setReviewHiddenCols] = useState<Set<string>>(new Set(['Marca']));
  const [showHideColsModal, setShowHideColsModal] = useState(false);
  const REVIEW_HIDEABLE_COLS = ['Código', 'Produto na Nota', 'Identificação Interna', 'EAN', 'Marca', 'Medida', 'Qtd.', 'Preço Custo', 'Valor Total', 'Preço Venda', 'Markup', 'Status', 'Ok', 'Revisão', 'Distribuição'] as const;

  // ── Redimensionar colunas da tabela de nota (estilo Excel) ──
  // Larguras customizadas por coluna, chaveadas pelo mesmo nome usado em reviewHiddenCols
  // (ou pelo id da coluna dinâmica de ajuste). Persistidas por navegador — não por nota.
  const REVIEW_COL_WIDTHS_STORAGE_KEY = 'notaReviewColWidths';
  const REVIEW_COL_MIN_WIDTH = 36;
  const REVIEW_COL_DEFAULT_WIDTHS: Record<string, number> = {
    '#': 40, 'Código': 92, 'Produto na Nota': 230, 'Identificação Interna': 190, 'EAN': 150,
    'Marca': 110, 'Medida': 92, 'Qtd.': 72, 'Preço Custo': 100, 'Valor Total': 100,
    'Preço Venda': 100, 'Markup': 80, 'Status': 120, 'Ok': 56, 'Revisão': 76, 'Distribuição': 100,
  };
  const [reviewColWidths, setReviewColWidths] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(REVIEW_COL_WIDTHS_STORAGE_KEY);
      if (raw) setReviewColWidths(JSON.parse(raw));
    } catch {}
  }, []);
  const reviewColDragRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = reviewColDragRef.current;
      if (!drag) return;
      const newWidth = Math.max(REVIEW_COL_MIN_WIDTH, Math.round(drag.startWidth + (e.clientX - drag.startX)));
      setReviewColWidths(prev => ({ ...prev, [drag.key]: newWidth }));
    };
    const onUp = () => {
      if (!reviewColDragRef.current) return;
      reviewColDragRef.current = null;
      document.body.style.userSelect = '';
      setReviewColWidths(prev => { try { localStorage.setItem(REVIEW_COL_WIDTHS_STORAGE_KEY, JSON.stringify(prev)); } catch {} return prev; });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);
  const reviewColWidthFor = (key: string) => reviewColWidths[key] ?? REVIEW_COL_DEFAULT_WIDTHS[key] ?? 110;
  const resetReviewColWidths = () => {
    setReviewColWidths({});
    try { localStorage.removeItem(REVIEW_COL_WIDTHS_STORAGE_KEY); } catch {}
  };
  // Handle de arrasto — faixa fina na borda direita do <th>; duplo-clique = autoajuste ao conteúdo
  const ReviewColResizeHandle = ({ colKey }: { colKey: string }) => (
    <div
      onMouseDown={e => {
        e.preventDefault(); e.stopPropagation();
        const th = (e.currentTarget as HTMLElement).closest('th');
        const startWidth = th?.getBoundingClientRect().width ?? reviewColWidthFor(colKey);
        reviewColDragRef.current = { key: colKey, startX: e.clientX, startWidth };
        document.body.style.userSelect = 'none';
      }}
      onDoubleClick={e => {
        e.preventDefault(); e.stopPropagation();
        const th = (e.currentTarget as HTMLElement).closest('th');
        const table = th?.closest('table');
        if (!th || !table) return;
        const thIdx = Array.from(th.parentElement!.children).indexOf(th);
        let maxWidth = th.scrollWidth;
        table.querySelectorAll('tbody > tr').forEach(row => {
          const cellEl = row.children[thIdx] as HTMLElement | undefined;
          if (cellEl) maxWidth = Math.max(maxWidth, cellEl.scrollWidth);
        });
        const next = Math.max(REVIEW_COL_MIN_WIDTH, maxWidth + 6);
        setReviewColWidths(prev => {
          const merged = { ...prev, [colKey]: next };
          try { localStorage.setItem(REVIEW_COL_WIDTHS_STORAGE_KEY, JSON.stringify(merged)); } catch {}
          return merged;
        });
      }}
      title="Arraste para redimensionar · duplo-clique para ajustar ao conteúdo"
      className="group/colresize"
      style={{ position: 'absolute', top: 0, right: -3, width: '7px', height: '100%', cursor: 'col-resize', zIndex: 5 }}
    >
      <div className="mx-auto h-full w-[2px] rounded-full bg-primary/0 group-hover/colresize:bg-primary/50 transition-colors" />
    </div>
  );

  const [editingField, setEditingField] = useState<string | null>(null);
  const [showRequestConfirmModal, setShowRequestConfirmModal] = useState<{ show: boolean, requestId: string | null }>({ show: false, requestId: null });
  const [isNewRequest, setIsNewRequest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  // Importação de Vendas do Dia — o arquivo é só analisado (staged) aqui; nada é
  // gravado até o usuário revisar e confirmar no modal de revisão (ver Fase 3 do plano:
  // nunca aplicar silenciosamente linhas não identificadas).
  const [pendingSalesImport, setPendingSalesImport] = useState<{
    fileName: string;
    matched: { sku: string; ean: string; description: string; qty: number; productId: string; productName: string; productCount: number }[];
    unmatched: { sku: string; ean: string; description: string; qty: number }[];
    duplicateOf: { saleDate: string; createdAt: string } | null;
  } | null>(null);
  const [showSalesImportReview, setShowSalesImportReview] = useState(false);
  const [salesImportSaleDate, setSalesImportSaleDate] = useState('');
  const [salesImportConfirmDuplicate, setSalesImportConfirmDuplicate] = useState(false);
  const [isApplyingSalesImport, setIsApplyingSalesImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  useEffect(() => {
    // Ao fechar a modal de Editar Produto, atualiza quais produtos têm Produto Mãe
    // cadastrado (badge do card), já que a aba "Produto Mãe" pode ter sido usada.
    if (!showEditModal) fetchMotherChildProductIds();
  }, [showEditModal]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Editar Produto agora abre em modo "visualização" (campos somente leitura, estilo
  // Configurações do iOS) — o lápis no header libera a edição dos campos.
  const [isEditingProductFields, setIsEditingProductFields] = useState(false);
  useEffect(() => {
    if (showEditModal) {
      setIsEditingProductFields(false);
      setShowDeleteConfirm(false);
    }
  }, [showEditModal]);
  const [addStatus, setAddStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [editStatus, setEditStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [addError, setAddError] = useState('');
  const [editError, setEditError] = useState('');
  const [isConfigured, setIsConfigured] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  useEffect(() => {
    if (notification?.type !== 'success') return;
    const timer = setTimeout(() => setNotification(null), 2000);
    return () => clearTimeout(timer);
  }, [notification]);
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
    brand: '',
    manufacturerId: null as string | null,
    composicao: '',
    minStock: null as number | null,
  });
  const [newProductExtraEans, setNewProductExtraEans] = useState<EanCodeEntry[]>([]);
  const [newProductPriceDisplay, setNewProductPriceDisplay] = useState('');
  const [editProductPriceDisplay, setEditProductPriceDisplay] = useState('');
  const [editProductCostPriceDisplay, setEditProductCostPriceDisplay] = useState('');
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingProductExtraEans, setEditingProductExtraEans] = useState<EanCodeEntry[]>([]);
  // Aba "Editar Produto": Dados x Histórico em Notas. EANs-alvo do histórico são "congelados" ao
  // abrir o modal (não acompanham edições ao vivo do campo EAN) para não confundir o que já foi
  // gravado nas notas com o que o usuário está digitando agora.
  const [editProductTab, setEditProductTab] = useState<'dados' | 'mae' | 'historico'>('dados');
  const [newProductTab, setNewProductTab] = useState<'dados' | 'mae'>('dados');
  const [editProductHistoryEans, setEditProductHistoryEans] = useState<string[]>([]);

  // Estoque & Preço por Empresa — a empresa selecionada define quais valores de
  // count/price aparecem nos campos; o resto do produto é compartilhado entre lojas.
  const [editProductCompanyId, setEditProductCompanyId] = useState<string>('');
  const [editProductStockCache, setEditProductStockCache] = useState<Record<string, { count: number; price: number; costPrice: number }>>({});
  const [newProductCompanyId, setNewProductCompanyId] = useState<string>('');
  const [newProductStockByCompany, setNewProductStockByCompany] = useState<Record<string, { count: number; price: number }>>({});

  // Memoized derived values
  const unreadNotificationCount = useMemo(
    () => appNotifications.filter(n => !n.read).length,
    [appNotifications]
  );

  // Empresa "padrão" (mais antiga cadastrada) — é a que products.price/count espelha,
  // para não quebrar grade, etiquetas e exportações que ainda leem esses campos direto.
  const primaryCompanyId = useMemo(() => {
    if (companies.length === 0) return '';
    return companies.slice().sort((a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || ''))[0]?.id || '';
  }, [companies]);

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
    setNotification({ type: 'success', message: 'Lendo arquivo de vendas...' });

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
        const { data: extraEanRows } = await supabase.from('product_ean_codes').select('ean, product_id');
        const eanToProductId = buildEanToProductId(currentProducts || [], extraEanRows || []);

        const matched: NonNullable<typeof pendingSalesImport>['matched'] = [];
        const unmatched: NonNullable<typeof pendingSalesImport>['unmatched'] = [];

        for (const row of rawData) {
          const sku = getVal(row, ['código interno', 'codigo interno', 'sku', 'code', 'internal_code', 'referencia', 'cod interno']);
          const ean = getVal(row, ['código ean', 'codigo ean', 'ean', 'barcode', 'gtin', 'ean13', 'cod ean', 'cod barras']);
          const description = getVal(row, ['produto', 'descricao', 'descrição', 'nome', 'description', 'item']);
          const qtyStr = getVal(row, ['quantidade vendida', 'quantidade', 'estoque', 'count', 'quantity', 'stock', 'qtd'], '0');
          const qty = parseInt(qtyStr);

          if (isNaN(qty) || qty === 0) continue;

          // Find product by SKU or EAN (principal ou adicional) — nunca por nome (evita baixar
          // estoque do produto errado por semelhança de descrição, ver risco do plano da Fase 3).
          const eanProductId = ean ? eanToProductId.get(ean) : undefined;
          const product = currentProducts?.find(p =>
            (sku && p.sku === sku) || (eanProductId && p.id === eanProductId)
          );

          if (product) {
            matched.push({ sku, ean, description, qty, productId: product.id, productName: product.name, productCount: product.count || 0 });
          } else {
            unmatched.push({ sku, ean, description, qty });
          }
        }

        if (matched.length === 0 && unmatched.length === 0) {
          throw new Error('Nenhuma linha com quantidade válida foi encontrada no arquivo.');
        }

        // Aviso de possível reimportação — não bloqueia, só exige confirmação explícita
        // antes de aplicar (evita descontar o mesmo dia de vendas duas vezes por engano).
        const { data: previousImports } = await supabase
          .from('sales_imports')
          .select('sale_date, created_at')
          .ilike('file_name', file.name)
          .order('created_at', { ascending: false })
          .limit(1);
        const duplicateOf = previousImports && previousImports.length > 0
          ? { saleDate: previousImports[0].sale_date, createdAt: previousImports[0].created_at }
          : null;

        setPendingSalesImport({ fileName: file.name, matched, unmatched, duplicateOf });
        setSalesImportSaleDate(new Date().toISOString().slice(0, 10));
        setSalesImportConfirmDuplicate(false);
        setShowSalesImportReview(true);
        setNotification(null);
      } catch (err: any) {
        console.error('Erro ao ler arquivo de vendas:', err);
        setNotification({ type: 'error', message: `Erro na leitura: ${err.message}` });
        setTimeout(() => setNotification(null), 5000);
      } finally {
        setImporting(false);
        if (stockFileInputRef.current) stockFileInputRef.current.value = '';
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

  // Aplica de fato a importação de vendas já revisada: baixa estoque produto a produto,
  // grava a trilha de auditoria (stock_adjustments) e o registro da importação em si
  // (sales_imports/sales_import_items), incluindo as linhas não identificadas — para que
  // elas fiquem visíveis depois como "vendas não conciliadas" na Análise de Produtos.
  const applySalesImport = async () => {
    if (!pendingSalesImport || !salesImportSaleDate) return;
    if (pendingSalesImport.duplicateOf && !salesImportConfirmDuplicate) return;

    setIsApplyingSalesImport(true);
    try {
      // Agrega por produto — a mesma SKU pode aparecer em mais de uma linha da planilha.
      const byProduct = new Map<string, { productName: string; productCount: number; qty: number }>();
      for (const row of pendingSalesImport.matched) {
        const acc = byProduct.get(row.productId);
        if (acc) acc.qty += row.qty;
        else byProduct.set(row.productId, { productName: row.productName, productCount: row.productCount, qty: row.qty });
      }

      const { data: importRow, error: importError } = await supabase
        .from('sales_imports')
        .insert({
          file_name: pendingSalesImport.fileName,
          sale_date: salesImportSaleDate,
          row_count: pendingSalesImport.matched.length + pendingSalesImport.unmatched.length,
          matched_count: pendingSalesImport.matched.length,
          unmatched_count: pendingSalesImport.unmatched.length,
          status: 'applied',
          employee_id: colaboradorId || null,
          employee_name: colaboradorNome || null,
        })
        .select('id')
        .single();
      if (importError) throw importError;
      const importId = importRow.id;

      let errors = 0;
      for (const [productId, acc] of byProduct.entries()) {
        const previousCount = acc.productCount;
        const newCount = Math.max(0, previousCount - acc.qty);
        const { error: updateError } = await supabase
          .from('products')
          .update({ count: newCount, is_low: newCount < 5, status: newCount > 0 ? 'Em Estoque' : 'Fora de Estoque' })
          .eq('id', productId);
        if (updateError) { errors++; continue; }

        await supabase.from('stock_adjustments').insert({
          product_id: productId,
          previous_count: previousCount,
          new_count: newCount,
          delta: newCount - previousCount,
          reason: 'venda_diaria',
          note: `Importação de vendas: ${pendingSalesImport.fileName}`,
          source: 'sales_import',
          sales_import_id: importId,
          employee_id: colaboradorId || null,
          employee_name: colaboradorNome || null,
        });
      }

      const itemRows = [
        ...pendingSalesImport.matched.map(r => ({
          import_id: importId, product_id: r.productId, raw_sku: r.sku || null, raw_ean: r.ean || null,
          raw_description: r.description || null, quantity_sold: r.qty, matched: true,
        })),
        ...pendingSalesImport.unmatched.map(r => ({
          import_id: importId, product_id: null, raw_sku: r.sku || null, raw_ean: r.ean || null,
          raw_description: r.description || null, quantity_sold: r.qty, matched: false,
        })),
      ];
      if (itemRows.length > 0) await supabase.from('sales_import_items').insert(itemRows);

      setNotification({
        type: 'success',
        message: `Vendas importadas: ${byProduct.size} produtos com estoque atualizado.${pendingSalesImport.unmatched.length > 0 ? ` ${pendingSalesImport.unmatched.length} linha(s) não identificada(s) — não descontadas.` : ''}${errors > 0 ? ` (${errors} erros)` : ''}`,
      });
      setShowSalesImportReview(false);
      setPendingSalesImport(null);
      setSalesImportConfirmDuplicate(false);
      fetchProducts();
    } catch (err: any) {
      console.error('Erro ao aplicar importação de vendas:', err);
      setNotification({ type: 'error', message: err.message || 'Erro ao aplicar importação de vendas.' });
    } finally {
      setIsApplyingSalesImport(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const fetchMotherChildProductIds = async () => {
    const { data } = await supabase.from('product_mother_packages').select('child_product_id');
    setMotherChildProductIds(new Set((data || []).map((r: any) => r.child_product_id).filter(Boolean)));
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      // Supabase limita 1000 linhas por request — busca em páginas até trazer tudo
      const PAGE = 1000;
      let allData: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < PAGE) break; // última página
        from += PAGE;
      }

      // EANs adicionais (além do principal em products.ean) — usados para que
      // busca e matching automático reconheçam qualquer código do produto.
      const { data: extraEanData } = await supabase.from('product_ean_codes').select('product_id, ean, description');
      const extraEansByProduct = new Map<string, { ean: string; description: string | null }[]>();
      (extraEanData || []).forEach((r: any) => {
        const list = extraEansByProduct.get(r.product_id) || [];
        list.push({ ean: r.ean, description: r.description });
        extraEansByProduct.set(r.product_id, list);
      });

      // EANs de Produto Mãe (embalagem/caixa) — o EAN vive em product_mother_packages
      // (e variações em product_mother_package_ean_codes), vinculado ao produto filho
      // via child_product_id. Precisam entrar na busca para que o EAN da caixa
      // encontre o produto filho ao qual está vinculado. unitsPerChild viaja junto
      // para que o vínculo manual (confirmNoteItemLink) também converta qty/preço
      // pelo fator da embalagem, igual à importação automática (handleNoteImportExcel).
      const { data: motherPackagesData } = await supabase
        .from('product_mother_packages')
        .select('id, child_product_id, ean, name, units_per_child');
      const { data: motherEanCodesData } = await supabase
        .from('product_mother_package_ean_codes')
        .select('mother_package_id, ean, description');
      const motherPackageById = new Map<string, any>();
      (motherPackagesData || []).forEach((m: any) => {
        if (m.id) motherPackageById.set(m.id, m);
      });
      const motherEansByProduct = new Map<string, { ean: string; description: string | null; motherPackageId: string; motherPackageName: string | null; unitsPerChild: number }[]>();
      const addMotherEan = (childId: string | null | undefined, ean: string | null | undefined, mp: any, description: string | null = null) => {
        if (!childId || !ean || !ean.trim() || !mp) return;
        const list = motherEansByProduct.get(childId) || [];
        list.push({ ean, description, motherPackageId: mp.id, motherPackageName: mp.name || null, unitsPerChild: Number(mp.units_per_child) || 1 });
        motherEansByProduct.set(childId, list);
      };
      (motherPackagesData || []).forEach((m: any) => addMotherEan(m.child_product_id, m.ean, m));
      (motherEanCodesData || []).forEach((r: any) => {
        const mp = motherPackageById.get(r.mother_package_id);
        addMotherEan(mp?.child_product_id, r.ean, mp, r.description);
      });

      // Sempre mapeia, mesmo que vazio, para limpar dados estáticos se necessário
      const mappedData = allData.map((p: any) => {
        const extraEans = extraEansByProduct.get(p.id) || [];
        const motherEans = motherEansByProduct.get(p.id) || [];
        return {
          ...p,
          ean: p.ean || '',
          extraEans,
          motherEans,
          allEans: [p.ean, ...extraEans.map(e => e.ean), ...motherEans.map(e => e.ean)].filter((e): e is string => !!e && e.trim() !== ''),
          category: p.category || 'Geral',
          subcategory: p.subcategory || 'Geral',
          brand: p.brand || 'Geral',
          isFeatured: p.is_featured,
          isSide: p.is_side,
          isLow: p.is_low,
          internalCode: p.internal_code,
          createdAt: p.created_at,
          updatedAt: p.updated_at
        };
      });

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
      fetchMotherChildProductIds();
      fetchRequests();
      fetchReviewNotes();
      fetchNotifications();
      fetchBulkDrafts();
      fetchEanProblems();
    }
    colaboradorReadyRef.current = (async () => {
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr || !user) { console.error('[colaborador] sem usuário autenticado', userErr); return; }
        const { data: usuarioRow, error: usuarioErr } = await supabase
          .from('usuarios')
          .select('employee_id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (usuarioErr) { console.error('[colaborador] erro ao buscar usuarios', usuarioErr); return; }
        if (!usuarioRow?.employee_id) { console.error('[colaborador] usuário logado sem employee_id vinculado', user.id); return; }
        const { data: employee, error: employeeErr } = await supabase
          .from('hr_employees')
          .select('nome')
          .eq('id', usuarioRow.employee_id)
          .maybeSingle();
        if (employeeErr) { console.error('[colaborador] erro ao buscar hr_employees', employeeErr); return; }
        if (employee?.nome) {
          setColaboradorId(usuarioRow.employee_id);
          setColaboradorNome(employee.nome);
        } else {
          console.error('[colaborador] funcionário vinculado não encontrado', usuarioRow.employee_id);
        }
      } catch (err) {
        console.error('[colaborador] exceção ao resolver identidade', err);
      }
    })();
  }, []);

  // ── Scroll lock: prevent background scroll whenever any modal is open ──────
  useEffect(() => {
    const anyModalOpen = !!(
      viewingReviewNote ||
      showEstoqueLayoutPicker ||
      linkingItemIdx !== null
    );
    document.body.style.overflow = anyModalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [viewingReviewNote, showEstoqueLayoutPicker, linkingItemIdx]);

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
        status: n.status ?? (n.approved ? 'aprovada' : 'revisao'),
        noteNumber: n.note_number ?? undefined,
        accessKey: n.access_key ?? undefined,
        supplierName: n.supplier_name ?? undefined,
        supplierId: n.supplier_id ?? null,
        companyId: n.company_id ?? null,
        stockAppliedAt: n.stock_applied_at ?? null,
        stockAppliedCompanies: n.stock_applied_companies ?? [],
        lockedById: n.locked_by_id ?? null,
        lockedByName: n.locked_by_name ?? null,
        lockedAt: n.locked_at ?? null,
        receivedDate: n.received_date ?? undefined,
        orderDate: n.order_date ?? undefined,
        createdAt: n.created_at ?? undefined,
        finance_transaction_id: n.finance_transaction_id ?? null,
        distributionStatus: n.distribution_status ?? null,
        distributionSentAt: n.distribution_sent_at ?? null,
        distributionSentByName: n.distribution_sent_by_name ?? null,
        originalNfeXml: n.original_nfe_xml ?? null,
      })));
    }
  };

  const fetchBulkDrafts = async () => {
    const { data } = await supabase.from('review_notes').select('*')
      .eq('is_draft', true).eq('note_type', 'bulk_products')
      .order('created_at', { ascending: false });
    setBulkDrafts(data ?? []);
  };

  const fetchEanProblems = async () => {
    const { data } = await supabase.from('ean_problems').select('*').order('created_at', { ascending: false });
    setEanProblems(data ?? []);
  };

  const handleSaveBulkDraft = async (rows: any[], title: string) => {
    const eanToProductId = buildEanToProductId(products);

    const items = rows.filter((r: any) => r.name?.trim() || r.ean?.trim()).map((r: any, idx: number) => {
      const ean = r.ean?.trim() || null;
      const existingProductId = ean ? eanToProductId.get(ean) : undefined;
      return {
        seq: idx + 1,
        name: r.name?.trim() || '',
        sku: r.sku || null,
        ean,
        category: r.category || null,
        subcategory: r.subcategory || null,
        brand: r.brand || null,
        location: r.location || null,
        count: parseFloat(r.count) || 0,
        price: parseFloat(String(r.price).replace(',', '.')) || null,
        status: r.status || 'Em Estoque',
        ...(existingProductId ? { existingProductId } : {}),
      };
    });

    const { error } = await supabase.from('requests').insert([{
      product_id: null,
      requested_changes: JSON.stringify({
        is_bulk_products: true,
        title: title?.trim() || null,
        items,
        count: items.length,
      }),
      status: 'pending',
    }]);

    if (error) throw error;
    await fetchRequests();
    setNotification({ type: 'success', message: 'Rascunho salvo em Requisições!' });
  };

  const handleSendTask = async (task: TaskDraft) => {
    const { error } = await supabase.from('requests').insert([{
      product_id: null,
      requested_changes: JSON.stringify({
        is_task: true,
        task_type: task.task_type,
        responsavel: task.responsavel || null,
        classificacao: task.classificacao,
        observacao: task.observacao || null,
        items: task.items || [],
      }),
      status: 'pending',
    }]);
    if (error) throw error;
    await fetchRequests();
    setNotification({ type: 'success', message: 'Tarefa enviada para Requisições!' });
  };

  const handleSaveReviewProgress = async (rows: any[]) => {
    if (!bulkDraftUnderReview) return;
    const items = rows.map((r: any, idx: number) => ({
      seq: idx + 1,
      name: r.name?.trim() || '',
      sku: r.sku || null,
      ean: r.ean || null,
      category: r.category || null,
      subcategory: r.subcategory || null,
      brand: r.brand || null,
      location: r.location || null,
      count: parseFloat(r.count) || 0,
      price: parseFloat(String(r.price).replace(',', '.')) || null,
      status: r.status || 'Em Estoque',
      checked: r.checked ?? false,
    }));
    const { error } = await supabase.from('requests')
      .update({
        requested_changes: JSON.stringify({ is_bulk_products: true, items, count: items.length }),
      })
      .eq('id', bulkDraftUnderReview.id);
    if (error) throw error;
    setBulkDraftEditedItems(items);
    await fetchRequests();
    setNotification({ type: 'success', message: 'Revisão salva com sucesso!' });
  };

  const handleApproveBulkDraft = async (noteId: string, items: any[]) => {
    const results = await Promise.allSettled(
      items.map((item: any) => supabase.from('products').insert([{
        name: item.name, sku: item.sku || null, ean: item.ean || null,
        category: item.category || null, subcategory: item.subcategory || null,
        brand: item.brand || null, location: item.location || null,
        count: item.count || 0, price: item.price || null,
        status: item.status || 'Em Estoque',
      }]))
    );
    const saved = results.filter(r => r.status === 'fulfilled' && !(r as any).value?.error).length;
    const errors = results.length - saved;
    await supabase.from('review_notes').delete().eq('id', noteId);
    await fetchBulkDrafts();
    await fetchProducts();
    setNotification({ type: 'success', message: `${saved} produto(s) inserido(s)${errors > 0 ? ` · ${errors} com erro` : ''}` });
  };

  const handleDeleteBulkDraft = async (noteId: string) => {
    await supabase.from('review_notes').delete().eq('id', noteId);
    await fetchBulkDrafts();
    setNotification({ type: 'success', message: 'Rascunho excluído.' });
  };

  const handleReportEanProblem = async (ean: string, desc: string, obs: string, source?: string) => {
    await supabase.from('ean_problems').insert([{
      ean: ean.trim(), descricao: desc, observacao: obs || null, source: source || null,
    }]);
    await fetchEanProblems();
  };

  // Propaga preço de venda + quantidade recebida de uma nota aprovada para o Estoque & Preço
  // da Empresa vinculada à nota (product_company_stock). Se a empresa for a "padrão", também
  // espelha em products.price/count (grade, etiquetas e exportações continuam lendo só isso).
  // A quantidade só é somada UMA VEZ por nota (guarda: stock_applied_at) — resalvar/reaprovar
  // uma nota que já teve o estoque lançado não soma de novo; o preço pode ser resincronizado
  // sempre, pois é uma regra de "só avança se a data for mais recente", não um incremento.
  const applyNoteToCompanyStock = useCallback(async (note: ReviewNote) => {
    // Produtos marcados como Falta com "Produto não veio" (falta total) não devem ter preço/
    // estoque gravados na aprovação — eles nunca chegaram. O vínculo com o dicionário (botão
    // "Vincular") continua disponível normalmente, só não dispara essa gravação automática.
    const priceCandidates = (note.items || []).filter((item: any) => {
      if (!(item.product_id && item.product_price > 0)) return false;
      const d = item.discrepancy;
      if (d?.type === 'falta' && d.missingAll) return false;
      return true;
    });
    // Itens elegíveis para as empresas extras — cada empresa que aparece em
    // item.distribuicaoByCompany com quantidade > 0 (preço de venda, via pricingByCompany, é
    // opcional agora: distribuir não depende mais de já ter precificado — ver Etapa 6/plano de
    // Distribuição, decisão 3 do fluxo dentro da nota).
    const distributionCandidates = (note.items || []).filter((item: any) => {
      if (!item.product_id) return false;
      const d = item.discrepancy;
      if (d?.type === 'falta' && d.missingAll) return false;
      return true;
    });
    const itemDistribTotal = (item: any): number =>
      Object.values(item.distribuicaoByCompany || {}).reduce((acc: number, v: any) => acc + (Number(v) || 0), 0);
    const extraCompanyIds = Array.from(new Set(
      distributionCandidates.flatMap((item: any) => Object.keys(item.distribuicaoByCompany || {}))
    )).filter((cid) => cid && cid !== note.companyId);
    const hasExtraWork = extraCompanyIds.some((cid) =>
      distributionCandidates.some((item: any) => (Number(item.distribuicaoByCompany?.[cid]) || 0) > 0)
    );
    if (priceCandidates.length === 0 && !hasExtraWork) return;

    const noteReceivedDate = note.receivedDate || null;
    const companyId = note.companyId || null;
    const alreadyAppliedStock = !!note.stockAppliedAt;
    const productIds = Array.from(new Set(priceCandidates.map((item: any) => item.product_id)));

    if (companyId && priceCandidates.length > 0) {
      const { data: currentStockRows } = await supabase
        .from('product_company_stock')
        .select('product_id, count, price_received_date')
        .eq('company_id', companyId)
        .in('product_id', productIds);
      const stockByProduct: Record<string, { count: number; price_received_date: string | null }> = {};
      (currentStockRows || []).forEach((r: any) => { stockByProduct[r.product_id] = r; });

      const stockUpserts = priceCandidates
        .filter((item: any) => {
          const existingDate = stockByProduct[item.product_id]?.price_received_date || null;
          return !(noteReceivedDate && existingDate && existingDate > noteReceivedDate);
        })
        .map((item: any) => {
          // Decisão 2-C do plano de Distribuição: a dona só fica com o que sobrou depois de
          // distribuído — só vale para aprovações novas, já que notas já aprovadas nunca
          // reexecutam esta soma (guardadas por alreadyAppliedStock).
          const qty = alreadyAppliedStock ? 0 : Math.max(0, (parseFloat(item.qty) || 0) - itemDistribTotal(item));
          const nextCount = (stockByProduct[item.product_id]?.count || 0) + qty;
          return supabase.from('product_company_stock').upsert({
            product_id: item.product_id,
            company_id: companyId,
            count: nextCount,
            price: item.product_price,
            price_received_date: noteReceivedDate,
            // Custo por loja (Distribuição) — mesma trava de data do preço de venda acima,
            // sempre sobrescreve com o último custo recebido (ver Etapa 1/6 do plano de
            // Distribuição). Coluna separada de price_received_date por precaução, ainda que
            // hoje os dois sempre venham do mesmo evento de aprovação de nota.
            cost_price: item.price || 0,
            cost_received_date: noteReceivedDate,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'product_id,company_id' });
        });
      if (stockUpserts.length > 0) await Promise.all(stockUpserts);

      if (companyId === primaryCompanyId) {
        const { data: currentProducts } = await supabase.from('products').select('id, price_received_date, count').in('id', productIds);
        const productMeta: Record<string, { price_received_date: string | null; count: number }> = {};
        (currentProducts || []).forEach((p: any) => { productMeta[p.id] = p; });
        const productUpdates = priceCandidates
          .filter((item: any) => {
            const existingDate = productMeta[item.product_id]?.price_received_date || null;
            return !(noteReceivedDate && existingDate && existingDate > noteReceivedDate);
          })
          .map((item: any) => {
            const qty = alreadyAppliedStock ? 0 : Math.max(0, (parseFloat(item.qty) || 0) - itemDistribTotal(item));
            const nextCount = (productMeta[item.product_id]?.count || 0) + qty;
            const payload: any = { price: item.product_price, count: nextCount, is_low: nextCount < 5 };
            if (noteReceivedDate) payload.price_received_date = noteReceivedDate;
            return supabase.from('products').update(payload).eq('id', item.product_id);
          });
        if (productUpdates.length > 0) await Promise.all(productUpdates);
      }

      if (!alreadyAppliedStock) {
        const appliedAt = new Date().toISOString();
        await supabase.from('review_notes').update({ stock_applied_at: appliedAt }).eq('id', note.id);
        setReviewNotes(prev => prev.map(n => n.id === note.id ? { ...n, stockAppliedAt: appliedAt } : n));
        setViewingReviewNote(prev => (prev && prev.id === note.id) ? { ...prev, stockAppliedAt: appliedAt } : prev);
      }
    } else {
      // Legado: nota aprovada antes desta feature existir, sem Empresa vinculada — mantém o
      // comportamento antigo (só preço, sem somar estoque, pois não sabemos de qual loja é).
      let currentDatesById: Record<string, string | null> = {};
      if (noteReceivedDate) {
        const { data: currentProducts } = await supabase.from('products').select('id, price_received_date').in('id', productIds);
        (currentProducts || []).forEach((p: any) => { currentDatesById[p.id] = p.price_received_date; });
      }
      const priceUpdates = priceCandidates
        .filter((item: any) => {
          const existingDate = currentDatesById[item.product_id];
          return !(noteReceivedDate && existingDate && existingDate > noteReceivedDate);
        })
        .map((item: any) => {
          const payload: any = { price: item.product_price };
          if (noteReceivedDate) payload.price_received_date = noteReceivedDate;
          return supabase.from('products').update(payload).eq('id', item.product_id);
        });
      if (priceUpdates.length > 0) await Promise.all(priceUpdates);
    }

    // Empresas extras (não-donas) que receberam alguma quantidade via item.distribuicaoByCompany.
    // Preço de venda (pricingByCompany, opcional) é ressincronizado sempre que já preenchido
    // (regra "só avança se mais recente"); a quantidade distribuída só é somada UMA VEZ por
    // empresa (guarda: stockAppliedCompanies), igual à empresa dona.
    if (hasExtraWork) {
      const alreadyAppliedCompanies = new Set(note.stockAppliedCompanies || []);
      const newlyAppliedCompanies: string[] = [];
      for (const extraCompanyId of extraCompanyIds) {
        const extraCandidates = distributionCandidates.filter((item: any) => (Number(item.distribuicaoByCompany?.[extraCompanyId]) || 0) > 0);
        if (extraCandidates.length === 0) continue;
        const extraProductIds = Array.from(new Set(extraCandidates.map((item: any) => item.product_id)));
        const { data: currentExtraStockRows } = await supabase
          .from('product_company_stock')
          .select('product_id, count, price_received_date')
          .eq('company_id', extraCompanyId)
          .in('product_id', extraProductIds);
        const extraStockByProduct: Record<string, { count: number; price_received_date: string | null }> = {};
        (currentExtraStockRows || []).forEach((r: any) => { extraStockByProduct[r.product_id] = r; });

        const alreadyAppliedThisCompany = alreadyAppliedCompanies.has(extraCompanyId);
        const extraUpserts = extraCandidates
          .filter((item: any) => {
            const existingDate = extraStockByProduct[item.product_id]?.price_received_date || null;
            return !(noteReceivedDate && existingDate && existingDate > noteReceivedDate);
          })
          .map((item: any) => {
            const qty = alreadyAppliedThisCompany ? 0 : (Number(item.distribuicaoByCompany?.[extraCompanyId]) || 0);
            const nextCount = (extraStockByProduct[item.product_id]?.count || 0) + qty;
            // Preço de venda NÃO é mais sincronizado aqui — o mecanismo antigo (botão de preço /
            // pricingByCompany) foi removido da nota. Quem define o preço de venda da loja
            // destino agora é o próprio manifesto de Distribuição, ao confirmar o recebimento
            // (decisão 3-B) — ver updateItemPricing em DistributionManifestModal.tsx.
            const payload: any = {
              product_id: item.product_id,
              company_id: extraCompanyId,
              count: nextCount,
              // Custo por loja também propaga pra quem recebeu via distribuição — mesmo valor
              // usado no snapshot do manifesto (Etapa 6 do plano de Distribuição).
              cost_price: item.price || 0,
              cost_received_date: noteReceivedDate,
              updated_at: new Date().toISOString(),
            };
            return supabase.from('product_company_stock').upsert(payload, { onConflict: 'product_id,company_id' });
          });
        if (extraUpserts.length > 0) await Promise.all(extraUpserts);
        if (!alreadyAppliedThisCompany) newlyAppliedCompanies.push(extraCompanyId);
      }
      if (newlyAppliedCompanies.length > 0) {
        const nextStockAppliedCompanies = Array.from(new Set([...(note.stockAppliedCompanies || []), ...newlyAppliedCompanies]));
        await supabase.from('review_notes').update({ stock_applied_companies: nextStockAppliedCompanies }).eq('id', note.id);
        setReviewNotes(prev => prev.map(n => n.id === note.id ? { ...n, stockAppliedCompanies: nextStockAppliedCompanies } : n));
        setViewingReviewNote(prev => (prev && prev.id === note.id) ? { ...prev, stockAppliedCompanies: nextStockAppliedCompanies } : prev);
      }
    }

    fetchProducts();
  }, [primaryCompanyId]);

  useEffect(() => {
    fetchManufacturers();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('usuarios').select('role').eq('auth_user_id', user.id).maybeSingle();
      setCanManageManufacturers(data?.role === 'admin' || data?.role === 'gerente');
    })();
  }, []);

  const handleApproveNote = async (noteId: string) => {
    await supabase.from('review_notes').update({ approved: true, status: 'aprovada' }).eq('id', noteId);
    setReviewNotes(prev => prev.map(n => n.id === noteId ? { ...n, approved: true, status: 'aprovada' } : n));

    // Gera notificação de aprovação
    const note = reviewNotes.find(n => n.id === noteId);
    if (note) await applyNoteToCompanyStock(note);

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

  // Muda a Situação de Entrada da nota (Registro/Aguardando Recebimento/Revisão/Aprovada).
  // Usada pelos cards da aba Recebimento (desktop e mobile), sempre após confirmação do usuário.
  // Passa pelo mesmo upsert de persistNote (não um update solto) porque a nota pode ainda nem
  // existir no banco (criada mas nunca salva) e porque isso também grava qualquer edição pendente.
  const changeNoteStatus = async (noteId: string, status: NoteStatus) => {
    if (!viewingReviewNote || viewingReviewNote.id !== noteId) return;
    setSavingNoteStatus(true);
    try {
      await persistNote(status);
      setNotification({ type: 'success', message: `Situação alterada para "${STATUS_META[status].label}".` });
    } catch (err: any) {
      if (err.message === EMPRESA_REQUIRED_MSG) setNoteEditorTab('recebimento');
      setNotification({ type: 'error', message: err.message || 'Erro ao alterar situação da nota.' });
    } finally {
      setSavingNoteStatus(false);
      setStatusConfirmTarget(null);
    }
  };

  // Situação da Distribuição (Separação -> Distribuição Enviada) — independente da Situação
  // de Entrada, só liberada com a nota em Revisão. Ao enviar, agrupa item.distribuicaoByCompany
  // por loja de destino e cria 1 manifesto por loja (decisão 1-A do plano de Distribuição),
  // com os itens já com custo/venda de referência (Estoque & Preço da loja de origem).
  const handleSendDistribution = async () => {
    if (!viewingReviewNote) return;
    if (getNoteStatus(viewingReviewNote) !== 'revisao') {
      setNotification({ type: 'error', message: 'A nota precisa estar em Revisão para enviar a distribuição.' });
      return;
    }
    if (viewingReviewNote.distributionStatus === 'distribuicao_enviada') return;
    setSendingDistribution(true);
    try {
      // Garante que a distribuição (e qualquer outra edição pendente) já está salva antes
      // de gerar os manifestos a partir dela.
      await persistNote();
      const note = viewingReviewNote;
      const originCompanyId = note.companyId;
      if (!originCompanyId) throw new Error(EMPRESA_REQUIRED_MSG);

      // Preço Custo do manifesto vem do valor lançado na própria nota (mesma fórmula da
      // coluna "Preço Custo" da tabela de revisão), não do Estoque & Preço da origem — a
      // nota costuma ser enviada em Revisão, antes da aprovação que grava esse preço em
      // product_company_stock, então aquele valor ainda estaria zerado/desatualizado.
      const byCompany: Record<string, { productId: string; productName: string; sku: string | null; ean: string | null; qty: number; costPrice: number }[]> = {};
      note.items.forEach((item: any, idx: number) => {
        const dist = viewingNoteDistribByCompany[idx] ?? item.distribuicaoByCompany ?? {};
        Object.entries(dist).forEach(([companyId, qty]) => {
          const q = Number(qty) || 0;
          if (q <= 0 || !item.product_id) return;
          if (!byCompany[companyId]) byCompany[companyId] = [];
          const mult = (viewingNoteMultipliers[idx] ?? item.multiplier) || 1;
          const costPrice = (viewingNoteItemPrices[idx] ?? item.price ?? 0) / mult;
          byCompany[companyId].push({
            productId: item.product_id,
            productName: item.name || item.original_description || 'Produto',
            sku: (viewingNoteSkus[idx] ?? item.sku) || null,
            ean: (viewingNoteEans[idx] ?? item.ean) || null,
            qty: q,
            costPrice,
          });
        });
      });

      const destCompanyIds = Object.keys(byCompany);
      if (destCompanyIds.length === 0) {
        setNotification({ type: 'error', message: 'Nenhuma distribuição preenchida — adicione ao menos uma quantidade na coluna Distribuição antes de enviar.' });
        return;
      }

      // Preço de Venda de origem continua vindo do Estoque & Preço — é só referência (markup),
      // não afeta o Preço Custo/Valor Total do manifesto.
      const allProductIds = Array.from(new Set(Object.values(byCompany).flat().map(r => r.productId)));
      const { data: originStock } = await supabase
        .from('product_company_stock')
        .select('product_id, price')
        .eq('company_id', originCompanyId)
        .in('product_id', allProductIds);
      const stockByProduct: Record<string, { price: number }> = {};
      (originStock || []).forEach((r: any) => { stockByProduct[r.product_id] = { price: parseFloat(r.price) || 0 }; });

      const nowIso = new Date().toISOString();
      const shippingDate = note.receivedDate || nowIso.slice(0, 10);

      for (const destCompanyId of destCompanyIds) {
        // Manifestos originados de uma nota usam o nome do Fornecedor + sufixo sequencial
        // (ex. "Distribuidora ABC 01"), diferente do "DIST-000012" dos manifestos criados
        // manualmente na aba Distribuição — lá não há fornecedor associado.
        const { data: manifestNumber, error: rpcError } = await supabase.rpc('get_next_distribution_manifest_number_for_supplier', { p_supplier_name: note.supplierName || null });
        if (rpcError || !manifestNumber) throw new Error('Não foi possível gerar o número do manifesto.');
        const manifestId = crypto.randomUUID();
        const { error: manifestError } = await supabase.from('distribution_manifests').insert({
          id: manifestId,
          manifest_number: manifestNumber,
          origin_company_id: originCompanyId,
          destination_company_id: destCompanyId,
          status: 'pedido_enviado',
          shipping_date: shippingDate,
          created_by_id: colaboradorId || null,
          created_by_name: colaboradorNome || null,
          sent_by_id: colaboradorId || null,
          sent_by_name: colaboradorNome || null,
          sent_at: nowIso,
          source_note_id: note.id,
        });
        if (manifestError) throw manifestError;

        const itemsPayload = byCompany[destCompanyId].map(r => ({
          manifest_id: manifestId,
          product_id: r.productId,
          product_name: r.productName,
          sku: r.sku,
          ean: r.ean,
          qty: r.qty,
          cost_price: r.costPrice,
          sale_price_origin: stockByProduct[r.productId]?.price || 0,
        }));
        const { error: itemsError } = await supabase.from('distribution_manifest_items').insert(itemsPayload);
        if (itemsError) throw itemsError;
      }

      await supabase.from('review_notes').update({
        distribution_status: 'distribuicao_enviada',
        distribution_sent_at: nowIso,
        distribution_sent_by_id: colaboradorId || null,
        distribution_sent_by_name: colaboradorNome || null,
      }).eq('id', note.id);

      const updatedNote: ReviewNote = { ...note, distributionStatus: 'distribuicao_enviada', distributionSentAt: nowIso, distributionSentByName: colaboradorNome || null };
      setViewingReviewNote(updatedNote);
      setReviewNotes(prev => prev.map(n => n.id === note.id ? updatedNote : n));
      setNotification({ type: 'success', message: `Distribuição enviada — ${destCompanyIds.length} manifesto(s) criado(s).` });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao enviar distribuição.' });
    } finally {
      setSendingDistribution(false);
      setDistribSendConfirmOpen(false);
    }
  };

  const handleGoToNote = (noteId: string) => {
    setActiveTab('Entrada de Mercadoria');
    setPendingOpenNoteId(noteId);
    // Marca notificações daquela nota como lidas
    supabase.from('notifications').update({ read: true }).eq('note_id', noteId).eq('read', false);
    setAppNotifications(prev => prev.map(n => n.note_id === noteId ? { ...n, read: true } : n));
  };

  const handleGoToTransaction = (txId: string) => {
    setActiveTab('Controle Financeiro');
    setPendingFinanceTxId(txId);
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
      (type === 'ean' && (p.allEans || [p.ean]).includes(value))
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
          ean: newProductRequest.ean || '',
          extraEans: newProductRequestExtraEans.filter(e => e.ean.trim()),
          is_new_product: true,
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
        count: 0, price: 0, location: '', image: '', observation: '',
      });
      setNewProductRequestExtraEans([]);
      fetchRequests();
    } catch (err: any) {
      console.error('Erro ao salvar requisição:', err);
      setNotification({ type: 'error', message: err.message || 'Erro ao salvar requisição.' });
    } finally {
      setSavingRequest(false);
    }
  };

  const handleToggleCheck = async (requestId: string, checkedIndices: number[]) => {
    const request = requests.find(r => r.id === requestId);
    if (!request) return;
    try {
      const changes = JSON.parse(request.requested_changes || '{}');
      changes.checked_indices = checkedIndices;
      await supabase.from('requests').update({ requested_changes: JSON.stringify(changes) }).eq('id', requestId);
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, requested_changes: JSON.stringify(changes) } : r));
    } catch { /* ignora */ }
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
      const isBulkProducts = changes.is_bulk_products;
      const isNewProduct = changes.is_new_product && !isBulkProducts;

      if (isBulkProducts) {
        // Insert new products from bulk draft, or update existing ones when the EAN already exists
        const items = bulkDraftEditedItems.length > 0 ? bulkDraftEditedItems : (changes.items || []);
        const eanToProductId = buildEanToProductId(products);

        const isUpdate = items.map((item: any) => {
          const ean = item.ean?.trim();
          return !!(ean && eanToProductId.has(ean));
        });

        const results = await Promise.allSettled(
          items.map((item: any, i: number) => {
            const ean = item.ean?.trim() || null;
            const payload = {
              name: item.name,
              sku: item.sku || null,
              ean,
              category: item.category || null,
              subcategory: item.subcategory || null,
              brand: item.brand || null,
              location: item.location || null,
              count: item.count || 0,
              price: item.price || null,
              status: item.status || 'Em Estoque',
            };
            return isUpdate[i]
              ? supabase.from('products').update(payload).eq('id', eanToProductId.get(ean!))
              : supabase.from('products').insert([payload]);
          })
        );

        let created = 0, updated = 0, errors = 0;
        results.forEach((r, i) => {
          const ok = r.status === 'fulfilled' && !(r as any).value?.error;
          if (ok) { isUpdate[i] ? updated++ : created++; } else errors++;
        });
        const parts = [];
        if (created > 0) parts.push(`${created} cadastrado(s)`);
        if (updated > 0) parts.push(`${updated} atualizado(s)`);
        setNotification({ type: 'success', message: `${parts.join(' · ') || 'Nenhum produto processado'}${errors > 0 ? ` · ${errors} com erro` : ''}` });
        setBulkDraftEditedItems([]);
        setBulkDraftUnderReview(null);
      } else if (isNewProduct) {
        // Create new product
        const { is_new_product, observation, extraEans, ...productData } = changes;
        const { data: newProductData, error: insertError } = await supabase
          .from('products')
          .insert([{
            ...productData,
            status: 'Ativo'
          }])
          .select('id')
          .single();
        if (insertError) throw insertError;
        if (newProductData && Array.isArray(extraEans) && extraEans.length > 0) {
          const extraEanRows = extraEans
            .filter((e: any) => e.ean?.trim())
            .map((e: any) => ({ product_id: newProductData.id, ean: e.ean.trim(), description: e.description?.trim() || null }));
          if (extraEanRows.length > 0) {
            await supabase.from('product_ean_codes').insert(extraEanRows);
          }
        }
        setNotification({ type: 'success', message: 'Novo produto cadastrado com sucesso!' });
      } else if (changes.is_task) {
        // Tarefas não atualizam products — apenas o status da requisição é marcado como approved abaixo
        setNotification({ type: 'success', message: 'Tarefa aprovada com sucesso!' });
      } else if (changes.is_product_alteration) {
        // Registro de auditoria: o produto já foi atualizado no momento da edição.
        // Aqui só confirmamos a requisição, sem reaplicar updates no products.
        setNotification({ type: 'success', message: 'Alteração confirmada com sucesso!' });
      } else {
        // Update the product in Inventory
        const { error: updateError } = await supabase
          .from('products')
          .update(changes)
          .eq('id', request.product_id);
        if (updateError) throw updateError;
        setNotification({ type: 'success', message: 'Alteração aplicada com sucesso!' });
      }

      // Update request status
      const { error: requestError } = await supabase
        .from('requests')
        .update({ status: 'approved' })
        .eq('id', requestId);

      if (requestError) throw requestError;

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

  const handleBulkApproveRequests = async (requestIds: string[]) => {
    for (const id of requestIds) {
      await handleApproveRequest(id);
    }
  };

  const handleBulkDeleteRequests = async (requestIds: string[]) => {
    for (const id of requestIds) {
      await handleDeleteRequest(id);
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

    if (!newProduct.name) {
      setAddStatus('error');
      setAddError('Nome é obrigatório.');
      return;
    }

    try {
      setAdding(true);

      // Mescla a empresa em edição no momento com o que já foi preenchido para outras — o
      // que sobra em products.count/price é sempre o snapshot da empresa padrão (ver decisão
      // de escopo: grade/etiquetas/exportações continuam lendo só esses dois campos).
      const mergedStockByCompany: Record<string, { count: number; price: number }> = {
        ...newProductStockByCompany,
        ...(newProductCompanyId ? {
          [newProductCompanyId]: {
            count: isNaN(newProduct.count) ? 0 : newProduct.count,
            price: isNaN(newProduct.price) ? 0 : newProduct.price,
          },
        } : {}),
      };
      const primaryStock = (primaryCompanyId && mergedStockByCompany[primaryCompanyId]) || { count: 0, price: 0 };

      const selectedManufacturer = manufacturers.find(m => m.id === newProduct.manufacturerId) || null;
      const productToInsert = {
        sku: newProduct.sku?.trim() || null,
        name: newProduct.name,
        image: newProduct.image || '',
        status: newProduct.status,
        count: primaryStock.count,
        price: primaryStock.price,
        location: newProduct.location || 'Não atribuído',
        ean: newProduct.ean || '',
        category: newProduct.category || 'Geral',
        subcategory: newProduct.subcategory || 'Geral',
        // brand fica sincronizado com o nome do fabricante selecionado — mantém os ~40
        // pontos do app que ainda leem products.brand funcionando sem precisar mexer neles.
        brand: selectedManufacturer?.name || 'Geral',
        manufacturer_id: newProduct.manufacturerId,
        composicao: newProduct.composicao?.trim() || null,
        min_stock: newProduct.minStock,
        internal_code: newProduct.sku,
        is_featured: false,
        is_side: false,
        is_low: primaryStock.count < 5,
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

      const createdProductId = data?.[0]?.id;
      const extraEanRows = newProductExtraEans.filter(ei => ei.ean.trim()).map(ei => ({
        product_id: createdProductId,
        ean: ei.ean.trim(),
        description: ei.description.trim() || null,
      }));
      if (createdProductId && extraEanRows.length > 0) {
        await supabase.from('product_ean_codes').insert(extraEanRows);
      }

      // Grava Estoque & Preço de cada empresa preenchida durante o cadastro.
      if (createdProductId) {
        const stockRows = Object.entries(mergedStockByCompany).map(([companyId, stock]) => ({
          product_id: createdProductId,
          company_id: companyId,
          count: stock.count,
          price: stock.price,
        }));
        if (stockRows.length > 0) {
          await supabase.from('product_company_stock').insert(stockRows);
        }
      }

      console.log('Sucesso:', data);
      setNotification({ type: 'success', message: 'Produto adicionado com sucesso!' });
      
      // Limpa o formulário
      setNewProductPriceDisplay('');
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
        brand: '',
        manufacturerId: null,
        composicao: '',
        minStock: null,
      });
      setNewProductExtraEans([]);
      setNewProductCompanyId('');
      setNewProductStockByCompany({});

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
      const editCount = isNaN(editingProduct.count) ? 0 : editingProduct.count;
      const editPrice = isNaN(editingProduct.price) ? 0 : editingProduct.price;
      const editCostPrice = isNaN(editingProduct.costPrice) ? 0 : editingProduct.costPrice;
      const isPrimaryCompanySelected = !editProductCompanyId || editProductCompanyId === primaryCompanyId;

      const editedManufacturer = manufacturers.find(m => m.id === editingProduct.manufacturerId) || null;
      const productToUpdate = {
        sku: editingProduct.sku,
        name: editingProduct.name,
        image: editingProduct.image,
        status: editingProduct.status,
        // count/price em `products` só espelham a empresa padrão — grade, etiquetas e
        // exportações continuam lendo esses campos direto sem saber de Empresa.
        ...(isPrimaryCompanySelected ? { count: editCount, price: editPrice } : {}),
        location: editingProduct.location,
        ean: editingProduct.ean || '',
        category: editingProduct.category || '',
        subcategory: editingProduct.subcategory || '',
        brand: editedManufacturer?.name || '',
        manufacturer_id: editingProduct.manufacturerId,
        composicao: editingProduct.composicao?.trim() || null,
        min_stock: editingProduct.minStock === '' || editingProduct.minStock === undefined ? null : editingProduct.minStock,
        internal_code: editingProduct.sku,
        ...(isPrimaryCompanySelected ? { is_low: editCount < 5 } : {}),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('products')
        .update(productToUpdate)
        .eq('id', editingProduct.id);

      if (error) throw error;

      // Grava Estoque & Preço da empresa atualmente selecionada — sempre, mesmo quando não é a padrão.
      if (editProductCompanyId) {
        await supabase.from('product_company_stock').upsert({
          product_id: editingProduct.id,
          company_id: editProductCompanyId,
          count: editCount,
          price: editPrice,
          // Edição manual de custo sobrescreve direto e registra hoje como referência (ver
          // handleEditProductCompanyChange acima para a mesma regra na troca de empresa).
          cost_price: editCostPrice,
          cost_received_date: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'product_id,company_id' });
      }

      // Sincroniza EANs adicionais: remove os antigos e grava os atuais
      await supabase.from('product_ean_codes').delete().eq('product_id', editingProduct.id);
      const extraEanRows = editingProductExtraEans.filter(e => e.ean.trim()).map(e => ({
        product_id: editingProduct.id,
        ean: e.ean.trim(),
        description: e.description.trim() || null,
      }));
      if (extraEanRows.length > 0) {
        await supabase.from('product_ean_codes').insert(extraEanRows);
      }

      // Detectar campos alterados e criar requisição de auditoria
      if (originalProductSnapshot) {
        // price/count só entram na auditoria quando a empresa padrão está selecionada —
        // são os únicos casos em que esses campos realmente mudam em `products`.
        const TRACKED_FIELDS = [
          'name', 'sku', 'location', 'ean', 'category', 'subcategory', 'brand', 'status', 'min_stock',
          ...(isPrimaryCompanySelected ? ['price', 'count'] : []),
        ];
        const changedFields: string[] = [];
        const before: Record<string, any> = {};
        const after: Record<string, any> = {};

        for (const field of TRACKED_FIELDS) {
          const oldVal = String(originalProductSnapshot[field] ?? '');
          const newVal = String((productToUpdate as any)[field] ?? '');
          if (oldVal !== newVal) {
            changedFields.push(field);
            before[field] = originalProductSnapshot[field];
            after[field] = (productToUpdate as any)[field];
          }
        }

        if (changedFields.length > 0) {
          await supabase.from('requests').insert({
            product_id: editingProduct.id,
            requested_changes: JSON.stringify({
              is_product_alteration: true,
              product_name: productToUpdate.name,
              product_sku: productToUpdate.sku,
              changed_fields: changedFields,
              before,
              after,
            }),
            status: 'pending',
          });
        }
      }

      // Reflete as mudanças na nota aberta, se o produto editado estiver vinculado a algum item dela
      if (viewingReviewNote) {
        let touched = false;
        const updatedItems = viewingReviewNote.items.map((it: any) => {
          if (it.product_id !== editingProduct.id) return it;
          touched = true;
          return { ...it, name: productToUpdate.name, sku: productToUpdate.sku, ean: productToUpdate.ean };
        });
        if (touched) {
          setViewingReviewNote({ ...viewingReviewNote, items: updatedItems });
          setViewingNoteEans(prev => viewingReviewNote.items.map((it: any, i: number) => it.product_id === editingProduct.id ? productToUpdate.ean : (prev[i] ?? it.ean ?? '')));
          setViewingNoteSkus(prev => viewingReviewNote.items.map((it: any, i: number) => it.product_id === editingProduct.id ? productToUpdate.sku : (prev[i] ?? it.sku ?? '')));
        }
      }

      setNotification({ type: 'success', message: 'Produto atualizado com sucesso!' });
      setEditStatus('success');

      setTimeout(() => {
        setShowEditModal(false);
        setEditStatus('idle');
        fetchProducts();
        fetchRequests();
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
      }

      setNotification({ type: 'success', message: 'Entrada de mercadoria processada com sucesso!' });
      setNoteItems([]);
      fetchProducts();
    } catch (err: any) {
      console.error('Erro ao processar nota manual:', err);
      setNotification({ type: 'error', message: 'Erro ao processar entrada de mercadoria.' });
    } finally {
      setIsProcessingNote(false);
    }
  };

  const exportTranslatedToExcel = (items: any[], noteAdjColumns?: AdjColumn[]) => {
    // Soma TODAS as colunas de Desconto/Acréscimo criadas na nota (mesma lógica da tabela de
    // revisão, calcAdjAmounts) — antes só a primeira coluna de cada tipo entrava na planilha.
    const calcAdjCost = (cost: number, idx: number) => {
      if (!noteAdjColumns || noteAdjColumns.length === 0) return cost;
      const qty = items[idx]?.qty || 1;
      const { disc, sur } = calcAdjAmounts(cost, qty, idx, noteAdjColumns);
      return cost - disc + sur;
    };

    const ws = XLSX.utils.json_to_sheet(items.map((item, idx) => {
      // Mesma fonte de verdade da tabela de revisão: item.qty já é a quantidade
      // final (pós-conversão de unidade), independente do item estar verificado.
      const displayQty = item.qty || 0;
      const rawCost = (item.price || 0) / (item.multiplier || 1);
      const adjCost = calcAdjCost(rawCost, idx);
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

  // Gera uma NFe corrigida a partir do XML original autorizado (SEFAZ), usado como template —
  // só sobrescreve, por item (casado por EAN e, na falta, por código do fornecedor/cProd):
  //   • Medida/Quantidade traduzidas na revisão (item.unit / item.qty)
  //   • Quantidade menos o que foi distribuído para outras lojas (getDistribTotal)
  //   • Preço Un./Total já com todos os Acréscimos/Descontos da nota embutidos (calcAdjAmounts)
  // Tudo mais (chave de acesso, CFOP, NCM, emit/dest, protocolo) fica intacto. A assinatura
  // digital é removida — deixa de bater com o conteúdo assim que qualquer valor muda.
  const buildCorrectedNfeXml = (originalXmlText: string, items: any[], noteAdjColumns: AdjColumn[]): string => {
    const doc = new DOMParser().parseFromString(originalXmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('XML original inválido ou corrompido — não foi possível ler.');
    }
    const NFE_NS = 'http://www.portalfiscal.inf.br/nfe';
    const firstChild = (el: Element, tag: string): Element | null => {
      const found = el.getElementsByTagNameNS(NFE_NS, tag);
      return found.length > 0 ? found[0] : null;
    };
    const setText = (el: Element, tag: string, value: string) => {
      const node = firstChild(el, tag);
      if (node) node.textContent = value;
    };
    const getNum = (el: Element, tag: string): number => parseFloat(firstChild(el, tag)?.textContent || '0') || 0;

    const dets = Array.from(doc.getElementsByTagNameNS(NFE_NS, 'det'));
    if (dets.length === 0) throw new Error('XML original não parece ser uma NFe (nenhum item <det> encontrado).');

    // O casamento por EAN/SKU entre o XML original e a nota revisada é pouco confiável (códigos
    // de fornecedor divergem, EAN pode faltar), então em vez de tentar abater item a item,
    // substituímos a lista de <det> inteira: removemos todos os itens originais e recriamos um
    // <det> para cada item da nota revisada (clonando o primeiro como modelo, para manter a
    // estrutura de impostos exigida pelo schema — os dados fiscais desse bloco clonado são um
    // placeholder, já que não temos os dados fiscais reais de itens que não vieram na NF original).
    let vProdOriginalTotal = 0;
    dets.forEach(det => {
      const prod = firstChild(det, 'prod');
      if (prod) vProdOriginalTotal += getNum(prod, 'vProd');
    });

    const template = dets[0].cloneNode(true) as Element;
    const parent = dets[0].parentNode;
    const anchor = dets[dets.length - 1].nextSibling;
    dets.forEach(det => det.parentNode?.removeChild(det));

    let vProdNovoTotal = 0;
    let nItem = 0;
    let lastInserted: Node | null = null;

    items.forEach((item: any, idx: number) => {
      const rawCost = (item.price || 0) / (item.multiplier || 1);
      const { disc, sur } = calcAdjAmounts(rawCost, item.qty || 1, idx, noteAdjColumns || []);
      const adjCost = rawCost - disc + sur;
      const distribTotal = getDistribTotal(idx, item);
      const finalQty = Math.max(0, (item.qty || 0) - distribTotal);
      if (finalQty <= 0) return;
      const finalVProd = adjCost * finalQty;
      vProdNovoTotal += finalVProd;

      const newDet = template.cloneNode(true) as Element;
      nItem += 1;
      newDet.setAttribute('nItem', String(nItem));
      const prod = firstChild(newDet, 'prod');
      if (prod) {
        setText(prod, 'cProd', item.sku || item.supplier_code || `ITEM${nItem}`);
        setText(prod, 'cEAN', item.ean || 'SEM GTIN');
        setText(prod, 'cEANTrib', item.ean || 'SEM GTIN');
        setText(prod, 'xProd', item.name || item.original_description || 'Produto');
        setText(prod, 'qCom', finalQty.toFixed(4));
        setText(prod, 'qTrib', finalQty.toFixed(4));
        setText(prod, 'vUnCom', adjCost.toFixed(10));
        setText(prod, 'vUnTrib', adjCost.toFixed(10));
        setText(prod, 'vProd', finalVProd.toFixed(2));
        if (item.unit) {
          setText(prod, 'uCom', item.unit);
          setText(prod, 'uTrib', item.unit);
        }
      }
      parent?.insertBefore(newDet, lastInserted ? lastInserted.nextSibling : anchor);
      lastInserted = newDet;
    });

    // Totais (total/ICMSTot e cobr/fat) recalculados por diferença — preserva frete/desconto/
    // outros valores já corretos no XML original sem precisar reproduzir a fórmula da NFe inteira.
    const delta = vProdNovoTotal - vProdOriginalTotal;
    const icmsTot = doc.getElementsByTagNameNS(NFE_NS, 'ICMSTot')[0];
    if (icmsTot) {
      setText(icmsTot, 'vProd', vProdNovoTotal.toFixed(2));
      setText(icmsTot, 'vNF', (getNum(icmsTot, 'vNF') + delta).toFixed(2));
    }
    const fat = doc.getElementsByTagNameNS(NFE_NS, 'fat')[0];
    if (fat) {
      setText(fat, 'vOrig', (getNum(fat, 'vOrig') + delta).toFixed(2));
      setText(fat, 'vLiq', (getNum(fat, 'vLiq') + delta).toFixed(2));
    }
    // Parcelas (cobr/dup) e forma de pagamento (pag/detPag) não são redistribuídas — ficam
    // como no XML original, fora do escopo desta correção (é dado financeiro, não de estoque).

    const signature = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
    signature?.parentNode?.removeChild(signature);

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(doc);
  };

  const downloadCorrectedNfeXml = () => {
    if (!viewingReviewNote) return;
    if (!viewingReviewNote.originalNfeXml) {
      setNotification({ type: 'error', message: 'Anexe o XML original da nota na aba "Nota Original" antes de baixar.' });
      setNoteEditorTab('nota_original');
      return;
    }
    try {
      const items = viewingReviewNote.items.map((item: any, idx: number) => ({
        ...item,
        qty: viewingNoteQtys[idx] ?? item.qty,
        unit: viewingNoteUnits[idx] ?? item.unit,
        multiplier: viewingNoteMultipliers[idx] ?? item.multiplier,
        price: viewingNoteItemPrices[idx] ?? item.price,
      }));
      const xml = buildCorrectedNfeXml(viewingReviewNote.originalNfeXml, items, adjColumns);
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nota_${viewingReviewNote.noteNumber || viewingReviewNote.id}_corrigida.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao gerar XML corrigido.' });
    }
  };

  const handleAttachOriginalNfeXml = async (file: File) => {
    if (!viewingReviewNote) return;
    try {
      const text = await file.text();
      if (!text.includes('infNFe')) {
        setNotification({ type: 'error', message: 'Esse arquivo não parece ser o XML de uma NFe (falta a tag infNFe).' });
        return;
      }
      setViewingReviewNote({ ...viewingReviewNote, originalNfeXml: text });
      setNotification({ type: 'success', message: 'XML original anexado — clique em Salvar para gravar na nota.' });
    } catch {
      setNotification({ type: 'error', message: 'Não foi possível ler o arquivo selecionado.' });
    }
  };

  const generateBarcodeDataUrl = (code: string): string => {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, code, { format: 'CODE128', displayValue: false, width: 1.5, height: 50, margin: 0 });
    return canvas.toDataURL('image/png');
  };

  const exportTranslatedToPDF = (items: any[], noteAdjColumns?: AdjColumn[], meta?: { supplierName?: string; noteNumber?: string; accessKey?: string }) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const formatCurrency = (val: number) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    // Soma TODAS as colunas de Desconto/Acréscimo criadas na nota (mesma lógica da tabela de
    // revisão, calcAdjAmounts) — antes só a primeira coluna de cada tipo entrava no PDF.
    const calcCost = (cost: number, idx: number) => {
      if (!noteAdjColumns || noteAdjColumns.length === 0) return cost;
      const qty = items[idx]?.qty || 1;
      const { disc, sur } = calcAdjAmounts(cost, qty, idx, noteAdjColumns);
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
      // Mesma fonte de verdade da tabela de revisão: item.qty já é a quantidade
      // final (pós-conversão de unidade), independente do item estar verificado.
      const displayQty = item.qty || 0;
      const rawCost = (item.price || 0) / (item.multiplier || 1);
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

  const exportEstoqueToA4PDF = (items: any[], noteAdjColumns?: AdjColumn[],
  meta?: { supplierName?: string; noteNumber?: string; accessKey?: string },
  layout?: { preset: 'financeiro' | 'estoque' | 'personalizado'; customCols?: string[] }
  ) => {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
    const fmtCur = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    const fmtNum = (v: number) => new Intl.NumberFormat('pt-BR').format(Math.round(v));

    // Soma TODAS as colunas de Desconto/Acréscimo criadas na nota (mesma lógica da tabela de
    // revisão, calcAdjAmounts) — antes só a primeira coluna de cada tipo entrava no PDF.
    const calcAdj = (cost: number, idx: number) => {
      if (!noteAdjColumns || noteAdjColumns.length === 0) return { disc: 0, sur: 0 };
      const qty = items[idx]?.qty || 1;
      return calcAdjAmounts(cost, qty, idx, noteAdjColumns);
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
      colAmounts: Record<string, number>;
    }
    const rows: RowData[] = items.map((item, idx) => {
      // Mesma fonte de verdade da tabela de revisão: item.qty já é a quantidade
      // final (pós-conversão de unidade), independente do item estar verificado.
      // Itens com divergência de "Falta" têm a quantidade abatida (ou zerada, se
      // "Produto não veio") antes de entrar nos totais/markup do relatório.
      const qty    = getEffectiveQty(item.qty || 0, (item as any).discrepancy ?? null);
      const raw    = (item.price || 0) / (item.multiplier || 1);
      const { disc, sur } = calcAdj(raw, idx);
      const adj2   = raw - disc + sur;
      const pvenda = item.product_price ?? 0;
      const distrib = item.distribuicao !== null && item.distribuicao !== undefined ? Number(item.distribuicao) : null;
      // Valor de cada coluna de Desconto/Acréscimo individualmente — usado quando o preset
      // "Personalizado" tem colunas específicas selecionadas (não só o agregado disc/sur).
      const colAmounts: Record<string, number> = {};
      (noteAdjColumns || []).forEach(col => { colAmounts[col.id] = calcAdjColAmount(col, raw, qty, idx); });
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
        colAmounts,
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
      // Colunas de Desconto/Acréscimo criadas na nota entram com a chave "adjcol:<id>",
      // uma por coluna que o usuário de fato criou (não um "Desconto"/"Acréscimo" genérico).
      const rawCols: ColSpec[] = keys.map(k => {
        if (k.startsWith('adjcol:')) {
          const adjCol = (noteAdjColumns || []).find(c => c.id === k.slice('adjcol:'.length));
          return { key: k, header: adjCol?.name || 'Ajuste', width: 20, halign: 'right' as const };
        }
        return { key: k, ...(COL_META[k] ?? { header: k, width: 20 }) };
      });
      const totalW = rawCols.reduce((s, c) => s + c.width, 0);
      cols = totalW > 0 ? rawCols.map(c => ({ ...c, width: Math.round(c.width / totalW * usableW) })) : rawCols;
    }

    // ── Cell value accessor ───────────────────────────────────────────────
    const getVal = (row: RowData, key: string): string => {
      if (key.startsWith('adjcol:')) {
        const colId = key.slice('adjcol:'.length);
        const adjCol = (noteAdjColumns || []).find(c => c.id === colId);
        const amt = row.colAmounts[colId] || 0;
        if (amt <= 0) return '—';
        return `${adjCol?.kind === 'desconto' ? '−' : '+'}${fmtCur(amt)}`;
      }
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
      if (c.key.startsWith('adjcol:')) {
        const colId = c.key.slice('adjcol:'.length);
        const adjCol = (noteAdjColumns || []).find(x => x.id === colId);
        const sum = rows.reduce((s, r) => s + (r.colAmounts[colId] || 0), 0);
        return sum > 0 ? `${adjCol?.kind === 'desconto' ? '−' : '+'}${fmtCur(sum)}` : '';
      }
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

  const downloadSalesImportTemplate = () => {
    const templateData = [
      { 'SKU': 'SKU-999', 'EAN': '7891234567890', 'Descrição': 'EXEMPLO PRODUTO A', 'Quantidade Vendida': 10 },
      { 'SKU': '', 'EAN': '7899999999999', 'Descrição': 'EXEMPLO PRODUTO B', 'Quantidade Vendida': 3 },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo de Vendas");
    XLSX.writeFile(wb, "modelo_vendas_do_dia.xlsx");
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

        updatedCount++;
      }

      const nfSupplierName = supplierNames.find((s: any) => s.id === selectedImportSupplierId)?.name || '';
      const itemsWithFinalPrices = getPendingNfExportItems();
      const newNote: ReviewNote = {
        id: Date.now().toString(),
        timestamp: currentNfTimestamp,
        createdAt: new Date().toISOString(),
        fileName: currentNfFileName,
        items: itemsWithFinalPrices,
        itemCount: pendingNfItems.length,
        verifiedCount: pendingNfItems.filter((i: any) => i.verified).length,
        noteNumber: nfNoteNumber || undefined,
        accessKey: nfAccessKey || undefined,
        supplierName: nfSupplierName || undefined,
        supplierId: selectedImportSupplierId || null,
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
        supplier_id: selectedImportSupplierId || null,
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
      setNfDistribMode([]);
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
      // Mesmo tratamento de "Adicionar medida": divide o preço pelo multiplicador e reseta pra 1,
      // senão a célula de Preço Custo (ligada direto ao preço bruto) fica com o valor antigo na tela.
      const currentPrice = viewingNoteItemPrices[idx] ?? item.price ?? 0;
      const unitPrice = parseFloat((currentPrice / mult).toFixed(6));
      const u = [...viewingNoteUnits]; u[idx] = conv.unit_name; setViewingNoteUnits(u);
      const p = [...viewingNoteItemPrices]; p[idx] = unitPrice; setViewingNoteItemPrices(p);
      const m = [...viewingNoteMultipliers]; m[idx] = 1; setViewingNoteMultipliers(m);
      const q = [...viewingNoteQtys]; q[idx] = newQty; setViewingNoteQtys(q);
      const c = [...viewingNoteMeasureConverted]; c[idx] = true; setViewingNoteMeasureConverted(c);
      setNotification({ type: 'success', message: `Tradução aplicada: ×${mult}` });
    } catch {
      setNotification({ type: 'error', message: 'Erro ao buscar traduções.' });
    } finally {
      setReviewLoadingUnitIdx(null);
    }
  };

  // ── Undo / Redo ─────────────────────────────────────────────────────────────
  const captureSnapshot = useCallback(() => {
    if (!viewingReviewNote) return;
    const snap = {
      viewingReviewNote: JSON.parse(JSON.stringify(viewingReviewNote)),
      viewingNoteEans: [...viewingNoteEans],
      viewingNoteSkus: [...viewingNoteSkus],
      viewingNoteQtys: [...viewingNoteQtys],
      viewingNoteItemPrices: [...viewingNoteItemPrices],
      viewingNoteUnits: [...viewingNoteUnits],
      viewingNoteMultipliers: [...viewingNoteMultipliers],
      viewingNoteMeasureConverted: [...viewingNoteMeasureConverted],
      viewingNoteDistribuicao: [...viewingNoteDistribuicao],
      viewingNoteDistribByCompany: viewingNoteDistribByCompany.map(m => ({ ...m })),
      viewingNoteSellPrices: [...viewingNoteSellPrices],
      viewingNoteVerified: [...viewingNoteVerified],
      viewingNoteReviewTimestamps: [...viewingNoteReviewTimestamps],
      viewingNoteDiscrepancies: [...viewingNoteDiscrepancies],
      adjColumns: adjColumns.map(c => ({ ...c, items: [...c.items] })),
    };
    const newStack = noteHistoryRef.current.slice(0, noteHistoryIdxRef.current + 1);
    newStack.push(snap);
    if (newStack.length > 50) newStack.shift();
    noteHistoryRef.current = newStack;
    noteHistoryIdxRef.current = newStack.length - 1;
    setCanUndo(noteHistoryIdxRef.current > 0);
    setCanRedo(false);
  }, [viewingReviewNote, viewingNoteEans, viewingNoteSkus, viewingNoteQtys, viewingNoteItemPrices, viewingNoteUnits, viewingNoteMultipliers, viewingNoteMeasureConverted, viewingNoteDistribuicao, viewingNoteDistribByCompany, viewingNoteSellPrices, viewingNoteVerified, viewingNoteReviewTimestamps, viewingNoteDiscrepancies, adjColumns]);

  const applySnapshot = useCallback((snap: any) => {
    setViewingReviewNote(snap.viewingReviewNote);
    setViewingNoteEans(snap.viewingNoteEans);
    setViewingNoteSkus(snap.viewingNoteSkus);
    setViewingNoteQtys(snap.viewingNoteQtys);
    setViewingNoteItemPrices(snap.viewingNoteItemPrices);
    setViewingNoteUnits(snap.viewingNoteUnits);
    setViewingNoteMultipliers(snap.viewingNoteMultipliers);
    setViewingNoteMeasureConverted(snap.viewingNoteMeasureConverted ?? []);
    setViewingNoteDistribuicao(snap.viewingNoteDistribuicao);
    setViewingNoteDistribByCompany(snap.viewingNoteDistribByCompany ?? []);
    setViewingDistribMode([]); // Presets não participam do undo/redo
    setViewingNoteSellPrices(snap.viewingNoteSellPrices);
    setViewingNoteVerified(snap.viewingNoteVerified);
    setViewingNoteReviewTimestamps(snap.viewingNoteReviewTimestamps);
    setViewingNoteDiscrepancies(snap.viewingNoteDiscrepancies);
    setAdjColumns(snap.adjColumns ?? []);
  }, []);

  const handleUndo = useCallback(() => {
    if (noteHistoryIdxRef.current <= 0) return;
    noteHistoryIdxRef.current -= 1;
    applySnapshot(noteHistoryRef.current[noteHistoryIdxRef.current]);
    setCanUndo(noteHistoryIdxRef.current > 0);
    setCanRedo(true);
  }, [applySnapshot]);

  const handleRedo = useCallback(() => {
    if (noteHistoryIdxRef.current >= noteHistoryRef.current.length - 1) return;
    noteHistoryIdxRef.current += 1;
    applySnapshot(noteHistoryRef.current[noteHistoryIdxRef.current]);
    setCanUndo(true);
    setCanRedo(noteHistoryIdxRef.current < noteHistoryRef.current.length - 1);
  }, [applySnapshot]);

  const resetNoteHistory = useCallback(() => {
    noteHistoryRef.current = [];
    noteHistoryIdxRef.current = -1;
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  // Carrega os states de edição de uma nota de revisão a partir do objeto ReviewNote — extraído
  // para ser reutilizado tanto ao abrir uma nota pela lista de Entrada de Mercadoria (desktop e
  // mobile) quanto pelo atalho "Ver nota" no histórico de EAN da aba Editar Produto.
  const openReviewNoteForEditing = useCallback((note: ReviewNote) => {
    fetchProducts(); // Garante dados de produtos atualizados ao abrir nota (sync multi-usuário)
    if (supplierNames.length === 0) fetchSuppliers();
    if (companies.length === 0) fetchCompanies();
    setViewingReviewNote(note);
    setNoteEditorTab('produtos');
    setStatusConfirmTarget(null);
    setViewingPriceCompanyId(null);
    setPriceCompanyDropdownOpen(false);
    setViewingNoteExtraPricing({});
    setNoteLockBlockedBy(null);
    setNoteSupplierQuery(note.supplierName || '');
    setNoteSupplierOpen(false);
    setViewingNoteSellPrices(note.items.map((item: any) => item.product_price || 0));
    setViewingNoteVerified(note.items.map((item: any) => item.verified || false));
    setViewingNoteEans([]);
    setViewingNoteSkus([]);
    setViewingNoteQtys([]);
    setViewingNoteEanVariants(note.items.map((item: any) => (item.eanVariants as EanVariant[]) ?? []));
    setViewingNoteExtraEans(note.items.map((item: any) => (item.extraEans as EanCodeEntry[]) ?? []));
    setViewingNoteItemPrices(note.items.map((item: any) => item.price || 0));
    setViewingNoteDistribuicao(note.items.map((item: any) => item.distribuicao !== null && item.distribuicao !== undefined ? String(item.distribuicao) : ''));
    setViewingDistribMode([]);
    setViewingNoteDistribByCompany(note.items.map((item: any) => item.distribuicaoByCompany || {}));
    setViewingNoteUnits(note.items.map((item: any) => item.unit || ''));
    setViewingNoteMultipliers(note.items.map((item: any) => item.multiplier || 1));
    setViewingNoteMeasureConverted(note.items.map((item: any) => !!item.measureConverted));
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
    let loadedCols: AdjColumn[] = [];
    if (Array.isArray(fi?.adj_columns_full) && fi.adj_columns_full.length > 0) {
      loadedCols = fi.adj_columns_full as AdjColumn[];
    } else {
      const savedDiscountMode: AdjMode = fi?.adj_discount_mode ?? 'none';
      if (savedDiscountMode === 'geral' && fi?.adj_discount_applied) {
        loadedCols.push({ id: 'legacy-disc', name: 'Desconto', kind: 'desconto', mode: 'geral', geralValue: fi.adj_discount_applied.value, geralType: fi.adj_discount_applied.type, individualType: 'pct', items: [] });
      } else if (savedDiscountMode === 'individual') {
        loadedCols.push({ id: 'legacy-disc', name: 'Desconto', kind: 'desconto', mode: 'individual', geralValue: 0, geralType: 'pct', individualType: fi?.adj_discount_individual_type ?? 'pct', items: note.items.map((it: any) => it.adj_discount_value != null ? String(it.adj_discount_value) : '') });
      }
      const savedSurchargeMode: AdjMode = fi?.adj_surcharge_mode ?? 'none';
      if (savedSurchargeMode === 'geral' && fi?.adj_surcharge_applied) {
        loadedCols.push({ id: 'legacy-sur', name: 'Acréscimo', kind: 'acrescimo', mode: 'geral', geralValue: fi.adj_surcharge_applied.value, geralType: fi.adj_surcharge_applied.type, individualType: 'pct', items: [] });
      } else if (savedSurchargeMode === 'individual') {
        loadedCols.push({ id: 'legacy-sur', name: 'Acréscimo', kind: 'acrescimo', mode: 'individual', geralValue: 0, geralType: 'pct', individualType: fi?.adj_surcharge_individual_type ?? 'pct', items: note.items.map((it: any) => it.adj_surcharge_value != null ? String(it.adj_surcharge_value) : '') });
      }
    }
    setAdjColumns(loadedCols);
    setAdjColDialog(null);
    resetNoteHistory();
    const measureProductIds = Array.from(new Set(note.items.map((it: any) => it.product_id).filter(Boolean)));
    if (measureProductIds.length > 0) {
      supabase.from('supplier_units')
        .select('product_id')
        .in('product_id', measureProductIds)
        .then(({ data }) => setProductsWithMeasureTranslation(new Set((data || []).map((r: any) => String(r.product_id)))));
    } else {
      setProductsWithMeasureTranslation(new Set());
    }
    const sidForNote = note.supplierId || supplierNames.find((s: any) => s.name === note.supplierName || s.nome_fantasia?.trim() === note.supplierName)?.id;
    if (sidForNote) {
      supabase.from('supplier_mappings')
        .select('supplier_sku, supplier_description, internal_product_id')
        .eq('supplier_id', sidForNote)
        .then(({ data }) => setNoteSupplierMappings(data || []));
    } else {
      setNoteSupplierMappings([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierNames]);

  const formatRelativeTime = (iso: string | null): string => {
    if (!iso) return 'agora';
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins <= 0) return 'agora mesmo';
    if (mins === 1) return 'há 1 minuto';
    if (mins < 60) return `há ${mins} minutos`;
    const hours = Math.round(mins / 60);
    return hours === 1 ? 'há 1 hora' : `há ${hours} horas`;
  };

  // Tenta travar a nota pra mim (colaborador atual) antes de abrir pra edição. Notas novas
  // (criadas em memória, ainda sem linha no banco) não precisam de lock — ninguém mais tem
  // esse id ainda. Pra notas existentes, um único UPDATE condicional é atômico no Postgres:
  // só "ganha" o lock quem chegar primeiro, mesmo que dois cliques aconteçam ao mesmo tempo.
  const openReviewNoteWithLock = useCallback(async (note: ReviewNote, onOpened?: () => void) => {
    if (colaboradorReadyRef.current) await colaboradorReadyRef.current;
    const isExisting = reviewNotes.some(n => n.id === note.id);
    if (!isExisting || !colaboradorId) {
      openReviewNoteForEditing(note);
      onOpened?.();
      return;
    }
    setCheckingNoteLock(true);
    try {
      const ttlCutoff = new Date(Date.now() - NOTE_LOCK_TTL_MS).toISOString();
      const { data: claimed } = await supabase
        .from('review_notes')
        .update({ locked_by_id: colaboradorId, locked_by_name: colaboradorNome, locked_at: new Date().toISOString() })
        .eq('id', note.id)
        .or(`locked_at.is.null,locked_at.lt.${ttlCutoff},locked_by_id.eq.${colaboradorId}`)
        .select('id')
        .maybeSingle();
      if (claimed) {
        openReviewNoteForEditing(note);
      } else {
        // Re-checa o dono atual do lock antes de bloquear — se a leitura falhar (RLS/rede
        // instável) ou o dono já for eu mesmo (lock meu que não foi pego pela condição acima
        // por alguma falha transitória), não é um conflito real: libera a edição em vez de
        // travar com um aviso genérico "outra pessoa" sem nome nenhum.
        const { data: fresh } = await supabase.from('review_notes').select('locked_by_id, locked_by_name, locked_at').eq('id', note.id).maybeSingle();
        // openReviewNoteForEditing reseta noteLockBlockedBy pra null (é o "estado limpo" de
        // abrir qualquer nota) — por isso o aviso de bloqueio precisa ser setado DEPOIS dela,
        // senão a própria função de abrir a nota apaga o aviso que acabamos de mostrar.
        openReviewNoteForEditing(note);
        if (fresh?.locked_by_id && fresh.locked_by_id !== colaboradorId) {
          setNoteLockBlockedBy({ name: fresh.locked_by_name || 'outra pessoa', at: fresh.locked_at || null });
        }
      }
      onOpened?.();
    } finally {
      setCheckingNoteLock(false);
    }
  }, [reviewNotes, colaboradorId, colaboradorNome, openReviewNoteForEditing]);

  // Reconsulta o lock da nota aberta (botão "Verificar novamente" no overlay de bloqueio).
  const recheckNoteLock = useCallback(async () => {
    if (!viewingReviewNote) return;
    const note = viewingReviewNote;
    setNoteLockBlockedBy(null);
    openReviewNoteWithLock(note);
  }, [viewingReviewNote, openReviewNoteWithLock]);

  // Libera meu lock nessa nota (fire-and-forget — não trava o fechamento da UI por causa disso).
  const releaseNoteLock = useCallback((noteId?: string) => {
    const id = noteId ?? viewingReviewNote?.id;
    if (!id || !colaboradorId) return;
    supabase.from('review_notes').update({ locked_by_id: null, locked_by_name: null, locked_at: null }).eq('id', id).eq('locked_by_id', colaboradorId).then(() => {});
  }, [viewingReviewNote, colaboradorId]);

  // Auto-sync distribuição na seção Revisões quando QTD muda e há preset ativo
  useEffect(() => {
    if (!nfDistribMode.some(m => m)) return;
    setNfItemDistribuicao(prev => {
      const next = [...prev];
      pendingNfItems.forEach((item: any, idx: number) => {
        const mode = nfDistribMode[idx];
        if (!mode) return;
        const qty = nfItemQtys[idx] ?? item.qty ?? 0;
        if (mode === 'inteiro')      next[idx] = String(qty);
        else if (mode === 'metade')  next[idx] = String(Math.floor(qty / 2));
        else if (mode === 'nada')    next[idx] = '0';
      });
      return next;
    });
  }, [nfItemQtys, nfDistribMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-sync distribuição na seção Aprovados quando QTD muda e há preset ativo
  useEffect(() => {
    if (!viewingReviewNote || !viewingDistribMode.some(m => m)) return;
    setViewingNoteDistribuicao(prev => {
      const next = [...prev];
      (viewingReviewNote.items as any[]).forEach((item: any, idx: number) => {
        const mode = viewingDistribMode[idx];
        if (!mode) return;
        const qty = viewingNoteQtys[idx] ?? item.qty ?? 0;
        if (mode === 'inteiro')      next[idx] = String(qty);
        else if (mode === 'metade')  next[idx] = String(Math.floor(qty / 2));
        else if (mode === 'nada')    next[idx] = '0';
      });
      return next;
    });
  }, [viewingNoteQtys, viewingDistribMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atalhos Ctrl+Z / Ctrl+Y enquanto nota estiver aberta
  useEffect(() => {
    if (!viewingReviewNote) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewingReviewNote, handleUndo, handleRedo]);
  // Resolve o supplier_id da nota aberta — usa ID direto da nota, ou cai em lookup por nome
  const resolveNoteSupplierId = useCallback(async (): Promise<string | null> => {
    // 1) Caminho ideal: ID já salvo na nota
    if (viewingReviewNote?.supplierId) return viewingReviewNote.supplierId;
    const name = viewingReviewNote?.supplierName;
    if (!name) return null;
    // Normaliza para comparação robusta (remove acentos, lowercase, trim)
    const normalize = (s: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().trim();
    const nameNorm = normalize(name);
    const matchSupplier = (s: any) =>
      s.name === name || s.nome_fantasia?.trim() === name ||
      normalize(s.name ?? '') === nameNorm || normalize(s.nome_fantasia ?? '') === nameNorm;
    // 2) Busca na memória
    const fromMemory = supplierNames.find(matchSupplier)?.id;
    if (fromMemory) return fromMemory;
    // 3) Fallback: carrega todos do banco e filtra em JS
    const { data } = await supabase.from('suppliers').select('id, name, nome_fantasia');
    const found = (data || []).find(matchSupplier);
    if (found) return found.id;
    // 4) Último recurso: ilike no banco
    const { data: ilikeData } = await supabase.from('suppliers').select('id').ilike('nome_fantasia', name).limit(1);
    if (ilikeData?.[0]?.id) return ilikeData[0].id;
    const { data: ilikeData2 } = await supabase.from('suppliers').select('id').ilike('name', name).limit(1);
    return ilikeData2?.[0]?.id ?? null;
  }, [viewingReviewNote, supplierNames]);

  // Retorna o mapeamento permanente de um item da nota, se existir
  const getItemMapping = useCallback((item: any) => {
    if (!noteSupplierMappings.length || !item) return null;
    return noteSupplierMappings.find(m =>
      (m.supplier_sku && item.supplier_code && m.supplier_sku === item.supplier_code) ||
      (m.supplier_description && item.original_description &&
       m.supplier_description.toLowerCase().trim() === item.original_description.toLowerCase().trim())
    ) || null;
  }, [noteSupplierMappings]);
  // ────────────────────────────────────────────────────────────────────────────

  const applyReviewMeasure = async (idx: number, unitName: string, multStr: string): Promise<boolean> => {
    if (!viewingReviewNote) return false;
    captureSnapshot();
    const mult = parseFloat(multStr);
    if (isNaN(mult) || mult <= 0) {
      setNotification({ type: 'error', message: 'Informe um multiplicador válido (maior que 0).' });
      return false;
    }
    setReviewSavingMeasure(true);
    try {
      const item = viewingReviewNote.items[idx];
      if (item.product_id) {
        await supabase.from('supplier_units').insert({
          product_id: item.product_id,
          unit_name: unitName.trim() || item.unit,
          multiplier: mult,
        });
        setProductsWithMeasureTranslation(prev => new Set(prev).add(String(item.product_id)));
      }
      const originalQty = item.original_qty ?? Math.round(item.qty / (item.multiplier || 1));
      const newQty = originalQty * mult;
      const u = [...viewingNoteUnits]; u[idx] = unitName.trim() || item.unit || 'UN'; setViewingNoteUnits(u);
      // Divide unit price by multiplier and reset multiplier to 1 to avoid double-division in cost = price/multiplier
      const currentPrice = viewingNoteItemPrices[idx] ?? item.price ?? 0;
      const unitPrice = parseFloat((currentPrice / mult).toFixed(6));
      const p = [...viewingNoteItemPrices]; p[idx] = unitPrice; setViewingNoteItemPrices(p);
      const m = [...viewingNoteMultipliers]; m[idx] = 1; setViewingNoteMultipliers(m);
      const q = [...viewingNoteQtys]; q[idx] = newQty; setViewingNoteQtys(q);
      const c = [...viewingNoteMeasureConverted]; c[idx] = true; setViewingNoteMeasureConverted(c);
      setNotification({ type: 'success', message: `Medida cadastrada! 1 ${unitName || item.unit} = ${mult} UN.` });
      return true;
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao salvar medida.' });
      return false;
    } finally {
      setReviewSavingMeasure(false);
    }
  };

  const handleReviewSaveMeasure = async () => {
    if (reviewMeasureIdx === null) return;
    const ok = await applyReviewMeasure(reviewMeasureIdx, reviewMeasureUnit, reviewMeasureMultiplier);
    if (ok) setReviewMeasureIdx(null);
  };

  // Clique no gatilho da célula Medida: só abre o menu (Usar tradução/Adicionar medida/Manual) quando
  // já existe tradução cadastrada pro produto — senão vai direto pro diálogo "Adicionar Medida",
  // já que "Usar tradução" nesse caso só retornaria o erro de "nenhuma tradução cadastrada".
  const handleMeasureTriggerClick = (idx: number, item: any, triggerEl: HTMLElement, dropdownH: number) => {
    if (reviewUnitMenuIdx === idx) {
      setReviewUnitMenuIdx(null);
      setReviewUnitMenuPos(null);
      return;
    }
    const hasTranslation = !!item.product_id && productsWithMeasureTranslation.has(String(item.product_id));
    if (!hasTranslation) {
      setReviewMeasureIdx(idx);
      setReviewMeasureUnit(viewingNoteUnits[idx] ?? item.unit ?? '');
      setReviewMeasureMultiplier('');
      setReviewUnitMenuIdx(null);
      setReviewUnitMenuPos(null);
      return;
    }
    const rect = triggerEl.getBoundingClientRect();
    const openUp = rect.bottom + 4 + dropdownH > window.innerHeight;
    setReviewUnitMenuPos({ top: openUp ? rect.top - dropdownH - 4 : rect.bottom + 4, left: Math.max(8, rect.right - 176) });
    reviewUnitTriggerRef.current = triggerEl;
    setReviewUnitMenuIdx(idx);
  };

  // Salva (ou remove) o rascunho de Produto Mãe da aba "Produto Mãe" diretamente no item da
  // nota em edição — sem exigir que o produto filho já exista. Fica só em estado local até o
  // usuário salvar a nota (mesmo comportamento de qualquer outra edição de item aqui), mas por
  // estar no item (não em estado efêmero do modal) sobrevive a fechar e reabrir o vínculo.
  const commitItemMotherDraft = (draft: MotherPackageDraft | null) => {
    if (!viewingReviewNote || linkingItemIdx === null) return;
    const hadNoDraftBefore = !viewingReviewNote.items[linkingItemIdx]?.mother_draft;
    const updated = [...viewingReviewNote.items];
    updated[linkingItemIdx] = { ...updated[linkingItemIdx], mother_draft: draft };
    setViewingReviewNote({ ...viewingReviewNote, items: updated });
    // O campo "Código EAN" do formulário "Criar Novo Produto" vem pré-preenchido, ao abrir o
    // vínculo, com o código digitado na coluna EAN da nota — que na etapa "Vincular Produto
    // Filho" é o código da CAIXA (já capturado no draft.ean acima), não da unidade. Sem isso o
    // produto filho seria criado com o mesmo EAN da embalagem-mãe por engano.
    if (draft && noteItemNewEan.trim() && noteItemNewEan.trim() === (draft.ean || '').trim()) {
      setNoteItemNewEan('');
    }
    // Ao entrar no modo travado pela primeira vez (não numa edição posterior do rascunho já
    // salvo — aí o formulário de criação em andamento não deve ser descartado), começa pela
    // busca, igual ao mockup aprovado, em vez de manter o estado herdado de antes do Produto
    // Mãe existir (que podia ter caído direto em "Criar Novo" por falta de match no EAN).
    if (draft && hadNoDraftBefore) {
      setNoteItemShowCreate(false);
    }
  };

  // Grava de vez um Produto Mãe pendente assim que QUALQUER caminho de vínculo (produto criado
  // na hora, produto já existente escolhido na busca, tradução permanente ou criação rápida)
  // definir um product_id pro item — sem isso o rascunho salvo na aba "Produto Mãe" ficaria
  // órfão, preso no item, sempre que o usuário terminasse o vínculo por um caminho diferente
  // do de "Criar Novo Produto" (que já resolvia isso antes desta função existir).
  const persistPendingMotherDraftIfAny = async (draft: MotherPackageDraft | null | undefined, childProductId: string): Promise<{ id: string | null; error: string | null }> => {
    if (!draft) return { id: null, error: null };
    try {
      const id = await saveMotherPackage({ childProductId, draft });
      return { id, error: null };
    } catch (err: any) {
      return { id: null, error: err.message || 'Erro ao salvar o Produto Mãe.' };
    }
  };

  const handleNoteItemCreateAndLink = async () => {
    if (!noteItemNewName.trim() || linkingItemIdx === null || !viewingReviewNote) return;
    // Produto Mãe pendente já salvo na aba "Produto Mãe" (fica em item.mother_draft até o
    // produto filho existir) — captura antes de sobrescrever o item abaixo.
    const pendingMotherDraft: MotherPackageDraft | null = viewingReviewNote.items[linkingItemIdx]?.mother_draft || null;
    setNoteItemCreating(true);
    try {
      const sku = noteItemNewSku.trim() || null;
      // price fica 0 na criação — quem grava o preço (e em qual Empresa) é sempre a aprovação
      // da nota via applyNoteToCompanyStock, nunca a criação do produto (evita gravar prematuramente
      // na empresa padrão antes do usuário escolher a Empresa da nota na aba Recebimento).
      const { data: created, error } = await supabase.from('products')
        .insert({ name: noteItemNewName.trim(), sku, ean: noteItemNewEan.trim() || null, count: 0, is_low: true, status: 'Fora de Estoque', image: null, price: 0, brand: viewingReviewNote.items[linkingItemIdx]?.brand || null })
        .select('id, name, sku, ean, price').single();
      if (error) throw error;
      if (created) {
        // Produto Mãe definido antes de criar o produto (aba "Produto Mãe") — só é gravado
        // agora, que já existe um child_product_id pra satisfazer a constraint NOT NULL da tabela.
        // Persiste ANTES de montar o item pra já termos o id e aplicarmos a conversão de
        // quantidade/preço (unitsPerChild do próprio rascunho) na mesma tacada — sem isso a
        // linha ficava com a quantidade/preço "crus" da caixa, sem o fator ×N aplicado.
        const { id: motherPackageId, error: motherPackageError } = await persistPendingMotherDraftIfAny(pendingMotherDraft, created.id);
        const updatedItems = [...viewingReviewNote.items];
        const sourceItemBefore = updatedItems[linkingItemIdx];
        let conversion: any = {};
        if (pendingMotherDraft && !motherPackageError) {
          const mult = Number(pendingMotherDraft.unitsPerChild) || 1;
          const liveQty = viewingNoteQtys[linkingItemIdx] ?? sourceItemBefore.qty;
          const livePrice = viewingNoteItemPrices[linkingItemIdx] ?? sourceItemBefore.price;
          const liveMultiplier = viewingNoteMultipliers[linkingItemIdx] ?? sourceItemBefore.multiplier;
          const originalQty = sourceItemBefore.original_qty ?? Math.round((liveQty || 0) / (liveMultiplier || 1));
          const originalPrice = sourceItemBefore.original_price ?? (livePrice || 0) * (liveMultiplier || 1);
          conversion = {
            multiplier: mult,
            qty: originalQty * mult,
            original_qty: originalQty,
            price: originalPrice,
            original_price: originalPrice,
            mother_package_id: motherPackageId,
            mother_package_name: pendingMotherDraft.name,
            mother_package_ean: pendingMotherDraft.ean,
          };
        }
        updatedItems[linkingItemIdx] = {
          ...sourceItemBefore,
          name: created.name,
          sku: created.sku || sourceItemBefore.sku,
          ean: created.ean || sourceItemBefore.ean,
          product_id: created.id,
          product_price: 0,
          status_translation: pendingMotherDraft && !motherPackageError ? 'Traduzido (Caixa)' : 'Identificado (SKU/EAN)',
          mother_draft: null, // consumido acima (virou uma linha real em product_mother_packages)
          ...conversion,
        };
        setViewingReviewNote({ ...viewingReviewNote, items: updatedItems });
        const uS = [...viewingNoteSkus]; uS[linkingItemIdx] = created.sku || ''; setViewingNoteSkus(uS);
        const uE = [...viewingNoteEans]; uE[linkingItemIdx] = created.ean || ''; setViewingNoteEans(uE);
        const sellPrice = parseFloat(noteItemNewSellPrice.replace(',', '.')) || 0;
        const uP = [...viewingNoteSellPrices]; uP[linkingItemIdx] = sellPrice; setViewingNoteSellPrices(uP);
        if (pendingMotherDraft && !motherPackageError) {
          const uQ = [...viewingNoteQtys]; uQ[linkingItemIdx] = conversion.qty; setViewingNoteQtys(uQ);
          const uIP = [...viewingNoteItemPrices]; uIP[linkingItemIdx] = conversion.price; setViewingNoteItemPrices(uIP);
          const uM = [...viewingNoteMultipliers]; uM[linkingItemIdx] = conversion.multiplier; setViewingNoteMultipliers(uM);
        }
        const extraEanRows = noteItemExtraEans.filter(e => e.ean.trim()).map(e => ({
          product_id: created.id,
          ean: e.ean.trim(),
          description: e.description.trim() || null,
        }));
        let eanInsertFailed = false;
        if (extraEanRows.length > 0) {
          const { error: eanErr } = await supabase.from('product_ean_codes').insert(extraEanRows);
          if (eanErr) {
            eanInsertFailed = true;
            setNotification({ type: 'error', message: 'Produto criado, mas houve erro ao salvar EANs adicionais: ' + eanErr.message });
          }
        }
        if (noteItemSaveTranslation) {
          const supplierId = await resolveNoteSupplierId();
          if (!supplierId) {
            setNotification({ type: 'error', message: 'Não foi possível salvar a tradução permanente: esta nota não tem um fornecedor identificado.' });
          } else {
            const sourceItem = viewingReviewNote.items[linkingItemIdx];
            // upsert (não insert): supplier_mappings tem UNIQUE (supplier_id, supplier_description) —
            // reconfirmar a tradução de uma descrição já mapeada deve atualizar o produto, não falhar.
            const { error: mappingErr } = await supabase.from('supplier_mappings')
              .upsert({
                supplier_id: supplierId,
                supplier_description: sourceItem?.original_description || null,
                supplier_sku: sourceItem?.supplier_code || null,
                internal_product_id: created.id,
              }, { onConflict: 'supplier_id,supplier_description' });
            if (mappingErr) {
              setNotification({ type: 'error', message: 'Erro ao salvar tradução permanente: ' + mappingErr.message });
            } else {
              setNoteSupplierMappings(prev => [...prev, {
                supplier_sku: sourceItem?.supplier_code || null,
                supplier_description: sourceItem?.original_description || null,
                internal_product_id: created.id,
              }]);
            }
          }
        }
        setLinkingItemIdx(null);
        setNoteItemShowCreate(false);
        setNoteItemCreateTab('produto');
        setNoteItemNewName(''); setNoteItemNewSku(''); setNoteItemNewEan(''); setNoteItemExtraEans([]); setNoteItemNewSellPrice('');
        setNoteItemSaveTranslation(false);
        setNoteItemExtraStoreIds([]); setNoteItemExtraStorePrices({}); setNoteItemAddStoreOpen(false);
        if (motherPackageError) {
          setNotification({ type: 'error', message: 'Produto criado e vinculado, mas houve erro ao salvar o Produto Mãe: ' + motherPackageError });
        } else if (extraEanRows.length === 0 || !eanInsertFailed) {
          setNotification({ type: 'success', message: noteItemSaveTranslation ? 'Produto criado, vinculado e tradução salva!' : 'Produto criado e vinculado com sucesso!' });
        }
        fetchProducts(); // Sincroniza o state global para que o novo produto (e o EAN da caixa, se houver) apareça em buscas imediatamente
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

  // Mesma busca usada na lista do modal "Vincular ao Dicionário" — reaproveitada para decidir,
  // ao clicar em "Vincular" ou no atalho de criação rápida, se o produto já existe no sistema
  // (abre a busca) ou não (pula direto para a criação), sem divergir do que a lista mostraria.
  const searchProductsForLink = useCallback((query: string) => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return products.filter((p: any) =>
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      (p.ean && p.ean.toLowerCase().includes(q)) ||
      (p.extraEans || []).some((e: any) => e.ean?.toLowerCase().includes(q)) ||
      (p.motherEans || []).some((e: any) => e.ean?.toLowerCase().includes(q))
    ).slice(0, 12);
  }, [products]);

  // Abre o modal de vínculo a partir da coluna Identificação Interna: se o EAN do item já
  // corresponde a algum produto cadastrado, abre a busca (fluxo normal); se não há nenhum
  // resultado, pula direto para "Criar Novo Produto" com nome/EAN pré-preenchidos.
  const openNoteItemLink = (idx: number, item: any) => {
    const q = getNoteItemMatchCode(viewingNoteEans[idx] ?? item.ean, item.supplier_code);
    const hasMatch = q.trim().length > 0 && searchProductsForLink(q).length > 0;
    const sellPrice = viewingNoteSellPrices[idx] ?? item.product_price ?? 0;
    setLinkingItemIdx(idx);
    setNoteItemLinkQuery(q);
    setNoteItemNewEan(q);
    setNoteItemNewSku('');
    setNoteItemNewName((item.original_description || item.description || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
    setNoteItemNewSellPrice(sellPrice > 0 ? String(sellPrice) : '');
    setNoteItemSellPriceInput(sellPrice > 0 ? String(sellPrice) : '');
    setNoteItemShowCreate(q.trim().length > 0 && !hasMatch);
    setNoteItemCreateTab('produto');
  };

  // Atalho "Criar e Vincular" da coluna Identificação Interna: mesma checagem de existência do
  // botão "Vincular" — se já existe produto compatível, abre a busca normal; se não, pede
  // confirmação antes de criar (a criação em si acontece em handleQuickCreateAndLink).
  // Aplica direto a tradução permanente já cadastrada para este item — sem abrir modal,
  // sem pedir preço (usa o que já está na coluna Preço Venda) e sem re-perguntar se quer
  // salvar como tradução permanente (ela já existe). Usado pelo raio quando já há vínculo.
  const handleUsePermanentTranslation = async (idx: number, item: any, mappedProductId: string) => {
    if (!viewingReviewNote) return;
    const p = products.find((prod: any) => prod.id === mappedProductId);
    if (!p) { openQuickCreateOrLink(idx, item); return; } // produto removido — cai no fluxo normal
    captureSnapshot();
    // Produto Mãe pendente deste item (aba "Produto Mãe") — se existir, este vínculo também
    // finaliza ele, mesmo sendo um caminho diferente do de "Criar Novo Produto".
    const pendingMotherDraft: MotherPackageDraft | null = viewingReviewNote.items[idx]?.mother_draft || null;
    const sellPrice = viewingNoteSellPrices[idx] ?? item.product_price ?? 0;
    const updatedItems = [...viewingReviewNote.items];
    updatedItems[idx] = { ...updatedItems[idx], name: p.name, sku: p.sku || updatedItems[idx].sku, ean: p.ean || updatedItems[idx].ean, product_id: p.id, product_price: sellPrice, status_translation: 'Identificado (SKU/EAN)', mother_draft: null };
    setViewingReviewNote({ ...viewingReviewNote, items: updatedItems });
    const uS = [...viewingNoteSkus]; uS[idx] = p.sku || ''; setViewingNoteSkus(uS);
    const uE = [...viewingNoteEans]; uE[idx] = p.ean || ''; setViewingNoteEans(uE);
    const { error: motherPackageError } = await persistPendingMotherDraftIfAny(pendingMotherDraft, p.id);
    setNotification(motherPackageError
      ? { type: 'error', message: `Vinculado via tradução permanente, mas houve erro ao salvar o Produto Mãe: ${motherPackageError}` }
      : { type: 'success', message: `Vinculado via tradução permanente: ${p.name}` });
  };

  // Confirma o vínculo do item da nota ao produto selecionado na busca do modal "Vincular ao
  // Dicionário" (Enter no campo de preço ou botão "Vincular com este preço"). Se o código da
  // linha (coluna EAN, ou Código do fornecedor quando o EAN está vazio — getNoteItemMatchCode)
  // bate com o EAN de uma embalagem-mãe (caixa/fardo) do produto encontrado, aplica o mesmo
  // fator de conversão (units_per_child) que a importação automática já aplica — senão a
  // quantidade de caixas ficaria gravada como se fossem unidades avulsas (ver
  // handleNoteImportExcel, que faz o mesmo cálculo no caminho de importação).
  const confirmNoteItemLink = async () => {
    if (!viewingReviewNote || linkingItemIdx === null || !noteItemSelectedProduct) return;
    captureSnapshot();
    const i = linkingItemIdx;
    const p = noteItemSelectedProduct;
    const linkItem = viewingReviewNote.items[i];
    // Produto Mãe pendente deste item (aba "Produto Mãe") — vincular a um produto JÁ EXISTENTE
    // (este caminho) também precisa finalizar o Produto Mãe, não só criar um produto novo.
    const pendingMotherDraft: MotherPackageDraft | null = linkItem?.mother_draft || null;
    const sellPrice = parseFloat(noteItemSellPriceInput.replace(',', '.')) || 0;
    const updatedItems = [...viewingReviewNote.items];
    const code = getNoteItemMatchCode(viewingNoteEans[i] ?? updatedItems[i].ean, updatedItems[i].supplier_code);
    // Se há um rascunho de Produto Mãe pendente (fluxo "Vincular Produto Filho"), ele manda —
    // nem precisa bater o EAN, já que acabou de ser definido nesta mesma sessão e ainda não
    // existe no banco pra um findMotherPackageByCode encontrar.
    const motherMatch = pendingMotherDraft ? null : findMotherPackageByCode(p, code);
    let conversion: any = {};
    let motherPackageError: string | null = null;
    if (pendingMotherDraft) {
      // Persiste ANTES de montar a conversão pra já termos o id do Produto Mãe — e usa o
      // unitsPerChild do próprio rascunho, sem depender de um fetchProducts()/match por EAN
      // que ainda não enxergaria o registro recém-criado.
      const persisted = await persistPendingMotherDraftIfAny(pendingMotherDraft, p.id);
      motherPackageError = persisted.error;
      if (!motherPackageError) {
        const mult = Number(pendingMotherDraft.unitsPerChild) || 1;
        const liveQty = viewingNoteQtys[i] ?? updatedItems[i].qty;
        const livePrice = viewingNoteItemPrices[i] ?? updatedItems[i].price;
        const liveMultiplier = viewingNoteMultipliers[i] ?? updatedItems[i].multiplier;
        const originalQty = updatedItems[i].original_qty ?? Math.round((liveQty || 0) / (liveMultiplier || 1));
        const originalPrice = updatedItems[i].original_price ?? (livePrice || 0) * (liveMultiplier || 1);
        conversion = {
          multiplier: mult,
          qty: originalQty * mult,
          original_qty: originalQty,
          price: originalPrice,
          original_price: originalPrice,
          mother_package_id: persisted.id,
          mother_package_name: pendingMotherDraft.name,
          mother_package_ean: pendingMotherDraft.ean,
        };
        fetchProducts(); // outras linhas da mesma nota já reconhecem este EAN de caixa
      }
    } else if (motherMatch) {
      const mult = Number(motherMatch.unitsPerChild) || 1;
      // Lê o que está AO VIVO na grade (viewingNoteQtys/viewingNoteItemPrices), não o
      // updatedItems[i].qty/price "cru" — este só é sincronizado de volta ao objeto do item
      // em certos pontos (ex: salvar/aprovar a nota), então pode estar desatualizado (null/0
      // numa linha em branco, ou o valor anterior à edição) enquanto o usuário ainda está
      // digitando Qtd./Preço Custo antes de vincular. Mesmo padrão de fallback usado em todo
      // o resto da tela (ver cost/displayQty na renderização da tabela).
      const liveQty = viewingNoteQtys[i] ?? updatedItems[i].qty;
      const livePrice = viewingNoteItemPrices[i] ?? updatedItems[i].price;
      const liveMultiplier = viewingNoteMultipliers[i] ?? updatedItems[i].multiplier;
      const originalQty = updatedItems[i].original_qty ?? Math.round((liveQty || 0) / (liveMultiplier || 1));
      const originalPrice = updatedItems[i].original_price ?? (livePrice || 0) * (liveMultiplier || 1);
      conversion = {
        multiplier: mult,
        qty: originalQty * mult,
        original_qty: originalQty,
        // price fica com o valor BRUTO (preço da caixa, não dividido) — em todo o resto do
        // app (cost/markup/Valor Total/Histórico em Notas) o custo por unidade já é sempre
        // recalculado como price / multiplier. Se dividíssemos aqui também, o custo por
        // unidade do produto filho ficaria dividido em dobro (bug encontrado ao editar
        // Valor Total: o Preço Custo aparecia igual ao valor digitado, sem considerar o
        // fator da embalagem-mãe).
        price: originalPrice,
        original_price: originalPrice,
        mother_package_id: motherMatch.motherPackageId,
        mother_package_name: motherMatch.motherPackageName,
        mother_package_ean: motherMatch.ean,
      };
    }
    const converted = !!(conversion.multiplier);
    updatedItems[i] = {
      ...updatedItems[i],
      name: p.name,
      sku: p.sku || updatedItems[i].sku,
      ean: p.ean || updatedItems[i].ean,
      product_id: p.id,
      product_price: sellPrice,
      status_translation: converted ? 'Traduzido (Caixa)' : 'Identificado (SKU/EAN)',
      mother_draft: null,
      ...conversion,
    };
    setViewingReviewNote({ ...viewingReviewNote, items: updatedItems });
    const uS = [...viewingNoteSkus]; uS[i] = p.sku || ''; setViewingNoteSkus(uS);
    const uE = [...viewingNoteEans]; uE[i] = p.ean || ''; setViewingNoteEans(uE);
    const uP = [...viewingNoteSellPrices]; uP[i] = sellPrice; setViewingNoteSellPrices(uP);
    if (converted) {
      const uQ = [...viewingNoteQtys]; uQ[i] = conversion.qty; setViewingNoteQtys(uQ);
      const uIP = [...viewingNoteItemPrices]; uIP[i] = conversion.price; setViewingNoteItemPrices(uIP);
      const uM = [...viewingNoteMultipliers]; uM[i] = conversion.multiplier; setViewingNoteMultipliers(uM);
    }
    if (noteItemSaveTranslation) {
      const supplierId = await resolveNoteSupplierId();
      if (!supplierId) {
        setNotification({ type: 'error', message: 'Não foi possível salvar a tradução permanente: esta nota não tem um fornecedor identificado.' });
      } else {
        const { error: mappingErr } = await supabase.from('supplier_mappings').upsert({ supplier_id: supplierId, supplier_description: linkItem?.original_description || null, supplier_sku: linkItem?.supplier_code || null, internal_product_id: p.id }, { onConflict: 'supplier_id,supplier_description' });
        if (mappingErr) {
          setNotification({ type: 'error', message: 'Erro ao salvar tradução permanente: ' + mappingErr.message });
        } else {
          setNoteSupplierMappings(prev => [...prev, { supplier_sku: linkItem?.supplier_code || null, supplier_description: linkItem?.original_description || null, internal_product_id: p.id }]);
          setNotification({ type: 'success', message: 'Tradução salva! Este item será identificado automaticamente nas próximas notas.' });
        }
      }
    } else if (motherPackageError) {
      setNotification({ type: 'error', message: 'Vinculado, mas houve erro ao salvar o Produto Mãe: ' + motherPackageError });
    } else if (converted) {
      setNotification({ type: 'success', message: `Vinculado — quantidade convertida ×${conversion.multiplier}.` });
    } else {
      setNotification({ type: 'success', message: `Vinculado a ${p.name}.` });
    }
    setLinkingItemIdx(null); setNoteItemLinkQuery(''); setNoteItemSelectedProduct(null); setNoteItemSellPriceInput(''); setNoteItemSaveTranslation(false); setNoteItemCreateTab('produto');
  };

  const openQuickCreateOrLink = (idx: number, item: any) => {
    const q = getNoteItemMatchCode(viewingNoteEans[idx] ?? item.ean, item.supplier_code);
    const hasMatch = q.trim().length > 0 && searchProductsForLink(q).length > 0;
    if (q.trim().length === 0 || hasMatch) {
      openNoteItemLink(idx, item);
      return;
    }
    setQuickCreateConfirmIdx(idx);
  };

  // Cria o produto direto (nome do item em minúsculas, preço de venda da linha, EAN do item)
  // e já vincula à movimentação — sem passar pela tela de criação manual.
  const handleQuickCreateAndLink = async (idx: number) => {
    if (!viewingReviewNote) return;
    const item = viewingReviewNote.items[idx];
    // Produto Mãe pendente deste item (aba "Produto Mãe") — a criação rápida também precisa
    // finalizar ele, mesmo pulando a tela de criação manual.
    const pendingMotherDraft: MotherPackageDraft | null = item?.mother_draft || null;
    const name = (item.original_description || item.description || '').trim().toLowerCase();
    const ean = (viewingNoteEans[idx] ?? item.ean ?? '').trim();
    const price = viewingNoteSellPrices[idx] ?? item.product_price ?? 0;
    if (!name) {
      setNotification({ type: 'error', message: 'Item sem descrição — não é possível criar o produto automaticamente.' });
      setQuickCreateConfirmIdx(null);
      return;
    }
    setQuickCreateSubmitting(true);
    try {
      // price fica 0 na criação — a aprovação da nota (applyNoteToCompanyStock) é quem grava
      // o preço na Empresa certa; escrever aqui gravaria prematuramente na empresa padrão.
      const { data: created, error } = await supabase.from('products')
        .insert({ name, sku: null, ean: ean || null, count: 0, is_low: true, status: 'Fora de Estoque', price: 0, brand: item.brand || null })
        .select('id, name, sku, ean, price').single();
      if (error) throw error;
      const updatedItems = [...viewingReviewNote.items];
      updatedItems[idx] = {
        ...updatedItems[idx],
        name: created.name,
        sku: created.sku || updatedItems[idx].sku,
        ean: created.ean || updatedItems[idx].ean,
        product_id: created.id,
        product_price: price,
        status_translation: 'Identificado (SKU/EAN)',
        mother_draft: null,
      };
      setViewingReviewNote({ ...viewingReviewNote, items: updatedItems });
      const uS = [...viewingNoteSkus]; uS[idx] = created.sku || ''; setViewingNoteSkus(uS);
      const uE = [...viewingNoteEans]; uE[idx] = created.ean || ''; setViewingNoteEans(uE);
      const uP = [...viewingNoteSellPrices]; uP[idx] = price; setViewingNoteSellPrices(uP);

      const supplierId = await resolveNoteSupplierId();
      if (supplierId) {
        const { error: mappingErr } = await supabase.from('supplier_mappings')
          .upsert({ supplier_id: supplierId, supplier_description: item?.original_description || null, supplier_sku: item?.supplier_code || null, internal_product_id: created.id }, { onConflict: 'supplier_id,supplier_description' });
        if (!mappingErr) {
          setNoteSupplierMappings(prev => [...prev, { supplier_sku: item?.supplier_code || null, supplier_description: item?.original_description || null, internal_product_id: created.id }]);
        }
      }

      const { error: motherPackageError } = await persistPendingMotherDraftIfAny(pendingMotherDraft, created.id);
      setNotification(motherPackageError
        ? { type: 'error', message: 'Produto criado e vinculado, mas houve erro ao salvar o Produto Mãe: ' + motherPackageError }
        : { type: 'success', message: 'Produto criado e vinculado com sucesso!' });
      fetchProducts(); // Sincroniza o state global para que o novo produto apareça em buscas imediatamente
    } catch (err: any) {
      const msg = err.message || '';
      const friendly = msg.includes('products_ean') || msg.includes('ean')
        ? 'Este EAN já está cadastrado em outro produto.'
        : msg || 'Erro ao criar produto.';
      setNotification({ type: 'error', message: friendly });
    } finally {
      setQuickCreateSubmitting(false);
      setQuickCreateConfirmIdx(null);
    }
  };

  // Adiciona uma linha em branco à nota em edição (aba Produtos, situação "Registro").
  // Espelha o mesmo conjunto de arrays paralelos tratado por "Excluir produto da nota" (linha 7648+).
  const handleAddNoteRow = () => {
    if (!viewingReviewNote) return;
    const blankItem = {
      seq: viewingReviewNote.items.length + 1,
      original_description: '', name: '', supplier_code: '',
      ean: '', sku: '', unit: '', multiplier: 1,
      qty: null, price: 0, product_price: 0, verified: false, product_id: null,
    };
    setViewingReviewNote(prev => prev ? { ...prev, items: [...prev.items, blankItem] } : prev);
    setViewingNoteVerified(prev => [...prev, false]);
    setViewingNoteQtys(prev => [...prev, null]);
    setViewingNoteItemPrices(prev => [...prev, 0]);
    setViewingNoteSellPrices(prev => [...prev, 0]);
    setViewingNoteEans(prev => [...prev, '']);
    setViewingNoteSkus(prev => [...prev, '']);
    setViewingNoteUnits(prev => [...prev, '']);
    setViewingNoteMultipliers(prev => [...prev, 1]);
    setViewingNoteMeasureConverted(prev => [...prev, false]);
    setViewingNoteReviewTimestamps(prev => [...prev, null]);
    setViewingNoteDistribuicao(prev => [...prev, '']);
    setViewingNoteDistribByCompany(prev => [...prev, {}]);
    setViewingDistribMode(prev => [...prev, '']);
    setAdjColumns(prev => prev.map(col => ({ ...col, items: [...col.items, ''] })));
    setViewingNoteDiscrepancies(prev => [...prev, null]);
    setViewingNoteEanVariants(prev => [...prev, []]);
    setViewingNoteExtraEans(prev => [...prev, []]);
  };

  // "Criar Manifesto" — abre a mesma janela usada para editar notas já existentes, mas
  // com uma nota que só existe em memória: só vira registro no banco no primeiro "Salvar"
  // (ver persistNote), pra não deixar nota vazia sobrando se o usuário fechar sem preencher nada.
  const handleCreateManifestNote = () => {
    fetchSuppliers();
    const id = crypto.randomUUID();
    const timestamp = new Date().toLocaleString('pt-BR');
    const note: ReviewNote = {
      id, timestamp, createdAt: new Date().toISOString(), fileName: '', items: [], itemCount: 0, verifiedCount: 0,
      status: 'registro', approved: false, supplierId: null,
    };
    openReviewNoteWithLock(note, () => { if (isMobileView) { changeNoteViewMode('admin'); setShowMobileNoteView(true); } });
  };

  // Grava a nota no banco via upsert (cria na primeira vez, atualiza depois) — usada tanto
  // pelo botão "Salvar" quanto pela confirmação de mudança de Situação de Entrada, pra nunca
  // gravar uma nota que o usuário só abriu e fechou sem preencher nada (ver handleCreateManifestNote).
  const persistNote = useCallback(async (statusOverride?: NoteStatus) => {
    if (!viewingReviewNote) return;
    // Empresa é obrigatória desde a fase de Registro — sem ela não dá pra saber a qual loja
    // o preço/estoque desta nota pertence quando ela for aprovada.
    if (!viewingReviewNote.companyId) throw new Error(EMPRESA_REQUIRED_MSG);
    const nextStatus = statusOverride ?? getNoteStatus(viewingReviewNote);
    const updatedItems = viewingReviewNote.items.map((item: any, idx: number) => {
      // Medida em branco vira "UN" automaticamente ao sair de Registro (entrando em
      // Aguardando recebimento ou Revisão) — até lá a célula fica vazia para o usuário preencher.
      const rawUnit = viewingNoteUnits[idx] ?? item.unit;
      const unit = (!rawUnit && (nextStatus === 'aguardando_recebimento' || nextStatus === 'revisao')) ? 'UN' : rawUnit;
      return {
      ...item,
      ean: viewingNoteEans[idx] ?? item.ean,
      eanVariants: (viewingNoteEanVariants[idx]?.length ?? 0) > 0 ? viewingNoteEanVariants[idx] : undefined,
      extraEans: (viewingNoteExtraEans[idx]?.length ?? 0) > 0 ? viewingNoteExtraEans[idx] : undefined,
      sku: viewingNoteSkus[idx] ?? item.sku,
      qty: viewingNoteQtys[idx] ?? item.qty,
      price: viewingNoteItemPrices[idx] ?? item.price,
      unit,
      multiplier: viewingNoteMultipliers[idx] ?? item.multiplier,
      product_price: viewingNoteSellPrices[idx] ?? item.product_price,
      verified: viewingNoteVerified[idx] ?? item.verified,
      review_timestamp: viewingNoteReviewTimestamps[idx] ?? item.review_timestamp ?? null,
      // Preço/Ok/Revisão lançados para empresas extras (não-donas) via botão de preço na
      // toolbar — só mexe nas chaves de empresas que o usuário efetivamente visitou nesta
      // sessão de edição; as demais chaves de pricingByCompany já salvas ficam intactas.
      pricingByCompany: Object.keys(viewingNoteExtraPricing).length > 0 ? {
        ...item.pricingByCompany,
        ...Object.fromEntries(Object.entries(viewingNoteExtraPricing).map(([companyId, extra]) => [
          companyId,
          {
            ...item.pricingByCompany?.[companyId],
            precoVenda: extra.sellPrices[idx] ?? item.pricingByCompany?.[companyId]?.precoVenda ?? null,
            ok: extra.verified[idx] ?? item.pricingByCompany?.[companyId]?.ok ?? false,
            revisao: extra.reviewTimestamps[idx] ?? item.pricingByCompany?.[companyId]?.revisao ?? null,
          },
        ])),
      } : item.pricingByCompany,
      // Legado (número único, sem empresa) — a tabela de revisão desktop não escreve mais
      // aqui (virou distribuicaoByCompany), mas o editor mobile (MobileNoteView) ainda usa
      // esse campo, então continua sendo salvo por esse caminho.
      distribuicao: viewingNoteDistribuicao[idx] !== undefined && viewingNoteDistribuicao[idx] !== ''
        ? parseInt(viewingNoteDistribuicao[idx]) || null
        : (item.distribuicao ?? null),
      // Distribuição por loja (Record company_id -> qty) — usada pela tabela de revisão desktop.
      distribuicaoByCompany: viewingNoteDistribByCompany[idx] ?? item.distribuicaoByCompany ?? {},
      // Selo de "Medida definida por conversão" — precisa ser persistido (não só na tela),
      // senão some ao reabrir a nota mesmo com a unidade/quantidade já convertidas.
      measureConverted: viewingNoteMeasureConverted[idx] ?? item.measureConverted ?? false,
      ...((() => { const leg = adjLegacy(); return {
        adj_discount_mode: leg.discountMode,
        adj_discount_applied: leg.discountMode === 'geral' ? leg.discountApplied : null,
        adj_discount_individual_type: leg.discountIndividualType,
        adj_discount_value: leg.discountMode === 'individual' ? (parseFloat(leg.itemDiscounts[idx] ?? '') || null) : null,
        adj_surcharge_mode: leg.surchargeMode,
        adj_surcharge_applied: leg.surchargeMode === 'geral' ? leg.surchargeApplied : null,
        adj_surcharge_individual_type: leg.surchargeIndividualType,
        adj_surcharge_value: leg.surchargeMode === 'individual' ? (parseFloat(leg.itemSurcharges[idx] ?? '') || null) : null,
      }; })()),
      // full adj columns serialized on first item for full restore on reload
      ...(idx === 0 ? { adj_columns_full: adjColumns } : {}),
      discrepancy: getItemDiscrepancy(idx, item),
      };
    });
    const updatedVerifiedCount = viewingNoteVerified.filter(Boolean).length;
    const status = nextStatus;
    const approved = status === 'aprovada';
    const { error: saveError } = await supabase.from('review_notes').upsert({
      id: viewingReviewNote.id,
      timestamp_label: viewingReviewNote.timestamp,
      verified_count: updatedVerifiedCount,
      item_count: updatedItems.length,
      items: updatedItems,
      file_name: viewingReviewNote.fileName,
      note_number: viewingReviewNote.noteNumber || null,
      received_date: viewingReviewNote.receivedDate || null,
      order_date: viewingReviewNote.orderDate || null,
      company_id: viewingReviewNote.companyId || null,
      supplier_id: viewingReviewNote.supplierId || null,
      supplier_name: viewingReviewNote.supplierName || null,
      status,
      approved,
      is_draft: false,
      original_nfe_xml: viewingReviewNote.originalNfeXml || null,
      updated_at: new Date().toISOString(),
    });
    if (saveError) throw saveError;
    const nextNote: ReviewNote = {
      ...viewingReviewNote, items: updatedItems, verifiedCount: updatedVerifiedCount, itemCount: updatedItems.length, status, approved,
    };
    // Só propaga Preço + Estoque para a Empresa da nota quando ela está Aprovada — evita
    // descompasso caso a nota ainda seja editada/corrigida em Registro/Revisão.
    if (status === 'aprovada') await applyNoteToCompanyStock(nextNote);
    setReviewNotes(prev => prev.some(n => n.id === nextNote.id) ? prev.map(n => n.id === nextNote.id ? nextNote : n) : [nextNote, ...prev]);
    setViewingReviewNote(nextNote);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingReviewNote, viewingNoteEans, viewingNoteSkus, viewingNoteQtys, viewingNoteItemPrices, viewingNoteUnits, viewingNoteMultipliers, viewingNoteSellPrices, viewingNoteVerified, viewingNoteReviewTimestamps, viewingNoteDistribuicao, adjColumns, viewingNoteDiscrepancies, viewingNoteEanVariants, viewingNoteExtraEans, viewingNoteExtraPricing, applyNoteToCompanyStock]);

  const handleSaveNote = useCallback(async () => {
    if (!viewingReviewNote) return;
    setSavingNote(true);
    try {
      await persistNote();
      setNotification({ type: 'success', message: 'Nota salva com sucesso!' });
      fetchProducts(); // Reflete preços de venda e dados atualizados no state global
    } catch (err: any) {
      if (err.message === EMPRESA_REQUIRED_MSG) setNoteEditorTab('recebimento');
      setNotification({ type: 'error', message: err.message || 'Erro ao salvar nota.' });
    } finally {
      setSavingNote(false);
    }
  }, [viewingReviewNote, persistNote]);

  // Troca o contexto de precificação (empresa dona <-> empresa extra) no botão de preço da
  // toolbar da revisão. Salva a nota automaticamente antes de trocar — evita que o usuário
  // perca preços/Ok lançados para a empresa atual só por ter esquecido de clicar em Salvar.
  const switchPriceCompany = useCallback(async (companyId: string | null) => {
    if (!viewingReviewNote || companyId === viewingPriceCompanyId) { setPriceCompanyDropdownOpen(false); return; }
    setSwitchingPriceCompany(true);
    try {
      await persistNote();
      if (companyId && !viewingNoteExtraPricing[companyId]) {
        setViewingNoteExtraPricing(prev => ({
          ...prev,
          [companyId]: {
            sellPrices: viewingReviewNote.items.map((it: any) => it.pricingByCompany?.[companyId]?.precoVenda ?? undefined),
            verified: viewingReviewNote.items.map((it: any) => it.pricingByCompany?.[companyId]?.ok ?? false),
            reviewTimestamps: viewingReviewNote.items.map((it: any) => it.pricingByCompany?.[companyId]?.revisao ?? null),
          },
        }));
      }
      setViewingPriceCompanyId(companyId);
      setPriceCompanyDropdownOpen(false);
    } catch (err: any) {
      if (err.message === EMPRESA_REQUIRED_MSG) setNoteEditorTab('recebimento');
      setNotification({ type: 'error', message: err.message || 'Erro ao salvar nota antes de trocar de empresa.' });
    } finally {
      setSwitchingPriceCompany(false);
    }
  }, [viewingReviewNote, viewingPriceCompanyId, viewingNoteExtraPricing, persistNote]);

  // Heartbeat (renova meu lock) + autosave silencioso, no mesmo timer, enquanto a nota
  // estiver aberta. Usa um ref pra sempre chamar o persistNote mais recente sem precisar
  // recriar o interval a cada tecla digitada (o que faria o autosave nunca "descansar" 45s).
  const persistNoteRef = useRef(persistNote);
  useEffect(() => { persistNoteRef.current = persistNote; }, [persistNote]);
  useEffect(() => {
    if (!viewingReviewNote || !colaboradorId || noteLockBlockedBy) return;
    const noteId = viewingReviewNote.id;
    const tick = async () => {
      supabase.from('review_notes').update({ locked_at: new Date().toISOString() }).eq('id', noteId).eq('locked_by_id', colaboradorId).then(() => {});
      try {
        await persistNoteRef.current();
      } catch (err: any) {
        if (err?.message !== EMPRESA_REQUIRED_MSG) console.warn('[autosave] Falha ao salvar nota automaticamente:', err?.message);
      }
    };
    const intervalId = setInterval(tick, NOTE_LOCK_HEARTBEAT_MS);
    return () => clearInterval(intervalId);
  }, [viewingReviewNote?.id, colaboradorId, noteLockBlockedBy]);

  // Libera o lock com navigator.sendBeacon se a aba fechar/atualizar — um fetch normal
  // pode ser cancelado nesse momento, o beacon é a única forma confiável de garantir o
  // envio. Se nem isso disparar (crash, queda de energia), o heartbeat expira o lock sozinho.
  const noteLockBeaconInfoRef = useRef<{ noteId: string | null; colaboradorId: string | null }>({ noteId: null, colaboradorId: null });
  useEffect(() => {
    noteLockBeaconInfoRef.current = {
      noteId: (viewingReviewNote && !noteLockBlockedBy) ? viewingReviewNote.id : null,
      colaboradorId,
    };
  }, [viewingReviewNote, colaboradorId, noteLockBlockedBy]);
  useEffect(() => {
    const releaseViaBeacon = () => {
      const { noteId, colaboradorId: cid } = noteLockBeaconInfoRef.current;
      if (!noteId || !cid || typeof navigator.sendBeacon !== 'function') return;
      const blob = new Blob([JSON.stringify({ noteId, colaboradorId: cid })], { type: 'application/json' });
      navigator.sendBeacon('/api/release-note-lock', blob);
    };
    window.addEventListener('beforeunload', releaseViaBeacon);
    window.addEventListener('pagehide', releaseViaBeacon);
    return () => {
      window.removeEventListener('beforeunload', releaseViaBeacon);
      window.removeEventListener('pagehide', releaseViaBeacon);
    };
  }, []);

  // Leitura/escrita de Preço Venda / Ok / Revisão para uma empresa extra (não-dona) — usadas
  // pelas células da tabela de revisão quando viewingPriceCompanyId aponta pra outra empresa.
  const getExtraSellPrice = (companyId: string, idx: number, item: any): number | undefined =>
    viewingNoteExtraPricing[companyId]?.sellPrices[idx] ?? item.pricingByCompany?.[companyId]?.precoVenda ?? undefined;
  const getExtraVerified = (companyId: string, idx: number, item: any): boolean =>
    viewingNoteExtraPricing[companyId]?.verified[idx] ?? item.pricingByCompany?.[companyId]?.ok ?? false;
  const getExtraReviewTimestamp = (companyId: string, idx: number, item: any): string | null =>
    viewingNoteExtraPricing[companyId]?.reviewTimestamps[idx] ?? item.pricingByCompany?.[companyId]?.revisao ?? null;
  const setExtraSellPrice = (companyId: string, idx: number, val: number) => {
    setViewingNoteExtraPricing(prev => {
      const cur = prev[companyId] || { sellPrices: [], verified: [], reviewTimestamps: [] };
      const sellPrices = [...cur.sellPrices]; sellPrices[idx] = val;
      return { ...prev, [companyId]: { ...cur, sellPrices } };
    });
  };
  const setExtraVerified = (companyId: string, idx: number, val: boolean, timestamp?: string | null) => {
    setViewingNoteExtraPricing(prev => {
      const cur = prev[companyId] || { sellPrices: [], verified: [], reviewTimestamps: [] };
      const verified = [...cur.verified]; verified[idx] = val;
      const reviewTimestamps = [...cur.reviewTimestamps];
      if (timestamp !== undefined) reviewTimestamps[idx] = timestamp;
      return { ...prev, [companyId]: { ...cur, verified, reviewTimestamps } };
    });
  };

  const handleDeleteNote = useCallback(async () => {
    if (!viewingReviewNote) return;
    await supabase.from('review_notes').delete().eq('id', viewingReviewNote.id);
    setReviewNotes(prev => prev.filter(n => n.id !== viewingReviewNote.id));
    setViewingReviewNote(null);
    setShowMobileNoteView(false);
    setConfirmDeleteNote(false);
  }, [viewingReviewNote]);

  // Normaliza um valor colado para campos numéricos (formato BR: vírgula decimal, ponto milhar),
  // igual à antiga janela "Criar Manifesto" — trata texto extra vindo de PDFs (ex: "48 UN").
  const normalizeNumericPaste = (raw: string): string => {
    const cleaned = raw.replace(/[^\d.,]/g, '').trim();
    if (!cleaned) return '';
    if (cleaned.includes(',')) {
      const normalized = cleaned.replace(/\./g, '').replace(',', '.');
      return isNaN(parseFloat(normalized)) ? '' : normalized;
    }
    const dotIdx = cleaned.lastIndexOf('.');
    if (dotIdx !== -1 && cleaned.length - dotIdx - 1 === 3) {
      const normalized = cleaned.replace(/\./g, '');
      return isNaN(parseFloat(normalized)) ? '' : normalized;
    }
    return isNaN(parseFloat(cleaned)) ? '' : cleaned;
  };

  // Colagem em coluna (distribui multi-linhas para baixo, criando linhas novas quando falta espaço) —
  // ativa com a nota em "Registro" (todas as colunas destravadas) ou, fora disso, apenas quando o
  // usuário destravou a coluna manualmente pelo lápis — só é chamada por inputs já em modo edição.
  const handleNoteColumnPaste = (
    e: React.ClipboardEvent, rowIndex: number,
    field: 'supplier_code' | 'original_description' | 'ean' | 'sku' | 'unit' | 'qty' | 'price' | 'brand',
  ) => {
    if (!viewingReviewNote) return;
    const text = e.clipboardData.getData('text');
    const lines = text
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
    if (lines.length <= 1) return; // comportamento padrão do browser para linha única
    e.preventDefault();
    const isNumeric = field === 'qty' || field === 'price';
    const values = isNumeric ? lines.map(normalizeNumericPaste).filter(v => v.length > 0) : lines;
    if (values.length === 0) return;

    const currentLen = viewingReviewNote.items.length;
    const rowsToAdd = Math.max(0, (rowIndex + values.length) - currentLen);
    if (rowsToAdd > 0) {
      const blanks = Array.from({ length: rowsToAdd }, (_, i) => ({
        seq: currentLen + i + 1, original_description: '', name: '', supplier_code: '',
        ean: '', sku: '', unit: '', multiplier: 1, qty: null, price: 0, product_price: 0, verified: false, product_id: null, brand: '',
      }));
      setViewingReviewNote(prev => prev ? { ...prev, items: [...prev.items, ...blanks] } : prev);
      setViewingNoteVerified(prev => [...prev, ...blanks.map(() => false)]);
      setViewingNoteQtys(prev => [...prev, ...blanks.map(() => null)]);
      setViewingNoteItemPrices(prev => [...prev, ...blanks.map(() => 0)]);
      setViewingNoteSellPrices(prev => [...prev, ...blanks.map(() => 0)]);
      setViewingNoteEans(prev => [...prev, ...blanks.map(() => '')]);
      setViewingNoteSkus(prev => [...prev, ...blanks.map(() => '')]);
      setViewingNoteUnits(prev => [...prev, ...blanks.map(() => '')]);
      setViewingNoteMultipliers(prev => [...prev, ...blanks.map(() => 1)]);
      setViewingNoteMeasureConverted(prev => [...prev, ...blanks.map(() => false)]);
      setViewingNoteReviewTimestamps(prev => [...prev, ...blanks.map(() => null)]);
      setViewingNoteDistribuicao(prev => [...prev, ...blanks.map(() => '')]);
      setViewingNoteDistribByCompany(prev => [...prev, ...blanks.map(() => ({}))]);
      setViewingDistribMode(prev => [...prev, ...blanks.map(() => '')]);
      setAdjColumns(prev => prev.map(col => ({ ...col, items: [...col.items, ...blanks.map(() => '')] })));
      setViewingNoteDiscrepancies(prev => [...prev, ...blanks.map(() => null)]);
      setViewingNoteEanVariants(prev => [...prev, ...blanks.map(() => [])]);
      setViewingNoteExtraEans(prev => [...prev, ...blanks.map(() => [])]);
    }

    if (field === 'supplier_code' || field === 'original_description' || field === 'brand') {
      setViewingReviewNote(prev => {
        if (!prev) return prev;
        const u = [...prev.items];
        values.forEach((v, i) => { const idx = rowIndex + i; u[idx] = { ...u[idx], [field]: v }; });
        return { ...prev, items: u };
      });
    } else if (field === 'ean') {
      setViewingNoteEans(prev => { const u = [...prev]; values.forEach((v, i) => { u[rowIndex + i] = v; }); return u; });
    } else if (field === 'sku') {
      setViewingNoteSkus(prev => { const u = [...prev]; values.forEach((v, i) => { u[rowIndex + i] = v; }); return u; });
    } else if (field === 'unit') {
      setViewingNoteUnits(prev => { const u = [...prev]; values.forEach((v, i) => { u[rowIndex + i] = v; }); return u; });
    } else if (field === 'qty') {
      setViewingNoteQtys(prev => { const u = [...prev]; values.forEach((v, i) => { u[rowIndex + i] = parseFloat(v) || 0; }); return u; });
    } else if (field === 'price') {
      // Cola valores de custo por unidade — multiplica pelo fator de conversão da linha
      // (se houver, ex: produto mãe) antes de gravar, pra ficar consistente com o mesmo
      // "cost = preço bruto / mult" usado no input de Preço Custo e em todo o resto da tela.
      setViewingNoteItemPrices(prev => {
        const u = [...prev];
        values.forEach((v, i) => {
          const rIdx = rowIndex + i;
          const rowMult = (viewingNoteMultipliers[rIdx] ?? viewingReviewNote.items[rIdx]?.multiplier) || 1;
          u[rIdx] = (parseFloat(v) || 0) * rowMult;
        });
        return u;
      });
    }
  };

  // Colagem em coluna para as colunas dinâmicas de Desconto/Acréscimo (modo individual) —
  // mesmo comportamento das demais colunas: distribui multi-linhas pra baixo, criando linhas
  // novas quando falta espaço.
  const handleAdjColumnPaste = (e: React.ClipboardEvent, rowIndex: number, colIdx: number) => {
    if (!viewingReviewNote) return;
    const text = e.clipboardData.getData('text');
    const lines = text
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
    if (lines.length <= 1) return; // comportamento padrão do browser para linha única
    e.preventDefault();
    const values = lines.map(normalizeNumericPaste).filter(v => v.length > 0);
    if (values.length === 0) return;

    const currentLen = viewingReviewNote.items.length;
    const rowsToAdd = Math.max(0, (rowIndex + values.length) - currentLen);
    if (rowsToAdd > 0) {
      const blanks = Array.from({ length: rowsToAdd }, (_, i) => ({
        seq: currentLen + i + 1, original_description: '', name: '', supplier_code: '',
        ean: '', sku: '', unit: '', multiplier: 1, qty: null, price: 0, product_price: 0, verified: false, product_id: null, brand: '',
      }));
      setViewingReviewNote(prev => prev ? { ...prev, items: [...prev.items, ...blanks] } : prev);
      setViewingNoteVerified(prev => [...prev, ...blanks.map(() => false)]);
      setViewingNoteQtys(prev => [...prev, ...blanks.map(() => null)]);
      setViewingNoteItemPrices(prev => [...prev, ...blanks.map(() => 0)]);
      setViewingNoteSellPrices(prev => [...prev, ...blanks.map(() => 0)]);
      setViewingNoteEans(prev => [...prev, ...blanks.map(() => '')]);
      setViewingNoteSkus(prev => [...prev, ...blanks.map(() => '')]);
      setViewingNoteUnits(prev => [...prev, ...blanks.map(() => '')]);
      setViewingNoteMultipliers(prev => [...prev, ...blanks.map(() => 1)]);
      setViewingNoteMeasureConverted(prev => [...prev, ...blanks.map(() => false)]);
      setViewingNoteReviewTimestamps(prev => [...prev, ...blanks.map(() => null)]);
      setViewingNoteDistribuicao(prev => [...prev, ...blanks.map(() => '')]);
      setViewingNoteDistribByCompany(prev => [...prev, ...blanks.map(() => ({}))]);
      setViewingDistribMode(prev => [...prev, ...blanks.map(() => '')]);
      setAdjColumns(prev => prev.map(col => ({ ...col, items: [...col.items, ...blanks.map(() => '')] })));
      setViewingNoteDiscrepancies(prev => [...prev, ...blanks.map(() => null)]);
      setViewingNoteEanVariants(prev => [...prev, ...blanks.map(() => [])]);
      setViewingNoteExtraEans(prev => [...prev, ...blanks.map(() => [])]);
    }

    setAdjColumns(prev => prev.map((c, ci) => {
      if (ci !== colIdx) return c;
      const items = [...c.items];
      values.forEach((v, i) => { items[rowIndex + i] = v; });
      return { ...c, items };
    }));
  };

  const handleMultiLinkItemSearch = async () => {
    if (!multiLinkItemSearch.trim()) return;
    const { data } = await supabase.from('products').select('id, name, sku, ean, price')
      .or(`name.ilike.%${multiLinkItemSearch}%,sku.ilike.%${multiLinkItemSearch}%,ean.ilike.%${multiLinkItemSearch}%`)
      .limit(8);
    setMultiLinkItemResults(data || []);
  };

  const handleMultiLinkItemAdd = async (product: any) => {
    if (!multiLinkItemQty.trim() || parseFloat(multiLinkItemQty) <= 0) {
      setNotification({ type: 'error', message: 'Informe a quantidade antes de adicionar.' });
      return;
    }
    // Busca conversão cadastrada em supplier_units para pré-preencher o Mult
    let defaultMultiplier = '1';
    try {
      const { data: units } = await supabase
        .from('supplier_units')
        .select('multiplier')
        .eq('product_id', product.id)
        .limit(1);
      if (units && units.length > 0) {
        defaultMultiplier = String(units[0].multiplier);
      }
    } catch { /* ignora erro, usa mult=1 */ }
    const srcItem = viewingReviewNote?.items[multiLinkItemIdx!];
    setMultiLinkItemEntries(prev => [...prev, { product, qty: multiLinkItemQty, multiplier: defaultMultiplier, supplierCode: srcItem?.supplier_code || '' }]);
    setMultiLinkItemSearch(''); setMultiLinkItemQty(''); setMultiLinkItemResults([]);
  };

  const handleMultiLinkItemCreateProduct = async () => {
    if (!multiLinkItemNewName.trim()) { setNotification({ type: 'error', message: 'Nome é obrigatório.' }); return; }
    if (!multiLinkItemQty.trim() || parseFloat(multiLinkItemQty) <= 0) { setNotification({ type: 'error', message: 'Informe a quantidade.' }); return; }
    setMultiLinkItemCreating(true);
    try {
      const sku = multiLinkItemNewSku.trim() || null;
      const srcItem = viewingReviewNote?.items[multiLinkItemIdx!];
      const { data: created, error } = await supabase.from('products')
        .insert({ name: multiLinkItemNewName.trim(), sku, ean: multiLinkItemNewEan.trim() || null, count: 0, is_low: true, status: 'Fora de Estoque', brand: srcItem?.brand || null })
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

  const handleSaveMultiLinkItem = async () => {
    if (multiLinkItemIdx === null || !viewingReviewNote || multiLinkItemEntries.length === 0) return;
    captureSnapshot();
    const n = viewingReviewNote.items.length;
    const srcIdx = multiLinkItemIdx;
    const sourceItem = viewingReviewNote.items[srcIdx];
    // Preço efetivo da linha origem: preferir o estado editável ao preço salvo no JSON
    const srcPrice = viewingNoteItemPrices[srcIdx] ?? sourceItem.price ?? 0;

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
    const pDBC = pad(viewingNoteDistribByCompany, (i) => viewingReviewNote.items[i]?.distribuicaoByCompany || {});
    const pU = pad(viewingNoteUnits, (i) => viewingReviewNote.items[i]?.unit || 'UN');
    const pM = pad(viewingNoteMultipliers, (i) => viewingReviewNote.items[i]?.multiplier || 1);
    const pC = pad(viewingNoteMeasureConverted, () => false);
    const pT = pad(viewingNoteReviewTimestamps, () => null as string | null);
    const pDisc = pad(adjColumns[0]?.items ?? [], () => '');
    const pSur = pad(adjColumns[1]?.items ?? [], () => '');
    const pDiscr = pad(viewingNoteDiscrepancies, () => null as DiscrepancyData | null);
    const pIP = pad(viewingNoteItemPrices, (i) => viewingReviewNote.items[i]?.price ?? 0);

    const sp = <T,>(arr: T[], reps: T[]): T[] => { const r = [...arr]; r.splice(srcIdx, 1, ...reps); return r; };

    const newItems = multiLinkItemEntries.map(e => {
      const mult = parseFloat(e.multiplier) || 1;
      const entryPrice = mult > 1 ? parseFloat((srcPrice / mult).toFixed(6)) : srcPrice;
      return {
        ...sourceItem,
        price: entryPrice,
        name: e.product.name,
        sku: e.product.sku || sourceItem.sku,
        ean: e.product.ean || sourceItem.ean,
        product_id: e.product.id,
        product_price: e.product.price || 0,
        qty: parseFloat(e.qty) || 0,
        status_translation: 'Identificado (SKU/EAN)',
        multiLinked: true,
      };
    });

    setViewingReviewNote({ ...viewingReviewNote, items: sp(viewingReviewNote.items, newItems) });
    setViewingNoteVerified(sp(pV, newItems.map(() => false)));
    setViewingNoteSellPrices(sp(pP, multiLinkItemEntries.map(e => e.product.price || 0)));
    setViewingNoteEans(sp(pE, multiLinkItemEntries.map(e => e.product.ean || '')));
    setViewingNoteSkus(sp(pS, multiLinkItemEntries.map(e => e.product.sku || '')));
    setViewingNoteQtys(sp(pQ, multiLinkItemEntries.map(e => parseFloat(e.qty) || 0)));
    setViewingNoteDistribuicao(sp(pD, newItems.map(() => pD[srcIdx])));
    // Distribuição por loja NÃO é copiada pros itens gerados pelo split — copiar cegaria a
    // mesma quantidade pra vários produtos diferentes, violando o limite por item.
    setViewingNoteDistribByCompany(sp(pDBC, newItems.map(() => ({}))));
    setViewingNoteUnits(sp(pU, newItems.map(() => pU[srcIdx])));
    setViewingNoteMultipliers(sp(pM, newItems.map(() => pM[srcIdx])));
    setViewingNoteMeasureConverted(sp(pC, newItems.map(() => pC[srcIdx])));
    setViewingNoteReviewTimestamps(sp(pT, newItems.map(() => null)));
    setAdjColumns(prev => prev.map((col, ci) => {
      const pItems = ci === 0 ? pDisc : ci === 1 ? pSur : col.items;
      return { ...col, items: sp(pItems, newItems.map(() => pItems[srcIdx] ?? '')) };
    }));
    setViewingNoteDiscrepancies(sp(pDiscr, newItems.map(() => null)));
    setViewingNoteItemPrices(sp(pIP, multiLinkItemEntries.map(e => {
      const mult = parseFloat(e.multiplier) || 1;
      return mult > 1 ? parseFloat((srcPrice / mult).toFixed(6)) : srcPrice;
    })));

    // Tradução permanente
    if (multiLinkSaveTranslation) {
      const supplierId = await resolveNoteSupplierId();
      if (!supplierId) {
        setNotification({ type: 'error', message: 'Não foi possível salvar a tradução permanente: esta nota não tem um fornecedor identificado.' });
      } else {
        // supplier_mappings tem UNIQUE (supplier_id, supplier_description) — como o "Vincular Vários"
        // divide UMA descrição entre VÁRIOS produtos, só o primeiro pode reivindicar a descrição
        // (via upsert, atualizando um mapeamento anterior se já existir); os demais são salvos
        // somente pelo código próprio de cada produto, que não tem essa restrição de unicidade.
        const seen = new Set<string>();
        let descriptionClaimed = false;
        for (const e of multiLinkItemEntries) {
          if (seen.has(e.product.id)) continue;
          seen.add(e.product.id);
          const sku = e.supplierCode.trim() || null;
          if (!descriptionClaimed && sourceItem.original_description) {
            descriptionClaimed = true;
            const { error: mappingErr } = await supabase.from('supplier_mappings')
              .upsert({
                supplier_id: supplierId,
                supplier_sku: sku,
                supplier_description: sourceItem.original_description,
                internal_product_id: e.product.id,
              }, { onConflict: 'supplier_id,supplier_description' });
            if (mappingErr) console.warn('Erro ao salvar tradução permanente:', mappingErr.message);
          } else if (sku) {
            const { error: mappingErr } = await supabase.from('supplier_mappings').insert({
              supplier_id: supplierId,
              supplier_sku: sku,
              supplier_description: null,
              internal_product_id: e.product.id,
            });
            if (mappingErr) console.warn('Erro ao salvar tradução permanente:', mappingErr.message);
          }
        }
      }
    }

    setNotification({ type: 'success', message: `${newItems.length} linha${newItems.length !== 1 ? 's' : ''} criada${newItems.length !== 1 ? 's' : ''}.` });
    setMultiLinkSaveTranslation(false);
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
        const { data: extraEanRows } = await supabase.from('product_ean_codes').select('ean, product_id');
        const eanToProductId = buildEanToProductId(currentProducts || [], extraEanRows || []);
        const { data: unitConversions } = await supabase.from('supplier_units').select('*');

        // Filter mappings by supplier if selected
        let mappingQuery = supabase.from('supplier_mappings').select('*');
        if (selectedImportSupplierId) {
          mappingQuery = mappingQuery.eq('supplier_id', selectedImportSupplierId);
        }
        const { data: filterMappings } = await mappingQuery;

        // Produtos Mãe: EAN da embalagem (caixa/fardo) -> produto filho + fator de conversão.
        // Prioridade de match mais alta que o dicionário textual — o EAN da caixa é único e universal.
        const { data: motherPackages } = await supabase.from('product_mother_packages').select('*');
        const { data: motherExtraEans } = await supabase.from('product_mother_package_ean_codes').select('ean, mother_package_id');
        const motherEanToPackage = new Map<string, any>();
        (motherPackages || []).forEach((mp: any) => { if (mp.ean) motherEanToPackage.set(mp.ean, mp); });
        (motherExtraEans || []).forEach((row: any) => {
          const mp = (motherPackages || []).find((m: any) => m.id === row.mother_package_id);
          if (mp) motherEanToPackage.set(row.ean, mp);
        });
        const motherPackageById = new Map<string, any>((motherPackages || []).map((mp: any) => [mp.id, mp]));

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

          // 0. Produto Mãe: EAN da embalagem (caixa/fardo) bate primeiro que qualquer outro critério
          const motherPackage = finalEan ? motherEanToPackage.get(finalEan) : undefined;

          // Try to find product by SKU, EAN (principal ou adicional) ou mapping
          const finalEanProductId = finalEan ? eanToProductId.get(finalEan) : undefined;
          let product = motherPackage
            ? currentProducts?.find(p => p.id === motherPackage.child_product_id)
            : currentProducts?.find(p => (sku && p.sku === sku) || (finalEanProductId && p.id === finalEanProductId));
          let statusTranslation = motherPackage ? 'Traduzido (Caixa)' : 'Identificado (SKU/EAN)';
          let verified = !!product;
          let motherMatch = motherPackage || null;

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

            if (mapping?.mother_package_id) {
              // Código/descrição do fornecedor mapeado direto para um Produto Mãe (embalagem)
              const mp = motherPackageById.get(mapping.mother_package_id);
              if (mp) {
                product = currentProducts?.find(p => p.id === mp.child_product_id);
                if (product) {
                  statusTranslation = 'Traduzido (Caixa)';
                  verified = true;
                  motherMatch = mp;
                }
              }
            } else if (mapping) {
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

          // Apply Unit Conversion — via Produto Mãe (prioridade) ou tabela de unidades do fornecedor
          let multiplier = 1;
          if (motherMatch) {
            multiplier = Number(motherMatch.units_per_child) || 1;
          } else if (product && unit) {
            const conversion = unitConversions?.find(c =>
              c.product_id === product?.id && normalize(c.unit_name) === normalize(unit)
            );
            if (conversion) {
              multiplier = Number(conversion.multiplier);
            }
          }

          const finalQty = qty * multiplier;
          const rawPrice = isNaN(price) ? 0 : price;
          // price fica com o valor BRUTO lido na nota (preço da embalagem, ex: R$150,00 a
          // caixa) — em todo o app o custo por unidade é sempre recalculado como price /
          // multiplier (cost/markup/Valor Total/Histórico em Notas). Dividir aqui também
          // dobraria a divisão e o custo por unidade do produto filho ficaria errado.

          processedItems.push({
            sku: product?.sku || sku || '',
            ean: finalEan || product?.ean || '',
            name: verified ? (product?.name || 'Não Identificado') : (description || 'Sem Descrição'),
            original_description: description,
            unit: unit || 'UN',
            multiplier,
            qty: finalQty,
            original_qty: qty,
            price: rawPrice,
            original_price: rawPrice,
            product_price: product?.price || 0,
            status_translation: statusTranslation,
            product_id: product?.id,
            verified: verified,
            mother_package_id: motherMatch?.id || null,
            mother_package_name: motherMatch?.name || null,
            mother_package_ean: motherMatch?.ean || null,
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

  const fetchCompanies = async () => {
    const { data } = await supabase.from('companies').select('id, nome_fantasia, logo, created_at').order('nome_fantasia');
    setCompanies(data || []);
  };

  const fetchManufacturers = async () => {
    const { data } = await supabase.from('manufacturers').select('*').order('name');
    setManufacturers(data || []);
  };

  const [suggestingCode, setSuggestingCode] = useState(false);
  const suggestManufacturerCode = async (manufacturerId: string | null, apply: (code: string) => void) => {
    if (!manufacturerId) return;
    setSuggestingCode(true);
    try {
      const { data, error } = await supabase.rpc('get_next_manufacturer_code', { p_manufacturer_id: manufacturerId });
      if (error) throw error;
      if (data) apply(data as string);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao gerar código.' });
    } finally {
      setSuggestingCode(false);
    }
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
    if (!selectedManualProduct || manualStockChange === 0 || !manualStockReason) return;

    const previousCount = selectedManualProduct.count || 0;
    // Queda grande exige o toggle de confirmação explícita antes de aplicar (ver isLargeStockDrop).
    if (isLargeStockDrop(previousCount, manualStockChange) && !manualStockConfirmDrop) return;

    setIsUpdatingManualStock(true);
    try {
      const newCount = Math.max(0, previousCount + manualStockChange);

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

      // Grava a trilha de auditoria — sem isso, ninguém consegue responder depois
      // por que o estoque de um produto mudou (ver risco levantado no plano da Fase 0).
      const { error: adjustmentError } = await supabase.from('stock_adjustments').insert({
        product_id: selectedManualProduct.id,
        previous_count: previousCount,
        new_count: newCount,
        delta: newCount - previousCount,
        reason: manualStockReason,
        note: manualStockNote.trim() || null,
        source: 'manual',
        employee_id: colaboradorId || null,
        employee_name: colaboradorNome || null,
      });
      if (adjustmentError) console.error('Erro ao gravar histórico de ajuste de estoque:', adjustmentError);

      setNotification({ type: 'success', message: 'Estoque ajustado com sucesso!' });
      setShowManualStockModal(false);
      setSelectedManualProduct(null);
      setManualStockChange(0);
      setManualStockReason('');
      setManualStockNote('');
      setManualStockConfirmDrop(false);
      setShowManualStockHistory(false);
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

  // Busca o histórico de ajustes do produto selecionado no módulo de Ajustar Estoque.
  const fetchManualStockHistory = async (productId: string) => {
    const { data, error } = await supabase
      .from('stock_adjustments')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      console.error('Erro ao buscar histórico de ajustes:', error);
      return;
    }
    setManualStockHistory(data || []);
  };

  const openEditModal = (product: any, tab: 'dados' | 'mae' | 'historico' = 'dados') => {
    setEditingProduct({
      ...product,
      originalCount: product.count || 0,
      minStock: product.min_stock ?? null,
      manufacturerId: product.manufacturer_id ?? null,
    });
    setEditingProductExtraEans((product.extraEans || []).map((e: any) => ({ ean: e.ean, description: e.description || '' })));
    setEditProductTab(tab);
    setEditProductHistoryEans(
      [product.ean, ...(product.extraEans || []).map((e: any) => e.ean)]
        .map((e: string) => (e || '').trim())
        .filter(Boolean)
    );
    const initialPrice = isNaN(product.price) ? 0 : (product.price || 0);
    setEditProductPriceDisplay(initialPrice > 0 ? initialPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
    setEditProductCostPriceDisplay('');
    setOriginalProductSnapshot({
      name: product.name,
      sku: product.sku,
      price: isNaN(product.price) ? 0 : (product.price || 0),
      count: isNaN(product.count) ? 0 : (product.count || 0),
      location: product.location || '',
      ean: product.ean || '',
      category: product.category || '',
      subcategory: product.subcategory || '',
      brand: product.brand || '',
      status: product.status || '',
      min_stock: product.min_stock ?? null,
    });
    setIsAddingNew({
      location: false,
      category: false,
      subcategory: false,
      brand: false
    });
    if (companies.length === 0) fetchCompanies();
    setEditProductCompanyId('');
    setEditProductStockCache({});
    setShowEditModal(true);
    setShowDeleteConfirm(false);
  };

  // Ao abrir o modal (ou assim que a lista de empresas carrega), seleciona a empresa padrão
  // e pré-popula o cache com os valores de products.count/price — que já espelham essa empresa.
  // Preço de Custo não é espelhado em products (é exclusivo de product_company_stock), então
  // precisa de uma busca própria em vez do atalho síncrono usado para count/price.
  useEffect(() => {
    if (showEditModal && editingProduct && primaryCompanyId && !editProductCompanyId) {
      setEditProductCompanyId(primaryCompanyId);
      setEditProductStockCache(prev => ({
        ...prev,
        [primaryCompanyId]: {
          count: isNaN(editingProduct.count) ? 0 : (editingProduct.count || 0),
          price: isNaN(editingProduct.price) ? 0 : (editingProduct.price || 0),
          costPrice: 0,
        },
      }));
      (async () => {
        const { data } = await supabase
          .from('product_company_stock')
          .select('cost_price')
          .eq('product_id', editingProduct.id)
          .eq('company_id', primaryCompanyId)
          .maybeSingle();
        const costPrice = parseFloat(data?.cost_price) || 0;
        setEditProductStockCache(prev => ({ ...prev, [primaryCompanyId]: { ...prev[primaryCompanyId], costPrice } }));
        setEditingProduct((p: any) => p ? { ...p, costPrice } : p);
        setEditProductCostPriceDisplay(costPrice > 0 ? costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
      })();
    }
  }, [showEditModal, editingProduct, primaryCompanyId, editProductCompanyId]);

  // Troca de Empresa na seção Estoque & Preço: salva a empresa anterior (se o produto já existe
  // e havia edição pendente) e carrega/cacheia os valores da empresa recém-selecionada.
  const handleEditProductCompanyChange = async (nextCompanyId: string) => {
    if (!editingProduct || !nextCompanyId || nextCompanyId === editProductCompanyId) return;
    const prevCompanyId = editProductCompanyId;
    const prevCount = isNaN(editingProduct.count) ? 0 : (editingProduct.count || 0);
    const prevPrice = isNaN(editingProduct.price) ? 0 : (editingProduct.price || 0);
    const prevCostPrice = isNaN(editingProduct.costPrice) ? 0 : (editingProduct.costPrice || 0);

    // Persiste a empresa anterior antes de trocar, para não perder edição feita nela nesta sessão.
    if (prevCompanyId && editingProduct.id) {
      try {
        await supabase.from('product_company_stock').upsert({
          product_id: editingProduct.id,
          company_id: prevCompanyId,
          count: prevCount,
          price: prevPrice,
          // Edição manual de custo sobrescreve direto (sem a trava de data usada na aprovação
          // de notas) e registra hoje como referência, pra não confundir essa trava depois.
          cost_price: prevCostPrice,
          cost_received_date: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'product_id,company_id' });
        if (prevCompanyId === primaryCompanyId) {
          await supabase.from('products').update({ count: prevCount, price: prevPrice }).eq('id', editingProduct.id);
        }
        setEditProductStockCache(prev => ({ ...prev, [prevCompanyId]: { count: prevCount, price: prevPrice, costPrice: prevCostPrice } }));
      } catch (err: any) {
        setNotification({ type: 'error', message: 'Erro ao salvar Estoque & Preço da empresa anterior.' });
      }
    }

    let next = editProductStockCache[nextCompanyId];
    if (!next && editingProduct.id) {
      const { data } = await supabase.from('product_company_stock')
        .select('count, price, cost_price')
        .eq('product_id', editingProduct.id)
        .eq('company_id', nextCompanyId)
        .maybeSingle();
      next = data ? { count: data.count || 0, price: data.price || 0, costPrice: parseFloat((data as any).cost_price) || 0 } : { count: 0, price: 0, costPrice: 0 };
      setEditProductStockCache(prev => ({ ...prev, [nextCompanyId]: next! }));
    }
    next = next || { count: 0, price: 0, costPrice: 0 };
    setEditingProduct((prev: any) => ({ ...prev, count: next!.count, price: next!.price, costPrice: next!.costPrice }));
    setEditProductPriceDisplay(next.price > 0 ? next.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
    setEditProductCostPriceDisplay(next.costPrice > 0 ? next.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
    setEditProductCompanyId(nextCompanyId);
  };

  // Empresa padrão do formulário de Novo Produto — produto ainda não existe, então a troca
  // de empresa só mexe em estado local (nada é persistido até o "Adicionar Produto").
  useEffect(() => {
    if (showAddModal && primaryCompanyId && !newProductCompanyId) setNewProductCompanyId(primaryCompanyId);
  }, [showAddModal, primaryCompanyId, newProductCompanyId]);

  const handleNewProductCompanyChange = (nextCompanyId: string) => {
    if (!nextCompanyId || nextCompanyId === newProductCompanyId) return;
    const currentCount = isNaN(newProduct.count) ? 0 : newProduct.count;
    const currentPrice = isNaN(newProduct.price) ? 0 : newProduct.price;
    const updatedMap = { ...newProductStockByCompany, [newProductCompanyId]: { count: currentCount, price: currentPrice } };
    setNewProductStockByCompany(updatedMap);
    const next = updatedMap[nextCompanyId] || { count: 0, price: 0 };
    setNewProduct(prev => ({ ...prev, count: next.count, price: next.price }));
    setNewProductPriceDisplay(next.price > 0 ? next.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
    setNewProductCompanyId(nextCompanyId);
  };

  // Histórico em Notas: percorre as notas já aprovadas (mesmo state usado pela lista de Entrada
  // de Mercadoria — até as 300 mais recentes) procurando itens cujo EAN bate com o produto em
  // edição, considerando também os EANs adicionais cadastrados.
  const editProductEanHistory = useMemo(() => {
    if (editProductHistoryEans.length === 0) return [];
    const targetEans = new Set(editProductHistoryEans);
    const matches: { note: ReviewNote; item: any; idx: number }[] = [];
    for (const note of reviewNotes) {
      (note.items as any[] || []).forEach((item, idx) => {
        const itemEan = String(item?.ean || '').trim();
        if (itemEan && targetEans.has(itemEan)) matches.push({ note, item, idx });
      });
    }
    return matches;
  }, [editProductHistoryEans, reviewNotes]);

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
        {isSidebarCollapsed && !isMobileView && (
          <motion.button
            layoutId="sidebar-toggle"
            onClick={() => setIsSidebarCollapsed(false)}
            title="Mostrar menu"
            className={cn(
              'fixed left-0 top-10 z-40 w-7 h-[52px] rounded-r-2xl',
              'bg-on-surface/[0.10] hover:bg-on-surface/[0.18] text-on-surface/60 hover:text-on-surface',
              'flex items-center justify-center outline-none',
              'transition-colors duration-150 active:scale-[0.93]'
            )}
          >
            <ChevronRight size={16} strokeWidth={2.5} />
          </motion.button>
        )}
        <main className={cn('flex-1 min-w-0 overflow-x-clip', (isMobileView || isSidebarCollapsed) ? 'ml-0' : 'ml-[80px]')}>
          <TopNav
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeTab={activeTab}
            notifications={appNotifications}
            onMarkAllRead={handleMarkAllNotificationsRead}
            onGoToNote={handleGoToNote}
            onGoToNotificationsPage={() => setActiveTab('Notificações')}
            hideViewToggle={isMobileView && (activeTab === 'Inventory' || activeTab === 'Controle Financeiro')}
          />
          <div className={cn(
            'pb-8',
            (!isMobileView && isSidebarCollapsed) ? 'max-w-none' : 'max-w-[1400px]',
            isMobileView ? 'px-5 space-y-4' : 'px-7 space-y-8',
            isMobileView ? (activeTab === 'Inventory' ? 'pt-5' : 'pt-[74px]') : 'pt-5'
          )}>
            {activeTab === 'Inventory' ? (
                <InventoryManager 
                  products={products}
                  loading={loading}
                  isConfigured={isConfigured}
                  importing={importing}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  onAdd={() => {
                    if (companies.length === 0) fetchCompanies();
                    setNewProductCompanyId('');
                    setNewProductStockByCompany({});
                    setShowAddModal(true);
                  }}
                  onOpenProductList={() => setShowProductBulkTable(true)}
                  onEdit={openEditModal}
                  motherChildProductIds={motherChildProductIds}
                  onViewMotherPackages={(product) => openEditModal(product, 'mae')}
                  onStockUpdate={handleStockUpdate}
                  onOpenMobileBulkTable={() => setShowMobileTypeModal(true)}
                  stockFileInputRef={stockFileInputRef}
                  setShowStockUpdateChoiceModal={setShowStockUpdateChoiceModal}
                />
            ) : activeTab === 'Requisições' ? (
                <RequestCenter
                  requests={requests}
                  products={products}
                  reviewNotes={reviewNotes}
                  onAddRequest={() => {
                    setShowAddRequestModal(true);
                    setIsReviewingExistingRequest(false);
                    setFoundProductForRequest(null);
                    setRequestSearchQuery({ sku: '', ean: '' });
                    setRequestDraftChanges({});
                    setEditingField(null);
                  }}
                  onEditRequest={(request) => {
                    const changes = JSON.parse(request.requested_changes);
                    if (changes.is_task) {
                      setTaskDetailRequest(request);
                      setTaskDetailData(changes);
                      setShowTaskDetailModal(true);
                    } else if (changes.is_product_alteration) {
                      setAlterationDetailData(changes);
                      setShowAlterationDetailModal(true);
                    } else if (changes.is_bulk_products) {
                      setBulkDraftUnderReview(request);
                      setBulkDraftEditedItems(changes.items || []);
                      setShowBulkDraftReviewModal(true);
                    } else if (changes.is_new_product) {
                      setIsRequestingNewProduct(true);
                      setIsReviewingExistingRequest(true);
                      setNewProductRequest(changes);
                      setShowAddRequestModal(true);
                    } else {
                      setIsRequestingNewProduct(false);
                      setIsReviewingExistingRequest(true);
                      setFoundProductForRequest(request.products);
                      setRequestDraftChanges(changes);
                      setShowAddRequestModal(true);
                    }
                  }}
                  onApproveRequest={(id) => setShowRequestConfirmModal({ show: true, requestId: id })}
                  onDeleteRequest={handleDeleteRequest}
                  onToggleCheck={handleToggleCheck}
                  onApproveMultiple={handleBulkApproveRequests}
                  onDeleteMultiple={handleBulkDeleteRequests}
                />
            ) : activeTab === 'Entrada de Mercadoria' ? (
                <LogisticsCenter
                  importing={importing}
                  onImportClick={() => {
                    setShowImportSupplierModal(true);
                    fetchSuppliers();
                  }}
                  onManualNoteClick={handleCreateManifestNote}
                  setNotification={setNotification}
                  reviewNotes={reviewNotes}
                  onViewReviewNote={(note) => {
                    openReviewNoteWithLock(note, () => setTimeout(() => captureSnapshot(), 0));
                  }}
                  onViewMobile={(note) => {
                    openReviewNoteWithLock(note, () => setNoteModeChoiceOpen(true));
                  }}
                  onApproveNote={handleApproveNote}
                  onLinkNote={handleLinkNote}
                  pendingOpenNoteId={pendingOpenNoteId}
                  onPendingOpenNoteHandled={() => setPendingOpenNoteId(null)}
                  bulkDrafts={bulkDrafts}
                  onApproveBulkDraft={handleApproveBulkDraft}
                  onDeleteBulkDraft={handleDeleteBulkDraft}
                  colaboradorId={colaboradorId}
                  colaboradorNome={colaboradorNome}
                />
            ) : activeTab === 'Pedidos de Compra' ? (
                // Inalcançável: item removido da navegação (ver components/Sidebar.tsx). Bloco mantido para reativação futura.
                <PurchaseOrderManager />
            ) : activeTab === 'Controle Financeiro' ? (
                isMobileView ? (
                  <MobileFinancePage
                    initialFocusTxId={pendingFinanceTxId}
                    onInitialFocusHandled={() => setPendingFinanceTxId(null)}
                  />
                ) : (
                  <FinanceManager
                    initialFocusTxId={pendingFinanceTxId}
                    onInitialFocusHandled={() => setPendingFinanceTxId(null)}
                  />
                )
            ) : activeTab === 'Recursos Humanos' ? (
                isMobileView ? (
                  <MobileHRPage
                    requests={requests}
                    onOpenTask={(request, taskData) => {
                      setTaskDetailRequest(request);
                      setTaskDetailData(taskData);
                      setShowTaskDetailModal(true);
                    }}
                    onGoToFinance={() => setActiveTab('Controle Financeiro')}
                  />
                ) : (
                  <HRManager
                    requests={requests}
                    onOpenTask={(request, taskData) => {
                      setTaskDetailRequest(request);
                      setTaskDetailData(taskData);
                      setShowTaskDetailModal(true);
                    }}
                    onGoToFinance={() => setActiveTab('Controle Financeiro')}
                  />
                )
            ) : activeTab === 'Notificações' ? (
                <NotificationsPage
                  notifications={appNotifications}
                  onGoToNote={handleGoToNote}
                  onMarkAllRead={handleMarkAllNotificationsRead}
                />
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
          isMobileView ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex flex-col bg-[#EFE8D4] dark:bg-[#1E1E18]"
          >
            {/* Header — mobile: tela cheia estilo iOS */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3.5 border-b border-black/[0.09] dark:border-white/[0.07]">
              <button
                type="button"
                onClick={() => setIsEditingProductFields(v => !v)}
                title={isEditingProductFields ? 'Concluir edição' : 'Editar campos'}
                className={cn(
                  'w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0 transition-colors active:scale-95',
                  isEditingProductFields
                    ? 'bg-primary text-white'
                    : 'bg-black/[0.06] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] text-[#1A1A0E] dark:text-[#F2F0E3]'
                )}
              >
                <Pencil size={15} />
              </button>
              <h2 className="text-[15px] font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3] tracking-tight truncate px-3">Editar Produto</h2>
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setIsAddingNew({ location: false, category: false, subcategory: false, brand: false });
                }}
                className="w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0 bg-black/[0.06] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] text-[#1A1A0E] dark:text-[#F2F0E3] active:scale-95 transition-transform"
              >
                <X size={17} />
              </button>
            </div>

            {/* Tabs — pill */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-3 overflow-x-auto border-b border-black/[0.09] dark:border-white/[0.07]">
              <button
                type="button"
                onClick={() => setEditProductTab('dados')}
                className={cn(
                  'shrink-0 px-4 py-2 rounded-full text-[11px] font-extrabold uppercase tracking-wide transition-colors whitespace-nowrap',
                  editProductTab === 'dados'
                    ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                    : 'bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.09] dark:border-white/[0.08] text-secondary/70'
                )}
              >
                Dados
              </button>
              <button
                type="button"
                onClick={() => setEditProductTab('mae')}
                className={cn(
                  'shrink-0 px-4 py-2 rounded-full text-[11px] font-extrabold uppercase tracking-wide transition-colors whitespace-nowrap',
                  editProductTab === 'mae'
                    ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                    : 'bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.09] dark:border-white/[0.08] text-secondary/70'
                )}
              >
                Produto Mãe
              </button>
              <button
                type="button"
                onClick={() => setEditProductTab('historico')}
                className={cn(
                  'shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-extrabold uppercase tracking-wide transition-colors whitespace-nowrap',
                  editProductTab === 'historico'
                    ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                    : 'bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.09] dark:border-white/[0.08] text-secondary/70'
                )}
              >
                Histórico em Notas
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none',
                  editProductTab === 'historico' ? 'bg-black/10 dark:bg-black/15' : 'bg-black/[0.06] dark:bg-white/[0.08] text-secondary/70'
                )}>
                  {editProductEanHistory.length}
                </span>
              </button>
            </div>

            <form
              id="editProductForm"
              onSubmit={handleEditProduct}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault(); }}
              className="flex-1 min-h-0 overflow-y-auto"
            >
                {editProductTab === 'dados' && editStatus === 'success' && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-4 mt-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg text-sm font-bold flex items-center gap-2"
                  >
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                    Produto atualizado com sucesso!
                  </motion.div>
                )}

                {editProductTab === 'dados' && editStatus === 'error' && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-4 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium"
                  >
                    {editError}
                  </motion.div>
                )}

                {editProductTab === 'dados' && (() => {
                  const editing = isEditingProductFields;
                  const sectionLabelCls = 'flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mx-1 mb-2';
                  const cardCls = 'bg-white dark:bg-[#252520] border border-black/[0.10] dark:border-white/[0.07] rounded-2xl overflow-hidden shadow-sm';
                  const rowCls = 'flex items-center gap-3 px-3.5 py-3 border-b border-black/[0.06] dark:border-white/[0.06] last:border-b-0';
                  const rowIconCls = 'w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0';
                  const rowLabelCls = 'text-[12.5px] font-semibold text-secondary/65 shrink-0';
                  const rowValueCls = 'flex-1 min-w-0 text-right text-[13px] font-extrabold text-on-surface truncate';
                  const fieldRowCls = 'px-3.5 py-3 border-b border-black/[0.06] dark:border-white/[0.06] last:border-b-0';
                  const fieldLabelCls = 'block text-[9.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-1.5';
                  const inputCls = 'w-full bg-black/[0.035] dark:bg-white/[0.05] border border-black/[0.10] dark:border-white/[0.10] rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all';
                  const statusOptions: { value: string; label: string }[] = [
                    { value: 'Estoque Baixo', label: 'Estoque Baixo' },
                    { value: 'Em Estoque', label: 'Em Estoque' },
                    { value: 'Estoque em Alta', label: 'Estoque em Alta' },
                    { value: 'Fora de Estoque', label: 'Fora de Estoque' },
                  ];
                  const editProductCompanyName = companies.find((c: any) => c.id === editProductCompanyId)?.nome_fantasia || 'Não definida';
                  return (
                <div className="pb-8">
                  {/* Imagem — topo da janela */}
                  <div className="relative w-full h-52 bg-surface-container overflow-hidden">
                    {editingProduct.image ? (
                      <ProductImage src={editingProduct.image} alt={editingProduct.name} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-secondary/25">
                        <ImageIcon size={40} />
                      </div>
                    )}
                    {editing && (
                      <button
                        type="button"
                        onClick={() => editImageInputRef.current?.click()}
                        disabled={uploading}
                        className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/65 backdrop-blur-md text-white text-[10.5px] font-extrabold px-3 py-2 rounded-full"
                      >
                        {uploading ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Pencil size={12} />}
                        Alterar imagem
                      </button>
                    )}
                    <input
                      type="file"
                      ref={editImageInputRef}
                      onChange={(e) => handleImageUpload(e, true)}
                      className="hidden"
                      accept="image/*"
                    />
                  </div>
                  {editing && (
                    <div className="px-4 pt-3">
                      <input
                        type="text"
                        value={editingProduct.image}
                        onChange={(e) => setEditingProduct({...editingProduct, image: e.target.value})}
                        className={inputCls}
                        placeholder="https://... (URL da imagem)"
                      />
                    </div>
                  )}

                  <div className="px-4 pt-5 space-y-5">
                  <div>
                    <div className={sectionLabelCls}><Package size={12} className="text-primary" />Identificação</div>
                    <div className={cardCls}>
                      {!editing ? (
                        <>
                          <div className={rowCls}>
                            <div className={rowIconCls}><Package size={12} /></div>
                            <span className={rowLabelCls}>Nome</span>
                            <span className={rowValueCls}>{editingProduct.name || 'Sem nome'}</span>
                          </div>
                          <div className={rowCls}>
                            <div className={rowIconCls}><Hash size={12} /></div>
                            <span className={rowLabelCls}>SKU</span>
                            <span className={cn(rowValueCls, !editingProduct.sku && 'text-secondary/35 font-semibold')}>{editingProduct.sku || 'Não definido'}</span>
                          </div>
                          <div className={rowCls}>
                            <div className={rowIconCls}><Barcode size={12} /></div>
                            <span className={rowLabelCls}>EAN</span>
                            <span className={cn(rowValueCls, 'font-mono tracking-wide', !editingProduct.ean && 'text-secondary/35 font-semibold')}>{editingProduct.ean || 'Não definido'}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={fieldRowCls}>
                            <label className={fieldLabelCls}>Nome do Produto</label>
                            <input
                              required
                              type="text"
                              value={editingProduct.name}
                              onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})}
                              className={inputCls}
                            />
                          </div>
                          <div className={fieldRowCls}>
                            <label className={fieldLabelCls}>SKU (Código Interno)</label>
                            <div className="flex gap-2 flex-1">
                              <input
                                type="text"
                                value={editingProduct.sku}
                                onChange={(e) => setEditingProduct({...editingProduct, sku: e.target.value})}
                                className={inputCls}
                              />
                              <button
                                type="button"
                                disabled={!editingProduct.manufacturerId || suggestingCode}
                                onClick={() => suggestManufacturerCode(editingProduct.manufacturerId, code => setEditingProduct((p: any) => ({...p, sku: code})))}
                                title={editingProduct.manufacturerId ? 'Sugerir código a partir do fabricante' : 'Selecione um fabricante primeiro'}
                                className="w-10 h-10 rounded-lg flex items-center justify-center transition-all shrink-0 border bg-primary/10 border-primary/20 text-primary hover:bg-primary/15 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Hash size={16} />
                              </button>
                            </div>
                          </div>
                          <div className={fieldRowCls}>
                            <label className={fieldLabelCls}>Código EAN</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={editingProduct.ean || ''}
                                onChange={(e) => setEditingProduct({...editingProduct, ean: e.target.value})}
                                className={cn(inputCls, 'flex-1 min-w-0')}
                                placeholder="Código de barras..."
                              />
                              <EanCodesEditor entries={editingProductExtraEans} onChange={setEditingProductExtraEans} />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className={sectionLabelCls}><BarChart3 size={12} className="text-primary" />Estoque &amp; Preço</div>
                    <div className={cardCls}>
                      {!editing ? (
                        <>
                          <div className={rowCls}>
                            <div className={rowIconCls}><Building2 size={12} /></div>
                            <span className={rowLabelCls}>Empresa</span>
                            <span className={rowValueCls}>{editProductCompanyName}</span>
                          </div>
                          <div className={rowCls}>
                            <div className={rowIconCls}><Layers size={12} /></div>
                            <span className={rowLabelCls}>Estoque</span>
                            <span className={rowValueCls}>{isNaN(editingProduct.count) ? 0 : editingProduct.count} un</span>
                          </div>
                          <div className={rowCls}>
                            <div className={rowIconCls}><Layers size={12} /></div>
                            <span className={rowLabelCls}>Estoque Mínimo</span>
                            <span className={rowValueCls}>{editingProduct.minStock === null || editingProduct.minStock === undefined ? 'Não definido' : `${editingProduct.minStock} un`}</span>
                          </div>
                          <div className={rowCls}>
                            <div className={rowIconCls}><Wallet size={12} /></div>
                            <span className={rowLabelCls}>Preço de Custo</span>
                            <span className={rowValueCls}>R$ {(editingProduct.costPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className={rowCls}>
                            <div className={rowIconCls}><Wallet size={12} /></div>
                            <span className={rowLabelCls}>Preço de Venda</span>
                            <span className={rowValueCls}>R$ {(editingProduct.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className={rowCls}>
                            <div className={rowIconCls}><Tag size={12} /></div>
                            <span className={rowLabelCls}>Status</span>
                            <span className="flex-1 text-right">
                              <span className={cn(
                                'text-[9.5px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide',
                                editingProduct.status === 'Fora de Estoque' || editingProduct.status === 'Estoque Baixo'
                                  ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              )}>
                                {editingProduct.status}
                              </span>
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={fieldRowCls}>
                            <label className={fieldLabelCls}>Empresa</label>
                            <select
                              value={editProductCompanyId}
                              onChange={(e) => handleEditProductCompanyChange(e.target.value)}
                              className={cn(inputCls, 'cursor-pointer')}
                            >
                              {companies.length === 0 && <option value="">Nenhuma empresa cadastrada</option>}
                              {companies.map((c: any) => (
                                <option key={c.id} value={c.id}>{c.nome_fantasia}</option>
                              ))}
                            </select>
                          </div>
                          <div className={fieldRowCls}>
                            <label className={fieldLabelCls}>Quantidade em Estoque</label>
                            <input
                              type="number"
                              value={isNaN(editingProduct.count) ? 0 : editingProduct.count}
                              onChange={(e) => setEditingProduct({...editingProduct, count: parseInt(e.target.value || '0') || 0})}
                              onWheel={blockWheelChange}
                              className={inputCls}
                            />
                          </div>
                          <div className={fieldRowCls}>
                            <label className={fieldLabelCls}>Estoque Mínimo</label>
                            <input
                              type="number"
                              value={editingProduct.minStock ?? ''}
                              onChange={(e) => setEditingProduct({...editingProduct, minStock: e.target.value === '' ? null : (parseInt(e.target.value) || 0)})}
                              onWheel={blockWheelChange}
                              placeholder="Não definido"
                              className={inputCls}
                            />
                          </div>
                          <div className={fieldRowCls}>
                            <div className="flex gap-2.5">
                              <div className="flex-1">
                                <label className={fieldLabelCls}>Preço de Custo (R$)</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={editProductCostPriceDisplay}
                                  onChange={(e) => {
                                    const digits = e.target.value.replace(/\D/g, '');
                                    if (!digits) {
                                      setEditProductCostPriceDisplay('');
                                      setEditingProduct({...editingProduct, costPrice: 0});
                                      return;
                                    }
                                    const cents = parseInt(digits, 10);
                                    const display = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    setEditProductCostPriceDisplay(display);
                                    setEditingProduct({...editingProduct, costPrice: cents / 100});
                                  }}
                                  placeholder="0,00"
                                  className={inputCls}
                                />
                              </div>
                              <div className="flex-1">
                                <label className={fieldLabelCls}>Preço de Venda (R$)</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={editProductPriceDisplay}
                                  onChange={(e) => {
                                    const digits = e.target.value.replace(/\D/g, '');
                                    if (!digits) {
                                      setEditProductPriceDisplay('');
                                      setEditingProduct({...editingProduct, price: 0});
                                      return;
                                    }
                                    const cents = parseInt(digits, 10);
                                    const display = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    setEditProductPriceDisplay(display);
                                    setEditingProduct({...editingProduct, price: cents / 100});
                                  }}
                                  placeholder="0,00"
                                  className={inputCls}
                                />
                              </div>
                            </div>
                          </div>
                          <div className={fieldRowCls}>
                            <label className={fieldLabelCls}>Status</label>
                            <div className="flex flex-wrap gap-2">
                              {statusOptions.map(opt => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => setEditingProduct({...editingProduct, status: opt.value})}
                                  className={cn(
                                    'px-3.5 py-2 rounded-full text-[11px] font-extrabold border-[1.5px] transition-all',
                                    editingProduct.status === opt.value
                                      ? 'bg-primary/10 border-primary text-primary'
                                      : 'bg-black/[0.035] dark:bg-white/[0.05] border-black/[0.10] dark:border-white/[0.10] text-secondary/70 hover:border-black/20 dark:hover:border-white/20'
                                  )}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className={sectionLabelCls}><BookText size={12} className="text-primary" />Organização</div>
                    <div className={cardCls}>
                      {!editing ? (
                        <>
                          <div className={rowCls}>
                            <div className={rowIconCls}><MapPin size={12} /></div>
                            <span className={rowLabelCls}>Localização</span>
                            <span className={rowValueCls}>{editingProduct.location || 'Não atribuído'}</span>
                          </div>
                          <div className={rowCls}>
                            <div className={rowIconCls}><LayoutGrid size={12} /></div>
                            <span className={rowLabelCls}>Categoria</span>
                            <span className={rowValueCls}>{editingProduct.category || 'Geral'}</span>
                          </div>
                          <div className={rowCls}>
                            <div className={rowIconCls}><LayoutGrid size={12} /></div>
                            <span className={rowLabelCls}>Subcategoria</span>
                            <span className={rowValueCls}>{editingProduct.subcategory || 'Geral'}</span>
                          </div>
                          <div className={rowCls}>
                            <div className={rowIconCls}><Tag size={12} /></div>
                            <span className={rowLabelCls}>Marca</span>
                            <span className={rowValueCls}>{editingProduct.brand || 'Geral'}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={fieldRowCls}>
                            <label className={fieldLabelCls}>Localização</label>
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
                          <div className={fieldRowCls}>
                            <label className={fieldLabelCls}>Categoria</label>
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
                          <div className={fieldRowCls}>
                            <label className={fieldLabelCls}>Subcategoria</label>
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
                          <div className={fieldRowCls}>
                            <label className={fieldLabelCls}>Fabricante/Marca</label>
                            <ManufacturerSelect
                              value={editingProduct.manufacturerId}
                              onChange={(id) => setEditingProduct({...editingProduct, manufacturerId: id})}
                              manufacturers={manufacturers}
                              canCreate={canManageManufacturers}
                              onRequestCreate={() => setShowQuickAddManufacturer(true)}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className={sectionLabelCls}><FileText size={12} className="text-primary" />Detalhes</div>
                    <div className={cardCls}>
                      {!editing ? (
                        <>
                          <div className={rowCls}>
                            <div className={rowIconCls}><AlignLeft size={12} /></div>
                            <span className={rowLabelCls}>Composição</span>
                            <span className={cn(rowValueCls, !editingProduct.composicao && 'text-secondary/35 font-semibold')}>{editingProduct.composicao || 'Não definido'}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={fieldRowCls}>
                            <label className={fieldLabelCls}>Composição</label>
                            <textarea
                              value={editingProduct.composicao || ''}
                              onChange={(e) => setEditingProduct({...editingProduct, composicao: e.target.value})}
                              placeholder="Ingredientes / composição do produto..."
                              rows={2}
                              className={cn(inputCls, 'resize-none')}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  </div>
                </div>
                  );
                })()}

                {editProductTab === 'mae' && (
                  <div className="px-4 pt-4">
                    <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mx-1 mb-3">
                      <Package size={12} className="text-primary" />Embalagens (Produto Mãe)
                    </div>
                    <MotherProductsTab childProductId={editingProduct.id || null} childProductName={editingProduct.name || 'Produto sem nome'} />
                  </div>
                )}

                {editProductTab === 'historico' && (
                  <div className="px-4 pt-4 pb-8 space-y-3">
                    {editProductEanHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center text-secondary/60">
                        <FileText size={32} className="mb-3 opacity-40" />
                        <p className="text-sm font-bold">Nenhum registro encontrado</p>
                        <p className="text-xs mt-1 max-w-xs">
                          Nenhuma nota aprovada (entre as 300 mais recentes) contém um item com este EAN.
                        </p>
                      </div>
                    ) : editProductEanHistory.map(({ note, item, idx }) => {
                      const qty = item.qty ?? 0;
                      const unitCost = (item.price ?? 0) / (item.multiplier || 1);
                      const total = unitCost * qty;
                      const sellPrice = item.product_price ?? 0;
                      const markup = unitCost > 0 && sellPrice > 0 ? ((sellPrice - unitCost) / unitCost) * 100 : null;
                      const dateLabel = note.receivedDate ? note.receivedDate.split('-').reverse().join('/') : note.timestamp;
                      const description = item.original_description || item.description || '—';
                      const code = item.supplier_code || '—';
                      const noteCompany = companies.find((c: any) => c.id === note.companyId);
                      return (
                        <div key={`${note.id}-${idx}`} className="relative bg-surface border border-black/[0.09] dark:border-white/[0.08] shadow-sm rounded-2xl p-4">
                          {noteCompany && (
                            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-surface-container-lowest border border-black/[0.08] dark:border-white/[0.08] rounded-full pl-1 pr-2.5 py-1 shadow-sm max-w-[45%]">
                              <div className="w-5 h-5 rounded-full bg-surface-container flex items-center justify-center overflow-hidden shrink-0 text-secondary/40">
                                {noteCompany.logo ? (
                                  <img src={noteCompany.logo} alt={noteCompany.nome_fantasia} className="w-full h-full object-cover" />
                                ) : (
                                  <Building2 size={10} />
                                )}
                              </div>
                              <span className="text-[9.5px] font-extrabold text-secondary/70 truncate">{noteCompany.nome_fantasia}</span>
                            </div>
                          )}
                          <div className="mb-3 pr-[45%]">
                            <p className="text-sm font-bold text-on-surface truncate">{note.supplierName || note.fileName}</p>
                            <p className="text-[10px] text-secondary/70 font-semibold uppercase tracking-wide">{dateLabel}</p>
                          </div>
                          <div className="flex gap-2 mb-3">
                            <div className="flex-1 min-w-0 bg-surface-container border border-black/[0.07] dark:border-white/[0.07] rounded-[10px] px-2.5 py-1.5">
                              <p className="text-[8.5px] font-extrabold uppercase tracking-wide text-secondary/50 mb-0.5">Produto na Nota</p>
                              <p className="text-xs font-bold text-on-surface whitespace-nowrap overflow-hidden text-ellipsis" title={description}>{description}</p>
                            </div>
                            <div className="shrink-0 w-32 max-w-[8rem] bg-surface-container border border-black/[0.07] dark:border-white/[0.07] rounded-[10px] px-2.5 py-1.5">
                              <p className="text-[8.5px] font-extrabold uppercase tracking-wide text-secondary/50 mb-0.5">Código</p>
                              <p className="text-xs font-bold text-on-surface font-mono whitespace-nowrap overflow-hidden text-ellipsis" title={code}>{code}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 bg-surface-container border border-black/[0.07] dark:border-white/[0.07] rounded-xl p-3">
                            <div>
                              <p className="text-[9px] font-bold text-secondary/60 uppercase">Qtd.</p>
                              <p className="text-sm font-bold text-on-surface">{qty}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-secondary/60 uppercase">Valor Unit.</p>
                              <p className="text-sm font-bold text-on-surface">R$ {unitCost.toFixed(2).replace('.', ',')}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-secondary/60 uppercase">Valor Total</p>
                              <p className="text-sm font-bold text-on-surface">R$ {total.toFixed(2).replace('.', ',')}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-secondary/60 uppercase">Preço Venda</p>
                              <p className="text-sm font-bold text-on-surface">{sellPrice > 0 ? `R$ ${sellPrice.toFixed(2).replace('.', ',')}` : '—'}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn(
                              'text-xs font-black',
                              markup === null ? 'text-secondary/40' : markup >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                            )}>
                              {markup === null ? 'Markup —' : `Markup ${markup.toFixed(1).replace('.', ',')}%`}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setShowEditModal(false);
                                openReviewNoteWithLock(note, () => setTimeout(() => captureSnapshot(), 0));
                              }}
                              className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline underline-offset-2"
                            >
                              Ver nota <ArrowRight size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </form>

            {/* Footer fixo — Excluir / Salvar (só na aba Dados) */}
            {editProductTab === 'dados' && (
              <div className="shrink-0 border-t border-black/[0.09] dark:border-white/[0.07] bg-[#EFE8D4]/95 dark:bg-[#1E1E18]/95 backdrop-blur-xl px-4 py-3.5">
                {!showDeleteConfirm ? (
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex-[0_0_34%] bg-primary/[0.08] border-[1.5px] border-primary/[0.22] text-primary font-extrabold text-[11.5px] uppercase tracking-wide py-3.5 rounded-2xl"
                    >
                      Excluir
                    </button>
                    <button
                      type="submit"
                      form="editProductForm"
                      disabled={!isEditingProductFields || editStatus === 'loading' || editStatus === 'success'}
                      className="flex-1 bg-primary text-white font-extrabold text-[12.5px] uppercase tracking-wide py-3.5 rounded-2xl shadow-lg shadow-primary/30 disabled:opacity-45 transition-opacity"
                    >
                      {editStatus === 'loading' ? 'Salvando...' : editStatus === 'success' ? 'Sucesso!' : 'Salvar Alterações'}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    <p className="text-xs text-red-600 dark:text-red-400 font-bold text-center uppercase">Confirmar Exclusão?</p>
                    <div className="flex gap-2.5">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 bg-black/[0.06] dark:bg-white/[0.07] text-secondary text-[11px] font-bold py-3 rounded-2xl uppercase"
                      >
                        Não, Manter
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteProduct}
                        className="flex-1 bg-primary text-white text-[11px] font-bold py-3 rounded-2xl uppercase"
                      >
                        Sim, Excluir
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
          ) : (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
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
              className="relative bg-[#F0E7CC] dark:bg-[#1E1E18] rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-black/10 dark:border-white/[0.08]"
            >
              <div className="px-6 py-5 flex items-center gap-3.5 bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800]">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                  <Package size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-manrope font-extrabold text-[#1A1A0E] leading-tight">Editar Produto</h2>
                  <p className="text-xs font-bold text-[#1A1A0E]/55 mt-0.5 truncate">{editingProduct.name || 'Produto sem nome'}</p>
                </div>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setIsAddingNew({ location: false, category: false, subcategory: false, brand: false });
                  }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] border border-black/10 text-black/50 hover:bg-black/[0.14] transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-6 pt-3 flex items-center gap-1 bg-[#F0E7CC] dark:bg-[#1E1E18] border-b border-black/10 dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setEditProductTab('dados')}
                  className={cn(
                    'px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-colors border-b-2 -mb-px',
                    editProductTab === 'dados'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-secondary hover:text-on-surface'
                  )}
                >
                  Dados
                </button>
                <button
                  type="button"
                  onClick={() => setEditProductTab('mae')}
                  className={cn(
                    'px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-colors border-b-2 -mb-px flex items-center gap-1.5',
                    editProductTab === 'mae'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-secondary hover:text-on-surface'
                  )}
                >
                  Produto Mãe
                </button>
                <button
                  type="button"
                  onClick={() => setEditProductTab('historico')}
                  className={cn(
                    'px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-colors border-b-2 -mb-px flex items-center gap-1.5',
                    editProductTab === 'historico'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-secondary hover:text-on-surface'
                  )}
                >
                  Histórico em Notas
                  <span className={cn(
                    'px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none',
                    editProductTab === 'historico' ? 'bg-primary/10 text-primary' : 'bg-black/[0.06] dark:bg-white/[0.08] text-secondary/70'
                  )}>
                    {editProductEanHistory.length}
                  </span>
                </button>
              </div>

              <form
                onSubmit={handleEditProduct}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault(); }}
                className="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
              >
                {editProductTab === 'dados' && editStatus === 'success' && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg text-sm font-bold flex items-center gap-2"
                  >
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                    Produto atualizado com sucesso!
                  </motion.div>
                )}

                {editProductTab === 'dados' && editStatus === 'error' && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium"
                  >
                    {editError}
                  </motion.div>
                )}

                {editProductTab === 'dados' && (() => {
                  const sectionCls = 'bg-surface border border-black/[0.07] dark:border-white/[0.06] shadow-sm rounded-2xl p-5 space-y-4';
                  const sectionHeadCls = 'flex items-center gap-2';
                  const sectionTitleCls = 'text-xs font-extrabold uppercase tracking-wide text-on-surface';
                  const fieldGridCls = 'grid grid-cols-1 md:grid-cols-2 gap-3.5';
                  const labelCls = 'text-[10px] font-extrabold uppercase tracking-wide text-secondary/80';
                  const inputCls = 'w-full bg-black/[0.035] dark:bg-white/[0.05] border border-black/[0.10] dark:border-white/[0.10] rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all';
                  const statusOptions: { value: string; label: string }[] = [
                    { value: 'Estoque Baixo', label: 'Estoque Baixo' },
                    { value: 'Em Estoque', label: 'Em Estoque' },
                    { value: 'Estoque em Alta', label: 'Estoque em Alta' },
                    { value: 'Fora de Estoque', label: 'Fora de Estoque' },
                  ];
                  return (
                <>
                <div className="space-y-4">
                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <Package size={15} className="text-primary shrink-0" />
                      <span className={sectionTitleCls}>Identificação</span>
                    </div>
                    <div className={fieldGridCls}>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Nome do Produto</label>
                        <input
                          required
                          type="text"
                          value={editingProduct.name}
                          onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})}
                          className={inputCls}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls}>SKU (Código Interno)</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editingProduct.sku}
                            onChange={(e) => setEditingProduct({...editingProduct, sku: e.target.value})}
                            className={inputCls}
                          />
                          <button
                            type="button"
                            disabled={!editingProduct.manufacturerId || suggestingCode}
                            onClick={() => suggestManufacturerCode(editingProduct.manufacturerId, code => setEditingProduct((p: any) => ({...p, sku: code})))}
                            title={editingProduct.manufacturerId ? 'Sugerir código a partir do fabricante' : 'Selecione um fabricante primeiro'}
                            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all shrink-0 border bg-primary/10 border-primary/20 text-primary hover:bg-primary/15 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Hash size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className={labelCls}>Código EAN</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editingProduct.ean || ''}
                            onChange={(e) => setEditingProduct({...editingProduct, ean: e.target.value})}
                            className={cn(inputCls, 'flex-1 min-w-0')}
                            placeholder="Código de barras..."
                          />
                          <EanCodesEditor entries={editingProductExtraEans} onChange={setEditingProductExtraEans} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <BarChart3 size={15} className="text-primary shrink-0" />
                      <span className={sectionTitleCls}>Estoque &amp; Preço</span>
                    </div>
                    <div className={fieldGridCls}>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className={labelCls}>Empresa</label>
                        <select
                          value={editProductCompanyId}
                          onChange={(e) => handleEditProductCompanyChange(e.target.value)}
                          className={cn(inputCls, 'cursor-pointer')}
                        >
                          {companies.length === 0 && <option value="">Nenhuma empresa cadastrada</option>}
                          {companies.map((c: any) => (
                            <option key={c.id} value={c.id}>{c.nome_fantasia}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Quantidade em Estoque</label>
                        <input
                          type="number"
                          value={isNaN(editingProduct.count) ? 0 : editingProduct.count}
                          onChange={(e) => setEditingProduct({...editingProduct, count: parseInt(e.target.value || '0') || 0})}
                          onWheel={blockWheelChange}
                          className={inputCls}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Estoque Mínimo</label>
                        <input
                          type="number"
                          value={editingProduct.minStock ?? ''}
                          onChange={(e) => setEditingProduct({...editingProduct, minStock: e.target.value === '' ? null : (parseInt(e.target.value) || 0)})}
                          onWheel={blockWheelChange}
                          placeholder="Não definido"
                          className={inputCls}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Preço de Custo (R$)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editProductCostPriceDisplay}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '');
                            if (!digits) {
                              setEditProductCostPriceDisplay('');
                              setEditingProduct({...editingProduct, costPrice: 0});
                              return;
                            }
                            const cents = parseInt(digits, 10);
                            const display = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            setEditProductCostPriceDisplay(display);
                            setEditingProduct({...editingProduct, costPrice: cents / 100});
                          }}
                          placeholder="0,00"
                          className={inputCls}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Preço de Venda (R$)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editProductPriceDisplay}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '');
                            if (!digits) {
                              setEditProductPriceDisplay('');
                              setEditingProduct({...editingProduct, price: 0});
                              return;
                            }
                            const cents = parseInt(digits, 10);
                            const display = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            setEditProductPriceDisplay(display);
                            setEditingProduct({...editingProduct, price: cents / 100});
                          }}
                          placeholder="0,00"
                          className={inputCls}
                        />
                      </div>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className={labelCls}>Status</label>
                        <div className="flex flex-wrap gap-2">
                          {statusOptions.map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setEditingProduct({...editingProduct, status: opt.value})}
                              className={cn(
                                'px-3.5 py-2 rounded-full text-[11px] font-extrabold border-[1.5px] transition-all',
                                editingProduct.status === opt.value
                                  ? 'bg-primary/10 border-primary text-primary'
                                  : 'bg-black/[0.035] dark:bg-white/[0.05] border-black/[0.10] dark:border-white/[0.10] text-secondary/70 hover:border-black/20 dark:hover:border-white/20'
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <BookText size={15} className="text-primary shrink-0" />
                      <span className={sectionTitleCls}>Organização</span>
                    </div>
                    <div className={fieldGridCls}>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Localização</label>
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
                        <label className={labelCls}>Categoria</label>
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
                        <label className={labelCls}>Subcategoria</label>
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
                        <label className={labelCls}>Fabricante/Marca</label>
                        <ManufacturerSelect
                          value={editingProduct.manufacturerId}
                          onChange={(id) => setEditingProduct({...editingProduct, manufacturerId: id})}
                          manufacturers={manufacturers}
                          canCreate={canManageManufacturers}
                          onRequestCreate={() => setShowQuickAddManufacturer(true)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <FileText size={15} className="text-primary shrink-0" />
                      <span className={sectionTitleCls}>Detalhes</span>
                    </div>
                    <div className={fieldGridCls}>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className={labelCls}>Composição</label>
                        <textarea
                          value={editingProduct.composicao || ''}
                          onChange={(e) => setEditingProduct({...editingProduct, composicao: e.target.value})}
                          placeholder="Ingredientes / composição do produto..."
                          rows={2}
                          className={cn(inputCls, 'resize-none')}
                        />
                      </div>
                    </div>
                  </div>

                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <ImageIcon size={15} className="text-primary shrink-0" />
                      <span className={sectionTitleCls}>Imagem</span>
                    </div>
                    <div className="flex gap-3 items-center">
                      <div className="w-14 h-14 rounded-xl bg-surface-container border border-black/[0.10] dark:border-white/[0.10] shrink-0 overflow-hidden flex items-center justify-center text-secondary/40">
                        {editingProduct.image ? (
                          <ProductImage src={editingProduct.image} alt={editingProduct.name} />
                        ) : (
                          <ImageIcon size={20} />
                        )}
                      </div>
                      <div className="flex-1 flex gap-2 min-w-0">
                        <input
                          type="text"
                          value={editingProduct.image}
                          onChange={(e) => setEditingProduct({...editingProduct, image: e.target.value})}
                          className={cn(inputCls, 'flex-1 min-w-0')}
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
                          className="px-4 rounded-xl text-secondary shrink-0 flex items-center justify-center transition-all bg-black/[0.035] dark:bg-white/[0.05] border border-black/[0.10] dark:border-white/[0.10] hover:border-black/20 dark:hover:border-white/20"
                          title="Upload do computador"
                        >
                          {uploading ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <ImageIcon size={18} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex flex-col gap-3">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowEditModal(false)}
                      className="flex-1 bg-black/[0.06] dark:bg-white/[0.07] text-secondary font-bold py-3 rounded-xl hover:bg-black/[0.10] dark:hover:bg-white/[0.11] transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={editStatus === 'loading' || editStatus === 'success'}
                      className="flex-1 bg-primary text-white font-bold py-3 rounded-xl hover:opacity-90 transition-colors shadow-lg shadow-primary/30 disabled:opacity-50"
                    >
                      {editStatus === 'loading' ? 'Salvando...' : editStatus === 'success' ? 'Sucesso!' : 'Salvar Alterações'}
                    </button>
                  </div>

                  {!showDeleteConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full text-primary text-[10px] font-bold uppercase tracking-wider hover:underline py-2"
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
                          className="flex-1 bg-white dark:bg-white/10 border border-slate-200 dark:border-transparent text-secondary text-[10px] font-bold py-2 rounded uppercase"
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
                </>
                  );
                })()}

                {editProductTab === 'mae' && (
                  <MotherProductsTab childProductId={editingProduct.id || null} childProductName={editingProduct.name || 'Produto sem nome'} />
                )}

                {editProductTab === 'historico' && (
                  <div className="space-y-3">
                    {editProductEanHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center text-secondary/60">
                        <FileText size={32} className="mb-3 opacity-40" />
                        <p className="text-sm font-bold">Nenhum registro encontrado</p>
                        <p className="text-xs mt-1 max-w-xs">
                          Nenhuma nota aprovada (entre as 300 mais recentes) contém um item com este EAN.
                        </p>
                      </div>
                    ) : editProductEanHistory.map(({ note, item, idx }) => {
                      const qty = item.qty ?? 0;
                      const unitCost = (item.price ?? 0) / (item.multiplier || 1);
                      const total = unitCost * qty;
                      const sellPrice = item.product_price ?? 0;
                      const markup = unitCost > 0 && sellPrice > 0 ? ((sellPrice - unitCost) / unitCost) * 100 : null;
                      const dateLabel = note.receivedDate ? note.receivedDate.split('-').reverse().join('/') : note.timestamp;
                      const description = item.original_description || item.description || '—';
                      const code = item.supplier_code || '—';
                      const noteCompany = companies.find((c: any) => c.id === note.companyId);
                      return (
                        <div key={`${note.id}-${idx}`} className="relative bg-surface border border-black/[0.09] dark:border-white/[0.08] shadow-sm rounded-2xl p-4">
                          {noteCompany && (
                            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-surface-container-lowest border border-black/[0.08] dark:border-white/[0.08] rounded-full pl-1 pr-2.5 py-1 shadow-sm max-w-[45%]">
                              <div className="w-5 h-5 rounded-full bg-surface-container flex items-center justify-center overflow-hidden shrink-0 text-secondary/40">
                                {noteCompany.logo ? (
                                  <img src={noteCompany.logo} alt={noteCompany.nome_fantasia} className="w-full h-full object-cover" />
                                ) : (
                                  <Building2 size={10} />
                                )}
                              </div>
                              <span className="text-[9.5px] font-extrabold text-secondary/70 truncate">{noteCompany.nome_fantasia}</span>
                            </div>
                          )}
                          <div className="mb-3 pr-[45%]">
                            <p className="text-sm font-bold text-on-surface truncate">{note.supplierName || note.fileName}</p>
                            <p className="text-[10px] text-secondary/70 font-semibold uppercase tracking-wide">{dateLabel}</p>
                          </div>
                          <div className="flex gap-2 mb-3">
                            <div className="flex-1 min-w-0 bg-surface-container border border-black/[0.07] dark:border-white/[0.07] rounded-[10px] px-2.5 py-1.5">
                              <p className="text-[8.5px] font-extrabold uppercase tracking-wide text-secondary/50 mb-0.5">Produto na Nota</p>
                              <p className="text-xs font-bold text-on-surface whitespace-nowrap overflow-hidden text-ellipsis" title={description}>{description}</p>
                            </div>
                            <div className="shrink-0 w-32 max-w-[8rem] bg-surface-container border border-black/[0.07] dark:border-white/[0.07] rounded-[10px] px-2.5 py-1.5">
                              <p className="text-[8.5px] font-extrabold uppercase tracking-wide text-secondary/50 mb-0.5">Código</p>
                              <p className="text-xs font-bold text-on-surface font-mono whitespace-nowrap overflow-hidden text-ellipsis" title={code}>{code}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 bg-surface-container border border-black/[0.07] dark:border-white/[0.07] rounded-xl p-3">
                            <div>
                              <p className="text-[9px] font-bold text-secondary/60 uppercase">Qtd.</p>
                              <p className="text-sm font-bold text-on-surface">{qty}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-secondary/60 uppercase">Valor Unit.</p>
                              <p className="text-sm font-bold text-on-surface">R$ {unitCost.toFixed(2).replace('.', ',')}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-secondary/60 uppercase">Valor Total</p>
                              <p className="text-sm font-bold text-on-surface">R$ {total.toFixed(2).replace('.', ',')}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-secondary/60 uppercase">Preço Venda</p>
                              <p className="text-sm font-bold text-on-surface">{sellPrice > 0 ? `R$ ${sellPrice.toFixed(2).replace('.', ',')}` : '—'}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn(
                              'text-xs font-black',
                              markup === null ? 'text-secondary/40' : markup >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                            )}>
                              {markup === null ? 'Markup —' : `Markup ${markup.toFixed(1).replace('.', ',')}%`}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setShowEditModal(false);
                                openReviewNoteWithLock(note, () => setTimeout(() => captureSnapshot(), 0));
                              }}
                              className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline underline-offset-2"
                            >
                              Ver nota <ArrowRight size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </form>
            </motion.div>
          </div>
          )
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
                  <h2 className="text-xl font-black text-slate-900">
                    {isReviewingExistingRequest ? "Revisão de Requisição" : "Nova Requisição"}
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    {isReviewingExistingRequest
                      ? "Visualizando detalhes da solicitação"
                      : isRequestingNewProduct
                        ? "Cadastre um novo produto para requisição"
                        : "Busque um produto para solicitar alterações"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!isReviewingExistingRequest && <button
                    onClick={() => setIsRequestingNewProduct(!isRequestingNewProduct)}
                    className={cn(
                      "p-2 rounded-full transition-all flex items-center gap-2 px-3",
                      isRequestingNewProduct ? "bg-primary text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    )}
                    title={isRequestingNewProduct ? "Voltar para busca" : "Adicionar produto não cadastrado"}
                  >
                    <Plus size={20} />
                    {isRequestingNewProduct && <span className="text-xs font-bold">Novo Produto</span>}
                  </button>}
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
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newProductRequest.ean || ''}
                          onChange={(e) => setNewProductRequest({...newProductRequest, ean: e.target.value})}
                          className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="789..."
                        />
                        {newProductRequest.ean?.trim() && (
                          <EanProblemButton
                            ean={newProductRequest.ean}
                            problems={eanProblems}
                            onReport={(e, desc, obs) => handleReportEanProblem(e, desc, obs, 'new_product')}
                            size="sm"
                          />
                        )}
                        <EanCodesEditor entries={newProductRequestExtraEans} onChange={setNewProductRequestExtraEans} />
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
                        onWheel={blockWheelChange}
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
                        onWheel={blockWheelChange}
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

      {/* Product Alteration Detail Modal */}
      {showAlterationDetailModal && alterationDetailData && (
        <ProductAlterationModal
          open={showAlterationDetailModal}
          data={alterationDetailData}
          onClose={() => { setShowAlterationDetailModal(false); setAlterationDetailData(null); }}
        />
      )}

      {/* Task Request Detail Modal */}
      {showTaskDetailModal && taskDetailRequest && taskDetailData && (
        <TaskRequestDetailModal
          open={showTaskDetailModal}
          request={taskDetailRequest}
          taskData={taskDetailData}
          onClose={() => { setShowTaskDetailModal(false); setTaskDetailRequest(null); setTaskDetailData(null); }}
          onApprove={(id) => { setShowRequestConfirmModal({ show: true, requestId: id }); setShowTaskDetailModal(false); }}
          onDelete={(id) => { handleDeleteRequest(id); setShowTaskDetailModal(false); setTaskDetailRequest(null); setTaskDetailData(null); }}
        />
      )}

      {/* Bulk Draft Review — ProductBulkTable em modo revisão */}
      <ProductBulkTable
        isOpen={showBulkDraftReviewModal && !!bulkDraftUnderReview}
        onClose={() => {
          setShowBulkDraftReviewModal(false);
          setBulkDraftUnderReview(null);
          setBulkDraftEditedItems([]);
        }}
        initialRows={bulkDraftEditedItems}
        title="Revisão de Rascunho"
        subtitle="Requisições — Revisão & Aprovação"
        saveButtonLabel="Aprovar"
        skipNameValidation={true}
        existingEans={products.map((p: any) => p.ean).filter(Boolean)}
        categories={[...new Set(products.map((p: any) => p.category).filter(Boolean))]}
        subcategories={[...new Set(products.map((p: any) => p.subcategory).filter(Boolean))]}
        brands={[...new Set(products.map((p: any) => p.brand).filter(Boolean))]}
        locations={[...new Set(products.map((p: any) => p.location).filter(Boolean))]}
        eanProblems={eanProblems}
        onReportEanProblem={(ean, desc, obs) => handleReportEanProblem(ean, desc, obs)}
        secondaryActionLabel="Salvar revisão"
        onSecondaryAction={handleSaveReviewProgress}
        onSave={async (rows) => {
          const eanToProductId = buildEanToProductId(products);

          const results = await Promise.allSettled(
            rows.map(r => {
              const ean = r.ean?.trim() || null;
              const existingProductId = ean ? eanToProductId.get(ean) : undefined;
              const payload = {
                name: r.name || null,
                sku: r.sku || null,
                ean,
                category: r.category || null,
                subcategory: r.subcategory || null,
                brand: r.brand || null,
                location: r.location || null,
                count: parseFloat(r.count) || 0,
                price: parseFloat(String(r.price).replace(',', '.')) || null,
                status: r.status || 'Em Estoque',
              };
              return existingProductId
                ? supabase.from('products').update(payload).eq('id', existingProductId)
                : supabase.from('products').insert([payload]);
            })
          );
          const saved = results.filter(r => r.status === 'fulfilled' && !(r as any).value?.error).length;
          const errors = results.length - saved;
          if (bulkDraftUnderReview) {
            await supabase.from('requests').update({ status: 'approved' }).eq('id', bulkDraftUnderReview.id);
          }
          setBulkDraftUnderReview(null);
          setBulkDraftEditedItems([]);
          fetchRequests();
          fetchProducts();
          return { saved, errors };
        }}
      />

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
        {showAddModal && (() => {
          const sectionLabelCls = 'flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mx-1 mb-2';
          const cardCls = 'bg-white dark:bg-[#252520] border border-black/[0.10] dark:border-white/[0.07] rounded-2xl overflow-hidden shadow-sm';
          const fieldRowCls = 'px-3.5 py-3 border-b border-black/[0.06] dark:border-white/[0.06] last:border-b-0';
          const fieldLabelCls = 'block text-[9.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-1.5';
          const inputCls = 'w-full bg-black/[0.035] dark:bg-white/[0.05] border border-black/[0.10] dark:border-white/[0.10] rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all';
          // Consts usadas apenas no branch desktop (modal centralizado, layout original)
          const sectionCls = 'bg-surface border border-black/[0.07] dark:border-white/[0.06] shadow-sm rounded-2xl p-5 space-y-4';
          const sectionHeadCls = 'flex items-center gap-2';
          const sectionTitleCls = 'text-xs font-extrabold uppercase tracking-wide text-on-surface';
          const fieldGridCls = 'grid grid-cols-1 md:grid-cols-2 gap-3.5';
          const labelCls = 'text-[10px] font-extrabold uppercase tracking-wide text-secondary/80';
          const statusOptions: { value: string; label: string }[] = [
            { value: 'Estoque Baixo', label: 'Estoque Baixo' },
            { value: 'Em Estoque', label: 'Em Estoque' },
            { value: 'Estoque em Alta', label: 'Estoque em Alta' },
            { value: 'Fora de Estoque', label: 'Fora de Estoque' },
          ];
          return (
          isMobileView ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-[#EFE8D4] dark:bg-[#1E1E18]"
          >
            {/* Header — mobile: tela cheia estilo iOS */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3.5 border-b border-black/[0.09] dark:border-white/[0.07]">
              <div className="w-[38px] h-[38px] shrink-0" />
              <h2 className="text-[15px] font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3] tracking-tight truncate px-3">Novo Produto</h2>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setIsAddingNew({ location: false, category: false, subcategory: false, brand: false });
                }}
                className="w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0 bg-black/[0.06] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] text-[#1A1A0E] dark:text-[#F2F0E3] active:scale-95 transition-transform"
              >
                <X size={17} />
              </button>
            </div>

            {/* Tabs — pill */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-3 overflow-x-auto border-b border-black/[0.09] dark:border-white/[0.07]">
              <button
                type="button"
                onClick={() => setNewProductTab('dados')}
                className={cn(
                  'shrink-0 px-4 py-2 rounded-full text-[11px] font-extrabold uppercase tracking-wide transition-colors whitespace-nowrap',
                  newProductTab === 'dados'
                    ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                    : 'bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.09] dark:border-white/[0.08] text-secondary/70'
                )}
              >
                Dados
              </button>
              <button
                type="button"
                onClick={() => setNewProductTab('mae')}
                className={cn(
                  'shrink-0 px-4 py-2 rounded-full text-[11px] font-extrabold uppercase tracking-wide transition-colors whitespace-nowrap',
                  newProductTab === 'mae'
                    ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                    : 'bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.09] dark:border-white/[0.08] text-secondary/70'
                )}
              >
                Produto Mãe
              </button>
            </div>

            <form
              id="addProductForm"
              onSubmit={handleAddProduct}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault(); }}
              className="flex-1 min-h-0 overflow-y-auto"
            >
                {newProductTab === 'mae' && (
                  <div className="px-4 pt-4 pb-8">
                    <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mx-1 mb-3">
                      <Package size={12} className="text-primary" />Embalagens (Produto Mãe)
                    </div>
                    <MotherProductsTab childProductId={null} childProductName={newProduct.name || 'Produto sem nome'} />
                  </div>
                )}

                {newProductTab === 'dados' && addStatus === 'success' && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-4 mt-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg text-sm font-bold flex items-center gap-2"
                  >
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                    Produto adicionado com sucesso! Fechando...
                  </motion.div>
                )}

                {newProductTab === 'dados' && addStatus === 'error' && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-4 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium"
                  >
                    {addError}
                  </motion.div>
                )}

                <div className={cn('pb-8', newProductTab !== 'dados' && 'hidden')}>
                  {/* Imagem — topo da janela */}
                  <div className="relative w-full h-52 bg-surface-container overflow-hidden border-b-2 border-dashed border-black/[0.12] dark:border-white/[0.12]">
                    {newProduct.image ? (
                      <ProductImage src={newProduct.image} alt={newProduct.name} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={uploading}
                        className="w-full h-full flex flex-col items-center justify-center gap-2.5 text-secondary/40"
                      >
                        {uploading ? <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <ImageIcon size={34} />}
                        <span className="text-[11px] font-extrabold uppercase tracking-wide">Adicionar Imagem</span>
                      </button>
                    )}
                    <input
                      type="file"
                      ref={imageInputRef}
                      onChange={(e) => handleImageUpload(e, false)}
                      className="hidden"
                      accept="image/*"
                    />
                  </div>
                  <div className="px-4 pt-3">
                    <input
                      type="text"
                      value={newProduct.image}
                      onChange={(e) => setNewProduct({...newProduct, image: e.target.value})}
                      className={inputCls}
                      placeholder="https://... (URL da imagem)"
                    />
                  </div>

                  <div className="px-4 pt-5 space-y-5">
                  <div>
                    <div className={sectionLabelCls}><Package size={12} className="text-primary" />Identificação</div>
                    <div className={cardCls}>
                      <div className={fieldRowCls}>
                        <label className={fieldLabelCls}>Nome do Produto</label>
                        <input
                          required
                          type="text"
                          value={newProduct.name}
                          onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                          className={inputCls}
                          placeholder="ex: Batedeira Prática Master"
                        />
                      </div>
                      <div className={fieldRowCls}>
                        <label className={fieldLabelCls}>SKU (Opcional)</label>
                        <div className="flex gap-2 flex-1">
                          <input
                            type="text"
                            value={newProduct.sku}
                            onChange={(e) => setNewProduct({...newProduct, sku: e.target.value})}
                            className={inputCls}
                            placeholder="ex: BM-500-A4"
                          />
                          <button
                            type="button"
                            disabled={!newProduct.manufacturerId || suggestingCode}
                            onClick={() => suggestManufacturerCode(newProduct.manufacturerId, code => setNewProduct(p => ({...p, sku: code})))}
                            title={newProduct.manufacturerId ? 'Sugerir código a partir do fabricante' : 'Selecione um fabricante primeiro'}
                            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all shrink-0 border bg-primary/10 border-primary/20 text-primary hover:bg-primary/15 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Hash size={16} />
                          </button>
                        </div>
                      </div>
                      <div className={fieldRowCls}>
                        <label className={fieldLabelCls}>Código EAN</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newProduct.ean || ''}
                            onChange={(e) => setNewProduct({...newProduct, ean: e.target.value})}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                            className={cn(inputCls, 'flex-1 min-w-0')}
                            placeholder="789..."
                          />
                          <EanCodesEditor entries={newProductExtraEans} onChange={setNewProductExtraEans} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className={sectionLabelCls}><BarChart3 size={12} className="text-primary" />Estoque &amp; Preço</div>
                    <div className={cardCls}>
                      <div className={fieldRowCls}>
                        <label className={fieldLabelCls}>Empresa</label>
                        <select
                          value={newProductCompanyId}
                          onChange={(e) => handleNewProductCompanyChange(e.target.value)}
                          className={cn(inputCls, 'cursor-pointer')}
                        >
                          {companies.length === 0 && <option value="">Nenhuma empresa cadastrada</option>}
                          {companies.map((c: any) => (
                            <option key={c.id} value={c.id}>{c.nome_fantasia}</option>
                          ))}
                        </select>
                      </div>
                      <div className={fieldRowCls}>
                        <label className={fieldLabelCls}>Quantidade Inicial</label>
                        <input
                          type="number"
                          value={isNaN(newProduct.count) ? 0 : newProduct.count}
                          onChange={(e) => setNewProduct({...newProduct, count: parseInt(e.target.value || '0') || 0})}
                          onWheel={blockWheelChange}
                          className={inputCls}
                        />
                      </div>
                      <div className={fieldRowCls}>
                        <label className={fieldLabelCls}>Estoque Mínimo</label>
                        <input
                          type="number"
                          value={newProduct.minStock ?? ''}
                          onChange={(e) => setNewProduct({...newProduct, minStock: e.target.value === '' ? null : (parseInt(e.target.value) || 0)})}
                          onWheel={blockWheelChange}
                          placeholder="Não definido"
                          className={inputCls}
                        />
                      </div>
                      <div className={fieldRowCls}>
                        <label className={fieldLabelCls}>Preço (R$)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={newProductPriceDisplay}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '');
                            if (!digits) {
                              setNewProductPriceDisplay('');
                              setNewProduct({...newProduct, price: 0});
                              return;
                            }
                            const cents = parseInt(digits, 10);
                            const display = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            setNewProductPriceDisplay(display);
                            setNewProduct({...newProduct, price: cents / 100});
                          }}
                          placeholder="0,00"
                          className={inputCls}
                        />
                      </div>
                      <div className={fieldRowCls}>
                        <label className={fieldLabelCls}>Status</label>
                        <div className="flex flex-wrap gap-2">
                          {statusOptions.map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setNewProduct({...newProduct, status: opt.value})}
                              className={cn(
                                'px-3.5 py-2 rounded-full text-[11px] font-extrabold border-[1.5px] transition-all',
                                newProduct.status === opt.value
                                  ? 'bg-primary/10 border-primary text-primary'
                                  : 'bg-black/[0.035] dark:bg-white/[0.05] border-black/[0.10] dark:border-white/[0.10] text-secondary/70 hover:border-black/20 dark:hover:border-white/20'
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className={sectionLabelCls}><BookText size={12} className="text-primary" />Organização</div>
                    <div className={cardCls}>
                      <div className={fieldRowCls}>
                        <label className={fieldLabelCls}>Localização</label>
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
                      <div className={fieldRowCls}>
                        <label className={fieldLabelCls}>Categoria</label>
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
                      <div className={fieldRowCls}>
                        <label className={fieldLabelCls}>Subcategoria</label>
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
                      <div className={fieldRowCls}>
                        <label className={fieldLabelCls}>Fabricante/Marca</label>
                        <ManufacturerSelect
                          value={newProduct.manufacturerId}
                          onChange={(id) => setNewProduct({...newProduct, manufacturerId: id})}
                          manufacturers={manufacturers}
                          canCreate={canManageManufacturers}
                          onRequestCreate={() => setShowQuickAddManufacturer(true)}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className={sectionLabelCls}><FileText size={12} className="text-primary" />Detalhes</div>
                    <div className={cardCls}>
                      <div className={fieldRowCls}>
                        <label className={fieldLabelCls}>Composição</label>
                        <textarea
                          value={newProduct.composicao || ''}
                          onChange={(e) => setNewProduct({...newProduct, composicao: e.target.value})}
                          placeholder="Ingredientes / composição do produto..."
                          rows={2}
                          className={cn(inputCls, 'resize-none')}
                        />
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
            </form>

            {/* Footer fixo — só na aba Dados */}
            {newProductTab === 'dados' && (
              <div className="shrink-0 border-t border-black/[0.09] dark:border-white/[0.07] bg-[#EFE8D4]/95 dark:bg-[#1E1E18]/95 backdrop-blur-xl px-4 py-3.5">
                <button
                  type="submit"
                  form="addProductForm"
                  disabled={adding || addStatus === 'success'}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-white font-extrabold text-[12.5px] uppercase tracking-wide py-3.5 rounded-2xl shadow-lg shadow-primary/30 disabled:opacity-50 active:scale-[0.98] transition-[opacity,transform]"
                >
                  {adding ? 'Adicionando...' : addStatus === 'success' ? 'Sucesso!' : (<><Plus size={15} />Adicionar Produto</>)}
                </button>
              </div>
            )}
          </motion.div>
          ) : (
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
              className="relative bg-[#F0E7CC] dark:bg-[#1E1E18] rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-black/10 dark:border-white/[0.08]"
            >
              <div className="px-6 py-5 flex items-center gap-3.5 bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800]">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                  <Package size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-manrope font-extrabold text-[#1A1A0E] leading-tight">Adicionar Novo Produto</h2>
                  <p className="text-xs font-bold text-[#1A1A0E]/55 mt-0.5 truncate">Preencha os dados para cadastrar no inventário</p>
                </div>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setIsAddingNew({ location: false, category: false, subcategory: false, brand: false });
                  }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] border border-black/10 text-black/50 hover:bg-black/[0.14] transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-6 pt-3 flex items-center gap-1 bg-[#F0E7CC] dark:bg-[#1E1E18] border-b border-black/10 dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setNewProductTab('dados')}
                  className={cn(
                    'px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-colors border-b-2 -mb-px',
                    newProductTab === 'dados'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-secondary hover:text-on-surface'
                  )}
                >
                  Dados
                </button>
                <button
                  type="button"
                  onClick={() => setNewProductTab('mae')}
                  className={cn(
                    'px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-colors border-b-2 -mb-px',
                    newProductTab === 'mae'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-secondary hover:text-on-surface'
                  )}
                >
                  Produto Mãe
                </button>
              </div>

              <form
                onSubmit={handleAddProduct}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault(); }}
                className="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
              >
                {newProductTab === 'mae' && (
                  <MotherProductsTab childProductId={null} childProductName={newProduct.name || 'Produto sem nome'} />
                )}

                {newProductTab === 'dados' && addStatus === 'success' && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg text-sm font-bold flex items-center gap-2"
                  >
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                    Produto adicionado com sucesso! Fechando...
                  </motion.div>
                )}

                {newProductTab === 'dados' && addStatus === 'error' && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium"
                  >
                    {addError}
                  </motion.div>
                )}

                <div className={cn('space-y-4', newProductTab !== 'dados' && 'hidden')}>
                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <Package size={15} className="text-primary shrink-0" />
                      <span className={sectionTitleCls}>Identificação</span>
                    </div>
                    <div className={fieldGridCls}>
                      <div className="space-y-1.5">
                        <label className={labelCls}>SKU (Opcional)</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newProduct.sku}
                            onChange={(e) => setNewProduct({...newProduct, sku: e.target.value})}
                            className={inputCls}
                            placeholder="ex: BM-500-A4"
                          />
                          <button
                            type="button"
                            disabled={!newProduct.manufacturerId || suggestingCode}
                            onClick={() => suggestManufacturerCode(newProduct.manufacturerId, code => setNewProduct(p => ({...p, sku: code})))}
                            title={newProduct.manufacturerId ? 'Sugerir código a partir do fabricante' : 'Selecione um fabricante primeiro'}
                            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all shrink-0 border bg-primary/10 border-primary/20 text-primary hover:bg-primary/15 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Hash size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Nome do Produto</label>
                        <input
                          required
                          type="text"
                          value={newProduct.name}
                          onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                          className={inputCls}
                          placeholder="ex: Batedeira Prática Master"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className={labelCls}>Código EAN</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newProduct.ean || ''}
                            onChange={(e) => setNewProduct({...newProduct, ean: e.target.value})}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                            className={cn(inputCls, 'flex-1 min-w-0')}
                            placeholder="789..."
                          />
                          <EanCodesEditor entries={newProductExtraEans} onChange={setNewProductExtraEans} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <BarChart3 size={15} className="text-primary shrink-0" />
                      <span className={sectionTitleCls}>Estoque &amp; Preço</span>
                    </div>
                    <div className={fieldGridCls}>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className={labelCls}>Empresa</label>
                        <select
                          value={newProductCompanyId}
                          onChange={(e) => handleNewProductCompanyChange(e.target.value)}
                          className={cn(inputCls, 'cursor-pointer')}
                        >
                          {companies.length === 0 && <option value="">Nenhuma empresa cadastrada</option>}
                          {companies.map((c: any) => (
                            <option key={c.id} value={c.id}>{c.nome_fantasia}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Quantidade Inicial</label>
                        <input
                          type="number"
                          value={isNaN(newProduct.count) ? 0 : newProduct.count}
                          onChange={(e) => setNewProduct({...newProduct, count: parseInt(e.target.value || '0') || 0})}
                          onWheel={blockWheelChange}
                          className={inputCls}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Estoque Mínimo</label>
                        <input
                          type="number"
                          value={newProduct.minStock ?? ''}
                          onChange={(e) => setNewProduct({...newProduct, minStock: e.target.value === '' ? null : (parseInt(e.target.value) || 0)})}
                          onWheel={blockWheelChange}
                          placeholder="Não definido"
                          className={inputCls}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Preço (R$)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={newProductPriceDisplay}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '');
                            if (!digits) {
                              setNewProductPriceDisplay('');
                              setNewProduct({...newProduct, price: 0});
                              return;
                            }
                            const cents = parseInt(digits, 10);
                            const display = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            setNewProductPriceDisplay(display);
                            setNewProduct({...newProduct, price: cents / 100});
                          }}
                          placeholder="0,00"
                          className={inputCls}
                        />
                      </div>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className={labelCls}>Status</label>
                        <div className="flex flex-wrap gap-2">
                          {statusOptions.map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setNewProduct({...newProduct, status: opt.value})}
                              className={cn(
                                'px-3.5 py-2 rounded-full text-[11px] font-extrabold border-[1.5px] transition-all',
                                newProduct.status === opt.value
                                  ? 'bg-primary/10 border-primary text-primary'
                                  : 'bg-black/[0.035] dark:bg-white/[0.05] border-black/[0.10] dark:border-white/[0.10] text-secondary/70 hover:border-black/20 dark:hover:border-white/20'
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <BookText size={15} className="text-primary shrink-0" />
                      <span className={sectionTitleCls}>Organização</span>
                    </div>
                    <div className={fieldGridCls}>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Localização</label>
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
                        <label className={labelCls}>Categoria</label>
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
                        <label className={labelCls}>Subcategoria</label>
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
                        <label className={labelCls}>Fabricante/Marca</label>
                        <ManufacturerSelect
                          value={newProduct.manufacturerId}
                          onChange={(id) => setNewProduct({...newProduct, manufacturerId: id})}
                          manufacturers={manufacturers}
                          canCreate={canManageManufacturers}
                          onRequestCreate={() => setShowQuickAddManufacturer(true)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <FileText size={15} className="text-primary shrink-0" />
                      <span className={sectionTitleCls}>Detalhes</span>
                    </div>
                    <div className={fieldGridCls}>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className={labelCls}>Composição</label>
                        <textarea
                          value={newProduct.composicao || ''}
                          onChange={(e) => setNewProduct({...newProduct, composicao: e.target.value})}
                          placeholder="Ingredientes / composição do produto..."
                          rows={2}
                          className={cn(inputCls, 'resize-none')}
                        />
                      </div>
                    </div>
                  </div>

                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <ImageIcon size={15} className="text-primary shrink-0" />
                      <span className={sectionTitleCls}>Imagem</span>
                    </div>
                    <div className="flex gap-3 items-center">
                      <div className="w-14 h-14 rounded-xl bg-surface-container border border-black/[0.10] dark:border-white/[0.10] shrink-0 overflow-hidden flex items-center justify-center text-secondary/40">
                        {newProduct.image ? (
                          <ProductImage src={newProduct.image} alt={newProduct.name} />
                        ) : (
                          <ImageIcon size={20} />
                        )}
                      </div>
                      <div className="flex-1 flex gap-2 min-w-0">
                        <input
                          type="text"
                          value={newProduct.image}
                          onChange={(e) => setNewProduct({...newProduct, image: e.target.value})}
                          className={cn(inputCls, 'flex-1 min-w-0')}
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
                          className="px-4 rounded-xl text-secondary shrink-0 flex items-center justify-center transition-all bg-black/[0.035] dark:bg-white/[0.05] border border-black/[0.10] dark:border-white/[0.10] hover:border-black/20 dark:hover:border-white/20"
                          title="Upload do computador"
                        >
                          {uploading ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <ImageIcon size={18} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 bg-black/[0.06] dark:bg-white/[0.07] text-secondary font-bold py-3 rounded-xl hover:bg-black/[0.10] dark:hover:bg-white/[0.11] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={adding || addStatus === 'success'}
                    className="flex-1 bg-primary text-white font-bold py-3 rounded-xl hover:opacity-90 active:scale-[0.97] transition-[opacity,transform] duration-150 shadow-lg shadow-primary/30 disabled:opacity-50"
                  >
                    {adding ? 'Adicionando...' : addStatus === 'success' ? 'Sucesso!' : 'Adicionar Produto'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
          )
          );
        })()}
      </AnimatePresence>
      
      {/* Mobile Type Selection Modal */}
      <MobileTypeModal
        isOpen={showMobileTypeModal}
        onClose={() => setShowMobileTypeModal(false)}
        onSelectConferencia={() => { setShowMobileTypeModal(false); setShowMobileBulkTable(true); }}
        onSelectTarefas={() => { setShowMobileTypeModal(false); setShowMobileTaskPage(true); }}
      />

      {/* Mobile Task Page */}
      <MobileTaskPage
        isOpen={showMobileTaskPage}
        onClose={() => setShowMobileTaskPage(false)}
        products={products}
        categories={uniqueCategories}
        subcategories={Array.from(new Set(products.map((p: any) => p.subcategory).filter(Boolean))).sort() as string[]}
        brands={uniqueBrands}
        locations={uniqueLocations}
        onSendTask={handleSendTask}
      />

      {/* Mobile Bulk Table */}
      <MobileBulkTable
        isOpen={showMobileBulkTable}
        onClose={() => setShowMobileBulkTable(false)}
        existingEans={products.map((p: any) => p.ean).filter(Boolean) as string[]}
        eanProblems={eanProblems}
        categories={uniqueCategories}
        subcategories={Array.from(new Set(products.map((p: any) => p.subcategory).filter(Boolean))).sort() as string[]}
        brands={uniqueBrands}
        locations={uniqueLocations}
        onSaveDraft={handleSaveBulkDraft}
        onReportEanProblem={(ean, desc, obs) => handleReportEanProblem(ean, desc, obs, 'mobile_bulk')}
      />

      {/* Product Bulk Table */}
      <ProductBulkTable
        isOpen={showProductBulkTable}
        onClose={() => setShowProductBulkTable(false)}
        existingEans={products.map((p: any) => p.ean).filter(Boolean) as string[]}
        categories={uniqueCategories}
        subcategories={Array.from(new Set(products.map((p: any) => p.subcategory).filter(Boolean))).sort() as string[]}
        brands={uniqueBrands}
        locations={uniqueLocations}
        eanProblems={eanProblems}
        onReportEanProblem={(ean, desc, obs) => handleReportEanProblem(ean, desc, obs, 'bulk_table')}
        secondaryActionLabel="Enviar p/ revisão"
        onSecondaryAction={async (rows) => {
          await handleSaveBulkDraft(
            rows.map(r => ({
              name: r.name, sku: r.sku, ean: r.ean,
              category: r.category, subcategory: r.subcategory,
              brand: r.brand, location: r.location,
              count: r.count, price: r.price, status: r.status,
            })),
            ''
          );
        }}
        onSave={async (rows) => {
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
              count: r.count !== '' ? parseFloat(r.count) || 0 : 0,
              price: r.price !== '' ? parseFloat(r.price.replace(',', '.')) || null : null,
              status: r.status || 'Em Estoque',
            }));
          if (inserts.length === 0) return { saved: 0, errors: 1 };

          // Insert row-by-row so a single failure (ex: EAN duplicado) não bloqueia as demais
          const results = await Promise.allSettled(
            inserts.map(row => supabase.from('products').insert([row]))
          );

          let savedCount = 0;
          const errorMessages: string[] = [];
          results.forEach((r, i) => {
            if (r.status === 'fulfilled' && !r.value.error) {
              savedCount++;
            } else {
              const msg = r.status === 'rejected'
                ? String(r.reason)
                : (r.value.error?.message ?? 'Erro desconhecido');
              const friendly = msg.includes('products_sku_key') || msg.includes('sku')
                ? `Linha ${i + 1}: SKU "${inserts[i].sku}" já existe`
                : msg.includes('ean')
                ? `Linha ${i + 1}: EAN "${inserts[i].ean}" já cadastrado`
                : `Linha ${i + 1}: ${msg}`;
              errorMessages.push(friendly);
            }
          });

          if (savedCount > 0) await fetchProducts();
          if (errorMessages.length > 0) {
            setNotification({ type: 'error', message: errorMessages.join(' · ') });
          }

          return { saved: savedCount, errors: errorMessages.length };
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
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 group-hover:text-primary">Importar Vendas do Dia</p>
                    <p className="text-xs text-slate-500">Planilha XML, CSV ou Excel — a baixa é revisada antes de aplicar</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); downloadSalesImportTemplate(); }}
                  className="text-[11px] font-bold text-primary hover:underline -mt-2 text-left"
                >
                  Baixar modelo de planilha de vendas
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
                    <p className="font-bold text-slate-900 group-hover:text-primary">Ajustar Estoque</p>
                    <p className="text-xs text-slate-500">Pesquise e corrija a quantidade, com motivo registrado</p>
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
                    <h3 className="text-lg font-black text-slate-900">Ajustar Estoque</h3>
                    <p className="text-xs text-slate-500 font-medium">Pesquise o produto e informe a alteração</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowManualStockModal(false);
                    setSelectedManualProduct(null);
                    setManualStockChange(0);
                    setManualStockReason('');
                    setManualStockNote('');
                    setManualStockConfirmDrop(false);
                    setShowManualStockHistory(false);
                  }}
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
                            onClick={() => { setSelectedManualProduct(p); fetchManualStockHistory(p.id); }}
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
                        onClick={() => {
                          setSelectedManualProduct(null);
                          setManualStockChange(0);
                          setManualStockReason('');
                          setManualStockNote('');
                          setManualStockConfirmDrop(false);
                          setShowManualStockHistory(false);
                        }}
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
                            onWheel={blockWheelChange}
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

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-secondary uppercase">Motivo do Ajuste</label>
                        <select
                          value={manualStockReason}
                          onChange={(e) => { setManualStockReason(e.target.value); setManualStockConfirmDrop(false); }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          <option value="">Selecione um motivo...</option>
                          {STOCK_ADJUSTMENT_REASONS.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-secondary uppercase">Observação (opcional)</label>
                        <textarea
                          value={manualStockNote}
                          onChange={(e) => setManualStockNote(e.target.value)}
                          rows={2}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                          placeholder="Detalhe o ajuste, se necessário..."
                        />
                      </div>

                      {isLargeStockDrop(selectedManualProduct.count || 0, manualStockChange) && (
                        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-2.5">
                          <p className="text-xs font-bold text-red-700">
                            Essa é uma queda grande de estoque ({manualStockChange} un. sobre {selectedManualProduct.count || 0}). Confirme que está correto.
                          </p>
                          <label className="flex items-center gap-2 text-xs font-bold text-red-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={manualStockConfirmDrop}
                              onChange={(e) => setManualStockConfirmDrop(e.target.checked)}
                              className="rounded border-red-300"
                            />
                            Sim, o valor está correto
                          </label>
                        </div>
                      )}

                      <div>
                        <button
                          type="button"
                          onClick={() => setShowManualStockHistory(v => !v)}
                          className="text-[11px] font-bold text-primary hover:underline"
                        >
                          {showManualStockHistory ? 'Ocultar' : 'Ver'} histórico de ajustes ({manualStockHistory.length})
                        </button>
                        {showManualStockHistory && (
                          <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                            {manualStockHistory.length === 0 ? (
                              <p className="text-[11px] text-slate-400">Nenhum ajuste registrado para este produto ainda.</p>
                            ) : manualStockHistory.map((h) => (
                              <div key={h.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100 text-[11px]">
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-700 truncate">
                                    {STOCK_ADJUSTMENT_REASONS.find(r => r.value === h.reason)?.label || h.reason}
                                    {h.employee_name ? ` · ${h.employee_name}` : ''}
                                  </p>
                                  <p className="text-slate-400">{h.created_at ? new Date(h.created_at).toLocaleString('pt-BR') : ''}</p>
                                </div>
                                <span className={cn('font-black shrink-0', h.delta < 0 ? 'text-red-500' : 'text-green-600')}>
                                  {h.delta > 0 ? '+' : ''}{h.delta}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={() => {
                          setSelectedManualProduct(null);
                          setManualStockChange(0);
                          setManualStockReason('');
                          setManualStockNote('');
                          setManualStockConfirmDrop(false);
                          setShowManualStockHistory(false);
                        }}
                        className="flex-1 py-3 bg-white border border-slate-200 text-secondary font-bold rounded-xl hover:bg-slate-50 transition-colors"
                      >
                        Voltar
                      </button>
                      <button
                        onClick={handleManualStockUpdate}
                        disabled={
                          isUpdatingManualStock ||
                          manualStockChange === 0 ||
                          !manualStockReason ||
                          (isLargeStockDrop(selectedManualProduct.count || 0, manualStockChange) && !manualStockConfirmDrop)
                        }
                        className="flex-[2] bg-primary text-white font-bold py-3 rounded-xl hover:opacity-90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                      >
                        {isUpdatingManualStock ? 'Ajustando...' : 'Confirmar Ajuste'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sales Import Review Modal — revisão obrigatória antes de aplicar a baixa de estoque */}
      <AnimatePresence>
        {showSalesImportReview && pendingSalesImport && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowSalesImportReview(false); setPendingSalesImport(null); }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/20 shrink-0">
                    <FileUp size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-black text-slate-900">Revisar Importação de Vendas</h3>
                    <p className="text-xs text-slate-500 font-medium truncate">{pendingSalesImport.fileName}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowSalesImportReview(false); setPendingSalesImport(null); }}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors shrink-0"
                >
                  <X size={20} className="text-secondary" />
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-100">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase">Identificados</p>
                    <p className="text-2xl font-black text-emerald-700">{pendingSalesImport.matched.length}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-100">
                    <p className="text-[10px] font-bold text-amber-700 uppercase">Não identificados</p>
                    <p className="text-2xl font-black text-amber-700">{pendingSalesImport.unmatched.length}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-secondary uppercase">Data da Venda</label>
                  <input
                    type="date"
                    value={salesImportSaleDate}
                    onChange={(e) => setSalesImportSaleDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {pendingSalesImport.duplicateOf && (
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-2.5">
                    <p className="text-xs font-bold text-red-700">
                      Um arquivo com este nome já foi importado antes (venda de {pendingSalesImport.duplicateOf.saleDate ? new Date(pendingSalesImport.duplicateOf.saleDate + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}).
                      Importar de novo pode descontar o mesmo estoque duas vezes.
                    </p>
                    <label className="flex items-center gap-2 text-xs font-bold text-red-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={salesImportConfirmDuplicate}
                        onChange={(e) => setSalesImportConfirmDuplicate(e.target.checked)}
                        className="rounded border-red-300"
                      />
                      Sim, quero importar mesmo assim
                    </label>
                  </div>
                )}

                {pendingSalesImport.unmatched.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-secondary uppercase">Não identificados — não terão o estoque descontado</p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {pendingSalesImport.unmatched.map((r, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-50/60 border border-amber-100 text-[11px]">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-700 truncate">{r.description || 'Sem descrição'}</p>
                            <p className="text-slate-400">SKU: {r.sku || '—'} · EAN: {r.ean || '—'}</p>
                          </div>
                          <span className="font-black text-amber-700 shrink-0">{r.qty} un</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pendingSalesImport.matched.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-secondary uppercase">Identificados</p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {pendingSalesImport.matched.map((r, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-[11px]">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-700 truncate">{r.productName}</p>
                            <p className="text-slate-400">Estoque atual: {r.productCount} un</p>
                          </div>
                          <span className="font-black text-red-500 shrink-0">-{r.qty} un</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 p-6 pt-4 border-t border-slate-100 shrink-0">
                <button
                  onClick={() => { setShowSalesImportReview(false); setPendingSalesImport(null); }}
                  className="flex-1 py-3 bg-white border border-slate-200 text-secondary font-bold rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={applySalesImport}
                  disabled={
                    isApplyingSalesImport ||
                    !salesImportSaleDate ||
                    pendingSalesImport.matched.length === 0 ||
                    (!!pendingSalesImport.duplicateOf && !salesImportConfirmDuplicate)
                  }
                  className="flex-[2] bg-primary text-white font-bold py-3 rounded-xl hover:opacity-90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {isApplyingSalesImport ? 'Aplicando...' : `Confirmar e Baixar Estoque (${pendingSalesImport.matched.length})`}
                </button>
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
                    onClick={() => exportTranslatedToExcel(getPendingNfExportItems(), adjColumns)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors border border-emerald-100"
                  >
                    <Download size={16} />
                    Excel
                  </button>
                  <button
                    onClick={() => exportTranslatedToPDF(getPendingNfExportItems(), adjColumns, { supplierName: supplierNames.find((s: any) => s.id === selectedImportSupplierId)?.name || '', noteNumber: nfNoteNumber, accessKey: nfAccessKey })}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100 transition-colors border border-red-100"
                  >
                    <Download size={16} />
                    PDF
                  </button>
                  <button
                    onClick={() => { setEstoquePickerArgs({ items: getPendingNfExportItems(), adj: adjColumns, meta: { supplierName: supplierNames.find((s: any) => s.id === selectedImportSupplierId)?.name || '', noteNumber: nfNoteNumber, accessKey: nfAccessKey } }); setShowEstoqueLayoutPicker(true); }}
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
                                {item.mother_package_id && (
                                  <div className="relative group/mae shrink-0">
                                    <div className="w-5 h-5 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center cursor-help">
                                      <Package size={11} />
                                    </div>
                                    <div className="hidden group-hover/mae:block absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap bg-slate-900 text-white text-[10.5px] font-bold px-2.5 py-1.5 rounded-lg shadow-lg">
                                      Convertido de caixa — EAN {item.mother_package_ean || '—'}, ×{item.multiplier}
                                    </div>
                                  </div>
                                )}
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
                                onWheel={blockWheelChange}
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
                                onWheel={blockWheelChange}
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
                                onWheel={blockWheelChange}
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
                              item.verified && item.status_translation === 'Traduzido (Caixa)' ? "bg-amber-100 text-amber-700" :
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
                            <div className="relative inline-flex items-center">
                              {/* Botão preset — canto superior direito */}
                              <button
                                className="absolute -top-2.5 -right-2.5 z-10 w-4 h-4 rounded-full bg-slate-200 hover:bg-primary hover:text-white text-slate-400 flex items-center justify-center transition-all shadow-sm"
                                onClick={() => setNfDistribDropdownIdx(nfDistribDropdownIdx === idx ? null : idx)}
                                title="Preencher distribuição"
                              >
                                <ChevronDown size={8} />
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={nfItemDistribuicao[idx] ?? ''}
                                onChange={e => {
                                  const val = e.target.value.replace(/[^0-9]/g, '');
                                  const u = [...nfItemDistribuicao]; u[idx] = val; setNfItemDistribuicao(u);
                                  const m = [...nfDistribMode]; m[idx] = ''; setNfDistribMode(m);
                                }}
                                placeholder="—"
                                className="w-14 text-center text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                              />
                              {nfDistribDropdownIdx === idx && (
                                <>
                                  <div className="fixed inset-0 z-[150]" onClick={() => setNfDistribDropdownIdx(null)} />
                                  <div className="absolute top-full mt-1 right-0 z-[200] bg-slate-800 rounded-xl shadow-2xl border border-white/10 overflow-hidden min-w-[100px]">
                                    {(['Inteiro', 'Metade', 'Nada'] as const).map((label, i) => {
                                      const preset = label.toLowerCase() as 'inteiro' | 'metade' | 'nada';
                                      return (
                                        <button key={label}
                                          onClick={() => {
                                            const qty = nfItemQtys[idx] ?? pendingNfItems[idx]?.qty ?? 0;
                                            const val = preset === 'inteiro' ? String(qty) : preset === 'metade' ? String(Math.floor(qty / 2)) : '0';
                                            const d = [...nfItemDistribuicao]; d[idx] = val; setNfItemDistribuicao(d);
                                            const m = [...nfDistribMode]; m[idx] = preset; setNfDistribMode(m);
                                            setNfDistribDropdownIdx(null);
                                          }}
                                          className={cn("w-full px-4 py-2.5 text-left text-xs font-bold text-white/80 hover:bg-white/10 transition-colors", i > 0 && "border-t border-white/5")}
                                        >{label}</button>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
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
                    setNfDistribMode([]);
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
              onClick={() => { releaseNoteLock(); setViewingReviewNote(null); setConfirmDeleteNote(false); setShowMobileNoteView(false); resetNoteHistory(); setNoteSupplierMappings([]); }}
              className="absolute inset-0 bg-black/75 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="relative w-full h-full bg-white dark:bg-[#1e1e18] rounded-[20px] shadow-2xl overflow-hidden flex flex-col border border-line/60 dark:border-white/[0.06]"
            >
              {noteLockBlockedBy && (
                <div className="absolute inset-0 z-[250] flex items-center justify-center bg-black/45 backdrop-blur-[6px]">
                  <div className="w-full max-w-[380px] mx-4 bg-white dark:bg-[#252520] border border-line dark:border-white/[0.08] rounded-[22px] shadow-2xl p-8 pb-7 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-[#D81E1E]/10 dark:bg-[#D81E1E]/20 text-[#D81E1E] dark:text-[#FF6B6B] flex items-center justify-center mx-auto mb-4">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <div className="text-[15px] font-black text-on-surface mb-1.5">Sendo editada agora</div>
                    <div className="inline-flex items-center gap-1.5 bg-[#D81E1E]/[0.06] dark:bg-[#D81E1E]/[0.12] border border-[#D81E1E]/20 rounded-full px-3 py-1.5 mb-1">
                      <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#34A853] to-[#0A7A55] text-white text-[9px] font-black flex items-center justify-center">
                        {(noteLockBlockedBy.name || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-[12px] font-bold text-on-surface">{noteLockBlockedBy.name}</span>
                    </div>
                    <div className="text-[11.5px] text-on-surface/45 mt-2.5 mb-5">Última atividade {formatRelativeTime(noteLockBlockedBy.at)}</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setViewingReviewNote(null); setConfirmDeleteNote(false); setShowMobileNoteView(false); resetNoteHistory(); setNoteSupplierMappings([]); setNoteLockBlockedBy(null); }}
                        className="flex-1 h-10 rounded-xl border-[1.5px] border-on-surface/15 text-on-surface/55 text-[12.5px] font-bold hover:bg-on-surface/[0.04] transition-colors"
                      >
                        Fechar
                      </button>
                      <button
                        onClick={recheckNoteLock}
                        disabled={checkingNoteLock}
                        className="flex-1 h-10 rounded-xl bg-[#D81E1E] text-white text-[12.5px] font-black flex items-center justify-center gap-1.5 hover:bg-[#B91818] active:scale-[0.97] transition-all disabled:opacity-60"
                      >
                        <RefreshCw size={13} className={checkingNoteLock ? 'animate-spin' : ''} />
                        Verificar novamente
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="p-6 border-b border-line dark:border-white/[0.07] flex items-center justify-between bg-surface-container dark:bg-[#252520] shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                    <FileText size={24} />
                  </div>
                  <div>
                    {editingNoteHeader ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <div className="relative w-[280px]" ref={noteSupplierRef}>
                            <input
                              autoFocus
                              value={noteSupplierQuery}
                              disabled={getNoteStatus(viewingReviewNote) !== 'registro'}
                              onChange={e => { setNoteSupplierQuery(e.target.value); setNoteSupplierOpen(true); }}
                              onFocus={() => setNoteSupplierOpen(true)}
                              placeholder="Selecionar fornecedor…"
                              autoComplete="off"
                              className="text-xl font-black text-on-surface border-b-2 border-primary outline-none bg-transparent w-full placeholder:text-on-surface/25 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <AnimatePresence>
                              {noteSupplierOpen && getNoteStatus(viewingReviewNote) === 'registro' && (
                                <motion.ul
                                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                                  transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
                                  className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-[#2a2a24] border border-line dark:border-white/10 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto"
                                >
                                  {supplierNames
                                    .filter((s: any) => !noteSupplierQuery || s.name.toLowerCase().includes(noteSupplierQuery.toLowerCase()))
                                    .map((s: any) => (
                                      <li
                                        key={s.id}
                                        onMouseDown={() => {
                                          setViewingReviewNote({ ...viewingReviewNote, supplierId: s.id, supplierName: s.name, fileName: s.name });
                                          setNoteSupplierQuery(s.name);
                                          setNoteSupplierOpen(false);
                                        }}
                                        className="px-3 py-2.5 text-sm font-semibold text-on-surface hover:bg-on-surface/5 dark:hover:bg-white/[0.06] cursor-pointer transition-colors"
                                      >
                                        {s.name}
                                      </li>
                                    ))}
                                  {supplierNames.filter((s: any) => !noteSupplierQuery || s.name.toLowerCase().includes(noteSupplierQuery.toLowerCase())).length === 0 && (
                                    <li className="px-3 py-2.5 text-sm text-on-surface/35 italic">
                                      {supplierNames.length === 0 ? 'Carregando fornecedores…' : 'Nenhum resultado'}
                                    </li>
                                  )}
                                </motion.ul>
                              )}
                            </AnimatePresence>
                          </div>
                          <button
                            onClick={() => { setEditingNoteHeader(false); setNoteSupplierQuery(viewingReviewNote.supplierName || ''); setNoteSupplierOpen(false); }}
                            className="p-1 hover:bg-on-surface/[0.07] rounded-lg transition-colors" title="Confirmar"
                          >
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
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xl font-black text-on-surface">
                            {viewingReviewNote.supplierName || viewingReviewNote.fileName || <span className="text-on-surface/30 font-medium">Sem fornecedor</span>}
                          </h3>
                          <button
                            onClick={() => { setEditingNoteHeader(true); setNoteSupplierQuery(viewingReviewNote.supplierName || ''); }}
                            className="p-1 hover:bg-on-surface/[0.07] rounded-lg transition-colors text-on-surface/30 hover:text-on-surface/60"
                            title="Editar fornecedor e número"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleUndo}
                    disabled={!canUndo}
                    title="Desfazer (Ctrl+Z)"
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-on-surface/[0.06] text-on-surface hover:bg-on-surface/[0.12] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Undo2 size={16} />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={!canRedo}
                    title="Refazer (Ctrl+Y)"
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-on-surface/[0.06] text-on-surface hover:bg-on-surface/[0.12] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Redo2 size={16} />
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
                  <button
                    onClick={() => setShowHideColsModal(true)}
                    title={reviewHiddenCols.size > 0 ? `${reviewHiddenCols.size} coluna(s) oculta(s)` : 'Ocultar colunas'}
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                      reviewHiddenCols.size > 0
                        ? 'bg-[#FFE500] text-[#1A1A0E] shadow-md'
                        : 'bg-on-surface/[0.06] text-on-surface/40 hover:bg-on-surface/[0.1] hover:text-on-surface/60',
                    )}
                  >
                    <EyeOff size={13} />
                  </button>
                  {Object.keys(reviewColWidths).length > 0 && (
                    <button
                      onClick={resetReviewColWidths}
                      title="Restaurar larguras padrão das colunas"
                      className="w-8 h-8 rounded-full flex items-center justify-center transition-all bg-on-surface/[0.06] text-on-surface/40 hover:bg-on-surface/[0.1] hover:text-on-surface/60"
                    >
                      <Columns3 size={13} />
                    </button>
                  )}
                  <div className="flex items-center gap-1.5">
                    {/* Adj column buttons */}
                    <button
                      onClick={() => setAdjColDialog({ kind: 'desconto', name: '', method: null, geralValue: '', geralType: 'pct', individualType: 'pct' })}
                      className={cn("relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors border", adjColumns.some(c => c.kind === 'desconto') ? "bg-red-500/15 text-red-400 border-red-500/20" : "bg-on-surface/[0.06] text-on-surface/40 border-on-surface/[0.08] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/15")}
                      title="Adicionar coluna de Desconto"
                    >
                      <Minus size={14} />
                      {adjColumns.filter(c => c.kind === 'desconto').length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-400/20 text-red-400 text-[9px] font-black px-1.5 py-0.5 rounded-full">{adjColumns.filter(c => c.kind === 'desconto').length}</span>
                      )}
                    </button>
                    <button
                      onClick={() => setAdjColDialog({ kind: 'acrescimo', name: '', method: null, geralValue: '', geralType: 'pct', individualType: 'pct' })}
                      className={cn("relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors border", adjColumns.some(c => c.kind === 'acrescimo') ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" : "bg-on-surface/[0.06] text-on-surface/40 border-on-surface/[0.08] hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/15")}
                      title="Adicionar coluna de Acréscimo"
                    >
                      <Plus size={14} />
                      {adjColumns.filter(c => c.kind === 'acrescimo').length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-emerald-400/20 text-emerald-400 text-[9px] font-black px-1.5 py-0.5 rounded-full">{adjColumns.filter(c => c.kind === 'acrescimo').length}</span>
                      )}
                    </button>
                  </div>
                  <div className="w-px h-5 bg-on-surface/10" />
                  <button
                    onClick={() => exportTranslatedToExcel(viewingReviewNote.items, adjColumns)}
                    title="Baixar Excel"
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-500/10 hover:bg-emerald-500/18 transition-colors border border-emerald-500/15"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <rect x="2" y="2" width="20" height="20" rx="4" fill="#1D6F42" />
                      <path d="M7 7l4 5-4 5M17 7l-4 5 4 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      setEstoquePickerArgs({
                        items: viewingReviewNote.items.map((item: any, idx: number) => ({
                          ...item,
                          qty: viewingNoteQtys[idx] ?? item.qty,
                          unit: viewingNoteUnits[idx] ?? item.unit,
                          multiplier: viewingNoteMultipliers[idx] ?? item.multiplier,
                          distribuicao: viewingNoteDistribuicao[idx] !== undefined && viewingNoteDistribuicao[idx] !== '' ? parseInt(viewingNoteDistribuicao[idx]) || null : (item.distribuicao ?? null),
                          discrepancy: getItemDiscrepancy(idx, item),
                        })),
                        adj: adjColumns,
                        meta: { supplierName: viewingReviewNote.supplierName, noteNumber: viewingReviewNote.noteNumber, accessKey: viewingReviewNote.accessKey },
                      });
                      setShowEstoqueLayoutPicker(true);
                    }}
                    title="Baixar para Estoque"
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 hover:bg-blue-500/18 transition-colors border border-blue-500/15"
                  >
                    <Download size={16} />
                  </button>
                  <button
                    onClick={downloadCorrectedNfeXml}
                    title={viewingReviewNote.originalNfeXml ? 'Baixar XML corrigido (para importar no PDV)' : 'Anexe o XML original na aba "Nota Original" para poder baixar'}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 hover:bg-violet-500/18 transition-colors border border-violet-500/15"
                  >
                    <FileCode2 size={16} />
                  </button>
                  <div className="w-px h-8 bg-line dark:bg-white/[0.08] mx-2" />
                  {(() => {
                    const noteStatus = getNoteStatus(viewingReviewNote);
                    const meta = STATUS_META[noteStatus];
                    return (
                      <span className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border', meta.bg, meta.fg, meta.border)}>
                        <StatusIcon status={noteStatus} size={12} />
                        {meta.label}
                      </span>
                    );
                  })()}
                  <button
                    onClick={() => { releaseNoteLock(); setViewingReviewNote(null); setConfirmDeleteNote(false); setShowMobileNoteView(false); resetNoteHistory(); setNoteSupplierMappings([]); setNoteEditorTab('produtos'); }}
                    className="w-10 h-10 flex items-center justify-center rounded-full border-[1.5px] border-on-surface/15 hover:bg-on-surface/[0.07] transition-colors"
                  >
                    <X size={22} className="text-on-surface/40" />
                  </button>
                </div>
              </div>

              {/* Abas Produtos / Recebimento */}
              <div className="flex items-center justify-between gap-3 px-6 border-b border-line dark:border-white/[0.07] bg-white dark:bg-[#1e1e18] shrink-0">
                <div className="flex gap-6">
                <button
                  onClick={() => setNoteEditorTab('produtos')}
                  className={cn(
                    'flex items-center gap-2 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-colors',
                    noteEditorTab === 'produtos' ? 'border-on-surface text-on-surface' : 'border-transparent text-on-surface/40 hover:text-on-surface/70'
                  )}
                >
                  <FileText size={13} /> Produtos
                  <span className="bg-on-surface/10 text-on-surface/60 text-[9px] font-black px-1.5 py-0.5 rounded-full">{viewingReviewNote.items?.length ?? 0}</span>
                </button>
                <button
                  onClick={() => setNoteEditorTab('nota_original')}
                  title="Itens exatamente como vieram na nota, sem conversão, vínculo, preço de venda ou distribuição"
                  className={cn(
                    'flex items-center gap-2 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-colors',
                    noteEditorTab === 'nota_original' ? 'border-on-surface text-on-surface' : 'border-transparent text-on-surface/40 hover:text-on-surface/70'
                  )}
                >
                  <ScrollText size={13} /> Nota Original
                </button>
                <button
                  onClick={() => setNoteEditorTab('recebimento')}
                  className={cn(
                    'flex items-center gap-2 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-colors',
                    noteEditorTab === 'recebimento' ? 'border-on-surface text-on-surface' : 'border-transparent text-on-surface/40 hover:text-on-surface/70'
                  )}
                >
                  <Calendar size={13} /> Recebimento
                </button>
                <button
                  onClick={() => setNoteEditorTab('financeiro')}
                  className={cn(
                    'flex items-center gap-2 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-colors',
                    noteEditorTab === 'financeiro' ? 'border-on-surface text-on-surface' : 'border-transparent text-on-surface/40 hover:text-on-surface/70'
                  )}
                >
                  <Wallet size={13} /> Financeiro
                  {noteFinanceTxs.length > 0 && (
                    <span className="bg-on-surface/10 text-on-surface/60 text-[9px] font-black px-1.5 py-0.5 rounded-full">{noteFinanceTxs.length}</span>
                  )}
                </button>
                </div>
              </div>

              {noteEditorTab === 'financeiro' && (() => {
                const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
                const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
                // Agrupa por parcelamento (parcelamento_id) — movimentações sem parcelamento
                // viram um grupo de 1 item só, usando o próprio id como chave.
                type FinGroup = {
                  key: string; favorecido: string; tipo: 'Receita' | 'Despesa'; tipoPagamento: string;
                  total: number; pendentes: number; lastVencimento: string | null; items: NoteFinanceTx[];
                };
                const groups: FinGroup[] = (() => {
                  const map = new Map<string, NoteFinanceTx[]>();
                  noteFinanceTxs.forEach(tx => {
                    const key = tx.parcelamento_id || tx.id;
                    map.set(key, [...(map.get(key) ?? []), tx]);
                  });
                  return Array.from(map.entries()).map(([key, items]) => {
                    const sorted = [...items].sort((a, b) => (a.numero_parcela ?? 0) - (b.numero_parcela ?? 0));
                    const withDates = items.map(t => t.vencimento || t.data).filter(Boolean) as string[];
                    return {
                      key,
                      favorecido: sorted[0].favorecido,
                      tipo: sorted[0].tipo,
                      tipoPagamento: sorted[0].tipo_pagamento,
                      total: items.reduce((s, t) => s + (t.valor_final || 0), 0),
                      pendentes: items.filter(t => !t.pago).length,
                      lastVencimento: withDates.length > 0 ? withDates.sort().slice(-1)[0] : null,
                      items: sorted,
                    };
                  });
                })();
                const totalValor = noteFinanceTxs.reduce((s, t) => s + (t.valor_final || 0), 0);

                return (
                  <div className="flex-1 overflow-auto p-8">
                    <div className="max-w-4xl flex flex-col gap-8">
                      {/* Resumo */}
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-on-surface/40 mb-3">Resumo</p>
                        <div className="bg-white dark:bg-[#252520] border-[1.5px] border-on-surface/[0.08] dark:border-white/[0.08] rounded-2xl px-5 py-4 flex items-center gap-5">
                          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            <p className="text-[9px] font-extrabold uppercase tracking-wide text-on-surface/35">Total vinculado</p>
                            <p className="text-2xl font-black text-red-600 dark:text-red-400 leading-tight">{fmtBRL(totalValor)}</p>
                          </div>
                          <div className="w-px self-stretch bg-on-surface/[0.08] dark:bg-white/[0.08]" />
                          <div className="flex gap-6 shrink-0">
                            <div className="text-center">
                              <p className="text-[17px] font-black text-on-surface leading-none">{groups.length}</p>
                              <p className="text-[9px] font-bold text-on-surface/40 mt-1 whitespace-nowrap">MOVIMENTAÇÕES</p>
                            </div>
                            <div className="text-center">
                              <p className="text-[17px] font-black text-on-surface leading-none">{noteFinanceTxs.length}</p>
                              <p className="text-[9px] font-bold text-on-surface/40 mt-1 whitespace-nowrap">PARCELAS</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <p className="text-[10px] font-black uppercase tracking-wider text-on-surface/40 flex items-center gap-2">
                            Movimentações vinculadas
                            <span className="bg-on-surface/10 text-on-surface/60 text-[9px] font-black px-1.5 py-0.5 rounded-full">{groups.length}</span>
                          </p>
                          <button
                            onClick={() => setShowNoteLinkTxModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-on-surface/10 text-on-surface/60 hover:bg-primary/10 hover:text-primary transition-colors shrink-0"
                          >
                            <LinkIcon size={13} /> Vincular / criar movimentação
                          </button>
                        </div>
                        {noteFinanceLoading ? (
                          <div className="flex items-center gap-2 py-3 text-on-surface/40 text-xs font-semibold">
                            <span className="w-3.5 h-3.5 border-2 border-on-surface/20 border-t-on-surface/50 rounded-full animate-spin" />
                            Carregando movimentações...
                          </div>
                        ) : groups.length === 0 ? (
                          <p className="text-xs text-on-surface/35 italic bg-on-surface/[0.03] border border-on-surface/10 rounded-2xl px-4 py-3">
                            Nenhuma movimentação financeira vinculada a esta nota ainda. Vincule pela aba "Controle Financeiro" ao criar ou editar um lançamento.
                          </p>
                        ) : (
                          <div className="flex flex-col gap-2.5">
                            {groups.map(g => {
                              const isReceita = g.tipo === 'Receita';
                              const isOpen = noteFinanceExpandedGroups.has(g.key);
                              return (
                                <div
                                  key={g.key}
                                  className="bg-white dark:bg-[#252520] border-[1.5px] border-on-surface/[0.08] dark:border-white/[0.08] rounded-2xl overflow-hidden"
                                >
                                  <button
                                    onClick={() => setNoteFinanceExpandedGroups(prev => {
                                      const s = new Set(prev);
                                      s.has(g.key) ? s.delete(g.key) : s.add(g.key);
                                      return s;
                                    })}
                                    className="w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-on-surface/[0.02]"
                                  >
                                    <span className={cn(
                                      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                                      isReceita ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'
                                    )}>
                                      {isReceita ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-[13.5px] font-black text-on-surface truncate">{g.favorecido || 'Favorecido não informado'}</span>
                                        <span className={cn(
                                          'shrink-0 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full',
                                          isReceita ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'
                                        )}>
                                          {g.tipo}
                                        </span>
                                        {g.pendentes > 0 && (
                                          <span className="shrink-0 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                            {g.items.length > 1 ? `${g.pendentes} pendentes` : 'Pendente'}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11.5px] font-semibold text-on-surface/40 truncate">
                                        {g.tipoPagamento} · {g.items.length} parcela{g.items.length !== 1 ? 's' : ''}
                                        {g.lastVencimento ? ` · Últ. venc. ${fmtDate(g.lastVencimento)}` : ''}
                                      </p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <p className={cn('text-[15px] font-black', isReceita ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                                        {fmtBRL(g.total)}
                                      </p>
                                      <p className="text-[10px] font-bold text-on-surface/30">total</p>
                                    </div>
                                    <ChevronRight size={15} className={cn('shrink-0 text-on-surface/20 transition-transform', isOpen && 'rotate-90')} style={{ transition: 'transform 160ms cubic-bezier(0.23,1,0.32,1)' }} />
                                  </button>
                                  {isOpen && (
                                    <div className="border-t border-on-surface/[0.08] dark:border-white/[0.08] bg-on-surface/[0.015] flex flex-col">
                                      {g.items.map(tx => (
                                        <button
                                          key={tx.id}
                                          onClick={() => setNoteFinanceGoToTx(tx)}
                                          className="flex items-center gap-2.5 px-3.5 pl-8 py-2.5 text-left border-b border-on-surface/[0.06] dark:border-white/[0.06] last:border-0 transition-colors hover:bg-red-500/[0.03]"
                                        >
                                          <span className="w-[5px] h-[5px] rounded-full bg-on-surface/20 shrink-0" />
                                          <div className="min-w-0 flex-1">
                                            <p className="text-[11.5px] font-extrabold text-on-surface">
                                              {tx.total_parcelas && tx.total_parcelas > 1 ? `Parcela ${tx.numero_parcela ?? 1}/${tx.total_parcelas}` : 'Pagamento único'}
                                            </p>
                                            <p className="text-[10.5px] font-semibold text-on-surface/40">
                                              {tx.vencimento ? `Venc. ${fmtDate(tx.vencimento)}` : fmtDate(tx.data)} · {tx.pago ? 'Pago' : 'Pendente'}
                                            </p>
                                          </div>
                                          <span className={cn('text-xs font-black shrink-0', isReceita ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                                            {fmtBRL(tx.valor_final)}
                                          </span>
                                          <ChevronRight size={13} className="shrink-0 text-on-surface/20" />
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Confirmação: ir até a movimentação no Controle Financeiro */}
              <AnimatePresence>
                {noteFinanceGoToTx && (
                  <motion.div
                    key="go-to-tx-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 z-[200] flex items-center justify-center"
                    style={{ backdropFilter: 'blur(6px)', backgroundColor: 'rgba(10,10,8,0.72)' }}
                    onClick={() => setNoteFinanceGoToTx(null)}
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                      className="bg-[#FDFAF0] dark:bg-[#1E1E18] border border-black/[0.10] dark:border-white/[0.09] rounded-2xl shadow-2xl w-full max-w-xs mx-4 overflow-hidden"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="bg-[#FFE500] dark:bg-[#252520] px-5 py-4 flex items-center gap-2.5 border-b border-[#D4C000] dark:border-white/[0.07]">
                        <span className="w-9 h-9 rounded-[11px] bg-black/[0.09] dark:bg-white/[0.06] text-[#1A1A0E] dark:text-[#F2F0E3] flex items-center justify-center shrink-0">
                          <ArrowRight size={17} />
                        </span>
                        <p className="text-[13.5px] font-black text-[#1A1A0E] dark:text-[#f2f0e3]">Ir até a movimentação?</p>
                      </div>
                      <div className="px-5 py-4">
                        <p className="text-[12.5px] font-semibold leading-[1.55] text-black/65 dark:text-white/55 mb-3.5">
                          Você será levado até o Controle Financeiro, com esta movimentação já aberta para visualização.
                        </p>
                        <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.08] dark:border-white/[0.08] rounded-xl px-3 py-2.5">
                          <p className="text-[12.5px] font-black text-[#1A1A0E] dark:text-[#F2F0E3]">{noteFinanceGoToTx.favorecido || 'Favorecido não informado'}</p>
                          <p className="text-[11px] font-semibold text-black/45 dark:text-white/40 mt-0.5">
                            {noteFinanceGoToTx.tipo} · R$ {noteFinanceGoToTx.valor_final.toFixed(2).replace('.', ',')} · {noteFinanceGoToTx.tipo_pagamento}
                          </p>
                        </div>
                      </div>
                      <div className="px-5 pb-5 flex gap-2">
                        <button
                          onClick={() => setNoteFinanceGoToTx(null)}
                          className="flex-1 py-2.5 rounded-xl bg-black/[0.08] dark:bg-white/[0.06] border border-black/[0.14] dark:border-white/[0.09] text-sm font-bold text-black/55 dark:text-white/50 hover:bg-black/[0.13] dark:hover:bg-white/[0.10] transition-all active:scale-[0.97]"
                          style={{ transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)' }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => {
                            const txId = noteFinanceGoToTx.id;
                            setNoteFinanceGoToTx(null);
                            handleGoToTransaction(txId);
                          }}
                          className="flex-1 py-2.5 rounded-xl text-sm font-black text-white dark:text-[#1A1A0E] bg-[#1A1A0E] dark:bg-[#F2F0E3] shadow-lg transition-all active:scale-[0.97]"
                          style={{ transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)' }}
                        >
                          Ir até lá
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Vincular a nota a uma movimentação financeira (existente ou nova) */}
              {showNoteLinkTxModal && viewingReviewNote && (
                <LinkTransactionModal
                  note={viewingReviewNote}
                  isOpen={showNoteLinkTxModal}
                  onClose={() => setShowNoteLinkTxModal(false)}
                  onLink={(transactionId) => {
                    handleLinkNote(viewingReviewNote.id, transactionId);
                    setNoteFinanceRefreshKey(k => k + 1);
                    setShowNoteLinkTxModal(false);
                  }}
                />
              )}

              {noteEditorTab === 'nota_original' && (() => {
                const rows = (viewingReviewNote.items || []).map((item: any, idx: number) => {
                  const qty = item.original_qty ?? item.qty ?? 0;
                  const price = item.original_price ?? item.price ?? 0;
                  return { item, idx, qty, price, total: qty * price };
                });
                const grandTotal = rows.reduce((s, r) => s + r.total, 0);
                return (
                  <div
                    className="flex-1 overflow-auto p-8 [--rn-th-bg:#FFEC4D] [--rn-th-border:#E6CE33] [--rn-th-chip-bg:rgba(26,26,10,0.05)] [--rn-th-chip-border:rgba(26,26,10,0.10)] [--rn-th-color:rgba(26,26,10,0.55)] [--rn-cell-bg:#FFFFFF] [--rn-cell-bg-alt:#FAF7EE] [--rn-cell-border:rgba(224,216,191,0.80)] [--rn-cell-inner:rgba(0,0,0,0.06)] [--rn-text:rgba(26,26,10,0.85)] [--rn-text-muted:rgba(26,26,10,0.50)] [--rn-text-subtle:rgba(26,26,10,0.28)] dark:[--rn-th-bg:#FFEC4D] dark:[--rn-th-border:#DCC63D] dark:[--rn-th-chip-border:rgba(26,26,10,0.12)] dark:[--rn-th-color:rgba(26,26,10,0.58)] dark:[--rn-cell-bg:#252520] dark:[--rn-cell-bg-alt:#1e1e18] dark:[--rn-cell-border:rgba(242,240,227,0.06)] dark:[--rn-cell-inner:#3a3a34] dark:[--rn-text:rgba(242,240,227,0.85)] dark:[--rn-text-muted:rgba(242,240,227,0.50)] dark:[--rn-text-subtle:rgba(242,240,227,0.28)]"
                  >
                    <div className="max-w-5xl">
                      <p className="text-[10px] font-black uppercase tracking-wider text-on-surface/40 mb-3 flex items-center gap-2">
                        <ScrollText size={12} />
                        Nota Original
                        <span className="normal-case font-semibold text-on-surface/30 tracking-normal">— itens exatamente como vieram na importação, sem conversão de unidade, produto vinculado, preço de venda ou distribuição</span>
                      </p>
                      <div className="rounded-2xl border p-4 mb-5 flex items-center justify-between gap-4" style={{ borderColor: 'var(--rn-cell-border)', background: 'var(--rn-cell-bg)' }}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', viewingReviewNote.originalNfeXml ? 'bg-emerald-500/15 text-emerald-500' : 'bg-on-surface/[0.06] text-on-surface/40')}>
                            <FileCode2 size={16} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-on-surface truncate">
                              {viewingReviewNote.originalNfeXml ? 'XML original da NFe anexado' : 'Nenhum XML original anexado'}
                            </p>
                            <p className="text-[10px] font-semibold text-on-surface/40">
                              {viewingReviewNote.originalNfeXml
                                ? 'Usado como base para gerar o XML corrigido (botão roxo na barra superior)'
                                : 'Anexe o XML autorizado pela SEFAZ para poder gerar o XML corrigido pronto para importar no PDV'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider bg-on-surface/[0.06] text-on-surface/60 hover:bg-on-surface/[0.1] cursor-pointer transition-colors">
                            <Upload size={13} />
                            {viewingReviewNote.originalNfeXml ? 'Substituir' : 'Anexar XML'}
                            <input
                              type="file"
                              accept=".xml"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleAttachOriginalNfeXml(file);
                                e.target.value = '';
                              }}
                            />
                          </label>
                          {viewingReviewNote.originalNfeXml && (
                            <button
                              onClick={() => setViewingReviewNote({ ...viewingReviewNote, originalNfeXml: null })}
                              title="Remover XML anexado"
                              className="w-8 h-8 flex items-center justify-center rounded-xl bg-on-surface/[0.06] text-on-surface/40 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--rn-cell-border)' }}>
                        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1.5px solid var(--rn-th-border)' }}>
                              {(() => {
                                const thBar: React.CSSProperties = { background: 'var(--rn-th-bg)', padding: '9px 8px', verticalAlign: 'middle', height: '36px' };
                                const lbl = (extra?: React.CSSProperties): React.CSSProperties => ({
                                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                                  fontSize: '9px', fontWeight: 900,
                                  letterSpacing: '0.10em', textTransform: 'uppercase' as const,
                                  color: 'var(--rn-th-color)', whiteSpace: 'nowrap' as const,
                                  background: 'var(--rn-th-chip-bg)', border: '1.5px solid var(--rn-th-chip-border)',
                                  borderRadius: '9999px', padding: '5px 13px', ...extra,
                                });
                                const cols: { label: string; align?: 'left' | 'right' | 'center' }[] = [
                                  { label: '#', align: 'center' },
                                  { label: 'Código' },
                                  { label: 'Produto na Nota' },
                                  { label: 'EAN' },
                                  { label: 'Unidade', align: 'center' },
                                  { label: 'Qtd.', align: 'center' },
                                  { label: 'Preço Unit.', align: 'right' },
                                  { label: 'Valor Total', align: 'right' },
                                ];
                                return cols.map(c => (
                                  <th key={c.label} style={{ ...thBar, paddingLeft: c.label === '#' ? '10px' : thBar.padding }}>
                                    <div style={lbl({ justifyContent: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start' })}>
                                      {c.label}
                                    </div>
                                  </th>
                                ));
                              })()}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(({ item, idx, qty, price, total }, i) => {
                              const tdCls = "px-3 py-2.5 text-[12px] font-semibold";
                              return (
                                <tr key={idx}
                                  className={i % 2 === 0 ? 'bg-white dark:bg-[#252520]' : 'bg-[#FAF7EE] dark:bg-[#1E1E18]'}
                                  style={{ borderBottom: '1px solid var(--rn-cell-border)' }}
                                >
                                  <td className={cn(tdCls, "text-center")} style={{ color: 'var(--rn-text-subtle)' }}>{item.seq ?? idx + 1}</td>
                                  <td className={cn(tdCls, "font-mono")} style={{ color: 'var(--rn-text-muted)' }}>{item.supplier_code || '-'}</td>
                                  <td className={tdCls} style={{ color: 'var(--rn-text)' }}>{item.original_description || '-'}</td>
                                  <td className={cn(tdCls, "font-mono")} style={{ color: 'var(--rn-text-muted)' }}>{item.ean || '-'}</td>
                                  <td className={cn(tdCls, "text-center")} style={{ color: 'var(--rn-text-muted)' }}>{item.unit || '-'}</td>
                                  <td className={cn(tdCls, "text-center")} style={{ color: 'var(--rn-text)' }}>{qty}</td>
                                  <td className={cn(tdCls, "text-right")} style={{ color: 'var(--rn-text)' }}>{price > 0 ? `R$ ${price.toFixed(2)}` : '-'}</td>
                                  <td className={cn(tdCls, "text-right font-black")} style={{ color: 'var(--rn-text)' }}>{total > 0 ? `R$ ${total.toFixed(2)}` : '-'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          {rows.length > 0 && (
                            <tfoot>
                              <tr style={{ borderTop: '1.5px solid var(--rn-th-border)' }}>
                                <td colSpan={7} className="px-3 py-2.5 text-[11px] font-black text-right uppercase tracking-wide" style={{ color: 'var(--rn-text-muted)' }}>Total da Nota</td>
                                <td className="px-3 py-2.5 text-[13px] font-black text-right" style={{ color: 'var(--rn-text)' }}>{`R$ ${grandTotal.toFixed(2)}`}</td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {noteEditorTab === 'recebimento' && (
                <div className="flex-1 overflow-auto p-8">
                  <div className="max-w-2xl">
                    <div className="flex items-start gap-8">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-on-surface/40 mb-1.5">
                          Empresa <span className="text-primary">*</span>
                        </label>
                        <select
                          value={viewingReviewNote.companyId || ''}
                          onChange={e => setViewingReviewNote({ ...viewingReviewNote, companyId: e.target.value || null })}
                          className={cn(
                            'px-3 py-2 border rounded-xl text-sm font-semibold text-on-surface transition-colors w-fit cursor-pointer',
                            viewingReviewNote.companyId
                              ? 'border-on-surface/15 bg-on-surface/[0.03] hover:bg-on-surface/[0.06]'
                              : 'border-primary/55 bg-primary/[0.06] focus:ring-2 focus:ring-primary/20'
                          )}
                        >
                          <option value="">Selecionar...</option>
                          {companies.map((c: any) => (
                            <option key={c.id} value={c.id}>{c.nome_fantasia}</option>
                          ))}
                        </select>
                        {!viewingReviewNote.companyId && (
                          <p className="text-[10.5px] font-bold text-primary mt-1.5 flex items-center gap-1.5">
                            <AlertTriangle size={11} /> Campo obrigatório
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-on-surface/40 mb-1.5">Data de recebimento</label>
                        <ReceivedDateField
                          receivedDate={viewingReviewNote.receivedDate || ''}
                          onChange={v => setViewingReviewNote({ ...viewingReviewNote, receivedDate: v || undefined })}
                          registeredLabel={viewingReviewNote.timestamp}
                          className="px-3 py-2 border border-on-surface/15 rounded-xl text-sm font-semibold text-on-surface bg-on-surface/[0.03] hover:bg-on-surface/[0.06] transition-colors flex items-center gap-1.5 w-fit"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-on-surface/40 mb-1.5">Data do pedido</label>
                        <input
                          type="date"
                          value={viewingReviewNote.orderDate || ''}
                          onChange={e => setViewingReviewNote({ ...viewingReviewNote, orderDate: e.target.value || undefined })}
                          className="px-3 py-2 border border-on-surface/15 rounded-xl text-sm font-semibold text-on-surface bg-on-surface/[0.03] hover:bg-on-surface/[0.06] transition-colors w-fit cursor-pointer"
                        />
                      </div>
                    </div>

                    <p className="text-[10px] font-black uppercase tracking-wider text-on-surface/40 mt-8 mb-3">Situação de Entrada</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(Object.keys(STATUS_META) as NoteStatus[]).map(key => {
                        const meta = STATUS_META[key];
                        const isActive = getNoteStatus(viewingReviewNote) === key;
                        return (
                          <button
                            key={key}
                            onClick={() => setStatusConfirmTarget(key)}
                            className={cn(
                              'relative flex flex-col items-start gap-2.5 p-4 rounded-2xl border-2 text-left transition-all hover:-translate-y-0.5',
                              isActive ? cn(meta.bg, meta.border) : 'border-on-surface/10 bg-white dark:bg-[#252520] hover:border-on-surface/20'
                            )}
                          >
                            {isActive && (
                              <span className={cn('absolute top-3 right-3 w-4 h-4 rounded-full flex items-center justify-center', meta.fg)} style={{ backgroundColor: 'currentColor' }}>
                                <Check size={10} className="text-white" />
                              </span>
                            )}
                            <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center', meta.bg, meta.fg)}>
                              <StatusIcon status={key} size={17} />
                            </span>
                            <span className="text-xs font-black text-on-surface">{meta.label}</span>
                            <span className="text-[10.5px] font-medium text-on-surface/40 leading-snug">{meta.desc}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* ── Situação da Distribuição — independente da Situação de Entrada, só
                        aparece se a nota tiver alguma distribuição preenchida ────────────── */}
                    {(() => {
                      const hasDistribution = (viewingReviewNote.items || []).some((item: any, idx: number) => {
                        const dist = viewingNoteDistribByCompany[idx] ?? item.distribuicaoByCompany ?? {};
                        return Object.values(dist).some((v: any) => (Number(v) || 0) > 0);
                      }) || !!viewingReviewNote.distributionStatus;
                      if (!hasDistribution) return null;
                      const sent = viewingReviewNote.distributionStatus === 'distribuicao_enviada';
                      const canSend = !sent && getNoteStatus(viewingReviewNote) === 'revisao';
                      return (
                        <div className="mt-8">
                          <p className="text-[10px] font-black uppercase tracking-wider text-on-surface/40 mb-3">Situação da Distribuição</p>
                          <div className="grid grid-cols-2 gap-3 max-w-lg">
                            <div className={cn('flex items-center gap-2.5 p-4 rounded-2xl border-2', !sent ? 'bg-amber-500/10 border-amber-500/30' : 'border-on-surface/10 bg-white dark:bg-[#252520]')}>
                              <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', !sent ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-on-surface/10 text-on-surface/40')}>
                                <Pencil size={17} />
                              </span>
                              <div>
                                <div className="text-xs font-black text-on-surface">Separação</div>
                                <div className="text-[10.5px] font-medium text-on-surface/40">Editável</div>
                              </div>
                            </div>
                            <button
                              onClick={() => canSend && setDistribSendConfirmOpen(true)}
                              disabled={!canSend && !sent}
                              className={cn(
                                'flex items-center gap-2.5 p-4 rounded-2xl border-2 text-left transition-all',
                                sent ? 'bg-emerald-500/10 border-emerald-500/30'
                                  : canSend ? 'bg-emerald-500/10 border-emerald-500/30 hover:-translate-y-0.5 cursor-pointer'
                                    : 'border-on-surface/10 bg-white dark:bg-[#252520] opacity-50 cursor-not-allowed'
                              )}
                            >
                              <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', (sent || canSend) ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-on-surface/10 text-on-surface/40')}>
                                <CheckCircle2 size={17} />
                              </span>
                              <div>
                                <div className="text-xs font-black text-on-surface">Distribuição Enviada</div>
                                <div className="text-[10.5px] font-medium text-on-surface/40">
                                  {sent ? 'Definitivo' : canSend ? 'Clique para confirmar' : 'Disponível apenas em Revisão'}
                                </div>
                              </div>
                            </button>
                          </div>
                          {!sent ? (
                            <p className="text-[10.5px] font-bold text-on-surface/35 mt-2.5 flex items-center gap-1.5 max-w-lg">
                              <AlertTriangle size={11} className="shrink-0" />
                              Cria 1 manifesto por loja de destino na aba Distribuição — ação não pode ser desfeita.
                            </p>
                          ) : (
                            <p className="text-[11px] font-bold text-on-surface/45 mt-2.5">
                              Enviado por <b className="text-on-surface font-black">{viewingReviewNote.distributionSentByName}</b>
                              {viewingReviewNote.distributionSentAt ? ` em ${new Date(viewingReviewNote.distributionSentAt).toLocaleString('pt-BR')}` : ''}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* ── Produtos com Falta ──────────────────────────────────── */}
                  {(() => {
                    const faltaRows = (viewingReviewNote.items || [])
                      .map((item: any, idx: number) => ({
                        item, idx,
                        d: getItemDiscrepancy(idx, item),
                      }))
                      .filter(({ d }) => d?.type === 'falta');
                    if (faltaRows.length === 0) return null;
                    return (
                      <div
                        className="max-w-5xl mt-10 [--rn-th-bg:#FFEC4D] [--rn-th-border:#E6CE33] [--rn-th-chip-bg:rgba(26,26,10,0.05)] [--rn-th-chip-border:rgba(26,26,10,0.10)] [--rn-th-color:rgba(26,26,10,0.55)] [--rn-cell-bg:#FFFFFF] [--rn-cell-bg-alt:#FAF7EE] [--rn-cell-border:rgba(224,216,191,0.80)] [--rn-cell-inner:rgba(0,0,0,0.06)] [--rn-text:rgba(26,26,10,0.85)] [--rn-text-muted:rgba(26,26,10,0.50)] [--rn-text-subtle:rgba(26,26,10,0.28)] dark:[--rn-th-bg:#FFEC4D] dark:[--rn-th-border:#DCC63D] dark:[--rn-th-chip-border:rgba(26,26,10,0.12)] dark:[--rn-th-color:rgba(26,26,10,0.58)] dark:[--rn-cell-bg:#252520] dark:[--rn-cell-bg-alt:#1e1e18] dark:[--rn-cell-border:rgba(242,240,227,0.06)] dark:[--rn-cell-inner:#3a3a34] dark:[--rn-text:rgba(242,240,227,0.85)] dark:[--rn-text-muted:rgba(242,240,227,0.50)] dark:[--rn-text-subtle:rgba(242,240,227,0.28)]"
                      >
                        <p className="text-[10px] font-black uppercase tracking-wider text-on-surface/40 mb-3 flex items-center gap-2">
                          <AlertTriangle size={12} className="text-red-500 dark:text-red-400" />
                          Produtos com Falta
                          <span className="bg-red-500/10 text-red-500 dark:text-red-400 text-[9px] font-black px-1.5 py-0.5 rounded-full">{faltaRows.length}</span>
                        </p>
                        <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--rn-cell-border)' }}>
                          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ borderBottom: '1.5px solid var(--rn-th-border)' }}>
                                {(() => {
                                  const thBar: React.CSSProperties = { background: 'var(--rn-th-bg)', padding: '9px 8px', verticalAlign: 'middle', height: '36px' };
                                  const lbl = (extra?: React.CSSProperties): React.CSSProperties => ({
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    fontSize: '9px', fontWeight: 900,
                                    letterSpacing: '0.10em', textTransform: 'uppercase' as const,
                                    color: 'var(--rn-th-color)', whiteSpace: 'nowrap' as const,
                                    background: 'var(--rn-th-chip-bg)', border: '1.5px solid var(--rn-th-chip-border)',
                                    borderRadius: '9999px', padding: '5px 13px', ...extra,
                                  });
                                  const cols: { label: string; align?: 'left' | 'right' | 'center' }[] = [
                                    { label: '#', align: 'center' },
                                    { label: 'Código' },
                                    { label: 'Produto na Nota' },
                                    { label: 'Identificação Interna' },
                                    { label: 'EAN' },
                                    { label: 'Medida', align: 'center' },
                                    { label: 'Qtd.', align: 'center' },
                                    { label: 'Preço Custo', align: 'right' },
                                    { label: 'Valor Total', align: 'right' },
                                  ];
                                  return cols.map(c => (
                                    <th key={c.label} style={{ ...thBar, paddingLeft: c.label === '#' ? '10px' : thBar.padding }}>
                                      <div style={lbl({ justifyContent: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start' })}>
                                        {c.label}
                                      </div>
                                    </th>
                                  ));
                                })()}
                              </tr>
                            </thead>
                            <tbody>
                              {faltaRows.map(({ item, idx, d }, i) => {
                                const cost = (viewingNoteItemPrices[idx] ?? item.price ?? 0) / ((viewingNoteMultipliers[idx] ?? item.multiplier) || 1);
                                const qty = viewingNoteQtys[idx] ?? item.qty ?? 0;
                                const { disc, sur } = calcAdjAmounts(cost, qty, idx, adjColumns);
                                const adjCost = cost - disc + sur;
                                const total = adjCost * qty;
                                const tdCls = "px-3 py-2.5 text-[12px] font-semibold";
                                return (
                                  <tr key={idx}
                                    className={i % 2 === 0 ? 'bg-white dark:bg-[#252520]' : 'bg-[#FAF7EE] dark:bg-[#1E1E18]'}
                                    style={{ borderBottom: '1px solid var(--rn-cell-border)' }}
                                  >
                                    <td className={cn(tdCls, "text-center")} style={{ color: 'var(--rn-text-subtle)' }}>{item.seq ?? idx + 1}</td>
                                    <td className={cn(tdCls, "font-mono")} style={{ color: 'var(--rn-text-muted)' }}>{item.supplier_code || '-'}</td>
                                    <td className={tdCls} style={{ color: 'var(--rn-text)' }}>{item.original_description || item.name || '-'}</td>
                                    <td className={tdCls} style={{ color: 'var(--rn-text-muted)' }}>{item.name || '-'}</td>
                                    <td className={cn(tdCls, "font-mono")} style={{ color: 'var(--rn-text-muted)' }}>{viewingNoteEans[idx] ?? item.ean ?? '-'}</td>
                                    <td className={cn(tdCls, "text-center")} style={{ color: 'var(--rn-text-muted)' }}>{viewingNoteUnits[idx] ?? item.unit ?? '-'}</td>
                                    <td className={cn(tdCls, "text-center")} style={{ color: 'var(--rn-text)' }}>
                                      {qty}
                                      {d?.missingAll ? (
                                        <span className="ml-1 text-[8px] font-black text-red-500 dark:text-red-400 align-top">TUDO</span>
                                      ) : d?.qty ? (
                                        <span className="ml-1 text-[8px] font-black text-red-500 dark:text-red-400 align-top">-{d.qty}</span>
                                      ) : null}
                                    </td>
                                    <td className={cn(tdCls, "text-right")} style={{ color: 'var(--rn-text)' }}>{adjCost > 0 ? `R$ ${adjCost.toFixed(2)}` : '-'}</td>
                                    <td className={cn(tdCls, "text-right font-black")} style={{ color: 'var(--rn-text)' }}>{total > 0 ? `R$ ${total.toFixed(2)}` : '-'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}


              <div
                className={cn(
                  "flex-1 overflow-auto [--rn-th-bg:#FFEC4D] [--rn-th-border:#E6CE33] [--rn-th-chip-bg:rgba(26,26,10,0.05)] [--rn-th-chip-border:rgba(26,26,10,0.10)] [--rn-th-color:rgba(26,26,10,0.55)] [--rn-th-pill:rgba(0,0,0,0.08)] [--rn-cell-bg:#FFFFFF] [--rn-cell-bg-alt:#FAF7EE] [--rn-cell-border:rgba(224,216,191,0.80)] [--rn-cell-inner:rgba(0,0,0,0.06)] [--rn-seq-bg:rgba(0,0,0,0.07)] [--rn-text:rgba(26,26,10,0.85)] [--rn-text-muted:rgba(26,26,10,0.50)] [--rn-text-subtle:rgba(26,26,10,0.28)] [--rn-dup-bg:rgba(216,30,30,0.10)] [--rn-dup-border:rgba(216,30,30,0.55)] [--rn-dup-text:#B91C1C] [--rn-dup-th-border:#D81E1E] [--rn-dup-th-text:#D81E1E] [--rn-dup-th-bg:rgba(216,30,30,0.08)] dark:[--rn-th-bg:#FFEC4D] dark:[--rn-th-border:#DCC63D] dark:[--rn-th-chip-border:rgba(26,26,10,0.12)] dark:[--rn-th-color:rgba(26,26,10,0.58)] dark:[--rn-th-pill:rgba(0,0,0,0.10)] dark:[--rn-cell-bg:#252520] dark:[--rn-cell-bg-alt:#1e1e18] dark:[--rn-cell-border:rgba(242,240,227,0.06)] dark:[--rn-cell-inner:#3a3a34] dark:[--rn-seq-bg:#1a1a14] dark:[--rn-text:rgba(242,240,227,0.85)] dark:[--rn-text-muted:rgba(242,240,227,0.50)] dark:[--rn-text-subtle:rgba(242,240,227,0.28)] dark:[--rn-dup-bg:rgba(216,30,30,0.16)] dark:[--rn-dup-border:rgba(216,30,30,0.60)] dark:[--rn-dup-text:#FCA5A5]",
                  noteEditorTab !== 'produtos' && 'hidden'
                )}
                style={{ padding: 0 }}
              >
                {(() => {
                  // table-layout:fixed só respeita as larguras do <colgroup> quando a <table>
                  // tem uma largura explícita — sem isso o navegador redistribui o espaço
                  // proporcionalmente entre as colunas a cada resize, anulando o arrasto
                  // (é por isso que comprimir/alongar parecia não fazer nada).
                  const visibleReviewColKeys = (['#', 'Código', 'Produto na Nota', 'Identificação Interna', 'EAN', 'Marca', 'Medida', 'Qtd.', 'Preço Custo', 'Valor Total', ...adjColumns.map(c => c.id), 'Preço Venda', 'Markup', 'Status', 'Ok', 'Revisão', 'Distribuição'] as string[])
                    .filter(key => key === '#' || !reviewHiddenCols.has(key));
                  const totalReviewTableWidth = visibleReviewColKeys.reduce((sum, key) => sum + reviewColWidthFor(key), 0) + 36;
                  return (
                <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: totalReviewTableWidth }}>
                  <colgroup>
                    {visibleReviewColKeys.map(key => (<col key={key} style={{ width: reviewColWidthFor(key) }} />))}
                    <col style={{ width: 36 }} />
                  </colgroup>
                  <thead className="sticky top-0 z-10">
                    <tr className="text-left" style={{ borderBottom: '1.5px solid var(--rn-th-border)' }}>
                      {/* Cabeçalho igual ao da tabela de Controle Financeiro: barra amarela contínua
                          com um "chip" pill arredondado por coluna, sem divisórias verticais. */}
                      {(() => {
                        const thBar: React.CSSProperties = { background: 'var(--rn-th-bg)', padding: '9px 8px', verticalAlign: 'middle', height: '36px' };
                        const thFirst: React.CSSProperties = { ...thBar, paddingLeft: '10px' };
                        const thLast: React.CSSProperties = { ...thBar, width: '36px' };
                        const lbl = (extra?: React.CSSProperties): React.CSSProperties => ({
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          fontSize: '9px', fontWeight: 900,
                          letterSpacing: '0.10em', textTransform: 'uppercase' as const,
                          color: 'var(--rn-th-color)', whiteSpace: 'nowrap' as const,
                          background: 'var(--rn-th-chip-bg)', border: '1.5px solid var(--rn-th-chip-border)',
                          borderRadius: '9999px', padding: '5px 13px', ...extra,
                        });
                        // ── Filter helpers (used when reviewFilterActive) ──
                        const colFilterKey: Record<string, string> = {
                          'Produto na Nota': 'produto',
                          'Identificação Interna': 'interno',
                          'EAN': 'ean',
                          'Medida': 'medida',
                          'Qtd.': 'qtd',
                        };
                        // ── Duplicatas de Código/EAN — moldura vermelha no título da coluna quando há repetição ──
                        const _codigoDupCounts: Record<string, number> = {};
                        const _eanDupCounts: Record<string, number> = {};
                        viewingReviewNote!.items.forEach((it: any, i: number) => {
                          const cv = (it.supplier_code || '').trim();
                          if (cv) _codigoDupCounts[cv] = (_codigoDupCounts[cv] || 0) + 1;
                          const ev = (viewingNoteEans[i] ?? it.ean ?? '').trim();
                          if (ev) _eanDupCounts[ev] = (_eanDupCounts[ev] || 0) + 1;
                        });
                        const hasCodigoDup = Object.values(_codigoDupCounts).some(c => c > 1);
                        const hasEanDup = Object.values(_eanDupCounts).some(c => c > 1);
                        const _computeNumerics = (it: any, i: number) => {
                          const c = (viewingNoteItemPrices[i] ?? it.price ?? 0) / ((viewingNoteMultipliers[i] ?? it.multiplier) || 1);
                          const q = viewingNoteQtys[i] ?? it.qty ?? 0;
                          const { disc: dsc, sur } = calcAdjAmounts(c, q, i, adjColumns);
                          const adj = c - dsc + sur;
                          const sp = viewingNoteSellPrices[i] ?? it.product_price ?? 0;
                          return { adj, q, total: adj * q, markup: adj > 0 && sp > 0 ? ((sp - adj) / adj * 100) : null };
                        };
                        const getColUniqueValues = (key: string): string[] => {
                          const raw = viewingReviewNote!.items.map((it: any, i: number) => {
                            if (key === 'produto') return it.original_description || '-';
                            if (key === 'interno') return it.name || '-';
                            if (key === 'ean') return viewingNoteEans[i] || it.ean || '-';
                            if (key === 'medida') return viewingNoteUnits[i] || it.unit || '-';
                            if (key === 'status') return it.status_translation || '-';
                            if (key === 'seq') return String(i + 1);
                            if (key === 'codigo') return it.supplier_code || '-';
                            if (key === 'qtd') return String(viewingNoteQtys[i] ?? it.qty ?? 0);
                            if (key === 'preco_custo') { const { adj } = _computeNumerics(it, i); return adj > 0 ? `R$ ${adj.toFixed(2)}` : '-'; }
                            if (key === 'valor_total') { const { total } = _computeNumerics(it, i); return total > 0 ? `R$ ${total.toFixed(2)}` : '-'; }
                            if (key === 'markup') { const { markup } = _computeNumerics(it, i); return markup !== null ? `${markup.toFixed(1)}%` : '-'; }
                            return '-';
                          });
                          const unique = Array.from(new Set(raw));
                          // Numeric sort for seq/qtd; string sort otherwise
                          if (key === 'seq' || key === 'qtd') return unique.sort((a, b) => parseFloat(a) - parseFloat(b));
                          return unique.sort();
                        };
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
                          <th style={{ ...thFirst, position: 'relative' }}>
                            <ReviewColResizeHandle colKey="#" />
                            <div style={lbl({ justifyContent: 'center' })}>
                              #
                              {filterBtn('seq')}
                            </div>
                            {renderFilterDropdown('seq')}
                          </th>
                          {!reviewHiddenCols.has('Código') && (
                          <th style={{ ...thBar, position: 'relative' }}>
                            <ReviewColResizeHandle colKey="Código" />
                            <div style={lbl(hasCodigoDup ? { borderColor: 'var(--rn-dup-th-border)', background: 'var(--rn-dup-th-bg)' } : undefined)} title={hasCodigoDup ? 'Existem códigos duplicados nesta coluna' : undefined}>
                              {hasCodigoDup && <AlertTriangle size={9} style={{ color: 'var(--rn-dup-th-text)' }} />}
                              <span style={{ color: hasCodigoDup ? 'var(--rn-dup-th-text)' : reviewEditableCols.has('Código') ? 'rgb(52 211 153)' : 'inherit' }}>Código</span>
                              <button
                                onClick={() => setReviewEditableCols(prev => { const s = new Set(prev); s.has('Código') ? s.delete('Código') : s.add('Código'); return s; })}
                                title={reviewEditableCols.has('Código') ? 'Bloquear coluna' : 'Editar coluna'}
                                style={{ color: reviewEditableCols.has('Código') ? 'rgb(52 211 153)' : 'inherit', opacity: reviewEditableCols.has('Código') ? 1 : 0.5 }}
                                className="w-4 h-4 rounded flex items-center justify-center transition-colors hover:opacity-100"
                              >
                                <Pencil size={9} />
                              </button>
                              {filterBtn('codigo')}
                            </div>
                            {renderFilterDropdown('codigo')}
                          </th>
                          )}
                          {(['Produto na Nota', 'Identificação Interna', 'EAN'] as const).map(col => {
                            if (reviewHiddenCols.has(col)) return null;
                            const editable = reviewEditableCols.has(col);
                            const canEdit = col !== 'Identificação Interna';
                            const filterKey = colFilterKey[col];
                            const isDupCol = col === 'EAN' && hasEanDup;
                            return (
                              <th key={col} style={{ ...thBar, position: 'relative' }}>
                                <ReviewColResizeHandle colKey={col} />
                                <div style={lbl(isDupCol ? { borderColor: 'var(--rn-dup-th-border)', background: 'var(--rn-dup-th-bg)' } : undefined)} title={isDupCol ? 'Existem EANs duplicados nesta coluna' : undefined}>
                                  {isDupCol && <AlertTriangle size={9} style={{ color: 'var(--rn-dup-th-text)' }} />}
                                  <span style={{ color: isDupCol ? 'var(--rn-dup-th-text)' : editable ? 'rgb(52 211 153)' : 'inherit' }}>{col}</span>
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
                                  {col === 'Produto na Nota' && getNoteStatus(viewingReviewNote!) === 'registro' && (
                                    <button
                                      onClick={() => { setSupplierProductsSearch(''); setShowSupplierProductsModal(true); }}
                                      title="Consultar produtos cadastrados deste fornecedor"
                                      style={{ color: 'inherit', opacity: 0.65 }}
                                      className="w-4 h-4 rounded flex items-center justify-center transition-colors hover:opacity-100"
                                    >
                                      <BookText size={10} />
                                    </button>
                                  )}
                                  {filterKey && filterBtn(filterKey)}
                                </div>
                                {filterKey && renderFilterDropdown(filterKey)}
                              </th>
                            );
                          })}
                          {!reviewHiddenCols.has('Marca') && (
                          <th style={{ ...thBar, position: 'relative' }}>
                            <ReviewColResizeHandle colKey="Marca" />
                            <div style={lbl()}>
                              <span style={{ color: reviewEditableCols.has('Marca') ? 'rgb(52 211 153)' : 'inherit' }}>Marca</span>
                              <button
                                onClick={() => setReviewEditableCols(prev => { const s = new Set(prev); s.has('Marca') ? s.delete('Marca') : s.add('Marca'); return s; })}
                                title={reviewEditableCols.has('Marca') ? 'Bloquear coluna' : 'Editar coluna'}
                                style={{ color: reviewEditableCols.has('Marca') ? 'rgb(52 211 153)' : 'inherit', opacity: reviewEditableCols.has('Marca') ? 1 : 0.5 }}
                                className="w-4 h-4 rounded flex items-center justify-center transition-colors hover:opacity-100"
                              >
                                <Pencil size={9} />
                              </button>
                            </div>
                          </th>
                          )}
                          {(['Medida', 'Qtd.'] as const).map(col => {
                            if (reviewHiddenCols.has(col)) return null;
                            const editable = reviewEditableCols.has(col);
                            const canEdit = true;
                            const filterKey = colFilterKey[col];
                            return (
                              <th key={col} style={{ ...thBar, position: 'relative' }}>
                                <ReviewColResizeHandle colKey={col} />
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
                          {!reviewHiddenCols.has('Preço Custo') && (
                          <th style={{ ...thBar, position: 'relative' }}>
                            <ReviewColResizeHandle colKey="Preço Custo" />
                            <div style={lbl({ justifyContent: 'flex-end' })}>
                              Preço Custo
                              {filterBtn('preco_custo')}
                            </div>
                            {renderFilterDropdown('preco_custo')}
                          </th>
                          )}
                          {!reviewHiddenCols.has('Valor Total') && (
                          <th style={{ ...thBar, position: 'relative' }}>
                            <ReviewColResizeHandle colKey="Valor Total" />
                            <div style={lbl({ justifyContent: 'flex-end' })}>
                              <span style={{ color: reviewEditableCols.has('Valor Total') ? 'rgb(52 211 153)' : 'inherit' }}>Valor Total</span>
                              <button
                                onClick={() => setReviewEditableCols(prev => { const s = new Set(prev); s.has('Valor Total') ? s.delete('Valor Total') : s.add('Valor Total'); return s; })}
                                title={reviewEditableCols.has('Valor Total') ? 'Bloquear coluna' : 'Editar coluna — informe o valor total e o Preço Custo é calculado automaticamente (Valor Total ÷ Qtd.)'}
                                style={{ color: reviewEditableCols.has('Valor Total') ? 'rgb(52 211 153)' : 'inherit', opacity: reviewEditableCols.has('Valor Total') ? 1 : 0.5 }}
                                className="w-4 h-4 rounded flex items-center justify-center transition-colors hover:opacity-100"
                              >
                                <Pencil size={9} />
                              </button>
                              {filterBtn('valor_total')}
                            </div>
                            {renderFilterDropdown('valor_total')}
                          </th>
                          )}
                          {/* Dynamic adj column headers */}
                          {adjColumns.filter(col => !reviewHiddenCols.has(col.id)).map(col => (
                            <th key={col.id} style={{ ...thBar, position: 'relative' }}>
                              <ReviewColResizeHandle colKey={col.id} />
                              <div style={lbl()}>
                                <span className="text-[9px] font-black uppercase tracking-[0.12em]" style={{ color: col.kind === 'desconto' ? 'rgba(248,113,113,0.8)' : 'rgba(52,211,153,0.8)' }}>{col.name}</span>
                                <button
                                  onClick={() => setAdjColumns(prev => prev.filter(c => c.id !== col.id))}
                                  className="ml-1 w-4 h-4 rounded flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                  title={`Remover coluna "${col.name}"`}
                                >
                                  <X size={9} />
                                </button>
                              </div>
                            </th>
                          ))}
                          {!reviewHiddenCols.has('Preço Venda') && (
                          <th style={{ ...thBar, position: 'relative' }}><ReviewColResizeHandle colKey="Preço Venda" /><div style={lbl({ justifyContent: 'flex-end' })}>Preço Venda</div></th>
                          )}
                          {!reviewHiddenCols.has('Markup') && (
                          <th style={{ ...thBar, position: 'relative' }}>
                            <ReviewColResizeHandle colKey="Markup" />
                            <div style={lbl({ justifyContent: 'flex-end' })}>
                              Markup
                              {filterBtn('markup')}
                            </div>
                            {renderFilterDropdown('markup')}
                          </th>
                          )}
                          {/* Status — with filter */}
                          {!reviewHiddenCols.has('Status') && (
                          <th style={{ ...thBar, position: 'relative' }}>
                            <ReviewColResizeHandle colKey="Status" />
                            <div style={lbl()}>
                              <span>Status</span>
                              {filterBtn('status')}
                            </div>
                            {renderFilterDropdown('status')}
                          </th>
                          )}
                          {!reviewHiddenCols.has('Ok') && (
                          <th style={{ ...thBar, position: 'relative' }}><ReviewColResizeHandle colKey="Ok" /><div style={lbl({ justifyContent: 'center' })}>Ok</div></th>
                          )}
                          {!reviewHiddenCols.has('Revisão') && (
                          <th style={{ ...thBar, position: 'relative' }}><ReviewColResizeHandle colKey="Revisão" /><div style={lbl({ justifyContent: 'center' })}>Revisão</div></th>
                          )}
                          {!reviewHiddenCols.has('Distribuição') && (
                          <th style={{ ...thBar, position: 'relative' }}><ReviewColResizeHandle colKey="Distribuição" /><div style={lbl({ justifyContent: 'center' })}>Distribuição</div></th>
                          )}
                          <th style={thLast}><div style={lbl({ justifyContent: 'center', minWidth: 0 })}></div></th>
                        </>);
                      })()}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // ── Build filtered items list, preserving original indices ──
                      // Em "Registro", todas as colunas ficam destravadas por padrão — igual à antiga janela "Criar Manifesto".
                      const canEditItems = getNoteStatus(viewingReviewNote!) === 'registro';
                      const _allItems: any[] = viewingReviewNote!.items;
                      // ── Duplicatas de Código/EAN — preenchimento vermelho nas células repetidas ──
                      const _tbCodigoDupCounts: Record<string, number> = {};
                      const _tbEanDupCounts: Record<string, number> = {};
                      _allItems.forEach((it: any, i: number) => {
                        const cv = (it.supplier_code || '').trim();
                        if (cv) _tbCodigoDupCounts[cv] = (_tbCodigoDupCounts[cv] || 0) + 1;
                        const ev = (viewingNoteEans[i] ?? it.ean ?? '').trim();
                        if (ev) _tbEanDupCounts[ev] = (_tbEanDupCounts[ev] || 0) + 1;
                      });
                      const _getVal = (key: string, it: any, i: number): string => {
                        if (key === 'produto') return it.original_description || '-';
                        if (key === 'interno') return it.name || '-';
                        if (key === 'ean') return viewingNoteEans[i] || it.ean || '-';
                        if (key === 'medida') return viewingNoteUnits[i] || it.unit || '-';
                        if (key === 'status') return it.status_translation || '-';
                        if (key === 'seq') return String(i + 1);
                        if (key === 'codigo') return it.supplier_code || '-';
                        if (key === 'qtd') return String(viewingNoteQtys[i] ?? it.qty ?? 0);
                        if (key === 'preco_custo' || key === 'valor_total' || key === 'markup') {
                          const c = (viewingNoteItemPrices[i] ?? it.price ?? 0) / ((viewingNoteMultipliers[i] ?? it.multiplier) || 1);
                          const q = viewingNoteQtys[i] ?? it.qty ?? 0;
                          const { disc: dsc, sur } = calcAdjAmounts(c, q, i, adjColumns);
                          const adj = c - dsc + sur;
                          if (key === 'preco_custo') return adj > 0 ? `R$ ${adj.toFixed(2)}` : '-';
                          if (key === 'valor_total') { const t = adj * q; return t > 0 ? `R$ ${t.toFixed(2)}` : '-'; }
                          const sp = viewingPriceCompanyId
                            ? (getExtraSellPrice(viewingPriceCompanyId, i, it) ?? 0)
                            : (viewingNoteSellPrices[i] ?? it.product_price ?? 0);
                          return adj > 0 && sp > 0 ? `${((sp - adj) / adj * 100).toFixed(1)}%` : '-';
                        }
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
                      return _filtered.flatMap(({ item, origIdx: idx }) => {
                      const mult = (viewingNoteMultipliers[idx] ?? item.multiplier) || 1;
                      const cost = (viewingNoteItemPrices[idx] ?? item.price ?? 0) / mult;
                      const displayQty = viewingNoteQtys[idx] ?? item.qty ?? 0;
                      const rowDiscrepancy = getItemDiscrepancy(idx, item);
                      const isDisregarded = !!rowDiscrepancy?.disregarded;

                      /* ── Rounded-cell style tokens (per-row) ── */
                      const cellBg = idx % 2 === 0 ? 'var(--rn-cell-bg)' : 'var(--rn-cell-bg-alt)';
                      const tdP: React.CSSProperties = { padding: '3px 3px', borderBottom: '1px solid var(--rn-cell-border)', borderRight: '1px solid var(--rn-cell-border)' };
                      const cell = (extra?: React.CSSProperties): React.CSSProperties => ({
                        borderRadius: '9px',
                        background: 'transparent',
                        border: '1.5px solid var(--rn-cell-border)',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        transition: 'border-color 120ms cubic-bezier(0.23,1,0.32,1), box-shadow 120ms cubic-bezier(0.23,1,0.32,1)',
                        ...extra,
                      });
                      const focusCell = (el: HTMLElement | null) => { if (el) { el.style.borderColor = 'rgba(216,30,30,0.55)'; el.style.boxShadow = '0 0 0 3px rgba(216,30,30,0.12)'; } };
                      const blurCell  = (el: HTMLElement | null) => { if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; } };

                      const _rowCodigo = (item.supplier_code || '').trim();
                      const isCodigoDup = !!_rowCodigo && (_tbCodigoDupCounts[_rowCodigo] || 0) > 1;
                      const _rowEan = (viewingNoteEans[idx] ?? item.ean ?? '').trim();
                      const isEanDup = !!_rowEan && (_tbEanDupCounts[_rowEan] || 0) > 1;

                      const { disc: discountAmt, sur: surchargeAmt } = calcAdjAmounts(cost, displayQty, idx, adjColumns);
                      const hasDiscount = discountAmt > 0;
                      const hasSurcharge = surchargeAmt > 0;
                      const adjCost = cost - discountAmt + surchargeAmt;
                      const totalValue = adjCost * displayQty;
                      const adjColor = hasDiscount && hasSurcharge ? 'text-amber-400' : hasDiscount ? 'text-emerald-400' : hasSurcharge ? 'text-red-400' : 'text-white/50';

                      // Fora do contexto da empresa dona (viewingPriceCompanyId setado), Preço Venda/
                      // Markup/Ok/Revisão vêm de item.pricingByCompany — a nota continua da dona, só
                      // esses 4 campos ficam "em branco" até o usuário preencher pra essa outra empresa.
                      const isOwnerPriceContext = !viewingPriceCompanyId;
                      const sellPrice = isOwnerPriceContext
                        ? (viewingNoteSellPrices[idx] ?? item.product_price ?? 0)
                        : (getExtraSellPrice(viewingPriceCompanyId, idx, item) ?? 0);
                      const markup = adjCost > 0 && sellPrice > 0
                        ? ((sellPrice - adjCost) / adjCost * 100)
                        : null;
                      const rowVerified = isOwnerPriceContext ? !!viewingNoteVerified[idx] : getExtraVerified(viewingPriceCompanyId!, idx, item);
                      const rowReviewTs = isOwnerPriceContext ? viewingNoteReviewTimestamps[idx] : getExtraReviewTimestamp(viewingPriceCompanyId!, idx, item);
                      const rowStageProgress = getItemStageProgress({ productId: item.product_id, sellPrice: sellPrice, verified: rowVerified });
                      const _itemVariantsCheck: EanVariant[] = (viewingNoteEanVariants[idx]?.length ?? 0) > 0
                        ? viewingNoteEanVariants[idx]
                        : ((item as any).eanVariants as EanVariant[] | undefined) ?? [];
                      const _hasVariants = _itemVariantsCheck.length > 0;
                      const isRowFocused = reviewFocusedRowIdx === idx;
                      const parentRow = (
                        <tr key={idx} className={cn(
                          "transition-colors",
                          isDisregarded
                            ? "opacity-50 saturate-[0.7] [background-image:repeating-linear-gradient(135deg,rgba(255,229,0,0.16),rgba(255,229,0,0.16)_8px,transparent_8px,transparent_16px)] bg-[#FFF9D6] dark:bg-[#22200f] dark:[background-image:repeating-linear-gradient(135deg,rgba(252,211,77,0.10),rgba(252,211,77,0.10)_8px,transparent_8px,transparent_16px)] hover:opacity-70"
                            : _hasVariants ? 'bg-[#1a1402] dark:bg-[#1a1402] hover:bg-[#1f1900] dark:hover:bg-[#1f1900]'
                            : `${idx % 2 === 0 ? 'bg-white dark:bg-[#252520]' : 'bg-[#FAF7EE] dark:bg-[#1E1E18]'} hover:bg-[#FFF8D0] dark:hover:bg-white/[0.025]`
                        )}
                          onFocus={() => setReviewFocusedRowIdx(idx)}
                          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setReviewFocusedRowIdx(null); }}
                        >
                          {/* # */}
                          <td style={tdP}>
                            <div style={cell({ justifyContent: 'center', ...(isRowFocused ? { borderColor: '#DC2626', boxShadow: '0 0 0 3px rgba(220,38,38,0.15)' } : {}) })}>
                              {isDisregarded ? (
                                <span title="Divergência confirmada — valor ajustado no total/markup" className="text-amber-600 dark:text-amber-400">
                                  <Ban size={13} strokeWidth={2.4} />
                                </span>
                              ) : (
                                <span className="text-[10px] font-black" style={{ color: isRowFocused ? '#DC2626' : 'var(--rn-text-subtle)' }}>
                                  {item.seq ?? idx + 1}
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Código fornecedor */}
                          {!reviewHiddenCols.has('Código') && (
                          <td style={tdP}
                            onFocus={e => focusCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                            onBlur={e => blurCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                          >
                            <div data-cell style={cell({ padding: '0 10px', ...(isCodigoDup ? { background: 'var(--rn-dup-bg)', borderColor: 'var(--rn-dup-border)' } : {}) })} title={isCodigoDup ? 'Código duplicado nesta nota' : undefined}>
                              {(canEditItems || reviewEditableCols.has('Código')) ? (
                                <input type="text" value={item.supplier_code || ''}
                                  onChange={e => { const u = [...viewingReviewNote!.items]; u[idx] = { ...u[idx], supplier_code: e.target.value }; setViewingReviewNote({ ...viewingReviewNote!, items: u }); }}
                                  onPaste={e => handleNoteColumnPaste(e, idx, 'supplier_code')}
                                  onBlur={captureSnapshot}
                                  className="w-full font-mono text-xs font-bold bg-transparent outline-none" style={{ color: isCodigoDup ? 'var(--rn-dup-text)' : 'var(--rn-text)' }} />
                              ) : item.supplier_code ? (
                                <span className="font-mono text-xs font-bold" style={{ color: isCodigoDup ? 'var(--rn-dup-text)' : 'var(--rn-text-muted)' }}>{item.supplier_code}</span>
                              ) : (
                                <span className="text-xs font-medium" style={{ color: 'var(--rn-text-subtle)' }}>—</span>
                              )}
                            </div>
                          </td>
                          )}
                          {!reviewHiddenCols.has('Produto na Nota') && (
                          <td style={tdP}
                            onFocus={e => focusCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                            onBlur={e => blurCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                          >
                            <div data-cell style={cell({ padding: '0 10px', overflow: (canEditItems || reviewEditableCols.has('Produto na Nota')) ? 'visible' : 'hidden' })}>
                              {(canEditItems || reviewEditableCols.has('Produto na Nota')) ? (
                                <input type="text" value={item.original_description || ''}
                                  data-nav-table="review-note" data-nav-row={idx} data-nav-col={0}
                                  onChange={e => { const u = [...viewingReviewNote!.items]; u[idx] = { ...u[idx], original_description: e.target.value }; setViewingReviewNote({ ...viewingReviewNote!, items: u }); }}
                                  onKeyDown={tableCellKeyDown('review-note', idx, 0)}
                                  onPaste={e => handleNoteColumnPaste(e, idx, 'original_description')}
                                  className="w-full text-[11px] font-semibold bg-transparent outline-none" style={{ color: 'var(--rn-text)' }} />
                              ) : (
                                <div className="flex items-center gap-1 min-w-0 flex-1">
                                  <p className="text-[11px] font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--rn-text)' }} title={item.original_description || '-'}>{item.original_description || '-'}</p>
                                  {(() => {
                                    const mapping = getItemMapping(item);
                                    if (!mapping) return null;
                                    const mappedProduct = products.find((p: any) => p.id === mapping.internal_product_id);
                                    return (
                                      <div className="relative group shrink-0">
                                        <Bookmark size={10} className="text-amber-400 fill-amber-400/30" />
                                        <span className="pointer-events-none absolute bottom-[calc(100%+6px)] right-0 scale-95 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-100 bg-[#3a3a32] text-[#f2f0e3] text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap shadow-lg z-[300] after:content-[''] after:absolute after:top-full after:right-2 after:border-4 after:border-transparent after:border-t-[#3a3a32]">
                                          Tradução: {mappedProduct?.name || '—'}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          </td>
                          )}
                          {!reviewHiddenCols.has('Identificação Interna') && (
                          <td style={{ ...tdP, position: 'relative' }}>
                            <div style={cell({ padding: '0 8px', overflow: 'visible', gap: '6px' })}>
                              {item.product_id ? (
                                /* Produto vinculado: nome truncado + botão icon para trocar */
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span
                                    onClick={() => {
                                      const linkedProduct = products.find((p: any) => p.id === item.product_id);
                                      if (linkedProduct) openEditModal(linkedProduct);
                                    }}
                                    className="text-[11px] font-bold text-emerald-400 truncate max-w-[120px] cursor-pointer hover:underline underline-offset-2"
                                    title={`${item.name} — clique para editar produto`}
                                  >
                                    {item.name}
                                  </span>
                                  {item.mother_package_id && (
                                    <span
                                      className="w-[18px] h-[18px] shrink-0 rounded-[6px] bg-amber-500/15 text-amber-400 flex items-center justify-center"
                                      title={`Convertido de caixa — EAN ${item.mother_package_ean || '—'}, ×${item.multiplier}`}
                                    >
                                      <Package size={10} />
                                    </span>
                                  )}
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
                                    onClick={() => openNoteItemLink(idx, item)}
                                    className={cn(
                                      'w-[26px] h-[26px] flex items-center justify-center rounded-[7px] border transition-all active:scale-90',
                                      (item as any).mother_draft ? 'border-primary/40 bg-primary/10 text-primary' : 'border-dashed hover:bg-primary/10 hover:border-primary/40 hover:text-primary'
                                    )}
                                    style={(item as any).mother_draft ? undefined : { background: 'var(--rn-cell-inner)', borderColor: 'var(--rn-cell-border)', color: 'var(--rn-text-muted)' }}
                                  >
                                    <Plus size={12} />
                                  </button>
                                  {/* Produto Mãe já definido (item.mother_draft) mas o produto normal ainda
                                      não foi criado — sinaliza a pendência que bloqueia a aprovação da nota. */}
                                  {(item as any).mother_draft && (
                                    <span className="pointer-events-none absolute -top-1 -right-1 w-[9px] h-[9px] rounded-full bg-primary border-2 border-[var(--rn-cell-inner,white)]" />
                                  )}
                                  <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 scale-95 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-100 bg-[#3a3a32] text-[#f2f0e3] text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap shadow-lg z-[300] after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-[#3a3a32]">
                                    {(item as any).mother_draft ? 'Produto Mãe pendente — falta criar o produto' : 'Vincular'}
                                  </span>
                                </div>
                              )}
                              {/* Botão Vários — sempre ícone */}
                              <div className="relative group shrink-0">
                                <button
                                  onClick={() => {
                                    setMultiLinkItemIdx(idx);
                                    setMultiLinkItemSearch('');
                                    setMultiLinkItemResults([]);
                                    setMultiLinkItemShowCreate(false);
                                    if ((item as any).multiLinked && item.product_id) {
                                      const currentQty = String(viewingNoteQtys[idx] ?? item.qty ?? '');
                                      setMultiLinkItemQty(currentQty);
                                      setMultiLinkItemEntries([{ product: { id: item.product_id, name: item.name, sku: item.sku, ean: item.ean, price: item.product_price }, qty: currentQty, multiplier: '1', supplierCode: item.supplier_code || '' }]);
                                    } else {
                                      setMultiLinkItemQty('');
                                      setMultiLinkItemEntries([]);
                                    }
                                  }}
                                  className={cn(
                                    'w-[26px] h-[26px] flex items-center justify-center rounded-[7px] border transition-all active:scale-90',
                                    (item as any).multiLinked
                                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/18'
                                      : 'border-dashed hover:bg-primary/10 hover:border-primary/40 hover:text-primary'
                                  )}
                                  style={(item as any).multiLinked ? undefined : { background: 'var(--rn-cell-inner)', borderColor: 'var(--rn-cell-border)', color: 'var(--rn-text-muted)' }}
                                >
                                  <Layers size={12} />
                                </button>
                                <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 scale-95 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-100 bg-[#3a3a32] text-[#f2f0e3] text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap shadow-lg z-[300] after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-[#3a3a32]">
                                  Vários
                                </span>
                              </div>
                              {/* Atalho: se já existe tradução permanente, vincula na hora; senão cria/vincula normalmente */}
                              <div className="relative group shrink-0">
                                {(() => {
                                  const permanentMapping = getItemMapping(item);
                                  return (
                                    <button
                                      onClick={() => permanentMapping
                                        ? handleUsePermanentTranslation(idx, item, permanentMapping.internal_product_id)
                                        : openQuickCreateOrLink(idx, item)}
                                      className={cn(
                                        'w-[26px] h-[26px] flex items-center justify-center rounded-[7px] border transition-all active:scale-90',
                                        permanentMapping
                                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 hover:bg-amber-500/25'
                                          : 'border-dashed hover:bg-primary/10 hover:border-primary/40 hover:text-primary'
                                      )}
                                      style={permanentMapping ? undefined : { background: 'var(--rn-cell-inner)', borderColor: 'var(--rn-cell-border)', color: 'var(--rn-text-muted)' }}
                                    >
                                      <Zap size={12} className={permanentMapping ? 'fill-amber-500/30' : undefined} />
                                    </button>
                                  );
                                })()}
                                <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 scale-95 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-100 bg-[#3a3a32] text-[#f2f0e3] text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap shadow-lg z-[300] after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-[#3a3a32]">
                                  {getItemMapping(item) ? 'Usar tradução permanente' : 'Criar e Vincular'}
                                </span>
                              </div>
                            </div>
                          </td>
                          )}
                          {!reviewHiddenCols.has('EAN') && (
                          <td style={tdP}
                            onFocus={e => focusCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                            onBlur={e => blurCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                          >
                            <div data-cell style={cell({ padding: '0 10px', ...(isEanDup ? { background: 'var(--rn-dup-bg)', borderColor: 'var(--rn-dup-border)' } : {}) })} title={isEanDup ? 'EAN duplicado nesta nota' : undefined}>
                              {(canEditItems || reviewEditableCols.has('EAN')) ? (
                                <input type="text" value={viewingNoteEans[idx] ?? item.ean ?? ''}
                                  data-nav-table="review-note" data-nav-row={idx} data-nav-col={1}
                                  onChange={e => { const u = [...viewingNoteEans]; u[idx] = e.target.value; setViewingNoteEans(u); }}
                                  onPaste={e => handleNoteColumnPaste(e, idx, 'ean')}
                                  onKeyDown={tableCellKeyDown('review-note', idx, 1)}
                                  onBlur={captureSnapshot}
                                  className="w-full text-[11px] font-bold bg-transparent outline-none font-mono" style={{ color: isEanDup ? 'var(--rn-dup-text)' : 'var(--rn-text)' }} />
                              ) : (
                                <div className="flex items-center justify-between gap-1 w-full">
                                  <p className="text-[11px] font-bold font-mono truncate" style={{ color: isEanDup ? 'var(--rn-dup-text)' : 'var(--rn-text-muted)' }}>{(viewingNoteEans[idx] ?? item.ean) || '—'}</p>
                                  {(viewingNoteEans[idx] ?? item.ean) && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopyEan(idx, String(viewingNoteEans[idx] ?? item.ean ?? ''))}
                                      title="Copiar EAN"
                                      className="shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                                      style={{ color: 'var(--rn-text-muted)' }}
                                    >
                                      {copiedEanIdx === idx ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          )}
                          {/* Marca — alimenta o campo "Marca" do cadastro do produto ao vincular/aprovar */}
                          {!reviewHiddenCols.has('Marca') && (
                          <td style={tdP}
                            onFocus={e => focusCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                            onBlur={e => blurCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                          >
                            <div data-cell style={cell({ padding: '0 10px' })}>
                              {(canEditItems || reviewEditableCols.has('Marca')) ? (
                                <input type="text" value={item.brand || ''}
                                  onChange={e => { const u = [...viewingReviewNote!.items]; u[idx] = { ...u[idx], brand: e.target.value }; setViewingReviewNote({ ...viewingReviewNote!, items: u }); }}
                                  onPaste={e => handleNoteColumnPaste(e, idx, 'brand')}
                                  onBlur={captureSnapshot}
                                  className="w-full text-xs font-semibold bg-transparent outline-none" style={{ color: 'var(--rn-text)' }} />
                              ) : item.brand ? (
                                <span className="text-xs font-semibold" style={{ color: 'var(--rn-text-muted)' }}>{item.brand}</span>
                              ) : (
                                <span className="text-xs font-medium" style={{ color: 'var(--rn-text-subtle)' }}>—</span>
                              )}
                            </div>
                          </td>
                          )}
                          {/* Medida — unidade/multiplicador, junto com Usar tradução / Adicionar medida */}
                          {!reviewHiddenCols.has('Medida') && (
                          <td style={{ ...tdP, position: 'relative' }}>
                            <div style={cell({ justifyContent: 'center', overflow: 'visible', padding: '4px 6px' })}>
                            {(canEditItems || reviewEditableCols.has('Medida')) ? (
                              <div className="relative flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                                {viewingNoteMeasureConverted[idx] && (
                                  <span
                                    className="absolute -top-[5px] -left-[3px] w-[15px] h-[15px] rounded-full flex items-center justify-center shrink-0 bg-amber-200/90 dark:bg-amber-400/20 text-amber-800 dark:text-amber-300 shadow-sm ring-[1.5px] ring-[#FDFAF0] dark:ring-[#1E1E18] z-[2]"
                                    title="Medida definida por conversão (tradução ou medida cadastrada)"
                                  >
                                    <ArrowLeftRight size={8} strokeWidth={3} />
                                  </span>
                                )}
                                {(() => {
                                  const distribQty = getDistribTotal(idx, item);
                                  if (distribQty <= 0) return null;
                                  return (
                                    <span
                                      className={cn(
                                        'absolute -top-[5px] w-[15px] h-[15px] rounded-full flex items-center justify-center shrink-0 bg-violet-200/90 dark:bg-violet-400/20 text-violet-800 dark:text-violet-300 shadow-sm ring-[1.5px] ring-[#FDFAF0] dark:ring-[#1E1E18] z-[2]',
                                        viewingNoteMeasureConverted[idx] ? 'left-[9px]' : '-left-[3px]'
                                      )}
                                      title={`Distribuído para outra loja (${distribQty} un.)`}
                                    >
                                      <Truck size={8} strokeWidth={3} />
                                    </span>
                                  );
                                })()}
                                <input
                                  type="text"
                                  value={viewingNoteUnits[idx] ?? item.unit ?? ''}
                                  data-nav-table="review-note" data-nav-row={idx} data-nav-col={2}
                                  onChange={e => { const u = [...viewingNoteUnits]; u[idx] = e.target.value; setViewingNoteUnits(u); const c = [...viewingNoteMeasureConverted]; c[idx] = false; setViewingNoteMeasureConverted(c); }}
                                  onKeyDown={tableCellKeyDown('review-note', idx, 2)}
                                  onPaste={e => handleNoteColumnPaste(e, idx, 'unit')}
                                  onBlur={captureSnapshot}
                                  className="w-12 bg-transparent border-b border-transparent hover:border-white/20 focus:border-primary/50 outline-none py-0.5 px-1 text-xs font-medium text-center transition-colors"
                                  style={{ color: 'var(--rn-text-muted)' }}
                                  placeholder="UN"
                                />
                                {(viewingNoteMultipliers[idx] ?? item.multiplier ?? 1) > 1 && (
                                  <span className="text-[8px] font-black text-primary/60 leading-none shrink-0" title={`×${viewingNoteMultipliers[idx] ?? item.multiplier}`}>
                                    ×{viewingNoteMultipliers[idx] ?? item.multiplier}
                                  </span>
                                )}
                                <button
                                  onClick={(e) => handleMeasureTriggerClick(idx, item, e.currentTarget, 120)}
                                  className={cn(
                                    'w-4 h-4 rounded flex items-center justify-center transition-all shrink-0',
                                    reviewUnitMenuIdx === idx ? 'bg-primary text-white' : 'text-white/30 hover:text-primary hover:bg-primary/10'
                                  )}
                                >
                                  <Plus size={10} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => handleMeasureTriggerClick(idx, item, e.currentTarget, 100)}
                                className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] transition-colors" style={{ background: 'var(--rn-cell-inner)' }}
                              >
                                {viewingNoteMeasureConverted[idx] && (
                                  <span
                                    className="absolute -top-[5px] -left-[3px] w-[15px] h-[15px] rounded-full flex items-center justify-center shrink-0 bg-amber-200/90 dark:bg-amber-400/20 text-amber-800 dark:text-amber-300 shadow-sm ring-[1.5px] ring-[#FDFAF0] dark:ring-[#1E1E18] z-[2]"
                                    title="Medida definida por conversão (tradução ou medida cadastrada)"
                                  >
                                    <ArrowLeftRight size={8} strokeWidth={3} />
                                  </span>
                                )}
                                {(() => {
                                  const distribQty = getDistribTotal(idx, item);
                                  if (distribQty <= 0) return null;
                                  return (
                                    <span
                                      className={cn(
                                        'absolute -top-[5px] w-[15px] h-[15px] rounded-full flex items-center justify-center shrink-0 bg-violet-200/90 dark:bg-violet-400/20 text-violet-800 dark:text-violet-300 shadow-sm ring-[1.5px] ring-[#FDFAF0] dark:ring-[#1E1E18] z-[2]',
                                        viewingNoteMeasureConverted[idx] ? 'left-[9px]' : '-left-[3px]'
                                      )}
                                      title={`Distribuído para outra loja (${distribQty} un.)`}
                                    >
                                      <Truck size={8} strokeWidth={3} />
                                    </span>
                                  );
                                })()}
                                <span className="text-sm font-black truncate min-w-0 max-w-[56px]" style={{ color: 'var(--rn-text-muted)' }} title={viewingNoteUnits[idx] ?? item.unit ?? 'UN'}>{viewingNoteUnits[idx] ?? item.unit ?? 'UN'}</span>
                                {(viewingNoteMultipliers[idx] ?? item.multiplier ?? 1) > 1 && (
                                  <span className="text-[9px] font-black text-primary/60 leading-none shrink-0">×{viewingNoteMultipliers[idx] ?? item.multiplier}</span>
                                )}
                              </button>
                            )}
                            </div>
                          </td>
                          )}
                          {/* Quantidade — só o número; medida/tradução vivem na coluna Medida */}
                          {!reviewHiddenCols.has('Qtd.') && (
                          <td style={{ ...tdP, position: 'relative' }}>
                            {(() => {
                              const distribQty = getDistribTotal(idx, item);
                              if (distribQty <= 0) return null;
                              return (
                                <span
                                  className="absolute top-[2px] left-[2px] w-[15px] h-[15px] rounded-full flex items-center justify-center shrink-0 bg-violet-200/90 dark:bg-violet-400/20 text-violet-800 dark:text-violet-300 shadow-sm ring-[1.5px] ring-[#FDFAF0] dark:ring-[#1E1E18] z-[2]"
                                  title={`Distribuído para outra loja (${distribQty} un.)`}
                                >
                                  <Truck size={8} strokeWidth={3} />
                                </span>
                              );
                            })()}
                            <div style={cell({ justifyContent: 'center', overflow: 'visible', gap: '6px' })}>
                            <div className="flex items-center gap-1.5">
                            {(canEditItems || reviewEditableCols.has('Qtd.')) ? (
                              <input type="number" min="0" value={(viewingNoteQtys[idx] ?? item.qty) ?? ''}
                                data-nav-table="review-note" data-nav-row={idx} data-nav-col={3}
                                onChange={e => { const u = [...viewingNoteQtys]; u[idx] = e.target.value === '' ? null : (parseInt(e.target.value) || 0); setViewingNoteQtys(u); }}
                                onKeyDown={tableCellKeyDown('review-note', idx, 3)}
                                onPaste={e => handleNoteColumnPaste(e, idx, 'qty')}
                                onBlur={captureSnapshot}
                                onWheel={blockWheelChange}
                                className="w-16 text-center text-sm font-black bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden" style={{ color: 'var(--rn-text)' }} />
                            ) : (() => {
                              // Mesmo padrão visual da coluna Qtd. Env. da Distribuição: botão
                              // circular colorido (seta) + quantidade efetiva em negrito + qtd.
                              // original riscada quando há Falta/Sobra registrada.
                              const d = getItemDiscrepancy(idx, item);
                              const rawQty = viewingNoteQtys[idx] ?? item.qty ?? 0;
                              const effQty = getDisplayQty(rawQty, d);
                              const showRecalc = !!d && effQty !== rawQty;
                              return (
                                <>
                                  <button
                                    onClick={e => {
                                      e.stopPropagation();
                                      const existing = getItemDiscrepancy(idx, item);
                                      setDiscrepancyTab(existing?.type ?? 'falta');
                                      setDiscrepancyQty(existing && !existing.missingAll ? String(existing.qty || '') : '');
                                      setDiscrepancyMissingAll(existing?.missingAll ?? false);
                                      setDiscrepancyObs(existing?.obs ?? '');
                                      setDiscrepancyDisregarded(existing?.disregarded ?? false);
                                      setDiscrepancyModalIdx(idx);
                                    }}
                                    title={
                                      d
                                        ? (d.type === 'falta'
                                            ? (d.missingAll ? 'Falta — não veio (clique para editar)' : `Falta ${d.qty} (clique para editar)`)
                                            : `Sobra ${d.qty} (clique para editar)`)
                                        : 'Registrar Falta/Sobra'
                                    }
                                    className={cn(
                                      "flex items-center justify-center w-5 h-5 rounded-full border-[1.5px] transition-colors shrink-0",
                                      d?.type === 'falta'
                                        ? "text-red-500 dark:text-red-400 border-red-500/40 bg-red-500/10 hover:bg-red-500/20"
                                        : d?.type === 'sobra'
                                          ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20"
                                          : "text-black/30 dark:text-white/25 border-black/20 dark:border-white/20 hover:text-black/55 dark:hover:text-white/55 hover:border-black/35 dark:hover:border-white/35"
                                    )}
                                  >
                                    {d?.type === 'falta' ? <ArrowDown size={11} /> : d?.type === 'sobra' ? <ArrowUp size={11} /> : <Plus size={11} />}
                                  </button>
                                  <span className={cn(
                                    "text-sm font-black",
                                    showRecalc ? (d!.type === 'falta' ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400") : ""
                                  )} style={showRecalc ? undefined : { color: 'var(--rn-text)' }}>
                                    {effQty}
                                  </span>
                                  {showRecalc && (
                                    <span className="text-[9px] font-bold text-black/30 dark:text-white/25 line-through shrink-0">{rawQty}</span>
                                  )}
                                </>
                              );
                            })()}
                            </div>
                            </div>
                          </td>
                          )}
                          {/* Preço Custo — shows adjCost when discount/surcharge active */}
                          {!reviewHiddenCols.has('Preço Custo') && (
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
                                        // Mostra/edita o custo por unidade (já dividido pelo fator de conversão, se
                                        // houver) — não o valor bruto armazenado, que pode ser o preço da embalagem
                                        // inteira (produto mãe). Editar aqui grava de volta multiplicado por `mult`,
                                        // mantendo a mesma convenção usada em todo o resto da tela (cost = preço/mult).
                                        value={viewingNoteItemPrices[idx] === null ? '' : cost}
                                        onChange={e => {
                                          const raw = e.target.value;
                                          const u = [...viewingNoteItemPrices];
                                          if (raw === '') { u[idx] = null; setViewingNoteItemPrices(u); return; }
                                          const newCost = parseFloat(raw);
                                          if (isNaN(newCost)) return;
                                          u[idx] = newCost * mult;
                                          setViewingNoteItemPrices(u);
                                        }}
                                        onKeyDown={tableCellKeyDown('review-note', idx, 4)}
                                        onPaste={e => handleNoteColumnPaste(e, idx, 'price')}
                                        onBlur={captureSnapshot}
                                        onWheel={blockWheelChange}
                                        className="w-14 text-xs font-black bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden" style={{ color: 'var(--rn-text)' }}
                                      />
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          )}
                          {/* Valor Total — editável via coluna (lápis): informar o total divide pela Qtd.
                              e grava o resultado como Preço Custo (mesma fonte que a coluna Preço Custo
                              usa), evitando o usuário calcular por fora. Só faz sentido quando não há
                              desconto/acréscimo ativo na linha (aí Preço Custo também vira só leitura,
                              porque o valor exibido já é ajustado) e quando há uma Qtd. válida pra dividir. */}
                          {!reviewHiddenCols.has('Valor Total') && (
                          <td style={tdP}>
                            <div style={cell({ justifyContent: 'flex-end', padding: '0 10px' })}>
                              {(canEditItems || reviewEditableCols.has('Valor Total')) && !hasDiscount && !hasSurcharge && displayQty > 0 ? (
                                <div className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1" style={{ background: 'var(--rn-cell-inner)' }}>
                                  <span className="text-[10px] font-black shrink-0" style={{ color: 'var(--rn-text-muted)' }}>R$</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={totalValue > 0 ? parseFloat(totalValue.toFixed(2)) : ''}
                                    onChange={e => {
                                      const raw = e.target.value;
                                      const u = [...viewingNoteItemPrices];
                                      if (raw === '') { u[idx] = null; setViewingNoteItemPrices(u); return; }
                                      const newTotal = parseFloat(raw);
                                      if (isNaN(newTotal)) return;
                                      u[idx] = (newTotal / displayQty) * mult;
                                      setViewingNoteItemPrices(u);
                                    }}
                                    onBlur={captureSnapshot}
                                    onWheel={blockWheelChange}
                                    title="Preço Custo é calculado automaticamente (Valor Total ÷ Qtd.)"
                                    className="w-16 text-xs font-bold bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden text-right"
                                    style={{ color: 'var(--rn-text)' }}
                                  />
                                </div>
                              ) : (
                                <span className="text-xs font-bold" style={{ color: totalValue > 0 ? 'var(--rn-text-muted)' : 'var(--rn-text-subtle)' }}>
                                  {totalValue > 0 ? `R$ ${totalValue.toFixed(2)}` : '—'}
                                </span>
                              )}
                            </div>
                          </td>
                          )}
                          {/* Dynamic adj column cells */}
                          {adjColumns.map((col, colIdx) => {
                            if (reviewHiddenCols.has(col.id)) return null;
                            const isDisc = col.kind === 'desconto';
                            const colorClass = isDisc ? 'text-red-400' : 'text-emerald-400';
                            const prefix = isDisc ? '- R$' : '+ R$';
                            if (col.mode === 'geral') {
                              const amt = col.geralType === 'pct' ? cost * col.geralValue / 100 : col.geralValue;
                              return (
                                <td key={col.id} style={tdP}>
                                  <div style={cell({ justifyContent: 'flex-end', padding: '0 10px' })}>
                                    <span className={`${colorClass} font-bold text-xs`}>{prefix} {amt.toFixed(2)}</span>
                                  </div>
                                </td>
                              );
                            }
                            return (
                              <td key={col.id} style={tdP}
                                onFocus={e => focusCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                                onBlur={e => blurCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                              >
                                <div data-cell style={cell({ justifyContent: 'flex-end', padding: '0 10px' })}>
                                  <div className="flex items-center justify-end gap-1">
                                    <span className="text-[10px] font-bold" style={{ color: 'var(--rn-text-subtle)' }}>{col.individualType === 'pct' ? '%' : col.individualType === 'fixed_total' ? 'R$∑' : 'R$'}</span>
                                    <input
                                      type="number" min="0" step="0.01"
                                      data-nav-table="review-note" data-nav-row={idx} data-nav-col={5 + colIdx}
                                      value={col.items[idx] ?? ''}
                                      onChange={e => {
                                        setAdjColumns(prev => prev.map((c, ci) => {
                                          if (ci !== colIdx) return c;
                                          const items = [...c.items];
                                          items[idx] = e.target.value;
                                          return { ...c, items };
                                        }));
                                      }}
                                      onKeyDown={tableCellKeyDown('review-note', idx, 5 + colIdx)}
                                      onPaste={e => handleAdjColumnPaste(e, idx, colIdx)}
                                      placeholder="0"
                                      onWheel={blockWheelChange}
                                      className={`w-12 text-right text-xs font-bold ${colorClass} bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden`}
                                    />
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                          {/* Preço Venda — se o item está vinculado a um produto do dicionário e a célula
                              está vazia, o preço já cadastrado aparece só como sugestão (placeholder cinza
                              claro), sem preencher o campo de verdade. Se já tem valor, usa esse direto. */}
                          {!reviewHiddenCols.has('Preço Venda') && (() => {
                            const linkedProduct = item.product_id ? products.find((p: any) => p.id === item.product_id) : null;
                            const suggestedPrice = isOwnerPriceContext && linkedProduct && linkedProduct.price > 0 ? linkedProduct.price : null;
                            return (
                          <td style={tdP}
                            onFocus={e => focusCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                            onBlur={e => blurCell(e.currentTarget.querySelector<HTMLElement>('[data-cell]'))}
                          >
                            <div data-cell style={cell({
                              justifyContent: 'flex-end', padding: '0 10px',
                              ...(!isOwnerPriceContext && !sellPrice ? { borderStyle: 'dashed', borderColor: 'rgba(216,30,30,0.45)', background: 'rgba(216,30,30,0.04)' } : {}),
                            })}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                data-nav-table="review-note" data-nav-row={idx} data-nav-col={7}
                                value={(isOwnerPriceContext ? viewingNoteSellPrices[idx] : sellPrice) || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  if (isOwnerPriceContext) {
                                    const updated = [...viewingNoteSellPrices];
                                    updated[idx] = val;
                                    setViewingNoteSellPrices(updated);
                                  } else {
                                    setExtraSellPrice(viewingPriceCompanyId!, idx, val);
                                  }
                                }}
                                onKeyDown={tableCellKeyDown('review-note', idx, 7)}
                                placeholder={suggestedPrice ? suggestedPrice.toFixed(2).replace('.', ',') : '0,00'}
                                title={suggestedPrice ? `Sugestão — preço cadastrado no dicionário: R$ ${suggestedPrice.toFixed(2).replace('.', ',')}` : undefined}
                                onWheel={blockWheelChange}
                                className="w-20 text-right text-xs font-bold bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden placeholder:[color:var(--rn-text-subtle)]"
                                style={{ color: 'var(--rn-text)' }}
                              />
                            </div>
                          </td>
                            );
                          })()}
                          {/* Markup */}
                          {!reviewHiddenCols.has('Markup') && (
                          <td style={tdP}>
                            <div style={cell({ justifyContent: 'flex-end', padding: '0 10px' })}>
                              {markup !== null ? (
                                <span className={cn(
                                  "inline-block px-2 py-0.5 rounded-lg text-[11px] font-black",
                                  markup >= 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400"
                                )}>
                                  {markup >= 0 ? '+' : ''}{markup.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold" style={{ color: 'var(--rn-text-subtle)' }}>—</span>
                              )}
                            </div>
                          </td>
                          )}
                          {/* Status */}
                          {!reviewHiddenCols.has('Status') && (
                          <td style={tdP}>
                            <div style={cell({ padding: '0 10px' })}>
                              <span className={cn(
                                "px-2 py-0.5 rounded-lg text-[10px] font-black uppercase",
                                item.product_id && item.status_translation === 'Traduzido' ? "bg-amber-500/10 text-amber-400" :
                                item.product_id ? "bg-blue-500/10 text-blue-400" :
                                "bg-red-500/10 text-red-400"
                              )}>
                                {item.status_translation}
                              </span>
                            </div>
                          </td>
                          )}
                          {/* Ok — etapa 3 (manual) do progresso logístico; só liberada quando as
                              etapas 1 (cadastrado) e 2 (precificado) já estiverem concluídas. */}
                          {!reviewHiddenCols.has('Ok') && (
                          <td style={tdP}>
                            <div style={cell({ justifyContent: 'center' })}>
                              {rowStageProgress.completed === 3 ? (
                                <button
                                  onClick={() => {
                                    if (isOwnerPriceContext) {
                                      const updated = [...viewingNoteVerified];
                                      updated[idx] = false;
                                      setViewingNoteVerified(updated);
                                    } else {
                                      setExtraVerified(viewingPriceCompanyId!, idx, false);
                                    }
                                  }}
                                  title="Todas as etapas concluídas — clique para desmarcar 'Produto atualizado'"
                                  className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white shadow shadow-green-500/30 hover:bg-green-600 active:scale-90 transition-all"
                                >
                                  <CheckCircle2 size={12} />
                                </button>
                              ) : !(rowStageProgress.stage1 && rowStageProgress.stage2) ? (
                                <span
                                  title="Vincule o produto e defina o preço de venda antes de confirmar a atualização"
                                  className="w-6 h-6 rounded-full flex items-center justify-center cursor-not-allowed opacity-50"
                                  style={{ background: 'var(--rn-cell-inner)', color: 'var(--rn-text-subtle)' }}
                                >
                                  <X size={12} />
                                </span>
                              ) : (
                                <button
                                  onClick={() => {
                                    const ts = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                                    if (isOwnerPriceContext) {
                                      const updatedVerified = [...viewingNoteVerified];
                                      updatedVerified[idx] = true;
                                      setViewingNoteVerified(updatedVerified);
                                      const updatedTs = [...viewingNoteReviewTimestamps];
                                      updatedTs[idx] = ts;
                                      setViewingNoteReviewTimestamps(updatedTs);
                                    } else {
                                      setExtraVerified(viewingPriceCompanyId!, idx, true, ts);
                                    }
                                  }}
                                  title="Confirmar 'Produto atualizado' (2/2 etapas automáticas já concluídas)"
                                  className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer",
                                    !isOwnerPriceContext ? "hover:bg-[#D81E1E]/10 hover:text-[#D81E1E] border border-dashed border-[#D81E1E]/45" : "hover:bg-primary/10 hover:text-primary",
                                  )}
                                  style={{ background: 'var(--rn-cell-inner)', color: 'var(--rn-text-subtle)' }}
                                >
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                          )}
                          {/* Revisão — fração das 3 etapas concluídas (cadastrado / precificado /
                              atualizado); tooltip detalha cada etapa e o timestamp da confirmação manual. */}
                          {!reviewHiddenCols.has('Revisão') && (
                          <td style={tdP}>
                            <div style={cell({ justifyContent: 'center', padding: '0 8px' })}>
                              <span
                                title={`Produto cadastrado: ${rowStageProgress.stage1 ? '✓' : '✗'} · Produto precificado: ${rowStageProgress.stage2 ? '✓' : '✗'} · Produto atualizado: ${rowStageProgress.stage3 ? `✓ em ${rowReviewTs}` : 'pendente'}`}
                                className={cn(
                                  "inline-block px-1.5 py-0.5 rounded-lg text-[10px] font-bold leading-tight whitespace-nowrap",
                                  rowStageProgress.completed === 3 ? "bg-emerald-500/10 text-emerald-400"
                                    : rowStageProgress.completed === 2 ? "bg-amber-500/10 text-amber-400"
                                    : "bg-[var(--rn-cell-inner)]"
                                )}
                                style={rowStageProgress.completed < 2 ? { color: 'var(--rn-text-subtle)' } : undefined}
                              >
                                {rowStageProgress.completed}/3
                              </span>
                            </div>
                          </td>
                          )}
                          {/* Distribuição — abre modal de distribuição por loja (Record company_id -> qty) */}
                          {!reviewHiddenCols.has('Distribuição') && (
                          <td style={tdP}>
                            <div style={cell({ justifyContent: 'center', padding: '0 8px' })}>
                              {(() => {
                                const total = getDistribTotal(idx, item);
                                return (
                                  <button
                                    onClick={() => {
                                      const draft: Record<string, string> = {};
                                      Object.entries(viewingNoteDistribByCompany[idx] || {}).forEach(([cid, v]) => { draft[cid] = String(v); });
                                      setDistribModalDraft(draft);
                                      setDistribModalIdx(idx);
                                    }}
                                    className={cn(
                                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-colors',
                                      total > 0 ? 'bg-violet-500/10 text-violet-600 dark:text-violet-300 hover:bg-violet-500/20' : 'text-white/25 hover:text-white/45 hover:bg-white/5'
                                    )}
                                  >
                                    <Truck size={11} />
                                    {total > 0 ? `${total} un.` : '—'}
                                  </button>
                                );
                              })()}
                            </div>
                          </td>
                          )}
                          {/* Botão excluir item */}
                          <td style={{ ...tdP, borderRight: 'none' }}>
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
                                    setViewingNoteMeasureConverted(remove(viewingNoteMeasureConverted));
                                    setViewingNoteReviewTimestamps(remove(viewingNoteReviewTimestamps));
                                    setViewingNoteDistribuicao(remove(viewingNoteDistribuicao));
                                    setViewingNoteDistribByCompany(remove(viewingNoteDistribByCompany));
                                    setViewingDistribMode(remove(viewingDistribMode));
                                    setAdjColumns(prev => prev.map(col => ({ ...col, items: remove(col.items) })));
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
                                disabled={getNoteStatus(viewingReviewNote!) !== 'registro'}
                                className="w-7 h-7 rounded-lg bg-transparent flex items-center justify-center hover:bg-red-500/10 hover:text-red-400 transition-all disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-inherit" style={{ color: 'var(--rn-text-subtle)' }}
                                title={getNoteStatus(viewingReviewNote!) !== 'registro' ? 'Só é possível remover itens na situação "Registro"' : 'Excluir produto da nota'}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                            </div>
                          </td>
                        </tr>
                      );

                      // EAN variant child rows
                      const itemVariants = _itemVariantsCheck;
                      if (itemVariants.length === 0) return [parentRow];

                      const totalVariantQty = itemVariants.reduce((s, v) => s + (v.qty || 0), 0);
                      const childRows = itemVariants.map((variant, vi) => {
                        const isLastChild = vi === itemVariants.length - 1;
                        const childTotal = totalVariantQty > 0 ? totalValue * (variant.qty || 0) / totalVariantQty : 0;
                        const childUnitCost = (variant.qty || 0) > 0 ? childTotal / variant.qty : 0;
                        const seqLabel = `${item.seq ?? idx + 1}${String.fromCharCode(97 + vi)}`;
                        return (
                          <tr key={`${idx}-v${vi}`}
                            className="bg-[#141412] dark:bg-[#141412]"
                            style={isLastChild ? { borderBottom: '2px solid #2a2000' } : {}}
                          >
                            <td style={tdP}>
                              <div style={{ ...cell({ justifyContent: 'center', overflow: 'visible' }), position: 'relative' }}>
                                <svg width="18" height="40" viewBox="0 0 18 40" fill="none" aria-hidden="true"
                                  style={{ position: 'absolute', left: -3, top: 0, overflow: 'visible' }}>
                                  <line x1="9" y1="0" x2="9" y2={isLastChild ? 20 : 40} stroke="#2a2000" strokeWidth="1.5" />
                                  <line x1="9" y1="20" x2="18" y2="20" stroke="#2a2000" strokeWidth="1.5" />
                                </svg>
                                <span className="text-[10px] font-black" style={{ color: '#555', paddingLeft: 10 }}>{seqLabel}</span>
                              </div>
                            </td>
                            <td style={tdP}>
                              <div style={cell({ padding: '0 10px' })}>
                                <span className="font-mono text-xs font-bold" style={{ color: 'var(--rn-text-subtle)' }}>{item.supplier_code || '—'}</span>
                              </div>
                            </td>
                            <td style={tdP}>
                              <div style={cell({ padding: '0 10px' })}>
                                <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--rn-text-muted)' }}>
                                  {item.original_description || '-'}
                                  {variant.desc && <span style={{ color: '#555' }}> — {variant.desc}</span>}
                                </p>
                              </div>
                            </td>
                            <td style={tdP}>
                              <div style={cell({ padding: '0 8px' })}>
                                <span className="text-[10px]" style={{ color: 'var(--rn-text-subtle)' }}>—</span>
                              </div>
                            </td>
                            <td style={tdP}>
                              <div style={cell({ padding: '0 10px' })}>
                                <p className="text-[11px] font-bold font-mono" style={{ color: 'var(--rn-text-muted)' }}>{variant.ean || '—'}</p>
                              </div>
                            </td>
                            <td style={tdP}>
                              <div style={cell({ padding: '0 10px' })}>
                                <p className="text-[11px] font-bold font-mono" style={{ color: 'var(--rn-text-muted)' }}>{variant.sku || '—'}</p>
                              </div>
                            </td>
                            <td style={tdP}>
                              <div style={cell({ padding: '0 10px' })}>
                                <span className="text-[11px] font-bold" style={{ color: 'var(--rn-text-muted)' }}>
                                  {(viewingNoteUnits[idx] ?? item.unit ?? 'UN')} × {variant.qty || 0}
                                </span>
                              </div>
                            </td>
                            <td style={tdP}>
                              <div style={cell({ padding: '0 10px' })}>
                                <span className="text-[11px] font-mono" style={{ color: 'var(--rn-text-muted)' }}>R$ {childUnitCost.toFixed(4)}</span>
                              </div>
                            </td>
                            <td style={tdP}>
                              <div style={cell({ padding: '0 10px' })}>
                                <span className="text-[11px] font-mono" style={{ color: 'var(--rn-text-muted)' }}>R$ {childTotal.toFixed(2)}</span>
                              </div>
                            </td>
                            {/* adj column placeholders */}
                            {adjColumns.filter(col => !reviewHiddenCols.has(col.id)).map(col => (
                              <td key={col.id} style={tdP}><div style={cell({ padding: '0 10px' })}><span style={{ color: 'var(--rn-text-subtle)' }}>—</span></div></td>
                            ))}
                            {/* Preço Venda, Markup, Status, Ok, Revisão, Distribuição, Delete */}
                            <td style={tdP}><div style={cell({ padding: '0 10px' })}></div></td>
                            <td style={tdP}><div style={cell({ padding: '0 10px' })}></div></td>
                            <td style={tdP}><div style={cell({ padding: '0 10px' })}></div></td>
                            <td style={tdP}><div style={cell({ justifyContent: 'center' })}></div></td>
                            <td style={tdP}><div style={cell({ justifyContent: 'center' })}></div></td>
                            <td style={tdP}><div style={cell({ justifyContent: 'center' })}></div></td>
                            <td style={{ ...tdP, borderRight: 'none' }}><div style={cell({ justifyContent: 'center' })}></div></td>
                          </tr>
                        );
                      });
                      return [parentRow, ...childRows];
                      }); // end _filtered.flatMap
                    })(/* tbody IIFE */)}
                    {getNoteStatus(viewingReviewNote) === 'registro' && (
                      <tr>
                        <td style={{ padding: '6px 3px' }}>
                          <button
                            onClick={handleAddNoteRow}
                            title="Adicionar linha"
                            className="w-full h-8 rounded-lg border-2 border-dashed flex items-center justify-center transition-all hover:border-primary/50 hover:text-primary hover:bg-primary/5"
                            style={{ borderColor: 'var(--rn-cell-border)', color: 'var(--rn-text-subtle)' }}
                          >
                            <Plus size={14} />
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                  );
                })()}
              </div>

              {/* ── Vincular ao Dicionário — Modal separado ────────────────── */}
              {linkingItemIdx !== null && (() => {
                const linkItem = viewingReviewNote.items[linkingItemIdx];
                // Se este item já tem uma tradução permanente válida (aponta para um produto
                // que ainda existe), não faz sentido oferecer "salvar como tradução permanente"
                // de novo — ela já está salva. Só volta a oferecer quando não há tradução, ou
                // quando a existente aponta para um produto removido (precisa ser recriada).
                const existingMapping = getItemMapping(linkItem);
                const hasValidPermanentTranslation = !!existingMapping && products.some((p: any) => p.id === existingMapping.internal_product_id);
                // Produto Mãe pendente deste item — visível/editável nas duas abas (Produto e
                // Produto Mãe), independente de estar buscando um produto existente ou criando um novo.
                const itemMotherDraft: MotherPackageDraft | null = linkItem?.mother_draft || null;
                // Modo travado "Vincular Produto Filho": assim que um Produto Mãe fica pendente
                // (recém-salvo ou reaberto de uma sessão anterior), o modal trava nessa etapa —
                // sem seletor de abas — até o filho ser escolhido/criado. Evita o bug de o
                // usuário preencher as duas abas na mesma sessão e a conversão/vínculo não
                // serem aplicados (ver confirmNoteItemLink / handleNoteItemCreateAndLink).
                const resolveMode = !!itemMotherDraft;
                return (
                  <div className="fixed inset-0 z-[190] flex items-center justify-center p-4">
                    <div
                      className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                      onClick={() => { setLinkingItemIdx(null); setNoteItemShowCreate(false); setNoteItemLinkQuery(''); setNoteItemSelectedProduct(null); setNoteItemSellPriceInput(''); setNoteItemSaveTranslation(false); setNoteItemCreateTab('produto'); setNoteItemExtraStoreIds([]); setNoteItemExtraStorePrices({}); setNoteItemAddStoreOpen(false); }}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 16 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 16 }}
                      transition={{ duration: 0.18 }}
                      className="relative bg-[#F0E7CC] dark:bg-[#1E1E18] rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh] border border-black/10 dark:border-white/[0.08]"
                    >
                      {/* Header — mesmo padrão do modal "Editar Produto": header amarelo, icon chip grande */}
                      <div className="px-6 py-5 flex items-center gap-3.5 bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] shrink-0">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                          <Package size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h2 className="text-lg font-manrope font-extrabold text-[#1A1A0E] leading-tight">
                            {resolveMode ? 'Vincular Produto Filho' : noteItemCreateTab === 'mae' ? 'Produto Mãe' : noteItemShowCreate ? 'Criar Novo Produto' : 'Vincular ao Dicionário'}
                          </h2>
                          <p className="text-xs font-bold text-[#1A1A0E]/55 mt-0.5 truncate">
                            {linkItem?.original_description || 'Item sem descrição'}
                          </p>
                        </div>
                        <button
                          onClick={() => { setLinkingItemIdx(null); setNoteItemShowCreate(false); setNoteItemLinkQuery(''); setNoteItemSelectedProduct(null); setNoteItemSellPriceInput(''); setNoteItemSaveTranslation(false); setNoteItemCreateTab('produto'); setNoteItemExtraStoreIds([]); setNoteItemExtraStorePrices({}); setNoteItemAddStoreOpen(false); }}
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] border border-black/10 text-black/50 hover:bg-black/[0.14] transition-colors"
                        >
                          <X size={18} />
                        </button>
                      </div>

                      {/* Body */}
                      <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
                        {/* Aviso: tradução permanente já existe para este item */}
                        {(() => {
                          const mapping = existingMapping;
                          if (!mapping) return null;
                          const mappedProduct = products.find((p: any) => p.id === mapping.internal_product_id);
                          if (!mappedProduct) return (
                            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                              <Bookmark size={13} className="text-amber-500 shrink-0 fill-amber-200" />
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Tradução permanente já existe</p>
                                <p className="text-xs font-bold text-amber-800 truncate">Produto removido</p>
                              </div>
                            </div>
                          );
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                const i = linkingItemIdx!;
                                const existing = viewingNoteSellPrices[i] ?? viewingReviewNote!.items[i]?.product_price;
                                setNoteItemSelectedProduct(mappedProduct);
                                // Preço já preenchido na linha: usa direto, sem perguntar. Vazio: fica vazio,
                                // o preço do dicionário só aparece como sugestão (placeholder) no campo.
                                setNoteItemSellPriceInput(existing && existing > 0 ? String(existing) : '');
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 hover:border-amber-400 hover:bg-amber-100 rounded-xl transition-all text-left group"
                            >
                              <Bookmark size={13} className="text-amber-500 shrink-0 fill-amber-200" />
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Tradução permanente já existe — clique para usar</p>
                                <p className="text-xs font-bold text-amber-800 truncate group-hover:text-amber-900">{mappedProduct.name}</p>
                              </div>
                            </button>
                          );
                        })()}

                        {/* Abas: Produto (buscar existente OU criar novo) e Produto Mãe (caixa/fardo)
                            — só aparecem enquanto não há Produto Mãe pendente. Assim que um rascunho
                            é salvo, o modal trava no modo "resolver filho" (abaixo) até o vínculo ser
                            finalizado — nada de alternar de volta pra reconfigurar o Produto Mãe por
                            aqui (isso vai pelo link "Editar" do card de resumo). */}
                        {!resolveMode && (
                        <div className="flex gap-1.5 p-1 rounded-2xl bg-black/[0.04] dark:bg-white/[0.05]">
                          <button
                            type="button"
                            onClick={() => setNoteItemCreateTab('produto')}
                            className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-extrabold uppercase tracking-wide transition-all', noteItemCreateTab === 'produto' ? 'bg-surface shadow-sm text-on-surface' : 'text-secondary/50 hover:text-secondary/80')}
                          >
                            <Package size={13} />Produto
                          </button>
                          <button
                            type="button"
                            onClick={() => setNoteItemCreateTab('mae')}
                            className={cn('relative flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-extrabold uppercase tracking-wide transition-all', noteItemCreateTab === 'mae' ? 'bg-surface shadow-sm text-on-surface' : 'text-secondary/50 hover:text-secondary/80')}
                          >
                            <Boxes size={13} />Produto Mãe
                          </button>
                        </div>
                        )}

                        {noteItemCreateTab === 'mae' && !resolveMode ? (
                          // Só chega aqui sem Produto Mãe pendente ainda (resolveMode cobre o caso
                          // salvo — ver card de resumo no ramo "produto" abaixo).
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={() => setNoteItemMotherModalOpen(true)}
                              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-dashed border-black/[0.14] dark:border-white/[0.14] text-left hover:border-primary/40 transition-all"
                            >
                              <div className="w-9 h-9 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] text-secondary/50 flex items-center justify-center shrink-0">
                                <Boxes size={16} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-extrabold text-secondary/70">Definir Produto Mãe</p>
                                <p className="text-[10px] text-secondary/50 leading-tight mt-0.5">Nome, sufixo, EAN e unidades por embalagem</p>
                              </div>
                            </button>
                            <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-dashed border-black/[0.12] dark:border-white/[0.12]">
                              <Info size={13} className="text-secondary/50 shrink-0 mt-[1px]" />
                              <p className="text-[10.5px] font-semibold text-secondary/65 leading-relaxed">
                                Pode ser definido antes ou depois do produto — troque de aba a qualquer momento. Ao salvar, o vínculo do produto filho é finalizado numa etapa dedicada.
                              </p>
                            </div>
                          </div>
                        ) : (
                        <>
                        {/* Modo travado: resumo do Produto Mãe recém-salvo + contexto do que vai
                            acontecer ao escolher/criar o filho abaixo (conversão de qtd./preço e
                            preenchimento da Medida). "Editar" corrige dados errados sem sair daqui —
                            "Remover" descarta o rascunho e volta ao seletor de abas normal. */}
                        {resolveMode && itemMotherDraft && (
                          <>
                            <div className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-primary bg-primary/[0.06] text-left">
                              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                <Boxes size={16} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-extrabold text-primary truncate">Produto Mãe salvo: {itemMotherDraft.name}</p>
                                <p className="text-[10px] text-secondary/60 truncate">1 emb. = {itemMotherDraft.unitsPerChild} un{itemMotherDraft.ean ? ` · EAN ${itemMotherDraft.ean}` : ''}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setNoteItemMotherModalOpen(true)}
                                className="text-[10px] font-black text-primary underline shrink-0"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => commitItemMotherDraft(null)}
                                title="Remover Produto Mãe"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-secondary/50 hover:bg-black/[0.08] dark:hover:bg-white/10 shrink-0"
                              >
                                <X size={13} />
                              </button>
                            </div>
                            <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-dashed border-black/[0.12] dark:border-white/[0.12]">
                              <Info size={13} className="text-secondary/50 shrink-0 mt-[1px]" />
                              <p className="text-[10.5px] font-semibold text-secondary/70 leading-relaxed">
                                Agora escolha ou crie o <b className="text-on-surface">produto (unidade)</b> que sai dessa embalagem — isso finaliza o vínculo e converte a quantidade da linha automaticamente (×{itemMotherDraft.unitsPerChild}).
                              </p>
                            </div>
                          </>
                        )}
                        {/* Alternância Buscar/Criar — só no modo travado (resolveMode) e enquanto
                            nenhum produto já foi escolhido/está sendo confirmado. Fora do modo
                            travado, o fluxo original (link "Criar novo produto" dentro da lista de
                            busca / "← Voltar para busca" no formulário) continua igual. */}
                        {resolveMode && !noteItemSelectedProduct && (
                          <div className="flex gap-1.5 p-1 rounded-2xl bg-black/[0.04] dark:bg-white/[0.05]">
                            <button
                              type="button"
                              onClick={() => setNoteItemShowCreate(false)}
                              className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-extrabold uppercase tracking-wide transition-all', !noteItemShowCreate ? 'bg-surface shadow-sm text-on-surface' : 'text-secondary/50 hover:text-secondary/80')}
                            >
                              <Search size={13} />Buscar Existente
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setNoteItemShowCreate(true);
                                setNoteItemExtraStoreIds([]); setNoteItemExtraStorePrices({}); setNoteItemAddStoreOpen(false);
                                const rowPrice = linkingItemIdx !== null ? viewingNoteSellPrices[linkingItemIdx] : undefined;
                                if (rowPrice && rowPrice > 0) setNoteItemNewSellPrice(String(rowPrice));
                                if (linkingItemIdx !== null && viewingReviewNote) {
                                  const desc = viewingReviewNote.items[linkingItemIdx]?.original_description
                                    || viewingReviewNote.items[linkingItemIdx]?.description
                                    || '';
                                  setNoteItemNewName(desc.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
                                }
                              }}
                              className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-extrabold uppercase tracking-wide transition-all', noteItemShowCreate ? 'bg-surface shadow-sm text-on-surface' : 'text-secondary/50 hover:text-secondary/80')}
                            >
                              <Plus size={13} />Criar Novo
                            </button>
                          </div>
                        )}
                        {!noteItemShowCreate ? (
                          <>
                            {/* ── Painel de confirmação com preço de venda ── */}
                            {noteItemSelectedProduct ? (
                              <div className="space-y-3">
                                <button
                                  onClick={() => { setNoteItemSelectedProduct(null); setNoteItemSellPriceInput(''); setNoteItemSaveTranslation(false); }}
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

                                {/* Toggle: salvar como tradução permanente — escondido quando o item já
                                    tem uma tradução permanente válida, pra não oferecer salvar de novo. */}
                                {!hasValidPermanentTranslation && (
                                  <>
                                    <button
                                      onClick={() => setNoteItemSaveTranslation(v => !v)}
                                      className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left', noteItemSaveTranslation ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300')}
                                    >
                                      <div className={cn('w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors', noteItemSaveTranslation ? 'bg-amber-400' : 'border-2 border-slate-300 bg-white')}>
                                        {noteItemSaveTranslation && <Check size={10} className="text-white" />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className={cn('text-xs font-bold', noteItemSaveTranslation ? 'text-amber-700' : 'text-slate-500')}>Salvar como tradução permanente</p>
                                        <p className="text-[10px] text-slate-400 leading-tight">Próximas notas deste fornecedor identificarão este item automaticamente</p>
                                      </div>
                                    </button>
                                    {noteItemSaveTranslation && (
                                      <div className="mt-2 space-y-1.5">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Será vinculado por</p>
                                        <div className="flex items-stretch gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                                          <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Código</p>
                                            <p className="text-xs font-bold text-slate-800 truncate">{linkItem?.supplier_code || '—'}</p>
                                          </div>
                                          <div className="w-px bg-slate-200 shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Produto na Nota</p>
                                            <p className="text-xs font-bold text-slate-800 truncate">{linkItem?.original_description || '—'}</p>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}

                                {/* Preço de venda — se a linha já tem preço, usa direto sem perguntar;
                                    se está vazia, o preço do dicionário some só como sugestão (placeholder). */}
                                {(() => {
                                  const i = linkingItemIdx!;
                                  const rowHasPrice = ((viewingNoteSellPrices[i] ?? viewingReviewNote!.items[i]?.product_price) ?? 0) > 0;
                                  if (rowHasPrice) return (
                                    <div>
                                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                                        Preço de Venda (R$)
                                      </label>
                                      <div className="flex items-center gap-2 px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50">
                                        <span className="text-sm font-black text-slate-800">
                                          R$ {parseFloat(noteItemSellPriceInput || '0').toFixed(2).replace('.', ',')}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-medium">já preenchido nesta linha — será usado</span>
                                      </div>
                                      {noteItemSelectedProduct.price > 0 && (
                                        <p className="text-[10px] text-slate-400 mt-1">
                                          Preço cadastrado no dicionário: <span className="font-bold">R$ {noteItemSelectedProduct.price.toFixed(2).replace('.', ',')}</span>
                                        </p>
                                      )}
                                    </div>
                                  );
                                  return (
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
                                          confirmNoteItemLink();
                                        }
                                      }}
                                      placeholder="0,00"
                                      onWheel={blockWheelChange}
                                      className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-bold focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                  </div>
                                  {noteItemSelectedProduct.price > 0 && (
                                    <p className="text-[10px] text-slate-400 mt-1">
                                      Preço cadastrado no dicionário: <span className="font-bold">R$ {noteItemSelectedProduct.price.toFixed(2).replace('.', ',')}</span> — a sugestão aparece na célula "Preço Venda" da tabela
                                    </p>
                                  )}
                                </div>
                                  );
                                })()}

                                <button
                                  onClick={() => confirmNoteItemLink()}
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
                                      (p.ean && p.ean.toLowerCase().includes(q)) ||
                                      (p.extraEans || []).some((e: any) => e.ean?.toLowerCase().includes(q)) ||
                                      (p.motherEans || []).some((e: any) => e.ean?.toLowerCase().includes(q))
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
                                          // Preço já preenchido na linha: usa direto, sem perguntar. Vazio: fica vazio,
                                          // o preço do dicionário só aparece como sugestão (placeholder) no campo.
                                          const i = linkingItemIdx!;
                                          const existing = viewingNoteSellPrices[i] ?? viewingReviewNote!.items[i]?.product_price;
                                          setNoteItemSelectedProduct(p);
                                          setNoteItemSellPriceInput(existing && existing > 0 ? String(existing) : '');
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
                                {/* No modo travado esse atalho some — a alternância já está no
                                    segmentado "Buscar Existente/Criar Novo" logo acima. */}
                                {!resolveMode && (
                                <button
                                  onClick={() => {
                                    setNoteItemShowCreate(true);
                                    setNoteItemExtraStoreIds([]); setNoteItemExtraStorePrices({}); setNoteItemAddStoreOpen(false);
                                    // Pré-preenche o preço de venda com o valor já digitado na linha
                                    const rowPrice = linkingItemIdx !== null ? viewingNoteSellPrices[linkingItemIdx] : undefined;
                                    if (rowPrice && rowPrice > 0) setNoteItemNewSellPrice(String(rowPrice));
                                    // Pré-preenche o Nome com a descrição do item em minúsculas
                                    if (linkingItemIdx !== null && viewingReviewNote) {
                                      const desc = viewingReviewNote.items[linkingItemIdx]?.original_description
                                        || viewingReviewNote.items[linkingItemIdx]?.description
                                        || '';
                                      setNoteItemNewName(desc.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
                                    }
                                  }}
                                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 text-slate-400 rounded-xl hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all text-xs font-bold"
                                >
                                  <Plus size={13} />Criar novo produto
                                </button>
                                )}
                              </>
                            )}
                          </>
                        ) : (() => {
                          const sectionCls = 'bg-surface border border-black/[0.07] dark:border-white/[0.06] shadow-sm rounded-2xl p-5 space-y-3.5';
                          const sectionHeadCls = 'flex items-center gap-2';
                          const sectionTitleCls = 'text-xs font-extrabold uppercase tracking-wide text-on-surface';
                          const labelCls = 'text-[10px] font-extrabold uppercase tracking-wide text-secondary/80';
                          const inputCls = 'w-full bg-black/[0.035] dark:bg-white/[0.05] border border-black/[0.10] dark:border-white/[0.10] rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all';
                          const primaryCompany = companies.find((c: any) => c.id === (viewingReviewNote.companyId || primaryCompanyId));
                          const availableCompanies = companies.filter((c: any) =>
                            c.id !== (viewingReviewNote.companyId || primaryCompanyId) && !noteItemExtraStoreIds.includes(c.id)
                          );
                          return (
                          <div className="space-y-4">
                            {/* No modo travado esse atalho some — a alternância já está no
                                segmentado "Buscar Existente/Criar Novo" acima. */}
                            {!resolveMode && (
                            <button
                              onClick={() => setNoteItemShowCreate(false)}
                              className="text-xs font-bold text-secondary/70 hover:text-primary transition-colors flex items-center gap-1"
                            >
                              ← Voltar para busca
                            </button>
                            )}

                            {/* Identificação */}
                            <div className={sectionCls}>
                              <div className={sectionHeadCls}>
                                <Package size={15} className="text-primary shrink-0" />
                                <span className={sectionTitleCls}>Identificação</span>
                              </div>
                              <div>
                                <label className={labelCls}>Nome do Produto</label>
                                <input autoFocus type="text" value={noteItemNewName} onChange={e => setNoteItemNewName(e.target.value)}
                                  className={cn(inputCls, 'mt-1.5')}
                                  placeholder="Nome do produto" />
                              </div>
                              <div className="grid grid-cols-2 gap-3.5">
                                <div>
                                  <label className={labelCls}>SKU (Código Interno)</label>
                                  <input type="text" value={noteItemNewSku} onChange={e => setNoteItemNewSku(e.target.value)}
                                    className={cn(inputCls, 'mt-1.5')}
                                    placeholder="Opcional" />
                                </div>
                                <div>
                                  <label className={labelCls}>Código EAN</label>
                                  <div className="flex gap-2 mt-1.5">
                                    <div className="relative flex-1 min-w-0">
                                      <input type="text" value={noteItemNewEan} onChange={e => setNoteItemNewEan(e.target.value)}
                                        className={cn(inputCls, 'pr-9 font-mono')}
                                        placeholder="Cód. barras" />
                                      {noteItemNewEan.trim() && (
                                        <button
                                          type="button"
                                          title="Copiar EAN"
                                          onClick={() => {
                                            navigator.clipboard.writeText(noteItemNewEan.trim());
                                            setNoteItemEanCopied(true);
                                            setTimeout(() => setNoteItemEanCopied(false), 1500);
                                          }}
                                          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg flex items-center justify-center text-secondary/50 hover:bg-black/[0.06] dark:hover:bg-white/10 transition-colors"
                                        >
                                          {noteItemEanCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                        </button>
                                      )}
                                    </div>
                                    <EanCodesEditor entries={noteItemExtraEans} onChange={setNoteItemExtraEans} />
                                  </div>
                                </div>
                              </div>
                              {/* Aviso: EAN já cadastrado em outro produto (evita duplicidade) */}
                              {(() => {
                                const eanMap = buildEanToProductId(products);
                                const candidateEans = Array.from(new Set(
                                  [noteItemNewEan.trim(), ...noteItemExtraEans.map(e => e.ean.trim())].filter(Boolean)
                                ));
                                const matches = candidateEans
                                  .map(ean => ({ ean, product: products.find((p: any) => p.id === eanMap.get(ean)) }))
                                  .filter((m): m is { ean: string; product: any } => !!m.product);
                                if (matches.length === 0) return null;
                                return (
                                  <div className="space-y-1.5">
                                    {matches.map(m => (
                                      <div key={m.ean} className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl">
                                        <AlertTriangle size={13} className="text-red-500 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-wider">EAN {m.ean} já cadastrado — evite duplicar</p>
                                          <p className="text-xs font-bold text-red-700 dark:text-red-300 truncate">{m.product.name}</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const i = linkingItemIdx!;
                                            const existing = viewingNoteSellPrices[i] ?? viewingReviewNote!.items[i]?.product_price;
                                            setNoteItemSelectedProduct(m.product);
                                            setNoteItemSellPriceInput(existing && existing > 0 ? String(existing) : (m.product.price ? String(m.product.price) : ''));
                                            setNoteItemShowCreate(false);
                                          }}
                                          className="text-[10px] font-black text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline shrink-0"
                                        >
                                          Usar este
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Preço de Venda — preço de venda das demais lojas ("Preços por Loja")
                                foi removido daqui; agora é definido no manifesto de Distribuição
                                pela própria loja destino, ao confirmar o recebimento (decisão 3-B). */}
                            <div className={sectionCls}>
                              <div className={sectionHeadCls}>
                                <BarChart3 size={15} className="text-primary shrink-0" />
                                <span className={sectionTitleCls}>Preço de Venda</span>
                              </div>
                              <div className="flex items-center gap-3 bg-primary/[0.06] border border-primary/20 rounded-xl px-3 py-2.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                <span className="flex-1 min-w-0 text-xs font-bold text-on-surface truncate">
                                  {primaryCompany?.nome_fantasia || 'Empresa da nota não definida'}
                                </span>
                                <div className="relative w-[110px] shrink-0">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-secondary/50">R$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={noteItemNewSellPrice}
                                    onChange={e => setNoteItemNewSellPrice(e.target.value)}
                                    placeholder="0,00"
                                    onWheel={blockWheelChange}
                                    className="w-full bg-surface border border-black/10 dark:border-white/10 rounded-lg pl-7 pr-2 py-1.5 text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Toggle: salvar como tradução permanente */}
                            <button
                              onClick={() => setNoteItemSaveTranslation(v => !v)}
                              className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all text-left', noteItemSaveTranslation ? 'border-amber-400 bg-amber-50 dark:bg-amber-400/10' : 'border-black/[0.07] dark:border-white/[0.07] bg-surface hover:border-black/20 dark:hover:border-white/20')}
                            >
                              <div className={cn('w-[18px] h-[18px] rounded-md flex items-center justify-center shrink-0 transition-colors', noteItemSaveTranslation ? 'bg-amber-400' : 'border-2 border-black/20 dark:border-white/20 bg-white dark:bg-transparent')}>
                                {noteItemSaveTranslation && <Check size={11} className="text-white" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={cn('text-xs font-extrabold', noteItemSaveTranslation ? 'text-amber-700 dark:text-amber-300' : 'text-secondary/70')}>Salvar como tradução permanente</p>
                                <p className="text-[10px] text-secondary/50 leading-tight mt-0.5">Próximas notas deste fornecedor identificarão este item automaticamente</p>
                              </div>
                            </button>
                            {noteItemSaveTranslation && (
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-black text-secondary/50 uppercase tracking-widest">Será vinculado por</p>
                                <div className="flex items-stretch gap-2 px-3 py-2 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03]">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black text-secondary/60 uppercase tracking-wider">Código</p>
                                    <p className="text-xs font-bold text-on-surface truncate">{linkItem?.supplier_code || '—'}</p>
                                  </div>
                                  <div className="w-px bg-black/10 dark:bg-white/10 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black text-secondary/60 uppercase tracking-wider">Produto na Nota</p>
                                    <p className="text-xs font-bold text-on-surface truncate">{linkItem?.original_description || '—'}</p>
                                  </div>
                                </div>
                              </div>
                            )}

                            <button
                              onClick={handleNoteItemCreateAndLink}
                              disabled={noteItemCreating || !noteItemNewName.trim()}
                              className="w-full bg-primary text-white py-3.5 rounded-2xl font-extrabold text-sm shadow-lg shadow-primary/30 hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                              {noteItemCreating
                                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                                : <><Plus size={15} />Criar e Vincular</>
                              }
                            </button>
                          </div>
                          );
                        })()}
                        </>
                        )}
                      </div>
                    </motion.div>
                  </div>
                );
              })()}

              {/* Produto Mãe (caixa/fardo) definido ANTES do produto normal existir, pelo "Criar e
                  Vincular" da nota — mesmo MotherProductModal da aba "Produtos Mãe" da Edição de
                  Produto, mas em modo staging (onStage): sem child_product_id ainda, só devolve o
                  rascunho pra ser gravado junto quando o produto normal for criado. */}
              <MotherProductModal
                open={noteItemMotherModalOpen}
                onClose={() => setNoteItemMotherModalOpen(false)}
                childProductId=""
                childProductName={noteItemNewName || 'Novo produto'}
                editingPackage={null}
                initialDraft={(linkingItemIdx !== null ? viewingReviewNote?.items[linkingItemIdx]?.mother_draft : null) || null}
                initialEan={(linkingItemIdx !== null ? (viewingNoteEans[linkingItemIdx] ?? viewingReviewNote?.items[linkingItemIdx]?.ean) : '') || ''}
                suppliers={supplierNames}
                onSaved={() => {}}
                onStage={draft => commitItemMotherDraft(draft)}
              />

              {/* ── Distribuição por loja — Modal separado (mesmo porte/estilo de "Vincular ao Dicionário") ── */}
              {distribModalIdx !== null && viewingReviewNote && (() => {
                const idx = distribModalIdx;
                const item = viewingReviewNote.items[idx];
                if (!item) return null;
                const qtyRecebida = Number(viewingNoteQtys[idx] ?? item.qty) || 0;
                const otherCompanies = companies.filter((c: any) => c.id !== viewingReviewNote.companyId);
                const draftTotal = Object.values(distribModalDraft).reduce((acc, v) => acc + (parseInt(v) || 0), 0);
                const remaining = qtyRecebida - draftTotal;

                const setCompanyQty = (companyId: string, raw: string) => {
                  const digits = raw.replace(/[^0-9]/g, '');
                  const othersSum = Object.entries(distribModalDraft)
                    .filter(([cid]) => cid !== companyId)
                    .reduce((acc, [, v]) => acc + (parseInt(v) || 0), 0);
                  const maxForThis = Math.max(0, qtyRecebida - othersSum);
                  const clamped = digits === '' ? '' : String(Math.min(parseInt(digits) || 0, maxForThis));
                  setDistribModalDraft(prev => ({ ...prev, [companyId]: clamped }));
                };

                const handleConfirm = () => {
                  const cleaned: Record<string, number> = {};
                  Object.entries(distribModalDraft).forEach(([cid, v]) => {
                    const n = parseInt(v) || 0;
                    if (n > 0) cleaned[cid] = n;
                  });
                  const u = [...viewingNoteDistribByCompany]; u[idx] = cleaned; setViewingNoteDistribByCompany(u);
                  captureSnapshot();
                };

                // Navegação entre itens sem fechar o modal — travada se houver quantidade
                // digitada ainda não confirmada, pra não perder o que foi preenchido (comparação
                // ignora ordem das chaves, já que o rascunho é preenchido na ordem que o usuário
                // digitou, não necessariamente a ordem salva).
                const draftNormalized: Record<string, number> = {};
                Object.entries(distribModalDraft).forEach(([cid, v]) => { const n = parseInt(v) || 0; if (n > 0) draftNormalized[cid] = n; });
                const savedForItem = viewingNoteDistribByCompany[idx] || {};
                const navKeys = new Set([...Object.keys(draftNormalized), ...Object.keys(savedForItem)]);
                const isDirty = Array.from(navKeys).some(k => (draftNormalized[k] || 0) !== (savedForItem[k] || 0));
                const totalItems = viewingReviewNote.items.length;
                const goToItem = (newIdx: number) => {
                  if (isDirty || newIdx < 0 || newIdx >= totalItems) return;
                  const draft: Record<string, string> = {};
                  Object.entries(viewingNoteDistribByCompany[newIdx] || {}).forEach(([cid, v]) => { draft[cid] = String(v); });
                  setDistribModalDraft(draft);
                  setDistribModalIdx(newIdx);
                };

                return (
                  <div className="fixed inset-0 z-[190] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDistribModalIdx(null)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 16 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 16 }}
                      transition={{ duration: 0.18 }}
                      className="relative bg-[#F0E7CC] dark:bg-[#1E1E18] rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh] border border-black/10 dark:border-white/[0.08]"
                    >
                      <div className="px-6 py-5 flex items-center gap-3.5 bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] shrink-0">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                          <Truck size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h2 className="text-lg font-manrope font-extrabold text-[#1A1A0E] leading-tight">Distribuição entre Lojas</h2>
                          <p className="text-xs font-bold text-[#1A1A0E]/55 mt-0.5 truncate">{item.name || item.original_description || 'Item sem descrição'}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {[
                            { title: 'Primeiro item', target: 0, Icon: ChevronsLeft },
                            { title: 'Item anterior', target: idx - 1, Icon: ChevronLeft },
                          ].map(({ title, target, Icon }) => (
                            <button
                              key={title}
                              onClick={() => goToItem(target)}
                              disabled={isDirty || target < 0}
                              title={title}
                              className="w-[34px] h-[34px] rounded-[11px] flex items-center justify-center bg-black/[0.08] border border-black/10 text-black/55 hover:bg-black/[0.14] transition-colors disabled:opacity-35 disabled:pointer-events-none"
                            >
                              <Icon size={15} />
                            </button>
                          ))}
                          <span className="font-mono text-[10.5px] font-bold text-[#1A1A0E]/50 px-2 whitespace-nowrap">Item {idx + 1} de {totalItems}</span>
                          {[
                            { title: 'Próximo item', target: idx + 1, Icon: ChevronRight },
                            { title: 'Último item', target: totalItems - 1, Icon: ChevronsRight },
                          ].map(({ title, target, Icon }) => (
                            <button
                              key={title}
                              onClick={() => goToItem(target)}
                              disabled={isDirty || target >= totalItems}
                              title={title}
                              className="w-[34px] h-[34px] rounded-[11px] flex items-center justify-center bg-black/[0.08] border border-black/10 text-black/55 hover:bg-black/[0.14] transition-colors disabled:opacity-35 disabled:pointer-events-none"
                            >
                              <Icon size={15} />
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setDistribModalIdx(null)}
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] border border-black/10 text-black/50 hover:bg-black/[0.14] transition-colors ml-1.5"
                        >
                          <X size={18} />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
                        <div className="bg-black/[0.04] dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.10] rounded-2xl p-3.5 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <Package size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3] truncate">{item.name || item.original_description || 'Item sem descrição'}</div>
                            <div className="font-mono text-[10px] font-semibold text-[#1A1A0E]/50 dark:text-white/40 mt-0.5">
                              {(viewingNoteSkus[idx] ?? item.sku) || '—'} · {(viewingNoteEans[idx] ?? item.ean) || '—'}
                            </div>
                          </div>
                          <div className="shrink-0 bg-black/[0.08] dark:bg-white/[0.08] px-3 py-1.5 rounded-full text-[11px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] whitespace-nowrap">
                            Recebido: {qtyRecebida} un.
                          </div>
                        </div>

                        <div className={cn(
                          'rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-extrabold border',
                          remaining > 0
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25'
                            : 'bg-primary/10 text-primary border-primary/30'
                        )}>
                          <span>{draftTotal} de {qtyRecebida} un. distribuídos</span>
                          <span>{remaining} restante{remaining === 1 ? '' : 's'}</span>
                        </div>

                        {isDirty && (
                          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-xl px-3.5 py-2.5 text-[11px] font-extrabold">
                            <AlertTriangle size={14} className="shrink-0" />
                            Confirme a distribuição deste item antes de navegar para outro
                          </div>
                        )}

                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-[#1A1A0E]/40 dark:text-white/30 mb-2">Empresas cadastradas</p>
                          <div className="space-y-2">
                            {otherCompanies.length === 0 && (
                              <p className="text-xs font-semibold text-[#1A1A0E]/40 dark:text-white/35 py-3 text-center">Nenhuma outra empresa cadastrada.</p>
                            )}
                            {otherCompanies.map((c: any) => {
                              const filled = distribModalDraft[c.id];
                              const othersSum = Object.entries(distribModalDraft)
                                .filter(([cid]) => cid !== c.id)
                                .reduce((acc, [, v]) => acc + (parseInt(v) || 0), 0);
                              const suggestion = Math.max(0, qtyRecebida - othersSum);
                              return (
                                <div
                                  key={c.id}
                                  className={cn(
                                    'flex items-center justify-between gap-3 rounded-[13px] border-[1.5px] px-3.5 py-2.5',
                                    filled ? 'bg-primary/[0.04] border-primary/35' : 'bg-white dark:bg-white/[0.04] border-black/10 dark:border-white/10'
                                  )}
                                >
                                  <span className="text-[13px] font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3] flex items-center gap-2 min-w-0 truncate">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                    {c.nome_fantasia}
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={distribModalDraft[c.id] ?? ''}
                                    onChange={e => setCompanyQty(c.id, e.target.value)}
                                    placeholder={suggestion > 0 ? `até ${suggestion}` : '0'}
                                    className={cn(
                                      'w-[88px] text-right font-mono text-sm font-extrabold rounded-[10px] px-2.5 py-2 outline-none border-[1.5px] transition-colors',
                                      filled
                                        ? 'border-primary text-primary bg-primary/[0.06]'
                                        : 'border-black/[0.14] dark:border-white/[0.16] bg-[#FDFBF3] dark:bg-white/[0.06] text-[#1A1A0E] dark:text-[#F2F0E3]'
                                    )}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="p-4 shrink-0">
                        <button
                          onClick={handleConfirm}
                          className="w-full bg-primary text-white py-3.5 rounded-2xl font-extrabold text-sm shadow-lg shadow-primary/30 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 size={16} />
                          Confirmar Distribuição
                        </button>
                      </div>
                    </motion.div>
                  </div>
                );
              })()}

              {/* ── Confirmação do atalho "Criar e Vincular" — produto não encontrado ────── */}
              {quickCreateConfirmIdx !== null && (() => {
                const item = viewingReviewNote.items[quickCreateConfirmIdx];
                const name = (item.original_description || item.description || '').toLowerCase();
                const ean = viewingNoteEans[quickCreateConfirmIdx] ?? item.ean ?? '';
                const price = viewingNoteSellPrices[quickCreateConfirmIdx] ?? item.product_price ?? 0;
                return (
                  <div className="fixed inset-0 z-[195] flex items-center justify-center p-4">
                    <div
                      className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                      onClick={() => { if (!quickCreateSubmitting) setQuickCreateConfirmIdx(null); }}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 16 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 16 }}
                      transition={{ duration: 0.18 }}
                      className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                          <AlertTriangle size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Produto não encontrado</p>
                          <p className="text-sm font-bold text-slate-800">Criar e vincular mesmo assim?</p>
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 space-y-1">
                        <p className="text-xs text-slate-500">Nome: <span className="font-bold text-slate-800">{name || '—'}</span></p>
                        <p className="text-xs text-slate-500">EAN: <span className="font-bold text-slate-800">{ean || '—'}</span></p>
                        <p className="text-xs text-slate-500">Preço de venda: <span className="font-bold text-slate-800">R$ {price.toFixed(2).replace('.', ',')}</span></p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setQuickCreateConfirmIdx(null)}
                          disabled={quickCreateSubmitting}
                          className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 font-bold text-sm hover:bg-slate-50 transition-colors disabled:opacity-40"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleQuickCreateAndLink(quickCreateConfirmIdx)}
                          disabled={quickCreateSubmitting}
                          className="flex-1 py-2.5 rounded-xl bg-primary text-white font-black text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                          {quickCreateSubmitting
                            ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                            : <><Zap size={13} />Criar e vincular</>
                          }
                        </button>
                      </div>
                    </motion.div>
                  </div>
                );
              })()}

              <div className="p-6 border-t border-line dark:border-white/[0.07] bg-surface-container dark:bg-[#252520] flex items-center justify-between shrink-0">
                <div className="text-sm text-on-surface/40 flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-on-surface/10 bg-on-surface/[0.03]">
                    Total: <span className="font-bold text-on-surface">{viewingReviewNote.itemCount} itens</span>
                  </span>
                  {reviewFilterActive && Object.values(reviewColumnFilters).some(s => s.size > 0) && (() => {
                    const totalCount = viewingReviewNote.items.length;
                    const _getFilterVal = (key: string, it: any, i: number): string => {
                      if (key === 'produto') return it.original_description || '-';
                      if (key === 'interno') return it.name || '-';
                      if (key === 'ean') return viewingNoteEans[i] || it.ean || '-';
                      if (key === 'medida') return viewingNoteUnits[i] || it.unit || '-';
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
                          const rawQty = viewingNoteQtys[idx] ?? item.qty ?? 0;
                          const discrepancy = getItemDiscrepancy(idx, item);
                          const qty = getEffectiveQty(rawQty, discrepancy);
                          const { disc: discAmt, sur: surAmt } = calcAdjAmounts(cost, qty, idx, adjColumns);
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
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-on-surface/10 bg-on-surface/[0.03]">
                          <span className="text-on-surface/40">Valor total da nota:</span>
                          <span className="font-black text-on-surface">R$ {noteTotalCost.toFixed(2)}</span>
                        </span>
                        {noteMarkup !== null && (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-on-surface/10 bg-on-surface/[0.03]">
                            <span className="text-on-surface/40">Markup total:</span>
                            <span className={cn('font-black', noteMarkup >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                              {noteMarkup >= 0 ? '+' : ''}{noteMarkup.toFixed(1)}%
                            </span>
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-3">
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
                    disabled={savingNote}
                    onClick={handleSaveNote}
                    className="px-6 py-3 bg-primary text-white font-black rounded-xl hover:bg-primary/90 transition-all shadow-lg flex items-center gap-2 disabled:opacity-60"
                  >
                    {savingNote
                      ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Salvando...</>
                      : <><Save size={16} />Salvar</>
                    }
                  </button>
                </div>
              </div>

              {/* ── Discrepancy Modal ─────────────────────────────────────── */}
              <AnimatePresence>
                {discrepancyModalIdx !== null && (() => {
                  const item = viewingReviewNote.items[discrepancyModalIdx];
                  const isFalta = discrepancyTab === 'falta';
                  const accentCls = isFalta ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400';
                  const accentRing = isFalta ? 'focus:ring-red-400/40' : 'focus:ring-emerald-400/40';

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
                      disregarded: discrepancyDisregarded,
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
                        className="bg-[#F0E7CC] dark:bg-[#1E1E18] border border-black/10 dark:border-white/[0.08] rounded-3xl shadow-2xl w-full max-w-[520px] mx-4 overflow-hidden"
                        onClick={e => e.stopPropagation()}
                      >
                        {/* Header — mesmo padrão do modal "Editar Produto": header amarelo, icon chip grande */}
                        <div className="px-6 py-5 flex items-center gap-3.5 bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800]">
                          <span className={cn(
                            "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-black/[0.09]",
                            isFalta ? "dark:bg-[#D81E1E]/[0.16] dark:text-[#D81E1E] text-[#D81E1E]" : "dark:bg-emerald-500/[0.16] dark:text-emerald-500 text-emerald-600"
                          )}>
                            <AlertTriangle size={20} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#1A1A0E]/45">Divergência</p>
                            <h2 className="text-lg font-extrabold text-[#1A1A0E] leading-tight truncate mt-0.5">{item?.name || item?.original_description || `Item ${discrepancyModalIdx + 1}`}</h2>
                          </div>
                          <button
                            onClick={() => setDiscrepancyModalIdx(null)}
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] border border-black/10 text-black/50 hover:bg-black/[0.14] transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        {/* Tab switcher */}
                        <div className="px-6 pt-5 pb-0 flex gap-2">
                          <button
                            onClick={() => setDiscrepancyTab('falta')}
                            className={cn(
                              "flex-1 py-2.5 rounded-xl text-sm font-black transition-all",
                              discrepancyTab === 'falta'
                                ? "bg-red-500/10 dark:bg-red-500/15 text-red-500 dark:text-red-400 border border-red-500/30"
                                : "bg-black/[0.04] dark:bg-white/[0.04] text-black/35 dark:text-white/35 border border-black/[0.08] dark:border-white/[0.06] hover:bg-black/[0.07] dark:hover:bg-white/[0.08] hover:text-black/55 dark:hover:text-white/55"
                            )}
                            style={{ transition: 'all 160ms cubic-bezier(0.23,1,0.32,1)' }}
                          >
                            Falta
                          </button>
                          <button
                            onClick={() => setDiscrepancyTab('sobra')}
                            className={cn(
                              "flex-1 py-2.5 rounded-xl text-sm font-black transition-all",
                              discrepancyTab === 'sobra'
                                ? "bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                : "bg-black/[0.04] dark:bg-white/[0.04] text-black/35 dark:text-white/35 border border-black/[0.08] dark:border-white/[0.06] hover:bg-black/[0.07] dark:hover:bg-white/[0.08] hover:text-black/55 dark:hover:text-white/55"
                            )}
                            style={{ transition: 'all 160ms cubic-bezier(0.23,1,0.32,1)' }}
                          >
                            Sobra
                          </button>
                        </div>

                        {/* Body */}
                        <div className="px-6 py-5 space-y-4">
                          <AnimatePresence mode="wait">
                            {isFalta ? (
                              <motion.div
                                key="falta"
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 6 }}
                                transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
                                className="bg-white dark:bg-[#252520] border border-black/[0.07] dark:border-white/[0.07] rounded-2xl p-4 flex items-center gap-5"
                              >
                                {/* Toggle: não veio */}
                                <button
                                  type="button"
                                  onClick={() => setDiscrepancyMissingAll(v => !v)}
                                  className="flex-1 flex items-center gap-3 text-left"
                                >
                                  <div className={cn(
                                    "w-9 h-5 rounded-full relative shrink-0 transition-colors",
                                    discrepancyMissingAll ? "bg-red-500" : "bg-black/[0.14] dark:bg-white/[0.12]"
                                  )} style={{ transition: 'background 180ms cubic-bezier(0.23,1,0.32,1)' }}>
                                    <span className={cn(
                                      "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                                      discrepancyMissingAll ? "left-4" : "left-0.5"
                                    )} style={{ transition: 'left 180ms cubic-bezier(0.23,1,0.32,1)' }} />
                                  </div>
                                  <span className="text-sm font-semibold text-black/70 dark:text-white/70">Produto não veio</span>
                                </button>

                                {/* Qty input */}
                                <AnimatePresence>
                                  {!discrepancyMissingAll && (
                                    <motion.div
                                      initial={{ opacity: 0, width: 0 }}
                                      animate={{ opacity: 1, width: 'auto' }}
                                      exit={{ opacity: 0, width: 0 }}
                                      transition={{ duration: 0.15 }}
                                      className="overflow-hidden flex items-stretch gap-5 flex-1"
                                    >
                                      <div className="w-px self-stretch bg-black/[0.08] dark:bg-white/[0.08] shrink-0" />
                                      <div className="flex-1 min-w-[140px]">
                                        <label className="block text-[10px] font-extrabold uppercase tracking-wide text-black/45 dark:text-white/35 mb-1.5">
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
                                          onWheel={blockWheelChange}
                                          className={cn(
                                            "w-full bg-black/[0.035] dark:bg-white/[0.05] border rounded-xl px-3.5 py-2.5 text-sm font-bold text-[#1A1A0E] dark:text-[#f2f0e3] focus:outline-none focus:ring-2 transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden",
                                            "border-black/[0.10] dark:border-white/[0.10]", accentRing
                                          )}
                                          style={{ transition: 'box-shadow 150ms ease' }}
                                        />
                                      </div>
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
                                className="bg-white dark:bg-[#252520] border border-black/[0.07] dark:border-white/[0.07] rounded-2xl p-4"
                              >
                                <label className="block text-[10px] font-extrabold uppercase tracking-wide text-black/45 dark:text-white/35 mb-1.5">
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
                                  onWheel={blockWheelChange}
                                  className={cn(
                                    "w-full bg-black/[0.035] dark:bg-white/[0.05] border rounded-xl px-3.5 py-2.5 text-sm font-bold text-[#1A1A0E] dark:text-[#f2f0e3] focus:outline-none focus:ring-2 transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden",
                                    "border-black/[0.10] dark:border-white/[0.10]", accentRing
                                  )}
                                  style={{ transition: 'box-shadow 150ms ease' }}
                                />
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Confirmar divergência — agora só ajusta o VALOR (Valor Total/Markup da
                              nota), não a quantidade. A quantidade exibida na coluna Qtd. já é
                              ajustada automaticamente ao salvar este registro, com ou sem este toggle. */}
                          <div className={cn(
                            "rounded-2xl border-[1.5px] border-dashed px-4 py-3.5 transition-colors",
                            discrepancyDisregarded
                              ? "border-[#DDD000] dark:border-amber-400/30 bg-[#FFE500]/[0.14] dark:bg-amber-400/[0.07]"
                              : "border-black/15 dark:border-white/[0.10] bg-black/[0.02] dark:bg-white/[0.02]"
                          )}>
                            <div className="flex items-center gap-2.5">
                              <span className="w-7 h-7 rounded-[9px] bg-[#92400E]/[0.12] dark:bg-amber-400/[0.14] text-[#92400E] dark:text-amber-300 flex items-center justify-center shrink-0">
                                <Ban size={14} strokeWidth={2.3} />
                              </span>
                              <span className="text-[12.5px] font-black text-[#92400E] dark:text-amber-300 flex-1">Confirmar divergência</span>
                              <button
                                type="button"
                                onClick={() => setDiscrepancyDisregarded(v => !v)}
                                className={cn(
                                  "w-9 h-5 rounded-full relative shrink-0 transition-colors",
                                  discrepancyDisregarded ? "bg-amber-500" : "bg-[#92400E]/20 dark:bg-amber-400/20"
                                )}
                                style={{ transition: 'background 180ms cubic-bezier(0.23,1,0.32,1)' }}
                              >
                                <span className={cn(
                                  "absolute top-0.5 w-4 h-4 rounded-full shadow transition-all bg-white dark:bg-[#1A1A0E]",
                                  discrepancyDisregarded ? "left-4" : "left-0.5"
                                )} style={{ transition: 'left 180ms cubic-bezier(0.23,1,0.32,1)' }} />
                              </button>
                            </div>
                            <p className="text-[11px] font-semibold leading-[1.45] text-[#92400E]/85 dark:text-amber-300/75 mt-1.5">
                              Ajusta o valor: subtrai (Falta) ou soma (Sobra) o preço unitário × quantidade divergente do Valor Total e do Markup da nota.
                            </p>
                          </div>

                          {/* Observations */}
                          <div>
                            <label className="block text-[10px] font-extrabold uppercase tracking-wide text-black/45 dark:text-white/35 mb-1.5">
                              Observações
                            </label>
                            <textarea
                              value={discrepancyObs}
                              onChange={e => setDiscrepancyObs(e.target.value)}
                              placeholder="Detalhes adicionais sobre a divergência..."
                              rows={2}
                              className="w-full bg-black/[0.035] dark:bg-white/[0.05] border border-black/[0.10] dark:border-white/[0.10] rounded-xl px-3.5 py-2.5 text-sm text-[#1A1A0E] dark:text-[#f2f0e3] placeholder:text-black/25 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/20 resize-none transition-all"
                            />
                          </div>
                        </div>

                        {/* Footer actions */}
                        <div className="px-6 pb-6 flex gap-2.5">
                          <button
                            onClick={handleClearDiscrepancy}
                            className="flex-1 py-3 rounded-xl bg-black/[0.08] dark:bg-white/[0.04] border border-black/[0.14] dark:border-white/[0.07] text-sm font-bold text-black/55 dark:text-white/45 hover:bg-black/[0.13] dark:hover:bg-white/[0.08] hover:text-black/70 dark:hover:text-white/65 transition-all active:scale-[0.97]"
                            style={{ transition: 'all 150ms cubic-bezier(0.23,1,0.32,1)' }}
                          >
                            Limpar
                          </button>
                          <button
                            onClick={handleSaveDiscrepancy}
                            className={cn(
                              "flex-1 py-3 rounded-xl text-sm font-black text-white shadow-lg transition-all active:scale-[0.97]",
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

              {/* Adj column creation dialog */}
              {adjColDialog && (
                <div className="absolute inset-0 z-[150] bg-slate-900/50 flex items-center justify-center rounded-3xl">
                  <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl">
                    {(() => {
                      const isDisc = adjColDialog.kind === 'desconto';
                      const accentColor = isDisc ? 'text-red-500' : 'text-emerald-600';
                      const accentBg = isDisc ? 'bg-red-500' : 'bg-emerald-600';
                      const title = isDisc ? 'Nova coluna de Desconto' : 'Nova coluna de Acréscimo';
                      const update = (patch: Partial<typeof adjColDialog>) => setAdjColDialog(prev => prev ? { ...prev, ...patch } : null);
                      const confirmCol = () => {
                        if (!adjColDialog.name.trim() || !adjColDialog.method) return;
                        const itemCount = viewingReviewNote?.items.length ?? 0;
                        const newCol: AdjColumn = {
                          id: `${adjColDialog.kind}-${Date.now()}`,
                          name: adjColDialog.name.trim(),
                          kind: adjColDialog.kind,
                          mode: adjColDialog.method,
                          geralValue: adjColDialog.method === 'geral' ? (parseFloat(adjColDialog.geralValue) || 0) : 0,
                          geralType: adjColDialog.geralType,
                          individualType: adjColDialog.individualType,
                          items: new Array(itemCount).fill(''),
                        };
                        captureSnapshot();
                        setAdjColumns(prev => [...prev, newCol]);
                        setAdjColDialog(null);
                      };
                      return (
                        <>
                          <div className="flex items-center justify-between mb-4">
                            <h4 className={`text-base font-black text-slate-900`}>{title}</h4>
                            <button onClick={() => setAdjColDialog(null)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors"><X size={16} className="text-slate-400" /></button>
                          </div>

                          {/* Step 1: Name */}
                          <div className="mb-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Nome da coluna</label>
                            <input
                              type="text"
                              value={adjColDialog.name}
                              onChange={e => update({ name: e.target.value })}
                              placeholder={isDisc ? 'Ex: Desconto Frete' : 'Ex: Acréscimo ICMS'}
                              autoFocus
                              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary"
                            />
                          </div>

                          {/* Step 2: Method */}
                          {!adjColDialog.method ? (
                            <>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Método</label>
                              <div className="flex gap-3 mb-4">
                                <button
                                  onClick={() => update({ method: 'geral' })}
                                  disabled={!adjColDialog.name.trim()}
                                  className="flex-1 py-4 rounded-xl border-2 border-slate-200 text-slate-400 hover:border-primary hover:text-primary hover:bg-primary/5 font-black transition-all flex flex-col items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <span className="text-xl">=</span>
                                  <span className="text-xs font-medium">Geral</span>
                                  <span className="text-[10px] text-slate-400 font-normal">Mesmo valor para todos</span>
                                </button>
                                <button
                                  onClick={() => { update({ method: 'individual' }); }}
                                  disabled={!adjColDialog.name.trim()}
                                  className="flex-1 py-4 rounded-xl border-2 border-slate-200 text-slate-400 hover:border-primary hover:text-primary hover:bg-primary/5 font-black transition-all flex flex-col items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <span className="text-xl">≠</span>
                                  <span className="text-xs font-medium">Individual</span>
                                  <span className="text-[10px] text-slate-400 font-normal">Valor por item</span>
                                </button>
                              </div>
                              <button onClick={() => setAdjColDialog(null)} className="w-full py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
                            </>
                          ) : adjColDialog.method === 'geral' ? (
                            <>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Valor</label>
                              <div className="flex gap-2 mb-4">
                                <input type="number" min="0" step="0.01"
                                  value={adjColDialog.geralValue}
                                  onChange={e => update({ geralValue: e.target.value })}
                                  placeholder="0"
                                  onWheel={blockWheelChange}
                                  className="flex-1 min-w-0 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                                />
                                <div className="flex shrink-0 border border-slate-200 rounded-xl overflow-hidden">
                                  <button onClick={() => update({ geralType: 'pct' })} className={cn("px-4 text-sm font-black transition-colors", adjColDialog.geralType === 'pct' ? `${accentBg} text-white` : "text-slate-500 hover:bg-slate-50")}>%</button>
                                  <button onClick={() => update({ geralType: 'fixed' })} className={cn("px-4 text-sm font-black transition-colors border-l border-slate-200", adjColDialog.geralType === 'fixed' ? `${accentBg} text-white` : "text-slate-500 hover:bg-slate-50")}>R$</button>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => update({ method: null })} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">← Voltar</button>
                                <button onClick={confirmCol} disabled={!adjColDialog.geralValue || parseFloat(adjColDialog.geralValue) <= 0}
                                  className={cn("flex-1 py-3 rounded-xl text-sm font-black text-white transition-colors disabled:opacity-40", accentBg, isDisc ? "hover:bg-red-600" : "hover:bg-emerald-700")}>Adicionar</button>
                              </div>
                            </>
                          ) : (
                            <>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Tipo do valor</label>
                              <div className="flex gap-3 mb-4">
                                <button onClick={() => update({ individualType: 'pct' })} className={cn("flex-1 py-4 rounded-xl border-2 font-black transition-all flex flex-col items-center gap-1", adjColDialog.individualType === 'pct' ? "border-primary text-primary bg-primary/5" : "border-slate-200 text-slate-400 hover:border-slate-300")}>
                                  <span className="text-2xl">%</span><span className="text-xs font-medium">Percentual</span>
                                </button>
                                <button onClick={() => update({ individualType: adjColDialog.individualType === 'pct' ? 'fixed' : adjColDialog.individualType })} className={cn("flex-1 py-4 rounded-xl border-2 font-black transition-all flex flex-col items-center gap-1", adjColDialog.individualType !== 'pct' ? "border-primary text-primary bg-primary/5" : "border-slate-200 text-slate-400 hover:border-slate-300")}>
                                  <span className="text-2xl">R$</span><span className="text-xs font-medium">Valor fixo</span>
                                </button>
                              </div>
                              {adjColDialog.individualType !== 'pct' && (
                                <>
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Aplicar sobre</label>
                                  <div className="flex gap-3 mb-4">
                                    <button onClick={() => update({ individualType: 'fixed' })} className={cn("flex-1 py-3 rounded-xl border-2 font-black transition-all flex flex-col items-center gap-1 text-center", adjColDialog.individualType === 'fixed' ? "border-primary text-primary bg-primary/5" : "border-slate-200 text-slate-400 hover:border-slate-300")}>
                                      <span className="text-sm">R$/un</span><span className="text-[10px] font-medium leading-tight">Preço Custo<br/>(por unidade)</span>
                                    </button>
                                    <button onClick={() => update({ individualType: 'fixed_total' })} className={cn("flex-1 py-3 rounded-xl border-2 font-black transition-all flex flex-col items-center gap-1 text-center", adjColDialog.individualType === 'fixed_total' ? "border-primary text-primary bg-primary/5" : "border-slate-200 text-slate-400 hover:border-slate-300")}>
                                      <span className="text-sm">R$∑</span><span className="text-[10px] font-medium leading-tight">Valor Total<br/>(rateado por qtd.)</span>
                                    </button>
                                  </div>
                                </>
                              )}
                              <div className="flex gap-2">
                                <button onClick={() => update({ method: null })} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">← Voltar</button>
                                <button onClick={confirmCol}
                                  className={cn("flex-1 py-3 rounded-xl text-sm font-black text-white transition-colors", accentBg, isDisc ? "hover:bg-red-600" : "hover:bg-emerald-700")}>Adicionar</button>
                              </div>
                            </>
                          )}
                        </>
                      );
                    })()}
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
                          onKeyDown={e => { if (e.key === 'Enter' && !reviewSavingMeasure) { e.preventDefault(); handleReviewSaveMeasure(); } }}
                          placeholder="Ex: CX, PCT, FD..."
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
                          onKeyDown={e => { if (e.key === 'Enter' && !reviewSavingMeasure) { e.preventDefault(); handleReviewSaveMeasure(); } }}
                          placeholder="Ex: 12"
                          onWheel={blockWheelChange}
                          autoFocus
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

              {/* Ocultar Colunas modal */}
              {showHideColsModal && (
                <div className="fixed inset-0 z-[170] flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowHideColsModal(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    className="relative w-full max-w-lg bg-surface-container rounded-2xl shadow-2xl overflow-hidden"
                  >
                    <div className="p-5 border-b border-on-surface/[0.07] flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#FFE500]/15 text-[#B8A600] dark:text-[#FFE500] flex items-center justify-center shrink-0">
                        <EyeOff size={17} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-black text-on-surface">Ocultar Colunas</h3>
                        <p className="text-xs text-on-surface/40">Clique num card para ocultar/mostrar a coluna na tabela</p>
                      </div>
                      <button
                        onClick={() => setShowHideColsModal(false)}
                        className="ml-auto w-8 h-8 rounded-lg bg-on-surface/[0.06] text-on-surface/40 hover:bg-on-surface/[0.1] flex items-center justify-center shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">
                      <div className="grid grid-cols-3 gap-2.5">
                        {REVIEW_HIDEABLE_COLS.map(col => {
                          const isHidden = reviewHiddenCols.has(col);
                          return (
                            <button
                              key={col}
                              onClick={() => setReviewHiddenCols(prev => { const s = new Set(prev); s.has(col) ? s.delete(col) : s.add(col); return s; })}
                              className={cn(
                                'relative text-left px-3 py-2.5 rounded-xl border-[1.5px] transition-colors',
                                isHidden
                                  ? 'bg-[#FFE500]/10 border-[#FFE500]/50'
                                  : 'bg-on-surface/[0.03] border-on-surface/[0.07] hover:bg-on-surface/[0.06]'
                              )}
                            >
                              {isHidden && (
                                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-[5px] bg-[#FFE500] text-[#1A1A0E] flex items-center justify-center">
                                  <Check size={10} strokeWidth={3} />
                                </span>
                              )}
                              <span className={cn('block text-xs font-extrabold', isHidden ? 'text-[#B8A600] dark:text-[#FFE500] line-through decoration-[#FFE500]/50' : 'text-on-surface')}>{col}</span>
                              <span className={cn('block text-[9px] font-bold uppercase tracking-wide mt-0.5', isHidden ? 'text-[#B8A600]/70 dark:text-[#FFE500]/70' : 'text-on-surface/35')}>{isHidden ? 'Oculta' : 'Visível'}</span>
                            </button>
                          );
                        })}
                      </div>

                      {adjColumns.length > 0 && (
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-wide text-on-surface/35 mb-2">Colunas de Desconto/Acréscimo desta nota</p>
                          <div className="grid grid-cols-3 gap-2.5">
                            {adjColumns.map(col => {
                              const isHidden = reviewHiddenCols.has(col.id);
                              return (
                                <button
                                  key={col.id}
                                  onClick={() => setReviewHiddenCols(prev => { const s = new Set(prev); s.has(col.id) ? s.delete(col.id) : s.add(col.id); return s; })}
                                  className={cn(
                                    'relative text-left px-3 py-2.5 rounded-xl border-[1.5px] transition-colors',
                                    isHidden
                                      ? 'bg-[#FFE500]/10 border-[#FFE500]/50'
                                      : 'bg-on-surface/[0.03] border-on-surface/[0.07] hover:bg-on-surface/[0.06]'
                                  )}
                                >
                                  {isHidden && (
                                    <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-[5px] bg-[#FFE500] text-[#1A1A0E] flex items-center justify-center">
                                      <Check size={10} strokeWidth={3} />
                                    </span>
                                  )}
                                  <span className={cn('block text-xs font-extrabold truncate', isHidden ? 'text-[#B8A600] dark:text-[#FFE500] line-through decoration-[#FFE500]/50' : 'text-on-surface')}>{col.name}</span>
                                  <span className={cn('block text-[9px] font-bold uppercase tracking-wide mt-0.5', isHidden ? 'text-[#B8A600]/70 dark:text-[#FFE500]/70' : 'text-on-surface/35')}>
                                    {isHidden ? 'Oculta' : (col.kind === 'desconto' ? 'Desconto' : 'Acréscimo')}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="px-5 py-3.5 border-t border-on-surface/[0.07] flex items-center justify-between">
                      <span className="text-xs text-on-surface/40">{reviewHiddenCols.size} de {REVIEW_HIDEABLE_COLS.length + adjColumns.length} colunas ocultas</span>
                      <button
                        onClick={() => setReviewHiddenCols(new Set())}
                        disabled={reviewHiddenCols.size === 0}
                        className="text-xs font-black text-[#B8A600] dark:text-[#FFE500] uppercase tracking-wide disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-80 transition-opacity"
                      >
                        Mostrar todas
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}

              {/* ── Produtos do Fornecedor — consulta rápida do dicionário (só na etapa Registro) ── */}
              {showSupplierProductsModal && (() => {
                const supplierProducts = Array.from(
                  new Map(
                    noteSupplierMappings
                      .filter(m => m.internal_product_id)
                      .map(m => [m.internal_product_id, products.find((p: any) => p.id === m.internal_product_id)])
                  ).values()
                ).filter(Boolean) as any[];
                const q = supplierProductsSearch.toLowerCase().trim();
                const filtered = q
                  ? supplierProducts.filter(p => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.ean || '').toLowerCase().includes(q))
                  : supplierProducts;
                return (
                  <div className="fixed inset-0 z-[190] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowSupplierProductsModal(false)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 16 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 16 }}
                      transition={{ duration: 0.18 }}
                      className="relative bg-[#F0E7CC] dark:bg-[#1E1E18] rounded-3xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden max-h-[85vh] border border-black/10 dark:border-white/[0.08]"
                    >
                      <div className="px-6 py-5 flex items-center gap-3.5 bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] shrink-0">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                          <BookText size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h2 className="text-lg font-manrope font-extrabold text-[#1A1A0E] leading-tight">Produtos do Fornecedor</h2>
                          <p className="text-xs font-bold text-[#1A1A0E]/55 mt-0.5 truncate">{viewingReviewNote?.supplierName || 'Fornecedor'} — {supplierProducts.length} produto(s) no dicionário</p>
                        </div>
                        <button
                          onClick={() => setShowSupplierProductsModal(false)}
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] border border-black/10 text-black/50 hover:bg-black/[0.14] transition-colors"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <div className="px-6 pt-4 shrink-0">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            autoFocus
                            value={supplierProductsSearch}
                            onChange={e => setSupplierProductsSearch(e.target.value)}
                            placeholder="Buscar por nome, SKU ou EAN..."
                            className="w-full pl-9 pr-3 py-2.5 text-sm font-medium bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl outline-none focus:border-primary transition-colors text-slate-800 dark:text-on-surface"
                          />
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-2 min-h-0">
                        {filtered.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                            <BookText size={26} className="text-slate-300" />
                            <p className="text-sm font-bold text-slate-400">
                              {supplierProducts.length === 0 ? 'Nenhum produto deste fornecedor cadastrado no dicionário ainda.' : 'Nenhum produto encontrado para essa busca.'}
                            </p>
                          </div>
                        ) : filtered.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { openEditModal(p); setShowSupplierProductsModal(false); }}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 hover:border-primary/50 hover:bg-primary/5 rounded-xl transition-all text-left"
                          >
                            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                              <Package size={15} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 dark:text-on-surface truncate">{p.name}</p>
                              <p className="text-[10px] text-slate-400">{p.sku || '—'} · {p.ean || '—'}{p.price > 0 ? ` · R$ ${p.price.toFixed(2).replace('.', ',')}` : ''}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  </div>
                );
              })()}

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
                              onWheel={blockWheelChange}
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
                                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                      <span className="text-[10px] text-emerald-600 font-medium">Qtd:</span>
                                      <input
                                        type="number" min="0" step="any"
                                        value={entry.qty}
                                        onChange={e => setMultiLinkItemEntries(prev => prev.map((en, j) => j === i ? { ...en, qty: e.target.value } : en))}
                                        onWheel={blockWheelChange}
                                        className="w-16 text-[10px] font-bold text-emerald-700 bg-white border border-emerald-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-emerald-400 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                                      />
                                      <span className="text-[10px] text-emerald-600 font-medium ml-2">Mult:</span>
                                      <input
                                        type="number" min="1" step="any"
                                        value={entry.multiplier}
                                        onChange={e => setMultiLinkItemEntries(prev => prev.map((en, j) => j === i ? { ...en, multiplier: e.target.value } : en))}
                                        onWheel={blockWheelChange}
                                        className="w-14 text-[10px] font-bold text-emerald-700 bg-white border border-emerald-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-emerald-400 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                                        title="Unidades por embalagem — divide o preço custo automaticamente"
                                      />
                                      {multiLinkSaveTranslation && (
                                        <>
                                          <span className="text-[10px] text-emerald-600 font-medium ml-2">Cód.:</span>
                                          <input
                                            type="text"
                                            value={entry.supplierCode}
                                            onChange={e => setMultiLinkItemEntries(prev => prev.map((en, j) => j === i ? { ...en, supplierCode: e.target.value } : en))}
                                            placeholder="Código do fornecedor"
                                            className="w-24 text-[10px] font-bold text-emerald-700 bg-white border border-emerald-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-emerald-400"
                                          />
                                        </>
                                      )}
                                    </div>
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
                                onWheel={blockWheelChange}
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
                                  placeholder="Opcional" />
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
                      <div className="px-5 py-4 border-t border-slate-100 shrink-0 space-y-3">
                        {/* Toggle tradução permanente */}
                        <button
                          type="button"
                          onClick={() => setMultiLinkSaveTranslation(v => !v)}
                          className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left', multiLinkSaveTranslation ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300')}
                        >
                          <div className={cn('w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors', multiLinkSaveTranslation ? 'bg-amber-400' : 'border-2 border-slate-300 bg-white')}>
                            {multiLinkSaveTranslation && <Check size={10} className="text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn('text-xs font-bold', multiLinkSaveTranslation ? 'text-amber-700' : 'text-slate-500')}>Salvar como tradução permanente</p>
                            <p className="text-[10px] text-slate-400 leading-tight">Próximas notas deste fornecedor identificarão estes itens automaticamente</p>
                          </div>
                        </button>
                        {/* Cada produto será vinculado pelo Código (editável por linha acima) e pela descrição, juntos */}
                        {multiLinkSaveTranslation && (() => {
                          const srcItem = viewingReviewNote?.items[multiLinkItemIdx!];
                          return (
                            <div className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Produto na Nota</p>
                              <p className="text-xs font-bold text-slate-800 truncate">{srcItem?.original_description || '—'}</p>
                              <p className="text-[10px] text-slate-400 mt-1.5">Cada produto também será vinculado pelo código informado em "Cód." acima.</p>
                            </div>
                          );
                        })()}
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

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmação de mudança de Situação de Entrada (cards da aba Recebimento) */}
      <AnimatePresence>
        {statusConfirmTarget && viewingReviewNote && (() => {
          const meta = STATUS_META[statusConfirmTarget];
          const blockedByMissingDate = statusConfirmTarget === 'revisao' && !viewingReviewNote.receivedDate;
          // Considera preços ainda não salvos (digitados na tela mas não persistidos) além do que já está no banco.
          // Itens com "Falta" total (Produto não veio) não exigem Preço de Venda — só a falta
          // parcial (produto chegou, só que em quantidade menor) continua exigindo o preço.
          const blockedByMissingPrice = statusConfirmTarget === 'aprovada' && viewingReviewNote.items.some((item: any, idx: number) => {
            if (!item.product_id) return false;
            const d = getItemDiscrepancy(idx, item);
            if (d?.type === 'falta' && d.missingAll) return false;
            const price = viewingNoteSellPrices[idx] ?? item.product_price;
            return !(price > 0);
          });
          // Regra restrita: só bloqueia por causa de Produto Mãe pendente (item.mother_draft
          // salvo pela aba "Produto Mãe" mas ainda sem o produto filho criado) — um item
          // simplesmente não vinculado (sem mother_draft) continua não bloqueando a aprovação,
          // como já era o comportamento antes desta feature.
          const pendingMotherDraftCount = statusConfirmTarget === 'aprovada'
            ? viewingReviewNote.items.filter((item: any) => !!item.mother_draft).length
            : 0;
          const blockedByPendingMotherDraft = pendingMotherDraftCount > 0;
          return (
            <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setStatusConfirmTarget(null)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="relative w-full max-w-sm bg-white dark:bg-[#1e1e18] border border-line dark:border-white/10 rounded-3xl p-6 text-center shadow-2xl"
              >
                <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4', meta.bg, meta.fg)}>
                  <StatusIcon status={statusConfirmTarget} size={22} />
                </div>
                {blockedByMissingDate ? (
                  <>
                    <h3 className="text-base font-black text-on-surface mb-2">Falta a data de recebimento</h3>
                    <p className="text-xs text-on-surface/55 leading-relaxed mb-5">
                      Para colocar essa nota em <b>Revisão</b> é preciso preencher a "Data de recebimento" acima nesta mesma aba.
                    </p>
                    <button
                      onClick={() => setStatusConfirmTarget(null)}
                      className="w-full py-3 rounded-2xl bg-on-surface/10 text-on-surface font-black text-xs uppercase tracking-widest hover:bg-on-surface/15 transition-all"
                    >
                      Entendi
                    </button>
                  </>
                ) : blockedByPendingMotherDraft ? (
                  <>
                    <h3 className="text-base font-black text-on-surface mb-2">Produto Mãe pendente</h3>
                    <p className="text-xs text-on-surface/55 leading-relaxed mb-5">
                      {pendingMotherDraftCount === 1
                        ? 'Existe 1 item com um Produto Mãe já definido, mas sem o produto normal criado e vinculado ainda.'
                        : `Existem ${pendingMotherDraftCount} itens com um Produto Mãe já definido, mas sem o produto normal criado e vinculado ainda.`} Finalize pela aba "Produto" (dentro de "Criar e Vincular") antes de aprovar.
                    </p>
                    <button
                      onClick={() => setStatusConfirmTarget(null)}
                      className="w-full py-3 rounded-2xl bg-on-surface/10 text-on-surface font-black text-xs uppercase tracking-widest hover:bg-on-surface/15 transition-all"
                    >
                      Entendi
                    </button>
                  </>
                ) : blockedByMissingPrice ? (
                  <>
                    <h3 className="text-base font-black text-on-surface mb-2">Faltam preços de venda</h3>
                    <p className="text-xs text-on-surface/55 leading-relaxed mb-5">
                      Existem produtos vinculados nesta nota sem "Preço Venda" preenchido. Preencha o preço de todos os itens vinculados antes de aprovar.
                    </p>
                    <button
                      onClick={() => setStatusConfirmTarget(null)}
                      className="w-full py-3 rounded-2xl bg-on-surface/10 text-on-surface font-black text-xs uppercase tracking-widest hover:bg-on-surface/15 transition-all"
                    >
                      Entendi
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="text-base font-black text-on-surface mb-2">Mudar situação da nota?</h3>
                    <p className="text-xs text-on-surface/55 leading-relaxed mb-5">
                      A nota <b className="text-on-surface">{viewingReviewNote.supplierName || viewingReviewNote.fileName}</b> vai para a situação <b className="text-on-surface">{meta.label}</b>.
                      {statusConfirmTarget === 'aprovada' && ' Essa ação não pode ser desfeita.'}
                    </p>
                    <button
                      disabled={savingNoteStatus}
                      onClick={() => changeNoteStatus(viewingReviewNote.id, statusConfirmTarget)}
                      className={cn('w-full py-3.5 rounded-2xl text-white font-black text-xs uppercase tracking-widest transition-all disabled:opacity-60 flex items-center justify-center gap-2 mb-2', meta.fg)}
                      style={{ backgroundColor: 'currentColor' }}
                    >
                      <span className="text-white flex items-center gap-2">
                        <CheckCircle2 size={15} /> {savingNoteStatus ? 'Salvando...' : 'Confirmar'}
                      </span>
                    </button>
                    <button
                      onClick={() => setStatusConfirmTarget(null)}
                      className="w-full py-2.5 text-on-surface/45 font-bold text-xs hover:text-on-surface/70 transition-colors"
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Confirmação de envio da Distribuição — irreversível, gera 1 manifesto por loja extra */}
      <AnimatePresence>
        {distribSendConfirmOpen && viewingReviewNote && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !sendingDistribution && setDistribSendConfirmOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="relative w-full max-w-sm bg-white dark:bg-[#1e1e18] border border-line dark:border-white/10 rounded-3xl p-6 text-center shadow-2xl"
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Truck size={22} />
              </div>
              <h3 className="text-base font-black text-on-surface mb-2">Confirmar envio da distribuição?</h3>
              <p className="text-xs text-on-surface/55 leading-relaxed mb-5">
                Cria 1 manifesto por loja de destino na aba Distribuição, já como "Pedido Enviado". Essa ação não pode ser desfeita.
              </p>
              <button
                disabled={sendingDistribution}
                onClick={handleSendDistribution}
                className="w-full py-3.5 rounded-2xl text-white font-black text-xs uppercase tracking-widest transition-all disabled:opacity-60 flex items-center justify-center gap-2 mb-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 size={15} /> {sendingDistribution ? 'Enviando...' : 'Confirmar Envio'}
              </button>
              <button
                onClick={() => setDistribSendConfirmOpen(false)}
                disabled={sendingDistribution}
                className="w-full py-2.5 text-on-surface/45 font-bold text-xs hover:text-on-surface/70 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mode choice — Administrador vs Estoque, ao abrir uma nota no mobile */}
      <AnimatePresence>
        {noteModeChoiceOpen && viewingReviewNote && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[210] bg-black/65 flex items-end md:items-center md:justify-center"
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="w-full md:max-w-sm bg-[#161610] md:rounded-3xl rounded-t-3xl border border-white/[0.08] p-5 pb-8 md:pb-6"
            >
              <p className="text-[15px] font-black text-[#f2f0e3] text-center">Como deseja abrir esta nota?</p>
              <p className="text-[11px] text-white/35 font-medium text-center mt-1 mb-5 leading-relaxed">
                Dá para trocar de modo depois, sem perder o que já foi editado.
              </p>
              <button
                onClick={() => { changeNoteViewMode('admin'); setNoteModeChoiceOpen(false); setShowMobileNoteView(true); }}
                className="w-full flex items-center gap-3 p-4 rounded-2xl border border-[#D81E1E]/25 bg-[#D81E1E]/[0.09] text-left mb-2.5"
              >
                <div className="w-10 h-10 rounded-xl bg-[#D81E1E]/15 text-[#f87171] flex items-center justify-center shrink-0">
                  <ShieldCheck size={19} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-black text-[#f87171]">Administrador</p>
                  <p className="text-[10.5px] text-white/35 font-medium leading-snug mt-0.5">
                    Edição completa: sem teclado virtual, filtros avançados, Distribuição, Desconto/Acréscimo e Baixar.
                  </p>
                </div>
              </button>
              <button
                onClick={() => { changeNoteViewMode('estoque'); setNoteModeChoiceOpen(false); setShowMobileNoteView(true); }}
                className="w-full flex items-center gap-3 p-4 rounded-2xl border border-white/[0.08] bg-white/[0.04] text-left mb-3"
              >
                <div className="w-10 h-10 rounded-xl bg-white/[0.07] text-white/50 flex items-center justify-center shrink-0">
                  <Package size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-black text-[#f2f0e3]">Estoque</p>
                  <p className="text-[10.5px] text-white/35 font-medium leading-snug mt-0.5">
                    Conferência rápida no teclado numérico — o modo de hoje, sem mudanças.
                  </p>
                </div>
              </button>
              <button
                onClick={() => setNoteModeChoiceOpen(false)}
                className="w-full text-center text-[12px] font-bold text-white/35 py-2"
              >
                Cancelar
              </button>
            </motion.div>
          </motion.div>
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
            reviewTimestamps={viewingNoteReviewTimestamps} setReviewTimestamps={setViewingNoteReviewTimestamps}
            units={viewingNoteUnits}
            multipliers={viewingNoteMultipliers}
            distribuicao={viewingNoteDistribuicao} setDistribuicao={setViewingNoteDistribuicao}
            distribMode={viewingDistribMode}       setDistribMode={setViewingDistribMode}
            mode={noteViewMode}
            onModeChange={changeNoteViewMode}
            adjColumns={adjColumns}
            onAddAdjColumn={(col) => setAdjColumns(prev => [...prev, col])}
            onRemoveAdjColumn={(id) => setAdjColumns(prev => prev.filter(c => c.id !== id))}
            onDownload={() => {
              if (!viewingReviewNote) return;
              setEstoquePickerArgs({
                items: viewingReviewNote.items.map((item: any, idx: number) => ({
                  ...item,
                  qty: viewingNoteQtys[idx] ?? item.qty,
                  unit: viewingNoteUnits[idx] ?? item.unit,
                  multiplier: viewingNoteMultipliers[idx] ?? item.multiplier,
                  distribuicao: viewingNoteDistribuicao[idx] !== undefined && viewingNoteDistribuicao[idx] !== ''
                    ? parseInt(viewingNoteDistribuicao[idx]) || null
                    : (item.distribuicao ?? null),
                })),
                adj: adjColumns,
                meta: { supplierName: viewingReviewNote.supplierName, noteNumber: viewingReviewNote.noteNumber, accessKey: viewingReviewNote.accessKey },
              });
              setShowEstoqueLayoutPicker(true);
            }}
            setNote={(n) => setViewingReviewNote(n as any)}
            companies={companies}
            onClose={() => { releaseNoteLock(); setShowMobileNoteView(false); setViewingReviewNote(null); }}
            onSave={handleSaveNote}
            savingNote={savingNote}
            onDelete={handleDeleteNote}
            onChangeStatus={changeNoteStatus}
            savingStatus={savingNoteStatus}
            onAddRow={handleAddNoteRow}
            onVarios={(idx) => { setShowMobileNoteView(false); setMultiLinkItemIdx(idx); setMultiLinkItemSearch(''); setMultiLinkItemQty(''); setMultiLinkItemResults([]); setMultiLinkItemEntries([]); setMultiLinkItemShowCreate(false); }}
            eanProblems={eanProblems}
            onReportEanProblem={(ean, desc, obs) => handleReportEanProblem(ean, desc, obs, 'note_item')}
            eanVariants={viewingNoteEanVariants}
            setEanVariants={setViewingNoteEanVariants}
            extraEans={viewingNoteExtraEans}
            setExtraEans={setViewingNoteExtraEans}
            onUseTranslation={handleReviewUseTranslation}
            onSaveMeasure={applyReviewMeasure}
            onResetMultiplier={(idx) => { const m = [...viewingNoteMultipliers]; m[idx] = 1; setViewingNoteMultipliers(m); const c = [...viewingNoteMeasureConverted]; c[idx] = false; setViewingNoteMeasureConverted(c); }}
            loadingUnitIdx={reviewLoadingUnitIdx}
            savingMeasure={reviewSavingMeasure}
          />
        )}
      </AnimatePresence>

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
                  // Uma coluna por Desconto/Acréscimo que o usuário realmente criou nesta nota —
                  // antes existiam dois chips genéricos "Desconto"/"Acréscimo" com chave que não
                  // batia com nenhum cálculo (sempre exportavam "—", sem refletir a coluna real).
                  const noteAdjCols: AdjColumn[] = Array.isArray(estoquePickerArgs?.adj) ? estoquePickerArgs!.adj : [];
                  const allCols = [
                    { key: 'codigo',      label: 'Código' },
                    { key: 'produto',     label: 'Produto' },
                    { key: 'ean',         label: 'EAN' },
                    { key: 'sku',         label: 'SKU' },
                    { key: 'qtd',         label: 'Quantidade' },
                    { key: 'adjcost',     label: 'P.Custo' },
                    { key: 'vlrtotal',    label: 'Vlr Total' },
                    ...noteAdjCols.map(c => ({ key: `adjcol:${c.id}`, label: c.name || (c.kind === 'desconto' ? 'Desconto' : 'Acréscimo') })),
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

      {/* ── Unit Menu Portal — escapa overflow-hidden/auto da tabela de notas ── */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {reviewUnitMenuIdx !== null && reviewUnitMenuPos && (() => {
            const activeIdx = reviewUnitMenuIdx;
            const activeItem = viewingReviewNote?.items?.[activeIdx];
            if (!activeItem) return null;
            return (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.12 }}
                style={{ position: 'fixed', top: reviewUnitMenuPos.top, left: reviewUnitMenuPos.left, zIndex: 9999 }}
                className="rounded-xl shadow-2xl overflow-hidden w-44 bg-[#2e2e28] border border-white/[0.08]"
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => { setReviewMeasureIdx(activeIdx); setReviewMeasureUnit(viewingNoteUnits[activeIdx] ?? activeItem.unit ?? ''); setReviewMeasureMultiplier(''); setReviewUnitMenuIdx(null); setReviewUnitMenuPos(null); }}
                  className="w-full text-left px-3 py-2.5 text-xs font-bold text-white/75 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
                >
                  <Ruler size={12} className="shrink-0" />
                  Adicionar medida
                </button>
                <button
                  onClick={() => { handleReviewUseTranslation(activeIdx); setReviewUnitMenuIdx(null); setReviewUnitMenuPos(null); }}
                  disabled={reviewLoadingUnitIdx === activeIdx}
                  className="w-full text-left px-3 py-2.5 text-xs font-bold text-white/75 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {reviewLoadingUnitIdx === activeIdx
                    ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-r-transparent shrink-0" />
                    : <Zap size={12} className="shrink-0" />
                  }
                  Usar tradução
                </button>
                <button
                  onClick={() => { const m = [...viewingNoteMultipliers]; m[activeIdx] = 1; setViewingNoteMultipliers(m); const c = [...viewingNoteMeasureConverted]; c[activeIdx] = false; setViewingNoteMeasureConverted(c); setReviewUnitMenuIdx(null); setReviewUnitMenuPos(null); }}
                  className="w-full text-left px-3 py-2.5 text-xs font-bold text-white/40 hover:bg-white/[0.06] transition-colors flex items-center gap-2 border-t border-white/[0.05]"
                >
                  <Pencil size={12} className="shrink-0" />
                  Manual
                </button>
              </motion.div>
            );
          })()}
        </AnimatePresence>,
        document.body,
      )}

      {/* ── Novo Fabricante (quick add a partir do formulário de produto) ── */}
      <AddManufacturerModal
        isOpen={showQuickAddManufacturer}
        onClose={() => setShowQuickAddManufacturer(false)}
        onSuccess={(m) => {
          setManufacturers(prev => [...prev, m].sort((a, b) => a.name.localeCompare(b.name)));
          if (editingProduct) setEditingProduct({ ...editingProduct, manufacturerId: m.id });
          else if (showAddModal) setNewProduct(p => ({ ...p, manufacturerId: m.id }));
        }}
      />
    </div>
  );
}

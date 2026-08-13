'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus,
  Search,
  Filter,
  Tag,
  Edit2,
  Package,
  TrendingUp,
  AlertTriangle,
  LayoutGrid,
  ChevronRight,
  ChevronDown,
  Rows3,
  Smartphone,
  StickyNote,
} from 'lucide-react';
import { LabelPrintModal } from './LabelPrintModal';
import { PlacaPrintModal } from './PlacaPrintModal';
import { EstoqueManager } from './estoque/EstoqueManager';
import { motion, AnimatePresence } from 'motion/react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { FeaturedProduct } from '@/components/FeaturedProduct';
import { ProductCard } from '@/components/ProductCard';

interface InventoryManagerProps {
  products: any[];
  loading: boolean;
  isConfigured: boolean;
  importing: boolean;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  onAdd: () => void;
  onOpenProductList: () => void;
  onEdit: (product: any) => void;
  onStockUpdate: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenMobileBulkTable: () => void;
  stockFileInputRef: React.RefObject<HTMLInputElement | null>;
  setShowStockUpdateChoiceModal: (val: boolean) => void;
}

export function InventoryManager({
  products,
  loading,
  isConfigured,
  importing,
  searchQuery,
  setSearchQuery,
  onAdd,
  onOpenProductList,
  onEdit,
  onStockUpdate,
  onOpenMobileBulkTable,
  stockFileInputRef,
  setShowStockUpdateChoiceModal
}: InventoryManagerProps) {
  const [activeInventoryTab, setActiveInventoryTab] = useState<'produtos' | 'estoque'>('produtos');
  const [showFilters, setShowFilters] = useState(false);
  const [showNewDropdown, setShowNewDropdown] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [showPlacaModal, setShowPlacaModal] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const newDropdownRef = useRef<HTMLDivElement>(null);
  const printMenuRefMobile = useRef<HTMLDivElement>(null);
  const printMenuRefDesktop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (newDropdownRef.current && !newDropdownRef.current.contains(e.target as Node)) {
        setShowNewDropdown(false);
      }
    }
    if (showNewDropdown) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNewDropdown]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const insideMobile = printMenuRefMobile.current?.contains(target);
      const insideDesktop = printMenuRefDesktop.current?.contains(target);
      if (!insideMobile && !insideDesktop) {
        setShowPrintMenu(false);
      }
    }
    if (showPrintMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPrintMenu]);

  const [filters, setFilters] = useState({
    ean: '',
    internalCode: '',
    category: '',
    subcategory: '',
    brand: '',
    name: '',
    location: ''
  });

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = !searchQuery || 
        product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.ean?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesFilters = 
        (!filters.ean || product.ean?.toLowerCase().includes(filters.ean.toLowerCase())) &&
        (!filters.internalCode || product.sku?.toLowerCase().includes(filters.internalCode.toLowerCase())) &&
        (!filters.category || product.category?.toLowerCase().includes(filters.category.toLowerCase())) &&
        (!filters.subcategory || product.subcategory?.toLowerCase().includes(filters.subcategory.toLowerCase())) &&
        (!filters.brand || product.brand?.toLowerCase().includes(filters.brand.toLowerCase())) &&
        (!filters.name || product.name?.toLowerCase().includes(filters.name.toLowerCase())) &&
        (!filters.location || product.location?.toLowerCase().includes(filters.location.toLowerCase()));

      return matchesSearch && matchesFilters;
    });
  }, [products, searchQuery, filters]);

  const featuredProduct = useMemo(() => filteredProducts.find(p => p.isFeatured), [filteredProducts]);
  const sideProduct = useMemo(() => filteredProducts.find(p => p.isSide && p.id !== featuredProduct?.id), [filteredProducts, featuredProduct]);
  const gridProducts = useMemo(() =>
    filteredProducts.filter(p => p.id !== featuredProduct?.id && p.id !== sideProduct?.id),
    [filteredProducts, featuredProduct, sideProduct]
  );

  // Virtualized list — uses window scroll (no wrapper scroll container needed)
  const rowVirtualizer = useWindowVirtualizer({
    count: gridProducts.length,
    estimateSize: () => 182, // estimated height of ProductCard + gap (px)
    overscan: 5,             // render 5 extra items above/below viewport
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative mb-14">
        <div className="bg-[#FFE500] dark:bg-[#252520] border border-[#D4C000] dark:border-white/[0.07] rounded-tl-[20px] rounded-tr-[20px] rounded-br-[20px] px-6 py-5 flex items-center gap-3.5">
          <div className="w-[52px] h-[52px] rounded-[14px] bg-[rgba(26,26,10,0.09)] dark:bg-[rgba(216,30,30,0.13)] flex items-center justify-center text-[#1A1A0E] dark:text-primary shrink-0">
            <Package size={24} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-[26px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] tracking-tight leading-tight">Inventory</h1>
            <div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[rgba(26,26,10,0.40)] dark:text-white/[0.28]">Produtos &amp; Estoque</div>
          </div>
        </div>

        <div className="absolute left-0 top-full flex">
          {(['produtos', 'estoque'] as const).map((tab, i, arr) => {
            const active = activeInventoryTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveInventoryTab(tab)}
                className={cn(
                  'w-[136px] h-[34px] flex items-center justify-center shrink-0',
                  'bg-[#FFE500] dark:bg-[#252520] border border-t-0 border-[#D4C000] dark:border-white/[0.07]',
                  i === arr.length - 1 && 'rounded-br-[12px]',
                  'text-[12px] font-extrabold uppercase tracking-wide',
                  'shadow-[inset_0_6px_8px_-5px_rgba(26,26,10,0.35)] dark:shadow-[inset_0_6px_8px_-5px_rgba(0,0,0,0.55)]',
                  'transition-[opacity,transform] duration-150 active:scale-[0.97]',
                  active
                    ? 'text-[#1A1A0E] dark:text-[#F2F0E3] opacity-100'
                    : 'text-[#1A1A0E] dark:text-white/75 opacity-55 hover:opacity-85'
                )}
              >
                {tab === 'produtos' ? 'Produtos' : 'Estoque'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Estoque tab content */}
      {activeInventoryTab === 'estoque' && (
        <EstoqueManager products={products} />
      )}

      {/* Produtos tab content */}
      {activeInventoryTab === 'produtos' && <>

      {!isConfigured && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-500/10 border border-red-500/20 p-6 rounded-[2rem] flex items-center gap-6 text-red-700 dark:text-red-400 shadow-sm"
        >
          <div className="w-12 h-12 bg-red-500/15 rounded-2xl flex items-center justify-center text-red-600 dark:text-red-400 shadow-inner">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="font-black text-sm uppercase tracking-widest">Supabase connection offline</p>
            <p className="text-xs opacity-60 font-medium">Please configure your environment variables in the settings menu to enable cloud sync.</p>
          </div>
        </motion.div>
      )}
      
      {/* Action Header */}
      <div className="flex flex-col gap-3">

        <input type="file" ref={stockFileInputRef} onChange={onStockUpdate} accept=".xml,.csv,.xlsx,.xls" className="hidden" />

        {/* Mobile layout: search on its own row, icon buttons + count below */}
        <div className="flex flex-col gap-2.5 lg:hidden">
          <div className="h-11 flex items-center gap-2.5 bg-surface-container-low border border-on-surface/[0.06] rounded-2xl px-4">
            <Search size={16} className="text-on-surface/30 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar..."
              className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-on-surface placeholder:text-on-surface/30"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Produtos count pill — uma linha */}
            <div
              title="Produtos"
              className="h-11 shrink-0 flex items-center gap-1.5 px-4 rounded-2xl border border-[#E8D800] dark:border-on-surface/[0.06] bg-[#FFF8C0] dark:bg-surface-container-low whitespace-nowrap"
            >
              <span className="text-sm font-black text-on-surface">{products.length}</span>
              <span className="text-[11px] font-bold text-on-surface/45">produtos</span>
            </div>

            {/* Mobile — ícone */}
            <button
              onClick={onOpenMobileBulkTable}
              title="Mobile"
              className="w-11 h-11 shrink-0 rounded-2xl border border-on-surface/[0.06] bg-surface-container-low text-on-surface/55 flex items-center justify-center active:scale-95 transition-all hover:text-on-surface"
            >
              <Smartphone size={17} />
            </button>

            {/* Filtros — ícone */}
            <button
              onClick={() => setShowFilters(v => !v)}
              title="Filtros"
              className={cn(
                'w-11 h-11 shrink-0 rounded-2xl border flex items-center justify-center active:scale-95 transition-all',
                showFilters
                  ? 'bg-primary/10 border-primary/20 text-primary'
                  : 'bg-surface-container-low border-on-surface/[0.06] text-on-surface/55 hover:text-on-surface'
              )}
            >
              <Filter size={17} />
            </button>

            {/* Etiquetas / Placas — ícone com menu */}
            <div ref={printMenuRefMobile} className="relative">
              <button
                onClick={() => setShowPrintMenu(v => !v)}
                title="Imprimir"
                className="w-11 h-11 shrink-0 rounded-2xl border border-on-surface/[0.06] bg-surface-container-low text-on-surface/55 flex items-center justify-center active:scale-95 transition-all hover:text-on-surface"
              >
                <Tag size={17} />
              </button>
              <AnimatePresence>
                {showPrintMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                    className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[180px] rounded-xl border border-on-surface/[0.06] bg-surface-container shadow-xl shadow-black/20 overflow-hidden"
                  >
                    <button
                      onClick={() => { setShowPrintMenu(false); setShowLabelModal(true); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-on-surface/70 hover:text-on-surface hover:bg-on-surface/[0.04] transition-colors"
                    >
                      <Tag size={14} className="text-primary" />
                      Etiquetas
                    </button>
                    <div className="mx-3 h-px bg-on-surface/[0.05]" />
                    <button
                      onClick={() => { setShowPrintMenu(false); setShowPlacaModal(true); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-on-surface/70 hover:text-on-surface hover:bg-on-surface/[0.04] transition-colors"
                    >
                      <StickyNote size={14} className="text-primary" />
                      Placas
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Novo — ícone vermelho, na ponta */}
            <div ref={newDropdownRef} className="relative">
              <button
                onClick={() => setShowNewDropdown(v => !v)}
                title="Novo"
                className="w-11 h-11 shrink-0 rounded-2xl bg-primary text-white flex items-center justify-center active:scale-95 transition-all shadow-lg shadow-primary/20"
              >
                <Plus size={19} />
              </button>
              <AnimatePresence>
                {showNewDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                    className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[180px] rounded-xl border border-on-surface/[0.06] bg-surface-container shadow-xl shadow-black/20 overflow-hidden"
                  >
                    <button
                      onClick={() => { setShowNewDropdown(false); onOpenProductList(); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-on-surface/70 hover:text-on-surface hover:bg-on-surface/[0.04] transition-colors"
                    >
                      <Rows3 size={14} className="text-primary" />
                      Lista de produtos
                    </button>
                    <div className="mx-3 h-px bg-on-surface/[0.05]" />
                    <button
                      onClick={() => { setShowNewDropdown(false); onAdd(); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-on-surface/70 hover:text-on-surface hover:bg-on-surface/[0.04] transition-colors"
                    >
                      <Plus size={14} />
                      Novo Produto
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Desktop layout: search + count + icon buttons, Novo na ponta direita */}
        <div className="hidden lg:flex lg:items-center gap-3">
          <div className="flex-1 max-w-[600px] h-12 flex items-center gap-3 bg-surface-container-low border border-on-surface/[0.03] rounded-2xl px-5 shadow-sm min-w-0">
            <Search size={16} className="text-on-surface/30 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, EAN, SKU..."
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm font-medium text-on-surface placeholder:text-on-surface/30"
            />
          </div>

          {/* Produtos count pill — uma linha, ao lado da busca */}
          <div
            title="Produtos"
            className="h-12 shrink-0 flex items-center gap-1.5 px-5 rounded-2xl border border-[#E8D800] dark:border-on-surface/[0.06] bg-[#FFF8C0] dark:bg-surface-container-low whitespace-nowrap"
          >
            <span className="text-[15px] font-black text-on-surface">{products.length}</span>
            <span className="text-xs font-bold text-on-surface/45">produtos</span>
          </div>

          <button
            onClick={onOpenMobileBulkTable}
            title="Mobile"
            className="w-12 h-12 shrink-0 bg-surface-container-low border border-on-surface/[0.03] rounded-2xl text-on-surface/60 hover:text-on-surface hover:bg-surface-container transition-[colors,transform] flex items-center justify-center shadow-sm active:scale-95"
          >
            <Smartphone size={16} />
          </button>

          <button
            onClick={() => setShowFilters(!showFilters)}
            title="Filtros"
            className={cn(
              "w-12 h-12 shrink-0 rounded-2xl transition-[colors,transform] flex items-center justify-center shadow-sm border active:scale-95",
              showFilters
                ? "bg-primary/10 border-primary/20 text-primary"
                : "bg-surface-container-low border-on-surface/[0.03] text-on-surface/60 hover:text-on-surface"
            )}
          >
            <Filter size={16} />
          </button>

          <div ref={printMenuRefDesktop} className="relative">
            <button
              onClick={() => setShowPrintMenu(v => !v)}
              title="Imprimir"
              className="w-12 h-12 shrink-0 bg-surface-container-low border border-on-surface/[0.03] rounded-2xl text-on-surface/60 hover:text-on-surface hover:bg-surface-container flex items-center justify-center shadow-sm transition-[colors,transform] active:scale-95"
            >
              <Tag size={16} />
            </button>
            <AnimatePresence>
              {showPrintMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                  className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[180px] rounded-xl border border-on-surface/[0.06] bg-surface-container shadow-xl shadow-black/20 overflow-hidden"
                >
                  <button
                    onClick={() => { setShowPrintMenu(false); setShowLabelModal(true); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-on-surface/70 hover:text-on-surface hover:bg-on-surface/[0.04] transition-colors"
                  >
                    <Tag size={14} className="text-primary" />
                    Etiquetas
                  </button>
                  <div className="mx-3 h-px bg-on-surface/[0.05]" />
                  <button
                    onClick={() => { setShowPrintMenu(false); setShowPlacaModal(true); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-on-surface/70 hover:text-on-surface hover:bg-on-surface/[0.04] transition-colors"
                  >
                    <StickyNote size={14} className="text-primary" />
                    Placas
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div ref={newDropdownRef} className="relative">
            <button
              onClick={() => setShowNewDropdown(v => !v)}
              title="Novo"
              className="w-12 h-12 shrink-0 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 active:scale-95 transition-transform"
            >
              <Plus size={18} />
            </button>
            <AnimatePresence>
              {showNewDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                  className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[180px] rounded-xl border border-on-surface/[0.06] bg-surface-container shadow-xl shadow-black/20 overflow-hidden"
                >
                  <button
                    onClick={() => { setShowNewDropdown(false); onOpenProductList(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-on-surface/70 hover:text-on-surface hover:bg-on-surface/[0.04] transition-colors"
                  >
                    <Rows3 size={14} className="text-primary" />
                    Lista de produtos
                  </button>
                  <div className="mx-3 h-px bg-on-surface/[0.05]" />
                  <button
                    onClick={() => { setShowNewDropdown(false); onAdd(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-on-surface/70 hover:text-on-surface hover:bg-on-surface/[0.04] transition-colors"
                  >
                    <Plus size={14} />
                    Novo Produto
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

      </div>

      {/* Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0, scale: 0.98 }}
            animate={{ height: 'auto', opacity: 1, scale: 1 }}
            exit={{ height: 0, opacity: 0, scale: 0.98 }}
            className="overflow-hidden"
          >
            <div className="bg-surface-container-low/50 backdrop-blur-md rounded-[2.5rem] p-10 shadow-sm border border-on-surface/[0.03] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-6">
              {[
                { label: 'EAN', key: 'ean', placeholder: '789...' },
                { label: 'Código Interno', key: 'internalCode', placeholder: 'SKU-001...' },
                { label: 'Categoria', key: 'category', placeholder: 'Doméstico...' },
                { label: 'Subcategoria', key: 'subcategory', placeholder: 'Cozinha...' },
                { label: 'Marca', key: 'brand', placeholder: 'Lacta...' },
                { label: 'Nome', key: 'name', placeholder: 'Chocolate...' },
                { label: 'Localização', key: 'location', placeholder: 'Corredor A...' },
              ].map((field) => (
                <div key={field.key} className="space-y-2.5">
                  <label className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.15em] ml-1">{field.label}</label>
                  <input 
                    type="text" 
                    value={(filters as any)[field.key]}
                    onChange={(e) => setFilters({...filters, [field.key]: e.target.value})}
                    placeholder={field.placeholder}
                    className="w-full h-12 px-5 bg-surface-container-lowest border border-on-surface/[0.02] rounded-2xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/20 outline-none transition-colors placeholder:text-on-surface/10"
                  />
                </div>
              ))}
              <div className="col-span-full flex justify-end pt-4 border-t border-on-surface/[0.03]">
                <button 
                  onClick={() => {
                    setFilters({ ean: '', internalCode: '', category: '', subcategory: '', brand: '', name: '', location: '' });
                    setSearchQuery('');
                  }}
                  className="text-[10px] font-black text-primary uppercase tracking-[0.2em] hover:bg-primary/5 px-4 py-2 rounded-full transition-colors"
                >
                  Limpar Filtros
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid Layout */}
      <div className="grid grid-cols-12 gap-8">
        <AnimatePresence>
          {featuredProduct && (
            <FeaturedProduct key="featured" product={featuredProduct} onEdit={onEdit} />
          )}

          {sideProduct && (
            <motion.div
              key="side"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="col-span-12 lg:col-span-4 bg-surface-container-lowest rounded-[2.5rem] p-8 flex flex-col shadow-xl shadow-on-surface/[0.02] border border-on-surface/[0.03] group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors" />
              
              <button 
                onClick={() => onEdit(sideProduct)}
                className="absolute top-6 right-6 p-3 bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-on-surface/[0.03] opacity-0 group-hover:opacity-100 transition-[opacity,background-color,color,transform] z-10 hover:bg-primary hover:text-white text-on-surface translate-y-2 group-hover:translate-y-0"
              >
                <Edit2 size={16} />
              </button>

              <div className="h-48 w-full bg-surface-container-low/50 rounded-[1.5rem] mb-6 overflow-hidden relative flex items-center justify-center border border-on-surface/[0.02]">
                <div className="relative w-full h-full p-4 flex items-center justify-center group-hover:scale-110 transition-transform duration-700">
                   {/* Simplified image for the manager, actual img rendered by ProductImage elsewhere */}
                   {sideProduct.image ? (
                     <img src={sideProduct.image} alt={sideProduct.name} className="max-h-full max-w-full object-contain drop-shadow-2xl" />
                   ) : (
                     <LayoutGrid size={48} className="text-on-surface/5" />
                   )}
                </div>
              </div>

              <div className="flex justify-between items-start mb-4">
                <span className={cn(
                  "text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest",
                  sideProduct.count > 0 ? "bg-primary/10 text-primary" : "bg-red-100 text-red-600"
                )}>
                  {sideProduct.status || 'Active'}
                </span>
                <span className="text-xl font-black text-primary tracking-tighter">
                  R$ {(sideProduct.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <h3 className="text-lg font-black text-on-surface mb-6 leading-tight group-hover:text-primary transition-colors">{sideProduct.name}</h3>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-surface-container-low/30 p-4 rounded-2xl border border-on-surface/[0.02]">
                   <span className="text-[9px] font-black text-on-surface/30 uppercase tracking-[0.2em] block mb-1">Volumetric</span>
                   <span className="text-sm font-black text-on-surface tracking-tight">{sideProduct.count} Units</span>
                </div>
                <div className="bg-surface-container-low/30 p-4 rounded-2xl border border-on-surface/[0.02]">
                   <span className="text-[9px] font-black text-on-surface/30 uppercase tracking-[0.2em] block mb-1">Sector</span>
                   <span className="text-sm font-black text-on-surface tracking-tight truncate">{sideProduct.location || 'Unset'}</span>
                </div>
              </div>

              <button 
                onClick={() => onEdit(sideProduct)}
                className="mt-auto w-full bg-on-surface/5 border border-on-surface/[0.03] text-on-surface/60 text-[11px] font-black py-4 rounded-2xl uppercase tracking-[0.2em] hover:bg-primary hover:text-white transition-[colors,transform] group/btn flex items-center justify-center gap-2 active:scale-95"
              >
                Optimization Console
                <ChevronRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          )}

          {/* List View — virtualized */}
          <div key="grid-row" className="col-span-12">
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const product = gridProducts[virtualRow.index];
                return (
                  <div
                    key={product.id || product.sku || `product-${virtualRow.index}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingBottom: '24px', // gap-6 equivalent
                    }}
                  >
                    <ProductCard
                      {...product}
                      onEdit={onEdit}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {loading && (
            <div key="loading-status" className="col-span-12 py-32 text-center">
              <div className="inline-flex items-center gap-4 bg-surface-container-lowest px-8 py-4 rounded-full shadow-xl border border-on-surface/[0.03]">
                 <div className="h-6 w-6 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
                 <span className="text-xs font-black uppercase tracking-[0.2em] text-on-surface/40 animate-pulse">Synchronizing Data...</span>
              </div>
            </div>
          )}

          {!loading && filteredProducts.length === 0 && (
            <motion.div 
              key="empty-state"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="col-span-12 py-40 text-center flex flex-col items-center"
            >
              <div className="w-24 h-24 bg-surface-container-low rounded-[2.5rem] flex items-center justify-center text-on-surface/10 mb-8 shadow-inner">
                 <Search size={48} />
              </div>
              <p className="text-lg font-black text-on-surface/40 uppercase tracking-widest">No Matches Found</p>
              <p className="text-xs font-medium text-on-surface/20 mt-2">Try adjusting your filters or search query &quot;{searchQuery}&quot;</p>
              <button 
                onClick={() => {
                   setFilters({ ean: '', internalCode: '', category: '', subcategory: '', brand: '', name: '', location: '' });
                   setSearchQuery('');
                }}
                className="mt-8 text-xs font-black text-primary border-b border-primary/20 hover:border-primary transition-colors pb-1"
              >
                 Reset Search Parameters
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <LabelPrintModal
        isOpen={showLabelModal}
        onClose={() => setShowLabelModal(false)}
        products={products}
      />
      <PlacaPrintModal
        isOpen={showPlacaModal}
        onClose={() => setShowPlacaModal(false)}
        products={products}
      />
      </> /* end produtos tab */}
    </div>
  );
}

'use client';

import { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  RefreshCw, 
  Download, 
  FileUp, 
  Edit2, 
  Package, 
  TrendingUp,
  AlertTriangle,
  LayoutGrid,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
  onEdit: (product: any) => void;
  onViewLink: (mother: any, child: any) => void;
  onStockUpdate: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadTemplate: () => void;
  stockFileInputRef: React.RefObject<HTMLInputElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
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
  onEdit,
  onViewLink,
  onStockUpdate,
  onFileImport,
  onDownloadTemplate,
  stockFileInputRef,
  fileInputRef,
  setShowStockUpdateChoiceModal
}: InventoryManagerProps) {
  const [showFilters, setShowFilters] = useState(false);
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

  return (
    <div className="space-y-8">
      {!isConfigured && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50/50 border border-red-100 p-6 rounded-[2rem] flex items-center gap-6 text-red-900 shadow-sm"
        >
          <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 shadow-inner">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="font-black text-sm uppercase tracking-widest">Supabase connection offline</p>
            <p className="text-xs opacity-60 font-medium">Please configure your environment variables in the settings menu to enable cloud sync.</p>
          </div>
        </motion.div>
      )}
      
      {/* Action Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4 bg-surface-container-low/50 backdrop-blur-xl px-2 py-2 rounded-[2rem] border border-on-surface/[0.03] shadow-sm ring-1 ring-on-surface/[0.02]">
          <div className="flex items-center gap-4 px-6 py-2">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.2em] leading-none mb-1.5">Fleet Size</span>
              <span className="text-2xl font-black text-on-surface leading-none">{products.length}</span>
            </div>
            <div className="h-8 w-[1px] bg-on-surface/[0.05]"></div>
          </div>
          
          <input type="file" ref={stockFileInputRef} onChange={onStockUpdate} accept=".xml,.csv,.xlsx,.xls" className="hidden" />
          <input type="file" ref={fileInputRef} onChange={onFileImport} accept=".xml,.csv,.xlsx,.xls" className="hidden" />
          
          <button 
            onClick={() => setShowStockUpdateChoiceModal(true)}
            disabled={importing}
            className="bg-amber-500/10 text-amber-600 px-6 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all flex items-center gap-2.5 disabled:opacity-50 group active:scale-95"
          >
            <RefreshCw size={14} className={cn("transition-transform", importing ? "animate-spin" : "group-hover:rotate-180")} />
            Refresh Inventory
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={onDownloadTemplate}
            className="h-12 bg-surface-container-low border border-on-surface/[0.03] px-5 rounded-2xl font-black text-[11px] text-on-surface/60 hover:text-on-surface hover:bg-surface-container transition-all flex items-center gap-2.5 shadow-sm uppercase tracking-widest active:scale-95"
          >
            <Download size={14} />
            Template
          </button>
          
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "h-12 px-6 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center gap-2.5 shadow-sm border active:scale-95",
              showFilters 
                ? "bg-primary/10 border-primary/20 text-primary" 
                : "bg-surface-container-low border-on-surface/[0.03] text-on-surface/60 hover:text-on-surface"
            )}
          >
            <Filter size={14} />
            Optimization
          </button>
          
          <button 
            onClick={onAdd}
            className="h-12 bg-surface-container-low border border-on-surface/[0.03] px-6 rounded-2xl font-black text-[11px] text-on-surface/60 hover:text-on-surface hover:bg-surface-container transition-all flex items-center gap-2.5 shadow-sm uppercase tracking-widest active:scale-95"
          >
            <Plus size={16} />
            New Entry
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="h-12 bg-primary text-white px-8 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] hover:bg-on-surface transition-all flex items-center gap-3 shadow-xl shadow-primary/20 disabled:opacity-50 active:scale-95"
          >
            {importing ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
            ) : (
              <>
                <FileUp size={16} />
                Bulk Import
              </>
            )}
          </button>
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
                { label: 'EAN Protocol', key: 'ean', placeholder: '789...' },
                { label: 'Internal ID', key: 'internalCode', placeholder: 'SKU-001...' },
                { label: 'Domain', key: 'category', placeholder: 'Domestic...' },
                { label: 'Cluster', key: 'subcategory', placeholder: 'Kitchen...' },
                { label: 'Signature', key: 'brand', placeholder: 'Lacta...' },
                { label: 'Nomenclature', key: 'name', placeholder: 'Chocolate...' },
                { label: 'Position', key: 'location', placeholder: 'Aisle A...' },
              ].map((field) => (
                <div key={field.key} className="space-y-2.5">
                  <label className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.15em] ml-1">{field.label}</label>
                  <input 
                    type="text" 
                    value={(filters as any)[field.key]}
                    onChange={(e) => setFilters({...filters, [field.key]: e.target.value})}
                    placeholder={field.placeholder}
                    className="w-full h-12 px-5 bg-surface-container-lowest border border-on-surface/[0.02] rounded-2xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/20 outline-none transition-all placeholder:text-on-surface/10"
                  />
                </div>
              ))}
              <div className="col-span-full flex justify-end pt-4 border-t border-on-surface/[0.03]">
                <button 
                  onClick={() => {
                    setFilters({ ean: '', internalCode: '', category: '', subcategory: '', brand: '', name: '', location: '' });
                    setSearchQuery('');
                  }}
                  className="text-[10px] font-black text-primary uppercase tracking-[0.2em] hover:bg-primary/5 px-4 py-2 rounded-full transition-all"
                >
                  Clear All Directives
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid Layout */}
      <div className="grid grid-cols-12 gap-8">
        <AnimatePresence mode="popLayout">
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
                className="absolute top-6 right-6 p-3 bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-on-surface/[0.03] opacity-0 group-hover:opacity-100 transition-all z-10 hover:bg-primary hover:text-white text-on-surface translate-y-2 group-hover:translate-y-0"
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
                className="mt-auto w-full bg-on-surface/5 border border-on-surface/[0.03] text-on-surface/60 text-[11px] font-black py-4 rounded-2xl uppercase tracking-[0.2em] hover:bg-primary hover:text-white transition-all group/btn flex items-center justify-center gap-2"
              >
                Optimization Console
                <ChevronRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          )}

          {/* List View */}
          <div key="grid-row" className="col-span-12 flex flex-col gap-6">
            {gridProducts.map((product, index) => (
              <ProductCard 
                key={product.id || product.sku || `product-${index}`} 
                {...product} 
                onEdit={onEdit}
                onViewLink={onViewLink}
              />
            ))}
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
                className="mt-8 text-xs font-black text-primary border-b border-primary/20 hover:border-primary transition-all pb-1"
              >
                 Reset Search Parameters
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

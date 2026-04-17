'use client';

import { useState, useEffect, useMemo } from 'react';
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
  ImageOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getDirectImageUrl } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';

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
  supplier_description: string;
  internal_product_id: string;
  products?: {
    name: string;
    sku: string;
    ean: string;
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
  const [selectedSupplierMappingProduct, setSelectedSupplierMappingProduct] = useState<Product | null>(null);
  const [supplierMappingSearchQuery, setSupplierMappingSearchQuery] = useState('');
  const [supplierMappingSearchResults, setSupplierMappingSearchResults] = useState<Product[]>([]);
  const [isAddingMapping, setIsAddingMapping] = useState(false);
  
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);

  // Fetch initial data
  useEffect(() => {
    if (isOpen) {
      fetchSuppliers();
    }
  }, [isOpen]);

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

  const handleAddSupplier = async () => {
    if (!newSupplierName.trim()) return;
    setIsAddingSupplier(true);
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert([{ name: newSupplierName.trim() }])
        .select();
      if (error) throw error;
      setSupplierNames(prev => [...prev, ...(data || [])].sort((a,b) => a.name.localeCompare(b.name)));
      setSelectedSupplierId(data?.[0]?.id || '');
      setNewSupplierName('');
      setShowAddSupplierModal(false);
      setNotification({ type: 'success', message: 'Fornecedor adicionado com sucesso!' });
    } catch (err: any) {
      setNotification({ type: 'error', message: `Erro ao adicionar fornecedor: ${err.message}` });
    } finally {
      setIsAddingSupplier(false);
    }
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
      const { error } = await supabase
        .from('supplier_mappings')
        .insert([{
          supplier_id: selectedSupplierId,
          supplier_description: supplierMappingDescription.trim(),
          internal_product_id: selectedSupplierMappingProduct.id
        }]);
      if (error) throw error;
      
      setNotification({ type: 'success', message: 'Mapeamento adicionado com sucesso!' });
      setSupplierMappingDescription('');
      setSelectedSupplierMappingProduct(null);
      fetchSupplierMappings(selectedSupplierId);
    } catch (err) {
      setNotification({ type: 'error', message: 'Erro ao adicionar mapeamento.' });
    } finally {
      setIsAddingMapping(false);
    }
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

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-on-surface/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-lowest rounded-[2.5rem] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-on-surface/5"
            >
              <div className="p-8 border-b border-on-surface/[0.03] flex items-center justify-between shrink-0 bg-surface-container-low/30">
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500 flex items-center justify-center text-white shadow-xl shadow-amber-500/20">
                    <BookText size={28} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-on-surface tracking-tight">Dicionário de Fornecedores</h3>
                    <p className="text-sm text-on-surface/40 font-medium">Link supplier descriptions to your internal product identifiers</p>
                  </div>
                </div>
                <button 
                  onClick={onClose}
                  className="p-3 hover:bg-on-surface/5 rounded-full transition-colors text-on-surface/20 hover:text-on-surface"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-on-surface/[0.03]">
                {/* Form Panel */}
                <div className="w-full md:w-1/2 p-10 overflow-y-auto space-y-10 custom-scrollbar">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.2em]">Select Supplier</label>
                      <button 
                        onClick={() => setShowAddSupplierModal(true)}
                        className="text-[10px] font-black text-primary flex items-center gap-2 hover:bg-primary/5 px-3 py-1.5 rounded-full transition-all"
                      >
                        <Plus size={14} />
                        New Partner
                      </button>
                    </div>
                    <div className="relative group">
                      <select 
                        value={selectedSupplierId}
                        onChange={(e) => {
                          setSelectedSupplierId(e.target.value);
                          fetchSupplierMappings(e.target.value);
                        }}
                        className="w-full bg-surface-container-low border border-on-surface/[0.03] rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 appearance-none font-bold text-on-surface transition-all shadow-sm"
                      >
                        <option value="">Select a supplier protocol...</option>
                        {supplierNames.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={20} className="absolute right-5 top-1/2 -translate-y-1/2 text-on-surface/20 pointer-events-none group-focus-within:text-primary transition-colors" />
                    </div>
                  </div>

                  {selectedSupplierId && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-8 pt-8 border-t border-on-surface/[0.03]"
                    >
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.2em]">Supplier Description (Invoice text)</label>
                        <input 
                          type="text" 
                          value={supplierMappingDescription}
                          onChange={(e) => setSupplierMappingDescription(e.target.value)}
                          placeholder="e.g. CHOCOLATE OURO BRANCO LACTA 1KG..."
                          className="w-full bg-surface-container-low border border-on-surface/[0.03] rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 font-medium placeholder:text-on-surface/20 transition-all shadow-sm"
                        />
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.2em]">Internal Correspondence</label>
                        {!selectedSupplierMappingProduct ? (
                          <div className="space-y-4">
                            <div className="relative group">
                              <input 
                                type="text" 
                                value={supplierMappingSearchQuery}
                                onChange={(e) => setSupplierMappingSearchQuery(e.target.value)}
                                onKeyUp={(e) => e.key === 'Enter' && handleSupplierMappingSearch()}
                                placeholder="Universal product search..."
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
                              <p className="text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">IDENTIFIER: {selectedSupplierMappingProduct.ean || selectedSupplierMappingProduct.sku}</p>
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
                            Commit Protocol
                          </>
                        )}
                      </button>
                    </motion.div>
                  )}
                </div>

                {/* List Panel */}
                <div className="w-full md:w-1/2 bg-surface-container-low/30 flex flex-col overflow-hidden">
                  <div className="p-10 border-b border-on-surface/[0.03] flex items-center justify-between bg-surface-container-lowest shrink-0">
                    <h4 className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.3em] flex items-center gap-4">
                       Active Dictionary
                       {selectedSupplierId && supplierMappings.length > 0 && (
                         <span className="bg-primary text-white px-3 py-1 rounded-full text-[10px] font-black shadow-md shadow-primary/20">{supplierMappings.length}</span>
                       )}
                    </h4>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar">
                    {!selectedSupplierId ? (
                      <div className="h-full flex flex-col items-center justify-center text-on-surface/10">
                        <Users size={64} className="mb-6 opacity-20" />
                        <p className="text-sm font-black uppercase tracking-widest text-on-surface/20">Select Partner Entity</p>
                        <p className="text-xs font-medium text-on-surface/10 mt-2">Filter to view mapped identifiers</p>
                      </div>
                    ) : supplierMappings.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-on-surface/10">
                        <BookText size={64} className="mb-6 opacity-20" />
                        <p className="text-sm font-black uppercase tracking-widest text-on-surface/20">Empty Protocol</p>
                        <p className="text-xs font-medium text-on-surface/10 mt-2 text-center">Use the orchestration panel to link mappings</p>
                      </div>
                    ) : (
                      supplierMappings.map(mapping => (
                        <div key={mapping.id} className="bg-surface-container-lowest p-6 rounded-[2rem] border border-on-surface/[0.03] shadow-sm space-y-4 group hover:border-primary/30 transition-all relative">
                          <div>
                            <p className="text-[10px] font-black text-on-surface/20 uppercase tracking-[0.2em] mb-2">Partner Input:</p>
                            <p className="text-base font-black text-on-surface leading-tight">{mapping.supplier_description}</p>
                          </div>
                          <div className="flex items-center gap-4 pt-4 border-t border-on-surface/[0.03]">
                            <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                              <ArrowRight size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                               <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">Internal Reference:</p>
                               <p className="text-sm font-black text-on-surface/70 truncate">{mapping.products?.name || 'Protocol Orphaned'}</p>
                            </div>
                            <button 
                              onClick={() => handleDeleteMapping(mapping.id)}
                              className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white shadow-lg"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Supplier Modal */}
      <AnimatePresence>
        {showAddSupplierModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddSupplierModal(false)}
              className="absolute inset-0 bg-on-surface/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-surface-container-lowest rounded-[2rem] p-10 max-w-md w-full shadow-3xl ring-1 ring-on-surface/5"
            >
              <div className="flex items-center gap-6 mb-8">
                <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/20">
                  <Plus size={28} />
                </div>
                <div>
                  <h4 className="text-xl font-black text-on-surface tracking-tight">New Partner Entity</h4>
                  <p className="text-xs text-on-surface/40 font-medium">Initialize a new supplier stream</p>
                </div>
              </div>

              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-on-surface/30 uppercase tracking-[0.2em]">Entity Identity Name</label>
                  <input 
                    type="text" 
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    onKeyUp={(e) => e.key === 'Enter' && handleAddSupplier()}
                    placeholder="e.g. MONDELEZ INTERNATIONAL BRAZIL"
                    className="w-full bg-surface-container-low border border-on-surface/[0.03] rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 font-bold transition-all shadow-sm"
                    autoFocus
                  />
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowAddSupplierModal(false)}
                    className="flex-1 px-6 py-4 rounded-2xl font-black text-on-surface/40 hover:bg-on-surface/5 transition-all text-sm uppercase tracking-widest"
                  >
                    Discard
                  </button>
                  <button 
                    onClick={handleAddSupplier}
                    disabled={isAddingSupplier || !newSupplierName.trim()}
                    className="flex-[2] bg-primary text-white font-black py-4 rounded-2xl hover:bg-on-surface transition-all flex items-center justify-center gap-3 shadow-xl shadow-primary/20 disabled:opacity-30 uppercase tracking-[0.2em] text-sm"
                  >
                    {isAddingSupplier ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-4 border-solid border-white border-r-transparent" />
                    ) : (
                      'Auth & Save'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

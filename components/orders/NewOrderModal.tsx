'use client';

import {
  X,
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  ShoppingCart,
  SendHorizonal,
  UserPlus,
  ArrowRight,
  Package,
  AlertCircle,
  Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';
import { BarcodeScanner } from '@/components/BarcodeScanner';

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

interface OrderItem {
  id: string;
  product_id: string;
  name: string;
  sku: string;
  ean: string;
  quantity: number;
  supplier_sku?: string;
  supplier_description?: string;
  image?: string;
}

interface NewOrderModalProps {
  onClose: () => void;
  setNotification: (notif: { type: 'success' | 'error', message: string } | null) => void;
}

export function NewOrderModal({ onClose, setNotification }: NewOrderModalProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState({ sku: '', ean: '', description: '' });
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState<number>(1);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showConfirmFinalize, setShowConfirmFinalize] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const { data, error } = await supabase.from('suppliers').select('*').order('name');
      if (error) throw error;
      setSuppliers(data || []);
    } catch (err) {
      console.error('Erro ao buscar fornecedores:', err);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.sku && !searchQuery.ean && !searchQuery.description) {
      setSearchResults([]);
      return;
    }

    let query = supabase.from('products').select('*');

    if (searchQuery.sku) query = query.ilike('sku', `%${searchQuery.sku}%`);
    if (searchQuery.ean) query = query.ilike('ean', `%${searchQuery.ean}%`);
    if (searchQuery.description) query = query.ilike('name', `%${searchQuery.description}%`);

    const { data, error } = await query.limit(5);
    if (error) {
      console.error('Erro na busca:', error);
      return;
    }
    setSearchResults(data || []);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleAddItem = async (product: Product) => {
    if (quantity <= 0) return;

    let supplierSku = '';
    let supplierDescription = '';

    if (selectedSupplierId) {
      const { data: mapping } = await supabase
        .from('supplier_mappings')
        .select('*')
        .eq('supplier_id', selectedSupplierId)
        .eq('internal_product_id', product.id)
        .single();

      if (mapping) {
        supplierSku = mapping.supplier_sku || '';
        supplierDescription = mapping.supplier_description || '';
      }
    }

    const newItem: OrderItem = {
      id: Math.random().toString(36).substr(2, 9),
      product_id: product.id,
      name: product.name,
      sku: product.sku,
      ean: product.ean,
      quantity,
      supplier_sku: supplierSku,
      supplier_description: supplierDescription,
      image: product.image
    };

    setOrderItems(prev => [...prev, newItem]);
    setSearchQuery({ sku: '', ean: '', description: '' });
    setSearchResults([]);
    setQuantity(1);
    setNotification({ type: 'success', message: 'Item adicionado ao pedido!' });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleRemoveItem = (id: string) => {
    setOrderItems(prev => prev.filter(item => item.id !== id));
  };

  const sendForApproval = async () => {
    try {
      setLoading(true);

      const { data: order, error: orderError } = await supabase
        .from('purchase_orders')
        .insert([{
          supplier_id: selectedSupplierId || null,
          status: 'pending_approval',
          total_items: orderItems.reduce((acc, curr) => acc + curr.quantity, 0)
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      const itemsToInsert = orderItems.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        supplier_sku: item.supplier_sku,
        supplier_description: item.supplier_description
      }));

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      setNotification({ type: 'success', message: 'Pedido enviado para aprovação com sucesso!' });
      onClose();
    } catch (err: any) {
      console.error('Erro ao enviar pedido:', err);
      setNotification({ type: 'error', message: err.message || 'Erro ao salvar pedido.' });
    } finally {
      setLoading(false);
      setShowConfirmFinalize(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setShowConfirmCancel(true)}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
              <ShoppingCart size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Novo Pedido de Compra</h3>
              <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">Criação de lista e envio para aprovação</p>
            </div>
          </div>
          <button
            onClick={() => setShowConfirmCancel(true)}
            className="p-3 hover:bg-slate-200 rounded-full transition-all text-slate-400 hover:text-slate-600"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex divide-x divide-slate-100">
          {/* Left Panel */}
          <div className="w-2/5 p-8 overflow-y-auto space-y-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <UserPlus size={14} /> Selecionar Fornecedor
              </label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
              >
                <option value="">Não atribuir fornecedor (Avulso)</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-6">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Package size={14} /> Localizar Produto
                </label>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">SKU</label>
                        <input
                            type="text"
                            value={searchQuery.sku}
                            onChange={(e) => setSearchQuery({...searchQuery, sku: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold"
                            placeholder="Ex: SKU-001"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">EAN</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={searchQuery.ean}
                                onChange={(e) => setSearchQuery({...searchQuery, ean: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pr-12 text-xs font-bold"
                                placeholder="789..."
                            />
                            <button
                                onClick={() => setIsScannerOpen(true)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all group/cam"
                                title="Escanear Código"
                                type="button"
                            >
                                <Camera size={16} className="group-hover/cam:scale-110 transition-transform" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Descrição / Nome</label>
                    <input
                        type="text"
                        value={searchQuery.description}
                        onChange={(e) => setSearchQuery({...searchQuery, description: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold"
                        placeholder="Nome do produto..."
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Quantidade</label>
                    <div className="flex gap-2">
                        <input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-center"
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-100">
                {searchResults.map(p => (
                    <button
                        key={p.id}
                        onClick={() => handleAddItem(p)}
                        className="w-full p-4 rounded-2xl border border-slate-100 hover:border-primary/30 hover:bg-primary/5 transition-all flex items-center gap-4 text-left group"
                    >
                        <div className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden shrink-0 border border-slate-100">
                            {p.image ? (
                                <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                    <Package size={20} />
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-slate-900 truncate group-hover:text-primary transition-colors uppercase">{p.name}</p>
                            <p className="text-[10px] font-bold text-slate-400">SKU: {p.sku} | EAN: {p.ean}</p>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all">
                            <Plus size={16} />
                        </div>
                    </button>
                ))}
                {searchResults.length === 0 && (searchQuery.sku || searchQuery.ean || searchQuery.description) && (
                    <div className="py-8 text-center text-slate-400 italic text-xs">Nenhum produto encontrado</div>
                )}
            </div>
          </div>

          {/* Right Panel */}
          <div className="flex-1 bg-slate-50/30 p-8 flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">Itens no Pedido ({orderItems.length})</h4>
              {orderItems.length > 0 && (
                <button
                  onClick={() => setOrderItems([])}
                  className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline"
                >
                  Limpar lista
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px] pr-2">
              {orderItems.length > 0 ? (
                orderItems.map((item) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={item.id}
                    className="bg-white p-4 rounded-[1.5rem] border border-slate-200/60 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all"
                  >
                    <div className="w-14 h-14 bg-slate-50 rounded-xl overflow-hidden shrink-0 border border-slate-100">
                        {item.image ? (
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300 font-black text-[10px]">T1</div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-slate-900 uppercase truncate">{item.name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">SKU Int: {item.sku}</span>
                        {item.supplier_sku && <span className="text-[9px] font-black text-primary uppercase tracking-tighter">SKU Fornec: {item.supplier_sku}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center">
                            <span className="text-[8px] font-black text-slate-400 uppercase mb-0.5">Qtd</span>
                            <span className="text-sm font-black text-slate-900">{item.quantity}</span>
                        </div>
                        <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 py-20 px-10 text-center">
                  <ShoppingCart size={64} strokeWidth={1} className="mb-6 opacity-20" />
                  <p className="text-sm font-black uppercase tracking-widest mb-2">Sua lista está vazia</p>
                  <p className="text-xs font-medium max-w-[200px]">Utilize os campos à esquerda para localizar e adicionar produtos ao pedido.</p>
                </div>
              )}
            </div>

            <div className="pt-8 mt-8 border-t border-slate-200">
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setShowConfirmCancel(true)}
                  className="bg-slate-100 text-slate-600 font-black py-4 rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                >
                  <X size={18} />
                  Cancelar
                </button>
                <button
                  disabled={orderItems.length === 0 || loading}
                  onClick={() => setShowConfirmFinalize(true)}
                  className="bg-primary text-white font-black py-4 rounded-2xl hover:opacity-90 transition-all uppercase tracking-widest text-xs shadow-xl shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-30 disabled:shadow-none"
                >
                  {loading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
                  ) : (
                    <>
                      <SendHorizonal size={18} />
                      Enviar para Aprovação
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Confirmation Modals */}
      <AnimatePresence>
        {showConfirmCancel && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h4 className="text-xl font-black text-slate-900 mb-2 uppercase">Deseja Cancelar?</h4>
              <p className="text-sm text-slate-500 font-medium mb-8">Todos os itens adicionados serão perdidos. Esta ação não pode ser desfeita.</p>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setShowConfirmCancel(false)} className="py-3 font-bold text-slate-400 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors uppercase text-xs">Voltar</button>
                <button onClick={onClose} className="py-3 font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors uppercase text-xs">Sim, Cancelar</button>
              </div>
            </motion.div>
          </div>
        )}

        {showConfirmFinalize && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
                <SendHorizonal size={32} />
              </div>
              <h4 className="text-xl font-black text-slate-900 mb-2 uppercase">Enviar para Aprovação?</h4>
              <p className="text-sm text-slate-500 font-medium mb-8">O pedido será salvo e ficará disponível na seção de aprovações, onde você poderá baixar o Excel e PDF.</p>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setShowConfirmFinalize(false)} className="py-3 font-bold text-slate-400 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors uppercase text-xs">Voltar</button>
                <button onClick={sendForApproval} className="py-3 font-bold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors uppercase text-xs shadow-lg shadow-primary/20">Confirmar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isScannerOpen && (
          <BarcodeScanner
            isOpen={isScannerOpen}
            onClose={() => setIsScannerOpen(false)}
            onScan={(code) => {
              setSearchQuery(prev => ({ ...prev, ean: code }));
              setNotification({ type: 'success', message: 'Código escaneado com sucesso!' });
              setTimeout(() => setNotification(null), 3000);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

'use client';

import { 
  ShoppingCart, 
  Plus, 
  Search, 
  FileText, 
  Download, 
  Trash2, 
  CheckCircle2, 
  X,
  History,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { NewOrderModal } from './NewOrderModal';

interface PurchaseOrder {
  id: string;
  supplier_id: string | null;
  status: string;
  total_items: number;
  created_at: string;
  suppliers?: {
    name: string;
  };
}

export function PurchaseOrderManager() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*, suppliers(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      console.error('Erro ao buscar pedidos de compra:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black text-on-surface tracking-tighter">Pedidos de Compra</h1>
        <p className="text-sm text-on-surface/40 font-medium uppercase tracking-[0.2em]">Procurement Orchestration & Supplier Liaison</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* New Order Card */}
        <motion.div
          whileHover={{ y: -5 }}
          className="bg-surface-container-lowest p-10 rounded-[3rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] flex flex-col items-center text-center group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-primary transform -translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
          <div className="w-24 h-24 rounded-[2rem] bg-primary/5 text-primary flex items-center justify-center mb-8 group-hover:bg-primary group-hover:text-white transition-all transform group-hover:rotate-6 shadow-inner">
            <ShoppingCart size={48} />
          </div>
          <h3 className="text-2xl font-black text-on-surface mb-3 tracking-tight">Novo Pedido</h3>
          <p className="text-sm text-on-surface/40 mb-10 max-w-[240px] leading-relaxed">Crie uma nova lista de compra com busca inteligente de produtos e mapeamento de fornecedor.</p>
          <button 
            onClick={() => setShowNewOrderModal(true)}
            className="bg-primary text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-on-surface transition-all shadow-xl shadow-primary/20 flex items-center gap-3 w-full justify-center uppercase tracking-widest active:scale-95"
          >
            <Plus size={20} />
            Iniciar Pedido
          </button>
        </motion.div>

        {/* Info Card */}
        <div className="bg-surface-container-low/30 backdrop-blur-md rounded-[3rem] p-10 border border-on-surface/[0.03] flex flex-col justify-center">
            <div className="flex items-center gap-4 mb-6 text-primary">
                <History size={32} />
                <h4 className="text-xl font-black uppercase tracking-tight">Histórico de Pedidos</h4>
            </div>
            <p className="text-on-surface/60 text-sm leading-relaxed mb-6">
                Todos os seus pedidos finalizados e cancelados ficam registrados para consulta posterior. Você pode baixar as planilhas e PDFs a qualquer momento do histórico.
            </p>
            <div className="flex items-center gap-2 text-xs font-bold text-on-surface/40 uppercase tracking-widest">
                <CheckCircle2 size={16} className="text-primary" />
                <span>Interface de Mapeamento Ativa</span>
            </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-6">
        <h3 className="text-xl font-black text-on-surface tracking-tight uppercase tracking-widest flex items-center gap-3">
            <FileText size={20} className="text-primary" />
            Últimos Pedidos
        </h3>

        <div className="bg-surface-container-lowest/50 backdrop-blur-xl rounded-[2.5rem] border border-on-surface/[0.03] overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-on-surface/[0.05]">
                <th className="px-8 py-6 text-[10px] font-black text-on-surface/40 uppercase tracking-widest">Data</th>
                <th className="px-8 py-6 text-[10px] font-black text-on-surface/40 uppercase tracking-widest">Fornecedor</th>
                <th className="px-8 py-6 text-[10px] font-black text-on-surface/40 uppercase tracking-widest">Itens</th>
                <th className="px-8 py-6 text-[10px] font-black text-on-surface/40 uppercase tracking-widest">Status</th>
                <th className="px-8 py-6 text-[10px] font-black text-on-surface/40 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-on-surface/[0.03]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center text-on-surface/40 font-bold uppercase tracking-widest text-xs">Carregando pedidos...</td>
                </tr>
              ) : orders.length > 0 ? (
                orders.map((order) => (
                  <tr key={order.id} className="group hover:bg-on-surface/[0.01] transition-colors">
                    <td className="px-8 py-6 text-sm font-bold text-on-surface">
                        {new Date(order.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-8 py-6 text-sm font-bold text-on-surface/60">
                        {order.suppliers?.name || 'Sem Fornecedor'}
                    </td>
                    <td className="px-8 py-6">
                        <span className="px-3 py-1 rounded-full bg-primary/5 text-primary text-[10px] font-black uppercase">
                            {order.total_items} produtos
                        </span>
                    </td>
                    <td className="px-8 py-6">
                        <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase",
                            order.status === 'finalized' ? "bg-green-500/10 text-green-600" : 
                            order.status === 'canceled' ? "bg-red-500/10 text-red-600" : 
                            "bg-amber-500/10 text-amber-600"
                        )}>
                            {order.status === 'finalized' ? 'Finalizado' : order.status === 'canceled' ? 'Cancelado' : 'Rascunho'}
                        </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button className="p-2.5 rounded-xl bg-on-surface/[0.03] text-on-surface/60 hover:bg-primary hover:text-white transition-all shadow-sm">
                                <Download size={16} />
                            </button>
                        </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-4 text-on-surface/20">
                          <ShoppingCart size={64} strokeWidth={1} />
                          <p className="text-sm font-black uppercase tracking-widest">Nenhum pedido encontrado</p>
                      </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showNewOrderModal && (
          <NewOrderModal 
            onClose={() => {
              setShowNewOrderModal(false);
              fetchOrders();
            }}
            setNotification={setNotification}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-8 right-8 z-[200] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 font-bold",
              notification.type === 'success' ? "bg-green-600 text-white" : "bg-red-600 text-white"
            )}
          >
            {notification.type === 'success' ? <CheckCircle2 size={20} /> : <X size={20} />}
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

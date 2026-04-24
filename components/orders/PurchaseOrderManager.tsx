'use client';

import {
  ShoppingCart,
  Plus,
  FileText,
  Download,
  CheckCircle2,
  X,
  ClipboardList,
  SendHorizonal,
  FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { NewOrderModal } from './NewOrderModal';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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

  const downloadOrderExcel = async (order: PurchaseOrder) => {
    try {
      setDownloadingId(order.id);
      const { data: items, error } = await supabase
        .from('purchase_order_items')
        .select('*, products(name, ean, sku)')
        .eq('order_id', order.id);

      if (error) throw error;
      if (!items?.length) return;

      const hasSupplierId = !!order.supplier_id;
      const data = items.map((item: any) => {
        const row: any = {
          'Código EAN': item.products?.ean || '-',
          'Descrição': item.products?.name || '-',
          'Quantidade': item.quantity
        };
        if (hasSupplierId) {
          row['SKU (Fornecedor)'] = item.supplier_sku || '-';
          row['Descrição do Fornecedor'] = item.supplier_description || '-';
        }
        return row;
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Pedido de Compra');
      XLSX.writeFile(wb, `Pedido_Compra_${order.created_at.split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Erro ao gerar Excel:', err);
      setNotification({ type: 'error', message: 'Erro ao gerar arquivo Excel.' });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadOrderPDF = async (order: PurchaseOrder) => {
    try {
      setDownloadingId(order.id);
      const { data: items, error } = await supabase
        .from('purchase_order_items')
        .select('*, products(name, ean, sku)')
        .eq('order_id', order.id);

      if (error) throw error;
      if (!items?.length) return;

      const hasSupplierId = !!order.supplier_id;
      const supplierName = order.suppliers?.name || 'Sem Fornecedor';

      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text('Pedido de Compra', 14, 22);
      doc.setFontSize(10);
      doc.text(`Fornecedor: ${supplierName}`, 14, 30);
      doc.text(`Data: ${new Date(order.created_at).toLocaleDateString('pt-BR')}`, 14, 35);

      const headers = ['EAN', 'Descrição', 'Qtd'];
      if (hasSupplierId) headers.push('SKU Fornec.', 'Ref Fornec.');

      const tableData = items.map((item: any) => {
        const row: any[] = [
          item.products?.ean || '-',
          item.products?.name || '-',
          item.quantity
        ];
        if (hasSupplierId) row.push(item.supplier_sku || '-', item.supplier_description || '-');
        return row;
      });

      autoTable(doc, {
        startY: 45,
        head: [headers],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255] },
        styles: { fontSize: 8 }
      });

      doc.save(`Pedido_Compra_${order.created_at.split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      setNotification({ type: 'error', message: 'Erro ao gerar arquivo PDF.' });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setDownloadingId(null);
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'pending_approval': return 'Aguardando Aprovação';
      case 'finalized': return 'Finalizado';
      case 'canceled': return 'Cancelado';
      default: return 'Rascunho';
    }
  };

  const statusClass = (status: string) => {
    switch (status) {
      case 'pending_approval': return 'bg-amber-500/10 text-amber-600';
      case 'finalized': return 'bg-green-500/10 text-green-600';
      case 'canceled': return 'bg-red-500/10 text-red-600';
      default: return 'bg-slate-500/10 text-slate-500';
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
            <SendHorizonal size={32} />
            <h4 className="text-xl font-black uppercase tracking-tight">Aprovações e Downloads</h4>
          </div>
          <p className="text-on-surface/60 text-sm leading-relaxed mb-6">
            Pedidos enviados para aprovação ficam registrados abaixo. Baixe o Excel ou PDF de cada pedido individualmente a qualquer momento.
          </p>
          <div className="flex items-center gap-2 text-xs font-bold text-on-surface/40 uppercase tracking-widest">
            <CheckCircle2 size={16} className="text-primary" />
            <span>Downloads disponíveis por pedido</span>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-black text-on-surface uppercase tracking-[0.1em] flex items-center gap-3">
            <ClipboardList size={20} className="text-primary" />
            Últimos Pedidos para Aprovação e Downloads
          </h3>
          {orders.length > 0 && (
            <span className="px-2.5 py-0.5 bg-primary/10 text-primary text-xs font-black rounded-full">
              {orders.length}
            </span>
          )}
        </div>

        {orders.length === 0 && !loading ? (
          <div className="bg-surface-container-low/50 backdrop-blur-md rounded-[2.5rem] p-10 border border-on-surface/[0.03] flex items-center gap-8 shadow-sm">
            <div className="w-16 h-16 bg-on-surface/5 text-on-surface/20 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
              <ShoppingCart size={32} />
            </div>
            <div>
              <h4 className="text-lg font-black text-on-surface leading-tight tracking-tight uppercase tracking-[0.1em]">Sem Pedidos</h4>
              <p className="text-sm text-on-surface/40 font-medium mt-1 leading-relaxed">Pedidos enviados para aprovação aparecerão aqui para download e consulta.</p>
            </div>
          </div>
        ) : (
          <div className="bg-surface-container-lowest/50 backdrop-blur-xl rounded-[2.5rem] border border-on-surface/[0.03] overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-on-surface/[0.05]">
                  <th className="px-8 py-6 text-[10px] font-black text-on-surface/40 uppercase tracking-widest">Data</th>
                  <th className="px-8 py-6 text-[10px] font-black text-on-surface/40 uppercase tracking-widest">Fornecedor</th>
                  <th className="px-8 py-6 text-[10px] font-black text-on-surface/40 uppercase tracking-widest">Itens</th>
                  <th className="px-8 py-6 text-[10px] font-black text-on-surface/40 uppercase tracking-widest">Status</th>
                  <th className="px-8 py-6 text-[10px] font-black text-on-surface/40 uppercase tracking-widest text-right">Downloads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-on-surface/[0.03]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-12 text-center text-on-surface/40 font-bold uppercase tracking-widest text-xs">Carregando pedidos...</td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="hover:bg-on-surface/[0.01] transition-colors">
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
                        <span className={cn('px-3 py-1 rounded-full text-[10px] font-black uppercase', statusClass(order.status))}>
                          {statusLabel(order.status)}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => downloadOrderExcel(order)}
                            disabled={downloadingId === order.id}
                            title="Baixar Excel"
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-[10px] font-black hover:bg-emerald-100 transition-colors border border-emerald-100 disabled:opacity-50"
                          >
                            <FileSpreadsheet size={14} />
                            Excel
                          </button>
                          <button
                            onClick={() => downloadOrderPDF(order)}
                            disabled={downloadingId === order.id}
                            title="Baixar PDF"
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-700 text-[10px] font-black hover:bg-red-100 transition-colors border border-red-100 disabled:opacity-50"
                          >
                            <FileText size={14} />
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
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
              'fixed bottom-8 right-8 z-[200] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 font-bold',
              notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
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

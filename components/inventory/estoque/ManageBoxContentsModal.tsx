'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Edit2, X, Search, Plus, Minus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { type StorageBox } from './AddEditBoxModal';

export type BoxContent = {
  id: string;
  boxId: string;
  productId: string;
  quantity: number;
  product?: any;
};

interface ManageBoxContentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  box: StorageBox | null;
  allProducts: any[];
}

export function ManageBoxContentsModal({ isOpen, onClose, onSaved, box, allProducts }: ManageBoxContentsModalProps) {
  const [contents, setContents] = useState<BoxContent[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchContents = async () => {
    if (!box) return;
    setLoading(true);
    const { data } = await supabase
      .from('box_contents')
      .select('*')
      .eq('box_id', box.id);
    setContents((data ?? []).map((r: any) => ({
      id: r.id, boxId: r.box_id, productId: r.product_id, quantity: r.quantity,
      product: allProducts.find(p => p.id === r.product_id),
    })));
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen && box) { fetchContents(); setSearch(''); }
  }, [isOpen, box]);

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allProducts
      .filter(p =>
        (p.name?.toLowerCase().includes(q) || p.ean?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)) &&
        !contents.find(c => c.productId === p.id)
      )
      .slice(0, 8);
  }, [search, allProducts, contents]);

  const addProduct = async (product: any) => {
    if (!box) return;
    setSaving(true);
    try {
      const { data } = await supabase
        .from('box_contents')
        .insert([{ box_id: box.id, product_id: product.id, quantity: 1 }])
        .select()
        .single();
      if (data) {
        setContents(prev => [...prev, { id: data.id, boxId: data.box_id, productId: data.product_id, quantity: data.quantity, product }]);
      }
      setSearch('');
    } finally {
      setSaving(false);
    }
  };

  const updateQty = async (contentId: string, delta: number) => {
    const item = contents.find(c => c.id === contentId);
    if (!item) return;
    const newQty = Math.max(1, item.quantity + delta);
    await supabase.from('box_contents').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', contentId);
    setContents(prev => prev.map(c => c.id === contentId ? { ...c, quantity: newQty } : c));
  };

  const removeContent = async (contentId: string) => {
    await supabase.from('box_contents').delete().eq('id', contentId);
    setContents(prev => prev.filter(c => c.id !== contentId));
  };

  const handleClose = () => { onSaved(); onClose(); };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-md bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-3xl overflow-hidden shadow-2xl border border-on-surface/[0.06] flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="bg-[#FFE500] border-b border-[#D4C000] px-5 py-4 flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-black/[0.09] flex items-center justify-center shrink-0">
                <Edit2 size={15} strokeWidth={2.5} color="#1A1A0E" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#1A1A0E]/50 mb-0.5">Conteúdo</p>
                <p className="text-base font-black text-[#1A1A0E] truncate font-mono">{box?.code}</p>
              </div>
              <button onClick={handleClose} className="w-7 h-7 rounded-[9px] bg-black/[0.08] border border-black/[0.10] flex items-center justify-center text-[#1A1A0E]/40 hover:bg-red-500/10 hover:text-red-600 transition-colors shrink-0">
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>

            {/* Search to add */}
            <div className="px-5 pt-4 pb-2 shrink-0">
              <div className="flex items-center gap-2 rounded-xl border border-on-surface/[0.12] focus-within:border-[#D4C000] px-3.5 py-2.5 bg-white dark:bg-[#252520] transition-colors">
                <Search size={14} strokeWidth={2} className="text-on-surface/35 shrink-0" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar produto para adicionar…"
                  className="flex-1 bg-transparent text-sm font-medium text-on-surface outline-none placeholder:text-on-surface/30"
                />
              </div>
              {/* Dropdown results */}
              <AnimatePresence>
                {filteredProducts.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="mt-1 rounded-xl border border-on-surface/[0.08] bg-white dark:bg-[#2E2E28] shadow-xl overflow-hidden"
                  >
                    {filteredProducts.map(p => (
                      <button
                        key={p.id}
                        onClick={() => addProduct(p)}
                        disabled={saving}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-on-surface/[0.04] transition-colors text-left"
                      >
                        <div className="w-7 h-7 rounded-lg bg-on-surface/[0.06] flex items-center justify-center shrink-0 overflow-hidden">
                          {p.image
                            ? <img src={p.image} alt="" className="w-full h-full object-cover" />
                            : <span className="text-sm">📦</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-on-surface truncate">{p.name}</p>
                          <p className="text-[10px] text-on-surface/40 font-mono">{p.ean || p.sku || '—'}</p>
                        </div>
                        <Plus size={13} className="text-on-surface/30 shrink-0" />
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Contents list */}
            <div className="flex-1 overflow-y-auto px-5 pb-3 flex flex-col gap-2">
              {loading ? (
                <p className="text-sm text-on-surface/40 text-center py-6">Carregando…</p>
              ) : contents.length === 0 ? (
                <p className="text-sm text-on-surface/35 text-center py-6">Nenhum produto nesta caixa ainda.</p>
              ) : (
                contents.map(c => (
                  <div key={c.id} className="flex items-center gap-3 bg-white dark:bg-[#252520] rounded-xl border border-on-surface/[0.07] px-3.5 py-2.5">
                    <div className="w-8 h-8 rounded-lg bg-on-surface/[0.06] flex items-center justify-center shrink-0 overflow-hidden">
                      {c.product?.image
                        ? <img src={c.product.image} alt="" className="w-full h-full object-cover" />
                        : <span className="text-sm">📦</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-on-surface truncate">{c.product?.name ?? c.productId}</p>
                      <p className="text-[10px] text-on-surface/40 font-mono">{c.product?.ean || c.product?.sku || '—'}</p>
                    </div>
                    {/* Qty controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => updateQty(c.id, -1)} className="w-6 h-6 rounded-lg bg-on-surface/[0.06] hover:bg-on-surface/[0.12] flex items-center justify-center transition-colors">
                        <Minus size={11} strokeWidth={2.5} className="text-on-surface/60" />
                      </button>
                      <span className="font-mono text-sm font-black text-on-surface w-8 text-center">{c.quantity}</span>
                      <button onClick={() => updateQty(c.id, 1)} className="w-6 h-6 rounded-lg bg-on-surface/[0.06] hover:bg-on-surface/[0.12] flex items-center justify-center transition-colors">
                        <Plus size={11} strokeWidth={2.5} className="text-on-surface/60" />
                      </button>
                    </div>
                    <button onClick={() => removeContent(c.id)} className="w-6 h-6 rounded-lg flex items-center justify-center text-on-surface/20 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0">
                      <Trash2 size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 bg-[#FFF7B0] dark:bg-[#252520] border-t border-[#DDD000] dark:border-on-surface/[0.06] shrink-0">
              <button
                onClick={handleClose}
                className="w-full py-2.5 rounded-xl text-sm font-black bg-[#1A1A0E] text-[#FFE500] hover:bg-[#2A2A1E] transition-colors"
              >
                Concluído
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

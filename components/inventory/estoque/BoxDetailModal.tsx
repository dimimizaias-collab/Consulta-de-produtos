'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, X, Printer, Edit2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { BoxLabelModal } from './BoxLabelModal';
import { ManageBoxContentsModal } from './ManageBoxContentsModal';
import { type StorageBox } from './AddEditBoxModal';
import { type BoxContent } from './ManageBoxContentsModal';

interface BoxDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  box: StorageBox | null;
  allProducts: any[];
  onContentsChanged: () => void;
}

export function BoxDetailModal({ isOpen, onClose, box, allProducts, onContentsChanged }: BoxDetailModalProps) {
  const [contents, setContents] = useState<BoxContent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLabel, setShowLabel] = useState(false);
  const [showManage, setShowManage] = useState(false);

  const fetchContents = async () => {
    if (!box) return;
    setLoading(true);
    const { data } = await supabase.from('box_contents').select('*').eq('box_id', box.id);
    setContents((data ?? []).map((r: any) => ({
      id: r.id, boxId: r.box_id, productId: r.product_id, quantity: r.quantity,
      product: allProducts.find(p => p.id === r.product_id),
    })));
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen && box) fetchContents();
  }, [isOpen, box]);

  const handleManageSaved = () => { fetchContents(); onContentsChanged(); };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
                  <Package size={16} strokeWidth={2.5} color="#1A1A0E" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#1A1A0E]/50 mb-0.5">Caixa</p>
                  <p className="font-mono text-xl font-black text-[#1A1A0E] leading-none">{box?.code}</p>
                  {box?.shelfName && (
                    <p className="text-[11px] font-semibold text-[#1A1A0E]/50 mt-0.5">{box.shelfName}</p>
                  )}
                </div>
                <button onClick={onClose} className="w-7 h-7 rounded-[9px] bg-black/[0.08] border border-black/[0.10] flex items-center justify-center text-[#1A1A0E]/40 hover:bg-red-500/10 hover:text-red-600 transition-colors shrink-0">
                  <X size={13} strokeWidth={2.5} />
                </button>
              </div>

              {/* Content list */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                {loading ? (
                  <p className="text-sm text-on-surface/40 text-center py-6">Carregando…</p>
                ) : contents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-3 text-on-surface/35">
                    <Package size={32} strokeWidth={1.5} />
                    <p className="text-sm font-semibold">Nenhum produto nesta caixa.</p>
                    <button
                      onClick={() => setShowManage(true)}
                      className="text-xs font-black text-[#1A1A0E] dark:text-[#F2F0E3] border-b border-on-surface/20 hover:border-on-surface/60 transition-colors pb-0.5"
                    >
                      Adicionar produtos →
                    </button>
                  </div>
                ) : (
                  contents.map(c => (
                    <div key={c.id} className="flex items-center gap-3 bg-white dark:bg-[#252520] rounded-xl border border-on-surface/[0.07] px-3.5 py-2.5">
                      <div className="w-9 h-9 rounded-xl bg-on-surface/[0.06] flex items-center justify-center shrink-0 overflow-hidden">
                        {c.product?.image
                          ? <img src={c.product.image} alt="" className="w-full h-full object-cover" />
                          : <span className="text-lg">📦</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-on-surface truncate">{c.product?.name ?? 'Produto removido'}</p>
                        <p className="text-[10px] text-on-surface/40 font-mono">{c.product?.ean || c.product?.sku || '—'}</p>
                      </div>
                      <div className="font-mono text-sm font-black text-on-surface bg-on-surface/[0.06] rounded-lg px-2.5 py-1 shrink-0">
                        × {c.quantity}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-4 bg-[#FFF7B0] dark:bg-[#252520] border-t border-[#DDD000] dark:border-on-surface/[0.06] flex gap-2 shrink-0">
                <button
                  onClick={() => setShowLabel(true)}
                  className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl text-sm font-bold bg-on-surface/[0.08] text-on-surface/60 hover:bg-on-surface/[0.12] transition-colors"
                >
                  <Printer size={13} strokeWidth={2.5} />
                  Imprimir Etiqueta
                </button>
                <button
                  onClick={() => setShowManage(true)}
                  className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl text-sm font-black bg-[#1A1A0E] text-[#FFE500] hover:bg-[#2A2A1E] dark:bg-[#FFE500] dark:text-[#1A1A0E] dark:hover:bg-[#F5DB00] transition-colors"
                >
                  <Edit2 size={13} strokeWidth={2.5} />
                  Editar Conteúdo
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BoxLabelModal
        isOpen={showLabel}
        onClose={() => setShowLabel(false)}
        boxCode={box?.code ?? ''}
        shelfName={box?.shelfName}
      />
      <ManageBoxContentsModal
        isOpen={showManage}
        onClose={() => setShowManage(false)}
        onSaved={handleManageSaved}
        box={box}
        allProducts={allProducts}
      />
    </>
  );
}

'use client';

import { motion, AnimatePresence } from 'motion/react';
import { X, FilePenLine } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlterationData {
  is_product_alteration: true;
  product_name: string;
  product_sku: string;
  changed_fields: string[];
  before: Record<string, any>;
  after: Record<string, any>;
}

interface Props {
  open: boolean;
  data: AlterationData;
  onClose: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  sku: 'SKU',
  price: 'Preço',
  count: 'Estoque',
  location: 'Localização',
  ean: 'EAN',
  category: 'Categoria',
  subcategory: 'Subcategoria',
  brand: 'Marca',
  status: 'Status',
};

const ALL_FIELDS = ['name', 'sku', 'price', 'count', 'location', 'ean', 'category', 'subcategory', 'brand', 'status'];

function formatValue(field: string, value: any): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'price') {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    return `R$ ${(num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }
  return String(value);
}

export function ProductAlterationModal({ open, data, onClose }: Props) {
  const changedSet = new Set(data.changed_fields);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-surface-container-lowest rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden pointer-events-auto border border-on-surface/[0.04]">
              {/* Header */}
              <div className="px-6 py-5 border-b border-on-surface/[0.05] flex items-center gap-4 shrink-0">
                <div className="w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                  <FilePenLine size={20} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-black text-on-surface leading-tight">Produtos alterados</h2>
                  <p className="text-[11px] text-on-surface/40 font-medium mt-0.5 truncate">
                    {data.product_name}
                    {data.product_sku && <span className="ml-1.5 text-on-surface/25">· {data.product_sku}</span>}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-xl bg-on-surface/5 flex items-center justify-center text-on-surface/40 hover:bg-on-surface/10 transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Legend */}
              <div className="px-6 pt-4 pb-2 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-sm border-2 border-purple-500 bg-purple-50 dark:bg-purple-900/30 shrink-0" />
                  <span className="text-[10px] text-on-surface/40 font-bold uppercase tracking-widest">Campo alterado</span>
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-y-auto px-6 pb-6">
                <div className="rounded-2xl border border-on-surface/[0.06] overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-[1.5fr_2fr_2fr] bg-surface-container-low/40 border-b border-on-surface/[0.06]">
                    <div className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-on-surface/30">Campo</div>
                    <div className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-on-surface/30 border-l border-on-surface/[0.06]">Antes</div>
                    <div className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-on-surface/30 border-l border-on-surface/[0.06]">Depois</div>
                  </div>

                  {/* Rows */}
                  {ALL_FIELDS.map((field) => {
                    const isChanged = changedSet.has(field);
                    const beforeVal = formatValue(field, data.before[field]);
                    const afterVal = formatValue(field, data.after[field]);

                    return (
                      <div
                        key={field}
                        className={cn(
                          'grid grid-cols-[1.5fr_2fr_2fr] border-b border-on-surface/[0.04] last:border-b-0 transition-colors',
                          isChanged ? 'bg-purple-50 dark:bg-purple-900/20' : 'bg-transparent'
                        )}
                      >
                        {/* Field name */}
                        <div className={cn(
                          'px-4 py-3 flex items-center gap-2',
                          isChanged && 'border-l-2 border-purple-500'
                        )}>
                          <span className={cn(
                            'text-[11px] font-bold',
                            isChanged ? 'text-purple-700 dark:text-purple-300' : 'text-on-surface/50'
                          )}>
                            {FIELD_LABELS[field] ?? field}
                          </span>
                        </div>

                        {/* Before */}
                        <div className={cn(
                          'px-4 py-3 border-l flex items-center',
                          isChanged
                            ? 'border-purple-200 dark:border-purple-700/40'
                            : 'border-on-surface/[0.04]'
                        )}>
                          <span className={cn(
                            'text-[11px]',
                            isChanged
                              ? 'text-on-surface/50 line-through'
                              : 'text-on-surface/35'
                          )}>
                            {beforeVal}
                          </span>
                        </div>

                        {/* After */}
                        <div className={cn(
                          'px-4 py-3 border-l flex items-center',
                          isChanged
                            ? 'border-purple-200 dark:border-purple-700/40'
                            : 'border-on-surface/[0.04]'
                        )}>
                          <span className={cn(
                            'text-[11px] font-semibold',
                            isChanged
                              ? 'text-purple-700 dark:text-purple-300'
                              : 'text-on-surface/35'
                          )}>
                            {afterVal}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="mt-4 text-[10px] text-on-surface/25 text-center font-medium">
                  {changedSet.size} campo{changedSet.size !== 1 ? 's' : ''} alterado{changedSet.size !== 1 ? 's' : ''} — sincronize com o Retaguarda
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

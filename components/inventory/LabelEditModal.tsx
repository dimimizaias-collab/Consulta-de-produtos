'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Pencil, RotateCcw, Check } from 'lucide-react';
import type { LabelOverrides } from './LabelPrintModal';

// Sobrescreve, só pra etiqueta impressa, a descrição/REF/EAN/preço de um item
// da fila — aberta pelo lápis no card da Visualização (LabelPrintModal e
// FilaImpressaoModal). Nunca altera o produto cadastrado: o que é salvo aqui
// fica só no item da fila (QueueEntry.overrides).

interface LabelEditModalProps {
  isOpen: boolean;
  product: any;
  overrides?: LabelOverrides;
  onSave: (overrides: LabelOverrides) => void;
  onRestore: () => void;
  onClose: () => void;
}

function formatPriceInput(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parsePriceInput(text: string): number | undefined {
  const cleaned = text.trim().replace(/\./g, '').replace(',', '.');
  if (cleaned === '') return undefined;
  const val = parseFloat(cleaned);
  return Number.isFinite(val) ? val : undefined;
}

export function LabelEditModal({ isOpen, product, overrides, onSave, onRestore, onClose }: LabelEditModalProps) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [ean, setEan] = useState('');
  const [priceText, setPriceText] = useState('');

  // Recarrega os campos com os valores efetivos (override, se houver, senão
  // o do produto) toda vez que a janela abre pra um item novo.
  useEffect(() => {
    if (!isOpen || !product) return;
    setName(overrides?.name ?? product.name ?? '');
    setSku(overrides?.sku ?? product.sku ?? '');
    setEan(overrides?.ean ?? product.ean ?? '');
    setPriceText(formatPriceInput(overrides?.price ?? product.price));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, product?.id]);

  if (!product) return null;

  const baseName = product.name ?? '';
  const baseSku = product.sku ?? '';
  const baseEan = product.ean ?? '';
  const basePriceText = formatPriceInput(product.price);

  const nameEdited = name !== baseName;
  const skuEdited = sku !== baseSku;
  const eanEdited = ean !== baseEan;
  const priceEdited = priceText !== basePriceText;
  const hasAnyEdit = nameEdited || skuEdited || eanEdited || priceEdited;

  const fieldCls = (edited: boolean) => `w-full h-[44px] px-4 bg-white dark:bg-[#252520] border-[1.5px] rounded-2xl text-[13px] font-semibold text-on-surface outline-none transition-colors ${
    edited ? 'border-primary/50' : 'border-black/[0.14] dark:border-white/[0.14]'
  }`;

  const handleSave = () => {
    const nextOverrides: LabelOverrides = {};
    if (nameEdited && name.trim() !== '') nextOverrides.name = name.trim();
    if (skuEdited && sku.trim() !== '') nextOverrides.sku = sku.trim();
    if (eanEdited && ean.trim() !== '') nextOverrides.ean = ean.trim();
    if (priceEdited) {
      const parsed = parsePriceInput(priceText);
      if (parsed !== undefined) nextOverrides.price = parsed;
    }
    onSave(nextOverrides);
    onClose();
  };

  const handleRestore = () => {
    onRestore();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="relative bg-[#F0E7CC] dark:bg-[#1E1E18] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-black/10 dark:border-white/[0.08]"
          >
            {/* Header */}
            <div className="px-6 py-5 flex items-center gap-3.5 bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800]">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                <Pencil size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-manrope font-extrabold text-[#1A1A0E] leading-tight">Editar etiqueta</h2>
                <p className="text-xs font-bold text-[#1A1A0E]/55 mt-0.5">Vale só pra esta impressão — não altera o produto cadastrado</p>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] border border-black/10 text-black/50 hover:bg-black/[0.14] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div>
                <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Descrição</span>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className={fieldCls(nameEdited)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">REF / SKU</span>
                  <input
                    value={sku}
                    onChange={e => setSku(e.target.value)}
                    className={`${fieldCls(skuEdited)} font-mono`}
                  />
                </div>
                <div>
                  <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Preço</span>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] font-bold text-secondary/50 pointer-events-none">R$</span>
                    <input
                      value={priceText}
                      onChange={e => setPriceText(e.target.value)}
                      inputMode="decimal"
                      className={`${fieldCls(priceEdited)} pl-10`}
                    />
                  </div>
                </div>
              </div>

              <div>
                <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Código de barras (EAN)</span>
                <input
                  value={ean}
                  onChange={e => setEan(e.target.value)}
                  className={`${fieldCls(eanEdited)} font-mono tracking-wide`}
                />
                <p className="text-[10px] font-semibold text-secondary/40 mt-1.5">
                  Usado pro código de barras e pro número mostrado embaixo dele na etiqueta.
                </p>
              </div>

              {hasAnyEdit && (
                <p className="text-[10px] font-semibold text-secondary/40 flex items-center gap-1.5 pt-1">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                  Campos em <span className="text-primary font-bold">vermelho</span> foram alterados do valor original do produto.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-1 flex items-center gap-3">
              {(hasAnyEdit || overrides) && (
                <button
                  type="button"
                  onClick={handleRestore}
                  className="text-[11px] font-extrabold text-secondary/60 hover:text-primary transition-colors flex items-center gap-1.5 mr-auto"
                >
                  <RotateCcw size={13} />
                  Restaurar padrão
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className={`bg-black/[0.06] dark:bg-white/[0.07] text-secondary font-bold py-3 px-5 rounded-2xl hover:bg-black/[0.10] dark:hover:bg-white/[0.11] transition-colors ${!(hasAnyEdit || overrides) ? 'ml-auto' : ''}`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="bg-primary text-white font-bold py-3 px-6 rounded-2xl shadow-lg shadow-primary/30 hover:opacity-90 transition-colors flex items-center justify-center gap-2"
              >
                <Check size={15} />
                Salvar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

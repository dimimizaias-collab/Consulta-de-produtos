'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Pencil, RotateCcw, Check, Tag, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  modalBackdropCls, modalCls, barCls, barChipCls, barTitleCls, barSubtitleCls, closeBtnCls,
  sectionCls, sectionHeadCls, sectionTitleCls, labelCls, inputCls, footerCls, btnCls, btnPrimaryCls,
} from './labelUi';
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

  const fieldCls = (edited: boolean) => cn(inputCls, edited && '!border-[#D81E1E]/55');

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
            className={modalBackdropCls}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className={cn(modalCls, 'max-w-[440px]')}
          >
            {/* Barra de título */}
            <div className={barCls}>
              <div className={barChipCls}>
                <Pencil size={15} strokeWidth={2.3} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className={barTitleCls}>Editar etiqueta</h4>
                <p className={barSubtitleCls}>Vale só pra esta impressão — não altera o produto cadastrado</p>
              </div>
              <button onClick={onClose} title="Fechar" className={closeBtnCls}>
                <X size={15} strokeWidth={2.6} />
              </button>
            </div>

            {/* Body */}
            <div className="px-3.5 py-3 flex flex-col gap-2.5">
              <div className={sectionCls}>
                <div className={sectionHeadCls}>
                  <Tag size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                  <span className={sectionTitleCls}>Dados da etiqueta</span>
                </div>
                <div className="p-2.5 flex flex-col gap-2.5">
                  <div className="min-w-0">
                    <label className={labelCls}>Descrição</label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className={fieldCls(nameEdited)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="min-w-0">
                      <label className={labelCls}>REF / SKU</label>
                      <input
                        value={sku}
                        onChange={e => setSku(e.target.value)}
                        className={cn(fieldCls(skuEdited), 'font-mono')}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={labelCls}>Preço</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-on-surface/45 pointer-events-none">R$</span>
                        <input
                          value={priceText}
                          onChange={e => setPriceText(e.target.value)}
                          inputMode="decimal"
                          className={cn(fieldCls(priceEdited), 'pl-8')}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <label className={labelCls}>Código de barras (EAN)</label>
                    <input
                      value={ean}
                      onChange={e => setEan(e.target.value)}
                      className={cn(fieldCls(eanEdited), 'font-mono tracking-[0.03em]')}
                    />
                    <p className="text-[10px] font-semibold text-on-surface/40 mt-1">
                      Usado pro código de barras e pro número mostrado embaixo dele na etiqueta.
                    </p>
                  </div>
                </div>
              </div>

              {hasAnyEdit && (
                <p className="text-[10px] font-semibold text-on-surface/45 flex items-center gap-1.5">
                  <Info size={11} strokeWidth={2.4} className="shrink-0" />
                  Campos com borda <span className="text-[#D81E1E] font-bold">vermelha</span> foram alterados do valor original do produto.
                </p>
              )}
            </div>

            {/* Rodapé */}
            <div className={footerCls}>
              {(hasAnyEdit || overrides) && (
                <button
                  type="button"
                  onClick={handleRestore}
                  className="text-[11px] font-extrabold text-on-surface/55 hover:text-[#D81E1E] transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw size={13} />
                  Restaurar padrão
                </button>
              )}
              <button type="button" onClick={onClose} className={cn(btnCls, 'ml-auto')}>
                Cancelar
              </button>
              <button type="button" onClick={handleSave} className={btnPrimaryCls}>
                <Check size={14} strokeWidth={2.8} />
                Salvar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

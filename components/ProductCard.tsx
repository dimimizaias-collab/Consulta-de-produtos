'use client';

import { useState, useMemo, memo } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { cn, getDirectImageUrl } from '@/lib/utils';
import { Edit2, Printer, Tag, Package, MapPin, Hash, Barcode, ImageOff, LayoutGrid } from 'lucide-react';

interface ProductCardProps {
  id?: string;
  sku: string;
  name: string;
  image: string;
  status: string;
  count: number;
  location: string;
  price?: number;
  ean?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  manufacturer_id?: string | null;
  isLow?: boolean;
  hasMotherPackages?: boolean;
  onEdit?: (product: any) => void;
  onViewMotherPackages?: (product: any) => void;
  onSendToPrintQueue?: (product: any) => void;
}

function ProductImage({ src, alt }: { src: string; alt: string }) {
  const [error, setError] = useState(false);
  const directSrc = useMemo(() => getDirectImageUrl(src), [src]);

  if (directSrc && !error) {
    return (
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
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-1.5 text-on-surface/[0.20] w-full h-full">
      <ImageOff size={26} strokeWidth={1.5} />
      <span className="text-[8px] font-bold uppercase tracking-[0.12em]">Sem Foto</span>
    </div>
  );
}

export const ProductCard = memo(function ProductCard({
  id, sku, name, image, status, count, location, price, ean,
  category, subcategory, brand, manufacturer_id, isLow, hasMotherPackages, onEdit, onViewMotherPackages, onSendToPrintQueue,
}: ProductCardProps) {
  const product = { id, sku, name, image, status, count, location, price, ean, category, subcategory, brand, manufacturer_id, isLow };

  const categoryChain = [category, subcategory].filter(Boolean).join(' › ');
  const subtitleParts = [ean, brand, categoryChain].filter(Boolean);

  return (
    <>
      {/* ── Linha compacta mobile — estilo lista de conversas (WhatsApp) ── */}
      <div
        onClick={() => onEdit?.(product)}
        className="md:hidden flex items-center gap-3 px-1 py-2.5 relative border-b border-on-surface/[0.06] last:border-b-0 cursor-pointer active:bg-on-surface/[0.03] transition-colors"
      >
        {hasMotherPackages && (
          <button
            onClick={(e) => { e.stopPropagation(); onViewMotherPackages?.(product); }}
            className="absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center text-white bg-amber-500 border-2 border-background z-10 shadow-md"
            title="Produto Filho — tem embalagem(ns) Produto Mãe cadastrada(s)."
          >
            <Package size={9} />
          </button>
        )}

        <div className="w-[54px] h-[54px] rounded-2xl bg-surface-container border border-on-surface/[0.07] relative flex-shrink-0 overflow-hidden">
          <ProductImage src={image} alt={name} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-extrabold text-on-surface leading-[1.3] tracking-[-0.2px] truncate">
            {name}
          </p>
          <div className="flex items-center gap-1 mt-0.5 text-[11px] font-semibold text-on-surface/45 truncate">
            {subtitleParts.map((part, i) => (
              <span key={i} className="flex items-center gap-1 min-w-0">
                {i > 0 && <span className="w-[3px] h-[3px] rounded-full bg-on-surface/20 flex-shrink-0" />}
                <span className={cn('truncate', i === 0 && ean && 'font-mono tracking-[0.02em]')}>{part}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {price != null && (
            <span className="text-[12px] font-black text-primary">
              R$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          )}
          <span className={cn(
            'text-[9.5px] font-black px-2 py-[3px] rounded-full',
            isLow || count === 0 ? 'bg-primary/10 text-primary' : 'bg-on-surface/[0.07] text-on-surface/50'
          )}>
            {count} un
          </span>
        </div>
      </div>

      {/* ── Card completo — desktop (md+) ── */}
      <motion.div
        whileHover={{ y: -2 }}
        className="hidden md:block bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10] relative group transition-[border-color,box-shadow] duration-[130ms] hover:border-[#CFC4A2] dark:hover:border-white/[0.20] hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)]"
      >
        {/* Produto Filho badge — este produto tem Produto(s) Mãe (embalagem) cadastrados */}
        {hasMotherPackages && (
          <button
            onClick={(e) => { e.stopPropagation(); onViewMotherPackages?.(product); }}
            className="absolute -top-px -left-px w-[22px] h-[22px] flex items-center justify-center text-white bg-amber-500 z-20 hover:bg-amber-600 transition-colors"
            title="Produto Filho — tem embalagem(ns) Produto Mãe cadastrada(s). Ao escanear a caixa, o estoque deste produto é atualizado."
          >
            <Package size={11} />
          </button>
        )}

        {/* Send to print queue button */}
        {onSendToPrintQueue && (
          <button
            onClick={(e) => { e.stopPropagation(); onSendToPrintQueue?.(product); }}
            className="absolute top-2 right-[38px] w-[26px] h-[26px] border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-[opacity,background-color,border-color] hover:bg-primary hover:border-primary z-10 group/pr"
            title="Enviar para fila de impressão"
          >
            <Printer size={12} className="text-on-surface/55 group-hover/pr:text-white transition-colors" strokeWidth={2.2} />
          </button>
        )}

        {/* Edit button */}
        {onEdit && (
          <button
            onClick={() => onEdit?.(product)}
            className="absolute top-2 right-2 w-[26px] h-[26px] border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-[opacity,background-color,border-color] hover:bg-primary hover:border-primary z-10 group/ed"
            title="Editar produto"
          >
            <Edit2 size={12} className="text-on-surface/55 group-hover/ed:text-white transition-colors" strokeWidth={2.2} />
          </button>
        )}

        <div className="flex items-center gap-3.5 py-2.5 pl-2.5 pr-3">

          {/* Image */}
          <div className="w-[120px] h-24 bg-[#FAF7EE] dark:bg-[#1A1A15] border border-[#E0D8BF] dark:border-white/[0.10] relative flex-shrink-0 overflow-hidden">
            <ProductImage src={image} alt={name} />
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            {/* Name */}
            <p className="text-[15px] font-extrabold text-on-surface leading-[1.3] tracking-[-0.01em] pr-16">
              {name}
            </p>

            {/* EAN + SKU pills */}
            <div className="flex items-center gap-1 flex-wrap">
              {ean && (
                <span className="h-[22px] flex items-center gap-[5px] bg-[#FAF7EE] dark:bg-[#1A1A15] border border-[#E0D8BF] dark:border-white/[0.10] px-[7px] font-mono text-[10.5px] text-on-surface/50">
                  <Barcode size={10} className="text-primary shrink-0" strokeWidth={2} style={{ opacity: 0.8 }} />
                  <span>{ean}</span>
                </span>
              )}
              {sku && (
                <span className="h-[22px] flex items-center gap-[5px] bg-[#FAF7EE] dark:bg-[#1A1A15] border border-[#E0D8BF] dark:border-white/[0.10] px-[7px] font-mono text-[10.5px] text-on-surface/50">
                  <Hash size={10} className="text-primary shrink-0" strokeWidth={2} style={{ opacity: 0.8 }} />
                  {sku}
                </span>
              )}
            </div>

            {/* Price */}
            {price != null && (
              <div className="flex items-baseline gap-[3px]">
                <span className="text-[12px] font-black text-primary">R$</span>
                <span className="text-[26px] font-black text-primary leading-none tracking-[-0.03em]">
                  {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Category tags */}
            <div className="flex items-center gap-[4px] flex-wrap">
              {brand && (
                <>
                  <span className="flex items-center gap-1">
                    <Tag size={10} className="text-primary" strokeWidth={2} style={{ opacity: 0.65 }} />
                    <span className="text-[9px] font-bold text-on-surface/30 uppercase tracking-[0.09em]">{brand}</span>
                  </span>
                  {(category || subcategory) && <span className="w-[3px] h-[3px] rounded-full bg-on-surface/10 flex-shrink-0" />}
                </>
              )}
              {category && (
                <>
                  <span className="flex items-center gap-1">
                    <LayoutGrid size={10} className="text-primary" strokeWidth={2} style={{ opacity: 0.65 }} />
                    <span className="text-[9px] font-bold text-on-surface/30 uppercase tracking-[0.09em]">{category}</span>
                  </span>
                  {subcategory && <span className="w-[3px] h-[3px] rounded-full bg-on-surface/10 flex-shrink-0" />}
                </>
              )}
              {subcategory && (
                <span className="flex items-center gap-1">
                  <LayoutGrid size={10} className="text-primary" strokeWidth={2} style={{ opacity: 0.65 }} />
                  <span className="text-[9px] font-bold text-on-surface/30 uppercase tracking-[0.09em]">{subcategory}</span>
                </span>
              )}
            </div>
          </div>

          {/* Side panel — título+ícone e valor em molduras (mesmo padrão dos indicadores da Entrada) */}
          <div className="flex-shrink-0 w-[280px] grid grid-cols-2 gap-1.5">
            <div className="flex flex-col gap-1">
              <div className="h-[22px] flex items-center gap-[5px] pl-[3px] pr-[7px] border border-[#E0D8BF] dark:border-white/[0.10] bg-[#FAF7EE] dark:bg-[#1A1A15]">
                <span className="w-4 h-4 bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Package size={10} className="text-primary" strokeWidth={2.6} />
                </span>
                <span className="text-[8.5px] font-black text-on-surface/45 uppercase tracking-[0.1em]">Estoque</span>
              </div>
              <div className={cn("h-[34px] flex items-center px-[9px] border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-[15px] font-black", isLow || count === 0 ? "text-primary" : "text-on-surface")}>
                {count} un.
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="h-[22px] flex items-center gap-[5px] pl-[3px] pr-[7px] border border-[#E0D8BF] dark:border-white/[0.10] bg-[#FAF7EE] dark:bg-[#1A1A15]">
                <span className="w-4 h-4 bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <MapPin size={10} className="text-primary" strokeWidth={2.6} />
                </span>
                <span className="text-[8.5px] font-black text-on-surface/45 uppercase tracking-[0.1em]">Localização</span>
              </div>
              <div className="h-[34px] flex items-center px-[9px] border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-[15px] font-black text-on-surface truncate">
                {location || '—'}
              </div>
            </div>
          </div>

        </div>
      </motion.div>
    </>
  );
});

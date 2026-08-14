'use client';

import { useState, useMemo, memo } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { cn, getDirectImageUrl } from '@/lib/utils';
import { Edit2, Tag, Package, MapPin, Hash, Barcode, ImageOff, LayoutGrid } from 'lucide-react';

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
  isLow?: boolean;
  hasMotherPackages?: boolean;
  onEdit?: (product: any) => void;
  onViewMotherPackages?: (product: any) => void;
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
  category, subcategory, brand, isLow, hasMotherPackages, onEdit, onViewMotherPackages,
}: ProductCardProps) {
  const product = { id, sku, name, image, status, count, location, price, ean, category, subcategory, brand, isLow };

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
        className="hidden md:block bg-surface rounded-[22px] border border-on-surface/[0.07] relative group transition-shadow hover:shadow-[0_8px_32px_rgba(0,0,0,0.18)] dark:hover:shadow-[0_10px_36px_rgba(0,0,0,0.45)]"
      >
        {/* Produto Filho badge — este produto tem Produto(s) Mãe (embalagem) cadastrados */}
        {hasMotherPackages && (
          <button
            onClick={(e) => { e.stopPropagation(); onViewMotherPackages?.(product); }}
            className="absolute -top-2.5 -left-2.5 w-[26px] h-[26px] rounded-full flex items-center justify-center text-white bg-amber-500 border-[3px] border-background z-20 hover:scale-110 transition-transform shadow-lg"
            title="Produto Filho — tem embalagem(ns) Produto Mãe cadastrada(s). Ao escanear a caixa, o estoque deste produto é atualizado."
          >
            <Package size={11} />
          </button>
        )}

        {/* Edit button */}
        {onEdit && (
          <button
            onClick={() => onEdit?.(product)}
            className="absolute top-3.5 right-4 w-[30px] h-[30px] rounded-full bg-on-surface/[0.07] border-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-[opacity,background-color] hover:bg-primary z-10"
            title="Editar produto"
          >
            <Edit2 size={13} className="text-on-surface/55 group-hover:text-white transition-colors" strokeWidth={2} />
          </button>
        )}

        <div className="flex items-center gap-[18px] p-[18px_20px_18px_18px]">

          {/* Image */}
          <div className="w-[156px] h-[130px] rounded-2xl bg-surface-container border border-on-surface/[0.06] relative flex-shrink-0 overflow-hidden">
            <ProductImage src={image} alt={name} />
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Name */}
            <p className="text-[17px] font-extrabold text-on-surface leading-[1.35] tracking-[-0.2px] mb-2">
              {name}
            </p>

            {/* EAN + SKU pills */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
              {ean && (
                <span className="flex items-center gap-1.5 bg-on-surface/[0.05] border border-on-surface/[0.07] rounded-[8px] px-2.5 py-[5px] text-[10px] font-bold text-on-surface/40 tracking-[0.03em]">
                  <Barcode size={10} className="text-primary shrink-0" strokeWidth={2} style={{ opacity: 0.8 }} />
                  <span>{ean}</span>
                </span>
              )}
              {sku && (
                <span className="flex items-center gap-1.5 bg-on-surface/[0.05] border border-on-surface/[0.07] rounded-[8px] px-2.5 py-[5px] text-[10px] font-bold text-on-surface/40 tracking-[0.03em]">
                  <Hash size={10} className="text-primary shrink-0" strokeWidth={2} style={{ opacity: 0.8 }} />
                  {sku}
                </span>
              )}
            </div>

            {/* Price */}
            {price != null && (
              <div className="flex items-baseline gap-[3px] mb-3">
                <span className="text-[14px] font-black text-primary">R$</span>
                <span className="text-[32px] font-black text-primary leading-none tracking-[-1px]">
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

          {/* Side panel */}
          <div className="flex-shrink-0 flex flex-col gap-2">
            <div className="bg-on-surface/[0.04] border border-on-surface/[0.07] rounded-[14px] px-4 py-2.5 flex items-center gap-2.5 min-w-[120px]">
              <div className="w-7 h-7 rounded-[9px] bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Package size={14} className="text-primary" strokeWidth={2} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] font-bold text-on-surface/30 uppercase tracking-[0.1em]">Estoque</span>
                <span className={cn("text-[13px] font-black", isLow || count === 0 ? "text-primary" : "text-on-surface")}>
                  {count}
                </span>
              </div>
            </div>
            <div className="bg-on-surface/[0.04] border border-on-surface/[0.07] rounded-[14px] px-4 py-2.5 flex items-center gap-2.5 min-w-[120px]">
              <div className="w-7 h-7 rounded-[9px] bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MapPin size={14} className="text-primary" strokeWidth={2} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] font-bold text-on-surface/30 uppercase tracking-[0.1em]">Localização</span>
                <span className="text-[13px] font-black text-on-surface">{location || '—'}</span>
              </div>
            </div>
          </div>

        </div>
      </motion.div>
    </>
  );
});

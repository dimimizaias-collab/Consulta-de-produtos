'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { cn, getDirectImageUrl } from '@/lib/utils';
import { Edit2, Tag, Package, MapPin, Hash, Barcode, ImageOff, Link as LinkIcon, LayoutGrid } from 'lucide-react';

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
  is_mother?: boolean;
  units_per_mother?: number;
  linkedProductId?: string | null;
  linked_product_id?: string | null;
  onEdit?: (product: any) => void;
  onViewLink?: (product: any) => void;
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
    <div className="flex flex-col items-center justify-center gap-1.5 text-white/[0.14] w-full h-full">
      <ImageOff size={26} strokeWidth={1.5} />
      <span className="text-[8px] font-bold uppercase tracking-[0.12em]">Sem Foto</span>
    </div>
  );
}

export function ProductCard({
  id, sku, name, image, status, count, location, price, ean,
  category, subcategory, brand, isLow, is_mother, units_per_mother,
  linkedProductId, linked_product_id, onEdit, onViewLink,
}: ProductCardProps) {
  const isLinked = !!(linkedProductId || linked_product_id);
  const product = { id, sku, name, image, status, count, location, price, ean, category, subcategory, brand, isLow, is_mother, units_per_mother, linkedProductId, linked_product_id };

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-[#1c1c16] rounded-[22px] border border-white/[0.05] p-[18px_20px_18px_18px] flex items-center gap-[18px] relative group transition-shadow hover:shadow-[0_10px_36px_rgba(0,0,0,0.45)]"
    >
      {/* Link badge */}
      {isLinked && (
        <button
          onClick={(e) => { e.stopPropagation(); onViewLink?.(product); }}
          className={cn(
            "absolute -top-2.5 -left-2.5 w-[26px] h-[26px] rounded-full flex items-center justify-center text-white border-[3px] border-[#111110] z-20 hover:scale-110 transition-transform shadow-lg",
            is_mother ? "bg-purple-600" : "bg-primary"
          )}
          title="Ver vínculo"
        >
          <LinkIcon size={11} />
        </button>
      )}

      {/* Edit button */}
      {onEdit && (
        <button
          onClick={() => onEdit?.(product)}
          className="absolute top-3.5 right-4 w-[30px] h-[30px] rounded-full bg-white/[0.07] border-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-primary z-10"
          title="Editar produto"
        >
          <Edit2 size={13} className="text-white/55 group-hover:text-white transition-colors" strokeWidth={2} />
        </button>
      )}

      {/* Image */}
      <div className="w-[156px] h-[130px] rounded-2xl bg-[#141410] border border-white/[0.05] relative flex-shrink-0 overflow-hidden">
        <ProductImage src={image} alt={name} />
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Name */}
        <p className="text-[17px] font-extrabold text-[#f2f0e3] leading-[1.35] tracking-[-0.2px] mb-2 truncate">
          {name}
          {is_mother && (
            <span className="ml-2 text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full align-middle">
              Mãe · {units_per_mother} un
            </span>
          )}
        </p>

        {/* EAN + SKU pills */}
        <div className="flex items-center gap-2 flex-wrap mb-2.5">
          {ean && (
            <span className="flex items-center gap-1.5 bg-white/[0.05] border border-white/[0.06] rounded-[8px] px-2.5 py-[5px] text-[10px] font-bold text-white/40 tracking-[0.03em]">
              <Barcode size={12} className="text-primary shrink-0" strokeWidth={2} style={{ opacity: 0.8 }} />
              {ean}
            </span>
          )}
          {sku && (
            <span className="flex items-center gap-1.5 bg-white/[0.05] border border-white/[0.06] rounded-[8px] px-2.5 py-[5px] text-[10px] font-bold text-white/40 tracking-[0.03em]">
              <Hash size={12} className="text-primary shrink-0" strokeWidth={2} style={{ opacity: 0.8 }} />
              {sku}
            </span>
          )}
        </div>

        {/* Price */}
        {price !== undefined && (
          <div className="flex items-baseline gap-[3px] mb-3">
            <span className="text-[14px] font-black text-primary">R$</span>
            <span className="text-[32px] font-black text-primary leading-none tracking-[-1px]">
              {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* Category tags */}
        <div className="flex items-center gap-[5px] flex-wrap">
          {brand && (
            <>
              <span className="flex items-center gap-1">
                <Tag size={11} className="text-primary" strokeWidth={2} style={{ opacity: 0.65 }} />
                <span className="text-[9px] font-bold text-white/30 uppercase tracking-[0.09em]">{brand}</span>
              </span>
              {(category || subcategory) && <span className="w-[3px] h-[3px] rounded-full bg-white/10 flex-shrink-0" />}
            </>
          )}
          {category && (
            <>
              <span className="flex items-center gap-1">
                <LayoutGrid size={11} className="text-primary" strokeWidth={2} style={{ opacity: 0.65 }} />
                <span className="text-[9px] font-bold text-white/30 uppercase tracking-[0.09em]">{category}</span>
              </span>
              {subcategory && <span className="w-[3px] h-[3px] rounded-full bg-white/10 flex-shrink-0" />}
            </>
          )}
          {subcategory && (
            <span className="flex items-center gap-1">
              <LayoutGrid size={11} className="text-primary" strokeWidth={2} style={{ opacity: 0.65 }} />
              <span className="text-[9px] font-bold text-white/30 uppercase tracking-[0.09em]">{subcategory}</span>
            </span>
          )}
        </div>
      </div>

      {/* Side panel */}
      <div className="flex-shrink-0 flex flex-col gap-2">
        {/* Estoque */}
        <div className="bg-white/[0.04] border border-white/[0.06] rounded-[14px] px-4 py-2.5 flex items-center gap-2.5 min-w-[120px]">
          <div className="w-7 h-7 rounded-[9px] bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Package size={14} className="text-primary" strokeWidth={2} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] font-bold text-white/30 uppercase tracking-[0.1em]">Estoque</span>
            <span className={cn("text-[13px] font-black", isLow || count === 0 ? "text-primary" : "text-[#f2f0e3]")}>
              {count}
            </span>
          </div>
        </div>

        {/* Localização */}
        <div className="bg-white/[0.04] border border-white/[0.06] rounded-[14px] px-4 py-2.5 flex items-center gap-2.5 min-w-[120px]">
          <div className="w-7 h-7 rounded-[9px] bg-primary/10 flex items-center justify-center flex-shrink-0">
            <MapPin size={14} className="text-primary" strokeWidth={2} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] font-bold text-white/30 uppercase tracking-[0.1em]">Localização</span>
            <span className="text-[13px] font-black text-[#f2f0e3]">{location || '—'}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

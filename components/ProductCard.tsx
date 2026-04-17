'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { cn, getDirectImageUrl } from '@/lib/utils';
import { Edit2, Tag, Layers, Package, MapPin, Hash, Barcode, ImageOff, Link as LinkIcon } from 'lucide-react';

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

function ProductImage({ src, alt, className }: { src: string, alt: string, className?: string }) {
  const [error, setError] = useState(false);
  const directSrc = useMemo(() => getDirectImageUrl(src), [src]);
  
  return (
    <div className={cn("relative w-full h-full flex items-center justify-center", className)}>
      {directSrc && !error ? (
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
      ) : (
        <div className="flex flex-col items-center justify-center text-slate-300">
          <ImageOff size={24} className="mb-1 opacity-20" />
          <span className="text-[10px] font-bold uppercase">Sem Foto</span>
        </div>
      )}
    </div>
  );
}

export function ProductCard({ id, sku, name, image, status, count, location, price, ean, category, subcategory, brand, isLow, is_mother, units_per_mother, linkedProductId, linked_product_id, onEdit, onViewLink }: ProductCardProps) {
  const isLinked = !!(linkedProductId || linked_product_id);
  const product = { id, sku, name, image, status, count, location, price, ean, category, subcategory, brand, isLow, is_mother, units_per_mother, linkedProductId, linked_product_id };

  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="bg-surface-container-lowest rounded-[2rem] p-6 shadow-2xl shadow-on-surface/[0.03] hover:shadow-primary/5 transition-all group relative flex flex-col md:flex-row gap-8 items-start ring-1 ring-on-surface/[0.02]"
    >
      {isLinked && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onViewLink?.(product);
          }}
          className={cn(
            "absolute -top-3 -left-3 w-10 h-10 rounded-full flex items-center justify-center text-white shadow-xl z-20 border-4 border-background hover:scale-110 transition-transform",
            is_mother ? "bg-purple-600" : "bg-primary"
          )}
          title="Ver vínculo"
        >
          <LinkIcon size={16} />
        </button>
      )}
      {onEdit && (
        <button 
          onClick={() => onEdit?.(product)}
          className="absolute top-6 right-6 p-3 bg-surface-container-low/80 backdrop-blur-sm rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all z-10 hover:bg-primary hover:text-white text-on-surface/40"
        >
          <Edit2 size={18} />
        </button>
      )}
      
      <div className="w-40 h-40 bg-background rounded-3xl overflow-hidden relative flex items-center justify-center shrink-0 border-4 border-surface-container-low shadow-inner">
        <ProductImage key={image} src={image} alt={name} />
      </div>

      <div className="flex-1 min-w-0 w-full flex flex-col pt-2">
        {/* 1. Nome no topo */}
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-manrope font-black text-2xl text-on-surface group-hover:text-primary transition-colors leading-tight">
            {name}
          </h4>
          {is_mother && (
            <span className="bg-purple-50 text-purple-700 text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-wider shrink-0 mt-1">
              Mother ({units_per_mother} Units)
            </span>
          )}
        </div>

        {/* 2. SKU e EAN abaixo do nome */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-4">
          <p className="text-[10px] font-black text-on-surface/30 uppercase tracking-widest flex items-center gap-2">
            <Hash size={14} className="text-primary/40" /> <span className="text-on-surface/60">{sku}</span>
          </p>
          {ean && (
            <p className="text-[10px] text-on-surface/30 font-black tracking-widest flex items-center gap-2">
              <Barcode size={14} className="text-primary/40" /> <span className="text-on-surface/60">{ean}</span>
            </p>
          )}
        </div>

        {/* 3. Preço e Inventário rápido */}
        <div className="flex items-end justify-between mt-auto">
          {price !== undefined && (
            <div>
               <p className="text-[10px] font-black uppercase text-on-surface/20 tracking-tighter mb-1">MSRP / Market Value</p>
               <p className="text-4xl font-manrope font-black text-on-surface">
                <span className="text-primary text-xl mr-1">R$</span>
                {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          )}

          <div className="flex items-center gap-4">
            {/* Tonal detail tags instead of grid */}
            <div className="bg-surface-container-low px-4 py-3 rounded-2xl flex items-center gap-3 border border-on-surface/[0.02]">
              <Package size={20} className={cn(isLow ? "text-primary" : "text-on-surface/20")} />
              <div>
                <p className="text-[9px] font-black uppercase text-on-surface/30 leading-none mb-1">Stock</p>
                <p className={cn("text-sm font-black", isLow ? "text-primary" : "text-on-surface")}>{count} <span className="text-[10px] opacity-40">units</span></p>
              </div>
            </div>

            <div className="bg-surface-container-low px-4 py-3 rounded-2xl flex items-center gap-3 border border-on-surface/[0.02]">
              <MapPin size={20} className="text-on-surface/20" />
              <div>
                <p className="text-[9px] font-black uppercase text-on-surface/30 leading-none mb-1">Aisle/Bay</p>
                <p className="text-sm font-black text-on-surface">{location}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Categorization Bar */}
        <div className="flex gap-4 mt-6 pt-6 border-t border-on-surface/[0.05]">
           <div className="flex items-center gap-2">
              <Tag size={12} className="text-primary/30" />
              <span className="text-[10px] font-bold text-on-surface/40 uppercase tracking-widest">{brand || 'Generic'}</span>
           </div>
           <div className="w-1 h-1 rounded-full bg-on-surface/10 mt-1.5" />
           <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-on-surface/40 uppercase tracking-widest">{category || 'Misc'}</span>
           </div>
           <div className="w-1 h-1 rounded-full bg-on-surface/10 mt-1.5" />
           <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-on-surface/40 uppercase tracking-widest">{subcategory || 'General'}</span>
           </div>
        </div>
      </div>
    </motion.div>
  );
}

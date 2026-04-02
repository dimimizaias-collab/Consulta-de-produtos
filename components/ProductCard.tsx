'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { cn, getDirectImageUrl } from '@/lib/utils';
import { Edit2, Tag, Layers, Package, MapPin, Hash, Barcode, ImageOff } from 'lucide-react';

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
  onEdit?: (product: any) => void;
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

export function ProductCard({ id, sku, name, image, status, count, location, price, ean, category, subcategory, brand, isLow, onEdit }: ProductCardProps) {
  const product = { id, sku, name, image, status, count, location, price, ean, category, subcategory, brand, isLow };

  return (
    <motion.div 
      whileHover={{ scale: 1.01 }}
      className="bg-white rounded-xl p-5 shadow-[0_10px_40px_rgb(0,0,0,0.08)] hover:shadow-2xl transition-all border border-transparent hover:border-primary/10 group relative flex flex-col md:flex-row gap-6 items-start"
    >
      {onEdit && (
        <button 
          onClick={() => onEdit?.(product)}
          className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-sm border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-primary hover:text-white text-secondary"
        >
          <Edit2 size={16} />
        </button>
      )}
      
      <div className="w-32 h-32 bg-slate-50 rounded-xl overflow-hidden relative flex items-center justify-center shrink-0 border border-slate-100 shadow-inner">
        <ProductImage key={image} src={image} alt={name} />
      </div>

      <div className="flex-1 min-w-0 w-full flex flex-col">
        {/* 1. Nome no topo */}
        <h4 className="font-manrope font-extrabold text-xl mb-1 text-on-surface group-hover:text-primary transition-colors truncate">
          {name}
        </h4>

        {/* 2. SKU e EAN abaixo do nome */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
          <p className="text-[11px] font-bold text-secondary uppercase tracking-wider flex items-center gap-1.5">
            <Hash size={12} className="text-slate-400" /> SKU: <span className="text-on-surface">{sku}</span>
          </p>
          {ean && (
            <p className="text-[11px] text-secondary font-mono flex items-center gap-1.5">
              <Barcode size={12} className="text-slate-400" /> EAN: <span className="text-on-surface">{ean}</span>
            </p>
          )}
        </div>

        {/* 3. Preço abaixo dos códigos */}
        {price !== undefined && (
          <p className="text-2xl font-manrope font-black text-primary mb-5">
            R$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        )}

        {/* 4. Outros detalhes abaixo */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2.5 text-secondary">
            <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
              <Tag size={14} className="text-primary/70" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase text-slate-400 leading-none mb-1">Marca</p>
              <p className="text-xs font-bold truncate text-on-surface">{brand || 'Geral'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-secondary">
            <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
              <Layers size={14} className="text-primary/70" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase text-slate-400 leading-none mb-1">Categoria</p>
              <p className="text-xs font-bold truncate text-on-surface">{category || 'Geral'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-secondary">
            <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
              <Layers size={14} className="text-primary/70 opacity-50" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase text-slate-400 leading-none mb-1">Subcategoria</p>
              <p className="text-xs font-bold truncate text-on-surface">{subcategory || 'Geral'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-secondary">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              isLow ? "bg-red-50 text-red-500" : "bg-slate-50 text-primary/70"
            )}>
              <Package size={14} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase text-slate-400 leading-none mb-1">Estoque</p>
              <p className={cn(
                "text-xs font-bold truncate",
                isLow ? "text-red-600" : "text-on-surface"
              )}>{count} un.</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-secondary">
            <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
              <MapPin size={14} className="text-primary/70" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase text-slate-400 leading-none mb-1">Local</p>
              <p className="text-xs font-bold truncate text-on-surface">{location}</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

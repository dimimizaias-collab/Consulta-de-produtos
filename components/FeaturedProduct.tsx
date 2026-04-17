'use client';

import { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, MapPin, Barcode, Tag, Eye, Edit2, ImageOff, Package } from 'lucide-react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { cn, getDirectImageUrl } from '@/lib/utils';

interface FeaturedProductProps {
  product: {
    id?: string;
    sku: string;
    name: string;
    image: string;
    status: string;
    count: number;
    location: string;
    price?: number;
    ean?: string;
    internalCode?: string;
    category?: string;
    subcategory?: string;
    is_mother?: boolean;
    units_per_mother?: number;
  };
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
          unoptimized={directSrc.includes('googleusercontent.com')}
          onError={() => setError(true)}
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-slate-300">
          <div className="w-24 h-24 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center mb-2">
            <ImageOff size={32} className="opacity-20" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest">Sem Foto</span>
        </div>
      )}
    </div>
  );
}

export function FeaturedProduct({ product, onEdit }: FeaturedProductProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="col-span-12 lg:col-span-8 bg-surface-container-lowest rounded-[2.5rem] overflow-hidden shadow-2xl shadow-on-surface/[0.05] flex group relative ring-1 ring-on-surface/[0.02]"
    >
      {onEdit && (
        <button 
          onClick={() => onEdit(product)}
          className="absolute top-8 right-8 p-4 bg-background/80 backdrop-blur-md rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all z-10 hover:bg-primary hover:text-white text-on-surface/40"
        >
          <Edit2 size={20} />
        </button>
      )}
      <div className="w-5/12 relative bg-background flex items-center justify-center p-8">
        <div className="w-full h-full relative rounded-[2rem] overflow-hidden shadow-inner border-8 border-surface-container-low">
          <ProductImage key={product.image} src={product.image} alt={product.name} />
        </div>
        <div className="absolute top-12 left-12 bg-primary text-white text-[10px] font-black px-4 py-2 rounded-full tracking-widest uppercase shadow-xl shadow-primary/30">
          {product.status}
        </div>
      </div>
      <div className="w-7/12 p-12 flex flex-col">
        <div className="flex justify-between items-start mb-6">
          <div className="flex flex-col gap-3">
            <span className="bg-surface-container-low text-primary text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest w-fit border border-on-surface/[0.02]">{product.category || 'Curated Item'}</span>
            {product.is_mother && (
              <span className="bg-purple-50 text-purple-700 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest w-fit border border-purple-100">
                Mother Product ({product.units_per_mother} Units)
              </span>
            )}
          </div>
          <div className="text-right">
             <p className="text-[10px] font-black uppercase text-on-surface/20 tracking-tighter mb-1">Valuation</p>
             <p className="text-5xl font-manrope font-black text-on-surface tracking-tighter">
                <span className="text-primary text-2xl mr-1 font-bold">R$</span>
                {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
          </div>
        </div>
        
        <h2 className="text-4xl font-manrope font-black text-on-surface mb-4 leading-none tracking-tight">{product.name}</h2>
        <p className="text-base text-on-surface/40 mb-10 leading-relaxed font-medium">Standard industrial grade specification with primary {product.subcategory || 'General'} classification. Optimized for high-throughput warehouse logistics and rapid fulfillment protocols.</p>
        
        <div className="grid grid-cols-2 gap-y-8 gap-x-8 mb-12">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-surface-container-low flex items-center justify-center text-primary shadow-sm border border-on-surface/[0.02]">
              <Package size={24} />
            </div>
            <div>
              <p className="text-[10px] text-on-surface/30 font-black uppercase tracking-widest leading-none mb-1.5">Availability</p>
              <p className="text-base font-black text-on-surface leading-none">{product.count} <span className="text-[10px] opacity-40">units</span></p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-surface-container-low flex items-center justify-center text-on-surface/20 shadow-sm border border-on-surface/[0.02]">
              <MapPin size={24} />
            </div>
            <div>
              <p className="text-[10px] text-on-surface/30 font-black uppercase tracking-widest leading-none mb-1.5">Storage Bay</p>
              <p className="text-base font-black text-on-surface leading-none">{product.location}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-surface-container-low flex items-center justify-center text-on-surface/20 shadow-sm border border-on-surface/[0.02]">
              <Barcode size={24} />
            </div>
            <div>
              <p className="text-[10px] text-on-surface/30 font-black uppercase tracking-widest leading-none mb-1.5">Barcode Header</p>
              <p className="text-sm font-bold text-on-surface/60">{product.ean || '0000000000'}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-surface-container-low flex items-center justify-center text-on-surface/20 shadow-sm border border-on-surface/[0.02]">
              <Tag size={24} />
            </div>
            <div>
              <p className="text-[10px] text-on-surface/30 font-black uppercase tracking-widest leading-none mb-1.5">Stock Unit ID</p>
              <p className="text-sm font-bold text-on-surface/60">{product.internalCode || product.sku}</p>
            </div>
          </div>
        </div>

        <button 
          onClick={() => onEdit?.(product)}
          className="mt-auto w-full bg-primary py-5 rounded-[1.5rem] flex items-center justify-center gap-4 font-black text-white hover:bg-on-surface transition-all group shadow-xl shadow-primary/20 hover:shadow-on-surface/20"
        >
          <Edit2 size={24} className="group-hover:scale-110 transition-transform" />
          <span className="uppercase tracking-[0.2em] text-sm">Update Item Protocols</span>
        </button>
      </div>
    </motion.div>
  );
}

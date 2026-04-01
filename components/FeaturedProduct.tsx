'use client';

import { CheckCircle2, MapPin, Barcode, Tag, Eye, Edit2 } from 'lucide-react';
import Image from 'next/image';
import { motion } from 'motion/react';

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
  };
  onEdit?: (product: any) => void;
}

export function FeaturedProduct({ product, onEdit }: FeaturedProductProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="col-span-12 lg:col-span-8 bg-white rounded-xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex group relative"
    >
      {onEdit && (
        <button 
          onClick={() => onEdit(product)}
          className="absolute top-4 right-4 p-3 bg-white/80 backdrop-blur-sm rounded-full shadow-lg border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-primary hover:text-white text-secondary"
        >
          <Edit2 size={18} />
        </button>
      )}
      <div className="w-2/5 relative bg-[#f5f5f5] flex items-center justify-center">
        {product.image ? (
          <Image 
            className="object-cover" 
            alt={product.name} 
            src={product.image}
            fill
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-300">
            <div className="w-24 h-24 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest">Sem Foto</span>
            </div>
          </div>
        )}
        <div className="absolute top-4 left-4 bg-primary text-white text-[10px] font-extrabold px-2 py-1 rounded tracking-widest uppercase shadow-lg">
          {product.status}
        </div>
      </div>
      <div className="w-3/5 p-8 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <span className="bg-slate-100 text-secondary text-[10px] font-bold px-2 py-1 rounded-full uppercase">{product.category || 'Sem Categoria'}</span>
          <span className="text-primary font-manrope font-extrabold text-3xl tracking-tight">
            R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <h2 className="text-2xl font-manrope font-extrabold text-on-surface mb-2">{product.name}</h2>
        <p className="text-sm text-secondary mb-6 leading-relaxed">{product.subcategory || 'Geral'} power rating, 2 Speeds variable control, and heavy-duty Inox Cup accessory included.</p>
        
        <div className="grid grid-cols-2 gap-y-6 gap-x-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center text-primary">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-[10px] text-secondary font-bold uppercase">Disponibilidade</p>
              <p className="text-sm font-extrabold text-on-surface">{product.count} unidades em estoque</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center text-primary">
              <MapPin size={20} />
            </div>
            <div>
              <p className="text-[10px] text-secondary font-bold uppercase">Localização</p>
              <p className="text-sm font-extrabold text-on-surface">{product.location}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center text-secondary">
              <Barcode size={20} />
            </div>
            <div>
              <p className="text-[10px] text-secondary font-bold uppercase">Código EAN</p>
              <p className="text-xs font-medium">{product.ean || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center text-secondary">
              <Tag size={20} />
            </div>
            <div>
              <p className="text-[10px] text-secondary font-bold uppercase">ID Interno</p>
              <p className="text-xs font-medium">{product.internalCode || product.sku}</p>
            </div>
          </div>
        </div>

        <button 
          onClick={() => onEdit?.(product)}
          className="mt-auto w-full border-2 border-primary bg-white py-3 rounded-lg flex items-center justify-center gap-3 font-bold text-primary hover:bg-primary hover:text-white transition-all group"
        >
          <Edit2 size={20} className="group-hover:text-white" />
          Editar Detalhes do Item
        </button>
      </div>
    </motion.div>
  );
}

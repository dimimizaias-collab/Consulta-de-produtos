'use client';

import { 
  FileUp, 
  FileText, 
  Users, 
  Download, 
  Plus, 
  BookText, 
  CheckCircle2 
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface LogisticsCenterProps {
  importing: boolean;
  onImportClick: () => void;
  onManualNoteClick: () => void;
  onSuppliersClick: () => void;
}

export function LogisticsCenter({ 
  importing, 
  onImportClick, 
  onManualNoteClick, 
  onSuppliersClick
}: LogisticsCenterProps) {
  return (
    <div className="space-y-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black text-on-surface tracking-tighter">Entrada de Mercadoria</h1>
        <p className="text-sm text-on-surface/40 font-medium uppercase tracking-[0.2em]">Logistics Orchestration & Inventory Feed</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Import Card */}
        <motion.div
          whileHover={{ y: -5 }}
          className="bg-surface-container-lowest p-10 rounded-[3rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] flex flex-col items-center text-center group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-primary transform -translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
          <div className="w-24 h-24 rounded-[2rem] bg-primary/5 text-primary flex items-center justify-center mb-8 group-hover:bg-primary group-hover:text-white transition-all transform group-hover:rotate-6 shadow-inner">
            <FileUp size={48} />
          </div>
          <h3 className="text-2xl font-black text-on-surface mb-3 tracking-tight">Import Protocol</h3>
          <p className="text-sm text-on-surface/40 mb-10 max-w-[240px] leading-relaxed">Automated bulk ingestion via Excel/CSV with supplier mapping support.</p>
          <button 
            onClick={onImportClick}
            disabled={importing}
            className="bg-primary text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-on-surface transition-all shadow-xl shadow-primary/20 flex items-center gap-3 w-full justify-center uppercase tracking-widest disabled:opacity-50 active:scale-95"
          >
            {importing ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
            ) : (
              <>
                <Download size={20} />
                Execute Import
              </>
            )}
          </button>
        </motion.div>

        {/* Manual Note Card */}
        <motion.div
          whileHover={{ y: -5 }}
          className="bg-surface-container-lowest p-10 rounded-[3rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] flex flex-col items-center text-center group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-on-surface transform -translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
          <div className="w-24 h-24 rounded-[2rem] bg-on-surface/5 text-on-surface flex items-center justify-center mb-8 group-hover:bg-on-surface group-hover:text-white transition-all transform group-hover:-rotate-6 shadow-inner">
            <FileText size={48} />
          </div>
          <h3 className="text-2xl font-black text-on-surface mb-3 tracking-tight">Manual Manifest</h3>
          <p className="text-sm text-on-surface/40 mb-10 max-w-[240px] leading-relaxed">Ad-hoc entry curation. Search and add specific units to the active session.</p>
          <button 
            onClick={onManualNoteClick}
            className="bg-on-surface text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-primary transition-all shadow-xl shadow-on-surface/20 w-full justify-center flex items-center gap-3 uppercase tracking-widest active:scale-95"
          >
            <Plus size={20} />
            Create Manifest
          </button>
        </motion.div>

        {/* Suppliers Card */}
        <motion.div
          whileHover={{ y: -5 }}
          className="bg-surface-container-lowest p-10 rounded-[3rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] flex flex-col items-center text-center group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-500 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
          <div className="w-24 h-24 rounded-[2rem] bg-amber-500/10 text-amber-600 flex items-center justify-center mb-8 group-hover:bg-amber-500 group-hover:text-white transition-all transform group-hover:rotate-12 shadow-inner">
            <Users size={48} />
          </div>
          <h3 className="text-2xl font-black text-on-surface mb-3 tracking-tight">Suppliers Lab</h3>
          <p className="text-sm text-on-surface/40 mb-10 max-w-[240px] leading-relaxed">Configure the dictionary to synchronize external identifiers with internal SKU.</p>
          <button 
            onClick={onSuppliersClick}
            className="bg-amber-600 text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-on-surface transition-all shadow-xl shadow-amber-600/20 w-full justify-center flex items-center gap-3 uppercase tracking-widest active:scale-95"
          >
            <BookText size={20} />
            Open Dictionary
          </button>
        </motion.div>
      </div>

      <div className="bg-surface-container-low/50 backdrop-blur-md rounded-[2.5rem] p-10 border border-on-surface/[0.03] flex items-center gap-8 shadow-sm group">
        <div className="w-16 h-16 bg-amber-500/10 text-amber-600 rounded-2xl flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 transition-transform">
          <CheckCircle2 size={32} />
        </div>
        <div>
          <h4 className="text-lg font-black text-on-surface leading-tight tracking-tight uppercase tracking-[0.1em]">Import Best Practices</h4>
          <p className="text-sm text-on-surface/40 font-medium mt-1 leading-relaxed">The system prioritizes headers &quot;SKU&quot;, &quot;EAN&quot;, and &quot;QUANTIDADE&quot;. Verify mapping protocols if using custom vendor templates.</p>
        </div>
      </div>
    </div>
  );
}

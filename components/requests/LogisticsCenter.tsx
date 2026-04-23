'use client';

import {
  FileUp,
  FileText,
  Users,
  Download,
  Plus,
  BookText,
  ClipboardList,
  Pencil
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface ReviewNote {
  id: string;
  timestamp: string;
  fileName: string;
  items: any[];
  itemCount: number;
  verifiedCount: number;
}

interface LogisticsCenterProps {
  importing: boolean;
  onImportClick: () => void;
  onManualNoteClick: () => void;
  onSuppliersClick: () => void;
  reviewNotes: ReviewNote[];
  onViewReviewNote: (note: ReviewNote) => void;
}

export function LogisticsCenter({
  importing,
  onImportClick,
  onManualNoteClick,
  onSuppliersClick,
  reviewNotes,
  onViewReviewNote
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

      {/* Revisões Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <h4 className="text-lg font-black text-on-surface uppercase tracking-[0.1em]">Revisões</h4>
          {reviewNotes.length > 0 && (
            <span className="px-2.5 py-0.5 bg-primary/10 text-primary text-xs font-black rounded-full">
              {reviewNotes.length}
            </span>
          )}
        </div>

        {reviewNotes.length === 0 ? (
          <div className="bg-surface-container-low/50 backdrop-blur-md rounded-[2.5rem] p-10 border border-on-surface/[0.03] flex items-center gap-8 shadow-sm">
            <div className="w-16 h-16 bg-on-surface/5 text-on-surface/20 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
              <ClipboardList size={32} />
            </div>
            <div>
              <h4 className="text-lg font-black text-on-surface leading-tight tracking-tight uppercase tracking-[0.1em]">Sem Notas para Revisão</h4>
              <p className="text-sm text-on-surface/40 font-medium mt-1 leading-relaxed">Notas importadas e enviadas para aprovação aparecerão aqui para consulta.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reviewNotes.map((note) => (
              <div
                key={note.id}
                className="relative bg-surface-container-lowest rounded-3xl p-6 border border-on-surface/[0.03] shadow-md hover:shadow-lg transition-shadow"
              >
                <button
                  onClick={() => onViewReviewNote(note)}
                  title="Ver nota digitalizada"
                  className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all flex items-center justify-center shadow-sm"
                >
                  <Pencil size={15} />
                </button>
                <div className="flex items-start gap-3 pr-10">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                    <FileText size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-on-surface truncate">{note.fileName}</p>
                    <p className="text-xs text-on-surface/40 font-medium mt-0.5">{note.timestamp}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                        {note.verifiedCount} verificados
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-on-surface/5 text-on-surface/50 rounded-full">
                        {note.itemCount} total
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

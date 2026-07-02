'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface EanCodeEntry {
  ean: string;
  description: string;
}

interface EanCodesEditorProps {
  entries: EanCodeEntry[];
  onChange: (entries: EanCodeEntry[]) => void;
  className?: string;
}

export function EanCodesEditor({ entries, onChange, className }: EanCodesEditorProps) {
  const [open, setOpen] = useState(false);
  const filledCount = entries.filter(e => e.ean.trim()).length;

  function updateEntry(index: number, patch: Partial<EanCodeEntry>) {
    const next = [...entries];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function addEntry() {
    onChange([...entries, { ean: '', description: '' }]);
  }

  function removeEntry(index: number) {
    onChange(entries.filter((_, i) => i !== index));
  }

  return (
    <div className={cn('relative flex self-stretch', className)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title="Adicionar outro código EAN"
        className="w-10 shrink-0 bg-primary/10 text-primary rounded-xl flex items-center justify-center hover:bg-primary/20 transition-all relative"
      >
        <Plus size={18} />
        {filledCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-primary text-white text-[9px] font-black rounded-full flex items-center justify-center">
            {filledCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="absolute z-50 top-full right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-slate-700 uppercase tracking-widest">
                  Códigos EAN adicionais
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {entries.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-2">Nenhum código adicional.</p>
                )}
                {entries.map((entry, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1.5">
                      <input
                        type="text"
                        value={entry.ean}
                        onChange={(e) => updateEntry(index, { ean: e.target.value })}
                        placeholder="Código EAN"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <input
                        type="text"
                        value={entry.description}
                        onChange={(e) => updateEntry(index, { description: e.target.value })}
                        placeholder="Descrição (ex: código da embalagem)"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEntry(index)}
                      className="w-7 h-7 shrink-0 bg-red-50 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-100 transition-colors mt-0.5"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addEntry}
                className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-slate-200 text-slate-400 rounded-xl hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all text-xs font-bold"
              >
                <Plus size={13} />Adicionar código
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

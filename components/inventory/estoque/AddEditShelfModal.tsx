'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutList, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export type Shelf = { id: string; name: string; description?: string | null };

interface AddEditShelfModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: Shelf | null;
}

export function AddEditShelfModal({ isOpen, onClose, onSaved, editing }: AddEditShelfModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(editing?.name ?? '');
      setDescription(editing?.description ?? '');
      setError('');
    }
  }, [isOpen, editing]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Nome obrigatório.'); return; }
    setSaving(true);
    try {
      if (editing) {
        await supabase.from('shelves').update({ name: name.trim(), description: description.trim() || null, updated_at: new Date().toISOString() }).eq('id', editing.id);
      } else {
        await supabase.from('shelves').insert([{ name: name.trim(), description: description.trim() || null }]);
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-sm bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-3xl overflow-hidden shadow-2xl border border-on-surface/[0.06]"
          >
            {/* Header */}
            <div className="bg-[#FFE500] border-b border-[#D4C000] px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-black/[0.09] flex items-center justify-center shrink-0">
                <LayoutList size={16} strokeWidth={2.5} color="#1A1A0E" />
              </div>
              <div className="flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#1A1A0E]/50 mb-0.5">
                  {editing ? 'Editar' : 'Nova'}
                </p>
                <p className="text-base font-black text-[#1A1A0E]">Prateleira</p>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-[9px] bg-black/[0.08] border border-black/[0.10] flex items-center justify-center text-[#1A1A0E]/40 hover:bg-red-500/10 hover:text-red-600 transition-colors"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.10em] text-on-surface/40 block mb-1.5">Nome da Prateleira *</label>
                <input
                  autoFocus
                  value={name}
                  onChange={e => { setName(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="Ex: Prateleira A"
                  className={cn(
                    'w-full rounded-xl border px-3.5 py-2.5 text-sm font-semibold bg-white dark:bg-[#252520] text-on-surface outline-none transition-colors placeholder:text-on-surface/30',
                    error ? 'border-red-400' : 'border-on-surface/[0.12] focus:border-[#D4C000]'
                  )}
                />
                {error && <p className="text-xs text-red-500 mt-1 font-semibold">{error}</p>}
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.10em] text-on-surface/40 block mb-1.5">Descrição (opcional)</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ex: Materiais de escritório"
                  className="w-full rounded-xl border border-on-surface/[0.12] focus:border-[#D4C000] px-3.5 py-2.5 text-sm font-semibold bg-white dark:bg-[#252520] text-on-surface outline-none transition-colors placeholder:text-on-surface/30"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 bg-[#FFF7B0] dark:bg-[#252520] border-t border-[#DDD000] dark:border-on-surface/[0.06] flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-on-surface/[0.08] text-on-surface/55 hover:bg-on-surface/[0.12] transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-black bg-[#1A1A0E] text-[#FFE500] hover:bg-[#2A2A1E] transition-colors disabled:opacity-50"
              >
                {saving ? 'Salvando…' : editing ? 'Salvar' : 'Criar Prateleira'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

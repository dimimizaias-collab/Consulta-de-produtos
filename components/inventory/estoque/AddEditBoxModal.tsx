'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, X, ScanLine, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { type Shelf } from './AddEditShelfModal';

export type StorageBox = {
  id: string;
  code: string;
  shelfId: string | null;
  description?: string | null;
  productCount?: number;
  shelfName?: string;
};

interface AddEditBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: StorageBox | null;
  shelves: Shelf[];
  defaultShelfId?: string | null;
}

export function AddEditBoxModal({ isOpen, onClose, onSaved, editing, shelves, defaultShelfId }: AddEditBoxModalProps) {
  const [code, setCode] = useState('');
  const [shelfId, setShelfId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [showShelfDropdown, setShowShelfDropdown] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCode(editing?.code ?? '');
      setShelfId(editing?.shelfId ?? defaultShelfId ?? shelves[0]?.id ?? '');
      setDescription(editing?.description ?? '');
      setCodeError('');
      setShowShelfDropdown(false);
    }
  }, [isOpen, editing, defaultShelfId, shelves]);

  const selectedShelf = shelves.find(s => s.id === shelfId);

  const handleSave = async () => {
    if (!code.trim()) { setCodeError('Código obrigatório.'); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from('storage_boxes').update({
          code: code.trim().toUpperCase(),
          shelf_id: shelfId || null,
          description: description.trim() || null,
          updated_at: new Date().toISOString(),
        }).eq('id', editing.id);
        if (error?.code === '23505') { setCodeError('Este código já existe.'); setSaving(false); return; }
      } else {
        const { error } = await supabase.from('storage_boxes').insert([{
          code: code.trim().toUpperCase(),
          shelf_id: shelfId || null,
          description: description.trim() || null,
        }]);
        if (error?.code === '23505') { setCodeError('Este código já existe.'); setSaving(false); return; }
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
                <Package size={16} strokeWidth={2.5} color="#1A1A0E" />
              </div>
              <div className="flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#1A1A0E]/50 mb-0.5">
                  {editing ? 'Editar' : 'Nova'}
                </p>
                <p className="text-base font-black text-[#1A1A0E]">Caixa</p>
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
              {/* Code */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.10em] text-on-surface/40 block mb-1.5">Código da Caixa *</label>
                <div className={cn(
                  'flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 bg-white dark:bg-[#252520] transition-colors',
                  codeError ? 'border-red-400' : 'border-on-surface/[0.12] focus-within:border-[#D4C000]'
                )}>
                  <ScanLine size={15} strokeWidth={2} className="text-on-surface/35 shrink-0" />
                  <input
                    autoFocus
                    value={code}
                    onChange={e => { setCode(e.target.value.toUpperCase()); setCodeError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    placeholder="Ex: CX-001"
                    className="flex-1 bg-transparent text-sm font-mono font-bold text-on-surface outline-none placeholder:text-on-surface/30 placeholder:font-sans placeholder:font-medium"
                  />
                </div>
                {codeError && <p className="text-xs text-red-500 mt-1 font-semibold">{codeError}</p>}
                <p className="text-[10px] text-on-surface/35 mt-1">Cole nas caixas para escanear depois.</p>
              </div>

              {/* Shelf picker */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.10em] text-on-surface/40 block mb-1.5">Prateleira</label>
                <div className="relative">
                  <button
                    onClick={() => setShowShelfDropdown(v => !v)}
                    className="w-full flex items-center justify-between gap-2 rounded-xl border border-on-surface/[0.12] px-3.5 py-2.5 bg-white dark:bg-[#252520] text-sm font-semibold text-on-surface hover:border-[#D4C000] transition-colors"
                  >
                    <span className={cn(!selectedShelf && 'text-on-surface/35')}>
                      {selectedShelf?.name ?? 'Sem prateleira'}
                    </span>
                    <ChevronDown size={14} className="text-on-surface/40 shrink-0" />
                  </button>
                  <AnimatePresence>
                    {showShelfDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
                        className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 rounded-xl border border-on-surface/[0.08] bg-white dark:bg-[#2E2E28] shadow-xl overflow-hidden"
                      >
                        {[{ id: '', name: 'Sem prateleira' }, ...shelves].map(s => (
                          <button
                            key={s.id}
                            onClick={() => { setShelfId(s.id); setShowShelfDropdown(false); }}
                            className={cn(
                              'w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors',
                              shelfId === s.id ? 'bg-[#FFE500]/20 text-[#1A1A0E] dark:text-[#F2F0E3]' : 'text-on-surface/70 hover:bg-on-surface/[0.04]'
                            )}
                          >
                            {s.name}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.10em] text-on-surface/40 block mb-1.5">Descrição (opcional)</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ex: Materiais de escritório pequenos"
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
                {saving ? 'Salvando…' : editing ? 'Salvar' : 'Criar Caixa'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

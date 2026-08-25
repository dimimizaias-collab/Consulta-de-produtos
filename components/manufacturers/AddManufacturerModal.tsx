'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Factory, Loader2, Plus, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { maskCnpj } from '@/lib/masks';

export interface Manufacturer {
  id: string;
  name: string;
  cnpj: string | null;
  prefix: string;
  active: boolean;
  next_seq: number;
}

interface AddManufacturerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (manufacturer: Manufacturer) => void;
  editingManufacturer?: Manufacturer | null;
}

const inputCls =
  'w-full bg-surface-container-low border border-on-surface/[0.03] rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 font-bold transition-all shadow-sm placeholder:font-normal placeholder:text-on-surface/30';
const labelCls = 'text-[10px] font-black text-on-surface/30 uppercase tracking-[0.2em]';

export function AddManufacturerModal({ isOpen, onClose, onSuccess, editingManufacturer }: AddManufacturerModalProps) {
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [prefix, setPrefix] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEditing = !!editingManufacturer;
  // Uma vez que um código já foi gerado pra esse fabricante (next_seq > 1), o prefixo trava —
  // mudar depois deixaria os códigos já emitidos "órfãos" de um prefixo que não existe mais.
  const prefixLocked = isEditing && (editingManufacturer!.next_seq ?? 1) > 1;

  useEffect(() => {
    if (!isOpen) return;
    if (editingManufacturer) {
      setName(editingManufacturer.name || '');
      setCnpj(editingManufacturer.cnpj ? maskCnpj(editingManufacturer.cnpj) : '');
      setPrefix(editingManufacturer.prefix || '');
      setActive(editingManufacturer.active ?? true);
    } else {
      setName('');
      setCnpj('');
      setPrefix('');
      setActive(true);
    }
    setError('');
  }, [isOpen, editingManufacturer]);

  const handleClose = () => { setError(''); onClose(); };

  const handlePrefixChange = (v: string) => {
    // Só dígitos, no máximo 3 — normalização final (zero-padding) acontece no submit.
    setPrefix(v.replace(/\D/g, '').slice(0, 3));
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Nome é obrigatório.'); return; }
    if (!prefix.trim()) { setError('Prefixo é obrigatório — só números.'); return; }
    const paddedPrefix = prefix.padStart(3, '0');
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        cnpj: cnpj.replace(/\D/g, '') || null,
        prefix: paddedPrefix,
        active,
      };

      if (isEditing) {
        const { data, error: dbError } = await supabase
          .from('manufacturers')
          .update(prefixLocked ? { name: payload.name, cnpj: payload.cnpj, active: payload.active } : payload)
          .eq('id', editingManufacturer!.id)
          .select()
          .single();
        if (dbError) throw dbError;
        onSuccess?.(data as Manufacturer);
      } else {
        const { data, error: dbError } = await supabase
          .from('manufacturers')
          .insert([payload])
          .select()
          .single();
        if (dbError) throw dbError;
        onSuccess?.(data as Manufacturer);
      }
      onClose();
    } catch (err: any) {
      if (err?.code === '23505') {
        setError('Já existe um fabricante com esse prefixo.');
      } else {
        setError(err.message || 'Erro ao salvar fabricante.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-on-surface/60 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-surface-container-lowest rounded-[2rem] p-10 max-w-md w-full shadow-2xl ring-1 ring-on-surface/5"
          >
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/20">
                  <Factory size={28} />
                </div>
                <div>
                  <h4 className="text-xl font-black text-on-surface tracking-tight">
                    {isEditing ? 'Editar Fabricante' : 'Novo Fabricante'}
                  </h4>
                  <p className="text-xs text-on-surface/40 font-medium">
                    {isEditing ? 'Atualizar dados cadastrais' : 'Cadastrar fabricante/marca'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="w-9 h-9 rounded-xl hover:bg-on-surface/5 flex items-center justify-center text-on-surface/40 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className={labelCls}>
                  Nome <span className="text-primary">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); setError(''); }}
                  onKeyUp={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="ex: Nestlé"
                  className={cn(inputCls, error && !name.trim() && 'ring-2 ring-rose-500/30 border-rose-500/30')}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className={labelCls}>CNPJ</label>
                <input
                  type="text"
                  value={cnpj}
                  onChange={e => setCnpj(maskCnpj(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  className={inputCls}
                />
              </div>

              <div className="space-y-2">
                <label className={labelCls}>
                  Prefixo (código interno) <span className="text-primary">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={prefix}
                  onChange={e => handlePrefixChange(e.target.value)}
                  onKeyUp={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="ex: 7"
                  disabled={prefixLocked}
                  className={cn(inputCls, 'font-mono tracking-widest', prefixLocked && 'opacity-50 cursor-not-allowed')}
                />
                <p className="text-[10px] text-on-surface/35 font-medium leading-relaxed">
                  {prefixLocked
                    ? 'Prefixo travado — já existem códigos gerados para este fabricante.'
                    : 'Só números. Vira código no formato 7816-XXX-00001 (XXX = prefixo com 3 dígitos).'}
                </p>
              </div>

              {isEditing && (
                <button
                  type="button"
                  onClick={() => setActive(v => !v)}
                  className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all text-left',
                    active ? 'border-emerald-400/40 bg-emerald-500/5' : 'border-on-surface/10 bg-on-surface/[0.02]')}
                >
                  <div className={cn('w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors',
                    active ? 'bg-emerald-500' : 'border-2 border-on-surface/20')}>
                    {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-xs font-black', active ? 'text-emerald-600' : 'text-on-surface/40')}>
                      {active ? 'Ativo' : 'Inativo'}
                    </p>
                    <p className="text-[10px] text-on-surface/35 leading-tight">
                      Fabricante inativo some das opções de seleção em produtos novos.
                    </p>
                  </div>
                </button>
              )}

              {error && <p className="text-xs text-rose-500 font-semibold">{error}</p>}
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={handleClose}
                className="flex-1 px-6 py-4 rounded-2xl font-black text-on-surface/40 hover:bg-on-surface/5 transition-all text-sm uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !name.trim() || !prefix.trim()}
                className="flex-[2] bg-primary text-white font-black py-4 rounded-2xl hover:bg-on-surface transition-all flex items-center justify-center gap-3 shadow-xl shadow-primary/20 disabled:opacity-30 uppercase tracking-[0.2em] text-sm"
              >
                {saving
                  ? <Loader2 size={18} className="animate-spin" />
                  : isEditing
                    ? <><Save size={18} />Salvar</>
                    : <><Plus size={18} />Cadastrar</>
                }
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

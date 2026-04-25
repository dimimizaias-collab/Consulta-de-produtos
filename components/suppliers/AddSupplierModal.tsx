'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Building2, Loader2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export interface NewSupplier {
  id: string;
  name: string;
  razao_social: string;
  nome_fantasia: string;
  documento: string;
}

interface AddSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (supplier: NewSupplier) => void;
}

const inputCls =
  'w-full bg-surface-container-low border border-on-surface/[0.03] rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 font-bold transition-all shadow-sm placeholder:font-normal placeholder:text-on-surface/30';
const labelCls = 'text-[10px] font-black text-on-surface/30 uppercase tracking-[0.2em]';

export function AddSupplierModal({ isOpen, onClose, onSuccess }: AddSupplierModalProps) {
  const [documento, setDocumento] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setDocumento('');
    setRazaoSocial('');
    setNomeFantasia('');
    setError('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!razaoSocial.trim()) { setError('Razão Social é obrigatória.'); return; }
    setSaving(true);
    setError('');
    try {
      const { data, error: dbError } = await supabase
        .from('suppliers')
        .insert([{
          name: razaoSocial.trim(),
          razao_social: razaoSocial.trim(),
          nome_fantasia: nomeFantasia.trim(),
          documento: documento.trim(),
        }])
        .select()
        .single();
      if (dbError) throw dbError;
      onSuccess?.(data as NewSupplier);
      reset();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar fornecedor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
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
                  <Building2 size={28} />
                </div>
                <div>
                  <h4 className="text-xl font-black text-on-surface tracking-tight">Novo Fornecedor</h4>
                  <p className="text-xs text-on-surface/40 font-medium">Cadastrar parceiro comercial</p>
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
                  Documento <span className="normal-case text-on-surface/20 tracking-normal">(CNPJ ou CPF)</span>
                </label>
                <input
                  type="text"
                  value={documento}
                  onChange={e => setDocumento(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className={inputCls}
                />
              </div>

              <div className="space-y-2">
                <label className={labelCls}>
                  Razão Social <span className="text-primary">*</span>
                </label>
                <input
                  type="text"
                  value={razaoSocial}
                  onChange={e => { setRazaoSocial(e.target.value); setError(''); }}
                  onKeyUp={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="ex: MONDELEZ BRASIL LTDA"
                  className={cn(inputCls, error && 'ring-2 ring-rose-500/30 border-rose-500/30')}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className={labelCls}>Nome Fantasia</label>
                <input
                  type="text"
                  value={nomeFantasia}
                  onChange={e => setNomeFantasia(e.target.value)}
                  placeholder="ex: Mondelez"
                  className={inputCls}
                />
              </div>

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
                disabled={saving || !razaoSocial.trim()}
                className="flex-[2] bg-primary text-white font-black py-4 rounded-2xl hover:bg-on-surface transition-all flex items-center justify-center gap-3 shadow-xl shadow-primary/20 disabled:opacity-30 uppercase tracking-[0.2em] text-sm"
              >
                {saving
                  ? <Loader2 size={18} className="animate-spin" />
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

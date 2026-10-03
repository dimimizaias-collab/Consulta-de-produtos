'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Factory, Loader2, Plus, Users, Wand2, Check, AlertTriangle } from 'lucide-react';
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

type ManufacturerRef = Pick<Manufacturer, 'id' | 'name' | 'cnpj' | 'prefix'>;

// Padrão quadrado (mesmo da Movimentação / Produto): campos de 34px com rótulo em cima.
const inputCls =
  'w-full h-[34px] px-2.5 bg-white dark:bg-[#1E1E18] text-[13px] font-semibold text-on-surface border border-[#E0D8BF] dark:border-white/[0.10] outline-none caret-[#D81E1E] hover:border-[#CFC4A2] dark:hover:border-white/[0.20] focus:!border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] placeholder:text-on-surface/25 placeholder:font-medium transition-[border-color,box-shadow]';
const monoCls = 'font-mono text-[12.5px] font-medium tracking-[0.04em]';
const labelCls = 'flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.1em] text-[#1A1A0E]/[0.58] dark:text-[#F2F0E3]/55 pl-px';
const hintCls = 'text-[10.5px] font-semibold leading-snug text-on-surface/45 pl-px';
const okCls = 'flex items-start gap-1.5 text-[10.5px] font-bold leading-snug text-[#0A7A55] dark:text-[#34D399] pl-px';
const warnBoxCls = 'flex items-start gap-1.5 px-2 py-1.5 text-[10.5px] font-bold leading-snug text-[#B45309] dark:text-[#FCD34D] bg-[rgba(217,119,6,0.08)] dark:bg-[rgba(252,211,77,0.07)] border border-[rgba(217,119,6,0.45)] dark:border-[rgba(252,211,77,0.40)]';
const errBoxCls = 'flex items-start gap-1.5 px-2 py-1.5 text-[10.5px] font-bold leading-snug text-[#D81E1E] bg-[#D81E1E]/[0.06] border border-[#D81E1E]/35';

export function AddManufacturerModal({ isOpen, onClose, onSuccess, editingManufacturer }: AddManufacturerModalProps) {
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [prefix, setPrefix] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Lista dos fabricantes já cadastrados — base do aviso de CNPJ repetido, da checagem de
  // prefixo em uso e do botão "Gerar". Busca própria pra funcionar em qualquer tela que abra o modal.
  const [existing, setExisting] = useState<ManufacturerRef[] | null>(null);

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
    setExisting(null);
    let alive = true;
    supabase.from('manufacturers').select('id, name, cnpj, prefix').then(({ data }) => {
      if (alive) setExisting((data as ManufacturerRef[]) || []);
    });
    return () => { alive = false; };
  }, [isOpen, editingManufacturer]);

  const others = useMemo(
    () => (existing || []).filter(m => m.id !== editingManufacturer?.id),
    [existing, editingManufacturer]
  );

  const cnpjDigits = cnpj.replace(/\D/g, '');
  // CNPJ repetido é só aviso: várias marcas podem pertencer ao mesmo fabricante (mesmo CNPJ).
  const cnpjOwner = cnpjDigits.length === 14
    ? others.find(m => (m.cnpj || '').replace(/\D/g, '') === cnpjDigits) || null
    : null;

  const paddedPrefix = prefix ? prefix.padStart(3, '0') : '';
  // Prefixo repetido bloqueia — o banco tem unique no prefixo.
  const prefixOwner = paddedPrefix && !prefixLocked
    ? others.find(m => m.prefix === paddedPrefix) || null
    : null;

  const handleClose = () => { setError(''); onClose(); };

  const handlePrefixChange = (v: string) => {
    // Só dígitos, no máximo 3 — normalização final (zero-padding) acontece no submit.
    setPrefix(v.replace(/\D/g, '').slice(0, 3));
    setError('');
  };

  // Menor prefixo livre entre 001 e 999.
  const handleGeneratePrefix = () => {
    if (!existing) return;
    const used = new Set(others.map(m => parseInt(m.prefix, 10)).filter(n => !isNaN(n)));
    let n = 1;
    while (used.has(n) && n <= 999) n++;
    if (n > 999) { setError('Não há prefixo livre entre 001 e 999.'); return; }
    setPrefix(String(n).padStart(3, '0'));
    setError('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Nome é obrigatório.'); return; }
    if (!prefix.trim()) { setError('Prefixo é obrigatório — só números.'); return; }
    if (prefixOwner) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        cnpj: cnpjDigits || null,
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

  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSubmit(); };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="relative w-full max-w-md bg-[#FDFAF0] dark:bg-[#1E1E18] shadow-2xl border border-black/[0.12] dark:border-white/[0.08] flex flex-col max-h-[90vh] overflow-hidden"
          >
            {/* Barra de título — mesma cor do cabeçalho do site */}
            <div className="h-12 pl-3.5 pr-3 flex items-center gap-[11px] bg-[#FBF35E] dark:bg-[#252520] border-b border-[#D9CF45] dark:border-white/[0.08] shrink-0">
              <div className="w-[30px] h-[30px] flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                <Factory size={15} strokeWidth={2.3} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="truncate text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">
                  {isEditing ? 'Editar Fabricante' : 'Novo Fabricante'}
                </h4>
                <p className="truncate text-[10.5px] font-bold text-[#1A1A0E]/50 dark:text-[#F2F0E3]/40">
                  {isEditing ? 'Atualizar dados cadastrais' : 'Cadastrar fabricante/marca'}
                </p>
              </div>
              <button
                onClick={handleClose}
                title="Fechar"
                className="w-[30px] h-[30px] flex items-center justify-center shrink-0 border border-black/[0.14] dark:border-white/[0.10] text-black/50 dark:text-white/40 hover:bg-[#D81E1E]/[0.09] hover:text-[#D81E1E] hover:border-[#D81E1E]/25 active:scale-[0.93] transition-all duration-[130ms]"
              >
                <X size={15} strokeWidth={2.6} />
              </button>
            </div>

            <div className="px-3.5 py-3 overflow-y-auto">
              <div className="bg-[#F1EAD3] dark:bg-[#181814] border border-[#E0D8BF] dark:border-white/[0.10]">
                <div className="h-7 flex items-center gap-2 px-2.5 bg-[#FFEC4D] border-b-[1.5px] border-[#8F7E10]">
                  <Users size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                  <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[rgba(26,26,10,0.55)]">Dados do fabricante</span>
                </div>

                <div className="p-2.5 grid gap-2.5">
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Nome <span className="text-[#D81E1E]">*</span></label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => { setName(e.target.value); setError(''); }}
                      onKeyUp={onEnter}
                      placeholder="ex: Nestlé"
                      className={cn(inputCls, error && !name.trim() && '!border-[#D81E1E]/55')}
                      autoFocus
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>CNPJ</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cnpj}
                      onChange={e => setCnpj(maskCnpj(e.target.value))}
                      onKeyUp={onEnter}
                      placeholder="00.000.000/0000-00"
                      className={cn(inputCls, monoCls, cnpjOwner && 'border-[rgba(217,119,6,0.45)] dark:border-[rgba(252,211,77,0.40)]')}
                    />
                    {cnpjOwner ? (
                      <div className={warnBoxCls}>
                        <AlertTriangle size={12} strokeWidth={2.6} className="shrink-0 mt-px" />
                        <span>
                          CNPJ já cadastrado em <b className="text-on-surface">{cnpjOwner.name}</b> (prefixo {cnpjOwner.prefix}). Se for outra marca do mesmo fabricante, pode seguir.
                        </span>
                      </div>
                    ) : cnpjDigits.length === 14 && existing ? (
                      <div className={okCls}>
                        <Check size={12} strokeWidth={2.8} className="shrink-0 mt-px" />
                        <span>CNPJ não cadastrado</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Prefixo (código interno) <span className="text-[#D81E1E]">*</span></label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={prefix}
                        onChange={e => handlePrefixChange(e.target.value)}
                        onKeyUp={onEnter}
                        placeholder="ex: 7"
                        disabled={prefixLocked}
                        className={cn(
                          inputCls, monoCls, 'flex-1 min-w-0',
                          prefixLocked && 'bg-black/[0.035] dark:bg-white/[0.03] text-on-surface/45 cursor-not-allowed hover:border-[#E0D8BF] dark:hover:border-white/[0.10]',
                          prefixOwner && '!border-[#D81E1E]/55'
                        )}
                      />
                      {!prefixLocked && (
                        <button
                          type="button"
                          onClick={handleGeneratePrefix}
                          disabled={!existing}
                          title="Gerar o próximo prefixo livre"
                          className="h-[34px] shrink-0 flex items-center gap-1.5 px-[11px] border border-dashed border-[#D81E1E]/45 bg-white dark:bg-[#1E1E18] text-[#D81E1E] text-[10px] font-black uppercase tracking-[0.06em] hover:bg-[#D81E1E]/[0.06] active:scale-[0.97] transition-all duration-[130ms] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {existing ? <Wand2 size={13} strokeWidth={2.4} /> : <Loader2 size={13} className="animate-spin" />}
                          Gerar
                        </button>
                      )}
                    </div>
                    {prefixLocked ? (
                      <p className={hintCls}>Prefixo travado — já existem códigos gerados para este fabricante.</p>
                    ) : prefixOwner ? (
                      <div className={errBoxCls}>
                        <AlertTriangle size={12} strokeWidth={2.6} className="shrink-0 mt-px" />
                        <span>
                          Prefixo {paddedPrefix} já é usado por <b className="text-on-surface">{prefixOwner.name}</b>. Use “Gerar” para pegar um livre.
                        </span>
                      </div>
                    ) : paddedPrefix && existing ? (
                      <div className={okCls}>
                        <Check size={12} strokeWidth={2.8} className="shrink-0 mt-px" />
                        <span>Prefixo livre — códigos sairão como <span className="font-mono">7816-{paddedPrefix}-00001</span></span>
                      </div>
                    ) : (
                      <p className={hintCls}>
                        Só números. Vira código no formato <span className="font-mono text-on-surface">7816-XXX-00001</span> (XXX = prefixo com 3 dígitos).
                      </p>
                    )}
                  </div>

                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => setActive(v => !v)}
                      className="h-10 flex items-center gap-2.5 px-2.5 border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-left hover:border-[#CFC4A2] dark:hover:border-white/[0.20] transition-colors"
                    >
                      <span className={cn('relative w-[26px] h-3.5 rounded-full shrink-0 transition-colors duration-[130ms]', active ? 'bg-emerald-600' : 'bg-black/20 dark:bg-white/20')}>
                        <span className={cn('absolute top-0.5 left-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform duration-[130ms]', active && 'translate-x-3')} />
                      </span>
                      <span className={cn('text-[11px] font-black uppercase tracking-[0.06em]', active ? 'text-[#0A7A55] dark:text-[#34D399]' : 'text-on-surface/45')}>
                        {active ? 'Ativo' : 'Inativo'}
                      </span>
                      <span className="text-[10.5px] font-semibold text-on-surface/45 truncate">
                        Inativo some das opções em produtos novos
                      </span>
                    </button>
                  )}

                  {error && <p className="text-[11px] font-bold text-[#D81E1E] pl-px">{error}</p>}
                </div>
              </div>
            </div>

            <div className="px-3.5 py-2.5 bg-[#EFE7CD] dark:bg-[#181814] border-t border-[#DDD2B0] dark:border-white/[0.08] flex items-center gap-2 shrink-0">
              <button
                onClick={handleClose}
                className="ml-auto h-9 px-[18px] border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-[12px] font-extrabold uppercase tracking-[0.04em] text-on-surface hover:bg-on-surface/[0.05] active:scale-[0.97] transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !name.trim() || !prefix.trim() || !!prefixOwner}
                className="h-9 px-[18px] flex items-center justify-center gap-2 bg-[#D81E1E] hover:bg-[#B91818] text-white text-[12px] font-extrabold uppercase tracking-[0.04em] active:scale-[0.97] transition-all disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {saving
                  ? <Loader2 size={14} className="animate-spin" />
                  : isEditing
                    ? 'Salvar'
                    : <><Plus size={14} strokeWidth={2.8} />Cadastrar</>
                }
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

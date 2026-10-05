'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Building2, Loader2, Plus, Save, AlertTriangle, Check, ExternalLink, Wallet, Landmark, Link2Off, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { maskDocumento, type DocumentoTipo } from '@/lib/masks';
import { squareTabCls, squareTabsBarCls } from '@/components/shared/squareTabs';

export type { DocumentoTipo };

export interface NewSupplier {
  id: string;
  name: string;
  razao_social: string;
  nome_fantasia: string;
  documento: string;
  documento_tipo: DocumentoTipo;
}

export interface EditingSupplier {
  id: string;
  name: string;
  razao_social: string;
  nome_fantasia: string;
  documento: string;
  documento_tipo: DocumentoTipo;
}

interface AddSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (supplier: NewSupplier) => void;
  editingSupplier?: EditingSupplier | null;
}

interface LinkedFavorecido {
  id: string;
  nome_fiscal: string;
  nome_banco: string;
  apelidos?: string[] | null;
}

type Tab = 'dados' | 'favorecidos';

// Padrão quadrado (mesmo do Fabricante / Favorecido / Editar Produto).
const inputCls = 'w-full min-w-0 h-[34px] px-2.5 bg-white dark:bg-[#1E1E18] text-[13px] font-semibold text-on-surface border border-[#E0D8BF] dark:border-white/[0.10] outline-none caret-[#D81E1E] hover:border-[#CFC4A2] dark:hover:border-white/[0.20] focus:!border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] placeholder:text-on-surface/25 placeholder:font-medium transition-[border-color,box-shadow]';
const monoCls = 'font-mono text-[12.5px] font-medium tracking-[0.03em]';
const labelCls = 'flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.1em] text-[#1A1A0E]/[0.58] dark:text-[#F2F0E3]/55 pl-px mb-1';
const sectionCls = 'bg-[#F1EAD3] dark:bg-[#181814] border border-[#E0D8BF] dark:border-white/[0.10]';
const sectionHeadCls = 'h-7 flex items-center gap-2 px-2.5 bg-[#FFEC4D] border-b-[1.5px] border-[#8F7E10]';
const sectionTitleCls = 'text-[9px] font-black uppercase tracking-[0.1em] text-[rgba(26,26,10,0.55)]';
const sectionCountCls = 'ml-auto text-[10px] font-extrabold text-[rgba(26,26,10,0.55)]';

const onlyDigits = (v: string) => v.replace(/\D/g, '');

export function AddSupplierModal({ isOpen, onClose, onSuccess, editingSupplier }: AddSupplierModalProps) {
  // Fornecedor sendo editado — começa no da prop, mas o atalho "Abrir cadastro existente"
  // troca para o dono do CNPJ duplicado sem fechar o modal.
  const [target, setTarget] = useState<EditingSupplier | null>(null);
  const [tab, setTab] = useState<Tab>('dados');
  const [documento, setDocumento] = useState('');
  const [documentoTipo, setDocumentoTipo] = useState<DocumentoTipo>('CNPJ');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [allSuppliers, setAllSuppliers] = useState<EditingSupplier[] | null>(null);
  const [favorecidos, setFavorecidos] = useState<LinkedFavorecido[] | null>(null);

  const isEditing = !!target;

  function loadInto(s: EditingSupplier | null) {
    setTarget(s);
    setDocumento(s?.documento || '');
    setDocumentoTipo(s?.documento_tipo || 'CNPJ');
    setRazaoSocial(s ? (s.razao_social || s.name || '') : '');
    setNomeFantasia(s?.nome_fantasia || '');
    setError('');
  }

  useEffect(() => {
    if (!isOpen) return;
    loadInto(editingSupplier ?? null);
    setTab('dados');
    let alive = true;
    supabase.from('suppliers').select('id, name, razao_social, nome_fantasia, documento, documento_tipo').then(({ data }) => {
      if (alive) setAllSuppliers((data ?? []) as EditingSupplier[]);
    });
    return () => { alive = false; };
  }, [isOpen, editingSupplier]);

  useEffect(() => {
    setFavorecidos(null);
    if (!isOpen || !target) return;
    let alive = true;
    supabase.from('finance_favorecidos').select('*').eq('supplier_id', target.id).order('nome_fiscal').then(({ data }) => {
      if (alive) setFavorecidos((data ?? []) as LinkedFavorecido[]);
    });
    return () => { alive = false; };
  }, [isOpen, target]);

  const docDigits = onlyDigits(documento);
  const docComplete = docDigits.length === (documentoTipo === 'CPF' ? 11 : 14);
  const docOwner = docComplete && allSuppliers
    ? allSuppliers.find(s => s.id !== target?.id && onlyDigits(s.documento || '') === docDigits) ?? null
    : null;
  const canSave = !!razaoSocial.trim() && !docOwner && !saving;

  const handleClose = () => { setError(''); onClose(); };

  const handleSubmit = async () => {
    if (!razaoSocial.trim()) { setError('Razão Social é obrigatória.'); return; }
    if (docOwner) { setError(`Este ${documentoTipo} já pertence a ${docOwner.nome_fantasia || docOwner.name}.`); return; }
    setSaving(true);
    setError('');
    try {
      // Checagem final no banco (a lista carregada pode estar desatualizada).
      if (docDigits.length >= 11) {
        const { data: same } = await supabase.from('suppliers').select('id, name, documento');
        const clash = (same ?? []).find((s: any) => s.id !== target?.id && onlyDigits(s.documento || '') === docDigits);
        if (clash) throw new Error(`Este ${documentoTipo} já pertence a ${clash.name}.`);
      }
      const displayName = nomeFantasia.trim() || razaoSocial.trim();
      const payload = {
        name: displayName,
        razao_social: razaoSocial.trim(),
        nome_fantasia: nomeFantasia.trim(),
        documento: documento.trim(),
        documento_tipo: documentoTipo,
      };

      const query = target
        ? supabase.from('suppliers').update(payload).eq('id', target.id)
        : supabase.from('suppliers').insert([payload]);
      const { data, error: dbError } = await query.select().single();
      if (dbError) throw dbError;
      onSuccess?.(data as NewSupplier);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar fornecedor.');
    } finally {
      setSaving(false);
    }
  };

  const favCount = favorecidos?.length ?? 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/55"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="relative w-full max-w-[640px] max-h-[90vh] flex flex-col overflow-hidden bg-[#FDFAF0] dark:bg-[#1E1E18] border border-black/[0.12] dark:border-white/[0.08] shadow-2xl"
          >
            {/* Barra de título */}
            <div className="h-12 pl-3.5 pr-3 flex items-center gap-[11px] bg-[#FBF35E] dark:bg-[#252520] border-b border-[#D9CF45] dark:border-white/[0.08] shrink-0">
              <div className="w-[30px] h-[30px] flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                <Building2 size={15} strokeWidth={2.3} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="truncate text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">
                  {isEditing ? 'Editar Fornecedor' : 'Novo Fornecedor'}
                </h4>
                <p className="truncate text-[10.5px] font-bold text-[#1A1A0E]/50 dark:text-[#F2F0E3]/40">
                  {target
                    ? [target.nome_fantasia || target.name, target.documento].filter(Boolean).join(' · ')
                    : 'Cadastrar parceiro comercial'}
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

            {/* Abas penduradas */}
            <div className={squareTabsBarCls}>
              <button type="button" onClick={() => setTab('dados')} className={squareTabCls(tab === 'dados', true)}>
                <span className={cn('transition-opacity', tab === 'dados' ? 'opacity-100' : 'opacity-55 hover:opacity-85')}>Dados</span>
              </button>
              <button
                type="button"
                disabled={!isEditing}
                onClick={() => setTab('favorecidos')}
                title={isEditing ? undefined : 'Disponível depois de cadastrar o fornecedor'}
                className={squareTabCls(tab === 'favorecidos', false)}
              >
                <span className={cn('transition-opacity', !isEditing ? 'opacity-25' : tab === 'favorecidos' ? 'opacity-100' : 'opacity-55 hover:opacity-85')}>Favorecidos</span>
                {isEditing && favorecidos && (
                  <span className="text-[9px] font-black px-1.5 py-px rounded-full bg-black/[0.12] dark:bg-white/10">{favCount}</span>
                )}
              </button>
            </div>

            <div className="flex-1 min-h-[330px] overflow-y-auto px-3.5 py-3 flex flex-col gap-2.5">
              {tab === 'dados' ? (
                <div className={sectionCls}>
                  <div className={sectionHeadCls}>
                    <Building2 size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                    <span className={sectionTitleCls}>Identificação</span>
                  </div>
                  <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="sm:col-span-2 min-w-0">
                      <label className={labelCls}>Razão social <span className="text-[#D81E1E]">*</span></label>
                      <input
                        type="text"
                        value={razaoSocial}
                        onChange={e => { setRazaoSocial(e.target.value); setError(''); }}
                        onKeyDown={e => { if (e.key === 'Enter' && canSave) handleSubmit(); }}
                        placeholder="ex: MONDELEZ BRASIL LTDA"
                        className={cn(inputCls, error && !razaoSocial.trim() && '!border-[#D81E1E]/55')}
                        autoFocus={!isEditing}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={labelCls}>CNPJ / CPF</label>
                      <div className="flex">
                        <div className="flex shrink-0 gap-0.5 p-0.5 border border-r-0 border-[#E0D8BF] dark:border-white/[0.10] bg-on-surface/[0.06]">
                          {(['CNPJ', 'CPF'] as DocumentoTipo[]).map(tipo => (
                            <button
                              key={tipo}
                              type="button"
                              onClick={() => { setDocumentoTipo(tipo); setDocumento(d => maskDocumento(d, tipo)); }}
                              className={cn(
                                'w-[42px] text-[9.5px] font-black tracking-[0.06em] transition-colors duration-[130ms]',
                                documentoTipo === tipo ? 'bg-[#D81E1E] text-white' : 'text-on-surface/45 hover:text-on-surface',
                              )}
                            >
                              {tipo}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={documento}
                          onChange={e => { setDocumento(maskDocumento(e.target.value, documentoTipo)); setError(''); }}
                          placeholder={documentoTipo === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
                          className={cn(inputCls, monoCls, 'flex-1', docOwner && '!border-[#D81E1E]/55')}
                        />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <label className={labelCls}>
                        Nome fantasia <span className="normal-case tracking-normal font-semibold opacity-60">(usado em todos os campos)</span>
                      </label>
                      <input
                        type="text"
                        value={nomeFantasia}
                        onChange={e => setNomeFantasia(e.target.value)}
                        placeholder="ex: Mondelez"
                        className={inputCls}
                        autoFocus={isEditing}
                      />
                    </div>

                    {docComplete && allSuppliers && (
                      docOwner ? (
                        <div className="sm:col-span-2 flex items-start gap-1.5 px-2 py-1.5 text-[10.5px] font-bold leading-snug text-[#D81E1E] bg-[#D81E1E]/[0.06] border border-[#D81E1E]/35">
                          <AlertTriangle size={12} strokeWidth={2.6} className="shrink-0 mt-px" />
                          <span className="flex flex-col items-start gap-1.5">
                            <span>
                              Este {documentoTipo} já pertence a <b className="text-on-surface">{docOwner.nome_fantasia || docOwner.name}</b>
                              {docOwner.razao_social && docOwner.razao_social !== (docOwner.nome_fantasia || docOwner.name) ? ` (${docOwner.razao_social})` : ''}.
                            </span>
                            <button
                              type="button"
                              onClick={() => loadInto(docOwner)}
                              className="h-6 px-2 inline-flex items-center gap-1.5 bg-[#D81E1E] hover:bg-[#B91818] text-white text-[9.5px] font-black uppercase tracking-[0.06em] active:scale-[0.97] transition-all"
                            >
                              <ExternalLink size={11} strokeWidth={2.6} /> Abrir cadastro existente
                            </button>
                          </span>
                        </div>
                      ) : (
                        <div className="sm:col-span-2 flex items-start gap-1.5 text-[10.5px] font-bold leading-snug text-[#0A7A55] dark:text-[#34D399] pl-px">
                          <Check size={12} strokeWidth={2.8} className="shrink-0 mt-px" />
                          <span>{documentoTipo} livre — nenhum outro fornecedor cadastrado com ele.</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <Wallet size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                      <span className={sectionTitleCls}>Favorecidos vinculados</span>
                      {favorecidos && <span className={sectionCountCls}>{favCount === 0 ? 'nenhum' : favCount}</span>}
                    </div>
                    {!favorecidos ? (
                      <div className="flex justify-center py-6">
                        <Loader2 size={18} className="animate-spin text-on-surface/30" />
                      </div>
                    ) : favCount === 0 ? (
                      <div className="m-2.5 flex flex-col items-center gap-1.5 text-center py-[18px] px-4 border border-dashed border-[#E0D8BF] dark:border-white/[0.12] text-on-surface/45">
                        <Link2Off size={16} className="opacity-55" />
                        <span className="text-[11.5px] font-bold max-w-[320px]">Nenhum favorecido do Controle Financeiro está vinculado a este fornecedor.</span>
                        <span className="text-[11px] font-semibold">Vincule em Controle Financeiro › Dados › Favorecidos.</span>
                      </div>
                    ) : (
                      <div className="p-2.5">
                        {favorecidos.map((f, idx) => (
                          <div
                            key={f.id}
                            className={cn(
                              'flex items-start gap-2.5 px-2.5 py-2 bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10]',
                              idx > 0 && 'border-t-0',
                            )}
                          >
                            <div className="w-[26px] h-[26px] flex items-center justify-center shrink-0 bg-[#D81E1E]/[0.08] text-[#D81E1E]">
                              <Landmark size={13} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12.5px] font-extrabold text-on-surface truncate">{f.nome_fiscal}</p>
                              {f.nome_banco ? (
                                <p className="mt-0.5 flex items-center gap-1.5 min-w-0">
                                  <span className="text-[7.5px] font-black uppercase tracking-[0.1em] text-on-surface/30">Extrato</span>
                                  <span className="font-mono text-[10px] text-on-surface/50 truncate">{f.nome_banco}</span>
                                </p>
                              ) : (
                                <p className="mt-0.5 text-[10px] italic font-semibold text-on-surface/30">sem mapeamento de extrato</p>
                              )}
                              {(f.apelidos ?? []).length > 0 && (
                                <p className="mt-1 flex flex-wrap gap-1">
                                  {(f.apelidos ?? []).map(ap => (
                                    <span key={ap} className="h-[18px] inline-flex items-center px-1.5 text-[10px] font-extrabold bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]">{ap}</span>
                                  ))}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="flex items-start gap-1.5 text-[10.5px] font-semibold leading-snug text-on-surface/45 pl-px">
                    <Info size={12} className="shrink-0 mt-px" />
                    <span>Vínculos e apelidos são editados em <b className="text-on-surface">Controle Financeiro › Dados › Favorecidos</b>.</span>
                  </p>
                </>
              )}
            </div>

            <div className="px-3.5 py-2.5 bg-[#EFE7CD] dark:bg-[#181814] border-t border-[#DDD2B0] dark:border-white/[0.08] flex items-center gap-2 shrink-0">
              {error && <p className="flex-1 min-w-0 text-[11px] font-bold text-[#D81E1E]">{error}</p>}
              <button
                onClick={handleClose}
                className="ml-auto h-9 px-[18px] border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-[12px] font-extrabold uppercase tracking-[0.04em] text-on-surface hover:bg-on-surface/[0.05] active:scale-[0.97] transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSave}
                className="h-9 px-[18px] flex items-center justify-center gap-2 bg-[#D81E1E] hover:bg-[#B91818] text-white text-[12px] font-extrabold uppercase tracking-[0.04em] active:scale-[0.97] transition-all disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {saving
                  ? <Loader2 size={14} className="animate-spin" />
                  : isEditing
                    ? <><Save size={14} strokeWidth={2.6} /> Salvar</>
                    : <><Plus size={14} strokeWidth={2.8} /> Cadastrar</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

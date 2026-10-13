'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Building2, Loader2, Landmark, Users, CreditCard } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { FavorecidoLite } from './FavorecidoEditModal';
import type { DocumentoTipo } from '@/lib/masks';

interface SupplierFull {
  name: string;
  razao_social: string;
  nome_fantasia: string;
  documento: string;
  documento_tipo: DocumentoTipo;
}

interface ContaRow {
  id: string;
  nome: string;
  identificacao_tipo: DocumentoTipo;
  identificacao: string;
  instituicao: string;
  agencia: string;
  conta: string;
  chave_pix: string | null;
}

interface FavorecidoDetailsModalProps {
  open: boolean;
  favorecido: FavorecidoLite | null;
  onClose: () => void;
  variant?: 'modal' | 'sheet';
}

export function FavorecidoDetailsModal({ open, favorecido, onClose, variant = 'modal' }: FavorecidoDetailsModalProps) {
  const [tab, setTab] = useState<'cadastro' | 'contas'>('cadastro');
  const [loading, setLoading] = useState(false);
  const [supplier, setSupplier] = useState<SupplierFull | null>(null);
  const [contas, setContas] = useState<ContaRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setTab('cadastro');
    setSupplier(null);
    setContas([]);
    if (favorecido?.supplier_id) loadSupplierData(favorecido.supplier_id);
  }, [open, favorecido]);

  async function loadSupplierData(supplierId: string) {
    setLoading(true);
    const [supRes, contasRes] = await Promise.all([
      supabase.from('suppliers').select('name, razao_social, nome_fantasia, documento, documento_tipo').eq('id', supplierId).maybeSingle(),
      supabase.from('supplier_bank_accounts').select('*').eq('supplier_id', supplierId).order('created_at'),
    ]);
    if (supRes.data) setSupplier(supRes.data as SupplierFull);
    setContas((contasRes.data ?? []) as ContaRow[]);
    setLoading(false);
  }

  const isLinked = !!favorecido?.supplier_id;
  const apelidos = favorecido?.apelidos ?? [];

  // Padrão quadrado — mesmos tokens do FavorecidoEditModal, com os campos só de leitura.
  const sectionCls = 'bg-[#F1EAD3] dark:bg-[#181814] border border-[#E0D8BF] dark:border-white/[0.10]';
  const sectionHeadCls = 'h-7 flex items-center gap-2 px-2.5 bg-[#FFEC4D] border-b-[1.5px] border-[#8F7E10]';
  const sectionTitleCls = 'text-[9px] font-black uppercase tracking-[0.1em] text-[rgba(26,26,10,0.55)]';
  const sectionCountCls = 'ml-auto flex items-center gap-1.5 text-[10px] font-extrabold text-[rgba(26,26,10,0.55)]';
  const labelCls = 'flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.1em] text-[#1A1A0E]/[0.58] dark:text-[#F2F0E3]/55 pl-px mb-1';
  const fieldCls = 'w-full min-w-0 h-[34px] px-2.5 flex items-center bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10] text-[13px] font-bold text-on-surface truncate';
  const fieldLockCls = 'w-full min-w-0 h-[34px] px-2.5 flex items-center bg-black/[0.035] dark:bg-white/[0.03] border border-[#E0D8BF] dark:border-white/[0.10] text-[13px] font-semibold text-on-surface/45 truncate select-none';
  const monoCls = 'font-mono text-[12.5px] font-medium tracking-[0.03em]';
  const emptyCls = 'm-2.5 flex flex-col items-center gap-1.5 text-center py-[18px] px-4 border border-dashed border-[#E0D8BF] dark:border-white/[0.12] text-on-surface/45';
  const kvLabelCls = 'block text-[8.5px] font-black uppercase tracking-[0.1em] text-on-surface/45 mb-0.5';
  const kvValCls = 'block text-[12.5px] font-bold text-on-surface truncate';

  const docTipo = supplier?.documento_tipo || 'CNPJ';

  const tabs = [
    { id: 'cadastro' as const, label: 'Cadastro', count: 0 },
    { id: 'contas' as const, label: 'Contas', count: contas.length },
  ];

  const body = (
    <>
      {/* Barra de título — mesma cor do cabeçalho do site */}
      <div className="h-12 pl-3.5 pr-3 flex items-center gap-[11px] bg-[#FBF35E] dark:bg-[#252520] border-b border-[#D9CF45] dark:border-white/[0.08] shrink-0">
        <div className="w-[30px] h-[30px] flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
          <Building2 size={15} strokeWidth={2.3} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="truncate text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">{favorecido?.nome_fiscal ?? '—'}</h2>
          <p className="truncate text-[10.5px] font-bold text-[#1A1A0E]/50 dark:text-[#F2F0E3]/40">Detalhes do favorecido</p>
        </div>
        <button
          onClick={onClose}
          title="Fechar"
          className="w-[30px] h-[30px] flex items-center justify-center shrink-0 border border-black/[0.14] dark:border-white/[0.10] text-black/50 dark:text-white/40 hover:bg-[#D81E1E]/[0.09] hover:text-[#D81E1E] hover:border-[#D81E1E]/25 active:scale-[0.93] transition-all duration-[130ms]"
        >
          <X size={15} strokeWidth={2.6} />
        </button>
      </div>

      {/* Abas penduradas na barra de título, iguais às do site */}
      <div className="flex shrink-0">
        {tabs.map((t, i) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'min-w-[112px] h-8 px-3.5 flex items-center justify-center gap-1.5 shrink-0',
                'bg-[#FBF35E] dark:bg-[#252520] border border-t-0 border-[#D9CF45] dark:border-white/[0.08]',
                i === 0 ? 'border-l-0' : '-ml-px',
                'text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#1A1A0E] dark:text-[#F2F0E3]',
                active
                  ? 'shadow-[inset_0_6px_8px_-5px_rgba(26,26,10,0.35),inset_0_-3px_0_#D81E1E] dark:shadow-[inset_0_6px_8px_-5px_rgba(0,0,0,0.55),inset_0_-3px_0_#D81E1E]'
                  : 'shadow-[inset_0_6px_8px_-5px_rgba(26,26,10,0.35)] dark:shadow-[inset_0_6px_8px_-5px_rgba(0,0,0,0.55)]',
                'transition-transform duration-150 active:scale-[0.97]',
              )}
            >
              <span className={cn('transition-opacity', active ? 'opacity-100' : 'opacity-55 hover:opacity-85')}>{t.label}</span>
              {t.count > 0 && (
                <span className="text-[9px] font-black px-1.5 py-px rounded-full bg-[rgba(26,26,10,0.12)] dark:bg-white/10">{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 pt-3 pb-3.5 flex flex-col gap-2.5">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={20} className="animate-spin text-on-surface/30" />
          </div>
        ) : tab === 'cadastro' ? (
          <>
            {/* ── Favorecido ── */}
            <div className={sectionCls}>
              <div className={sectionHeadCls}>
                <Users size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                <span className={sectionTitleCls}>Favorecido</span>
              </div>
              <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="min-w-0">
                  <span className={labelCls}>Nome fiscal</span>
                  <div className={fieldCls}>{favorecido?.nome_fiscal || '—'}</div>
                </div>
                <div className="min-w-0">
                  <span className={labelCls}>Nome no extrato</span>
                  <div className={cn(fieldCls, favorecido?.nome_banco ? monoCls : 'italic font-semibold text-on-surface/30')}>
                    {favorecido?.nome_banco || 'sem mapeamento'}
                  </div>
                </div>
                {apelidos.length > 0 && (
                  <div className="sm:col-span-2 min-w-0">
                    <span className={labelCls}>
                      Apelidos
                      <span className="ml-auto normal-case tracking-normal font-bold">{apelidos.length}</span>
                    </span>
                    <div className="min-h-[34px] px-1.5 py-1 flex flex-wrap items-center gap-1 bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10]">
                      {apelidos.map(ap => (
                        <span key={ap} className="h-6 inline-flex items-center px-2 bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E] text-[11.5px] font-extrabold">
                          {ap}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Identificação do fornecedor ── */}
            <div className={sectionCls}>
              <div className={sectionHeadCls}>
                <Building2 size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                <span className={sectionTitleCls}>Identificação do fornecedor</span>
                {isLinked ? (
                  <span className={cn(sectionCountCls, '!text-[#0A7A55]')}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />vinculado
                  </span>
                ) : (
                  <span className={sectionCountCls}>sem vínculo</span>
                )}
              </div>

              {!isLinked ? (
                <div className={emptyCls}>
                  <Building2 size={16} className="opacity-55" />
                  <span className="text-[11.5px] font-bold max-w-[300px]">Nenhum fornecedor vinculado a este favorecido</span>
                  <span className="text-[10.5px] font-semibold text-on-surface/30">Vincule em Editar favorecido para ver CNPJ e contas</span>
                </div>
              ) : (
                <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="sm:col-span-2 min-w-0">
                    <span className={labelCls}>Fornecedor vinculado</span>
                    <div className="h-[34px] flex items-center gap-2 px-2.5 border border-[#D81E1E]/35 bg-[#D81E1E]/[0.06] text-[13px] font-extrabold text-[#D81E1E]">
                      <Building2 size={13} className="shrink-0" />
                      <span className="flex-1 min-w-0 truncate">{supplier?.name || supplier?.razao_social || '—'}</span>
                      {supplier?.documento && (
                        <span className="hidden sm:inline font-mono text-[11px] font-medium text-on-surface/45 shrink-0">{supplier.documento}</span>
                      )}
                    </div>
                  </div>
                  <div className="sm:col-span-2 min-w-0">
                    <span className={labelCls}>Razão social</span>
                    <div className={fieldLockCls}>{supplier?.razao_social || '—'}</div>
                  </div>
                  <div className="min-w-0">
                    <span className={labelCls}>Identificação</span>
                    <div className="flex">
                      <div className="flex shrink-0 gap-0.5 p-0.5 border border-r-0 border-[#E0D8BF] dark:border-white/[0.10] bg-on-surface/[0.06] opacity-70">
                        {(['CNPJ', 'CPF'] as DocumentoTipo[]).map(tipo => (
                          <span
                            key={tipo}
                            className={cn(
                              'w-[42px] flex items-center justify-center text-[9.5px] font-black tracking-[0.06em]',
                              docTipo === tipo ? 'bg-[#D81E1E] text-white' : 'text-on-surface/45',
                            )}
                          >
                            {tipo}
                          </span>
                        ))}
                      </div>
                      <div className={cn(fieldLockCls, monoCls, 'flex-1')}>{supplier?.documento || '—'}</div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <span className={labelCls}>Nome fantasia</span>
                    <div className={fieldLockCls}>{supplier?.nome_fantasia || '—'}</div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── Contas ── */
          <div className={sectionCls}>
            <div className={sectionHeadCls}>
              <CreditCard size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
              <span className={sectionTitleCls}>Contas desse fornecedor</span>
              <span className={sectionCountCls}>
                {!isLinked ? '—' : contas.length === 0 ? 'nenhuma' : contas.length === 1 ? '1 conta' : `${contas.length} contas`}
              </span>
            </div>

            {!isLinked || contas.length === 0 ? (
              <div className={emptyCls}>
                <Landmark size={16} className="opacity-55" />
                <span className="text-[11.5px] font-bold max-w-[300px]">
                  {isLinked ? 'Nenhuma outra conta cadastrada para este fornecedor' : 'Vincule um fornecedor para ver contas'}
                </span>
              </div>
            ) : (
              <div className="p-2.5 flex flex-col gap-2">
                {contas.map((c, idx) => (
                  <div key={c.id} className="bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10]">
                    <div className="h-[30px] flex items-center gap-2 px-2.5 border-b border-[#E0D8BF] dark:border-white/[0.10] bg-black/[0.035] dark:bg-white/[0.03]">
                      <span className="w-[18px] h-[18px] flex items-center justify-center shrink-0 bg-[#1A1A0E] dark:bg-[#FFE500] text-[#FFE500] dark:text-[#1A1A0E] text-[10px] font-black">{idx + 1}</span>
                      <span className="flex-1 min-w-0 truncate text-[11.5px] font-extrabold text-on-surface">{c.nome || '—'}</span>
                      <span className="font-mono text-[11px] text-on-surface/45 shrink-0 truncate">
                        {c.identificacao_tipo} · {c.identificacao || '—'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 [&>div]:px-2.5 [&>div]:py-[7px] [&>div]:min-w-0">
                      <div>
                        <span className={kvLabelCls}>Instituição</span>
                        <span className={kvValCls}>{c.instituicao || '—'}</span>
                      </div>
                      <div className="border-l border-[#E0D8BF] dark:border-white/[0.10]">
                        <span className={kvLabelCls}>Agência</span>
                        <span className={cn(kvValCls, monoCls)}>{c.agencia || '—'}</span>
                      </div>
                      <div className="border-l border-[#E0D8BF] dark:border-white/[0.10]">
                        <span className={kvLabelCls}>Conta</span>
                        <span className={cn(kvValCls, monoCls)}>{c.conta || '—'}</span>
                      </div>
                      <div className="col-span-3 border-t border-[#E0D8BF] dark:border-white/[0.10]">
                        <span className={kvLabelCls}>Chave Pix</span>
                        <span className={cn(kvValCls, c.chave_pix ? monoCls : 'text-on-surface/30')}>{c.chave_pix || '—'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/55 z-[70]" onClick={onClose}
          />
          {variant === 'modal' ? (
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] w-[calc(100%-2rem)] max-w-[720px] max-h-[88vh] flex flex-col overflow-hidden bg-[#FDFAF0] dark:bg-[#1E1E18] border border-black/[0.12] dark:border-white/[0.08] shadow-2xl"
            >
              {body}
            </motion.div>
          ) : (
            <motion.div
              key="sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-x-0 bottom-0 z-[71] flex flex-col overflow-hidden bg-[#FDFAF0] dark:bg-[#1E1E18] border-t border-black/[0.12] dark:border-white/[0.08] shadow-2xl"
              style={{ maxHeight: '92svh' }}
            >
              <div className="flex justify-center py-1.5 bg-[#FBF35E] dark:bg-[#252520] shrink-0">
                <div className="w-10 h-1 rounded-full bg-black/20 dark:bg-white/20" />
              </div>
              {body}
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

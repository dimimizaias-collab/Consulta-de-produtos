'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Building2, Loader2, Landmark, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { FavorecidoLite } from './FavorecidoEditModal';
import type { DocumentoTipo } from '@/lib/masks';

interface SupplierFull {
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
      supabase.from('suppliers').select('razao_social, nome_fantasia, documento, documento_tipo').eq('id', supplierId).maybeSingle(),
      supabase.from('supplier_bank_accounts').select('*').eq('supplier_id', supplierId).order('created_at'),
    ]);
    if (supRes.data) setSupplier(supRes.data as SupplierFull);
    setContas((contasRes.data ?? []) as ContaRow[]);
    setLoading(false);
  }

  const isLinked = !!favorecido?.supplier_id;

  const fieldCls = 'w-full min-w-0 bg-on-surface/[0.03] border-[1.5px] border-dashed border-on-surface/[0.14] rounded-xl px-3.5 py-2.5 text-[13px] text-on-surface/80 min-h-[42px] flex items-center';
  const labelCls = 'text-[10px] font-extrabold uppercase tracking-wide text-on-surface/45 mb-1.5 block';
  const sectionTitleCls = 'flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-on-surface/38 mt-1';

  const viewRowCls = 'flex items-center gap-2.5 bg-surface border border-on-surface/[0.08] rounded-[13px] px-3.5 py-2.5';
  const viewRowIconCls = 'w-[26px] h-[26px] rounded-[8px] bg-primary/[0.08] dark:bg-primary/[0.15] text-primary flex items-center justify-center shrink-0';
  const viewRowLabelCls = 'text-[12.5px] font-semibold text-on-surface/55 shrink-0 w-[120px]';
  const viewRowValCls = 'flex-1 text-right text-[12.5px] font-extrabold text-on-surface truncate';

  const body = (
    <>
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-[13px] bg-primary/10 dark:bg-primary/15 flex items-center justify-center text-primary shrink-0">
          <Building2 size={19} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[16.5px] font-extrabold text-on-surface block truncate">{favorecido?.nome_fiscal ?? '—'}</span>
          <span className="text-[11px] text-on-surface/40 font-medium">Detalhes do favorecido</span>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-[11px] bg-on-surface/[0.06] flex items-center justify-center text-on-surface/45 hover:bg-primary/10 hover:text-primary shrink-0 active:scale-[0.93] transition-[background-color,color,transform]">
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex gap-1.5 mb-5 bg-on-surface/[0.05] p-1 rounded-xl">
        <button
          onClick={() => setTab('cadastro')}
          className={cn(
            'flex-1 py-2 rounded-[9px] text-[11px] font-extrabold uppercase tracking-wide transition-colors',
            tab === 'cadastro' ? 'bg-surface text-primary shadow-sm' : 'text-on-surface/45'
          )}
        >
          Cadastro
        </button>
        <button
          onClick={() => setTab('contas')}
          className={cn(
            'flex-1 py-2 rounded-[9px] text-[11px] font-extrabold uppercase tracking-wide transition-colors',
            tab === 'contas' ? 'bg-surface text-primary shadow-sm' : 'text-on-surface/45'
          )}
        >
          Contas{contas.length > 0 ? ` (${contas.length})` : ''}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin text-on-surface/30" />
        </div>
      ) : tab === 'cadastro' ? (
        <div className="flex flex-col gap-3.5">
          <div className={viewRowCls}>
            <div className={viewRowIconCls}><Building2 size={12} /></div>
            <span className={viewRowLabelCls}>Nome Fiscal</span>
            <span className={viewRowValCls}>{favorecido?.nome_fiscal || '—'}</span>
          </div>
          <div className={viewRowCls}>
            <div className={viewRowIconCls}><FileText size={12} /></div>
            <span className={viewRowLabelCls}>Nome no Extrato</span>
            <span className={cn(viewRowValCls, 'font-[\'DM_Mono\',monospace] font-semibold', !favorecido?.nome_banco && 'italic text-on-surface/30 font-sans font-semibold')}>
              {favorecido?.nome_banco || 'sem mapeamento'}
            </span>
          </div>

          <div className={sectionTitleCls}>
            <Building2 size={12} className="text-primary shrink-0" />
            Identificação do Fornecedor
            <span className="flex-1 h-px bg-on-surface/[0.08]" />
          </div>

          {!isLinked ? (
            <div className="flex flex-col items-center gap-2 text-center py-6 px-4 border-[1.5px] border-dashed border-on-surface/[0.14] rounded-2xl text-on-surface/35">
              <Building2 size={20} className="opacity-50" />
              <span className="text-[11.5px] font-bold max-w-[260px]">Nenhum fornecedor vinculado a este favorecido</span>
            </div>
          ) : (
            <>
              <div>
                <label className={labelCls}>Identificação</label>
                <div className="mb-2">
                  <span className="inline-flex px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wide bg-primary/10 text-primary">
                    {supplier?.documento_tipo || 'CNPJ'}
                  </span>
                </div>
                <div className={cn(fieldCls, 'font-mono')}>{supplier?.documento || '—'}</div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                  <label className={labelCls}>Razão Social</label>
                  <div className={fieldCls}>{supplier?.razao_social || '—'}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <label className={labelCls}>Nome Fantasia</label>
                  <div className={fieldCls}>{supplier?.nome_fantasia || '—'}</div>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {!isLinked || contas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 text-center py-8 px-4 border-[1.5px] border-dashed border-on-surface/[0.14] rounded-2xl text-on-surface/35">
              <Landmark size={20} className="opacity-50" />
              <span className="text-[11.5px] font-bold max-w-[260px]">
                {isLinked ? 'Nenhuma outra conta cadastrada para este fornecedor' : 'Vincule um fornecedor para ver contas'}
              </span>
            </div>
          ) : (
            contas.map(c => (
              <div key={c.id} className="bg-surface border border-on-surface/[0.09] rounded-2xl p-3.5 shadow-[0_2px_10px_rgba(26,26,10,0.05)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
                <div className="flex gap-2 mb-2.5">
                  <div className="flex-1 min-w-0 bg-on-surface/[0.035] border border-on-surface/[0.08] rounded-xl px-3 py-2">
                    <span className="block text-[9px] font-extrabold uppercase tracking-wide text-on-surface/35 mb-0.5">Nome</span>
                    <span className="text-[12.5px] font-extrabold text-on-surface truncate block">{c.nome}</span>
                  </div>
                  <div className="shrink-0 bg-on-surface/[0.035] border border-on-surface/[0.08] rounded-xl px-3 py-2">
                    <span className="block text-[9px] font-extrabold uppercase tracking-wide text-on-surface/35 mb-0.5">Identificação</span>
                    <span className="text-[11.5px] font-bold text-on-surface/80 font-mono whitespace-nowrap">
                      {c.identificacao_tipo} · {c.identificacao || '—'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11.5px]">
                  <div>
                    <span className="block text-[9px] font-extrabold uppercase tracking-wide text-on-surface/35 mb-0.5">Instituição</span>
                    <span className="font-semibold text-on-surface/80">{c.instituicao || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-extrabold uppercase tracking-wide text-on-surface/35 mb-0.5">Conta</span>
                    <span className="font-semibold text-on-surface/80 font-mono">{c.conta || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-extrabold uppercase tracking-wide text-on-surface/35 mb-0.5">Agência</span>
                    <span className="font-semibold text-on-surface/80 font-mono">{c.agencia || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-extrabold uppercase tracking-wide text-on-surface/35 mb-0.5">Chave Pix</span>
                    <span className="font-semibold text-on-surface/80 font-mono">{c.chave_pix || '—'}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
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
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] w-full max-w-[672px] max-h-[90vh] overflow-y-auto bg-surface-container border border-on-surface/[0.08] rounded-[24px] p-7 shadow-2xl"
            >
              {body}
            </motion.div>
          ) : (
            <motion.div
              key="sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-x-0 bottom-0 z-[71] bg-surface-container rounded-t-[28px] shadow-2xl overflow-y-auto overflow-x-hidden p-5"
              style={{ maxHeight: '92svh' }}
            >
              <div className="flex justify-center pb-2 -mt-1">
                <div className="w-10 h-1 rounded-full bg-on-surface/[0.15]" />
              </div>
              {body}
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Building2, Plus, Trash2, Check, Loader2, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { maskDocumento, type DocumentoTipo } from '@/lib/masks';

export interface FavorecidoLite {
  id: string;
  nome_fiscal: string;
  nome_banco: string;
  supplier_id: string | null;
}

export interface SupplierLite {
  id: string;
  name: string;
}

interface SupplierFull {
  razao_social: string;
  nome_fantasia: string;
  documento: string;
  documento_tipo: DocumentoTipo;
}

interface ContaDraft {
  localId: string;
  id: string | null; // null = ainda não existe no banco
  nome: string;
  identificacaoTipo: DocumentoTipo;
  identificacao: string;
  instituicao: string;
  agencia: string;
  conta: string;
  chavePix: string;
}

function emptyConta(): ContaDraft {
  return { localId: crypto.randomUUID(), id: null, nome: '', identificacaoTipo: 'CNPJ', identificacao: '', instituicao: '', agencia: '', conta: '', chavePix: '' };
}

interface FavorecidoEditModalProps {
  open: boolean;
  favorecido: FavorecidoLite | null;
  /** Pré-preenche o nome fiscal ao criar um novo favorecido (ex.: promovendo uma pendência). Ignorado em modo de edição. */
  initialNomeFiscal?: string;
  suppliers: SupplierLite[];
  onClose: () => void;
  onSaved: () => void;
  variant?: 'modal' | 'sheet';
}

export function FavorecidoEditModal({ open, favorecido, initialNomeFiscal, suppliers, onClose, onSaved, variant = 'modal' }: FavorecidoEditModalProps) {
  const [nomeBanco, setNomeBanco] = useState('');
  const [nomeFiscal, setNomeFiscal] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  const [documentoTipo, setDocumentoTipo] = useState<DocumentoTipo>('CNPJ');
  const [documento, setDocumento] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');

  const [contas, setContas] = useState<ContaDraft[]>([]);
  const [initialContaIds, setInitialContaIds] = useState<Set<string>>(new Set());

  const [loadingSupplier, setLoadingSupplier] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [supplierComboQuery, setSupplierComboQuery] = useState('');
  const [supplierComboOpen, setSupplierComboOpen] = useState(false);
  const supplierComboRef = useRef<HTMLDivElement>(null);

  const isLinked = !!selectedSupplierId;
  const hasIdentData = !!(documento.trim() || razaoSocial.trim() || nomeFantasia.trim());
  const contasEnabled = isLinked || hasIdentData;

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId) ?? null;
  const filteredSuppliers = supplierComboQuery.trim()
    ? suppliers.filter(s => s.name.toLowerCase().includes(supplierComboQuery.trim().toLowerCase()))
    : suppliers;

  useEffect(() => {
    if (!open) return;
    setError('');
    setNomeBanco(favorecido?.nome_banco ?? '');
    setNomeFiscal(favorecido?.nome_fiscal ?? initialNomeFiscal ?? '');
    setSelectedSupplierId(favorecido?.supplier_id ?? null);
    setDocumentoTipo('CNPJ');
    setDocumento('');
    setRazaoSocial('');
    setNomeFantasia('');
    setContas([]);
    setInitialContaIds(new Set());
    setSupplierComboQuery('');
    setSupplierComboOpen(false);
    if (favorecido?.supplier_id) loadSupplierData(favorecido.supplier_id);
  }, [open, favorecido, initialNomeFiscal]);

  useEffect(() => {
    if (!supplierComboOpen) return;
    const handler = (e: MouseEvent) => {
      if (supplierComboRef.current && !supplierComboRef.current.contains(e.target as Node)) {
        setSupplierComboOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [supplierComboOpen]);

  async function loadSupplierData(supplierId: string) {
    setLoadingSupplier(true);
    const [supRes, contasRes] = await Promise.all([
      supabase.from('suppliers').select('razao_social, nome_fantasia, documento, documento_tipo').eq('id', supplierId).maybeSingle(),
      supabase.from('supplier_bank_accounts').select('*').eq('supplier_id', supplierId).order('created_at'),
    ]);
    if (supRes.data) {
      const s = supRes.data as SupplierFull;
      setDocumentoTipo(s.documento_tipo || 'CNPJ');
      setDocumento(s.documento || '');
      setRazaoSocial(s.razao_social || '');
      setNomeFantasia(s.nome_fantasia || '');
    }
    const rows = (contasRes.data ?? []) as any[];
    setContas(rows.map(c => ({
      localId: c.id, id: c.id, nome: c.nome, identificacaoTipo: c.identificacao_tipo,
      identificacao: c.identificacao, instituicao: c.instituicao,
      agencia: c.agencia ?? '', conta: c.conta ?? '', chavePix: c.chave_pix ?? '',
    })));
    setInitialContaIds(new Set(rows.map(c => c.id as string)));
    setLoadingSupplier(false);
  }

  function handlePickSupplier(id: string) {
    setSupplierComboQuery('');
    setSupplierComboOpen(false);
    if (!id) {
      setSelectedSupplierId(null);
      setDocumentoTipo('CNPJ');
      setDocumento('');
      setRazaoSocial('');
      setNomeFantasia('');
      setContas([]);
      setInitialContaIds(new Set());
      return;
    }
    setSelectedSupplierId(id);
    loadSupplierData(id);
  }

  const addConta = () => setContas(prev => [...prev, emptyConta()]);
  const updateConta = (localId: string, patch: Partial<ContaDraft>) =>
    setContas(prev => prev.map(c => c.localId === localId ? { ...c, ...patch } : c));
  const removeConta = (localId: string) => setContas(prev => prev.filter(c => c.localId !== localId));

  async function handleSave() {
    if (!nomeFiscal.trim()) { setError('Nome fiscal é obrigatório.'); return; }
    if (!isLinked && hasIdentData && !razaoSocial.trim()) {
      setError('Razão Social é obrigatória para vincular ou criar um fornecedor.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let finalSupplierId = selectedSupplierId;

      if (!isLinked && hasIdentData) {
        // Evita duplicar fornecedor: reaproveita um já cadastrado com o mesmo documento.
        let existingId: string | null = null;
        if (documento.trim()) {
          const { data } = await supabase.from('suppliers').select('id').eq('documento', documento.trim()).maybeSingle();
          existingId = data?.id ?? null;
        }
        if (existingId) {
          finalSupplierId = existingId;
        } else {
          const displayName = nomeFantasia.trim() || razaoSocial.trim();
          const { data: created, error: createErr } = await supabase.from('suppliers').insert([{
            name: displayName,
            razao_social: razaoSocial.trim(),
            nome_fantasia: nomeFantasia.trim(),
            documento: documento.trim(),
            documento_tipo: documentoTipo,
          }]).select('id').single();
          if (createErr) throw createErr;
          finalSupplierId = created!.id as string;
        }
      }

      const payload = { nome_fiscal: nomeFiscal.trim(), nome_banco: nomeBanco.trim(), supplier_id: finalSupplierId };

      if (favorecido) {
        const { error: updErr } = await supabase.from('finance_favorecidos').update(payload).eq('id', favorecido.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from('finance_favorecidos').insert([payload]);
        if (insErr) throw insErr;
        // Re-traduz movimentações já importadas que usavam o nome bruto do extrato.
        if (nomeBanco.trim()) {
          const { error: txErr } = await supabase.from('finance_transactions').update({ favorecido: nomeFiscal.trim() }).eq('favorecido', nomeBanco.trim());
          if (txErr) throw txErr;
        }
      }

      if (finalSupplierId) {
        const keptIds = new Set(contas.filter(c => c.id).map(c => c.id as string));
        const toDelete = [...initialContaIds].filter(id => !keptIds.has(id));
        if (toDelete.length > 0) {
          const { error: delErr } = await supabase.from('supplier_bank_accounts').delete().in('id', toDelete);
          if (delErr) throw delErr;
        }
        for (const c of contas) {
          if (!c.nome.trim()) continue; // ignora linhas em branco deixadas incompletas
          const rowPayload = {
            supplier_id: finalSupplierId,
            nome: c.nome.trim(),
            identificacao_tipo: c.identificacaoTipo,
            identificacao: c.identificacao.trim(),
            instituicao: c.instituicao.trim(),
            agencia: c.agencia.trim(),
            conta: c.conta.trim(),
            chave_pix: c.chavePix.trim() || null,
          };
          if (c.id) {
            const { error: contaUpdErr } = await supabase.from('supplier_bank_accounts').update(rowPayload).eq('id', c.id);
            if (contaUpdErr) throw contaUpdErr;
          } else {
            const { error: contaInsErr } = await supabase.from('supplier_bank_accounts').insert([rowPayload]);
            if (contaInsErr) throw contaInsErr;
          }
        }
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar favorecido.');
    } finally {
      setSaving(false);
    }
  }

  const fieldCls = 'w-full min-w-0 bg-surface border border-on-surface/[0.10] rounded-xl px-3.5 py-2.5 text-[13px] text-on-surface outline-none focus:border-primary/50';
  const fieldMutCls = 'w-full min-w-0 bg-on-surface/[0.03] border border-dashed border-on-surface/[0.14] rounded-xl px-3.5 py-2.5 text-[13px] text-on-surface/60';
  const labelCls = 'text-[10px] font-extrabold uppercase tracking-wide text-on-surface/45 mb-1.5 block';
  const sectionTitleCls = 'flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-on-surface/38 mt-1';

  const body = (
    <>
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <Building2 size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[16px] font-extrabold text-on-surface block">Editar Favorecido</span>
          <span className="text-[11px] text-on-surface/40 font-medium">Nome no extrato → nome fiscal</span>
        </div>
        <button onClick={onClose} className="w-[30px] h-[30px] rounded-[10px] bg-on-surface/[0.06] flex items-center justify-center text-on-surface/45 shrink-0">
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex flex-col gap-3.5">
        <div>
          <label className={labelCls}>Nome no Extrato</label>
          <input className={fieldCls} value={nomeBanco} onChange={e => setNomeBanco(e.target.value)} placeholder="Nome no extrato bancário..." />
        </div>
        <div>
          <label className={labelCls}>Nome Fiscal</label>
          <input className={fieldCls} value={nomeFiscal} onChange={e => setNomeFiscal(e.target.value)} placeholder="Nome fiscal do favorecido..." />
        </div>

        <div className={sectionTitleCls}>
          Identificação do Fornecedor
          <span className="flex-1 h-px bg-on-surface/[0.08]" />
        </div>

        <div className="relative" ref={supplierComboRef}>
          {selectedSupplier ? (
            <div className="flex items-center gap-2.5 w-full bg-primary/10 border border-primary/25 rounded-xl px-3.5 py-2.5 text-[13px] font-bold text-primary">
              <Building2 size={14} className="shrink-0" />
              <span className="flex-1 truncate">{selectedSupplier.name}</span>
              <button
                type="button"
                onClick={() => handlePickSupplier('')}
                className="shrink-0 text-primary/50 hover:text-primary transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                value={supplierComboQuery}
                onChange={e => { setSupplierComboQuery(e.target.value); setSupplierComboOpen(true); }}
                onFocus={() => setSupplierComboOpen(true)}
                placeholder="Sem fornecedor vinculado — buscar..."
                className={cn(fieldCls, 'pr-9')}
              />
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface/25 pointer-events-none" />
            </div>
          )}

          {supplierComboOpen && !selectedSupplier && (
            <div className="absolute z-50 w-full mt-1 bg-surface-container-lowest border border-on-surface/[0.10] rounded-xl shadow-xl overflow-hidden">
              <div className="max-h-52 overflow-y-auto py-1">
                {filteredSuppliers.length === 0 ? (
                  <p className="px-3.5 py-2.5 text-[12px] text-on-surface/35 font-medium">Nenhum fornecedor encontrado</p>
                ) : filteredSuppliers.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handlePickSupplier(s.id)}
                    className="w-full text-left px-3.5 py-2.5 text-[13px] font-semibold text-on-surface hover:bg-primary/10 hover:text-primary transition-colors truncate"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {isLinked && (
          <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-amber-700 dark:text-amber-300 bg-amber-700/[0.08] dark:bg-amber-300/[0.10] border border-amber-700/20 dark:border-amber-300/20 rounded-lg px-2.5 py-2">
            <Building2 size={11} className="shrink-0" />
            <span className="flex-1">Campos abaixo vêm do fornecedor vinculado — travados para não afetar outros favorecidos que usam o mesmo fornecedor.</span>
          </div>
        )}

        <div>
          <label className={labelCls}>Identificação</label>
          <div className="flex gap-1.5 mb-2">
            {(['CNPJ', 'CPF'] as DocumentoTipo[]).map(tipo => (
              <button
                key={tipo}
                type="button"
                disabled={isLinked}
                onClick={() => { setDocumentoTipo(tipo); setDocumento(d => maskDocumento(d, tipo)); }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wide border-[1.5px] transition-colors',
                  documentoTipo === tipo
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'border-on-surface/[0.12] text-on-surface/40',
                  isLinked && 'opacity-60 cursor-not-allowed',
                )}
              >
                {tipo}
              </button>
            ))}
          </div>
          {isLinked ? (
            <div className={fieldMutCls}>{documento || '—'}</div>
          ) : (
            <input
              className={fieldCls}
              value={documento}
              onChange={e => setDocumento(maskDocumento(e.target.value, documentoTipo))}
              placeholder={documentoTipo === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
            />
          )}
        </div>

        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <label className={labelCls}>Razão Social</label>
            {isLinked ? (
              <div className={fieldMutCls}>{razaoSocial || '—'}</div>
            ) : (
              <input className={fieldCls} value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} placeholder="Ex: Mariana Paixão da Silva" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <label className={labelCls}>Nome Fantasia</label>
            {isLinked ? (
              <div className={fieldMutCls}>{nomeFantasia || '—'}</div>
            ) : (
              <input className={fieldCls} value={nomeFantasia} onChange={e => setNomeFantasia(e.target.value)} placeholder="Opcional" />
            )}
          </div>
        </div>

        <div className="border-t border-on-surface/[0.08] mt-1 pt-4">
          <div className="mb-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-on-surface/42">Outras Contas desse Fornecedor</span>
            <p className="text-[10.5px] text-on-surface/35 font-medium mt-0.5">Outras formas de recebimento usadas por este mesmo fornecedor</p>
          </div>

          {loadingSupplier ? (
            <div className="flex justify-center py-6">
              <Loader2 size={18} className="animate-spin text-on-surface/30" />
            </div>
          ) : !contasEnabled ? (
            <div className="flex flex-col items-center gap-2 text-center py-6 px-4 border-[1.5px] border-dashed border-on-surface/[0.14] rounded-2xl text-on-surface/35">
              <Building2 size={20} className="opacity-50" />
              <span className="text-[11.5px] font-bold max-w-[260px]">
                Vincule um fornecedor existente ou preencha a Razão Social acima para liberar esta área
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 mt-2">
              {contas.map(c => (
                <div key={c.localId} className="bg-surface border border-on-surface/[0.09] rounded-2xl p-3 relative">
                  <button
                    onClick={() => removeConta(c.localId)}
                    className="absolute top-2.5 right-2.5 w-6 h-6 rounded-lg flex items-center justify-center text-on-surface/35 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                  <div className="mb-2 pr-8">
                    <span className="text-[9px] font-extrabold uppercase tracking-wide text-on-surface/38 mb-1 block">Nome</span>
                    <input
                      className="w-full bg-surface-container-low border border-on-surface/[0.08] rounded-lg px-2.5 py-2 text-[12px] text-on-surface outline-none focus:border-primary/50"
                      value={c.nome} onChange={e => updateConta(c.localId, { nome: e.target.value })} placeholder="Ex: Sócio — João"
                    />
                  </div>
                  <div className="flex gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] font-extrabold uppercase tracking-wide text-on-surface/38 mb-1 block">Identificação</span>
                      <input
                        className="w-full bg-surface-container-low border border-on-surface/[0.08] rounded-lg px-2.5 py-2 text-[12px] text-on-surface outline-none focus:border-primary/50 font-mono"
                        value={c.identificacao}
                        onChange={e => updateConta(c.localId, { identificacao: maskDocumento(e.target.value, c.identificacaoTipo) })}
                        placeholder={c.identificacaoTipo === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
                      />
                    </div>
                    <div className="w-[110px] shrink-0">
                      <span className="text-[9px] font-extrabold uppercase tracking-wide text-on-surface/38 mb-1 block">Tipo</span>
                      <select
                        className="w-full bg-surface-container-low border border-on-surface/[0.08] rounded-lg px-2 py-2 text-[12px] text-on-surface outline-none"
                        value={c.identificacaoTipo}
                        onChange={e => {
                          const tipo = e.target.value as DocumentoTipo;
                          updateConta(c.localId, { identificacaoTipo: tipo, identificacao: maskDocumento(c.identificacao, tipo) });
                        }}
                      >
                        <option value="CNPJ">CNPJ</option>
                        <option value="CPF">CPF</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] font-extrabold uppercase tracking-wide text-on-surface/38 mb-1 block">Instituição</span>
                      <input
                        className="w-full bg-surface-container-low border border-on-surface/[0.08] rounded-lg px-2.5 py-2 text-[12px] text-on-surface outline-none focus:border-primary/50"
                        value={c.instituicao} onChange={e => updateConta(c.localId, { instituicao: e.target.value })} placeholder="Ex: Nubank"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] font-extrabold uppercase tracking-wide text-on-surface/38 mb-1 block">Conta</span>
                      <input
                        className="w-full bg-surface-container-low border border-on-surface/[0.08] rounded-lg px-2.5 py-2 text-[12px] text-on-surface outline-none focus:border-primary/50 font-mono"
                        inputMode="numeric"
                        value={c.conta}
                        onChange={e => updateConta(c.localId, { conta: e.target.value.replace(/\D/g, '') })}
                        placeholder="000000"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] font-extrabold uppercase tracking-wide text-on-surface/38 mb-1 block">Agência</span>
                      <input
                        className="w-full bg-surface-container-low border border-on-surface/[0.08] rounded-lg px-2.5 py-2 text-[12px] text-on-surface outline-none focus:border-primary/50 font-mono"
                        inputMode="numeric"
                        value={c.agencia}
                        onChange={e => updateConta(c.localId, { agencia: e.target.value.replace(/\D/g, '') })}
                        placeholder="0000"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] font-extrabold uppercase tracking-wide text-on-surface/38 mb-1 block">Chave Pix</span>
                      <input
                        className="w-full bg-surface-container-low border border-on-surface/[0.08] rounded-lg px-2.5 py-2 text-[12px] text-on-surface outline-none focus:border-primary/50"
                        value={c.chavePix} onChange={e => updateConta(c.localId, { chavePix: e.target.value })} placeholder="Opcional"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={addConta}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl border-[1.5px] border-dashed border-on-surface/20 text-[11px] font-extrabold uppercase tracking-wide text-on-surface/42"
              >
                <Plus size={13} strokeWidth={2.8} /> Adicionar Conta
              </button>
            </div>
          )}
        </div>

        {error && <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <div className="flex gap-2.5 mt-5">
        <button onClick={onClose} className="flex-1 bg-on-surface/[0.06] border border-on-surface/[0.12] text-on-surface/55 font-extrabold text-[12.5px] uppercase tracking-wide py-3.5 rounded-[13px]">
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !nomeFiscal.trim()}
          className="flex-[1.6] bg-primary text-white font-extrabold text-[12.5px] uppercase tracking-wide py-3.5 rounded-[13px] shadow-lg shadow-primary/25 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <><Check size={14} strokeWidth={2.8} /> Salvar Favorecido</>}
        </button>
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
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] w-[520px] max-h-[88vh] overflow-y-auto bg-surface-container border border-on-surface/[0.08] rounded-[24px] p-6 shadow-2xl"
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

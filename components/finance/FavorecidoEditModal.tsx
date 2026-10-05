'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Building2, CreditCard, Plus, Trash2, Check, Loader2, ChevronDown, Users, Lock, Info, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { maskDocumento, type DocumentoTipo } from '@/lib/masks';
import { cleanApelidos, normalizeSearch } from '@/lib/favorecidoSearch';

export interface FavorecidoLite {
  id: string;
  nome_fiscal: string;
  nome_banco: string;
  supplier_id: string | null;
  apelidos?: string[] | null;
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
  const [apelidos, setApelidos] = useState<string[]>([]);
  const [apelidoDraft, setApelidoDraft] = useState('');
  const [apelidoFocus, setApelidoFocus] = useState(false);
  const apelidoInputRef = useRef<HTMLInputElement>(null);
  // Apelidos dos outros favorecidos — só pra avisar quando um apelido é compartilhado.
  const [otherApelidos, setOtherApelidos] = useState<{ nome: string; apelidos: string[] }[]>([]);

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
  // Documento (CNPJ/CPF) de cada fornecedor — a lista recebida por prop só tem id/nome.
  // Usado pra buscar fornecedor por CNPJ e pra avisar, antes de salvar, se o documento
  // digitado já pertence a um fornecedor (que será vinculado) ou se um novo será criado.
  const [supplierDocs, setSupplierDocs] = useState<Record<string, string> | null>(null);

  const isLinked = !!selectedSupplierId;
  const hasIdentData = !!(documento.trim() || razaoSocial.trim() || nomeFantasia.trim());
  const contasEnabled = isLinked || hasIdentData;

  const onlyDigits = (v: string) => v.replace(/\D/g, '');
  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId) ?? null;
  const comboQuery = supplierComboQuery.trim().toLowerCase();
  const comboDigits = onlyDigits(comboQuery);
  const filteredSuppliers = comboQuery
    ? suppliers.filter(s =>
        s.name.toLowerCase().includes(comboQuery) ||
        (comboDigits.length >= 3 && onlyDigits(supplierDocs?.[s.id] ?? '').includes(comboDigits)))
    : suppliers;

  const docDigits = onlyDigits(documento);
  const docComplete = docDigits.length === (documentoTipo === 'CPF' ? 11 : 14);
  const docOwner = !isLinked && docComplete && supplierDocs
    ? suppliers.find(s => onlyDigits(supplierDocs[s.id] ?? '') === docDigits) ?? null
    : null;

  useEffect(() => {
    if (!open) return;
    setError('');
    setNomeBanco(favorecido?.nome_banco ?? '');
    setNomeFiscal(favorecido?.nome_fiscal ?? initialNomeFiscal ?? '');
    setSelectedSupplierId(favorecido?.supplier_id ?? null);
    setApelidos(favorecido?.apelidos ?? []);
    setApelidoDraft('');
    setDocumentoTipo('CNPJ');
    setDocumento('');
    setRazaoSocial('');
    setNomeFantasia('');
    setContas([]);
    setInitialContaIds(new Set());
    setSupplierComboQuery('');
    setSupplierComboOpen(false);
    if (favorecido?.supplier_id) loadSupplierData(favorecido.supplier_id);
    let alive = true;
    supabase.from('suppliers').select('id, documento').then(({ data }) => {
      if (!alive) return;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { if (r.documento) map[r.id] = r.documento; });
      setSupplierDocs(map);
    });
    supabase.from('finance_favorecidos').select('id, nome_fiscal, apelidos').then(({ data }) => {
      if (!alive) return;
      setOtherApelidos(((data ?? []) as any[])
        .filter(r => r.id !== favorecido?.id && (r.apelidos ?? []).length > 0)
        .map(r => ({ nome: r.nome_fiscal as string, apelidos: r.apelidos as string[] })));
    });
    return () => { alive = false; };
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

  // Enter/vírgula transforma o texto em etiqueta; Backspace no campo vazio apaga a última.
  function commitApelido(raw = apelidoDraft) {
    const parts = raw.split(',');
    const next = cleanApelidos([...apelidos, ...parts]);
    setApelidos(next);
    setApelidoDraft('');
  }
  const removeApelido = (ap: string) => setApelidos(prev => prev.filter(a => a !== ap));
  const apelidoConflicts = apelidos.flatMap(ap => {
    const key = normalizeSearch(ap);
    const owners = otherApelidos.filter(o => o.apelidos.some(x => normalizeSearch(x) === key)).map(o => o.nome);
    return owners.length ? [{ ap, owners }] : [];
  });

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
        let existingId: string | null = docOwner?.id ?? null;
        if (!existingId && documento.trim()) {
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

      // Texto ainda não confirmado com Enter também entra.
      const finalApelidos = cleanApelidos([...apelidos, ...apelidoDraft.split(',')]);
      const payload: Record<string, unknown> = { nome_fiscal: nomeFiscal.trim(), nome_banco: nomeBanco.trim(), supplier_id: finalSupplierId };
      // Só manda a coluna quando há o que gravar/limpar — assim o salvamento comum
      // continua funcionando mesmo antes da migration add_favorecido_apelidos.sql.
      if (finalApelidos.length > 0 || (favorecido?.apelidos ?? []).length > 0) payload.apelidos = finalApelidos;

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

  // Padrão quadrado (mesmo da Movimentação / Fabricante): seções com cabeçalho amarelo e
  // fundo mais escuro, campos quadrados de 34px com rótulo em cima.
  const sectionCls = 'bg-[#F1EAD3] dark:bg-[#181814] border border-[#E0D8BF] dark:border-white/[0.10]';
  const sectionHeadCls = 'h-7 flex items-center gap-2 px-2.5 bg-[#FFEC4D] border-b-[1.5px] border-[#8F7E10]';
  const sectionTitleCls = 'text-[9px] font-black uppercase tracking-[0.1em] text-[rgba(26,26,10,0.55)]';
  const sectionCountCls = 'ml-auto text-[10px] font-extrabold text-[rgba(26,26,10,0.55)]';
  const fieldCls = 'w-full min-w-0 h-[34px] px-2.5 bg-white dark:bg-[#1E1E18] text-[13px] font-semibold text-on-surface border border-[#E0D8BF] dark:border-white/[0.10] outline-none caret-[#D81E1E] hover:border-[#CFC4A2] dark:hover:border-white/[0.20] focus:!border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] placeholder:text-on-surface/25 placeholder:font-medium transition-[border-color,box-shadow]';
  const monoCls = 'font-mono text-[12.5px] font-medium tracking-[0.03em]';
  const fieldLockCls = 'w-full min-w-0 h-[34px] px-2.5 flex items-center bg-black/[0.035] dark:bg-white/[0.03] border border-[#E0D8BF] dark:border-white/[0.10] text-[13px] font-semibold text-on-surface/45 truncate select-none';
  const labelCls = 'flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.1em] text-[#1A1A0E]/[0.58] dark:text-[#F2F0E3]/55 pl-px mb-1';
  const req = <span className="text-[#D81E1E]">*</span>;

  // CNPJ/CPF grudado à esquerda do campo de documento.
  const docSeg = (value: DocumentoTipo, onPick: (t: DocumentoTipo) => void, disabled = false) => (
    <div className={cn('flex shrink-0 gap-0.5 p-0.5 border border-r-0 border-[#E0D8BF] dark:border-white/[0.10] bg-on-surface/[0.06]', disabled && 'opacity-55')}>
      {(['CNPJ', 'CPF'] as DocumentoTipo[]).map(tipo => (
        <button
          key={tipo}
          type="button"
          disabled={disabled}
          onClick={() => onPick(tipo)}
          className={cn(
            'w-[42px] text-[9.5px] font-black tracking-[0.06em] transition-colors duration-[130ms]',
            value === tipo ? 'bg-[#D81E1E] text-white' : 'text-on-surface/45 hover:text-on-surface',
            disabled && 'cursor-not-allowed',
          )}
        >
          {tipo}
        </button>
      ))}
    </div>
  );

  const body = (
    <>
      {/* Barra de título — mesma cor do cabeçalho do site */}
      <div className="h-12 pl-3.5 pr-3 flex items-center gap-[11px] bg-[#FBF35E] dark:bg-[#252520] border-b border-[#D9CF45] dark:border-white/[0.08] shrink-0">
        <div className="w-[30px] h-[30px] flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
          <Building2 size={15} strokeWidth={2.3} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="truncate text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">
            {favorecido ? 'Editar Favorecido' : 'Novo Favorecido'}
          </h2>
          <p className="truncate text-[10.5px] font-bold text-[#1A1A0E]/50 dark:text-[#F2F0E3]/40">Nome no extrato → nome fiscal</p>
        </div>
        <button
          onClick={onClose}
          title="Fechar"
          className="w-[30px] h-[30px] flex items-center justify-center shrink-0 border border-black/[0.14] dark:border-white/[0.10] text-black/50 dark:text-white/40 hover:bg-[#D81E1E]/[0.09] hover:text-[#D81E1E] hover:border-[#D81E1E]/25 active:scale-[0.93] transition-all duration-[130ms]"
        >
          <X size={15} strokeWidth={2.6} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 flex flex-col gap-2.5">
        {/* ── Favorecido ── */}
        <div className={sectionCls}>
          <div className={sectionHeadCls}>
            <Users size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
            <span className={sectionTitleCls}>Favorecido</span>
          </div>
          <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <label className={labelCls}>Nome no extrato</label>
              <input className={fieldCls} value={nomeBanco} onChange={e => setNomeBanco(e.target.value)} placeholder="Nome no extrato bancário..." />
            </div>
            <div className="min-w-0">
              <label className={labelCls}>Nome fiscal {req}</label>
              <input className={fieldCls} value={nomeFiscal} onChange={e => setNomeFiscal(e.target.value)} placeholder="Nome fiscal do favorecido..." />
            </div>
            <div className="sm:col-span-2 min-w-0">
              <label className={labelCls}>
                Apelidos
                {apelidos.length > 0 && <span className="ml-auto normal-case tracking-normal font-bold">{apelidos.length}</span>}
              </label>
              <div
                onClick={() => apelidoInputRef.current?.focus()}
                className={cn(
                  'min-h-[34px] px-1.5 py-1 flex flex-wrap items-center gap-1 bg-white dark:bg-[#1E1E18] border cursor-text transition-[border-color,box-shadow]',
                  apelidoFocus
                    ? 'border-[#D81E1E] shadow-[0_0_0_2px_rgba(216,30,30,0.12)]'
                    : 'border-[#E0D8BF] dark:border-white/[0.10] hover:border-[#CFC4A2] dark:hover:border-white/[0.20]',
                )}
              >
                {apelidos.map(ap => (
                  <span key={ap} className="h-6 inline-flex items-center gap-1 pl-2 pr-[3px] bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E] text-[11.5px] font-extrabold">
                    {ap}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); removeApelido(ap); }}
                      title="Remover apelido"
                      className="w-[18px] h-[18px] flex items-center justify-center opacity-60 hover:opacity-100 hover:bg-[#D81E1E] hover:text-white transition-[opacity,background-color,color] duration-[130ms]"
                    >
                      <X size={11} strokeWidth={2.8} />
                    </button>
                  </span>
                ))}
                <input
                  ref={apelidoInputRef}
                  value={apelidoDraft}
                  onChange={e => {
                    const v = e.target.value;
                    if (v.includes(',')) commitApelido(v); else setApelidoDraft(v);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); if (apelidoDraft.trim()) commitApelido(); }
                    else if (e.key === 'Backspace' && !apelidoDraft && apelidos.length) setApelidos(prev => prev.slice(0, -1));
                  }}
                  onFocus={() => setApelidoFocus(true)}
                  onBlur={() => { setApelidoFocus(false); if (apelidoDraft.trim()) commitApelido(); }}
                  placeholder={apelidos.length ? '' : 'Ex: luz, energia...'}
                  className="flex-1 min-w-[90px] h-6 px-1 bg-transparent outline-none text-[13px] font-semibold text-on-surface caret-[#D81E1E] placeholder:text-on-surface/25 placeholder:font-medium"
                />
                {apelidoDraft.trim() && <span className="font-mono text-[10px] text-on-surface/30 pr-1">Enter ↵</span>}
              </div>
              {apelidoConflicts.map(c => (
                <div key={c.ap} className="mt-1.5 flex items-start gap-1.5 px-2 py-1.5 text-[10.5px] font-bold leading-snug text-[#92400E] dark:text-[#FCD34D] bg-[rgba(217,119,6,0.08)] dark:bg-[rgba(252,211,77,0.07)] border border-[rgba(217,119,6,0.40)] dark:border-[rgba(252,211,77,0.35)]">
                  <Info size={12} strokeWidth={2.6} className="shrink-0 mt-px" />
                  <span>"{c.ap}" também é apelido de <b className="text-on-surface">{c.owners.join(', ')}</b> — os dois vão aparecer quando você buscar por ele.</span>
                </div>
              ))}
              <p className="mt-1.5 flex items-start gap-1.5 text-[10.5px] font-semibold leading-snug text-on-surface/45">
                <Search size={12} className="shrink-0 mt-px" />
                Só usados na busca do favorecido. Os lançamentos continuam gravando o nome fiscal.
              </p>
            </div>
          </div>
        </div>

        {/* ── Identificação do fornecedor ── */}
        <div className={sectionCls}>
          <div className={sectionHeadCls}>
            <Building2 size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
            <span className={sectionTitleCls}>Identificação do fornecedor</span>
            <span className={sectionCountCls}>
              {isLinked ? 'vinculado' : hasIdentData ? (docOwner ? 'será vinculado' : 'será cadastrado') : 'opcional'}
            </span>
          </div>
          <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="sm:col-span-2 min-w-0">
              <label className={labelCls}>Fornecedor vinculado</label>
              <div className="relative" ref={supplierComboRef}>
                {selectedSupplier ? (
                  <div className="h-[34px] flex items-center gap-2 pl-2.5 pr-1.5 border border-[#D81E1E]/35 bg-[#D81E1E]/[0.06] text-[13px] font-extrabold text-[#D81E1E]">
                    <Building2 size={13} className="shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{selectedSupplier.name}</span>
                    {supplierDocs?.[selectedSupplier.id] && (
                      <span className="hidden sm:inline font-mono text-[11px] font-medium text-on-surface/45 shrink-0">{supplierDocs[selectedSupplier.id]}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handlePickSupplier('')}
                      title="Desvincular fornecedor"
                      className="w-6 h-6 flex items-center justify-center shrink-0 text-[#D81E1E]/60 hover:text-[#D81E1E] hover:bg-[#D81E1E]/[0.08] transition-colors"
                    >
                      <X size={13} strokeWidth={2.6} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={supplierComboQuery}
                      onChange={e => { setSupplierComboQuery(e.target.value); setSupplierComboOpen(true); }}
                      onFocus={() => setSupplierComboOpen(true)}
                      placeholder="Sem fornecedor vinculado — buscar por nome ou CNPJ..."
                      className={cn(fieldCls, 'pr-8')}
                    />
                    <ChevronDown size={14} strokeWidth={2.6} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface/40 pointer-events-none" />
                  </div>
                )}

                <AnimatePresence>
                  {supplierComboOpen && !selectedSupplier && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
                      className="absolute z-50 left-0 right-0 mt-0.5 bg-white dark:bg-[#2E2E28] border border-[#E0D8BF] dark:border-white/[0.10] shadow-xl max-h-52 overflow-y-auto origin-top"
                    >
                      {filteredSuppliers.length === 0 ? (
                        <p className="px-2.5 py-2 text-[12px] italic text-on-surface/45">Nenhum fornecedor encontrado</p>
                      ) : filteredSuppliers.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => handlePickSupplier(s.id)}
                          className="w-full flex items-center justify-between gap-2.5 text-left px-2.5 py-[7px] text-[13px] font-semibold text-on-surface hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.08] transition-colors"
                        >
                          <span className="truncate">{s.name}</span>
                          {supplierDocs?.[s.id] && (
                            <span className="font-mono text-[10.5px] font-medium text-on-surface/45 shrink-0">{supplierDocs[s.id]}</span>
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {isLinked && (
              <div className="sm:col-span-2 flex items-start gap-1.5 px-2 py-1.5 text-[10.5px] font-bold leading-snug text-[#92400E] dark:text-[#FCD34D] bg-[rgba(217,119,6,0.08)] dark:bg-[rgba(252,211,77,0.07)] border border-[rgba(217,119,6,0.40)] dark:border-[rgba(252,211,77,0.35)]">
                <Lock size={12} strokeWidth={2.6} className="shrink-0 mt-px" />
                <span>Dados abaixo vêm do fornecedor vinculado — travados para não afetar outros favorecidos que usam o mesmo fornecedor.</span>
              </div>
            )}
            {!isLinked && docComplete && supplierDocs && (
              docOwner ? (
                <div className="sm:col-span-2 flex items-start gap-1.5 px-2 py-1.5 text-[10.5px] font-bold leading-snug text-[#92400E] dark:text-[#FCD34D] bg-[rgba(217,119,6,0.08)] dark:bg-[rgba(252,211,77,0.07)] border border-[rgba(217,119,6,0.40)] dark:border-[rgba(252,211,77,0.35)]">
                  <Info size={12} strokeWidth={2.6} className="shrink-0 mt-px" />
                  <span>
                    Já existe o fornecedor <b className="text-on-surface">{docOwner.name}</b> com esse {documentoTipo} — ele será vinculado ao salvar.{' '}
                    <button type="button" onClick={() => handlePickSupplier(docOwner.id)} className="underline underline-offset-2 hover:text-[#D81E1E]">Vincular agora</button>
                  </span>
                </div>
              ) : (
                <div className="sm:col-span-2 flex items-start gap-1.5 px-2 py-1.5 text-[10.5px] font-bold leading-snug text-[#0A7A55] dark:text-[#34D399] bg-[#0A7A55]/[0.06] dark:bg-[#34D399]/[0.06] border border-[#0A7A55]/35 dark:border-[#34D399]/30">
                  <Info size={12} strokeWidth={2.6} className="shrink-0 mt-px" />
                  <span>Nenhum fornecedor com esse {documentoTipo} — um novo será cadastrado ao salvar.</span>
                </div>
              )
            )}

            <div className="sm:col-span-2 min-w-0">
              <label className={labelCls}>Razão social</label>
              {isLinked ? (
                <div className={fieldLockCls}>{razaoSocial || '—'}</div>
              ) : (
                <input className={fieldCls} value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} placeholder="Ex: Mariana Paixão da Silva" />
              )}
            </div>
            <div className="min-w-0">
              <label className={labelCls}>Identificação</label>
              <div className="flex">
                {docSeg(documentoTipo, tipo => { setDocumentoTipo(tipo); setDocumento(d => maskDocumento(d, tipo)); }, isLinked)}
                {isLinked ? (
                  <div className={cn(fieldLockCls, monoCls, 'flex-1')}>{documento || '—'}</div>
                ) : (
                  <input
                    className={cn(fieldCls, monoCls, 'flex-1')}
                    inputMode="numeric"
                    value={documento}
                    onChange={e => setDocumento(maskDocumento(e.target.value, documentoTipo))}
                    placeholder={documentoTipo === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
                  />
                )}
              </div>
            </div>
            <div className="min-w-0">
              <label className={labelCls}>Nome fantasia</label>
              {isLinked ? (
                <div className={fieldLockCls}>{nomeFantasia || '—'}</div>
              ) : (
                <input className={fieldCls} value={nomeFantasia} onChange={e => setNomeFantasia(e.target.value)} placeholder="Opcional" />
              )}
            </div>
          </div>
        </div>

        {/* ── Outras contas ── */}
        <div className={sectionCls}>
          <div className={sectionHeadCls}>
            <CreditCard size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
            <span className={sectionTitleCls}>Outras contas desse fornecedor</span>
            {contasEnabled && !loadingSupplier && (
              <span className={sectionCountCls}>
                {contas.length === 0 ? 'nenhuma' : contas.length === 1 ? '1 conta' : `${contas.length} contas`}
              </span>
            )}
          </div>

          {loadingSupplier ? (
            <div className="flex justify-center py-6">
              <Loader2 size={18} className="animate-spin text-on-surface/30" />
            </div>
          ) : !contasEnabled ? (
            <div className="m-2.5 flex flex-col items-center gap-1.5 text-center py-[18px] px-4 border border-dashed border-[#E0D8BF] dark:border-white/[0.12] text-on-surface/45">
              <Building2 size={16} className="opacity-55" />
              <span className="text-[11.5px] font-bold max-w-[300px]">
                Vincule um fornecedor existente ou preencha a Razão Social acima para liberar esta área
              </span>
            </div>
          ) : (
            <>
              <p className="px-2.5 pt-2 text-[10.5px] font-semibold text-on-surface/45">Outras formas de recebimento usadas por este mesmo fornecedor</p>
              <div className="p-2.5 flex flex-col gap-2">
                {contas.map((c, idx) => (
                  <div key={c.localId} className="bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10]">
                    <div className="h-[30px] flex items-center gap-2 pl-2.5 pr-1 border-b border-[#E0D8BF] dark:border-white/[0.10] bg-black/[0.035] dark:bg-white/[0.03]">
                      <span className="w-[18px] h-[18px] flex items-center justify-center shrink-0 bg-[#1A1A0E] dark:bg-[#FFE500] text-[#FFE500] dark:text-[#1A1A0E] text-[10px] font-black">{idx + 1}</span>
                      <span className={cn('flex-1 min-w-0 truncate text-[11.5px]', c.nome.trim() ? 'font-extrabold text-on-surface' : 'font-semibold text-on-surface/30')}>
                        {c.nome.trim() || 'Nova conta'}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeConta(c.localId)}
                        title="Remover conta"
                        className="w-6 h-6 flex items-center justify-center shrink-0 text-on-surface/45 hover:bg-[#D81E1E] hover:text-white transition-colors duration-[130ms]"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="px-2.5 pt-2 pb-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="min-w-0">
                        <label className={labelCls}>Nome {req}</label>
                        <input className={fieldCls} value={c.nome} onChange={e => updateConta(c.localId, { nome: e.target.value })} placeholder="Ex: Sócio — João" />
                      </div>
                      <div className="sm:col-span-2 min-w-0">
                        <label className={labelCls}>Identificação</label>
                        <div className="flex">
                          {docSeg(c.identificacaoTipo, tipo => updateConta(c.localId, { identificacaoTipo: tipo, identificacao: maskDocumento(c.identificacao, tipo) }))}
                          <input
                            className={cn(fieldCls, monoCls, 'flex-1')}
                            inputMode="numeric"
                            value={c.identificacao}
                            onChange={e => updateConta(c.localId, { identificacao: maskDocumento(e.target.value, c.identificacaoTipo) })}
                            placeholder={c.identificacaoTipo === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
                          />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <label className={labelCls}>Instituição</label>
                        <input className={fieldCls} value={c.instituicao} onChange={e => updateConta(c.localId, { instituicao: e.target.value })} placeholder="Ex: Nubank" />
                      </div>
                      <div className="min-w-0">
                        <label className={labelCls}>Agência</label>
                        <input
                          className={cn(fieldCls, monoCls)}
                          inputMode="numeric"
                          value={c.agencia}
                          onChange={e => updateConta(c.localId, { agencia: e.target.value.replace(/\D/g, '') })}
                          placeholder="0000"
                        />
                      </div>
                      <div className="min-w-0">
                        <label className={labelCls}>Conta</label>
                        <input
                          className={cn(fieldCls, monoCls)}
                          inputMode="numeric"
                          value={c.conta}
                          onChange={e => updateConta(c.localId, { conta: e.target.value.replace(/\D/g, '') })}
                          placeholder="000000"
                        />
                      </div>
                      <div className="sm:col-span-3 min-w-0">
                        <label className={labelCls}>Chave Pix</label>
                        <input className={fieldCls} value={c.chavePix} onChange={e => updateConta(c.localId, { chavePix: e.target.value })} placeholder="Opcional" />
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addConta}
                  className="h-8 flex items-center justify-center gap-1.5 border border-dashed border-[#D81E1E]/45 text-[10.5px] font-black uppercase tracking-[0.06em] text-[#D81E1E] hover:bg-[#D81E1E]/[0.06] transition-colors duration-[130ms]"
                >
                  <Plus size={13} strokeWidth={2.8} /> Adicionar conta
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="px-3.5 py-2.5 bg-[#EFE7CD] dark:bg-[#181814] border-t border-[#DDD2B0] dark:border-white/[0.08] flex items-center gap-2 shrink-0">
        {error && <p className="flex-1 min-w-0 text-[11px] font-bold text-[#D81E1E]">{error}</p>}
        <button onClick={onClose} className="ml-auto h-9 px-[18px] border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-[12px] font-extrabold uppercase tracking-[0.04em] text-on-surface hover:bg-on-surface/[0.05] active:scale-[0.97] transition-all">
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !nomeFiscal.trim()}
          className="h-9 px-[18px] flex items-center justify-center gap-2 bg-[#D81E1E] hover:bg-[#B91818] text-white text-[12px] font-extrabold uppercase tracking-[0.04em] active:scale-[0.97] transition-all disabled:opacity-45 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} strokeWidth={2.8} /> Salvar favorecido</>}
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

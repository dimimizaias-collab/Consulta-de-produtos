'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  X, Zap, FileText, Lock, ArrowRight, ArrowLeft, Copy, Check, Search, Plus, CheckCircle2, Layers, Truck, Pencil, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export interface QuickEditProduct {
  id: string;
  name: string;
  sku?: string | null;
  ean?: string | null;
}

interface QuickEditItemModalProps {
  /** Outro modal (vínculo, distribuição, editar produto…) aberto por cima — desliga os atalhos deste. */
  suspended: boolean;
  index: number;
  total: number;
  subtitle: string;
  saving: boolean;

  description: string;
  code: string;
  ean: string;

  noteUnit: string;
  noteQty: number;
  supplierUnit: string;
  multiplier: number;
  realQty: number;

  /** Custo por unidade já dividido pelo multiplicador (mesma convenção da coluna Preço Custo). */
  cost: number;
  /** Custo com descontos/acréscimos da nota — quando difere do cost o R$ Novo vira só leitura. */
  adjCost: number;
  hasAdj: boolean;
  /** Valor Total do item — mesma conta da coluna Valor Total da tabela (custo ajustado × Qtde Real). */
  itemTotal: number;
  companyId: string | null;

  sellPrice: number;
  suggestedPrice: number | null;
  distribTotal: number;

  linkedProduct: QuickEditProduct | null;
  hasMapping: boolean;
  isTranslation: boolean;
  eanMatches: QuickEditProduct[];
  searchProducts: (q: string) => QuickEditProduct[];

  onDescriptionChange: (v: string) => void;
  onCodeChange: (v: string) => void;
  onEanChange: (v: string) => void;
  onSupplierUnitChange: (v: string) => void;
  onMultiplierChange: (m: number) => void;
  onCostChange: (c: number) => void;
  onSellPriceChange: (v: number) => void;
  onOpenDistribution: () => void;
  onLinkClick: () => void;
  onMultiClick: () => void;
  onZapClick: () => void;
  onSelectProduct: (p: QuickEditProduct) => void;
  onEditProduct: () => void;
  onNavigate: (delta: number) => void;
  onClose: () => void;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseNum = (s: string) => parseFloat(s.replace(/\./g, '').replace(',', '.'));
// Aceita tanto "12,50" quanto "12.50" (input type=number do navegador devolve com ponto).
const parseInput = (s: string) => (s.includes(',') ? parseNum(s) : parseFloat(s));

const labelCls = 'flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.07em] text-[#1A1A0E]/50 dark:text-[#F2F0E3]/45 mb-[5px] whitespace-nowrap h-[14px]';
const capCls = 'flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#1A1A0E]/32 dark:text-[#F2F0E3]/26 mb-2';
const cellCls = 'h-[38px] rounded-[10px] border-[1.5px] flex items-center gap-1 px-2.5 overflow-hidden transition-[border-color,box-shadow,background-color] duration-[130ms] border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#252520] focus-within:border-[#D81E1E] focus-within:shadow-[0_0_0_3px_rgba(216,30,30,0.14)]';
const lockedCls = 'h-[38px] rounded-[10px] border-[1.5px] flex items-center gap-1 px-2.5 overflow-hidden border-black/[0.08] dark:border-white/[0.06] bg-black/[0.04] dark:bg-white/[0.03]';
const inputCls = 'w-full min-w-0 bg-transparent border-none outline-none font-mono text-[12.5px] tabular-nums text-[#1A1A0E] dark:text-[#F2F0E3] caret-[#D81E1E] placeholder:text-[#1A1A0E]/22 dark:placeholder:text-white/25 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden';
const preCls = 'text-[10px] font-black shrink-0 text-[#1A1A0E]/45 dark:text-[#F2F0E3]/40';
const hintCls = 'text-[10px] font-bold mt-1 h-[13px] whitespace-nowrap text-[#1A1A0E]/45 dark:text-[#F2F0E3]/40';
const groupCls = 'flex flex-col px-4 border-l border-[#E6DEC4] dark:border-white/[0.08] first:pl-0 first:border-l-0 last:pr-0';
const tipCls = "pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 scale-95 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-100 bg-[#3a3a32] text-[#f2f0e3] text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap shadow-lg z-[5]";
const actCls = 'w-[38px] h-[38px] rounded-[10px] flex items-center justify-center transition-all active:scale-[0.92]';
const actIdleCls = 'border-[1.5px] border-dashed border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#252520] text-[#1A1A0E]/45 dark:text-[#F2F0E3]/40 hover:text-[#D81E1E] hover:border-[#D81E1E]/45 hover:bg-[#D81E1E]/[0.06]';

type EditField = 'desc' | 'code' | 'ean' | 'cost';

// Lápis que libera um campo travado. Ativo (vermelho, ✓) enquanto o campo está em edição —
// nesse estado trocar de produto/fechar fica bloqueado e ele "treme" a cada tentativa.
function EditPencil({ active, disabled, shake, onClick, title }: {
  active: boolean; disabled?: boolean; shake: number; onClick: () => void; title: string;
}) {
  return (
    <motion.button
      key={active ? shake : 'idle'}
      type="button"
      onClick={onClick}
      disabled={disabled}
      animate={active && shake > 0 ? { x: [0, -4, 4, -4, 4, 0] } : undefined}
      transition={{ duration: 0.28 }}
      title={title}
      className={cn(
        'w-5 h-5 -my-1 rounded-md flex items-center justify-center transition-colors active:scale-90 disabled:opacity-35 disabled:cursor-not-allowed',
        active
          ? 'bg-[#D81E1E] text-white shadow-[0_0_0_3px_rgba(216,30,30,0.22)]'
          : 'bg-[#FFE500] text-[#1A1A0E] shadow-[0_0_0_1px_rgba(26,26,10,0.12)] hover:bg-[#F5DB00]'
      )}
    >
      {active ? <Check size={11} strokeWidth={3} /> : <Pencil size={11} strokeWidth={2.6} />}
    </motion.button>
  );
}

const editingRingCls = 'border-[#D81E1E] shadow-[0_0_0_3px_rgba(216,30,30,0.14)]';

export function QuickEditItemModal(props: QuickEditItemModalProps) {
  const {
    suspended, index, total, subtitle, saving,
    description, code, ean, noteUnit, noteQty, supplierUnit, multiplier, realQty,
    cost, adjCost, hasAdj, itemTotal, companyId, sellPrice, suggestedPrice, distribTotal,
    linkedProduct, hasMapping, isTranslation, eanMatches, searchProducts,
  } = props;

  // Rascunhos de texto dos campos numéricos (o valor "oficial" vive na nota, na página).
  const [focused, setFocused] = useState<string | null>(null);
  const [multDraft, setMultDraft] = useState('');
  const [costDraft, setCostDraft] = useState('');
  const [sellDraft, setSellDraft] = useState('');
  const [markupDraft, setMarkupDraft] = useState('');
  const [editing, setEditing] = useState<EditField | null>(null);
  const editingCost = editing === 'cost';
  const [shakeKey, setShakeKey] = useState(0);
  const [blockedMsg, setBlockedMsg] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const [ddOpen, setDdOpen] = useState(false);
  const [oldCostEntry, setOldCostEntry] = useState<{ key: string; value: number | null } | null>(null);

  const supUnitRef = useRef<HTMLInputElement>(null);
  const multRef = useRef<HTMLInputElement>(null);
  const costRef = useRef<HTMLInputElement>(null);
  const sellRef = useRef<HTMLInputElement>(null);
  const markupRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const eanRef = useRef<HTMLInputElement>(null);

  const markup = adjCost > 0 && sellPrice > 0 ? ((sellPrice - adjCost) / adjCost) * 100 : null;
  const displayCost = hasAdj ? adjCost : cost;

  // Troca de item: zera rascunhos/estado de edição (ajuste durante o render, sem effect).
  const [shownIndex, setShownIndex] = useState(index);
  if (shownIndex !== index) {
    setShownIndex(index);
    setFocused(null);
    setEditing(null);
    setBlockedMsg(false);
    setSearchMode(false);
    setQuery('');
    setDdOpen(false);
  }
  useEffect(() => {
    const t = setTimeout(() => supUnitRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [index]);

  // R$ Antigo: custo salvo do produto vinculado no Estoque & Preço da empresa da nota.
  const oldCostKey = linkedProduct?.id && companyId ? `${linkedProduct.id}:${companyId}` : null;
  useEffect(() => {
    if (!oldCostKey || !linkedProduct?.id || !companyId) return;
    let cancelled = false;
    supabase
      .from('product_company_stock')
      .select('cost_price')
      .eq('product_id', linkedProduct.id)
      .eq('company_id', companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const v = parseFloat((data as any)?.cost_price);
        setOldCostEntry({ key: oldCostKey, value: v > 0 ? v : null });
      });
    return () => { cancelled = true; };
  }, [oldCostKey, linkedProduct?.id, companyId]);
  const oldCostLoading = !!oldCostKey && oldCostEntry?.key !== oldCostKey;
  const oldCost = oldCostKey && oldCostEntry?.key === oldCostKey ? oldCostEntry.value : null;

  const multValue = focused === 'mult' ? multDraft : (multiplier > 1 ? String(multiplier) : '');
  const costValue = focused === 'cost' ? costDraft : (displayCost > 0 ? displayCost.toFixed(2) : '');
  const sellValue = focused === 'sell' ? sellDraft : (sellPrice > 0 ? sellPrice.toFixed(2) : '');
  const markupValue = focused === 'markup' ? markupDraft : (markup === null ? '' : markup.toFixed(1));

  const tryNavigate = (delta: number) => {
    if (editing) {
      setShakeKey(k => k + 1);
      setBlockedMsg(true);
      return;
    }
    if (index + delta < 0) return;
    props.onNavigate(delta);
  };

  // Fechar também fica bloqueado com um lápis ativo — o usuário precisa confirmar o campo.
  const tryClose = () => {
    if (editing) {
      setShakeKey(k => k + 1);
      setBlockedMsg(true);
      return;
    }
    props.onClose();
  };

  const confirmEdit = () => {
    setEditing(null);
    setBlockedMsg(false);
    setFocused(f => (f === 'cost' ? null : f));
  };

  const toggleTextEdit = (field: EditField, ref: React.RefObject<HTMLInputElement | null>) => {
    if (editing === field) { confirmEdit(); return; }
    setEditing(field);
    setBlockedMsg(false);
    setTimeout(() => { ref.current?.focus(); ref.current?.select(); }, 20);
  };
  const confirmOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
  };

  const toggleCostEdit = () => {
    if (hasAdj) return;
    if (editingCost) { confirmEdit(); return; }
    setEditing('cost');
    setBlockedMsg(false);
    setCostDraft(cost > 0 ? cost.toFixed(2) : '');
    setTimeout(() => { costRef.current?.focus(); costRef.current?.select(); }, 20);
  };

  const exitSearch = () => { setSearchMode(false); setDdOpen(false); setQuery(''); };
  const enterSearch = () => {
    setSearchMode(true);
    setQuery('');
    setDdOpen(true);
    setTimeout(() => searchRef.current?.focus(), 20);
  };
  const pick = (p: QuickEditProduct) => { exitSearch(); props.onSelectProduct(p); };

  // Atalhos: Esc fecha (ou sai da edição/busca), Alt ←/→ navega.
  useEffect(() => {
    if (suspended) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (ddOpen || searchMode) exitSearch();
        else if (editing) confirmEdit();
        else tryClose();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault(); tryNavigate(1);
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault(); tryNavigate(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Enter avança campo a campo; no último, vai pro próximo produto.
  const order = [supUnitRef, multRef, sellRef, markupRef];
  const enterNext = (i: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = order[i + 1]?.current;
    if (next) { next.focus(); next.select(); } else tryNavigate(1);
  };

  const linkState: 'trad' | 'linked' | 'ean' | 'none' = linkedProduct
    ? (isTranslation ? 'trad' : 'linked')
    : (eanMatches.length > 0 ? 'ean' : 'none');
  const showLinked = !!linkedProduct && !searchMode;

  const results = useMemo(() => (query.trim() ? searchProducts(query) : []), [query, searchProducts]);

  const oldDelta = oldCost !== null && displayCost > 0 ? ((displayCost - oldCost) / oldCost) * 100 : null;
  const isLast = index === total - 1;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#1A1A0E]/40 dark:bg-black/55 backdrop-blur-[3px]" onMouseDown={tryClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label="Cadastro Rápido"
        className="relative w-full max-w-[1180px] max-h-[calc(100vh-32px)] flex flex-col rounded-[22px] overflow-hidden shadow-2xl border border-[#E0D8BF] dark:border-white/[0.08] bg-[#FDFAF0] dark:bg-[#1E1E18] text-[#1A1A0E] dark:text-[#F2F0E3]"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-[18px] py-3.5 bg-[#FFE500] dark:bg-[#252520] border-b border-[#D4C000] dark:border-white/[0.07] shrink-0">
          <div className="w-[38px] h-[38px] rounded-[13px] flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.13] text-[#1A1A0E] dark:text-[#D81E1E]">
            <Zap size={18} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-extrabold tracking-[-0.01em] leading-tight text-[#1A1A0E] dark:text-[#F2F0E3]">Cadastro Rápido</h2>
            <p className="text-[11.5px] font-bold text-[#1A1A0E]/45 dark:text-[#F2F0E3]/40 truncate">{subtitle}</p>
          </div>
          <div className="ml-auto flex items-center gap-2.5 text-[11px] font-extrabold text-[#1A1A0E]/45 dark:text-[#F2F0E3]/40">
            <span>Produto <span className="font-mono text-[13px] text-[#1A1A0E] dark:text-[#F2F0E3]">{index + 1} de {total}</span></span>
            <div className="hidden sm:block w-[120px] h-[5px] rounded-full overflow-hidden bg-black/[0.09] dark:bg-white/[0.08]">
              <div className="h-full rounded-full bg-[#D81E1E] transition-[width] duration-[240ms]" style={{ width: `${((index + 1) / Math.max(total, 1)) * 100}%` }} />
            </div>
          </div>
          <button
            onClick={tryClose}
            title={editing ? 'Confirme o campo em edição antes de fechar' : 'Salvar e fechar (Esc)'}
            className="w-[34px] h-[34px] rounded-[11px] flex items-center justify-center transition-all active:scale-[0.93] bg-black/[0.08] dark:bg-white/[0.06] border border-black/10 dark:border-white/[0.08] text-[#1A1A0E]/45 dark:text-[#F2F0E3]/35 hover:bg-[#D81E1E]/10 hover:text-[#D81E1E]"
          >
            <X size={16} strokeWidth={2.6} />
          </button>
        </div>

        <div className="overflow-y-auto">
          <motion.div key={index} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.14 }}>
            {/* Parte superior: identificação do item na nota */}
            <div className="grid grid-cols-2 md:grid-cols-[44px_minmax(0,1fr)_150px_190px] gap-4 items-end px-[22px] py-[18px]">
              <div className="hidden md:flex w-11 h-11 rounded-[14px] self-center items-center justify-center bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] text-[#1A1A0E]/45 dark:text-[#F2F0E3]/40">
                <FileText size={20} />
              </div>
              <div className="col-span-2 md:col-span-1 min-w-0">
                <div className={labelCls}>
                  Produto na Nota
                  <EditPencil active={editing === 'desc'} shake={shakeKey} onClick={() => toggleTextEdit('desc', descRef)} title={editing === 'desc' ? 'Confirmar (Enter)' : 'Editar descrição'} />
                </div>
                {editing === 'desc' ? (
                  <div className={cn(cellCls, editingRingCls)}>
                    <input ref={descRef} value={description} onChange={e => props.onDescriptionChange(e.target.value)} onKeyDown={confirmOnEnter}
                      className={cn(inputCls, 'font-sans text-[13.5px] font-extrabold')} />
                  </div>
                ) : (
                  <div className={lockedCls}>
                    <span className="flex-1 min-w-0 truncate text-[13.5px] font-extrabold" title={description}>{description || '—'}</span>
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className={labelCls}>
                  Código
                  <EditPencil active={editing === 'code'} shake={shakeKey} onClick={() => toggleTextEdit('code', codeRef)} title={editing === 'code' ? 'Confirmar (Enter)' : 'Editar código'} />
                </div>
                {editing === 'code' ? (
                  <div className={cn(cellCls, editingRingCls)}>
                    <input ref={codeRef} value={code} onChange={e => props.onCodeChange(e.target.value)} onKeyDown={confirmOnEnter} className={inputCls} />
                  </div>
                ) : (
                  <div className={lockedCls}>
                    <span className="flex-1 min-w-0 truncate font-mono text-[12.5px]">{code || '—'}</span>
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className={labelCls}>
                  EAN
                  <EditPencil active={editing === 'ean'} shake={shakeKey} onClick={() => toggleTextEdit('ean', eanRef)} title={editing === 'ean' ? 'Confirmar (Enter)' : 'Editar EAN'} />
                </div>
                {editing === 'ean' ? (
                  <div className={cn(cellCls, editingRingCls)}>
                    <input ref={eanRef} value={ean} onChange={e => props.onEanChange(e.target.value.trim())} onKeyDown={confirmOnEnter} className={inputCls} />
                  </div>
                ) : (
                <div className={lockedCls}>
                  <span className={cn('flex-1 min-w-0 truncate font-mono text-[12.5px]', !ean && 'text-[#1A1A0E]/28 dark:text-[#F2F0E3]/24')}>{ean || 'SEM GTIN'}</span>
                  {ean && (
                    <button
                      type="button"
                      title="Copiar EAN"
                      onClick={() => { navigator.clipboard?.writeText(ean); setCopied(true); setTimeout(() => setCopied(false), 900); }}
                      className="w-6 h-6 rounded-[7px] flex items-center justify-center shrink-0 text-[#1A1A0E]/45 dark:text-[#F2F0E3]/40 hover:bg-black/[0.06] dark:hover:bg-white/[0.05] active:scale-90 transition-all"
                    >
                      {copied ? <Check size={13} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={13} />}
                    </button>
                  )}
                </div>
                )}
              </div>

              {/* Produto vinculado — mesma lógica da coluna Identificação Interna */}
              <div className="col-span-2 md:col-start-2 md:col-span-3 flex items-end gap-2.5">
                <div className="flex-1 min-w-0">
                  <div className={labelCls}>
                    Produto Vinculado
                    <span className={cn('normal-case tracking-[0.02em] text-[9.5px]',
                      linkState === 'trad' || linkState === 'ean' ? 'text-amber-700 dark:text-amber-300'
                        : linkState === 'linked' ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-[#1A1A0E]/28 dark:text-[#F2F0E3]/24')}>
                      · {linkState === 'trad' ? 'tradução permanente' : linkState === 'linked' ? 'vinculado' : linkState === 'ean' ? 'EAN encontrado no sistema' : 'sem cadastro'}
                    </span>
                  </div>
                  <div className={cn(
                    'relative h-[38px] rounded-[10px] border-[1.5px] flex items-center gap-2 pl-[5px] pr-2.5 transition-[border-color,box-shadow,background-color] duration-[130ms] focus-within:border-[#D81E1E] focus-within:shadow-[0_0_0_3px_rgba(216,30,30,0.14)]',
                    showLinked && isTranslation ? 'border-amber-500/45 bg-amber-500/[0.14] dark:bg-amber-300/[0.12]'
                      : showLinked ? 'border-emerald-500/35 bg-emerald-500/10 dark:bg-emerald-400/10'
                      : 'border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#252520]'
                  )}>
                    <button
                      type="button"
                      onClick={() => (ddOpen ? exitSearch() : enterSearch())}
                      title={linkState === 'ean' ? `${eanMatches.length} produto(s) no sistema com o mesmo EAN — clique para ver` : 'Buscar produto no sistema'}
                      className={cn(
                        'relative w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0 transition-all active:scale-90',
                        linkState === 'ean' && !searchMode
                          ? 'bg-[#FFE500] text-[#1A1A0E] shadow-[0_0_0_3px_rgba(255,229,0,0.28)] hover:bg-[#F5DB00]'
                          : 'text-[#1A1A0E]/45 dark:text-[#F2F0E3]/40 hover:bg-black/[0.06] dark:hover:bg-white/[0.05]'
                      )}
                    >
                      <Search size={14} strokeWidth={2.5} />
                      {linkState === 'ean' && !searchMode && (
                        <span className="absolute -top-[5px] -right-[5px] min-w-[15px] h-[15px] px-[3px] rounded-full bg-[#D81E1E] text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white dark:ring-[#252520]">
                          {eanMatches.length}
                        </span>
                      )}
                    </button>
                    {showLinked ? (
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={props.onEditProduct}
                          title="Clique para editar o produto"
                          className={cn(
                            'min-w-0 truncate text-left text-[13px] font-extrabold underline decoration-transparent underline-offset-[3px] hover:decoration-current transition-colors',
                            isTranslation ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400'
                          )}
                        >
                          {linkedProduct!.name}
                        </button>
                        <span className="font-mono text-[11px] text-[#1A1A0E]/45 dark:text-[#F2F0E3]/40 whitespace-nowrap truncate">
                          {[linkedProduct!.sku && `SKU ${linkedProduct!.sku}`, linkedProduct!.ean].filter(Boolean).join(' · ')}
                        </span>
                        {isTranslation && (
                          <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/[0.18] text-amber-700 dark:text-amber-300 text-[10px] font-black whitespace-nowrap">
                            <Zap size={9} className="fill-current" /> Tradução
                          </span>
                        )}
                      </div>
                    ) : (
                      <input
                        ref={searchRef}
                        value={query}
                        onChange={e => { setQuery(e.target.value); setDdOpen(true); }}
                        onFocus={() => setDdOpen(true)}
                        onBlur={() => setTimeout(() => { if (document.activeElement !== searchRef.current) { setDdOpen(false); if (linkedProduct) setSearchMode(false); } }, 120)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const first = query.trim() ? results[0] : eanMatches[0];
                            if (first) { e.preventDefault(); pick(first); }
                          }
                        }}
                        placeholder={linkState === 'ean' ? 'Produto com o mesmo EAN encontrado — clique na lupa' : 'Buscar produto por nome, SKU ou EAN…'}
                        autoComplete="off"
                        className={cn(
                          'flex-1 min-w-0 h-full bg-transparent border-none outline-none text-[12.5px] font-semibold text-[#1A1A0E] dark:text-[#F2F0E3] caret-[#D81E1E]',
                          linkState === 'ean'
                            ? 'placeholder:text-amber-700 dark:placeholder:text-amber-300 placeholder:font-bold'
                            : 'placeholder:text-[#1A1A0E]/22 dark:placeholder:text-white/25 placeholder:font-medium'
                        )}
                      />
                    )}

                    {ddOpen && !showLinked && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
                        onMouseDown={e => e.preventDefault()}
                        className="absolute left-[-1.5px] right-[-1.5px] top-[calc(100%+6px)] z-[6] origin-top max-h-[240px] overflow-y-auto p-[5px] rounded-xl bg-white dark:bg-[#2E2E28] border border-[#E0D8BF] dark:border-white/[0.08] shadow-[0_16px_32px_-8px_rgba(0,0,0,0.25)]"
                      >
                        {(() => {
                          const list = query.trim() ? results : eanMatches;
                          if (!query.trim() && list.length === 0) {
                            return <div className="px-2.5 py-3 text-xs font-semibold text-[#1A1A0E]/45 dark:text-[#F2F0E3]/40">Digite para buscar no sistema</div>;
                          }
                          if (list.length === 0) {
                            return (
                              <div className="px-2.5 py-3 flex items-center justify-between gap-2.5 text-xs font-semibold text-[#1A1A0E]/45 dark:text-[#F2F0E3]/40">
                                Nenhum produto encontrado
                                <button type="button" onClick={() => { exitSearch(); props.onZapClick(); }} className="px-2.5 py-1.5 rounded-lg bg-[#D81E1E] hover:bg-[#BF1A1A] text-white text-[11px] font-extrabold active:scale-[0.97] transition-all">
                                  Criar e Vincular
                                </button>
                              </div>
                            );
                          }
                          const eanIds = new Set(eanMatches.map(p => p.id));
                          return (
                            <>
                              <div className="px-2.5 pt-1.5 pb-1 text-[9.5px] font-black uppercase tracking-[0.08em] text-[#1A1A0E]/32 dark:text-[#F2F0E3]/26">
                                {query.trim() ? `${list.length} resultado(s)` : 'Mesmo EAN da nota'}
                              </div>
                              {list.map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => pick(p)}
                                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-[#FFF8D0] dark:hover:bg-white/[0.04] transition-colors"
                                >
                                  <b className="flex-1 min-w-0 truncate text-[12.5px] font-bold">{p.name}</b>
                                  {eanIds.has(p.id) && (
                                    <span className="text-[9.5px] font-black px-1.5 py-0.5 rounded-md bg-amber-500/[0.14] text-amber-700 dark:text-amber-300">MESMO EAN</span>
                                  )}
                                  <span className="font-mono text-[10.5px] text-[#1A1A0E]/45 dark:text-[#F2F0E3]/40">{p.sku || p.ean || ''}</span>
                                </button>
                              ))}
                            </>
                          );
                        })()}
                      </motion.div>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <div className="relative group">
                    <button type="button" onClick={props.onLinkClick} className={cn(actCls, linkedProduct ? 'border-[1.5px] border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/[0.18]' : actIdleCls)}>
                      {linkedProduct ? <CheckCircle2 size={14} /> : <Plus size={14} strokeWidth={2.6} />}
                    </button>
                    <span className={tipCls}>{linkedProduct ? 'Alterar vínculo' : 'Vincular'}</span>
                  </div>
                  <div className="relative group">
                    <button type="button" onClick={props.onMultiClick} className={cn(actCls, actIdleCls)}>
                      <Layers size={13} />
                    </button>
                    <span className={tipCls}>Vários</span>
                  </div>
                  <div className="relative group">
                    <button type="button" onClick={props.onZapClick} className={cn(actCls, hasMapping ? 'border-[1.5px] border-amber-500/55 bg-[#FFE500] text-[#1A1A0E] hover:bg-[#F5DB00]' : actIdleCls)}>
                      <Zap size={13} className={hasMapping ? 'fill-[#1A1A0E]/25' : undefined} />
                    </button>
                    <span className={tipCls}>{hasMapping ? (isTranslation ? 'Tradução permanente salva' : 'Usar tradução permanente') : 'Criar e Vincular'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Parte inferior: valores e medidas */}
            <div className="bg-[#FAF7EE] dark:bg-[#1A1A15] border-t border-[#EAE2C8] dark:border-white/[0.06] px-[22px] pt-4 pb-5">
              <div className="flex flex-wrap items-end gap-y-4">
                {/* Na nota (travado) */}
                <div className={groupCls}>
                  <div className={capCls}><Lock size={10} strokeWidth={2.6} /> Na nota</div>
                  <div className="flex gap-2 items-end">
                    <div className="w-[66px]">
                      <div className={labelCls}>Medida</div>
                      <div className={cn(lockedCls, 'justify-center')}>
                        <span className="flex-1 text-center font-mono text-[12.5px] text-[#1A1A0E]/50 dark:text-[#F2F0E3]/45 truncate">{noteUnit || 'UN'}</span>
                        <Lock size={11} className="shrink-0 text-[#1A1A0E]/28 dark:text-[#F2F0E3]/24" />
                      </div>
                      <div className={hintCls} />
                    </div>
                    <div className="w-[78px]">
                      <div className={labelCls}>Quantidade</div>
                      <div className={lockedCls}>
                        <span className="flex-1 text-right font-mono text-[12.5px] text-[#1A1A0E]/50 dark:text-[#F2F0E3]/45">{noteQty.toLocaleString('pt-BR')}</span>
                        <Lock size={11} className="shrink-0 text-[#1A1A0E]/28 dark:text-[#F2F0E3]/24" />
                      </div>
                      <div className={hintCls} />
                    </div>
                  </div>
                </div>

                {/* Conversão */}
                <div className={groupCls}>
                  <div className={capCls}>Conversão</div>
                  <div className="flex gap-2 items-end">
                    <div className="w-[88px]">
                      <div className={labelCls} title="Unidade do Fornecedor">Unid. Fornec.</div>
                      <div className={cellCls}>
                        <input
                          ref={supUnitRef}
                          value={supplierUnit}
                          onChange={e => props.onSupplierUnitChange(e.target.value.toUpperCase())}
                          onKeyDown={enterNext(0)}
                          placeholder="CX"
                          className={cn(inputCls, 'text-center')}
                        />
                      </div>
                      <div className={hintCls} />
                    </div>
                    <div className="w-[88px]">
                      <div className={labelCls} title="Multiplicador (qtd. por unidade)">Multiplicador</div>
                      <div className={cellCls}>
                        <span className={preCls}>×</span>
                        <input
                          ref={multRef}
                          type="number" min="1" step="1"
                          value={multValue}
                          onFocus={() => { setMultDraft(multiplier > 1 ? String(multiplier) : ''); setFocused('mult'); }}
                          onBlur={() => setFocused(null)}
                          onChange={e => {
                            setMultDraft(e.target.value);
                            const v = parseInput(e.target.value);
                            props.onMultiplierChange(v > 0 ? v : 1);
                          }}
                          onKeyDown={enterNext(1)}
                          onWheel={e => e.currentTarget.blur()}
                          placeholder="1"
                          className={cn(inputCls, 'text-right')}
                        />
                      </div>
                      <div className={hintCls}>qtd. por unid.</div>
                    </div>
                    <ArrowRight size={16} strokeWidth={2.4} className="self-center mt-[18px] shrink-0 text-[#1A1A0E]/28 dark:text-[#F2F0E3]/24" />
                    <div className="w-[92px]">
                      <div className={labelCls}>Qtde Real</div>
                      <div className="h-[38px] rounded-[10px] border-[1.5px] border-dashed border-[#E0D8BF] dark:border-white/[0.10] flex items-center gap-1 px-2.5">
                        <span className="flex-1 text-right font-mono text-[12.5px]">{realQty.toLocaleString('pt-BR')}</span>
                        <span className={preCls}>un.</span>
                      </div>
                      <div className={hintCls}>{multiplier > 1 ? `${noteQty.toLocaleString('pt-BR')} × ${multiplier.toLocaleString('pt-BR')}` : ''}</div>
                    </div>
                  </div>
                </div>

                {/* Custo unitário */}
                <div className={groupCls}>
                  <div className={capCls}>Custo unitário</div>
                  <div className="flex gap-2 items-end">
                    <div className="w-[98px]">
                      <div className={labelCls}>R$ Antigo</div>
                      <div className={lockedCls}>
                        <span className={preCls}>R$</span>
                        <span className="flex-1 text-right font-mono text-[12.5px] text-[#1A1A0E]/50 dark:text-[#F2F0E3]/45">
                          {oldCostLoading ? <Loader2 size={11} className="inline animate-spin" /> : oldCost !== null ? brl(oldCost) : ''}
                        </span>
                      </div>
                      <div className={hintCls}>{oldCost !== null ? 'último custo salvo' : ''}</div>
                    </div>
                    <div className="w-[104px]">
                      <div className={labelCls}>
                        R$ Novo
                        <EditPencil
                          active={editingCost}
                          disabled={hasAdj}
                          shake={shakeKey}
                          onClick={toggleCostEdit}
                          title={hasAdj ? 'Custo com desconto/acréscimo da nota — edite pela tabela' : editingCost ? 'Confirmar custo (Enter)' : 'Editar custo'}
                        />
                      </div>
                      <div className={cn(editingCost ? cellCls : lockedCls, editingCost && editingRingCls)}>
                        <span className={preCls}>R$</span>
                        <input
                          ref={costRef}
                          type="number" min="0" step="0.01"
                          readOnly={!editingCost}
                          tabIndex={editingCost ? 0 : -1}
                          value={costValue}
                          onFocus={() => { if (editingCost) { setCostDraft(cost > 0 ? cost.toFixed(2) : ''); setFocused('cost'); } }}
                          onBlur={() => setFocused(f => (f === 'cost' ? null : f))}
                          onChange={e => {
                            if (!editingCost) return;
                            setCostDraft(e.target.value);
                            const v = parseInput(e.target.value);
                            if (!isNaN(v) && v >= 0) props.onCostChange(v);
                          }}
                          onKeyDown={e => { if (e.key === 'Enter' && editingCost) { e.preventDefault(); confirmEdit(); sellRef.current?.focus(); sellRef.current?.select(); } }}
                          onWheel={e => e.currentTarget.blur()}
                          className={cn(inputCls, 'text-right', !editingCost && 'text-[#1A1A0E]/50 dark:text-[#F2F0E3]/45 cursor-default')}
                        />
                      </div>
                      <div className={cn(hintCls, oldDelta !== null && Math.abs(oldDelta) >= 0.05 && 'font-black',
                        oldDelta !== null && oldDelta >= 0.05 ? 'text-red-600 dark:text-red-400'
                          : oldDelta !== null && oldDelta <= -0.05 ? 'text-emerald-700 dark:text-emerald-400' : '')}>
                        {oldDelta !== null
                          ? (Math.abs(oldDelta) < 0.05 ? '= sem variação' : `${oldDelta > 0 ? '▲' : '▼'} ${Math.abs(oldDelta).toFixed(1).replace('.', ',')}% vs antigo`)
                          : hasAdj ? 'com desc./acrésc.' : ''}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Venda */}
                <div className={groupCls}>
                  <div className={capCls}>Venda</div>
                  <div className="flex gap-2 items-end">
                    <div className="w-[106px]">
                      <div className={labelCls}>Preço Venda</div>
                      <div className={cn(cellCls, !(sellPrice > 0) && 'border-dashed border-[#D81E1E]/45 bg-[#D81E1E]/[0.04]')}>
                        <span className={preCls}>R$</span>
                        <input
                          ref={sellRef}
                          type="number" min="0" step="0.01"
                          value={sellValue}
                          onFocus={() => { setSellDraft(sellPrice > 0 ? sellPrice.toFixed(2) : ''); setFocused('sell'); }}
                          onBlur={() => setFocused(null)}
                          onChange={e => {
                            setSellDraft(e.target.value);
                            const v = parseInput(e.target.value);
                            props.onSellPriceChange(isNaN(v) || v < 0 ? 0 : v);
                          }}
                          onKeyDown={enterNext(2)}
                          onWheel={e => e.currentTarget.blur()}
                          placeholder={suggestedPrice ? suggestedPrice.toFixed(2).replace('.', ',') : '0,00'}
                          title={suggestedPrice ? `Sugestão — preço cadastrado no dicionário: R$ ${brl(suggestedPrice)}` : undefined}
                          className={cn(inputCls, 'text-right')}
                        />
                      </div>
                      <div className={hintCls} />
                    </div>
                    <div className="w-[84px]">
                      <div className={labelCls}>Markup</div>
                      <div className={cn(cellCls,
                        markup === null ? '' : markup >= 0
                          ? 'bg-emerald-500/10 border-emerald-500/30 dark:bg-emerald-400/10'
                          : 'bg-[#D81E1E]/[0.08] border-[#D81E1E]/30')}>
                        <input
                          ref={markupRef}
                          type="number" step="0.1"
                          value={markupValue}
                          disabled={!(adjCost > 0)}
                          onFocus={() => { setMarkupDraft(markup === null ? '' : markup.toFixed(1)); setFocused('markup'); }}
                          onBlur={() => setFocused(null)}
                          onChange={e => {
                            setMarkupDraft(e.target.value);
                            const v = parseInput(e.target.value);
                            if (isNaN(v) || !(adjCost > 0)) return;
                            props.onSellPriceChange(Math.round(adjCost * (1 + v / 100) * 100) / 100);
                          }}
                          onKeyDown={enterNext(3)}
                          onWheel={e => e.currentTarget.blur()}
                          placeholder="—"
                          title={adjCost > 0 ? 'Digite o markup para recalcular o Preço Venda' : 'Informe o custo para calcular o markup'}
                          className={cn(inputCls, 'text-right',
                            markup === null ? '' : markup >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}
                        />
                        <span className={cn(preCls, markup === null ? '' : markup >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>%</span>
                      </div>
                      <div className={hintCls} />
                    </div>
                  </div>
                </div>

                {/* Distribuição */}
                <div className={cn(groupCls, 'flex-1 min-w-[96px]')}>
                  <div className={capCls}>Distribuição</div>
                  <div className={labelCls}>Outras lojas</div>
                  <button
                    type="button"
                    onClick={props.onOpenDistribution}
                    className={cn(
                      'h-[38px] w-full rounded-[10px] px-3 inline-flex items-center justify-center gap-[7px] text-xs font-black transition-all active:scale-[0.97]',
                      distribTotal > 0
                        ? 'bg-violet-500/10 dark:bg-violet-500/[0.14] text-violet-700 dark:text-violet-300 border-[1.5px] border-transparent hover:bg-violet-500/20'
                        : 'border-[1.5px] border-dashed border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#252520] text-[#1A1A0E]/45 dark:text-[#F2F0E3]/40 hover:text-violet-700 dark:hover:text-violet-300 hover:border-violet-500'
                    )}
                  >
                    <Truck size={13} />
                    {distribTotal > 0 ? `${distribTotal} un.` : 'Distribuir'}
                  </button>
                  <div className={hintCls}>{distribTotal > 0 ? `fica ${Math.max(0, realQty - distribTotal)} un. aqui` : ''}</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <div className="relative flex items-center gap-3 px-3.5 py-2.5 bg-[#FFF7B0] dark:bg-[#252520] border-t border-[#DDD000] dark:border-white/[0.06] shrink-0">
          <motion.button
            key={`prev-${shakeKey}`}
            type="button"
            onClick={() => tryNavigate(-1)}
            disabled={index === 0}
            animate={shakeKey > 0 && blockedMsg ? { x: [0, -4, 4, -4, 4, 0] } : undefined}
            transition={{ duration: 0.28 }}
            className={cn(
              'inline-flex items-center gap-2.5 h-10 pl-1.5 pr-4 rounded-xl text-[13px] font-extrabold transition-colors active:scale-[0.97] disabled:opacity-35 disabled:cursor-not-allowed',
              'bg-black/[0.06] hover:bg-black/[0.11] dark:bg-white/[0.05] dark:hover:bg-white/[0.09] text-[#1A1A0E] dark:text-[#F2F0E3]',
              editing && 'opacity-40 cursor-not-allowed'
            )}
          >
            <span className="w-7 h-7 rounded-full flex items-center justify-center bg-[#1A1A0E] dark:bg-[#F2F0E3] text-[#FFE500] dark:text-[#1E1E18]">
              <ArrowLeft size={14} strokeWidth={2.8} />
            </span>
            Produto Anterior
          </motion.button>

          {/* Status ocupa o espaço entre os botões (flex-1) em vez de absolute — assim não
              passa por baixo do Total do item quando a mensagem de edição é longa. */}
          <div className={cn(
            'hidden md:flex flex-1 min-w-0 justify-center items-center gap-1.5 text-[11.5px] font-bold',
            editing ? 'text-[#D81E1E]' : 'text-[#1A1A0E]/40 dark:text-[#F2F0E3]/30'
          )}>
            <span className={cn('w-[7px] h-[7px] rounded-full shrink-0',
              editing ? 'bg-[#D81E1E]' : saving ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500')} />
            <span className="truncate">
              {editing
                ? 'Campo em edição — confirme ✓ para trocar de produto ou fechar'
                : saving ? 'Salvando…' : 'Salva ao trocar de produto ou fechar'}
            </span>
          </div>

          <div
            title={hasAdj ? 'Custo com desconto/acréscimo da nota × Qtde Real' : 'Custo × Qtde Real — mesmo valor da coluna Valor Total'}
            className="ml-auto md:ml-0 shrink-0 inline-flex items-baseline gap-2 px-3 py-1.5 rounded-[10px] border-[1.5px] bg-[#FFF4A8] dark:bg-[#FFE500]/[0.09] border-[#E3CF2A] dark:border-[#FFE500]/35 text-[#1A1A0E] dark:text-[#FFE500]"
          >
            <span className="hidden sm:inline text-[9.5px] font-black uppercase tracking-[0.1em] opacity-65">
              Total do item{hasAdj ? ' · c/ desc.' : ''}
            </span>
            <span className="font-mono text-[15px] tabular-nums whitespace-nowrap">R$ {brl(itemTotal)}</span>
          </div>

          <span className="hidden lg:inline font-mono text-[10px] px-[5px] py-px rounded-[5px] border border-black/10 dark:border-white/[0.08] text-[#1A1A0E]/40 dark:text-[#F2F0E3]/30" title="Atalhos">
            Alt ← / Alt →
          </span>
          <motion.button
            key={`next-${shakeKey}`}
            type="button"
            onClick={() => (isLast && !editing ? props.onClose() : tryNavigate(1))}
            animate={shakeKey > 0 && blockedMsg ? { x: [0, -4, 4, -4, 4, 0] } : undefined}
            transition={{ duration: 0.28 }}
            className={cn(
              'shrink-0 inline-flex items-center gap-2.5 h-10 pl-4 pr-1.5 rounded-xl text-[13px] font-extrabold transition-colors active:scale-[0.97]',
              isLast
                ? 'bg-[#D81E1E] hover:bg-[#BF1A1A] text-white'
                : 'bg-black/[0.06] hover:bg-black/[0.11] dark:bg-white/[0.05] dark:hover:bg-white/[0.09] text-[#1A1A0E] dark:text-[#F2F0E3]',
              editing && 'opacity-40 cursor-not-allowed'
            )}
          >
            {isLast ? 'Concluir e Fechar' : 'Próximo Produto'}
            <span className={cn('w-7 h-7 rounded-full flex items-center justify-center',
              isLast ? 'bg-white/20 text-white' : 'bg-[#1A1A0E] dark:bg-[#F2F0E3] text-[#FFE500] dark:text-[#1E1E18]')}>
              <ArrowRight size={14} strokeWidth={2.8} />
            </span>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

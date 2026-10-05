'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GripVertical, MoreHorizontal, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TAG_COLOR_MAP, type FinanceTag, type GrupoDre } from '@/hooks/useFinanceTags';
import type { Transaction } from '@/types/finance';

// Módulo "Grupos das tags" da aba Fluxo de Caixa — quadro com uma coluna por grupo da
// DRE. A tag muda de grupo arrastando o cartão ou pelo menu ⋯ ("Mover para…").

export const GRUPO_COLUNAS: { key: GrupoDre | null; label: string; sinal: string; desc: string }[] = [
  { key: null, label: 'Sem grupo', sinal: '?', desc: 'Despesas aqui caem em "não classificadas"' },
  { key: 'receita', label: 'Receitas', sinal: '+', desc: 'Vendas e entradas' },
  { key: 'custo_variavel', label: 'Custos variáveis', sinal: '−', desc: 'Acompanham as vendas' },
  { key: 'custo_fixo', label: 'Custos fixos', sinal: '−', desc: 'Da operação, todo mês' },
  { key: 'despesa_variavel', label: 'Despesas variáveis', sinal: '−', desc: 'Sem valor ou data fixos' },
  { key: 'despesa_fixa', label: 'Despesas fixas', sinal: '−', desc: 'Recorrentes, todo mês' },
  { key: 'investimento', label: 'Investimentos', sinal: '−', desc: 'Abaixo do resultado' },
  { key: 'ignorar', label: 'Fora do fluxo', sinal: '∅', desc: 'Não entram no relatório' },
];

const milFmt = (v: number) => `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: v < 10000 ? 1 : 0 })} mil`;

interface TagGroupsBoardProps {
  tags: FinanceTag[];
  transactions: Transaction[];
  ano: number;
  busca: string;
  onMove: (tag: FinanceTag, grupo: GrupoDre | null) => Promise<boolean>;
}

export function TagGroupsBoard({ tags, transactions, ano, busca, onMove }: TagGroupsBoardProps) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tag: FinanceTag; de: GrupoDre | null; para: GrupoDre | null } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fecha o menu ⋯ ao clicar fora
  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuId]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Uso de cada tag: nº de movimentações (todas), valor no ano e se aparece em receitas.
  const uso = useMemo(() => {
    const m: Record<string, { n: number; valor: number; receita: boolean }> = {};
    for (const t of transactions) {
      if (t.is_fatura_consolidada) continue;
      const noAno = (t.vencimento ?? t.data)?.slice(0, 4) === String(ano);
      for (const id of t.tag_ids ?? []) {
        const u = (m[id] ??= { n: 0, valor: 0, receita: false });
        u.n++;
        if (noAno) u.valor += Math.abs(t.valor_final || 0);
        if (t.tipo === 'Receita') u.receita = true;
      }
    }
    return m;
  }, [transactions, ano]);

  const total = tags.length;
  const classificadas = tags.filter(t => t.grupo_dre).length;
  const q = busca.trim().toLowerCase();

  const mover = async (tag: FinanceTag, para: GrupoDre | null, registrarDesfazer = true) => {
    setMenuId(null);
    const de = tag.grupo_dre ?? null;
    if (de === para) return;
    const ok = await onMove(tag, para);
    if (!ok) return;
    setFlashId(tag.id);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(registrarDesfazer ? { tag, de, para } : null);
    toastTimer.current = setTimeout(() => { setToast(null); setFlashId(null); }, 3500);
  };

  const nomeGrupo = (g: GrupoDre | null) => GRUPO_COLUNAS.find(c => c.key === g)?.label ?? 'Sem grupo';

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-[1fr_auto] gap-3.5 items-center bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10] px-3.5 py-2.5">
        <p className="text-[12px] leading-relaxed text-on-surface/50">
          Cada tag pertence a <b className="text-on-surface">um grupo da DRE</b>. A movimentação entra no grupo da{' '}
          <b className="text-on-surface">primeira tag classificada</b> dela. Se nenhuma tag estiver classificada, a receita fica em
          Receitas e a despesa em <b className="text-on-surface">Não classificadas</b>. A mudança vale na hora para todos os anos.
        </p>
        <div className="flex items-center gap-2.5">
          <div className="w-40 h-1.5 bg-[#EFE8D2] dark:bg-white/[0.06]">
            <div
              className="h-full bg-[#D81E1E] transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
              style={{ width: `${total ? (classificadas / total) * 100 : 0}%` }}
            />
          </div>
          <span className="text-[11px] font-extrabold text-on-surface/50 whitespace-nowrap">{classificadas} de {total} tags classificadas</span>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
        {GRUPO_COLUNAS.map(col => {
          const colKey = col.key ?? 'none';
          const doGrupo = tags.filter(t => (t.grupo_dre ?? null) === col.key);
          const visiveis = doGrupo.filter(t => !q || t.nome.toLowerCase().includes(q));
          const soma = doGrupo.reduce((a, t) => a + (uso[t.id]?.valor ?? 0), 0);
          const semGrupo = col.key === null;
          return (
            <div
              key={colKey}
              onDragOver={e => { e.preventDefault(); if (overCol !== colKey) setOverCol(colKey); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null); }}
              onDrop={e => {
                e.preventDefault();
                setOverCol(null);
                const tag = tags.find(t => t.id === dragId);
                setDragId(null);
                if (tag) mover(tag, col.key);
              }}
              className={cn(
                'flex flex-col min-h-[168px] bg-white dark:bg-[#1E1E18] border transition-colors',
                overCol === colKey
                  ? 'border-[#D81E1E] bg-[#D81E1E]/[0.05] dark:bg-[#D81E1E]/[0.10]'
                  : semGrupo ? 'border-amber-400/55 dark:border-amber-400/40' : 'border-[#E0D8BF] dark:border-white/[0.10]',
              )}
            >
              <div className={cn(
                'flex items-center gap-1.5 h-[34px] px-2.5 shadow-[inset_0_-1.5px_0_#8F7E10]',
                semGrupo ? 'bg-amber-50 dark:bg-amber-400/[0.07]' : 'bg-[#FFEC4D]',
              )}>
                <span className={cn(
                  'w-3 text-center text-[13px] font-black',
                  col.sinal === '+' ? 'text-[#1F8A4C]' : col.sinal === '−' ? 'text-[#D81E1E]' : semGrupo ? 'text-[#B45309] dark:text-amber-300' : 'text-[rgba(26,26,10,0.55)]',
                )}>{col.sinal}</span>
                <span className={cn('text-[10px] font-black uppercase tracking-[0.08em]', semGrupo ? 'text-[#B45309] dark:text-amber-300' : 'text-[#1A1A0E]')}>{col.label}</span>
                <span className={cn(
                  'ml-auto text-[9px] font-black px-[5px] leading-[15px] rounded-full',
                  semGrupo ? 'bg-amber-400/30 text-[#B45309] dark:text-amber-300' : 'bg-black/[0.12] text-[#1A1A0E]',
                )}>{doGrupo.length}</span>
              </div>
              <div className="flex justify-between gap-2 px-2.5 py-1.5 border-b border-[#EFE8D2] dark:border-white/[0.06] text-[10.5px] text-on-surface/30">
                <span className="truncate">{col.desc}</span>
                {soma > 0 && <b className="font-mono font-medium text-on-surface/50 shrink-0">{milFmt(soma)}/{ano}</b>}
              </div>
              <div className="flex-1 flex flex-col gap-[5px] p-1.5">
                {visiveis.length === 0 ? (
                  <div className="flex-1 min-h-[56px] grid place-items-center border-[1.5px] border-dashed border-[#E0D8BF] dark:border-white/[0.10] text-[11px] font-bold text-on-surface/30">
                    {q ? 'Nenhuma tag' : 'Solte uma tag aqui'}
                  </div>
                ) : visiveis.map(tag => {
                  const u = uso[tag.id];
                  return (
                    <div
                      key={tag.id}
                      draggable
                      onDragStart={e => { setDragId(tag.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tag.id); }}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      className={cn(
                        'relative flex items-center gap-2 h-[38px] pl-1.5 pr-1 border bg-[#FDFAF0] dark:bg-[#252520] cursor-grab active:cursor-grabbing',
                        'border-[#E0D8BF] dark:border-white/[0.08] hover:border-[#CFC4A2] dark:hover:border-white/[0.20] transition-[border-color,opacity,box-shadow] duration-150',
                        dragId === tag.id && 'opacity-40',
                        flashId === tag.id && 'shadow-[0_0_0_3px_rgba(216,30,30,0.30)]',
                      )}
                    >
                      <GripVertical size={12} className="text-on-surface/20 shrink-0" />
                      <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: TAG_COLOR_MAP[tag.cor]?.dot }} />
                      <span className="flex-1 min-w-0 text-[12.5px] font-extrabold text-on-surface truncate" title={tag.descricao ?? tag.nome}>{tag.nome}</span>
                      {tag.exclusivo && (
                        <span title="Tag automática do RH" className="shrink-0 text-[8px] font-black px-1 leading-[13px] border border-[#E0D8BF] dark:border-white/[0.12] text-on-surface/35">RH</span>
                      )}
                      {u?.receita && (
                        <span title="Usada em receitas" className="shrink-0 text-[8px] font-black px-1 leading-[13px] border border-current text-[#1F8A4C] dark:text-[#4ADE80]">REC</span>
                      )}
                      <span className="shrink-0 text-right leading-[1.15] text-[10px] text-on-surface/30">
                        <b className="block font-mono font-medium text-[10.5px] text-on-surface/50">{u?.valor ? milFmt(u.valor) : '—'}</b>
                        {u?.n ?? 0} mov.
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); setMenuId(id => (id === tag.id ? null : tag.id)); }}
                        title="Mover para…"
                        className="w-6 h-6 shrink-0 grid place-items-center text-on-surface/30 hover:text-on-surface hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.08] transition-colors"
                      >
                        <MoreHorizontal size={14} strokeWidth={2.5} />
                      </button>
                      <AnimatePresence>
                        {menuId === tag.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.97, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.97, y: -4 }}
                            transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
                            onClick={e => e.stopPropagation()}
                            className="absolute right-1 top-9 z-30 w-[190px] p-1 origin-top-right bg-white dark:bg-[#2E2E28] border border-[#E0D8BF] dark:border-white/[0.10] shadow-[0_12px_28px_rgba(26,26,10,0.18)]"
                          >
                            <div className="px-2 pt-1.5 pb-1 text-[9px] font-black uppercase tracking-[0.10em] text-on-surface/30">Mover para</div>
                            {GRUPO_COLUNAS.map(c => {
                              const atual = (tag.grupo_dre ?? null) === c.key;
                              return (
                                <button
                                  key={c.key ?? 'none'}
                                  onClick={() => mover(tag, c.key)}
                                  className={cn(
                                    'w-full h-7 flex items-center gap-2 px-2 text-left text-[12px] font-bold hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.08] transition-colors',
                                    atual ? 'text-[#D81E1E]' : 'text-on-surface',
                                  )}
                                >
                                  <span className="w-3 text-center font-black">{c.sinal}</span>
                                  <span className="flex-1">{c.label}</span>
                                  {atual && <Check size={12} strokeWidth={3} />}
                                </button>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 border-l border-t border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
        {[
          ['Várias tags na mesma movimentação', 'Vale a primeira tag que tiver grupo. Ex.: "Fornecedor + Frete" entra como Custo variável pela tag Fornecedor.'],
          ['Receita x despesa', 'O tipo da movimentação define o sinal: uma receita nunca vira custo, mesmo que a tag esteja num grupo de despesa.'],
          ['Fora do fluxo', 'Some do relatório inteiro. Use para transferências entre contas, aportes de sócio e estornos.'],
        ].map(([t, d]) => (
          <div key={t} className="px-3 py-2.5 border-r border-b border-[#E0D8BF] dark:border-white/[0.10] text-[11.5px] leading-[1.45] text-on-surface/50">
            <b className="block mb-0.5 text-[9px] font-black uppercase tracking-[0.10em] text-on-surface">{t}</b>
            {d}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="fixed right-5 bottom-5 z-50 flex items-center gap-3 px-3.5 py-2.5 bg-[#1A1A0E] text-[#F2F0E3] text-[12px] font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
          >
            &ldquo;{toast.tag.nome}&rdquo; → {nomeGrupo(toast.para)}
            <button
              onClick={() => mover({ ...toast.tag, grupo_dre: toast.para }, toast.de, false)}
              className="text-[10.5px] font-black uppercase tracking-[0.05em] text-[#FFE500] active:scale-[0.97] transition-transform"
            >
              Desfazer
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

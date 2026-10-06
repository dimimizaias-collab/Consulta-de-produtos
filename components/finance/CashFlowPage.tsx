'use client';

import { useMemo, useState, Fragment } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, AlertTriangle, Loader2, X, Search, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TAG_COLOR_MAP, type FinanceTag, type GrupoDre } from '@/hooks/useFinanceTags';
import type { Transaction } from '@/types/finance';
import { TagGroupsBoard } from './TagGroupsBoard';
import { PERSONAL_ESTABLISHMENT } from '@/lib/financeEstablishments';
import { useFinanceEstablishments } from '@/hooks/useFinanceEstablishments';

// Aba "Fluxo de Caixa" do Controle Financeiro — visão mensal no formato de DRE.
//
// Classificação: cada movimentação cai no grupo da primeira tag dela que tiver
// `grupo_dre` definido (configurável no painel "Classificar tags"). Receita sem tag
// classificada continua em Receitas; despesa sem tag classificada vai para
// "Não classificadas". Tag marcada como "ignorar" tira a movimentação do fluxo
// (ex.: transferência entre contas). O grupo de cada tag é administrado no módulo
// "Grupos das tags" (TagGroupsBoard), no mesmo seletor da barra.
//
// Mês: o que já foi pago entra no mês do pagamento (data_pagamento → vencimento → data);
// o que está em aberto entra no mês do vencimento (vencimento → data).
//
// Cartão de crédito: entram as compras individuais (que têm as tags) no mês da fatura;
// a linha-resumo da fatura fica de fora para não contar em dobro — só a diferença do
// "valor real" (juros/tarifas do banco) entra como ajuste.

type Grupo = Exclude<GrupoDre, 'ignorar'> | 'nao_classificado';
type Modo = 'previsto' | 'realizado' | 'aberto';

const GRUPO_LABEL: Record<Grupo, string> = {
  receita: 'Receitas',
  custo_variavel: 'Custos variáveis',
  custo_fixo: 'Custos fixos',
  despesa_variavel: 'Despesas variáveis',
  despesa_fixa: 'Despesas fixas',
  nao_classificado: 'Despesas não classificadas',
  investimento: 'Investimentos',
};

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type Vista = 'dre' | 'tags';

const MODOS: { key: Modo; label: string; hint: string }[] = [
  { key: 'previsto', label: 'Previsto', hint: 'Tudo: o que já foi pago + o que está em aberto' },
  { key: 'realizado', label: 'Realizado', hint: 'Só o que já entrou ou saiu do caixa' },
  { key: 'aberto', label: 'Em aberto', hint: 'Só o que ainda falta receber ou pagar' },
];

// Seletor de empresa: "Lojas" soma todas as lojas (sem a conta Pessoal), cada
// estabelecimento sozinho, e "Tudo" junta lojas + Pessoal. Valores que aparecerem nas
// movimentações fora da lista (ex.: nomes antigos) entram como lojas, em ordem alfabética.
const LOJAS = '__lojas__';
const TUDO = '__tudo__';

const SEM_TAG = '__sem_tag__';
const AJUSTE_FATURA = '__ajuste_fatura__';

interface Lancamento {
  ano: number;
  mes: number; // 0-11
  grupo: Grupo;
  linha: string; // id da tag, SEM_TAG ou AJUSTE_FATURA
  realizado: number;
  aberto: number;
  vencido: boolean;
}

// 12 meses + total
type Serie = number[];
const novaSerie = (): Serie => Array(13).fill(0);

const parseYm = (s: string | null | undefined): [number, number] | null => {
  if (!s || s.length < 7) return null;
  const ano = +s.slice(0, 4);
  const mes = +s.slice(5, 7) - 1;
  if (!ano || mes < 0 || mes > 11) return null;
  return [ano, mes];
};

const fmtNum = (v: number) =>
  Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtBRL = (v: number) =>
  (v < 0 ? '−' : '') + 'R$ ' + fmtNum(v);

interface CashFlowPageProps {
  transactions: Transaction[];
  tags: FinanceTag[];
  loading: boolean;
  onUpdateTag: (id: string, fields: Partial<Pick<FinanceTag, 'grupo_dre'>>) => Promise<void>;
}

export function CashFlowPage({ transactions, tags, loading, onUpdateTag }: CashFlowPageProps) {
  // Data de hoje fixada na montagem (data local, não UTC — à noite o UTC já é o dia seguinte).
  const [{ hojeIso, anoAtual, mesHoje }] = useState(() => {
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { hojeIso: iso, anoAtual: d.getFullYear(), mesHoje: d.getMonth() };
  });
  const [ano, setAno] = useState(anoAtual);
  const [modo, setModo] = useState<Modo>('previsto');
  const [mesSel, setMesSel] = useState<number | null>(null);
  const [expandidos, setExpandidos] = useState<Set<Grupo>>(new Set());
  const [vista, setVista] = useState<Vista>('dre');
  const [buscaTag, setBuscaTag] = useState('');
  const [estab, setEstab] = useState<string>(LOJAS);
  const { lojas: lojasCadastradas } = useFinanceEstablishments();

  const estabelecimentos = useMemo(() => {
    const s = new Set([...lojasCadastradas, PERSONAL_ESTABLISHMENT]);
    const extras = new Set<string>();
    for (const t of transactions) if (t.estabelecimento && !s.has(t.estabelecimento)) extras.add(t.estabelecimento);
    return [...lojasCadastradas, ...[...extras].sort((a, b) => a.localeCompare(b)), PERSONAL_ESTABLISHMENT];
  }, [transactions, lojasCadastradas]);
  const estabLabel = estab === LOJAS ? 'Todas as lojas' : estab === TUDO ? 'Lojas + Pessoal' : estab;

  const tagById = useMemo(() => new Map(tags.map(t => [t.id, t])), [tags]);

  // ── Classificação de cada movimentação em lançamentos (realizado/aberto) ──
  const lancamentos = useMemo<Lancamento[]>(() => {
    const out: Lancamento[] = [];
    for (const t of transactions) {
      if (estab === LOJAS ? t.estabelecimento === PERSONAL_ESTABLISHMENT : estab !== TUDO && t.estabelecimento !== estab) continue;
      const valor = Math.abs(t.valor_final || 0);
      const pagoVal = t.pago ? (Math.abs(t.total_pago || 0) || valor) : Math.abs(t.total_pago || 0);
      const abertoVal = t.pago ? 0 : Math.max(valor - pagoVal, 0);
      const ymPago = parseYm(t.data_pagamento) ?? parseYm(t.vencimento) ?? parseYm(t.data);
      const ymAberto = parseYm(t.vencimento) ?? parseYm(t.data);
      const vencido = abertoVal > 0 && (t.vencimento ?? t.data) < hojeIso;

      const push = (grupo: Grupo, linha: string, realizado: number, aberto: number) => {
        if (realizado && ymPago) out.push({ ano: ymPago[0], mes: ymPago[1], grupo, linha, realizado, aberto: 0, vencido: false });
        if (aberto && ymAberto) out.push({ ano: ymAberto[0], mes: ymAberto[1], grupo, linha, realizado: 0, aberto, vencido });
      };

      if (t.is_fatura_consolidada) {
        if (t.usar_valor_real && t.valor_real != null) {
          const diff = Math.abs(t.valor_real) - valor;
          if (Math.abs(diff) >= 0.005) push('nao_classificado', AJUSTE_FATURA, t.pago ? diff : 0, t.pago ? 0 : diff);
        }
        continue;
      }

      const tagsTx = (t.tag_ids ?? []).map(id => tagById.get(id)).filter((x): x is FinanceTag => !!x);
      if (tagsTx.some(tg => tg.grupo_dre === 'ignorar')) continue;

      let grupo: Grupo;
      let linha = SEM_TAG;
      if (t.tipo === 'Receita') {
        const tg = tagsTx.find(x => x.grupo_dre === 'receita');
        grupo = 'receita';
        if (tg) linha = tg.id;
      } else {
        const tg = tagsTx.find(x => x.grupo_dre && x.grupo_dre !== 'receita');
        if (tg) { grupo = tg.grupo_dre as Grupo; linha = tg.id; }
        else grupo = 'nao_classificado';
        // Despesa sem tag classificada mas com alguma tag: mostra pela primeira tag
        if (!tg && tagsTx[0]) linha = tagsTx[0].id;
      }
      push(grupo, linha, pagoVal, abertoVal);
    }
    return out;
  }, [transactions, tagById, hojeIso, estab]);

  const anosDisponiveis = useMemo(() => {
    const s = new Set<number>([anoAtual]);
    for (const l of lancamentos) s.add(l.ano);
    return [...s].sort((a, b) => a - b);
  }, [lancamentos, anoAtual]);

  // ── Séries por grupo e por linha (tag) no ano/modo atual ──
  const { porGrupo, porLinha } = useMemo(() => {
    const porGrupo = {} as Record<Grupo, Serie>;
    const porLinha = {} as Record<Grupo, Map<string, Serie>>;
    (Object.keys(GRUPO_LABEL) as Grupo[]).forEach(g => { porGrupo[g] = novaSerie(); porLinha[g] = new Map(); });
    for (const l of lancamentos) {
      if (l.ano !== ano) continue;
      const v = modo === 'realizado' ? l.realizado : modo === 'aberto' ? l.aberto : l.realizado + l.aberto;
      if (!v) continue;
      porGrupo[l.grupo][l.mes] += v;
      porGrupo[l.grupo][12] += v;
      let s = porLinha[l.grupo].get(l.linha);
      if (!s) { s = novaSerie(); porLinha[l.grupo].set(l.linha, s); }
      s[l.mes] += v;
      s[12] += v;
    }
    return { porGrupo, porLinha };
  }, [lancamentos, ano, modo]);

  const combina = (fn: (i: number) => number): Serie => Array.from({ length: 13 }, (_, i) => fn(i));
  const lucroBruto = combina(i => porGrupo.receita[i] - porGrupo.custo_variavel[i] - porGrupo.custo_fixo[i]);
  const resultadoOp = combina(i => lucroBruto[i] - porGrupo.despesa_variavel[i] - porGrupo.despesa_fixa[i] - porGrupo.nao_classificado[i]);
  const resultado = combina(i => resultadoOp[i] - porGrupo.investimento[i]);
  const margem = combina(i => (porGrupo.receita[i] ? (resultado[i] / porGrupo.receita[i]) * 100 : NaN));
  const acumulado: Serie = (() => {
    const s = novaSerie();
    let acc = 0;
    for (let i = 0; i < 12; i++) { acc += resultado[i]; s[i] = acc; }
    s[12] = acc;
    return s;
  })();

  // ── Indicadores do topo (ano inteiro ou mês clicado) ──
  const kpis = useMemo(() => {
    const k = { entrou: 0, saiu: 0, aReceber: 0, aPagar: 0, vencido: 0 };
    for (const l of lancamentos) {
      if (l.ano !== ano || (mesSel !== null && l.mes !== mesSel)) continue;
      if (l.grupo === 'receita') { k.entrou += l.realizado; k.aReceber += l.aberto; }
      else { k.saiu += l.realizado; k.aPagar += l.aberto; if (l.vencido) k.vencido += l.aberto; }
    }
    return k;
  }, [lancamentos, ano, mesSel]);

  const tagsSemGrupo = tags.filter(t => !t.grupo_dre).length;

  const salvarGrupo = async (tag: FinanceTag, grupo: GrupoDre | null): Promise<boolean> => {
    try {
      await onUpdateTag(tag.id, { grupo_dre: grupo });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(
        msg.includes('grupo_dre')
          ? 'A coluna grupo_dre ainda não existe. Rode supabase/add_finance_tags_grupo_dre.sql no SQL Editor do Supabase.'
          : 'Erro ao salvar: ' + msg,
      );
      return false;
    }
  };

  const toggleGrupo = (g: Grupo) =>
    setExpandidos(prev => {
      const n = new Set(prev);
      if (n.has(g)) n.delete(g); else n.add(g);
      return n;
    });

  const nomeLinha = (linha: string) => {
    if (linha === SEM_TAG) return { nome: 'Sem tag', cor: null as string | null };
    if (linha === AJUSTE_FATURA) return { nome: 'Ajuste de faturas (juros / tarifas)', cor: null };
    const tg = tagById.get(linha);
    return { nome: tg?.nome ?? 'Tag removida', cor: tg ? TAG_COLOR_MAP[tg.cor]?.dot ?? null : null };
  };

  const mesAtual = anoAtual === ano ? mesHoje : -1;
  const naoClassTotal = porGrupo.nao_classificado[12];
  const temInvest = porGrupo.investimento[12] !== 0 || tags.some(t => t.grupo_dre === 'investimento');

  // ── Render helpers ──
  const cellCls = (i: number) => cn(
    'text-right font-mono tabular-nums',
    i === mesSel && 'bg-[#FFF3A3]/50 dark:bg-[#FFE500]/[0.07]',
    i === 12 && 'font-extrabold bg-[#FAF7EE] dark:bg-[#1A1A15]',
  );
  // Coluna de rótulos: escurece a cor da própria linha com uma camada por cima.
  const rotuloCls = 'sticky left-0 z-[1] bg-inherit [background-image:linear-gradient(rgba(26,26,10,0.07),rgba(26,26,10,0.07))] dark:[background-image:linear-gradient(rgba(0,0,0,0.25),rgba(0,0,0,0.25))]';

  const Valor = ({ v, sinal, forte }: { v: number; sinal?: boolean; forte?: boolean }) => {
    if (!v || Number.isNaN(v)) return <span className="text-on-surface/20">—</span>;
    return (
      <span className={cn(
        'text-[12px]',
        forte && 'font-extrabold',
        sinal && v < 0 && 'text-[#D81E1E]',
        sinal && v > 0 && 'text-[#1F8A4C] dark:text-[#4ADE80]',
      )}>
        {sinal && v < 0 ? '−' : ''}{fmtNum(v)}
      </span>
    );
  };

  const linhaGrupo = (g: Grupo, sinal: '+' | '−') => {
    const linhas = [...porLinha[g].entries()].sort((a, b) => b[1][12] - a[1][12]);
    const aberto = expandidos.has(g);
    return (
      <Fragment key={g}>
        <tr
          onClick={() => linhas.length && toggleGrupo(g)}
          className={cn('bg-white dark:bg-[#1E1E18] hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.06] transition-colors', linhas.length && 'cursor-pointer')}
        >
          <td className={rotuloCls}>
            <span className="flex items-center gap-1.5">
              <ChevronDown
                size={12}
                strokeWidth={3}
                className={cn('shrink-0 transition-transform', linhas.length ? 'text-on-surface/45' : 'opacity-0', !aberto && '-rotate-90')}
              />
              <span className={cn('w-3 text-center font-black', sinal === '+' ? 'text-[#1F8A4C] dark:text-[#4ADE80]' : 'text-[#D81E1E]')}>{sinal}</span>
              <span className={cn('font-extrabold', g === 'nao_classificado' ? 'text-[#B45309] dark:text-amber-400' : 'text-on-surface')}>{GRUPO_LABEL[g]}</span>
              {g === 'nao_classificado' && (
                <button
                  onClick={e => { e.stopPropagation(); setVista('tags'); }}
                  className="text-[8.5px] font-black tracking-[0.04em] px-1 leading-[13px] border border-amber-400/55 text-[#B45309] dark:text-amber-300 hover:bg-amber-400/10"
                >CLASSIFICAR</button>
              )}
            </span>
          </td>
          {porGrupo[g].map((v, i) => <td key={i} className={cellCls(i)}><Valor v={v} forte={i === 12} /></td>)}
        </tr>
        {aberto && linhas.map(([linha, serie]) => {
          const { nome, cor } = nomeLinha(linha);
          return (
            <tr key={g + linha} className="bg-[#FDFBF4] dark:bg-[#1B1B16]">
              <td className={rotuloCls}>
                <span className="flex items-center gap-1.5 pl-[42px]">
                  {cor
                    ? <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: cor }} />
                    : <span className="w-[7px] h-[7px] shrink-0 border border-on-surface/25" />}
                  <span className={cn('text-[12px] truncate', linha === SEM_TAG ? 'italic text-on-surface/45' : 'text-on-surface/75')}>{nome}</span>
                </span>
              </td>
              {serie.map((v, i) => <td key={i} className={cn(cellCls(i), 'text-on-surface/70')}><Valor v={v} /></td>)}
            </tr>
          );
        })}
      </Fragment>
    );
  };

  const linhaTotal = (label: string, serie: Serie, destaque?: boolean) => (
    <tr className={destaque ? 'bg-[#FFEC4D]/60 dark:bg-[#FFE500]/[0.12]' : 'bg-[#FFF8D0] dark:bg-[#FFE500]/[0.05]'}>
      <td className={rotuloCls}>
        <span className="flex items-center gap-1.5 pl-[18px]">
          <span className="w-3 text-center font-black text-on-surface/60">=</span>
          <span className={cn('font-black uppercase tracking-[0.04em]', destaque ? 'text-[12px] text-on-surface' : 'text-[11.5px] text-on-surface/85')}>{label}</span>
        </span>
      </td>
      {serie.map((v, i) => <td key={i} className={cellCls(i)}><Valor v={v} sinal forte /></td>)}
    </tr>
  );

  const kpiTiles: { label: string; valor: number; cls?: string; sub?: string }[] = [
    { label: 'Entrou', valor: kpis.entrou, cls: 'text-[#1F8A4C] dark:text-[#4ADE80]' },
    { label: 'Saiu', valor: kpis.saiu, cls: 'text-[#D81E1E]' },
    { label: 'Resultado realizado', valor: kpis.entrou - kpis.saiu, cls: kpis.entrou - kpis.saiu < 0 ? 'text-[#D81E1E]' : 'text-on-surface' },
    { label: 'A receber', valor: kpis.aReceber },
    { label: 'A pagar', valor: kpis.aPagar, sub: kpis.vencido ? `${fmtBRL(kpis.vencido)} vencido` : undefined },
    { label: 'Resultado previsto', valor: kpis.entrou + kpis.aReceber - kpis.saiu - kpis.aPagar },
  ];

  return (
    <div className="space-y-2.5">
      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
          <button
            onClick={() => { setAno(a => a - 1); setMesSel(null); }}
            className="w-7 h-[26px] flex items-center justify-center text-on-surface/45 hover:text-on-surface transition-colors"
            title="Ano anterior"
          ><ChevronLeft size={14} strokeWidth={2.5} /></button>
          <select
            value={ano}
            onChange={e => { setAno(+e.target.value); setMesSel(null); }}
            className="h-[26px] px-1.5 bg-transparent border-x border-[#E0D8BF] dark:border-white/[0.10] text-[12px] font-black text-on-surface outline-none cursor-pointer"
          >
            {(anosDisponiveis.includes(ano) ? anosDisponiveis : [...anosDisponiveis, ano].sort()).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button
            onClick={() => { setAno(a => a + 1); setMesSel(null); }}
            className="w-7 h-[26px] flex items-center justify-center text-on-surface/45 hover:text-on-surface transition-colors"
            title="Próximo ano"
          ><ChevronRight size={14} strokeWidth={2.5} /></button>
        </div>

        <div className="flex border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
          {([['dre', 'DRE mensal'], ['tags', 'Grupos das tags']] as const).map(([key, label], i) => (
            <button
              key={key}
              onClick={() => setVista(key)}
              className={cn(
                'h-[26px] flex items-center gap-1.5 px-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.05em] whitespace-nowrap transition-colors active:scale-[0.97]',
                i > 0 && 'border-l border-[#E0D8BF] dark:border-white/[0.10]',
                vista === key ? 'bg-primary text-white' : 'text-on-surface/45 hover:text-on-surface',
              )}
            >
              {label}
              {key === 'tags' && tagsSemGrupo > 0 && (
                <span className={cn('text-[9px] font-black px-[5px] leading-[15px] rounded-full tracking-normal', vista === key ? 'bg-white/25' : 'bg-amber-400/30 text-[#B45309] dark:text-amber-300')}>
                  {tagsSemGrupo}
                </span>
              )}
            </button>
          ))}
        </div>

        <span className="w-px h-5 mx-1 bg-[#E0D8BF] dark:bg-white/[0.10]" />

        {vista === 'dre' ? (<>
          <div className="flex border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
            {MODOS.map((m, i) => (
              <button
                key={m.key}
                title={m.hint}
                onClick={() => setModo(m.key)}
                className={cn(
                  'h-[26px] px-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.05em] whitespace-nowrap transition-colors active:scale-[0.97]',
                  i > 0 && 'border-l border-[#E0D8BF] dark:border-white/[0.10]',
                  modo === m.key ? 'bg-primary text-white' : 'text-on-surface/45 hover:text-on-surface',
                )}
              >{m.label}</button>
            ))}
          </div>

          <div className="flex items-center border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
            <span className="h-[26px] w-7 flex items-center justify-center text-on-surface/35" title="Empresa">
              <Store size={13} />
            </span>
            {[LOJAS, ...estabelecimentos, TUDO].map(e => (
              <button
                key={e}
                onClick={() => setEstab(e)}
                title={e === LOJAS ? 'Todas as lojas juntas, sem a conta Pessoal' : e === TUDO ? 'Lojas + conta Pessoal' : undefined}
                className={cn(
                  'h-[26px] px-2.5 border-l border-[#E0D8BF] dark:border-white/[0.10] text-[10.5px] font-extrabold uppercase tracking-[0.05em] whitespace-nowrap transition-colors active:scale-[0.97]',
                  e === PERSONAL_ESTABLISHMENT && 'border-l-2 border-l-[#CFC4A2] dark:border-l-white/[0.20]',
                  estab === e ? 'bg-primary text-white' : 'text-on-surface/45 hover:text-on-surface',
                )}
              >{e === LOJAS ? 'Lojas' : e === TUDO ? 'Tudo' : e}</button>
            ))}
          </div>

          {mesSel !== null && (
            <button
              onClick={() => setMesSel(null)}
              className="h-7 flex items-center gap-1.5 px-2.5 border border-[#D81E1E]/40 bg-[#D81E1E]/[0.06] text-[11px] font-extrabold text-[#D81E1E]"
            >
              {MESES[mesSel]}/{ano} <X size={12} strokeWidth={3} />
            </button>
          )}

          <span className="ml-auto hidden 2xl:inline text-[11px] font-semibold text-on-surface/30">{MODOS.find(m => m.key === modo)?.hint}</span>
        </>) : (<>
          <div className="relative group">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface/30 group-focus-within:text-primary transition-colors pointer-events-none" />
            <input
              value={buscaTag}
              onChange={e => setBuscaTag(e.target.value)}
              placeholder="Buscar tag..."
              className="h-7 w-60 bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10] pl-8 pr-7 text-xs font-semibold text-on-surface placeholder:text-on-surface/25 placeholder:font-medium caret-[#D81E1E] outline-none hover:border-[#CFC4A2] dark:hover:border-white/[0.20] focus:!border-[#D81E1E] transition-colors"
            />
            {buscaTag && (
              <button onClick={() => setBuscaTag('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface/30 hover:text-on-surface transition-colors">
                <X size={13} />
              </button>
            )}
          </div>
          <span className="ml-auto text-[11px] font-semibold text-on-surface/30">Arraste uma tag para outro grupo, ou use o menu ⋯</span>
        </>)}
      </div>

      {vista === 'tags' ? (
        <TagGroupsBoard tags={tags} transactions={transactions} ano={ano} busca={buscaTag} onMove={salvarGrupo} />
      ) : (<>
      {/* Indicadores */}
      <div className="grid grid-cols-3 lg:grid-cols-6 border-l border-t border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
        {kpiTiles.map(k => (
          <div key={k.label} className="px-3 py-2.5 border-r border-b border-[#E0D8BF] dark:border-white/[0.10]">
            <div className="text-[9px] font-black uppercase tracking-[0.10em] text-on-surface/40">
              {k.label} <span className="text-on-surface/25">· {mesSel !== null ? `${MESES[mesSel]}/${ano}` : ano}</span>
            </div>
            <div className={cn('mt-0.5 text-[16px] font-black font-mono tabular-nums', k.cls ?? 'text-on-surface')}>{fmtBRL(k.valor)}</div>
            {k.sub && <div className="text-[10.5px] font-bold text-[#D81E1E]">{k.sub}</div>}
          </div>
        ))}
      </div>

      {naoClassTotal > 0 && (
        <button
          onClick={() => setVista('tags')}
          className="w-full flex items-center gap-2 px-3 py-2 border border-amber-400/50 bg-amber-50 dark:bg-amber-400/[0.07] text-left text-[12px] text-[#92400E] dark:text-amber-300"
        >
          <AlertTriangle size={14} className="shrink-0" />
          <span>
            <b>{fmtBRL(naoClassTotal)}</b> em despesas de {ano}{estab !== TUDO ? ` (${estabLabel})` : ''} sem grupo da DRE
            {tagsSemGrupo > 0 ? ` (${tagsSemGrupo} ${tagsSemGrupo === 1 ? 'tag sem grupo' : 'tags sem grupo'} e movimentações sem tag).` : ' (movimentações sem tag classificada).'}
          </span>
          <span className="ml-auto shrink-0 text-[10.5px] font-extrabold uppercase tracking-[0.05em]">Classificar tags →</span>
        </button>
      )}

      {/* Tabela DRE */}
      {loading ? (
        <div className="flex items-center justify-center py-10 bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10]">
          <Loader2 size={18} className="animate-spin text-on-surface/30" />
        </div>
      ) : (
        <div className="bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10] overflow-x-auto">
          <table className="w-full min-w-[1320px] table-fixed text-[13px] border-collapse [&_td]:h-9 [&_td]:px-2.5 [&_td]:whitespace-nowrap [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td]:border-r [&_td]:border-b [&_td]:border-[#A8A290] dark:[&_td]:border-white/20 [&_td:last-child]:border-r-0">
            <colgroup>
              <col className="w-[250px]" />
              {MESES.map(m => <col key={m} />)}
              <col className="w-[112px]" />
            </colgroup>
            <thead>
              <tr className="bg-[#FFEC4D]">
                <th className="sticky left-0 z-[2] bg-[#FFEC4D] h-8 px-2.5 text-left shadow-[inset_-1px_0_0_#B8A31F,inset_0_-1.5px_0_#8F7E10]">
                  <span className="text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)]">
                    {modo === 'aberto' ? 'Em aberto' : modo === 'realizado' ? 'Realizado' : 'Previsto'} · {ano} · {estabLabel}
                  </span>
                </th>
                {MESES.map((m, i) => (
                  <th key={m} className={cn('h-8 px-2.5 text-right shadow-[inset_-1px_0_0_#B8A31F,inset_0_-1.5px_0_#8F7E10]', i === mesSel && 'bg-[#FFE014]')}>
                    <button
                      onClick={() => setMesSel(s => (s === i ? null : i))}
                      title="Ver indicadores deste mês"
                      className={cn(
                        'inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.10em] transition-colors',
                        i === mesSel ? 'text-[#1A1A0E]' : 'text-[rgba(26,26,10,0.55)] hover:text-[#1A1A0E]',
                      )}
                    >
                      {i === mesAtual && <span className="w-[5px] h-[5px] rounded-full bg-[#D81E1E]" />}
                      {m}
                    </button>
                  </th>
                ))}
                <th className="h-8 px-2.5 text-right shadow-[inset_0_-1.5px_0_#8F7E10]">
                  <span className="text-[9px] font-black uppercase tracking-[0.10em] text-[#1A1A0E]">Total</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {linhaGrupo('receita', '+')}
              {linhaGrupo('custo_variavel', '−')}
              {linhaGrupo('custo_fixo', '−')}
              {linhaTotal('Lucro bruto', lucroBruto)}
              {linhaGrupo('despesa_variavel', '−')}
              {linhaGrupo('despesa_fixa', '−')}
              {naoClassTotal !== 0 && linhaGrupo('nao_classificado', '−')}
              {linhaTotal(temInvest ? 'Resultado operacional' : 'Resultado do período', resultadoOp, !temInvest)}
              {temInvest && linhaGrupo('investimento', '−')}
              {temInvest && linhaTotal('Resultado do período', resultado, true)}
              <tr className="bg-white dark:bg-[#1E1E18]">
                <td className={rotuloCls}>
                  <span className="pl-[38px] text-[11.5px] font-bold text-on-surface/55">Margem sobre receitas</span>
                </td>
                {margem.map((v, i) => (
                  <td key={i} className={cellCls(i)}>
                    {Number.isNaN(v)
                      ? <span className="text-on-surface/20">—</span>
                      : <span className={cn('text-[11.5px] font-bold', v < 0 ? 'text-[#D81E1E]' : 'text-on-surface/60')}>{v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>}
                  </td>
                ))}
              </tr>
              <tr className="bg-[#FAF7EE] dark:bg-[#1A1A15]">
                <td className={rotuloCls}>
                  <span className="pl-[38px] text-[11.5px] font-bold text-on-surface/55">Saldo acumulado no ano</span>
                </td>
                {acumulado.map((v, i) => <td key={i} className={cellCls(i)}><Valor v={v} sinal /></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10.5px] text-on-surface/35 px-0.5">
        Pagos entram no mês do pagamento; em aberto, no mês do vencimento. Compras no cartão entram pelas tags de cada compra, no mês da fatura.
        Clique num grupo para abrir as tags e num mês para ver os indicadores dele.
      </p>
      </>)}
    </div>
  );
}

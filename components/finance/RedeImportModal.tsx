'use client';

import { useEffect, useMemo, useState, Fragment } from 'react';
import { motion } from 'motion/react';
import { X, Upload, FileSpreadsheet, Loader2, AlertTriangle, Check, ChevronRight, RotateCcw, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { TAG_COLOR_MAP, type FinanceTag, type GrupoDre } from '@/hooks/useFinanceTags';
import { ESTABLISHMENTS } from '@/lib/financeEstablishments';
import {
  parseRedeFile, agregarPorDia, carregarRedeConfig, salvarRedeConfig, vendasExistentesNoPeriodo,
  vendasDosDias, movimentacoesPorRef, sincronizarDias, saleKey, diaKey, redeRef, valorDoKind, hashArquivo,
  type RedeParsed, type RedeConfig, type RedeDia, type RedeKind, type RedeSale, type SyncResultado,
} from '@/lib/redeImport';

// Importação do relatório de vendas da Rede (crédito/débito) — 3 passos:
// Arquivo (lê, reconhece loja e tags) → Prévia (por dia de recebimento) → Concluído.

type Passo = 'arquivo' | 'previa' | 'concluido';
type StatusDia = 'novo' | 'atualiza' | 'ja';

const KINDS: RedeKind[] = ['credito', 'debito', 'mdr', 'antecipacao'];
const TAG_PAPEL: Record<RedeKind, { titulo: string; sub: string; nome: string; cor: string; grupo: GrupoDre }> = {
  credito: { titulo: 'Vendas no crédito', sub: 'Receita · valor bruto', nome: 'Crédito', cor: 'blue', grupo: 'receita' },
  debito: { titulo: 'Vendas no débito', sub: 'Receita · valor bruto', nome: 'Débito', cor: 'teal', grupo: 'receita' },
  mdr: { titulo: 'Taxa MDR', sub: 'Despesa · taxa da maquininha', nome: 'Taxa maquininha (MDR)', cor: 'red', grupo: 'despesa_variavel' },
  antecipacao: { titulo: 'Antecipação', sub: 'Despesa · recebimento automático', nome: 'Antecipação', cor: 'amber', grupo: 'despesa_variavel' },
};
const CFG_TAG: Record<RedeKind, keyof RedeConfig> = { credito: 'tag_credito', debito: 'tag_debito', mdr: 'tag_mdr', antecipacao: 'tag_antecipacao' };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const adivinharTag = (tags: FinanceTag[], kind: RedeKind) => tags.find(t => {
  const n = norm(t.nome);
  if (kind === 'credito') return n === 'credito' || n.startsWith('credito ') || n.startsWith('vendas credito');
  if (kind === 'debito') return n === 'debito' || n.startsWith('debito ') || n.startsWith('vendas debito');
  if (kind === 'mdr') return n.includes('mdr') || n.includes('maquininha');
  return n.includes('antecipa');
})?.id ?? '';
const adivinharEstab = (nome: string) => {
  const n = norm(nome);
  if (n.includes('universo')) return 'Universo do R$1,99';
  if (n.includes('castelo')) return 'Castelo Real';
  return '';
};

const fmt = (v: number) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (v: number) => (v < 0 ? '−' : '') + 'R$ ' + fmt(v);
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dmy = (iso: string) => `${dm(iso)}/${iso.slice(0, 4)}`;
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dow = (iso: string) => DOW[new Date(`${iso}T12:00:00`).getDay()];
const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const selCls = 'h-[30px] w-full px-2 bg-white dark:bg-[#252520] border text-[12px] font-bold text-on-surface outline-none focus:border-[#D81E1E] cursor-pointer transition-colors';
const btnCls = 'h-[34px] px-4 text-[11.5px] font-extrabold uppercase tracking-[0.05em] border transition-transform active:scale-[0.97]';
const btnGhost = cn(btnCls, 'bg-[rgba(26,26,10,0.08)] dark:bg-white/[0.07] border-[rgba(26,26,10,0.14)] dark:border-white/[0.10] text-[rgba(26,26,10,0.55)] dark:text-white/50');
const btnPri = cn(btnCls, 'bg-[#D81E1E] border-[#D81E1E] text-white disabled:opacity-40 disabled:active:scale-100');
const thCls = 'sticky top-0 z-[2] h-[30px] px-2.5 bg-[#FFEC4D] text-right text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] whitespace-nowrap shadow-[inset_-1px_0_0_#B8A31F,inset_0_-1.5px_0_#8F7E10]';

interface Previa {
  novas: RedeSale[];
  dias: (RedeDia & { status: StatusDia })[];
  afetados: { numero: string; data: string }[];
  criar: number;
  atualizar: number;
  jaExistentes: number;
}

interface RedeImportModalProps {
  tags: FinanceTag[];
  createTag: (nome: string, cor: string, descricao: string) => Promise<FinanceTag>;
  updateTag: (id: string, fields: Partial<Pick<FinanceTag, 'grupo_dre'>>) => Promise<void>;
  onClose: () => void;
  onImported: () => void;
  onVerFluxo: () => void;
}

export function RedeImportModal({ tags, createTag, updateTag, onClose, onImported, onVerFluxo }: RedeImportModalProps) {
  const [passo, setPasso] = useState<Passo>('arquivo');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [parsed, setParsed] = useState<RedeParsed | null>(null);
  const [cfg, setCfg] = useState<RedeConfig | null>(null);
  const [estabMap, setEstabMap] = useState<Record<string, string>>({});
  const [tagSel, setTagSel] = useState<Record<RedeKind, string>>({ credito: '', debito: '', mdr: '', antecipacao: '' });
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [criandoTag, setCriandoTag] = useState<RedeKind | null>(null);
  const [resultado, setResultado] = useState<(SyncResultado & { vendas: number; ignoradas: number; importId: string }) | null>(null);
  const [desfeito, setDesfeito] = useState(false);
  const hoje = useMemo(hojeLocal, []);

  useEffect(() => {
    carregarRedeConfig().then(setCfg).catch(e => setErro(e instanceof Error ? e.message : String(e)));
  }, []);

  const lerArquivo = async (f: File) => {
    setArquivo(f);
    setErro('');
    setParsed(null);
    setCarregando('Lendo o relatório…');
    try {
      const p = await parseRedeFile(f);
      setParsed(p);
      const base = cfg ?? { estabelecimentos: {}, tag_credito: null, tag_debito: null, tag_mdr: null, tag_antecipacao: null };
      setEstabMap(Object.fromEntries(p.estabelecimentos.map(e => [e.numero, base.estabelecimentos[e.numero] ?? adivinharEstab(e.nome)])));
      setTagSel(Object.fromEntries(KINDS.map(k => {
        const salvo = base[CFG_TAG[k]] as string | null;
        return [k, salvo && tags.some(t => t.id === salvo) ? salvo : adivinharTag(tags, k)];
      })) as Record<RedeKind, string>);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(null);
    }
  };

  const criarTag = async (kind: RedeKind) => {
    const papel = TAG_PAPEL[kind];
    setCriandoTag(kind);
    try {
      const existente = tags.find(t => norm(t.nome) === norm(papel.nome));
      const tag = existente ?? await createTag(papel.nome, papel.cor, `Importação Rede — ${papel.titulo.toLowerCase()}`);
      if (!tag.grupo_dre) await updateTag(tag.id, { grupo_dre: papel.grupo }).catch(() => undefined);
      setTagSel(s => ({ ...s, [kind]: tag.id }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCriandoTag(null);
    }
  };

  const faltaEstab = parsed?.estabelecimentos.some(e => !estabMap[e.numero]) ?? true;
  const faltaTag = KINDS.some(k => !tagSel[k]);
  const configAtual = (): RedeConfig => ({
    estabelecimentos: { ...(cfg?.estabelecimentos ?? {}), ...estabMap },
    tag_credito: tagSel.credito || null, tag_debito: tagSel.debito || null,
    tag_mdr: tagSel.mdr || null, tag_antecipacao: tagSel.antecipacao || null,
  });

  const montarPrevia = async () => {
    if (!parsed) return;
    setErro('');
    setCarregando('Conferindo o que já foi importado…');
    try {
      const numeros = parsed.estabelecimentos.map(e => e.numero);
      const existentes = await vendasExistentesNoPeriodo(numeros, parsed.periodo[0], parsed.periodo[1]);
      const jaTem = new Set(existentes.map(saleKey));
      const novas = parsed.sales.filter(s => !jaTem.has(saleKey(s)));
      const afetadosMap = new Map<string, { numero: string; data: string }>();
      for (const s of novas) afetadosMap.set(diaKey(s.numero_estabelecimento, s.data_recebimento), { numero: s.numero_estabelecimento, data: s.data_recebimento });
      const afetados = [...afetadosMap.values()];
      const doBanco = await vendasDosDias(afetados);
      const depois = agregarPorDia([...doBanco, ...novas]);
      const txs = new Map((await movimentacoesPorRef(afetados.flatMap(d => KINDS.map(k => redeRef(d.numero, d.data, k))))).map(t => [t.origem_ref, t]));

      let criar = 0, atualizar = 0;
      const temTx = new Set<string>();
      for (const d of afetados) {
        const ag = depois.get(diaKey(d.numero, d.data));
        for (const k of KINDS) {
          const tx = txs.get(redeRef(d.numero, d.data, k));
          const v = ag ? valorDoKind(ag, k) : 0;
          if (tx) temTx.add(diaKey(d.numero, d.data));
          if (v > 0 && !tx) criar++;
          else if (tx && Math.abs(Number(tx.valor_final) - v) >= 0.005) atualizar++;
        }
      }
      const doArquivo = [...agregarPorDia(parsed.sales).values()].sort((a, b) => a.data.localeCompare(b.data) || a.numero.localeCompare(b.numero));
      const dias = doArquivo.map(d => {
        const k = diaKey(d.numero, d.data);
        const status: StatusDia = !afetadosMap.has(k) ? 'ja' : temTx.has(k) ? 'atualiza' : 'novo';
        return { ...d, status };
      });
      setPrevia({ novas, dias, afetados, criar, atualizar, jaExistentes: parsed.sales.length - novas.length });
      // Abre de cara o dia que junta mais datas de venda (ex.: segunda depois de feriado)
      const maior = dias.reduce<RedeDia | null>((a, d) => (!a || d.vendasDe.length > a.vendasDe.length ? d : a), null);
      setExpandidos(new Set(maior ? [diaKey(maior.numero, maior.data)] : []));
      setPasso('previa');
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(null);
    }
  };

  const importar = async () => {
    if (!parsed || !previa || !arquivo) return;
    setErro('');
    setCarregando('Importando…');
    try {
      const config = configAtual();
      await salvarRedeConfig(config);
      setCfg(config);
      const hash = await hashArquivo(arquivo);
      const { data: log, error: logErr } = await supabase.from('finance_import_logs')
        .insert({ file_hash: `rede:${hash}:${Date.now()}`, file_name: arquivo.name }).select('id').single();
      if (logErr) throw new Error(logErr.message);
      const importId = String(log.id);
      try {
        for (let i = 0; i < previa.novas.length; i += 500) {
          const lote = previa.novas.slice(i, i + 500).map(s => ({ ...s, import_id: importId }));
          const { error } = await supabase.from('finance_rede_sales')
            .upsert(lote, { onConflict: 'numero_estabelecimento,nsu,data_venda', ignoreDuplicates: true });
          if (error) throw new Error(error.message);
        }
        const r = await sincronizarDias(previa.afetados, config, importId, hoje);
        setResultado({ ...r, vendas: previa.novas.length, ignoradas: previa.jaExistentes, importId });
        setDesfeito(false);
        setPasso('concluido');
        onImported();
      } catch (e) {
        // Desfaz o que entrou para não deixar a importação pela metade
        await supabase.from('finance_rede_sales').delete().eq('import_id', importId);
        await sincronizarDias(previa.afetados, config, null, hoje).catch(() => undefined);
        await supabase.from('finance_import_logs').delete().eq('id', importId);
        throw e;
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(null);
    }
  };

  const desfazer = async () => {
    if (!resultado || !previa) return;
    setErro('');
    setCarregando('Desfazendo…');
    try {
      const { error } = await supabase.from('finance_rede_sales').delete().eq('import_id', resultado.importId);
      if (error) throw new Error(error.message);
      await sincronizarDias(previa.afetados, configAtual(), null, hoje);
      await supabase.from('finance_import_logs').delete().eq('id', resultado.importId);
      setDesfeito(true);
      onImported();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(null);
    }
  };

  const tot = useMemo(() => {
    const d = previa?.dias ?? [];
    const s = (k: 'credito' | 'debito' | 'mdr' | 'antecipacao' | 'liquido' | 'nCredito' | 'nDebito') => d.reduce((a, x) => a + x[k], 0);
    return { credito: s('credito'), debito: s('debito'), mdr: s('mdr'), antecipacao: s('antecipacao'), liquido: s('liquido'), nCredito: s('nCredito'), nDebito: s('nDebito') };
  }, [previa]);

  const reimportacao = !!previa && previa.jaExistentes > 0;
  const tagById = (id: string) => tags.find(t => t.id === id);
  const PASSOS: [Passo, string][] = [['arquivo', 'Arquivo'], ['previa', 'Prévia'], ['concluido', 'Concluído']];
  const passoIdx = PASSOS.findIndex(p => p[0] === passo);

  const pill = (d: RedeDia & { status: StatusDia }) => {
    if (reimportacao) {
      if (d.status === 'ja') return <span className="text-[8.5px] font-black uppercase tracking-[0.05em] px-[5px] leading-[15px] border border-current text-on-surface/30">Já importado</span>;
      if (d.status === 'atualiza') return <span className="text-[8.5px] font-black uppercase tracking-[0.05em] px-[5px] leading-[15px] border border-current text-[#2563EB] dark:text-[#60A5FA]">Atualiza</span>;
      return <span className="text-[8.5px] font-black uppercase tracking-[0.05em] px-[5px] leading-[15px] border border-current text-[#0A7A55] dark:text-[#34D399]">Novo</span>;
    }
    return d.data <= hoje
      ? <span className="text-[8.5px] font-black uppercase tracking-[0.05em] px-[5px] leading-[15px] border border-current text-[#0A7A55] dark:text-[#34D399]">Recebido</span>
      : <span className="text-[8.5px] font-black uppercase tracking-[0.05em] px-[5px] leading-[15px] border border-current text-[#92400E] dark:text-[#FCD34D]">A receber</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" onClick={carregando ? undefined : onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className={cn('relative flex flex-col max-h-[calc(100vh-40px)] bg-[#FDFAF0] dark:bg-[#1E1E18] shadow-2xl', passo === 'concluido' ? 'w-full max-w-[620px]' : 'w-full max-w-[1120px]')}
      >
        {/* Cabeçalho */}
        <div className="flex items-center gap-2.5 h-[54px] px-4 shrink-0 bg-[#FFE500] dark:bg-[#252520] border-b border-[#D4C000] dark:border-white/[0.07]">
          <span className="w-8 h-8 grid place-items-center bg-[rgba(26,26,10,0.09)] dark:bg-[rgba(216,30,30,0.13)] text-[#1A1A0E] dark:text-[#D81E1E]"><CreditCard size={16} /></span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">Importar vendas da maquininha</h2>
            <p className="text-[11px] font-semibold text-[rgba(26,26,10,0.45)] dark:text-white/30">Rede · crédito e débito</p>
          </div>
          <div className="ml-auto hidden sm:flex items-center">
            {PASSOS.map(([k, label], i) => (
              <Fragment key={k}>
                {i > 0 && <span className="w-3.5 h-px mx-2.5 bg-[rgba(26,26,10,0.2)] dark:bg-white/10" />}
                <span className={cn(
                  'flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.05em]',
                  i === passoIdx ? 'text-[#1A1A0E] dark:text-[#F2F0E3]' : i < passoIdx ? 'text-[#0A7A55] dark:text-[#34D399]' : 'text-[rgba(26,26,10,0.4)] dark:text-white/30',
                )}>
                  <i className={cn('not-italic w-[18px] h-[18px] grid place-items-center border-[1.5px] border-current text-[10px]', i === passoIdx && 'bg-[#D81E1E] border-[#D81E1E] text-white')}>
                    {i < passoIdx ? <Check size={10} strokeWidth={3.5} /> : i + 1}
                  </i>
                  {label}
                </span>
              </Fragment>
            ))}
          </div>
          <button
            onClick={onClose}
            disabled={!!carregando}
            className="ml-3 w-[30px] h-[30px] grid place-items-center bg-[rgba(26,26,10,0.08)] dark:bg-white/[0.06] text-[rgba(26,26,10,0.45)] dark:text-white/35 hover:text-[#D81E1E] active:scale-[0.93] transition-[color,transform]"
          ><X size={15} strokeWidth={2.5} /></button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
          {erro && (
            <div className="flex items-center gap-2 px-3 py-2 border border-[#D81E1E]/40 bg-[#D81E1E]/[0.06] text-[12px] font-semibold text-[#D81E1E]">
              <AlertTriangle size={14} className="shrink-0" /> {erro}
            </div>
          )}

          {passo === 'arquivo' && (<>
            {!parsed ? (
              <div>
                <span className="block mb-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-on-surface/45">Relatório de vendas da Rede</span>
                <label
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) lerArquivo(f); }}
                  className="flex flex-col items-center gap-1.5 p-8 bg-white dark:bg-[#252520] border-[1.5px] border-dashed border-[#E0D8BF] dark:border-white/[0.10] text-on-surface/30 hover:border-[#D81E1E] hover:text-[#D81E1E] cursor-pointer transition-colors"
                >
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) lerArquivo(f); e.target.value = ''; }} />
                  {carregando ? <Loader2 size={26} className="animate-spin" /> : <Upload size={26} />}
                  <b className="text-[13px] text-on-surface">{carregando ?? 'Arraste o arquivo aqui ou clique para escolher'}</b>
                  <small className="text-[11px] font-semibold">Excel (.xlsx) ou CSV — baixado em Rede › Vendas › Exportar</small>
                </label>
                <p className="mt-2 text-[10.5px] text-on-surface/30">Pode importar o mesmo período mais de uma vez: vendas que já entraram são ignoradas e os dias são recalculados.</p>
              </div>
            ) : (<>
              <div className="flex items-center gap-3 px-3 py-2.5 border border-[#0A7A55]/35 bg-[#0A7A55]/[0.08] dark:bg-[#34D399]/[0.08]">
                <span className="w-[34px] h-[34px] grid place-items-center bg-[#0A7A55] text-white"><FileSpreadsheet size={16} /></span>
                <span className="min-w-0">
                  <b className="block text-[12.5px] font-extrabold text-on-surface truncate">{arquivo?.name}</b>
                  <small className="block text-[11px] font-semibold text-on-surface/45">
                    Relatório de vendas Rede reconhecido · {parsed.sales.length.toLocaleString('pt-BR')} vendas lidas
                    {parsed.invalidas > 0 && ` · ${parsed.invalidas} canceladas/não aprovadas (ficam fora da soma)`}
                    {parsed.pixIgnoradas > 0 && ` · ${parsed.pixIgnoradas} PIX ignoradas (importação de PIX virá depois)`}
                  </small>
                </span>
                <label className="ml-auto shrink-0 text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-on-surface/45 hover:text-on-surface cursor-pointer">
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) lerArquivo(f); e.target.value = ''; }} />
                  Trocar arquivo
                </label>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 border-l border-t border-[#E0D8BF] dark:border-white/[0.08] bg-white dark:bg-[#252520]">
                {[
                  ['Período das vendas', `${dm(parsed.periodo[0])} a ${dmy(parsed.periodo[1])}`, ''],
                  ['Vendas', parsed.sales.length.toLocaleString('pt-BR'), `${parsed.sales.filter(s => s.modalidade === 'credito').length} crédito · ${parsed.sales.filter(s => s.modalidade === 'debito').length} débito`],
                  ['Máquinas', String(parsed.maquinas.length), parsed.maquinas.join(' · ')],
                  ['Valor bruto', brl(parsed.sales.filter(s => s.valida).reduce((a, s) => a + s.valor_bruto, 0)), ''],
                ].map(([l, v, s]) => (
                  <div key={l} className="px-3 py-2 border-r border-b border-[#E0D8BF] dark:border-white/[0.08]">
                    <small className="text-[10.5px] font-semibold text-on-surface/45">{l}</small>
                    <b className="block mt-0.5 text-[13.5px] font-black font-mono tabular-nums text-on-surface">{v}</b>
                    {s && <small className="text-[10.5px] font-semibold text-on-surface/45">{s}</small>}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08]">
                  <div className="flex items-center h-8 px-3 bg-[#FFEC4D] shadow-[inset_0_-1.5px_0_#8F7E10] text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)]">
                    Estabelecimento <span className="ml-auto normal-case tracking-normal text-[10.5px] font-bold">pelo nº da Rede — fica salvo</span>
                  </div>
                  {parsed.estabelecimentos.map(e => (
                    <div key={e.numero} className="grid grid-cols-[1fr_16px_1.1fr] items-center gap-2 px-3 py-2 border-b border-[#EFE8D2] dark:border-white/[0.06] last:border-b-0">
                      <div className="min-w-0">
                        <b className="block text-[12.5px] font-extrabold text-on-surface">Nº {e.numero}</b>
                        <small className="block text-[10.5px] font-semibold text-on-surface/45 truncate">{e.nome}{e.cnpj && ` · CNPJ ${cnpjFmt(e.cnpj)}`} · {e.maquinas.length} {e.maquinas.length === 1 ? 'máquina' : 'máquinas'}</small>
                      </div>
                      <ChevronRight size={14} className="text-on-surface/30" />
                      <select
                        value={estabMap[e.numero] ?? ''}
                        onChange={ev => setEstabMap(m => ({ ...m, [e.numero]: ev.target.value }))}
                        className={cn(selCls, estabMap[e.numero] ? 'border-[#E0D8BF] dark:border-white/[0.08]' : 'border-amber-400/60 text-[#92400E] dark:text-[#FCD34D]')}
                      >
                        <option value="">Escolha a loja…</option>
                        {ESTABLISHMENTS.map(x => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </div>
                  ))}
                  <p className="px-3 py-2 border-t border-[#EFE8D2] dark:border-white/[0.06] text-[11px] leading-[1.45] text-on-surface/45">
                    Na próxima importação esse número já vem preenchido. Se um relatório trouxer outro nº (ex.: máquina da Castelo Real), ele aparece aqui para escolher a loja.
                  </p>
                </div>

                <div className="bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08]">
                  <div className="flex items-center h-8 px-3 bg-[#FFEC4D] shadow-[inset_0_-1.5px_0_#8F7E10] text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)]">
                    Tags <span className="ml-auto normal-case tracking-normal text-[10.5px] font-bold">ficam salvas para as próximas</span>
                  </div>
                  {KINDS.map(k => {
                    const papel = TAG_PAPEL[k];
                    return (
                      <div key={k} className="grid grid-cols-[1fr_16px_1.1fr] items-center gap-2 px-3 py-[7px] border-b border-[#EFE8D2] dark:border-white/[0.06] last:border-b-0">
                        <div>
                          <b className="block text-[12.5px] font-extrabold text-on-surface">{papel.titulo}</b>
                          <small className="block text-[10.5px] font-semibold text-on-surface/45">{papel.sub}</small>
                        </div>
                        <ChevronRight size={14} className="text-on-surface/30" />
                        <div className="relative">
                          <select
                            value={tagSel[k]}
                            disabled={criandoTag === k}
                            onChange={ev => ev.target.value === '__criar__' ? criarTag(k) : setTagSel(s => ({ ...s, [k]: ev.target.value }))}
                            className={cn(selCls, tagSel[k] ? 'border-[#E0D8BF] dark:border-white/[0.08]' : 'border-amber-400/60 text-[#92400E] dark:text-[#FCD34D]')}
                          >
                            <option value="">Escolha uma tag…</option>
                            {tags.filter(t => !t.exclusivo).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                            <option value="__criar__">+ Criar tag &ldquo;{papel.nome}&rdquo;</option>
                          </select>
                          {criandoTag === k && <Loader2 size={12} className="absolute right-6 top-1/2 -translate-y-1/2 animate-spin text-on-surface/40" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {(faltaEstab || faltaTag) && (
                <div className="flex items-center gap-2 px-3 py-2 border border-amber-400/55 bg-amber-50 dark:bg-amber-400/[0.07] text-[12px] text-[#92400E] dark:text-[#FCD34D]">
                  <AlertTriangle size={14} className="shrink-0" />
                  {faltaEstab
                    ? 'Escolha a loja de cada nº de estabelecimento da Rede para continuar.'
                    : 'Escolha ou crie as 4 tags para continuar — sem elas as vendas cairiam em "Receitas sem tag" e as taxas em "Não classificadas" no Fluxo de Caixa.'}
                </div>
              )}
            </>)}
          </>)}

          {passo === 'previa' && previa && (<>
            {reimportacao && (
              <div className="flex items-center gap-2 px-3 py-2 border border-[#0A7A55]/30 bg-[#0A7A55]/[0.08] dark:bg-[#34D399]/[0.08] text-[12px] text-[#0A7A55] dark:text-[#34D399]">
                <RotateCcw size={14} className="shrink-0" />
                <span>
                  Este período já foi importado em parte: <b>{previa.jaExistentes.toLocaleString('pt-BR')} vendas já existem e serão ignoradas</b>, {previa.novas.length.toLocaleString('pt-BR')} são novas.
                  {previa.novas.length === 0 && ' Nada a importar.'}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-5 border-l border-t border-[#E0D8BF] dark:border-white/[0.08] bg-white dark:bg-[#252520]">
              {[
                { l: 'Crédito (bruto)', v: tot.credito, s: `${tot.nCredito} vendas`, c: 'text-[#0A7A55] dark:text-[#34D399]' },
                { l: 'Débito (bruto)', v: tot.debito, s: `${tot.nDebito} vendas`, c: 'text-[#0A7A55] dark:text-[#34D399]' },
                { l: 'Taxa MDR', v: -tot.mdr, s: `${((tot.mdr / (tot.credito + tot.debito || 1)) * 100).toFixed(2).replace('.', ',')}% do bruto`, c: 'text-[#D81E1E]' },
                { l: 'Antecipação', v: -tot.antecipacao, s: `${((tot.antecipacao / (tot.credito || 1)) * 100).toFixed(2).replace('.', ',')}% do crédito`, c: 'text-[#D81E1E]' },
                { l: 'Líquido a receber', v: tot.liquido, s: Math.abs(tot.credito + tot.debito - tot.mdr - tot.antecipacao - tot.liquido) < 0.05 ? 'confere com a Rede ✓' : 'diferença de centavos nas taxas', c: 'text-on-surface' },
              ].map(k => (
                <div key={k.l} className="px-3 py-2 border-r border-b border-[#E0D8BF] dark:border-white/[0.08]">
                  <div className="text-[9px] font-black uppercase tracking-[0.10em] text-on-surface/45">{k.l}</div>
                  <div className={cn('mt-0.5 text-[16px] font-black font-mono tabular-nums', k.c)}>{brl(k.v)}</div>
                  <div className="text-[10.5px] font-bold text-on-surface/30">{k.s}</div>
                </div>
              ))}
            </div>

            <div className="bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] overflow-auto max-h-[46vh]">
              <table className="w-full min-w-[980px] table-fixed border-collapse text-[12.5px] [&_td]:h-[34px] [&_td]:px-2.5 [&_td]:text-right [&_td]:whitespace-nowrap [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td]:border-r [&_td]:border-b [&_td]:border-[#A8A290] dark:[&_td]:border-white/[0.16] [&_td:last-child]:border-r-0">
                <colgroup><col className="w-[120px]" /><col className="w-[210px]" /><col /><col /><col /><col /><col /><col className="w-[110px]" /></colgroup>
                <thead>
                  <tr>
                    <th className={cn(thCls, 'text-left')}>Recebimento</th>
                    <th className={cn(thCls, 'text-left')}>Vendas de</th>
                    <th className={thCls}>Crédito</th>
                    <th className={thCls}>Débito</th>
                    <th className={thCls}>MDR</th>
                    <th className={thCls}>Antecipação</th>
                    <th className={thCls}>Líquido</th>
                    <th className={thCls}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.dias.map((d, i) => {
                    const k = diaKey(d.numero, d.data);
                    const aberto = expandidos.has(k);
                    const vendasDe = d.vendasDe.length === 1 ? dm(d.vendasDe[0]) : `${dm(d.vendasDe[0])} a ${dm(d.vendasDe[d.vendasDe.length - 1])}`;
                    const estab = estabMap[d.numero];
                    return (
                      <Fragment key={k}>
                        <tr
                          onClick={() => setExpandidos(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
                          className={cn(
                            'cursor-pointer transition-colors hover:bg-[#FFF8D0] dark:hover:bg-white/[0.03]',
                            i % 2 === 0 ? 'bg-white dark:bg-[#252520]' : 'bg-[#FAF7EE] dark:bg-[#1E1E18]',
                            reimportacao && d.status === 'ja' && 'opacity-45',
                          )}
                        >
                          <td className="!text-left">
                            <ChevronRight size={11} strokeWidth={3} className={cn('inline -mt-0.5 mr-1 text-on-surface/40 transition-transform duration-200', aberto && 'rotate-90')} />
                            <b className="text-on-surface">{dm(d.data)}</b> <span className="text-[11px] text-on-surface/30">{dow(d.data)}</span>
                          </td>
                          <td className="!text-left text-[11px] text-on-surface/40">
                            {vendasDe}{d.vendasDe.length > 2 && ' · fim de semana/feriado'}{parsed && parsed.estabelecimentos.length > 1 && ` · ${estab}`}
                          </td>
                          <td className="font-mono tabular-nums">{d.credito ? fmt(d.credito) : <span className="text-on-surface/20">—</span>}</td>
                          <td className="font-mono tabular-nums">{d.debito ? fmt(d.debito) : <span className="text-on-surface/20">—</span>}</td>
                          <td className="font-mono tabular-nums text-[#D81E1E]">{d.mdr ? `−${fmt(d.mdr)}` : <span className="text-on-surface/20">—</span>}</td>
                          <td className="font-mono tabular-nums text-[#D81E1E]">{d.antecipacao ? `−${fmt(d.antecipacao)}` : <span className="text-on-surface/20">—</span>}</td>
                          <td className="font-mono tabular-nums font-extrabold text-on-surface">{fmt(d.liquido)}</td>
                          <td>{pill(d)}</td>
                        </tr>
                        {aberto && KINDS.filter(kind => valorDoKind(d, kind) > 0).map(kind => {
                          const receita = kind === 'credito' || kind === 'debito';
                          const tag = tagById(tagSel[kind]);
                          const v = valorDoKind(d, kind);
                          const desc = kind === 'credito' ? `Vendas crédito Rede · ${d.nCredito} vendas` : kind === 'debito' ? `Vendas débito Rede · ${d.nDebito} vendas` : kind === 'mdr' ? 'Taxa MDR Rede' : 'Antecipação Rede';
                          return (
                            <tr key={kind} className="bg-[#FDFBF4] dark:bg-[#22221C] text-[12px] text-on-surface/50">
                              <td className="!text-left !h-[30px] pl-[30px]">
                                <b className={receita ? 'text-[#0A7A55] dark:text-[#34D399]' : 'text-[#D81E1E]'}>{receita ? '+' : '−'}</b> {receita ? 'Receita' : 'Despesa'}
                              </td>
                              <td colSpan={3} className="!text-left !h-[30px]">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-[7px] h-[7px] rounded-full" style={{ background: tag ? TAG_COLOR_MAP[tag.cor]?.dot : undefined }} />
                                  {tag?.nome ?? '—'}
                                </span>
                                {' '}· {desc} · Favorecido <b className="text-on-surface/70">Rede</b> · {estab}
                              </td>
                              <td colSpan={3} className="!h-[30px] font-mono tabular-nums">
                                <span className={receita ? 'text-[#0A7A55] dark:text-[#34D399]' : 'text-[#D81E1E]'}>{receita ? '' : '−'}{fmt(v)}</span>
                              </td>
                              <td className="!text-left !h-[30px] text-[11px] text-on-surface/35">{d.data <= hoje ? `pago em ${dm(d.data)}` : `vence ${dm(d.data)}`}</td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                  <tr className="sticky bottom-0 bg-[#FFF7B0] dark:bg-[#252520] font-black [&_td]:border-t-[1.5px] [&_td]:border-t-[#8F7E10]">
                    <td className="!text-left">{previa.dias.length} dias</td>
                    <td className="!text-left text-[11px] text-on-surface/40 font-semibold">{parsed && `${dm(parsed.periodo[0])} a ${dm(parsed.periodo[1])}`}</td>
                    <td className="font-mono tabular-nums">{fmt(tot.credito)}</td>
                    <td className="font-mono tabular-nums">{fmt(tot.debito)}</td>
                    <td className="font-mono tabular-nums text-[#D81E1E]">−{fmt(tot.mdr)}</td>
                    <td className="font-mono tabular-nums text-[#D81E1E]">−{fmt(tot.antecipacao)}</td>
                    <td className="font-mono tabular-nums">{fmt(tot.liquido)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[10.5px] text-on-surface/30">
              Recebimento = prazo da Rede contado em dias úteis (fim de semana e feriados nacionais empurram para o próximo dia útil). Clique num dia para ver as movimentações que serão criadas.
            </p>
          </>)}

          {passo === 'concluido' && resultado && (
            <div className="flex flex-col items-center text-center gap-1.5 pt-4">
              <div className={cn('w-[52px] h-[52px] grid place-items-center border', desfeito ? 'border-on-surface/15 bg-on-surface/[0.05] text-on-surface/40' : 'border-[#0A7A55]/30 bg-[#0A7A55]/[0.08] text-[#0A7A55] dark:text-[#34D399]')}>
                {desfeito ? <RotateCcw size={22} /> : <Check size={24} strokeWidth={3} />}
              </div>
              <h3 className="mt-2 text-[18px] font-black text-on-surface">{desfeito ? 'Importação desfeita' : 'Vendas importadas'}</h3>
              <p className="max-w-[440px] text-[12.5px] leading-normal text-on-surface/50">
                {desfeito
                  ? 'As vendas deste arquivo e as movimentações criadas por ele foram removidas; os dias que já existiam voltaram ao valor anterior.'
                  : 'As receitas de crédito e débito e as taxas da Rede já estão no Controle Financeiro e no Fluxo de Caixa.'}
              </p>
              {!desfeito && (
                <div className="mt-3 w-full grid grid-cols-2 border-l border-t border-[#E0D8BF] dark:border-white/[0.08] bg-white dark:bg-[#252520] text-left">
                  {[
                    ['Movimentações criadas', resultado.criadas],
                    ['Movimentações atualizadas', resultado.atualizadas],
                    ['Vendas guardadas', resultado.vendas],
                    ['Já existentes (ignoradas)', resultado.ignoradas],
                  ].map(([l, v]) => (
                    <div key={l} className="flex justify-between gap-2 px-3 py-2 border-r border-b border-[#E0D8BF] dark:border-white/[0.08] text-[12px] font-semibold text-on-surface/50">
                      {l}<b className="font-black text-on-surface">{Number(v).toLocaleString('pt-BR')}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 shrink-0 bg-[#FFF7B0] dark:bg-[#252520] border-t border-[#DDD000] dark:border-white/[0.06]">
          {passo === 'arquivo' && (<>
            <span className="text-[12px] font-semibold text-on-surface/45">
              {parsed ? <>Agrupa por <b className="text-on-surface">dia de recebimento</b> e <b className="text-on-surface">modalidade</b>; as vendas individuais ficam guardadas para conferência.</> : 'Nada foi importado ainda.'}
            </span>
            <button onClick={onClose} className={cn(btnGhost, 'ml-auto')}>Cancelar</button>
            <button onClick={montarPrevia} disabled={!parsed || faltaEstab || faltaTag || !!carregando} className={cn(btnPri, 'flex items-center gap-2')}>
              {carregando && parsed && <Loader2 size={13} className="animate-spin" />} Ver prévia →
            </button>
          </>)}
          {passo === 'previa' && previa && (<>
            <span className="text-[12px] font-semibold text-on-surface/45">
              {previa.novas.length === 0
                ? 'Nenhuma venda nova neste arquivo.'
                : <>Serão criadas <b className="text-on-surface">{previa.criar} movimentações</b>{previa.atualizar > 0 && <> e atualizadas <b className="text-on-surface">{previa.atualizar}</b></>}</>}
            </span>
            <button onClick={() => setPasso('arquivo')} disabled={!!carregando} className={cn(btnGhost, 'ml-auto')}>← Voltar</button>
            <button onClick={importar} disabled={previa.novas.length === 0 || !!carregando} className={cn(btnPri, 'flex items-center gap-2')}>
              {carregando && <Loader2 size={13} className="animate-spin" />} {carregando ?? 'Importar'}
            </button>
          </>)}
          {passo === 'concluido' && (<>
            {!desfeito && (
              <button onClick={desfazer} disabled={!!carregando} className={cn(btnGhost, 'flex items-center gap-2')}>
                {carregando ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Desfazer
              </button>
            )}
            <button onClick={onClose} className={cn(btnGhost, 'ml-auto')}>Fechar</button>
            {!desfeito && <button onClick={onVerFluxo} className={btnPri}>Ver no Fluxo de Caixa →</button>}
          </>)}
        </div>
      </motion.div>
    </div>
  );
}

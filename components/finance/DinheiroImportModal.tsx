'use client';

import { useEffect, useMemo, useState, Fragment } from 'react';
import { motion } from 'motion/react';
import { X, Upload, FileSpreadsheet, Loader2, AlertTriangle, Check, ChevronRight, RotateCcw, Banknote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { FinanceTag, GrupoDre } from '@/hooks/useFinanceTags';
import { useFinanceEstablishments } from '@/hooks/useFinanceEstablishments';
import { hashArquivo } from '@/lib/redeImport';
import {
  parsePdvFile, agregarPdvPorDia, carregarPdvConfig, salvarPdvConfig, vendasPdvPorId, sincronizarDiasPdv,
  pdvDiaKey, pdvRef, parseValorDigitado,
  type PdvParsed, type PdvConfig, type PdvSale,
} from '@/lib/dinheiroImport';

// Importação das vendas em dinheiro do Retaguarda (Central de Vendas) — 3 passos:
// Arquivo (lê, reconhece loja e tag) → Prévia (vendas mistas editáveis + receita por dia)
// → Concluído. Mesmo padrão visual do RedeImportModal.

type Passo = 'arquivo' | 'previa' | 'concluido';
type StatusDia = 'novo' | 'atualiza' | 'ja';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmt = (v: number) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (v: number) => (v < 0 ? '−' : '') + 'R$ ' + fmt(v);
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dmy = (iso: string) => `${dm(iso)}/${iso.slice(0, 4)}`;
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dow = (iso: string) => DOW[new Date(`${iso}T12:00:00`).getDay()];
const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const adivinharEstab = (nome: string) => {
  const n = norm(nome);
  if (n.includes('universo')) return 'Universo do R$1,99';
  if (n.includes('castelo')) return 'Castelo Real';
  return '';
};

/** Parte em dinheiro de uma venda: o total se for só dinheiro, ou o valor digitado se for mista. */
const valorDin = (s: PdvSale, mixInput: Record<string, string>) =>
  s.misto ? parseValorDigitado(mixInput[s.id_mov] ?? '') ?? 0 : s.valor_total;

const selCls = 'h-[30px] w-full px-2 bg-white dark:bg-[#252520] border text-[12px] font-bold text-on-surface outline-none focus:border-[#D81E1E] cursor-pointer transition-colors';
const btnCls = 'h-[34px] px-4 text-[11.5px] font-extrabold uppercase tracking-[0.05em] border transition-transform active:scale-[0.97]';
const btnGhost = cn(btnCls, 'bg-[rgba(26,26,10,0.08)] dark:bg-white/[0.07] border-[rgba(26,26,10,0.14)] dark:border-white/[0.10] text-[rgba(26,26,10,0.55)] dark:text-white/50');
const btnPri = cn(btnCls, 'bg-[#D81E1E] border-[#D81E1E] text-white disabled:opacity-40 disabled:active:scale-100');
const thCls = 'sticky top-0 z-[2] h-[30px] px-2.5 bg-[#FFEC4D] text-right text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] whitespace-nowrap shadow-[inset_-1px_0_0_#B8A31F,inset_0_-1.5px_0_#8F7E10]';
const tableCls = 'w-full table-fixed border-collapse text-[12.5px] [&_td]:px-2.5 [&_td]:text-right [&_td]:whitespace-nowrap [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td]:border-r [&_td]:border-b [&_td]:border-[#A8A290] dark:[&_td]:border-white/[0.16] [&_td:last-child]:border-r-0';
const pillCls = 'text-[8.5px] font-black uppercase tracking-[0.05em] px-[5px] leading-[15px] border border-current';

interface Previa {
  novasIds: Set<string>;
  salvo: Map<string, number>;        // valor_dinheiro já gravado das mistas existentes
  diasComTx: Set<string>;
  jaExistentes: number;
}

interface DinheiroImportModalProps {
  tags: FinanceTag[];
  createTag: (nome: string, cor: string, descricao: string) => Promise<FinanceTag>;
  updateTag: (id: string, fields: Partial<Pick<FinanceTag, 'grupo_dre'>>) => Promise<void>;
  onClose: () => void;
  onImported: () => void;
  onVerFluxo: () => void;
}

export function DinheiroImportModal({ tags, createTag, updateTag, onClose, onImported, onVerFluxo }: DinheiroImportModalProps) {
  const { todos: estabelecimentos } = useFinanceEstablishments();
  const [passo, setPasso] = useState<Passo>('arquivo');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [parsed, setParsed] = useState<PdvParsed | null>(null);
  const [cfg, setCfg] = useState<PdvConfig | null>(null);
  const [estabMap, setEstabMap] = useState<Record<string, string>>({});
  const [tagDinheiro, setTagDinheiro] = useState('');
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [mixInput, setMixInput] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [criandoTag, setCriandoTag] = useState(false);
  const [resultado, setResultado] = useState<{ criadas: number; atualizadas: number; vendas: number; ignoradas: number; importId: string; afetados: { cnpj: string; data: string }[]; restaurar: Map<string, number> } | null>(null);
  const [desfeito, setDesfeito] = useState(false);

  useEffect(() => {
    carregarPdvConfig().then(setCfg).catch(e => setErro(e instanceof Error ? e.message : String(e)));
  }, []);

  const lerArquivo = async (f: File) => {
    setArquivo(f);
    setErro('');
    setParsed(null);
    setCarregando('Lendo o relatório…');
    try {
      const p = await parsePdvFile(f);
      setParsed(p);
      const base = cfg ?? { estabelecimentos: {}, tag_dinheiro: null };
      setEstabMap(Object.fromEntries(p.lojas.map(l => [l.cnpj, base.estabelecimentos[l.cnpj] ?? adivinharEstab(l.nome)])));
      const salva = base.tag_dinheiro && tags.some(t => t.id === base.tag_dinheiro) ? base.tag_dinheiro : '';
      setTagDinheiro(salva || tags.find(t => norm(t.nome) === 'dinheiro')?.id || '');
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(null);
    }
  };

  const criarTag = async () => {
    setCriandoTag(true);
    try {
      const tag = tags.find(t => norm(t.nome) === 'dinheiro') ?? await createTag('Dinheiro', 'green', 'Importação Retaguarda — vendas em dinheiro');
      if (!tag.grupo_dre) await updateTag(tag.id, { grupo_dre: 'receita' as GrupoDre }).catch(() => undefined);
      setTagDinheiro(tag.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCriandoTag(false);
    }
  };

  const faltaEstab = parsed?.lojas.some(l => !estabMap[l.cnpj]) ?? true;
  const configAtual = (): PdvConfig => ({ estabelecimentos: { ...(cfg?.estabelecimentos ?? {}), ...estabMap }, tag_dinheiro: tagDinheiro || null });

  const mistas = useMemo(() => (parsed?.sales ?? []).filter(s => s.misto && s.valida), [parsed]);

  const montarPrevia = async () => {
    if (!parsed) return;
    setErro('');
    setCarregando('Conferindo o que já foi importado…');
    try {
      const existentes = await vendasPdvPorId(parsed.sales.map(s => s.id_mov));
      const jaTem = new Map(existentes.map(e => [e.id_mov, e]));
      const novasIds = new Set(parsed.sales.filter(s => !jaTem.has(s.id_mov)).map(s => s.id_mov));
      const salvo = new Map(existentes.filter(e => e.misto).map(e => [e.id_mov, Number(e.valor_dinheiro)]));
      // Mistas que já existem voltam com o valor salvo, para corrigir se preciso
      setMixInput(prev => {
        const n = { ...prev };
        for (const s of parsed.sales) if (s.misto && salvo.has(s.id_mov) && n[s.id_mov] === undefined) n[s.id_mov] = fmt(salvo.get(s.id_mov)!);
        return n;
      });
      const diasArquivo = [...new Set(parsed.sales.map(s => pdvRef(s.cnpj_loja, s.data_venda)))];
      const diasComTx = new Set<string>();
      for (let i = 0; i < diasArquivo.length; i += 150) {
        const { data, error } = await supabase.from('finance_transactions').select('origem_ref').in('origem_ref', diasArquivo.slice(i, i + 150));
        if (error) throw new Error(error.message);
        for (const t of data ?? []) diasComTx.add(t.origem_ref as string);
      }
      setPrevia({ novasIds, salvo, diasComTx, jaExistentes: parsed.sales.length - novasIds.size });
      setPasso('previa');
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(null);
    }
  };

  // Recalculado a cada valor digitado nas mistas
  const calc = useMemo(() => {
    if (!parsed || !previa) return null;
    const alteradas = mistas.filter(s => previa.salvo.has(s.id_mov) && Math.abs((parseValorDigitado(mixInput[s.id_mov] ?? '') ?? 0) - previa.salvo.get(s.id_mov)!) >= 0.005);
    const afetadosMap = new Map<string, { cnpj: string; data: string }>();
    for (const s of parsed.sales) if (previa.novasIds.has(s.id_mov)) afetadosMap.set(pdvDiaKey(s.cnpj_loja, s.data_venda), { cnpj: s.cnpj_loja, data: s.data_venda });
    for (const s of alteradas) afetadosMap.set(pdvDiaKey(s.cnpj_loja, s.data_venda), { cnpj: s.cnpj_loja, data: s.data_venda });
    const ag = agregarPdvPorDia(parsed.sales.map(s => ({ ...s, valor_dinheiro: valorDin(s, mixInput) })));
    const dias = [...ag.values()].sort((a, b) => a.data.localeCompare(b.data) || a.cnpj.localeCompare(b.cnpj)).map(d => {
      const k = pdvDiaKey(d.cnpj, d.data);
      const status: StatusDia = !afetadosMap.has(k) ? 'ja' : previa.diasComTx.has(pdvRef(d.cnpj, d.data)) ? 'atualiza' : 'novo';
      return { ...d, status };
    });
    const afetados = [...afetadosMap.values()];
    const caixas = [...new Set(dias.flatMap(d => Object.keys(d.porCaixa)))].sort();
    return {
      dias, afetados, alteradas, caixas,
      criar: afetados.filter(d => !previa.diasComTx.has(pdvRef(d.cnpj, d.data))).length,
      atualizar: afetados.filter(d => previa.diasComTx.has(pdvRef(d.cnpj, d.data))).length,
      puro: dias.reduce((a, d) => a + d.total - d.mistoDinheiro, 0),
      nPuro: dias.reduce((a, d) => a + d.nPuro, 0),
      misto: dias.reduce((a, d) => a + d.mistoDinheiro, 0),
      totMistas: mistas.reduce((a, s) => a + s.valor_total, 0),
      pendentes: mistas.filter(s => !(mixInput[s.id_mov] ?? '').trim()).length,
    };
  }, [parsed, previa, mistas, mixInput]);

  const importar = async () => {
    if (!parsed || !previa || !calc || !arquivo) return;
    setErro('');
    setCarregando('Importando…');
    try {
      const config = configAtual();
      await salvarPdvConfig(config);
      setCfg(config);
      const hash = await hashArquivo(arquivo);
      const { data: log, error: logErr } = await supabase.from('finance_import_logs')
        .insert({ file_hash: `retaguarda:${hash}:${Date.now()}`, file_name: arquivo.name }).select('id').single();
      if (logErr) throw new Error(logErr.message);
      const importId = String(log.id);
      const restaurar = new Map(calc.alteradas.map(s => [s.id_mov, previa.salvo.get(s.id_mov)!]));
      try {
        const novas = parsed.sales.filter(s => previa.novasIds.has(s.id_mov)).map(s => ({ ...s, valor_dinheiro: valorDin(s, mixInput), import_id: importId }));
        for (let i = 0; i < novas.length; i += 500) {
          const { error } = await supabase.from('finance_pdv_sales').upsert(novas.slice(i, i + 500), { onConflict: 'id_mov', ignoreDuplicates: true });
          if (error) throw new Error(error.message);
        }
        for (const s of calc.alteradas) {
          const { error } = await supabase.from('finance_pdv_sales').update({ valor_dinheiro: valorDin(s, mixInput) }).eq('id_mov', s.id_mov);
          if (error) throw new Error(error.message);
        }
        const r = await sincronizarDiasPdv(calc.afetados, config, importId);
        setResultado({
          criadas: r.criadas, atualizadas: r.atualizadas, vendas: novas.length, ignoradas: previa.jaExistentes,
          importId, afetados: calc.afetados, restaurar,
        });
        setDesfeito(false);
        setPasso('concluido');
        onImported();
      } catch (e) {
        await supabase.from('finance_pdv_sales').delete().eq('import_id', importId);
        for (const [id, v] of restaurar) await supabase.from('finance_pdv_sales').update({ valor_dinheiro: v }).eq('id_mov', id);
        await sincronizarDiasPdv(calc.afetados, config, null).catch(() => undefined);
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
    if (!resultado) return;
    setErro('');
    setCarregando('Desfazendo…');
    try {
      const { error } = await supabase.from('finance_pdv_sales').delete().eq('import_id', resultado.importId);
      if (error) throw new Error(error.message);
      for (const [id, v] of resultado.restaurar) await supabase.from('finance_pdv_sales').update({ valor_dinheiro: v }).eq('id_mov', id);
      await sincronizarDiasPdv(resultado.afetados, configAtual(), null);
      await supabase.from('finance_import_logs').delete().eq('id', resultado.importId);
      setDesfeito(true);
      onImported();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(null);
    }
  };

  const reimportacao = !!previa && previa.jaExistentes > 0;
  const PASSOS: [Passo, string][] = [['arquivo', 'Arquivo'], ['previa', 'Prévia'], ['concluido', 'Concluído']];
  const passoIdx = PASSOS.findIndex(p => p[0] === passo);
  const pill = (status: StatusDia) => {
    if (reimportacao) {
      if (status === 'ja') return <span className={cn(pillCls, 'text-on-surface/30')}>Já importado</span>;
      if (status === 'atualiza') return <span className={cn(pillCls, 'text-[#2563EB] dark:text-[#60A5FA]')}>Atualiza</span>;
      return <span className={cn(pillCls, 'text-[#0A7A55] dark:text-[#34D399]')}>Novo</span>;
    }
    return <span className={cn(pillCls, 'text-[#0A7A55] dark:text-[#34D399]')}>Recebido</span>;
  };
  const fileInput = (
    <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) lerArquivo(f); e.target.value = ''; }} />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" onClick={carregando ? undefined : onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className={cn('relative flex flex-col max-h-[calc(100vh-40px)] bg-[#FDFAF0] dark:bg-[#1E1E18] shadow-2xl w-full', passo === 'concluido' ? 'max-w-[620px]' : 'max-w-[1120px]')}
      >
        {/* Cabeçalho */}
        <div className="flex items-center gap-2.5 h-[54px] px-4 shrink-0 bg-[#FFE500] dark:bg-[#252520] border-b border-[#D4C000] dark:border-white/[0.07]">
          <span className="w-8 h-8 grid place-items-center bg-[rgba(26,26,10,0.09)] dark:bg-[rgba(216,30,30,0.13)] text-[#1A1A0E] dark:text-[#D81E1E]"><Banknote size={16} /></span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">Importar vendas em dinheiro</h2>
            <p className="text-[11px] font-semibold text-[rgba(26,26,10,0.45)] dark:text-white/30">Retaguarda · Central de Vendas</p>
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

          {passo === 'arquivo' && (!parsed ? (
            <div>
              <span className="block mb-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-on-surface/45">Central de Vendas do Retaguarda</span>
              <label
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) lerArquivo(f); }}
                className="flex flex-col items-center gap-1.5 p-8 bg-white dark:bg-[#252520] border-[1.5px] border-dashed border-[#E0D8BF] dark:border-white/[0.10] text-on-surface/30 hover:border-[#D81E1E] hover:text-[#D81E1E] cursor-pointer transition-colors"
              >
                {fileInput}
                {carregando ? <Loader2 size={26} className="animate-spin" /> : <Upload size={26} />}
                <b className="text-[13px] text-on-surface">{carregando ?? 'Arraste o arquivo aqui ou clique para escolher'}</b>
                <small className="text-[11px] font-semibold">Excel (.xlsx) exportado da Central de Vendas, filtrado por forma de pagamento Dinheiro</small>
              </label>
              <p className="mt-2 text-[10.5px] text-on-surface/30">Pode importar o mesmo período mais de uma vez: vendas que já entraram são ignoradas e os dias são recalculados.</p>
            </div>
          ) : (<>
            <div className="flex items-center gap-3 px-3 py-2.5 border border-[#0A7A55]/35 bg-[#0A7A55]/[0.08] dark:bg-[#34D399]/[0.08]">
              <span className="w-[34px] h-[34px] grid place-items-center bg-[#0A7A55] text-white"><FileSpreadsheet size={16} /></span>
              <span className="min-w-0">
                <b className="block text-[12.5px] font-extrabold text-on-surface truncate">{arquivo?.name}</b>
                <small className="block text-[11px] font-semibold text-on-surface/45">
                  Central de Vendas do Retaguarda reconhecida · {parsed.linhasLidas.toLocaleString('pt-BR')} vendas lidas
                  {parsed.canceladas > 0 && ` · ${parsed.canceladas} canceladas (ficam de fora)`}
                  {parsed.outrasFormas > 0 && ` · ${parsed.outrasFormas} sem dinheiro (ignoradas)`}
                </small>
              </span>
              <label className="ml-auto shrink-0 text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-on-surface/45 hover:text-on-surface cursor-pointer">
                {fileInput}Trocar arquivo
              </label>
            </div>

            {parsed.possivelCorte && (
              <div className="flex items-start gap-2 px-3 py-2 border border-amber-400/55 bg-amber-50 dark:bg-amber-400/[0.07] text-[12px] text-[#92400E] dark:text-[#FCD34D]">
                <AlertTriangle size={14} className="shrink-0 mt-px" />
                <span>
                  O arquivo tem <b>exatamente {parsed.linhasLidas.toLocaleString('pt-BR')} vendas</b> ({(parsed.linhasLidas + 1).toLocaleString('pt-BR')} linhas): pode ser o limite de exportação do Retaguarda.
                  Confira o total na tela do Retaguarda — se for maior, exporte o período em partes (ex.: 01–15 e 16–30) e importe todas; vendas repetidas são ignoradas.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 border-l border-t border-[#E0D8BF] dark:border-white/[0.08] bg-white dark:bg-[#252520]">
              {[
                ['Período das vendas', `${dm(parsed.periodo[0])} a ${dmy(parsed.periodo[1])}`, ''],
                ['Vendas finalizadas', (parsed.sales.length - parsed.canceladas).toLocaleString('pt-BR'), `${parsed.sales.filter(s => s.valida && !s.misto).length.toLocaleString('pt-BR')} só dinheiro · ${mistas.length} mistas`],
                ['Caixas', String(parsed.caixas.length), parsed.caixas.map(c => `Caixa ${c}`).join(' · ')],
                ['Total (só dinheiro)', brl(parsed.sales.filter(s => s.valida && !s.misto).reduce((a, s) => a + s.valor_total, 0)), mistas.length ? '+ mistas a informar' : ''],
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
                  Estabelecimento <span className="ml-auto normal-case tracking-normal text-[10.5px] font-bold">pelo CNPJ da loja — fica salvo</span>
                </div>
                {parsed.lojas.map(l => (
                  <div key={l.cnpj} className="grid grid-cols-[1fr_16px_1.1fr] items-center gap-2 px-3 py-2 border-b border-[#EFE8D2] dark:border-white/[0.06] last:border-b-0">
                    <div className="min-w-0">
                      <b className="block text-[12.5px] font-extrabold text-on-surface">CNPJ {cnpjFmt(l.cnpj)}</b>
                      <small className="block text-[10.5px] font-semibold text-on-surface/45 truncate">{l.nome}</small>
                    </div>
                    <ChevronRight size={14} className="text-on-surface/30" />
                    <select
                      value={estabMap[l.cnpj] ?? ''}
                      onChange={ev => setEstabMap(m => ({ ...m, [l.cnpj]: ev.target.value }))}
                      className={cn(selCls, estabMap[l.cnpj] ? 'border-[#E0D8BF] dark:border-white/[0.08]' : 'border-amber-400/60 text-[#92400E] dark:text-[#FCD34D]')}
                    >
                      <option value="">Escolha a loja…</option>
                      {estabelecimentos.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <div className="bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08]">
                <div className="flex items-center h-8 px-3 bg-[#FFEC4D] shadow-[inset_0_-1.5px_0_#8F7E10] text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)]">
                  Tag <span className="ml-auto normal-case tracking-normal text-[10.5px] font-bold">fica salva para as próximas</span>
                </div>
                <div className="grid grid-cols-[1fr_16px_1.1fr] items-center gap-2 px-3 py-[7px]">
                  <div>
                    <b className="block text-[12.5px] font-extrabold text-on-surface">Vendas em dinheiro</b>
                    <small className="block text-[10.5px] font-semibold text-on-surface/45">Receita · já recebida no dia</small>
                  </div>
                  <ChevronRight size={14} className="text-on-surface/30" />
                  <div className="relative">
                    <select
                      value={tagDinheiro}
                      disabled={criandoTag}
                      onChange={ev => ev.target.value === '__criar__' ? criarTag() : setTagDinheiro(ev.target.value)}
                      className={cn(selCls, tagDinheiro ? 'border-[#E0D8BF] dark:border-white/[0.08]' : 'border-amber-400/60 text-[#92400E] dark:text-[#FCD34D]')}
                    >
                      <option value="">Escolha uma tag…</option>
                      {tags.filter(t => !t.exclusivo).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                      <option value="__criar__">+ Criar tag &ldquo;Dinheiro&rdquo;</option>
                    </select>
                    {criandoTag && <Loader2 size={12} className="absolute right-6 top-1/2 -translate-y-1/2 animate-spin text-on-surface/40" />}
                  </div>
                </div>
                <p className="px-3 py-2 border-t border-[#EFE8D2] dark:border-white/[0.06] text-[11px] leading-[1.45] text-on-surface/45">
                  Dinheiro não tem taxa nem prazo: cada dia vira uma receita já paga na data da venda.
                </p>
              </div>
            </div>

            {(faltaEstab || !tagDinheiro) && (
              <div className="flex items-center gap-2 px-3 py-2 border border-amber-400/55 bg-amber-50 dark:bg-amber-400/[0.07] text-[12px] text-[#92400E] dark:text-[#FCD34D]">
                <AlertTriangle size={14} className="shrink-0" />
                {faltaEstab ? 'Escolha a loja de cada CNPJ para continuar.' : 'Escolha ou crie a tag "Dinheiro" para continuar — sem ela as vendas cairiam em "Receitas sem tag" no Fluxo de Caixa.'}
              </div>
            )}
          </>))}

          {passo === 'previa' && previa && calc && (<>
            {reimportacao && (
              <div className="flex items-center gap-2 px-3 py-2 border border-[#0A7A55]/30 bg-[#0A7A55]/[0.08] dark:bg-[#34D399]/[0.08] text-[12px] text-[#0A7A55] dark:text-[#34D399]">
                <RotateCcw size={14} className="shrink-0" />
                <span>
                  Este período já foi importado em parte: <b>{previa.jaExistentes.toLocaleString('pt-BR')} vendas já existem e serão ignoradas</b>, {previa.novasIds.size.toLocaleString('pt-BR')} são novas.
                  {calc.alteradas.length > 0 && ` ${calc.alteradas.length} ${calc.alteradas.length === 1 ? 'venda mista corrigida' : 'vendas mistas corrigidas'}.`}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 border-l border-t border-[#E0D8BF] dark:border-white/[0.08] bg-white dark:bg-[#252520]">
              {[
                { l: 'Só dinheiro', v: brl(calc.puro), s: `${calc.nPuro.toLocaleString('pt-BR')} vendas`, c: 'text-[#0A7A55] dark:text-[#34D399]' },
                { l: 'Mistas (parte em dinheiro)', v: brl(calc.misto), s: `${mistas.length} vendas · informado por você`, c: 'text-[#92400E] dark:text-[#FCD34D]' },
                { l: 'Total a lançar', v: brl(calc.puro + calc.misto), s: `${calc.dias.length} receitas · já pagas`, c: 'text-[#0A7A55] dark:text-[#34D399]' },
                { l: 'Canceladas', v: String(parsed?.canceladas ?? 0), s: 'ficam de fora (valor zero)', c: 'text-on-surface' },
              ].map(k => (
                <div key={k.l} className="px-3 py-2 border-r border-b border-[#E0D8BF] dark:border-white/[0.08]">
                  <div className="text-[9px] font-black uppercase tracking-[0.10em] text-on-surface/45">{k.l}</div>
                  <div className={cn('mt-0.5 text-[16px] font-black font-mono tabular-nums', k.c)}>{k.v}</div>
                  <div className="text-[10.5px] font-bold text-on-surface/30">{k.s}</div>
                </div>
              ))}
            </div>

            {mistas.length > 0 && (
              <div className="bg-white dark:bg-[#252520] border border-amber-400/55 dark:border-amber-400/40">
                <div className="flex items-center gap-2 h-8 px-3 bg-amber-50 dark:bg-amber-400/[0.07] shadow-[inset_0_-1.5px_0_rgba(251,191,36,0.55)] text-[9px] font-black uppercase tracking-[0.10em] text-[#92400E] dark:text-[#FCD34D]">
                  <AlertTriangle size={12} /> Vendas com pagamento misto · {mistas.length}
                  <span className="ml-auto normal-case tracking-normal text-[10.5px] font-bold">
                    {calc.pendentes ? `${calc.pendentes} sem valor informado` : 'todas informadas ✓'} · em dinheiro: <b className="font-mono">{brl(calc.misto)}</b> de {brl(calc.totMistas)}
                  </span>
                </div>
                <p className="px-3 py-2 border-b border-[#EFE8D2] dark:border-white/[0.06] text-[11px] leading-[1.45] text-on-surface/45">
                  O Retaguarda só traz o total destas vendas. Informe <b className="text-on-surface/80">quanto foi pago em dinheiro</b> em cada uma — o resto (cartão, PIX, vale troca) não entra aqui. Vazio conta como R$ 0,00.
                </p>
                <div className="overflow-x-auto">
                  <table className={cn(tableCls, 'min-w-[860px] [&_td]:h-[38px]')}>
                    <colgroup><col className="w-[110px]" /><col className="w-[100px]" /><col className="w-[96px]" /><col /><col className="w-[70px]" /><col className="w-[120px]" /><col className="w-[180px]" /></colgroup>
                    <thead>
                      <tr>
                        <th className={cn(thCls, 'text-left')}>Data</th><th className={cn(thCls, 'text-left')}>Nº</th><th className={cn(thCls, 'text-left')}>Tipo</th>
                        <th className={cn(thCls, 'text-left')}>Pagamento</th><th className={cn(thCls, 'text-left')}>Caixa</th><th className={thCls}>Total da venda</th><th className={thCls}>Em dinheiro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mistas.map((s, i) => {
                        const raw = mixInput[s.id_mov] ?? '';
                        const v = parseValorDigitado(raw);
                        const excede = v !== null && v > s.valor_total + 0.004;
                        return (
                          <tr key={s.id_mov} className={i % 2 === 0 ? 'bg-white dark:bg-[#252520]' : 'bg-[#FAF7EE] dark:bg-[#1E1E18]'}>
                            <td className="!text-left"><b className="text-on-surface">{dm(s.data_venda)}</b> <span className="text-[11px] text-on-surface/35">{s.hora_venda?.slice(0, 5)}</span></td>
                            <td className="!text-left font-mono text-on-surface/70">{s.numero}</td>
                            <td className="!text-left text-[11px] text-on-surface/45">{s.tipo_doc === 'Nota Fiscal 65' ? 'NFC-e' : s.tipo_doc}</td>
                            <td className="!text-left">
                              <span className="inline-flex gap-[3px]">
                                {s.forma_pagamento.split('|').map(p => p.trim()).map((p, j) => (
                                  <span key={j} className={cn('text-[9px] font-black px-[5px] leading-4 border tracking-[0.03em]', norm(p) === 'dinheiro' ? 'border-[#0A7A55]/40 text-[#0A7A55] dark:text-[#34D399]' : 'border-[#E0D8BF] dark:border-white/[0.10] text-on-surface/45')}>{p}</span>
                                ))}
                              </span>
                            </td>
                            <td className="!text-left text-[11px] text-on-surface/45">{s.caixa ?? '—'}</td>
                            <td className="font-mono tabular-nums text-on-surface">{fmt(s.valor_total)}</td>
                            <td>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setMixInput(m => ({ ...m, [s.id_mov]: fmt(s.valor_total) }))}
                                  title="A venda inteira foi em dinheiro"
                                  className="h-6 px-[7px] border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#252520] text-[9.5px] font-black uppercase tracking-[0.05em] text-on-surface/45 hover:text-on-surface transition-colors"
                                >Tudo</button>
                                <input
                                  value={raw}
                                  inputMode="decimal"
                                  placeholder="0,00"
                                  onFocus={e => e.target.select()}
                                  onChange={e => setMixInput(m => ({ ...m, [s.id_mov]: e.target.value }))}
                                  onBlur={() => { if (v !== null) setMixInput(m => ({ ...m, [s.id_mov]: fmt(v) })); }}
                                  className={cn(
                                    'h-7 w-full min-w-0 px-2 bg-white dark:bg-[#252520] border font-mono text-[12px] text-right outline-none caret-[#D81E1E] transition-[border-color,box-shadow] duration-[130ms] focus:border-[#D81E1E] focus:shadow-[0_0_0_3px_rgba(216,30,30,0.15)]',
                                    excede ? 'border-[#D81E1E] text-[#D81E1E]' : !raw.trim() ? 'border-amber-400/60 text-on-surface' : 'border-[#E0D8BF] dark:border-white/[0.08] text-on-surface',
                                  )}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] overflow-auto max-h-[46vh]">
              <table className={cn(tableCls, 'min-w-[860px] [&_td]:h-[34px]')}>
                <colgroup><col className="w-[120px]" /><col className="w-[150px]" />{calc.caixas.map(c => <col key={c} />)}<col /><col /><col className="w-[110px]" /></colgroup>
                <thead>
                  <tr>
                    <th className={cn(thCls, 'text-left')}>Data</th><th className={thCls}>Vendas</th>
                    {calc.caixas.map(c => <th key={c} className={thCls}>Caixa {c}</th>)}
                    <th className={thCls}>Mistas (dinheiro)</th><th className={thCls}>Receita do dia</th><th className={thCls}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.dias.map((d, i) => (
                    <tr key={pdvDiaKey(d.cnpj, d.data)} className={cn(i % 2 === 0 ? 'bg-white dark:bg-[#252520]' : 'bg-[#FAF7EE] dark:bg-[#1E1E18]', reimportacao && d.status === 'ja' && 'opacity-45')}>
                      <td className="!text-left">
                        <b className="text-on-surface">{dm(d.data)}</b> <span className="text-[11px] text-on-surface/30">{dow(d.data)}</span>
                        {parsed && parsed.lojas.length > 1 && <span className="text-[11px] text-on-surface/30"> · {estabMap[d.cnpj]}</span>}
                      </td>
                      <td><span className="font-mono tabular-nums">{d.nPuro}</span>{d.nMisto > 0 && <span className="text-[11px] text-on-surface/35"> +{d.nMisto} {d.nMisto === 1 ? 'mista' : 'mistas'}</span>}</td>
                      {calc.caixas.map(c => <td key={c} className="font-mono tabular-nums">{d.porCaixa[c] ? fmt(d.porCaixa[c]) : <span className="text-on-surface/20">—</span>}</td>)}
                      <td className={cn('font-mono tabular-nums', d.mistoDinheiro > 0 && 'text-[#92400E] dark:text-[#FCD34D]')}>{d.nMisto ? fmt(d.mistoDinheiro) : <span className="text-on-surface/20">—</span>}</td>
                      <td className="font-mono tabular-nums font-extrabold text-[#0A7A55] dark:text-[#34D399]">{fmt(d.total)}</td>
                      <td>{pill(d.status)}</td>
                    </tr>
                  ))}
                  <tr className="sticky bottom-0 bg-[#FFF7B0] dark:bg-[#252520] font-black [&_td]:border-t-[1.5px] [&_td]:border-t-[#8F7E10]">
                    <td className="!text-left">{calc.dias.length} dias</td>
                    <td className="font-mono tabular-nums">{calc.nPuro}</td>
                    {calc.caixas.map(c => <td key={c} className="font-mono tabular-nums">{fmt(calc.dias.reduce((a, d) => a + (d.porCaixa[c] ?? 0), 0))}</td>)}
                    <td className="font-mono tabular-nums">{fmt(calc.misto)}</td>
                    <td className="font-mono tabular-nums">{fmt(calc.puro + calc.misto)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[10.5px] text-on-surface/30">
              Cada linha vira uma receita &ldquo;Dinheiro&rdquo; · Favorecido <b>Vendas balcão</b> · paga na data da venda. A divisão por caixa fica na observação.
            </p>
          </>)}

          {passo === 'concluido' && resultado && (
            <div className="flex flex-col items-center text-center gap-1.5 pt-4">
              <div className={cn('w-[52px] h-[52px] grid place-items-center border', desfeito ? 'border-on-surface/15 bg-on-surface/[0.05] text-on-surface/40' : 'border-[#0A7A55]/30 bg-[#0A7A55]/[0.08] text-[#0A7A55] dark:text-[#34D399]')}>
                {desfeito ? <RotateCcw size={22} /> : <Check size={24} strokeWidth={3} />}
              </div>
              <h3 className="mt-2 text-[18px] font-black text-on-surface">{desfeito ? 'Importação desfeita' : 'Vendas em dinheiro importadas'}</h3>
              <p className="max-w-[440px] text-[12.5px] leading-normal text-on-surface/50">
                {desfeito
                  ? 'As vendas deste arquivo e as receitas criadas por ele foram removidas; valores corrigidos de vendas mistas voltaram ao que eram.'
                  : 'As receitas em dinheiro já estão no Controle Financeiro e no Fluxo de Caixa.'}
              </p>
              {!desfeito && (<>
                <div className="mt-3 w-full grid grid-cols-2 border-l border-t border-[#E0D8BF] dark:border-white/[0.08] bg-white dark:bg-[#252520] text-left">
                  {[
                    ['Receitas criadas', resultado.criadas],
                    ['Receitas atualizadas', resultado.atualizadas],
                    ['Vendas guardadas', resultado.vendas],
                    ['Já existentes (ignoradas)', resultado.ignoradas],
                  ].map(([l, v]) => (
                    <div key={l} className="flex justify-between gap-2 px-3 py-2 border-r border-b border-[#E0D8BF] dark:border-white/[0.08] text-[12px] font-semibold text-on-surface/50">
                      {l}<b className="font-black text-on-surface">{Number(v).toLocaleString('pt-BR')}</b>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10.5px] text-on-surface/30">
                  Errou o valor de uma venda mista? Importe o arquivo de novo: a prévia mostra as mistas com o valor salvo para corrigir, e o dia é recalculado.
                </p>
              </>)}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 shrink-0 bg-[#FFF7B0] dark:bg-[#252520] border-t border-[#DDD000] dark:border-white/[0.06]">
          {passo === 'arquivo' && (<>
            <span className="text-[12px] font-semibold text-on-surface/45">
              {parsed ? <>Agrupa por <b className="text-on-surface">dia da venda</b>; as vendas individuais ficam guardadas para conferência.</> : 'Nada foi importado ainda.'}
            </span>
            <button onClick={onClose} className={cn(btnGhost, 'ml-auto')}>Cancelar</button>
            <button onClick={montarPrevia} disabled={!parsed || faltaEstab || !tagDinheiro || !!carregando} className={cn(btnPri, 'flex items-center gap-2')}>
              {carregando && parsed && <Loader2 size={13} className="animate-spin" />} Ver prévia →
            </button>
          </>)}
          {passo === 'previa' && calc && (<>
            <span className="text-[12px] font-semibold text-on-surface/45">
              {calc.afetados.length === 0
                ? 'Nada novo neste arquivo.'
                : <>Serão criadas <b className="text-on-surface">{calc.criar} receitas</b>{calc.atualizar > 0 && <> e atualizadas <b className="text-on-surface">{calc.atualizar}</b></>} · {brl(calc.puro + calc.misto)}</>}
            </span>
            <button onClick={() => setPasso('arquivo')} disabled={!!carregando} className={cn(btnGhost, 'ml-auto')}>← Voltar</button>
            <button onClick={importar} disabled={calc.afetados.length === 0 || !!carregando} className={cn(btnPri, 'flex items-center gap-2')}>
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

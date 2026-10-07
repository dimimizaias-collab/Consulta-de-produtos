'use client';

import { motion } from 'motion/react';
import { Plus, X, Check, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calcularRateio, dividirValor, round2, type RateioState, type RateioModo } from '@/lib/rateio';

// Editor do rateio no formulário de movimentação: lista de estabelecimentos com % e valor,
// modos Igual / Por % / Por valor, barra de proporção e status (fechado / falta / passou).

export const RATEIO_CORES = ['#D81E1E', '#2563EB', '#0A7A55', '#B45309', '#7C3AED', '#0891B2', '#BE185D'];

const fmt = (v: number) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctFmt = (v: number) => (Math.round(v * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const parse = (s: string) => { const t = s.trim(); if (!t) return 0; const n = parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(n) ? n : 0; };

const roCls = 'h-[34px] px-2.5 flex items-center justify-end bg-black/[0.035] dark:bg-white/[0.03] border border-[#E0D8BF] dark:border-white/[0.10] font-mono text-[12.5px] text-on-surface/60 select-none';
const inCls = 'h-[34px] w-full px-2.5 bg-white dark:bg-[#1E1E18] border text-[13px] font-semibold text-on-surface outline-none caret-[#D81E1E] hover:border-[#CFC4A2] dark:hover:border-white/[0.20] focus:!border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] transition-[border-color,box-shadow]';

interface RateioEditorProps {
  total: number;
  state: RateioState;
  onChange: (s: RateioState) => void;
  estabelecimentos: string[];
  /** Parcelas do formulário (para mostrar como cada parcela fica dividida). */
  parcelas?: { seq: number; data: string; valor: number }[];
  /** Ex.: "preenchido pela distribuição" — mostrado ao lado do total. */
  origemLabel?: string;
}

export function RateioEditor({ total, state, onChange, estabelecimentos, parcelas, origemLabel }: RateioEditorProps) {
  const calc = calcularRateio(state, total);
  const usados = state.linhas.map(l => l.estab);
  const status = calc.erro ? 'erro' : calc.fechado ? 'ok' : calc.diferenca > 0 ? 'falta' : 'passou';

  const setLinha = (i: number, patch: Partial<RateioState['linhas'][number]>) =>
    onChange({ ...state, linhas: state.linhas.map((l, k) => (k === i ? { ...l, ...patch } : l)) });

  // Ao trocar de modo, parte dos valores atuais para não "perder" o que já foi digitado
  const setModo = (modo: RateioModo) => {
    if (modo === state.modo) return;
    onChange({
      ...state,
      modo,
      linhas: state.linhas.map((l, i) => ({ ...l, pct: round2(calc.linhas[i]?.pct ?? 0), valor: calc.linhas[i]?.valor ?? 0 })),
    });
  };

  const adicionar = () => {
    const livre = estabelecimentos.find(e => !usados.includes(e));
    if (!livre) return;
    onChange({ ...state, linhas: [...state.linhas, { estab: livre, pct: 0, valor: 0 }] });
  };

  const remover = (i: number) => onChange({ ...state, linhas: state.linhas.filter((_, k) => k !== i) });

  const ajustarUltimo = () => {
    const n = state.linhas.length;
    if (state.modo === 'pct') {
      const outros = state.linhas.slice(0, -1).reduce((a, l) => a + (l.pct || 0), 0);
      setLinha(n - 1, { pct: round2(Math.max(0, 100 - outros)) });
    } else {
      const outros = calc.linhas.slice(0, -1).reduce((a, l) => a + l.valor, 0);
      onChange({
        ...state,
        modo: 'valor',
        linhas: state.linhas.map((l, i) => ({ ...l, valor: i === n - 1 ? round2(Math.max(0, total - outros)) : calc.linhas[i].valor })),
      });
    }
  };

  const parcelasDivididas = parcelas && parcelas.length > 1 && calc.fechado
    ? parcelas.map(p => ({ ...p, partes: dividirValor(p.valor, calc.linhas.map(l => l.valor)) }))
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      className="bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10] origin-top"
    >
      <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[#E0D8BF] dark:border-white/[0.10]">
        <div className="min-w-0">
          <b className="block text-[12px] font-extrabold text-on-surface">Dividir {parcelas && parcelas.length > 1 ? 'cada parcela' : 'o valor'} entre estabelecimentos</b>
          <small className="block text-[10.5px] font-semibold text-on-surface/45">
            Total da movimentação: <b className="font-mono text-on-surface/70">R$ {fmt(total)}</b>{parcelas && parcelas.length > 1 && ` em ${parcelas.length} parcelas`}
            {origemLabel && <span className="ml-1.5 text-[9px] font-black uppercase tracking-[0.05em] text-[#2563EB] dark:text-[#60A5FA]">· {origemLabel}</span>}
          </small>
        </div>
        <div className="ml-auto flex border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] shrink-0">
          {([['igual', 'Igual'], ['pct', 'Por %'], ['valor', 'Por valor']] as const).map(([k, l], i) => (
            <button
              key={k}
              type="button"
              onClick={() => setModo(k)}
              className={cn(
                'h-[26px] px-2.5 text-[10px] font-black uppercase tracking-[0.06em] transition-colors active:scale-[0.97]',
                i > 0 && 'border-l border-[#E0D8BF] dark:border-white/[0.10]',
                state.modo === k ? 'bg-[#D81E1E] text-white' : 'text-on-surface/45 hover:text-on-surface',
              )}
            >{l}</button>
          ))}
        </div>
      </div>

      {/* Barra de proporção */}
      <div className="flex h-2.5 mx-2.5 mt-2.5 mb-0.5 bg-black/[0.035] dark:bg-white/[0.03] border border-[#E0D8BF] dark:border-white/[0.10] overflow-hidden">
        {calc.linhas.map((l, i) => (
          <i key={i} className="block h-full transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
            style={{ width: `${total > 0 ? Math.max(0, Math.min(100, (l.valor / total) * 100)) : 0}%`, background: RATEIO_CORES[i % RATEIO_CORES.length] }} />
        ))}
        {status === 'falta' && total > 0 && (
          <i className="block h-full" style={{ width: `${(calc.diferenca / total) * 100}%`, background: 'repeating-linear-gradient(45deg, transparent 0 4px, rgba(251,191,36,0.55) 4px 6px)' }} />
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-2.5 pt-1 pb-2 text-[10.5px] font-bold text-on-surface/45">
        {calc.linhas.map((l, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <i className="w-2 h-2" style={{ background: RATEIO_CORES[i % RATEIO_CORES.length] }} />{l.estab || '—'} · {pctFmt(l.pct)}%
          </span>
        ))}
      </div>

      {/* Linhas */}
      <div className="border-t border-[#E0D8BF] dark:border-white/[0.10]">
        <div className="grid grid-cols-[14px_1fr_100px_140px_28px] gap-2 items-center h-[26px] px-2.5 bg-[#FFEC4D] shadow-[inset_0_-1.5px_0_#8F7E10] text-[8.5px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)]">
          <span /><span>Estabelecimento</span><span className="text-right">%</span><span className="text-right">Valor (R$)</span><span />
        </div>
        {state.linhas.map((l, i) => {
          const c = calc.linhas[i];
          return (
            <div key={i} className="group/rt grid grid-cols-[14px_1fr_100px_140px_28px] gap-2 items-center px-2.5 py-1 border-b border-[#EFE8D2] dark:border-white/[0.06] last:border-b-0">
              <i className="w-2.5 h-2.5" style={{ background: RATEIO_CORES[i % RATEIO_CORES.length] }} />
              <select
                value={l.estab}
                onChange={e => setLinha(i, { estab: e.target.value })}
                className={cn(inCls, 'border-[#E0D8BF] dark:border-white/[0.10] cursor-pointer')}
              >
                {!l.estab && <option value="">Escolha…</option>}
                {estabelecimentos.map(e => (
                  <option key={e} value={e} disabled={usados.includes(e) && e !== l.estab}>{e}</option>
                ))}
              </select>
              <div className="relative">
                {state.modo === 'pct' ? (
                  <input
                    key={`pct-${i}-${l.pct}`}
                    defaultValue={l.pct ? pctFmt(l.pct) : ''}
                    inputMode="decimal"
                    placeholder="0"
                    onFocus={e => e.target.select()}
                    onBlur={e => { if (e.target.value !== e.target.defaultValue) setLinha(i, { pct: parse(e.target.value) }); }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className={cn(inCls, 'pr-6 text-right font-mono text-[12.5px] border-[#E0D8BF] dark:border-white/[0.10]')}
                  />
                ) : (
                  <div className={cn(roCls, 'pr-6')}>{pctFmt(c?.pct ?? 0)}</div>
                )}
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-on-surface/30 pointer-events-none">%</span>
              </div>
              {state.modo === 'valor' ? (
                <input
                  key={`valor-${i}-${l.valor}`}
                  defaultValue={l.valor ? fmt(l.valor) : ''}
                  inputMode="decimal"
                  placeholder="0,00"
                  onFocus={e => e.target.select()}
                  onBlur={e => { if (e.target.value !== e.target.defaultValue) setLinha(i, { valor: round2(parse(e.target.value)) }); }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className={cn(inCls, 'text-right font-mono text-[12.5px]', status === 'passou' ? 'border-[#D81E1E] text-[#D81E1E]' : 'border-[#E0D8BF] dark:border-white/[0.10]')}
                />
              ) : (
                <div className={roCls}>{fmt(c?.valor ?? 0)}</div>
              )}
              <button
                type="button"
                onClick={() => remover(i)}
                disabled={state.linhas.length <= 2}
                title="Remover"
                className={cn(
                  'w-7 h-7 grid place-items-center border border-transparent text-on-surface/30 transition-[color,background-color,opacity]',
                  state.linhas.length <= 2 ? 'invisible' : 'opacity-40 group-hover/rt:opacity-100 hover:text-[#D81E1E] hover:border-[#D81E1E]/30 hover:bg-[#D81E1E]/[0.06]',
                )}
              ><X size={13} strokeWidth={3} /></button>
            </div>
          );
        })}
      </div>

      {usados.length < estabelecimentos.length && (
        <button
          type="button"
          onClick={adicionar}
          className="mx-2.5 my-2 h-8 w-[calc(100%-20px)] flex items-center justify-center gap-1.5 border-[1.5px] border-dashed border-[rgba(26,26,10,0.22)] dark:border-white/[0.18] text-[11px] font-extrabold uppercase tracking-[0.05em] text-[rgba(26,26,10,0.30)] dark:text-white/25 hover:border-[#D81E1E] hover:text-[#D81E1E] transition-colors"
        >
          <Plus size={13} strokeWidth={3} /> Adicionar estabelecimento
        </button>
      )}

      <div className={cn(
        'flex items-center gap-2 px-2.5 py-2 border-t text-[12px] font-bold',
        status === 'ok' && 'border-[#0A7A55]/25 bg-[#0A7A55]/[0.08] text-[#0A7A55] dark:text-[#34D399]',
        status === 'falta' && 'border-amber-400/40 bg-amber-50 dark:bg-amber-400/[0.07] text-[#92400E] dark:text-[#FCD34D]',
        (status === 'passou' || status === 'erro') && 'border-[#D81E1E]/25 bg-[#D81E1E]/[0.06] text-[#D81E1E]',
      )}>
        {status === 'ok' && <><Check size={14} strokeWidth={3} /> Rateio fechado: {calc.linhas.length} estabelecimentos somam R$ {fmt(calc.soma)}</>}
        {status === 'falta' && <><AlertTriangle size={14} /> Faltam <b className="font-mono">R$ {fmt(calc.diferenca)}</b> para fechar o total</>}
        {status === 'passou' && <><AlertTriangle size={14} /> O rateio passa do total em <b className="font-mono">R$ {fmt(-calc.diferenca)}</b></>}
        {status === 'erro' && <><AlertTriangle size={14} /> {calc.erro}</>}
        {(status === 'falta' || status === 'passou') && (
          <button
            type="button"
            onClick={ajustarUltimo}
            className="ml-auto h-6 px-2 border border-current text-[9.5px] font-black uppercase tracking-[0.05em] active:scale-[0.97] transition-transform"
          >Ajustar no último</button>
        )}
      </div>

      {parcelasDivididas && (
        <div className="px-2.5 pb-2.5">
          <div className="pt-1 pb-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-on-surface/45">Como fica cada parcela</div>
          <div className="overflow-x-auto border border-[#E0D8BF] dark:border-white/[0.10]">
            <table className="w-full min-w-[480px] border-collapse text-[12px]">
              <thead>
                <tr>
                  <th className="h-7 px-2.5 text-left bg-[#FFEC4D] text-[8.5px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] shadow-[inset_0_-1.5px_0_#8F7E10]">Parcela</th>
                  {calc.linhas.map((l, i) => (
                    <th key={i} className="h-7 px-2.5 text-right bg-[#FFEC4D] text-[8.5px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] shadow-[inset_0_-1.5px_0_#8F7E10] whitespace-nowrap">
                      <i className="inline-block w-2 h-2 mr-1" style={{ background: RATEIO_CORES[i % RATEIO_CORES.length] }} />{l.estab}
                    </th>
                  ))}
                  <th className="h-7 px-2.5 text-right bg-[#FFEC4D] text-[8.5px] font-black uppercase tracking-[0.10em] text-[#1A1A0E] shadow-[inset_0_-1.5px_0_#8F7E10]">Total</th>
                </tr>
              </thead>
              <tbody>
                {parcelasDivididas.map((p, pi) => (
                  <tr key={pi} className={pi % 2 === 0 ? 'bg-white dark:bg-[#252520]' : 'bg-[#FAF7EE] dark:bg-[#1E1E18]'}>
                    <td className="h-[30px] px-2.5 border-b border-[#EFE8D2] dark:border-white/[0.06]">
                      <b className="text-on-surface">{p.seq}/{parcelasDivididas.length}</b>
                      {p.data && <span className="ml-1.5 text-on-surface/35">{p.data.slice(8, 10)}/{p.data.slice(5, 7)}</span>}
                    </td>
                    {p.partes.map((v, i) => <td key={i} className="h-[30px] px-2.5 text-right font-mono border-b border-[#EFE8D2] dark:border-white/[0.06]">{fmt(v)}</td>)}
                    <td className="h-[30px] px-2.5 text-right font-mono font-extrabold border-b border-[#EFE8D2] dark:border-white/[0.06]">{fmt(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}

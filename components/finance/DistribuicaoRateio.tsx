'use client';

import { useState } from 'react';
import { ArrowLeftRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dividirValor } from '@/lib/rateio';
import { linhasProporcionais, type DistribuicaoInfo } from '@/lib/rateioDistribuicao';
import { RATEIO_CORES } from './RateioEditor';

// Avisos do "Ratear pela distribuição" no modal de movimentação: bloco azul na seção de
// notas vinculadas (com o botão e o cálculo) e o aviso de rateio desatualizado.

const fmt = (v: number) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctFmt = (v: number) => (Math.round(v * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Parte do pagamento de cada loja, na mesma ordem de info.lojas. */
export const partesDoPagamento = (info: DistribuicaoInfo, total: number) =>
  dividirValor(total, linhasProporcionais(info).map(l => l.pct));

const azulBox = 'border border-[#2563EB]/35 dark:border-[#60A5FA]/35 bg-[#2563EB]/[0.05] dark:bg-[#60A5FA]/[0.06]';
const azulIc = 'w-7 h-7 shrink-0 grid place-items-center bg-[#2563EB]/[0.12] dark:bg-[#60A5FA]/[0.14] text-[#2563EB] dark:text-[#60A5FA]';
const azulBtn = 'shrink-0 h-[30px] px-3 flex items-center gap-1.5 border border-[#2563EB] text-[10.5px] font-black uppercase tracking-[0.05em] whitespace-nowrap active:scale-[0.97] transition-transform';

interface AvisoProps {
  info: DistribuicaoInfo;
  total: number;
  /** O rateio atual veio desta distribuição. */
  aplicado: boolean;
  podeAplicar: boolean;
  onAplicar: () => void;
}

export function DistribuicaoAviso({ info, total, aplicado, podeAplicar, onAplicar }: AvisoProps) {
  const [verCalculo, setVerCalculo] = useState(false);
  const destinos = info.lojas.filter(l => !l.origem);
  const notasLabel = info.notas.length === 1 ? `A NF ${info.notas[0].numero}` : `As ${info.notas.length} notas vinculadas`;
  const partes = partesDoPagamento(info, total);
  const linhas = linhasProporcionais(info);

  return (
    <div className={azulBox}>
      <div className="flex items-center gap-2.5 px-3 py-2">
        <span className={azulIc}><ArrowLeftRight size={14} /></span>
        {aplicado ? (
          <p className="flex-1 min-w-0 text-[12px] leading-[1.45] text-on-surface">
            Rateio calculado pela distribuição {info.notas.length === 1 ? `da NF ${info.notas[0].numero}` : 'das notas vinculadas'} — <b>proporcional ao custo</b> de cada loja.
            <small className="block text-[11px] font-semibold text-on-surface/45">O frete e os impostos da nota se dividem na mesma proporção.</small>
          </p>
        ) : (
          <p className="flex-1 min-w-0 text-[12px] leading-[1.45] text-on-surface">
            {notasLabel} {info.notas.length === 1 ? 'teve' : 'tiveram'} <b>R$ {fmt(info.distribuido)}</b> em mercadoria distribuída para {destinos.length} {destinos.length === 1 ? 'loja' : 'lojas'}.
            <small className="block text-[11px] font-semibold text-on-surface/45">
              {destinos.map(d => `${d.estab}: R$ ${fmt(d.custo)}`).join(' · ')} — {pctFmt((info.distribuido / info.custoTotal) * 100)}% do custo
            </small>
          </p>
        )}
        {aplicado || !podeAplicar ? (
          <button type="button" onClick={() => setVerCalculo(v => !v)} className={cn(azulBtn, 'bg-transparent text-[#2563EB] dark:text-[#60A5FA] dark:border-[#60A5FA]')}>
            {verCalculo ? 'Ocultar' : 'Ver'} cálculo
          </button>
        ) : (
          <button type="button" onClick={onAplicar} className={cn(azulBtn, 'bg-[#2563EB] text-white')}>
            <ArrowLeftRight size={12} /> Ratear pela distribuição
          </button>
        )}
      </div>

      {info.itensSemCusto > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 border-t border-amber-400/40 bg-amber-50 dark:bg-amber-400/[0.07] text-[12px] leading-[1.45] text-[#92400E] dark:text-[#FCD34D]">
          <AlertTriangle size={14} className="shrink-0 mt-px" />
          <span>
            <b>{info.itensSemCusto} {info.itensSemCusto === 1 ? 'item distribuído está' : 'itens distribuídos estão'} sem custo</b>
            {info.manifestosSemCusto.length > 0 && ` (manifesto ${info.manifestosSemCusto.join(', ')})`} e {info.itensSemCusto === 1 ? 'ficou' : 'ficaram'} fora do cálculo. Corrija o custo na distribuição para o rateio ficar exato.
          </span>
        </div>
      )}

      {verCalculo && (
        <div className="border-t border-[#2563EB]/25 bg-white dark:bg-[#1E1E18]">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {['Loja', 'Custo da mercadoria', 'Proporção', 'Parte do pagamento'].map((h, i) => (
                  <th key={h} className={cn('h-7 px-2.5 bg-[#FFEC4D] text-[8.5px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] shadow-[inset_0_-1.5px_0_#8F7E10]', i === 0 ? 'text-left' : 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {info.lojas.map((l, i) => (
                <tr key={l.estab} className={i % 2 === 0 ? 'bg-white dark:bg-[#252520]' : 'bg-[#FAF7EE] dark:bg-[#1E1E18]'}>
                  <td className="h-8 px-2.5 border-b border-[#EFE8D2] dark:border-white/[0.06]">
                    <i className="inline-block w-2 h-2 mr-1.5" style={{ background: RATEIO_CORES[i % RATEIO_CORES.length] }} />
                    <span className="font-semibold text-on-surface">{l.estab}</span>
                    {l.origem
                      ? <span className="ml-1.5 text-[8.5px] font-black uppercase tracking-[0.05em] px-[5px] leading-[15px] border border-current text-on-surface/40">origem · fica com o resto</span>
                      : <span className="ml-1.5 text-[11px] text-on-surface/35">{l.manifestos.join(', ')} · {l.itens} {l.itens === 1 ? 'item' : 'itens'}</span>}
                  </td>
                  <td className="h-8 px-2.5 text-right font-mono border-b border-[#EFE8D2] dark:border-white/[0.06]">{fmt(l.custo)}</td>
                  <td className="h-8 px-2.5 text-right font-mono border-b border-[#EFE8D2] dark:border-white/[0.06]">{pctFmt(linhas[i].pct)}%</td>
                  <td className="h-8 px-2.5 text-right font-mono font-extrabold border-b border-[#EFE8D2] dark:border-white/[0.06]">{fmt(partes[i])}</td>
                </tr>
              ))}
              <tr className="bg-[#FFF7B0] dark:bg-[#252520] font-black">
                <td className="h-8 px-2.5 border-t-[1.5px] border-[#8F7E10]">Total</td>
                <td className="h-8 px-2.5 text-right font-mono border-t-[1.5px] border-[#8F7E10]">{fmt(info.custoTotal)}</td>
                <td className="h-8 px-2.5 text-right font-mono border-t-[1.5px] border-[#8F7E10]">100%</td>
                <td className="h-8 px-2.5 text-right font-mono border-t-[1.5px] border-[#8F7E10]">{fmt(total)}</td>
              </tr>
            </tbody>
          </table>
          <p className="px-3 py-2 border-t border-[#E0D8BF] dark:border-white/[0.10] text-[11px] leading-[1.45] text-on-surface/45">
            Parte do pagamento = valor do pagamento × proporção do custo (custo de cada produto na nota). Os centavos fecham na última loja. Itens com custo zero não entram.
          </p>
        </div>
      )}
    </div>
  );
}

interface DesatualizadoProps {
  info: DistribuicaoInfo;
  total: number;
  /** Valor atual de cada loja no rateio. */
  atuais: Record<string, number>;
  podeRecalcular: boolean;
  onRecalcular: () => void;
}

export function RateioDesatualizado({ info, total, atuais, podeRecalcular, onRecalcular }: DesatualizadoProps) {
  const novos = partesDoPagamento(info, total);
  const estabs = [...new Set([...info.lojas.map(l => l.estab), ...Object.keys(atuais)])];
  return (
    <div className="md:col-span-2 flex items-center gap-2.5 px-3 py-2 border border-amber-400/55 bg-amber-50 dark:bg-amber-400/[0.07] text-[12px] leading-[1.45] text-[#92400E] dark:text-[#FCD34D]">
      <AlertTriangle size={14} className="shrink-0" />
      <span className="flex-1 min-w-0">
        <b>Rateio desatualizado:</b> a distribuição {info.notas.length === 1 ? `da NF ${info.notas[0].numero}` : 'das notas vinculadas'} mudou depois que o rateio foi feito.
        <span className="block mt-1">
          {estabs.map(e => {
            const i = info.lojas.findIndex(l => l.estab === e);
            const novo = i >= 0 ? novos[i] : 0;
            return (
              <span key={e} className="inline-block mr-3 font-mono text-[11.5px]">
                {e}: <span className="line-through opacity-50 mr-1">{fmt(atuais[e] ?? 0)}</span>{fmt(novo)}
              </span>
            );
          })}
        </span>
      </span>
      {podeRecalcular && (
        <button type="button" onClick={onRecalcular} className={cn(azulBtn, 'bg-[#2563EB] text-white')}>Recalcular</button>
      )}
    </div>
  );
}

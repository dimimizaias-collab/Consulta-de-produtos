'use client';

import { motion, AnimatePresence } from 'motion/react';
import { X, Pencil, Plus, Equal, CalendarDays, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtSalario, parseMoneyInput } from '@/lib/hrEmployees';
import { nthBusinessDay, toIsoDate } from '@/lib/hrBusinessDays';
import { MESES_ABREV } from '@/lib/hrContratos';

interface SalaryEditModalProps {
  open: boolean;
  employeeName: string;
  periodoLabel: string;
  base: string;
  complementar: string;
  diasUteis: string;
  onChangeBase: (v: string) => void;
  onChangeComplementar: (v: string) => void;
  onChangeDiasUteis: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  ano: number;
  mesInicio: number;
  mesFim: number;
  feriados: Set<string>;
  variant?: 'modal' | 'sheet';
}

export function SalaryEditModal({
  open, employeeName, periodoLabel, base, complementar, diasUteis,
  onChangeBase, onChangeComplementar, onChangeDiasUteis, onCancel, onConfirm,
  ano, mesInicio, mesFim, feriados, variant = 'modal',
}: SalaryEditModalProps) {
  const baseNum = parseMoneyInput(base);
  const complementarNum = parseMoneyInput(complementar);
  const total = baseNum + complementarNum;
  const pct = baseNum > 0 ? Math.round((complementarNum / baseNum) * 100) : 0;
  const n = parseInt(diasUteis, 10) || 0;

  const previewMeses = Array.from({ length: Math.min(4, mesFim - mesInicio + 1) }, (_, i) => mesInicio + i);
  const preview = n > 0
    ? previewMeses.map(mes => {
        const dia = nthBusinessDay(ano, mes, n, feriados);
        return `${MESES_ABREV[mes - 1]} ${toIsoDate(dia).slice(8, 10)}`;
      })
    : [];

  const fieldCls = 'w-full bg-surface border border-on-surface/[0.10] rounded-xl px-3.5 py-2.5 text-[13px] text-on-surface outline-none focus:border-primary/50 font-mono font-bold';
  const labelCls = 'text-[10px] font-extrabold uppercase tracking-wide text-on-surface/45 mb-1.5 block';
  const connectorCls = 'absolute right-3.5 top-full mt-[7px] w-[26px] h-[26px] rounded-[9px] bg-surface-container border border-on-surface/[0.10] flex items-center justify-center text-on-surface/45 shadow-md z-10';
  const lineTopCls = 'absolute right-[26px] top-full w-0 h-[7px] border-l-2 border-dashed border-on-surface/25';
  const lineBottomCls = 'absolute right-[26px] top-[calc(100%+33px)] w-0 h-[7px] border-l-2 border-dashed border-on-surface/25';

  const body = (
    <>
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
          <Pencil size={16} strokeWidth={2.3} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14.5px] font-extrabold text-on-surface">Editar Salário</div>
          <div className="text-[10.5px] font-semibold text-on-surface/40 truncate">{employeeName} · {periodoLabel}</div>
        </div>
        <button onClick={onCancel} className="w-[26px] h-[26px] rounded-[9px] bg-on-surface/[0.06] flex items-center justify-center text-on-surface/40 flex-shrink-0">
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>

      <div className="bg-primary/[0.045] border border-primary/[0.18] rounded-2xl px-4 py-3.5 mb-5">
        <div className="flex items-center gap-1.5 mb-2.5">
          <CalendarDays size={13} className="text-primary flex-shrink-0" />
          <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-red-700 dark:text-red-400">Data de Pagamento</span>
        </div>
        <div className="flex items-center gap-2.5">
          <input
            className="w-[70px] flex-shrink-0 bg-surface border border-primary/30 rounded-xl px-2.5 py-2.5 text-[15px] font-extrabold text-on-surface font-mono text-center outline-none focus:border-primary/60"
            value={diasUteis}
            onChange={e => onChangeDiasUteis(e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="5"
          />
          <span className="text-[11.5px] font-semibold text-on-surface/55 leading-snug">
            º dia útil de cada mês<br />(seg–sáb, exceto feriados)
          </span>
        </div>
        {preview.length > 0 && (
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {preview.map(p => (
              <span key={p} className="text-[10px] font-extrabold font-mono text-on-surface bg-surface border border-on-surface/[0.10] px-2 py-1 rounded-lg">
                {p}
              </span>
            ))}
            {mesFim - mesInicio + 1 > previewMeses.length && (
              <span className="text-[10px] font-extrabold font-mono text-on-surface/40 px-1 py-1">…</span>
            )}
          </div>
        )}
        <p className="text-[10px] font-medium text-on-surface/40 mt-2.5 leading-relaxed">
          Gera 1 parcela por mês no Controle Financeiro, travada para edição — só pode ser marcada como paga.
        </p>
      </div>

      <div className="relative mb-10">
        <label className={labelCls}>Salário Base</label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-on-surface/35 font-mono pointer-events-none">R$</span>
          <input
            className={`${fieldCls} pl-9`}
            value={base}
            onChange={e => onChangeBase(e.target.value.replace(/[^0-9.,]/g, ''))}
            placeholder="3.200,00"
          />
        </div>
        <div className={lineTopCls} />
        <div className={lineBottomCls} />
        <div className={connectorCls}>
          <Plus size={13} strokeWidth={2.8} />
        </div>
      </div>

      <div className="relative mb-10">
        <label className={labelCls}>Complementar</label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-on-surface/35 font-mono pointer-events-none">R$</span>
          <input
            className={`${fieldCls} pl-9 ${complementarNum > 0 ? 'pr-[76px]' : ''}`}
            value={complementar}
            onChange={e => onChangeComplementar(e.target.value.replace(/[^0-9.,]/g, ''))}
            placeholder="0,00"
          />
          {complementarNum > 0 && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-extrabold text-amber-700 dark:text-amber-300 bg-amber-700/10 dark:bg-amber-300/15 px-1.5 py-1 rounded-md font-mono whitespace-nowrap pointer-events-none">
              {pct}% da base
            </span>
          )}
        </div>
        <div className={lineTopCls} />
        <div className={lineBottomCls} />
        <div className={connectorCls}>
          <Equal size={13} strokeWidth={2.5} />
        </div>
      </div>

      <div className="mb-6">
        <label className={labelCls}>Salário Total</label>
        <div className="w-full bg-surface border border-on-surface/[0.10] rounded-xl px-3.5 py-2.5 font-mono text-[14px] font-extrabold text-emerald-600 dark:text-emerald-400">
          {fmtSalario(total)}
        </div>
      </div>

      <div className="flex gap-2.5">
        <button onClick={onCancel} className="flex-1 bg-on-surface/[0.06] border border-on-surface/[0.12] text-on-surface/55 font-extrabold text-[12.5px] uppercase tracking-wide py-3.5 rounded-[13px]">
          Cancelar
        </button>
        <button onClick={onConfirm} className="flex-[1.4] bg-primary text-white font-extrabold text-[12.5px] uppercase tracking-wide py-3.5 rounded-[13px] shadow-lg shadow-primary/25">
          Confirmar
        </button>
      </div>
    </>
  );

  // ── Desktop: padrão quadrado do site ──
  const sqLabelCls = 'block text-[9px] font-black uppercase tracking-[0.1em] text-[#1A1A0E]/[0.58] dark:text-[#F2F0E3]/55 pl-px mb-1';
  const sqInputCls = 'w-full min-w-0 h-[34px] pl-9 pr-2.5 bg-white dark:bg-[#1E1E18] font-mono text-[13px] font-medium text-on-surface border border-[#E0D8BF] dark:border-white/[0.10] outline-none caret-[#D81E1E] hover:border-[#CFC4A2] dark:hover:border-white/[0.20] focus:!border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] placeholder:text-on-surface/25 transition-[border-color,box-shadow]';
  const sqOpCls = 'self-end w-6 h-5 flex items-center justify-center text-on-surface/40';

  const modalBody = (
    <>
      <div className="h-12 pl-3.5 pr-3 flex items-center gap-[11px] bg-[#FBF35E] dark:bg-[#252520] border-b border-[#D9CF45] dark:border-white/[0.08] shrink-0">
        <div className="w-[30px] h-[30px] flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
          <Pencil size={15} strokeWidth={2.3} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="truncate text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">Editar Salário</h4>
          <p className="truncate text-[10.5px] font-bold text-[#1A1A0E]/50 dark:text-[#F2F0E3]/40">{employeeName} · {periodoLabel}</p>
        </div>
        <button
          onClick={onCancel}
          title="Fechar"
          className="w-[30px] h-[30px] flex items-center justify-center shrink-0 border border-black/[0.14] dark:border-white/[0.10] text-black/50 dark:text-white/40 hover:bg-[#D81E1E]/[0.09] hover:text-[#D81E1E] hover:border-[#D81E1E]/25 active:scale-[0.93] transition-all duration-[130ms]"
        >
          <X size={15} strokeWidth={2.6} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 flex flex-col gap-2.5">
        {/* Data de pagamento */}
        <div className="p-2.5 border border-[#D81E1E]/25 bg-[#D81E1E]/[0.05]">
          <div className="flex items-center gap-1.5 mb-2 text-[9px] font-black uppercase tracking-[0.1em] text-[#B91818] dark:text-red-400">
            <CalendarDays size={12} strokeWidth={2.4} className="shrink-0" />
            Data de pagamento
          </div>
          <div className="flex items-center gap-2.5">
            <input
              className="w-14 h-[38px] shrink-0 bg-white dark:bg-[#1E1E18] border border-[#D81E1E]/40 font-mono text-[16px] text-on-surface text-center outline-none caret-[#D81E1E] focus:border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] transition-[border-color,box-shadow]"
              value={diasUteis}
              onChange={e => onChangeDiasUteis(e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="5"
            />
            <span className="text-[11.5px] font-bold text-on-surface/70 leading-snug">
              º dia útil de cada mês<br />
              <span className="font-semibold text-on-surface/40">seg–sáb, exceto feriados</span>
            </span>
          </div>
          {preview.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {preview.map(p => (
                <span key={p} className="px-1.5 py-0.5 border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] font-mono text-[10px] text-on-surface">
                  {p}
                </span>
              ))}
              {mesFim - mesInicio + 1 > previewMeses.length && (
                <span className="px-1 py-0.5 font-mono text-[10px] text-on-surface/40">…</span>
              )}
            </div>
          )}
          <p className="mt-2 text-[10px] font-semibold text-on-surface/40 leading-[1.45]">
            Gera 1 parcela por mês no Controle Financeiro, travada para edição — só pode ser marcada como paga.
          </p>
        </div>

        {/* Composição */}
        <div className="bg-[#F1EAD3] dark:bg-[#181814] border border-[#E0D8BF] dark:border-white/[0.10]">
          <div className="h-7 flex items-center gap-2 px-2.5 bg-[#FFEC4D] border-b-[1.5px] border-[#8F7E10]">
            <Wallet size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[rgba(26,26,10,0.55)]">Composição do salário</span>
          </div>
          <div className="p-2.5 flex flex-col gap-1">
            <div>
              <label className={sqLabelCls}>Salário base</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[12px] text-on-surface/40 pointer-events-none">R$</span>
                <input className={sqInputCls} value={base} onChange={e => onChangeBase(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="3.200,00" />
              </div>
            </div>
            <span className={sqOpCls}><Plus size={13} strokeWidth={2.8} /></span>
            <div>
              <label className={sqLabelCls}>Complementar</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[12px] text-on-surface/40 pointer-events-none">R$</span>
                <input className={cn(sqInputCls, complementarNum > 0 && 'pr-[86px]')} value={complementar} onChange={e => onChangeComplementar(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0,00" />
                {complementarNum > 0 && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 px-1 py-px font-mono text-[9.5px] bg-amber-700/10 dark:bg-amber-300/15 text-amber-800 dark:text-amber-300 whitespace-nowrap pointer-events-none">
                    {pct}% da base
                  </span>
                )}
              </div>
            </div>
            <span className={sqOpCls}><Equal size={13} strokeWidth={2.6} /></span>
            <div>
              <label className={sqLabelCls}>Salário total</label>
              <div className="h-[34px] px-2.5 flex items-center bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10] font-mono text-[14px] text-[#0A7A55] dark:text-[#34D399]">
                {fmtSalario(total)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3.5 py-2.5 bg-[#EFE7CD] dark:bg-[#181814] border-t border-[#DDD2B0] dark:border-white/[0.08] flex items-center gap-2 shrink-0">
        <button
          onClick={onCancel}
          className="ml-auto h-9 px-[18px] border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-[12px] font-extrabold uppercase tracking-[0.04em] text-on-surface hover:bg-on-surface/[0.05] active:scale-[0.97] transition-all"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          className="h-9 px-[18px] flex items-center justify-center gap-2 bg-[#D81E1E] hover:bg-[#B91818] text-white text-[12px] font-extrabold uppercase tracking-[0.04em] active:scale-[0.97] transition-all"
        >
          Confirmar
        </button>
      </div>
    </>
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="salary-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/55 z-[70]" onClick={onCancel}
          />
          {variant === 'modal' ? (
            <motion.div
              key="salary-modal"
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] w-[380px] max-h-[88vh] flex flex-col overflow-hidden bg-[#FDFAF0] dark:bg-[#1E1E18] border border-black/[0.12] dark:border-white/[0.08] shadow-2xl"
            >
              {modalBody}
            </motion.div>
          ) : (
            <motion.div
              key="salary-sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-x-0 bottom-0 z-[71] bg-surface-container rounded-t-[26px] shadow-2xl overflow-y-auto p-5"
              style={{ maxHeight: '90svh' }}
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

'use client';

import { motion, AnimatePresence } from 'motion/react';
import { X, Pencil, Plus, Equal } from 'lucide-react';
import { fmtSalario, parseMoneyInput } from '@/lib/hrEmployees';

interface SalaryEditModalProps {
  open: boolean;
  employeeName: string;
  base: string;
  complementar: string;
  onChangeBase: (v: string) => void;
  onChangeComplementar: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  variant?: 'modal' | 'sheet';
}

export function SalaryEditModal({
  open, employeeName, base, complementar, onChangeBase, onChangeComplementar, onCancel, onConfirm, variant = 'modal',
}: SalaryEditModalProps) {
  const baseNum = parseMoneyInput(base);
  const complementarNum = parseMoneyInput(complementar);
  const total = baseNum + complementarNum;
  const pct = baseNum > 0 ? Math.round((complementarNum / baseNum) * 100) : 0;

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
          <div className="text-[10.5px] font-semibold text-on-surface/40 truncate">{employeeName}</div>
        </div>
        <button onClick={onCancel} className="w-[26px] h-[26px] rounded-[9px] bg-on-surface/[0.06] flex items-center justify-center text-on-surface/40 flex-shrink-0">
          <X size={12} strokeWidth={2.5} />
        </button>
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
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] w-[360px] max-h-[88vh] overflow-y-auto bg-surface-container border border-on-surface/[0.08] rounded-[22px] p-6 shadow-2xl"
            >
              {body}
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

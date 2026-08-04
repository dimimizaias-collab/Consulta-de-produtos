'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

// Converte data ISO (yyyy-mm-dd) para dd/mm/yyyy.
export function fmtDateBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export interface ReceivedDateFieldProps {
  /** Data de recebimento, no formato ISO (yyyy-mm-dd). */
  receivedDate: string;
  /** Chamado ao salvar uma nova data de recebimento (só quando editável). */
  onChange?: (value: string) => void;
  /** Label pronto (ex: "04/08/2026 14:30:00") da data e horário de registro da nota. */
  registeredLabel: string;
  /** Quando false, o campo só exibe as informações — sem opção de editar a data de recebimento. */
  editable?: boolean;
  className?: string;
}

/**
 * Campo compacto de "data de recebimento" — a única data exibida nas tabelas e
 * cabeçalhos de nota. Ao clicar, abre uma janela mostrando a data de recebimento
 * (editável) e a data/horário de registro da nota (somente leitura), para não
 * poluir a UI principal com as duas informações ao mesmo tempo.
 */
export function ReceivedDateField({
  receivedDate, onChange, registeredLabel, editable = true, className,
}: ReceivedDateFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(receivedDate);

  const openModal = () => { setDraft(receivedDate); setOpen(true); };
  const save = () => { onChange?.(draft); setOpen(false); };

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); openModal(); }}
        className={className ?? cn(
          'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors',
          'bg-black/[0.05] dark:bg-white/[0.06] border border-black/[0.14] dark:border-white/[0.10]',
          'text-[#1A1A0E] dark:text-[#F2F0E3] hover:bg-black/[0.08] dark:hover:bg-white/[0.10]',
        )}
      >
        <Calendar size={12} className="opacity-50 shrink-0" />
        {receivedDate ? fmtDateBR(receivedDate) : 'Sem data de recebimento'}
      </button>

      {typeof window !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setOpen(false)} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 20 }} transition={{ duration: 0.15 }}
                className="relative bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-3xl shadow-2xl w-full max-w-sm p-6 border border-black/[0.08] dark:border-white/[0.07]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-black text-[#1A1A0E] dark:text-[#F2F0E3]">Data da nota</h3>
                  <button
                    onClick={() => setOpen(false)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[#1A1A0E]/40 dark:text-white/35 hover:bg-black/[0.06] dark:hover:bg-white/[0.06] transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase block mb-1.5 text-[#1A1A0E]/40 dark:text-white/30">
                      Data de recebimento
                    </label>
                    {editable ? (
                      <input
                        type="date"
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        autoFocus
                        className="w-full rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-400/20 bg-black/[0.05] dark:bg-white/[0.06] border border-black/[0.14] dark:border-white/[0.10] text-[#1A1A0E] dark:text-[#F2F0E3]"
                      />
                    ) : (
                      <p className="text-sm font-bold px-3 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] text-[#1A1A0E] dark:text-[#F2F0E3]">
                        {receivedDate ? fmtDateBR(receivedDate) : '—'}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase mb-1.5 text-[#1A1A0E]/40 dark:text-white/30 flex items-center gap-1">
                      <Clock size={10} />
                      Data e horário de registro
                    </label>
                    <p className="text-sm font-bold px-3 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] text-[#1A1A0E]/60 dark:text-white/50">
                      {registeredLabel || '—'}
                    </p>
                  </div>
                </div>

                {editable && (
                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={() => setOpen(false)}
                      className="flex-1 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest border border-black/[0.10] dark:border-white/[0.10] text-[#1A1A0E]/60 dark:text-white/50 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={save}
                      className="flex-1 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest bg-slate-900 hover:bg-primary text-white transition-all"
                    >
                      Salvar
                    </button>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

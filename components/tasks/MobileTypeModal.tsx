'use client';

import { X, ClipboardList, CheckSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MobileTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConferencia: () => void;
  onSelectTarefas: () => void;
}

export function MobileTypeModal({
  isOpen,
  onClose,
  onSelectConferencia,
  onSelectTarefas,
}: MobileTypeModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="mobile-type-modal"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          className="fixed inset-0 z-[199] flex flex-col bg-[#FDFAF0] dark:bg-[#1E1E18]"
        >
          {/* ── Header ── */}
          <div className="shrink-0 bg-[#FFE500] dark:bg-[#252520] border-b border-[#D4C000] dark:border-white/[0.07] px-4 py-3 flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-black/[0.09] dark:bg-white/[0.08] text-[#1A1A0E] dark:text-white/70 active:bg-black/20 transition-colors"
            >
              <X size={18} />
            </button>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] leading-none mb-0.5 text-[#1A1A0E]/40 dark:text-white/30">
                Cadastro Mobile
              </p>
              <p className="text-base font-black leading-none text-[#1A1A0E] dark:text-[#F2F0E3]">
                Selecionar Tipo
              </p>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/30 mb-2">
              Escolha o tipo de operação
            </p>

            {/* Card: Conferência de mercadoria */}
            <button
              onClick={onSelectConferencia}
              className="w-full max-w-sm bg-white dark:bg-[#252520] border-2 border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl p-5 flex items-center gap-4 text-left active:scale-95 transition-all hover:border-[#D81E1E]/40 hover:bg-[#D81E1E]/[0.02] group"
            >
              <div className="w-12 h-12 rounded-xl bg-black/[0.05] dark:bg-white/[0.06] flex items-center justify-center shrink-0 group-hover:bg-[#D81E1E]/10 transition-colors">
                <ClipboardList size={24} className="text-on-surface/50 group-hover:text-[#D81E1E] transition-colors" />
              </div>
              <div>
                <p className="text-sm font-black text-on-surface leading-tight mb-0.5 group-hover:text-[#D81E1E] transition-colors">
                  Conferência de mercadoria
                </p>
                <p className="text-[11px] text-on-surface/40 font-medium">
                  Cadastro e conferência de produtos
                </p>
              </div>
            </button>

            {/* Card: Tarefas */}
            <button
              onClick={onSelectTarefas}
              className="w-full max-w-sm bg-white dark:bg-[#252520] border-2 border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl p-5 flex items-center gap-4 text-left active:scale-95 transition-all hover:border-[#D81E1E]/40 hover:bg-[#D81E1E]/[0.02] group"
            >
              <div className="w-12 h-12 rounded-xl bg-black/[0.05] dark:bg-white/[0.06] flex items-center justify-center shrink-0 group-hover:bg-[#D81E1E]/10 transition-colors">
                <CheckSquare size={24} className="text-on-surface/50 group-hover:text-[#D81E1E] transition-colors" />
              </div>
              <div>
                <p className="text-sm font-black text-on-surface leading-tight mb-0.5 group-hover:text-[#D81E1E] transition-colors">
                  Tarefas
                </p>
                <p className="text-[11px] text-on-surface/40 font-medium">
                  Organização interna e lembretes
                </p>
              </div>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

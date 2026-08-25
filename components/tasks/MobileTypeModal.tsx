'use client';

import { X, ClipboardList, CheckSquare, LayoutGrid } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useViewMode } from '@/lib/view-mode';

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
  const { isMobileView } = useViewMode();

  if (!isOpen) return null;

  const cards = [
    {
      key: 'conferencia',
      icon: ClipboardList,
      title: 'Conferência de mercadoria',
      desc: 'Cadastro e conferência de produtos',
      onClick: onSelectConferencia,
    },
    {
      key: 'tarefas',
      icon: CheckSquare,
      title: 'Tarefas',
      desc: 'Organização interna e lembretes',
      onClick: onSelectTarefas,
    },
  ];

  // ══════════════════════════════════════════════════════════════════════
  // DESKTOP — diálogo centralizado, mesmo padrão do modal "Editar Produto"
  // ══════════════════════════════════════════════════════════════════════
  if (!isMobileView) {
    return (
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[199] flex items-center justify-center p-4">
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              key="dialog"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="relative bg-[#F0E7CC] dark:bg-[#1E1E18] rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-black/10 dark:border-white/[0.08]"
            >
              {/* Header */}
              <div className="px-6 py-5 flex items-center gap-3.5 bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800]">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                  <LayoutGrid size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#1A1A0E]/55">
                    Cadastro Mobile
                  </p>
                  <h2 className="text-lg font-manrope font-extrabold text-[#1A1A0E] leading-tight">
                    Selecionar Tipo
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] border border-black/10 text-black/50 hover:bg-black/[0.14] transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6">
                <p className="text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-3.5">
                  Escolha o tipo de operação
                </p>
                <div className="grid grid-cols-2 gap-3.5">
                  {cards.map(c => (
                    <button
                      key={c.key}
                      onClick={c.onClick}
                      className="group flex flex-col items-start gap-3 p-5 rounded-2xl bg-surface border border-black/[0.08] dark:border-white/[0.07] hover:border-primary/40 hover:bg-primary/[0.03] transition-colors text-left"
                    >
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-black/[0.05] dark:bg-white/[0.06] text-on-surface/50 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        <c.icon size={22} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-on-surface leading-tight group-hover:text-primary transition-colors">
                          {c.title}
                        </p>
                        <p className="text-xs text-on-surface/45 font-medium mt-0.5">
                          {c.desc}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // MOBILE — tela cheia
  // ══════════════════════════════════════════════════════════════════════
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

            {cards.map(c => (
              <button
                key={c.key}
                onClick={c.onClick}
                className="w-full max-w-sm bg-white dark:bg-[#252520] border-2 border-[#E0D8BF] dark:border-white/[0.08] rounded-2xl p-5 flex items-center gap-4 text-left active:scale-95 transition-all hover:border-[#D81E1E]/40 hover:bg-[#D81E1E]/[0.02] group"
              >
                <div className="w-12 h-12 rounded-xl bg-black/[0.05] dark:bg-white/[0.06] flex items-center justify-center shrink-0 group-hover:bg-[#D81E1E]/10 transition-colors">
                  <c.icon size={24} className="text-on-surface/50 group-hover:text-[#D81E1E] transition-colors" />
                </div>
                <div>
                  <p className="text-sm font-black text-on-surface leading-tight mb-0.5 group-hover:text-[#D81E1E] transition-colors">
                    {c.title}
                  </p>
                  <p className="text-[11px] text-on-surface/40 font-medium">
                    {c.desc}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

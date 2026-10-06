'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, User } from 'lucide-react';
import { type Employee, initials } from '@/lib/hrEmployees';
import { cn } from '@/lib/utils';

interface VincularExistenteModalProps {
  open: boolean;
  ano: number;
  employees: Employee[];
  onClose: () => void;
  onSelect: (employee: Employee) => void;
  variant?: 'modal' | 'sheet';
}

export function VincularExistenteModal({ open, ano, employees, onClose, onSelect, variant = 'modal' }: VincularExistenteModalProps) {
  const [query, setQuery] = useState('');
  const filtered = employees.filter(e => e.nome.toLowerCase().includes(query.toLowerCase()));

  const body = (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-extrabold text-on-surface">Vincular Existente</div>
          <div className="text-[10.5px] font-semibold text-on-surface/40">Adicionar período de {ano} para um colaborador já cadastrado</div>
        </div>
        <button onClick={onClose} className="w-[28px] h-[28px] rounded-[9px] bg-on-surface/[0.06] flex items-center justify-center text-on-surface/45 flex-shrink-0">
          <X size={13} strokeWidth={2.5} />
        </button>
      </div>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface/35" />
        <input
          value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar colaborador..."
          className="w-full bg-surface border border-on-surface/[0.10] rounded-xl pl-9 pr-3.5 py-2.5 text-[13px] text-on-surface outline-none focus:border-primary/50"
        />
      </div>

      <div className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-center text-[12.5px] text-on-surface/35 py-8">Nenhum colaborador encontrado.</p>
        ) : (
          filtered.map(emp => (
            <button
              key={emp.id} onClick={() => onSelect(emp)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-primary/[0.06] transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-surface overflow-hidden flex items-center justify-center text-on-surface/40 text-xs font-black flex-shrink-0">
                {emp.foto_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={emp.foto_url} alt="" className="w-full h-full object-cover" />
                ) : emp.nome ? initials(emp.nome) : <User size={16} />}
              </div>
              <span className="text-[13px] font-bold text-on-surface truncate">{emp.nome}</span>
            </button>
          ))
        )}
      </div>
    </>
  );

  // ── Desktop: padrão quadrado do site ──
  const modalBody = (
    <>
      <div className="h-12 pl-3.5 pr-3 flex items-center gap-[11px] bg-[#FBF35E] dark:bg-[#252520] border-b border-[#D9CF45] dark:border-white/[0.08] shrink-0">
        <div className="w-[30px] h-[30px] flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
          <Search size={15} strokeWidth={2.3} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="truncate text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">Vincular Existente</h4>
          <p className="truncate text-[10.5px] font-bold text-[#1A1A0E]/50 dark:text-[#F2F0E3]/40">Adicionar período de {ano} a um colaborador já cadastrado</p>
        </div>
        <button
          onClick={onClose}
          title="Fechar"
          className="w-[30px] h-[30px] flex items-center justify-center shrink-0 border border-black/[0.14] dark:border-white/[0.10] text-black/50 dark:text-white/40 hover:bg-[#D81E1E]/[0.09] hover:text-[#D81E1E] hover:border-[#D81E1E]/25 active:scale-[0.93] transition-all duration-[130ms]"
        >
          <X size={15} strokeWidth={2.6} />
        </button>
      </div>

      <div className="flex-1 min-h-0 px-3.5 py-3 flex flex-col gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface/40 pointer-events-none" />
          <input
            value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar colaborador..." autoFocus
            className="w-full h-[34px] pl-8 pr-2.5 bg-white dark:bg-[#1E1E18] text-[13px] font-semibold text-on-surface border border-[#E0D8BF] dark:border-white/[0.10] outline-none caret-[#D81E1E] hover:border-[#CFC4A2] dark:hover:border-white/[0.20] focus:!border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] placeholder:text-on-surface/25 placeholder:font-medium transition-[border-color,box-shadow]"
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center border border-dashed border-[#E0D8BF] dark:border-white/[0.12] text-[11.5px] font-bold text-on-surface/40">
              Nenhum colaborador encontrado.
            </p>
          ) : (
            filtered.map((emp, idx) => (
              <button
                key={emp.id} onClick={() => onSelect(emp)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left bg-white dark:bg-[#1E1E18] border border-[#B5AA86] dark:border-white/[0.10] hover:bg-[#FFF8D0] dark:hover:bg-white/[0.04] transition-colors',
                  idx > 0 && 'border-t-0',
                )}
              >
                <span className="w-[30px] h-[30px] shrink-0 overflow-hidden flex items-center justify-center bg-[#F1EAD3] dark:bg-[#181814] border border-[#E0D8BF] dark:border-white/[0.10] text-[11px] font-black text-on-surface/40">
                  {emp.foto_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={emp.foto_url} alt="" className="w-full h-full object-cover" />
                  ) : emp.nome ? initials(emp.nome) : <User size={14} />}
                </span>
                <span className="text-[12.5px] font-extrabold text-on-surface truncate">{emp.nome}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="px-3.5 py-2.5 bg-[#EFE7CD] dark:bg-[#181814] border-t border-[#DDD2B0] dark:border-white/[0.08] flex items-center shrink-0">
        <button
          onClick={onClose}
          className="ml-auto h-9 px-[18px] border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-[12px] font-extrabold uppercase tracking-[0.04em] text-on-surface hover:bg-on-surface/[0.05] active:scale-[0.97] transition-all"
        >
          Cancelar
        </button>
      </div>
    </>
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="vinc-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/55 z-[70]" onClick={onClose}
          />
          {variant === 'modal' ? (
            <motion.div
              key="vinc-modal"
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] w-[400px] max-h-[88vh] flex flex-col overflow-hidden bg-[#FDFAF0] dark:bg-[#1E1E18] border border-black/[0.12] dark:border-white/[0.08] shadow-2xl"
            >
              {modalBody}
            </motion.div>
          ) : (
            <motion.div
              key="vinc-sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-x-0 bottom-0 z-[71] bg-surface-container rounded-t-[26px] shadow-2xl overflow-y-auto p-5"
              style={{ maxHeight: '80svh' }}
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

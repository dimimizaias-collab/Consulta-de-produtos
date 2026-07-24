'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, User } from 'lucide-react';
import { type Employee, initials } from '@/lib/hrEmployees';

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
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] w-[380px] bg-surface-container border border-on-surface/[0.08] rounded-[22px] p-6 shadow-2xl"
            >
              {body}
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

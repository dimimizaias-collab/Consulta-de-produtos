'use client';

import { useState } from 'react';
import { Plus, UserPlus, UserSearch } from 'lucide-react';

interface YearAddMenuProps {
  onNovo: () => void;
  onVincular: () => void;
  size?: 'full' | 'compact';
}

export function YearAddMenu({ onNovo, onVincular, size = 'full' }: YearAddMenuProps) {
  const [open, setOpen] = useState(false);
  if (size === 'full') {
    return (
      <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => setOpen(v => !v)}
          className="h-7 px-3 flex items-center gap-1.5 bg-[#D81E1E] hover:bg-[#B91818] text-white text-[10.5px] font-extrabold uppercase tracking-[0.05em] active:scale-[0.97] transition-all"
        >
          <Plus size={13} strokeWidth={2.8} />
          Adicionar
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-[calc(100%+4px)] w-[220px] z-20 bg-white dark:bg-[#2E2E28] border border-[#E0D8BF] dark:border-white/[0.10] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.3)] text-on-surface">
              <button
                onClick={() => { setOpen(false); onNovo(); }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[12.5px] font-extrabold hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.08] transition-colors"
              >
                <span className="w-[26px] h-[26px] flex items-center justify-center shrink-0 bg-[#D81E1E]/10 text-[#D81E1E]">
                  <UserPlus size={13} />
                </span>
                Novo colaborador
              </button>
              <button
                onClick={() => { setOpen(false); onVincular(); }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[12.5px] font-extrabold border-t border-[#E0D8BF] dark:border-white/[0.10] hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.08] transition-colors"
              >
                <span className="w-[26px] h-[26px] flex items-center justify-center shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  <UserSearch size={13} />
                </span>
                Vincular existente
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-[30px] h-[30px] rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/25 active:scale-90 transition-transform`}
      >
        <Plus size={14} strokeWidth={2.8} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+8px)] w-[220px] bg-surface-container border border-on-surface/[0.08] rounded-2xl shadow-2xl p-1.5 z-20">
            <button
              onClick={() => { setOpen(false); onNovo(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12.5px] font-extrabold text-on-surface hover:bg-primary/[0.06] transition-colors"
            >
              <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <UserPlus size={13} />
              </span>
              Novo Colaborador
            </button>
            <button
              onClick={() => { setOpen(false); onVincular(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12.5px] font-extrabold text-on-surface hover:bg-amber-500/[0.08] transition-colors"
            >
              <span className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                <UserSearch size={13} />
              </span>
              Vincular Existente
            </button>
          </div>
        </>
      )}
    </div>
  );
}

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
  const btnSize = size === 'full' ? 'w-[38px] h-[38px]' : 'w-[30px] h-[30px]';

  return (
    <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`${btnSize} rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/25 active:scale-90 transition-transform`}
      >
        <Plus size={size === 'full' ? 17 : 14} strokeWidth={2.8} />
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

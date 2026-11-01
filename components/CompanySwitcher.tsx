'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Layers, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCompanyScope, type CompanyScopeValue } from '@/lib/company-scope';

// Lista suspensa do cabeçalho (desktop, só admin) — fica à esquerda do número da versão.
// Com uma empresa selecionada a moldura fica vermelha, pra não esquecer que a visão está filtrada.
export function CompanySwitcher() {
  const { scope, company, companies, isAdmin, setScope } = useCompanyScope();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (!isAdmin) return null;

  const filtered = scope !== 'all';
  const label = scope === 'all' ? 'Todas as empresas' : scope === 'pessoal' ? 'Pessoal' : company?.nome_fantasia ?? '—';

  const choose = (next: CompanyScopeValue) => {
    setScope(next);
    setOpen(false);
  };

  const option = (value: CompanyScopeValue, text: string, Icon: typeof Building2) => {
    const selected = scope === value;
    return (
      <button
        key={value}
        role="option"
        aria-selected={selected}
        onClick={() => choose(value)}
        className={cn(
          'flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left text-[12px] font-bold text-on-surface',
          'hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.08] transition-colors',
          selected && 'bg-[#FFF8D0]/70 dark:bg-[#FFE500]/[0.05]'
        )}
      >
        <Icon size={14} className="opacity-55 shrink-0" />
        <span className="truncate flex-1">{text}</span>
        {selected && <Check size={14} className="text-[#D81E1E] shrink-0" />}
      </button>
    );
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Ver os dados de uma empresa"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'h-[30px] max-w-[220px] flex items-center gap-1.5 pl-2 pr-1.5 border text-[11.5px] font-bold',
          'transition-[background-color,border-color] duration-[130ms]',
          filtered
            ? 'border-[#D81E1E] bg-[#D81E1E]/20 dark:bg-[#D81E1E]/[0.16] text-[#F2F0E3]'
            : 'border-[#F2F0E3]/[0.16] dark:border-[#F2F0E3]/[0.14] text-[#F2F0E3]/70 hover:bg-[#F2F0E3]/[0.08]'
        )}
      >
        {scope === 'pessoal'
          ? <User size={13} className="shrink-0 opacity-70" />
          : scope === 'all'
            ? <Layers size={13} className="shrink-0 opacity-70" />
            : <Building2 size={13} className="shrink-0 opacity-70" />}
        <span className="truncate">{label}</span>
        <ChevronDown size={13} className={cn('shrink-0 opacity-60 transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-[calc(100%+6px)] right-0 w-[240px] origin-top-right bg-white dark:bg-[#2E2E28] border border-[#E0D8BF] dark:border-white/[0.10] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.3)] animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-3.5 pt-2.5 pb-1.5 text-[9px] font-extrabold uppercase tracking-[0.1em] text-on-surface/40">
            Visualizar dados de
          </div>
          {option('all', 'Todas as empresas', Layers)}
          <div className="border-t border-[#E0D8BF] dark:border-white/[0.10]">
            {companies.map(c => option(c.id, c.nome_fantasia, Building2))}
          </div>
          <div className="border-t border-[#E0D8BF] dark:border-white/[0.10]">
            {option('pessoal', 'Pessoal', User)}
          </div>
        </div>
      )}
    </div>
  );
}

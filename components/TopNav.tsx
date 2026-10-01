'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Smartphone, Monitor, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNavIcon } from './Sidebar';
import { useViewMode } from '@/lib/view-mode';
import { supabase } from '@/lib/supabase';
import type { AppNotification } from './NotificationsPage';

interface TopNavProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeTab?: string;
  notifications?: AppNotification[];
  onMarkAllRead?: () => void;
  onGoToNote?: (noteId: string) => void;
  onGoToNotificationsPage?: () => void;
  hideViewToggle?: boolean;
  /** Título da página ativa, exibido no cabeçalho (desktop). */
  title?: string;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TopNav({ hideViewToggle, title, sidebarCollapsed, onToggleSidebar }: TopNavProps) {
  const { isMobileView, toggleMode } = useViewMode();
  const [open, setOpen] = useState(false);
  const [userName, setUserName] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: usuarioRow } = await supabase
          .from('usuarios')
          .select('role, employee_id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (usuarioRow?.role) setUserRole(usuarioRow.role);
        if (usuarioRow?.employee_id) {
          const { data: employee } = await supabase
            .from('hr_employees')
            .select('nome')
            .eq('id', usuarioRow.employee_id)
            .maybeSingle();
          if (employee?.nome) setUserName(employee.nome);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (hideViewToggle) return null;

  const initials = getInitials(userName || '?');

  const handleSignOut = async () => {
    setOpen(false);
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const handleToggleMode = () => {
    setOpen(false);
    toggleMode();
  };

  // ── Desktop: cabeçalho enxuto colado no topo, de borda a borda — logo (oculta/mostra o menu
  // lateral) no canto esquerdo, título da página e o perfil quadrado no canto direito.
  if (!isMobileView) {
    const PageIcon = title ? getNavIcon(title) : null;
    return (
      <header className="fixed top-0 inset-x-0 z-50 h-11 flex items-stretch bg-[#FFE500] dark:bg-[#252520] border-b border-[#D4C000] dark:border-white/[0.08]">
        <button
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Mostrar menu' : 'Ocultar menu'}
          className="w-16 shrink-0 flex items-center justify-center border-r border-[#D4C000] dark:border-white/[0.08] hover:bg-black/[0.07] dark:hover:bg-white/[0.06] transition-colors duration-[130ms] outline-none"
        >
          <span className="relative w-8 h-8 bg-white border border-black/[0.12] flex items-center justify-center">
            <Image src="/brand/logo.png" alt="Universo do R$1,99" fill className="object-contain p-[3px]" unoptimized priority />
          </span>
        </button>

        <div className="flex items-center gap-[9px] px-4 min-w-0">
          {PageIcon && (
            <span className="w-7 h-7 shrink-0 flex items-center justify-center bg-black/[0.09] dark:bg-[#D81E1E]/[0.13] text-[#1A1A0E] dark:text-[#D81E1E]">
              <PageIcon size={15} strokeWidth={2.2} />
            </span>
          )}
          <h1 className="text-[15px] font-black tracking-[-0.01em] text-[#1A1A0E] dark:text-[#F2F0E3] whitespace-nowrap truncate">{title}</h1>
        </div>

        <div ref={wrapRef} className="relative ml-auto flex items-center px-2.5 shrink-0">
          <button
            onClick={() => setOpen(o => !o)}
            title="Menu do usuário"
            className={cn(
              'w-[30px] h-[30px] flex items-center justify-center border text-[11.5px] font-black',
              'border-black/[0.16] dark:border-white/[0.14] bg-black/[0.06] dark:bg-[#D81E1E]/[0.13] text-[#1A1A0E] dark:text-[#F2F0E3]',
              'hover:bg-black/[0.11] dark:hover:bg-[#D81E1E]/20 transition-[background-color,transform,box-shadow] duration-[130ms] active:scale-[0.94]',
              open && 'shadow-[inset_0_-3px_0_#D81E1E]'
            )}
          >
            {initials}
          </button>

          {open && (
            <div className="absolute top-[calc(100%+6px)] right-2.5 w-[228px] origin-top-right bg-white dark:bg-[#2E2E28] border border-[#E0D8BF] dark:border-white/[0.10] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.3)] animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-[#E0D8BF] dark:border-white/[0.10]">
                <div className="w-[30px] h-[30px] shrink-0 flex items-center justify-center bg-[#D81E1E]/10 text-[#D81E1E] text-[11px] font-black">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-black text-on-surface truncate">{userName || 'Usuário'}</div>
                  {userRole && (
                    <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-on-surface/40 mt-0.5">{userRole}</div>
                  )}
                </div>
              </div>
              <button
                onClick={handleToggleMode}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left text-[12px] font-bold text-on-surface hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.08] transition-colors"
              >
                <Smartphone size={14} className="opacity-55 shrink-0" />
                Mudar para modo Mobile
              </button>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left text-[12px] font-bold text-[#D81E1E] border-t border-[#E0D8BF] dark:border-white/[0.10] hover:bg-[#D81E1E]/[0.08] transition-colors"
              >
                <LogOut size={14} className="opacity-85 shrink-0" />
                Sair da conta
              </button>
            </div>
          )}
        </div>
      </header>
    );
  }

  return (
    <>
      {/* ── User menu — top-right (mobile) ── */}
      <div ref={wrapRef} className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setOpen(o => !o)}
          title="Menu do usuário"
          className={cn(
            'relative rounded-full flex items-center justify-center shrink-0',
            isMobileView ? 'w-8 h-8' : 'w-[42px] h-[42px]',
            'bg-surface/85 backdrop-blur-xl',
            'border border-on-surface/[0.08]',
            'shadow-[0_2px_16px_rgba(0,0,0,0.18)]',
            'text-primary font-extrabold tracking-wide',
            isMobileView ? 'text-[11px]' : 'text-[14px]',
            'bg-gradient-to-b from-primary/[0.10] to-primary/[0.03]',
            'transition-[box-shadow,transform] duration-150',
            'active:scale-[0.94]',
            open && 'shadow-[0_2px_20px_rgba(0,0,0,0.18),0_0_0_3px_rgba(216,30,30,0.14)]'
          )}
        >
          {initials}
        </button>

        {open && (
          <div
            className={cn(
              'absolute top-full right-0 mt-2.5 overflow-hidden origin-top-right',
              isMobileView ? 'w-[152px] rounded-[13px]' : 'w-[224px] rounded-[18px]',
              'bg-surface-container-lowest border border-on-surface/[0.08]',
              'shadow-[0_12px_40px_rgba(26,26,10,0.16),0_2px_8px_rgba(26,26,10,0.06)]',
              'dark:shadow-[0_12px_40px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.3)]',
              'animate-in fade-in zoom-in-95 duration-150'
            )}
          >
            <div className={cn(
              'flex items-center border-b border-on-surface/[0.06]',
              isMobileView ? 'gap-1.5 px-2.5 py-2' : 'gap-2.5 px-4 py-3.5'
            )}>
              <div className={cn(
                'rounded-full flex items-center justify-center shrink-0 font-extrabold text-primary',
                'bg-gradient-to-b from-primary/[0.12] to-primary/[0.04]',
                isMobileView ? 'w-[25px] h-[25px] text-[9.5px]' : 'w-8 h-8 text-[11.5px]'
              )}>
                {initials}
              </div>
              <div className="min-w-0">
                <div className={cn(
                  'font-extrabold text-on-surface truncate',
                  isMobileView ? 'text-[11px]' : 'text-[12.5px]'
                )}>
                  {userName || 'Usuário'}
                </div>
                {userRole && (
                  <div className={cn(
                    'font-bold uppercase tracking-wider text-on-surface/35 mt-0.5',
                    isMobileView ? 'text-[8.3px]' : 'text-[9.5px]'
                  )}>
                    {userRole}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleToggleMode}
              className={cn(
                'flex items-center w-full text-left font-bold text-on-surface',
                'hover:bg-on-surface/[0.045] transition-colors',
                isMobileView ? 'gap-1.5 px-2.5 py-2 text-[10.5px]' : 'gap-2.5 px-4 py-2.5 text-[12px]'
              )}
            >
              {isMobileView
                ? <Monitor size={13} className="opacity-55 shrink-0" />
                : <Smartphone size={14} className="opacity-55 shrink-0" />
              }
              {isMobileView ? 'Modo Desktop' : 'Mudar para modo Mobile'}
            </button>

            <div className="h-px bg-on-surface/[0.06] mx-0" />

            <button
              onClick={handleSignOut}
              className={cn(
                'flex items-center w-full text-left font-bold text-primary',
                'hover:bg-primary/[0.08] transition-colors',
                isMobileView ? 'gap-1.5 px-2.5 py-2 text-[10.5px]' : 'gap-2.5 px-4 py-2.5 text-[12px]'
              )}
            >
              <LogOut size={isMobileView ? 12 : 14} className="opacity-85 shrink-0" />
              Sair da conta
            </button>
          </div>
        )}
      </div>
    </>
  );
}

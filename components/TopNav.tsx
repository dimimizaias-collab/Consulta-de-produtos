'use client';

import { useState, useEffect, useRef } from 'react';
import { Smartphone, Monitor, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
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
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TopNav({ hideViewToggle }: TopNavProps) {
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

  return (
    <>
      {/* ── User menu — top-right ── */}
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

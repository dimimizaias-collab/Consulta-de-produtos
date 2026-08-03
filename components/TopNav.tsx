'use client';

import { Smartphone, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useViewMode } from '@/lib/view-mode';
import type { AppNotification } from './NotificationsPage';

interface TopNavProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeTab?: string;
  notifications?: AppNotification[];
  onMarkAllRead?: () => void;
  onGoToNote?: (noteId: string) => void;
  onGoToNotificationsPage?: () => void;
}

export function TopNav({}: TopNavProps) {
  const { isMobileView, toggleMode } = useViewMode();

  return (
    <>
      {/* ── View Mode Toggle — top-right ── */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <button
          onClick={toggleMode}
          title={isMobileView ? 'Mudar para modo Desktop' : 'Mudar para modo Mobile'}
          className={cn(
            'group relative w-[42px] h-[42px] rounded-full flex items-center justify-center',
            'bg-surface/85 backdrop-blur-xl',
            'border border-on-surface/[0.08]',
            'shadow-[0_2px_16px_rgba(0,0,0,0.18)]',
            'text-on-surface/50 hover:text-on-surface',
            'transition-[color,background] duration-150',
            'active:scale-[0.94]'
          )}
        >
          {isMobileView
            ? <Monitor size={16} />
            : <Smartphone size={16} />
          }
          {/* Tooltip */}
          <span className={cn(
            'pointer-events-none absolute right-0 top-full mt-2',
            'px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap',
            'text-on-surface bg-surface-container border border-on-surface/[0.08]',
            'shadow-[0_4px_14px_rgba(0,0,0,0.25)]',
            'opacity-0 translate-y-[-4px]',
            'group-hover:opacity-100 group-hover:translate-y-0',
            'transition-[opacity,transform] duration-[120ms] ease-out'
          )}>
            {isMobileView ? 'Modo Desktop' : 'Modo Mobile'}
          </span>
        </button>
      </div>
    </>
  );
}

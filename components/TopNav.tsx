'use client';

import { Search, Smartphone, Monitor } from 'lucide-react';
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

export function TopNav({
  searchQuery, onSearchChange, activeTab,
}: TopNavProps) {
  const { isMobileView, toggleMode } = useViewMode();

  const showSearch = !activeTab || activeTab === 'Inventory';

  return (
    <>
      {/* ── Search pill — top-left, only on Inventory ── */}
      <div
        className={cn(
          'fixed top-4 z-50 flex items-center gap-2.5',
          isMobileView ? 'left-4' : 'left-[84px]',
          'h-[42px] rounded-2xl px-4',
          'bg-surface/85 backdrop-blur-xl',
          'border border-on-surface/[0.08]',
          'shadow-[0_2px_16px_rgba(0,0,0,0.18),0_0_0_1px_rgba(255,255,255,0.03)_inset]',
          'transition-[opacity,transform] duration-200 ease-out',
          showSearch
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 -translate-y-2 pointer-events-none'
        )}
        style={{
          width: isMobileView
            ? 'calc(100vw - 1rem - 1rem - 42px - 0.5rem - 42px - 0.5rem - 46px - 0.5rem)'
            : 'min(600px, calc(100vw - 84px - 300px))'
        }}
      >
        <Search size={14} className="text-primary/70 shrink-0" strokeWidth={2.5} />
        <input
          className="flex-1 !bg-transparent border-none outline-none text-sm font-medium text-on-surface placeholder:text-on-surface/30"
          placeholder="EAN, SKU..."
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

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

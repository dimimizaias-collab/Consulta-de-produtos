'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, Bell, User, ArrowRight, Package, CheckCheck, Smartphone, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function TopNav({
  searchQuery, onSearchChange, activeTab,
  notifications = [], onMarkAllRead, onGoToNote, onGoToNotificationsPage
}: TopNavProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { isMobileView, toggleMode } = useViewMode();

  const unread = notifications.filter(n => !n.read).length;
  const recent = notifications.slice(0, 5);
  const showSearch = !activeTab || activeTab === 'Inventory';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

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
          className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-on-surface placeholder:text-on-surface/30"
          placeholder="EAN, SKU..."
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* ── Bell + Profile — top-right ── */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">

        {/* View Mode Toggle */}
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

        {/* Bell */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(v => !v)}
            className={cn(
              'relative w-[42px] h-[42px] rounded-full flex items-center justify-center',
              'bg-surface/85 backdrop-blur-xl',
              'border border-on-surface/[0.08]',
              'shadow-[0_2px_16px_rgba(0,0,0,0.18)]',
              'text-on-surface/50 hover:text-on-surface',
              'transition-[color,background] duration-150',
              'active:scale-[0.94]',
              unread > 0 && 'ring-2 ring-primary/50'
            )}
          >
            <Bell size={16} />
            {unread > 0 && (
              <span className="absolute top-[10px] right-[10px] w-2 h-2 bg-red-500 rounded-full border-2 border-background" />
            )}
          </button>

          {/* Notification dropdown */}
          <AnimatePresence>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -8 }}
                transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                className="absolute right-0 top-full mt-3 w-80 bg-surface-container-lowest rounded-[1.5rem] shadow-2xl ring-1 ring-on-surface/5 overflow-hidden z-[100] origin-top-right"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-on-surface/[0.04]">
                  <div className="flex items-center gap-2">
                    <Bell size={14} className="text-primary" />
                    <span className="text-xs font-black text-on-surface uppercase tracking-widest">Notificações</span>
                    {unread > 0 && (
                      <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{unread}</span>
                    )}
                  </div>
                  {unread > 0 && onMarkAllRead && (
                    <button
                      onClick={() => { onMarkAllRead(); }}
                      className="flex items-center gap-1 text-[10px] font-black text-primary hover:text-on-surface transition-colors"
                    >
                      <CheckCheck size={12} />
                      Ler todas
                    </button>
                  )}
                </div>

                {/* Lista */}
                <div className="max-h-72 overflow-y-auto divide-y divide-on-surface/[0.03]">
                  {recent.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-on-surface/20">
                      <Bell size={28} className="mb-2 opacity-20" />
                      <p className="text-[11px] font-black uppercase tracking-widest">Nenhuma notificação</p>
                    </div>
                  ) : (
                    recent.map(n => (
                      <div
                        key={n.id}
                        className={cn(
                          'flex items-start gap-3 px-5 py-3.5 transition-colors',
                          !n.read && 'bg-primary/[0.02]'
                        )}
                      >
                        <div className={cn(
                          'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                          n.read ? 'bg-on-surface/5 text-on-surface/30' : 'bg-primary/10 text-primary'
                        )}>
                          <Package size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <p className={cn(
                              'text-[11px] font-black leading-tight truncate',
                              n.read ? 'text-on-surface/50' : 'text-on-surface'
                            )}>
                              {n.title}
                            </p>
                            <span className="text-[9px] text-on-surface/25 font-bold shrink-0">{timeAgo(n.created_at)}</span>
                          </div>
                          {n.note_file_name && (
                            <p className="text-[10px] text-on-surface/30 font-medium mt-0.5 truncate">{n.note_file_name}</p>
                          )}
                          {n.note_id && onGoToNote && (
                            <button
                              onClick={() => { onGoToNote(n.note_id!); setShowDropdown(false); }}
                              className="mt-1.5 flex items-center gap-1 text-[10px] font-black text-primary hover:text-on-surface transition-colors"
                            >
                              Ir para nota <ArrowRight size={9} />
                            </button>
                          )}
                        </div>
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />}
                      </div>
                    ))
                  )}
                </div>

                {/* Rodapé */}
                {onGoToNotificationsPage && (
                  <button
                    onClick={() => { onGoToNotificationsPage(); setShowDropdown(false); }}
                    className="w-full px-5 py-3 text-[10px] font-black text-primary hover:bg-primary/5 transition-colors uppercase tracking-widest border-t border-on-surface/[0.04] flex items-center justify-center gap-2"
                  >
                    Ver todas as notificações <ArrowRight size={11} />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Profile pill */}
        <div className="flex items-center gap-2.5 bg-surface/85 backdrop-blur-xl border border-on-surface/[0.08] shadow-[0_2px_16px_rgba(0,0,0,0.18)] rounded-2xl pl-1.5 pr-4 h-[42px]">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white shadow-md shadow-primary/25 shrink-0">
            <User size={15} />
          </div>
          <div className="hidden md:block">
            <p className="text-[10px] font-extrabold text-on-surface uppercase tracking-tight leading-none">Universo Curator</p>
            <p className="text-[9px] text-primary font-bold mt-0.5">Admin Mode</p>
          </div>
        </div>
      </div>
    </>
  );
}

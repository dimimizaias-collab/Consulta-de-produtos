'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, Bell, User, ImageOff, ArrowRight, Package, CheckCheck } from 'lucide-react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import type { AppNotification } from './NotificationsPage';

interface TopNavProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
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

export function TopNav({ searchQuery, onSearchChange, notifications = [], onMarkAllRead, onGoToNote, onGoToNotificationsPage }: TopNavProps) {
  const [logoError, setLogoError] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter(n => !n.read).length;
  const recent = notifications.slice(0, 5);

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
    <nav className="flex items-center justify-between px-4 md:px-8 py-3 md:py-4 w-full sticky top-0 z-50 bg-background/80 backdrop-blur-xl transition-all duration-300">
      <div className="flex items-center gap-3 md:gap-12 flex-1">
        {!searchQuery && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="hidden md:flex items-center gap-4"
          >
            <div className="relative w-12 h-12 flex items-center justify-center">
              {!logoError ? (
                <Image
                  alt="Universo . do Logo"
                  src="https://lh3.googleusercontent.com/aida/ADBb0ugjk0-01HbCXpsC73FGgWJ6E5-oJfKrxgS6N0QFQhw2S8tNWaHhc1RMzhoNBx40dZ7AlkP5X3FjQJFu9JqoBYWtK1UDgWXwLHBCUO1g7RapTloLFLM60mjunmt1X3UsyPdaCIP9lUQoS5eXbDsupxyruogzBnPveLS0PNkJshQlrNnrpJCg_osPoEWKVo34cRA6r_bkjnfTw5-4xYPiDSgwWjuJW6nDh14ra_5WDj0Yq5zD4oh4V5ih9MnCFIZarnCbrDJxt4_f"
                  fill
                  className="object-contain grayscale brightness-50 contrast-125 opacity-20"
                  referrerPolicy="no-referrer"
                  unoptimized
                  onError={() => setLogoError(true)}
                />
              ) : (
                <ImageOff size={24} className="text-on-surface/10" />
              )}
            </div>
          </motion.div>
        )}

        <div className="max-w-3xl w-full">
          <div className="relative group">
            <div className="absolute inset-y-0 left-4 md:left-5 flex items-center pointer-events-none">
              <Search size={18} className="text-primary md:w-[22px] md:h-[22px]" />
            </div>
            <input
              className="w-full h-11 md:h-14 pl-11 md:pl-14 pr-4 md:pr-6 bg-surface-container-lowest border border-on-surface/5 rounded-xl md:rounded-2xl shadow-md md:shadow-xl shadow-on-surface/[0.02] focus:ring-2 md:focus:ring-4 focus:ring-primary/5 placeholder:text-on-surface/30 text-sm md:text-base font-medium transition-all outline-none"
              placeholder="EAN, SKU..."
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-6 ml-2 md:ml-0">
        {/* Bell button */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(v => !v)}
            className={cn(
              "relative p-2.5 md:p-3 rounded-full transition-all text-on-surface/60 hover:text-primary shadow-sm",
              unread > 0
                ? "bg-surface-container-lowest ring-2 ring-red-400 hover:ring-red-500"
                : "bg-surface-container-lowest/50 hover:bg-surface-container-lowest"
            )}
          >
            <Bell size={18} className="md:w-5 md:h-5" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 shadow-md">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>

          {/* Dropdown */}
          <AnimatePresence>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -8 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-3 w-80 bg-surface-container-lowest rounded-[1.5rem] shadow-2xl ring-1 ring-on-surface/5 overflow-hidden z-[100]"
              >
                {/* Header dropdown */}
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

                {/* Lista de notificações */}
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
                          "flex items-start gap-3 px-5 py-3.5 transition-colors",
                          !n.read && "bg-primary/[0.02]"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                          n.read ? "bg-on-surface/5 text-on-surface/30" : "bg-primary/10 text-primary"
                        )}>
                          <Package size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <p className={cn(
                              "text-[11px] font-black leading-tight truncate",
                              n.read ? "text-on-surface/50" : "text-on-surface"
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

        {/* User card */}
        <div className="hidden md:flex items-center gap-4 bg-surface-container-low px-4 py-2 rounded-2xl border border-on-surface/[0.03]">
          <div className="text-right">
            <p className="text-[10px] font-extrabold leading-none text-on-surface uppercase tracking-tight">Universo Curator</p>
            <p className="text-[10px] text-primary font-bold mt-1">Admin Mode</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <User size={20} />
          </div>
        </div>
        <div className="flex md:hidden">
          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <User size={16} />
          </div>
        </div>
      </div>
    </nav>
  );
}
